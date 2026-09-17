export const SESSION_EXPIRED_ERROR_CODE = "SESSION_EXPIRED" as const;

export class SessionExpiredError extends Error {
  readonly code = SESSION_EXPIRED_ERROR_CODE;
  readonly cause: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "SessionExpiredError";
    this.cause = cause;
  }
}

export interface AuthenticatedRequestRecoveryOptions<TResponse extends { status: number }> {
  initialAccessToken: string;
  request: (accessToken: string) => Promise<TResponse>;
  refreshAccessToken: () => Promise<string | null>;
  sessionExpiredMessage: string;
}

let refreshInFlight: Promise<string | null> | null = null;

async function refreshAccessTokenSingleFlight(refreshAccessToken: () => Promise<string | null>): Promise<string | null> {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        return await refreshAccessToken();
      } finally {
        refreshInFlight = null;
      }
    })();
  }

  return refreshInFlight;
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
    refreshedAccessToken = await refreshAccessTokenSingleFlight(options.refreshAccessToken);
  } catch (error) {
    throw new SessionExpiredError(options.sessionExpiredMessage, error);
  }

  if (!refreshedAccessToken) {
    throw new SessionExpiredError(options.sessionExpiredMessage);
  }

  const retryResponse = await options.request(refreshedAccessToken);
  if (retryResponse.status === 401) {
    throw new SessionExpiredError(options.sessionExpiredMessage);
  }

  return retryResponse;
}
