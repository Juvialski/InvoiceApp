import type {
  ClientBilling,
  ClientCollection as ClientCollectionRecord,
  ClientCollectionAllocation as ClientCollectionAllocationRecord,
  ClientCollectionEvent as ClientCollectionEventRecord,
  ClientCollectionStatus as ClientCollectionStatusRecord,
  Project,
  ProjectStatus,
} from "../types.ts";
import { clientBillingTotal, isIssuedClientBilling } from "./clientBilling.ts";
import { companyScopedRow, requireActiveCompanyId } from "./companyContext.ts";
import { supabase } from "./supabase.ts";

export type ClientCollectionStatus = ClientCollectionStatusRecord;
export type ClientCollection = ClientCollectionRecord;
export type ClientCollectionAllocation = ClientCollectionAllocationRecord;
export type ClientCollectionEvent = ClientCollectionEventRecord;

export interface ClientCollectionAllocationInput {
  billingId: string;
  amount: number;
  notes?: string;
}

export interface ClientCollectionInput {
  id?: string;
  projectId: string;
  collectionNumber: string;
  collectionDate?: string;
  externalReference?: string;
  payerSnapshot?: string;
  currency?: string;
  notes?: string;
}

export interface ClientCollectionWorkspaceData {
  collections: ClientCollection[];
  events: ClientCollectionEvent[];
}

export interface ClientCollectionSummary {
  currency: string;
  collectedToDate?: number;
  outstandingBilledAmount?: number;
  recordedCollectionCount: number;
  totalCollectionCount: number;
  hasCurrencyMismatch: boolean;
  reason?: string;
}

const CLIENT_COLLECTIONS_STORAGE_KEY = "engoryx:client-collections:v1";
const CLIENT_COLLECTION_EVENTS_STORAGE_KEY = "engoryx:client-collection-events:v1";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type Row = Record<string, unknown>;

function text(value: unknown): string | undefined {
  return value === null || value === undefined || value === "" ? undefined : String(value);
}

function numberValue(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function roundCollectionMoney(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : 0;
}

export function isRecordedClientCollection(collection: Pick<ClientCollection, "status">): boolean {
  return collection.status === "RECORDED";
}

export function isClientCollectionProjectStatusAllowed(status: ProjectStatus): boolean {
  return ["PLANNING", "ACTIVE", "ON_HOLD", "COMPLETED"].includes(status);
}

export function clientCollectionTotal(
  collection: Pick<ClientCollection, "allocations"> | { allocations?: readonly Pick<ClientCollectionAllocation, "amount">[] }
): number {
  return roundCollectionMoney(
    (collection.allocations || []).reduce((sum, alloc) => sum + Math.max(0, numberValue(alloc.amount)), 0)
  );
}

export function billingCollectedAmount(
  billingId: string,
  collections: readonly ClientCollection[],
  excludeCollectionId?: string,
): number {
  let total = 0;
  for (const collection of collections) {
    if (excludeCollectionId && collection.id === excludeCollectionId) continue;
    if (!isRecordedClientCollection(collection)) continue;
    for (const alloc of collection.allocations || []) {
      if (alloc.billingId === billingId) {
        total += Math.max(0, numberValue(alloc.amount));
      }
    }
  }
  return roundCollectionMoney(total);
}

export function billingOutstandingAmount(
  billing: ClientBilling,
  collections: readonly ClientCollection[],
  excludeCollectionId?: string,
): number {
  const lineTotal = clientBillingTotal(billing);
  const collected = billingCollectedAmount(billing.id, collections, excludeCollectionId);
  return roundCollectionMoney(Math.max(0, lineTotal - collected));
}

export function calculateClientCollectionSummary(
  project: Pick<Project, "id" | "currency">,
  billings: readonly ClientBilling[],
  collections: readonly ClientCollection[],
): ClientCollectionSummary {
  const currency = String(project.currency || "").trim().toUpperCase() || "UNKNOWN";
  const projectBillings = billings.filter((b) => b.projectId && b.projectId === project.id);
  const projectCollections = collections.filter((c) => c.projectId && c.projectId === project.id);

  const billingCurrencyMismatch = projectBillings.some(
    (b) => String(b.currency || "").trim().toUpperCase() !== currency
  );
  const collectionCurrencyMismatch = projectCollections.some(
    (c) => String(c.currency || "").trim().toUpperCase() !== currency
  );

  const recordedCollections = projectCollections.filter(isRecordedClientCollection);
  const recordedCollectionCount = recordedCollections.length;
  const totalCollectionCount = projectCollections.length;

  if (billingCurrencyMismatch || collectionCurrencyMismatch) {
    return {
      currency,
      collectedToDate: undefined,
      outstandingBilledAmount: undefined,
      recordedCollectionCount,
      totalCollectionCount,
      hasCurrencyMismatch: true,
      reason: "Billing or collection records in another currency are present; collected-to-date and outstanding-billed are withheld until the project currency contract is restored.",
    };
  }

  const issuedBillings = projectBillings.filter(isIssuedClientBilling);
  const billedToDate = roundCollectionMoney(
    issuedBillings.reduce((sum, b) => sum + clientBillingTotal(b), 0)
  );

  const collectedToDate = roundCollectionMoney(
    recordedCollections.reduce((sum, c) => sum + clientCollectionTotal(c), 0)
  );

  const outstandingBilledAmount = roundCollectionMoney(Math.max(0, billedToDate - collectedToDate));

  return {
    currency,
    collectedToDate,
    outstandingBilledAmount,
    recordedCollectionCount,
    totalCollectionCount,
    hasCurrencyMismatch: false,
  };
}

function collectionFromRow(row: Row, allocations: ClientCollectionAllocation[] = []): ClientCollection {
  return {
    id: String(row.id || ""),
    companyId: text(row.company_id),
    projectId: String(row.project_id || ""),
    collectionNumber: String(row.collection_number || ""),
    collectionDate: String(row.collection_date || ""),
    externalReference: text(row.external_reference),
    payerSnapshot: text(row.payer_snapshot),
    currency: String(row.currency || "PHP").toUpperCase(),
    status: String(row.status || "DRAFT") as ClientCollectionStatus,
    notes: text(row.notes),
    allocations,
    createdByUserId: text(row.created_by_user_id),
    updatedByUserId: text(row.updated_by_user_id),
    recordedByUserId: text(row.recorded_by_user_id),
    recordedAt: text(row.recorded_at),
    reversedByUserId: text(row.reversed_by_user_id),
    reversedAt: text(row.reversed_at),
    reversalReason: text(row.reversal_reason),
    createdAt: String(row.created_at || new Date().toISOString()),
    updatedAt: String(row.updated_at || new Date().toISOString()),
  };
}

function allocationFromRow(row: Row): ClientCollectionAllocation {
  return {
    id: String(row.id || ""),
    companyId: text(row.company_id),
    collectionId: String(row.collection_id || ""),
    billingId: String(row.billing_id || ""),
    amount: roundCollectionMoney(row.amount),
    notes: text(row.notes),
    createdAt: text(row.created_at),
    updatedAt: text(row.updated_at),
  };
}

function eventFromRow(row: Row): ClientCollectionEvent {
  return {
    id: String(row.id || ""),
    companyId: text(row.company_id),
    collectionId: String(row.collection_id || ""),
    eventType: String(row.event_type || "UPDATED") as ClientCollectionEvent["eventType"],
    fromStatus: text(row.from_status) as ClientCollectionEvent["fromStatus"],
    toStatus: String(row.to_status || "DRAFT") as ClientCollectionStatus,
    reason: text(row.reason),
    actorUserId: text(row.actor_user_id),
    createdAt: String(row.created_at || new Date().toISOString()),
  };
}

async function currentUserId(): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getUser();
  return data.user?.id || null;
}

function readJson<T>(key: string, storage?: Storage): T[] {
  const target = storage || (typeof localStorage === "undefined" ? undefined : localStorage);
  if (!target) return [];
  try {
    const parsed = JSON.parse(target.getItem(key) || "[]");
    return Array.isArray(parsed) ? parsed as T[] : [];
  } catch {
    return [];
  }
}

function writeJson<T>(key: string, value: T[], storage?: Storage) {
  try {
    (storage || (typeof localStorage === "undefined" ? undefined : localStorage))?.setItem(key, JSON.stringify(value));
  } catch {
    // Guest storage is best effort.
  }
}

export function readClientCollectionsFromLocal(storage?: Storage): ClientCollection[] {
  return readJson<ClientCollection>(CLIENT_COLLECTIONS_STORAGE_KEY, storage).map((c) => ({
    ...c,
    allocations: c.allocations || [],
  }));
}

export function readClientCollectionEventsFromLocal(storage?: Storage): ClientCollectionEvent[] {
  return readJson<ClientCollectionEvent>(CLIENT_COLLECTION_EVENTS_STORAGE_KEY, storage);
}

export function writeClientCollectionWorkspaceToLocal(data: ClientCollectionWorkspaceData, storage?: Storage) {
  writeJson(CLIENT_COLLECTIONS_STORAGE_KEY, data.collections, storage);
  writeJson(CLIENT_COLLECTION_EVENTS_STORAGE_KEY, data.events, storage);
}

function localId(prefix: string) {
  return globalThis.crypto?.randomUUID?.() || `local-${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function dateOnly(value?: string) {
  return value?.trim() || new Date().toISOString().slice(0, 10);
}

export function buildLocalClientCollection(
  input: ClientCollectionInput,
  allocations: readonly ClientCollectionAllocationInput[],
  existing?: ClientCollection,
  companyId = "guest-company",
  timestamp = new Date().toISOString(),
): ClientCollection {
  const id = existing?.id || input.id || localId("collection");
  const normalizedAllocations = allocations.map((alloc, index) => ({
    id: existing?.allocations[index]?.id || localId("collection-alloc"),
    companyId: existing?.companyId || companyId,
    collectionId: id,
    billingId: alloc.billingId,
    amount: roundCollectionMoney(Math.max(0, Number(alloc.amount) || 0)),
    notes: alloc.notes?.trim() || undefined,
    createdAt: existing?.allocations[index]?.createdAt || timestamp,
    updatedAt: timestamp,
  }));

  return {
    id,
    companyId: existing?.companyId || companyId,
    projectId: input.projectId,
    collectionNumber: input.collectionNumber.trim().toUpperCase(),
    collectionDate: dateOnly(input.collectionDate),
    externalReference: input.externalReference?.trim() || undefined,
    payerSnapshot: input.payerSnapshot?.trim() || undefined,
    currency: (input.currency || "PHP").trim().toUpperCase(),
    status: existing?.status || "DRAFT",
    notes: input.notes?.trim() || undefined,
    allocations: normalizedAllocations,
    createdByUserId: existing?.createdByUserId,
    updatedByUserId: existing?.updatedByUserId,
    recordedByUserId: existing?.recordedByUserId,
    recordedAt: existing?.recordedAt,
    reversedByUserId: existing?.reversedByUserId,
    reversedAt: existing?.reversedAt,
    reversalReason: existing?.reversalReason,
    createdAt: existing?.createdAt || timestamp,
    updatedAt: timestamp,
  };
}

export function appendClientCollectionEvent(
  events: readonly ClientCollectionEvent[],
  collection: ClientCollection,
  eventType: ClientCollectionEvent["eventType"],
  fromStatus: ClientCollectionStatus | undefined,
  reason?: string,
  timestamp = new Date().toISOString(),
): ClientCollectionEvent[] {
  return [{
    id: localId("collection-event"),
    companyId: collection.companyId,
    collectionId: collection.id,
    eventType,
    fromStatus,
    toStatus: collection.status,
    reason: reason?.trim() || undefined,
    createdAt: timestamp,
  }, ...events];
}

export function applyLocalClientCollectionRecord(
  collection: ClientCollection,
  project: Pick<Project, "id" | "status" | "currency">,
  allBillings: readonly ClientBilling[],
  allCollections: readonly ClientCollection[],
  timestamp = new Date().toISOString(),
): { collection: ClientCollection; event: ClientCollectionEvent } {
  if (collection.status !== "DRAFT") {
    throw new Error("Only draft client collections can be recorded.");
  }
  if (["ARCHIVED", "CANCELLED"].includes(project.status)) {
    throw new Error("Archived or cancelled projects cannot receive new collection activity.");
  }
  if (!collection.allocations || collection.allocations.length === 0) {
    throw new Error("Client collection must have at least one allocation before it can be recorded.");
  }

  const projectCurrency = String(project.currency || "").trim().toUpperCase();
  if (String(collection.currency || "").trim().toUpperCase() !== projectCurrency) {
    throw new Error("Client collection currency must match project currency.");
  }

  for (const alloc of collection.allocations) {
    const billing = allBillings.find((b) => b.id === alloc.billingId);
    if (!billing) {
      throw new Error(`Target client billing ${alloc.billingId} does not exist.`);
    }
    if (billing.projectId !== project.id) {
      throw new Error("Collection allocation billing must belong to the collection project.");
    }
    if (String(billing.currency || "").trim().toUpperCase() !== projectCurrency) {
      throw new Error("Collection allocation billing currency must match collection currency.");
    }
    if (billing.status !== "ISSUED") {
      throw new Error(`Only ISSUED client billings may receive collection allocations (billing ${billing.billingNumber} is ${billing.status}).`);
    }
    if (alloc.amount <= 0) {
      throw new Error("Collection allocation amount must be positive.");
    }

    const billingTotal = clientBillingTotal(billing);
    let alreadyCollected = 0;
    for (const c of allCollections) {
      if (c.id === collection.id || !isRecordedClientCollection(c)) continue;
      for (const a of c.allocations || []) {
        if (a.billingId === billing.id) {
          alreadyCollected += Math.max(0, numberValue(a.amount));
        }
      }
    }
    alreadyCollected = roundCollectionMoney(alreadyCollected);

    if (roundCollectionMoney(alreadyCollected + alloc.amount) > billingTotal) {
      const remaining = roundCollectionMoney(billingTotal - alreadyCollected);
      throw new Error(`Collection allocation of ${alloc.amount.toFixed(2)} exceeds remaining uncollected billing amount of ${remaining.toFixed(2)} for billing ${billing.billingNumber}.`);
    }
  }

  const updated: ClientCollection = {
    ...collection,
    status: "RECORDED",
    recordedAt: timestamp,
    updatedAt: timestamp,
  };

  const event: ClientCollectionEvent = {
    id: localId("col-event"),
    companyId: updated.companyId,
    collectionId: updated.id,
    eventType: "RECORDED",
    fromStatus: "DRAFT",
    toStatus: "RECORDED",
    createdAt: timestamp,
  };

  return { collection: updated, event };
}

export function applyLocalClientCollectionReverse(
  collection: ClientCollection,
  reason: string,
  timestamp = new Date().toISOString(),
): { collection: ClientCollection; event: ClientCollectionEvent } {
  if (collection.status !== "RECORDED") {
    throw new Error("Only RECORDED client collections can be reversed.");
  }
  const cleanReason = (reason || "").trim();
  if (cleanReason.length < 3) {
    throw new Error("A reason of at least 3 characters is required to reverse a recorded client collection.");
  }

  const updated: ClientCollection = {
    ...collection,
    status: "REVERSED",
    reversedAt: timestamp,
    reversalReason: cleanReason,
    updatedAt: timestamp,
  };

  const event: ClientCollectionEvent = {
    id: localId("col-event"),
    companyId: updated.companyId,
    collectionId: updated.id,
    eventType: "REVERSED",
    fromStatus: "RECORDED",
    toStatus: "REVERSED",
    reason: cleanReason,
    createdAt: timestamp,
  };

  return { collection: updated, event };
}

export const applyLocalClientCollectionReversal = applyLocalClientCollectionReverse;

export function upsertClientCollection(items: readonly ClientCollection[], value: ClientCollection): ClientCollection[] {
  return items.some((item) => item.id === value.id)
    ? items.map((item) => item.id === value.id ? value : item)
    : [value, ...items];
}

export async function loadClientCollectionWorkspaceFromSupabase(): Promise<ClientCollectionWorkspaceData> {
  const userId = await currentUserId();
  if (!supabase || !userId) return { collections: [], events: [] };
  const companyId = requireActiveCompanyId();

  const { data: collectionRows, error: colError } = await supabase
    .from("client_collections")
    .select("*")
    .eq("company_id", companyId)
    .order("collection_date", { ascending: false })
    .order("updated_at", { ascending: false });

  if (colError) throw colError;
  const ids = (collectionRows || []).map((row) => String((row as Row).id || "")).filter(Boolean);

  const [allocResult, eventResult] = await Promise.all([
    ids.length
      ? supabase.from("client_collection_allocations").select("*").eq("company_id", companyId).in("collection_id", ids).order("created_at", { ascending: true })
      : Promise.resolve({ data: [], error: null }),
    ids.length
      ? supabase.from("client_collection_events").select("*").eq("company_id", companyId).in("collection_id", ids).order("created_at", { ascending: false }).order("id", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (allocResult.error) throw allocResult.error;
  if (eventResult.error) throw eventResult.error;

  const allocsByCol = new Map<string, ClientCollectionAllocation[]>();
  for (const row of allocResult.data || []) {
    const alloc = allocationFromRow(row as Row);
    allocsByCol.set(alloc.collectionId, [...(allocsByCol.get(alloc.collectionId) || []), alloc]);
  }

  return {
    collections: (collectionRows || []).map((row) => {
      const raw = row as Row;
      return collectionFromRow(raw, allocsByCol.get(String(raw.id || "")) || []);
    }),
    events: (eventResult.data || []).map((row) => eventFromRow(row as Row)),
  };
}

function responseCollection(value: unknown): ClientCollection {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Client collection persistence returned an invalid collection record.");
  }
  const row = value as Row;
  const rawAllocs = Array.isArray(row.allocations) ? row.allocations : [];
  return collectionFromRow(
    row.collection && typeof row.collection === "object" ? row.collection as Row : row,
    rawAllocs.map((a) => allocationFromRow(a as Row))
  );
}

export async function saveClientCollectionToSupabase(
  input: ClientCollectionInput,
  allocations: readonly ClientCollectionAllocationInput[],
  existing?: ClientCollection,
): Promise<ClientCollection> {
  const userId = await currentUserId();
  if (!supabase || !userId) throw new Error("Sign in before saving client collections.");
  const companyId = requireActiveCompanyId();

  const payload = companyScopedRow({
    ...(existing?.id && UUID_PATTERN.test(existing.id) ? { id: existing.id } : input.id && UUID_PATTERN.test(input.id) ? { id: input.id } : {}),
    projectId: input.projectId,
    collectionNumber: input.collectionNumber,
    collectionDate: input.collectionDate || null,
    externalReference: input.externalReference || null,
    payerSnapshot: input.payerSnapshot || null,
    currency: input.currency || null,
    notes: input.notes || null,
  });

  const { data, error } = await supabase.rpc("create_or_update_client_collection", {
    p_collection: payload,
    p_allocations: allocations.map((a) => ({
      billingId: a.billingId,
      amount: a.amount,
      notes: a.notes || null,
    })),
  });

  if (error) throw error;
  return responseCollection(data);
}

export async function recordClientCollectionToSupabase(
  collectionId: string,
): Promise<ClientCollection> {
  const userId = await currentUserId();
  if (!supabase || !userId) throw new Error("Sign in before recording client collections.");
  requireActiveCompanyId();

  const { data, error } = await supabase.rpc("record_client_collection", {
    p_collection_id: collectionId,
  });

  if (error) throw error;
  return responseCollection(data);
}

export async function reverseClientCollectionToSupabase(
  collectionId: string,
  reason: string,
): Promise<ClientCollection> {
  const userId = await currentUserId();
  if (!supabase || !userId) throw new Error("Sign in before reversing client collections.");
  requireActiveCompanyId();

  const { data, error } = await supabase.rpc("reverse_client_collection", {
    p_collection_id: collectionId,
    p_reason: reason,
  });

  if (error) throw error;
  return responseCollection(data);
}
