import React, { useEffect, useMemo, useState } from "react";
import {
  Archive,
  ArrowRight,
  Ban,
  CheckCircle2,
  CircleAlert,
  CircleDollarSign,
  ExternalLink,
  Filter,
  LockKeyhole,
  Plus,
  Receipt,
  Search,
  ShieldCheck,
  X,
} from "lucide-react";
import type { Expense, FinancialFxSnapshot, InvoiceData, Project, ProjectCostCode, PurchaseOrder, Vendor } from "../../types";
import { ExpenseForm } from "./ExpenseForm";
import { EmptyState, MetricCard, PageHeader, StatusBadge, type StatusTone } from "../ui/OperationsUI";
import { useAppPermissions, useWorkspaceDataPending } from "../../app/AppPermissionContext.tsx";
import { hasPermission, PERMISSION_KEYS } from "../../utils/accessControl.ts";
import { FinancialCorrectionDialog } from "../financial/FinancialCorrectionDialog.tsx";
import type { FinancialCorrectionAction, FinancialCorrectionPreview, FinancialCorrectionResult } from "../../lib/financialLifecycle.ts";
import type { FinancialFxSnapshotInput } from "../../lib/financialFx.ts";
import { isConfirmedSupplierExpense } from "../../utils/projectCosting.ts";
import { convertFinancialAmount, findFinancialFxSnapshot, normalizeFinancialCurrency } from "../../utils/financialCurrency.ts";
import { classifySupplierDocuments, unresolvedForeignExpenseIds, type SupplierDocumentWorkspaceRow } from "../../utils/supplierExpenseWorkspace.ts";

interface ExpensesPageProps {
  expenses: Expense[];
  projects: Project[];
  invoices?: readonly InvoiceData[];
  purchaseOrders?: readonly PurchaseOrder[];
  vendors?: readonly Vendor[];
  costCodes?: ProjectCostCode[];
  financialFxSnapshots?: readonly FinancialFxSnapshot[];
  baseCurrency?: string;
  onSaveFinancialFxSnapshot?: (input: FinancialFxSnapshotInput) => Promise<FinancialFxSnapshot | void>;
  onVerifySupplierInvoice?: (invoice: InvoiceData) => Promise<InvoiceData | void>;
  onOpenSupplierInvoiceReview?: (invoice: InvoiceData) => void;
  onUploadSupplierInvoice?: () => void;
  onSave: (expense: Expense) => void;
  onPreviewCorrection: (expense: Expense) => Promise<FinancialCorrectionPreview>;
  onApplyCorrection: (expense: Expense, action: FinancialCorrectionAction, reason?: string) => Promise<FinancialCorrectionResult>;
  initialProjectId?: string;
  initialExpenseId?: string | null;
  onInitialCorrectionConsumed?: () => void;
}

function money(value: number, currency: string) {
  try { return new Intl.NumberFormat("en-PH", { style: "currency", currency, maximumFractionDigits: 2 }).format(value || 0); }
  catch { return `${currency} ${(value || 0).toFixed(2)}`; }
}

function expenseTone(status: string): StatusTone {
  return status === "APPROVED" || status === "PAID" ? "success" : status === "VOID" ? "neutral" : "warning";
}

function supplierStateTone(state: SupplierDocumentWorkspaceRow["state"]): StatusTone {
  return state === "LINKED" ? "success" : state === "READY_TO_LINK" ? "info" : "warning";
}

function supplierStateLabel(state: SupplierDocumentWorkspaceRow["state"]) {
  return state === "LINKED" ? "Linked Expense" : state === "READY_TO_LINK" ? "Verified · Expense link required" : "Needs review";
}

function localDate() {
  return new Date().toISOString().slice(0, 10);
}

export const ExpensesPage: React.FC<ExpensesPageProps> = ({
  expenses,
  projects,
  invoices = [],
  purchaseOrders = [],
  vendors = [],
  costCodes = [],
  financialFxSnapshots = [],
  baseCurrency = "PHP",
  onSaveFinancialFxSnapshot,
  onVerifySupplierInvoice,
  onOpenSupplierInvoiceReview,
  onUploadSupplierInvoice,
  onSave,
  onPreviewCorrection,
  onApplyCorrection,
  initialProjectId,
  initialExpenseId,
  onInitialCorrectionConsumed,
}) => {
  const permissions = useAppPermissions();
  const workspaceDataPending = useWorkspaceDataPending();
  const canManage = hasPermission(permissions, PERMISSION_KEYS.expensesWrite);
  const canVerifySupplierInvoice = hasPermission(permissions, PERMISSION_KEYS.invoicesVerify);
  const canUploadSupplierInvoice = hasPermission(permissions, PERMISSION_KEYS.invoicesExtract);
  const canManageFx = hasPermission(permissions, PERMISSION_KEYS.companyManage);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("ALL");
  const [modal, setModal] = useState(false);
  const [correctionExpense, setCorrectionExpense] = useState<Expense | null>(null);
  const [correctionPreview, setCorrectionPreview] = useState<FinancialCorrectionPreview | null>(null);
  const [correctionLoading, setCorrectionLoading] = useState(false);
  const [correctionError, setCorrectionError] = useState("");
  const [correctionReason, setCorrectionReason] = useState("");
  const [linkingInvoiceId, setLinkingInvoiceId] = useState<string | null>(null);
  const [linkError, setLinkError] = useState("");
  const [fxExpense, setFxExpense] = useState<Expense | null>(null);
  const [fxRate, setFxRate] = useState("");
  const [fxRateDate, setFxRateDate] = useState(localDate);
  const [fxNote, setFxNote] = useState("");
  const [fxError, setFxError] = useState("");
  const [fxBusy, setFxBusy] = useState(false);

  const invoiceMap = useMemo(() => new Map(invoices.map((invoice) => [invoice.id, invoice])), [invoices]);
  const purchaseOrderMap = useMemo(() => new Map(purchaseOrders.map((po) => [po.id, po])), [purchaseOrders]);
  const vendorMap = useMemo(() => new Map(vendors.map((vendor) => [vendor.id, vendor])), [vendors]);
  const supplierDocuments = useMemo(() => classifySupplierDocuments(invoices, expenses), [expenses, invoices]);
  const needsReviewDocuments = useMemo(() => supplierDocuments.filter((row) => row.state === "NEEDS_REVIEW"), [supplierDocuments]);
  const readyToLinkDocuments = useMemo(() => supplierDocuments.filter((row) => row.state === "READY_TO_LINK"), [supplierDocuments]);
  const unresolvedFxExpenseIds = useMemo(() => unresolvedForeignExpenseIds(expenses, financialFxSnapshots, baseCurrency), [baseCurrency, expenses, financialFxSnapshots]);
  const unresolvedFxExpenseSet = useMemo(() => new Set(unresolvedFxExpenseIds), [unresolvedFxExpenseIds]);

  const rows = useMemo(() => expenses.filter((expense) => {
    const q = query.toLowerCase().trim();
    const project = projects.find((item) => item.id === expense.projectId);
    const invoice = expense.supplierInvoiceId ? invoiceMap.get(expense.supplierInvoiceId) : undefined;
    const purchaseOrder = expense.purchaseOrderId ? purchaseOrderMap.get(expense.purchaseOrderId) : undefined;
    const vendor = expense.vendorId ? vendorMap.get(expense.vendorId) : undefined;
    const haystack = [expense.description, expense.category, expense.payee, expense.referenceNumber, invoice?.invoiceNumber, purchaseOrder?.poNumber, vendor?.name, project?.projectCode, project?.projectName].join(" ").toLowerCase();
    return (!q || haystack.includes(q)) && (status === "ALL" || expense.status === status);
  }), [expenses, invoiceMap, projects, purchaseOrderMap, query, status, vendorMap]);

  const confirmedBaseCost = useMemo(() => expenses
    .filter((expense) => {
      if (expense.status === "VOID") return false;
      const linkedInvoice = expense.supplierInvoiceId ? invoiceMap.get(expense.supplierInvoiceId) : undefined;
      return isConfirmedSupplierExpense(expense, linkedInvoice);
    })
    .reduce((sum, expense) => {
      const linkedInvoice = expense.supplierInvoiceId ? invoiceMap.get(expense.supplierInvoiceId) : undefined;
      const converted = convertFinancialAmount(expense.amount, expense.currency, baseCurrency, "EXPENSE", expense.id, financialFxSnapshots)
        ?? (linkedInvoice ? convertFinancialAmount(expense.amount, linkedInvoice.currency, baseCurrency, "SUPPLIER_INVOICE", linkedInvoice.id, financialFxSnapshots) : undefined);
      return sum + (converted || 0);
    }, 0), [baseCurrency, expenses, financialFxSnapshots, invoiceMap]);

  const openCorrection = async (expense: Expense) => {
    setCorrectionExpense(expense);
    setCorrectionPreview(null);
    setCorrectionError("");
    setCorrectionReason("");
    setCorrectionLoading(true);
    try { setCorrectionPreview(await onPreviewCorrection(expense)); }
    catch (error) { setCorrectionError(error instanceof Error ? error.message : "Could not load the expense correction preview. No action was taken."); }
    finally { setCorrectionLoading(false); }
  };

  const closeCorrection = () => {
    setCorrectionExpense(null);
    setCorrectionPreview(null);
    setCorrectionError("");
    setCorrectionReason("");
  };

  const applyCorrection = async (action: FinancialCorrectionAction) => {
    if (!correctionExpense || !correctionPreview) return;
    if ((action === "VOID" || action === "ARCHIVE" || action === "RESTORE") && correctionReason.trim().length < 3) return;
    setCorrectionLoading(true);
    setCorrectionError("");
    try {
      await onApplyCorrection(correctionExpense, action, correctionReason.trim() || undefined);
      closeCorrection();
    } catch (error) { setCorrectionError(error instanceof Error ? error.message : "Could not complete the expense correction. Nothing was changed."); }
    finally { setCorrectionLoading(false); }
  };

  const linkSupplierInvoice = async (row: SupplierDocumentWorkspaceRow) => {
    if (!onVerifySupplierInvoice || !canManage || !canVerifySupplierInvoice || linkingInvoiceId) return;
    setLinkingInvoiceId(row.invoice.id);
    setLinkError("");
    try { await onVerifySupplierInvoice(row.invoice); }
    catch (error) { setLinkError(error instanceof Error ? error.message : "Could not create the linked Expense. No financial record was changed."); }
    finally { setLinkingInvoiceId(null); }
  };

  const openFxConfirmation = (expense: Expense) => {
    setFxExpense(expense);
    setFxRate("");
    setFxRateDate(expense.expenseDate || localDate());
    setFxNote("");
    setFxError("");
  };

  const closeFxConfirmation = () => {
    setFxExpense(null);
    setFxError("");
  };

  const confirmFx = async () => {
    if (!fxExpense || !onSaveFinancialFxSnapshot) return;
    const rate = Number(fxRate);
    if (!Number.isFinite(rate) || rate <= 0) { setFxError("Enter an exchange rate greater than zero."); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fxRateDate)) { setFxError("Enter the date on which this rate was confirmed."); return; }
    setFxBusy(true);
    setFxError("");
    try {
      await onSaveFinancialFxSnapshot({
        sourceType: "EXPENSE",
        sourceId: fxExpense.id,
        sourceAmount: fxExpense.amount,
        sourceCurrency: fxExpense.currency,
        baseCurrency,
        rate,
        rateDate: fxRateDate,
        rateSource: "MANUAL",
        note: fxNote.trim() || undefined,
      });
      closeFxConfirmation();
    } catch (error) {
      setFxError(error instanceof Error ? error.message : "Could not confirm the FX rate. No financial record was changed.");
    } finally {
      setFxBusy(false);
    }
  };

  useEffect(() => {
    if (!initialExpenseId) return;
    const expense = expenses.find((item) => item.id === initialExpenseId);
    if (!expense) return;
    void openCorrection(expense);
    onInitialCorrectionConsumed?.();
  }, [initialExpenseId]);

  const correctionDialog = correctionExpense ? <FinancialCorrectionDialog entityLabel="expense" recordLabel={`${correctionExpense.category} · ${correctionExpense.description}`} preview={correctionPreview} loading={correctionLoading} error={correctionError} reason={correctionReason} onReasonChange={setCorrectionReason} onApply={(action) => void applyCorrection(action)} onClose={closeCorrection} /> : null;
  const isHydrating = workspaceDataPending && expenses.length === 0;
  const expenseResultLabel = `${rows.length} of ${expenses.length} expense${expenses.length === 1 ? "" : "s"}`;

  return <div className="space-y-5">
    <PageHeader
      eyebrow="Supplier payables and project cost"
      title="Expenses"
      description="Supplier invoices remain preserved evidence; the linked Expense is the authoritative cost and payable record. Archive changes visibility; void changes active financial cost."
      actions={canManage ? <div className="flex flex-wrap gap-2">
        {canUploadSupplierInvoice && onUploadSupplierInvoice && <button type="button" onClick={onUploadSupplierInvoice} className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3.5 py-2.5 text-xs font-bold text-indigo-800 shadow-sm hover:bg-indigo-100"><ExternalLink className="h-3.5 w-3.5" /> Upload supplier invoice</button>}
        <button type="button" onClick={() => setModal(true)} className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-indigo-700"><Plus className="h-3.5 w-3.5" /> Add expense</button>
      </div> : canUploadSupplierInvoice && onUploadSupplierInvoice ? <button type="button" onClick={onUploadSupplierInvoice} className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3.5 py-2.5 text-xs font-bold text-indigo-800 shadow-sm hover:bg-indigo-100"><ExternalLink className="h-3.5 w-3.5" /> Upload supplier invoice</button> : undefined}
    />

    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6" aria-label="Expense summary">
      <MetricCard label="Authoritative Expenses" value={expenses.length} loading={isHydrating} icon={Receipt} tone="info" />
      {(expenses.length > 0 || supplierDocuments.length > 0) && <MetricCard label={`Confirmed ${normalizeFinancialCurrency(baseCurrency)} cost`} value={money(confirmedBaseCost, normalizeFinancialCurrency(baseCurrency))} loading={isHydrating} detail="Verified supplier links or approved / paid records" icon={CircleDollarSign} tone="success" />}
      {supplierDocuments.length > 0 && <MetricCard label="Supplier Documents" value={supplierDocuments.length} loading={isHydrating} detail="Preserved source evidence" icon={ShieldCheck} tone="info" />}
      {needsReviewDocuments.length > 0 && <MetricCard label="Needs Review" value={needsReviewDocuments.length} loading={isHydrating} detail="Human verification required" icon={CircleAlert} tone="warning" />}
      {readyToLinkDocuments.length > 0 && <MetricCard label="Ready to Link" value={readyToLinkDocuments.length} loading={isHydrating} detail="Verified source documents" icon={ArrowRight} tone="info" />}
      {unresolvedFxExpenseIds.length > 0 && <MetricCard label="Unresolved FX" value={unresolvedFxExpenseIds.length} loading={isHydrating} detail={`${normalizeFinancialCurrency(baseCurrency)} reporting excluded`} icon={CircleAlert} tone="warning" />}
    </div>

    {supplierDocuments.length > 0 && <section className="space-y-3" aria-label="Supplier document work">
      <div className="flex flex-wrap items-end justify-between gap-2"><div><p className="text-xs font-black text-slate-950">Supplier document work</p><p className="mt-0.5 text-[10px] text-slate-500">Source evidence stays visible here while the linked Expense remains the only authoritative payable/cost row.</p></div><StatusBadge tone="info">{supplierDocuments.length} preserved</StatusBadge></div>
      {needsReviewDocuments.length > 0 && <SupplierDocumentSection title="Supplier documents requiring review" rows={needsReviewDocuments} projects={projects} onOpenReview={onOpenSupplierInvoiceReview} />}
      {readyToLinkDocuments.length > 0 && <SupplierDocumentSection title="Verified supplier invoices awaiting Expense link" rows={readyToLinkDocuments} projects={projects} canManage={canManage && canVerifySupplierInvoice} linkingInvoiceId={linkingInvoiceId} onLink={linkSupplierInvoice} onOpenReview={onOpenSupplierInvoiceReview} />}
      {supplierDocuments.some((row) => row.state === "LINKED") && <SupplierDocumentSection title="Linked supplier source evidence" rows={supplierDocuments.filter((row) => row.state === "LINKED")} projects={projects} />}
    </section>}
    {linkError && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-800">{linkError}</div>}

    <section className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4" aria-label="Expense filters"><div className="mb-3 flex flex-wrap items-start justify-between gap-2"><div><p className="text-xs font-black text-slate-950">Expense register</p><p className="mt-0.5 text-[10px] text-slate-500">Search authoritative cost records by description, project, payee, or status.</p></div><p className="text-xs font-semibold text-slate-500" role="status" aria-live="polite">Showing <span className="text-slate-900">{expenseResultLabel}</span></p></div><div className="flex flex-col gap-2 sm:flex-row"><label className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5"><Search aria-hidden="true" className="h-4 w-4 text-slate-400" /><span className="sr-only">Search expenses</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search expense, project, payee…" className="w-full bg-transparent text-xs outline-none placeholder:text-slate-400 focus-visible:outline-none" /></label><label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5"><Filter aria-hidden="true" className="h-3.5 w-3.5 text-slate-400" /><span className="sr-only">Expense status</span><select value={status} onChange={(event) => setStatus(event.target.value)} className="bg-transparent text-xs font-semibold outline-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"><option value="ALL">All statuses</option>{["DRAFT", "APPROVED", "PAID", "VOID"].map((value) => <option key={value} value={value}>{value}</option>)}</select></label></div></section>

    {rows.length ? <section id="expenses-results" className="overflow-hidden rounded-xl border border-slate-200 bg-white" aria-label="Expenses table"><div className="ops-scrollbar overflow-auto"><table className="ops-table min-w-[1080px] w-full text-left text-xs"><caption className="sr-only">Expense register results: {expenseResultLabel}</caption><thead className="border-b border-slate-200 bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500"><tr><th scope="col" className="px-4 py-3">Date / description</th><th scope="col" className="px-4 py-3">Project</th><th scope="col" className="px-4 py-3">Category / payee</th><th scope="col" className="px-4 py-3">Source / PO</th><th scope="col" className="px-4 py-3 text-right">Amount</th><th scope="col" className="px-4 py-3">Status</th>{canManage && <th scope="col" className="px-4 py-3 text-right">Action</th>}</tr></thead><tbody className="divide-y divide-slate-100">{rows.map((expense) => { const project = projects.find((item) => item.id === expense.projectId); const invoice = expense.supplierInvoiceId ? invoiceMap.get(expense.supplierInvoiceId) : undefined; const purchaseOrder = expense.purchaseOrderId ? purchaseOrderMap.get(expense.purchaseOrderId) : undefined; const vendor = expense.vendorId ? vendorMap.get(expense.vendorId) : undefined; const fxSnapshot = findFinancialFxSnapshot(financialFxSnapshots, "EXPENSE", expense.id); const needsFx = unresolvedFxExpenseSet.has(expense.id); return <tr key={expense.id} className="align-top transition hover:bg-slate-50"><td className="px-4 py-3"><strong className="block text-xs text-slate-900">{expense.description}</strong><span className="mt-0.5 block text-[10px] text-slate-500">{expense.expenseDate}</span></td><td className="max-w-[220px] px-4 py-3"><strong className="block truncate text-[10px] text-indigo-700">{project?.projectCode || "Unallocated"}</strong><span className="mt-0.5 block truncate text-[10px] text-slate-500">{project?.projectName || "Needs project confirmation"}</span></td><td className="px-4 py-3"><strong className="block text-[10px] text-slate-700">{expense.category}</strong><span className="mt-0.5 block text-[10px] text-slate-500">{vendor?.name || expense.payee || expense.referenceNumber || "No payee / reference"}</span></td><td className="max-w-[240px] px-4 py-3"><strong className="block truncate text-[10px] text-slate-700">{invoice ? `Supplier invoice ${invoice.invoiceNumber || invoice.id.slice(0, 8)}` : "Manual expense"}</strong><span className="mt-0.5 block truncate text-[10px] text-slate-500">{purchaseOrder ? `PO ${purchaseOrder.poNumber}` : invoice?.sourceMetadata?.subject ? `From email: ${invoice.sourceMetadata.subject}` : expense.supplierInvoiceId ? "Source invoice preserved" : "No linked source"}</span></td><td className="px-4 py-3 text-right font-sans font-bold tabular-nums text-slate-900"><span className="block">{money(expense.amount, expense.currency)}</span>{expense.currency.toUpperCase() !== baseCurrency.toUpperCase() && <span className={`mt-1 block text-[9px] ${needsFx ? "font-bold text-amber-700" : "text-emerald-700"}`}>{needsFx ? "FX rate required" : `≈ ${money(fxSnapshot?.baseAmount || 0, baseCurrency)}`}</span>}</td><td className="px-4 py-3"><div className="flex flex-wrap gap-1"><StatusBadge tone={expenseTone(expense.status)} icon={expense.status === "APPROVED" || expense.status === "PAID" ? CheckCircle2 : expense.status === "VOID" ? Ban : undefined}>{expense.status}</StatusBadge>{expense.archivedAt && <StatusBadge tone="neutral" icon={Archive}>Archived</StatusBadge>}{needsFx && <StatusBadge tone="warning">FX required</StatusBadge>}</div></td>{canManage && <td className="px-4 py-3 text-right"><div className="flex flex-col items-end gap-1">{needsFx && canManageFx && onSaveFinancialFxSnapshot && <button type="button" onClick={() => openFxConfirmation(expense)} className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-[10px] font-bold text-amber-800 transition hover:bg-amber-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-1">Confirm FX</button>}<button type="button" aria-label={`Review correction options for ${expense.description}`} onClick={() => void openCorrection(expense)} className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-[10px] font-bold text-amber-800 transition hover:bg-amber-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-1"><Archive className="h-3 w-3" aria-hidden="true" /> Review correction</button></div></td>}</tr>; })}</tbody></table></div></section> : workspaceDataPending ? <div id="expenses-results" role="status" aria-live="polite" className="p-8 text-center text-xs font-semibold text-slate-500">Loading expenses…</div> : <div id="expenses-results"><EmptyState icon={Receipt} title={expenses.length ? "No expenses match this filter" : supplierDocuments.length ? "No authoritative Expenses yet" : "No expenses yet"} description={expenses.length ? "Try a different status or search term." : supplierDocuments.length ? `${supplierDocuments.length} supplier document${supplierDocuments.length === 1 ? "" : "s"} still require review or Expense linking.` : canManage ? "Add an authoritative direct expense or upload a supplier invoice for review." : "No expense records are available for the current filter."} action={canManage && !expenses.length ? <button type="button" onClick={() => setModal(true)} className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-bold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"><Plus className="h-3.5 w-3.5" /> Add expense</button> : undefined} /></div>}

    {canManage && modal && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" role="dialog" aria-modal="true" aria-labelledby="expense-form-title"><div className="max-h-[calc(100vh-2rem)] w-full max-w-2xl overflow-y-auto overscroll-contain rounded-xl border border-slate-200 bg-white p-5 shadow-2xl"><div className="mb-4 flex items-center justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[0.16em] text-indigo-600">Cost record</p><h2 id="expense-form-title" className="mt-1 text-lg font-black">Add direct expense</h2></div><button type="button" onClick={() => setModal(false)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100" aria-label="Close expense form"><X className="h-4 w-4" /></button></div><ExpenseForm projects={projects} costCodes={costCodes} projectId={initialProjectId} onSave={(expense) => { onSave(expense); setModal(false); }} onCancel={() => setModal(false)} /></div></div>}
    {canManageFx && fxExpense && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" role="dialog" aria-modal="true" aria-labelledby="expense-fx-title"><section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl"><div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[0.16em] text-indigo-600">Base-currency reporting</p><h2 id="expense-fx-title" className="mt-1 text-lg font-black text-slate-950">Confirm FX rate</h2><p className="mt-1 text-xs text-slate-500">The original transaction remains {money(fxExpense.amount, fxExpense.currency)}. This snapshot is used only for {normalizeFinancialCurrency(baseCurrency)} reporting.</p></div><button type="button" onClick={closeFxConfirmation} disabled={fxBusy} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 disabled:opacity-50" aria-label="Close FX confirmation"><X className="h-4 w-4" /></button></div><div className="mt-4 space-y-3"><label className="block space-y-1"><span className="field-label">Rate (1 {normalizeFinancialCurrency(fxExpense.currency)} = {normalizeFinancialCurrency(baseCurrency)})</span><input autoFocus type="number" min="0.00000001" step="0.00000001" value={fxRate} onChange={(event) => setFxRate(event.target.value)} className="field-input" placeholder="e.g. 56.25" /></label><label className="block space-y-1"><span className="field-label">Rate date</span><input type="date" value={fxRateDate} onChange={(event) => setFxRateDate(event.target.value)} className="field-input" /></label><label className="block space-y-1"><span className="field-label">Source note (optional)</span><textarea value={fxNote} onChange={(event) => setFxNote(event.target.value)} rows={2} className="field-input resize-y" placeholder="Manual source or approval reference" /></label><div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-[10px] leading-4 text-amber-900"><LockKeyhole className="mt-0.5 h-3.5 w-3.5 shrink-0" />The confirmed rate and PHP equivalent are immutable transaction evidence. A later rate change will not rewrite this record.</div>{fxError && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-800">{fxError}</div>}</div><div className="mt-5 flex justify-end gap-2"><button type="button" onClick={closeFxConfirmation} disabled={fxBusy} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700">Cancel</button><button type="button" onClick={() => void confirmFx()} disabled={fxBusy} className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">{fxBusy ? "Confirming…" : "Confirm rate"}</button></div></section></div>}
    {correctionDialog}
  </div>;
};

interface SupplierDocumentSectionProps {
  title: string;
  rows: readonly SupplierDocumentWorkspaceRow[];
  projects: readonly Project[];
  canManage?: boolean;
  linkingInvoiceId?: string | null;
  onLink?: (row: SupplierDocumentWorkspaceRow) => void;
  onOpenReview?: (invoice: InvoiceData) => void;
}

function SupplierDocumentSection({ title, rows, projects, canManage = false, linkingInvoiceId, onLink, onOpenReview }: SupplierDocumentSectionProps) {
  return <section className="overflow-hidden rounded-xl border border-slate-200 bg-white" aria-label={title}><div className="flex items-center justify-between gap-3 border-b border-slate-100 bg-slate-50 px-4 py-3"><div><h3 className="text-xs font-black text-slate-900">{title}</h3><p className="mt-0.5 text-[10px] text-slate-500">{rows.length} document{rows.length === 1 ? "" : "s"}</p></div><StatusBadge tone={supplierStateTone(rows[0]?.state || "NEEDS_REVIEW")}>{rows[0] ? supplierStateLabel(rows[0].state) : ""}</StatusBadge></div><div className="divide-y divide-slate-100">{rows.map(({ invoice, state, linkedExpense }) => { const project = projects.find((item) => item.id === invoice.projectReference || item.projectCode === invoice.projectReference); return <div key={invoice.id} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><strong className="text-xs text-slate-900">{invoice.invoiceNumber || `Supplier document ${invoice.id.slice(0, 8)}`}</strong><StatusBadge tone={supplierStateTone(state)}>{supplierStateLabel(state)}</StatusBadge></div><p className="mt-1 truncate text-[10px] text-slate-600">{invoice.vendor?.name || "Supplier unresolved"} · {money(invoice.grandTotal, invoice.currency)}</p><p className="mt-0.5 truncate text-[10px] text-slate-500">{project ? `${project.projectCode} · ${project.projectName}` : invoice.projectReference ? `Project reference: ${invoice.projectReference}` : "Project not allocated"}{invoice.purchaseOrderNumber ? ` · PO ${invoice.purchaseOrderNumber}` : ""}</p></div><div className="flex shrink-0 flex-wrap items-center justify-end gap-2">{state === "NEEDS_REVIEW" && onOpenReview && <button type="button" onClick={() => onOpenReview(invoice)} className="inline-flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-[10px] font-bold text-amber-900"><ExternalLink className="h-3 w-3" /> Supplier Review</button>}{state === "READY_TO_LINK" && canManage && onLink && <button type="button" onClick={() => onLink({ invoice, state, linkedExpense })} disabled={linkingInvoiceId === invoice.id} className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-2.5 py-2 text-[10px] font-bold text-white disabled:opacity-50">{linkingInvoiceId === invoice.id ? "Creating…" : "Create linked Expense"}</button>}{state === "READY_TO_LINK" && (!canManage || !onLink) && <span className="text-[10px] font-semibold text-slate-500">Expense management permission required</span>}{state === "LINKED" && linkedExpense && <span className="text-[10px] font-semibold text-emerald-700">Expense #{linkedExpense.id.slice(0, 8)} owns cost</span>}</div></div>; })}</div></section>;
}
