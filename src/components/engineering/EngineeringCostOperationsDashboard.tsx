import React from "react";
import {
  AlertTriangle,
  ArrowUpRight,
  BarChart3,
  BriefcaseBusiness,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  FileWarning,
  HardHat,
  Mail,
  Receipt,
  RotateCcw,
  WalletCards,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { AppTab } from "../../utils/routes";
import type { InvoiceData } from "../../types";

export type DashboardActivityPeriod = "MONTH" | "QUARTER" | "YEAR" | "CUSTOM";

export interface DashboardProjectRow {
  projectId: string;
  projectCode: string;
  projectName: string;
  currency: string;
  budget: number;
  confirmed: number;
  pending: number;
  remaining: number;
  excess: number;
  availableAfterCommitments: number;
  confirmedUtilization: number;
  commitmentUtilization: number;
  health: "NO BUDGET" | "OVER BUDGET" | "NEAR LIMIT" | "ON BUDGET";
  invoiceCost: number;
  payrollCost: number;
  expenseCost: number;
  outstandingPayables: number;
  invoiceCount: number;
}

export interface DashboardInvoiceOperations {
  totalsByCurrency: Record<string, number>;
  outstandingByCurrency: Record<string, number>;
  vatByCurrency: Record<string, number>;
  overdueCount: number;
  needsReviewCount: number;
  verifiedCount: number;
  totalCount: number;
  phpVatable: number;
  phpZeroRated: number;
  phpExempt: number;
  phpMissingVatDetails: number;
  phNeedsReviewCount: number;
  recent: InvoiceData[];
}

export interface DashboardAttentionItem {
  id: string;
  label: string;
  detail: string;
  count?: number;
  action: "review" | "invoices" | "projects" | "payroll" | "expenses";
  projectId?: string;
}

export interface DashboardViewData {
  selectedCurrency: string;
  currencies: string[];
  activityPeriod: DashboardActivityPeriod;
  activityStart: string;
  activityEnd: string;
  activityLabel: string;
  activeProjects: number;
  totalProjectBudget: number;
  confirmedProjectCost: number;
  pendingProjectCost: number;
  availableAfterCommitments: number;
  outstandingPayables: number;
  projectRows: DashboardProjectRow[];
  monthlyCostTrend: Array<{ label: string; invoices: number; payroll: number; expenses: number; total: number }>;
  costComposition: Array<{ name: string; value: number; color: string }>;
  budgetUtilization: Array<{ projectId: string; label: string; used: number; health: DashboardProjectRow["health"] }>;
  payableAging: Array<{ bucket: string; value: number }>;
  unknownDueDatePayables: number;
  payrollTrend: Array<{ label: string; projectLabor: number; overhead: number; unallocated: number; total: number }>;
  expenseTrend: Array<{ label: string; directExpenses: number }>;
  unallocatedByCurrency: Array<{ currency: string; invoices: number; payroll: number; expenses: number; total: number }>;
  overheadByCurrency: Array<{ currency: string; adminOffice: number; generalOverhead: number; total: number }>;
  payrollSummary: {
    currentPeriodLabel: string;
    activeWorkers: number;
    grossPayroll: number;
    projectLabor: number;
    overhead: number;
    unallocatedLabor: number;
    runStatus: string;
    blockingIssues: number;
    warnings: number;
  };
  expenseSummary: {
    selectedPeriodTotal: number;
    confirmedProjectExpenses: number;
    pendingProjectExpenses: number;
    unallocatedExpenses: number;
  };
  attention: DashboardAttentionItem[];
  invoiceOperations: DashboardInvoiceOperations;
}

export interface EngineeringCostOperationsDashboardProps {
  data: DashboardViewData;
  projects: readonly { id: string; projectCode: string; projectName: string }[];
  onActivityPeriodChange: (period: DashboardActivityPeriod) => void;
  onCustomRangeChange?: (start: string, end: string) => void;
  onCurrencyChange: (currency: string) => void;
  onNavigate: (tab: AppTab) => void;
  onOpenProject: (projectId: string) => void;
  onOpenInvoice: (invoice: InvoiceData) => void;
}

const COMPOSITION_COLORS = ["#4f46e5", "#8b5cf6", "#f59e0b"];

function money(value: number, currency: string) {
  const amount = Number.isFinite(value) ? value : 0;
  try {
    return new Intl.NumberFormat("en-PH", { style: "currency", currency: currency || "PHP", maximumFractionDigits: 0 }).format(amount);
  } catch {
    return `${currency || "PHP"} ${amount.toFixed(0)}`;
  }
}

function compactMoney(value: number, currency: string) {
  const amount = Number.isFinite(value) ? value : 0;
  if (Math.abs(amount) >= 1_000_000) return `${currency} ${(amount / 1_000_000).toFixed(1)}m`;
  if (Math.abs(amount) >= 1_000) return `${currency} ${(amount / 1_000).toFixed(0)}k`;
  return money(amount, currency);
}

function percent(value: number) {
  return `${(Number.isFinite(value) ? value : 0).toFixed(1)}%`;
}

function healthClass(health: DashboardProjectRow["health"]) {
  if (health === "OVER BUDGET") return "bg-rose-50 text-rose-700";
  if (health === "NEAR LIMIT") return "bg-amber-50 text-amber-800";
  if (health === "NO BUDGET") return "bg-slate-100 text-slate-600";
  return "bg-emerald-50 text-emerald-700";
}

function ChartEmpty({ message }: { message: string }) {
  return <div className="flex min-h-[210px] items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 px-5 text-center text-xs text-slate-500">{message}</div>;
}

function ChartCard({ title, description, children, className = "" }: { title: string; description: string; children: React.ReactNode; className?: string }) {
  return <section className={`rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5 ${className}`} aria-label={title}>
    <div className="mb-4 flex items-start justify-between gap-3"><div><h2 className="text-sm font-black text-slate-950">{title}</h2><p className="mt-1 text-[10px] leading-4 text-slate-500">{description}</p></div><BarChart3 className="h-4 w-4 shrink-0 text-indigo-500" aria-hidden="true" /></div>
    {children}
  </section>;
}

function MetricCard({ label, value, helper, icon: Icon, tone }: { label: string; value: string | number; helper?: string; icon: React.ElementType; tone: string }) {
  return <article className="min-w-0 rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm sm:p-4"><div className={`flex h-8 w-8 items-center justify-center rounded-xl ${tone}`}><Icon className="h-4 w-4" aria-hidden="true" /></div><p className="mt-3 break-words text-base font-black tabular-nums text-slate-950 sm:text-lg">{value}</p><p className="mt-1 text-[10px] font-semibold text-slate-500">{label}</p>{helper && <p className="mt-1 text-[9px] text-slate-400">{helper}</p>}</article>;
}

function chartMoney(value: unknown, currency: string) {
  return money(typeof value === "number" ? value : Number(value) || 0, currency);
}

function renderTooltip(currency: string, labels: Record<string, string> = {}) {
  return ({ active, payload, label }: { active?: boolean; payload?: Array<{ name?: string; value?: number; color?: string }>; label?: string | number }) => {
    if (!active || !payload?.length) return null;
    return <div className="rounded-xl border border-slate-200 bg-white p-3 text-[10px] shadow-xl"><p className="mb-2 font-black text-slate-900">{label}</p>{payload.map((item) => <p key={`${item.name}-${item.value}`} className="flex items-center justify-between gap-5 text-slate-600"><span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color || "#64748b" }} />{labels[item.name || ""] || item.name}</span><span className="font-black tabular-nums text-slate-900">{chartMoney(item.value, currency)}</span></p>)}</div>;
  };
}

export const EngineeringCostOperationsDashboard: React.FC<EngineeringCostOperationsDashboardProps> = ({ data, projects, selectedProjectId, onProjectChange, onActivityPeriodChange, onCustomRangeChange, onCurrencyChange, onNavigate, onOpenProject, onOpenInvoice }) => {
  const invoiceCurrencyTotal = data.invoiceOperations.totalsByCurrency[data.selectedCurrency] || 0;
  const invoiceCurrencyOutstanding = data.invoiceOperations.outstandingByCurrency[data.selectedCurrency] || 0;
  const invoiceCurrencyVat = data.invoiceOperations.vatByCurrency[data.selectedCurrency] || 0;
  const compositionTotal = data.costComposition.reduce((sum, item) => sum + item.value, 0);
  const hasCurrencies = data.currencies.length > 1;
  const hasBudgetRows = data.projectRows.length > 0;
  const hasTrend = data.monthlyCostTrend.some((row) => row.total > 0);
  const hasPayrollTrend = data.payrollTrend.some((row) => row.total > 0);
  const hasExpenses = data.expenseTrend.some((row) => row.directExpenses > 0);

  const attentionAction = (item: DashboardAttentionItem) => {
    if (item.projectId) onOpenProject(item.projectId);
    else onNavigate(item.action);
  };

  return <div className="space-y-5">
    <section className="rounded-2xl bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-900 p-5 text-white shadow-lg sm:p-6">
      <div className="flex flex-col justify-between gap-5 xl:flex-row xl:items-end"><div><p className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-200">Engineering cost control</p><h1 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">Engineering Cost Operations</h1><p className="mt-2 max-w-2xl text-xs leading-5 text-slate-300">Lifetime project position stays separate from activity during {data.activityLabel.toLowerCase()}. Confirmed cost, commitments, payables, and unallocated amounts use one prepared accounting view.</p></div><div className="flex flex-wrap gap-2"><button type="button" onClick={() => onNavigate("projects")} className="inline-flex items-center gap-1.5 rounded-xl bg-white px-3.5 py-2.5 text-xs font-black text-slate-950"><BriefcaseBusiness className="h-3.5 w-3.5" /> Projects</button><button type="button" onClick={() => onNavigate("payroll")} className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-500 px-3.5 py-2.5 text-xs font-black text-white"><HardHat className="h-3.5 w-3.5" /> Payroll</button><button type="button" onClick={() => onNavigate("expenses")} className="inline-flex items-center gap-1.5 rounded-xl border border-white/20 bg-white/10 px-3.5 py-2.5 text-xs font-black text-white"><Receipt className="h-3.5 w-3.5" /> Expenses</button></div></div>
      <div className="mt-5 grid gap-3 rounded-2xl border border-white/10 bg-white/5 p-3 sm:grid-cols-3 sm:items-end"><label className="space-y-1"><span className="field-label text-indigo-100">Project filter</span><select value={selectedProjectId} onChange={(event) => onProjectChange(event.target.value)} className="field-input border-white/20 bg-white/10 text-white"><option className="text-slate-900" value="">All projects</option>{projects.map((project) => <option className="text-slate-900" key={project.id} value={project.id}>{project.projectCode} — {project.projectName}</option>)}</select></label><label className="space-y-1"><span className="field-label text-indigo-100">Project position currency</span><select value={data.selectedCurrency} onChange={(event) => onCurrencyChange(event.target.value)} className="field-input border-white/20 bg-white/10 text-white"><option className="text-slate-900" value={data.selectedCurrency}>{data.selectedCurrency}</option>{data.currencies.filter((currency) => currency !== data.selectedCurrency).map((currency) => <option className="text-slate-900" key={currency} value={currency}>{currency}</option>)}</select></label><label className="space-y-1"><span className="field-label text-indigo-100">Activity period</span><select value={data.activityPeriod} onChange={(event) => onActivityPeriodChange(event.target.value as DashboardActivityPeriod)} className="field-input border-white/20 bg-white/10 text-white"><option className="text-slate-900" value="MONTH">Month</option><option className="text-slate-900" value="QUARTER">Quarter</option><option className="text-slate-900" value="YEAR">Year</option><option className="text-slate-900" value="CUSTOM">Custom</option></select></label>{data.activityPeriod === "CUSTOM" && <div className="grid grid-cols-2 gap-2 sm:col-span-2"><label className="space-y-1"><span className="field-label text-indigo-100">From</span><input type="date" defaultValue={data.activityStart} onChange={(event) => onCustomRangeChange?.(event.target.value, data.activityEnd)} className="field-input border-white/20 bg-white/10 text-white" /></label><label className="space-y-1"><span className="field-label text-indigo-100">To</span><input type="date" defaultValue={data.activityEnd} onChange={(event) => onCustomRangeChange?.(data.activityStart, event.target.value)} className="field-input border-white/20 bg-white/10 text-white" /></label></div>}{hasCurrencies && <p className="text-[10px] leading-4 text-indigo-100 sm:max-w-[14rem]">Currencies are never converted or combined. Switch the selector to review another currency.</p>}</div>
    </section>

    <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6" aria-label="Lifetime project position">
      <MetricCard label="Active projects" value={data.activeProjects} icon={BriefcaseBusiness} tone="bg-indigo-50 text-indigo-700" />
      <MetricCard label="Total project budget" value={money(data.totalProjectBudget, data.selectedCurrency)} helper="Lifetime position" icon={WalletCards} tone="bg-sky-50 text-sky-700" />
      <MetricCard label="Confirmed project cost" value={money(data.confirmedProjectCost, data.selectedCurrency)} helper="Verified / approved / paid" icon={CircleDollarSign} tone="bg-emerald-50 text-emerald-700" />
      <MetricCard label="Pending commitments" value={money(data.pendingProjectCost, data.selectedCurrency)} helper="Review, draft, calculated" icon={Clock3} tone="bg-amber-50 text-amber-700" />
      <MetricCard label="Available after commitments" value={money(data.availableAfterCommitments, data.selectedCurrency)} helper="Budget − confirmed − pending" icon={BarChart3} tone={data.availableAfterCommitments < 0 ? "bg-rose-50 text-rose-700" : "bg-violet-50 text-violet-700"} />
      <MetricCard label="Outstanding payables" value={money(data.outstandingPayables, data.selectedCurrency)} helper="Supplier cash position" icon={Receipt} tone="bg-orange-50 text-orange-700" />
    </section>

    <ChartCard title="Project budget position" description="Lifetime position, sorted by financial pressure. Remaining never goes below zero; excess shows as a separate extension.">
      {!hasBudgetRows ? <ChartEmpty message="No active projects yet." /> : <><div className="h-[300px] w-full sm:h-[360px]"><ResponsiveContainer width="100%" height="100%"><BarChart data={data.projectRows} layout="vertical" margin={{ top: 4, right: 18, bottom: 4, left: 4 }} barCategoryGap="20%"><CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" /><XAxis type="number" tickFormatter={(value) => compactMoney(Number(value), data.selectedCurrency)} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} /><YAxis type="category" dataKey="projectCode" width={78} tick={{ fontSize: 10, fontWeight: 700 }} axisLine={false} tickLine={false} /><Tooltip content={renderTooltip(data.selectedCurrency, { confirmed: "Confirmed", pending: "Pending", remaining: "Remaining", excess: "Over commitment" })} /><Legend wrapperStyle={{ fontSize: 10 }} /><Bar dataKey="confirmed" stackId="position" fill="#4f46e5" name="Confirmed" /><Bar dataKey="pending" stackId="position" fill="#f59e0b" name="Pending" /><Bar dataKey="remaining" stackId="position" fill="#cbd5e1" name="Remaining" /><Bar dataKey="excess" stackId="position" fill="#e11d48" name="Over commitment" /></BarChart></ResponsiveContainer></div><div className="mt-3 grid gap-2 text-[10px] text-slate-500 sm:grid-cols-3"><p><strong className="text-slate-700">Confirmed</strong> is lifetime project cost.</p><p><strong className="text-slate-700">Pending</strong> is a commitment, not actual cost.</p><p><strong className="text-slate-700">Available</strong> is shown in each project row below.</p></div></>}
    </ChartCard>

    <section className="grid gap-4 xl:grid-cols-[1.45fr_0.85fr]">
      <ChartCard title="Monthly cost trend" description={`Confirmed project activity during ${data.activityLabel.toLowerCase()}, using invoice date, expense date, and payroll period end.`}>
        {!hasTrend ? <ChartEmpty message="No confirmed project costs in this period." /> : <div className="h-[280px] w-full"><ResponsiveContainer width="100%" height="100%"><ComposedChart data={data.monthlyCostTrend} margin={{ top: 4, right: 12, bottom: 4, left: 0 }}><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" /><XAxis dataKey="label" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} /><YAxis tickFormatter={(value) => compactMoney(Number(value), data.selectedCurrency)} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} /><Tooltip content={renderTooltip(data.selectedCurrency, { invoices: "Supplier invoices", payroll: "Project payroll", expenses: "Direct expenses", total: "Total" })} /><Legend wrapperStyle={{ fontSize: 10 }} /><Bar dataKey="invoices" stackId="cost" fill="#4f46e5" name="Supplier invoices" /><Bar dataKey="payroll" stackId="cost" fill="#8b5cf6" name="Project payroll" /><Bar dataKey="expenses" stackId="cost" fill="#f59e0b" name="Direct expenses" /><Line type="monotone" dataKey="total" stroke="#0f172a" strokeWidth={2} dot={false} name="Total" /></ComposedChart></ResponsiveContainer></div>}
      </ChartCard>
      <ChartCard title="Confirmed cost composition" description="Only supplier invoices, project payroll, and direct project expenses are additive project-cost categories.">
        {!compositionTotal ? <ChartEmpty message="No confirmed project costs yet." /> : <><div className="h-[210px] w-full"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={data.costComposition} dataKey="value" nameKey="name" innerRadius={58} outerRadius={82} paddingAngle={2}>{data.costComposition.map((item, index) => <Cell key={item.name} fill={item.color || COMPOSITION_COLORS[index % COMPOSITION_COLORS.length]} />)}</Pie><Tooltip formatter={(value: number | string) => chartMoney(Number(value), data.selectedCurrency)} /></PieChart></ResponsiveContainer></div><div className="space-y-2">{data.costComposition.map((item) => <div key={item.name} className="flex items-center justify-between gap-3 text-xs"><span className="flex items-center gap-2 text-slate-600"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />{item.name}</span><span className="font-black tabular-nums">{money(item.value, data.selectedCurrency)} <span className="font-semibold text-slate-400">{percent(compositionTotal ? item.value / compositionTotal * 100 : 0)}</span></span></div>)}</div></>}
      </ChartCard>
    </section>

    <section className="grid gap-4 lg:grid-cols-2">
      <ChartCard title="Project budget utilization" description="Same confirmed utilization and canonical health state used in the project table.">
        {!data.budgetUtilization.length ? <ChartEmpty message="No budgeted projects yet." /> : <div className="h-[280px] w-full"><ResponsiveContainer width="100%" height="100%"><BarChart data={data.budgetUtilization} layout="vertical" margin={{ top: 4, right: 20, bottom: 4, left: 4 }}><CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" /><XAxis type="number" domain={[0, "dataMax"]} tickFormatter={(value) => `${Number(value).toFixed(0)}%`} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} /><YAxis type="category" dataKey="label" width={112} tick={{ fontSize: 10, fontWeight: 700 }} axisLine={false} tickLine={false} /><Tooltip formatter={(value: number | string) => percent(Number(value))} /><ReferenceLine x={90} stroke="#f59e0b" strokeDasharray="4 4" label={{ value: "90%", position: "top", fontSize: 9 }} /><Bar dataKey="used" name="Confirmed utilization" fill="#4f46e5" radius={[0, 5, 5, 0]} /></BarChart></ResponsiveContainer></div>}
      </ChartCard>
      <ChartCard title="Current payables aging" description="Current unpaid supplier balances by due date. This is not a historical payable trend.">
        {!data.payableAging.some((item) => item.value > 0) ? <ChartEmpty message={`No outstanding ${data.selectedCurrency} payables.`} /> : <><div className="h-[240px] w-full"><ResponsiveContainer width="100%" height="100%"><BarChart data={data.payableAging} margin={{ top: 4, right: 12, bottom: 4, left: 0 }}><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" /><XAxis dataKey="bucket" tick={{ fontSize: 9 }} axisLine={false} tickLine={false} /><YAxis tickFormatter={(value) => compactMoney(Number(value), data.selectedCurrency)} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} /><Tooltip content={renderTooltip(data.selectedCurrency)} /><Bar dataKey="value" name="Outstanding payable" fill="#f97316" radius={[5, 5, 0, 0]} /></BarChart></ResponsiveContainer></div>{data.unknownDueDatePayables > 0 && <p className="mt-2 text-[10px] text-slate-500">{money(data.unknownDueDatePayables, data.selectedCurrency)} has no valid due date and is kept outside the aging buckets.</p>}</>}
      </ChartCard>
    </section>

    <section className="grid gap-4 lg:grid-cols-2">
      <ChartCard title="Project labor vs admin / overhead" description="Payroll activity by payroll period end. Overhead is not included in project budget utilization.">
        {!hasPayrollTrend ? <ChartEmpty message="No payroll activity in this period." /> : <div className="h-[270px] w-full"><ResponsiveContainer width="100%" height="100%"><ComposedChart data={data.payrollTrend} margin={{ top: 4, right: 12, bottom: 4, left: 0 }}><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" /><XAxis dataKey="label" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} /><YAxis tickFormatter={(value) => compactMoney(Number(value), data.selectedCurrency)} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} /><Tooltip content={renderTooltip(data.selectedCurrency, { projectLabor: "Project labor", overhead: "Admin / overhead", unallocated: "Unallocated labor", total: "Total payroll" })} /><Legend wrapperStyle={{ fontSize: 10 }} /><Bar dataKey="projectLabor" stackId="payroll" fill="#8b5cf6" name="Project labor" /><Bar dataKey="overhead" stackId="payroll" fill="#64748b" name="Admin / overhead" /><Bar dataKey="unallocated" stackId="payroll" fill="#f59e0b" name="Unallocated labor" /><Line type="monotone" dataKey="total" stroke="#0f172a" strokeWidth={2} dot={false} name="Total payroll" /></ComposedChart></ResponsiveContainer></div>}
      </ChartCard>
      <ChartCard title="Monthly direct expenses" description="Confirmed and pending expense trend uses expenseDate; category labels are not used as accounting rules.">
        {!hasExpenses ? <ChartEmpty message="No direct expenses in this period." /> : <div className="h-[270px] w-full"><ResponsiveContainer width="100%" height="100%"><BarChart data={data.expenseTrend} margin={{ top: 4, right: 12, bottom: 4, left: 0 }}><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" /><XAxis dataKey="label" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} /><YAxis tickFormatter={(value) => compactMoney(Number(value), data.selectedCurrency)} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} /><Tooltip content={renderTooltip(data.selectedCurrency, { directExpenses: "Direct expenses" })} /><Bar dataKey="directExpenses" name="Direct expenses" fill="#f59e0b" radius={[5, 5, 0, 0]} /></BarChart></ResponsiveContainer></div>}
      </ChartCard>
    </section>

    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start"><div><h2 className="text-sm font-black">Unallocated cost reconciliation</h2><p className="mt-1 text-[10px] leading-4 text-slate-500">Residual invoice, payroll, and expense values by currency. This is not derived by adding project rows.</p></div><RotateCcw className="h-4 w-4 text-indigo-500" aria-hidden="true" /></div>{data.unallocatedByCurrency.length ? <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{data.unallocatedByCurrency.map((row) => <div key={row.currency} className="rounded-xl border border-slate-100 bg-slate-50 p-3"><p className="text-xs font-black text-slate-900">{row.currency}</p><div className="mt-2 space-y-1 text-[10px] text-slate-600"><p className="flex justify-between gap-3"><span>Invoices</span><strong>{money(row.invoices, row.currency)}</strong></p><p className="flex justify-between gap-3"><span>Payroll</span><strong>{money(row.payroll, row.currency)}</strong></p><p className="flex justify-between gap-3"><span>Expenses</span><strong>{money(row.expenses, row.currency)}</strong></p><p className="mt-2 flex justify-between gap-3 border-t border-slate-200 pt-2 font-black text-slate-900"><span>Total</span><strong>{money(row.total, row.currency)}</strong></p></div></div>)}</div> : <div className="mt-4 rounded-xl border border-dashed border-emerald-200 bg-emerald-50 p-4 text-xs font-semibold text-emerald-800">No unallocated {data.selectedCurrency} costs.</div>}</section>

    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start"><div><h2 className="text-sm font-black">Company payroll overhead</h2><p className="mt-1 text-[10px] leading-4 text-slate-500">Administrative / office and general overhead payroll. Not included in project budget utilization.</p></div><HardHat className="h-4 w-4 text-slate-500" aria-hidden="true" /></div>{data.overheadByCurrency.length ? <div className="mt-4 grid gap-3 sm:grid-cols-3">{data.overheadByCurrency.map((row) => <div key={row.currency} className="rounded-xl bg-slate-50 p-3"><p className="text-xs font-black">{row.currency}</p><p className="mt-2 text-[10px] text-slate-600">Administrative / Office <strong className="float-right text-slate-900">{money(row.adminOffice, row.currency)}</strong></p><p className="mt-1 text-[10px] text-slate-600">General overhead <strong className="float-right text-slate-900">{money(row.generalOverhead, row.currency)}</strong></p><p className="mt-2 border-t border-slate-200 pt-2 text-xs font-black">Total <span className="float-right">{money(row.total, row.currency)}</span></p></div>)}</div> : <p className="mt-4 text-xs text-slate-500">No company payroll overhead recorded.</p>}</section>

    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="flex flex-col justify-between gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-start sm:p-5"><div><h2 className="text-sm font-black">Project performance</h2><p className="mt-1 text-[10px] text-slate-500">Lifetime budget position; default order is greatest commitment pressure first.</p></div><button type="button" onClick={() => onNavigate("projects")} className="inline-flex items-center gap-1 text-[10px] font-black text-indigo-600">Open projects <ArrowUpRight className="h-3 w-3" /></button></div>{data.projectRows.length ? <div className="overflow-x-auto"><table className="min-w-[980px] w-full text-left text-xs"><thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Project</th><th className="px-4 py-3">Budget</th><th className="px-4 py-3">Confirmed</th><th className="px-4 py-3">Pending</th><th className="px-4 py-3">Available</th><th className="px-4 py-3">Invoices</th><th className="px-4 py-3">Labor</th><th className="px-4 py-3">Expenses</th><th className="px-4 py-3">Used %</th><th className="px-4 py-3">Health</th></tr></thead><tbody className="divide-y divide-slate-100">{data.projectRows.map((row) => <tr key={row.projectId} className="cursor-pointer hover:bg-slate-50" onClick={() => onOpenProject(row.projectId)}><td className="px-4 py-3"><button type="button" className="text-left" onClick={(event) => { event.stopPropagation(); onOpenProject(row.projectId); }}><p className="font-black text-indigo-700">{row.projectCode}</p><p className="mt-0.5 font-semibold text-slate-900">{row.projectName}</p></button></td><td className="px-4 py-3 font-black tabular-nums">{money(row.budget, row.currency)}</td><td className="px-4 py-3 font-black tabular-nums">{money(row.confirmed, row.currency)}</td><td className="px-4 py-3 font-black tabular-nums">{money(row.pending, row.currency)}</td><td className={`px-4 py-3 font-black tabular-nums ${row.availableAfterCommitments < 0 ? "text-rose-700" : "text-emerald-700"}`}>{money(row.availableAfterCommitments, row.currency)}</td><td className="px-4 py-3 tabular-nums">{money(row.invoiceCost, row.currency)}</td><td className="px-4 py-3 tabular-nums">{money(row.payrollCost, row.currency)}</td><td className="px-4 py-3 tabular-nums">{money(row.expenseCost, row.currency)}</td><td className="px-4 py-3 font-black tabular-nums">{percent(row.confirmedUtilization)}</td><td className="px-4 py-3"><span className={`rounded-full px-2 py-1 text-[9px] font-black ${healthClass(row.health)}`}>{row.health}</span></td></tr>)}</tbody></table></div> : <div className="p-10 text-center text-xs text-slate-500">No active projects yet.</div>}</section>

    <section className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]"><section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"><div className="flex items-start justify-between gap-3"><div><h2 className="text-sm font-black">Needs attention</h2><p className="mt-1 text-[10px] text-slate-500">Each item opens an existing workflow or record route.</p></div><FileWarning className="h-4 w-4 text-amber-600" aria-hidden="true" /></div>{data.attention.length ? <div className="mt-4 space-y-2">{data.attention.slice(0, 8).map((item) => <button type="button" key={item.id} onClick={() => attentionAction(item)} className="flex w-full items-start justify-between gap-3 rounded-xl border border-slate-100 p-3 text-left hover:border-indigo-200 hover:bg-indigo-50/40"><span className="flex min-w-0 items-start gap-2"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" aria-hidden="true" /><span className="min-w-0"><strong className="block text-xs text-slate-800">{item.label}{item.count !== undefined ? ` · ${item.count}` : ""}</strong><span className="mt-0.5 block text-[10px] text-slate-500">{item.detail}</span></span></span><ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-indigo-500" aria-hidden="true" /></button>)}</div> : <div className="mt-4 rounded-xl border border-dashed border-emerald-200 bg-emerald-50 p-4 text-xs font-semibold text-emerald-800"><CheckCircle2 className="mr-1.5 inline h-4 w-4" aria-hidden="true" />No urgent management exceptions.</div>}</section><section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"><div className="flex items-start justify-between gap-3"><div><h2 className="text-sm font-black">Payroll summary</h2><p className="mt-1 text-[10px] text-slate-500">Current payroll status and labor classification.</p></div><HardHat className="h-4 w-4 text-violet-600" aria-hidden="true" /></div><div className="mt-4 grid grid-cols-2 gap-2 text-[10px]"><SummaryValue label="Current period" value={data.payrollSummary.currentPeriodLabel} /><SummaryValue label="Active workers" value={String(data.payrollSummary.activeWorkers)} /><SummaryValue label="Gross payroll" value={money(data.payrollSummary.grossPayroll, data.selectedCurrency)} /><SummaryValue label="Project labor" value={money(data.payrollSummary.projectLabor, data.selectedCurrency)} /><SummaryValue label="Admin / overhead" value={money(data.payrollSummary.overhead, data.selectedCurrency)} /><SummaryValue label="Unallocated labor" value={money(data.payrollSummary.unallocatedLabor, data.selectedCurrency)} /><SummaryValue label="Run status" value={data.payrollSummary.runStatus} /><SummaryValue label="Issues / warnings" value={`${data.payrollSummary.blockingIssues} / ${data.payrollSummary.warnings}`} /></div><button type="button" onClick={() => onNavigate("payroll")} className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-2 text-[10px] font-black text-white">Open Payroll <ArrowUpRight className="h-3 w-3" /></button></section></section>

    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"><div className="flex items-start justify-between gap-3"><div><h2 className="text-sm font-black">Expense summary</h2><p className="mt-1 text-[10px] text-slate-500">Selected-period direct expenses; unassigned expenses remain non-project, not overhead.</p></div><Receipt className="h-4 w-4 text-amber-600" aria-hidden="true" /></div><div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4"><SummaryValue label="Selected-period total" value={money(data.expenseSummary.selectedPeriodTotal, data.selectedCurrency)} /><SummaryValue label="Confirmed project expenses" value={money(data.expenseSummary.confirmedProjectExpenses, data.selectedCurrency)} /><SummaryValue label="Pending project expenses" value={money(data.expenseSummary.pendingProjectExpenses, data.selectedCurrency)} /><SummaryValue label="Unallocated / non-project" value={money(data.expenseSummary.unallocatedExpenses, data.selectedCurrency)} /></div><button type="button" onClick={() => onNavigate("expenses")} className="mt-4 inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-[10px] font-black text-slate-700">Open Expenses <ArrowUpRight className="h-3 w-3" /></button></section>

    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start"><div><h2 className="text-sm font-black">Invoice operations</h2><p className="mt-1 text-[10px] text-slate-500">Intake and VAT analysis remain available without crowding the management KPIs.</p></div><div className="flex flex-wrap gap-2"><button type="button" onClick={() => onNavigate("extractor")} className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-2 text-[10px] font-black text-white"><Receipt className="h-3 w-3" /> Upload</button><button type="button" onClick={() => onNavigate("review")} className="inline-flex items-center gap-1.5 rounded-xl bg-amber-400 px-3 py-2 text-[10px] font-black text-amber-950"><AlertTriangle className="h-3 w-3" /> Review {data.invoiceOperations.needsReviewCount}</button><button type="button" onClick={() => onNavigate("inbox")} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-[10px] font-black text-slate-700"><Mail className="h-3 w-3" /> Process email</button></div></div><div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6"><SummaryValue label="Total invoice value" value={money(invoiceCurrencyTotal, data.selectedCurrency)} /><SummaryValue label="Outstanding" value={money(invoiceCurrencyOutstanding, data.selectedCurrency)} /><SummaryValue label="Overdue" value={String(data.invoiceOperations.overdueCount)} /><SummaryValue label="VAT amount" value={money(invoiceCurrencyVat, data.selectedCurrency)} /><SummaryValue label="Needs review" value={String(data.invoiceOperations.needsReviewCount)} /><SummaryValue label="Verified" value={String(data.invoiceOperations.verifiedCount)} /></div><div className="mt-4 grid gap-4 lg:grid-cols-2"><div className="rounded-xl bg-slate-50 p-3"><h3 className="text-xs font-black">Currency breakdown</h3>{Object.keys(data.invoiceOperations.totalsByCurrency).length ? <div className="mt-3 space-y-2">{Object.entries(data.invoiceOperations.totalsByCurrency).map(([currency, value]) => <div key={currency} className="flex items-center justify-between gap-3 text-[10px]"><span className="font-bold text-slate-700">{currency}</span><span className="font-black tabular-nums">{money(Number(value) || 0, currency)} <span className="font-semibold text-slate-400">outstanding {money(data.invoiceOperations.outstandingByCurrency[currency] || 0, currency)}</span></span></div>)}</div> : <p className="mt-3 text-xs text-slate-500">No invoice activity yet.</p>}</div><div className="rounded-xl bg-slate-50 p-3"><h3 className="text-xs font-black">Philippine VAT summary</h3><div className="mt-3 grid grid-cols-2 gap-2 text-[10px]"><SummaryValue label="VATable purchases" value={money(data.invoiceOperations.phpVatable, "PHP")} /><SummaryValue label="VAT amount" value={money(data.invoiceOperations.vatByCurrency.PHP || 0, "PHP")} /><SummaryValue label="Zero-rated" value={money(data.invoiceOperations.phpZeroRated, "PHP")} /><SummaryValue label="VAT-exempt" value={money(data.invoiceOperations.phpExempt, "PHP")} /><SummaryValue label="Missing details" value={String(data.invoiceOperations.phpMissingVatDetails)} /><SummaryValue label="PH review" value={String(data.invoiceOperations.phNeedsReviewCount)} /></div></div></div>{data.invoiceOperations.recent.length > 0 && <div className="mt-4 border-t border-slate-200 pt-4"><h3 className="text-xs font-black">Recent invoice activity</h3><div className="mt-2 space-y-1.5">{data.invoiceOperations.recent.slice(0, 5).map((invoice) => <button type="button" key={invoice.id} onClick={() => onOpenInvoice(invoice)} className="flex w-full items-center justify-between gap-3 rounded-xl p-2.5 text-left hover:bg-slate-50"><span className="min-w-0"><strong className="block truncate text-[10px] text-slate-800">{invoice.invoiceNumber || "Invoice"}</strong><span className="block truncate text-[10px] text-slate-500">{invoice.invoiceDate || "Date not set"} · {invoice.reviewStatus === "VERIFIED" ? "Verified" : "Needs review"}</span></span><span className="shrink-0 text-[10px] font-black tabular-nums">{money(invoice.grandTotal, invoice.currency || data.selectedCurrency)}</span></button>)}</div></div>}</section>
  </div>;
};

function SummaryValue({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-slate-50 p-2.5"><p className="text-[9px] uppercase tracking-wide text-slate-500">{label}</p><p className="mt-1 break-words text-xs font-black tabular-nums text-slate-900">{value}</p></div>;
}
