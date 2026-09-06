import type { ProjectMaterial } from "../types.ts";
import { requireActiveCompanyId } from "./companyContext.ts";
import { supabase } from "./supabase.ts";

export const INVENTORY_ITEMS_STORAGE_KEY = "warehouse_inventory_items";
export const INVENTORY_MOVEMENTS_STORAGE_KEY = "warehouse_inventory_movements";

export type InventoryItemStatus = "ACTIVE" | "INACTIVE";
export type InventoryMovementType = "OPENING" | "RECEIPT" | "PROJECT_ISSUE" | "PROJECT_RETURN" | "REVERSAL";
export type InventoryMovementDirection = "IN" | "OUT";
export type InventoryMovementSourceType = "MANUAL" | "PURCHASE_ORDER_RECEIPT";

export interface InventoryItem {
  id: string;
  companyId?: string;
  itemName: string;
  itemCode?: string | null;
  category?: string | null;
  stockUnit: string;
  status: InventoryItemStatus;
  createdByUserId?: string | null;
  updatedByUserId?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface InventoryMovement {
  id: string;
  companyId?: string;
  inventoryItemId: string;
  movementType: InventoryMovementType;
  direction: InventoryMovementDirection;
  quantity: number;
  stockUnitSnapshot: string;
  projectId?: string | null;
  projectMaterialId?: string | null;
  reason: string;
  reference?: string | null;
  sourceType: InventoryMovementSourceType;
  purchaseOrderReceiptId?: string | null;
  purchaseOrderLineId?: string | null;
  sourcePurchaseOrderReceiptStatus?: "RECEIVED" | "VOIDED" | null;
  sourcePurchaseOrderReceiptNumber?: string | null;
  sourcePurchaseOrderId?: string | null;
  requiresReconciliation?: boolean;
  reversalOfMovementId?: string | null;
  idempotencyKey: string;
  effectiveDate: string;
  createdByUserId?: string | null;
  createdAt?: string;
}

export interface InventoryBalance {
  inventoryItemId: string;
  itemName: string;
  itemCode?: string | null;
  category?: string | null;
  stockUnit: string;
  status: InventoryItemStatus;
  onHandQuantity: number;
  openingQuantity: number;
  receivedQuantity: number;
  issuedQuantity: number;
  returnedQuantity: number;
  movementCount: number;
  latestMovementAt?: string;
  latestEffectiveDate?: string;
  latestMovementType?: InventoryMovementType;
}

export interface InventoryWorkspaceData {
  items: InventoryItem[];
  movements: InventoryMovement[];
  /** Remote overview balance read model; the database view derives it from movements. */
  balances?: InventoryBalance[];
}

export interface InventoryItemSaveInput {
  id?: string;
  itemName: string;
  itemCode?: string | null;
  category?: string | null;
  stockUnit: string;
  status?: InventoryItemStatus;
}

export interface InventoryMovementInput {
  movementType: InventoryMovementType;
  inventoryItemId?: string;
  quantity?: number;
  projectId?: string | null;
  projectMaterialId?: string | null;
  reason: string;
  reference?: string | null;
  sourceType?: InventoryMovementSourceType;
  purchaseOrderReceiptId?: string | null;
  purchaseOrderLineId?: string | null;
  reversalOfMovementId?: string | null;
  idempotencyKey: string;
  effectiveDate?: string;
}

export interface ProjectInventoryUsage {
  issuedQuantity: number;
  returnedQuantity: number;
  availableToReturn: number;
  movementCount: number;
}

type Row = Record<string, unknown>;

function text(value: unknown): string | undefined {
  return value === null || value === undefined || value === "" ? undefined : String(value);
}

function numberValue(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function roundQuantity(value: number): number {
  return Math.round(value * 10_000) / 10_000;
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

export function inventoryItemFromRow(row: Row): InventoryItem {
  return {
    id: String(row.id),
    companyId: text(row.company_id),
    itemName: String(row.item_name || ""),
    itemCode: text(row.item_code) || null,
    category: text(row.category) || null,
    stockUnit: String(row.stock_unit || "pcs"),
    status: String(row.status || "ACTIVE").toUpperCase() as InventoryItemStatus,
    createdByUserId: text(row.created_by_user_id) || null,
    updatedByUserId: text(row.updated_by_user_id) || null,
    createdAt: text(row.created_at),
    updatedAt: text(row.updated_at),
  };
}

export function inventoryMovementFromRow(row: Row): InventoryMovement {
  return {
    id: String(row.id),
    companyId: text(row.company_id),
    inventoryItemId: String(row.inventory_item_id),
    movementType: String(row.movement_type || "RECEIPT").toUpperCase() as InventoryMovementType,
    direction: String(row.direction || "IN").toUpperCase() as InventoryMovementDirection,
    quantity: numberValue(row.quantity),
    stockUnitSnapshot: String(row.stock_unit_snapshot || "pcs"),
    projectId: text(row.project_id) || null,
    projectMaterialId: text(row.project_material_id) || null,
    reason: String(row.reason || ""),
    reference: text(row.reference) || null,
    sourceType: String(row.source_type || "MANUAL").toUpperCase() as InventoryMovementSourceType,
    purchaseOrderReceiptId: text(row.purchase_order_receipt_id) || null,
    purchaseOrderLineId: text(row.purchase_order_line_id) || null,
    sourcePurchaseOrderReceiptStatus: text(row.source_purchase_order_receipt_status) as InventoryMovement["sourcePurchaseOrderReceiptStatus"] || null,
    sourcePurchaseOrderReceiptNumber: text(row.source_purchase_order_receipt_number) || null,
    sourcePurchaseOrderId: text(row.source_purchase_order_id) || null,
    requiresReconciliation: row.requires_reconciliation === true,
    reversalOfMovementId: text(row.reversal_of_movement_id) || null,
    idempotencyKey: String(row.idempotency_key || ""),
    effectiveDate: String(row.effective_date || new Date().toISOString().slice(0, 10)),
    createdByUserId: text(row.created_by_user_id) || null,
    createdAt: text(row.created_at),
  };
}

export function inventoryBalanceFromRow(row: Row): InventoryBalance {
  return {
    inventoryItemId: String(row.inventory_item_id),
    itemName: String(row.item_name || ""),
    itemCode: text(row.item_code) || null,
    category: text(row.category) || null,
    stockUnit: String(row.stock_unit || "pcs"),
    status: String(row.status || "ACTIVE").toUpperCase() as InventoryItemStatus,
    onHandQuantity: roundQuantity(numberValue(row.on_hand_quantity)),
    openingQuantity: roundQuantity(numberValue(row.opening_quantity)),
    receivedQuantity: roundQuantity(numberValue(row.received_quantity)),
    issuedQuantity: roundQuantity(numberValue(row.issued_quantity)),
    returnedQuantity: roundQuantity(numberValue(row.returned_quantity)),
    movementCount: numberValue(row.movement_count),
    latestMovementAt: text(row.latest_movement_at),
    latestEffectiveDate: text(row.latest_effective_date),
    latestMovementType: text(row.latest_movement_type) as InventoryMovementType | undefined,
  };
}

export function readInventoryItemsFromLocal(storage?: Storage): InventoryItem[] {
  return readJson<InventoryItem>(INVENTORY_ITEMS_STORAGE_KEY, storage);
}

export function writeInventoryItemsToLocal(items: InventoryItem[], storage?: Storage): void {
  writeJson(INVENTORY_ITEMS_STORAGE_KEY, items, storage);
}

export function readInventoryMovementsFromLocal(storage?: Storage): InventoryMovement[] {
  return readJson<InventoryMovement>(INVENTORY_MOVEMENTS_STORAGE_KEY, storage);
}

export function writeInventoryMovementsToLocal(movements: InventoryMovement[], storage?: Storage): void {
  writeJson(INVENTORY_MOVEMENTS_STORAGE_KEY, movements, storage);
}

export function buildLocalInventoryItem(
  input: InventoryItemSaveInput,
  existing?: InventoryItem,
  companyId = "guest-company",
  actorUserId?: string | null,
): InventoryItem {
  const now = new Date().toISOString();
  return {
    id: input.id || localId("inventory-item"),
    companyId,
    itemName: input.itemName.trim(),
    itemCode: input.itemCode?.trim().toUpperCase() || null,
    category: input.category?.trim() || null,
    stockUnit: input.stockUnit.trim().toLowerCase() || "pcs",
    status: input.status || existing?.status || "ACTIVE",
    createdByUserId: existing?.createdByUserId || actorUserId || null,
    updatedByUserId: actorUserId || null,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
}

function movementCategory(movement: InventoryMovement, byId: ReadonlyMap<string, InventoryMovement>): InventoryMovementType | undefined {
  if (movement.movementType !== "REVERSAL") return movement.movementType;
  return movement.reversalOfMovementId ? byId.get(movement.reversalOfMovementId)?.movementType : undefined;
}

function movementCategorySign(movement: InventoryMovement): number {
  return movement.movementType === "REVERSAL" ? -1 : 1;
}

function movementCreatedSortKey(movement: InventoryMovement): string {
  return movement.createdAt || `${movement.effectiveDate}T00:00:00.000Z`;
}

export function deriveInventoryBalances(
  items: readonly InventoryItem[],
  movements: readonly InventoryMovement[],
): InventoryBalance[] {
  const movementsByItem = new Map<string, InventoryMovement[]>();
  const movementById = new Map(movements.map((movement) => [movement.id, movement]));
  for (const movement of movements) {
    const current = movementsByItem.get(movement.inventoryItemId) || [];
    current.push(movement);
    movementsByItem.set(movement.inventoryItemId, current);
  }

  return items.map((item) => {
    const itemMovements = movementsByItem.get(item.id) || [];
    const ordered = [...itemMovements].sort((left, right) => movementCreatedSortKey(right).localeCompare(movementCreatedSortKey(left)) || right.id.localeCompare(left.id));
    let onHandQuantity = 0;
    let openingQuantity = 0;
    let receivedQuantity = 0;
    let issuedQuantity = 0;
    let returnedQuantity = 0;
    for (const movement of itemMovements) {
      onHandQuantity += movement.direction === "IN" ? movement.quantity : -movement.quantity;
      const category = movementCategory(movement, movementById);
      const categoryQuantity = movement.quantity * movementCategorySign(movement);
      if (category === "OPENING") openingQuantity += categoryQuantity;
      if (category === "RECEIPT") receivedQuantity += categoryQuantity;
      if (category === "PROJECT_ISSUE") issuedQuantity += categoryQuantity;
      if (category === "PROJECT_RETURN") returnedQuantity += categoryQuantity;
    }
    const latest = ordered[0];
    return {
      inventoryItemId: item.id,
      itemName: item.itemName,
      itemCode: item.itemCode,
      category: item.category,
      stockUnit: item.stockUnit,
      status: item.status,
      onHandQuantity: roundQuantity(onHandQuantity),
      openingQuantity: roundQuantity(openingQuantity),
      receivedQuantity: roundQuantity(receivedQuantity),
      issuedQuantity: roundQuantity(issuedQuantity),
      returnedQuantity: roundQuantity(returnedQuantity),
      movementCount: itemMovements.length,
      latestMovementAt: latest?.createdAt,
      latestEffectiveDate: latest?.effectiveDate,
      latestMovementType: latest?.movementType,
    };
  });
}

export function deriveProjectInventoryUsage(
  projectId: string,
  inventoryItemId: string,
  movements: readonly InventoryMovement[],
  projectMaterialId?: string | null,
): ProjectInventoryUsage {
  const relevant = movements.filter((movement) => movement.projectId === projectId
    && movement.inventoryItemId === inventoryItemId
    && (!projectMaterialId || movement.projectMaterialId === projectMaterialId));
  const movementById = new Map(movements.map((movement) => [movement.id, movement]));
  let issuedQuantity = 0;
  let returnedQuantity = 0;
  for (const movement of relevant) {
    const category = movementCategory(movement, movementById);
    const quantity = movement.quantity * movementCategorySign(movement);
    if (category === "PROJECT_ISSUE") issuedQuantity += quantity;
    if (category === "PROJECT_RETURN") returnedQuantity += quantity;
  }
  return {
    issuedQuantity: roundQuantity(issuedQuantity),
    returnedQuantity: roundQuantity(returnedQuantity),
    availableToReturn: roundQuantity(Math.max(0, issuedQuantity - returnedQuantity)),
    movementCount: relevant.length,
  };
}

export function deriveProjectMaterialInventoryUsage(
  projectId: string,
  material: Pick<ProjectMaterial, "inventoryItemId" | "id">,
  movements: readonly InventoryMovement[],
): ProjectInventoryUsage | undefined {
  if (!material.inventoryItemId) return undefined;
  return deriveProjectInventoryUsage(projectId, material.inventoryItemId, movements, material.id);
}

function sameLogicalMovement(left: InventoryMovement, input: {
  movementType: InventoryMovementType;
  inventoryItemId: string;
  quantity: number;
  projectId?: string | null;
  projectMaterialId?: string | null;
  purchaseOrderReceiptId?: string | null;
  purchaseOrderLineId?: string | null;
  reversalOfMovementId?: string | null;
}) {
  return left.movementType === input.movementType
    && left.inventoryItemId === input.inventoryItemId
    && left.quantity === input.quantity
    && left.projectId === (input.projectId || null)
    && left.projectMaterialId === (input.projectMaterialId || null)
    && left.purchaseOrderReceiptId === (input.purchaseOrderReceiptId || null)
    && left.purchaseOrderLineId === (input.purchaseOrderLineId || null)
    && left.reversalOfMovementId === (input.reversalOfMovementId || null);
}

export function recordInventoryMovementLocally(
  input: InventoryMovementInput,
  items: readonly InventoryItem[],
  movements: readonly InventoryMovement[],
  options: { companyId?: string; actorUserId?: string | null; now?: string } = {},
): InventoryMovement {
  const itemById = new Map(items.map((item) => [item.id, item]));
  const existingByKey = movements.find((movement) => movement.idempotencyKey === input.idempotencyKey);
  let movementType = input.movementType;
  let inventoryItemId = input.inventoryItemId || "";
  let quantity = Number(input.quantity);
  let projectId = input.projectId || null;
  let projectMaterialId = input.projectMaterialId || null;
  let sourceType = input.sourceType || "MANUAL";
  let purchaseOrderReceiptId = input.purchaseOrderReceiptId || null;
  let purchaseOrderLineId = input.purchaseOrderLineId || null;
  let reversalOfMovementId = input.reversalOfMovementId || null;
  let direction: InventoryMovementDirection = "IN";

  if (movementType === "REVERSAL") {
    if (!reversalOfMovementId) throw new Error("A reversal requires the original inventory movement.");
    const original = movements.find((movement) => movement.id === reversalOfMovementId);
    if (!original) throw new Error("The original inventory movement was not found.");
    if (original.movementType === "REVERSAL") throw new Error("A reversal cannot itself be reversed.");
    inventoryItemId = original.inventoryItemId;
    quantity = original.quantity;
    projectId = original.projectId || null;
    projectMaterialId = original.projectMaterialId || null;
    sourceType = "MANUAL";
    purchaseOrderReceiptId = null;
    purchaseOrderLineId = null;
    direction = original.direction === "IN" ? "OUT" : "IN";
    if (input.inventoryItemId && input.inventoryItemId !== inventoryItemId) throw new Error("A reversal item must match the original movement.");
    if (input.quantity !== undefined && Number(input.quantity) !== quantity) throw new Error("A reversal quantity must match the original movement.");
  } else {
    if (!inventoryItemId || !Number.isFinite(quantity) || quantity <= 0) throw new Error("A canonical item and positive quantity are required.");
    direction = movementType === "PROJECT_ISSUE" ? "OUT" : "IN";
  }

  if (existingByKey) {
    if (sameLogicalMovement(existingByKey, { movementType, inventoryItemId, quantity, projectId, projectMaterialId, purchaseOrderReceiptId, purchaseOrderLineId, reversalOfMovementId })) return existingByKey;
    throw new Error("The idempotency key is already bound to a different inventory movement.");
  }
  if (movementType === "REVERSAL" && reversalOfMovementId && movements.some((movement) => movement.reversalOfMovementId === reversalOfMovementId)) throw new Error("The original inventory movement has already been reversed.");
  if (!input.idempotencyKey.trim()) throw new Error("An idempotency key is required for every inventory movement.");
  if (!input.reason.trim()) throw new Error("A reason is required for every inventory movement.");

  const item = itemById.get(inventoryItemId);
  if (!item) throw new Error("Inventory item does not exist in this workspace.");
  if (movementType !== "REVERSAL" && item.status !== "ACTIVE") throw new Error("Inactive inventory items cannot receive new stock activity.");
  if (sourceType === "PURCHASE_ORDER_RECEIPT" && (movementType !== "RECEIPT" || !purchaseOrderReceiptId || !purchaseOrderLineId)) throw new Error("Procurement provenance is available only for a complete warehouse receipt.");
  if (sourceType === "MANUAL" && (purchaseOrderReceiptId || purchaseOrderLineId)) throw new Error("Manual inventory movements cannot carry procurement receipt provenance.");
  if (sourceType === "PURCHASE_ORDER_RECEIPT" && movements.some((movement) => movement.sourceType === sourceType && movement.purchaseOrderReceiptId === purchaseOrderReceiptId && movement.purchaseOrderLineId === purchaseOrderLineId)) throw new Error("This procurement receipt line has already been posted into warehouse stock.");

  const balances = deriveInventoryBalances(items, movements);
  const balance = balances.find((candidate) => candidate.inventoryItemId === item.id);
  const onHand = balance?.onHandQuantity || 0;
  if (direction === "OUT" && onHand < quantity) throw new Error("Insufficient warehouse stock; on-hand cannot become negative.");
  if (movementType === "PROJECT_RETURN" && projectId) {
    const usage = deriveProjectInventoryUsage(projectId, inventoryItemId, movements);
    if (usage.availableToReturn < quantity) throw new Error("Project return exceeds valid unreturned issue quantity.");
  }
  if (movementType === "REVERSAL" && reversalOfMovementId) {
    const original = movements.find((candidate) => candidate.id === reversalOfMovementId);
    if (original?.movementType === "PROJECT_ISSUE" && projectId) {
      const usage = deriveProjectInventoryUsage(projectId, inventoryItemId, movements);
      if (usage.availableToReturn < quantity) throw new Error("Reverse project returns before reversing the original project issue.");
    }
  }

  const now = options.now || new Date().toISOString();
  return {
    id: localId("inventory-movement"),
    companyId: options.companyId || item.companyId,
    inventoryItemId,
    movementType,
    direction,
    quantity,
    stockUnitSnapshot: item.stockUnit,
    projectId,
    projectMaterialId,
    reason: input.reason.trim(),
    reference: input.reference?.trim() || null,
    sourceType,
    purchaseOrderReceiptId,
    purchaseOrderLineId,
    requiresReconciliation: false,
    reversalOfMovementId,
    idempotencyKey: input.idempotencyKey.trim(),
    effectiveDate: input.effectiveDate || now.slice(0, 10),
    createdByUserId: options.actorUserId || null,
    createdAt: now,
  };
}

export async function loadInventoryWorkspaceFromSupabase(): Promise<InventoryWorkspaceData> {
  if (!supabase) return { items: readInventoryItemsFromLocal(), movements: readInventoryMovementsFromLocal() };
  const companyId = requireActiveCompanyId();
  const [items, movements, balances] = await Promise.all([
    supabase.from("inventory_items").select("*").eq("company_id", companyId).order("item_name", { ascending: true }),
    supabase.from("inventory_movement_details").select("*").eq("company_id", companyId).order("created_at", { ascending: false }),
    supabase.from("inventory_item_balances").select("*").eq("company_id", companyId).order("item_name", { ascending: true }),
  ]);
  if (items.error) throw items.error;
  if (movements.error) throw movements.error;
  if (balances.error) throw balances.error;
  return {
    items: (items.data || []).map((row) => inventoryItemFromRow(row as Row)),
    movements: (movements.data || []).map((row) => inventoryMovementFromRow(row as Row)),
    balances: (balances.data || []).map((row) => inventoryBalanceFromRow(row as Row)),
  };
}

export async function saveInventoryItemToSupabase(input: InventoryItemSaveInput): Promise<InventoryItem> {
  if (!supabase) throw new Error("Supabase is not configured.");
  const companyId = requireActiveCompanyId();
  const { data, error } = await supabase.rpc("save_inventory_item", {
    p_item: {
      id: input.id || null,
      companyId,
      itemName: input.itemName.trim(),
      itemCode: input.itemCode?.trim().toUpperCase() || null,
      category: input.category?.trim() || null,
      stockUnit: input.stockUnit.trim().toLowerCase(),
      status: input.status || "ACTIVE",
    },
  });
  if (error) throw error;
  return inventoryItemFromRow(data as Row);
}

export async function recordInventoryMovementToSupabase(input: InventoryMovementInput): Promise<InventoryMovement> {
  if (!supabase) throw new Error("Supabase is not configured.");
  const companyId = requireActiveCompanyId();
  const { data, error } = await supabase.rpc("record_inventory_movement", {
    p_movement: {
      companyId,
      movementType: input.movementType,
      itemId: input.inventoryItemId || null,
      quantity: input.quantity ?? null,
      projectId: input.projectId || null,
      projectMaterialId: input.projectMaterialId || null,
      reason: input.reason.trim(),
      reference: input.reference?.trim() || null,
      sourceType: input.sourceType || "MANUAL",
      purchaseOrderReceiptId: input.purchaseOrderReceiptId || null,
      purchaseOrderLineId: input.purchaseOrderLineId || null,
      reversalOfMovementId: input.reversalOfMovementId || null,
      idempotencyKey: input.idempotencyKey.trim(),
      effectiveDate: input.effectiveDate || null,
    },
  });
  if (error) throw error;
  return inventoryMovementFromRow(data as Row);
}

export async function reverseInventoryMovementToSupabase(
  movementId: string,
  reason: string,
  idempotencyKey: string,
): Promise<InventoryMovement> {
  return recordInventoryMovementToSupabase({
    movementType: "REVERSAL",
    reversalOfMovementId: movementId,
    reason,
    idempotencyKey,
  });
}
