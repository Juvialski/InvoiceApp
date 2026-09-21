import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(new URL("../supabase/migrations/20260921095140_wide_documents_managed_artifacts_foundation.sql", import.meta.url), "utf8");

test("managed document migration adds company-scoped immutable document/version/artifact records", () => {
  assert.match(migration, /create table if not exists public\.managed_documents/i);
  assert.match(migration, /create table if not exists public\.managed_document_versions/i);
  assert.match(migration, /create table if not exists public\.document_artifact_registrations/i);
  assert.match(migration, /foreign key \(company_id, project_id\)\s+references public\.projects\(company_id, id\)/i);
  assert.match(migration, /foreign key \(template_version_id, company_id\)\s+references public\.document_template_versions\(id, company_id\)/i);
  assert.match(migration, /managed_document_versions_number_unique/i);
  assert.match(migration, /prevent_managed_document_version_mutation/i);
  assert.match(migration, /prevent_document_artifact_registration_mutation/i);
});

test("managed document migration keeps permissions, RLS, and private Storage boundaries explicit", () => {
  assert.match(migration, /\('documents\.read'/i);
  assert.match(migration, /\('documents\.manage'/i);
  assert.match(migration, /alter table public\.managed_documents enable row level security/i);
  assert.match(migration, /alter table public\.managed_document_versions enable row level security/i);
  assert.match(migration, /alter table public\.document_artifact_registrations enable row level security/i);
  assert.match(migration, /company-managed-documents/i);
  assert.match(migration, /revoke all on table public\.managed_documents, public\.managed_document_versions, public\.document_artifact_registrations from public, anon, authenticated/i);
  assert.match(migration, /create policy "company managed documents read" on storage\.objects/i);
  assert.doesNotMatch(migration, /create policy "company managed documents insert" on storage\.objects\s+for insert/i);
});

test("managed mutation functions enforce actor/company/concurrency and generated provenance", () => {
  assert.match(migration, /create or replace function public\.server_create_managed_document_with_version\(p_payload jsonb, p_actor_user_id uuid\)/i);
  assert.match(migration, /create or replace function public\.server_create_managed_document_version\(p_payload jsonb, p_actor_user_id uuid\)/i);
  assert.match(migration, /create or replace function public\.server_archive_managed_document\(p_document_id uuid, p_expected_updated_at timestamptz, p_reason text, p_actor_user_id uuid\)/i);
  assert.match(migration, /EXPECTED_VERSION_MISMATCH/i);
  assert.match(migration, /create or replace function public\.server_register_generated_document_artifact\(p_payload jsonb, p_actor_user_id uuid\)/i);
  assert.match(migration, /document_generation_evidence_artifact_index/i);
  assert.match(migration, /private\.document_artifact_read_permission/i);
  assert.match(migration, /private\.can_read_managed_document/i);
});
