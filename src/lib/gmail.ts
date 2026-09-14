import type { Session } from "@supabase/supabase-js";
import { companyApiRequest } from "./companyApi.ts";
import { requireActiveCompanyId } from "./companyContext.ts";
import { clearCapturedGoogleProviderRefreshToken, getCapturedGoogleProviderRefreshToken } from "./supabase.ts";

export const GMAIL_REQUIRED_SCOPES = Object.freeze([
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
] as const);

export type GmailConnectionServerStatus = "HEALTHY" | "NEVER_CONNECTED" | "RECONNECT_REQUIRED" | "UNAVAILABLE";
export type GmailCredentialClientStatus = "ACTIVE" | "MISSING" | "INVALID" | "REVOKED" | "UNAVAILABLE";

export interface GmailConnectionStatusData {
  readonly status: GmailConnectionServerStatus;
  readonly credentialStatus?: GmailCredentialClientStatus;
  readonly email?: string;
  readonly displayName?: string;
  readonly lastSyncedAt?: string;
  readonly lastHistoryId?: string;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function safeText(value: unknown, max = 320) {
  return typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, max) : "";
}

function providerIdentity(session: Session | null) {
  const identities = Array.isArray((session?.user as any)?.identities) ? (session?.user as any).identities : [];
  return identities.find((identity: any) => String(identity?.provider || "").toLowerCase() === "google") as Record<string, any> | undefined;
}

/** Provider refresh tokens are read only from the OAuth callback session. */
export function getGoogleProviderRefreshToken(session: Session | null) {
  const token = safeText(getCapturedGoogleProviderRefreshToken() || (session as any)?.provider_refresh_token, 4096);
  return token || undefined;
}

export function getGoogleProviderEmail(session: Session | null) {
  const identityEmail = safeText(providerIdentity(session)?.identity_data?.email, 320);
  return identityEmail || safeText(session?.user?.email, 320) || undefined;
}

export async function persistGoogleProviderCredential(session: Session | null, companyId = requireActiveCompanyId()) {
  const refreshToken = getGoogleProviderRefreshToken(session);
  if (!refreshToken) return { persisted: false as const, reason: "REFRESH_TOKEN_NOT_RETURNED" as const };
  const email = getGoogleProviderEmail(session);
  if (!email) throw new Error("The connected Google account did not provide an email address for secure Gmail setup.");
  const response = await companyApiRequest("/api/gmail/provider-credential", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    companyId,
    body: JSON.stringify({
      providerRefreshToken: refreshToken,
      email,
      scopes: GMAIL_REQUIRED_SCOPES,
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success !== true) {
    throw new Error(typeof payload.error === "string" ? payload.error : "Gmail authorization could not be saved securely.");
  }
  clearCapturedGoogleProviderRefreshToken();
  return { persisted: true as const };
}

export async function loadGmailConnectionStatus(companyId = requireActiveCompanyId()): Promise<GmailConnectionStatusData> {
  const response = await companyApiRequest("/api/gmail/status", { companyId });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success !== true) throw new Error(typeof payload.error === "string" ? payload.error : "Gmail connection status is unavailable.");
  const data = record(payload.data);
  const status = data.status === "HEALTHY" || data.status === "RECONNECT_REQUIRED" || data.status === "UNAVAILABLE" ? data.status : "NEVER_CONNECTED";
  const credentialStatus = data.credentialStatus === "ACTIVE" || data.credentialStatus === "MISSING" || data.credentialStatus === "INVALID" || data.credentialStatus === "REVOKED" || data.credentialStatus === "UNAVAILABLE" ? data.credentialStatus : undefined;
  return {
    status,
    ...(credentialStatus ? { credentialStatus } : {}),
    ...(safeText(data.email) ? { email: safeText(data.email) } : {}),
    ...(safeText(data.displayName) ? { displayName: safeText(data.displayName) } : {}),
    ...(safeText(data.lastSyncedAt, 80) ? { lastSyncedAt: safeText(data.lastSyncedAt, 80) } : {}),
    ...(safeText(data.lastHistoryId, 100) ? { lastHistoryId: safeText(data.lastHistoryId, 100) } : {}),
  };
}

export async function revokeGoogleProviderCredential(companyId = requireActiveCompanyId()) {
  const response = await companyApiRequest("/api/gmail/provider-credential/revoke", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    companyId,
    body: JSON.stringify({}),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success !== true) throw new Error(typeof payload.error === "string" ? payload.error : "Gmail authorization could not be disconnected safely.");
}
