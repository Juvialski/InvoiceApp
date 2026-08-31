import React, { useEffect, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, FileText, Loader2, Mail, Receipt, Sparkles, X } from "lucide-react";
import type { Expense, ExpenseStatus, Project } from "../types.ts";
import { EXPENSE_CATEGORIES, createLocalExpense } from "../lib/expenses.ts";
import {
  clearPendingEmailExpenseReview,
  findPossibleExpenseDuplicates,
  loadPendingEmailExpenseFile,
  readPendingEmailExpenseReview,
  type ExpenseDuplicateCandidate,
  type PendingEmailExpenseReview,
} from "../lib/emailIntake.ts";
import { Notice, SectionHeader, StatusBadge } from "./ui/OperationsUI.tsx";

interface ConnectedExpenseReviewProps {
  projects: Project[];
  existingExpenses: Expense[];
  canManage?: boolean;
  onSaveExpense: (expense: Expense) => Promise<void> | void;
}

export const ConnectedExpenseReview: React.FC<ConnectedExpenseReviewProps> = ({
  projects,
  existingExpenses,
  canManage = false,
  onSaveExpense,
}) => {
  const [pending, setPending] = useState<PendingEmailExpenseReview | null>(null);
  const [expenseDate, setExpenseDate] = useState("");
  const [category, setCategory] = useState("Miscellaneous");
  const [description, setDescription] = useState("");
  const [payee, setPayee] = useState("");
  const [amount, setAmount] = useState<number>(0);
  const [currency, setCurrency] = useState("PHP");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [projectId, setProjectId] = useState("");
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState<ExpenseStatus>("DRAFT");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloadBusy, setDownloadBusy] = useState(false);

  useEffect(() => {
    const staged = readPendingEmailExpenseReview();
    if (!staged) return;
    setPending(staged);
    const suggested = staged.suggestedExpense;
    setExpenseDate(suggested.expenseDate || new Date().toISOString().slice(0, 10));
    setCategory(suggested.category || "Miscellaneous");
    setDescription(suggested.description || "");
    setPayee(suggested.payee || "");
    setAmount(Number(suggested.amount) || 0);
    setCurrency(suggested.currency || "PHP");
    setPaymentMethod(suggested.paymentMethod || "");
    setReferenceNumber(suggested.referenceNumber || "");
    setNotes(suggested.notes || "");
    setStatus("DRAFT");

    // Match suggested project code to real active projects
    if (suggested.projectId) {
      const match = projects.find((p) => p.status !== "ARCHIVED" && (p.projectCode.toLowerCase() === suggested.projectId?.toLowerCase() || p.id === suggested.projectId));
      setProjectId(match?.id || "");
    } else {
      setProjectId("");
    }
  }, [projects]);

  const duplicates = useMemo<ExpenseDuplicateCandidate[]>(() => {
    if (!pending) return [];
    return findPossibleExpenseDuplicates(
      {
        payee: payee || undefined,
        amount: Number(amount) || 0,
        currency,
        expenseDate,
        referenceNumber: referenceNumber || undefined,
        sourceDocumentId: pending.sourceDocumentId,
      },
      existingExpenses
    );
  }, [pending, payee, amount, currency, expenseDate, referenceNumber, existingExpenses]);

  if (!pending) return null;

  const dismiss = () => {
    clearPendingEmailExpenseReview();
    setPending(null);
    setError(null);
  };

  const handleDownloadOriginal = async () => {
    if (!pending) return;
    setDownloadBusy(true);
    setError(null);
    try {
      const file = await loadPendingEmailExpenseFile(pending);
      const url = URL.createObjectURL(file);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = file.name || pending.fileName;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (err: any) {
      setError(err?.message || "Could not download the preserved receipt file.");
    } finally {
      setDownloadBusy(false);
    }
  };

  const handleSubmit = async (saveStatus: ExpenseStatus) => {
    if (!canManage) {
      setError("Expense creation requires expense management permission.");
      return;
    }
    const cleanDesc = description.trim();
    const cleanCurr = currency.trim().toUpperCase();
    const parsedAmount = Number(amount);

    if (!cleanDesc) {
      setError("Enter an expense description before saving.");
      return;
    }
    if (!Number.isFinite(parsedAmount) || parsedAmount < 0) {
      setError("Enter a valid non-negative expense amount.");
      return;
    }
    if (!/^[A-Z]{3}$/.test(cleanCurr)) {
      setError("Enter a three-letter currency code such as PHP.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const newExpense = createLocalExpense({
        projectId: projectId || undefined,
        expenseDate,
        category: category.trim() || "Miscellaneous",
        description: cleanDesc,
        payee: payee.trim() || undefined,
        amount: parsedAmount,
        currency: cleanCurr,
        paymentMethod: paymentMethod.trim() || undefined,
        referenceNumber: referenceNumber.trim() || undefined,
        status: saveStatus,
        receiptSourceDocumentId: pending.sourceDocumentId,
        notes: notes.trim() || undefined,
      });

      await onSaveExpense(newExpense);
      dismiss();
    } catch (err: any) {
      setError(err?.message || "Could not save expense draft.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section
      className="rounded-2xl border border-amber-200 bg-amber-50/50 p-4 shadow-sm sm:p-5"
      aria-label="Connected mailbox expense review"
    >
      <div className="flex items-start justify-between gap-3">
        <SectionHeader
          title="Review expense from Email Intake"
          description="The original email and receipt attachment are preserved. Extracted fields are suggestions and remain non-mutating until you explicitly save."
          icon={Receipt}
        />
        <button
          type="button"
          disabled={busy}
          onClick={dismiss}
          aria-label="Dismiss connected expense review"
          className="rounded-lg p-1.5 text-slate-500 hover:bg-white disabled:opacity-50"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-3 flex flex-col gap-3 rounded-xl border border-amber-200 bg-white p-3.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-black text-slate-900">{pending.subject || "Email receipt"}</p>
            <StatusBadge tone="warning" icon={Sparkles}>
              AI Extracted Suggestions
            </StatusBadge>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            {pending.sender || "Connected mailbox"} · Attachment: {pending.fileName}
          </p>
          <p className="mt-0.5 text-[10px] text-slate-400">Preserved source: {pending.sourceDocumentId}</p>
        </div>
        <button
          type="button"
          disabled={downloadBusy}
          onClick={() => void handleDownloadOriginal()}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
        >
          {downloadBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
          View receipt source
        </button>
      </div>

      {duplicates.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {duplicates.map((dup, i) => (
            <Notice key={i} tone="warning">
              <strong>Duplicate warning:</strong> {dup.reason}
            </Notice>
          ))}
        </div>
      )}

      {error && (
        <div role="alert" className="mt-3 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-900">
          <AlertCircle className="h-4 w-4 shrink-0 text-rose-600 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {!canManage && (
        <div className="mt-3">
          <Notice tone="warning">
            Your access profile has read-only access to expenses. Creating or saving expense drafts requires expense management permission.
          </Notice>
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void handleSubmit("DRAFT");
        }}
        className="mt-4 space-y-4"
      >
        <fieldset className="space-y-3 rounded-xl border border-slate-200 bg-white p-3.5 sm:p-4">
          <legend className="px-1 text-xs font-black uppercase tracking-[0.14em] text-slate-700">Cost details</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1">
              <span className="field-label">Date</span>
              <input
                type="date"
                required
                aria-label="Expense date"
                value={expenseDate}
                onChange={(e) => setExpenseDate(e.target.value)}
                className="field-input"
              />
            </label>
            <label className="space-y-1">
              <span className="field-label">Project allocation (Optional)</span>
              <select
                aria-label="Expense project"
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                className="field-input"
              >
                <option value="">Unallocated (Confirm later)</option>
                {projects
                  .filter((p) => p.status !== "ARCHIVED")
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.projectCode} — {p.projectName}
                    </option>
                  ))}
              </select>
            </label>
            <label className="space-y-1 sm:col-span-2">
              <span className="field-label">Category</span>
              <input
                list="connected-expense-categories"
                aria-label="Expense category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="field-input"
              />
              <datalist id="connected-expense-categories">
                {EXPENSE_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat} />
                ))}
              </datalist>
            </label>
          </div>
        </fieldset>

        <fieldset className="space-y-3 rounded-xl border border-slate-200 bg-white p-3.5 sm:p-4">
          <legend className="px-1 text-xs font-black uppercase tracking-[0.14em] text-slate-700">Amount & Payee</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1">
              <span className="field-label">Amount</span>
              <div className="flex">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  required
                  aria-label="Expense amount"
                  value={amount}
                  onChange={(e) => setAmount(Number(e.target.value))}
                  className="min-w-0 flex-1 rounded-l-xl border border-slate-200 px-3 py-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                />
                <input
                  maxLength={3}
                  aria-label="Expense currency"
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                  className="w-20 rounded-r-xl border-y border-r border-slate-200 px-2 py-2 text-xs uppercase focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                />
              </div>
            </label>
            <label className="space-y-1">
              <span className="field-label">Payee / Merchant</span>
              <input
                aria-label="Expense payee"
                value={payee}
                onChange={(e) => setPayee(e.target.value)}
                placeholder="Merchant name"
                className="field-input"
              />
            </label>
            <label className="space-y-1">
              <span className="field-label">Payment method</span>
              <input
                aria-label="Payment method"
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                placeholder="e.g. GCash, Cash, Credit Card"
                className="field-input"
              />
            </label>
            <label className="space-y-1">
              <span className="field-label">Receipt / Reference number</span>
              <input
                aria-label="Reference number"
                value={referenceNumber}
                onChange={(e) => setReferenceNumber(e.target.value)}
                placeholder="OR# or Ref#"
                className="field-input"
              />
            </label>
          </div>
        </fieldset>

        <fieldset className="space-y-3 rounded-xl border border-slate-200 bg-white p-3.5 sm:p-4">
          <legend className="px-1 text-xs font-black uppercase tracking-[0.14em] text-slate-700">Description & Notes</legend>
          <div className="grid gap-3">
            <label className="space-y-1">
              <span className="field-label">Description</span>
              <input
                required
                aria-label="Expense description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Brief description of the expense"
                className="field-input"
              />
            </label>
            <label className="space-y-1">
              <span className="field-label">Notes</span>
              <textarea
                aria-label="Expense notes"
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="field-input resize-y"
              />
            </label>
          </div>
        </fieldset>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-3">
          <p className="text-[10px] text-slate-500">
            Explicit confirmation creates an auditable expense linked to the preserved email source.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={dismiss}
              className="rounded-xl border border-slate-200 px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-white disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={busy || !canManage}
              onClick={() => void handleSubmit("DRAFT")}
              className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
              Save expense draft
            </button>
            <button
              type="button"
              disabled={busy || !canManage}
              onClick={() => void handleSubmit("APPROVED")}
              className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
              Save & Approve
            </button>
          </div>
        </div>
      </form>
    </section>
  );
};
