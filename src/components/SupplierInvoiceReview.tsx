import React, { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Archive, CheckCircle2, ChevronDown, Edit3, Link2, Loader2, Mail, Plus, ShieldCheck, Undo2, X } from "lucide-react";
import type { EntityResolutionResult, Expense, FinancialFxSnapshot, InvoiceData, InvoiceProjectAllocation, LineItem, Project, Vendor } from "../types.ts";
import { formatDateTime } from "../config/regional.ts";
import { getSupplierInvoiceExpenseReadiness, getSupplierInvoiceValidationAdvisories, suggestSupplierExpenseDescription } from "../utils/supplierExpenseWorkspace.ts";
import type { AppNavigate } from "../utils/clientNavigation.ts";
import { displayFinancialAmountInPhp } from "../utils/financialCurrency.ts";
import { SupplierInvoiceExpenseSurface } from "./SupplierInvoiceExpenseSurface.tsx";

export interface SupplierInvoiceReviewProps {
  invoice: InvoiceData;
  readOnly?: boolean;
  onUpdateInvoice?: (invoice: InvoiceData) => void;
  onVerify?: () => void;
  verifyLabel?: string;
  onReopen?: () => void | Promise<void | boolean>;
  onRevertToAI?: () => void;
  onRevertField?: (field: string) => void;
  onFocusField?: (field: string) => void;
  vendors?: Vendor[];
  projects?: readonly Project[];
  projectAllocations?: readonly InvoiceProjectAllocation[];
  /** False when an active supplier Expense already owns this invoice's truth. */
  allowReopen?: boolean;
  /** Commits a human-confirmed repair through the existing invoice persistence path. */
  onCommitRepair?: (invoice: InvoiceData) => Promise<boolean>;
  /** Uses the existing guarded canonical Vendor creation path. */
  onAddVendor?: (vendor: Partial<Vendor> & { name: string }) => Promise<Vendor>;
  /** Opens the authoritative correction preview for this invoice. */
  onOpenCorrection?: () => void;
  /** True after a verified invoice was reopened through the repair flow. */
  repairMode?: boolean;
  /** The linked Expense is the only payable and settlement target after verification. */
  linkedExpense?: Expense;
  linkedExpenseLoading?: boolean;
  canRecordExpensePayment?: boolean;
  canReverseExpensePayment?: boolean;
  onNavigatePath?: AppNavigate;
  financialFxSnapshots?: readonly FinancialFxSnapshot[];
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

function textValue(value: unknown) {
  return String(value ?? "").trim();
}

function displaySourceMoney(value: unknown, invoice: InvoiceData, financialFxSnapshots: readonly FinancialFxSnapshot[]) {
  if (!present(value) || !Number.isFinite(Number(value))) return "Amount unresolved";
  return displayFinancialAmountInPhp(value, invoice.currency, "SUPPLIER_INVOICE", invoice.id, financialFxSnapshots).baseLabel;
}

function monetarySourceLabel(invoice: InvoiceData, field: string) {
  const status = invoice.financialFieldStatus?.[field];
  return status === "MANUAL" ? " · manually corrected" : status === "CALCULATED" ? " · calculated" : status === "KNOWN" ? " · source" : " · unresolved";
}

function normalizedVendorValue(value: unknown) {
  return textValue(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function normalizedTaxValue(value: unknown) {
  return textValue(value).toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function evidenceValue(invoice: InvoiceData, ...keys: string[]) {
  const evidence = invoice.entityResolution?.extractedEvidence || {};
  for (const key of keys) {
    const invoiceValue = textValue(valueAt(invoice.vendor, key));
    if (invoiceValue) return invoiceValue;
    const evidenceValue = textValue(evidence[key]);
    if (evidenceValue) return evidenceValue;
  }
  return "";
}

function vendorDraftFromInvoice(invoice: InvoiceData): Partial<Vendor> & { name: string } {
  return {
    name: evidenceValue(invoice, "registeredName", "companyName", "name", "tradeName"),
    taxId: evidenceValue(invoice, "taxId"),
    address: evidenceValue(invoice, "address"),
    email: evidenceValue(invoice, "email"),
    phone: evidenceValue(invoice, "phone"),
    defaultCurrency: textValue(invoice.currency) || undefined,
    defaultCategory: textValue(invoice.category) || undefined,
  };
}

function baseVendorResolution(invoice: InvoiceData): EntityResolutionResult {
  return invoice.entityResolution || {
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
  };
}

interface VendorResolutionPanelProps {
  invoice: InvoiceData;
  vendors: readonly Vendor[];
  onUpdateInvoice?: (invoice: InvoiceData) => void;
  onCommitRepair?: (invoice: InvoiceData) => Promise<boolean>;
  onAddVendor?: (vendor: Partial<Vendor> & { name: string }) => Promise<Vendor>;
}

const VendorResolutionPanel: React.FC<VendorResolutionPanelProps> = ({ invoice, vendors, onUpdateInvoice, onCommitRepair, onAddVendor }) => {
  const activeVendors = useMemo(() => vendors.filter((vendor) => vendor.active !== false && !vendor.archivedAt), [vendors]);
  const [query, setQuery] = useState("");
  const [selectedVendorId, setSelectedVendorId] = useState(invoice.entityResolution?.matchedEntityId || invoice.vendor?.vendorId || "");
  const [draft, setDraft] = useState<Partial<Vendor> & { name: string }>(() => vendorDraftFromInvoice(invoice));
  const [createOpen, setCreateOpen] = useState(activeVendors.length === 0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    setSelectedVendorId(invoice.entityResolution?.matchedEntityId || invoice.vendor?.vendorId || "");
    setDraft(vendorDraftFromInvoice(invoice));
    setQuery("");
    setCreateOpen(activeVendors.length === 0);
    setError("");
    setMessage("");
  }, [activeVendors.length, invoice.id]);

  const likelyMatches = useMemo(() => {
    const name = normalizedVendorValue(draft.name);
    const taxId = normalizedTaxValue(draft.taxId);
    return activeVendors.filter((vendor) => {
      const sameName = Boolean(name && normalizedVendorValue(vendor.name) === name);
      const sameTax = Boolean(taxId && normalizedTaxValue(vendor.taxId) === taxId);
      return sameName || sameTax;
    });
  }, [activeVendors, draft.name, draft.taxId]);

  const visibleVendors = useMemo(() => {
    const search = query.trim().toLowerCase();
    if (!search) return activeVendors.slice(0, 12);
    return activeVendors.filter((vendor) => [vendor.name, vendor.taxId, vendor.email, vendor.phone].filter(Boolean).join(" ").toLowerCase().includes(search)).slice(0, 12);
  }, [activeVendors, query]);

  const commitInvoice = async (next: InvoiceData) => {
    if (onCommitRepair) {
      if (!await onCommitRepair(next)) throw new Error("The invoice could not be saved. No Vendor link was changed.");
      return;
    }
    onUpdateInvoice?.(next);
  };

  const linkVendor = async (vendor: Vendor) => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const current = baseVendorResolution(invoice);
      await commitInvoice({
        ...invoice,
        vendor: { ...invoice.vendor, vendorId: vendor.id },
        entityResolution: {
          ...current,
          proposedAction: "LINK_EXISTING",
          matchedEntityId: vendor.id,
          matchedEntityName: vendor.name,
          matchReasons: [...current.matchReasons, "Human confirmed canonical Vendor"],
        },
      });
      setSelectedVendorId(vendor.id);
      setMessage(`Linked canonical Vendor: ${vendor.name}.`);
    } catch (linkError) {
      setError(linkError instanceof Error ? linkError.message : "Could not link this canonical Vendor.");
    } finally {
      setBusy(false);
    }
  };

  const createAndLinkVendor = async () => {
    if (!onAddVendor) {
      setError("Vendor management permission is required to create a canonical Vendor.");
      return;
    }
    const name = draft.name.trim();
    if (!name) {
      setError("Confirm a Vendor name before creating the canonical Vendor.");
      return;
    }
    if (likelyMatches.length > 0) {
      setError("A likely canonical Vendor already exists. Select it above instead of creating a duplicate.");
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const saved = await onAddVendor({ ...draft, name });
      await linkVendor(saved);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Could not create and link the canonical Vendor.");
      setBusy(false);
    }
  };

  return <section className="mt-3 rounded-xl border border-amber-200 bg-amber-50/70 p-3" data-testid="supplier-vendor-resolution">
    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0"><p className="text-[10px] font-black uppercase tracking-[0.14em] text-amber-900">Resolve canonical Vendor</p><p className="mt-1 text-[10px] leading-4 text-amber-950">The supplier name below is preserved evidence. Choose an existing company Vendor or deliberately create and link one.</p></div>
      {activeVendors.length > 0 && <button type="button" onClick={() => setCreateOpen((open) => !open)} className="shrink-0 rounded-lg border border-amber-300 bg-white px-2.5 py-1.5 text-[10px] font-black text-amber-900">{createOpen ? "Choose existing Vendor" : "Create & Link Vendor"}</button>}
    </div>
    {activeVendors.length > 0 && !createOpen && <div className="mt-3 space-y-2">
      <label className="block space-y-1"><span className="field-label">Search canonical Vendors</span><input data-supplier-field="vendor" value={query} onChange={(event) => setQuery(event.target.value)} className="field-input" placeholder="Search by name, TIN, email, or phone" /></label>
      <div className="grid gap-2 sm:grid-cols-2" role="listbox" aria-label="Canonical Vendor matches">
        {visibleVendors.map((vendor) => <button type="button" role="option" aria-selected={selectedVendorId === vendor.id} key={vendor.id} onClick={() => setSelectedVendorId(vendor.id)} className={`min-w-0 rounded-lg border p-2 text-left ${selectedVendorId === vendor.id ? "border-indigo-400 bg-indigo-50" : "border-slate-200 bg-white"}`}><span className="block truncate text-[10px] font-black text-slate-900">{vendor.name}</span><span className="mt-0.5 block truncate text-[9px] text-slate-500">{vendor.taxId || vendor.email || "Company Vendor"}</span></button>)}
        {visibleVendors.length === 0 && <p className="rounded-lg border border-dashed border-amber-300 bg-white/70 p-3 text-[10px] text-amber-900 sm:col-span-2">No matching canonical Vendors. Create and link one from the preserved evidence.</p>}
      </div>
      <button type="button" disabled={busy || !selectedVendorId} onClick={() => { const selected = activeVendors.find((vendor) => vendor.id === selectedVendorId); if (selected) void linkVendor(selected); }} className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-700 px-3 py-2 text-[10px] font-black text-white disabled:cursor-not-allowed disabled:opacity-50">{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}Link this Vendor</button>
    </div>}
    {(createOpen || activeVendors.length === 0) && <div className="mt-3 space-y-2 rounded-lg border border-amber-200 bg-white p-3"><p className="text-[10px] font-black text-slate-800">Confirm new canonical Vendor</p><p className="text-[9px] leading-4 text-slate-500">These values come from the invoice evidence and will not become canonical identity until you confirm.</p><div className="grid gap-2 sm:grid-cols-2"><label className="space-y-1"><span className="field-label">Vendor name</span><input data-supplier-field="vendor" value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} className="field-input" /></label><label className="space-y-1"><span className="field-label">TIN</span><input value={draft.taxId || ""} onChange={(event) => setDraft((current) => ({ ...current, taxId: event.target.value || undefined }))} className="field-input" /></label><label className="space-y-1 sm:col-span-2"><span className="field-label">Address</span><input value={draft.address || ""} onChange={(event) => setDraft((current) => ({ ...current, address: event.target.value || undefined }))} className="field-input" /></label><label className="space-y-1"><span className="field-label">Email</span><input type="email" value={draft.email || ""} onChange={(event) => setDraft((current) => ({ ...current, email: event.target.value || undefined }))} className="field-input" /></label><label className="space-y-1"><span className="field-label">Phone</span><input value={draft.phone || ""} onChange={(event) => setDraft((current) => ({ ...current, phone: event.target.value || undefined }))} className="field-input" /></label></div>{likelyMatches.length > 0 && <p className="rounded-lg bg-amber-50 p-2 text-[10px] font-semibold text-amber-900">A likely duplicate is already present. Select it above rather than creating another Vendor.</p>}{onAddVendor ? <button type="button" disabled={busy || likelyMatches.length > 0} onClick={() => void createAndLinkVendor()} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-2 text-[10px] font-black text-white disabled:cursor-not-allowed disabled:opacity-50">{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}Create &amp; Link Vendor</button> : <p className="text-[10px] font-semibold text-amber-900">Vendor management permission is required to create a canonical Vendor.</p>}</div>}
    {message && <p role="status" className="mt-2 text-[10px] font-bold text-emerald-800">{message}</p>}
    {error && <p role="alert" className="mt-2 text-[10px] font-bold text-rose-700">{error}</p>}
  </section>;
};

const headerFields = [
  ["invoiceNumber", "Invoice number"],
  ["invoiceDate", "Invoice date"],
  ["dueDate", "Due date"],
  ["currency", "Currency"],
  ["purchaseOrderNumber", "PO number"],
  ["projectReference", "Project / reference"],
] as const;

function ReadOnlyLineRow({ item, index, invoice, showTax, showDiscount, financialFxSnapshots }: { item: LineItem; index: number; invoice: InvoiceData; showTax: boolean; showDiscount: boolean; financialFxSnapshots: readonly FinancialFxSnapshot[] }) {
  return (
    <tr>
      <td className="px-4 py-2 font-mono text-slate-500">{item.itemNumber || index + 1}</td>
      <td className="px-4 py-2 text-right tabular-nums">{item.quantity ?? ""}</td>
      <td className="px-4 py-2">{item.unitOfMeasure || ""}</td>
      <td className="max-w-[280px] px-4 py-2 font-medium text-slate-800">{item.description || "Description missing"}</td>
      <td className="px-4 py-2 text-right tabular-nums">{displaySourceMoney(item.unitPrice, invoice, financialFxSnapshots)}</td>
      {showDiscount && <td className="px-4 py-2 text-right tabular-nums">{item.discount !== undefined && item.discount !== null ? displaySourceMoney(item.discount, invoice, financialFxSnapshots) : ""}</td>}
      <td className="px-4 py-2 text-right font-bold tabular-nums">{displaySourceMoney(item.total, invoice, financialFxSnapshots)}</td>
      {showTax && <td className="px-4 py-2 text-right tabular-nums">{item.taxAmount !== undefined ? displaySourceMoney(item.taxAmount, invoice, financialFxSnapshots) : item.taxRate !== undefined ? `${item.taxRate}%` : ""}</td>}
    </tr>
  );
}

function ReadOnlyLineItems({ invoice, financialFxSnapshots }: { invoice: InvoiceData; financialFxSnapshots: readonly FinancialFxSnapshot[] }) {
  const showTax = invoice.items.some((item) => present(item.taxAmount) || present(item.taxRate));
  const showDiscount = invoice.items.some((item) => present(item.discount) && Number(item.discount) !== 0);
  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-4 py-3"><h3 className="text-xs font-black uppercase tracking-[0.14em] text-slate-700">Line items</h3><p className="mt-1 text-[10px] text-slate-500">{invoice.items.length} extracted item{invoice.items.length === 1 ? "" : "s"}</p></div>
      <div className="ops-scrollbar overflow-x-auto">
        <table className="min-w-[640px] w-full text-left text-xs">
          <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-2">Item</th><th className="px-4 py-2 text-right">Qty</th><th className="px-4 py-2">Unit</th><th className="px-4 py-2">Description</th><th className="px-4 py-2 text-right">Unit price</th>{showDiscount && <th className="px-4 py-2 text-right">Discount</th>}<th className="px-4 py-2 text-right">Amount</th>{showTax && <th className="px-4 py-2 text-right">Tax</th>}</tr></thead>
          <tbody className="divide-y divide-slate-100">
            {invoice.items.length > 0
              ? invoice.items.map((item, index) => <ReadOnlyLineRow key={item.id} item={item} index={index} invoice={invoice} showTax={showTax} showDiscount={showDiscount} financialFxSnapshots={financialFxSnapshots} />)
              : <tr><td colSpan={(showTax ? 7 : 6) + (showDiscount ? 1 : 0)} className="px-4 py-8 text-center text-xs text-amber-700">No line items extracted. Review before verification.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function EditableLineItems({ invoice, update }: { invoice: InvoiceData; update: (path: string, value: unknown) => void }) {
  const changeLine = (id: string, patch: Partial<LineItem>) => {
    const items = invoice.items.map((item) => item.id === id ? { ...item, ...patch } : item);
    update("items", items);
  };
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2"><span className="field-label">Line items</span><p className="text-[10px] text-slate-500">Source amounts stay unchanged until you edit the Amount field.</p><button type="button" onClick={() => update("items", [...invoice.items, { id: `line-${Date.now()}`, description: "", quantity: 1, unitPrice: 0, discount: 0, total: 0 }])} className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-indigo-200 px-2 py-1.5 text-[10px] font-bold text-indigo-700"><Plus className="h-3 w-3" />Add line</button></div>
      {invoice.items.map((item, index) => <div key={item.id} className="grid gap-2 rounded-xl border border-slate-200 p-3 sm:grid-cols-[minmax(0,1fr)_5rem_6rem_7rem_7rem_7rem_auto]"><input aria-label={`Line ${index + 1} description`} value={item.description} onChange={(event) => changeLine(item.id, { description: event.target.value })} className="field-input" /><input aria-label={`Line ${index + 1} quantity`} type="number" step="any" value={item.quantity ?? ""} onChange={(event) => changeLine(item.id, { quantity: event.target.value === "" ? null : Number(event.target.value) })} className="field-input" /><input aria-label={`Line ${index + 1} unit`} value={item.unitOfMeasure || ""} onChange={(event) => changeLine(item.id, { unitOfMeasure: event.target.value })} className="field-input" /><input aria-label={`Line ${index + 1} unit price`} type="number" step="any" value={item.unitPrice ?? ""} onChange={(event) => changeLine(item.id, { unitPrice: event.target.value === "" ? null : Number(event.target.value) })} className="field-input" /><input aria-label={`Line ${index + 1} discount`} type="number" step="0.01" value={item.discount ?? ""} onChange={(event) => changeLine(item.id, { discount: event.target.value === "" ? null : Number(event.target.value) })} className="field-input" /><input aria-label={`Line ${index + 1} amount`} type="number" step="0.01" value={item.total ?? ""} onChange={(event) => changeLine(item.id, { total: event.target.value === "" ? null : Number(event.target.value) })} className="field-input" /><button type="button" aria-label={`Remove line ${index + 1}`} onClick={() => update("items", invoice.items.filter((candidate) => candidate.id !== item.id))} className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-700"><X className="h-4 w-4" /></button></div>)}
    </div>
  );
}

export const SupplierInvoiceReview: React.FC<SupplierInvoiceReviewProps> = ({ invoice, readOnly = false, onUpdateInvoice, onVerify: verifyHandler, verifyLabel = "Verify & Create Expense", onReopen, onRevertToAI, onFocusField, vendors = [], projects = [], projectAllocations = [], allowReopen = true, onCommitRepair, onAddVendor, onOpenCorrection, repairMode = false, linkedExpense, linkedExpenseLoading = false, canRecordExpensePayment = false, canReverseExpensePayment = false, onNavigatePath, financialFxSnapshots = [] }) => {
  const [editMode, setEditMode] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [reopenBusy, setReopenBusy] = useState(false);
  const [reopenError, setReopenError] = useState("");
  const [reopenedNotice, setReopenedNotice] = useState(false);
  const [descriptionDraft, setDescriptionDraft] = useState(() => invoice.description || suggestSupplierExpenseDescription(invoice));
  const [descriptionBusy, setDescriptionBusy] = useState(false);
  const [descriptionMessage, setDescriptionMessage] = useState("");
  const [descriptionError, setDescriptionError] = useState("");
  const readiness = useMemo(() => getSupplierInvoiceExpenseReadiness(invoice, {
    allocations: projectAllocations,
    projects,
  }), [invoice, projectAllocations, projects]);
  const advisories = useMemo(() => getSupplierInvoiceValidationAdvisories(invoice, readiness), [invoice, readiness]);
  const onVerify = !readiness.complete ? undefined : verifyHandler;
  const duplicate = invoice.duplicateStatus === "POSSIBLE_DUPLICATE" || Boolean(invoice.duplicateOfId);
  const conflicts = invoice.entityResolution?.conflicts || [];
  const confidenceWarning = invoice.confidenceScore !== undefined && invoice.confidenceScore < 70;
  const blockerItems = useMemo(() => [
    ...readiness.issues.map((issue) => ({ id: `readiness-${issue.code}`, text: issue.message, field: issue.field, code: issue.code })),
  ], [readiness.issues]);
  const reviewNotes = useMemo(() => [
    ...advisories.map((issue) => ({ id: issue.id, text: issue.message, field: issue.field })),
    ...(duplicate ? [{ id: "duplicate-risk", text: "Duplicate risk needs reviewer confirmation.", field: "duplicateStatus" }] : []),
    ...conflicts.slice(0, 3).map((conflict, index) => ({ id: `conflict-${index}`, text: `${conflict.label}: ${conflict.reason}`, field: "vendor" })),
    ...(confidenceWarning ? [{ id: "confidence", text: `AI confidence is ${Math.round(invoice.confidenceScore || 0)}%.`, field: "confidenceScore" }] : []),
  ], [advisories, blockerItems, confidenceWarning, conflicts, duplicate, invoice.confidenceScore]);
  const hasVendorBlocker = blockerItems.some((item) => item.code === "CANONICAL_VENDOR");
  const hasDescriptionBlocker = blockerItems.some((item) => item.code === "EXPENSE_DESCRIPTION");
  const fixRequired = invoice.reviewStatus === "VERIFIED" && allowReopen && blockerItems.length > 0;
  const firstBlockerField = blockerItems[0]?.field;

  useEffect(() => {
    setDescriptionDraft(invoice.description || suggestSupplierExpenseDescription(invoice));
    setDescriptionMessage("");
    setDescriptionError("");
  }, [invoice.id, invoice.description]);

  useEffect(() => {
    setEditMode(false);
    setReopenedNotice(false);
    setReopenError("");
  }, [invoice.id]);

  const focusField = (field: string) => {
    setEditMode(true);
    onFocusField?.(field);
    if (typeof window !== "undefined") {
      window.setTimeout(() => {
        const target = document.querySelector<HTMLElement>(`[data-supplier-field="${field}"]`);
        target?.scrollIntoView({ block: "center", behavior: "smooth" });
        target?.focus();
      }, 0);
    }
  };

  useEffect(() => {
    if (!repairMode || readOnly || !firstBlockerField) return;
    setEditMode(true);
    if (typeof window === "undefined") return;
    const timer = window.setTimeout(() => focusField(firstBlockerField), 0);
    return () => window.clearTimeout(timer);
  }, [firstBlockerField, readOnly, repairMode]);

  const update = (path: string, value: unknown) => {
    if (!readOnly) onUpdateInvoice?.(setPath(invoice, path, value));
  };
  const updateParty = (field: string, value: string) => update(`vendor.${field}`, value || undefined);
  const commitRepair = async (next: InvoiceData) => {
    if (onCommitRepair) {
      if (!await onCommitRepair(next)) throw new Error("The invoice could not be saved. No repair was applied.");
      return;
    }
    onUpdateInvoice?.(next);
  };
  const handleReopen = async () => {
    if (!onReopen || !allowReopen || reopenBusy) return;
    setReopenBusy(true);
    setReopenError("");
    try {
      const result = await onReopen();
      if (result === false) return;
      setReopenedNotice(true);
      setEditMode(true);
    } catch (error) {
      setReopenError(error instanceof Error ? error.message : "Could not reopen this invoice for correction.");
    } finally {
      setReopenBusy(false);
    }
  };
  const confirmDescription = async () => {
    const description = descriptionDraft.trim();
    if (!description) {
      setDescriptionError("Enter or confirm an Expense description before continuing.");
      return;
    }
    setDescriptionBusy(true);
    setDescriptionError("");
    setDescriptionMessage("");
    try {
      await commitRepair({ ...invoice, description });
      setDescriptionMessage("Expense description confirmed.");
    } catch (error) {
      setDescriptionError(error instanceof Error ? error.message : "Could not save the Expense description.");
    } finally {
      setDescriptionBusy(false);
    }
  };
  const vendorName = invoice.vendor?.registeredName || invoice.vendor?.companyName || invoice.vendor?.name || "Supplier unresolved";
  const optionalTotals = [["totalDiscount", "Discount"], ["shippingFee", "Shipping"], ["otherFees", "Other fees"], ["withholdingTaxAmount", "Withholding"], ["amountDue", "Source amount due"], ["netAmountPayable", "Net payable"]] as const;
  const visibleOptionalTotals = optionalTotals.filter(([field]) => present(valueAt(invoice, field)) && Number(valueAt(invoice, field)) !== 0);
  const vendorResolution = !readOnly && hasVendorBlocker ? <VendorResolutionPanel invoice={invoice} vendors={vendors} onUpdateInvoice={onUpdateInvoice} onCommitRepair={onCommitRepair} onAddVendor={onAddVendor} /> : null;
  const descriptionResolution = !readOnly && hasDescriptionBlocker ? <section className="rounded-xl border border-indigo-200 bg-indigo-50/70 p-3" data-testid="supplier-description-resolution"><p className="text-[10px] font-black uppercase tracking-[0.14em] text-indigo-800">Confirm Expense description</p><p className="mt-1 text-[10px] leading-4 text-indigo-950">This suggestion uses preserved invoice evidence. Edit it if needed, then confirm the human-facing description for the authoritative Expense.</p><div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end"><label className="min-w-0 flex-1 space-y-1"><span className="field-label">Expense description</span><input data-supplier-field="description" value={descriptionDraft} onChange={(event) => setDescriptionDraft(event.target.value)} className="field-input" /></label><button type="button" onClick={() => void confirmDescription()} disabled={descriptionBusy} className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg bg-indigo-700 px-3 py-2 text-[10px] font-black text-white disabled:opacity-50">{descriptionBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}Confirm description</button></div>{descriptionMessage && <p role="status" className="mt-2 text-[10px] font-bold text-emerald-800">{descriptionMessage}</p>}{descriptionError && <p role="alert" className="mt-2 text-[10px] font-bold text-rose-700">{descriptionError}</p>}</section> : null;
  const expenseSurface = <SupplierInvoiceExpenseSurface invoice={invoice} linkedExpenseId={invoice.linkedExpenseId} linkedExpense={linkedExpense} loading={linkedExpenseLoading} canRecordPayment={canRecordExpensePayment} canReversePayment={canReverseExpensePayment} financialFxSnapshots={financialFxSnapshots} onNavigatePath={onNavigatePath} />;

  return (
    <section className="space-y-3" data-testid="supplier-invoice-review" aria-label="Supplier invoice review">
      <div className={`rounded-2xl border p-4 shadow-sm ${blockerItems.length ? "border-amber-200 bg-amber-50" : "border-emerald-200 bg-emerald-50"}`}>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 items-start gap-3"><div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${blockerItems.length ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}>{blockerItems.length ? <AlertTriangle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}</div><div><p className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-600">Supplier invoice readiness</p><h2 className="mt-1 text-sm font-black text-slate-950">{blockerItems.length ? `${blockerItems.length} action${blockerItems.length === 1 ? "" : "s"} required` : onVerify ? "Ready to create Expense" : "No posting blockers"}</h2><p className="mt-1 text-[10px] text-slate-600">{blockerItems.length ? "Resolve the required facts below before creating the authoritative Expense." : "The guarded posting action remains available here when your access profile allows it."}</p></div></div>
          <div className="flex flex-wrap justify-end gap-2">{!readOnly && onRevertToAI && <button type="button" onClick={onRevertToAI} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700"><Undo2 className="h-3.5 w-3.5" />Revert to original</button>}{!readOnly && <button type="button" onClick={() => setEditMode((value) => !value)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700"><Edit3 className="h-3.5 w-3.5" />{editMode ? "Review mode" : "Edit details"}</button>}{onOpenCorrection && <button type="button" onClick={onOpenCorrection} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700"><Archive className="h-3.5 w-3.5" />Invoice actions</button>}{invoice.reviewStatus === "VERIFIED" && onReopen && allowReopen && <button type="button" onClick={() => void handleReopen()} disabled={reopenBusy} className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-white px-3 py-2 text-xs font-black text-emerald-800 disabled:opacity-50">{reopenBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Undo2 className="h-3.5 w-3.5" />}{fixRequired ? "Fix invoice" : "Reopen for review"}</button>}{invoice.reviewStatus === "VERIFIED" && onReopen && !allowReopen && <span className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-[10px] font-black text-indigo-800">Linked Expense is authoritative; use Expense correction</span>}{invoice.reviewStatus === "VERIFIED" ? <span className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-white px-3 py-2 text-[10px] font-black text-emerald-800"><ShieldCheck className="h-3.5 w-3.5" />Verified {formatDateTime(invoice.verifiedAt)}</span> : onVerify && <button type="button" onClick={onVerify} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-2 text-xs font-black text-white hover:bg-emerald-800"><ShieldCheck className="h-3.5 w-3.5" />{verifyLabel}</button>}</div>
        </div>
        {reopenError && <p role="alert" className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[10px] font-bold text-rose-800">{reopenError}</p>}
        {(repairMode || reopenedNotice) && !readOnly && <p role="status" className="mt-3 inline-flex rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-[10px] font-black text-indigo-900">Editing correction · reopened for correction</p>}
        {blockerItems.length > 0 && <div className="mt-3 rounded-xl border border-amber-200 bg-white/70 p-3"><p className="text-[10px] font-black uppercase tracking-[0.12em] text-amber-950">Blocking actions required</p><div className="mt-2 grid gap-2 sm:grid-cols-2">{blockerItems.slice(0, 6).map((item) => <button type="button" key={item.id} onClick={() => readOnly ? void handleReopen() : focusField(item.field)} disabled={readOnly && (!onReopen || !allowReopen || reopenBusy)} className="rounded-xl border border-amber-200 bg-white p-3 text-left hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-60"><span className="block text-[10px] font-black text-amber-900">{item.text}</span><span className="mt-1 block text-[9px] font-bold text-amber-700">{readOnly ? "Fix invoice" : item.code === "CANONICAL_VENDOR" ? "Resolve Vendor" : item.code === "EXPENSE_DESCRIPTION" ? "Confirm description" : "Review details"}</span></button>)}</div></div>}
        {reviewNotes.length > 0 && <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50/80 p-3"><p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-600">Advisories and review notes</p><ul className="mt-2 space-y-1 text-[10px] leading-4 text-slate-600">{reviewNotes.slice(0, 6).map((item) => <li key={item.id}>• {item.text}</li>)}</ul></div>}
      </div>

      {vendorResolution}
      {descriptionResolution}
      {expenseSurface}

      {editMode && !readOnly ? (
        <div className="space-y-3 rounded-2xl border border-indigo-200 bg-white p-4 shadow-sm" data-testid="supplier-invoice-edit-details">
          <div className="flex items-start justify-between gap-2"><div><p className="text-[10px] font-black uppercase tracking-[0.15em] text-indigo-600">Edit details</p><p className="mt-1 text-xs text-slate-500">Correct extracted values before verification. The original AI snapshot remains preserved.</p></div><button type="button" onClick={() => setEditMode(false)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100" aria-label="Close edit details"><X className="h-4 w-4" /></button></div>
          <div className="grid gap-3 sm:grid-cols-2">{headerFields.map(([field, label]) => <label key={field} className="space-y-1"><span className="field-label">{label}</span><input data-supplier-field={field} type={field.includes("Date") || field === "dueDate" ? "date" : "text"} value={String(valueAt(invoice, field) || "")} onChange={(event) => update(field, event.target.value)} className="field-input" /></label>)}</div>
          <div className="grid gap-3 sm:grid-cols-2"><label className="space-y-1"><span className="field-label">Supplier name</span><input value={invoice.vendor?.name || ""} onChange={(event) => updateParty("name", event.target.value)} className="field-input" /></label><label className="space-y-1"><span className="field-label">Supplier TIN</span><input value={invoice.vendor?.taxId || ""} onChange={(event) => updateParty("taxId", event.target.value)} className="field-input" /></label><label className="space-y-1 sm:col-span-2"><span className="field-label">Supplier address</span><input value={invoice.vendor?.address || ""} onChange={(event) => updateParty("address", event.target.value)} className="field-input" /></label><label className="space-y-1"><span className="field-label">Supplier email</span><input type="email" value={invoice.vendor?.email || ""} onChange={(event) => updateParty("email", event.target.value)} className="field-input" /></label><label className="space-y-1"><span className="field-label">Supplier phone</span><input value={invoice.vendor?.phone || ""} onChange={(event) => updateParty("phone", event.target.value)} className="field-input" /></label></div>
          <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3" data-testid="supplier-invoice-monetary-facts"><div><p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-700">Source monetary facts</p><p className="mt-1 text-[10px] leading-4 text-slate-500">Edit only what the source supports. Line amounts are source evidence; derived reconciliation never overwrites them.</p></div><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{([["subtotal", "Subtotal"], ["totalDiscount", "Invoice discount"], ["totalTax", "Tax / VAT"], ["shippingFee", "Shipping"], ["otherFees", "Other fees"], ["grandTotal", "Gross total"], ["amountPaid", "Amount paid"], ["amountDue", "Source amount due"], ["balanceDue", "Balance due"], ["withholdingTaxAmount", "Withholding tax"], ["netAmountPayable", "Net payable"]] as const).map(([field, label]) => <label key={field} className="space-y-1"><span className="field-label">{label}</span><input data-supplier-field={field} type="number" step="0.01" value={(invoice as any)[field] ?? ""} onChange={(event) => update(field, event.target.value === "" ? null : Number(event.target.value))} className="field-input" /></label>)}</div><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5"><label className="space-y-1"><span className="field-label">Unit price basis</span><select data-supplier-field="financialSemantics.unitPriceBasis" value={invoice.financialSemantics?.unitPriceBasis || "UNKNOWN"} onChange={(event) => update("financialSemantics", { ...(invoice.financialSemantics || {}), unitPriceBasis: event.target.value })} className="field-input"><option value="UNKNOWN">Unknown / ambiguous</option><option value="PRE_TAX">Pre-tax</option><option value="TAX_INCLUSIVE">Tax-inclusive</option></select></label><label className="space-y-1"><span className="field-label">Line amount basis</span><select data-supplier-field="financialSemantics.lineTotalBasis" value={invoice.financialSemantics?.lineTotalBasis || "UNKNOWN"} onChange={(event) => update("financialSemantics", { ...(invoice.financialSemantics || {}), lineTotalBasis: event.target.value })} className="field-input"><option value="UNKNOWN">Unknown / ambiguous</option><option value="PRE_TAX">Pre-tax</option><option value="TAX_INCLUSIVE">Tax-inclusive</option></select></label><label className="space-y-1"><span className="field-label">Tax treatment evidence</span><select data-supplier-field="financialSemantics.taxInclusion" value={invoice.financialSemantics?.taxInclusion || "UNKNOWN"} onChange={(event) => update("financialSemantics", { ...(invoice.financialSemantics || {}), taxInclusion: event.target.value })} className="field-input"><option value="UNKNOWN">Unknown / ambiguous</option><option value="ADDED_TO_TOTAL">Tax added to base</option><option value="INCLUDED_IN_TOTAL">Tax included in total</option><option value="NOT_APPLICABLE">No tax / not applicable</option></select></label><label className="space-y-1"><span className="field-label">Subtotal basis</span><select data-supplier-field="financialSemantics.subtotalBasis" value={invoice.financialSemantics?.subtotalBasis || "UNKNOWN"} onChange={(event) => update("financialSemantics", { ...(invoice.financialSemantics || {}), subtotalBasis: event.target.value })} className="field-input"><option value="UNKNOWN">Unknown / ambiguous</option><option value="PRE_TAX">Pre-tax</option><option value="TAX_INCLUSIVE">Tax-inclusive</option></select></label><label className="space-y-1"><span className="field-label">Discount treatment</span><select data-supplier-field="financialSemantics.discountIncludedInSubtotal" value={invoice.financialSemantics?.discountIncludedInSubtotal === true ? "INCLUDED" : invoice.financialSemantics?.discountIncludedInSubtotal === false ? "SEPARATE" : "UNKNOWN"} onChange={(event) => update("financialSemantics", { ...(invoice.financialSemantics || {}), discountIncludedInSubtotal: event.target.value === "UNKNOWN" ? null : event.target.value === "INCLUDED" })} className="field-input"><option value="UNKNOWN">Unknown / ambiguous</option><option value="SEPARATE">Separate from subtotal</option><option value="INCLUDED">Included in subtotal</option></select></label></div></div>
          <div className="grid gap-3 rounded-xl border border-indigo-100 bg-indigo-50/50 p-3 sm:grid-cols-2" data-testid="supplier-invoice-expense-facts"><div className="sm:col-span-2"><p className="text-[10px] font-black uppercase tracking-[0.14em] text-indigo-700">Expense posting facts</p><p className="mt-1 text-[10px] text-indigo-900">These human-confirmed values create the authoritative Expense; source line items remain preserved evidence.</p></div><label className="space-y-1"><span className="field-label">Expense category</span><input data-supplier-field="category" value={invoice.category || ""} onChange={(event) => update("category", event.target.value)} className="field-input" /></label><label className="space-y-1"><span className="field-label">Expense description</span><input data-supplier-field="description" value={invoice.description || ""} onChange={(event) => update("description", event.target.value)} className="field-input" /></label></div><label className="block space-y-1"><span className="field-label">Notes and terms</span><textarea value={invoice.notes || ""} onChange={(event) => update("notes", event.target.value)} rows={3} className="field-input resize-y" /></label>
          <EditableLineItems invoice={invoice} update={update} />
        </div>
      ) : (
        <>
          <div className="grid gap-3 lg:grid-cols-2"><section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-center justify-between gap-2"><h3 className="text-xs font-black uppercase tracking-[0.14em] text-slate-700">Supplier</h3>{invoice.entityResolution?.matchedEntityId && <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-[9px] font-bold text-emerald-700"><Link2 className="h-3 w-3" />Matched vendor</span>}</div><p className="mt-3 text-sm font-black text-slate-950">{vendorName}</p>{invoice.vendor?.taxId && <p className="mt-1 text-xs text-slate-600">TIN {invoice.vendor.taxId}</p>}{invoice.vendor?.address && <p className="mt-1 text-xs text-slate-600">{invoice.vendor.address}</p>}<div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-slate-500">{invoice.vendor?.email && <span>{invoice.vendor.email}</span>}{invoice.vendor?.phone && <span>{invoice.vendor.phone}</span>}</div>{invoice.entityResolution?.matchedEntityName && <p className="mt-3 border-t border-slate-100 pt-2 text-[10px] text-slate-500">Master vendor: <strong className="text-slate-700">{invoice.entityResolution.matchedEntityName}</strong></p>}</section><section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><h3 className="text-xs font-black uppercase tracking-[0.14em] text-slate-700">Invoice details</h3><dl className="mt-3 grid grid-cols-2 gap-3 text-xs"><div><dt className="text-[10px] text-slate-500">Invoice number</dt><dd className={`mt-0.5 font-bold ${invoice.invoiceNumber ? "text-slate-900" : "text-amber-700"}`}>{invoice.invoiceNumber || "Missing · Add"}</dd></div><div><dt className="text-[10px] text-slate-500">Invoice date</dt><dd className="mt-0.5 font-bold">{invoice.invoiceDate || "Missing · Add"}</dd></div><div><dt className="text-[10px] text-slate-500">Due date</dt><dd className="mt-0.5 font-bold">{invoice.dueDate || "Not supplied"}</dd></div><div><dt className="text-[10px] text-slate-500">Currency</dt><dd className="mt-0.5 font-bold">{invoice.currency || "Unclear · Add"}</dd></div></dl></section></div>
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><h3 className="text-xs font-black uppercase tracking-[0.14em] text-slate-700">Purchase / project</h3><div className="mt-3 grid gap-3 text-xs sm:grid-cols-3"><div><p className="text-[10px] text-slate-500">Purchase order</p><p className="mt-0.5 font-bold">{invoice.purchaseOrderNumber || "Not supplied"}</p></div><div><p className="text-[10px] text-slate-500">Project</p><p className="mt-0.5 font-bold">{invoice.projectReference || "Unallocated until confirmed"}</p></div><div><p className="text-[10px] text-slate-500">Category</p><p className="mt-0.5 font-bold">{invoice.category || "Missing · Confirm"}</p></div></div></section>
          <section className="rounded-2xl border border-indigo-100 bg-indigo-50/40 p-4 shadow-sm" data-testid="supplier-invoice-expense-facts"><h3 className="text-xs font-black uppercase tracking-[0.14em] text-indigo-800">Expense posting facts</h3><dl className="mt-3 grid gap-3 text-xs sm:grid-cols-2"><div><dt className="text-[10px] text-slate-500">Category</dt><dd className={`mt-0.5 font-bold ${invoice.category ? "text-slate-900" : "text-amber-700"}`}>{invoice.category || "Missing · Confirm"}</dd></div><div><dt className="text-[10px] text-slate-500">Description</dt><dd className={`mt-0.5 font-bold ${invoice.description ? "text-slate-900" : "text-amber-700"}`}>{invoice.description || "Missing · Confirm"}</dd></div></dl><p className="mt-3 text-[10px] leading-4 text-indigo-900">The linked Expense is the authoritative payable/cost row. Confirm these facts before posting; the supplier invoice remains source evidence.</p></section>
          <ReadOnlyLineItems invoice={invoice} financialFxSnapshots={financialFxSnapshots} />
           <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-4"><div><h3 className="text-xs font-black uppercase tracking-[0.14em] text-slate-700">Totals</h3><p className="mt-1 text-[10px] text-slate-500">Lines: {invoice.financialSemantics?.lineTotalBasis || "UNKNOWN"} · Subtotal: {invoice.financialSemantics?.subtotalBasis || "UNKNOWN"} · Tax: {invoice.financialSemantics?.taxInclusion || "UNKNOWN"}</p><div className="mt-3 space-y-2 text-xs">{present(invoice.subtotal) && <p className="flex justify-between gap-8"><span className="text-slate-500">Subtotal{monetarySourceLabel(invoice, "subtotal")}</span><strong>{displaySourceMoney(invoice.subtotal, invoice, financialFxSnapshots)}</strong></p>}{present(invoice.totalTax) && invoice.totalTax !== 0 && <p className="flex justify-between gap-8"><span className="text-slate-500">Tax / VAT{monetarySourceLabel(invoice, "totalTax")}</span><strong>{displaySourceMoney(invoice.totalTax, invoice, financialFxSnapshots)}</strong></p>}{visibleOptionalTotals.map(([field, label]) => <p key={field} className="flex justify-between gap-8"><span className="text-slate-500">{label}{monetarySourceLabel(invoice, field)}</span><strong>{displaySourceMoney(valueAt(invoice, field), invoice, financialFxSnapshots)}</strong></p>)}<p className="flex justify-between gap-8 border-t border-slate-100 pt-2 text-sm"><span className="font-black">Gross total{monetarySourceLabel(invoice, "grandTotal")}</span><strong className="text-indigo-700">{displaySourceMoney(invoice.grandTotal, invoice, financialFxSnapshots)}</strong></p></div></div><div className="min-w-[14rem] rounded-xl border border-indigo-100 bg-indigo-50/50 p-3"><p className="text-[10px] font-black uppercase tracking-wide text-indigo-700">Expense record</p><p className="mt-2 text-xs font-black text-slate-900">{invoice.linkedExpenseId ? "Authoritative Expense linked" : invoice.reviewStatus === "VERIFIED" ? "Expense created" : "Will become authoritative"}</p><p className="mt-1 text-[10px] leading-4 text-slate-600">Supplier invoice is preserved as evidence. {invoice.linkedExpenseId ? `Expense #${invoice.linkedExpenseId.slice(0, 8)} owns cost and payable. ` : "Verification creates a Draft Expense; approve it in Expenses before payment."}No duplicate Actual Cost is posted.</p></div></div></section>
          <details open={moreOpen} onToggle={(event) => setMoreOpen((event.currentTarget as HTMLDetailsElement).open)} className="rounded-2xl border border-slate-200 bg-white shadow-sm"><summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-xs font-black text-slate-700 [&::-webkit-details-marker]:hidden"><span>More extracted details</span><ChevronDown className={`h-4 w-4 transition ${moreOpen ? "rotate-180" : ""}`} /></summary><div className="grid gap-3 border-t border-slate-100 p-4 text-xs sm:grid-cols-2"><div><p className="text-[10px] font-black uppercase text-slate-500">Extraction diagnostics</p><p className="mt-1">Model: {invoice.modelUsed || "Unknown"}</p><p className="text-slate-500">Confidence: {invoice.confidenceScore === undefined ? "Not supplied" : `${Math.round(invoice.confidenceScore)}%`}</p><p className="text-slate-500">Source: {invoice.fileName || invoice.sourceType || "Unknown"}</p></div><div><p className="text-[10px] font-black uppercase text-slate-500">Monetary basis</p><p className="mt-1">Lines: {invoice.financialSemantics?.lineTotalBasis || "UNKNOWN"}</p><p className="text-slate-500">Subtotal: {invoice.financialSemantics?.subtotalBasis || "UNKNOWN"}</p><p className="text-slate-500">Tax: {invoice.financialSemantics?.taxInclusion || "UNKNOWN"}</p></div><div className="sm:col-span-2"><p className="text-[10px] font-black uppercase text-slate-500">PH metadata</p><p className="mt-1 whitespace-pre-wrap text-slate-600">{invoice.philippineTaxDetails ? JSON.stringify(invoice.philippineTaxDetails, null, 2) : "No additional tax metadata extracted."}</p></div></div></details>
        </>
      )}

      {invoice.sourceType === "EMAIL" && <p className="flex items-center gap-1.5 px-1 text-[10px] text-indigo-700"><Mail className="h-3.5 w-3.5" />Source email preserved: {invoice.sourceMetadata?.subject || invoice.sourceMetadata?.sender || "Email Intake"}</p>}
      {vendors.length === 0 && invoice.entityResolution?.matchedEntityId && <p className="px-1 text-[10px] text-slate-500">Vendor link is preserved in the source record; the current vendor directory is unavailable.</p>}
    </section>
  );
};

export default SupplierInvoiceReview;
