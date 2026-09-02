import type { Vendor } from "../types.ts";
import { supabase } from "./supabase.ts";
import { companyScopedRow, requireActiveCompanyId } from "./companyContext.ts";

const VENDORS_STORAGE_KEY = "engineering_vendors";
type Row = Record<string, unknown>;

function text(value: unknown) {
  return value === null || value === undefined || value === "" ? undefined : String(value);
}

export function vendorFromRow(row: Row): Vendor {
  return {
    id: String(row.id),
    companyId: text(row.company_id),
    name: String(row.name || ""),
    normalizedName: String(row.normalized_name || ""),
    email: text(row.email) || null,
    phone: text(row.phone) || null,
    taxId: text(row.tax_id) || null,
    address: text(row.address) || null,
    defaultCurrency: text(row.default_currency) || "PHP",
    defaultCategory: text(row.default_category) || null,
    createdAt: String(row.created_at || new Date().toISOString()),
    updatedAt: String(row.updated_at || new Date().toISOString()),
  };
}

export function readVendorsFromLocal(storage?: Storage): Vendor[] {
  const target = storage || (typeof localStorage === "undefined" ? undefined : localStorage);
  if (!target) return [];
  try {
    const value = JSON.parse(target.getItem(VENDORS_STORAGE_KEY) || "[]");
    return Array.isArray(value) ? (value as Vendor[]) : [];
  } catch {
    return [];
  }
}

export function writeVendorsToLocal(vendors: Vendor[], storage?: Storage) {
  const target = storage || (typeof localStorage === "undefined" ? undefined : localStorage);
  if (!target) return;
  try {
    target.setItem(VENDORS_STORAGE_KEY, JSON.stringify(vendors));
  } catch {
    /* ignore */
  }
}

export async function fetchVendors(): Promise<Vendor[]> {
  if (!supabase) return readVendorsFromLocal();
  const companyId = requireActiveCompanyId();
  if (!companyId) return readVendorsFromLocal();

  const { data, error } = await supabase
    .from("vendors")
    .select("*")
    .eq("company_id", companyId)
    .order("name", { ascending: true });

  if (error) throw error;
  return (data || []).map((row) => vendorFromRow(row as Row));
}

export async function saveVendor(vendor: Partial<Vendor> & { name: string }): Promise<Vendor> {
  const name = vendor.name.trim();
  const normalizedName = name.toLowerCase();
  const companyId = requireActiveCompanyId();

  if (!supabase || !companyId) {
    const localVendors = readVendorsFromLocal();
    const existingIdx = vendor.id ? localVendors.findIndex((v) => v.id === vendor.id) : -1;
    const now = new Date().toISOString();
    const saved: Vendor = {
      id: vendor.id || globalThis.crypto?.randomUUID?.() || `vendor-${Date.now()}`,
      companyId,
      name,
      normalizedName,
      email: vendor.email || null,
      phone: vendor.phone || null,
      taxId: vendor.taxId || null,
      address: vendor.address || null,
      defaultCurrency: vendor.defaultCurrency || "PHP",
      defaultCategory: vendor.defaultCategory || null,
      createdAt: existingIdx >= 0 ? localVendors[existingIdx].createdAt : now,
      updatedAt: now,
    };
    if (existingIdx >= 0) {
      localVendors[existingIdx] = saved;
    } else {
      localVendors.push(saved);
    }
    writeVendorsToLocal(localVendors);
    return saved;
  }

  const payload = companyScopedRow({
    ...(vendor.id ? { id: vendor.id } : {}),
    company_id: companyId,
    name,
    normalized_name: normalizedName,
    email: vendor.email || null,
    phone: vendor.phone || null,
    tax_id: vendor.taxId || null,
    address: vendor.address || null,
    default_currency: vendor.defaultCurrency || "PHP",
    default_category: vendor.defaultCategory || null,
    updated_at: new Date().toISOString(),
  });

  const { data, error } = await supabase
    .from("vendors")
    .upsert(payload)
    .select("*")
    .single();

  if (error) throw error;
  return vendorFromRow(data as Row);
}
