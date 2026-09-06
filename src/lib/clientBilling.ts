import type { ClientBilling as ClientBillingRecord, ClientBillingEvent as ClientBillingEventRecord, ClientBillingLine as ClientBillingLineRecord, ClientBillingStatus as ClientBillingStatusRecord, Project, ProjectStatus } from "../types.ts";
import { companyScopedRow, requireActiveCompanyId } from "./companyContext.ts";
import { supabase } from "./supabase.ts";

export type ClientBillingStatus = ClientBillingStatusRecord;
export type ClientBilling = ClientBillingRecord;
export type ClientBillingLine = ClientBillingLineRecord;

export interface ClientBillingLineInput {
  description: string;
  amount: number;
  notes?: string;
}

export interface ClientBillingInput {
  id?: string;
  projectId: string;
  billingNumber: string;
  billingDate?: string;
  dueDate?: string;
  paymentTerms?: string;
  periodStart?: string;
  periodEnd?: string;
  clientNameSnapshot?: string;
  clientReferenceSnapshot?: string;
  billingContactName?: string;
  billingEmail?: string;
  billingAddress?: string;
  currency?: string;
  notes?: string;
}

export type ClientBillingEvent = ClientBillingEventRecord;

export interface ClientBillingWorkspaceData {
  billings: ClientBilling[];
  events: ClientBillingEvent[];
}

export interface ClientBillingSummary {
  currency: string;
  contractValue?: number;
  billedToDate?: number;
  remainingToBill?: number;
  issuedBillingCount: number;
  totalBillingCount: number;
  hasCurrencyMismatch: boolean;
  reason?: string;
}

const CLIENT_BILLINGS_STORAGE_KEY = "engoryx:client-billings:v1";
const CLIENT_BILLING_EVENTS_STORAGE_KEY = "engoryx:client-billing-events:v1";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type Row = Record<string, unknown>;

function text(value: unknown): string | undefined {
  return value === null || value === undefined || value === "" ? undefined : String(value);
}

function numberValue(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function roundBillingMoney(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : 0;
}

export function clientBillingTotal(billing: Pick<ClientBilling, "lines"> | { lines?: readonly Pick<ClientBillingLine, "amount">[] }): number {
  return roundBillingMoney((billing.lines || []).reduce((sum, line) => sum + Math.max(0, numberValue(line.amount)), 0));
}

export function isIssuedClientBilling(billing: Pick<ClientBilling, "status">): boolean {
  return billing.status === "ISSUED";
}

export function isClientBillingProjectStatusAllowed(status: ProjectStatus): boolean {
  return ["PLANNING", "ACTIVE", "ON_HOLD", "COMPLETED"].includes(status);
}

export function calculateClientBillingSummary(
  project: Pick<Project, "id" | "contractValue" | "currency">,
  billings: readonly ClientBilling[],
): ClientBillingSummary {
  const currency = String(project.currency || "").trim().toUpperCase() || "UNKNOWN";
  const projectBillings = billings.filter((billing) => billing.projectId && billing.projectId === project.id);
  const hasCurrencyMismatch = projectBillings.some((billing) => String(billing.currency || "").trim().toUpperCase() !== currency);
  const issuedBillingCount = projectBillings.filter(isIssuedClientBilling).length;
  const contractValue = Number.isFinite(Number(project.contractValue)) ? roundBillingMoney(project.contractValue) : undefined;

  if (hasCurrencyMismatch) {
    return {
      currency,
      contractValue,
      issuedBillingCount,
      totalBillingCount: projectBillings.length,
      hasCurrencyMismatch: true,
      reason: "Billing records in another currency are present; billed-to-date and remaining-to-bill are withheld until the project currency contract is restored.",
    };
  }

  const billedToDate = roundBillingMoney(projectBillings.filter(isIssuedClientBilling).reduce((sum, billing) => sum + clientBillingTotal(billing), 0));
  return {
    currency,
    contractValue,
    billedToDate,
    remainingToBill: contractValue === undefined ? undefined : roundBillingMoney(contractValue - billedToDate),
    issuedBillingCount,
    totalBillingCount: projectBillings.length,
    hasCurrencyMismatch: false,
    reason: contractValue === undefined ? "Remaining to bill is unavailable until the project has a contract value." : undefined,
  };
}

function billingFromRow(row: Row, lines: ClientBillingLine[] = []): ClientBilling {
  return {
    id: String(row.id || ""),
    companyId: text(row.company_id),
    projectId: String(row.project_id || ""),
    billingNumber: String(row.billing_number || ""),
    billingDate: String(row.billing_date || ""),
    dueDate: text(row.due_date),
    paymentTerms: text(row.payment_terms),
    periodStart: text(row.period_start),
    periodEnd: text(row.period_end),
    clientNameSnapshot: text(row.client_name_snapshot),
    clientReferenceSnapshot: text(row.client_reference_snapshot),
    billingContactName: text(row.billing_contact_name),
    billingEmail: text(row.billing_email),
    billingAddress: text(row.billing_address),
    currency: String(row.currency || "PHP").toUpperCase(),
    status: String(row.status || "DRAFT") as ClientBillingStatus,
    notes: text(row.notes),
    lines,
    createdByUserId: text(row.created_by_user_id),
    updatedByUserId: text(row.updated_by_user_id),
    submittedByUserId: text(row.submitted_by_user_id),
    submittedAt: text(row.submitted_at),
    issuedByUserId: text(row.issued_by_user_id),
    issuedAt: text(row.issued_at),
    cancelledByUserId: text(row.cancelled_by_user_id),
    cancelledAt: text(row.cancelled_at),
    cancellationReason: text(row.cancellation_reason),
    voidedByUserId: text(row.voided_by_user_id),
    voidedAt: text(row.voided_at),
    voidReason: text(row.void_reason),
    createdAt: String(row.created_at || new Date().toISOString()),
    updatedAt: String(row.updated_at || new Date().toISOString()),
  };
}

function lineFromRow(row: Row): ClientBillingLine {
  return {
    id: String(row.id || ""),
    billingId: String(row.billing_id || ""),
    lineNumber: Math.max(1, Math.trunc(numberValue(row.line_number, 1))),
    description: String(row.description || ""),
    amount: roundBillingMoney(row.amount),
    notes: text(row.notes),
    createdAt: text(row.created_at),
    updatedAt: text(row.updated_at),
  };
}

function eventFromRow(row: Row): ClientBillingEvent {
  return {
    id: String(row.id || ""),
    companyId: text(row.company_id),
    billingId: String(row.billing_id || ""),
    eventType: String(row.event_type || "UPDATED") as ClientBillingEvent["eventType"],
    fromStatus: text(row.from_status) as ClientBillingEvent["fromStatus"],
    toStatus: String(row.to_status || "DRAFT") as ClientBillingStatus,
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

export function readClientBillingsFromLocal(storage?: Storage): ClientBilling[] {
  return readJson<ClientBilling>(CLIENT_BILLINGS_STORAGE_KEY, storage).map((billing) => ({ ...billing, lines: billing.lines || [] }));
}

export function readClientBillingEventsFromLocal(storage?: Storage): ClientBillingEvent[] {
  return readJson<ClientBillingEvent>(CLIENT_BILLING_EVENTS_STORAGE_KEY, storage);
}

export function writeClientBillingWorkspaceToLocal(data: ClientBillingWorkspaceData, storage?: Storage) {
  writeJson(CLIENT_BILLINGS_STORAGE_KEY, data.billings, storage);
  writeJson(CLIENT_BILLING_EVENTS_STORAGE_KEY, data.events, storage);
}

function localId(prefix: string) {
  return globalThis.crypto?.randomUUID?.() || `local-${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function dateOnly(value?: string) {
  return value?.trim() || new Date().toISOString().slice(0, 10);
}

export function buildLocalClientBilling(
  input: ClientBillingInput,
  lines: readonly ClientBillingLineInput[],
  existing?: ClientBilling,
  companyId = "guest-company",
  timestamp = new Date().toISOString(),
): ClientBilling {
  const normalizedLines = lines.map((line, index) => ({
    id: existing?.lines[index]?.id || localId("billing-line"),
    billingId: existing?.id || input.id || localId("billing"),
    lineNumber: index + 1,
    description: line.description.trim(),
    amount: roundBillingMoney(Math.max(0, Number(line.amount) || 0)),
    notes: line.notes?.trim() || undefined,
    createdAt: existing?.lines[index]?.createdAt || timestamp,
    updatedAt: timestamp,
  }));
  const id = existing?.id || input.id || localId("billing");
  return {
    id,
    companyId: existing?.companyId || companyId,
    projectId: input.projectId,
    billingNumber: input.billingNumber.trim().toUpperCase(),
    billingDate: dateOnly(input.billingDate),
    dueDate: input.dueDate?.trim() || undefined,
    paymentTerms: input.paymentTerms?.trim() || undefined,
    periodStart: input.periodStart?.trim() || undefined,
    periodEnd: input.periodEnd?.trim() || undefined,
    clientNameSnapshot: input.clientNameSnapshot?.trim() || undefined,
    clientReferenceSnapshot: input.clientReferenceSnapshot?.trim() || undefined,
    billingContactName: input.billingContactName?.trim() || undefined,
    billingEmail: input.billingEmail?.trim() || undefined,
    billingAddress: input.billingAddress?.trim() || undefined,
    currency: (input.currency || "PHP").trim().toUpperCase(),
    status: existing?.status || "DRAFT",
    notes: input.notes?.trim() || undefined,
    lines: normalizedLines.map((line) => ({ ...line, billingId: id })),
    createdByUserId: existing?.createdByUserId,
    updatedByUserId: existing?.updatedByUserId,
    submittedByUserId: existing?.submittedByUserId,
    submittedAt: existing?.submittedAt,
    issuedByUserId: existing?.issuedByUserId,
    issuedAt: existing?.issuedAt,
    cancelledByUserId: existing?.cancelledByUserId,
    cancelledAt: existing?.cancelledAt,
    cancellationReason: existing?.cancellationReason,
    voidedByUserId: existing?.voidedByUserId,
    voidedAt: existing?.voidedAt,
    voidReason: existing?.voidReason,
    createdAt: existing?.createdAt || timestamp,
    updatedAt: timestamp,
  };
}

export function appendClientBillingEvent(
  events: readonly ClientBillingEvent[],
  billing: ClientBilling,
  eventType: ClientBillingEvent["eventType"],
  fromStatus: ClientBillingStatus | undefined,
  reason?: string,
  timestamp = new Date().toISOString(),
): ClientBillingEvent[] {
  return [{
    id: localId("billing-event"),
    companyId: billing.companyId,
    billingId: billing.id,
    eventType,
    fromStatus,
    toStatus: billing.status,
    reason: reason?.trim() || undefined,
    createdAt: timestamp,
  }, ...events];
}

export function upsertClientBilling(items: readonly ClientBilling[], value: ClientBilling): ClientBilling[] {
  return items.some((item) => item.id === value.id)
    ? items.map((item) => item.id === value.id ? value : item)
    : [value, ...items];
}

export function applyLocalClientBillingTransition(
  billing: ClientBilling,
  targetStatus: ClientBillingStatus,
  project: Pick<Project, "id" | "status" | "contractValue" | "currency">,
  allBillings: readonly ClientBilling[],
  reason?: string,
  timestamp = new Date().toISOString(),
): { billing: ClientBilling; event: ClientBillingEvent } {
  const target = targetStatus;
  const projectStatusAllowed = isClientBillingProjectStatusAllowed(project.status);
  if (billing.status === "DRAFT" && !["SUBMITTED", "CANCELLED"].includes(target)) throw new Error("Draft client billings can only be submitted or cancelled.");
  if (billing.status === "SUBMITTED" && !["DRAFT", "ISSUED", "CANCELLED"].includes(target)) throw new Error("Submitted client billings can only return to draft, be issued, or be cancelled.");
  if (billing.status === "ISSUED" && target !== "VOIDED") throw new Error("Issued client billings can only be voided with a reason.");
  if (["CANCELLED", "VOIDED"].includes(billing.status)) throw new Error("Cancelled or voided client billings cannot undergo further transitions.");
  if (["DRAFT", "SUBMITTED", "ISSUED"].includes(target) && !projectStatusAllowed) throw new Error("Only PLANNING, ACTIVE, ON_HOLD, and COMPLETED projects may create, submit, or issue client billings.");
  if (["DRAFT", "CANCELLED", "VOIDED"].includes(target) && (reason || "").trim().length < 3) throw new Error("A reason of at least 3 characters is required for this client billing correction.");

  const total = clientBillingTotal(billing);
  if (target === "ISSUED") {
    const projectCurrency = String(project.currency || "").trim().toUpperCase();
    if (allBillings.some((candidate) => candidate.projectId === project.id && String(candidate.currency || "").trim().toUpperCase() !== projectCurrency)) {
      throw new Error("Client billing currency must match the project currency before issuance.");
    }
    const contractValue = Number(project.contractValue);
    if (!Number.isFinite(contractValue) || contractValue <= 0) throw new Error("Client billing cannot be issued until the project has a positive contract value.");
    if (total <= 0) throw new Error("Client billing must have a positive line total before it can be issued.");
    const issuedBefore = allBillings
      .filter((candidate) => candidate.id !== billing.id && candidate.projectId === project.id && candidate.status === "ISSUED" && String(candidate.currency || "").trim().toUpperCase() === projectCurrency)
      .reduce((sum, candidate) => sum + clientBillingTotal(candidate), 0);
    if (roundBillingMoney(issuedBefore + total) > roundBillingMoney(contractValue)) {
      throw new Error(`Client billing would exceed the project contract value by ${roundBillingMoney(issuedBefore + total - contractValue).toFixed(2)}.`);
    }
  }

  const updated: ClientBilling = {
    ...billing,
    status: target,
    submittedAt: target === "SUBMITTED" ? timestamp : billing.submittedAt,
    issuedAt: target === "ISSUED" ? timestamp : billing.issuedAt,
    cancelledAt: target === "CANCELLED" ? timestamp : billing.cancelledAt,
    cancellationReason: target === "CANCELLED" ? reason?.trim() : billing.cancellationReason,
    voidedAt: target === "VOIDED" ? timestamp : billing.voidedAt,
    voidReason: target === "VOIDED" ? reason?.trim() : billing.voidReason,
    updatedAt: timestamp,
  };
  const eventType: ClientBillingEvent["eventType"] = target === "DRAFT" ? "RETURNED_TO_DRAFT" : target;
  const event: ClientBillingEvent = {
    id: localId("billing-event"),
    companyId: updated.companyId,
    billingId: updated.id,
    eventType,
    fromStatus: billing.status,
    toStatus: updated.status,
    reason: reason?.trim() || undefined,
    createdAt: timestamp,
  };
  return { billing: updated, event };
}

export async function loadClientBillingWorkspaceFromSupabase(): Promise<ClientBillingWorkspaceData> {
  const userId = await currentUserId();
  if (!supabase || !userId) return { billings: [], events: [] };
  const companyId = requireActiveCompanyId();
  const { data: billingRows, error: billingError } = await supabase
    .from("client_billings")
    .select("*")
    .eq("company_id", companyId)
    .order("billing_date", { ascending: false })
    .order("updated_at", { ascending: false });
  if (billingError) throw billingError;
  const ids = (billingRows || []).map((row) => String((row as Row).id || "")).filter(Boolean);
  const [lineResult, eventResult] = await Promise.all([
    ids.length
      ? supabase.from("client_billing_lines").select("*").eq("company_id", companyId).in("billing_id", ids).order("line_number", { ascending: true })
      : Promise.resolve({ data: [], error: null }),
    ids.length
      ? supabase.from("client_billing_events").select("*").eq("company_id", companyId).in("billing_id", ids).order("created_at", { ascending: false }).order("id", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (lineResult.error) throw lineResult.error;
  if (eventResult.error) throw eventResult.error;
  const linesByBilling = new Map<string, ClientBillingLine[]>();
  for (const row of lineResult.data || []) {
    const line = lineFromRow(row as Row);
    linesByBilling.set(line.billingId, [...(linesByBilling.get(line.billingId) || []), line]);
  }
  return {
    billings: (billingRows || []).map((row) => {
      const raw = row as Row;
      return billingFromRow(raw, linesByBilling.get(String(raw.id || "")) || []);
    }),
    events: (eventResult.data || []).map((row) => eventFromRow(row as Row)),
  };
}

function responseBilling(value: unknown): ClientBilling {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Client billing persistence returned an invalid billing record.");
  const row = value as Row;
  const rawLines = Array.isArray(row.lines) ? row.lines : [];
  return billingFromRow(row.billing && typeof row.billing === "object" ? row.billing as Row : row, rawLines.map((line) => lineFromRow(line as Row)));
}

export async function saveClientBillingToSupabase(input: ClientBillingInput, lines: readonly ClientBillingLineInput[], existing?: ClientBilling): Promise<ClientBilling> {
  const userId = await currentUserId();
  if (!supabase || !userId) throw new Error("Sign in before saving client billings.");
  const companyId = requireActiveCompanyId();
  const payload = companyScopedRow({
    ...(existing?.id && UUID_PATTERN.test(existing.id) ? { id: existing.id } : input.id && UUID_PATTERN.test(input.id) ? { id: input.id } : {}),
    projectId: input.projectId,
    billingNumber: input.billingNumber,
    billingDate: input.billingDate || null,
    dueDate: input.dueDate || null,
    paymentTerms: input.paymentTerms || null,
    periodStart: input.periodStart || null,
    periodEnd: input.periodEnd || null,
    clientNameSnapshot: input.clientNameSnapshot || null,
    clientReferenceSnapshot: input.clientReferenceSnapshot || null,
    billingContactName: input.billingContactName || null,
    billingEmail: input.billingEmail || null,
    billingAddress: input.billingAddress || null,
    currency: input.currency || null,
    notes: input.notes || null,
  });
  const { data, error } = await supabase.rpc("create_or_update_client_billing", {
    p_billing: payload,
    p_lines: lines.map((line) => ({ description: line.description, amount: line.amount, notes: line.notes || null })),
  });
  if (error) throw error;
  let saved = responseBilling(data);
  // The mature billing RPC remains the financial source of truth; the
  // lightweight contact/due-date fields are additive document metadata.
  const metadata = {
    due_date: input.dueDate || null,
    payment_terms: input.paymentTerms || null,
    billing_contact_name: input.billingContactName || null,
    billing_email: input.billingEmail || null,
    billing_address: input.billingAddress || null,
  };
  const persistedId = saved.id;
  const { data: metadataRow, error: metadataError } = await supabase
    .from("client_billings")
    .update(metadata)
    .eq("company_id", companyId)
    .eq("id", persistedId)
    .eq("status", "DRAFT")
    .select("*")
    .maybeSingle();
  if (metadataError) throw metadataError;
  if (metadataRow) saved = billingFromRow(metadataRow as Row, saved.lines);
  return saved;
}

export async function transitionClientBillingToSupabase(
  billingId: string,
  targetStatus: ClientBillingStatus,
  reason?: string,
): Promise<ClientBilling> {
  const userId = await currentUserId();
  if (!supabase || !userId) throw new Error("Sign in before changing client billing lifecycle state.");
  requireActiveCompanyId();
  const { data, error } = await supabase.rpc("transition_client_billing", {
    p_billing_id: billingId,
    p_target_status: targetStatus,
    p_reason: reason || null,
  });
  if (error) throw error;
  return responseBilling(data);
}
