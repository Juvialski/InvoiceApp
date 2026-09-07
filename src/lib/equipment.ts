import type {
  Equipment,
  EquipmentAssignment,
  EquipmentCurrentState,
  EquipmentLifecycleStatus,
  EquipmentSource,
  Project,
  ProjectEquipment,
} from "../types.ts";
import { requireActiveCompanyId } from "./companyContext.ts";
import { supabase } from "./supabase.ts";

export const EQUIPMENT_REGISTRY_STORAGE_KEY = "engineering_equipment_registry";
export const EQUIPMENT_ASSIGNMENTS_STORAGE_KEY = "engineering_equipment_assignments";

export interface EquipmentSaveInput {
  id?: string;
  assetReference?: string | null;
  equipmentName: string;
  equipmentType?: string | null;
  equipmentSource?: EquipmentSource;
  providerName?: string | null;
  lifecycleStatus?: EquipmentLifecycleStatus;
  notes?: string | null;
}

export interface EquipmentWorkspaceData {
  equipment: Equipment[];
  assignments: EquipmentAssignment[];
}

export interface EquipmentMutationResult {
  equipment: Equipment;
  assignment?: EquipmentAssignment | null;
  idempotent?: boolean;
}

type Row = Record<string, unknown>;

function text(value: unknown): string | undefined {
  return value === null || value === undefined || value === "" ? undefined : String(value);
}

function localId(prefix: string) {
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

function writeJson<T>(key: string, value: T[], storage?: Storage) {
  try { (storage || (typeof localStorage === "undefined" ? undefined : localStorage))?.setItem(key, JSON.stringify(value)); } catch { /* best effort guest storage */ }
}

export function equipmentFromRow(row: Row): Equipment {
  const lifecycleStatus = String(row.lifecycle_status || "AVAILABLE").toUpperCase() as EquipmentLifecycleStatus;
  return {
    id: String(row.id),
    companyId: text(row.company_id),
    assetReference: text(row.asset_reference) || null,
    equipmentName: String(row.equipment_name || ""),
    equipmentType: text(row.equipment_type) || null,
    equipmentSource: String(row.equipment_source || "OTHER").toUpperCase() as EquipmentSource,
    providerName: text(row.provider_name) || null,
    lifecycleStatus,
    currentState: text(row.current_state)?.toUpperCase() as EquipmentCurrentState | undefined || lifecycleStatus,
    currentAssignmentId: text(row.current_assignment_id) || null,
    currentProjectId: text(row.current_project_id) || null,
    currentAssignmentStart: text(row.current_assignment_start) || null,
    notes: text(row.notes) || null,
    createdByUserId: text(row.created_by_user_id) || null,
    updatedByUserId: text(row.updated_by_user_id) || null,
    createdAt: text(row.created_at),
    updatedAt: text(row.updated_at),
  };
}

export function equipmentAssignmentFromRow(row: Row): EquipmentAssignment {
  return {
    id: String(row.id),
    companyId: text(row.company_id),
    equipmentId: String(row.equipment_id),
    projectId: String(row.project_id),
    assignmentStart: String(row.assignment_start || new Date().toISOString().slice(0, 10)),
    assignmentEnd: text(row.assignment_end) || null,
    assignedByUserId: text(row.assigned_by_user_id) || null,
    returnedByUserId: text(row.returned_by_user_id) || null,
    notes: text(row.notes) || null,
    transferFromAssignmentId: text(row.transfer_from_assignment_id) || null,
    createdAt: text(row.created_at),
    updatedAt: text(row.updated_at),
  };
}

export function deriveEquipmentCurrentState(equipment: readonly Equipment[], assignments: readonly EquipmentAssignment[]): Equipment[] {
  const activeByEquipment = new Map<string, EquipmentAssignment>();
  for (const assignment of assignments) {
    if (!assignment.assignmentEnd && !activeByEquipment.has(assignment.equipmentId)) activeByEquipment.set(assignment.equipmentId, assignment);
  }
  return equipment.map((item) => {
    const assignment = activeByEquipment.get(item.id);
    return {
      ...item,
      currentState: assignment ? "ASSIGNED" : item.lifecycleStatus,
      currentAssignmentId: assignment?.id || null,
      currentProjectId: assignment?.projectId || null,
      currentAssignmentStart: assignment?.assignmentStart || null,
    };
  });
}

export function readEquipmentRegistryFromLocal(storage?: Storage) {
  return readJson<Equipment>(EQUIPMENT_REGISTRY_STORAGE_KEY, storage);
}

export function writeEquipmentRegistryToLocal(value: Equipment[], storage?: Storage) {
  writeJson(EQUIPMENT_REGISTRY_STORAGE_KEY, value, storage);
}

export function readEquipmentAssignmentsFromLocal(storage?: Storage) {
  return readJson<EquipmentAssignment>(EQUIPMENT_ASSIGNMENTS_STORAGE_KEY, storage);
}

export function writeEquipmentAssignmentsToLocal(value: EquipmentAssignment[], storage?: Storage) {
  writeJson(EQUIPMENT_ASSIGNMENTS_STORAGE_KEY, value, storage);
}

export function buildLocalEquipment(input: EquipmentSaveInput, existing?: Equipment, companyId = "guest-company", actorUserId?: string | null): Equipment {
  const now = new Date().toISOString();
  return {
    id: input.id || localId("equipment"),
    companyId,
    assetReference: input.assetReference?.trim().toUpperCase() || null,
    equipmentName: input.equipmentName.trim(),
    equipmentType: input.equipmentType?.trim() || null,
    equipmentSource: input.equipmentSource || existing?.equipmentSource || "OTHER",
    providerName: input.providerName?.trim() || null,
    lifecycleStatus: existing?.lifecycleStatus || input.lifecycleStatus || "AVAILABLE",
    currentState: existing?.currentState || "AVAILABLE",
    currentAssignmentId: existing?.currentAssignmentId || null,
    currentProjectId: existing?.currentProjectId || null,
    currentAssignmentStart: existing?.currentAssignmentStart || null,
    notes: input.notes?.trim() || null,
    createdByUserId: existing?.createdByUserId || actorUserId || null,
    updatedByUserId: actorUserId || null,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
}

export async function loadEquipmentWorkspaceFromSupabase(): Promise<EquipmentWorkspaceData> {
  if (!supabase) return { equipment: readEquipmentRegistryFromLocal(), assignments: readEquipmentAssignmentsFromLocal() };
  const companyId = requireActiveCompanyId();
  const [equipment, assignments] = await Promise.all([
    supabase.from("engineering_equipment_current").select("*").eq("company_id", companyId).order("equipment_name", { ascending: true }),
    supabase.from("engineering_equipment_assignments").select("*").eq("company_id", companyId).order("assignment_start", { ascending: false }),
  ]);
  if (equipment.error) throw equipment.error;
  if (assignments.error) throw assignments.error;
  return {
    equipment: (equipment.data || []).map((row) => equipmentFromRow(row as Row)),
    assignments: (assignments.data || []).map((row) => equipmentAssignmentFromRow(row as Row)),
  };
}

export async function saveEquipmentToSupabase(input: EquipmentSaveInput): Promise<Equipment> {
  if (!supabase) throw new Error("Supabase is not configured.");
  const companyId = requireActiveCompanyId();
  const { data, error } = await supabase.rpc("save_engineering_equipment", {
    p_equipment: {
      id: input.id || null,
      companyId,
      assetReference: input.assetReference?.trim().toUpperCase() || null,
      equipmentName: input.equipmentName.trim(),
      equipmentType: input.equipmentType?.trim() || null,
      equipmentSource: input.equipmentSource || "OTHER",
      lifecycleStatus: input.lifecycleStatus || "AVAILABLE",
      providerName: input.providerName?.trim() || null,
      notes: input.notes?.trim() || null,
    },
  });
  if (error) throw error;
  return equipmentFromRow(data as Row);
}

function mutationFromRpc(value: unknown): EquipmentMutationResult {
  const row = value && typeof value === "object" ? value as Row : {};
  if (!row.equipment || typeof row.equipment !== "object") throw new Error("Equipment operation returned an invalid record.");
  return {
    equipment: equipmentFromRow(row.equipment as Row),
    assignment: row.assignment && typeof row.assignment === "object" ? equipmentAssignmentFromRow(row.assignment as Row) : null,
    idempotent: row.idempotent === true,
  };
}

export async function assignEquipmentToSupabase(equipmentId: string, projectId: string, assignmentStart: string, notes?: string) {
  if (!supabase) throw new Error("Supabase is not configured.");
  const { data, error } = await supabase.rpc("assign_engineering_equipment", { p_equipment_id: equipmentId, p_project_id: projectId, p_assignment_start: assignmentStart, p_notes: notes?.trim() || null });
  if (error) throw error;
  return mutationFromRpc(data);
}

export async function transferEquipmentToSupabase(equipmentId: string, projectId: string, assignmentStart: string, notes?: string) {
  if (!supabase) throw new Error("Supabase is not configured.");
  const { data, error } = await supabase.rpc("transfer_engineering_equipment", { p_equipment_id: equipmentId, p_project_id: projectId, p_assignment_start: assignmentStart, p_notes: notes?.trim() || null });
  if (error) throw error;
  return mutationFromRpc(data);
}

export async function returnEquipmentToSupabase(equipmentId: string, assignmentEnd: string, notes?: string) {
  if (!supabase) throw new Error("Supabase is not configured.");
  const { data, error } = await supabase.rpc("return_engineering_equipment", { p_equipment_id: equipmentId, p_assignment_end: assignmentEnd, p_notes: notes?.trim() || null });
  if (error) throw error;
  return mutationFromRpc(data);
}

export async function setEquipmentLifecycleToSupabase(equipmentId: string, lifecycleStatus: EquipmentLifecycleStatus, reason: string) {
  if (!supabase) throw new Error("Supabase is not configured.");
  const { data, error } = await supabase.rpc("set_engineering_equipment_lifecycle", { p_equipment_id: equipmentId, p_lifecycle_status: lifecycleStatus, p_reason: reason.trim() });
  if (error) throw error;
  return mutationFromRpc(data);
}

export function applyLocalEquipmentAssignment(
  equipment: readonly Equipment[],
  assignments: readonly EquipmentAssignment[],
  input: { equipmentId: string; projectId: string; assignmentStart: string; notes?: string },
  projects: readonly Project[],
): EquipmentMutationResult {
  const item = equipment.find((candidate) => candidate.id === input.equipmentId);
  if (!item) throw new Error("Equipment is unavailable.");
  if (!projects.some((project) => project.id === input.projectId && project.status !== "ARCHIVED")) throw new Error("Choose an active Project in this workspace.");
  const active = assignments.find((assignment) => assignment.equipmentId === item.id && !assignment.assignmentEnd);
  if (active) {
    if (active.projectId === input.projectId && active.assignmentStart === input.assignmentStart) return { equipment: item, assignment: active, idempotent: true };
    throw new Error("Equipment already has an active Project assignment.");
  }
  if (item.lifecycleStatus !== "AVAILABLE") throw new Error("Equipment is not available for assignment.");
  const now = new Date().toISOString();
  const assignment: EquipmentAssignment = { id: localId("equipment-assignment"), companyId: item.companyId, equipmentId: item.id, projectId: input.projectId, assignmentStart: input.assignmentStart, assignmentEnd: null, assignedByUserId: null, returnedByUserId: null, notes: input.notes?.trim() || null, transferFromAssignmentId: null, createdAt: now, updatedAt: now };
  return { equipment: { ...item, currentState: "ASSIGNED", currentAssignmentId: assignment.id, currentProjectId: input.projectId, currentAssignmentStart: input.assignmentStart, updatedAt: now }, assignment, idempotent: false };
}

export function applyLocalEquipmentReturn(equipment: readonly Equipment[], assignments: readonly EquipmentAssignment[], equipmentId: string, assignmentEnd: string, notes?: string): EquipmentMutationResult {
  const item = equipment.find((candidate) => candidate.id === equipmentId);
  if (!item) throw new Error("Equipment is unavailable.");
  const active = assignments.find((assignment) => assignment.equipmentId === equipmentId && !assignment.assignmentEnd);
  if (!active) return { equipment: item, assignment: null, idempotent: true };
  if (assignmentEnd < active.assignmentStart) throw new Error("Return date cannot precede the assignment start.");
  const now = new Date().toISOString();
  return { equipment: { ...item, currentState: item.lifecycleStatus, currentAssignmentId: null, currentProjectId: null, currentAssignmentStart: null, updatedAt: now }, assignment: { ...active, assignmentEnd, notes: [active.notes, notes?.trim()].filter(Boolean).join("\n") || null, updatedAt: now }, idempotent: false };
}

export function applyLocalEquipmentTransfer(
  equipment: readonly Equipment[],
  assignments: readonly EquipmentAssignment[],
  input: { equipmentId: string; projectId: string; assignmentStart: string; notes?: string },
  projects: readonly Project[],
): EquipmentMutationResult {
  const item = equipment.find((candidate) => candidate.id === input.equipmentId);
  if (!item) throw new Error("Equipment is unavailable.");
  if (!projects.some((project) => project.id === input.projectId && project.status !== "ARCHIVED")) throw new Error("Choose an active Project in this workspace.");
  const active = assignments.find((assignment) => assignment.equipmentId === item.id && !assignment.assignmentEnd);
  if (!active) throw new Error("Equipment has no active assignment to transfer.");
  if (active.projectId === input.projectId && active.assignmentStart === input.assignmentStart) return { equipment: item, assignment: active, idempotent: true };
  if (input.assignmentStart < active.assignmentStart) throw new Error("Transfer date cannot precede the assignment start.");
  const now = new Date().toISOString();
  const assignment: EquipmentAssignment = { id: localId("equipment-assignment"), companyId: item.companyId, equipmentId: item.id, projectId: input.projectId, assignmentStart: input.assignmentStart, assignmentEnd: null, assignedByUserId: null, returnedByUserId: null, notes: input.notes?.trim() || null, transferFromAssignmentId: active.id, createdAt: now, updatedAt: now };
  return { equipment: { ...item, currentState: "ASSIGNED", currentAssignmentId: assignment.id, currentProjectId: input.projectId, currentAssignmentStart: input.assignmentStart, updatedAt: now }, assignment, idempotent: false };
}

/** Demo/read-only bridge: unique legacy asset references become local canonical identities. */
export function buildEquipmentWorkspaceFromProjectRegister(rows: readonly ProjectEquipment[], companyId = "guest-company"): EquipmentWorkspaceData {
  const equipment: Equipment[] = [];
  const assignments: EquipmentAssignment[] = [];
  for (const row of rows) {
    const id = row.canonicalEquipmentId || `legacy-equipment-${row.id}`;
    if (equipment.some((item) => item.id === id)) continue;
    const lifecycleStatus: EquipmentLifecycleStatus = row.status === "OUT_OF_SERVICE" || row.status === "INACTIVE" ? "OUT_OF_SERVICE" : "AVAILABLE";
    const item: Equipment = { id, companyId: row.companyId || companyId, assetReference: row.assetReference || null, equipmentName: row.equipmentName, equipmentType: row.equipmentType || null, equipmentSource: row.equipmentSource, providerName: row.providerName || null, lifecycleStatus, currentState: lifecycleStatus, currentAssignmentId: null, currentProjectId: null, currentAssignmentStart: null, notes: row.notes || null, createdByUserId: row.createdByUserId || null, updatedByUserId: row.updatedByUserId || null, createdAt: row.createdAt, updatedAt: row.updatedAt };
    equipment.push(item);
    if (row.status === "ACTIVE" && !row.assignmentEnd) {
      const assignment: EquipmentAssignment = { id: `legacy-assignment-${row.id}`, companyId: item.companyId, equipmentId: id, projectId: row.projectId, assignmentStart: row.assignmentStart || row.createdAt?.slice(0, 10) || new Date().toISOString().slice(0, 10), assignmentEnd: null, assignedByUserId: row.updatedByUserId || row.createdByUserId || null, returnedByUserId: null, notes: "Derived from the existing project Equipment Register for demo/read-through only.", transferFromAssignmentId: null, createdAt: row.createdAt, updatedAt: row.updatedAt };
      assignments.push(assignment);
    }
  }
  return { equipment: deriveEquipmentCurrentState(equipment, assignments), assignments };
}
