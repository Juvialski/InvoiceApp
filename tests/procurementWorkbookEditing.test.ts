import assert from "node:assert/strict";
import test from "node:test";
import type { PurchaseOrder, PurchaseOrderLine, RFQ, RFQInvitedVendor, RFQLine } from "../src/types.ts";
import { PERMISSION_KEYS } from "../src/utils/accessControl.ts";
import type { ProcurementRefreshContext } from "../src/lib/procurementWorkbook.ts";
import {
  applyProcurementWorkbookDraftValue,
  canEditProcurementWorkbookField,
  ProcurementWorkbookEditingError,
  readProcurementWorkbookValue,
  saveProcurementWorkbookRows,
} from "../src/lib/procurementWorkbookEditing.ts";

const authorizedPermissions = [PERMISSION_KEYS.procurementRead, PERMISSION_KEYS.procurementWrite] as const;
const readOnlyPermissions = [PERMISSION_KEYS.procurementRead] as const;
const manageOnlyPermissions = [PERMISSION_KEYS.procurementWrite] as const;
const approveOnlyPermissions = [PERMISSION_KEYS.procurementApprove] as const;

const rfqLine: RFQLine = {
  id: "rfq-line-1",
  companyId: "company-1",
  rfqId: "rfq-1",
  lineNumber: 1,
  description: "Copper fittings",
  quantity: 12,
  unit: "pcs",
  projectCostCodeId: "cost-code-1",
  requestedDeliveryDate: "2026-11-01",
  notes: "Preserve line details",
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
};

const invitedVendor: RFQInvitedVendor = {
  id: "rfq-invitation-1",
  companyId: "company-1",
  rfqId: "rfq-1",
  vendorId: "vendor-1",
  invitedAt: "2026-09-01T00:00:00.000Z",
  notes: "Preserve invitation",
  createdAt: "2026-09-01T00:00:00.000Z",
};

const rfq: RFQ = {
  id: "rfq-1",
  companyId: "company-1",
  rfqNumber: "RFQ-26-001",
  title: "Water treatment pumps",
  description: "Technical description stays authoritative",
  projectId: "project-1",
  currency: "PHP",
  status: "DRAFT",
  issueDate: null,
  dueDate: "2026-10-10",
  notes: "RFQ notes stay authoritative",
  selectedQuotationId: null,
  lines: [rfqLine],
  invitedVendorIds: ["vendor-1"],
  invitedVendors: [invitedVendor],
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-09-20T00:00:00.000Z",
};

const poLine: PurchaseOrderLine = {
  id: "po-line-1",
  companyId: "company-1",
  purchaseOrderId: "po-1",
  lineNumber: 1,
  description: "Pump assembly",
  quantity: 2,
  unit: "set",
  unitPrice: 1250,
  amount: 2500,
  projectCostCodeId: "cost-code-1",
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
};

const purchaseOrder: PurchaseOrder = {
  id: "po-1",
  companyId: "company-1",
  poNumber: "PO-26-001",
  vendorId: "vendor-1",
  projectId: "project-1",
  currency: "PHP",
  status: "DRAFT",
  issueDate: null,
  description: "Treatment plant pump package",
  notes: "PO notes stay authoritative",
  totalAmount: 2500,
  lines: [poLine],
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-09-20T00:00:00.000Z",
};

function records(overrides: Partial<ProcurementRefreshContext> = {}): ProcurementRefreshContext {
  return {
    rfqs: [rfq],
    purchaseOrders: [purchaseOrder],
    projects: [],
    vendors: [],
    expectedCompanyId: "company-1",
    ...overrides,
  };
}

test("Procurement field access requires read plus manage and only permits DRAFT safe headers", () => {
  assert.equal(canEditProcurementWorkbookField("rfqs", "title", rfq, authorizedPermissions), true);
  assert.equal(canEditProcurementWorkbookField("rfqs", "dueDate", rfq, authorizedPermissions), true);
  assert.equal(canEditProcurementWorkbookField("purchase-orders", "description", purchaseOrder, authorizedPermissions), true);

  for (const permissions of [readOnlyPermissions, manageOnlyPermissions, approveOnlyPermissions]) {
    assert.equal(canEditProcurementWorkbookField("rfqs", "title", rfq, permissions), false);
    assert.equal(canEditProcurementWorkbookField("purchase-orders", "description", purchaseOrder, permissions), false);
  }

  const issuedRFQ = { ...rfq, status: "ISSUED" as const };
  const approvedPO = { ...purchaseOrder, status: "APPROVED" as const };
  assert.equal(canEditProcurementWorkbookField("rfqs", "title", issuedRFQ, authorizedPermissions), false);
  assert.equal(canEditProcurementWorkbookField("purchase-orders", "description", approvedPO, authorizedPermissions), false);
  for (const fieldId of ["rfqNumber", "status", "lines", "invitedVendors", "updatedAt"]) {
    assert.equal(canEditProcurementWorkbookField("rfqs", fieldId, rfq, authorizedPermissions), false);
  }
  for (const fieldId of ["poNumber", "total", "status", "lines", "vendorId", "projectId", "updatedAt"]) {
    assert.equal(canEditProcurementWorkbookField("purchase-orders", fieldId, purchaseOrder, authorizedPermissions), false);
  }
});

test("Procurement sheet values expose protected identity and calculated values without line editing", () => {
  assert.equal(readProcurementWorkbookValue(rfq, "rfqNumber"), "RFQ-26-001");
  assert.equal(readProcurementWorkbookValue(rfq, "status"), "DRAFT");
  assert.equal(readProcurementWorkbookValue(purchaseOrder, "poNumber"), "PO-26-001");
  assert.equal(readProcurementWorkbookValue(purchaseOrder, "total"), 2500);
  assert.equal(readProcurementWorkbookValue(purchaseOrder, "currency"), "PHP");

  const changedTitle = applyProcurementWorkbookDraftValue("rfqs", rfq, "title", "Updated title") as RFQ;
  const changedDueDate = applyProcurementWorkbookDraftValue("rfqs", changedTitle, "dueDate", "2026-11-10") as RFQ;
  const changedDescription = applyProcurementWorkbookDraftValue("purchase-orders", purchaseOrder, "description", "Updated description") as PurchaseOrder;
  assert.equal(changedDueDate.title, "Updated title");
  assert.equal(changedDueDate.dueDate, "2026-11-10");
  assert.deepEqual(changedDueDate.lines, rfq.lines);
  assert.deepEqual(changedDueDate.invitedVendors, rfq.invitedVendors);
  assert.equal(changedDescription.description, "Updated description");
  assert.equal(changedDescription.totalAmount, purchaseOrder.totalAmount);
  assert.deepEqual(changedDescription.lines, purchaseOrder.lines);
  assert.equal(applyProcurementWorkbookDraftValue("purchase-orders", purchaseOrder, "total", 1), purchaseOrder);
  assert.equal(applyProcurementWorkbookDraftValue("rfqs", rfq, "lines", []), rfq);
});

test("RFQ header Save refreshes first, preserves line and invitation data, forwards expected version, then refreshes", async () => {
  const base = records();
  const staged = applyProcurementWorkbookDraftValue("rfqs", rfq, "title", "  Revised pump RFQ  ") as RFQ;
  const stagedWithDate = applyProcurementWorkbookDraftValue("rfqs", staged, "dueDate", "2026-11-20") as RFQ;
  const calls: string[] = [];
  let latest = base;
  let savedRfq: RFQ | undefined;

  const result = await saveProcurementWorkbookRows({
    writeMode: "existing-domain",
    sheetId: "rfqs",
    stagedRows: [stagedWithDate],
    baseRecords: base,
    permissions: authorizedPermissions,
    expectedCompanyId: "company-1",
    refresh: async () => { calls.push("refresh"); return latest; },
    saveRFQ: async (nextRfq, lines, invitedVendorIds, expectedUpdatedAt, preserveCurrentLines) => {
      calls.push("save");
      savedRfq = nextRfq as RFQ;
      assert.deepEqual(lines, rfq.lines);
      assert.equal(invitedVendorIds, undefined);
      assert.equal(expectedUpdatedAt, rfq.updatedAt);
      assert.equal(preserveCurrentLines, true);
      latest = records({ rfqs: [{ ...rfq, ...nextRfq, updatedAt: "2026-09-27T00:00:00.000Z" }] });
    },
    isContextCurrent: () => true,
  });

  assert.deepEqual(calls, ["refresh", "save", "refresh"]);
  assert.equal(result.appliedCount, 1);
  assert.equal(savedRfq?.title, "Revised pump RFQ");
  assert.equal(savedRfq?.dueDate, "2026-11-20");
  assert.equal(savedRfq?.status, rfq.status);
  assert.equal(savedRfq?.projectId, rfq.projectId);
  assert.equal(savedRfq?.updatedAt, rfq.updatedAt);
  assert.deepEqual(savedRfq?.lines, rfq.lines);
  assert.deepEqual(savedRfq?.invitedVendors, rfq.invitedVendors);
});

test("Purchase Order header Save preserves calculated and line fields and forwards expected version", async () => {
  const base = records();
  const staged = applyProcurementWorkbookDraftValue("purchase-orders", purchaseOrder, "description", "  Revised pump package  ") as PurchaseOrder;
  let latest = base;
  let savedPO: PurchaseOrder | undefined;
  const calls: string[] = [];

  const result = await saveProcurementWorkbookRows({
    writeMode: "existing-domain",
    sheetId: "purchase-orders",
    stagedRows: [staged],
    baseRecords: base,
    permissions: authorizedPermissions,
    expectedCompanyId: "company-1",
    refresh: async () => { calls.push("refresh"); return latest; },
    savePurchaseOrder: async (nextPO, lines, expectedUpdatedAt, preserveCurrentLines) => {
      calls.push("save");
      savedPO = nextPO as PurchaseOrder;
      assert.deepEqual(lines, purchaseOrder.lines);
      assert.equal(expectedUpdatedAt, purchaseOrder.updatedAt);
      assert.equal(preserveCurrentLines, true);
      latest = records({ purchaseOrders: [{ ...purchaseOrder, ...nextPO, updatedAt: "2026-09-27T00:00:00.000Z" }] });
    },
    isContextCurrent: () => true,
  });

  assert.deepEqual(calls, ["refresh", "save", "refresh"]);
  assert.equal(result.appliedCount, 1);
  assert.equal(savedPO?.description, "Revised pump package");
  assert.equal(savedPO?.poNumber, purchaseOrder.poNumber);
  assert.equal(savedPO?.totalAmount, purchaseOrder.totalAmount);
  assert.equal(savedPO?.vendorId, purchaseOrder.vendorId);
  assert.equal(savedPO?.projectId, purchaseOrder.projectId);
  assert.deepEqual(savedPO?.lines, purchaseOrder.lines);
});

test("stale versions, missing records, and company changes block every overwrite", async () => {
  const base = records();
  const staged = applyProcurementWorkbookDraftValue("purchase-orders", purchaseOrder, "description", "Must not overwrite") as PurchaseOrder;
  let saveCalls = 0;

  await assert.rejects(saveProcurementWorkbookRows({
    writeMode: "existing-domain",
    sheetId: "purchase-orders",
    stagedRows: [staged],
    baseRecords: base,
    permissions: authorizedPermissions,
    expectedCompanyId: "company-1",
    refresh: async () => records({ purchaseOrders: [{ ...purchaseOrder, updatedAt: "2026-09-22T00:00:00.000Z" }] }),
    savePurchaseOrder: async () => { saveCalls += 1; },
    isContextCurrent: () => true,
  }), (error: unknown) => error instanceof ProcurementWorkbookEditingError
    && error.kind === "conflict"
    && error.issues.some((item) => item.fieldId === "updatedAt"));

  await assert.rejects(saveProcurementWorkbookRows({
    writeMode: "existing-domain",
    sheetId: "rfqs",
    stagedRows: [applyProcurementWorkbookDraftValue("rfqs", rfq, "title", "Must not overwrite") as RFQ],
    baseRecords: base,
    permissions: authorizedPermissions,
    expectedCompanyId: "company-1",
    refresh: async () => records({ expectedCompanyId: "company-2" }),
    saveRFQ: async () => { saveCalls += 1; },
    isContextCurrent: () => true,
  }), (error: unknown) => error instanceof ProcurementWorkbookEditingError && error.kind === "conflict");

  await assert.rejects(saveProcurementWorkbookRows({
    writeMode: "existing-domain",
    sheetId: "rfqs",
    stagedRows: [applyProcurementWorkbookDraftValue("rfqs", rfq, "title", "Must not overwrite") as RFQ],
    baseRecords: base,
    permissions: authorizedPermissions,
    expectedCompanyId: "company-1",
    refresh: async () => records({ rfqs: [] }),
    saveRFQ: async () => { saveCalls += 1; },
    isContextCurrent: () => true,
  }), (error: unknown) => error instanceof ProcurementWorkbookEditingError && error.kind === "conflict");

  assert.equal(saveCalls, 0);
});

test("invalid values, protected edits, and line changes are rejected before refresh", async () => {
  const base = records();
  let refreshCalls = 0;
  let saveCalls = 0;

  const invalidTitle = applyProcurementWorkbookDraftValue("rfqs", rfq, "title", " ") as RFQ;
  await assert.rejects(saveProcurementWorkbookRows({
    writeMode: "existing-domain", sheetId: "rfqs", stagedRows: [invalidTitle], baseRecords: base,
    permissions: authorizedPermissions,
    refresh: async () => { refreshCalls += 1; return base; },
    saveRFQ: async () => { saveCalls += 1; },
    isContextCurrent: () => true,
  }), (error: unknown) => error instanceof ProcurementWorkbookEditingError && error.kind === "validation");

  const invalidDueDate = applyProcurementWorkbookDraftValue("rfqs", rfq, "dueDate", "2026-02-30") as RFQ;
  await assert.rejects(saveProcurementWorkbookRows({
    writeMode: "existing-domain", sheetId: "rfqs", stagedRows: [invalidDueDate], baseRecords: base,
    permissions: authorizedPermissions,
    refresh: async () => { refreshCalls += 1; return base; },
    saveRFQ: async () => { saveCalls += 1; },
    isContextCurrent: () => true,
  }), (error: unknown) => error instanceof ProcurementWorkbookEditingError && error.issues.some((item) => item.fieldId === "dueDate"));

  const invalidZeroYear = applyProcurementWorkbookDraftValue("rfqs", rfq, "dueDate", "0000-01-01") as RFQ;
  await assert.rejects(saveProcurementWorkbookRows({
    writeMode: "existing-domain", sheetId: "rfqs", stagedRows: [invalidZeroYear], baseRecords: base,
    permissions: authorizedPermissions,
    refresh: async () => { refreshCalls += 1; return base; },
    saveRFQ: async () => { saveCalls += 1; },
    isContextCurrent: () => true,
  }), (error: unknown) => error instanceof ProcurementWorkbookEditingError && error.issues.some((item) => item.fieldId === "dueDate"));

  const changedStatus = { ...rfq, title: "Changed title", status: "ISSUED" as const };
  await assert.rejects(saveProcurementWorkbookRows({
    writeMode: "existing-domain", sheetId: "rfqs", stagedRows: [changedStatus], baseRecords: base,
    permissions: authorizedPermissions,
    refresh: async () => { refreshCalls += 1; return base; },
    saveRFQ: async () => { saveCalls += 1; },
    isContextCurrent: () => true,
  }), (error: unknown) => error instanceof ProcurementWorkbookEditingError && error.kind === "access");

  const changedLine = { ...rfq, title: "Changed title", lines: [{ ...rfqLine, description: "Changed hidden line" }] };
  await assert.rejects(saveProcurementWorkbookRows({
    writeMode: "existing-domain", sheetId: "rfqs", stagedRows: [changedLine], baseRecords: base,
    permissions: authorizedPermissions,
    refresh: async () => { refreshCalls += 1; return base; },
    saveRFQ: async () => { saveCalls += 1; },
    isContextCurrent: () => true,
  }), (error: unknown) => error instanceof ProcurementWorkbookEditingError && error.kind === "access");

  const newPO = { ...purchaseOrder, id: "new-po", description: "Do not create" };
  await assert.rejects(saveProcurementWorkbookRows({
    writeMode: "existing-domain", sheetId: "purchase-orders", stagedRows: [newPO], baseRecords: base,
    permissions: authorizedPermissions,
    refresh: async () => { refreshCalls += 1; return base; },
    savePurchaseOrder: async () => { saveCalls += 1; },
    isContextCurrent: () => true,
  }), (error: unknown) => error instanceof ProcurementWorkbookEditingError && error.kind === "access");

  assert.equal(refreshCalls, 0);
  assert.equal(saveCalls, 0);
});

test("read-only users cannot save and approve permission alone is not write authority", async () => {
  const base = records();
  const staged = applyProcurementWorkbookDraftValue("rfqs", rfq, "title", "Unauthorized edit") as RFQ;
  let saveCalls = 0;
  for (const permissions of [readOnlyPermissions, manageOnlyPermissions, approveOnlyPermissions]) {
    await assert.rejects(saveProcurementWorkbookRows({
      writeMode: "existing-domain", sheetId: "rfqs", stagedRows: [staged], baseRecords: base,
      permissions,
      refresh: async () => base,
      saveRFQ: async () => { saveCalls += 1; },
      isContextCurrent: () => true,
    }), (error: unknown) => error instanceof ProcurementWorkbookEditingError && error.kind === "access");
  }
  assert.equal(saveCalls, 0);
});

test("context changes stop apply and require a fresh worksheet", async () => {
  const base = records();
  const staged = applyProcurementWorkbookDraftValue("purchase-orders", purchaseOrder, "description", "Changed locally") as PurchaseOrder;
  let current = true;
  let saveCalls = 0;
  await assert.rejects(saveProcurementWorkbookRows({
    writeMode: "existing-domain",
    sheetId: "purchase-orders",
    stagedRows: [staged],
    baseRecords: base,
    permissions: authorizedPermissions,
    expectedCompanyId: "company-1",
    refresh: async () => { current = false; return base; },
    savePurchaseOrder: async () => { saveCalls += 1; },
    isContextCurrent: () => current,
  }), (error: unknown) => error instanceof ProcurementWorkbookEditingError && error.kind === "context");
  assert.equal(saveCalls, 0);
});

test("multiple row saves are sequential and report a partial failure", async () => {
  const secondPO: PurchaseOrder = { ...purchaseOrder, id: "po-2", poNumber: "PO-26-002", updatedAt: "2026-09-20T00:00:00.000Z" };
  const base = records({ purchaseOrders: [purchaseOrder, secondPO] });
  const staged = [
    applyProcurementWorkbookDraftValue("purchase-orders", purchaseOrder, "description", "First updated") as PurchaseOrder,
    applyProcurementWorkbookDraftValue("purchase-orders", secondPO, "description", "Second updated") as PurchaseOrder,
  ];
  const calls: string[] = [];
  await assert.rejects(saveProcurementWorkbookRows({
    writeMode: "existing-domain",
    sheetId: "purchase-orders",
    stagedRows: staged,
    baseRecords: base,
    permissions: authorizedPermissions,
    refresh: async () => { calls.push("refresh"); return base; },
    savePurchaseOrder: async (po) => {
      calls.push(po.id || "missing");
      if (po.id === secondPO.id) throw new Error("Purchase order changed after refresh.");
    },
    isContextCurrent: () => true,
  }), (error: unknown) => error instanceof ProcurementWorkbookEditingError
    && error.phase === "apply"
    && error.kind === "conflict"
    && error.appliedCount === 1
    && error.totalCount === 2
    && error.appliedRowIds[0] === "po-1"
    && error.unappliedRowIds[0] === "po-2"
    && error.failedRowId === "po-2");
  assert.deepEqual(calls, ["refresh", "po-1", "po-2"]);
});

test("synthetic Demo Save updates only local worksheet state", async () => {
  const base = records();
  const staged = applyProcurementWorkbookDraftValue("purchase-orders", purchaseOrder, "description", "Browser-local draft") as PurchaseOrder;
  let localRecords: ProcurementRefreshContext | undefined;
  let refreshCalls = 0;
  let saveCalls = 0;
  const result = await saveProcurementWorkbookRows({
    writeMode: "synthetic-demo",
    sheetId: "purchase-orders",
    stagedRows: [staged],
    baseRecords: base,
    permissions: authorizedPermissions,
    saveSyntheticRecords: (next) => { localRecords = next; },
    refresh: async () => { refreshCalls += 1; return base; },
    savePurchaseOrder: async () => { saveCalls += 1; },
    isContextCurrent: () => true,
  });
  assert.equal(result.writeMode, "synthetic-demo");
  assert.equal(localRecords?.purchaseOrders[0]?.description, "Browser-local draft");
  assert.equal(refreshCalls, 0);
  assert.equal(saveCalls, 0);
});
