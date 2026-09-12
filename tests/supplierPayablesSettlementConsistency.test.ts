import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { Expense, InvoiceData, InvoiceProjectAllocation, Project } from "../src/types.ts";
import type { FinancialTransaction, FinancialTransactionMatch } from "../src/lib/cashBanking.ts";
import { eligibleSettlementCandidates, isSettlementTargetLifecycleEligible } from "../src/lib/financialSettlement.ts";
import { confirmedCandidateMatchedAmount } from "../src/lib/cashBanking.ts";
import {
  buildSupplierInvoiceSettlementProjections,
  confirmedSupplierInvoiceSettlementAmount,
  deriveSupplierInvoicePaymentState,
} from "../src/lib/supplierInvoiceSettlement.ts";
import { calculateProjectCost } from "../src/utils/projectCosting.ts";
import { activityTrends, agingPayables } from "../src/utils/dashboardStats.ts";

function invoice(overrides: Partial<InvoiceData> = {}): InvoiceData {
  return {
    id: "invoice-1",
    invoiceNumber: "SUP-001",
    invoiceDate: "2026-06-01",
    dueDate: "2026-09-30",
    currency: "PHP",
    vendor: { name: "Supplier" },
    items: [],
    subtotal: 1000,
    totalTax: 0,
    grandTotal: 1000,
    amountPaid: 0,
    balanceDue: 1000,
    reviewStatus: "VERIFIED",
    lifecycleStatus: "ACTIVE",
    extractedAt: "2026-06-01T00:00:00.000Z",
    modelUsed: "test",
    ...overrides,
  };
}

function expense(source: InvoiceData, overrides: Partial<Expense> = {}): Expense {
  return {
    id: `expense-${source.id}`,
    expenseDate: source.invoiceDate,
    category: "Materials",
    description: `Supplier invoice ${source.invoiceNumber}`,
    payee: source.vendor.name,
    supplierInvoiceId: source.id,
    amount: source.grandTotal || 0,
    currency: source.currency,
    status: "DRAFT",
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z",
    ...overrides,
  };
}

function match(id: string, targetType: "INVOICE" | "EXPENSE", targetId: string, amount: number, status: "CONFIRMED" | "REVERSED" = "CONFIRMED"): FinancialTransactionMatch {
  return {
    id,
    companyId: "company-a",
    transactionId: `transaction-${id}`,
    targetType,
    targetId,
    matchedAmount: amount,
    status,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
  };
}

function transaction(): FinancialTransaction {
  return {
    id: "transaction-1",
    companyId: "company-a",
    accountId: "account-1",
    transactionDate: "2026-09-01",
    description: "Supplier debit",
    direction: "DEBIT",
    amount: 1000,
    currency: "PHP",
    status: "POSTED",
    source: "MANUAL",
    sourceFingerprint: "transaction-1",
    reconciliationStatus: "UNMATCHED",
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
  };
}

test("the observed verified DRAFT supplier Expenses remain payable and two June invoices are overdue", () => {
  const invoices = [
    invoice({ id: "invoice-0123", invoiceNumber: "0123", grandTotal: 900_000, balanceDue: 0, dueDate: "2026-06-29" }),
    invoice({ id: "invoice-0754", invoiceNumber: "0754", grandTotal: 1_500_000, balanceDue: 0, dueDate: "2026-06-28" }),
    invoice({ id: "invoice-5678", invoiceNumber: "5678", grandTotal: 55_000, balanceDue: 0, dueDate: "2026-10-22" }),
  ];
  const expenses = invoices.map((source) => expense(source));
  const projections = buildSupplierInvoiceSettlementProjections(invoices, expenses, [], "2026-09-12");
  const rows = invoices.map((source) => projections.get(source.id)!);

  assert.equal(rows.filter((row) => row.payable && row.settlement.outstanding > 0.005).length, 3);
  assert.equal(rows.filter((row) => row.paymentState === "OVERDUE").length, 2);
  assert.equal(rows.filter((row) => row.paymentState === "UNPAID").length, 1);
  assert.equal(rows.reduce((sum, row) => sum + row.settlement.outstanding, 0), 2_455_000);
  assert.equal(rows.every((row) => row.targetType === "EXPENSE" && row.linkedExpense?.status === "DRAFT"), true);
});

test("unverified/document-paid evidence is not a payable PAID state", () => {
  const source = invoice({ id: "document-paid-only", amountPaid: 1000, balanceDue: 0, status: "PAID", dueDate: "2026-12-31" });
  const projection = buildSupplierInvoiceSettlementProjections([source], [], [], "2026-09-12").get(source.id)!;
  assert.equal(projection.paymentState, "UNPAID");
  assert.equal(projection.payable, true);
  assert.equal(projection.settlement.documentReportedPaid, 1000);
  assert.equal(projection.settlement.reconciledCashPaid, 0);
  assert.equal(projection.settlement.effectiveSettled, 0);
  assert.equal(projection.settlement.outstanding, 1000);

  const unverified = buildSupplierInvoiceSettlementProjections([invoice({ id: "unverified", reviewStatus: "NEEDS_REVIEW", amountPaid: 1000, balanceDue: 0, dueDate: "2026-08-01" })], [], [], "2026-09-12").get("unverified")!;
  assert.equal(unverified.paymentState, "UNPAID");
  assert.equal(unverified.payable, false);
});

test("date-only overdue semantics keep the due date current and the next day overdue", () => {
  const source = invoice({ id: "date-boundary", dueDate: "2026-09-12" });
  const linked = expense(source);
  assert.equal(deriveSupplierInvoicePaymentState(source, linked, { settlementBasis: 1000, reconciledCashPaid: 0, outstanding: 1000 }, "2026-09-12"), "UNPAID");
  assert.equal(deriveSupplierInvoicePaymentState(source, linked, { settlementBasis: 1000, reconciledCashPaid: 0, outstanding: 1000 }, "2026-09-13"), "OVERDUE");
  assert.equal(deriveSupplierInvoicePaymentState(source, linked, { settlementBasis: 1000, reconciledCashPaid: 1000, outstanding: 0 }, "2026-09-13"), "PAID");
});

test("partial, multiple, and reversed settlements aggregate exactly once", () => {
  const source = invoice({ id: "multiple-settlements", grandTotal: 1000, dueDate: "2026-12-01" });
  const linked = expense(source);
  const history = [
    match("settlement-a", "EXPENSE", linked.id, 300),
    match("settlement-b", "EXPENSE", linked.id, 250),
    match("settlement-reversed", "EXPENSE", linked.id, 100, "REVERSED"),
    match("unrelated", "EXPENSE", "another-expense", 999),
  ];
  const projection = buildSupplierInvoiceSettlementProjections([source], [linked], history, "2026-09-12").get(source.id)!;
  assert.equal(confirmedSupplierInvoiceSettlementAmount(source.id, linked.id, history), 550);
  assert.equal(projection.settlement.reconciledCashPaid, 550);
  assert.equal(projection.settlement.outstanding, 450);
  assert.equal(projection.paymentState, "PARTIALLY_PAID");

  const paid = buildSupplierInvoiceSettlementProjections([source], [linked], [...history, match("settlement-c", "EXPENSE", linked.id, 450)], "2026-09-12").get(source.id)!;
  assert.equal(paid.settlement.reconciledCashPaid, 1000);
  assert.equal(paid.settlement.outstanding, 0);
  assert.equal(paid.paymentState, "PAID");
});

test("reversed legacy invoice matches remain visible when Expense owns the supplier payable", () => {
  const source = invoice({ id: "legacy-link", grandTotal: 1000, dueDate: "2026-08-01" });
  const linked = expense(source);
  const projection = buildSupplierInvoiceSettlementProjections([source], [linked], [match("legacy", "INVOICE", source.id, 400)], "2026-09-12").get(source.id)!;
  assert.equal(projection.targetType, "EXPENSE");
  assert.equal(projection.settlement.reconciledCashPaid, 400);
  assert.equal(projection.settlement.outstanding, 600);
  assert.equal(projection.paymentState, "OVERDUE");
});

test("supplier-linked DRAFT eligibility is explicit and generic DRAFT remains blocked", () => {
  assert.equal(isSettlementTargetLifecycleEligible("EXPENSE", "DRAFT", { supplierInvoiceVerified: true }), true);
  assert.equal(isSettlementTargetLifecycleEligible("EXPENSE", "DRAFT"), false);
  const candidates = [
    { targetType: "EXPENSE" as const, targetId: "supplier-expense", label: "Supplier", currency: "PHP", settlementBasis: 100, settledAmount: 0, outstandingAmount: 100, lifecycleStatus: "DRAFT", supplierInvoiceVerified: true },
    { targetType: "EXPENSE" as const, targetId: "direct-expense", label: "Direct", currency: "PHP", settlementBasis: 100, settledAmount: 0, outstandingAmount: 100, lifecycleStatus: "DRAFT" },
  ];
  assert.deepEqual(eligibleSettlementCandidates(transaction(), candidates).map((row) => row.targetId), ["supplier-expense"]);
});

test("Cash target math includes legacy invoice matches under the linked Expense authority", () => {
  const source = invoice({ id: "cash-alias", grandTotal: 1000 });
  const linked = expense(source);
  const candidate = { targetType: "EXPENSE" as const, targetId: linked.id, supplierInvoiceId: source.id };
  assert.equal(confirmedCandidateMatchedAmount(candidate, [match("legacy-cash", "INVOICE", source.id, 400)]), 400);
  assert.equal(confirmedCandidateMatchedAmount(candidate, [match("expense-cash", "EXPENSE", linked.id, 400), match("legacy-cash", "INVOICE", source.id, 400)]), 800);
});

test("multiple active linked Expenses fail closed instead of creating competing cash targets", () => {
  const source = invoice({ id: "conflicted-authority", grandTotal: 1000 });
  const first = expense(source, { id: "expense-conflict-a" });
  const second = expense(source, { id: "expense-conflict-b" });
  const projection = buildSupplierInvoiceSettlementProjections([source], [first, second], [], "2026-09-12").get(source.id)!;
  assert.equal(projection.authorityConflict, true);
  assert.equal(projection.payable, false);
  assert.equal(projection.paymentState, "UNPAID");
});

test("secondary dashboard trend and aging helpers use the same DRAFT supplier payable projection", () => {
  const source = invoice({ id: "stats-linked", invoiceDate: "2026-08-01", dueDate: "2026-08-15" });
  const linked = expense(source, { projectId: "project-a" });
  const input = { invoices: [source], expenses: [linked], payroll: [], settlementMatches: [] };
  const trend = activityTrends(input, { currency: "PHP", grain: "month", from: "2026-08-01", to: "2026-08-31" }).find((point) => point.period === "2026-08");
  assert.equal(trend?.actual, 1000);
  assert.equal(trend?.invoices, 0);
  assert.equal(trend?.payable, 1000);
  const aging = agingPayables([source], "2026-08-31", "PHP", { expenses: [linked], settlementMatches: [] });
  assert.equal(aging.days1To30, 1000);
});

test("settlement changes payable reporting but not verified project cost", () => {
  const project: Project = { id: "project-a", projectCode: "A", projectName: "Project A", status: "ACTIVE", projectBudget: 5000, currency: "PHP", createdAt: "2026-01-01", updatedAt: "2026-01-01" };
  const source = invoice({ id: "cost-invoice", grandTotal: 1000, dueDate: "2026-12-01" });
  const allocation: InvoiceProjectAllocation = { id: "allocation-1", invoiceId: source.id, projectId: project.id, allocationType: "AMOUNT", allocationAmount: 1000 };
  const linked = expense(source, { projectId: project.id });
  const before = calculateProjectCost(project, { invoices: [{ ...source, allocations: [allocation] }], expenses: [linked], settlementMatches: [] });
  const after = calculateProjectCost(project, { invoices: [{ ...source, allocations: [allocation] }], expenses: [linked], settlementMatches: [match("paid", "EXPENSE", linked.id, 1000)] });
  assert.equal(before.totalActualCost, 1000);
  assert.equal(after.totalActualCost, 1000);
  assert.equal(before.unpaidInvoiceCost, 1000);
  assert.equal(after.unpaidInvoiceCost, 0);
  assert.equal(after.paidInvoiceCost, 1000);
});

test("global supplier metrics do not depend on the visible/paginated row slice", () => {
  const sources = [
    invoice({ id: "overdue-a", dueDate: "2026-08-01" }),
    invoice({ id: "overdue-b", dueDate: "2026-08-02" }),
    invoice({ id: "future", dueDate: "2026-12-01" }),
  ];
  const projections = buildSupplierInvoiceSettlementProjections(sources, sources.map((source) => expense(source)), [], "2026-09-12");
  const all = sources.map((source) => projections.get(source.id)!);
  const visible = all.slice(0, 1);
  assert.equal(all.filter((row) => row.payable).length, 3);
  assert.equal(all.filter((row) => row.paymentState === "OVERDUE").length, 2);
  assert.equal(visible.length, 1);
  const directory = readFileSync("src/components/InvoiceDirectory.tsx", "utf8");
  const panel = readFileSync("src/components/InvoiceSettlementDirectoryPanel.tsx", "utf8");
  assert.match(directory, /paymentState === paymentFilter/);
  assert.match(directory, /supplierInvoicePaymentStateFor/);
  assert.match(panel, /const open = rows\.filter/);
  assert.match(panel, /const overdue = rows\.filter/);
});

test("the database contract keeps company/target locks, supplier DRAFT exception, and cash-only state", () => {
  const migration = readFileSync("supabase/migrations/20260912082656_supplier_payables_settlement_consistency.sql", "utf8");
  assert.match(migration, /if v_supplier_invoice_id is not null/);
  assert.match(migration, /v_supplier_draft_eligible := v_target_status = 'DRAFT'/);
  assert.match(migration, /Only a DRAFT Expense linked to an active VERIFIED supplier invoice/);
  assert.match(migration, /This supplier invoice has an active linked Expense; settle the linked Expense instead/);
  assert.match(migration, /v_effective := v_cash_paid/);
  assert.doesNotMatch(migration, /v_effective\s*:=\s*greatest\(v_document_paid/);
  assert.match(migration, /for update/gi);
  assert.match(migration, /m\.company_id = p_company_id/);
  assert.match(migration, /pg_catalog\.timezone/);
  assert.match(migration, /m\.target_type = 'INVOICE'/);
  assert.match(migration, /authorityConflict/);
});
