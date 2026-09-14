import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(new URL("../supabase/migrations/20260914014153_document_template_type_definitions.sql", import.meta.url), "utf8");

test("dynamic template migration creates a company-bound type definition contract", () => {
  assert.match(migration, /create table if not exists public\.document_template_type_definitions/i);
  assert.match(migration, /company_id uuid not null references public\.companies/i);
  assert.match(migration, /type_key text not null/i);
  assert.match(migration, /unique \(company_id, type_key\)/i);
  assert.match(migration, /source_context text not null/i);
  assert.match(migration, /custom_fields jsonb not null/i);
  assert.match(migration, /repeat_sections jsonb not null/i);
  assert.match(migration, /status text not null/i);
  assert.match(migration, /alter table public\.document_template_versions.*drop constraint/i);
  assert.match(migration, /document_template_versions_type_definition_fk/i);
  assert.match(migration, /document_templates_type_definition_fk/i);
});

test("dynamic template migration preserves server-only mutation and safe read boundaries", () => {
  assert.match(migration, /create or replace function public\.server_create_document_template_type/i);
  assert.match(migration, /create or replace function public\.server_update_document_template_type/i);
  assert.match(migration, /create or replace function public\.server_retire_document_template_type/i);
  assert.match(migration, /revoke all on table public\.document_template_type_definitions from public, anon, authenticated/i);
  assert.match(migration, /grant select on table public\.document_template_type_definitions to authenticated/i);
  assert.match(migration, /alter table public\.document_template_type_definitions enable row level security/i);
  assert.match(migration, /private\.storage_template_type_key/i);
});

test("dynamic template migration seeds system types without changing issued-document contracts", () => {
  assert.match(migration, /'PURCHASE_ORDER'/i);
  assert.match(migration, /'CLIENT_INVOICE'/i);
  assert.match(migration, /create trigger companies_document_template_types_seed/i);
  assert.match(migration, /after insert on public\.companies/i);
  assert.doesNotMatch(migration, /alter table public\.issued_document_snapshots[\s\S]*document_type/i);
  assert.doesNotMatch(migration, /alter table public\.document_generation_evidence[\s\S]*document_type/i);
  assert.doesNotMatch(migration, /PROJECT_EQUIPMENT_MATERIALS_CHECKLIST|PROJECT_WARRANTY_CERTIFICATE/);
});
