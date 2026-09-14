import {
  classifyGmailApiError,
  GmailAuthorizationError,
  refreshGoogleAccessToken,
  type GmailApiErrorInput,
  type GmailTokenFetch,
} from "./gmailAuthorization.ts";
import { GmailCredentialError } from "./gmailCredentialEncryption.ts";
import { createServerGmailCredentialRepository, type GmailCredentialRepository } from "./gmailProviderCredentials.ts";

export interface GmailAccessContext {
  readonly companyId: string;
  readonly userId: string;
  readonly legacyAccessToken?: string;
}

export interface GmailRequestError extends Error {
  readonly status?: number;
  readonly payload?: unknown;
}

export type GmailAuthorizedRequest = (accessToken: string, pathName: string, init?: RequestInit, maxResponseBytes?: number) => Promise<unknown>;

interface CachedAccessToken {
  readonly accessToken: string;
  readonly expiresAt: number;
}

const accessTokenCache = new Map<string, CachedAccessToken>();
const TOKEN_SAFETY_WINDOW_MS = 60_000;

function cacheKey(context: GmailAccessContext) {
  return `${context.companyId}:${context.userId}`;
}

function safeLegacyToken(value?: string) {
  const token = String(value || "").trim();
  return token && !/^Bearer\s/i.test(token) && !/\s/.test(token) ? token : "";
}

function durableSetupError() {
  return new GmailAuthorizationError({
    classification: "CONFIGURATION",
    code: "GMAIL_DURABLE_CONNECTION_REQUIRED",
    status: 401,
    message: "Reconnect Google + Gmail once to finish secure server-side authorization.",
    reconnectRequired: true,
  });
}

function repositoryFor(environment: Record<string, string | undefined>) {
  return createServerGmailCredentialRepository(environment);
}

export function invalidateGmailAccessToken(context: GmailAccessContext) {
  accessTokenCache.delete(cacheKey(context));
}

export async function resolveGmailAccessToken(
  context: GmailAccessContext,
  options: {
    environment?: Record<string, string | undefined>;
    forceRefresh?: boolean;
    now?: () => number;
    tokenFetch?: GmailTokenFetch;
    repository?: GmailCredentialRepository;
  } = {},
) {
  const environment = options.environment || process.env;
  const now = options.now || Date.now;
  const key = cacheKey(context);
  if (!options.forceRefresh) {
    const cached = accessTokenCache.get(key);
    if (cached && cached.expiresAt - now() > TOKEN_SAFETY_WINDOW_MS) return cached.accessToken;
  }

  const legacyAccessToken = safeLegacyToken(context.legacyAccessToken);
  try {
    const repository = options.repository || repositoryFor(environment);
    const credential = await repository.load(context.companyId, context.userId);
    if (!credential) {
      if (legacyAccessToken && !options.forceRefresh) return legacyAccessToken;
      throw durableSetupError();
    }
    if (credential.status === "INVALID" || credential.status === "REVOKED") {
      throw new GmailAuthorizationError({
        classification: "CONFIGURATION",
        code: "GMAIL_REAUTH_REQUIRED",
        status: 401,
        message: "Gmail authorization must be reconnected because Google rejected the stored authorization.",
        reconnectRequired: true,
      });
    }
    const refreshToken = repository.decrypt(credential);
    let refreshed;
    try {
      refreshed = await refreshGoogleAccessToken(refreshToken, environment, options.tokenFetch, now);
    } catch (error) {
      if (error instanceof GmailAuthorizationError && error.code === "GMAIL_REAUTH_REQUIRED") {
        try { await repository.markStatus(context.companyId, context.userId, "INVALID", error.code); } catch { /* preserve safe reconnect state */ }
      }
      throw error;
    }
    if (refreshed.refreshToken) {
      await repository.store({
        companyId: context.companyId,
        userId: context.userId,
        email: credential.email,
        scopes: credential.scopes,
        refreshToken: refreshed.refreshToken,
      });
    } else {
      // Refresh metadata is observability only. A transient timestamp write
      // must not discard a valid provider access token or make Gmail unusable.
      try { await repository.touch(context.companyId, context.userId); } catch { /* preserve the usable token */ }
    }
    accessTokenCache.set(key, { accessToken: refreshed.accessToken, expiresAt: refreshed.expiresAt });
    return refreshed.accessToken;
  } catch (error) {
    // A legacy callback access token can keep an already-authorized request
    // working during rollout, but it is never persisted or used after expiry
    // when the durable credential exists.
    if (legacyAccessToken && !options.forceRefresh && !(error instanceof GmailAuthorizationError && error.reconnectRequired)) return legacyAccessToken;
    if (error instanceof GmailAuthorizationError) throw error;
    if (error instanceof GmailCredentialError) {
      throw new GmailAuthorizationError({
        classification: "CONFIGURATION",
        code: "GMAIL_PROVIDER_SETUP_REQUIRED",
        status: 503,
        message: "Gmail server authorization storage is not configured for this deployment.",
        reconnectRequired: false,
      });
    }
    throw new GmailAuthorizationError({
      classification: "CONFIGURATION",
      code: "GMAIL_PROVIDER_SETUP_REQUIRED",
      status: 503,
      message: "Gmail server authorization could not be loaded safely.",
      reconnectRequired: false,
    });
  }
}

export async function authorizedGmailRequest(
  context: GmailAccessContext,
  request: GmailAuthorizedRequest,
  pathName: string,
  init?: RequestInit,
  maxResponseBytes?: number,
  options: {
    environment?: Record<string, string | undefined>;
    tokenFetch?: GmailTokenFetch;
    now?: () => number;
    repository?: GmailCredentialRepository;
  } = {},
) {
  let accessToken = await resolveGmailAccessToken(context, options);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await request(accessToken, pathName, init, maxResponseBytes);
    } catch (error) {
      const input: GmailApiErrorInput = {
        status: (error as GmailRequestError)?.status,
        payload: (error as GmailRequestError)?.payload,
        message: (error as Error)?.message,
      };
      const classified = classifyGmailApiError(input);
      if (classified.classification === "ACCESS_TOKEN_EXPIRED" && attempt === 0) {
        invalidateGmailAccessToken(context);
        accessToken = await resolveGmailAccessToken(context, { ...options, forceRefresh: true });
        continue;
      }
      if (classified.classification === "ACCESS_TOKEN_EXPIRED") {
        try {
          const repository = options.repository || repositoryFor(options.environment || process.env);
          await repository.markStatus(context.companyId, context.userId, "INVALID", "GMAIL_REAUTH_REQUIRED");
        } catch {
          // The safe reconnect result remains the only browser-visible state.
        }
        throw new GmailAuthorizationError({
          classification: "CONFIGURATION",
          code: "GMAIL_REAUTH_REQUIRED",
          status: 401,
          message: "Gmail authorization must be reconnected because Google rejected the refreshed access token.",
          reconnectRequired: true,
        });
      }
      throw new GmailAuthorizationError(classified);
    }
  }
  throw new GmailAuthorizationError({
    classification: "TRANSIENT",
    code: "GMAIL_PROVIDER_UNAVAILABLE",
    status: 503,
    message: "Gmail is temporarily unavailable. Try again later; the connection was kept.",
    reconnectRequired: false,
  });
}

export async function loadGmailCredentialMetadata(
  companyId: string,
  userId: string,
  environment: Record<string, string | undefined> = process.env,
) {
  try {
    const repository = repositoryFor(environment);
    return await repository.load(companyId, userId);
  } catch (error) {
    if (error instanceof GmailCredentialError) return { status: "UNAVAILABLE" as const };
    return { status: "UNAVAILABLE" as const };
  }
}
