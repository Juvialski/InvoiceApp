import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

function source(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

test("document template writes and issued DOCX evidence use trusted server authority", () => {
  const router = source("src/server/documentTemplates/documentTemplateRouter.ts");

  assert.match(router, /function serverWriteProvider[\s\S]*provider\.id !== "supabase"[\s\S]*serverSupabase\(options\)/);
  assert.match(router, /rpc\("server_create_document_template_version"/);
  assert.match(router, /rpc\("server_update_document_template_bindings"/);
  assert.match(router, /rpc\("server_activate_document_template_version"/);
  assert.match(router, /rpc\("server_retire_document_template_version"/);
  assert.match(router, /const evidenceClient = serverSupabase\(options\)/);
  assert.match(router, /generatedByUserId:\s*auth\.user\.id/);
  assert.match(router, /artifactBucket = put\.ref\.bucket/);
  assert.doesNotMatch(router, /auth\.supabase\.rpc\("record_document_generation_evidence"/);
});

test("non-authoritative preview generation requires template-management permission", () => {
  const router = source("src/server/documentTemplates/documentTemplateRouter.ts");

  assert.match(router, /const issuedGeneration = req\.body\?\.snapshotId !== undefined/);
  assert.match(router, /const permission: StoragePermissionKey = issuedGeneration[\s\S]*?"procurement\.read"[\s\S]*?"projects\.read"[\s\S]*?: "company\.settings\.manage"/);
  assert.match(router, /if \(issuedGeneration\)[\s\S]*?Issued snapshot ID/);
});

test("browser-authenticated callers cannot forge template mutations, storage writes, or generation evidence", () => {
  const migration = source("supabase/migrations/20260910065500_document_template_artifact_security.sql");

  assert.match(migration, /name like 'companies\/%\/document-templates\/%'/);
  assert.match(migration, /name like 'companies\/%\/document-template-artifacts\/%'/);
  assert.match(migration, /Modern Supabase sb_secret_ keys are not JWTs/);
  assert.doesNotMatch(migration, /v_request_role/);
  assert.doesNotMatch(migration, /create policy "company document templates insert"/);
  assert.match(migration, /revoke all on function public\.create_document_template_version\(jsonb\) from public, anon, authenticated, service_role/);
  assert.match(migration, /create or replace function public\.server_create_document_template_version/);
  assert.match(migration, /grant execute on function public\.server_create_document_template_version\(jsonb, uuid\) to service_role/);
  assert.match(migration, /v_artifact_path is distinct from v_expected_artifact_path/);
  assert.match(migration, /revoke all on function public\.record_document_generation_evidence\(jsonb\) from public, anon, authenticated/);
  assert.match(migration, /grant execute on function public\.record_document_generation_evidence\(jsonb\) to service_role/);
});
