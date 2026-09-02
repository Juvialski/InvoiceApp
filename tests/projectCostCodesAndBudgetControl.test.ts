import test from "node:test";
import assert from "node:assert/strict";
import type {
  Expense,
  Project,
  ProjectCostCode,
} from "../src/types.ts";
import {
  calculateProjectBudgetControl,
  calculateProjectCost,
  type CostInvoice,
  type CostPayrollRecord,
} from "../src/utils/projectCosting.ts";
import {
  createLocalProjectCostCode,
  formatCostCodeOptionLabel,
  getSelectableCostCodes,
  validateProjectCostCodeInput,
} from "../src/lib/projectCostCodes.ts";
import {
  normalizeInvoiceProjectAllocations,
  toInvoiceProjectAllocationPersistenceRows,
  validateInvoiceProjectAllocationSet,
} from "../src/utils/projectAllocations.ts";

function createMockProject(overrides: Partial<Project> = {}): Project {
  return {
    id: "proj-1",
    projectCode: "PRJ-001",
    projectName: "Water Treatment Plant",
    projectBudget: 1000000,
    contractValue: 1500000,
    currency: "PHP",
    status: "ACTIVE",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function createMockCostCodes(projectId = "proj-1"): ProjectCostCode[] {
  return [
    {
      id: "cc-civil",
      projectId,
      code: "CIVIL",
      name: "Civil & Earthworks",
      status: "ACTIVE",
      approvedBudgetAmount: 400000,
      forecastAmount: 420000,
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    },
    {
      id: "cc-mech",
      projectId,
      code: "MECH",
      name: "Mechanical Equipment",
      status: "ACTIVE",
      approvedBudgetAmount: 300000,
      forecastAmount: undefined,
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    },
    {
      id: "cc-archived",
      projectId,
      code: "OLD-ELEC",
      name: "Legacy Electrical Package",
      status: "ARCHIVED",
      approvedBudgetAmount: 100000,
      forecastAmount: 95000,
      archivedAt: "2026-02-01T00:00:00Z",
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-02-01T00:00:00Z",
    },
  ];
}

test("1. create cost code: normalizes code to uppercase, validates required fields and sets defaults", () => {
  const local = createLocalProjectCostCode({
    projectId: "proj-1",
    code: " piping ",
    name: "Piping & Valves",
    approvedBudgetAmount: 150000,
  });

  assert.equal(local.code, "PIPING");
  assert.equal(local.name, "Piping & Valves");
  assert.equal(local.approvedBudgetAmount, 150000);
  assert.equal(local.status, "ACTIVE");
  assert.equal(local.forecastAmount, undefined);
  assert.ok(typeof local.id === "string" && local.id.length > 0);
});

test("2. edit cost code: validation passes when valid modifications are made", () => {
  const costCodes = createMockCostCodes("proj-1");
  const result = validateProjectCostCodeInput(
    {
      id: "cc-civil",
      projectId: "proj-1",
      code: "CIVIL-REV",
      name: "Civil Works Revised",
      approvedBudgetAmount: 450000,
      forecastAmount: 480000,
      status: "ACTIVE",
    },
    costCodes,
    1000000,
  );

  assert.equal(result.valid, true);
  assert.equal(result.issues.length, 0);
});

test("3. archive and reactivate: status lifecycle and validation behavior", () => {
  const costCodes = createMockCostCodes("proj-1");
  // Archived code budget is excluded from active budget limit check
  const activeBudget = costCodes
    .filter((c) => c.status === "ACTIVE")
    .reduce((sum, c) => sum + c.approvedBudgetAmount, 0);
  assert.equal(activeBudget, 700000); // 400k (civil) + 300k (mech); archived 100k excluded

  // Validation allows archiving
  const archiveResult = validateProjectCostCodeInput(
    {
      id: "cc-mech",
      projectId: "proj-1",
      code: "MECH",
      name: "Mechanical Equipment",
      approvedBudgetAmount: 300000,
      status: "ARCHIVED",
    },
    costCodes,
    1000000,
  );
  assert.equal(archiveResult.valid, true);
});

test("4. unique code per project: duplicate code within same project is rejected", () => {
  const costCodes = createMockCostCodes("proj-1");
  const result = validateProjectCostCodeInput(
    {
      projectId: "proj-1",
      code: "civil", // case-insensitive match to CIVIL
      name: "Another Civil Package",
      approvedBudgetAmount: 50000,
    },
    costCodes,
    1000000,
  );

  assert.equal(result.valid, false);
  assert.match(result.issues[0], /already exists for this project/i);
});

test("5. same code permitted across different projects", () => {
  const costCodesProj1 = createMockCostCodes("proj-1");
  const result = validateProjectCostCodeInput(
    {
      projectId: "proj-2", // Different project
      code: "CIVIL",
      name: "Civil Works for Project 2",
      approvedBudgetAmount: 200000,
    },
    costCodesProj1,
    500000,
  );

  assert.equal(result.valid, true);
});

test("6. allocated budget limit: active cost-code budgets cannot exceed project budget", () => {
  const costCodes = createMockCostCodes("proj-1"); // active total is 700,000 (CIVIL 400k + MECH 300k)
  const result = validateProjectCostCodeInput(
    {
      projectId: "proj-1",
      code: "ELEC",
      name: "Electrical Systems",
      approvedBudgetAmount: 350000, // 700k + 350k = 1,050,000 > 1,000,000 project budget
      status: "ACTIVE",
    },
    costCodes,
    1000000,
  );

  assert.equal(result.valid, false);
  assert.match(result.issues[0], /would exceed the project approved budget/i);
});

test("7. unallocated project budget: calculated correctly as project budget minus active allocated budgets", () => {
  const project = createMockProject({ projectBudget: 1000000 });
  const costCodes = createMockCostCodes("proj-1"); // active: 400k + 300k = 700k; archived 100k
  const summary = calculateProjectBudgetControl(project, costCodes, {});

  assert.equal(summary.projectBudget, 1000000);
  assert.equal(summary.allocatedCostCodeBudget, 700000);
  assert.equal(summary.unallocatedBudget, 300000);
});

test("8. invoice actual by code: confirmed invoice allocations are classified to the correct cost code", () => {
  const project = createMockProject();
  const costCodes = createMockCostCodes("proj-1");
  const invoices: CostInvoice[] = [
    {
      id: "inv-1",
      grandTotal: 100000,
      currency: "PHP",
      reviewStatus: "VERIFIED",
      status: "UNPAID",
      allocations: [
        {
          id: "alloc-1",
          invoiceId: "inv-1",
          projectId: "proj-1",
          projectCostCodeId: "cc-civil",
          allocationType: "AMOUNT",
          allocationAmount: 60000,
        },
        {
          id: "alloc-2",
          invoiceId: "inv-1",
          projectId: "proj-1",
          projectCostCodeId: "cc-mech",
          allocationType: "AMOUNT",
          allocationAmount: 40000,
        },
      ],
    },
  ];

  const summary = calculateProjectBudgetControl(project, costCodes, { invoices });
  const civil = summary.costCodes.find((c) => c.costCodeId === "cc-civil");
  const mech = summary.costCodes.find((c) => c.costCodeId === "cc-mech");

  assert.equal(civil?.actualCost, 60000);
  assert.equal(civil?.invoiceCost, 60000);
  assert.equal(mech?.actualCost, 40000);
  assert.equal(mech?.invoiceCost, 40000);
  assert.equal(summary.codedActualCost, 100000);
  assert.equal(summary.uncodedActualCost, 0);
  assert.equal(summary.totalActualCost, 100000);
});

test("9. payroll actual by code: approved payroll allocations are classified to the correct cost code", () => {
  const project = createMockProject();
  const costCodes = createMockCostCodes("proj-1");
  const payroll: CostPayrollRecord[] = [
    {
      id: "pr-1",
      status: "APPROVED",
      currency: "PHP",
      entries: [
        { id: "pe-1", grossPay: 50000, projectAllocatedCost: 50000 },
        { id: "pe-2", grossPay: 30000, projectAllocatedCost: 30000 },
      ],
      allocations: [
        {
          id: "pa-1",
          payrollEntryId: "pe-1",
          projectId: "proj-1",
          projectCostCodeId: "cc-civil",
          allocationAmount: 50000,
          source: "MANUAL",
        },
        {
          id: "pa-2",
          payrollEntryId: "pe-2",
          projectId: "proj-1",
          projectCostCodeId: "cc-mech",
          allocationAmount: 30000,
          source: "MANUAL",
        },
      ],
    },
  ];

  const summary = calculateProjectBudgetControl(project, costCodes, { payroll });
  const civil = summary.costCodes.find((c) => c.costCodeId === "cc-civil");
  const mech = summary.costCodes.find((c) => c.costCodeId === "cc-mech");

  assert.equal(civil?.payrollCost, 50000);
  assert.equal(civil?.actualCost, 50000);
  assert.equal(mech?.payrollCost, 30000);
  assert.equal(mech?.actualCost, 30000);
  assert.equal(summary.codedActualCost, 80000);
  assert.equal(summary.totalActualCost, 80000);
});

test("10. expense actual by code: approved direct expenses are classified to the correct cost code", () => {
  const project = createMockProject();
  const costCodes = createMockCostCodes("proj-1");
  const expenses: Expense[] = [
    {
      id: "exp-1",
      projectId: "proj-1",
      projectCostCodeId: "cc-civil",
      expenseDate: "2026-02-15",
      category: "Fuel",
      description: "Excavator diesel fuel",
      amount: 25000,
      currency: "PHP",
      status: "APPROVED",
      createdAt: "2026-02-15T00:00:00Z",
      updatedAt: "2026-02-15T00:00:00Z",
    },
    {
      id: "exp-2",
      projectId: "proj-1",
      projectCostCodeId: "cc-mech",
      expenseDate: "2026-02-16",
      category: "Equipment",
      description: "Hydraulic pump rental",
      amount: 15000,
      currency: "PHP",
      status: "PAID",
      createdAt: "2026-02-16T00:00:00Z",
      updatedAt: "2026-02-16T00:00:00Z",
    },
  ];

  const summary = calculateProjectBudgetControl(project, costCodes, { expenses });
  const civil = summary.costCodes.find((c) => c.costCodeId === "cc-civil");
  const mech = summary.costCodes.find((c) => c.costCodeId === "cc-mech");

  assert.equal(civil?.otherExpenseCost, 25000);
  assert.equal(civil?.actualCost, 25000);
  assert.equal(mech?.otherExpenseCost, 15000);
  assert.equal(mech?.actualCost, 15000);
  assert.equal(summary.codedActualCost, 40000);
  assert.equal(summary.totalActualCost, 40000);
});

test("11. uncoded actual: authoritative project costs without cost code are reported as uncoded", () => {
  const project = createMockProject();
  const costCodes = createMockCostCodes("proj-1");
  const invoices: CostInvoice[] = [
    {
      id: "inv-uncoded",
      grandTotal: 50000,
      currency: "PHP",
      reviewStatus: "VERIFIED",
      status: "PAID",
      allocations: [
        {
          id: "alloc-uncoded",
          invoiceId: "inv-uncoded",
          projectId: "proj-1",
          // No cost code ID
          allocationType: "AMOUNT",
          allocationAmount: 50000,
        },
      ],
    },
  ];
  const expenses: Expense[] = [
    {
      id: "exp-uncoded",
      projectId: "proj-1",
      // No cost code ID
      expenseDate: "2026-02-20",
      category: "Permits",
      description: "Environmental compliance certificate",
      amount: 12000,
      currency: "PHP",
      status: "APPROVED",
      createdAt: "2026-02-20T00:00:00Z",
      updatedAt: "2026-02-20T00:00:00Z",
    },
  ];

  const summary = calculateProjectBudgetControl(project, costCodes, { invoices, expenses });

  assert.equal(summary.codedActualCost, 0);
  assert.equal(summary.uncodedActualCost, 62000);
  assert.equal(summary.uncodedSummary.invoiceCost, 50000);
  assert.equal(summary.uncodedSummary.otherExpenseCost, 12000);
  assert.equal(summary.totalActualCost, 62000);
});

test("12. reconciliation invariant: codedActual + uncodedActual === P1A totalActualCost", () => {
  const project = createMockProject();
  const costCodes = createMockCostCodes("proj-1");
  const invoices: CostInvoice[] = [
    {
      id: "inv-1",
      grandTotal: 100000,
      currency: "PHP",
      reviewStatus: "VERIFIED",
      allocations: [
        {
          id: "alloc-1",
          invoiceId: "inv-1",
          projectId: "proj-1",
          projectCostCodeId: "cc-civil",
          allocationType: "AMOUNT",
          allocationAmount: 70000,
        },
        {
          id: "alloc-2",
          invoiceId: "inv-1",
          projectId: "proj-1",
          // Uncoded 30k
          allocationType: "AMOUNT",
          allocationAmount: 30000,
        },
      ],
    },
  ];
  const expenses: Expense[] = [
    {
      id: "exp-1",
      projectId: "proj-1",
      projectCostCodeId: "cc-mech",
      expenseDate: "2026-02-01",
      category: "Equipment",
      description: "Generator rental",
      amount: 45000,
      currency: "PHP",
      status: "APPROVED",
      createdAt: "2026-02-01T00:00:00Z",
      updatedAt: "2026-02-01T00:00:00Z",
    },
    {
      id: "exp-2",
      projectId: "proj-1",
      // Uncoded expense 15k
      expenseDate: "2026-02-02",
      category: "Meals",
      description: "Site staff overtime meals",
      amount: 15000,
      currency: "PHP",
      status: "PAID",
      createdAt: "2026-02-02T00:00:00Z",
      updatedAt: "2026-02-02T00:00:00Z",
    },
  ];

  const p1a = calculateProjectCost(project, { invoices, expenses });
  const p1b = calculateProjectBudgetControl(project, costCodes, { invoices, expenses });

  assert.equal(p1b.totalActualCost, p1a.totalActualCost);
  assert.equal(p1b.codedActualCost + p1b.uncodedActualCost, p1a.totalActualCost);
  assert.equal(p1b.codedActualCost, 115000); // 70k civil + 45k mech
  assert.equal(p1b.uncodedActualCost, 45000); // 30k invoice + 15k expense
  assert.equal(p1b.totalActualCost, 160000);
});

test("13. pending and unverified sources excluded from actual cost and assigned to pendingCost", () => {
  const project = createMockProject();
  const costCodes = createMockCostCodes("proj-1");
  const invoices: CostInvoice[] = [
    {
      id: "inv-pending",
      grandTotal: 80000,
      currency: "PHP",
      reviewStatus: "NEEDS_REVIEW", // Unverified
      allocations: [
        {
          id: "alloc-p1",
          invoiceId: "inv-pending",
          projectId: "proj-1",
          projectCostCodeId: "cc-civil",
          allocationType: "AMOUNT",
          allocationAmount: 80000,
        },
      ],
    },
  ];
  const expenses: Expense[] = [
    {
      id: "exp-draft",
      projectId: "proj-1",
      projectCostCodeId: "cc-mech",
      expenseDate: "2026-02-10",
      category: "Materials",
      description: "Cement draft",
      amount: 30000,
      currency: "PHP",
      status: "DRAFT", // Draft expense
      createdAt: "2026-02-10T00:00:00Z",
      updatedAt: "2026-02-10T00:00:00Z",
    },
  ];

  const summary = calculateProjectBudgetControl(project, costCodes, { invoices, expenses });
  const civil = summary.costCodes.find((c) => c.costCodeId === "cc-civil");
  const mech = summary.costCodes.find((c) => c.costCodeId === "cc-mech");

  assert.equal(civil?.actualCost, 0);
  assert.equal(civil?.pendingCost, 80000);
  assert.equal(mech?.actualCost, 0);
  assert.equal(mech?.pendingCost, 30000);
  assert.equal(summary.totalActualCost, 0);
  assert.equal(summary.totalPendingCost, 110000);
  assert.equal(summary.codedPendingCost, 110000);
});

test("14. VOID sources excluded completely from both actual and pending costs", () => {
  const project = createMockProject();
  const costCodes = createMockCostCodes("proj-1");
  const invoices: CostInvoice[] = [
    {
      id: "inv-void",
      grandTotal: 100000,
      currency: "PHP",
      reviewStatus: "VERIFIED",
      lifecycleStatus: "VOID", // Voided invoice
      allocations: [
        {
          id: "alloc-v",
          invoiceId: "inv-void",
          projectId: "proj-1",
          projectCostCodeId: "cc-civil",
          allocationType: "AMOUNT",
          allocationAmount: 100000,
        },
      ],
    },
  ];
  const expenses: Expense[] = [
    {
      id: "exp-void",
      projectId: "proj-1",
      projectCostCodeId: "cc-civil",
      expenseDate: "2026-02-10",
      category: "Materials",
      description: "Voided gravel order",
      amount: 50000,
      currency: "PHP",
      status: "VOID", // Voided expense
      createdAt: "2026-02-10T00:00:00Z",
      updatedAt: "2026-02-10T00:00:00Z",
    },
  ];

  const summary = calculateProjectBudgetControl(project, costCodes, { invoices, expenses });
  const civil = summary.costCodes.find((c) => c.costCodeId === "cc-civil");

  assert.equal(civil?.actualCost, 0);
  assert.equal(civil?.pendingCost, 0);
  assert.equal(summary.totalActualCost, 0);
  assert.equal(summary.totalPendingCost, 0);
});

test("15. P1A provenance deduplication preserved in cost-code aggregation", () => {
  const project = createMockProject();
  const costCodes = createMockCostCodes("proj-1");
  const sharedSourceId = "source-doc-receipt-123";

  const invoices: CostInvoice[] = [
    {
      id: "inv-dedupe",
      grandTotal: 50000,
      currency: "PHP",
      reviewStatus: "VERIFIED",
      sourceDocumentId: sharedSourceId,
      allocations: [
        {
          id: "alloc-d",
          invoiceId: "inv-dedupe",
          projectId: "proj-1",
          projectCostCodeId: "cc-civil",
          allocationType: "AMOUNT",
          allocationAmount: 50000,
        },
      ],
    },
  ];
  const expenses: Expense[] = [
    {
      id: "exp-dedupe",
      projectId: "proj-1",
      projectCostCodeId: "cc-civil",
      expenseDate: "2026-02-10",
      category: "Materials",
      description: "Direct expense representation of same receipt",
      amount: 50000,
      currency: "PHP",
      status: "APPROVED",
      receiptSourceDocumentId: sharedSourceId, // Same receipt
      createdAt: "2026-02-10T00:00:00Z",
      updatedAt: "2026-02-10T00:00:00Z",
    },
  ];

  const summary = calculateProjectBudgetControl(project, costCodes, { invoices, expenses });
  const civil = summary.costCodes.find((c) => c.costCodeId === "cc-civil");

  // Should count only ONCE (50,000), not twice (100,000)
  assert.equal(civil?.actualCost, 50000);
  assert.equal(civil?.invoiceCost, 50000);
  assert.equal(civil?.otherExpenseCost, 0); // Expense excluded by dedupe
  assert.equal(summary.totalActualCost, 50000);
});

test("16. mixed currency stays in foreignCosts and flags hasForeignAmounts", () => {
  const project = createMockProject({ currency: "PHP" });
  const costCodes = createMockCostCodes("proj-1");
  const invoices: CostInvoice[] = [
    {
      id: "inv-usd",
      grandTotal: 2000,
      currency: "USD",
      reviewStatus: "VERIFIED",
      allocations: [
        {
          id: "alloc-usd",
          invoiceId: "inv-usd",
          projectId: "proj-1",
          projectCostCodeId: "cc-mech",
          allocationType: "AMOUNT",
          allocationAmount: 2000,
        },
      ],
    },
    {
      id: "inv-php",
      grandTotal: 100000,
      currency: "PHP",
      reviewStatus: "VERIFIED",
      allocations: [
        {
          id: "alloc-php",
          invoiceId: "inv-php",
          projectId: "proj-1",
          projectCostCodeId: "cc-mech",
          allocationType: "AMOUNT",
          allocationAmount: 100000,
        },
      ],
    },
  ];

  const summary = calculateProjectBudgetControl(project, costCodes, { invoices });
  const mech = summary.costCodes.find((c) => c.costCodeId === "cc-mech");

  assert.equal(mech?.actualCost, 100000); // Only PHP actual
  assert.equal(mech?.foreignCosts.USD, 2000); // USD kept separate
  assert.equal(mech?.hasForeignAmounts, true);
  assert.equal(summary.hasForeignAmounts, true);
  assert.equal(summary.foreignCosts.USD, 2000);
});

test("17. archived cost code preserves historical actual costs", () => {
  const project = createMockProject();
  const costCodes = createMockCostCodes("proj-1");
  const invoices: CostInvoice[] = [
    {
      id: "inv-archived-code",
      grandTotal: 75000,
      currency: "PHP",
      reviewStatus: "VERIFIED",
      allocations: [
        {
          id: "alloc-arch",
          invoiceId: "inv-archived-code",
          projectId: "proj-1",
          projectCostCodeId: "cc-archived", // Historical allocation to archived code
          allocationType: "AMOUNT",
          allocationAmount: 75000,
        },
      ],
    },
  ];

  const summary = calculateProjectBudgetControl(project, costCodes, { invoices });
  const archived = summary.costCodes.find((c) => c.costCodeId === "cc-archived");

  assert.equal(archived?.status, "ARCHIVED");
  assert.equal(archived?.actualCost, 75000);
  assert.equal(archived?.actualVariance, 25000); // 100k budget - 75k actual = 25k remaining
  assert.equal(summary.codedActualCost, 75000);
  assert.equal(summary.totalActualCost, 75000);
});

test("18. forecast cost separate from actual cost; missing forecast is null", () => {
  const project = createMockProject();
  const costCodes = createMockCostCodes("proj-1");
  const summary = calculateProjectBudgetControl(project, costCodes, {});

  const civil = summary.costCodes.find((c) => c.costCodeId === "cc-civil");
  const mech = summary.costCodes.find((c) => c.costCodeId === "cc-mech");

  // Civil has forecast 420k, budget 400k -> forecast variance = 400k - 420k = -20k
  assert.equal(civil?.forecastAmount, 420000);
  assert.equal(civil?.forecastVariance, -20000);

  // Mech has no forecast set -> forecastAmount is null, forecastVariance is null
  assert.equal(mech?.forecastAmount, null);
  assert.equal(mech?.forecastVariance, null);
});

test("19. committed cost remains null (unavailable)", () => {
  const project = createMockProject();
  const costCodes = createMockCostCodes("proj-1");
  const summary = calculateProjectBudgetControl(project, costCodes, {});

  for (const cc of summary.costCodes) {
    assert.equal(cc.committedCost, null, "Committed cost must be null (unavailable) until P2");
  }
});

test("20. invoice allocation persistence serialization supports projectCostCodeId", () => {
  const rows = toInvoiceProjectAllocationPersistenceRows("inv-1", 100000, [
    {
      projectId: "proj-1",
      projectCostCodeId: "cc-civil",
      allocationType: "AMOUNT",
      allocationAmount: 60000,
    },
    {
      projectId: "proj-2",
      allocationType: "AMOUNT",
      allocationAmount: 40000,
    },
  ]);

  assert.equal(rows[0].project_cost_code_id, "cc-civil");
  assert.equal(rows[1].project_cost_code_id, null);
});

test("21. getSelectableCostCodes: returns only active cost codes for project when no current selection is archived", () => {
  const costCodes = createMockCostCodes("proj-1");
  const selectable = getSelectableCostCodes(costCodes, "proj-1");

  assert.equal(selectable.length, 2);
  assert.deepEqual(selectable.map((c) => c.id).sort(), ["cc-civil", "cc-mech"]);
});

test("22. getSelectableCostCodes: includes currently selected archived cost code for historical display", () => {
  const costCodes = createMockCostCodes("proj-1");
  const selectable = getSelectableCostCodes(costCodes, "proj-1", "cc-archived");

  assert.equal(selectable.length, 3);
  assert.ok(selectable.some((c) => c.id === "cc-archived"));
});

test("23. getSelectableCostCodes: excludes archived cost codes if not currently selected", () => {
  const costCodes = createMockCostCodes("proj-1");
  const selectable = getSelectableCostCodes(costCodes, "proj-1", "cc-civil");

  assert.equal(selectable.length, 2);
  assert.ok(!selectable.some((c) => c.id === "cc-archived"));
});

test("24. getSelectableCostCodes: strictly enforces projectId and never returns cross-project cost codes", () => {
  const costCodes = [
    ...createMockCostCodes("proj-1"),
    {
      id: "cc-proj2-elec",
      projectId: "proj-2",
      code: "ELEC",
      name: "Electrical Systems",
      status: "ACTIVE" as const,
      approvedBudgetAmount: 200000,
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    },
  ];

  // Requesting for proj-1 with a proj-2 cost code selected must NOT return the proj-2 cost code
  const selectableProj1 = getSelectableCostCodes(costCodes, "proj-1", "cc-proj2-elec");
  assert.equal(selectableProj1.length, 2);
  assert.ok(!selectableProj1.some((c) => c.projectId !== "proj-1"));

  // Requesting for proj-2 returns only proj-2 cost code
  const selectableProj2 = getSelectableCostCodes(costCodes, "proj-2");
  assert.equal(selectableProj2.length, 1);
  assert.equal(selectableProj2[0].id, "cc-proj2-elec");
});

test("25. formatCostCodeOptionLabel: formats active and archived labels with code, name and (Archived) tag", () => {
  const activeCode = {
    id: "cc-1",
    projectId: "proj-1",
    code: "CIVIL",
    name: "Civil & Earthworks",
    status: "ACTIVE" as const,
    approvedBudgetAmount: 400000,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };
  const archivedCode = {
    id: "cc-2",
    projectId: "proj-1",
    code: "ELEC",
    name: "Electrical Works",
    status: "ARCHIVED" as const,
    approvedBudgetAmount: 200000,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };

  assert.equal(formatCostCodeOptionLabel(activeCode), "CIVIL — Civil & Earthworks");
  assert.equal(formatCostCodeOptionLabel(archivedCode), "ELEC — Electrical Works (Archived)");
});

