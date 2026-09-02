import test from "node:test";
import assert from "node:assert/strict";
import type { Project, ProjectCostCode, PurchaseOrder } from "../src/types.ts";
import { calculateProjectCost, isCommittedPurchaseOrder } from "../src/utils/projectCosting.ts";
import {
  saveRFQ,
  transitionRFQStatus,
  saveSupplierQuotation,
  selectSupplierQuotation,
  convertQuotationToDraftPO,
  clearRFQMemoryStore,
} from "../src/lib/rfqs.ts";

test.beforeEach(() => {
  clearRFQMemoryStore();
});

const mockProject: Project = {
  id: "proj-financial-inv",
  projectCode: "PROJ-FIN-01",
  projectName: "Commercial Tower",
  clientName: "Ayala Land",
  status: "ACTIVE",
  contractValue: 10_000_000,
  projectBudget: 7_000_000,
  currency: "PHP",
  createdAt: "2026-01-01",
  updatedAt: "2026-01-01",
};

const mockCostCodes: ProjectCostCode[] = [
  {
    id: "cc-steel",
    projectId: "proj-financial-inv",
    code: "05-STEEL",
    name: "Structural Metal Framing",
    approvedBudgetAmount: 2_000_000,
    status: "ACTIVE",
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
  },
];

test("rfqFinancialInvariants: RFQ and Supplier Quotations are pre-commitment and NEVER alter Actual Cost or Committed Cost", async () => {
  // Baseline project cost with no commitments
  const initialCost = calculateProjectCost(mockProject, {
    invoices: [],
    payroll: [],
    expenses: [],
    purchaseOrders: [],
  });

  assert.equal(initialCost.totalActualCost, 0);
  assert.equal(initialCost.committedCost, 0);
  assert.equal(initialCost.pendingExpenseCost, 0);
  assert.equal(initialCost.pendingInvoiceCost, 0);

  // 1. Create and issue high-value RFQ (₱5,000,000)
  const rfq = await saveRFQ(
    {
      rfqNumber: "RFQ-FIN-001",
      title: "Major Steel Procurement",
      projectId: mockProject.id,
      currency: "PHP",
    },
    [
      {
        description: "Heavy Structural Steel Sections",
        quantity: 100,
        unit: "tons",
        projectCostCodeId: "cc-steel",
      },
    ],
  );
  await transitionRFQStatus(rfq.id, "ISSUED");

  // 2. Submit high-value quotations (₱4,800,000 and ₱5,200,000)
  const quote1 = await saveSupplierQuotation(
    {
      rfqId: rfq.id,
      vendorId: "vendor-steel-corp",
      quotationNumber: "QUO-STEEL-001",
      currency: "PHP",
    },
    [
      {
        rfqLineId: rfq.lines![0].id,
        description: "Heavy Structural Steel Sections",
        quantity: 100,
        unitPrice: 48_000,
      },
    ],
  );

  const quote2 = await saveSupplierQuotation(
    {
      rfqId: rfq.id,
      vendorId: "vendor-metal-inc",
      quotationNumber: "QUO-METAL-001",
      currency: "PHP",
    },
    [
      {
        rfqLineId: rfq.lines![0].id,
        description: "Heavy Structural Steel Sections",
        quantity: 100,
        unitPrice: 52_000,
      },
    ],
  );

  // 3. Select Quote 1 as preferred supplier
  await selectSupplierQuotation(quote1.id, "Lowest evaluated compliant tender");

  // Verify: RFQs and Quotations are NOT inputs to calculateProjectCost.
  // The costing engine does not recognize pre-commitment RFQs/Quotes.
  const costAfterSelection = calculateProjectCost(mockProject, {
    invoices: [],
    payroll: [],
    expenses: [],
    purchaseOrders: [],
  });

  assert.equal(costAfterSelection.totalActualCost, 0);
  assert.equal(costAfterSelection.committedCost, 0);
});

test("rfqFinancialInvariants: converting quotation to PO yields DRAFT PO which DOES NOT increase Committed Cost", async () => {
  const rfq = await saveRFQ(
    {
      rfqNumber: "RFQ-CONV-FIN",
      title: "Equipment Procurement",
      projectId: mockProject.id,
      currency: "PHP",
    },
    [
      {
        description: "Tower Crane 50m jib",
        quantity: 1,
        unit: "unit",
        projectCostCodeId: "cc-steel",
      },
    ],
  );
  await transitionRFQStatus(rfq.id, "ISSUED");

  const quote = await saveSupplierQuotation(
    {
      rfqId: rfq.id,
      vendorId: "vendor-crane",
      quotationNumber: "QUO-CRANE-01",
      currency: "PHP",
    },
    [
      {
        rfqLineId: rfq.lines![0].id,
        description: "Tower Crane 50m jib",
        quantity: 1,
        unitPrice: 3_500_000,
      },
    ],
  );

  // Convert to Purchase Order
  const draftPO = await convertQuotationToDraftPO(quote.id, "PO-CRANE-DRAFT");

  // Assert DRAFT status
  assert.equal(draftPO.status, "DRAFT");
  assert.equal(draftPO.totalAmount, 3_500_000);

  // Invariant: isCommittedPurchaseOrder must return FALSE for DRAFT PO
  assert.equal(isCommittedPurchaseOrder(draftPO), false);

  // Project cost calculation with this DRAFT PO
  const costWithDraftPO = calculateProjectCost(mockProject, {
    invoices: [],
    payroll: [],
    expenses: [],
    purchaseOrders: [draftPO],
  });

  // Committed Cost MUST STILL BE 0 because DRAFT POs do not commit project funds!
  assert.equal(costWithDraftPO.committedCost, 0);
  assert.equal(costWithDraftPO.totalActualCost, 0);

  // Only if PO is transitioned to APPROVED or ISSUED does Committed Cost increase
  const approvedPO: PurchaseOrder = {
    ...draftPO,
    status: "APPROVED",
  };
  assert.equal(isCommittedPurchaseOrder(approvedPO), true);

  const costWithApprovedPO = calculateProjectCost(mockProject, {
    invoices: [],
    payroll: [],
    expenses: [],
    purchaseOrders: [approvedPO],
  });

  assert.equal(costWithApprovedPO.committedCost, 3_500_000);
  assert.equal(costWithApprovedPO.totalActualCost, 0);
});

