import React, { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  ClipboardList,
  Coins,
  FileDown,
  FilePlus2,
  History,
  Lock,
  Pencil,
  Plus,
  RotateCcw,
  Send,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import type { Project } from "../../types.ts";
import {
  calculateClientBillingSummary,
  clientBillingTotal,
  isClientBillingProjectStatusAllowed,
  type ClientBilling,
  type ClientBillingEvent,
  type ClientBillingInput,
  type ClientBillingLineInput,
  type ClientBillingStatus,
} from "../../lib/clientBilling.ts";
import {
  calculateClientCollectionSummary,
  clientCollectionTotal,
  billingCollectedAmount,
  billingOutstandingAmount,
  isClientCollectionProjectStatusAllowed,
  type ClientCollection,
  type ClientCollectionAllocationInput,
  type ClientCollectionEvent,
  type ClientCollectionInput,
  type ClientCollectionStatus,
} from "../../lib/clientCollections.ts";
import type { CashBankingWorkspaceData, FinancialTransaction, FinancialTransactionMatch } from "../../lib/cashBanking.ts";
import type { AppNavigate } from "../../utils/clientNavigation.ts";
import { ClientCollectionSettlementPanel } from "./ClientCollectionSettlementPanel.tsx";
import { StatusBadge, type StatusTone } from "../ui/OperationsUI.tsx";
import { DocumentPreviewModal } from "../DocumentPreviewModal.tsx";
import { buildClientInvoiceDocumentSnapshot } from "../../lib/documentGeneration.ts";
import { DEFAULT_COMPANY_DOCUMENT_PROFILE } from "../../lib/companyDocumentProfile.ts";
import { isClassifiedProjectTaxTreatment, projectTaxTreatmentLabel } from "../../utils/projectTaxTreatment.ts";

interface ClientBillingPanelProps {
  project: Project;
  billings: readonly ClientBilling[];
  events: readonly ClientBillingEvent[];
  collections?: readonly ClientCollection[];
  collectionEvents?: readonly ClientCollectionEvent[];
  loading?: boolean;
  canManage?: boolean;
  onSave: (input: ClientBillingInput, lines: readonly ClientBillingLineInput[]) => Promise<void> | void;
  onTransition: (id: string, targetStatus: ClientBillingStatus, reason?: string) => Promise<void> | void;
  onSaveCollection?: (input: ClientCollectionInput, allocations: readonly ClientCollectionAllocationInput[]) => Promise<void> | void;
  onRecordCollection?: (id: string) => Promise<void> | void;
  onReverseCollection?: (id: string, reason: string) => Promise<void> | void;
  cashData?: CashBankingWorkspaceData;
  canReconcileCash?: boolean;
  canSettleClientCollection?: boolean;
  onSaveFinancialMatch?: (match: FinancialTransactionMatch, transaction: FinancialTransaction) => Promise<void> | void;
  onReverseFinancialMatch?: (matchId: string, reason: string) => Promise<void> | void;
  canReverseFinancialMatch?: (match: FinancialTransactionMatch) => boolean;
  onNavigatePath?: AppNavigate;
}

function money(value: number | undefined, currency: string) {
  if (value === undefined || !Number.isFinite(value)) return "Unavailable";
  try {
    return new Intl.NumberFormat("en-PH", { style: "currency", currency, maximumFractionDigits: 2 }).format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
}

function billingStatusTone(status: ClientBillingStatus): StatusTone {
  return status === "ISSUED" ? "success" : status === "VOIDED" || status === "CANCELLED" ? "neutral" : status === "SUBMITTED" ? "warning" : "info";
}

function collectionStatusTone(status: ClientCollectionStatus): StatusTone {
  return status === "RECORDED" ? "success" : status === "REVERSED" ? "neutral" : "info";
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function nextBillingNumber(project: Project, count: number) {
  return `PB-${project.projectCode || "PROJECT"}-${String(count + 1).padStart(3, "0")}`.toUpperCase();
}

function nextCollectionNumber(project: Project, count: number) {
  return `COL-${project.projectCode || "PROJECT"}-${String(count + 1).padStart(3, "0")}`.toUpperCase();
}

function emptyLine(): ClientBillingLineInput {
  return { description: "", amount: 0 };
}

function formFromBilling(billing: ClientBilling): { input: ClientBillingInput; lines: ClientBillingLineInput[] } {
  return {
    input: {
      id: billing.id,
      projectId: billing.projectId,
      billingNumber: billing.billingNumber,
      billingDate: billing.billingDate,
      dueDate: billing.dueDate,
      paymentTerms: billing.paymentTerms,
      periodStart: billing.periodStart,
      periodEnd: billing.periodEnd,
      clientNameSnapshot: billing.clientNameSnapshot,
      clientReferenceSnapshot: billing.clientReferenceSnapshot,
      billingContactName: billing.billingContactName,
      billingEmail: billing.billingEmail,
      billingAddress: billing.billingAddress,
      currency: billing.currency,
      taxTreatment: billing.taxTreatment,
      notes: billing.notes,
    },
    lines: billing.lines.map((line) => ({ description: line.description, amount: line.amount, notes: line.notes })),
  };
}

export const ClientBillingPanel: React.FC<ClientBillingPanelProps> = ({
  project,
  billings,
  events,
  collections = [],
  collectionEvents = [],
  loading = false,
  canManage = false,
  onSave,
  onTransition,
  onSaveCollection,
  onRecordCollection,
  onReverseCollection,
  cashData,
  canReconcileCash = false,
  canSettleClientCollection = false,
  onSaveFinancialMatch,
  onReverseFinancialMatch,
  canReverseFinancialMatch,
  onNavigatePath,
}) => {
  const [activeTab, setActiveTab] = useState<"billings" | "collections">("billings");

  // Billings state
  const projectBillings = useMemo(() => billings.filter((billing) => billing.projectId === project.id), [billings, project.id]);
  const projectEvents = useMemo(() => events.filter((event) => projectBillings.some((billing) => billing.id === event.billingId)), [events, projectBillings]);
  const billingSummary = useMemo(() => calculateClientBillingSummary(project, projectBillings), [project, projectBillings]);
  const [selectedBillingId, setSelectedBillingId] = useState<string | null>(projectBillings[0]?.id || null);
  const [editingBilling, setEditingBilling] = useState(false);
  const [billingForm, setBillingForm] = useState<ClientBillingInput>(() => ({
    projectId: project.id,
    billingNumber: nextBillingNumber(project, projectBillings.length),
    billingDate: today(),
    dueDate: undefined,
    paymentTerms: "",
    clientNameSnapshot: project.clientName,
    clientReferenceSnapshot: project.clientReference,
    billingContactName: project.billingContactName,
    billingEmail: project.billingEmail,
    billingAddress: project.billingAddress,
    currency: project.currency,
    taxTreatment: project.taxTreatment,
  }));
  const [billingLines, setBillingLines] = useState<ClientBillingLineInput[]>([emptyLine()]);

  // Collections state
  const projectCollections = useMemo(() => collections.filter((c) => c.projectId === project.id), [collections, project.id]);
  const projectCollectionEvents = useMemo(() => collectionEvents.filter((event) => projectCollections.some((c) => c.id === event.collectionId)), [collectionEvents, projectCollections]);
  const collectionSummary = useMemo(() => calculateClientCollectionSummary(project, projectBillings, projectCollections), [project, projectBillings, projectCollections]);
  const [selectedCollectionId, setSelectedCollectionId] = useState<string | null>(projectCollections[0]?.id || null);
  const [editingCollection, setEditingCollection] = useState(false);
  const [collectionForm, setCollectionForm] = useState<ClientCollectionInput>(() => ({
    projectId: project.id,
    collectionNumber: nextCollectionNumber(project, projectCollections.length),
    collectionDate: today(),
    payerSnapshot: project.clientName,
    currency: project.currency,
  }));
  const [collectionAllocations, setCollectionAllocations] = useState<Record<string, number>>({});
  const [reversalReason, setReversalReason] = useState("");
  const [reversingCollectionId, setReversingCollectionId] = useState<string | null>(null);
  const [previewBilling, setPreviewBilling] = useState<ClientBilling | null>(null);

  // General state
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedBilling = projectBillings.find((billing) => billing.id === selectedBillingId) || projectBillings[0];
  const selectedCollection = projectCollections.find((c) => c.id === selectedCollectionId) || projectCollections[0];

  const issuedBillings = useMemo(() => projectBillings.filter((b) => b.status === "ISSUED"), [projectBillings]);

  useEffect(() => {
    if (selectedBillingId && projectBillings.some((billing) => billing.id === selectedBillingId)) return;
    setSelectedBillingId(projectBillings[0]?.id || null);
  }, [projectBillings, selectedBillingId]);

  useEffect(() => {
    if (selectedCollectionId && projectCollections.some((c) => c.id === selectedCollectionId)) return;
    setSelectedCollectionId(projectCollections[0]?.id || null);
  }, [projectCollections, selectedCollectionId]);

  // Commercial metric cards
  const metricCards: Array<[string, number | undefined, string]> = [
    ["Contract Value", billingSummary.contractValue, "Client contract value"],
    ["Billed to Date", billingSummary.billedToDate, "ISSUED billings only"],
    ["Collected to Date", collectionSummary.collectedToDate, "RECORDED collections"],
    ["Outstanding Billed Amount", collectionSummary.outstandingBilledAmount, "Billed less collected"],
    ["Remaining to Bill", billingSummary.remainingToBill, "Contract less billed"],
  ];

  // Billing Actions
  const startCreateBilling = () => {
    setError(null);
    setBillingForm({
      projectId: project.id,
      billingNumber: nextBillingNumber(project, projectBillings.length),
      billingDate: today(),
      dueDate: undefined,
      paymentTerms: "",
      clientNameSnapshot: project.clientName,
      clientReferenceSnapshot: project.clientReference,
      billingContactName: project.billingContactName,
      billingEmail: project.billingEmail,
      billingAddress: project.billingAddress,
      currency: project.currency,
      taxTreatment: project.taxTreatment,
    });
    setBillingLines([emptyLine()]);
    setEditingBilling(true);
    setSelectedBillingId(null);
  };

  const startEditBilling = (billing: ClientBilling) => {
    const next = formFromBilling(billing);
    setError(null);
    setBillingForm(next.input);
    setBillingLines(next.lines.length ? next.lines : [emptyLine()]);
    setSelectedBillingId(billing.id);
    setEditingBilling(true);
  };

  const saveDraftBilling = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!billingForm.billingNumber?.trim()) { setError("Billing number is required."); return; }
    if (!billingLines.length || billingLines.some((line) => !line.description.trim())) { setError("Every billing line needs a description."); return; }
    if (billingLines.some((line) => !Number.isFinite(Number(line.amount)) || Number(line.amount) < 0)) { setError("Billing line amounts must be zero or greater."); return; }
    setBusy(true);
    setError(null);
    try {
      await onSave({ ...billingForm, projectId: project.id, currency: project.currency, taxTreatment: project.taxTreatment }, billingLines.map((line) => ({ ...line, description: line.description.trim(), amount: Number(line.amount) || 0 })));
      setEditingBilling(false);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    } finally {
      setBusy(false);
    }
  };

  const transitionBilling = async (billing: ClientBilling, target: ClientBillingStatus) => {
    if (busy) return;
    let reason: string | undefined;
    if (target === "DRAFT" || target === "CANCELLED" || target === "VOIDED") {
      reason = typeof window !== "undefined" ? window.prompt(target === "VOIDED" ? "Reason for voiding this issued client billing:" : target === "CANCELLED" ? "Reason for cancelling this client billing:" : "Reason for returning this billing to draft:") || undefined : undefined;
      if (!reason?.trim()) return;
    } else if (target === "ISSUED") {
      if (!isClassifiedProjectTaxTreatment(project.taxTreatment)) {
        setError("Confirm the project VAT or Non-VAT classification before issuing a client invoice.");
        return;
      }
      const confirmed = typeof window === "undefined" || window.confirm("Issue this client billing? Only issued billings contribute to Billed to Date, and the database will recheck the project contract ceiling.");
      if (!confirmed) return;
    } else if (target === "SUBMITTED") {
      const confirmed = typeof window === "undefined" || window.confirm("Submit this billing for issue review?");
      if (!confirmed) return;
    }
    setBusy(true);
    setError(null);
    try {
      await onTransition(billing.id, target, reason);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    } finally {
      setBusy(false);
    }
  };

  // Collection Actions
  const startCreateCollection = () => {
    setError(null);
    setCollectionForm({
      projectId: project.id,
      collectionNumber: nextCollectionNumber(project, projectCollections.length),
      collectionDate: today(),
      payerSnapshot: project.clientName,
      currency: project.currency,
    });
    // Pre-populate allocations with 0
    const initialAlloc: Record<string, number> = {};
    for (const b of issuedBillings) {
      const outstanding = billingOutstandingAmount(b, projectCollections);
      if (outstanding > 0) {
        initialAlloc[b.id] = 0;
      }
    }
    setCollectionAllocations(initialAlloc);
    setEditingCollection(true);
    setSelectedCollectionId(null);
  };

  const startEditCollection = (collection: ClientCollection) => {
    setError(null);
    setCollectionForm({
      id: collection.id,
      projectId: collection.projectId,
      collectionNumber: collection.collectionNumber,
      collectionDate: collection.collectionDate,
      externalReference: collection.externalReference,
      payerSnapshot: collection.payerSnapshot,
      currency: collection.currency,
      notes: collection.notes,
    });
    const currentAlloc: Record<string, number> = {};
    for (const alloc of collection.allocations) {
      currentAlloc[alloc.billingId] = alloc.amount;
    }
    for (const b of issuedBillings) {
      if (currentAlloc[b.id] === undefined) {
        currentAlloc[b.id] = 0;
      }
    }
    setCollectionAllocations(currentAlloc);
    setSelectedCollectionId(collection.id);
    setEditingCollection(true);
  };

  const saveDraftCollection = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!onSaveCollection) return;
    if (!collectionForm.collectionNumber?.trim()) { setError("Collection number is required."); return; }
    if (!collectionForm.collectionDate) { setError("Collection date is required."); return; }

    const allocEntries = Object.entries(collectionAllocations).filter(([_, amount]) => Number(amount) > 0);
    if (!allocEntries.length) {
      setError("At least one positive billing allocation is required.");
      return;
    }

    // Check individual over-collection
    for (const [billingId, amount] of allocEntries) {
      const b = issuedBillings.find((item) => item.id === billingId);
      if (!b) {
        setError("Allocated billing is not found or not in ISSUED status.");
        return;
      }
      const outstanding = billingOutstandingAmount(b, projectCollections, collectionForm.id);
      if (Number(amount) > outstanding + 0.0001) {
        setError(`Allocation of ${money(Number(amount), project.currency)} exceeds outstanding amount of ${money(outstanding, project.currency)} for billing ${b.billingNumber}.`);
        return;
      }
    }

    setBusy(true);
    setError(null);
    try {
      const allocationsInput: ClientCollectionAllocationInput[] = allocEntries.map(([billingId, amount]) => ({
        billingId,
        amount: Number(amount),
      }));
      await onSaveCollection({ ...collectionForm, projectId: project.id, currency: project.currency }, allocationsInput);
      setEditingCollection(false);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    } finally {
      setBusy(false);
    }
  };

  const recordCollection = async (collection: ClientCollection) => {
    if (!onRecordCollection || busy) return;
    const confirmed = typeof window === "undefined" || window.confirm(`Record collection ${collection.collectionNumber} for ${money(clientCollectionTotal(collection), collection.currency)}? This finalizes the receipt, marks the terms immutable, and locks the billing amounts.`);
    if (!confirmed) return;
    setBusy(true);
    setError(null);
    try {
      await onRecordCollection(collection.id);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    } finally {
      setBusy(false);
    }
  };

  const reverseCollection = async (collectionId: string) => {
    if (!onReverseCollection || busy) return;
    const reason = reversalReason.trim();
    if (reason.length < 3) {
      setError("Reversal reason must be at least 3 characters.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onReverseCollection(collectionId, reason);
      setReversingCollectionId(null);
      setReversalReason("");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    } finally {
      setBusy(false);
    }
  };

  // Editor views
  if (editingBilling) {
    return (
      <section aria-labelledby="client-billing-editor-heading" className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-indigo-600">Client invoice</p>
            <h2 id="client-billing-editor-heading" className="mt-1 text-xl font-black text-slate-950">{billingForm.id ? "Edit client invoice draft" : "Create client invoice draft"}</h2>
            <p className="mt-1 text-xs text-slate-500">Revenue-side project history only. Saving a draft does not issue an invoice, change project cost, or create cash activity.</p>
          </div>
          <Button variant="secondary" label="Cancel" onClick={() => setEditingBilling(false)} />
        </div>
        <form onSubmit={saveDraftBilling} className="space-y-4">
          <Card className="p-5 shadow-sm" elevation="low">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <label className="space-y-1"><span className="field-label">Invoice number</span><input className="field-input" value={billingForm.billingNumber || ""} onChange={(event) => setBillingForm((current) => ({ ...current, billingNumber: event.target.value }))} required /></label>
              <label className="space-y-1"><span className="field-label">Invoice date</span><input className="field-input" type="date" value={billingForm.billingDate || ""} onChange={(event) => setBillingForm((current) => ({ ...current, billingDate: event.target.value }))} required /></label>
              <label className="space-y-1"><span className="field-label">Due date</span><input className="field-input" type="date" value={billingForm.dueDate || ""} onChange={(event) => setBillingForm((current) => ({ ...current, dueDate: event.target.value || undefined }))} /></label>
              <label className="space-y-1"><span className="field-label">Payment terms</span><input className="field-input" value={billingForm.paymentTerms || ""} onChange={(event) => setBillingForm((current) => ({ ...current, paymentTerms: event.target.value || undefined }))} placeholder="e.g. Due on receipt" /></label>
              <label className="space-y-1"><span className="field-label">Period start</span><input className="field-input" type="date" value={billingForm.periodStart || ""} onChange={(event) => setBillingForm((current) => ({ ...current, periodStart: event.target.value || undefined }))} /></label>
              <label className="space-y-1"><span className="field-label">Period end</span><input className="field-input" type="date" value={billingForm.periodEnd || ""} onChange={(event) => setBillingForm((current) => ({ ...current, periodEnd: event.target.value || undefined }))} /></label>
              <label className="space-y-1 sm:col-span-2"><span className="field-label">Client snapshot</span><input className="field-input bg-slate-50" value={billingForm.clientNameSnapshot || ""} onChange={(event) => setBillingForm((current) => ({ ...current, clientNameSnapshot: event.target.value }))} placeholder={project.clientName || "Client not set"} /></label>
              <label className="space-y-1 sm:col-span-2"><span className="field-label">Client reference</span><input className="field-input" value={billingForm.clientReferenceSnapshot || ""} onChange={(event) => setBillingForm((current) => ({ ...current, clientReferenceSnapshot: event.target.value || undefined }))} /></label>
              <label className="space-y-1"><span className="field-label">Project tax treatment</span><input className="field-input bg-slate-50 text-slate-600" value={projectTaxTreatmentLabel(project.taxTreatment)} readOnly aria-describedby="client-invoice-tax-note" /></label>
              <label className="space-y-1"><span className="field-label">Billing contact</span><input className="field-input" value={billingForm.billingContactName || ""} onChange={(event) => setBillingForm((current) => ({ ...current, billingContactName: event.target.value || undefined }))} placeholder={project.billingContactName || "Contact name"} /></label>
              <label className="space-y-1"><span className="field-label">Billing email</span><input type="email" className="field-input" value={billingForm.billingEmail || ""} onChange={(event) => setBillingForm((current) => ({ ...current, billingEmail: event.target.value || undefined }))} placeholder={project.billingEmail || "billing@example.com"} /></label>
              <label className="space-y-1 sm:col-span-4"><span className="field-label">Billing address</span><textarea className="field-input min-h-16" value={billingForm.billingAddress || ""} onChange={(event) => setBillingForm((current) => ({ ...current, billingAddress: event.target.value || undefined }))} placeholder={project.billingAddress || project.siteAddress || "Client billing address"} /></label>
              <label className="space-y-1 sm:col-span-4"><span className="field-label">Notes</span><textarea className="field-input min-h-20" value={billingForm.notes || ""} onChange={(event) => setBillingForm((current) => ({ ...current, notes: event.target.value || undefined }))} /></label>
            </div>
            <p id="client-invoice-tax-note" className="mt-3 text-[10px] leading-4 text-slate-500">Inherited from the project. This records VAT vs Non-VAT context only; no VAT rate or inclusive/exclusive treatment is inferred.</p>
          </Card>
          <Card className="overflow-hidden p-0 shadow-sm" elevation="low">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-5">
              <div><h3 className="text-sm font-black">Billing lines</h3><p className="mt-1 text-[10px] text-slate-500">Line values are the source of the billing total.</p></div>
              <button type="button" className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-bold text-indigo-700" onClick={() => setBillingLines((current) => [...current, emptyLine()])}><Plus className="h-3.5 w-3.5" /> Add line</button>
            </div>
            <div className="divide-y divide-slate-100">
              {billingLines.map((line, index) => (
                <div key={index} className="grid gap-2 p-4 sm:grid-cols-[minmax(0,1fr)_170px_40px] sm:items-end">
                  <label className="space-y-1"><span className="field-label">Description {index + 1}</span><input className="field-input" value={line.description} onChange={(event) => setBillingLines((current) => current.map((candidate, lineIndex) => lineIndex === index ? { ...candidate, description: event.target.value } : candidate))} required /></label>
                  <label className="space-y-1"><span className="field-label">Amount ({project.currency})</span><input className="field-input text-right" type="number" min="0" step="0.01" value={line.amount} onChange={(event) => setBillingLines((current) => current.map((candidate, lineIndex) => lineIndex === index ? { ...candidate, amount: Number(event.target.value) || 0 } : candidate))} required /></label>
                  <button type="button" aria-label={`Remove billing line ${index + 1}`} className="inline-flex h-10 items-center justify-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-40" disabled={billingLines.length === 1} onClick={() => setBillingLines((current) => current.filter((_, lineIndex) => lineIndex !== index))}><Trash2 className="h-4 w-4" /></button>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-5 py-4">
              <span className="text-xs font-bold text-slate-600">Current billing total</span>
              <span className="text-lg font-black tabular-nums text-slate-950">{money(clientBillingTotal({ lines: billingLines.map((line) => ({ amount: Number(line.amount) || 0 })) }), project.currency)}</span>
            </div>
          </Card>
          {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-800">{error}</div>}
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button variant="secondary" label="Cancel" onClick={() => setEditingBilling(false)} />
            <button type="submit" disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2.5 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-60"><FilePlus2 className="h-3.5 w-3.5" />{busy ? "Saving…" : "Save draft"}</button>
          </div>
        </form>
      </section>
    );
  }

  if (editingCollection) {
    const totalAllocated = Object.values(collectionAllocations).reduce((sum, val) => sum + (Number(val) || 0), 0);
    return (
      <section aria-labelledby="client-collection-editor-heading" className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-600">Client collections & receivables</p>
            <h2 id="client-collection-editor-heading" className="mt-1 text-xl font-black text-slate-950">{collectionForm.id ? "Edit collection draft" : "Record client collection draft"}</h2>
            <p className="mt-1 text-xs text-slate-500">Commercial collections allocate strictly against ISSUED client billings. Drafts do not mutate collected metrics until RECORDED.</p>
          </div>
          <Button variant="secondary" label="Cancel" onClick={() => setEditingCollection(false)} />
        </div>
        <form onSubmit={saveDraftCollection} className="space-y-4">
          <Card className="p-5 shadow-sm" elevation="low">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <label className="space-y-1"><span className="field-label">Collection number</span><input className="field-input" value={collectionForm.collectionNumber || ""} onChange={(event) => setCollectionForm((current) => ({ ...current, collectionNumber: event.target.value }))} required /></label>
              <label className="space-y-1"><span className="field-label">Collection date</span><input className="field-input" type="date" value={collectionForm.collectionDate || ""} onChange={(event) => setCollectionForm((current) => ({ ...current, collectionDate: event.target.value }))} required /></label>
              <label className="space-y-1"><span className="field-label">External reference (check # / wire ref)</span><input className="field-input" value={collectionForm.externalReference || ""} onChange={(event) => setCollectionForm((current) => ({ ...current, externalReference: event.target.value || undefined }))} placeholder="e.g. Check number or wire ref" /></label>
              <label className="space-y-1 sm:col-span-2"><span className="field-label">Payer snapshot</span><input className="field-input bg-slate-50" value={collectionForm.payerSnapshot || ""} onChange={(event) => setCollectionForm((current) => ({ ...current, payerSnapshot: event.target.value }))} placeholder={project.clientName || "Client"} /></label>
              <label className="space-y-1"><span className="field-label">Currency</span><input className="field-input bg-slate-100 text-slate-500" value={project.currency} disabled /></label>
              <label className="space-y-1 sm:col-span-4"><span className="field-label">Notes</span><textarea className="field-input min-h-20" value={collectionForm.notes || ""} onChange={(event) => setCollectionForm((current) => ({ ...current, notes: event.target.value || undefined }))} placeholder="Optional commercial collection notes..." /></label>
            </div>
          </Card>

          <Card className="overflow-hidden p-0 shadow-sm" elevation="low">
            <div className="border-b border-slate-100 p-5">
              <h3 className="text-sm font-black">Billing allocations</h3>
              <p className="mt-1 text-[10px] text-slate-500">Select and allocate collection amounts against eligible ISSUED progress billings for this project.</p>
            </div>
            {issuedBillings.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                <AlertTriangle className="mx-auto h-6 w-6 text-amber-500 mb-2" />
                There are no ISSUED client billings for this project. Collections can only allocate against ISSUED billings.
              </div>
            ) : (
              <div className="ops-scrollbar overflow-auto">
                <table className="ops-table min-w-[650px] w-full text-left text-xs">
                  <thead className="border-b border-slate-200 bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-3">Billing Number / Date</th>
                      <th className="px-4 py-3 text-right">Billed Amount</th>
                      <th className="px-4 py-3 text-right">Previously Collected</th>
                      <th className="px-4 py-3 text-right">Available Outstanding</th>
                      <th className="px-4 py-3 text-right w-44">Allocated Amount ({project.currency})</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {issuedBillings.map((b) => {
                      const billed = clientBillingTotal(b);
                      const previouslyCollected = billingCollectedAmount(b.id, projectCollections, collectionForm.id);
                      const outstanding = billingOutstandingAmount(b, projectCollections, collectionForm.id);
                      const currentAlloc = collectionAllocations[b.id] ?? 0;
                      return (
                        <tr key={b.id} className="align-middle">
                          <td className="px-4 py-3">
                            <strong className="block text-xs text-indigo-700">{b.billingNumber}</strong>
                            <span className="block text-[10px] text-slate-500">{b.billingDate}</span>
                          </td>
                          <td className="px-4 py-3 text-right font-semibold tabular-nums">{money(billed, b.currency)}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-slate-600">{money(previouslyCollected, b.currency)}</td>
                          <td className="px-4 py-3 text-right font-bold tabular-nums text-emerald-700">{money(outstanding, b.currency)}</td>
                          <td className="px-4 py-3 text-right">
                            <input
                              type="number"
                              min="0"
                              max={outstanding}
                              step="0.01"
                              className="field-input text-right font-black"
                              value={currentAlloc || ""}
                              placeholder="0.00"
                              onChange={(e) => {
                                const val = Number(e.target.value) || 0;
                                setCollectionAllocations((prev) => ({ ...prev, [b.id]: val }));
                              }}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-5 py-4">
              <span className="text-xs font-bold text-slate-600">Total collection allocation</span>
              <span className="text-lg font-black tabular-nums text-slate-950">{money(totalAllocated, project.currency)}</span>
            </div>
          </Card>

          {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-800">{error}</div>}
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button variant="secondary" label="Cancel" onClick={() => setEditingCollection(false)} />
            <button type="submit" disabled={busy || totalAllocated <= 0} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-60">
              <FilePlus2 className="h-3.5 w-3.5" />{busy ? "Saving…" : "Save collection draft"}
            </button>
          </div>
        </form>
      </section>
    );
  }

  const selectedBillingEvents = selectedBilling ? projectEvents.filter((event) => event.billingId === selectedBilling.id).sort((left, right) => right.createdAt.localeCompare(left.createdAt)) : [];
  const selectedCollectionEvents = selectedCollection ? projectCollectionEvents.filter((event) => event.collectionId === selectedCollection.id).sort((left, right) => right.createdAt.localeCompare(left.createdAt)) : [];
  const projectCanReceiveActivity = isClientBillingProjectStatusAllowed(project.status) && isClientCollectionProjectStatusAllowed(project.status);

  return (
    <section aria-labelledby="client-billing-heading" className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-indigo-600">Commercial controls</p>
          <h2 id="client-billing-heading" className="mt-1 text-xl font-black text-slate-950">Client Invoices &amp; Collections</h2>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-500">Authoritative receivables truth. Only ISSUED Client Invoices count toward Billed to Date and are eligible for client collections.</p>
          <p className="mt-2 text-[10px] font-bold text-indigo-700">Project tax treatment: {projectTaxTreatmentLabel(project.taxTreatment)} · No VAT rate or inclusive/exclusive assumption is applied.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {activeTab === "billings" && canManage && (
            <button type="button" onClick={startCreateBilling} disabled={!projectCanReceiveActivity || loading} className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2.5 text-xs font-bold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-50">
              <Plus className="h-3.5 w-3.5" /> New client invoice draft
            </button>
          )}
          {activeTab === "collections" && canManage && (
            <button type="button" onClick={startCreateCollection} disabled={!projectCanReceiveActivity || loading || issuedBillings.length === 0} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2.5 text-xs font-bold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-50">
              <Coins className="h-3.5 w-3.5" /> Record collection
            </button>
          )}
        </div>
      </div>

      {/* Commercial 5-Card Metrics Grid */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {metricCards.map(([label, value, subtitle]) => (
          <Card key={label} className="p-4 shadow-sm" elevation="low">
            <p className="text-[10px] font-semibold text-slate-500">{label}</p>
            <p className="mt-1 text-base font-black tabular-nums text-slate-950">{money(value, billingSummary.currency)}</p>
            <p className="mt-1 text-[9px] text-slate-400">{subtitle}</p>
          </Card>
        ))}
      </div>

      {/* Warnings & Boundary Notices */}
      {billingSummary.hasCurrencyMismatch && (
        <div role="status" className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{billingSummary.reason}
        </div>
      )}
      {!projectCanReceiveActivity && (
        <div role="status" className="flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-700">
          <Lock className="mt-0.5 h-4 w-4 shrink-0" />Commercial billing and collection records can be created or transitioned only while the project is PLANNING, ACTIVE, ON_HOLD, or COMPLETED. This project is {project.status}.
        </div>
      )}
      {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-800">{error}</div>}

      {/* Sub-navigation Tabs */}
      <div className="flex border-b border-slate-200">
        <button
          type="button"
          onClick={() => setActiveTab("billings")}
          className={`border-b-2 px-4 py-2 text-xs font-bold transition-colors ${activeTab === "billings" ? "border-indigo-600 text-indigo-700" : "border-transparent text-slate-500 hover:text-slate-900"}`}
        >
          Client Invoices ({projectBillings.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("collections")}
          className={`border-b-2 px-4 py-2 text-xs font-bold transition-colors ${activeTab === "collections" ? "border-emerald-600 text-emerald-700" : "border-transparent text-slate-500 hover:text-slate-900"}`}
        >
          Collections / Receivables ({projectCollections.length})
        </button>
      </div>

      {/* Active Tab Content */}
      {activeTab === "billings" ? (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(340px,0.8fr)]">
          <Card className="overflow-hidden p-0 shadow-sm" elevation="low">
            <div className="flex items-center justify-between border-b border-slate-100 p-5">
              <div>
                <h3 className="text-sm font-black">Client invoice register</h3>
                <p className="mt-1 text-[10px] text-slate-500">{loading ? "Refreshing project billing history…" : `${projectBillings.length} billing record${projectBillings.length === 1 ? "" : "s"}`}</p>
              </div>
              <ClipboardList className="h-4 w-4 text-indigo-500" />
            </div>
            {loading ? (
              <div role="status" className="p-10 text-center text-xs font-semibold text-slate-500">Loading client billing…</div>
            ) : projectBillings.length ? (
              <div className="ops-scrollbar overflow-auto">
                <table className="ops-table min-w-[680px] w-full text-left text-xs">
                  <caption className="sr-only">Client invoice register</caption>
                  <thead className="border-b border-slate-200 bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-3">Number / period</th>
                      <th className="px-4 py-3">Client reference</th>
                      <th className="px-4 py-3 text-right">Current amount</th>
                      <th className="px-4 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {projectBillings.map((billing) => (
                      <tr key={billing.id} className={`cursor-pointer align-top hover:bg-indigo-50/40 ${selectedBilling?.id === billing.id ? "bg-indigo-50/70" : ""}`} onClick={() => setSelectedBillingId(billing.id)}>
                        <td className="px-4 py-3">
                          <button type="button" className="text-left">
                            <strong className="block text-xs text-indigo-700">{billing.billingNumber}</strong>
                            <span className="mt-1 block text-[10px] text-slate-500">{billing.billingDate}{billing.periodStart || billing.periodEnd ? ` · ${billing.periodStart || "?"} – ${billing.periodEnd || "?"}` : ""} · {projectTaxTreatmentLabel(billing.taxTreatment || project.taxTreatment)}</span>
                          </button>
                        </td>
                        <td className="max-w-[180px] px-4 py-3">
                          <span className="block truncate text-[10px] font-semibold text-slate-700">{billing.clientReferenceSnapshot || "No client reference"}</span>
                          <span className="mt-1 block truncate text-[10px] text-slate-500">{billing.clientNameSnapshot || project.clientName || "Client not set"}</span>
                        </td>
                        <td className="px-4 py-3 text-right font-black tabular-nums">{money(clientBillingTotal(billing), billing.currency)}</td>
                        <td className="px-4 py-3"><StatusBadge tone={billingStatusTone(billing.status)}>{billing.status}</StatusBadge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-10 text-center">
                <ClipboardList className="mx-auto h-8 w-8 text-slate-300" />
                <p className="mt-3 text-sm font-bold text-slate-700">No client billing history yet.</p>
                <p className="mt-1 text-xs text-slate-500">Create a draft to start the project billing register. Drafts do not inflate Billed to Date.</p>
              </div>
            )}
          </Card>

          <Card className="p-5 shadow-sm" elevation="low">
            {selectedBilling ? (
              <>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.16em] text-indigo-600">Client invoice detail</p>
                    <h3 className="mt-1 text-base font-black text-slate-950">{selectedBilling.billingNumber}</h3>
                    <p className="mt-1 text-[10px] text-slate-500">{selectedBilling.clientNameSnapshot || project.clientName || "Client snapshot not set"} · {selectedBilling.billingDate} · {projectTaxTreatmentLabel(selectedBilling.taxTreatment || project.taxTreatment)}</p>
                  </div>
                  <StatusBadge tone={billingStatusTone(selectedBilling.status)}>{selectedBilling.status}</StatusBadge>
                </div>
                <div className="mt-4 divide-y divide-slate-100 rounded-xl border border-slate-100">
                  {selectedBilling.lines.length ? selectedBilling.lines.map((line) => (
                    <div key={line.id} className="flex items-start justify-between gap-3 px-3 py-3">
                      <span className="text-xs leading-5 text-slate-700">{line.description}</span>
                      <span className="shrink-0 text-xs font-black tabular-nums">{money(line.amount, selectedBilling.currency)}</span>
                    </div>
                  )) : <div className="px-3 py-4 text-xs text-slate-500">No lines recorded.</div>}
                  <div className="flex items-center justify-between gap-3 bg-slate-50 px-3 py-3">
                    <span className="text-xs font-bold text-slate-600">Current billing amount</span>
                    <span className="text-base font-black tabular-nums">{money(clientBillingTotal(selectedBilling), selectedBilling.currency)}</span>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button type="button" onClick={() => setPreviewBilling(selectedBilling)} className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-2 text-[10px] font-bold text-indigo-700"><FileDown className="h-3 w-3" /> Preview / generate Client Invoice</button>
                </div>
                {canManage && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {selectedBilling.status === "DRAFT" && (
                      <>
                        <button type="button" onClick={() => startEditBilling(selectedBilling)} disabled={busy} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-2 text-[10px] font-bold text-slate-700"><Pencil className="h-3 w-3" /> Edit draft</button>
                        <button type="button" onClick={() => void transitionBilling(selectedBilling, "SUBMITTED")} disabled={busy} className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-2.5 py-2 text-[10px] font-bold text-white"><Send className="h-3 w-3" /> Submit</button>
                        <button type="button" onClick={() => void transitionBilling(selectedBilling, "CANCELLED")} disabled={busy} className="inline-flex items-center gap-1 rounded-lg border border-rose-200 px-2.5 py-2 text-[10px] font-bold text-rose-700"><Ban className="h-3 w-3" /> Cancel</button>
                      </>
                    )}
                    {selectedBilling.status === "SUBMITTED" && (
                      <>
                        <button type="button" onClick={() => void transitionBilling(selectedBilling, "DRAFT")} disabled={busy} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-2 text-[10px] font-bold text-slate-700"><Pencil className="h-3 w-3" /> Return to draft</button>
                        <button type="button" onClick={() => void transitionBilling(selectedBilling, "ISSUED")} disabled={busy} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-2 text-[10px] font-bold text-white"><CheckCircle2 className="h-3 w-3" /> Issue Client Invoice</button>
                        <button type="button" onClick={() => void transitionBilling(selectedBilling, "CANCELLED")} disabled={busy} className="inline-flex items-center gap-1 rounded-lg border border-rose-200 px-2.5 py-2 text-[10px] font-bold text-rose-700"><Ban className="h-3 w-3" /> Cancel</button>
                      </>
                    )}
                    {selectedBilling.status === "ISSUED" && (
                      <button type="button" onClick={() => void transitionBilling(selectedBilling, "VOIDED")} disabled={busy} className="inline-flex items-center gap-1 rounded-lg border border-rose-200 px-2.5 py-2 text-[10px] font-bold text-rose-700"><Ban className="h-3 w-3" /> Void issued billing</button>
                    )}
                  </div>
                )}
                <div className="mt-5 border-t border-slate-100 pt-4">
                  <div className="flex items-center gap-2"><ShieldCheck className="h-3.5 w-3.5 text-indigo-600" /><h4 className="text-xs font-black text-slate-800">Billing history</h4></div>
                  {selectedBillingEvents.length ? (
                    <div className="mt-3 space-y-3">
                      {selectedBillingEvents.map((event) => (
                        <div key={event.id} className="flex items-start gap-2 text-[10px]">
                          <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-500" />
                          <div>
                            <p className="font-bold text-slate-700">{event.eventType.replaceAll("_", " ")}{event.fromStatus ? ` · ${event.fromStatus} → ${event.toStatus}` : ` · ${event.toStatus}`}</p>
                            <p className="mt-0.5 text-slate-500">{event.createdAt}{event.reason ? ` · ${event.reason}` : ""}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : <p className="mt-3 text-[10px] text-slate-500">No lifecycle events available.</p>}
                </div>
              </>
            ) : (
              <div className="flex min-h-[300px] items-center justify-center text-center">
                <div>
                  <ClipboardList className="mx-auto h-8 w-8 text-slate-300" />
                  <p className="mt-3 text-sm font-bold text-slate-700">Select a billing record</p>
                  <p className="mt-1 text-xs text-slate-500">Detail, lifecycle actions, and history will appear here.</p>
                </div>
              </div>
            )}
          </Card>
        </div>
      ) : (
        /* Collections Tab Content */
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(340px,0.8fr)]">
          <Card className="overflow-hidden p-0 shadow-sm" elevation="low">
            <div className="flex items-center justify-between border-b border-slate-100 p-5">
              <div>
                <h3 className="text-sm font-black">Collections register</h3>
                <p className="mt-1 text-[10px] text-slate-500">{loading ? "Refreshing client collections…" : `${projectCollections.length} collection record${projectCollections.length === 1 ? "" : "s"}`}</p>
              </div>
              <Coins className="h-4 w-4 text-emerald-500" />
            </div>
            {loading ? (
              <div role="status" className="p-10 text-center text-xs font-semibold text-slate-500">Loading client collections…</div>
            ) : projectCollections.length ? (
              <div className="ops-scrollbar overflow-auto">
                <table className="ops-table min-w-[680px] w-full text-left text-xs">
                  <caption className="sr-only">Client collections register</caption>
                  <thead className="border-b border-slate-200 bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-3">Collection / Date</th>
                      <th className="px-4 py-3">Reference</th>
                      <th className="px-4 py-3 text-right">Allocated Amount</th>
                      <th className="px-4 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {projectCollections.map((col) => (
                      <tr key={col.id} className={`cursor-pointer align-top hover:bg-emerald-50/40 ${selectedCollection?.id === col.id ? "bg-emerald-50/70" : ""}`} onClick={() => setSelectedCollectionId(col.id)}>
                        <td className="px-4 py-3">
                          <button type="button" className="text-left">
                            <strong className="block text-xs text-emerald-700">{col.collectionNumber}</strong>
                            <span className="mt-1 block text-[10px] text-slate-500">{col.collectionDate}</span>
                          </button>
                        </td>
                        <td className="max-w-[180px] px-4 py-3">
                          <span className="block truncate text-[10px] font-semibold text-slate-700">{col.externalReference || "No reference"}</span>
                        </td>
                        <td className="px-4 py-3 text-right font-black tabular-nums">{money(clientCollectionTotal(col), col.currency)}</td>
                        <td className="px-4 py-3"><StatusBadge tone={collectionStatusTone(col.status)}>{col.status}</StatusBadge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-10 text-center">
                <Coins className="mx-auto h-8 w-8 text-slate-300" />
                <p className="mt-3 text-sm font-bold text-slate-700">No client collections recorded yet.</p>
                <p className="mt-1 text-xs text-slate-500">Record a collection against an ISSUED billing to populate this register.</p>
              </div>
            )}
          </Card>

          <Card className="p-5 shadow-sm" elevation="low">
            {selectedCollection ? (
              <>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.16em] text-emerald-600">Collection detail</p>
                    <h3 className="mt-1 text-base font-black text-slate-950">{selectedCollection.collectionNumber}</h3>
                    <p className="mt-1 text-[10px] text-slate-500">{selectedCollection.payerSnapshot || project.clientName || "Payer not set"} · {selectedCollection.collectionDate}</p>
                  </div>
                  <StatusBadge tone={collectionStatusTone(selectedCollection.status)}>{selectedCollection.status}</StatusBadge>
                </div>

                <div className="mt-3 text-xs text-slate-600 space-y-1 bg-slate-50 p-3 rounded-xl">
                  {selectedCollection.externalReference && (
                    <div className="flex justify-between">
                      <span className="text-slate-500 text-[10px]">Reference:</span>
                      <span className="font-semibold text-[10px]">{selectedCollection.externalReference}</span>
                    </div>
                  )}
                  {selectedCollection.recordedAt && (
                    <div className="flex justify-between">
                      <span className="text-slate-500 text-[10px]">Recorded At:</span>
                      <span className="font-semibold text-[10px]">{selectedCollection.recordedAt}</span>
                    </div>
                  )}
                </div>

                {selectedCollection.notes && (
                  <p className="mt-2 text-[10px] text-slate-500 italic">Notes: {selectedCollection.notes}</p>
                )}

                {/* Reversal notice if reversed */}
                {selectedCollection.status === "REVERSED" && (
                  <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 space-y-1">
                    <div className="flex items-center gap-1 font-bold text-[10px] text-amber-800">
                      <RotateCcw className="h-3.5 w-3.5" /> Reversed Collection
                    </div>
                    <p className="text-[10px]"><strong>Reason:</strong> {selectedCollection.reversalReason || "No reason given"}</p>
                    {selectedCollection.reversedAt && <p className="text-[9px] text-amber-700">Reversed on {selectedCollection.reversedAt}</p>}
                  </div>
                )}

                <div className="mt-4 divide-y divide-slate-100 rounded-xl border border-slate-100">
                  <div className="bg-slate-50 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">Billing allocations</div>
                  {selectedCollection.allocations.length ? selectedCollection.allocations.map((alloc) => {
                    const matchedBilling = projectBillings.find((b) => b.id === alloc.billingId);
                    return (
                      <div key={alloc.id} className="flex items-center justify-between gap-3 px-3 py-2.5 text-xs">
                        <div>
                          <strong className="text-indigo-700 block">{matchedBilling?.billingNumber || alloc.billingId}</strong>
                          {matchedBilling && <span className="text-[10px] text-slate-400">{matchedBilling.billingDate}</span>}
                        </div>
                        <span className="font-black tabular-nums">{money(alloc.amount, selectedCollection.currency)}</span>
                      </div>
                    );
                  }) : <div className="px-3 py-3 text-xs text-slate-500">No allocations recorded.</div>}
                  <div className="flex items-center justify-between gap-3 bg-slate-50 px-3 py-3">
                    <span className="text-xs font-bold text-slate-600">Total collected amount</span>
                    <span className="text-base font-black tabular-nums text-slate-950">{money(clientCollectionTotal(selectedCollection), selectedCollection.currency)}</span>
                  </div>
                </div>

                <ClientCollectionSettlementPanel
                  collection={selectedCollection}
                  cashData={cashData}
                  canReconcileCash={canReconcileCash}
                  canSettleClientCollection={canSettleClientCollection}
                  onSaveMatch={onSaveFinancialMatch}
                  onReverseMatch={onReverseFinancialMatch}
                  canReverseMatch={canReverseFinancialMatch}
                  onNavigatePath={onNavigatePath}
                />

                {/* Action Buttons */}
                {canManage && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {selectedCollection.status === "DRAFT" && (
                      <>
                        <button type="button" onClick={() => startEditCollection(selectedCollection)} disabled={busy} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-2 text-[10px] font-bold text-slate-700">
                          <Pencil className="h-3 w-3" /> Edit draft
                        </button>
                        <button type="button" onClick={() => void recordCollection(selectedCollection)} disabled={busy} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-2 text-[10px] font-bold text-white shadow-sm">
                          <CheckCircle2 className="h-3 w-3" /> Record collection
                        </button>
                      </>
                    )}
                    {selectedCollection.status === "RECORDED" && (
                      <>
                        {reversingCollectionId === selectedCollection.id ? (
                          <div className="w-full space-y-2 rounded-xl border border-rose-200 bg-rose-50 p-3">
                            <label className="block text-[10px] font-bold text-rose-900">Reason for reversing this collection (&gt;= 3 chars):</label>
                            <input
                              type="text"
                              className="field-input text-xs"
                              placeholder="e.g. Bounced cheque, deposit reversed"
                              value={reversalReason}
                              onChange={(e) => setReversalReason(e.target.value)}
                            />
                            <div className="flex gap-2">
                              <button
                                type="button"
                                disabled={busy || reversalReason.trim().length < 3}
                                onClick={() => void reverseCollection(selectedCollection.id)}
                                className="rounded-lg bg-rose-600 px-3 py-1.5 text-[10px] font-bold text-white disabled:opacity-50"
                              >
                                Confirm reversal
                              </button>
                              <button
                                type="button"
                                onClick={() => { setReversingCollectionId(null); setReversalReason(""); }}
                                className="rounded-lg border border-slate-300 px-3 py-1.5 text-[10px] font-bold text-slate-700"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => { setReversingCollectionId(selectedCollection.id); setReversalReason(""); }}
                            disabled={busy}
                            className="inline-flex items-center gap-1 rounded-lg border border-rose-200 px-2.5 py-2 text-[10px] font-bold text-rose-700 hover:bg-rose-50"
                          >
                            <RotateCcw className="h-3 w-3" /> Reverse collection
                          </button>
                        )}
                      </>
                    )}
                  </div>
                )}

                {/* Audit History */}
                <div className="mt-5 border-t border-slate-100 pt-4">
                  <div className="flex items-center gap-2"><History className="h-3.5 w-3.5 text-emerald-600" /><h4 className="text-xs font-black text-slate-800">Collection history</h4></div>
                  {selectedCollectionEvents.length ? (
                    <div className="mt-3 space-y-3">
                      {selectedCollectionEvents.map((event) => (
                        <div key={event.id} className="flex items-start gap-2 text-[10px]">
                          <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                          <div>
                            <p className="font-bold text-slate-700">{event.eventType.replaceAll("_", " ")}{event.fromStatus ? ` · ${event.fromStatus} → ${event.toStatus}` : ` · ${event.toStatus}`}</p>
                            <p className="mt-0.5 text-slate-500">{event.createdAt}{event.reason ? ` · ${event.reason}` : ""}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : <p className="mt-3 text-[10px] text-slate-500">No lifecycle events available.</p>}
                </div>
              </>
            ) : (
              <div className="flex min-h-[300px] items-center justify-center text-center">
                <div>
                  <Coins className="mx-auto h-8 w-8 text-slate-300" />
                  <p className="mt-3 text-sm font-bold text-slate-700">Select a collection record</p>
                  <p className="mt-1 text-xs text-slate-500">Allocations, lifecycle actions, and history will appear here.</p>
                </div>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* Commercial truth boundary */}
      <div className="flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-[10px] leading-4 text-slate-600">
        <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-500" />
        <div>
          <p><strong>Commercial boundary:</strong> Only ISSUED billings count toward Billed to Date. Collections record client receipts and establish authoritative collected totals without mutating project costs, payroll, or procurement.</p>
          <p className="mt-1">Bank reconciliation and Cash Settlement linkage are handled by the P2B-6 bank-evidence workflow below; linking evidence never changes commercial collection totals or project cost.</p>
        </div>
      </div>
      {previewBilling && <DocumentPreviewModal document={buildClientInvoiceDocumentSnapshot(previewBilling, project, DEFAULT_COMPANY_DOCUMENT_PROFILE)} onClose={() => setPreviewBilling(null)} />}
    </section>
  );
};
