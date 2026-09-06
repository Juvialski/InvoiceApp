import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { convertFinancialAmount } from "../src/utils/financialCurrency.ts";
import type { FinancialFxSnapshot } from "../src/types.ts";

const migration = readFileSync(
  new URL("../supabase/migrations/20260906054500_r4_fx_linked_source_scope.sql", import.meta.url),
  "utf8",
);

test("R4 FX visibility is scoped to the source domain", () => {
  assert.match(migration, /source_type = 'EXPENSE'.*expenses\.read/s);
  assert.match(migration, /source_type = 'SUPPLIER_INVOICE'.*invoices\.read/s);
  assert.match(migration, /source_type = 'CLIENT_BILLING'.*projects\.read/s);
  assert.doesNotMatch(
    migration.match(/create policy financial_fx_snapshots_select[\s\S]*?\);/)?.[0] || "",
    /company\.settings\.read/,
  );
});

test("public FX confirmation requires both settings management and requested-source read access", () => {
  assert.match(migration, /company\.settings\.manage/);
  assert.match(migration, /Expense read permission is required/);
  assert.match(migration, /Supplier invoice read permission is required/);
  assert.match(migration, /Project read permission is required/);
  assert.match(migration, /revoke all on function private\.upsert_financial_fx_snapshot_unscoped[\s\S]*authenticated/);
});

test("linked supplier Invoice and Expense receive the same frozen FX rate transactionally", () => {
  assert.match(migration, /supplier_invoice_id/);
  assert.match(migration, /'SUPPLIER_INVOICE'/);
  assert.match(migration, /'EXPENSE'/);
  assert.match(migration, /v_effective_rate/);
  assert.match(migration, /conflicting FX evidence/);
});

test("a linked supplier alias can convert tax with the same frozen rate used by the Expense", () => {
  const alias: FinancialFxSnapshot = {
    id: "invoice-fx-alias",
    sourceType: "SUPPLIER_INVOICE",
    sourceId: "invoice-usd",
    sourceAmount: 100,
    sourceCurrency: "USD",
    baseCurrency: "PHP",
    rate: 56.25,
    rateDate: "2026-09-06",
    rateSource: "MANUAL",
    confirmedAt: "2026-09-06T00:00:00.000Z",
    createdAt: "2026-09-06T00:00:00.000Z",
    baseAmount: 5625,
  };

  assert.equal(
    convertFinancialAmount(12, "USD", "PHP", "SUPPLIER_INVOICE", "invoice-usd", [alias]),
    675,
  );
});
