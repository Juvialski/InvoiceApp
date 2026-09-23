export const SESSION_EXPIRED_ERROR_CODE = "SESSION_EXPIRED" as const;
export const SESSION_EXPIRED_EVENT = "hqs:session-expired" as const;

export function publishSessionExpired(sessionUserId: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT, { detail: { sessionUserId } }));
}

export class SessionExpiredError extends Error {
  readonly code = SESSION_EXPIRED_ERROR_CODE;
  override readonly cause: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "SessionExpiredError";
    this.cause = cause;
  }
}

export class SessionRefreshTemporarilyUnavailableError extends Error {
  override readonly cause: unknown;

  constructor(cause?: unknown) {
    super("The session could not be refreshed because the connection is temporarily unavailable.");
    this.name = "SessionRefreshTemporarilyUnavailableError";
    this.cause = cause;
  }
}

export interface AuthenticatedRequestRecoveryOptions<TResponse extends { status: number }> {
  initialAccessToken: string;
  /** Same-user requests share refresh work; different users never share tokens. */
  sessionUserId?: string;
  request: (accessToken: string) => Promise<TResponse>;
  refreshAccessToken: () => Promise<string | null>;
  onSessionExpired?: () => void;
  sessionExpiredMessage: string;
}

const refreshInFlight = new Map<string, Promise<string | null>>();

export function refreshAccessTokenSingleFlight(
  sessionUserId: string,
  refreshAccessToken: () => Promise<string | null>,
): Promise<string | null> {
  const current = refreshInFlight.get(sessionUserId);
  if (current) return current;

  const request = Promise.resolve()
    .then(refreshAccessToken)
    .finally(() => {
      if (refreshInFlight.get(sessionUserId) === request) refreshInFlight.delete(sessionUserId);
    });
  refreshInFlight.set(sessionUserId, request);
  return request;
}

function errorChain(error: unknown): unknown[] {
  const result: unknown[] = [];
  const seen = new Set<unknown>();
  let current = error;
  while (current && !seen.has(current)) {
    result.push(current);
    seen.add(current);
    current = typeof current === "object" && "cause" in current
      ? (current as { cause?: unknown }).cause
      : undefined;
  }
  return result;
}

export function isSessionAuthenticationFailure(error: unknown): boolean {
  const chain = errorChain(error);
  if (chain.some((item) => {
    if (item instanceof TypeError) return true;
    if (!item || typeof item !== "object") return false;
    const record = item as { name?: unknown; status?: unknown; code?: unknown };
    return record.name === "AuthRetryableFetchError"
      || (typeof record.status === "number" && record.status >= 500)
      || (typeof record.code === "string" && /^(ECONN|ETIMEDOUT|ENET|EAI_)/i.test(record.code));
  })) return false;

  return chain.some((item) => {
    if (!item || typeof item !== "object") return false;
    const record = item as { name?: unknown; status?: unknown; code?: unknown; message?: unknown };
    const code = typeof record.code === "string" ? record.code.toLowerCase() : "";
    const message = typeof record.message === "string" ? record.message : "";
    return record.name === "AuthSessionMissingError"
      || record.name === "AuthInvalidJwtError"
      || record.status === 401
      || ["bad_jwt", "pgrst301", "session_expired", "refresh_token_not_found", "refresh_token_already_used"].includes(code)
      || /(?:jwt|access token|session).*(?:expired|invalid|no longer active)/i.test(message);
  });
}

export function isTerminalSessionRefreshFailure(error: unknown): boolean {
  return errorChain(error).some((item) => {
    if (!item || typeof item !== "object") return false;
    const record = item as { name?: unknown; status?: unknown; code?: unknown };
    const code = typeof record.code === "string" ? record.code.toLowerCase() : "";
    return record.name === "AuthSessionMissingError"
      || record.name === "AuthInvalidJwtError"
      || ["refresh_token_not_found", "refresh_token_already_used", "session_expired", "bad_jwt"].includes(code)
      || (typeof record.status === "number" && record.status >= 400 && record.status < 500 && record.status !== 429);
  });
}

/**
 * Run one authenticated first-party request and recover once from an auth 401.
 * Concurrent 401s share the same refresh. Permission/business failures are
 * returned untouched, and a second 401 becomes a stable terminal expiry.
 */
export async function requestWithAuthRecovery<TResponse extends { status: number }>(
  options: AuthenticatedRequestRecoveryOptions<TResponse>,
): Promise<TResponse> {
  const firstResponse = await options.request(options.initialAccessToken);
  if (firstResponse.status !== 401) return firstResponse;

  let refreshedAccessToken: string | null;
  try {
    refreshedAccessToken = await refreshAccessTokenSingleFlight(options.sessionUserId || "default", options.refreshAccessToken);
  } catch (error) {
    if (isTerminalSessionRefreshFailure(error)) {
      options.onSessionExpired?.();
      throw new SessionExpiredError(options.sessionExpiredMessage, error);
    }
    throw new SessionRefreshTemporarilyUnavailableError(error);
  }

  if (!refreshedAccessToken) {
    options.onSessionExpired?.();
    throw new SessionExpiredError(options.sessionExpiredMessage);
  }

  const retryResponse = await options.request(refreshedAccessToken);
  if (retryResponse.status === 401) {
    options.onSessionExpired?.();
    throw new SessionExpiredError(options.sessionExpiredMessage);
  }

  return retryResponse;
}
