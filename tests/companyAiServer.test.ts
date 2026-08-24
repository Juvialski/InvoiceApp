import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const server = readFileSync(new URL("../server.ts", import.meta.url), "utf8");
const runtime = readFileSync(new URL("../src/server/ai/companyAiRuntime.ts", import.meta.url), "utf8");
const credentials = readFileSync(new URL("../src/server/ai/companyAiCredentials.ts", import.meta.url), "utf8");
const handler = readFileSync(new URL("../src/server/assistant/assistantHandler.ts", import.meta.url), "utf8");
const api = readFileSync(new URL("../src/lib/companyAiApi.ts", import.meta.url), "utf8");
const migration = readFileSync(new URL("../supabase/migrations/20260824122000_company_ai_credentials.sql", import.meta.url), "utf8");
const hardeningMigration = readFileSync(new URL("../supabase/migrations/20260824123000_company_ai_hardening.sql", import.meta.url), "utf8");
const serverSupabase = readFileSync(new URL("../src/server/ai/companyAiServerSupabase.ts", import.meta.url), "utf8");

test("company AI endpoints are platform-owner scoped and metadata-only", () => {
  for (const path of [
    "/api/platform/companies/:companyId/ai-config",
    "/api/platform/companies/:companyId/ai-config/gemini",
    "/api/platform/companies/:companyId/ai-config/gemini/test",
    "/api/platform/companies/:companyId/ai-config/gemini/disable",
    "/api/platform/companies/:companyId/ai-config/gemini/enable",
    "/api/platform/companies/:companyId/ai-config/gemini",
  ]) assert.match(server, new RegExp(path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(server, /authorizePlatformCompanyRequest/);
  assert.match(server, /is_platform_admin/);
  assert.match(credentials, /platform_store_company_ai_credential/);
  assert.match(server, /invalidateCompanyAiRuntime/);
  assert.doesNotMatch(server, /res\.json\([^\n]*apiKey/i);
  assert.doesNotMatch(server, /console\.(?:log|info|warn|error)\([\s\S]{0,300}(?:apiKey|ciphertext|authTag|plaintext)/i);
  assert.doesNotMatch(api, /localStorage|sessionStorage|credential\.ciphertext|plaintext/i);
  assert.match(migration, /revoke execute on function public\.resolve_company_ai_credential\(uuid\) from public, anon/);
  assert.match(hardeningMigration, /revoke execute on function public\.resolve_company_ai_credential\(uuid\) from public, anon, authenticated/);
  assert.match(hardeningMigration, /grant execute on function public\.resolve_company_ai_credential\(uuid\) to service_role/);
  assert.match(serverSupabase, /SUPABASE_AI_SERVER_KEY/);
  assert.doesNotMatch(serverSupabase, /VITE_SUPABASE_PUBLISHABLE_KEY|SUPABASE_PUBLISHABLE_KEY|VITE_SUPABASE_ANON_KEY/);
  assert.match(credentials, /supabase \|\| companyAiServerSupabase\(\)/);
  assert.match(runtime, /credentialSupabase/);
});

test("all production Gemini paths resolve the centralized company runtime", () => {
  assert.match(server, /resolveCompanyAiRuntime\(\{ supabase: auth\.supabase, companyId: auth\.companyId \}\)/);
  assert.match(handler, /withCompanyAiRuntime\(\{ supabase: auth\.supabase, companyId: auth\.companyId \}/);
  assert.match(runtime, /ALLOW_GLOBAL_GEMINI_FALLBACK/);
  assert.match(runtime, /AI_NOT_CONFIGURED_FOR_COMPANY/);
  assert.match(runtime, /AI_DISABLED_FOR_COMPANY/);
  assert.match(runtime, /credentialVersion/);
  assert.match(runtime, /MAX_RUNTIME_CACHE_ENTRIES/);
  assert.match(runtime, /forceRefresh/);
  assert.match(handler, /is_active_company_member/);
});
