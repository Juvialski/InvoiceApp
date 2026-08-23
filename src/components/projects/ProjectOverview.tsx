import React from "react";
import { AlertTriangle, ArrowLeft, BriefcaseBusiness, CalendarDays, MapPin, Pencil, WalletCards } from "lucide-react";

interface ProjectView {
  id: string;
  projectCode: string;
  projectName: string;
  clientName?: string;
  location?: string;
  siteAddress?: string;
  projectManager?: string;
  status: string;
  projectBudget: number;
  currency: string;
  description?: string;
  notes?: string;
}

interface CostSummaryView {
  budget: number;
  invoiceCost: number;
  payrollCost: number;
  otherExpenseCost: number;
  totalActualCost: number;
  remainingBudget: number;
  budgetUsedPercent: number;
  pendingInvoiceCost: number;
  pendingPayrollCost: number;
  pendingExpenseCost: number;
  committedCost: number;
  foreignCosts: Record<string, number>;
}

interface ProjectOverviewProps { project: ProjectView; summary: CostSummaryView; onBack?: () => void; onEdit?: () => void; onArchive?: () => void; }

function money(value: number, currency: string): string {
  try { return new Intl.NumberFormat("en-PH", { style: "currency", currency, maximumFractionDigits: 2 }).format(Number(value) || 0); }
  catch { return `${currency} ${(Number(value) || 0).toFixed(2)}`; }
}

function health(summary: CostSummaryView): "OVER BUDGET" | "NEAR LIMIT" | "ON BUDGET" | "NO BUDGET" {
  if (summary.budget <= 0) return "NO BUDGET";
  if (summary.remainingBudget < 0) return "OVER BUDGET";
  if (summary.budgetUsedPercent >= 90) return "NEAR LIMIT";
  return "ON BUDGET";
}

export const ProjectOverview: React.FC<ProjectOverviewProps> = ({ project, summary, onBack, onEdit, onArchive }) => {
  const projectHealth = health(summary);
  const cards: Array<[string, string, string]> = [
    ["Project budget", money(summary.budget, project.currency), "text-indigo-700 bg-indigo-50"],
    ["Supplier invoices", money(summary.invoiceCost, project.currency), "text-sky-700 bg-sky-50"],
    ["Payroll / labor", money(summary.payrollCost, project.currency), "text-violet-700 bg-violet-50"],
    ["Other expenses", money(summary.otherExpenseCost, project.currency), "text-amber-700 bg-amber-50"],
    ["Total actual cost", money(summary.totalActualCost, project.currency), "text-emerald-700 bg-emerald-50"],
    ["Remaining budget", money(summary.remainingBudget, project.currency), summary.remainingBudget < 0 ? "text-rose-700 bg-rose-50" : "text-emerald-700 bg-emerald-50"],
  ];
  const hasCostActivity = summary.totalActualCost > 0 || summary.pendingInvoiceCost > 0 || summary.pendingPayrollCost > 0 || summary.pendingExpenseCost > 0;

  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex min-w-0 items-center gap-3">{onBack && <button type="button" onClick={onBack} className="rounded-xl border border-slate-200 bg-white p-2" aria-label="Back to projects"><ArrowLeft className="h-4 w-4" /></button>}<div className="min-w-0"><p className="text-[10px] font-black uppercase tracking-[0.18em] text-indigo-600">{project.projectCode || "Project reference missing"}</p><h2 className="truncate text-xl font-black text-slate-950 sm:text-2xl">{project.projectName || "Unnamed project"}</h2></div></div><div className="flex items-center gap-2"><span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${project.status === "ACTIVE" ? "bg-emerald-100 text-emerald-800" : project.status === "ARCHIVED" ? "bg-slate-200 text-slate-600" : "bg-indigo-100 text-indigo-800"}`}>{project.status.replaceAll("_", " ")}</span>{onEdit && <button type="button" onClick={onEdit} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold"><Pencil className="h-3.5 w-3.5" /> Edit</button>}{onArchive && project.status !== "ARCHIVED" && <button type="button" onClick={onArchive} className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-800">Archive</button>}</div></div>

    <section className="rounded-2xl bg-slate-950 p-5 text-white shadow-lg"><div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end"><div className="space-y-2"><p className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-200">Project workspace</p><div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-slate-300"><span className="inline-flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5 text-indigo-300" />{project.location || project.siteAddress || "Location not set"}</span><span className="inline-flex items-center gap-1.5"><BriefcaseBusiness className="h-3.5 w-3.5 text-indigo-300" />{project.clientName || "Client not set"}</span><span className="inline-flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5 text-indigo-300" />{project.projectManager || "Project manager not set"}</span></div><p className="max-w-2xl text-xs leading-5 text-slate-400">{project.description || project.notes || "No project description or notes have been recorded."}</p></div><div className="lg:text-right"><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Financial health</p><p className={`text-lg font-black ${projectHealth === "OVER BUDGET" ? "text-rose-300" : projectHealth === "NEAR LIMIT" ? "text-amber-300" : "text-emerald-300"}`}>{projectHealth}</p><p className="mt-0.5 text-xs text-slate-400">{Number(summary.budgetUsedPercent || 0).toFixed(1)}% of budget used</p></div></div></section>

    <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">{cards.map(([label, value, tone]) => <div key={label} className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className={`flex h-8 w-8 items-center justify-center rounded-xl ${tone}`}><WalletCards className="h-4 w-4" /></div><p className="mt-3 break-words text-sm font-black tabular-nums">{value}</p><p className="mt-1 text-[10px] font-semibold text-slate-500">{label}</p></div>)}</section>

    <section className="grid gap-4 lg:grid-cols-2"><div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><h3 className="text-sm font-black">Cost breakdown</h3><span className="text-[10px] font-bold text-slate-400">Confirmed costs</span></div>{hasCostActivity ? <div className="mt-4 space-y-3">{[["Supplier invoices", summary.invoiceCost], ["Payroll / labor", summary.payrollCost], ["Other expenses", summary.otherExpenseCost]].map(([label, value]) => <div key={String(label)} className="flex items-center justify-between gap-3 text-xs"><span className="font-semibold text-slate-600">{label}</span><span className="font-black tabular-nums">{money(Number(value), project.currency)}</span></div>)}<div className="mt-1 flex items-center justify-between gap-3 border-t border-slate-100 pt-3"><span className="font-black">Total actual cost</span><span className="font-black tabular-nums">{money(summary.totalActualCost, project.currency)}</span></div></div> : <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-xs text-slate-500">No project cost activity yet. Confirmed invoice allocations, payroll, and direct expenses will appear here.</div>}</div><div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h3 className="text-sm font-black">Pending / committed</h3><div className="mt-4 space-y-3">{[["Pending invoice review", summary.pendingInvoiceCost], ["Pending payroll", summary.pendingPayrollCost], ["Draft expenses", summary.pendingExpenseCost], ["Committed unpaid invoices", summary.committedCost]].map(([label, value]) => <div key={String(label)} className="flex items-center justify-between gap-3 text-xs"><span className="font-semibold text-slate-600">{label}</span><span className="font-black tabular-nums">{money(Number(value), project.currency)}</span></div>)}</div>{Object.keys(summary.foreignCosts || {}).length > 0 && <p className="mt-4 border-t border-slate-100 pt-3 text-[10px] text-slate-500">Foreign costs remain separate: {Object.entries(summary.foreignCosts).map(([currency, value]) => `${currency} ${Number(value).toFixed(2)}`).join(" • ")}</p>}{summary.remainingBudget < 0 && <p className="mt-4 flex items-center gap-1.5 rounded-xl bg-rose-50 px-3 py-2 text-[10px] font-bold text-rose-700"><AlertTriangle className="h-3.5 w-3.5" /> This project is over budget.</p>}</div></section>
  </div>;
};
