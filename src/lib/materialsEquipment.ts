import type {
  ProjectEquipment,
  ProjectEquipmentSource,
  ProjectEquipmentStatus,
  ProjectMaterial,
  ProjectMaterialStatus,
  PurchaseOrder,
  PurchaseOrderReceipt,
  Vendor,
} from "../types.ts";
import type {
  EngineeringDailySiteLog,
  EngineeringDailySiteLogEquipment,
  EngineeringDailySiteLogMaterialDelivery,
} from "./dailySiteLogs.ts";
import { calculateLineReceiptProgress } from "../utils/purchaseOrderReceipts.ts";
import { requireActiveCompanyId } from "./companyContext.ts";
import { supabase } from "./supabase.ts";

export const MATERIALS_STORAGE_KEY = "engineering_project_materials";
export const EQUIPMENT_STORAGE_KEY = "engineering_project_equipment";

type Row = Record<string, unknown>;

export type MaterialsEquipmentSourceState = "AVAILABLE" | "PARTIAL" | "RESTRICTED" | "UNAVAILABLE";

export interface ProjectMaterialProcurementView {
  state: MaterialsEquipmentSourceState;
  poNumber?: string;
  supplierName?: string;
  orderedQuantity?: number;
  receivedQuantity?: number;
  outstandingQuantity?: number;
  progressPercent?: number;
  receiptCount?: number;
  reason?: string;
}

export interface ProjectMaterialDeliveryEvidenceView {
  count: number;
  latestDate?: string;
  latestQuantity?: number;
  latestUnitSnapshot?: string;
  latestReference?: string;
  latestCondition?: string;
}

export interface ProjectMaterialView {
  material: ProjectMaterial;
  procurement: ProjectMaterialProcurementView;
  siteEvidence: ProjectMaterialDeliveryEvidenceView;
}

export interface ProjectMaterialReconciliationDiscrepancy {
  id: string;
  materialId: string;
  materialName: string;
  observedQuantity: number;
  formalReceivedQuantity: number;
  unit: string;
  latestDate?: string;
}

export interface ProjectEquipmentEvidenceView {
  observationCount: number;
  lastObservedDate?: string;
  latestCondition?: string;
  operatingHours: number;
  idleHours: number;
}

export interface ProjectEquipmentView {
  equipment: ProjectEquipment;
  evidence: ProjectEquipmentEvidenceView;
}

export interface MaterialsEquipmentWorkspaceData {
  materials: ProjectMaterial[];
  equipment: ProjectEquipment[];
}

export interface ProjectMaterialSaveInput {
  id?: string;
  projectId: string;
  materialName: string;
  referenceCode?: string | null;
  category?: string | null;
  unit: string;
  requiredQuantity: number;
  projectCostCodeId?: string | null;
  purchaseOrderId?: string | null;
  purchaseOrderLineId?: string | null;
  status?: ProjectMaterialStatus;
  notes?: string | null;
}

export interface ProjectEquipmentSaveInput {
  id?: string;
  projectId: string;
  assetReference?: string | null;
  equipmentName: string;
  equipmentType?: string | null;
  equipmentSource?: ProjectEquipmentSource;
  providerName?: string | null;
  assignmentStart?: string | null;
  assignmentEnd?: string | null;
  status?: ProjectEquipmentStatus;
  notes?: string | null;
}

function text(value: unknown): string | undefined {
  return value === null || value === undefined || value === "" ? undefined : String(value);
}

function numberValue(value: unknown, fallback = 0): number {
  const result = Number(value);
  return Number.isFinite(result) ? result : fallback;
}

function localId(prefix: string): string {
  return globalThis.crypto?.randomUUID?.() || `local-${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function readJson<T>(key: string, storage?: Storage): T[] {
  const target = storage || (typeof localStorage === "undefined" ? undefined : localStorage);
  if (!target) return [];
  try {
    const value = JSON.parse(target.getItem(key) || "[]");
    return Array.isArray(value) ? value as T[] : [];
  } catch {
    return [];
  }
}

function writeJson<T>(key: string, value: T[], storage?: Storage): void {
  const target = storage || (typeof localStorage === "undefined" ? undefined : localStorage);
  if (!target) return;
  try { target.setItem(key, JSON.stringify(value)); } catch { /* guest storage is best effort */ }
}

export function projectMaterialFromRow(row: Row): ProjectMaterial {
  return {
    id: String(row.id),
    companyId: text(row.company_id),
    projectId: String(row.project_id || ""),
    materialName: String(row.material_name || ""),
    referenceCode: text(row.reference_code) || null,
    category: text(row.category) || null,
    unit: String(row.unit || "pcs"),
    requiredQuantity: numberValue(row.required_quantity),
    projectCostCodeId: text(row.project_cost_code_id) || null,
    purchaseOrderId: text(row.purchase_order_id) || null,
    purchaseOrderLineId: text(row.purchase_order_line_id) || null,
    status: String(row.status || "ACTIVE") as ProjectMaterialStatus,
    notes: text(row.notes) || null,
    createdByUserId: text(row.created_by_user_id) || null,
    updatedByUserId: text(row.updated_by_user_id) || null,
    createdAt: text(row.created_at),
    updatedAt: text(row.updated_at),
  };
}

export function projectEquipmentFromRow(row: Row): ProjectEquipment {
  return {
    id: String(row.id),
    companyId: text(row.company_id),
    projectId: String(row.project_id || ""),
    assetReference: text(row.asset_reference) || null,
    equipmentName: String(row.equipment_name || ""),
    equipmentType: text(row.equipment_type) || null,
    equipmentSource: String(row.equipment_source || "OTHER") as ProjectEquipmentSource,
    providerName: text(row.provider_name) || null,
    assignmentStart: text(row.assignment_start) || null,
    assignmentEnd: text(row.assignment_end) || null,
    status: String(row.status || "ACTIVE") as ProjectEquipmentStatus,
    notes: text(row.notes) || null,
    createdByUserId: text(row.created_by_user_id) || null,
    updatedByUserId: text(row.updated_by_user_id) || null,
    createdAt: text(row.created_at),
    updatedAt: text(row.updated_at),
  };
}

export function readProjectMaterialsFromLocal(storage?: Storage): ProjectMaterial[] {
  return readJson<ProjectMaterial>(MATERIALS_STORAGE_KEY, storage);
}

export function writeProjectMaterialsToLocal(value: ProjectMaterial[], storage?: Storage): void {
  writeJson(MATERIALS_STORAGE_KEY, value, storage);
}

export function readProjectEquipmentFromLocal(storage?: Storage): ProjectEquipment[] {
  return readJson<ProjectEquipment>(EQUIPMENT_STORAGE_KEY, storage);
}

export function writeProjectEquipmentToLocal(value: ProjectEquipment[], storage?: Storage): void {
  writeJson(EQUIPMENT_STORAGE_KEY, value, storage);
}

export function buildLocalProjectMaterial(input: ProjectMaterialSaveInput, existing?: ProjectMaterial, companyId = "guest-company"): ProjectMaterial {
  const now = new Date().toISOString();
  return {
    id: input.id || localId("material"),
    companyId,
    projectId: input.projectId,
    materialName: input.materialName.trim(),
    referenceCode: input.referenceCode?.trim() || null,
    category: input.category?.trim() || null,
    unit: input.unit.trim() || "pcs",
    requiredQuantity: Math.max(0, Number(input.requiredQuantity) || 0),
    projectCostCodeId: input.projectCostCodeId || null,
    purchaseOrderId: input.purchaseOrderId || null,
    purchaseOrderLineId: input.purchaseOrderLineId || null,
    status: input.status || existing?.status || "ACTIVE",
    notes: input.notes?.trim() || null,
    createdByUserId: existing?.createdByUserId || null,
    updatedByUserId: null,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
}

export function buildLocalProjectEquipment(input: ProjectEquipmentSaveInput, existing?: ProjectEquipment, companyId = "guest-company"): ProjectEquipment {
  const now = new Date().toISOString();
  return {
    id: input.id || localId("equipment"),
    companyId,
    projectId: input.projectId,
    assetReference: input.assetReference?.trim() || null,
    equipmentName: input.equipmentName.trim(),
    equipmentType: input.equipmentType?.trim() || null,
    equipmentSource: input.equipmentSource || existing?.equipmentSource || "OTHER",
    providerName: input.providerName?.trim() || null,
    assignmentStart: input.assignmentStart || null,
    assignmentEnd: input.assignmentEnd || null,
    status: input.status || existing?.status || "ACTIVE",
    notes: input.notes?.trim() || null,
    createdByUserId: existing?.createdByUserId || null,
    updatedByUserId: null,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
}

export async function loadProjectMaterialsEquipmentFromSupabase(): Promise<MaterialsEquipmentWorkspaceData> {
  if (!supabase) return { materials: readProjectMaterialsFromLocal(), equipment: readProjectEquipmentFromLocal() };
  const companyId = requireActiveCompanyId();
  const [materials, equipment] = await Promise.all([
    supabase.from("engineering_project_materials").select("*").eq("company_id", companyId).order("updated_at", { ascending: false }),
    supabase.from("engineering_project_equipment").select("*").eq("company_id", companyId).order("updated_at", { ascending: false }),
  ]);
  if (materials.error) throw materials.error;
  if (equipment.error) throw equipment.error;
  return {
    materials: (materials.data || []).map((row) => projectMaterialFromRow(row as Row)),
    equipment: (equipment.data || []).map((row) => projectEquipmentFromRow(row as Row)),
  };
}

export async function saveProjectMaterialToSupabase(input: ProjectMaterialSaveInput): Promise<ProjectMaterial> {
  if (!supabase) {
    const local = readProjectMaterialsFromLocal();
    const existing = input.id ? local.find((item) => item.id === input.id) : undefined;
    const saved = buildLocalProjectMaterial(input, existing);
    writeProjectMaterialsToLocal(existing ? local.map((item) => item.id === saved.id ? saved : item) : [saved, ...local]);
    return saved;
  }
  const companyId = requireActiveCompanyId();
  const { data, error } = await supabase.rpc("save_engineering_project_material", {
    p_material: {
      id: input.id || null,
      companyId,
      projectId: input.projectId,
      materialName: input.materialName.trim(),
      referenceCode: input.referenceCode?.trim() || null,
      category: input.category?.trim() || null,
      unit: input.unit.trim() || "pcs",
      requiredQuantity: Number(input.requiredQuantity) || 0,
      projectCostCodeId: input.projectCostCodeId || null,
      purchaseOrderId: input.purchaseOrderId || null,
      purchaseOrderLineId: input.purchaseOrderLineId || null,
      status: input.status || "ACTIVE",
      notes: input.notes?.trim() || null,
    },
  });
  if (error) throw error;
  return projectMaterialFromRow(data as Row);
}

export async function saveProjectEquipmentToSupabase(input: ProjectEquipmentSaveInput): Promise<ProjectEquipment> {
  if (!supabase) {
    const local = readProjectEquipmentFromLocal();
    const existing = input.id ? local.find((item) => item.id === input.id) : undefined;
    const saved = buildLocalProjectEquipment(input, existing);
    writeProjectEquipmentToLocal(existing ? local.map((item) => item.id === saved.id ? saved : item) : [saved, ...local]);
    return saved;
  }
  const companyId = requireActiveCompanyId();
  const { data, error } = await supabase.rpc("save_engineering_project_equipment", {
    p_equipment: {
      id: input.id || null,
      companyId,
      projectId: input.projectId,
      assetReference: input.assetReference?.trim() || null,
      equipmentName: input.equipmentName.trim(),
      equipmentType: input.equipmentType?.trim() || null,
      equipmentSource: input.equipmentSource || "OTHER",
      providerName: input.providerName?.trim() || null,
      assignmentStart: input.assignmentStart || null,
      assignmentEnd: input.assignmentEnd || null,
      status: input.status || "ACTIVE",
      notes: input.notes?.trim() || null,
    },
  });
  if (error) throw error;
  return projectEquipmentFromRow(data as Row);
}

function materialProcurementView(
  material: ProjectMaterial,
  purchaseOrders: readonly PurchaseOrder[] | undefined,
  receipts: readonly PurchaseOrderReceipt[] | undefined,
  vendors: readonly Vendor[] | undefined,
  canReadProcurement: boolean,
): ProjectMaterialProcurementView {
  if (!material.purchaseOrderId && !material.purchaseOrderLineId) return { state: "AVAILABLE", reason: "No formal procurement linkage recorded." };
  if (!canReadProcurement) return { state: "RESTRICTED", reason: "Procurement evidence is restricted for this role." };
  if (!purchaseOrders || !receipts) return { state: "UNAVAILABLE", reason: "Procurement evidence is not available in this workspace." };
  const purchaseOrder = purchaseOrders.find((item) => item.id === material.purchaseOrderId && item.projectId === material.projectId);
  const line = purchaseOrder?.lines?.find((item) => item.id === material.purchaseOrderLineId);
  if (!purchaseOrder || !line) return { state: "UNAVAILABLE", reason: "The linked purchase order line is not available or no longer matches this project." };
  const progress = calculateLineReceiptProgress(line, receipts.filter((receipt) => receipt.purchaseOrderId === purchaseOrder.id));
  const vendor = vendors?.find((item) => item.id === purchaseOrder.vendorId);
  return {
    state: "AVAILABLE",
    poNumber: purchaseOrder.poNumber,
    supplierName: vendor?.name,
    orderedQuantity: progress.orderedQuantity,
    receivedQuantity: progress.receivedQuantity,
    outstandingQuantity: progress.remainingQuantity,
    progressPercent: progress.progressPercent,
    receiptCount: (receipts || []).filter((receipt) => receipt.purchaseOrderId === purchaseOrder.id && receipt.status === "RECEIVED" && (receipt.lines || []).some((receiptLine) => receiptLine.purchaseOrderLineId === line.id)).length,
  };
}

export function deriveProjectMaterialViews(
  projectId: string,
  materials: readonly ProjectMaterial[],
  purchaseOrders: readonly PurchaseOrder[] | undefined,
  receipts: readonly PurchaseOrderReceipt[] | undefined,
  siteLogs: readonly EngineeringDailySiteLog[],
  deliveries: readonly EngineeringDailySiteLogMaterialDelivery[],
  vendors: readonly Vendor[] | undefined,
  canReadProcurement: boolean,
): ProjectMaterialView[] {
  const projectLogDates = new Map(siteLogs.filter((log) => log.projectId === projectId && log.status !== "VOID").map((log) => [log.id, log.siteDate]));
  return materials.filter((material) => material.projectId === projectId).map((material) => {
    const evidence = deliveries
      .filter((delivery) => delivery.projectId === projectId && delivery.materialId === material.id && projectLogDates.has(delivery.siteLogId))
      .map((delivery) => ({ delivery, siteDate: projectLogDates.get(delivery.siteLogId) || "" }))
      .sort((a, b) => b.siteDate.localeCompare(a.siteDate));
    const latest = evidence[0]?.delivery;
    return {
      material,
      procurement: materialProcurementView(material, purchaseOrders, receipts, vendors, canReadProcurement),
      siteEvidence: {
        count: evidence.length,
        latestDate: evidence[0]?.siteDate,
        latestQuantity: latest?.quantityObserved,
        latestUnitSnapshot: latest?.unitSnapshot,
        latestReference: latest?.supplierDeliveryReference || undefined,
        latestCondition: latest?.deliveryCondition || undefined,
      },
    };
  });
}

/**
 * Deterministic reconciliation candidates only. A delivery contributes only
 * when it has a stable material ID and its parent Site Log is submitted or
 * finalized; no
 * description or array-position fuzzy matching is used.
 */
export function deriveProjectMaterialReconciliationDiscrepancies(
  projectId: string,
  materials: readonly ProjectMaterial[],
  purchaseOrders: readonly PurchaseOrder[] | undefined,
  receipts: readonly PurchaseOrderReceipt[] | undefined,
  siteLogs: readonly EngineeringDailySiteLog[],
  deliveries: readonly EngineeringDailySiteLogMaterialDelivery[],
  canReadProcurement: boolean,
): ProjectMaterialReconciliationDiscrepancy[] {
  if (!canReadProcurement || !purchaseOrders || !receipts) return [];
  const validLogDates = new Map(siteLogs.filter((log) => log.projectId === projectId && ["SUBMITTED", "FINALIZED"].includes(log.status)).map((log) => [log.id, log.siteDate]));
  return materials.filter((material) => material.projectId === projectId && material.purchaseOrderId && material.purchaseOrderLineId).flatMap((material) => {
    const purchaseOrder = purchaseOrders.find((item) => item.id === material.purchaseOrderId && item.projectId === projectId);
    const line = purchaseOrder?.lines?.find((item) => item.id === material.purchaseOrderLineId);
    if (!purchaseOrder || !line) return [];
    const formalReceivedQuantity = calculateLineReceiptProgress(line, receipts.filter((receipt) => receipt.purchaseOrderId === purchaseOrder.id)).receivedQuantity;
    const materialDeliveries = deliveries.filter((delivery) => delivery.projectId === projectId && delivery.materialId === material.id && validLogDates.has(delivery.siteLogId));
    const observedQuantity = materialDeliveries.reduce((sum, delivery) => sum + delivery.quantityObserved, 0);
    if (!materialDeliveries.length || Math.abs(observedQuantity - formalReceivedQuantity) <= 0.0001) return [];
    const latestDate = materialDeliveries.map((delivery) => validLogDates.get(delivery.siteLogId) || "").sort().at(-1) || undefined;
    return [{ id: `material-reconciliation:${material.id}`, materialId: material.id, materialName: material.materialName, observedQuantity, formalReceivedQuantity, unit: material.unit, latestDate }];
  });
}

export function deriveProjectEquipmentViews(
  projectId: string,
  equipment: readonly ProjectEquipment[],
  siteLogs: readonly EngineeringDailySiteLog[],
  observations: readonly EngineeringDailySiteLogEquipment[],
): ProjectEquipmentView[] {
  const projectLogDates = new Map(siteLogs.filter((log) => log.projectId === projectId && log.status !== "VOID").map((log) => [log.id, log.siteDate]));
  return equipment.filter((item) => item.projectId === projectId).map((item) => {
    const linked = observations
      .filter((observation) => observation.equipmentId === item.id && projectLogDates.has(observation.siteLogId))
      .map((observation) => ({ observation, siteDate: projectLogDates.get(observation.siteLogId) || "" }))
      .sort((a, b) => b.siteDate.localeCompare(a.siteDate));
    return {
      equipment: item,
      evidence: {
        observationCount: linked.length,
        lastObservedDate: linked[0]?.siteDate,
        latestCondition: linked[0]?.observation.conditionStatus || undefined,
        operatingHours: linked.reduce((sum, item) => sum + (item.observation.operatingHours || 0), 0),
        idleHours: linked.reduce((sum, item) => sum + (item.observation.idleHours || 0), 0),
      },
    };
  });
}
