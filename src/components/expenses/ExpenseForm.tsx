import React, { useState } from "react";
import { Expense, ExpenseStatus, Project } from "../../types";
import { EXPENSE_CATEGORIES, createLocalExpense } from "../../lib/expenses";

interface ExpenseFormProps {
  projects: Project[];
  initial?: Expense;
  projectId?: string;
  onSave: (expense: Expense) => void;
  onCancel: () => void;
}

export const ExpenseForm: React.FC<ExpenseFormProps> = ({ projects, initial, projectId, onSave, onCancel }) => {
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
    onSave({ ...expense, description, category: expense.category.trim() || "Miscellaneous", currency, amount: Number(expense.amount) || 0 });
  };
  return <form noValidate onSubmit={submit} className="space-y-4">
    {validationError && <p id="expense-form-error" role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-800">{validationError}</p>}
    <div className="grid gap-3 sm:grid-cols-2"><label className="space-y-1"><span className="text-[10px] font-black uppercase text-slate-500">Date</span><input type="date" aria-label="Expense date" value={expense.expenseDate} onChange={(event) => update({ expenseDate: event.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs" /></label><label className="space-y-1"><span className="text-[10px] font-black uppercase text-slate-500">Project</span><select aria-label="Expense project" value={expense.projectId || ""} onChange={(event) => update({ projectId: event.target.value || undefined })} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs"><option value="">Unallocated</option>{projects.filter((project) => project.status !== "ARCHIVED").map((project) => <option key={project.id} value={project.id}>{project.projectCode} — {project.projectName}</option>)}</select></label><label className="space-y-1"><span className="text-[10px] font-black uppercase text-slate-500">Category</span><input list="expense-categories" aria-label="Expense category" value={expense.category} onChange={(event) => update({ category: event.target.value })} className="w-full rounded-xl border border-slate-200 text-xs" /><datalist id="expense-categories">{EXPENSE_CATEGORIES.map((category) => <option key={category} value={category} />)}</datalist></label><label className="space-y-1"><span className="text-[10px] font-black uppercase text-slate-500">Amount</span><div className="flex"><input aria-label="Expense amount" aria-invalid={validationError?.includes("amount") || undefined} aria-describedby={validationError?.includes("amount") ? "expense-form-error" : undefined} required type="number" min="0" step="0.01" value={expense.amount} onChange={(event) => update({ amount: Number(event.target.value) })} className="min-w-0 flex-1 rounded-l-xl border border-slate-200 px-3 py-2 text-xs" /><input aria-label="Expense currency code" aria-invalid={validationError?.includes("currency") || undefined} aria-describedby={validationError?.includes("currency") ? "expense-form-error" : undefined} maxLength={3} value={expense.currency} onChange={(event) => update({ currency: event.target.value })} className="w-20 rounded-r-xl border-y border-r border-slate-200 px-2 py-2 text-xs uppercase" /></div></label><label className="space-y-1"><span className="text-[10px] font-black uppercase text-slate-500">Payee</span><input aria-label="Expense payee" value={expense.payee || ""} onChange={(event) => update({ payee: event.target.value })} className="w-full rounded-xl border border-slate-200 text-xs" /></label><label className="space-y-1"><span className="text-[10px] font-black uppercase text-slate-500">Status</span>{expense.status === "VOID" ? <div className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-600">VOID — use correction actions for any lifecycle change</div> : <select aria-label="Expense status" value={expense.status} onChange={(event) => update({ status: event.target.value as ExpenseStatus })} className="w-full rounded-xl border border-slate-200 text-xs">{["DRAFT", "APPROVED", "PAID"].map((value) => <option key={value} value={value}>{value}</option>)}</select>}</label><label className="space-y-1 sm:col-span-2"><span className="text-[10px] font-black uppercase text-slate-500">Description</span><input aria-describedby={validationError?.includes("description") ? "expense-form-error" : undefined} aria-invalid={validationError?.includes("description") || undefined} required value={expense.description} onChange={(event) => update({ description: event.target.value })} className="w-full rounded-xl border border-slate-200 text-xs" /></label><label className="space-y-1 sm:col-span-2"><span className="text-[10px] font-black uppercase text-slate-500">Reference / notes</span><textarea aria-label="Expense reference and notes" value={expense.notes || ""} onChange={(event) => update({ notes: event.target.value, referenceNumber: event.target.value })} rows={2} className="w-full rounded-xl border border-slate-200 text-xs" /></label></div>
    <div className="flex flex-wrap justify-end gap-2"><button type="button" onClick={onCancel} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold">Cancel</button><button type="submit" className="rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white">Save expense</button></div>
  </form>;
};

