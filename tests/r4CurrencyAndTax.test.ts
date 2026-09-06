import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildClientInvoiceDocumentSnapshot } from "../src/lib/documentGeneration.ts";
import { createLocalFinancialFxSnapshot } from "../src/lib/financialFx.ts";
import { convertFinancialAmount } from "../src/utils/financialCurrency.ts";
import { projectTaxTreatmentLabel } from "../src/utils/projectTaxTreatment.ts";
import { calculateProjectCost } from "../src/utils/projectCosting.ts";
import { buildDashboardViewData } from "../src/utils/dashboardViewModel.ts";
import type { ClientBilling, Expense, FinancialFxSnapshot, InvoiceData, Project } from "../src/types.ts";

const migration = readFileSync(new URL("../supabase/migrations/20260906041647_r4_fx_tax_and_payroll_safety.sql", import.meta.url), "utf8");
const projectSource = readFileSync(new URL("../src/components/projects/ProjectsPage.tsx", import.meta.url), "utf8");
const billingSource = readFileSync(new URL("../src/components/projects/ClientBillingPanel.tsx", import.meta.url), "utf8");

const profile = { legalName: "HydroQualiSense", defaultTerms: "Due on receipt" };
const project: Project = { id: "project-fx", projectCode: "FX", projectName: "FX project", status: "ACTIVE", projectBudget: 10_000, currency: "PHP", taxTreatment: "VAT", createdAt: "2026-09-06", updatedAt: "2026-09-06" };
const invoice: InvoiceData = { id: "invoice-fx", invoiceNumber: "FX-1", invoiceDate: "2026-09-06", currency: "USD", vendor: { name: "Foreign Supplier" }, customer: { name: "HydroQualiSense" }, items: [], subtotal: 11.72, totalTax: 0, grandTotal: 11.72, extractedAt: "2026-09-06T00:00:00.000Z", modelUsed: "test", reviewStatus: "VERIFIED", lifecycleStatus: "ACTIVE" };
const fx: FinancialFxSnapshot = createLocalFinancialFxSnapshot({ sourceType: "SUPPLIER_INVOICE", sourceId: invoice.id, sourceAmount: invoice.grandTotal, sourceCurrency: "USD", baseCurrency: "PHP", rate: 56.25, rateDate: "2026-09-06" }, "2026-09-06T01:00:00.000Z");

test("PHP amounts remain direct while unresolved foreign amounts are excluded", () => {
  assert.equal(convertFinancialAmount(100, "PHP", "PHP", "SUPPLIER_INVOICE", "php", []), 100);
  assert.equal(convertFinancialAmount(11.72, "USD", "PHP", "SUPPLIER_INVOICE", invoice.id, []), undefined);
  assert.equal(convertFinancialAmount(11.72, "USD", "PHP", "SUPPLIER_INVOICE", invoice.id, [fx]), 659.25);
  assert.equal(invoice.grandTotal, 11.72);
});

test("project cost uses the authoritative FX snapshot without changing source currency", () => {
  const allocated = { ...invoice, allocations: [{ id: "allocation-fx", invoiceId: invoice.id, projectId: project.id, allocationType: "AMOUNT" as const, allocationAmount: invoice.grandTotal }] };
  const unresolved = calculateProjectCost(project, { invoices: [allocated] });
  const resolved = calculateProjectCost(project, { invoices: [allocated], fxSnapshots: [fx] });
  assert.equal(unresolved.totalActualCost, 0);
  assert.equal(unresolved.foreignCosts.USD, 11.72);
  assert.equal(resolved.totalActualCost, 659.25);
  assert.deepEqual(resolved.foreignCosts, {});
});

test("client invoice carries project tax treatment and document snapshot preserves it", () => {
  const billing: ClientBilling = { id: "billing-fx", projectId: project.id, billingNumber: "BILL-FX", billingDate: "2026-09-06", currency: "PHP", taxTreatment: "VAT", status: "ISSUED", lines: [{ id: "line", billingId: "billing-fx", lineNumber: 1, description: "Progress", amount: 100 }], createdAt: "2026-09-06", updatedAt: "2026-09-06" };
  const snapshot = buildClientInvoiceDocumentSnapshot(billing, project, profile);
  assert.equal(snapshot.taxTreatment, "VAT");
  assert.equal(projectTaxTreatmentLabel("NON_VAT"), "Non-VAT");
});

test("dashboard PHP tax reporting does not treat unresolved USD tax as PHP", () => {
  const dashboardInput = {
    projects: [],
    invoices: [{ ...invoice, totalTax: 1, philippineTaxDetails: { sellerRegistration: "VAT" as const, vatAmount: 1, vatableSales: 10 }, allocations: [] }],
    expenses: [],
    payroll: [],
    periods: [],
    workers: [],
    payrollEntries: [],
    payrollAllocations: [],
    payrollRuns: [],
    activityPeriod: "MONTH" as const,
    selectedCurrency: "USD",
    baseCurrency: "PHP",
  };
  const unresolved = buildDashboardViewData(dashboardInput);
  assert.equal(unresolved.invoiceOperations.phpFxRequired, 1);
  assert.equal(unresolved.invoiceOperations.phpVat, 0);
  const resolved = buildDashboardViewData({ ...dashboardInput, fxSnapshots: [fx] });
  assert.equal(resolved.invoiceOperations.phpFxRequired, 0);
  assert.equal(resolved.invoiceOperations.phpVat, 56.25);
});

test("R4 FX and tax contracts are explicit and guarded", () => {
  assert.match(migration, /financial_fx_snapshots/);
  assert.match(migration, /source_amount/);
  assert.match(migration, /source_currency/);
  assert.match(migration, /base_amount/);
  assert.match(migration, /rate_date/);
  assert.match(migration, /rate_source/);
  assert.match(migration, /company\.settings\.manage/);
  assert.match(migration, /FX conversion snapshots are immutable/);
  assert.match(migration, /tax_treatment/);
  assert.match(migration, /taxTreatment/);
  assert.match(migration, /require_project_tax_treatment_on_insert/);
  assert.match(projectSource, /Tax treatment \*/);
  assert.match(projectSource, /Choose VAT or Non-VAT before saving/);
  assert.match(billingSource, /Project tax treatment/);
  assert.match(billingSource, /Confirm the project VAT or Non-VAT classification before issuing/);
});
