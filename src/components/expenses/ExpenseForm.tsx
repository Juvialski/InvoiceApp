import React, { useState } from "react";
import { Expense, ExpenseStatus, Project, ProjectCostCode } from "../../types";
import { EXPENSE_CATEGORIES, createLocalExpense } from "../../lib/expenses";
import { formatCostCodeOptionLabel, getSelectableCostCodes } from "../../lib/projectCostCodes";

interface ExpenseFormProps {
  projects: Project[];
  costCodes?: ProjectCostCode[];
  initial?: Expense;
  projectId?: string;
  onSave: (expense: Expense) => void;
  onCancel: () => void;
}

export const ExpenseForm: React.FC<ExpenseFormProps> = ({ projects, costCodes = [], initial, projectId, onSave, onCancel }) => {
  const [expense, setExpense] = useState<Expense>(initial || createLocalExpense({ projectId, expenseDate: new Date().toISOString().slice(0, 10), category: "Miscellaneous", description: "", payee: "", amount: 0, currency: "PHP", paymentMethod: "", referenceNumber: "", status: "DRAFT", notes: "" }));
  const [validationError, setValidationError] = useState<string | null>(null);
  const update = (patch: Partial<Expense>) => { setExpense((current) => ({ ...current, ...patch })); setValidationError(null); };
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const description = expense.description.trim();
    const currency = expense.currency.trim().toUpperCase();
    if (!description) { setValidationError("Enter an expense description before saving."); return; }
    if (!Number.isFinite(expense.amount) || expense.amount < 0) { setValidationError("Enter a valid non-negative expense amount."); return; }
    if (!/^[A-Z]{3}$/.test(currency)) { setValidationError("Enter a three-letter currency code such as PHP."); return; }
    setValidationError(null);
    onSave({
      ...expense,
      description,
      category: expense.category.trim() || "Miscellaneous",
      currency,
      amount: Number(expense.amount) || 0,
      projectCostCodeId: expense.projectId ? expense.projectCostCodeId : undefined,
    });
  };

  const selectableCostCodes = expense.projectId
    ? getSelectableCostCodes(costCodes, expense.projectId, expense.projectCostCodeId)
    : [];

  return <form noValidate onSubmit={submit} className="space-y-5">
    {validationError && <p id="expense-form-error" role="alert" aria-live="assertive" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold leading-5 text-rose-800">{validationError}</p>}

    <fieldset className="space-y-3 rounded-xl border border-slate-200 p-3 sm:p-4">
      <legend className="px-1 text-xs font-black uppercase tracking-[0.14em] text-slate-700">Cost details</legend>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1"><span className="field-label">Date</span><input type="date" aria-label="Expense date" value={expense.expenseDate} onChange={(event) => update({ expenseDate: event.target.value })} className="field-input" /></label>
        <label className="space-y-1"><span className="field-label">Project</span><select aria-label="Expense project" value={expense.projectId || ""} onChange={(event) => { const nextProjectId = event.target.value || undefined; const currentCode = costCodes.find((cc) => cc.id === expense.projectCostCodeId); const nextCostCodeId = currentCode && currentCode.projectId === nextProjectId ? expense.projectCostCodeId : undefined; update({ projectId: nextProjectId, projectCostCodeId: nextCostCodeId }); }} className="field-input"><option value="">Unallocated</option>{projects.filter((project) => project.status !== "ARCHIVED" || project.id === expense.projectId).map((project) => <option key={project.id} value={project.id}>{project.projectCode} — {project.projectName}{project.status === "ARCHIVED" ? " (archived)" : ""}</option>)}</select></label>
        {expense.projectId && (
          <label className="space-y-1 sm:col-span-2">
            <span className="field-label">Cost code</span>
            <select aria-label="Expense cost code" value={expense.projectCostCodeId || ""} onChange={(event) => update({ projectCostCodeId: event.target.value || undefined })} className="field-input">
              <option value="">Uncoded</option>
              {selectableCostCodes.map((cc) => (
                <option key={cc.id} value={cc.id}>{formatCostCodeOptionLabel(cc)}</option>
              ))}
            </select>
          </label>
        )}
        <label className="space-y-1 sm:col-span-2"><span className="field-label">Category</span><input list="expense-categories" aria-label="Expense category" value={expense.category} onChange={(event) => update({ category: event.target.value })} className="field-input" /><datalist id="expense-categories">{EXPENSE_CATEGORIES.map((category) => <option key={category} value={category} />)}</datalist></label>
      </div>
    </fieldset>

    <fieldset className="space-y-3 rounded-xl border border-slate-200 p-3 sm:p-4">
      <legend className="px-1 text-xs font-black uppercase tracking-[0.14em] text-slate-700">Amount and payment</legend>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1"><span className="field-label">Amount</span><div className="flex"><input aria-label="Expense amount" aria-invalid={validationError?.includes("amount") || undefined} aria-describedby={validationError?.includes("amount") ? "expense-form-error" : undefined} required type="number" min="0" step="0.01" value={expense.amount} onChange={(event) => update({ amount: Number(event.target.value) })} className="min-w-0 flex-1 rounded-l-xl border border-slate-200 px-3 py-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500" /><input aria-label="Expense currency code" aria-invalid={validationError?.includes("currency") || undefined} aria-describedby={validationError?.includes("currency") ? "expense-form-error" : undefined} maxLength={3} value={expense.currency} onChange={(event) => update({ currency: event.target.value })} className="w-20 rounded-r-xl border-y border-r border-slate-200 px-2 py-2 text-xs uppercase focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500" /></div></label>
        <label className="space-y-1"><span className="field-label">Payee</span><input aria-label="Expense payee" value={expense.payee || ""} onChange={(event) => update({ payee: event.target.value })} className="field-input" /></label>
        <label className="space-y-1 sm:col-span-2"><span className="field-label">Status</span>{expense.status === "VOID" ? <div className="field-input flex items-center bg-slate-50 font-bold text-slate-600">VOID — use correction actions for any lifecycle change</div> : <select aria-label="Expense status" value={expense.status} onChange={(event) => update({ status: event.target.value as ExpenseStatus })} className="field-input"><option value="DRAFT">DRAFT</option><option value="APPROVED">APPROVED</option><option value="PAID">PAID</option></select>}</label>
      </div>
    </fieldset>

    <fieldset className="space-y-3 rounded-xl border border-slate-200 p-3 sm:p-4">
      <legend className="px-1 text-xs font-black uppercase tracking-[0.14em] text-slate-700">Description and reference</legend>
      <div className="grid gap-3">
        <label className="space-y-1"><span className="field-label">Description</span><input aria-describedby={validationError?.includes("description") ? "expense-form-error" : undefined} aria-invalid={validationError?.includes("description") || undefined} required value={expense.description} onChange={(event) => update({ description: event.target.value })} className="field-input" /></label>
        <label className="space-y-1"><span className="field-label">Reference / notes</span><textarea aria-label="Expense reference and notes" value={expense.notes || ""} onChange={(event) => update({ notes: event.target.value, referenceNumber: event.target.value })} rows={3} className="field-input resize-y" /></label>
      </div>
    </fieldset>

    <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-3"><button type="button" onClick={onCancel} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2">Cancel</button><button type="submit" className="rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white transition hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2">Save expense</button></div>
  </form>;
};

