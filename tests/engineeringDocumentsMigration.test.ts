import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

const migrationUrl = new URL("../supabase/migrations/20260826130000_engineering_documents_foundation.sql", import.meta.url);
const sql = readFileSync(migrationUrl, "utf8");
const hardeningUrl = new URL("../supabase/migrations/20260826140000_engineering_documents_hardening.sql", import.meta.url);
const hardeningSql = readFileSync(hardeningUrl, "utf8");
const annotationImmutabilityUrl = new URL("../supabase/migrations/20260826234440_engineering_documents_annotation_immutability.sql", import.meta.url);
const annotationImmutabilitySql = readFileSync(annotationImmutabilityUrl, "utf8");
const sourceValidationUrl = new URL("../supabase/migrations/20260826235525_engineering_documents_source_validation.sql", import.meta.url);
const sourceValidationSql = readFileSync(sourceValidationUrl, "utf8");
const storagePathPolicyUrl = new URL("../supabase/migrations/20260827000204_engineering_documents_storage_path_policy.sql", import.meta.url);
const storagePathPolicySql = readFileSync(storagePathPolicyUrl, "utf8");
const wave7AuthorityUrl = new URL("../supabase/migrations/20260831003455_wave7_engineering_revision_authority.sql", import.meta.url);
const wave7AuthoritySql = readFileSync(wave7AuthorityUrl, "utf8");

test("engineering documents migration defines additive tables, check constraints, and RLS", () => {
  for (const table of ["engineering_documents", "engineering_document_revisions", "drawing_annotations"]) {
    assert.match(sql, new RegExp(`create table if not exists public\\.${table}`));
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`));
  }

  // Check constraints
  assert.match(sql, /discipline in \(\s*'ARCHITECTURAL', 'STRUCTURAL', 'CIVIL'/);
  assert.match(sql, /document_type in \(\s*'DRAWING', 'CALCULATION', 'SPECIFICATION'/);
  assert.match(sql, /annotation_type in \(\s*'RECTANGLE', 'CIRCLE', 'CLOUD', 'ARROW', 'LINE', 'TEXT'/);
  assert.match(sql, /unique \(company_id, document_number\)/);
  assert.match(sql, /unique \(document_id, revision_number\)/);
  assert.match(sql, /foreign key \(current_revision_id\) references public\.engineering_document_revisions\(id\) on delete set null/);

  // Security invoker / search path
  assert.match(sql, /create or replace function private\.validate_engineering_document_reference/);
  assert.match(sql, /create or replace function private\.validate_engineering_actor/);
  assert.match(sql, /create or replace function private\.audit_engineering_event/);
  assert.match(sql, /security definer\s+set search_path = ''/i);
});

test("engineering documents permissions and role mappings are defined correctly", () => {
  assert.match(sql, /'engineering\.documents\.read'/);
  assert.match(sql, /'engineering\.documents\.create'/);
  assert.match(sql, /'engineering\.documents\.update'/);
  assert.match(sql, /'engineering\.documents\.manage'/);

  // Role permissions
  assert.match(sql, /select 'COMPANY_ADMIN', permission_key/);
  assert.match(sql, /\('FINANCE', 'engineering\.documents\.read'\)/);
  assert.match(sql, /\('FINANCE', 'engineering\.documents\.create'\)/);
  assert.match(sql, /\('FINANCE', 'engineering\.documents\.update'\)/);
  assert.match(sql, /\('PAYROLL', 'engineering\.documents\.read'\)/);
  assert.match(sql, /\('VIEWER', 'engineering\.documents\.read'\)/);
});

test("tenant policy catalog registers engineering documents tables", () => {
  assert.match(sql, /\('engineering_documents',\s*'engineering\.documents\.read',\s*'engineering\.documents\.update',\s*true,\s*true,\s*false\)/);
  assert.match(sql, /\('engineering_document_revisions',\s*'engineering\.documents\.read',\s*'engineering\.documents\.create',\s*true,\s*false,\s*false\)/);
  assert.match(sql, /\('drawing_annotations',\s*'engineering\.documents\.read',\s*'engineering\.documents\.update',\s*true,\s*true,\s*true\)/);
});

test("storage bucket and company-scoped storage policies are created", () => {
  assert.match(sql, /insert into storage\.buckets \(id, name, public\)\s+values \('engineering-documents', 'engineering-documents', false\)/);
  assert.match(sql, /create policy "company engineering documents read" on storage\.objects/);
  assert.match(sql, /create policy "company engineering documents insert" on storage\.objects/);
  assert.match(sql, /bucket_id = 'engineering-documents'/);
  assert.match(sql, /private\.storage_company_id\(name\) is not null/);
});

test("hardening enforces current-revision ownership and append-only source provenance", () => {
  assert.match(hardeningSql, /create or replace function private\.validate_engineering_current_revision/);
  assert.match(hardeningSql, /v_revision\.company_id is distinct from new\.company_id/);
  assert.match(hardeningSql, /v_revision\.document_id is distinct from new\.id/);
  assert.match(hardeningSql, /create trigger engineering_document_revisions_append_only[\s\S]*before update or delete/);
  assert.match(hardeningSql, /create trigger engineering_document_revisions_source[\s\S]*before insert/);
  assert.match(hardeningSql, /sha256:\[0-9a-f\]\{64\}/);
  assert.match(hardeningSql, /companies\/%s\/documents\/%s\/revisions\/%s/);
});

test("hardening removes normal revision-source Storage mutation capability", () => {
  assert.match(hardeningSql, /drop policy if exists "company engineering documents update" on storage\.objects/);
  assert.match(hardeningSql, /drop policy if exists "company engineering documents delete" on storage\.objects/);
  assert.doesNotMatch(hardeningSql, /create policy "company engineering documents update" on storage\.objects/);
  assert.doesNotMatch(hardeningSql, /create policy "company engineering documents delete" on storage\.objects/);
  assert.match(hardeningSql, /revoke update, delete on table public\.engineering_document_revisions from authenticated/);
});

test("hardening exposes authenticated atomic metadata RPCs only", () => {
  assert.match(hardeningSql, /create or replace function public\.create_engineering_document_with_revision/);
  assert.match(hardeningSql, /create or replace function public\.create_engineering_revision/);
  assert.match(hardeningSql, /security definer\s+set search_path = ''/i);
  assert.match(hardeningSql, /engineering\.documents\.create/);
  assert.match(hardeningSql, /from storage\.objects o[\s\S]*o\.bucket_id = 'engineering-documents'[\s\S]*o\.name = p_file_path/);
  assert.match(hardeningSql, /revoke execute on function public\.create_engineering_document_with_revision/);
  assert.match(hardeningSql, /grant execute on function public\.create_engineering_document_with_revision[\s\S]*to authenticated/);
  assert.match(hardeningSql, /grant execute on function public\.create_engineering_revision[\s\S]*to authenticated/);
});

test("Wave 7 keeps revision uploads out of the guarded lifecycle states", () => {
  assert.match(wave7AuthoritySql, /create or replace function public\.create_engineering_revision/);
  assert.match(wave7AuthoritySql, /v_document_status text := coalesce\(nullif\(upper\(btrim\(p_document_status\)\), ''\), 'UNDER_REVIEW'\)/);
  assert.match(wave7AuthoritySql, /v_revision_status text := coalesce\(nullif\(upper\(btrim\(p_revision_status\)\), ''\), 'PENDING_REVIEW'\)/);
  assert.match(wave7AuthoritySql, /if v_document_status <> 'UNDER_REVIEW' then/);
  assert.match(wave7AuthoritySql, /if v_revision_status <> 'PENDING_REVIEW' then/);
  assert.match(wave7AuthoritySql, /v_doc\.status in \('ARCHIVED', 'SUPERSEDED'\)/);
  assert.match(wave7AuthoritySql, /revoke all on function public\.create_engineering_revision[\s\S]*from public, anon/);
  assert.match(wave7AuthoritySql, /grant execute on function public\.create_engineering_revision[\s\S]*to authenticated/);
});

test("annotation hardening removes physical delete and preserves audit history", () => {
  assert.match(annotationImmutabilitySql, /drop policy if exists drawing_annotations_company_delete on public\.drawing_annotations/);
  assert.match(annotationImmutabilitySql, /revoke delete on table public\.drawing_annotations from authenticated/);
  assert.match(annotationImmutabilitySql, /create trigger drawing_annotations_append_only[\s\S]*before delete/);
  assert.match(annotationImmutabilitySql, /mark them DELETED instead/);
});

test("source validation hardening mirrors the authenticated PDF contract", () => {
  assert.match(sourceValidationSql, /create or replace function private\.validate_engineering_revision_source/);
  assert.match(sourceValidationSql, /lower\(btrim\(new\.file_type\)\) <> 'application\/pdf'/);
  assert.match(sourceValidationSql, /lower\(btrim\(new\.file_name\)\) !~ '\\\.pdf\$'/);
  assert.match(sourceValidationSql, /new\.file_size_bytes <= 0 or new\.file_size_bytes > 52428800/);
  assert.match(sourceValidationSql, /split_part\(new\.file_path, '\/', 7\) <> btrim\(new\.file_name\)/);
});

test("Storage insert policy accepts only immutable revision PDF paths", () => {
  assert.match(storagePathPolicySql, /drop policy if exists "company engineering documents insert" on storage\.objects/);
  assert.match(storagePathPolicySql, /create policy "company engineering documents insert" on storage\.objects/);
  assert.match(storagePathPolicySql, /name ~\* '\^companies\/\[0-9a-f\]\{8\}/);
  assert.match(storagePathPolicySql, /\/documents\/\[0-9a-f\]\{8\}/);
  assert.match(storagePathPolicySql, /\/revisions\/\[0-9a-f\]\{8\}/);
  assert.match(storagePathPolicySql, /\[A-Za-z0-9\._-\]\+\\\.pdf\$'/);
});

test("realtime publication includes engineering documents tables", () => {
  assert.match(sql, /'engineering_documents'/);
  assert.match(sql, /'engineering_document_revisions'/);
  assert.match(sql, /'drawing_annotations'/);
  assert.match(sql, /alter publication supabase_realtime add table/);
});

test("engineering documents migration defines complete authoritative superset of 39 audit events", () => {
  const allowlistMatch = sql.match(/company_audit_events_event_type_check check \(event_type in \(([\s\S]*?)\)\);/);
  assert.ok(allowlistMatch, "Migration must define company_audit_events_event_type_check");
  const events = [...allowlistMatch[1].matchAll(/'([A-Z_]+)'/g)].map((m) => m[1]);
  const eventSet = new Set(events);

  const companyMemberEvents = [
    "COMPANY_CREATED", "COMPANY_UPDATED", "COMPANY_SUSPENDED", "COMPANY_ARCHIVED", "COMPANY_REACTIVATED",
    "USER_INVITED", "INVITE_REVOKED", "INVITE_ACCEPTED",
    "MEMBER_ROLE_CHANGED", "MEMBER_SUSPENDED", "MEMBER_REACTIVATED", "MEMBER_REVOKED"
  ];
  const payrollEvents = [
    "PAYROLL_REPAIR_APPLIED", "PAYROLL_CALENDAR_REBUILT", "PAYROLL_UNAPPROVED_RESET", "PAYROLL_WORKSPACE_RESET"
  ];
  const companyAiEvents = [
    "COMPANY_AI_CREDENTIAL_CONFIGURED", "COMPANY_AI_CREDENTIAL_ROTATED",
    "COMPANY_AI_CREDENTIAL_TESTED", "COMPANY_AI_CREDENTIAL_ENABLED",
    "COMPANY_AI_CREDENTIAL_DISABLED", "COMPANY_AI_CREDENTIAL_REMOVED"
  ];
  const cashEvents = [
    "CASH_ACCOUNT_CREATED", "CASH_ACCOUNT_UPDATED", "CASH_ACCOUNT_DEACTIVATED",
    "CASH_BALANCE_SNAPSHOT_RECORDED", "CASH_STATEMENT_IMPORTED", "CASH_STATEMENT_REJECTED",
    "CASH_TRANSACTION_CREATED", "CASH_TRANSACTION_UPDATED",
    "CASH_RECONCILIATION_CONFIRMED", "CASH_RECONCILIATION_REMOVED", "CASH_TRANSFER_MATCHED"
  ];
  const engineeringEvents = [
    "ENGINEERING_DOCUMENT_CREATED", "ENGINEERING_DOCUMENT_UPDATED", "ENGINEERING_DOCUMENT_ARCHIVED",
    "ENGINEERING_REVISION_UPLOADED", "ENGINEERING_ANNOTATION_SAVED", "ENGINEERING_ANNOTATION_DELETED"
  ];

  for (const event of companyMemberEvents) {
    assert.ok(eventSet.has(event), `Migration dropped company/member audit event: ${event}`);
  }
  for (const event of payrollEvents) {
    assert.ok(eventSet.has(event), `Migration dropped payroll audit event: ${event}`);
  }
  for (const event of companyAiEvents) {
    assert.ok(eventSet.has(event), `Migration dropped company AI audit event: ${event}`);
  }
  for (const event of cashEvents) {
    assert.ok(eventSet.has(event), `Migration dropped cash audit event: ${event}`);
  }
  for (const event of engineeringEvents) {
    assert.ok(eventSet.has(event), `Migration missing engineering audit event: ${event}`);
  }
  assert.equal(events.length, 39, `Expected exactly 39 unique audit events, found ${events.length}`);
});
