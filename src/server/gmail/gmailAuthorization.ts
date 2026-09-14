export type GmailApiFailureClassification =
  | "ACCESS_TOKEN_EXPIRED"
  | "MISSING_SCOPE"
  | "PERMISSION"
  | "TRANSIENT"
  | "REQUEST_INVALID"
  | "CONFIGURATION";

export interface GmailApiErrorInput {
  readonly status?: unknown;
  readonly payload?: unknown;
  readonly message?: unknown;
}

export interface GmailApiFailure {
  readonly classification: GmailApiFailureClassification;
  readonly code: string;
  readonly status: number;
  readonly message: string;
  readonly reconnectRequired: boolean;
}

export class GmailAuthorizationError extends Error {
  readonly code: string;
  readonly status: number;
  readonly classification: GmailApiFailureClassification;
  readonly reconnectRequired: boolean;

  constructor(failure: GmailApiFailure) {
    super(failure.message);
    this.name = "GmailAuthorizationError";
    this.code = failure.code;
    this.status = failure.status;
    this.classification = failure.classification;
    this.reconnectRequired = failure.reconnectRequired;
  }
}

export type GmailTokenFetch = (input: string, init?: RequestInit) => Promise<Response>;

const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const MAX_TOKEN_RESPONSE_BYTES = 64 * 1024;
const DEFAULT_TOKEN_TIMEOUT_MS = 10_000;

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function text(value: unknown, max = 200) {
  return typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, max) : "";
}

function statusValue(value: unknown) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 100 && parsed <= 599 ? parsed : 0;
}

function errorReasons(payload: unknown): string[] {
  const root = record(payload);
  const error = record(root.error);
  const errors = Array.isArray(error.errors) ? error.errors : [];
  return [
    ...errors.map((item) => text(record(item).reason, 100).toLowerCase()),
    text(error.reason, 100).toLowerCase(),
    text(root.reason, 100).toLowerCase(),
  ].filter(Boolean);
}

function failure(
  classification: GmailApiFailureClassification,
  code: string,
  status: number,
  message: string,
  reconnectRequired = false,
): GmailApiFailure {
  return { classification, code, status, message, reconnectRequired };
}

export function classifyGmailApiError(input: GmailApiErrorInput): GmailApiFailure {
  const status = statusValue(input.status);
  const reasons = new Set(errorReasons(input.payload));
  if (status === 401) {
    return failure("ACCESS_TOKEN_EXPIRED", "GMAIL_ACCESS_TOKEN_EXPIRED", 401, "The Gmail access token expired; the server will refresh the connection safely.");
  }
  if (status === 403 && (reasons.has("insufficientpermissions") || reasons.has("insufficient_permissions"))) {
    return failure("MISSING_SCOPE", "GMAIL_SCOPE_REQUIRED", 403, "Gmail needs the requested read and send permissions. Reconnect Google + Gmail and approve the Gmail scopes.", true);
  }
  if (status === 403 && [
    "ratelimitexceeded",
    "userratelimitexceeded",
    "dailylimitexceeded",
    "quotaexceeded",
    "backenderror",
    "serviceunavailable",
    "internalerror",
  ].some((reason) => reasons.has(reason))) {
    return failure("TRANSIENT", "GMAIL_PROVIDER_RATE_LIMITED", 503, "Gmail is temporarily rate limited or unavailable. Try again later; the connection was kept.");
  }
  if (status === 403) {
    return failure("PERMISSION", "GMAIL_PROVIDER_PERMISSION", 403, "Gmail denied this operation under the connected account or Google policy. The connection was kept; no reconnect is required.");
  }
  if (status === 429 || status >= 500) {
    return failure("TRANSIENT", "GMAIL_PROVIDER_UNAVAILABLE", 503, "Gmail is temporarily unavailable. Try again later; the connection was kept.");
  }
  if (status === 400 || status === 422) {
    return failure("REQUEST_INVALID", "GMAIL_PROVIDER_REQUEST_INVALID", 400, "Gmail rejected the request shape. Review the selected operation and try again.");
  }
  return failure("CONFIGURATION", "GMAIL_PROVIDER_UNAVAILABLE", 503, "Gmail could not complete the request safely. The connection was kept.");
}

function configuredGoogleClient(environment: Record<string, string | undefined>) {
  const clientId = text(environment.GMAIL_GOOGLE_CLIENT_ID || environment.SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID, 500);
  const clientSecret = text(environment.GMAIL_GOOGLE_CLIENT_SECRET || environment.SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_SECRET, 500);
  if (!clientId || !clientSecret) {
    throw new GmailAuthorizationError(failure(
      "CONFIGURATION",
      "GMAIL_PROVIDER_SETUP_REQUIRED",
      503,
      "Gmail server authorization is not configured for this deployment.",
    ));
  }
  return { clientId, clientSecret };
}

function validCredential(value: unknown, max = 4096) {
  if (typeof value !== "string") return "";
  const normalized = value.trim();
  if (!normalized || normalized.length > max || /[\u0000-\u001f\u007f]/.test(normalized)) return "";
  return normalized;
}

export interface GoogleAccessTokenResult {
  readonly accessToken: string;
  readonly expiresAt: number;
  readonly refreshToken?: string;
}

export async function refreshGoogleAccessToken(
  refreshToken: string,
  environment: Record<string, string | undefined> = process.env,
  fetchImpl: GmailTokenFetch = globalThis.fetch.bind(globalThis),
  now = Date.now,
): Promise<GoogleAccessTokenResult> {
  const normalizedRefreshToken = validCredential(refreshToken);
  if (!normalizedRefreshToken) {
    throw new GmailAuthorizationError(failure("CONFIGURATION", "GMAIL_REFRESH_TOKEN_INVALID", 503, "The stored Gmail authorization could not be used safely."));
  }
  const { clientId, clientSecret } = configuredGoogleClient(environment);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Number(environment.GMAIL_TOKEN_TIMEOUT_MS) || DEFAULT_TOKEN_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetchImpl(GOOGLE_TOKEN_ENDPOINT, {
      method: "POST",
      signal: controller.signal,
      headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: normalizedRefreshToken,
        client_id: clientId,
        client_secret: clientSecret,
      }).toString(),
    });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new GmailAuthorizationError(failure("TRANSIENT", "GMAIL_PROVIDER_UNAVAILABLE", 503, "Gmail authorization timed out; the connection was kept."));
    }
    throw new GmailAuthorizationError(failure("TRANSIENT", "GMAIL_PROVIDER_UNAVAILABLE", 503, "Gmail authorization is temporarily unavailable; the connection was kept."));
  } finally {
    clearTimeout(timer);
  }

  const length = Number(response.headers.get("content-length") || 0);
  if (Number.isFinite(length) && length > MAX_TOKEN_RESPONSE_BYTES) {
    throw new GmailAuthorizationError(failure("TRANSIENT", "GMAIL_PROVIDER_UNAVAILABLE", 503, "Gmail authorization returned an unsafe response; the connection was kept."));
  }
  let raw = "";
  try { raw = await response.text(); } catch {
    throw new GmailAuthorizationError(failure("TRANSIENT", "GMAIL_PROVIDER_UNAVAILABLE", 503, "Gmail authorization returned an unreadable response; the connection was kept."));
  }
  if (raw.length > MAX_TOKEN_RESPONSE_BYTES) {
    throw new GmailAuthorizationError(failure("TRANSIENT", "GMAIL_PROVIDER_UNAVAILABLE", 503, "Gmail authorization returned an unsafe response; the connection was kept."));
  }
  let payload: Record<string, unknown>;
  try { payload = record(JSON.parse(raw || "{}")); } catch {
    throw new GmailAuthorizationError(failure("TRANSIENT", "GMAIL_PROVIDER_UNAVAILABLE", 503, "Gmail authorization returned an invalid response; the connection was kept."));
  }
  if (!response.ok) {
    const providerError = text(payload.error, 100).toLowerCase();
    if (providerError === "invalid_grant") {
      throw new GmailAuthorizationError(failure("CONFIGURATION", "GMAIL_REAUTH_REQUIRED", 401, "Gmail authorization must be reconnected because Google rejected the stored authorization.", true));
    }
    if (providerError === "invalid_client" || providerError === "unauthorized_client") {
      throw new GmailAuthorizationError(failure("CONFIGURATION", "GMAIL_PROVIDER_SETUP_REQUIRED", 503, "Gmail server authorization is not configured correctly for this deployment."));
    }
    if (providerError === "temporarily_unavailable" || response.status >= 500 || response.status === 429) {
      throw new GmailAuthorizationError(failure("TRANSIENT", "GMAIL_PROVIDER_UNAVAILABLE", 503, "Google authorization is temporarily unavailable; the connection was kept."));
    }
    throw new GmailAuthorizationError(failure("CONFIGURATION", "GMAIL_PROVIDER_REFRESH_FAILED", 503, "Google authorization could not be refreshed safely; the connection was kept."));
  }

  const accessToken = validCredential(payload.access_token, 4096);
  const expiresIn = Number(payload.expires_in);
  if (!accessToken || !Number.isFinite(expiresIn) || expiresIn <= 0) {
    throw new GmailAuthorizationError(failure("TRANSIENT", "GMAIL_PROVIDER_UNAVAILABLE", 503, "Google authorization returned an incomplete response; the connection was kept."));
  }
  const rotatedRefreshToken = validCredential(payload.refresh_token, 4096);
  return {
    accessToken,
    expiresAt: now() + Math.floor(expiresIn * 1000),
    ...(rotatedRefreshToken ? { refreshToken: rotatedRefreshToken } : {}),
  };
}
