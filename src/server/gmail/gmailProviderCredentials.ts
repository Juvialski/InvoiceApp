import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  decryptGoogleRefreshToken,
  encryptGoogleRefreshToken,
  type EncryptedGoogleRefreshToken,
} from "./gmailCredentialEncryption.ts";
import { GmailCredentialError, readGmailCredentialsMasterKey } from "./gmailCredentialEncryption.ts";

export type GmailProviderCredentialStatus = "ACTIVE" | "INVALID" | "REVOKED";

export interface GmailProviderCredentialMetadata {
  readonly companyId: string;
  readonly userId: string;
  readonly provider: "google";
  readonly email: string;
  readonly scopes: readonly string[];
  readonly status: GmailProviderCredentialStatus;
  readonly credentialVersion: number;
  readonly encryptionVersion: number;
  readonly lastRefreshedAt?: string;
  readonly lastUsedAt?: string;
  readonly invalidatedAt?: string;
}

export interface GmailProviderCredential extends GmailProviderCredentialMetadata {
  readonly envelope: EncryptedGoogleRefreshToken;
}

export interface GmailCredentialStoreInput {
  readonly companyId: string;
  readonly userId: string;
  readonly email: string;
  readonly scopes: readonly string[];
  readonly refreshToken: string;
}

export interface GmailCredentialRpcClient {
  rpc: (name: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error?: unknown | null }>;
}

export interface GmailCredentialRepository {
  store: (input: GmailCredentialStoreInput) => Promise<GmailProviderCredentialMetadata>;
  load: (companyId: string, userId: string) => Promise<GmailProviderCredential | null>;
  markStatus: (companyId: string, userId: string, nextStatus: Exclude<GmailProviderCredentialStatus, "ACTIVE">, reasonCode: string) => Promise<GmailProviderCredentialMetadata | null>;
  touch: (companyId: string, userId: string) => Promise<void>;
  revoke: (companyId: string, userId: string) => Promise<GmailProviderCredentialMetadata | null>;
  decrypt: (credential: GmailProviderCredential) => string;
}

const ALLOWED_SCOPES = new Set([
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
]);

function row(value: unknown): Record<string, unknown> {
  if (Array.isArray(value)) return row(value[0]);
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function safeText(value: unknown, max = 200) {
  return typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, max) : "";
}

function scopeList(value: unknown) {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map((item) => safeText(item, 300)).filter((item) => ALLOWED_SCOPES.has(item)))).slice(0, 10);
}

function status(value: unknown): GmailProviderCredentialStatus {
  return value === "INVALID" || value === "REVOKED" ? value : "ACTIVE";
}

function positiveVersion(value: unknown, fallback = 1) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 ? parsed : fallback;
}

function metadataFromRow(value: unknown): GmailProviderCredentialMetadata {
  const source = row(value);
  const companyId = safeText(source.company_id ?? source.companyId, 200);
  const userId = safeText(source.user_id ?? source.userId, 200);
  const email = safeText(source.email, 320);
  if (!companyId || !userId || !email) throw new GmailCredentialError("GMAIL_CREDENTIAL_STORAGE_UNAVAILABLE", "The stored Gmail authorization record is incomplete.");
  return {
    companyId,
    userId,
    provider: "google",
    email,
    scopes: scopeList(source.scopes),
    status: status(source.status),
    credentialVersion: positiveVersion(source.credential_version ?? source.credentialVersion),
    encryptionVersion: positiveVersion(source.encryption_version ?? source.encryptionVersion),
    ...(safeText(source.last_refreshed_at ?? source.lastRefreshedAt, 80) ? { lastRefreshedAt: safeText(source.last_refreshed_at ?? source.lastRefreshedAt, 80) } : {}),
    ...(safeText(source.last_used_at ?? source.lastUsedAt, 80) ? { lastUsedAt: safeText(source.last_used_at ?? source.lastUsedAt, 80) } : {}),
    ...(safeText(source.invalidated_at ?? source.invalidatedAt, 80) ? { invalidatedAt: safeText(source.invalidated_at ?? source.invalidatedAt, 80) } : {}),
  };
}

function credentialFromRow(value: unknown): GmailProviderCredential | null {
  const source = row(value);
  if (!Object.keys(source).length) return null;
  const metadata = metadataFromRow(source);
  const ciphertext = safeText(source.ciphertext, 16_384);
  const iv = safeText(source.iv, 256);
  const authTag = safeText(source.auth_tag ?? source.authTag, 256);
  if (!ciphertext || !iv || !authTag) throw new GmailCredentialError("GMAIL_CREDENTIAL_STORAGE_UNAVAILABLE", "The stored Gmail authorization record is incomplete.");
  return {
    ...metadata,
    envelope: {
      ciphertext,
      iv,
      authTag,
      encryptionVersion: metadata.encryptionVersion,
    },
  };
}

function storageFailure() {
  return new GmailCredentialError("GMAIL_CREDENTIAL_STORAGE_UNAVAILABLE", "Durable Gmail authorization storage is temporarily unavailable.");
}

function assertRpcResult(result: { data: unknown; error?: unknown | null }) {
  if (result.error) throw storageFailure();
  return result.data;
}

export function createGmailCredentialRepository(
  client: GmailCredentialRpcClient,
  environment: Record<string, string | undefined> = process.env,
) {
  const masterKey = readGmailCredentialsMasterKey(environment);

  const repository: GmailCredentialRepository = {
    async store(input: GmailCredentialStoreInput): Promise<GmailProviderCredentialMetadata> {
      const envelope = encryptGoogleRefreshToken(input.refreshToken, input.companyId, input.userId, masterKey);
      const result = await client.rpc("server_store_gmail_provider_credential", {
        p_company_id: input.companyId,
        p_user_id: input.userId,
        p_email: safeText(input.email, 320),
        p_scopes: scopeList(input.scopes),
        p_ciphertext: envelope.ciphertext,
        p_iv: envelope.iv,
        p_auth_tag: envelope.authTag,
        p_encryption_version: envelope.encryptionVersion,
      });
      return metadataFromRow(assertRpcResult(result));
    },

    async load(companyId: string, userId: string): Promise<GmailProviderCredential | null> {
      const result = await client.rpc("server_get_gmail_provider_credential", { p_company_id: companyId, p_user_id: userId });
      return credentialFromRow(assertRpcResult(result));
    },

    async markStatus(companyId: string, userId: string, nextStatus: Exclude<GmailProviderCredentialStatus, "ACTIVE">, reasonCode: string): Promise<GmailProviderCredentialMetadata> {
      const result = await client.rpc("server_mark_gmail_provider_credential_status", {
        p_company_id: companyId,
        p_user_id: userId,
        p_status: nextStatus,
        p_reason_code: safeText(reasonCode, 80),
      });
      return metadataFromRow(assertRpcResult(result));
    },

    async touch(companyId: string, userId: string): Promise<void> {
      const result = await client.rpc("server_touch_gmail_provider_credential", { p_company_id: companyId, p_user_id: userId });
      assertRpcResult(result);
    },

    async revoke(companyId: string, userId: string): Promise<GmailProviderCredentialMetadata | null> {
      const result = await client.rpc("server_revoke_gmail_provider_credential", { p_company_id: companyId, p_user_id: userId });
      const data = assertRpcResult(result);
      return data ? metadataFromRow(data) : null;
    },

    decrypt(credential: GmailProviderCredential): string {
      return decryptGoogleRefreshToken(credential.envelope, credential.companyId, credential.userId, masterKey);
    },
  };
  return repository;
}

export function gmailServerSupabase(environment: Record<string, string | undefined> = process.env): SupabaseClient {
  const url = safeText(environment.SUPABASE_URL || environment.VITE_SUPABASE_URL, 500);
  const key = safeText(environment.SUPABASE_GMAIL_SERVER_KEY, 2_000);
  if (!url || !key || key.startsWith("VITE_")) {
    throw new GmailCredentialError("GMAIL_CREDENTIALS_SERVER_MISCONFIGURED", "Gmail server authorization storage is not configured for this deployment.");
  }
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}

export function createServerGmailCredentialRepository(environment: Record<string, string | undefined> = process.env) {
  return createGmailCredentialRepository(gmailServerSupabase(environment), environment);
}
