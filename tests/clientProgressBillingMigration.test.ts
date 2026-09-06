import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(new URL("../supabase/migrations/20260903224406_client_progress_billing_foundation.sql", import.meta.url), "utf8");
const clientBilling = readFileSync(new URL("../src/lib/clientBilling.ts", import.meta.url), "utf8");
const workspace = readFileSync(new URL("../src/components/projects/ClientBillingPanel.tsx", import.meta.url), "utf8");
const projectWorkspace = readFileSync(new URL("../src/components/projects/ProjectWorkspace.tsx", import.meta.url), "utf8");
const projectOverview = readFileSync(new URL("../src/components/projects/ProjectOverview.tsx", import.meta.url), "utf8");
const projectRouting = readFileSync(new URL("../src/utils/appRouting.ts", import.meta.url), "utf8");
const projectCosting = readFileSync(new URL("../src/utils/projectCosting.ts", import.meta.url), "utf8");
const realtimeMigration = readFileSync(new URL("../supabase/migrations/20260903232024_client_billing_realtime.sql", import.meta.url), "utf8");

test("P2B-4 migration creates a line-derived, company-scoped billing domain", () => {
  assert.doesNotMatch(migration, /drop table|drop schema|drop migration/i);
  assert.match(migration, /create table if not exists public\.client_billings/);
  assert.match(migration, /create table if not exists public\.client_billing_lines/);
  assert.match(migration, /create table if not exists public\.client_billing_events/);
  assert.match(migration, /foreign key \(company_id, project_id\)\s*references public\.projects\(company_id, id\)/i);
  assert.match(migration, /foreign key \(company_id, billing_id\)\s*references public\.client_billings\(company_id, id\)/i);
  assert.match(migration, /client_billing_lines_company_billing_line_key/);
  assert.match(migration, /sum\(l\.amount\)/i);
  assert.doesNotMatch(migration, /total_amount/);
});

test("P2B-4 migration closes tenant and lifecycle bypasses", () => {
  for (const table of ["client_billings", "client_billing_lines", "client_billing_events"]) {
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`));
  }
  assert.match(migration, /private\.deployment_company_id\(\)/);
  assert.match(migration, /private\.has_company_permission/);
  assert.match(migration, /private\.require_project_permission/);
  assert.match(migration, /client_billings_company_select/);
  assert.match(migration, /client_billings_company_insert/);
  assert.match(migration, /client_billings_company_update/);
  assert.match(migration, /revoke all on table public\.client_billings, public\.client_billing_lines, public\.client_billing_events from public, anon/);
  assert.match(migration, /grant select, insert, update on table public\.client_billings to authenticated/);
  assert.match(migration, /grant select on table public\.client_billing_events to authenticated/);
  assert.match(migration, /prevent_client_billing_delete/);
  assert.match(migration, /prevent_client_billing_event_mutation/);
  assert.match(migration, /append-only/);
});

test("P2B-4 lifecycle RPC enforces issued-only billing truth and concurrent over-billing guard", () => {
  for (const status of ["DRAFT", "SUBMITTED", "ISSUED", "CANCELLED", "VOIDED"]) assert.match(migration, new RegExp(`'${status}'`));
  assert.match(migration, /create or replace function public\.create_or_update_client_billing\(\s*p_billing jsonb/s);
  assert.match(migration, /create or replace function public\.transition_client_billing\(/);
  assert.match(migration, /for update/);
  assert.match(migration, /Only ISSUED billing contributes|only ISSUED billing|Only ISSUED/i);
  assert.match(migration, /v_target = 'ISSUED'/);
  assert.match(migration, /v_project\.contract_value/);
  assert.match(migration, /v_issued_total \+ v_current_total > v_contract_value/);
  assert.match(migration, /using errcode = '23514'/);
  assert.match(migration, /project-first lock ordering/i);
  assert.match(migration, /CLIENT_BILLING_ISSUED/);
  assert.match(migration, /CLIENT_BILLING_VOIDED/);
});

test("P2B-4 project history, currency, and collection boundaries are represented in source", () => {
  assert.match(migration, /'clientBillings', v_client_billings/);
  assert.match(migration, /select count\(\*\) into v_client_billings/);
  assert.match(migration, /Client billing currency must match the project currency/);
  assert.match(migration, /Archived projects cannot receive new client billing activity/);
  assert.match(migration, /Only PLANNING, ACTIVE, ON_HOLD, and COMPLETED projects may create, submit, or issue client billings/);
  assert.match(clientBilling, /status === "ISSUED"/);
  assert.match(clientBilling, /calculateClientBillingSummary/);
  assert.match(clientBilling, /Billed to Date|billedToDate/);
  assert.match(clientBilling, /remainingToBill/);
  assert.doesNotMatch(clientBilling, /financial_transaction|settlement|cash/i);
  assert.match(workspace, /Only ISSUED billings count toward Billed to Date/);
  assert.match(workspace, /P2B-6 bank-evidence workflow/);
  assert.doesNotMatch(projectCosting, /client[_A-Z]?billing/i, "client billing must not enter Actual Cost or Committed Cost calculation");
  assert.match(projectWorkspace, /Client Invoices/);
  assert.match(projectOverview, /Billed to Date/);
  assert.match(projectOverview, /Remaining to Bill/);
  assert.match(projectRouting, /"billing"/);
});

test("P2B-4 Realtime publication extension is additive", () => {
  assert.match(realtimeMigration, /alter publication supabase_realtime add table/);
  for (const table of ["client_billings", "client_billing_lines", "client_billing_events"]) assert.match(realtimeMigration, new RegExp(`'${table}'`));
  assert.doesNotMatch(realtimeMigration, /create publication\s+supabase_realtime/i);
  assert.doesNotMatch(realtimeMigration, /create policy\s+/i);
});
