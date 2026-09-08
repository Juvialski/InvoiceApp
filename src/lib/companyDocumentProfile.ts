import type { InvoiceData } from "../types.ts";
import { requireActiveCompanyId } from "./companyContext.ts";
import { supabase } from "./supabase.ts";

export interface CompanyDocumentProfile {
  id?: string;
  companyId?: string;
  legalName: string;
  address?: string;
  contactNumber?: string;
  email?: string;
  vatTin?: string;
  logoPath?: string;
  paymentInstructions?: string;
  defaultTerms?: string;
  updatedAt?: string;
}

export const DEFAULT_COMPANY_DOCUMENT_PROFILE: CompanyDocumentProfile = Object.freeze({
  // Product branding is not a client legal identity. A fresh or unavailable
  // deployment profile must remain incomplete until an operator supplies
  // approved company details.
  legalName: "",
});

export function documentPartyNameKey(value: unknown) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(inc|incorporated|corp|corporation|company|co|ltd|limited)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function supplierInvoiceBuyerMismatch(invoice: Pick<InvoiceData, "customer">, profile: CompanyDocumentProfile) {
  const buyer = invoice.customer;
  const buyerName = buyer?.registeredName || buyer?.companyName || buyer?.name;
  const buyerTin = buyer?.taxId?.replace(/\D/g, "");
  const expectedName = profile.legalName.trim();
  const expectedTin = profile.vatTin?.replace(/\D/g, "");
  if (!buyerName && !buyerTin) return undefined;
  if (!expectedName || (buyerTin && !expectedTin)) return "The deployment company document profile is incomplete; confirm the legal identity before verification.";
  const nameMismatch = Boolean(buyerName && documentPartyNameKey(buyerName) && documentPartyNameKey(expectedName) && !documentPartyNameKey(buyerName).includes(documentPartyNameKey(expectedName)) && !documentPartyNameKey(expectedName).includes(documentPartyNameKey(buyerName)));
  const tinMismatch = Boolean(buyerTin && expectedTin && buyerTin !== expectedTin);
  return nameMismatch || tinMismatch ? "This document appears to be issued to another company." : undefined;
}

function text(value: unknown) {
  return value === null || value === undefined || value === "" ? undefined : String(value);
}

export function companyDocumentProfileFromRow(row: Record<string, unknown> | null | undefined): CompanyDocumentProfile {
  return {
    id: text(row?.id),
    companyId: text(row?.company_id || row?.companyId),
    legalName: text(row?.legal_name || row?.legalName) || "",
    address: text(row?.address),
    contactNumber: text(row?.contact_number || row?.contactNumber),
    email: text(row?.email),
    vatTin: text(row?.vat_tin || row?.vatTin),
    logoPath: text(row?.logo_path || row?.logoPath),
    paymentInstructions: text(row?.payment_instructions || row?.paymentInstructions),
    defaultTerms: text(row?.default_terms || row?.defaultTerms),
    updatedAt: text(row?.updated_at || row?.updatedAt),
  };
}

export function mergeCompanyDocumentProfile(
  profile: CompanyDocumentProfile | undefined,
  overrides: Partial<CompanyDocumentProfile> = {},
) {
  return {
    ...DEFAULT_COMPANY_DOCUMENT_PROFILE,
    ...(profile || {}),
    ...overrides,
    legalName: (overrides.legalName ?? profile?.legalName ?? DEFAULT_COMPANY_DOCUMENT_PROFILE.legalName).trim(),
  };
}

export async function loadCompanyDocumentProfileFromSupabase(): Promise<CompanyDocumentProfile> {
  if (!supabase) return { ...DEFAULT_COMPANY_DOCUMENT_PROFILE };
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { ...DEFAULT_COMPANY_DOCUMENT_PROFILE };
  const companyId = requireActiveCompanyId();
  const { data, error } = await supabase.rpc("get_company_document_profile", { p_company_id: companyId });
  if (error) throw error;
  return mergeCompanyDocumentProfile(companyDocumentProfileFromRow((data || {}) as Record<string, unknown>), { companyId });
}

export async function saveCompanyDocumentProfileToSupabase(
  profile: CompanyDocumentProfile,
): Promise<CompanyDocumentProfile> {
  if (!supabase) throw new Error("Supabase is not configured.");
  const companyId = requireActiveCompanyId();
  const { data, error } = await supabase.rpc("upsert_company_document_profile", {
    p_company_id: companyId,
    p_profile: {
      legalName: profile.legalName.trim(),
      address: profile.address?.trim() || null,
      contactNumber: profile.contactNumber?.trim() || null,
      email: profile.email?.trim() || null,
      vatTin: profile.vatTin?.trim() || null,
      logoPath: profile.logoPath?.trim() || null,
      paymentInstructions: profile.paymentInstructions?.trim() || null,
      defaultTerms: profile.defaultTerms?.trim() || null,
    },
  });
  if (error) throw error;
  return mergeCompanyDocumentProfile(companyDocumentProfileFromRow((data || {}) as Record<string, unknown>), { companyId });
}
