import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  decryptCompanyGeminiCredential,
  encryptCompanyGeminiCredential,
  readAiCredentialsMasterKey,
} from "../src/server/ai/companyAiEncryption.ts";

const COMPANY_A = "00000000-0000-4000-8000-000000000001";
const MASTER = Buffer.alloc(32, 7);

test("company Gemini credentials encrypt and decrypt with AES-GCM", () => {
  const first = encryptCompanyGeminiCredential("Key-A-secret-value", COMPANY_A, MASTER);
  const second = encryptCompanyGeminiCredential("Key-A-secret-value", COMPANY_A, MASTER);
  assert.equal(decryptCompanyGeminiCredential(first, COMPANY_A, MASTER), "Key-A-secret-value");
  assert.notEqual(first.ciphertext, second.ciphertext);
  assert.notEqual(first.iv, second.iv);
  assert.equal(first.encryptionVersion, 1);
});

test("tampered envelopes, company binding, and wrong keys fail closed", () => {
  const envelope = encryptCompanyGeminiCredential("Key-A-secret-value", COMPANY_A, MASTER);
  const tamper = (value: string) => { const bytes = Buffer.from(value, "base64"); bytes[0] = (bytes[0] || 0) ^ 1; return bytes.toString("base64"); };
  assert.throws(() => decryptCompanyGeminiCredential({ ...envelope, ciphertext: tamper(envelope.ciphertext) }, COMPANY_A, MASTER), /could not be opened safely/i);
  assert.throws(() => decryptCompanyGeminiCredential({ ...envelope, authTag: tamper(envelope.authTag) }, COMPANY_A, MASTER), /could not be opened safely/i);
  assert.throws(() => decryptCompanyGeminiCredential(envelope, "00000000-0000-4000-8000-000000000002", MASTER), /could not be opened safely/i);
  assert.throws(() => decryptCompanyGeminiCredential(envelope, COMPANY_A, Buffer.alloc(32, 8)), /could not be opened safely/i);
});

test("master-key configuration requires exactly 32 decoded base64 bytes", () => {
  assert.deepEqual(readAiCredentialsMasterKey({ AI_CREDENTIALS_MASTER_KEY: MASTER.toString("base64") } as any), MASTER);
  assert.throws(() => readAiCredentialsMasterKey({ AI_CREDENTIALS_MASTER_KEY: Buffer.alloc(31).toString("base64") } as any), /not configured/i);
  assert.throws(() => readAiCredentialsMasterKey({ AI_CREDENTIALS_MASTER_KEY: "not-a-credential" } as any), /not configured/i);
  const nonCanonicalPadding = `${MASTER.toString("base64").slice(0, -2)}x=`;
  assert.throws(() => readAiCredentialsMasterKey({ AI_CREDENTIALS_MASTER_KEY: nonCanonicalPadding } as any), /not configured/i);
});

test("explicit invalid master keys never fall back to the process environment", () => {
  const previous = process.env.AI_CREDENTIALS_MASTER_KEY;
  process.env.AI_CREDENTIALS_MASTER_KEY = MASTER.toString("base64");
  try {
    assert.throws(() => encryptCompanyGeminiCredential("Key-A-secret-value", COMPANY_A, Buffer.alloc(0)), /not configured/i);
    const envelope = encryptCompanyGeminiCredential("Key-A-secret-value", COMPANY_A, MASTER);
    assert.throws(() => decryptCompanyGeminiCredential(envelope, COMPANY_A, Buffer.alloc(0)), /not configured/i);
  } finally {
    if (previous === undefined) delete process.env.AI_CREDENTIALS_MASTER_KEY;
    else process.env.AI_CREDENTIALS_MASTER_KEY = previous;
  }
});

test("invalid envelope encoding and server key failures keep distinct safe error codes", () => {
  const envelope = encryptCompanyGeminiCredential("Key-A-secret-value", COMPANY_A, MASTER);
  assert.throws(() => decryptCompanyGeminiCredential({ ...envelope, iv: "not-base64" }, COMPANY_A, MASTER), (error: any) => {
    assert.equal(error.code, "AI_CREDENTIAL_UNAVAILABLE");
    assert.doesNotMatch(error.message, /Key-A|base64|ciphertext|master/i);
    return true;
  });
  assert.throws(() => decryptCompanyGeminiCredential(envelope, COMPANY_A, Buffer.alloc(31)), (error: any) => {
    assert.equal(error.code, "AI_CREDENTIALS_SERVER_MISCONFIGURED");
    return true;
  });
});

test("AI credential migration is additive, encrypted-envelope-only, and owner controlled", () => {
  const migration = readFileSync(new URL("../supabase/migrations/20260824122000_company_ai_credentials.sql", import.meta.url), "utf8");
  assert.match(migration, /create table if not exists public\.company_ai_settings/);
  assert.match(migration, /create table if not exists public\.company_ai_credentials/);
  assert.match(migration, /ciphertext text not null/);
  assert.match(migration, /encryption_version integer/);
  assert.match(migration, /AES-256-GCM|encrypted credential envelope/i);
  assert.match(migration, /private\.is_platform_admin\(\)/);
  assert.match(migration, /private\.is_active_company_member\(p_company_id\)/);
  assert.match(migration, /alter table public\.company_ai_credentials enable row level security/);
  assert.match(migration, /revoke all on table public\.company_ai_settings, public\.company_ai_credentials/);
  assert.match(migration, /COMPANY_AI_CREDENTIAL_(CONFIGURED|ROTATED|TESTED|DISABLED|REMOVED)/);
  assert.match(migration, /v_settings\.company_id is null/);
  assert.match(migration, /PAYROLL_REPAIR_APPLIED/);
  assert.match(migration, /PAYROLL_UNAPPROVED_RESET/);
  assert.doesNotMatch(migration, /api_key\s+text|secret_key\s+text|master_key\s+text/i);
  assert.doesNotMatch(migration, /drop table/i);
});

test("AI hardening migration supports enable and closes browser envelope access", () => {
  const migration = readFileSync(new URL("../supabase/migrations/20260824123000_company_ai_hardening.sql", import.meta.url), "utf8");
  assert.match(migration, /platform_enable_company_ai/);
  assert.match(migration, /COMPANY_AI_CREDENTIAL_ENABLED/);
  assert.match(migration, /PROVIDER_ACCESS_DENIED/);
  assert.match(migration, /security invoker/);
  assert.match(migration, /set search_path = ''/);
  assert.match(migration, /grant execute on function public\.resolve_company_ai_credential\(uuid\) to service_role/);
  assert.match(migration, /revoke execute on function public\.resolve_company_ai_credential\(uuid\) from public, anon, authenticated/);
  assert.match(migration, /server_mark_company_ai_invalid/);
  assert.match(migration, /grant execute on function public\.server_mark_company_ai_invalid\(uuid\) to service_role/);
  assert.doesNotMatch(migration, /drop table/i);
});
