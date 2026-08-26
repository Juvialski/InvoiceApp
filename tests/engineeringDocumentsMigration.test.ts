import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

const migrationUrl = new URL("../supabase/migrations/20260826130000_engineering_documents_foundation.sql", import.meta.url);
const sql = readFileSync(migrationUrl, "utf8");

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
  assert.match(sql, /create policy "company engineering documents update" on storage\.objects/);
  assert.match(sql, /create policy "company engineering documents delete" on storage\.objects/);
  assert.match(sql, /bucket_id = 'engineering-documents'/);
  assert.match(sql, /private\.storage_company_id\(name\) is not null/);
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
