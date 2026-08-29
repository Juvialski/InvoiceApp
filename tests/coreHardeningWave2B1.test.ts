import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../supabase/migrations/20260829050916_core_hardening_wave2b1_project_corrections.sql", import.meta.url),
  "utf8",
);
const projects = readFileSync(new URL("../src/lib/projects.ts", import.meta.url), "utf8");
const controller = readFileSync(new URL("../src/features/projects/useProjectController.ts", import.meta.url), "utf8");
const projectsPage = readFileSync(new URL("../src/components/projects/ProjectsPage.tsx", import.meta.url), "utf8");
const projectWorkspace = readFileSync(new URL("../src/components/projects/ProjectWorkspace.tsx", import.meta.url), "utf8");

test("Wave 2B1 migration is forward-only and exposes one guarded project lifecycle contract", () => {
  assert.match(migration, /alter table public\.projects[\s\S]*add column if not exists archived_from_status/);
  assert.doesNotMatch(migration, /drop table|drop schema|drop migration/i);
  for (const functionName of ["preview_project_lifecycle", "apply_project_lifecycle"]) {
    const block = migration.match(new RegExp(`create or replace function public\\.${functionName}[\\s\\S]*?\\$\\$;`))?.[0] || "";
    assert.match(block, /security definer/);
    assert.match(block, /set search_path = ''/);
  }
  assert.match(migration, /private\.deployment_company_id\(\)/);
  assert.match(migration, /private\.has_company_permission/);
  assert.match(migration, /select p\.\*[\s\S]*for update/);
  assert.match(migration, /private\.project_lifecycle_preflight/);
  assert.match(migration, /private\.write_company_audit/);
  assert.match(migration, /revoke delete on table public\.projects from anon, authenticated/);
  for (const event of ["PROJECT_DELETED_UNUSED", "PROJECT_ARCHIVED", "PROJECT_REACTIVATED"]) {
    assert.match(migration, new RegExp(`'${event}'`));
  }
});

test("Wave 2B1 preflight covers every discovered project dependency without payroll details", () => {
  for (const dependency of [
    "invoiceProjectAllocations", "expenses", "projectWorkerAssignments", "workEntries",
    "overtimeRequests", "payrollProjectAllocations", "payrollEntryProjectContexts", "payrollImportRows",
    "workerDefaultProjects", "compensationProfileDefaultProjects", "engineeringDocuments",
    "engineeringRfis", "engineeringSubmittals", "engineeringDailySiteLogs", "projectAccountingEvents",
  ]) assert.match(migration, new RegExp(`'${dependency}'`));
  assert.match(migration, /cost_context ->> 'projectId'/);
  assert.doesNotMatch(migration, /gross_pay|net_pay|salary|bank_account|calculation_snapshot.*amount/i);
  assert.match(migration, /archived_from_status in \('PLANNING', 'ACTIVE', 'ON_HOLD'\)/);
});

test("Wave 2B1 closes lifecycle bypasses and blocks new activity on archived projects", () => {
  assert.match(migration, /guard_project_lifecycle_edit/);
  assert.match(migration, /Use the project archive or reactivate lifecycle action/);
  assert.match(migration, /prevent_archived_project_activity/);
  for (const table of [
    "payroll_import_rows", "engineering_documents", "engineering_document_revisions",
    "engineering_rfis", "engineering_rfi_responses", "engineering_submittals",
    "engineering_submittal_rounds", "engineering_daily_site_logs", "project_accounting_events",
  ]) assert.match(migration, new RegExp(`'${table}'`));
  assert.match(migration, /p\.status = 'ARCHIVED' or p\.archived_at is not null/);
});

test("application project lifecycle contract maps the guarded RPC and distinguishes actions", () => {
  assert.match(projects, /previewProjectLifecycleInSupabase/);
  assert.match(projects, /applyProjectLifecycleInSupabase/);
  assert.match(projects, /p_action: action/);
  assert.match(controller, /previewProjectLifecycle/);
  assert.match(controller, /applyProjectLifecycle/);
  assert.match(controller, /Permanent project deletion requires an authoritative database preflight/);
  assert.match(projectsPage, /This permanently deletes the project because no operational or financial history exists\./);
  assert.match(projectsPage, /This keeps the project and its historical records but removes it from active workflows\./);
  assert.match(projectsPage, /Reactivate project/);
  assert.match(projectWorkspace, /label="Reactivate"/);
});
