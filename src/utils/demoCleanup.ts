import type { InvoiceData } from "../types";

export interface InvoiceStorageLike {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
}

const LEGACY_SAMPLE_IDS = new Set([
  "sample-1",
  "sample-2",
  "sample-tech-services",
  "sample-hardware-supplies",
]);
const LEGACY_INVOICE_NUMBERS = new Set(["inv-2026-8894", "apx-90241"]);
const LEGACY_VENDOR_NAMES = new Set([
  "cloudtech solutions inc.",
  "apex wholesale distributors ltd.",
]);

function normalized(value: unknown) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function vendorNames(invoice: Partial<InvoiceData>) {
  const vendor = invoice.vendor;
  if (!vendor) return [];
  return [vendor.name, vendor.companyName, vendor.registeredName, vendor.tradeName]
    .map(normalized)
    .filter(Boolean);
}

/**
 * Returns true only for records that are explicitly marked as sample data and
 * carry a known legacy/demo fingerprint. Currency is deliberately ignored so
 * genuine uploaded or emailed USD invoices can never be removed by cleanup.
 */
export function isLegacyDemoInvoice(invoice: Partial<InvoiceData> | null | undefined) {
  if (!invoice || normalized(invoice.sourceType) !== "sample") return false;

  const id = normalized(invoice.id);
  const invoiceNumber = normalized(invoice.invoiceNumber);
  const model = normalized(invoice.modelUsed);
  const attachmentName = normalized(invoice.sourceMetadata?.attachmentName);
  const hasKnownId = LEGACY_SAMPLE_IDS.has(id);
  const hasKnownNumber = LEGACY_INVOICE_NUMBERS.has(invoiceNumber);
  const hasKnownVendor = vendorNames(invoice).some((name) => LEGACY_VENDOR_NAMES.has(name));
  const hasSampleMarker = model === "sample-data" && (id.startsWith("sample-") || attachmentName.includes("demo") || attachmentName.includes("fictional"));

  return hasKnownId || hasKnownNumber || hasKnownVendor || hasSampleMarker;
}

export function cleanupLegacyDemoInvoices(value: unknown): InvoiceData[] {
  if (!Array.isArray(value)) return [];
  return value.filter((invoice): invoice is InvoiceData => Boolean(invoice && typeof invoice === "object" && !Array.isArray(invoice))
    && !isLegacyDemoInvoice(invoice as Partial<InvoiceData>));
}

/**
 * Reads, cleans, and writes the local invoice list. The write makes the
 * migration idempotent and ensures a cleaned browser does not reintroduce the
 * same records on the next render.
 */
export function readAndCleanLocalInvoices(storage: InvoiceStorageLike | undefined, key = "extracted_invoices") {
  if (!storage) return [];

  let parsed: unknown = [];
  try {
    const saved = storage.getItem(key);
    parsed = saved ? JSON.parse(saved) : [];
  } catch {
    parsed = [];
  }

  const cleaned = cleanupLegacyDemoInvoices(parsed);
  try {
    storage.setItem(key, JSON.stringify(cleaned));
  } catch {
    // Storage may be unavailable or full because of old preview URLs. The
    // in-memory cleaned list is still safe to use for this session.
  }
  return cleaned;
}
