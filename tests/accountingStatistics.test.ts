import test from "node:test";
import assert from "node:assert/strict";
import {
  aggregateComposition,
  aggregateCompanyStatistics,
  aggregateProjectAccounting,
  activityTrends,
  agingPayables,
  buildAccountingIndex,
  companyComposition,
  reconcileCompany,
  sourceDate,
} from "../src/utils/dashboardStats.ts";
import {
  aggregateProjectCosts,
  aggregateProjectCostsByCurrency,
  calculateProjectCost,
  MixedCurrencyError,
  projectHealth,
  type CostInvoice,
  type CostPayrollRecord,
  type ProjectCostInput,
} from "../src/utils/projectCosting.ts";
import type {
  InvoiceProjectAllocation,
  PayrollLaborContext,
  PayrollProjectAllocation,
  Project,
} from "../src/types.ts";

const project = (id: string, currency = "PHP", budget = 10_000): Project => ({
  id,
  projectCode: id.toUpperCase(),
  projectName: id,
  clientName: "Client",
  status: "ACTIVE",
  projectBudget: budget,
  currency,
  createdAt: "2026-01-01",
  updatedAt: "2026-01-01",
});

const invoiceAllocation = (id: string, projectId: string, amount: number): InvoiceProjectAllocation => ({
  id,
  invoiceId: "invoice-1",
  projectId,
  allocationType: "AMOUNT",
  allocationAmount: amount,
});

const invoice = (overrides: Partial<CostInvoice> = {}): CostInvoice => ({
  id: "invoice-1",
  grandTotal: 1_000,
  currency: "PHP",
  reviewStatus: "VERIFIED",
  status: "UNPAID",
  amountPaid: 0,
  allocations: [invoiceAllocation("allocation-1", "project-a", 600)],
  ...overrides,
});

const payrollAllocation = (id: string, entryId: string, projectId: string, amount: number): PayrollProjectAllocation => ({
  id,
  payrollEntryId: entryId,
  projectId,
  allocationAmount: amount,
  source: "MANUAL",
});

const context = (type: PayrollLaborContext["type"]): PayrollLaborContext => ({
  type,
  needsReview: false,
});

test("verified invoice allocations are actual independent of payment, with payable separate", () => {
  const input: ProjectCostInput = { invoices: [invoice()] };
  const summary = calculateProjectCost(project("project-a"), input);
  const unallocated = calculateProjectCost(undefined, { ...input, baseCurrency: "PHP" });

  assert.equal(summary.invoiceCost, 600);
  assert.equal(summary.paidInvoiceCost, 0);
  assert.equal(summary.unpaidInvoiceCost, 600);
  assert.equal(summary.payableCost, 600);
  assert.equal(summary.pendingInvoiceCost, 0);
  assert.equal(summary.totalActualCost, 600);
  assert.equal(unallocated.unallocatedInvoiceCost, 400);
  assert.equal(unallocated.unallocatedInvoicePayable, 400);
});

test("only unverified invoice allocations are pending and their residual stays unallocated", () => {
  const summary = calculateProjectCost(project("project-a"), {
    invoices: [invoice({ reviewStatus: "NEEDS_REVIEW", amountPaid: 1_000 })],
  });
  const unallocated = calculateProjectCost(undefined, {
    invoices: [invoice({ reviewStatus: "NEEDS_REVIEW", amountPaid: 1_000 })],
    baseCurrency: "PHP",
  });

  assert.equal(summary.invoiceCost, 0);
  assert.equal(summary.pendingInvoiceCost, 600);
  assert.equal(summary.totalActualCost, 0);
  assert.equal(unallocated.unallocatedInvoiceCost, 0);
  assert.equal(unallocated.unallocatedPendingInvoiceCost, 400);
});

test("payroll status, residual, void, and overhead semantics are shared", () => {
  const payroll: CostPayrollRecord[] = [
    {
      id: "approved",
      status: "APPROVED",
      entries: [{ id: "approved-entry", grossPay: 1_000, projectAllocatedCost: 1_000 }],
      allocations: [payrollAllocation("approved-allocation", "approved-entry", "project-a", 600)],
    },
    {
      id: "draft",
      status: "DRAFT",
      entries: [{ id: "draft-entry", grossPay: 300, projectAllocatedCost: 300 }],
      allocations: [payrollAllocation("draft-allocation", "draft-entry", "project-a", 100)],
    },
    {
      id: "calculated",
      status: "CALCULATED",
      entries: [{ id: "calculated-entry", grossPay: 300, projectAllocatedCost: 300 }],
      allocations: [],
    },
    {
      id: "void",
      status: "VOID",
      entries: [{ id: "void-entry", grossPay: 9_000, projectAllocatedCost: 9_000 }],
      allocations: [payrollAllocation("void-allocation", "void-entry", "project-a", 9_000)],
    },
    {
      id: "overhead",
      status: "APPROVED",
      entries: [{ id: "overhead-entry", grossPay: 200, projectAllocatedCost: 200, costContext: context("ADMIN_OFFICE") }],
      allocations: [],
    },
  ];

  const projectSummary = calculateProjectCost(project("project-a"), { payroll });
  const unallocated = calculateProjectCost(undefined, { payroll, baseCurrency: "PHP" });

  assert.equal(projectSummary.payrollCost, 600);
  assert.equal(projectSummary.pendingPayrollCost, 100);
  assert.equal(projectSummary.overheadCost, 0);
  assert.equal(unallocated.unallocatedPayrollCost, 400);
  assert.equal(unallocated.unallocatedPendingPayrollCost, 500);
  assert.equal(unallocated.overheadCost, 200);
  assert.equal(unallocated.pendingOverheadCost, 0);
});

test("accounting index is project-indexed without duplicate source records", () => {
  const indexed = buildAccountingIndex({
    projects: [project("project-a")],
    invoices: [invoice({
      allocations: [
        invoiceAllocation("allocation-1", "project-a", 300),
        invoiceAllocation("allocation-2", "project-a", 200),
      ],
    })],
    payroll: [{
      id: "run-1",
      status: "APPROVED",
      entries: [{ id: "entry-1", grossPay: 500, projectAllocatedCost: 500 }],
      allocations: [
        payrollAllocation("payroll-1", "entry-1", "project-a", 250),
        payrollAllocation("payroll-2", "entry-1", "project-a", 250),
      ],
    }],
  });

  assert.equal(indexed.invoicesByProjectId.get("project-a")?.length, 1);
  assert.equal(indexed.expensesByProjectId.get("project-a")?.length || 0, 0);
  assert.equal(indexed.payrollByProjectId.get("project-a")?.length, 1);
  assert.equal(indexed.invoiceAllocationsByProjectId.get("project-a")?.length, 2);
  assert.equal(indexed.payrollAllocationsByProjectId.get("project-a")?.length, 2);
});

test("currency aggregation never combines project currencies", () => {
  const phpSummary = calculateProjectCost(project("php", "PHP"), {
    invoices: [invoice({ allocations: [invoiceAllocation("php-allocation", "php", 100)] })],
  });
  const usdSummary = calculateProjectCost(project("usd", "USD"), {
    invoices: [invoice({ id: "usd-invoice", currency: "USD", allocations: [invoiceAllocation("usd-allocation", "usd", 200)] })],
  });

  assert.throws(() => aggregateProjectCosts([phpSummary, usdSummary]), MixedCurrencyError);
  const byCurrency = aggregateProjectCostsByCurrency([phpSummary, usdSummary]);
  assert.equal(byCurrency.PHP.invoiceCost, 100);
  assert.equal(byCurrency.USD.invoiceCost, 200);
  assert.equal(aggregateProjectAccounting([project("php", "PHP"), project("usd", "USD")], {
    invoices: [
      invoice({ allocations: [invoiceAllocation("php-allocation", "php", 100)] }),
      invoice({ id: "usd-invoice", currency: "USD", allocations: [invoiceAllocation("usd-allocation", "usd", 200)] }),
    ],
  }).byCurrency.USD.actual, 200);
  assert.throws(() => aggregateComposition([phpSummary, usdSummary]), MixedCurrencyError);
});

test("source dates, 90 percent health, composition, and reconciliation are canonical", () => {
  assert.equal(sourceDate({ invoiceDate: "2026-08-02T09:00:00Z" }), "2026-08-02");
  assert.equal(sourceDate({ expenseDate: "2026-08-03" }), "2026-08-03");
  assert.equal(sourceDate({ periodEnd: "2026-08-04" }), "2026-08-04");
  assert.equal(projectHealth({ budget: 100, budgetUsedPercent: 90, remainingBudget: 10 }), "NEAR LIMIT");

  const input = {
    projects: [project("project-a", "PHP", 10_000)],
    invoices: [invoice({ invoiceDate: "2026-08-04", dueDate: "2026-08-04" })],
    payroll: [{
      id: "overhead-run",
      status: "APPROVED",
      periodEnd: "2026-08-04",
      entries: [{ id: "overhead-entry", grossPay: 200, projectAllocatedCost: 200, costContext: context("GENERAL_OVERHEAD") }],
      allocations: [],
    }],
  } satisfies Parameters<typeof reconcileCompany>[0];

  const composition = companyComposition(input);
  const reconciliation = reconcileCompany(input);
  assert.deepEqual(composition, { invoices: 600, labor: 0, expenses: 0, overhead: 200, unallocated: 400, currency: "PHP" });
  assert.equal(reconciliation.total, 1_200);
  assert.equal(reconciliation.totalPayable, 1_000);
  assert.equal(reconciliation.projectActual, 600);
  assert.equal(reconciliation.unallocatedInvoices, 400);
  assert.equal(reconciliation.overhead, 200);
  assert.equal(aggregateCompanyStatistics(input).byCurrency.PHP.actual, 1_200);
});

test("activity trends and payable aging use source dates and omit unverified payables", () => {
  const input = {
    invoices: [
      invoice({ id: "current", invoiceDate: "2026-08-24", dueDate: "2026-08-24", amountPaid: 995, allocations: [invoiceAllocation("current-allocation", "project-a", 100)] }),
      invoice({ id: "thirty", invoiceDate: "2026-08-14", dueDate: "2026-08-14", amountPaid: 0, allocations: [invoiceAllocation("thirty-allocation", "project-a", 100)] }),
      invoice({ id: "sixty", invoiceDate: "2026-07-10", dueDate: "2026-07-10", amountPaid: 0, allocations: [invoiceAllocation("sixty-allocation", "project-a", 100)] }),
      invoice({ id: "old", invoiceDate: "2026-05-16", dueDate: "2026-05-16", amountPaid: 0, allocations: [invoiceAllocation("old-allocation", "project-a", 100)] }),
      invoice({ id: "pending", invoiceDate: "2026-08-20", dueDate: "2026-08-20", reviewStatus: "NEEDS_REVIEW", allocations: [invoiceAllocation("pending-allocation", "project-a", 20)] }),
    ],
    expenses: [{
      id: "expense-1",
      projectId: "project-a",
      expenseDate: "2026-08-24",
      category: "Fuel",
      description: "Fuel",
      amount: 10,
      currency: "PHP",
      status: "APPROVED",
      createdAt: "2026-08-24",
      updatedAt: "2026-08-24",
    }],
    payroll: [{
      id: "payroll-1",
      status: "APPROVED",
      periodEnd: "2026-08-24",
      entries: [{ id: "entry-1", grossPay: 100, projectAllocatedCost: 100 }],
      allocations: [payrollAllocation("payroll-allocation", "entry-1", "project-a", 100)],
    }],
  } satisfies Parameters<typeof activityTrends>[0];

  const trends = activityTrends(input, { currency: "PHP", grain: "month" });
  const august = trends.find((point) => point.period === "2026-08");
  assert.ok(august);
  assert.equal(august.actual, 310);
  assert.equal(august.invoices, 200);
  assert.equal(august.expenses, 10);
  assert.equal(august.labor, 100);
  assert.equal(august.pending, 20);
  assert.equal(august.committed, 0);

  const aging = agingPayables(input.invoices, "2026-08-24", "PHP");
  assert.equal(aging.current, 5);
  assert.equal(aging.days1To30, 1000);
  assert.equal(aging.days31To60, 1000);
  assert.equal(aging.over90, 1000);
});
