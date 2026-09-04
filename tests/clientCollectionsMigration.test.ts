import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../supabase/migrations/20260904090000_client_collections_foundation.sql", import.meta.url),
  "utf8",
);
const clientCollections = readFileSync(new URL("../src/lib/clientCollections.ts", import.meta.url), "utf8");
const workspace = readFileSync(new URL("../src/components/projects/ClientBillingPanel.tsx", import.meta.url), "utf8");
const projectOverview = readFileSync(new URL("../src/components/projects/ProjectOverview.tsx", import.meta.url), "utf8");
const projectCosting = readFileSync(new URL("../src/utils/projectCosting.ts", import.meta.url), "utf8");
const projectFinancialSummary = readFileSync(
  new URL("../src/utils/projectFinancialSummary.ts", import.meta.url),
  "utf8",
);

test("P2B-5 migration creates an allocation-derived, company-scoped collections domain", () => {
  assert.doesNotMatch(migration, /drop table|drop schema|drop migration/i);
  assert.match(migration, /create table if not exists public\.client_collections/);
  assert.match(migration, /create table if not exists public\.client_collection_allocations/);
  assert.match(migration, /create table if not exists public\.client_collection_events/);
  assert.match(migration, /foreign key \(company_id, project_id\)\s*references public\.projects\(company_id, id\)/i);
  assert.match(migration, /foreign key \(company_id, billing_id\)\s*references public\.client_billings\(company_id, id\)/i);
  assert.match(migration, /client_collection_allocations_company_col_bill_key/);
  assert.match(migration, /sum\(a\.amount\)/i);
  assert.doesNotMatch(migration, /create table [^;]*total_amount/i);
});

test("P2B-5 migration closes tenant and lifecycle bypasses", () => {
  for (const table of ["client_collections", "client_collection_allocations", "client_collection_events"]) {
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`));
  }
  assert.match(migration, /private\.deployment_company_id\(\)/);
  assert.match(migration, /private\.has_company_permission/);
  assert.match(migration, /private\.require_project_permission/);
  assert.match(migration, /client_collections_company_select/);
  assert.match(migration, /client_collections_company_insert/);
  assert.match(migration, /client_collections_company_update/);
  assert.match(
    migration,
    /revoke all on table public\.client_collections, public\.client_collection_allocations, public\.client_collection_events from public, anon/,
  );
  assert.match(migration, /grant select, insert, update on table public\.client_collections to authenticated/);
  assert.match(migration, /grant select on table public\.client_collection_events to authenticated/);
  assert.match(migration, /prevent_client_collection_delete/);
  assert.match(migration, /prevent_client_collection_event_mutation/);
  assert.match(migration, /append-only/);
});

test("P2B-5 lifecycle RPC enforces deterministic locks and over-collection guard", () => {
  for (const status of ["DRAFT", "RECORDED", "REVERSED"]) {
    assert.match(migration, new RegExp(`'${status}'`));
  }
  assert.match(migration, /create or replace function public\.create_or_update_client_collection\(/);
  assert.match(migration, /create or replace function public\.record_client_collection\(/);
  assert.match(migration, /create or replace function public\.reverse_client_collection\(/);
  assert.match(migration, /for update/);
  assert.match(migration, /project-first lock ordering/i);
  assert.match(migration, /deterministic lock ordering/i);
  assert.match(migration, /\(v_already_collected \+ v_alloc\.amount\) > v_billing_total/);
  assert.match(migration, /using errcode = '23514'/);
  assert.match(migration, /length\(v_reason\) < 3/);
  assert.match(migration, /CLIENT_COLLECTION_RECORDED/);
  assert.match(migration, /CLIENT_COLLECTION_REVERSED/);
});

test("P2B-5 project history, currency, and strict financial boundaries are represented in source", () => {
  assert.match(migration, /'clientCollections', v_client_collections/);
  assert.match(migration, /select count\(\*\) into v_client_collections/);
  assert.match(migration, /Client collection currency must match the project currency/);
  assert.match(migration, /Archived projects cannot receive new client collection activity/);
  assert.match(clientCollections, /status === "RECORDED"/);
  assert.match(clientCollections, /calculateClientCollectionSummary/);
  assert.match(clientCollections, /Collected to Date|collectedToDate/);
  assert.match(clientCollections, /outstandingBilledAmount/);
  assert.doesNotMatch(clientCollections, /financial_transaction|settlement|cash_account/i);
  assert.match(workspace, /Collected to Date/);
  assert.match(workspace, /Outstanding Billed Amount/);
  assert.match(workspace, /Collections/);
  assert.doesNotMatch(
    projectCosting,
    /client[_A-Z]?collection/i,
    "client collections must not enter Actual Cost or Committed Cost calculation",
  );
  assert.match(projectOverview, /Collected to Date/);
  assert.match(projectOverview, /Outstanding Billed Amount/);
  assert.match(projectFinancialSummary, /collected/);
  assert.match(projectFinancialSummary, /outstandingReceivables/);
});

test("P2B-5 Realtime publication extension is additive", () => {
  assert.match(migration, /alter publication supabase_realtime add table/);
  for (const table of ["client_collections", "client_collection_allocations", "client_collection_events"]) {
    assert.match(migration, new RegExp(`'${table}'`));
  }
  assert.doesNotMatch(migration, /create publication\s+supabase_realtime/i);
});
