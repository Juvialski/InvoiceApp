import React, { useEffect, useMemo, useState } from "react";
import { Archive, Ban, CheckCircle2, CircleDollarSign, Filter, Plus, Receipt, Search } from "lucide-react";
import type { Expense, Project } from "../../types";
import { ExpenseForm } from "./ExpenseForm";
import { EmptyState, MetricCard, PageHeader, StatusBadge, type StatusTone } from "../ui/OperationsUI";
import { useAppPermissions } from "../../app/AppPermissionContext.tsx";
import { hasPermission, PERMISSION_KEYS } from "../../utils/accessControl.ts";
import { FinancialCorrectionDialog } from "../financial/FinancialCorrectionDialog.tsx";
import type { FinancialCorrectionAction, FinancialCorrectionPreview, FinancialCorrectionResult } from "../../lib/financialLifecycle.ts";

interface ExpensesPageProps {
  expenses: Expense[];
  projects: Project[];
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

export const ExpensesPage: React.FC<ExpensesPageProps> = ({ expenses, projects, onSave, onPreviewCorrection, onApplyCorrection, initialProjectId, initialExpenseId, onInitialCorrectionConsumed }) => {
  const permissions = useAppPermissions();
  const canManage = hasPermission(permissions, PERMISSION_KEYS.expensesWrite);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("ALL");
  const [modal, setModal] = useState(false);
  const [correctionExpense, setCorrectionExpense] = useState<Expense | null>(null);
  const [correctionPreview, setCorrectionPreview] = useState<FinancialCorrectionPreview | null>(null);
  const [correctionLoading, setCorrectionLoading] = useState(false);
  const [correctionError, setCorrectionError] = useState("");
  const [correctionReason, setCorrectionReason] = useState("");

  const rows = useMemo(() => expenses.filter((expense) => {
    const q = query.toLowerCase().trim();
    const project = projects.find((item) => item.id === expense.projectId);
    const haystack = [expense.description, expense.category, expense.payee, expense.referenceNumber, project?.projectCode, project?.projectName].join(" ").toLowerCase();
    return (!q || haystack.includes(q)) && (status === "ALL" || expense.status === status);
  }), [expenses, projects, query, status]);
  const confirmed = expenses.filter((expense) => expense.status === "APPROVED" || expense.status === "PAID").reduce((sum, expense) => sum + (expense.currency === "PHP" ? expense.amount : 0), 0);

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

  useEffect(() => {
    if (!initialExpenseId) return;
    const expense = expenses.find((item) => item.id === initialExpenseId);
    if (!expense) return;
    void openCorrection(expense);
    onInitialCorrectionConsumed?.();
  }, [initialExpenseId]);

  const correctionDialog = correctionExpense ? <FinancialCorrectionDialog entityLabel="expense" recordLabel={`${correctionExpense.category} · ${correctionExpense.description}`} preview={correctionPreview} loading={correctionLoading} error={correctionError} reason={correctionReason} onReasonChange={setCorrectionReason} onApply={(action) => void applyCorrection(action)} onClose={closeCorrection} /> : null;

  return <div className="space-y-5">
    <PageHeader eyebrow="Project cost control" title="Expenses" description="Direct expenses remain distinct from extracted supplier invoices. Archive changes visibility; void changes active financial cost." actions={canManage ? <button type="button" onClick={() => setModal(true)} className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-indigo-700"><Plus className="h-3.5 w-3.5" /> Add expense</button> : undefined} />
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4" aria-label="Expense summary"><MetricCard label="All expenses" value={expenses.length} icon={Receipt} tone="info" /><MetricCard label="Confirmed PHP cost" value={money(confirmed, "PHP")} icon={CircleDollarSign} tone="success" /><MetricCard label="Draft / pending" value={expenses.filter((expense) => expense.status === "DRAFT").length} tone="warning" /><MetricCard label="Void" value={expenses.filter((expense) => expense.status === "VOID").length} tone="neutral" /></div>
    <section className="rounded-xl border border-slate-200 bg-white p-3" aria-label="Expense filters"><div className="flex flex-col gap-2 sm:flex-row"><label className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5"><Search aria-hidden="true" className="h-4 w-4 text-slate-400" /><span className="sr-only">Search expenses</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search expense, project, payee…" className="w-full bg-transparent text-xs outline-none placeholder:text-slate-400" /></label><label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5"><Filter aria-hidden="true" className="h-3.5 w-3.5 text-slate-400" /><span className="sr-only">Expense status</span><select value={status} onChange={(event) => setStatus(event.target.value)} className="bg-transparent text-xs font-semibold outline-none"><option value="ALL">All statuses</option>{["DRAFT", "APPROVED", "PAID", "VOID"].map((value) => <option key={value} value={value}>{value}</option>)}</select></label></div></section>
    {rows.length ? <section className="overflow-hidden rounded-xl border border-slate-200 bg-white" aria-label="Expenses table"><div className="ops-scrollbar overflow-auto"><table className="ops-table min-w-[900px] w-full text-left text-xs"><thead className="border-b border-slate-200 bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Date / description</th><th className="px-4 py-3">Project</th><th className="px-4 py-3">Category / payee</th><th className="px-4 py-3 text-right">Amount</th><th className="px-4 py-3">Status</th>{canManage && <th className="px-4 py-3 text-right">Action</th>}</tr></thead><tbody className="divide-y divide-slate-100">{rows.map((expense) => { const project = projects.find((item) => item.id === expense.projectId); return <tr key={expense.id}><td className="px-4 py-3"><strong className="block text-xs text-slate-900">{expense.description}</strong><span className="mt-0.5 block text-[10px] text-slate-500">{expense.expenseDate}</span></td><td className="max-w-[220px] px-4 py-3"><strong className="block truncate text-[10px] text-indigo-700">{project?.projectCode || "Unallocated"}</strong><span className="mt-0.5 block truncate text-[10px] text-slate-500">{project?.projectName || "Needs project confirmation"}</span></td><td className="px-4 py-3"><strong className="block text-[10px] text-slate-700">{expense.category}</strong><span className="mt-0.5 block text-[10px] text-slate-500">{expense.payee || expense.referenceNumber || "No payee / reference"}</span></td><td className="px-4 py-3 text-right font-sans font-bold tabular-nums text-slate-900">{money(expense.amount, expense.currency)}</td><td className="px-4 py-3"><div className="flex flex-wrap gap-1"><StatusBadge tone={expenseTone(expense.status)} icon={expense.status === "APPROVED" || expense.status === "PAID" ? CheckCircle2 : expense.status === "VOID" ? Ban : undefined}>{expense.status}</StatusBadge>{expense.archivedAt && <StatusBadge tone="neutral" icon={Archive}>Archived</StatusBadge>}</div></td>{canManage && <td className="px-4 py-3 text-right"><button type="button" onClick={() => void openCorrection(expense)} className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-[10px] font-bold text-amber-800 hover:bg-amber-50"><Archive className="h-3 w-3" /> Review correction</button></td>}</tr>; })}</tbody></table></div></section> : <EmptyState icon={Receipt} title={expenses.length ? "No expenses match this filter" : "No expenses yet"} description={canManage ? "Add direct project costs without duplicating supplier invoices." : "No expense records are available for the current filter."} action={canManage && !expenses.length ? <button type="button" onClick={() => setModal(true)} className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-bold text-white"><Plus className="h-3.5 w-3.5" /> Add expense</button> : undefined} />}
    {canManage && modal && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" role="dialog" aria-modal="true" aria-labelledby="expense-form-title"><div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-slate-200 bg-white p-5 shadow-2xl"><div className="mb-4 flex items-center justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[0.16em] text-indigo-600">Cost record</p><h2 id="expense-form-title" className="mt-1 text-lg font-black">Add direct expense</h2></div><button type="button" onClick={() => setModal(false)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100" aria-label="Close expense form">×</button></div><ExpenseForm projects={projects} projectId={initialProjectId} onSave={(expense) => { onSave(expense); setModal(false); }} onCancel={() => setModal(false)} /></div></div>}
    {correctionDialog}
  </div>;
};
