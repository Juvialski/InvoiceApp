import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../supabase/migrations/20260828153000_project_labor_cost_aggregate.sql", import.meta.url),
  "utf8",
);
const projectPersistence = readFileSync(new URL("../src/lib/projects.ts", import.meta.url), "utf8");
const assistantExecutors = readFileSync(new URL("../src/server/assistant/assistantToolExecutors.ts", import.meta.url), "utf8");

test("project labor aggregate migration is a forward-only guarded RPC", () => {
  assert.match(migration, /create or replace function public\.get_project_labor_cost_aggregate\(\s*p_project_ids uuid\[\]/);
  assert.doesNotMatch(migration, /p_company_id/);
  assert.match(migration, /public\.get_deployment_company_id\(\)/);
  assert.match(migration, /private\.has_company_permission\(v_company_id, 'payroll\.summary\.read'\)/);
  assert.match(migration, /private\.has_company_permission\(v_company_id, 'projects\.read'\)/);
  assert.match(migration, /every requested project must belong to the configured deployment company/i);
  assert.match(migration, /security definer\s+set search_path = ''/i);
  assert.match(migration, /revoke execute on function public\.get_project_labor_cost_aggregate\(uuid\[\]\) from public, anon, authenticated/);
  assert.match(migration, /grant execute on function public\.get_project_labor_cost_aggregate\(uuid\[\]\) to authenticated/);
  assert.doesNotMatch(migration, /drop table\s+/i);
});

test("aggregate SQL uses canonical allocation amounts and preserves payroll lifecycle boundaries", () => {
  assert.match(migration, /sum\(ppa\.allocation_amount\)/);
  assert.match(migration, /pr\.status in \('APPROVED', 'PAID'\)/);
  assert.match(migration, /pr\.status not in \('APPROVED', 'PAID', 'VOID'\)/);
  assert.match(migration, /coalesce\(pe\.cost_context ->> 'type', ''\) not in \('ADMIN_OFFICE', 'GENERAL_OVERHEAD'\)/);
  assert.doesNotMatch(migration, /sum\([^)]*\bnet_pay\b/i);
  assert.doesNotMatch(migration, /sum\([^)]*\bgross_pay\b/i);
  assert.match(migration, /not coalesce\(labor\.has_qualifying_allocations, false\) then 'ZERO'/);
  assert.match(migration, /then 'CURRENCY_CONFLICT'/);
});

test("aggregate response is project-level only and documents currency limitations", () => {
  const returnShape = migration.match(/returns table\(([^]*?)\)\s*language plpgsql/i)?.[1] || "";
  assert.match(returnShape, /project_id uuid/);
  assert.match(returnShape, /currency text/);
  assert.match(returnShape, /confirmed_labor_cost numeric/);
  assert.match(returnShape, /pending_labor_cost numeric/);
  assert.match(returnShape, /aggregate_status text/);
  assert.doesNotMatch(returnShape, /employee|worker|email|attendance|rate|deduction|net_pay|gross_pay|payroll_entry/i);
  assert.match(migration, /cannot select another company/i);
  assert.match(migration, /Administrative\/general-overhead payroll is not project labor/i);
});

test("browser and Assistant paths do not load payroll detail for the aggregate", () => {
  assert.match(projectPersistence, /PROJECT_LABOR_AGGREGATE_RPC/);
  assert.match(projectPersistence, /\.rpc\(PROJECT_LABOR_AGGREGATE_RPC/);
  assert.match(projectPersistence, /p_project_ids/);
  assert.doesNotMatch(projectPersistence, /payroll_entries|payroll_project_allocations|payroll_runs/);
  const start = assistantExecutors.indexOf("async function getProjectCostSummary");
  const end = assistantExecutors.indexOf("async function listExpenses", start);
  const projectCostExecutor = assistantExecutors.slice(start, end);
  assert.match(projectCostExecutor, /get_project_labor_cost_aggregate/);
  assert.doesNotMatch(projectCostExecutor, /(?:from|userCompanyQuery)\([^\n]*(?:payroll_entries|payroll_project_allocations|payroll_runs)/i);
  assert.match(projectCostExecutor, /employee identity.*not returned/i);
});
