import test from "node:test";
import assert from "node:assert/strict";
import { buildDemoProjectSummaries } from "../src/demo/demoSelectors.ts";
import { isSafeStoredDemoWorkspace } from "../src/demo/demoState.ts";
import { createDemoWorkspace } from "../src/demo/data/createDemoWorkspace.ts";
import { createMarketingDemoWorkspace, MARKETING_DEMO_ANCHOR_DATE, MARKETING_INVOICE_IDS, MARKETING_PROJECT_IDS, MARKETING_PROCUREMENT_IDS } from "../src/demo/data/marketingWorkspace.ts";

function workspace() {
  return createMarketingDemoWorkspace(MARKETING_DEMO_ANCHOR_DATE);
}

test("marketing workspace is deterministic, session-demo scoped, and distinct from the ordinary demo fixture", () => {
  const ordinaryDemo = createDemoWorkspace(MARKETING_DEMO_ANCHOR_DATE);
  const first = workspace();
  const second = workspace();
  assert.deepEqual(first, second);
  assert.deepEqual(createDemoWorkspace(MARKETING_DEMO_ANCHOR_DATE), ordinaryDemo);
  assert.equal(first.anchorDate, MARKETING_DEMO_ANCHOR_DATE);
  assert.equal(isSafeStoredDemoWorkspace(first, MARKETING_DEMO_ANCHOR_DATE), true);
  assert.equal(first.company.id, "demo-company-meridian");
  assert.equal(first.company.name, "Silverfern Water Systems Corporation");
  assert.equal(first.projects.some((project) => project.id.startsWith("demo-project-")), false);
  assert.deepEqual(first.cash, { accounts: [], snapshots: [], transactions: [], importBatches: [], matches: [] });
  assert.equal(first.payroll.workers.length, 0);
  assert.equal(first.engineering.documents.length, 0);
  assert.equal(first.siteLogs.logs.length, 0);
  assert.equal(first.materials.length, 0);
  assert.equal(first.equipment.length, 0);
  assert.equal(first.inventoryMovements.length, 0);
});

test("marketing projects and PHP budgets describe one water-treatment contractor", () => {
  const data = workspace();
  assert.equal(data.projects.length, 5);
  assert.equal(data.projects.filter((project) => project.status === "ACTIVE").length, 3);
  assert.equal(data.projects.filter((project) => project.status === "COMPLETED").length, 1);
  assert.equal(data.projects.filter((project) => project.status === "PLANNING").length, 1);
  assert.ok(data.projects.every((project) => project.currency === "PHP"));
  assert.ok(data.projects.every((project) => project.taxTreatment === "UNCLASSIFIED"));
  assert.notEqual(data.projects[0]?.contractValue, data.projects[0]?.projectBudget);

  const projectIds = new Set(data.projects.map((project) => project.id));
  const projectCodes = new Set(data.projects.map((project) => project.projectCode));
  for (const code of data.costCodes || []) assert.ok(projectIds.has(code.projectId));
  for (const project of data.projects) {
    const scopedCodes = (data.costCodes || []).filter((code) => code.projectId === project.id);
    assert.ok(scopedCodes.reduce((sum, code) => sum + code.approvedBudgetAmount, 0) <= project.projectBudget);
    assert.ok(scopedCodes.every((code) => (code.forecastAmount || 0) <= code.approvedBudgetAmount));
  }
  for (const expense of data.expenses) assert.ok(projectIds.has(expense.projectId || ""));
  for (const invoice of data.invoices) assert.ok(projectCodes.has(invoice.projectReference || ""));
  for (const assignment of data.payroll.assignments) assert.ok(projectIds.has(assignment.projectId));
  for (const document of data.engineering.documents) if (document.projectId) assert.ok(projectIds.has(document.projectId));
});

test("supplier, cost-code, expense, procurement, and invoice references reconcile", () => {
  const data = workspace();
  assert.equal(data.vendors?.length, 8);
  const projectIds = new Set(data.projects.map((project) => project.id));
  const projectCodes = new Map(data.projects.map((project) => [project.projectCode, project.id]));
  const vendorIds = new Set((data.vendors || []).map((vendor) => vendor.id));
  const costCodeIds = new Set((data.costCodes || []).map((code) => code.id));
  const costCodesById = new Map((data.costCodes || []).map((code) => [code.id, code]));
  const rfqs = new Map((data.rfqs || []).map((rfq) => [rfq.id, rfq]));
  const quotations = new Map((data.supplierQuotations || []).map((quotation) => [quotation.id, quotation]));
  const purchaseOrders = new Map((data.purchaseOrders || []).map((order) => [order.id, order]));

  for (const expense of data.expenses) {
    assert.ok(projectIds.has(expense.projectId || ""));
    assert.ok(costCodeIds.has(expense.projectCostCodeId || ""));
    if (expense.vendorId) assert.ok(vendorIds.has(expense.vendorId));
    assert.ok(expense.amount > 0);
    assert.equal(expense.currency, "PHP");
  }

  for (const rfq of rfqs.values()) {
    assert.ok(!rfq.projectId || projectIds.has(rfq.projectId));
    for (const vendorId of rfq.invitedVendorIds || []) assert.ok(vendorIds.has(vendorId));
    if (rfq.selectedQuotationId) assert.equal(quotations.get(rfq.selectedQuotationId)?.rfqId, rfq.id);
  }

  for (const quotation of quotations.values()) {
    assert.ok(rfqs.has(quotation.rfqId));
    assert.ok(vendorIds.has(quotation.vendorId));
    const lineTotal = (quotation.lines || []).reduce((sum, line) => sum + line.amount, 0);
    assert.equal(lineTotal, quotation.totalAmount);
  }

  for (const order of purchaseOrders.values()) {
    const rfq = order.rfqId ? rfqs.get(order.rfqId) : undefined;
    const quote = order.supplierQuotationId ? quotations.get(order.supplierQuotationId) : undefined;
    assert.ok(projectIds.has(order.projectId));
    assert.ok(vendorIds.has(order.vendorId));
    assert.equal((order.lines || []).reduce((sum, line) => sum + line.amount, 0), order.totalAmount);
    if (rfq) assert.equal(rfq.projectId, order.projectId);
    if (quote) {
      assert.equal(quote.rfqId, order.rfqId);
      assert.equal(quote.vendorId, order.vendorId);
      assert.equal(quote.totalAmount, order.totalAmount);
    }
  }

  for (const invoice of data.invoices) {
    const referencedProjectId = projectCodes.get(invoice.projectReference || "");
    assert.ok(referencedProjectId);
    assert.ok(vendorIds.has(invoice.vendor.vendorId || ""));
    const lines = invoice.items.reduce((sum, line) => sum + Number(line.total || 0), 0);
    assert.equal(lines, invoice.grandTotal);
    assert.equal(invoice.currency, "PHP");
    if (invoice.purchaseOrderNumber) {
      const order = [...purchaseOrders.values()].find((candidate) => candidate.poNumber === invoice.purchaseOrderNumber);
      assert.ok(order);
      assert.equal(order?.vendorId, invoice.vendor.vendorId);
      assert.equal(order?.projectId, referencedProjectId);
      assert.equal(order?.totalAmount, invoice.grandTotal);
    }
    const supplierExpenseRows = data.expenses.filter((expense) => expense.supplierInvoiceId === invoice.id);
    if (invoice.reviewStatus === "NEEDS_REVIEW") {
      assert.equal(invoice.linkedExpenseId, undefined);
      assert.equal(supplierExpenseRows.length, 0);
    } else {
      assert.equal(supplierExpenseRows.length, 1);
      const linkedExpense = data.expenses.find((expense) => expense.id === invoice.linkedExpenseId);
      assert.equal(invoice.reviewStatus, "VERIFIED");
      assert.ok(linkedExpense);
      assert.equal(linkedExpense?.supplierInvoiceId, invoice.id);
      assert.equal(linkedExpense?.vendorId, invoice.vendor.vendorId);
      assert.equal(linkedExpense?.projectId, referencedProjectId);
      assert.equal(linkedExpense?.amount, invoice.grandTotal);
    }
    assert.equal(invoice.totalTax, null);
    assert.equal(invoice.financialSemantics?.taxInclusion, "UNKNOWN");
    assert.equal(invoice.financialSemantics?.determination, "EXPLICIT");
    assert.equal(invoice.philippineTaxDetails, undefined);
  }

  assert.equal(data.invoices.filter((invoice) => invoice.reviewStatus === "NEEDS_REVIEW").length, 2);
  assert.equal(data.invoices.filter((invoice) => invoice.reviewStatus === "VERIFIED").length, 1);
  assert.equal(data.invoiceAllocations.length, 1);
  for (const allocation of data.invoiceAllocations) {
    const invoice = data.invoices.find((candidate) => candidate.id === allocation.invoiceId);
    assert.ok(invoice);
    assert.ok(projectIds.has(allocation.projectId));
    assert.equal(costCodesById.get(allocation.projectCostCodeId || "")?.projectId, allocation.projectId);
    assert.equal(allocation.allocationAmount, invoice?.grandTotal);
  }

  assert.deepEqual(data.purchaseOrderMatches, []);
  assert.deepEqual(data.purchaseOrderReceipts, []);
  assert.ok((data.purchaseOrders || []).some((order) => order.status === "ISSUED"));
  assert.ok((data.purchaseOrders || []).some((order) => order.status === "DRAFT"));
  assert.ok((data.rfqs || []).some((rfq) => rfq.status === "ISSUED"));
});

test("verified invoice source maps to one payable while unverified invoices stay outside actual cost", () => {
  const data = workspace();
  const summaries = buildDemoProjectSummaries(data);
  const sanFernando = summaries[MARKETING_PROJECT_IDS.sanFernando];
  const laguna = summaries[MARKETING_PROJECT_IDS.laguna];
  const clark = summaries[MARKETING_PROJECT_IDS.clark];
  assert.ok(sanFernando);
  assert.ok(laguna);
  assert.ok(clark);
  assert.equal(sanFernando.invoiceCost, 0);
  assert.equal(sanFernando.committedCost, 448_000);
  assert.equal(laguna.invoiceCost, 0);
  assert.equal(laguna.committedCost, 1_216_000);
  assert.equal(clark.invoiceCost, 0);
  assert.equal(clark.otherExpenseCost, 820_900);
  assert.equal(data.invoices.find((invoice) => invoice.id === MARKETING_INVOICE_IDS.boosterPump)?.purchaseOrderNumber, "PO-WTR-26-006");
  assert.equal(data.purchaseOrders?.find((order) => order.id === MARKETING_PROCUREMENT_IDS.analyzerPo)?.status, "DRAFT");
});

test("captured operational labels contain no QA, test, placeholder, or marketing-only wording", () => {
  const data = workspace();
  const visibleBusinessText = [
    data.company.name,
    ...data.projects.flatMap((project) => [project.projectCode, project.projectName, project.clientName || "", project.description || ""]),
    ...(data.costCodes || []).flatMap((code) => [code.code, code.name]),
    ...data.expenses.flatMap((expense) => [expense.description, expense.category, expense.payee || ""]),
    ...(data.vendors || []).map((vendor) => vendor.name),
    ...(data.rfqs || []).flatMap((rfq) => [rfq.rfqNumber, rfq.title, rfq.description || ""]),
    ...(data.purchaseOrders || []).flatMap((order) => [order.poNumber, order.description || "", ...(order.lines || []).map((line) => line.description)]),
    ...data.invoices.flatMap((invoice) => [invoice.invoiceNumber, invoice.description || "", invoice.vendor.name, ...(invoice.items || []).map((line) => line.description)]),
  ].join(" ");
  assert.doesNotMatch(visibleBusinessText, /QA-E2E|REL-QA|MKT-V1A|synthetic|fixture|test vendor|demo project|sample expense|project a|vendor 1|lorem ipsum|marketing-only/i);
});
