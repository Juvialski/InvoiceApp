import type { SupabaseClient } from "@supabase/supabase-js";
import {
  COMPANY_AI_FALLBACK_MODEL,
  COMPANY_AI_PRIMARY_MODEL,
  COMPANY_AI_PROVIDER,
  CompanyAiError,
  type CompanyAiConfigMetadata,
  type CompanyAiCredentialEnvelope,
  type CompanyAiCredentialResolution,
  type CompanyAiStatus,
  type CompanyAiTestStatus,
} from "./companyAiTypes.ts";
import type { EncryptedCompanyCredential } from "./companyAiEncryption.ts";
import { companyAiServerSupabase } from "./companyAiServerSupabase.ts";

function row(value: unknown): Record<string, any> {
  if (Array.isArray(value)) return row(value[0]);
  return value && typeof value === "object" ? value as Record<string, any> : {};
}

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function companyScope(value: string) {
  const companyId = typeof value === "string" ? value.trim() : "";
  if (!companyId) throw new CompanyAiError("AI_CONFIG_UNAVAILABLE", "Company AI configuration is temporarily unavailable.", 503);
  return companyId;
}

function assertRecordScope(source: Record<string, any>, companyId: string) {
  const returnedCompanyId = text(source.company_id ?? source.companyId);
  if (returnedCompanyId && returnedCompanyId !== companyId) {
    throw new CompanyAiError("AI_CONFIG_UNAVAILABLE", "Company AI configuration is temporarily unavailable.", 503);
  }
  const returnedProvider = text(source.provider);
  if (returnedProvider && returnedProvider !== COMPANY_AI_PROVIDER) {
    throw new CompanyAiError("AI_CONFIG_UNAVAILABLE", "Company AI configuration is temporarily unavailable.", 503);
  }
}

function numberValue(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

function bool(value: unknown, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function status(value: unknown, fallback: CompanyAiStatus = "NOT_CONFIGURED"): CompanyAiStatus {
  return value === "ACTIVE" || value === "DISABLED" || value === "INVALID" || value === "NOT_CONFIGURED" ? value : fallback;
}

function testStatus(value: unknown): CompanyAiTestStatus {
  return value === "SUCCESS" || value === "INVALID_CREDENTIAL" || value === "QUOTA_LIMITED" || value === "PROVIDER_UNAVAILABLE" || value === "PROVIDER_ACCESS_DENIED" || value === "MODEL_UNAVAILABLE" ? value : "NOT_TESTED";
}

export interface DeploymentAiBootstrapAuthorizationInput {
  companyStatus?: unknown;
  membershipStatus?: unknown;
  membershipRole?: unknown;
  aiStatus?: unknown;
  credentialConfigured?: unknown;
  auditEvents?: readonly unknown[];
  operatorUserId: string;
}

/** Mirror the safe, non-secret eligibility facts checked by the bootstrap RPC. */
export function isDeploymentAiBootstrapAuthorized(input: DeploymentAiBootstrapAuthorizationInput): boolean {
  if (input.companyStatus !== "ACTIVE" || input.membershipStatus !== "ACTIVE" || input.membershipRole !== "COMPANY_ADMIN") return false;
  const auditEvents = input.auditEvents || [];
  const initialOperator = auditEvents.some((event) => {
    const record = row(event);
    const metadata = row(record.metadata);
    return record.event_type === "COMPANY_CREATED"
      && metadata.bootstrap === true
      && String(metadata.initial_admin_user_id || "") === input.operatorUserId;
  });
  if (!initialOperator) return false;
  if (input.aiStatus === "NOT_CONFIGURED") return input.credentialConfigured === false;
  if (input.aiStatus !== "INVALID") return false;

  const bootstrapOwned = auditEvents.some((event) => {
    const record = row(event);
    const metadata = row(record.metadata);
    return (record.event_type === "COMPANY_AI_CREDENTIAL_CONFIGURED" || record.event_type === "COMPANY_AI_CREDENTIAL_ROTATED")
      && metadata.bootstrap === true
      && String(metadata.operator_user_id || "") === input.operatorUserId;
  });
  const hasSuccessfulTest = auditEvents.some((event) => {
    const record = row(event);
    const metadata = row(record.metadata);
    return record.event_type === "COMPANY_AI_CREDENTIAL_TESTED" && metadata.test_status === "SUCCESS";
  });
  return bootstrapOwned && !hasSuccessfulTest;
}

export async function canBootstrapDeploymentCompanyAiCredential(
  client: SupabaseClient,
  companyId: string,
  operatorUserId: string,
  config: Pick<CompanyAiConfigMetadata, "status" | "credentialConfigured">,
): Promise<boolean> {
  const [companyResult, membershipResult, auditResult] = await Promise.all([
    client.from("companies").select("status").eq("id", companyId).maybeSingle(),
    client.from("company_members").select("status,role_key").eq("company_id", companyId).eq("user_id", operatorUserId).maybeSingle(),
    client.from("company_audit_events").select("event_type,metadata").eq("company_id", companyId).in("event_type", ["COMPANY_CREATED", "COMPANY_AI_CREDENTIAL_CONFIGURED", "COMPANY_AI_CREDENTIAL_ROTATED", "COMPANY_AI_CREDENTIAL_TESTED"]),
  ]);
  if (companyResult.error || membershipResult.error || auditResult.error) {
    throw new CompanyAiError("AI_CONFIG_UNAVAILABLE", "Company AI configuration is temporarily unavailable.", 503);
  }
  return isDeploymentAiBootstrapAuthorized({
    companyStatus: row(companyResult.data).status,
    membershipStatus: row(membershipResult.data).status,
    membershipRole: row(membershipResult.data).role_key,
    aiStatus: config.status,
    credentialConfigured: config.credentialConfigured,
    auditEvents: Array.isArray(auditResult.data) ? auditResult.data : [],
    operatorUserId,
  });
}

function metadataFromRecord(value: unknown, companyId: string): CompanyAiConfigMetadata {
  const source = row(value);
  assertRecordScope(source, companyId);
  const configured = bool(source.credential_configured ?? source.credentialConfigured);
  const sourceStatus = status(source.status, configured ? (bool(source.enabled, true) ? "ACTIVE" : "DISABLED") : "NOT_CONFIGURED");
  return {
    companyId: text(source.company_id ?? source.companyId) || companyId,
    provider: COMPANY_AI_PROVIDER,
    enabled: bool(source.enabled, sourceStatus === "ACTIVE"),
    primaryModel: COMPANY_AI_PRIMARY_MODEL,
    fallbackModel: COMPANY_AI_FALLBACK_MODEL,
    credentialConfigured: configured,
    credentialLast4: text(source.credential_last4 ?? source.credentialLast4 ?? source.key_last4 ?? source.keyLast4),
    credentialVersion: numberValue(source.credential_version ?? source.credentialVersion),
    status: sourceStatus,
    lastTestedAt: text(source.last_tested_at ?? source.lastTestedAt),
    lastTestStatus: testStatus(source.last_test_status ?? source.lastTestStatus),
    updatedAt: text(source.updated_at ?? source.updatedAt),
  };
}

function resolutionFromRecord(value: unknown, companyId: string): CompanyAiCredentialResolution | null {
  const source = row(value);
  if (!Object.keys(source).length) return null;
  assertRecordScope(source, companyId);
  const ciphertext = text(source.ciphertext);
  const iv = text(source.iv);
  const authTag = text(source.auth_tag ?? source.authTag);
  const hasEnvelopePart = Boolean(ciphertext || iv || authTag);
  if (hasEnvelopePart && (!ciphertext || !iv || !authTag)) {
    throw new CompanyAiError("AI_CONFIG_UNAVAILABLE", "Company AI configuration is temporarily unavailable.", 503);
  }
  const sourceStatus = status(source.status, ciphertext && iv && authTag ? (bool(source.enabled, true) ? "ACTIVE" : "DISABLED") : "NOT_CONFIGURED");
  const resolution: CompanyAiCredentialResolution = {
    companyId,
    provider: COMPANY_AI_PROVIDER,
    enabled: bool(source.enabled, sourceStatus === "ACTIVE"),
    status: sourceStatus,
    credentialVersion: numberValue(source.credential_version ?? source.credentialVersion),
    encryptionVersion: numberValue(source.encryption_version ?? source.encryptionVersion, 1),
    keyLast4: text(source.key_last4 ?? source.keyLast4),
  };
  if (ciphertext && iv && authTag) {
    resolution.credential = {
      companyId,
      provider: COMPANY_AI_PROVIDER,
      enabled: resolution.enabled,
      status: resolution.status,
      credentialVersion: resolution.credentialVersion,
      encryptionVersion: resolution.encryptionVersion,
      ciphertext,
      iv,
      authTag,
      keyLast4: resolution.keyLast4,
    };
  }
  return resolution;
}

async function rpc(client: SupabaseClient, name: string, args: Record<string, unknown>) {
  const result = await client.rpc(name, args);
  if (result.error) throw new CompanyAiError("AI_CONFIG_UNAVAILABLE", "Company AI configuration is temporarily unavailable.", 503);
  return result.data;
}

export async function loadCompanyAiConfig(client: SupabaseClient, companyId: string): Promise<CompanyAiConfigMetadata> {
  const scope = companyScope(companyId);
  const data = await rpc(client, "platform_get_company_ai_config", { p_company_id: scope });
  return metadataFromRecord(data, scope);
}

export async function loadServerCompanyAiConfig(client: SupabaseClient, companyId: string): Promise<CompanyAiConfigMetadata> {
  const scope = companyScope(companyId);
  const data = await rpc(client, "server_get_company_ai_config", { p_company_id: scope });
  return metadataFromRecord(data, scope);
}

export async function storeCompanyAiCredential(client: SupabaseClient, companyId: string, envelope: EncryptedCompanyCredential, keyLast4: string): Promise<CompanyAiConfigMetadata> {
  const scope = companyScope(companyId);
  const data = await rpc(client, "platform_store_company_ai_credential", {
    p_company_id: scope,
    p_ciphertext: envelope.ciphertext,
    p_iv: envelope.iv,
    p_auth_tag: envelope.authTag,
    p_encryption_version: envelope.encryptionVersion,
    p_key_last4: keyLast4,
  });
  return metadataFromRecord(data, scope);
}

export async function bootstrapDeploymentCompanyAiCredential(
  client: SupabaseClient,
  companyId: string,
  operatorUserId: string,
  envelope: EncryptedCompanyCredential,
  keyLast4: string,
): Promise<CompanyAiConfigMetadata & { idempotent?: boolean }> {
  const scope = companyScope(companyId);
  const result = await client.rpc("bootstrap_deployment_company_ai_credential", {
    p_company_id: scope,
    p_operator_user_id: operatorUserId,
    p_ciphertext: envelope.ciphertext,
    p_iv: envelope.iv,
    p_auth_tag: envelope.authTag,
    p_encryption_version: envelope.encryptionVersion,
    p_key_last4: keyLast4,
  });
  if (result.error) {
    const code = String((result.error as { code?: unknown }).code || "");
    if (code === "42501") throw new CompanyAiError("AI_BOOTSTRAP_NOT_AUTHORIZED", "Initial deployment operator authorization is required.", 403);
    if (code === "55000") throw new CompanyAiError("AI_BOOTSTRAP_ALREADY_CONFIGURED", "Initial deployment AI configuration is already complete. Use the platform maintenance workflow.", 409);
    if (code === "22023") throw new CompanyAiError("AI_BOOTSTRAP_INVALID", "The deployment AI credential could not be configured safely.", 400);
    throw new CompanyAiError("AI_CONFIG_UNAVAILABLE", "Company AI configuration is temporarily unavailable.", 503);
  }
  const data = result.data;
  const source = row(data);
  return { ...metadataFromRecord(source, scope), ...(typeof source.idempotent === "boolean" ? { idempotent: source.idempotent } : {}) };
}

export async function recordCompanyAiTest(client: SupabaseClient, companyId: string, result: CompanyAiTestStatus): Promise<CompanyAiConfigMetadata> {
  const scope = companyScope(companyId);
  const data = await rpc(client, "platform_record_company_ai_test", { p_company_id: scope, p_test_status: result });
  return metadataFromRecord(data, scope);
}

export async function recordServerCompanyAiTest(client: SupabaseClient, companyId: string, result: CompanyAiTestStatus): Promise<CompanyAiConfigMetadata> {
  const scope = companyScope(companyId);
  const data = await rpc(client, "server_record_company_ai_test", { p_company_id: scope, p_test_status: result });
  return metadataFromRecord(data, scope);
}

export async function markCompanyAiCredentialInvalid({ supabase, companyId }: { supabase?: SupabaseClient; companyId: string }): Promise<CompanyAiConfigMetadata> {
  const scope = companyScope(companyId);
  const credentialClient = supabase || companyAiServerSupabase();
  const data = await rpc(credentialClient, "server_mark_company_ai_invalid", { p_company_id: scope });
  return metadataFromRecord(data, scope);
}

export async function disableCompanyAi(client: SupabaseClient, companyId: string): Promise<CompanyAiConfigMetadata> {
  const scope = companyScope(companyId);
  const data = await rpc(client, "platform_disable_company_ai", { p_company_id: scope });
  return metadataFromRecord(data, scope);
}

export async function enableCompanyAi(client: SupabaseClient, companyId: string): Promise<CompanyAiConfigMetadata> {
  const scope = companyScope(companyId);
  const data = await rpc(client, "platform_enable_company_ai", { p_company_id: scope });
  return metadataFromRecord(data, scope);
}

export async function removeCompanyAiCredential(client: SupabaseClient, companyId: string): Promise<CompanyAiConfigMetadata> {
  const scope = companyScope(companyId);
  const data = await rpc(client, "platform_remove_company_ai_credential", { p_company_id: scope });
  return metadataFromRecord(data, scope);
}

export async function resolveCompanyAiCredential({ supabase, companyId }: { supabase?: SupabaseClient; companyId: string }): Promise<CompanyAiCredentialResolution | null> {
  const scope = companyScope(companyId);
  const credentialClient = supabase || companyAiServerSupabase();
  const data = await rpc(credentialClient, "resolve_company_ai_credential", { p_company_id: scope });
  return resolutionFromRecord(data, scope);
}
