import React, { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Archive, CheckCircle2, ChevronDown, Link2, Loader2, Mail, Plus, ShieldCheck, Undo2 } from "lucide-react";
import type { EntityResolutionResult, Expense, FinancialFxSnapshot, InvoiceData, InvoiceProjectAllocation, Project, Vendor } from "../types.ts";
import { formatDateTime } from "../config/regional.ts";
import { getSupplierInvoiceExpenseReadiness, getSupplierInvoiceValidationAdvisories, suggestSupplierExpenseDescription } from "../utils/supplierExpenseWorkspace.ts";
import type { AppNavigate } from "../utils/clientNavigation.ts";
import { SupplierInvoiceExpenseSurface } from "./SupplierInvoiceExpenseSurface.tsx";
import { SupplierInvoiceWorksheet } from "./invoices/SupplierInvoiceWorksheet.tsx";

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
  authorityConflict?: boolean;
  linkedExpenseLoading?: boolean;
  canRecordExpensePayment?: boolean;
  canReverseExpensePayment?: boolean;
  onNavigatePath?: AppNavigate;
  financialFxSnapshots?: readonly FinancialFxSnapshot[];
}

function valueAt(value: unknown, path: string): unknown {
  return path.split(".").reduce((current: any, key) => current?.[key], value);
}

function textValue(value: unknown) {
  return String(value ?? "").trim();
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

export const SupplierInvoiceReview: React.FC<SupplierInvoiceReviewProps> = ({ invoice, readOnly = false, onUpdateInvoice, onVerify: verifyHandler, verifyLabel = "Verify & Create Expense", onReopen, onRevertToAI, onFocusField, vendors = [], projects = [], projectAllocations = [], allowReopen = true, onCommitRepair, onAddVendor, onOpenCorrection, repairMode = false, linkedExpense, authorityConflict = false, linkedExpenseLoading = false, canRecordExpensePayment = false, canReverseExpensePayment = false, onNavigatePath, financialFxSnapshots = [] }) => {
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
    setReopenedNotice(false);
    setReopenError("");
  }, [invoice.id]);

  const focusField = (field: string) => {
    onFocusField?.(field);
    if (typeof window !== "undefined") {
      window.setTimeout(() => {
        const target = Array.from(document.querySelectorAll<HTMLElement>("[data-supplier-field], [data-worksheet-cell]"))
          .find((candidate) => candidate.dataset.supplierField === field || candidate.dataset.worksheetCell?.endsWith(`:${field}`));
        target?.scrollIntoView({ block: "center", behavior: "smooth" });
        target?.focus();
      }, 0);
    }
  };

  useEffect(() => {
    if (!repairMode || readOnly || !firstBlockerField) return;
    if (typeof window === "undefined") return;
    const timer = window.setTimeout(() => focusField(firstBlockerField), 0);
    return () => window.clearTimeout(timer);
  }, [firstBlockerField, readOnly, repairMode]);

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
  const vendorResolution = !readOnly && hasVendorBlocker ? <VendorResolutionPanel invoice={invoice} vendors={vendors} onUpdateInvoice={onUpdateInvoice} onCommitRepair={onCommitRepair} onAddVendor={onAddVendor} /> : null;
  const descriptionResolution = !readOnly && hasDescriptionBlocker ? <section className="rounded-xl border border-indigo-200 bg-indigo-50/70 p-3" data-testid="supplier-description-resolution"><p className="text-[10px] font-black uppercase tracking-[0.14em] text-indigo-800">Confirm Expense description</p><p className="mt-1 text-[10px] leading-4 text-indigo-950">This suggestion uses preserved invoice evidence. Edit it if needed, then confirm the human-facing description for the authoritative Expense.</p><div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end"><label className="min-w-0 flex-1 space-y-1"><span className="field-label">Expense description</span><input data-supplier-field="description" value={descriptionDraft} onChange={(event) => setDescriptionDraft(event.target.value)} className="field-input" /></label><button type="button" onClick={() => void confirmDescription()} disabled={descriptionBusy} className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg bg-indigo-700 px-3 py-2 text-[10px] font-black text-white disabled:opacity-50">{descriptionBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}Confirm description</button></div>{descriptionMessage && <p role="status" className="mt-2 text-[10px] font-bold text-emerald-800">{descriptionMessage}</p>}{descriptionError && <p role="alert" className="mt-2 text-[10px] font-bold text-rose-700">{descriptionError}</p>}</section> : null;
  const authoritativeLinkedExpenseId = linkedExpense?.id || invoice.linkedExpenseId;
  const expenseSurface = <SupplierInvoiceExpenseSurface invoice={invoice} linkedExpenseId={authoritativeLinkedExpenseId} linkedExpense={linkedExpense} authorityConflict={authorityConflict} loading={linkedExpenseLoading} canRecordPayment={canRecordExpensePayment} canReversePayment={canReverseExpensePayment} financialFxSnapshots={financialFxSnapshots} onNavigatePath={onNavigatePath} />;

  return (
    <section className="space-y-3" data-testid="supplier-invoice-review" aria-label="Supplier invoice review">
      <div data-testid="supplier-invoice-review-bar" className={`rounded-xl border px-3 py-3 ${blockerItems.length ? "border-amber-200 bg-amber-50" : "border-emerald-200 bg-emerald-50"}`}>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 items-center gap-2"><div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${blockerItems.length ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}>{blockerItems.length ? <AlertTriangle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}</div><div className="min-w-0"><p className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-600">Review status</p><h2 className="mt-0.5 text-sm font-black text-slate-950">{blockerItems.length ? `${blockerItems.length} action${blockerItems.length === 1 ? "" : "s"} required` : onVerify ? "Ready to create Expense" : "No posting blockers"}</h2></div></div>
          <div className="flex flex-wrap justify-end gap-2">{!readOnly && onRevertToAI && <button type="button" onClick={onRevertToAI} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700"><Undo2 className="h-3.5 w-3.5" />Revert to original</button>}{onOpenCorrection && <button type="button" onClick={onOpenCorrection} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700"><Archive className="h-3.5 w-3.5" />Invoice actions</button>}{invoice.reviewStatus === "VERIFIED" && onReopen && allowReopen && <button type="button" onClick={() => void handleReopen()} disabled={reopenBusy} className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-white px-3 py-2 text-xs font-black text-emerald-800 disabled:opacity-50">{reopenBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Undo2 className="h-3.5 w-3.5" />}{fixRequired ? "Fix invoice" : "Reopen for review"}</button>}{invoice.reviewStatus === "VERIFIED" && onReopen && !allowReopen && <span className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-[10px] font-black text-indigo-800">Linked Expense is authoritative; use Expense correction</span>}{invoice.reviewStatus === "VERIFIED" ? <span className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-white px-3 py-2 text-[10px] font-black text-emerald-800"><ShieldCheck className="h-3.5 w-3.5" />Verified {formatDateTime(invoice.verifiedAt)}</span> : onVerify && <button type="button" onClick={onVerify} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-2 text-xs font-black text-white hover:bg-emerald-800"><ShieldCheck className="h-3.5 w-3.5" />{verifyLabel}</button>}</div>
        </div>
        {reopenError && <p role="alert" className="mt-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[10px] font-bold text-rose-800">{reopenError}</p>}
        {(repairMode || reopenedNotice) && !readOnly && <p role="status" className="mt-2 inline-flex rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-[10px] font-black text-indigo-900">Editing correction · reopened for correction</p>}
      </div>

      <SupplierInvoiceWorksheet invoice={invoice} readOnly={readOnly} onUpdateInvoice={onUpdateInvoice} />
      {blockerItems.length > 0 && <section data-testid="supplier-invoice-blocking-review" className="rounded-xl border border-amber-200 bg-amber-50/70 p-3" aria-label="Supplier invoice blocking review"><div className="flex items-start gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" /><div><h3 className="text-[10px] font-black uppercase tracking-[0.12em] text-amber-950">Blocking review items</h3><p className="mt-1 text-[10px] leading-4 text-amber-900">Resolve these facts before creating or changing the authoritative Expense.</p></div></div><div className="mt-2 grid gap-2 sm:grid-cols-2">{blockerItems.slice(0, 6).map((item) => <button type="button" key={item.id} onClick={() => readOnly ? void handleReopen() : focusField(item.field)} disabled={readOnly && (!onReopen || !allowReopen || reopenBusy)} className="rounded-lg border border-amber-200 bg-white p-3 text-left hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-60"><span className="block text-[10px] font-black text-amber-900">{item.text}</span><span className="mt-1 block text-[9px] font-bold text-amber-700">{readOnly ? "Fix invoice" : item.code === "CANONICAL_VENDOR" ? "Resolve Vendor" : item.code === "EXPENSE_DESCRIPTION" ? "Confirm description" : "Review details"}</span></button>)}</div></section>}
      {reviewNotes.length > 0 && <details data-testid="supplier-invoice-review-notes" className="rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2 text-[10px] leading-4 text-slate-600"><summary className="cursor-pointer font-bold text-slate-700">Review notes ({reviewNotes.length})</summary><ul className="mt-2 space-y-1">{reviewNotes.slice(0, 6).map((item) => <li key={item.id}>• {item.text}</li>)}</ul></details>}
      <details open={moreOpen} onToggle={(event) => setMoreOpen((event.currentTarget as HTMLDetailsElement).open)} className="rounded-lg border border-slate-200 bg-white"><summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-[10px] font-black text-slate-700 [&::-webkit-details-marker]:hidden"><span>More extracted details</span><ChevronDown className={`h-4 w-4 transition ${moreOpen ? "rotate-180" : ""}`} /></summary><div className="grid gap-3 border-t border-slate-100 p-3 text-xs sm:grid-cols-2"><div><p className="text-[10px] font-black uppercase text-slate-500">Extraction diagnostics</p><p className="mt-1">Model: {invoice.modelUsed || "Unknown"}</p><p className="text-slate-500">Confidence: {invoice.confidenceScore === undefined ? "Not supplied" : `${Math.round(invoice.confidenceScore)}%`}</p><p className="text-slate-500">Source: {invoice.fileName || invoice.sourceType || "Unknown"}</p></div><div><p className="text-[10px] font-black uppercase text-slate-500">Monetary basis</p><p className="mt-1">Lines: {invoice.financialSemantics?.lineTotalBasis || "UNKNOWN"}</p><p className="text-slate-500">Subtotal: {invoice.financialSemantics?.subtotalBasis || "UNKNOWN"}</p><p className="text-slate-500">Tax: {invoice.financialSemantics?.taxInclusion || "UNKNOWN"}</p></div><div className="sm:col-span-2"><p className="text-[10px] font-black uppercase text-slate-500">PH metadata</p><p className="mt-1 whitespace-pre-wrap text-slate-600">{invoice.philippineTaxDetails ? JSON.stringify(invoice.philippineTaxDetails, null, 2) : "No additional tax metadata extracted."}</p></div></div></details>
      {vendorResolution}
      {descriptionResolution}
      {expenseSurface}

      {invoice.sourceType === "EMAIL" && <p className="flex items-center gap-1.5 px-1 text-[10px] text-indigo-700"><Mail className="h-3.5 w-3.5" />Source email preserved: {invoice.sourceMetadata?.subject || invoice.sourceMetadata?.sender || "Email Intake"}</p>}
      {vendors.length === 0 && invoice.entityResolution?.matchedEntityId && <p className="px-1 text-[10px] text-slate-500">Vendor link is preserved in the source record; the current vendor directory is unavailable.</p>}
    </section>
  );
};

export default SupplierInvoiceReview;
