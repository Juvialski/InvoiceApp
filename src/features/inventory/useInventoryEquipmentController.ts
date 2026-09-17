import { useCallback, useState } from "react";
import type {
  Equipment,
  EquipmentAssignment,
  EquipmentLifecycleStatus,
  Project,
  ProjectEquipment,
  ProjectMaterial,
  PurchaseOrder,
  PurchaseOrderReceipt,
} from "../../types.ts";
import { PERMISSION_KEYS, type PermissionKey } from "../../utils/accessControl.ts";
import {
  buildLocalProjectEquipment,
  buildLocalProjectMaterial,
  readProjectEquipmentFromLocal,
  readProjectMaterialsFromLocal,
  saveProjectEquipmentToSupabase,
  saveProjectMaterialToSupabase,
  writeProjectEquipmentToLocal,
  writeProjectMaterialsToLocal,
  type ProjectEquipmentSaveInput,
  type ProjectMaterialSaveInput,
} from "../../lib/materialsEquipment.ts";
import {
  buildLocalInventoryItem,
  readInventoryItemsFromLocal,
  readInventoryMovementsFromLocal,
  recordInventoryMovementLocally,
  recordInventoryMovementToSupabase,
  reverseInventoryMovementToSupabase,
  saveInventoryItemToSupabase,
  writeInventoryItemsToLocal,
  writeInventoryMovementsToLocal,
  type InventoryBalance,
  type InventoryItem,
  type InventoryItemSaveInput,
  type InventoryMovement,
  type InventoryMovementInput,
} from "../../lib/inventory.ts";
import {
  applyLocalEquipmentAssignment,
  applyLocalEquipmentReturn,
  applyLocalEquipmentTransfer,
  buildLocalEquipment,
  readEquipmentAssignmentsFromLocal,
  readEquipmentRegistryFromLocal,
  saveEquipmentToSupabase,
  assignEquipmentToSupabase,
  transferEquipmentToSupabase,
  returnEquipmentToSupabase,
  setEquipmentLifecycleToSupabase,
  writeEquipmentAssignmentsToLocal,
  writeEquipmentRegistryToLocal,
  type EquipmentSaveInput,
} from "../../lib/equipment.ts";

export interface InventoryEquipmentWorkspaceData {
  materials: ProjectMaterial[];
  equipment: ProjectEquipment[];
  equipmentRegistry: Equipment[];
  equipmentAssignments: EquipmentAssignment[];
  inventoryItems: InventoryItem[];
  inventoryMovements: InventoryMovement[];
  inventoryBalances?: InventoryBalance[];
}

export interface InventoryEquipmentControllerOptions {
  authenticated: boolean;
  sessionPresent: boolean;
  actorUserId?: string;
  remoteWorkspaceConfigured: boolean;
  can: (permission: PermissionKey) => boolean;
  projects: readonly Project[];
  purchaseOrders: readonly PurchaseOrder[];
  purchaseOrderReceipts: readonly PurchaseOrderReceipt[];
  onSuccess: (message: string) => void;
  onError: (error: unknown, fallback: string) => void;
}

export interface InventoryEquipmentController extends InventoryEquipmentWorkspaceData {
  applyWorkspaceData: (data: InventoryEquipmentWorkspaceData) => void;
  loadGuestWorkspace: () => void;
  reset: () => void;
  saveMaterial: (input: ProjectMaterialSaveInput) => Promise<void>;
  saveEquipment: (input: ProjectEquipmentSaveInput) => Promise<void>;
  saveInventoryItem: (input: InventoryItemSaveInput) => Promise<InventoryItem>;
  recordInventoryMovement: (input: InventoryMovementInput) => Promise<InventoryMovement>;
  reverseInventoryMovement: (movementId: string, reason: string, idempotencyKey: string) => Promise<InventoryMovement>;
  saveCanonicalEquipment: (input: EquipmentSaveInput) => Promise<Equipment>;
  assignCanonicalEquipment: (equipmentId: string, projectId: string, assignmentStart: string, notes?: string) => Promise<void>;
  transferCanonicalEquipment: (equipmentId: string, projectId: string, assignmentStart: string, notes?: string) => Promise<void>;
  returnCanonicalEquipment: (equipmentId: string, assignmentEnd: string, notes?: string) => Promise<void>;
  setCanonicalEquipmentLifecycle: (equipmentId: string, status: EquipmentLifecycleStatus, reason: string) => Promise<void>;
}

export function useInventoryEquipmentController({
  authenticated,
  sessionPresent,
  actorUserId,
  remoteWorkspaceConfigured,
  can,
  projects,
  purchaseOrders,
  purchaseOrderReceipts,
  onSuccess,
  onError,
}: InventoryEquipmentControllerOptions): InventoryEquipmentController {
  const [materials, setMaterials] = useState<ProjectMaterial[]>(() => remoteWorkspaceConfigured ? [] : readProjectMaterialsFromLocal());
  const [equipment, setEquipment] = useState<ProjectEquipment[]>(() => remoteWorkspaceConfigured ? [] : readProjectEquipmentFromLocal());
  const [equipmentRegistry, setEquipmentRegistry] = useState<Equipment[]>(() => remoteWorkspaceConfigured ? [] : readEquipmentRegistryFromLocal());
  const [equipmentAssignments, setEquipmentAssignments] = useState<EquipmentAssignment[]>(() => remoteWorkspaceConfigured ? [] : readEquipmentAssignmentsFromLocal());
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>(() => remoteWorkspaceConfigured ? [] : readInventoryItemsFromLocal());
  const [inventoryMovements, setInventoryMovements] = useState<InventoryMovement[]>(() => remoteWorkspaceConfigured ? [] : readInventoryMovementsFromLocal());
  const [inventoryBalances, setInventoryBalances] = useState<InventoryBalance[] | undefined>();

  const applyWorkspaceData = useCallback((data: InventoryEquipmentWorkspaceData) => {
    setMaterials(data.materials);
    setEquipment(data.equipment);
    setEquipmentRegistry(data.equipmentRegistry);
    setEquipmentAssignments(data.equipmentAssignments);
    setInventoryItems(data.inventoryItems);
    setInventoryMovements(data.inventoryMovements);
    setInventoryBalances(data.inventoryBalances);
  }, []);

  const loadGuestWorkspace = useCallback(() => {
    setMaterials(readProjectMaterialsFromLocal());
    setEquipment(readProjectEquipmentFromLocal());
    setEquipmentRegistry(readEquipmentRegistryFromLocal());
    setEquipmentAssignments(readEquipmentAssignmentsFromLocal());
    setInventoryItems(readInventoryItemsFromLocal());
    setInventoryMovements(readInventoryMovementsFromLocal());
    setInventoryBalances(undefined);
  }, []);

  const reset = useCallback(() => {
    setMaterials([]);
    setEquipment([]);
    setEquipmentRegistry([]);
    setEquipmentAssignments([]);
    setInventoryItems([]);
    setInventoryMovements([]);
    setInventoryBalances(undefined);
  }, []);

  const saveMaterial = useCallback(async (input: ProjectMaterialSaveInput) => {
    try {
      if (remoteWorkspaceConfigured && !can(PERMISSION_KEYS.projectsWrite)) throw new Error("You do not have permission to manage project materials.");
      const saved = authenticated
        ? await saveProjectMaterialToSupabase(input)
        : buildLocalProjectMaterial(input, input.id ? materials.find((item) => item.id === input.id) : undefined, "guest-company");
      setMaterials((previous) => {
        const next = previous.some((item) => item.id === saved.id) ? previous.map((item) => item.id === saved.id ? saved : item) : [saved, ...previous];
        if (!remoteWorkspaceConfigured) writeProjectMaterialsToLocal(next);
        return next;
      });
      onSuccess(`${saved.materialName} saved to the Materials Register.`);
    } catch (error) {
      onError(error, "Could not save project material.");
      throw error;
    }
  }, [authenticated, can, materials, onError, onSuccess, remoteWorkspaceConfigured]);

  const saveInventoryItem = useCallback(async (input: InventoryItemSaveInput): Promise<InventoryItem> => {
    try {
      if (remoteWorkspaceConfigured && !can(PERMISSION_KEYS.inventoryManage)) throw new Error("You do not have permission to manage warehouse inventory.");
      const normalizedName = input.itemName.trim().toLowerCase();
      const normalizedUnit = input.stockUnit.trim().toLowerCase();
      const normalizedCode = input.itemCode?.trim().toUpperCase();
      if (!normalizedName || !normalizedUnit) throw new Error("Inventory item name and stock unit are required.");
      if (inventoryItems.some((item) => item.id !== input.id && item.itemName.trim().toLowerCase() === normalizedName && item.stockUnit.trim().toLowerCase() === normalizedUnit)) throw new Error("An inventory item with the same canonical name and stock unit already exists.");
      if (normalizedCode && inventoryItems.some((item) => item.id !== input.id && item.itemCode?.trim().toUpperCase() === normalizedCode)) throw new Error("That inventory item code is already in use.");
      const existing = input.id ? inventoryItems.find((item) => item.id === input.id) : undefined;
      if (existing && existing.stockUnit.trim().toLowerCase() !== normalizedUnit && (inventoryMovements.some((movement) => movement.inventoryItemId === existing.id) || materials.some((material) => material.inventoryItemId === existing.id))) throw new Error("An item stock unit cannot change after movement history or project requirement links exist.");
      const saved = authenticated
        ? await saveInventoryItemToSupabase(input)
        : buildLocalInventoryItem({ ...input, itemName: input.itemName.trim(), stockUnit: normalizedUnit }, existing, "guest-company", "guest-user");
      setInventoryItems((previous) => {
        const next = previous.some((item) => item.id === saved.id) ? previous.map((item) => item.id === saved.id ? saved : item) : [saved, ...previous];
        if (!remoteWorkspaceConfigured) writeInventoryItemsToLocal(next);
        return next;
      });
      setInventoryBalances(undefined);
      onSuccess(`${saved.itemName} saved to Warehouse Inventory.`);
      return saved;
    } catch (error) {
      onError(error, "Could not save inventory item.");
      throw error;
    }
  }, [authenticated, can, inventoryItems, inventoryMovements, materials, onError, onSuccess, remoteWorkspaceConfigured]);

  const recordInventoryMovement = useCallback(async (input: InventoryMovementInput): Promise<InventoryMovement> => {
    try {
      if (remoteWorkspaceConfigured && !can(PERMISSION_KEYS.inventoryManage)) throw new Error("You do not have permission to record warehouse movements.");
      if (input.sourceType === "PURCHASE_ORDER_RECEIPT") {
        const receipt = purchaseOrderReceipts.find((candidate) => candidate.id === input.purchaseOrderReceiptId && candidate.status === "RECEIVED");
        const receiptLine = receipt?.lines?.find((line) => line.purchaseOrderLineId === input.purchaseOrderLineId);
        const purchaseOrder = purchaseOrders.find((candidate) => candidate.id === receipt?.purchaseOrderId);
        const purchaseOrderLine = purchaseOrder?.lines?.find((line) => line.id === input.purchaseOrderLineId);
        const item = inventoryItems.find((candidate) => candidate.id === input.inventoryItemId);
        if (!receiptLine || !purchaseOrderLine || !item || (receiptLine.inventoryItemId && receiptLine.inventoryItemId !== item.id) || item.stockUnit.trim().toLowerCase() !== purchaseOrderLine.unit.trim().toLowerCase() || Number(input.quantity) !== receiptLine.receivedQuantity) throw new Error("The selected procurement receipt line must match its reviewed canonical item and exact quantity.");
      }
      const saved = authenticated
        ? await recordInventoryMovementToSupabase(input)
        : recordInventoryMovementLocally(input, inventoryItems, inventoryMovements, { companyId: "guest-company", actorUserId: "guest-user" });
      setInventoryMovements((previous) => {
        const next = [saved, ...previous.filter((movement) => movement.id !== saved.id)];
        if (!remoteWorkspaceConfigured) writeInventoryMovementsToLocal(next);
        return next;
      });
      setInventoryBalances(undefined);
      onSuccess(`${saved.movementType.replaceAll("_", " ")} recorded for ${saved.quantity} ${saved.stockUnitSnapshot}.`);
      return saved;
    } catch (error) {
      onError(error, "Could not record the warehouse movement.");
      throw error;
    }
  }, [authenticated, can, inventoryItems, inventoryMovements, onError, onSuccess, purchaseOrderReceipts, purchaseOrders, remoteWorkspaceConfigured]);

  const reverseInventoryMovement = useCallback(async (movementId: string, reason: string, idempotencyKey: string): Promise<InventoryMovement> => {
    try {
      if (remoteWorkspaceConfigured && !can(PERMISSION_KEYS.inventoryManage)) throw new Error("You do not have permission to correct warehouse movements.");
      const saved = authenticated
        ? await reverseInventoryMovementToSupabase(movementId, reason, idempotencyKey)
        : recordInventoryMovementLocally({ movementType: "REVERSAL", reversalOfMovementId: movementId, reason, idempotencyKey }, inventoryItems, inventoryMovements, { companyId: "guest-company", actorUserId: "guest-user" });
      setInventoryMovements((previous) => [saved, ...previous.filter((movement) => movement.id !== saved.id)]);
      setInventoryBalances(undefined);
      if (!remoteWorkspaceConfigured) writeInventoryMovementsToLocal([saved, ...inventoryMovements.filter((movement) => movement.id !== saved.id)]);
      onSuccess("Inventory movement reversed. Original history remains preserved.");
      return saved;
    } catch (error) {
      onError(error, "Could not reverse the warehouse movement.");
      throw error;
    }
  }, [authenticated, can, inventoryItems, inventoryMovements, onError, onSuccess, remoteWorkspaceConfigured]);

  const saveEquipment = useCallback(async (input: ProjectEquipmentSaveInput) => {
    try {
      if (remoteWorkspaceConfigured && !can(PERMISSION_KEYS.projectsWrite)) throw new Error("You do not have permission to manage project equipment.");
      const saved = authenticated
        ? await saveProjectEquipmentToSupabase(input)
        : buildLocalProjectEquipment(input, input.id ? equipment.find((item) => item.id === input.id) : undefined, "guest-company");
      setEquipment((previous) => {
        const next = previous.some((item) => item.id === saved.id) ? previous.map((item) => item.id === saved.id ? saved : item) : [saved, ...previous];
        if (!remoteWorkspaceConfigured) writeProjectEquipmentToLocal(next);
        return next;
      });
      onSuccess(`${saved.equipmentName} saved to the Equipment Register.`);
    } catch (error) {
      onError(error, "Could not save project equipment.");
      throw error;
    }
  }, [authenticated, can, equipment, onError, onSuccess, remoteWorkspaceConfigured]);

  const saveCanonicalEquipment = useCallback(async (input: EquipmentSaveInput): Promise<Equipment> => {
    try {
      if (remoteWorkspaceConfigured && !can(PERMISSION_KEYS.equipmentManage)) throw new Error("You do not have permission to manage the Equipment Registry.");
      const normalizedReference = input.assetReference?.trim().toLowerCase();
      if (!sessionPresent && normalizedReference && equipmentRegistry.some((item) => item.id !== input.id && item.assetReference?.trim().toLowerCase() === normalizedReference)) throw new Error("That Equipment asset/reference code is already in use.");
      const existing = input.id ? equipmentRegistry.find((item) => item.id === input.id) : undefined;
      const saved = authenticated ? await saveEquipmentToSupabase(input) : buildLocalEquipment(input, existing, "guest-company", "guest-user");
      setEquipmentRegistry((current) => {
        const next = current.some((item) => item.id === saved.id) ? current.map((item) => item.id === saved.id ? { ...saved, currentState: item.currentState, currentAssignmentId: item.currentAssignmentId, currentProjectId: item.currentProjectId, currentAssignmentStart: item.currentAssignmentStart } : item) : [saved, ...current];
        if (!sessionPresent) writeEquipmentRegistryToLocal(next);
        return next;
      });
      onSuccess(`${saved.equipmentName} saved to the canonical Equipment Registry.`);
      return saved;
    } catch (error) {
      onError(error, "Could not save canonical Equipment.");
      throw error;
    }
  }, [authenticated, can, equipmentRegistry, onError, onSuccess, remoteWorkspaceConfigured, sessionPresent]);

  const applyCanonicalEquipmentMutation = useCallback((result: { equipment: Equipment; assignment?: EquipmentAssignment | null }, previousActive?: EquipmentAssignment, closedDate?: string) => {
    const active = result.assignment && !result.assignment.assignmentEnd ? result.assignment : undefined;
    const nextEquipment = {
      ...result.equipment,
      currentState: active ? "ASSIGNED" as const : result.equipment.lifecycleStatus,
      currentAssignmentId: active?.id || null,
      currentProjectId: active?.projectId || null,
      currentAssignmentStart: active?.assignmentStart || null,
    };
    setEquipmentRegistry((current) => current.some((item) => item.id === nextEquipment.id) ? current.map((item) => item.id === nextEquipment.id ? nextEquipment : item) : [nextEquipment, ...current]);
    if (previousActive && closedDate) {
      setEquipmentAssignments((current) => current.map((assignment) => assignment.id === previousActive.id ? { ...assignment, assignmentEnd: closedDate, returnedByUserId: actorUserId || "guest-user", updatedAt: new Date().toISOString() } : assignment));
    }
    if (active) setEquipmentAssignments((current) => current.some((assignment) => assignment.id === active.id) ? current.map((assignment) => assignment.id === active.id ? active : assignment) : [active, ...current]);
    return nextEquipment;
  }, [actorUserId]);

  const assignCanonicalEquipment = useCallback(async (equipmentId: string, projectId: string, assignmentStart: string, notes?: string) => {
    try {
      if (remoteWorkspaceConfigured && !can(PERMISSION_KEYS.equipmentManage)) throw new Error("You do not have permission to assign Equipment.");
      const result = authenticated
        ? await assignEquipmentToSupabase(equipmentId, projectId, assignmentStart, notes)
        : applyLocalEquipmentAssignment(equipmentRegistry, equipmentAssignments, { equipmentId, projectId, assignmentStart, notes }, projects);
      applyCanonicalEquipmentMutation(result);
      if (!sessionPresent) {
        if (result.assignment) writeEquipmentAssignmentsToLocal([result.assignment, ...equipmentAssignments.filter((assignment) => assignment.id !== result.assignment?.id)]);
        writeEquipmentRegistryToLocal(equipmentRegistry.map((item) => item.id === result.equipment.id ? { ...result.equipment, currentState: "ASSIGNED", currentAssignmentId: result.assignment?.id, currentProjectId: result.assignment?.projectId, currentAssignmentStart: result.assignment?.assignmentStart } : item));
      }
      onSuccess("Equipment assigned. The active assignment is now authoritative.");
    } catch (error) {
      onError(error, "Could not assign Equipment.");
      throw error;
    }
  }, [applyCanonicalEquipmentMutation, authenticated, can, equipmentAssignments, equipmentRegistry, onError, onSuccess, projects, remoteWorkspaceConfigured, sessionPresent]);

  const transferCanonicalEquipment = useCallback(async (equipmentId: string, projectId: string, assignmentStart: string, notes?: string) => {
    try {
      if (remoteWorkspaceConfigured && !can(PERMISSION_KEYS.equipmentManage)) throw new Error("You do not have permission to transfer Equipment.");
      const previousActive = equipmentAssignments.find((assignment) => assignment.equipmentId === equipmentId && !assignment.assignmentEnd);
      const result = authenticated
        ? await transferEquipmentToSupabase(equipmentId, projectId, assignmentStart, notes)
        : applyLocalEquipmentTransfer(equipmentRegistry, equipmentAssignments, { equipmentId, projectId, assignmentStart, notes }, projects);
      applyCanonicalEquipmentMutation(result, previousActive, assignmentStart);
      if (!sessionPresent && result.assignment) {
        const closed = equipmentAssignments.map((assignment) => assignment.id === previousActive?.id ? { ...assignment, assignmentEnd: assignmentStart, returnedByUserId: "guest-user" } : assignment);
        writeEquipmentAssignmentsToLocal([result.assignment, ...closed.filter((assignment) => assignment.id !== result.assignment?.id)]);
        writeEquipmentRegistryToLocal(equipmentRegistry.map((item) => item.id === result.equipment.id ? { ...result.equipment, currentState: "ASSIGNED", currentAssignmentId: result.assignment?.id, currentProjectId: result.assignment?.projectId, currentAssignmentStart: result.assignment?.assignmentStart } : item));
      }
      onSuccess("Equipment transferred in one authoritative operation.");
    } catch (error) {
      onError(error, "Could not transfer Equipment.");
      throw error;
    }
  }, [applyCanonicalEquipmentMutation, authenticated, can, equipmentAssignments, equipmentRegistry, onError, onSuccess, projects, remoteWorkspaceConfigured, sessionPresent]);

  const returnCanonicalEquipment = useCallback(async (equipmentId: string, assignmentEnd: string, notes?: string) => {
    try {
      if (remoteWorkspaceConfigured && !can(PERMISSION_KEYS.equipmentManage)) throw new Error("You do not have permission to return Equipment.");
      const previousActive = equipmentAssignments.find((assignment) => assignment.equipmentId === equipmentId && !assignment.assignmentEnd);
      const result = authenticated
        ? await returnEquipmentToSupabase(equipmentId, assignmentEnd, notes)
        : applyLocalEquipmentReturn(equipmentRegistry, equipmentAssignments, equipmentId, assignmentEnd, notes);
      applyCanonicalEquipmentMutation(result, previousActive, assignmentEnd);
      if (!sessionPresent) {
        const returned = result.assignment || previousActive;
        if (returned) writeEquipmentAssignmentsToLocal(equipmentAssignments.map((assignment) => assignment.id === returned.id ? returned : assignment));
        writeEquipmentRegistryToLocal(equipmentRegistry.map((item) => item.id === result.equipment.id ? { ...result.equipment, currentState: result.equipment.lifecycleStatus, currentAssignmentId: null, currentProjectId: null, currentAssignmentStart: null } : item));
      }
      onSuccess("Equipment returned to the company pool. Assignment history remains preserved.");
    } catch (error) {
      onError(error, "Could not return Equipment.");
      throw error;
    }
  }, [applyCanonicalEquipmentMutation, authenticated, can, equipmentAssignments, equipmentRegistry, onError, onSuccess, remoteWorkspaceConfigured, sessionPresent]);

  const setCanonicalEquipmentLifecycle = useCallback(async (equipmentId: string, status: EquipmentLifecycleStatus, reason: string) => {
    try {
      if (remoteWorkspaceConfigured && !can(PERMISSION_KEYS.equipmentManage)) throw new Error("You do not have permission to change Equipment lifecycle state.");
      const previous = equipmentRegistry.find((item) => item.id === equipmentId);
      if (!previous) throw new Error("Equipment is unavailable.");
      const active = equipmentAssignments.find((assignment) => assignment.equipmentId === equipmentId && !assignment.assignmentEnd);
      if (status === "AVAILABLE" && active) throw new Error("Return or transfer the active assignment before making Equipment available.");
      const result = authenticated
        ? await setEquipmentLifecycleToSupabase(equipmentId, status, reason)
        : { equipment: { ...previous, lifecycleStatus: status, currentState: status, currentAssignmentId: null, currentProjectId: null, currentAssignmentStart: null, notes: [previous.notes, reason].filter(Boolean).join("\n") }, assignment: null };
      applyCanonicalEquipmentMutation(result, active, active ? new Date().toISOString().slice(0, 10) : undefined);
      if (!sessionPresent) {
        if (active) writeEquipmentAssignmentsToLocal(equipmentAssignments.map((assignment) => assignment.id === active.id ? { ...assignment, assignmentEnd: new Date().toISOString().slice(0, 10) } : assignment));
        writeEquipmentRegistryToLocal(equipmentRegistry.map((item) => item.id === equipmentId ? result.equipment : item));
      }
      onSuccess(`Equipment lifecycle changed to ${status.replaceAll("_", " ")}.`);
    } catch (error) {
      onError(error, "Could not change Equipment lifecycle state.");
      throw error;
    }
  }, [applyCanonicalEquipmentMutation, authenticated, can, equipmentAssignments, equipmentRegistry, onError, onSuccess, remoteWorkspaceConfigured, sessionPresent]);

  return {
    materials,
    equipment,
    equipmentRegistry,
    equipmentAssignments,
    inventoryItems,
    inventoryMovements,
    inventoryBalances,
    applyWorkspaceData,
    loadGuestWorkspace,
    reset,
    saveMaterial,
    saveEquipment,
    saveInventoryItem,
    recordInventoryMovement,
    reverseInventoryMovement,
    saveCanonicalEquipment,
    assignCanonicalEquipment,
    transferCanonicalEquipment,
    returnCanonicalEquipment,
    setCanonicalEquipmentLifecycle,
  };
}
