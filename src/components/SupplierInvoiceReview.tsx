import React, { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, Edit3, Link2, Mail, Plus, ShieldCheck, Undo2, X } from "lucide-react";
import type { EntityResolutionResult, InvoiceData, LineItem, Vendor } from "../types.ts";
import { formatDateTime } from "../config/regional.ts";
import { formatMoney } from "../utils/invoiceLogic.ts";
import { DEFAULT_COMPANY_DOCUMENT_PROFILE, loadCompanyDocumentProfileFromSupabase, supplierInvoiceBuyerMismatch, type CompanyDocumentProfile } from "../lib/companyDocumentProfile.ts";

export interface SupplierInvoiceReviewProps {
  invoice: InvoiceData;
  readOnly?: boolean;
  onUpdateInvoice?: (invoice: InvoiceData) => void;
  onVerify?: () => void;
  verifyLabel?: string;
  onReopen?: () => void | Promise<void>;
  onRevertToAI?: () => void;
  onRevertField?: (field: string) => void;
  onFocusField?: (field: string) => void;
  vendors?: Vendor[];
}

function valueAt(value: unknown, path: string): unknown {
  return path.split(".").reduce((current: any, key) => current?.[key], value);
}

function setPath(invoice: InvoiceData, path: string, value: unknown) {
  const next: any = { ...invoice };
  const parts = path.split(".");
  let cursor = next;
  for (let index = 0; index < parts.length - 1; index += 1) cursor[parts[index]] = { ...(cursor[parts[index]] || {}) };
  cursor[parts[parts.length - 1]] = value;
  return next as InvoiceData;
}

function present(value: unknown) {
  return value !== undefined && value !== null && String(value).trim() !== "";
}

function displayMoney(value: unknown, currency: string) {
  return present(value) ? formatMoney(Number(value), currency) : "Not stated";
}

const headerFields = [
  ["invoiceNumber", "Invoice number"],
  ["invoiceDate", "Invoice date"],
  ["dueDate", "Due date"],
  ["currency", "Currency"],
  ["purchaseOrderNumber", "PO number"],
  ["projectReference", "Project / reference"],
] as const;

function ReadOnlyLineRow({ item, index, invoice, showTax }: { item: LineItem; index: number; invoice: InvoiceData; showTax: boolean }) {
  return (
    <tr>
      <td className="px-4 py-2 font-mono text-slate-500">{item.itemNumber || index + 1}</td>
      <td className="px-4 py-2 text-right tabular-nums">{item.quantity || ""}</td>
      <td className="px-4 py-2">{item.unitOfMeasure || ""}</td>
      <td className="max-w-[280px] px-4 py-2 font-medium text-slate-800">{item.description || "Description missing"}</td>
      <td className="px-4 py-2 text-right tabular-nums">{displayMoney(item.unitPrice, invoice.currency)}</td>
      <td className="px-4 py-2 text-right font-bold tabular-nums">{displayMoney(item.total, invoice.currency)}</td>
      {showTax && <td className="px-4 py-2 text-right tabular-nums">{item.taxAmount !== undefined ? displayMoney(item.taxAmount, invoice.currency) : item.taxRate !== undefined ? `${item.taxRate}%` : ""}</td>}
    </tr>
  );
}

function ReadOnlyLineItems({ invoice }: { invoice: InvoiceData }) {
  const showTax = invoice.items.some((item) => present(item.taxAmount) || present(item.taxRate));
  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-4 py-3"><h3 className="text-xs font-black uppercase tracking-[0.14em] text-slate-700">Line items</h3><p className="mt-1 text-[10px] text-slate-500">{invoice.items.length} extracted item{invoice.items.length === 1 ? "" : "s"}</p></div>
      <div className="ops-scrollbar overflow-x-auto">
        <table className="min-w-[640px] w-full text-left text-xs">
          <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-2">Item</th><th className="px-4 py-2 text-right">Qty</th><th className="px-4 py-2">Unit</th><th className="px-4 py-2">Description</th><th className="px-4 py-2 text-right">Unit price</th><th className="px-4 py-2 text-right">Amount</th>{showTax && <th className="px-4 py-2 text-right">Tax</th>}</tr></thead>
          <tbody className="divide-y divide-slate-100">
            {invoice.items.length > 0
              ? invoice.items.map((item, index) => <ReadOnlyLineRow key={item.id} item={item} index={index} invoice={invoice} showTax={showTax} />)
              : <tr><td colSpan={showTax ? 7 : 6} className="px-4 py-8 text-center text-xs text-amber-700">No line items extracted. Review before verification.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function EditableLineItems({ invoice, update }: { invoice: InvoiceData; update: (path: string, value: unknown) => void }) {
  const changeLine = (id: string, patch: Partial<LineItem>) => {
    const items = invoice.items.map((item) => {
      if (item.id !== id) return item;
      const quantity = Number(patch.quantity ?? item.quantity) || 0;
      const unitPrice = Number(patch.unitPrice ?? item.unitPrice) || 0;
      return { ...item, ...patch, total: Math.round(quantity * unitPrice * 100) / 100 };
    });
    update("items", items);
  };
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2"><span className="field-label">Line items</span><button type="button" onClick={() => update("items", [...invoice.items, { id: `line-${Date.now()}`, description: "", quantity: 1, unitPrice: 0, total: 0 }])} className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 px-2 py-1.5 text-[10px] font-bold text-indigo-700"><Plus className="h-3 w-3" />Add line</button></div>
      {invoice.items.map((item, index) => <div key={item.id} className="grid gap-2 rounded-xl border border-slate-200 p-3 sm:grid-cols-[minmax(0,1fr)_5rem_6rem_7rem_auto]"><input aria-label={`Line ${index + 1} description`} value={item.description} onChange={(event) => changeLine(item.id, { description: event.target.value })} className="field-input" /><input aria-label={`Line ${index + 1} quantity`} type="number" step="any" value={item.quantity} onChange={(event) => changeLine(item.id, { quantity: Number(event.target.value) || 0 })} className="field-input" /><input aria-label={`Line ${index + 1} unit`} value={item.unitOfMeasure || ""} onChange={(event) => changeLine(item.id, { unitOfMeasure: event.target.value })} className="field-input" /><input aria-label={`Line ${index + 1} unit price`} type="number" step="any" value={item.unitPrice} onChange={(event) => changeLine(item.id, { unitPrice: Number(event.target.value) || 0 })} className="field-input" /><button type="button" aria-label={`Remove line ${index + 1}`} onClick={() => update("items", invoice.items.filter((candidate) => candidate.id !== item.id))} className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-700"><X className="h-4 w-4" /></button></div>)}
    </div>
  );
}

export const SupplierInvoiceReview: React.FC<SupplierInvoiceReviewProps> = ({ invoice, readOnly = false, onUpdateInvoice, onVerify: verifyHandler, verifyLabel = "Verify & Create Expense", onReopen, onRevertToAI, onFocusField, vendors = [] }) => {
  const [editMode, setEditMode] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [profile, setProfile] = useState<CompanyDocumentProfile>(DEFAULT_COMPANY_DOCUMENT_PROFILE);
  const issues = invoice.validation?.issues || [];
  const mismatch = supplierInvoiceBuyerMismatch(invoice, profile);
  const onVerify = mismatch ? undefined : verifyHandler;
  const duplicate = invoice.duplicateStatus === "POSSIBLE_DUPLICATE" || Boolean(invoice.duplicateOfId);
  const conflicts = invoice.entityResolution?.conflicts || [];
  const confidenceWarning = invoice.confidenceScore !== undefined && invoice.confidenceScore < 70;
  const attentionItems = useMemo(() => [
    ...issues.map((issue) => ({ id: issue.id, text: issue.message, field: issue.field })),
    ...(mismatch ? [{ id: "buyer-mismatch", text: `Buyer mismatch — ${mismatch}`, field: "customer.name" }] : []),
    ...(duplicate ? [{ id: "duplicate-risk", text: "Duplicate risk needs reviewer confirmation.", field: "duplicateStatus" }] : []),
    ...conflicts.slice(0, 3).map((conflict, index) => ({ id: `conflict-${index}`, text: `${conflict.label}: ${conflict.reason}`, field: "vendor" })),
    ...(confidenceWarning ? [{ id: "confidence", text: `AI confidence is ${Math.round(invoice.confidenceScore || 0)}%.`, field: "confidenceScore" }] : []),
  ], [confidenceWarning, conflicts, duplicate, issues, mismatch, invoice.confidenceScore]);

  useEffect(() => {
    let cancelled = false;
    void loadCompanyDocumentProfileFromSupabase().then((next) => { if (!cancelled) setProfile(next); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const update = (path: string, value: unknown) => {
    if (!readOnly) onUpdateInvoice?.(setPath(invoice, path, value));
  };
  const updateParty = (party: "vendor" | "customer", field: string, value: string) => update(`${party}.${field}`, value || undefined);
  const chooseVendor = (vendorId: string) => {
    if (readOnly || !onUpdateInvoice) return;
    const vendor = vendors.find((item) => item.id === vendorId);
    const current = invoice.entityResolution || {
      entityType: "VENDOR",
      candidateId: invoice.id,
      proposedAction: "CREATE_NEW",
      confidence: "MEDIUM",
      confidenceScore: 70,
      matchReasons: [],
      conflicts: [],
      proposedEnrichments: [],
      extractedEvidence: {},
      normalizedEvidence: {},
    } as EntityResolutionResult;
    onUpdateInvoice({
      ...invoice,
      ...(vendor ? { vendor: { ...invoice.vendor, name: vendor.name, taxId: vendor.taxId || invoice.vendor.taxId, email: vendor.email || invoice.vendor.email, phone: vendor.phone || invoice.vendor.phone, address: vendor.address || invoice.vendor.address } } : {}),
      entityResolution: { ...current, proposedAction: vendor ? "LINK_EXISTING" : "CREATE_NEW", matchedEntityId: vendor?.id, matchedEntityName: vendor?.name || invoice.vendor?.name },
    });
  };
  const vendorName = invoice.vendor?.registeredName || invoice.vendor?.companyName || invoice.vendor?.name || "Supplier unresolved";
  const optionalTotals = [["totalDiscount", "Discount"], ["shippingFee", "Shipping"], ["otherFees", "Other fees"], ["withholdingTaxAmount", "Withholding"]] as const;
  const visibleOptionalTotals = optionalTotals.filter(([field]) => present(valueAt(invoice, field)) && Number(valueAt(invoice, field)) !== 0);

  return (
    <section className="space-y-3" data-testid="supplier-invoice-review" aria-label="Supplier invoice review">
      <div className={`rounded-2xl border p-4 shadow-sm ${attentionItems.length ? "border-amber-200 bg-amber-50" : "border-emerald-200 bg-emerald-50"}`}>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 items-start gap-3"><div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${attentionItems.length ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}>{attentionItems.length ? <AlertTriangle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}</div><div><p className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-600">Verification summary</p><h2 className="mt-1 text-sm font-black text-slate-950">{attentionItems.length ? `${attentionItems.length} item${attentionItems.length === 1 ? "" : "s"} need attention` : "No exceptions found"}</h2><p className="mt-1 text-[10px] text-slate-600">{attentionItems.length ? "Review exceptions before posting the authoritative Expense." : "Populated source values reconcile with the extracted financial summary."}</p></div></div>
          <div className="flex flex-wrap justify-end gap-2">{!readOnly && onRevertToAI && <button type="button" onClick={onRevertToAI} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700"><Undo2 className="h-3.5 w-3.5" />Revert to original</button>}{!readOnly && <button type="button" onClick={() => setEditMode((value) => !value)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700"><Edit3 className="h-3.5 w-3.5" />{editMode ? "Review mode" : "Edit details"}</button>}{invoice.reviewStatus === "VERIFIED" && onReopen && <button type="button" onClick={() => void onReopen()} className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-white px-3 py-2 text-xs font-bold text-emerald-800"><Undo2 className="h-3.5 w-3.5" />Reopen for review</button>}{invoice.reviewStatus === "VERIFIED" ? <span className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-white px-3 py-2 text-[10px] font-black text-emerald-800"><ShieldCheck className="h-3.5 w-3.5" />Verified {formatDateTime(invoice.verifiedAt)}</span> : onVerify && <button type="button" onClick={onVerify} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-2 text-xs font-black text-white hover:bg-emerald-800"><ShieldCheck className="h-3.5 w-3.5" />{verifyLabel}</button>}</div>
        </div>
        {attentionItems.length > 0 && <div className="mt-3 grid gap-2 sm:grid-cols-2">{attentionItems.slice(0, 6).map((item) => <button type="button" key={item.id} onClick={() => { setEditMode(true); onFocusField?.(item.field); }} className="rounded-xl border border-amber-200 bg-white/80 p-3 text-left hover:bg-white"><span className="block text-[10px] font-black text-amber-900">{item.text}</span><span className="mt-1 block text-[9px] font-bold text-amber-700">Review field</span></button>)}</div>}
      </div>

      {editMode && !readOnly ? (
        <div className="space-y-3 rounded-2xl border border-indigo-200 bg-white p-4 shadow-sm" data-testid="supplier-invoice-edit-details">
          <div className="flex items-start justify-between gap-2"><div><p className="text-[10px] font-black uppercase tracking-[0.15em] text-indigo-600">Edit details</p><p className="mt-1 text-xs text-slate-500">Correct extracted values before verification. The original AI snapshot remains preserved.</p></div><button type="button" onClick={() => setEditMode(false)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100" aria-label="Close edit details"><X className="h-4 w-4" /></button></div>
          <div className="grid gap-3 sm:grid-cols-2">{headerFields.map(([field, label]) => <label key={field} className="space-y-1"><span className="field-label">{label}</span><input type={field.includes("Date") || field === "dueDate" ? "date" : "text"} value={String(valueAt(invoice, field) || "")} onChange={(event) => update(field, event.target.value)} className="field-input" /></label>)}</div>
          <div className="grid gap-3 sm:grid-cols-2"><label className="space-y-1"><span className="field-label">Supplier name</span><input value={invoice.vendor?.name || ""} onChange={(event) => updateParty("vendor", "name", event.target.value)} className="field-input" /></label><label className="space-y-1"><span className="field-label">Supplier TIN</span><input value={invoice.vendor?.taxId || ""} onChange={(event) => updateParty("vendor", "taxId", event.target.value)} className="field-input" /></label><label className="space-y-1 sm:col-span-2"><span className="field-label">Supplier address</span><input value={invoice.vendor?.address || ""} onChange={(event) => updateParty("vendor", "address", event.target.value)} className="field-input" /></label><label className="space-y-1"><span className="field-label">Supplier email</span><input type="email" value={invoice.vendor?.email || ""} onChange={(event) => updateParty("vendor", "email", event.target.value)} className="field-input" /></label><label className="space-y-1"><span className="field-label">Supplier phone</span><input value={invoice.vendor?.phone || ""} onChange={(event) => updateParty("vendor", "phone", event.target.value)} className="field-input" /></label></div>
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3" data-testid="supplier-invoice-edit-buyer"><p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-600">Buyer / source identity</p><p className="mt-1 text-[10px] text-slate-500">Correct extracted buyer evidence only when the source supports it. Verification still checks it against the deployment company profile.</p><div className="mt-3 grid gap-3 sm:grid-cols-2"><label className="space-y-1"><span className="field-label">Buyer name</span><input value={invoice.customer?.name || ""} onChange={(event) => updateParty("customer", "name", event.target.value)} className="field-input" /></label><label className="space-y-1"><span className="field-label">Registered name</span><input value={invoice.customer?.registeredName || ""} onChange={(event) => updateParty("customer", "registeredName", event.target.value)} className="field-input" /></label><label className="space-y-1"><span className="field-label">Company name</span><input value={invoice.customer?.companyName || ""} onChange={(event) => updateParty("customer", "companyName", event.target.value)} className="field-input" /></label><label className="space-y-1"><span className="field-label">Trade name</span><input value={invoice.customer?.tradeName || ""} onChange={(event) => updateParty("customer", "tradeName", event.target.value)} className="field-input" /></label><label className="space-y-1"><span className="field-label">Buyer TIN</span><input value={invoice.customer?.taxId || ""} onChange={(event) => updateParty("customer", "taxId", event.target.value)} className="field-input" /></label><label className="space-y-1"><span className="field-label">Buyer email</span><input type="email" value={invoice.customer?.email || ""} onChange={(event) => updateParty("customer", "email", event.target.value)} className="field-input" /></label><label className="space-y-1 sm:col-span-2"><span className="field-label">Buyer address</span><input value={invoice.customer?.address || ""} onChange={(event) => updateParty("customer", "address", event.target.value)} className="field-input" /></label><label className="space-y-1"><span className="field-label">City / municipality</span><input value={invoice.customer?.cityMunicipality || invoice.customer?.city || ""} onChange={(event) => updateParty("customer", "cityMunicipality", event.target.value)} className="field-input" /></label><label className="space-y-1"><span className="field-label">Province / state</span><input value={invoice.customer?.province || invoice.customer?.state || ""} onChange={(event) => updateParty("customer", "province", event.target.value)} className="field-input" /></label><label className="space-y-1"><span className="field-label">Barangay</span><input value={invoice.customer?.barangay || ""} onChange={(event) => updateParty("customer", "barangay", event.target.value)} className="field-input" /></label><label className="space-y-1"><span className="field-label">Region</span><input value={invoice.customer?.region || ""} onChange={(event) => updateParty("customer", "region", event.target.value)} className="field-input" /></label><label className="space-y-1"><span className="field-label">Postal code</span><input value={invoice.customer?.postalCode || ""} onChange={(event) => updateParty("customer", "postalCode", event.target.value)} className="field-input" /></label><label className="space-y-1"><span className="field-label">Country</span><input value={invoice.customer?.country || ""} onChange={(event) => updateParty("customer", "country", event.target.value)} className="field-input" /></label></div></div>
          <div className="grid gap-3 sm:grid-cols-3"><label className="space-y-1"><span className="field-label">Subtotal</span><input type="number" step="0.01" value={invoice.subtotal} onChange={(event) => update("subtotal", Number(event.target.value) || 0)} className="field-input" /></label><label className="space-y-1"><span className="field-label">Tax / VAT</span><input type="number" step="0.01" value={invoice.totalTax} onChange={(event) => update("totalTax", Number(event.target.value) || 0)} className="field-input" /></label><label className="space-y-1"><span className="field-label">Total</span><input type="number" step="0.01" value={invoice.grandTotal} onChange={(event) => update("grandTotal", Number(event.target.value) || 0)} className="field-input" /></label></div>
          <div className="grid gap-3 sm:grid-cols-2"><label className="space-y-1"><span className="field-label">Amount paid</span><input type="number" step="0.01" value={invoice.amountPaid ?? ""} onChange={(event) => update("amountPaid", event.target.value === "" ? undefined : Number(event.target.value))} className="field-input" /></label><label className="space-y-1"><span className="field-label">Balance due</span><input type="number" step="0.01" value={invoice.balanceDue ?? ""} onChange={(event) => update("balanceDue", event.target.value === "" ? undefined : Number(event.target.value))} className="field-input" /></label><label className="space-y-1 sm:col-span-2"><span className="field-label">Notes and terms</span><textarea value={invoice.notes || ""} onChange={(event) => update("notes", event.target.value)} rows={3} className="field-input resize-y" /></label></div>
          <EditableLineItems invoice={invoice} update={update} />
        </div>
      ) : (
        <>
          <div className="grid gap-3 lg:grid-cols-2"><section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-center justify-between gap-2"><h3 className="text-xs font-black uppercase tracking-[0.14em] text-slate-700">Supplier</h3>{invoice.entityResolution?.matchedEntityId && <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-[9px] font-bold text-emerald-700"><Link2 className="h-3 w-3" />Matched vendor</span>}</div><p className="mt-3 text-sm font-black text-slate-950">{vendorName}</p>{invoice.vendor?.taxId && <p className="mt-1 text-xs text-slate-600">TIN {invoice.vendor.taxId}</p>}{invoice.vendor?.address && <p className="mt-1 text-xs text-slate-600">{invoice.vendor.address}</p>}<div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-slate-500">{invoice.vendor?.email && <span>{invoice.vendor.email}</span>}{invoice.vendor?.phone && <span>{invoice.vendor.phone}</span>}</div>{invoice.entityResolution?.matchedEntityName && <p className="mt-3 border-t border-slate-100 pt-2 text-[10px] text-slate-500">Master vendor: <strong className="text-slate-700">{invoice.entityResolution.matchedEntityName}</strong></p>}{!readOnly && vendors.length > 0 && <label className="mt-3 block border-t border-slate-100 pt-2 text-[10px] font-black uppercase tracking-wide text-slate-600">Vendor resolution<select aria-label="Confirm supplier vendor" value={invoice.entityResolution?.matchedEntityId || ""} onChange={(event) => chooseVendor(event.target.value)} className="field-input mt-1 normal-case tracking-normal"><option value="">Propose new vendor from extracted evidence</option>{vendors.map((item) => <option key={item.id} value={item.id}>{item.name}{item.taxId ? ` · TIN ${item.taxId}` : ""}</option>)}</select></label>}</section><section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><h3 className="text-xs font-black uppercase tracking-[0.14em] text-slate-700">Invoice details</h3><dl className="mt-3 grid grid-cols-2 gap-3 text-xs"><div><dt className="text-[10px] text-slate-500">Invoice number</dt><dd className={`mt-0.5 font-bold ${invoice.invoiceNumber ? "text-slate-900" : "text-amber-700"}`}>{invoice.invoiceNumber || "Missing · Add"}</dd></div><div><dt className="text-[10px] text-slate-500">Invoice date</dt><dd className="mt-0.5 font-bold">{invoice.invoiceDate || "Missing · Add"}</dd></div><div><dt className="text-[10px] text-slate-500">Due date</dt><dd className="mt-0.5 font-bold">{invoice.dueDate || "Not supplied"}</dd></div><div><dt className="text-[10px] text-slate-500">Currency</dt><dd className="mt-0.5 font-bold">{invoice.currency || "Unclear · Add"}</dd></div></dl></section></div>
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><h3 className="text-xs font-black uppercase tracking-[0.14em] text-slate-700">Purchase / project</h3><div className="mt-3 grid gap-3 text-xs sm:grid-cols-3"><div><p className="text-[10px] text-slate-500">Purchase order</p><p className="mt-0.5 font-bold">{invoice.purchaseOrderNumber || "Not supplied"}</p></div><div><p className="text-[10px] text-slate-500">Project</p><p className="mt-0.5 font-bold">{invoice.projectReference || "Unallocated until confirmed"}</p></div><div><p className="text-[10px] text-slate-500">Category</p><p className="mt-0.5 font-bold">{invoice.category || "Miscellaneous"}</p></div></div></section>
          <ReadOnlyLineItems invoice={invoice} />
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-4"><div><h3 className="text-xs font-black uppercase tracking-[0.14em] text-slate-700">Totals</h3><div className="mt-3 space-y-2 text-xs">{present(invoice.subtotal) && <p className="flex justify-between gap-8"><span className="text-slate-500">Subtotal</span><strong>{displayMoney(invoice.subtotal, invoice.currency)}</strong></p>}{present(invoice.totalTax) && invoice.totalTax !== 0 && <p className="flex justify-between gap-8"><span className="text-slate-500">Tax / VAT</span><strong>{displayMoney(invoice.totalTax, invoice.currency)}</strong></p>}{visibleOptionalTotals.map(([field, label]) => <p key={field} className="flex justify-between gap-8"><span className="text-slate-500">{label}</span><strong>{displayMoney(valueAt(invoice, field), invoice.currency)}</strong></p>)}<p className="flex justify-between gap-8 border-t border-slate-100 pt-2 text-sm"><span className="font-black">Total</span><strong className="text-indigo-700">{displayMoney(invoice.grandTotal, invoice.currency)}</strong></p></div></div><div className="min-w-[14rem] rounded-xl border border-indigo-100 bg-indigo-50/50 p-3"><p className="text-[10px] font-black uppercase tracking-wide text-indigo-700">Expense record</p><p className="mt-2 text-xs font-black text-slate-900">{invoice.linkedExpenseId ? "Authoritative Expense linked" : invoice.reviewStatus === "VERIFIED" ? "Expense created" : "Will become authoritative"}</p><p className="mt-1 text-[10px] leading-4 text-slate-600">Supplier invoice is preserved as evidence. {invoice.linkedExpenseId ? `Expense #${invoice.linkedExpenseId.slice(0, 8)} owns cost and payable. ` : "Verification creates a Draft Expense; approve it in Expenses before payment."}No duplicate Actual Cost is posted.</p></div></div></section>
          <details open={moreOpen} onToggle={(event) => setMoreOpen((event.currentTarget as HTMLDetailsElement).open)} className="rounded-2xl border border-slate-200 bg-white shadow-sm"><summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-xs font-black text-slate-700 [&::-webkit-details-marker]:hidden"><span>More extracted details</span><ChevronDown className={`h-4 w-4 transition ${moreOpen ? "rotate-180" : ""}`} /></summary><div className="grid gap-3 border-t border-slate-100 p-4 text-xs sm:grid-cols-2"><div><p className="text-[10px] font-black uppercase text-slate-500">Buyer fields</p><p className="mt-1">{invoice.customer?.name || "Not supplied"}</p><p className="text-slate-500">{invoice.customer?.taxId || "TIN not supplied"}</p><p className="text-slate-500">{invoice.customer?.address || "Address not supplied"}</p></div><div><p className="text-[10px] font-black uppercase text-slate-500">Extraction diagnostics</p><p className="mt-1">Model: {invoice.modelUsed || "Unknown"}</p><p className="text-slate-500">Confidence: {invoice.confidenceScore === undefined ? "Not supplied" : `${Math.round(invoice.confidenceScore)}%`}</p><p className="text-slate-500">Source: {invoice.fileName || invoice.sourceType || "Unknown"}</p></div><div className="sm:col-span-2"><p className="text-[10px] font-black uppercase text-slate-500">PH metadata</p><p className="mt-1 whitespace-pre-wrap text-slate-600">{invoice.philippineTaxDetails ? JSON.stringify(invoice.philippineTaxDetails, null, 2) : "No additional tax metadata extracted."}</p></div></div></details>
        </>
      )}

      {mismatch && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-bold text-rose-900"><AlertTriangle className="mr-1 inline h-4 w-4" />Buyer mismatch — {mismatch} Resolve this before financial posting.</div>}
      {invoice.sourceType === "EMAIL" && <p className="flex items-center gap-1.5 px-1 text-[10px] text-indigo-700"><Mail className="h-3.5 w-3.5" />Source email preserved: {invoice.sourceMetadata?.subject || invoice.sourceMetadata?.sender || "Email Intake"}</p>}
      {vendors.length === 0 && invoice.entityResolution?.matchedEntityId && <p className="px-1 text-[10px] text-slate-500">Vendor link is preserved in the source record; the current vendor directory is unavailable.</p>}
    </section>
  );
};

export default SupplierInvoiceReview;
