export const BREVO_PROVIDER_ID = "BREVO" as const;
export const BREVO_PROVIDER_LABEL = "Brevo" as const;
export const BREVO_DEFAULT_API_BASE_URL = "https://api.brevo.com/v3";
export const BREVO_DEFAULT_TIMEOUT_MS = 15_000;

export type BrevoEmailProviderStatus = "NOT_CONFIGURED" | "SENDER_SETUP_REQUIRED" | "READY" | "CONNECTION_PROBLEM";

export interface BrevoEmailStatus {
  readonly status: BrevoEmailProviderStatus;
  readonly providerId?: typeof BREVO_PROVIDER_ID;
  readonly providerLabel?: typeof BREVO_PROVIDER_LABEL;
  readonly senderEmail?: string;
  readonly senderName?: string;
  readonly message: string;
}

export interface BrevoRecipient {
  readonly email: string;
  readonly name?: string;
}

export interface BrevoEmailAttachment {
  readonly name: string;
  readonly contentBase64: string;
}

export interface BrevoSendRequest {
  readonly to: readonly BrevoRecipient[];
  readonly cc: readonly BrevoRecipient[];
  readonly subject: string;
  readonly textContent: string;
  readonly replyTo?: BrevoRecipient;
  readonly attachment?: BrevoEmailAttachment;
  readonly idempotencyKey: string;
}

export interface BrevoSendResult {
  readonly providerId: typeof BREVO_PROVIDER_ID;
  readonly status: "ACCEPTED" | "FAILED" | "UNKNOWN";
  readonly providerMessageId?: string;
  readonly providerStatus?: string;
  readonly safeMessage: string;
  readonly reconciliationRequired: boolean;
}

export interface BrevoEmailProvider {
  readonly id: typeof BREVO_PROVIDER_ID;
  readonly displayName: typeof BREVO_PROVIDER_LABEL;
  readonly checkStatus: () => Promise<BrevoEmailStatus>;
  readonly send: (request: BrevoSendRequest) => Promise<BrevoSendResult>;
}

type BrevoEnvironment = Record<string, string | undefined>;
type BrevoFetch = (input: string | URL, init?: RequestInit) => Promise<Response>;

interface BrevoConfig {
  readonly apiKey: string;
  readonly senderEmail: string;
  readonly senderName: string;
  readonly replyTo?: BrevoRecipient;
  readonly baseUrl: string;
  readonly timeoutMs: number;
}

class BrevoProviderError extends Error {
  readonly status?: number;
  readonly ambiguous: boolean;

  constructor(message: string, options: { status?: number; ambiguous?: boolean } = {}) {
    super(message);
    this.name = "BrevoProviderError";
    this.status = options.status;
    this.ambiguous = options.ambiguous === true;
  }
}

function text(value: unknown, max: number) {
  return typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, max) : "";
}

function bodyText(value: unknown, max: number) {
  return typeof value === "string" ? value.replace(/[\u0000]/g, "").trim().slice(0, max) : "";
}

function validEmail(value: string) {
  return /^[^@\s,;]+@[^@\s,;]+\.[^@\s,;]+$/.test(value) && value.length <= 320;
}

function recipient(value: unknown, label: string): BrevoRecipient {
  const row = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : { email: value };
  const email = text(row.email, 320).toLowerCase();
  if (!validEmail(email)) throw new BrevoProviderError(`${label} contains an invalid email address.`);
  const name = text(row.name, 120);
  return { email, ...(name ? { name } : {}) };
}

function optionalReplyTo(value: unknown): BrevoRecipient | undefined {
  if (value === undefined || value === null) return undefined;
  return recipient(value, "Reply-To");
}

function configuration(environment: BrevoEnvironment): BrevoConfig | null {
  const apiKey = text(environment.BREVO_API_KEY, 500);
  const senderEmail = text(environment.BREVO_SENDER_EMAIL, 320).toLowerCase();
  const senderName = text(environment.BREVO_SENDER_NAME, 120);
  const replyToEmail = text(environment.BREVO_REPLY_TO, 320).toLowerCase();
  if (!apiKey || !senderEmail || !senderName || !validEmail(senderEmail) || (replyToEmail && !validEmail(replyToEmail))) return null;

  const rawBaseUrl = text(environment.BREVO_API_BASE_URL, 500) || BREVO_DEFAULT_API_BASE_URL;
  let parsedBaseUrl: URL;
  try { parsedBaseUrl = new URL(rawBaseUrl); }
  catch { return null; }
  if (!/^https?:$/.test(parsedBaseUrl.protocol) || parsedBaseUrl.username || parsedBaseUrl.password || parsedBaseUrl.search || parsedBaseUrl.hash) return null;
  const baseUrl = parsedBaseUrl.toString().replace(/\/$/, "");
  const configuredTimeout = Number(environment.BREVO_REQUEST_TIMEOUT_MS);
  const timeoutMs = Number.isFinite(configuredTimeout) && configuredTimeout >= 1_000 && configuredTimeout <= 60_000
    ? Math.trunc(configuredTimeout)
    : BREVO_DEFAULT_TIMEOUT_MS;
  return {
    apiKey,
    senderEmail,
    senderName,
    ...(replyToEmail ? { replyTo: { email: replyToEmail } } : {}),
    baseUrl,
    timeoutMs,
  };
}

function requestFetch(fetchImpl?: BrevoFetch): BrevoFetch | null {
  if (fetchImpl) return fetchImpl;
  return typeof globalThis.fetch === "function" ? globalThis.fetch.bind(globalThis) : null;
}

async function requestJson(fetchImpl: BrevoFetch, config: BrevoConfig, pathName: string, init: RequestInit = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    const headers = new Headers(init.headers || {});
    headers.set("Accept", "application/json");
    headers.set("api-key", config.apiKey);
    const response = await fetchImpl(`${config.baseUrl}${pathName}`, { ...init, headers, signal: controller.signal });
    const bodyText = await response.text();
    let body: unknown = {};
    try { body = bodyText ? JSON.parse(bodyText) : {}; } catch { body = {}; }
    return { response, body };
  } catch (error) {
    if (error instanceof BrevoProviderError) throw error;
    throw new BrevoProviderError("Brevo could not be reached safely.", { ambiguous: true });
  } finally {
    clearTimeout(timer);
  }
}

function providerStatusBase(status: BrevoEmailProviderStatus, config: BrevoConfig): BrevoEmailStatus {
  return {
    status,
    providerId: BREVO_PROVIDER_ID,
    providerLabel: BREVO_PROVIDER_LABEL,
    senderEmail: config.senderEmail,
    senderName: config.senderName,
    message: status === "NOT_CONFIGURED"
      ? "Configure the server-side Brevo API key and sender settings before sending."
      : status === "SENDER_SETUP_REQUIRED"
        ? "Verify the company email/domain in Brevo before sending."
        : status === "READY"
          ? "Brevo is ready with the configured sender."
          : "Brevo connection status could not be checked safely.",
  };
}

export async function checkBrevoEmailProvider(
  environment: BrevoEnvironment = process.env,
  fetchImpl?: BrevoFetch,
): Promise<BrevoEmailStatus> {
  const config = configuration(environment);
  if (!config) return { status: "NOT_CONFIGURED", message: "Configure the server-side Brevo API key and sender settings before sending." };
  const request = requestFetch(fetchImpl);
  if (!request) return providerStatusBase("CONNECTION_PROBLEM", config);
  try {
    const account = await requestJson(request, config, "/account");
    if (!account.response.ok) return providerStatusBase("CONNECTION_PROBLEM", config);
    const senders = await requestJson(request, config, "/senders");
    if (!senders.response.ok) return providerStatusBase("CONNECTION_PROBLEM", config);
    const rows = senders.body && typeof senders.body === "object" && !Array.isArray(senders.body)
      ? (senders.body as Record<string, unknown>).senders
      : undefined;
    const matchingSender = Array.isArray(rows)
      ? rows.find((item) => {
        if (!item || typeof item !== "object" || Array.isArray(item)) return false;
        const row = item as Record<string, unknown>;
        return text(row.email, 320).toLowerCase() === config.senderEmail && row.active === true;
      })
      : undefined;
    return providerStatusBase(matchingSender ? "READY" : "SENDER_SETUP_REQUIRED", config);
  } catch {
    return providerStatusBase("CONNECTION_PROBLEM", config);
  }
}

function sendResult(status: BrevoSendResult["status"], options: { providerMessageId?: string; providerStatus?: string; safeMessage: string; reconciliationRequired?: boolean }): BrevoSendResult {
  return {
    providerId: BREVO_PROVIDER_ID,
    status,
    ...(options.providerMessageId ? { providerMessageId: options.providerMessageId } : {}),
    ...(options.providerStatus ? { providerStatus: options.providerStatus } : {}),
    safeMessage: options.safeMessage,
    reconciliationRequired: options.reconciliationRequired === true || status === "UNKNOWN",
  };
}

export function createBrevoEmailProvider(
  environment: BrevoEnvironment = process.env,
  fetchImpl?: BrevoFetch,
): BrevoEmailProvider | null {
  const config = configuration(environment);
  const request = requestFetch(fetchImpl);
  if (!config || !request) return null;

  return {
    id: BREVO_PROVIDER_ID,
    displayName: BREVO_PROVIDER_LABEL,
    async checkStatus() {
      return checkBrevoEmailProvider(environment, request);
    },
    async send(input) {
      try {
        if (!Array.isArray(input.to) || input.to.length < 1 || input.to.length > 50) throw new BrevoProviderError("At least one email recipient is required.");
        const to = input.to.map((item) => recipient(item, "To"));
        const cc = Array.isArray(input.cc) ? input.cc.map((item) => recipient(item, "CC")) : [];
        const subject = text(input.subject, 500);
        const textContent = bodyText(input.textContent, 20_000);
        if (!subject) throw new BrevoProviderError("An email subject is required.");
        if (!textContent) throw new BrevoProviderError("An email message is required.");
        const idempotencyKey = text(input.idempotencyKey, 200);
        if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(idempotencyKey)) throw new BrevoProviderError("A valid email send identity is required.");
        const replyTo = optionalReplyTo(input.replyTo) || config.replyTo;
        const attachment = input.attachment && text(input.attachment.name, 180) && typeof input.attachment.contentBase64 === "string"
          ? { name: text(input.attachment.name, 180), content: input.attachment.contentBase64 }
          : undefined;
        const payload = {
          sender: { email: config.senderEmail, name: config.senderName },
          to,
          ...(cc.length ? { cc } : {}),
          ...(replyTo ? { replyTo } : {}),
          subject,
          textContent,
          ...(attachment ? { attachment: [attachment] } : {}),
        };
        const { response, body } = await requestJson(request, config, "/smtp/email", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
          body: JSON.stringify(payload),
        });
        const row = body && typeof body === "object" && !Array.isArray(body) ? body as Record<string, unknown> : {};
        const messageId = text(row.messageId, 200);
        if (response.status >= 400 && response.status < 500) return sendResult("FAILED", { providerStatus: `http-${response.status}`, safeMessage: "Brevo rejected the email request." });
        if (!response.ok || !messageId) return sendResult("UNKNOWN", { providerStatus: response.ok ? "missing-message-id" : `http-${response.status}`, safeMessage: "Brevo acceptance could not be confirmed. Reconciliation is required before retrying." });
        return sendResult("ACCEPTED", { providerMessageId: messageId, providerStatus: "accepted", safeMessage: "Brevo accepted the message for processing; delivery is not confirmed." });
      } catch (error) {
        if (error instanceof BrevoProviderError && !error.ambiguous) return sendResult("FAILED", { safeMessage: error.message });
        return sendResult("UNKNOWN", { safeMessage: "Brevo acceptance could not be confirmed. Reconciliation is required before retrying." });
      }
    },
  };
}
