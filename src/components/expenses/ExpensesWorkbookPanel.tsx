import React, { useRef, useState } from "react";
import { Download, FileSpreadsheet, ShieldAlert, Upload } from "lucide-react";
import type { Expense } from "../../types.ts";
import {
  applyExpensesImport,
  buildExpensesImportReview,
  exportExpensesWorkbook,
  type ExpensesImportContext,
  type ExpensesImportReview,
  type ExpensesProposal,
  type ExpensesWorkbookRecords,
} from "../../lib/expensesWorkbook.ts";
import { downloadWorkbookArtifact } from "../../lib/operationsWorkbook.ts";

export interface ExpensesWorkbookPanelProps extends ExpensesWorkbookRecords {
  companyId?: string;
  canManage: boolean;
  onRefreshExpenses?: () => Promise<ExpensesWorkbookRecords>;
  onApplyExpenseWorkbook: (expense: Expense) => Promise<void> | void;
}

function statusClass(status: ExpensesProposal["status"]) {
  if (status === "UNCHANGED") return "bg-slate-100 text-slate-600";
  if (status === "WORKBOOK_ONLY_CHANGE") return "bg-emerald-50 text-emerald-800";
  if (status === "APP_ONLY_CHANGE") return "bg-amber-50 text-amber-800";
  if (status === "UNSUPPORTED_PROTECTED_FIELD" || status === "UNAUTHORIZED") return "bg-rose-50 text-rose-800";
  return "bg-orange-50 text-orange-800";
}

export function ExpensesWorkbookPanel({
  expenses,
  projects,
  costCodes,
  invoices,
  purchaseOrders,
  vendors,
  expectedCompanyId,
  settlementProjections,
  settlementMatches,
  today,
  companyId,
  canManage,
  onRefreshExpenses,
  onApplyExpenseWorkbook,
}: ExpensesWorkbookPanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [review, setReview] = useState<ExpensesImportReview | null>(null);
  const [selectedProposalIds, setSelectedProposalIds] = useState<string[]>([]);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const currentRecords = (): ExpensesWorkbookRecords => ({
    expenses,
    projects,
    costCodes,
    invoices,
    purchaseOrders,
    vendors,
    expectedCompanyId: expectedCompanyId || companyId,
    settlementProjections,
    settlementMatches,
    today,
  });

  const freshRecords = async () => onRefreshExpenses ? onRefreshExpenses() : currentRecords();

  const handleExport = () => {
    setError("");
    setMessage("");
    try {
      downloadWorkbookArtifact(exportExpensesWorkbook(currentRecords()), "HydroQualiSense-Expenses.xlsx");
      setMessage("Expenses workbook exported. Edit only supported direct draft fields, then upload it for review.");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Could not export the Expenses workbook.");
    }
  };

  const contextFor = (records: ExpensesWorkbookRecords): ExpensesImportContext => ({ ...records, canWrite: canManage });

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (!/\.xlsx$/i.test(file.name)) throw new Error("Only non-macro .xlsx workbooks are supported.");
      const bytes = new Uint8Array(await file.arrayBuffer());
      const records = await freshRecords();
      const nextReview = buildExpensesImportReview(bytes, contextFor(records), { fileName: file.name });
      setReview(nextReview);
      setSelectedProposalIds(nextReview.proposals.filter((proposal) => proposal.canApply).map((proposal) => proposal.id));
      setConfirmed(false);
    } catch (nextError) {
      setReview(null);
      setSelectedProposalIds([]);
      setError(nextError instanceof Error ? nextError.message : "Could not read the Expenses workbook.");
    } finally {
      setBusy(false);
    }
  };

  const toggleProposal = (proposalId: string) => {
    setSelectedProposalIds((current) => current.includes(proposalId) ? current.filter((id) => id !== proposalId) : [...current, proposalId]);
    setConfirmed(false);
  };

  const handleApply = async () => {
    if (!review || !canManage || !confirmed || !selectedProposalIds.length) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const records = await freshRecords();
      const result = await applyExpensesImport(
        review,
        contextFor(records),
        { saveExpense: onApplyExpenseWorkbook },
        selectedProposalIds,
      );
      const after = await freshRecords();
      const refreshedReview = buildExpensesImportReview(review.bytes, contextFor(after), { fileName: review.fileName });
      setReview(refreshedReview);
      setSelectedProposalIds(refreshedReview.proposals.filter((proposal) => proposal.canApply).map((proposal) => proposal.id));
      setConfirmed(false);
      setMessage(`Applied ${result.appliedProposalIds.length} reviewed Expense change${result.appliedProposalIds.length === 1 ? "" : "s"}. The page reflects refreshed authoritative state.`);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Could not apply the reviewed Expenses workbook changes.");
    } finally {
      setBusy(false);
    }
  };

  const changeCount = review?.proposals.filter((proposal) => proposal.status !== "UNCHANGED").length || 0;
  const selectedCount = selectedProposalIds.length;

  return (
    <section className="rounded-xl border border-slate-200 bg-slate-50 p-3 sm:p-4" aria-label="Expenses workbook" data-expenses-workbook>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4 text-emerald-700" aria-hidden="true" />
            <h2 className="text-sm font-black text-slate-950">Excel-native Expenses workbook</h2>
          </div>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-600">Export Expenses for controlled external editing. Supplier Payables is included as protected source and settlement context. Upload creates a review proposal; nothing is saved until you inspect and explicitly Apply selected direct-draft changes.</p>
          {!canManage && <p className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-amber-900"><ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />Upload is available for review only; your current permissions cannot Apply changes.</p>}
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <button type="button" onClick={handleExport} disabled={busy} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-emerald-200 bg-white px-3 py-2 text-xs font-black text-emerald-800 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50"><Download className="h-3.5 w-3.5" aria-hidden="true" />Export editable workbook</button>
          <button type="button" onClick={() => fileInputRef.current?.click()} disabled={busy} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-indigo-700 px-3 py-2 text-xs font-black text-white hover:bg-indigo-800 disabled:cursor-not-allowed disabled:opacity-50"><Upload className="h-3.5 w-3.5" aria-hidden="true" />Import workbook</button>
          <input ref={fileInputRef} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(event) => void handleImport(event)} className="sr-only" />
        </div>
      </div>

      {message && <p role="status" className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs font-semibold text-emerald-800">{message}</p>}
      {error && <p role="alert" className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-800">{error}</p>}

      {review && <div className="mt-4 rounded-lg border border-slate-200 bg-white p-3">
        <div className="flex flex-col gap-2 border-b border-slate-100 pb-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="text-xs font-black text-slate-900">Import review: {review.fileName || "Expenses workbook"}</h3>
            <p className="mt-1 text-[11px] text-slate-500">{changeCount} proposal(s), {review.omittedExpenseIds.length + review.omittedSupplierInvoiceIds.length} omitted row(s) preserved without deletion. Review before Apply.</p>
          </div>
          <span className="text-[11px] font-semibold text-slate-500">{selectedCount} selected</span>
        </div>
        {review.workbookWarnings.length > 0 && <ul className="mt-3 list-disc pl-5 text-[11px] font-semibold text-rose-700">{review.workbookWarnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>}
        <div className="mt-3 space-y-2">
          {review.proposals.map((proposal) => <article key={proposal.id} className="rounded-lg border border-slate-200 p-3" data-expense-proposal={proposal.id}>
            <div className="flex flex-wrap items-center gap-2">
              <input type="checkbox" checked={selectedProposalIds.includes(proposal.id)} onChange={() => toggleProposal(proposal.id)} disabled={!canManage || !proposal.canApply || busy} aria-label={`Select ${proposal.label}`} />
              <span className="font-mono text-xs font-black text-slate-900">{proposal.label}</span>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${statusClass(proposal.status)}`}>{proposal.status}</span>
              {proposal.entity === "SUPPLIER_PAYABLE" && <span className="text-[10px] font-semibold text-slate-500">Supplier Payables is read-only context</span>}
            </div>
            {proposal.messages.length > 0 && <ul className="mt-2 list-disc pl-5 text-[11px] font-semibold text-amber-800">{proposal.messages.map((item) => <li key={item}>{item}</li>)}</ul>}
            {proposal.changes.length > 0 && <div className="mt-2 overflow-x-auto"><table className="min-w-full text-left text-[11px]"><thead className="text-[10px] uppercase tracking-wide text-slate-500"><tr><th className="px-2 py-1">Field</th><th className="px-2 py-1">Current</th><th className="px-2 py-1">Excel</th><th className="px-2 py-1">Result</th></tr></thead><tbody className="divide-y divide-slate-100">{proposal.changes.map((change) => <tr key={`${proposal.id}:${change.field}`}><td className="px-2 py-1 font-semibold text-slate-700">{change.field}</td><td className="max-w-48 break-words px-2 py-1 text-slate-600">{String(change.currentValue ?? "")}</td><td className="max-w-48 break-words px-2 py-1 text-slate-600">{String(change.workbookValue ?? "")}</td><td className="px-2 py-1 font-semibold text-slate-600">{change.editable ? "Change" : "Protected"}</td></tr>)}</tbody></table></div>}
          </article>)}
        </div>
        <div className="mt-3 border-t border-slate-100 pt-3">
          <label className="flex items-start gap-2 text-xs text-slate-700"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.currentTarget.checked)} disabled={!canManage || !selectedCount || busy} className="mt-0.5" />I reviewed the proposed current-versus-Excel values and want to Apply the selected valid direct Expense changes through the authoritative Expense workflow.</label>
          <button type="button" onClick={() => void handleApply()} disabled={!canManage || !confirmed || !selectedCount || busy} className="mt-3 inline-flex min-h-10 items-center rounded-lg bg-indigo-700 px-3 py-2 text-xs font-black text-white hover:bg-indigo-800 disabled:cursor-not-allowed disabled:opacity-50">Apply selected changes</button>
        </div>
      </div>}
    </section>
  );
}
