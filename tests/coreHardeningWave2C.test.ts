import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(new URL("../supabase/migrations/20260829100003_core_hardening_wave2c_engineering_corrections.sql", import.meta.url), "utf8");
const documentPersistence = readFileSync(new URL("../src/lib/engineeringDocumentsPersistence.ts", import.meta.url), "utf8");
const coordinationPersistence = readFileSync(new URL("../src/lib/engineeringCoordinationPersistence.ts", import.meta.url), "utf8");
const siteLogPersistence = readFileSync(new URL("../src/lib/dailySiteLogsPersistence.ts", import.meta.url), "utf8");
const documentsController = readFileSync(new URL("../src/features/engineering/useEngineeringDocumentsController.ts", import.meta.url), "utf8");
const coordinationController = readFileSync(new URL("../src/features/engineering/useEngineeringCoordinationController.ts", import.meta.url), "utf8");
const siteLogController = readFileSync(new URL("../src/features/engineering/useDailySiteLogsController.ts", import.meta.url), "utf8");
const assistantCoordination = readFileSync(new URL("../src/server/assistant/engineeringCoordinationAssistant.ts", import.meta.url), "utf8");
const assistantSiteLogs = readFileSync(new URL("../src/server/assistant/dailySiteLogsAssistant.ts", import.meta.url), "utf8");

test("Wave 2C migration is additive and exposes authenticated lifecycle boundaries", () => {
  assert.doesNotMatch(migration, /drop table|drop schema|drop migration/i);
  assert.match(migration, /create table if not exists public\.engineering_daily_site_log_addenda/);
  for (const column of ["lifecycle_reason", "lifecycle_actor_user_id", "superseded_at", "superseded_by_user_id"]) {
    assert.match(migration, new RegExp(`add column if not exists ${column}`));
  }
  for (const functionName of [
    "preview_engineering_document_lifecycle",
    "apply_engineering_document_lifecycle",
    "preview_engineering_rfi_lifecycle",
    "apply_engineering_rfi_lifecycle",
    "preview_engineering_submittal_lifecycle",
    "apply_engineering_submittal_lifecycle",
    "preview_engineering_daily_site_log_lifecycle",
    "apply_engineering_daily_site_log_lifecycle",
    "create_engineering_daily_site_log_addendum",
  ]) {
    assert.match(migration, new RegExp(`create or replace function public\\.${functionName}`));
    assert.match(migration, new RegExp(`revoke all on function public\\.${functionName}`));
    assert.match(migration, new RegExp(`grant execute on function public\\.${functionName}[\\s\\S]*to authenticated`));
  }
  assert.match(migration, /private\.deployment_company_id\(\)/);
  assert.match(migration, /private\.has_company_permission/);
  assert.match(migration, /for update/);
  assert.match(migration, /private\.write_company_audit/);
  assert.match(migration, /revoke delete on table public\.engineering_documents[\s\S]*from anon, authenticated/);
  assert.match(migration, /alter table public\.engineering_daily_site_log_addenda enable row level security/);
});

test("Wave 2C preflights cover dependencies, archived projects, and bounded action recommendations", () => {
  for (const dependency of [
    "revisions", "annotations", "rfiLinks", "submittalLinks", "storageObjects", "auditEvents",
    "responses", "documentLinks", "rounds", "reviews", "additionalRounds",
    "formalEvents", "draftObservations", "narrativeFields", "addenda",
  ]) assert.match(migration, new RegExp(`'${dependency}'`));
  for (const action of ["DELETE_UNUSED", "ARCHIVE", "SUPERSEDE", "VOID", "ADDENDUM"]) assert.match(migration, new RegExp(`'${action}'`));
  assert.match(migration, /archived or unavailable project/i);
  assert.match(migration, /recordBeforeDelete/);
  assert.match(migration, /recordBeforeVoid/);
  assert.match(migration, /FINALIZED observations are immutable/i);
  assert.match(migration, /append-only correction\/addendum/i);
  assert.match(migration, /engineering_documents_no_delete/);
  assert.match(migration, /Archived or superseded engineering documents cannot receive new revisions/);
  assert.match(migration, /engineering_rfis_no_delete/);
  assert.match(migration, /engineering_submittals_no_delete/);
  assert.match(migration, /prevent_daily_site_log_delete/);
  assert.match(migration, /current_user in \('postgres', 'service_role'\)/);
});

test("Wave 2C direct mutation guards preserve revisions, rounds, responses, and finalized observations", () => {
  assert.match(migration, /Engineering document revisions are append-only|engineering_document_revisions/);
  assert.match(migration, /Formal engineering coordination history is append-only/);
  assert.match(migration, /Daily Site Log lifecycle history is append-only/);
  assert.match(migration, /Daily Site Log addenda are append-only historical corrections/);
  assert.match(migration, /engineering_daily_site_log_addenda/);
  assert.match(migration, /delete from public\.engineering_daily_site_log_events/);
  assert.match(migration, /delete from public\.engineering_submittal_rounds/);
  assert.match(migration, /status = 'FINALIZED'/);
  assert.match(migration, /status = 'VOID'/);
});

test("application and existing Assistant paths use guarded RPC boundaries", () => {
  assert.match(documentPersistence, /preview_engineering_document_lifecycle/);
  assert.match(documentPersistence, /apply_engineering_document_lifecycle/);
  assert.match(coordinationPersistence, /preview_engineering_rfi_lifecycle/);
  assert.match(coordinationPersistence, /apply_engineering_rfi_lifecycle/);
  assert.match(coordinationPersistence, /preview_engineering_submittal_lifecycle/);
  assert.match(coordinationPersistence, /apply_engineering_submittal_lifecycle/);
  assert.match(siteLogPersistence, /preview_engineering_daily_site_log_lifecycle/);
  assert.match(siteLogPersistence, /apply_engineering_daily_site_log_lifecycle/);
  assert.match(siteLogPersistence, /create_engineering_daily_site_log_addendum/);
  assert.match(documentsController, /buildLocalEngineeringDocumentLifecyclePreview/);
  assert.match(coordinationController, /applyRfiLifecycle|applySubmittalLifecycle/);
  assert.match(siteLogController, /buildLocalSiteLogLifecyclePreview/);
  assert.match(assistantCoordination, /respond_engineering_rfi|void|close_engineering_rfi/);
  assert.match(assistantSiteLogs, /create_engineering_daily_site_log|update_engineering_daily_site_log_draft|apply_engineering_daily_site_log_lifecycle/);
  assert.doesNotMatch(documentPersistence, /\.from\("engineering_documents"\)[\s\S]*\.update\(/);
});
