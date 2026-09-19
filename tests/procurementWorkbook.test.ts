import test from "node:test";
import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import {
  applyProcurementImport,
  buildProcurementImportReview,
  exportProcurementWorkbook,
  type ProcurementImportContext,
} from "../src/lib/procurementWorkbook.ts";
import type { Project, PurchaseOrder, RFQ, Vendor } from "../src/types.ts";

const project: Project = {
  id: "project-1",
  projectCode: "P-001",
  projectName: "North Plant",
  status: "ACTIVE",
  projectBudget: 100000,
  currency: "PHP",
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
};

const vendor: Vendor = {
  id: "vendor-1",
  name: "Acme Supply",
  normalizedName: "acme supply",
  companyId: "company-1",
  active: true,
};

const rfq: RFQ = {
  id: "rfq-1",
  companyId: "company-1",
  rfqNumber: "RFQ-001",
  title: "Pipe package",
  description: "Original description",
  projectId: project.id,
  currency: "PHP",
  status: "DRAFT",
  dueDate: "2026-09-25",
  notes: "Original notes",
  lines: [{
    id: "rfq-line-1",
    companyId: "company-1",
    rfqId: "rfq-1",
    lineNumber: 1,
    description: "Steel pipe",
    quantity: 10,
    unit: "pcs",
    requestedDeliveryDate: "2026-10-01",
    notes: null,
  }],
  invitedVendorIds: [vendor.id],
  updatedAt: "2026-09-19T00:00:00.000Z",
};

const purchaseOrder: PurchaseOrder = {
  id: "po-1",
  companyId: "company-1",
  poNumber: "PO-001",
  vendorId: vendor.id,
  projectId: project.id,
  currency: "PHP",
  status: "DRAFT",
  description: "Order description",
  notes: "Order notes",
  totalAmount: 2500,
  lines: [{
    id: "po-line-1",
    companyId: "company-1",
    purchaseOrderId: "po-1",
    lineNumber: 1,
    description: "Steel pipe",
    quantity: 10,
    unit: "pcs",
    unitPrice: 250,
    amount: 2500,
  }],
  updatedAt: "2026-09-19T00:00:00.000Z",
};

function context(overrides: Partial<ProcurementImportContext> = {}): ProcurementImportContext {
  return {
    rfqs: [rfq],
    purchaseOrders: [purchaseOrder],
    projects: [project],
    vendors: [vendor],
    expectedCompanyId: "company-1",
    canWrite: true,
    ...overrides,
  };
}

function exportedBytes() {
  return exportProcurementWorkbook({
    rfqs: [rfq],
    purchaseOrders: [purchaseOrder],
    projects: [project],
    vendors: [vendor],
    companyId: "company-1",
  }).bytes;
}

function editWorkbook(bytes: Uint8Array, sheetName: string, address: string, value: unknown) {
  const workbook = XLSX.read(bytes, { type: "array", cellDates: true, cellFormula: true });
  workbook.Sheets[sheetName][address] = typeof value === "number" ? { t: "n", v: value } : { t: "s", v: String(value) };
  return new Uint8Array(XLSX.write(workbook, { bookType: "xlsx", type: "array", compression: true }) as Uint8Array);
}

test("exports the bounded RFQ/PO workbook shape with stable record and line identities", () => {
  const workbook = XLSX.read(exportedBytes(), { type: "array", cellDates: true });
  assert.deepEqual(workbook.SheetNames, ["RFQs", "RFQ Lines", "Purchase Orders", "PO Lines", "_HydroQualiSense"]);
  const rfqRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets.RFQs, { defval: null });
  const poLineRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets["PO Lines"], { defval: null });
  assert.equal(rfqRows[0]["__HQ Record ID"], rfq.id);
  assert.equal(poLineRows[0]["__HQ Line ID"], purchaseOrder.lines?.[0].id);
  assert.equal(typeof poLineRows[0].Quantity, "number");
  assert.equal(typeof poLineRows[0]["Unit Price"], "number");
});

test("builds a workbook-only proposal and preserves line identity for editable draft fields", () => {
  const edited = editWorkbook(exportedBytes(), "RFQs", "B2", "Edited pipe package");
  const lineEdited = editWorkbook(edited, "RFQ Lines", "C2", "Edited steel pipe");
  const review = buildProcurementImportReview(lineEdited, context(), { fileName: "procurement.xlsx" });
  const proposal = review.proposals.find((item) => item.entity === "RFQ" && item.recordId === rfq.id);
  assert.ok(proposal);
  assert.equal(proposal.status, "WORKBOOK_ONLY_CHANGE");
  assert.equal(proposal.changes.find((change) => change.field === "title")?.workbookValue, "Edited pipe package");
  assert.equal(proposal.lineChanges.find((change) => change.lineId === "rfq-line-1")?.workbookValue, "Edited steel pipe");
  assert.equal(proposal.canApply, true);
});

test("classifies protected status edits, unresolved references, unknown IDs, and stale current records", () => {
  const statusEdited = editWorkbook(exportedBytes(), "Purchase Orders", "E2", "ISSUED");
  const protectedReview = buildProcurementImportReview(statusEdited, context());
  assert.equal(protectedReview.proposals.find((item) => item.entity === "PURCHASE_ORDER")?.status, "UNSUPPORTED_PROTECTED_FIELD");

  const referenceEdited = editWorkbook(exportedBytes(), "RFQs", "D2", "UNKNOWN-PROJECT");
  const referenceReview = buildProcurementImportReview(referenceEdited, context());
  assert.equal(referenceReview.proposals.find((item) => item.entity === "RFQ")?.status, "MISSING_REFERENCE");

  const idEdited = editWorkbook(exportedBytes(), "RFQs", "J2", "other-company-rfq");
  const idReview = buildProcurementImportReview(idEdited, context());
  assert.equal(idReview.proposals.find((item) => item.entity === "RFQ")?.status, "UNAUTHORIZED");

  const companyEdited = editWorkbook(exportedBytes(), "RFQs", "K2", "company-2");
  const companyReview = buildProcurementImportReview(companyEdited, context());
  assert.equal(companyReview.proposals.find((item) => item.entity === "RFQ")?.status, "UNAUTHORIZED");

  const workbookEdited = editWorkbook(exportedBytes(), "RFQs", "B2", "Workbook title");
  const staleReview = buildProcurementImportReview(workbookEdited, context({ rfqs: [{ ...rfq, title: "Changed in app", updatedAt: "2026-09-19T01:00:00.000Z" }] }));
  assert.equal(staleReview.proposals.find((item) => item.entity === "RFQ")?.status, "STALE_CONFLICT");

  const issuedRfq = { ...rfq, status: "ISSUED" as const };
  const issuedBytes = exportProcurementWorkbook({ rfqs: [issuedRfq], purchaseOrders: [purchaseOrder], projects: [project], vendors: [vendor], companyId: "company-1" }).bytes;
  const issuedEdited = editWorkbook(issuedBytes, "RFQs", "B2", "Cannot edit issued RFQ");
  assert.equal(buildProcurementImportReview(issuedEdited, context({ rfqs: [issuedRfq] })).proposals.find((item) => item.entity === "RFQ")?.status, "UNSUPPORTED_PROTECTED_FIELD");

  const blankProject = editWorkbook(exportedBytes(), "Purchase Orders", "C2", "");
  assert.equal(buildProcurementImportReview(blankProject, context()).proposals.find((item) => item.entity === "PURCHASE_ORDER")?.status, "MISSING_REFERENCE");
});

test("read-only review never gains apply authority and missing rows do not imply deletion", async () => {
  const edited = editWorkbook(exportedBytes(), "RFQs", "B2", "Edited by read-only user");
  const readOnlyReview = buildProcurementImportReview(edited, context({ canWrite: false }));
  assert.equal(readOnlyReview.proposals.find((item) => item.entity === "RFQ")?.status, "UNAUTHORIZED");
  await assert.rejects(
    () => applyProcurementImport(readOnlyReview, context({ canWrite: false }), { saveRFQ: async () => {}, savePurchaseOrder: async () => {} }),
    /permission/i,
  );

  const workbook = XLSX.read(exportedBytes(), { type: "array", cellDates: true });
  const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets.RFQs, { header: 1, raw: true });
  workbook.Sheets.RFQs = XLSX.utils.aoa_to_sheet([rows[0]]);
  const missingRowBytes = new Uint8Array(XLSX.write(workbook, { bookType: "xlsx", type: "array" }) as Uint8Array);
  const missingReview = buildProcurementImportReview(missingRowBytes, context());
  assert.equal(missingReview.proposals.some((item) => item.action === "DELETE"), false);
});

test("Apply revalidates current state and calls only the existing authoritative save callbacks", async () => {
  const edited = editWorkbook(exportedBytes(), "RFQs", "B2", "Approved title");
  const review = buildProcurementImportReview(edited, context());
  const calls: Array<{ rfq?: Partial<RFQ>; po?: Partial<PurchaseOrder> }> = [];
  const result = await applyProcurementImport(review, context(), {
    saveRFQ: async (next) => { calls.push({ rfq: next }); },
    savePurchaseOrder: async (next) => { calls.push({ po: next }); },
  });
  assert.equal(result.appliedProposalIds.length, 1);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].rfq?.title, "Approved title");
  assert.equal(calls[0].rfq?.status, undefined);

  const staleReview = buildProcurementImportReview(edited, context());
  await assert.rejects(
    () => applyProcurementImport(staleReview, context({ rfqs: [{ ...rfq, title: "Changed after review" }] }), { saveRFQ: async () => {}, savePurchaseOrder: async () => {} }),
    /stale|changed/i,
  );
});
