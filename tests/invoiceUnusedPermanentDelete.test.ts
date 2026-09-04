import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../supabase/migrations/20260904130000_invoice_unused_permanent_delete.sql", import.meta.url),
  "utf8",
);
const accountingRaceGuardMigration = readFileSync(
  new URL("../supabase/migrations/20260904131000_invoice_accounting_event_delete_race_guard.sql", import.meta.url),
  "utf8",
);
const dialog = readFileSync(new URL("../src/components/financial/FinancialCorrectionDialog.tsx", import.meta.url), "utf8");
const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");

test("unused invoice deletion is a forward, guarded correction migration", () => {
  assert.doesNotMatch(migration, /drop table|drop schema|drop migration/i);
  assert.match(migration, /create or replace function private\.invoice_correction_preflight/);
  assert.match(migration, /create or replace function public\.apply_invoice_correction/);
  assert.match(migration, /security definer/);
  assert.match(migration, /set search_path = ''/);
  assert.match(migration, /private\.deployment_company_id\(\)/);
  assert.match(migration, /private\.require_financial_correction_permission\(v_company_id, 'invoices\.manage'/);
  assert.match(migration, /for update/);
  assert.match(migration, /private\.write_company_audit/);
  assert.match(migration, /INVOICE_DELETED_UNUSED/);
  assert.match(migration, /grant execute on function public\.apply_invoice_correction\(uuid, text, text\) to authenticated/);
  assert.match(migration, /revoke all on function public\.apply_invoice_correction\(uuid, text, text\) from public, anon/);
});

test("invoice deletion distinguishes disposable extraction provenance from protected use", () => {
  for (const marker of [
    "v_disposable_review_events",
    "v_protected_review_events",
    "v_protected_total",
    "v_disposable_total",
    "blockingDependencies",
    "disposableDependencies",
    "purchase_order_invoice_matches",
    "financial_transaction_matches",
    "project_accounting_events",
    "invoice_project_allocations",
    "v_verified_history",
    "v_payment_evidence",
    "v_duplicate_references",
  ]) assert.match(migration, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

  assert.match(migration, /AI_EXTRACTION_CREATED.*AI_REEXTRACTION_CREATED.*HUMAN_EDIT/);
  assert.match(migration, /Purchase Order match record/);
  assert.match(migration, /project cost allocation record/);
  assert.match(migration, /paid or partially-paid evidence/);
  assert.match(migration, /verified or has finalized verification history/);
  assert.match(migration, /Cannot permanently delete — this invoice has/);
});

test("source cleanup remains provider-neutral and conservative", () => {
  assert.match(migration, /document_backup_replicas/);
  assert.match(migration, /document_migration_records/);
  assert.match(migration, /RETAINED_SHARED_OR_REFERENCED/);
  assert.match(migration, /RETAINED_BACKUP_OR_MIGRATION_BOOKKEEPING/);
  assert.match(migration, /RETAINED_FOR_CONSERVATIVE_RETENTION_CLEANUP/);
  assert.match(migration, /physicalObjectDeleted', false/);
  assert.doesNotMatch(migration, /delete from public\.source_documents/);
});

test("append-only extraction and review children only delete under the guarded marker", () => {
  assert.match(migration, /prevent_invoice_record_mutation/);
  assert.match(migration, /app\.invoice_unused_delete_authorized/);
  assert.match(migration, /set_config\('app\.invoice_unused_delete_authorized', 'on', true\)/);
  assert.match(migration, /set_config\('app\.invoice_unused_delete_authorized', 'off', true\)/);
});

test("polymorphic invoice accounting events serialize with unused deletion", () => {
  assert.match(accountingRaceGuardMigration, /lock_invoice_target_for_project_accounting_event/);
  assert.match(accountingRaceGuardMigration, /upper\(btrim\(coalesce\(new\.entity_type, ''\)\)\) = 'INVOICE'/);
  assert.match(accountingRaceGuardMigration, /i\.id = new\.entity_id/);
  assert.match(accountingRaceGuardMigration, /i\.company_id = new\.company_id/);
  assert.match(accountingRaceGuardMigration, /for key share/);
  assert.match(accountingRaceGuardMigration, /project_accounting_events_invoice_target_lock/);
});

test("invoice correction UI exposes a clear permanent action and truthful post-delete feedback", () => {
  assert.match(dialog, /Delete permanently/);
  assert.match(dialog, /window\.confirm/);
  assert.match(dialog, /Protected blockers/);
  assert.match(dialog, /Disposable or retained provenance/);
  assert.match(app, /action === "DELETE_UNUSED" \? "Invoice permanently deleted/);
});
