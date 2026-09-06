import type { Vendor } from "../types.ts";
import { supabase } from "./supabase.ts";
import { requireActiveCompanyId } from "./companyContext.ts";

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
    active: row.active === undefined ? true : Boolean(row.active),
    archivedAt: text(row.archived_at) || null,
    deactivatedAt: text(row.deactivated_at) || null,
    deactivatedByUserId: text(row.deactivated_by_user_id) || null,
    deactivationReason: text(row.deactivation_reason) || null,
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
  const normalizedName = name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
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

  const { data, error } = await supabase.rpc("create_or_update_vendor", {
    p_vendor: {
      ...(vendor.id ? { id: vendor.id } : {}),
      name,
      normalizedName,
      email: vendor.email || undefined,
      phone: vendor.phone || undefined,
      taxId: vendor.taxId || undefined,
      address: vendor.address || undefined,
      defaultCurrency: vendor.defaultCurrency || undefined,
      defaultCategory: vendor.defaultCategory || undefined,
    },
  });
  if (error) throw error;
  const saved = data && typeof data === "object" ? (data as Record<string, unknown>).vendor : undefined;
  if (!saved || typeof saved !== "object") throw new Error("Vendor save did not return the canonical Vendor record.");
  return vendorFromRow(saved as Row);
}

export async function deactivateVendor(vendorId: string, reason: string): Promise<Vendor> {
  if (!supabase) throw new Error("Vendor lifecycle changes require a connected company workspace.");
  requireActiveCompanyId();
  const { data, error } = await supabase.rpc("deactivate_vendor", { p_vendor_id: vendorId, p_reason: reason });
  if (error) throw error;
  const saved = data && typeof data === "object" ? (data as Record<string, unknown>).vendor : undefined;
  if (!saved || typeof saved !== "object") throw new Error("Vendor deactivation did not return the canonical Vendor record.");
  return vendorFromRow(saved as Row);
}

export async function reactivateVendor(vendorId: string): Promise<Vendor> {
  if (!supabase) throw new Error("Vendor lifecycle changes require a connected company workspace.");
  requireActiveCompanyId();
  const { data, error } = await supabase.rpc("reactivate_vendor", { p_vendor_id: vendorId });
  if (error) throw error;
  const saved = data && typeof data === "object" ? (data as Record<string, unknown>).vendor : undefined;
  if (!saved || typeof saved !== "object") throw new Error("Vendor reactivation did not return the canonical Vendor record.");
  return vendorFromRow(saved as Row);
}
