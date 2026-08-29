import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { FinancialTransaction } from "../src/lib/cashBanking.ts";
import {
  assertSettlementInput,
  confirmedSettlementTotal,
  defaultSettlementAllocation,
  deriveInvoiceSettlementSummary,
  derivePayrollSettlementSummary,
  eligibleSettlementCandidates,
  invoiceCashPayableBasis,
  payrollNetPayBasis,
  remainingTransactionAmount,
  type FinancialSettlementHistoryItem,
} from "../src/lib/financialSettlement.ts";
import { appPathForCashTransaction, appPathForInvoice, appPathForPayrollRun, financialTransactionIdFromSearch, payrollRunIdFromSearch } from "../src/utils/appRouting.ts";
import { calculateProjectCost, type CostPayrollRecord } from "../src/utils/projectCosting.ts";
import type { InvoiceProjectAllocation, PayrollEntry, PayrollProjectAllocation, PayrollRun, Project } from "../src/types.ts";

const REFERENCE_DATE = "2026-08-27";

function transaction(overrides: Partial<FinancialTransaction> = {}): FinancialTransaction {
  return {
    id: "tx-1", accountId: "account-1", transactionDate: "2026-08-27", description: "Supplier payment", direction: "DEBIT",
    amount: 100_000, currency: "PHP", status: "POSTED", source: "MANUAL", sourceFingerprint: "tx-1", reconciliationStatus: "UNMATCHED",
    createdAt: "2026-08-27T00:00:00.000Z", updatedAt: "2026-08-27T00:00:00.000Z", ...overrides,
  };
}

function confirmed(id: string, transactionId: string, amount: number): FinancialSettlementHistoryItem {
  return { id, transactionId, amount, status: "CONFIRMED", currency: "PHP" };
}

function reversed(id: string, transactionId: string, amount: number): FinancialSettlementHistoryItem {
  return { id, transactionId, amount, status: "REVERSED", currency: "PHP", reversalReason: "wrong target" };
}

test("invoice payable basis only trusts explicit net-payable semantics", () => {
  assert.deepEqual(invoiceCashPayableBasis({ grandTotal: 100_000 } as any), { amount: 100_000, source: "GROSS_DOCUMENT_AMOUNT" });
  assert.deepEqual(invoiceCashPayableBasis({ grandTotal: 100_000, netAmountPayable: 95_000 } as any), { amount: 95_000, source: "EXPLICIT_NET_PAYABLE" });
  assert.deepEqual(invoiceCashPayableBasis({ grandTotal: 100_000, philippineTaxDetails: { netAmountPayable: 40_000 } } as any), { amount: 100_000, source: "GROSS_DOCUMENT_AMOUNT" });
  assert.deepEqual(invoiceCashPayableBasis({ grandTotal: 100_000, philippineTaxDetails: { netAmountPayable: 95_000, withholdingTaxAmount: 5_000 } } as any), { amount: 95_000, source: "EXPLICIT_NET_PAYABLE" });
});

test("invoice settlement never blindly adds document paid and bank paid", () => {
  const invoice = { id: "inv", currency: "PHP", grandTotal: 100_000, amountPaid: 60_000, dueDate: "2026-09-01", reviewStatus: "VERIFIED" as const };
  const partial = deriveInvoiceSettlementSummary(invoice as any, [confirmed("m1", "tx-1", 40_000)], REFERENCE_DATE);
  assert.equal(partial.documentReportedPaid, 60_000);
  assert.equal(partial.reconciledCashPaid, 40_000);
  assert.equal(partial.effectiveSettled, 60_000);
  assert.equal(partial.outstanding, 40_000);
  assert.equal(partial.settlementState, "PARTIALLY_PAID");
  const paid = deriveInvoiceSettlementSummary(invoice as any, [confirmed("m1", "tx-1", 40_000), confirmed("m2", "tx-2", 60_000)], REFERENCE_DATE);
  assert.equal(paid.effectiveSettled, 100_000);
  assert.equal(paid.outstanding, 0);
  assert.equal(paid.settlementState, "PAID");
});

test("invoice reversal restores outstanding and overdue semantics", () => {
  const invoice = { id: "inv", currency: "PHP", grandTotal: 100_000, amountPaid: 0, dueDate: "2026-08-01", reviewStatus: "VERIFIED" as const };
  const summary = deriveInvoiceSettlementSummary(invoice as any, [confirmed("m1", "tx-1", 30_000), reversed("m2", "tx-2", 70_000)], REFERENCE_DATE);
  assert.equal(summary.reconciledCashPaid, 30_000);
  assert.equal(summary.outstanding, 70_000);
  assert.equal(summary.settlementState, "OVERDUE");
});

test("voided invoice settlement history remains readable but is not an active settlement candidate", () => {
  const invoice = { id: "void-inv", currency: "PHP", grandTotal: 100_000, amountPaid: 100_000, dueDate: "2026-08-01", reviewStatus: "VERIFIED" as const, lifecycleStatus: "VOID" as const };
  const summary = deriveInvoiceSettlementSummary(invoice as any, [confirmed("void-match", "tx-void", 100_000)], REFERENCE_DATE);
  assert.equal(summary.lifecycleStatus, "VOID");
  assert.equal(summary.effectiveSettled, 100_000);
  assert.deepEqual(eligibleSettlementCandidates(transaction(), [{ targetType: "INVOICE", targetId: invoice.id, label: "Voided", currency: "PHP", settlementBasis: 100_000, settledAmount: 100_000, outstandingAmount: 0, lifecycleStatus: summary.lifecycleStatus }]), []);
});

test("payroll settlement basis uses employee net pay, not gross or project cost", () => {
  const entries = [
    { netPay: 45_000, grossPay: 55_000, projectAllocatedCost: 55_000 },
    { netPay: 35_000, grossPay: 45_000, projectAllocatedCost: 45_000 },
  ] as PayrollEntry[];
  assert.equal(payrollNetPayBasis(entries), 80_000);
  const run: PayrollRun = { id: "run", periodId: "period", status: "APPROVED", createdAt: "2026-08-01" };
  const partial = derivePayrollSettlementSummary(run, entries, [confirmed("m1", "tx-1", 50_000)]);
  assert.equal(partial.settlementBasis, 80_000);
  assert.equal(partial.outstanding, 30_000);
  assert.equal(partial.settlementState, "PARTIALLY_DISBURSED");
  const full = derivePayrollSettlementSummary(run, entries, [confirmed("m1", "tx-1", 50_000), confirmed("m2", "tx-2", 30_000)]);
  assert.equal(full.settlementState, "SETTLED");
});

test("legacy manual PAID payroll history is preserved without a bank link", () => {
  const run: PayrollRun = { id: "run", periodId: "period", status: "PAID", createdAt: "2026-08-01", paidAt: "2026-08-15" };
  const summary = derivePayrollSettlementSummary(run, [{ netPay: 80_000 }], []);
  assert.equal(summary.settlementState, "UNSETTLED");
  assert.equal(summary.legacyPaidWithoutBankLink, true);
});

test("transaction allocation supports split and multiple-payment math without overage", () => {
  const tx = transaction({ amount: 100_000 });
  const history = [confirmed("a", tx.id, 60_000), confirmed("b", tx.id, 40_000), reversed("c", tx.id, 20_000)];
  assert.equal(confirmedSettlementTotal(history), 100_000);
  assert.equal(remainingTransactionAmount(tx, history), 0);
  assert.equal(defaultSettlementAllocation(40_000, 55_000), 40_000);
  assert.equal(defaultSettlementAllocation(70_000, 55_000), 55_000);
});

test("client settlement validation rejects wrong direction, lifecycle and currency before server confirmation", () => {
  assert.doesNotThrow(() => assertSettlementInput(transaction(), "PHP", 100));
  assert.throws(() => assertSettlementInput(transaction({ direction: "CREDIT" }), "PHP", 100), /DEBIT/);
  assert.throws(() => assertSettlementInput(transaction({ status: "PENDING" }), "PHP", 100), /POSTED/);
  assert.throws(() => assertSettlementInput(transaction({ status: "REVERSED" }), "PHP", 100), /POSTED/);
  assert.throws(() => assertSettlementInput(transaction({ currency: "USD" }), "PHP", 100), /currency/i);
  const candidates = [
    { targetType: "PAYROLL" as const, targetId: "draft", label: "Draft", currency: "PHP", settlementBasis: 100, settledAmount: 0, outstandingAmount: 100, lifecycleStatus: "DRAFT" },
    { targetType: "PAYROLL" as const, targetId: "approved", label: "Approved", currency: "PHP", settlementBasis: 100, settledAmount: 0, outstandingAmount: 100, lifecycleStatus: "APPROVED" },
    { targetType: "INVOICE" as const, targetId: "review", label: "Unverified invoice", currency: "PHP", settlementBasis: 100, settledAmount: 0, outstandingAmount: 100, lifecycleStatus: "NEEDS_REVIEW" },
    { targetType: "INVOICE" as const, targetId: "paid", label: "Paid invoice", currency: "PHP", settlementBasis: 100, settledAmount: 100, outstandingAmount: 0, lifecycleStatus: "VERIFIED" },
  ];
  assert.deepEqual(eligibleSettlementCandidates(transaction(), candidates).map((row) => row.targetId), ["approved"]);
});

test("bank settlement does not change verified invoice or approved payroll project cost", () => {
  const project: Project = { id: "project-a", projectCode: "A", projectName: "A", status: "ACTIVE", projectBudget: 500_000, currency: "PHP", createdAt: "2026-01-01", updatedAt: "2026-01-01" };
  const invoiceAllocation: InvoiceProjectAllocation = { id: "ia", invoiceId: "invoice-a", projectId: project.id, allocationType: "AMOUNT", allocationAmount: 100_000 };
  const invoice = { id: "invoice-a", currency: "PHP", grandTotal: 100_000, reviewStatus: "VERIFIED", status: "UNPAID", amountPaid: 0, allocations: [invoiceAllocation] } as any;
  const payrollEntry = { id: "pe", payrollRunId: "run", workerId: "w", grossPay: 50_000, netPay: 45_000, projectAllocatedCost: 50_000, costContext: { type: "PROJECT", needsReview: false } } as PayrollEntry;
  const payrollAllocation: PayrollProjectAllocation = { id: "pa", payrollEntryId: payrollEntry.id, projectId: project.id, allocationAmount: 50_000, source: "MANUAL" };
  const payroll: CostPayrollRecord = { id: "run", status: "APPROVED", currency: "PHP", entries: [payrollEntry], allocations: [payrollAllocation] };
  const before = calculateProjectCost(project, { invoices: [invoice], payroll: [payroll], expenses: [] });
  deriveInvoiceSettlementSummary({ ...invoice, dueDate: "2026-09-01" }, [confirmed("im", "bank-invoice", 100_000)], REFERENCE_DATE);
  derivePayrollSettlementSummary({ id: "run", status: "APPROVED" } as PayrollRun, [payrollEntry], [confirmed("pm", "bank-payroll", 45_000)]);
  const after = calculateProjectCost(project, { invoices: [invoice], payroll: [payroll], expenses: [] });
  assert.equal(before.totalActualCost, 150_000);
  assert.equal(after.totalActualCost, 150_000);
  assert.equal(after.invoiceCost, 100_000);
  assert.equal(after.payrollCost, 50_000);
  assert.deepEqual(invoice.allocations, [invoiceAllocation]);
  assert.deepEqual(payroll.allocations, [payrollAllocation]);
});

test("financial settlement deep links use canonical routes and parse stable query context", () => {
  assert.equal(appPathForInvoice("inv 123"), "/invoices/inv%20123");
  const cashPath = appPathForCashTransaction("tx 1", "INVOICE", "inv 123");
  assert.match(cashPath, /^\/cash\?/);
  assert.equal(financialTransactionIdFromSearch(cashPath.split("?")[1] || ""), "tx 1");
  const payrollPath = appPathForPayrollRun("run 9");
  assert.match(payrollPath, /^\/payroll\?/);
  assert.equal(payrollRunIdFromSearch(payrollPath.split("?")[1] || ""), "run 9");
});

test("settlement migration is additive, guarded, auditable and not a costing source", () => {
  const migration = readFileSync("supabase/migrations/20260827210000_financial_settlement_integration.sql", "utf8");
  const hardening = readFileSync("supabase/migrations/20260827211000_financial_settlement_payable_basis_hardening.sql", "utf8");
  const summaryHardening = readFileSync("supabase/migrations/20260827212000_financial_settlement_summary_hardening.sql", "utf8");
  assert.match(migration, /create or replace function public\.confirm_financial_settlement/);
  assert.match(migration, /create or replace function public\.reverse_financial_settlement/);
  assert.match(migration, /security definer[\s\S]*set search_path = ''/i);
  assert.match(migration, /auth\.uid\(\)/);
  assert.match(migration, /private\.has_company_permission\(p_company_id, 'cash\.reconcile'\)/);
  assert.match(migration, /private\.has_company_permission\(p_company_id, 'invoices\.manage'\)/);
  assert.match(migration, /private\.has_company_permission\(p_company_id, 'payroll\.approve'\)/);
  assert.match(migration, /v_transaction\.direction <> 'DEBIT'/);
  assert.match(migration, /v_transaction\.status <> 'POSTED'/);
  assert.match(migration, /Settlement currency mismatch/);
  assert.match(migration, /for update/gi);
  assert.match(migration, /CASH_SETTLEMENT_CONFIRMED/);
  assert.match(migration, /CASH_SETTLEMENT_REVERSED/);
  assert.match(migration, /revoke insert, update, delete on table public\.financial_transaction_matches from authenticated/);
  assert.match(migration, /revoke all on function public\.confirm_financial_settlement[^;]+from public, anon/);
  assert.match(hardening, /withholdingTaxAmount/);
  assert.match(summaryHardening, /greatest\(v_document_paid,v_cash_paid\)/);
  assert.doesNotMatch(migration, /project_cost|project_actual|totalActualCost/i);
});
