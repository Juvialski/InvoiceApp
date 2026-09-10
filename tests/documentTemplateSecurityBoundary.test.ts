import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

function source(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

test("issued DOCX artifacts use server authority and preserve the originating user", () => {
  const router = source("src/server/documentTemplates/documentTemplateRouter.ts");

  assert.match(router, /function artifactWriteProvider[\s\S]*provider\.id !== "supabase"[\s\S]*serverSupabase\(options\)/);
  assert.match(router, /const evidenceClient = serverSupabase\(options\)/);
  assert.match(router, /generatedByUserId:\s*auth\.user\.id/);
  assert.match(router, /artifactBucket = put\.ref\.bucket/);
  assert.doesNotMatch(router, /auth\.supabase\.rpc\("record_document_generation_evidence"/);
});

test("artifact storage and evidence cannot be forged through browser-authenticated paths", () => {
  const migration = source("supabase/migrations/20260910065500_document_template_artifact_security.sql");

  assert.match(migration, /name like 'companies\/%\/document-templates\/%'/);
  assert.match(migration, /name like 'companies\/%\/document-template-artifacts\/%'/);
  assert.match(migration, /Document generation evidence may only be recorded by the trusted server/);
  assert.match(migration, /v_artifact_path is distinct from v_expected_artifact_path/);
  assert.match(migration, /revoke all on function public\.record_document_generation_evidence\(jsonb\) from public, anon, authenticated/);
  assert.match(migration, /grant execute on function public\.record_document_generation_evidence\(jsonb\) to service_role/);

  const insertPolicy = migration.match(/create policy "company document templates insert"[\s\S]*?;\n\ncreate or replace function/)?.[0] || "";
  assert.match(insertPolicy, /document-templates/);
  assert.doesNotMatch(insertPolicy, /document-template-artifacts/);
});
