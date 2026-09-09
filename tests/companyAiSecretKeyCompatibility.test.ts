import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(new URL("../supabase/migrations/20260909053311_company_ai_secret_key_rpc_compatibility.sql", import.meta.url), "utf8");
const handoff = readFileSync(new URL("../docs/HYDROQUALISENSE_CURRENT_HANDOFF.md", import.meta.url), "utf8");
const runbook = readFileSync(new URL("../docs/HYDROQUALISENSE_DEPLOYMENT_RUNBOOK.md", import.meta.url), "utf8");

const SERVER_ONLY_AI_FUNCTIONS = [
  "bootstrap_deployment_company_ai_credential",
  "server_get_company_ai_config",
  "server_record_company_ai_test",
  "resolve_company_ai_credential",
  "server_mark_company_ai_invalid",
];

test("server-only AI RPC migration uses modern secret-key grants instead of legacy caller-role checks", () => {
  assert.doesNotMatch(migration, /current_setting\(\s*'request\.jwt\.claim\.role'/i);
  assert.doesNotMatch(migration, /\bcurrent_user\s*(?:<>|=|in)\b/i);
  for (const functionName of SERVER_ONLY_AI_FUNCTIONS) {
    assert.match(migration, new RegExp(`create or replace function public\\.${functionName}\\(`, "i"));
    assert.match(migration, new RegExp(`revoke all on function public\\.${functionName}\\([^\\n]+\\) from public, anon, authenticated`, "i"));
    assert.match(migration, new RegExp(`grant execute on function public\\.${functionName}\\([^\\n]+\\) to service_role`, "i"));
  }
  assert.match(migration, /security definer[\s\S]*set search_path = ''/i);
  assert.match(migration, /service_role(?: EXECUTE)? grant is the server-only boundary/i);
});

test("AI deployment documentation records the modern server-key and QA NOT_CONFIGURED contract", () => {
  for (const document of [handoff, runbook]) {
    assert.match(document, /sb_secret_/i);
    assert.match(document, /legacy(?: JWT)?[\s`]+service_role/i);
    assert.match(document, /NOT_CONFIGURED/);
    assert.match(document, /production (?:remains )?read-only|production was not mutated/i);
    assert.match(document, /migration promotion remain(?:s)? separate|database promotion remain(?:s)? separate/i);
  }
});
