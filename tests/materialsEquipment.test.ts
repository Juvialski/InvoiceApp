import test from "node:test";
import assert from "node:assert/strict";
import type { ProjectEquipment, ProjectMaterial, PurchaseOrder, PurchaseOrderReceipt } from "../src/types.ts";
import {
  deriveProjectEquipmentViews,
  deriveProjectMaterialReconciliationDiscrepancies,
  deriveProjectMaterialViews,
} from "../src/lib/materialsEquipment.ts";
import { buildProjectFieldOperationsAttentionSignals } from "../src/utils/projectManagementViewModel.ts";

const projectId = "project-1";
const line = {
  id: "po-line-1",
  companyId: "company-1",
  purchaseOrderId: "po-1",
  lineNumber: 1,
  description: "Ready-mix concrete",
  quantity: 100,
  unit: "cu.m",
  unitPrice: 100,
  amount: 10_000,
};
const purchaseOrder = {
  id: "po-1",
  companyId: "company-1",
  poNumber: "PO-001",
  vendorId: "vendor-1",
  projectId,
  currency: "PHP",
  status: "ISSUED",
  lines: [line],
} as PurchaseOrder;
const material: ProjectMaterial = {
  id: "material-1",
  companyId: "company-1",
  projectId,
  materialName: "Ready-mix concrete",
  unit: "cu.m",
  requiredQuantity: 100,
  purchaseOrderId: purchaseOrder.id,
  purchaseOrderLineId: line.id,
  status: "ACTIVE",
};
const receipts: PurchaseOrderReceipt[] = [
  { id: "receipt-1", companyId: "company-1", purchaseOrderId: purchaseOrder.id, receiptNumber: "REC-001", receiptDate: "2026-09-01", status: "RECEIVED", lines: [{ id: "receipt-line-1", companyId: "company-1", purchaseOrderReceiptId: "receipt-1", purchaseOrderLineId: line.id, lineNumber: 1, receivedQuantity: 40 }] },
  { id: "receipt-2", companyId: "company-1", purchaseOrderId: purchaseOrder.id, receiptNumber: "REC-002", receiptDate: "2026-09-02", status: "RECEIVED", lines: [{ id: "receipt-line-2", companyId: "company-1", purchaseOrderReceiptId: "receipt-2", purchaseOrderLineId: line.id, lineNumber: 1, receivedQuantity: 25 }] },
  { id: "receipt-void", companyId: "company-1", purchaseOrderId: purchaseOrder.id, receiptNumber: "REC-VOID", receiptDate: "2026-09-03", status: "VOIDED", lines: [{ id: "receipt-line-void", companyId: "company-1", purchaseOrderReceiptId: "receipt-void", purchaseOrderLineId: line.id, lineNumber: 1, receivedQuantity: 99 }] },
];
const logs = [
  { id: "log-1", projectId, siteDate: "2026-09-01", status: "FINALIZED" },
  { id: "log-2", projectId, siteDate: "2026-09-02", status: "SUBMITTED" },
  { id: "log-void", projectId, siteDate: "2026-09-04", status: "VOID" },
] as any;

test("materials derive ordered, valid received, outstanding, and deterministic site evidence", () => {
  const deliveries = [
    { id: "delivery-1", projectId, siteLogId: "log-1", materialId: material.id, materialNameSnapshot: "Ready-mix concrete", quantityObserved: 40, unitSnapshot: "cu.m" },
    { id: "delivery-2", projectId, siteLogId: "log-2", materialId: material.id, materialNameSnapshot: "Ready-mix concrete", quantityObserved: 20, unitSnapshot: "cu.m", supplierDeliveryReference: "DR-002" },
    { id: "delivery-void", projectId, siteLogId: "log-void", materialId: material.id, materialNameSnapshot: "Ready-mix concrete", quantityObserved: 999, unitSnapshot: "cu.m" },
  ] as any;
  const [view] = deriveProjectMaterialViews(projectId, [material], [purchaseOrder], receipts, logs, deliveries, [{ id: "vendor-1", name: "BuildMix" } as any], true);
  assert.equal(view.procurement.state, "AVAILABLE");
  assert.equal(view.procurement.orderedQuantity, 100);
  assert.equal(view.procurement.receivedQuantity, 65);
  assert.equal(view.procurement.outstandingQuantity, 35);
  assert.equal(view.procurement.receiptCount, 2);
  assert.equal(view.siteEvidence.count, 2);
  assert.equal(view.siteEvidence.latestDate, "2026-09-02");
  assert.equal(view.siteEvidence.latestQuantity, 20);

  const [discrepancy] = deriveProjectMaterialReconciliationDiscrepancies(projectId, [material], [purchaseOrder], receipts, logs, deliveries, true);
  assert.equal(discrepancy.observedQuantity, 60);
  assert.equal(discrepancy.formalReceivedQuantity, 65);
});

test("material procurement values are withheld instead of becoming false zeroes", () => {
  const [view] = deriveProjectMaterialViews(projectId, [material], undefined, undefined, logs, [], [], false);
  assert.equal(view.procurement.state, "RESTRICTED");
  assert.equal(view.procurement.receivedQuantity, undefined);
  assert.equal(view.procurement.outstandingQuantity, undefined);
});

test("equipment usage derives from stable register links and excludes void Site Logs", () => {
  const equipment: ProjectEquipment = { id: "equipment-1", companyId: "company-1", projectId, equipmentName: "Excavator", equipmentType: "Earthworks", equipmentSource: "OWNED", status: "ACTIVE" };
  const observations = [
    { id: "observation-1", siteLogId: "log-1", equipmentId: equipment.id, equipmentName: "Excavator", operatingHours: 7.5, idleHours: 1, conditionStatus: "Operational" },
    { id: "observation-2", siteLogId: "log-2", equipmentId: equipment.id, equipmentName: "Excavator", operatingHours: 2, idleHours: 0.5, conditionStatus: "Observed" },
    { id: "observation-void", siteLogId: "log-void", equipmentId: equipment.id, equipmentName: "Excavator", operatingHours: 100, idleHours: 100, conditionStatus: "VOID" },
    { id: "observation-fuzzy", siteLogId: "log-1", equipmentName: "Excavator", operatingHours: 999, idleHours: 999, conditionStatus: "Fuzzy" },
  ] as any;
  const [view] = deriveProjectEquipmentViews(projectId, [equipment], logs, observations);
  assert.equal(view.evidence.observationCount, 2);
  assert.equal(view.evidence.operatingHours, 9.5);
  assert.equal(view.evidence.idleHours, 1.5);
  assert.equal(view.evidence.lastObservedDate, "2026-09-02");
  assert.equal(view.evidence.latestCondition, "Observed");
});

test("field attention signals use explicit safety, issue, equipment, and reconciliation facts", () => {
  const signals = buildProjectFieldOperationsAttentionSignals({ id: projectId }, {
    siteLogs: [{ id: "log-1", projectId, siteDate: "2026-09-02", status: "FINALIZED" }],
    safety: [{ id: "safety-1", siteLogId: "log-1", severity: "HIGH", isResolved: false, description: "Unprotected edge" }],
    issues: [{ id: "issue-1", siteLogId: "log-1", severity: "CRITICAL", status: "OPEN", description: "Access blocked" }],
    equipment: [{ id: "equipment-1", projectId, equipmentName: "Excavator", status: "OUT_OF_SERVICE" }],
    materialDiscrepancies: [{ id: "gap-1", materialName: "Concrete", observedQuantity: 60, formalReceivedQuantity: 65, unit: "cu.m", latestDate: "2026-09-02" }],
  });
  assert.deepEqual(new Set(signals.map((signal) => signal.flag)), new Set(["UNRESOLVED_SAFETY_EVENT", "UNRESOLVED_FIELD_ISSUE", "EQUIPMENT_OUT_OF_SERVICE", "MATERIAL_RECONCILIATION_GAP"]));
  assert.ok(signals.every((signal) => signal.category === "field-operations"));
  assert.ok(signals.every((signal) => signal.evidence && signal.source && signal.tab));
});
