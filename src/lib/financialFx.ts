import type {
  FinancialFxRateSource,
  FinancialFxSnapshot,
  FinancialFxSourceType,
} from "../types.ts";
import { normalizeFinancialCurrency, roundFinancialAmount } from "../utils/financialCurrency.ts";
import { requireActiveCompanyId } from "./companyContext.ts";
import { supabase } from "./supabase.ts";

export interface FinancialFxSnapshotInput {
  sourceType: FinancialFxSourceType;
  sourceId: string;
  sourceAmount: number;
  sourceCurrency: string;
  baseCurrency: string;
  rate: number;
  rateDate: string;
  rateSource?: FinancialFxRateSource;
  note?: string;
}

type Row = Record<string, unknown>;

function text(value: unknown) {
  return value === null || value === undefined || value === "" ? undefined : String(value);
}

function snapshotFromRow(row: Row): FinancialFxSnapshot {
  return {
    id: String(row.id || ""),
    companyId: text(row.company_id),
    sourceType: String(row.source_type || "EXPENSE") as FinancialFxSourceType,
    sourceId: String(row.source_id || ""),
    sourceAmount: roundFinancialAmount(row.source_amount),
    sourceCurrency: normalizeFinancialCurrency(text(row.source_currency)),
    baseCurrency: normalizeFinancialCurrency(text(row.base_currency)),
    rate: Number(row.rate) || 0,
    rateDate: String(row.rate_date || ""),
    rateSource: String(row.rate_source || "MANUAL") as FinancialFxRateSource,
    note: text(row.note),
    enteredByUserId: text(row.entered_by_user_id),
    confirmedAt: String(row.confirmed_at || row.created_at || new Date().toISOString()),
    createdAt: String(row.created_at || new Date().toISOString()),
    baseAmount: roundFinancialAmount(row.base_amount),
  };
}

function parseSnapshot(value: unknown): FinancialFxSnapshot {
  const raw = value && typeof value === "object" && !Array.isArray(value)
    ? ((value as Row).snapshot && typeof (value as Row).snapshot === "object" ? (value as Row).snapshot : value) as Row
    : {};
  const snapshot = snapshotFromRow({
    id: raw.id,
    company_id: raw.companyId ?? raw.company_id,
    source_type: raw.sourceType ?? raw.source_type,
    source_id: raw.sourceId ?? raw.source_id,
    source_amount: raw.sourceAmount ?? raw.source_amount,
    source_currency: raw.sourceCurrency ?? raw.source_currency,
    base_currency: raw.baseCurrency ?? raw.base_currency,
    rate: raw.rate,
    rate_date: raw.rateDate ?? raw.rate_date,
    rate_source: raw.rateSource ?? raw.rate_source,
    note: raw.note,
    entered_by_user_id: raw.enteredByUserId ?? raw.entered_by_user_id,
    confirmed_at: raw.confirmedAt ?? raw.confirmed_at,
    created_at: raw.createdAt ?? raw.created_at,
    base_amount: raw.baseAmount ?? raw.base_amount,
  });
  if (!snapshot.id || !snapshot.sourceId || !snapshot.rateDate || (snapshot.sourceAmount > 0 && !snapshot.baseAmount)) {
    throw new Error("FX snapshot returned an invalid response.");
  }
  return snapshot;
}

export function readFinancialFxSnapshotsFromLocal(storage: Storage | undefined = typeof localStorage === "undefined" ? undefined : localStorage): FinancialFxSnapshot[] {
  if (!storage) return [];
  try {
    const value = JSON.parse(storage.getItem("hydroqualisense:financial-fx-snapshots:v1") || "[]");
    return Array.isArray(value) ? value as FinancialFxSnapshot[] : [];
  } catch {
    return [];
  }
}

export function writeFinancialFxSnapshotsToLocal(snapshots: FinancialFxSnapshot[], storage: Storage | undefined = typeof localStorage === "undefined" ? undefined : localStorage) {
  try { storage?.setItem("hydroqualisense:financial-fx-snapshots:v1", JSON.stringify(snapshots)); } catch { /* guest storage is best effort */ }
}

export function createLocalFinancialFxSnapshot(input: FinancialFxSnapshotInput, timestamp = new Date().toISOString()): FinancialFxSnapshot {
  const sourceAmount = roundFinancialAmount(Math.max(0, input.sourceAmount));
  const rate = Number(input.rate);
  if (!input.sourceId || !sourceAmount || !Number.isFinite(rate) || rate <= 0) throw new Error("FX snapshot requires a positive source amount and exchange rate.");
  return {
    id: globalThis.crypto?.randomUUID?.() || `local-fx-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    sourceAmount,
    sourceCurrency: normalizeFinancialCurrency(input.sourceCurrency),
    baseCurrency: normalizeFinancialCurrency(input.baseCurrency),
    rate,
    rateDate: input.rateDate,
    rateSource: input.rateSource || "MANUAL",
    note: input.note?.trim() || undefined,
    confirmedAt: timestamp,
    createdAt: timestamp,
    baseAmount: roundFinancialAmount(sourceAmount * rate),
  };
}

export async function loadFinancialFxSnapshotsFromSupabase(): Promise<FinancialFxSnapshot[]> {
  if (!supabase) return [];
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return [];
  const companyId = requireActiveCompanyId();
  const { data, error } = await supabase
    .from("financial_fx_snapshots")
    .select("*")
    .eq("company_id", companyId)
    .order("confirmed_at", { ascending: false });
  if (error) throw error;
  return (data || []).map((row) => snapshotFromRow(row as Row));
}

/** The only production write path: the guarded, idempotent database RPC. */
export async function saveFinancialFxSnapshotToSupabase(input: Omit<FinancialFxSnapshotInput, "sourceAmount" | "baseCurrency"> & { sourceAmount?: number; baseCurrency?: string }): Promise<FinancialFxSnapshot> {
  if (!supabase) throw new Error("FX confirmation is unavailable in the browser-only workspace.");
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error("Sign in before confirming an FX rate.");
  requireActiveCompanyId();
  const { data, error } = await supabase.rpc("upsert_financial_fx_snapshot", {
    p_source_type: input.sourceType,
    p_source_id: input.sourceId,
    p_rate: input.rate,
    p_rate_date: input.rateDate,
    p_rate_source: input.rateSource || "MANUAL",
    p_note: input.note?.trim() || null,
  });
  if (error) throw error;
  return parseSnapshot(data);
}

export { snapshotFromRow as financialFxSnapshotFromRow };
