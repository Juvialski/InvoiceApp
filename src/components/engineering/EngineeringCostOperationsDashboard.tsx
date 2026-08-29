import React from "react";
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  BarChart3,
  BriefcaseBusiness,
  CheckCircle2,
  ClipboardCheck,
  CircleDollarSign,
  Clock3,
  FileWarning,
  HardHat,
  Landmark,
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
import type { TooltipContentProps } from "recharts";
import { Card } from "@astryxdesign/core/Card";
import type { AppTab } from "../../utils/routes";
import type { InvoiceData } from "../../types";
import type { CashDashboardPosition } from "../../lib/cashBanking.ts";
import { MetricCard as OperationsMetricCard, PageHeader, SectionHeader, StatusBadge } from "../ui/OperationsUI";


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
  action: "review" | "invoices" | "projects" | "payroll" | "expenses" | "cash";
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
  payrollDetailAvailable: boolean;
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
  cashPosition?: CashDashboardPosition;
}

export interface EngineeringCostOperationsDashboardProps {
  data: DashboardViewData;
  projects: readonly { id: string; projectCode: string; projectName: string }[];
  selectedProjectId?: string;
  onProjectChange?: (projectId?: string) => void;
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

function healthTone(health: DashboardProjectRow["health"]): "danger" | "warning" | "neutral" | "success" {
  if (health === "OVER BUDGET") return "danger";
  if (health === "NEAR LIMIT") return "warning";
  if (health === "NO BUDGET") return "neutral";
  return "success";
}

function ChartEmpty({ message }: { message: string }) {
  return <div className="flex min-h-[132px] items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 px-5 text-sm text-slate-500">{message}</div>;
}

function ChartCard({ title, description, children, className = "" }: { title: string; description: string; children: React.ReactNode; className?: string }) {
  return <Card className={`p-4 sm:p-5 ${className}`} elevation="low" aria-label={title}>
    <div className="mb-4 flex items-start justify-between gap-3"><div><h2 className="text-base font-bold text-slate-950">{title}</h2><p className="mt-1 text-sm leading-5 text-slate-500">{description}</p></div><BarChart3 className="h-4 w-4 shrink-0 text-indigo-500" aria-hidden="true" /></div>
    {children}
  </Card>;
}


function chartMoney(value: unknown, currency: string) {
  return money(typeof value === "number" ? value : Number(value) || 0, currency);
}

function renderTooltip(currency: string, labels: Record<string, string> = {}) {
  return ({ active, payload, label }: TooltipContentProps) => {
    if (!active || !payload?.length) return null;
    return <div className="rounded-xl border border-slate-200 bg-white p-3 text-[10px] shadow-xl"><p className="mb-2 font-black text-slate-900">{label}</p>{payload.map((item) => { const name = item.name === undefined ? "" : String(item.name); return <p key={`${name}-${item.value}`} className="flex items-center justify-between gap-5 text-slate-600"><span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color || "#64748b" }} />{labels[name] || name}</span><span className="font-black tabular-nums text-slate-900">{chartMoney(item.value, currency)}</span></p>; })}</div>;
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
    <PageHeader
      eyebrow="Operations overview"
      title="Executive Dashboard"
      description={`Company cost position, supplier obligations, labor, and direct expenses. Activity is scoped to ${data.activityLabel}; lifetime project position remains separate.`}
      actions={<>
        <button type="button" onClick={() => onNavigate("extractor")} className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-[10px] font-bold text-white shadow-sm hover:bg-indigo-700"><Receipt className="h-3.5 w-3.5" /> Upload invoice</button>
        <button type="button" onClick={() => onNavigate("review")} className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[10px] font-bold text-amber-900 hover:bg-amber-100"><AlertTriangle className="h-3.5 w-3.5" /> Review queue{data.invoiceOperations.needsReviewCount ? ` (${data.invoiceOperations.needsReviewCount})` : ""}</button>
        <button type="button" onClick={() => onNavigate("projects")} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[10px] font-bold text-slate-700 hover:bg-slate-50"><BriefcaseBusiness className="h-3.5 w-3.5" /> Projects</button>
      </>}
    />

    <section className="rounded-xl border border-slate-200 bg-white p-4" aria-label="Dashboard filters">
      <SectionHeader title="View controls" description="Keep currencies separate while changing the project and activity scope." icon={BarChart3} />
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(0,1.2fr)_minmax(11rem,0.8fr)_minmax(11rem,0.8fr)_auto] xl:items-end"><label className="space-y-1"><span className="field-label">Project filter</span><select value={selectedProjectId} onChange={(event) => onProjectChange(event.target.value)} className="field-input"><option value="">All projects</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.projectCode} — {project.projectName}</option>)}</select></label><label className="space-y-1"><span className="field-label">Position currency</span><select value={data.selectedCurrency} onChange={(event) => onCurrencyChange(event.target.value)} className="field-input"><option value={data.selectedCurrency}>{data.selectedCurrency}</option>{data.currencies.filter((currency) => currency !== data.selectedCurrency).map((currency) => <option key={currency} value={currency}>{currency}</option>)}</select></label><label className="space-y-1"><span className="field-label">Activity period</span><select value={data.activityPeriod} onChange={(event) => onActivityPeriodChange(event.target.value as DashboardActivityPeriod)} className="field-input"><option value="MONTH">Month</option><option value="QUARTER">Quarter</option><option value="YEAR">Year</option><option value="CUSTOM">Custom</option></select></label>{data.activityPeriod === "CUSTOM" ? <div className="grid grid-cols-2 gap-2"><label className="space-y-1"><span className="field-label">From</span><input type="date" defaultValue={data.activityStart} onChange={(event) => onCustomRangeChange?.(event.target.value, data.activityEnd)} className="field-input" /></label><label className="space-y-1"><span className="field-label">To</span><input type="date" defaultValue={data.activityEnd} onChange={(event) => onCustomRangeChange?.(data.activityStart, event.target.value)} className="field-input" /></label></div> : <div className="pb-2 text-sm leading-5 text-slate-500">{hasCurrencies ? "Currencies are never converted or combined." : "Showing the configured workspace currency."}</div>}</div>
    </section>

    <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Priority dashboard metrics">
      <OperationsMetricCard label="Confirmed project cost" value={money(data.confirmedProjectCost, data.selectedCurrency)} detail="Verified, approved, or paid" icon={CircleDollarSign} tone="success" emphasis />
      <OperationsMetricCard label="Outstanding payables" value={money(data.outstandingPayables, data.selectedCurrency)} detail="Supplier cash position" icon={Receipt} tone="warning" emphasis />
      <OperationsMetricCard label="Needs review" value={data.invoiceOperations.needsReviewCount} detail={`${data.invoiceOperations.totalCount} invoice records`} icon={ClipboardCheck} tone="warning" emphasis />
      <OperationsMetricCard label="Overdue invoices" value={data.invoiceOperations.overdueCount} detail="Payment status requires action" icon={AlertTriangle} tone={data.invoiceOperations.overdueCount ? "danger" : "success"} emphasis />
    </section>

    {data.cashPosition && <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5" aria-label="Cash position">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <SectionHeader title="Cash position" description="Actual liquidity from company accounts and posted statements. Internal transfers are excluded from operating flow." icon={Landmark} action={<button type="button" onClick={() => onNavigate("cash")} className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-2 text-[10px] font-black text-indigo-800 hover:bg-indigo-100">View Cash &amp; Banking <ArrowUpRight className="h-3 w-3" /></button>} />
      </div>
      {!data.cashPosition.hasAccounts ? <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-5 py-6 text-center"><WalletCards className="mx-auto h-7 w-7 text-slate-300" /><p className="mt-2 text-sm font-black text-slate-800">No cash accounts connected</p><p className="mt-1 text-xs leading-5 text-slate-500">Add a bank or GCash account to see the company’s actual cash position.</p><button type="button" onClick={() => onNavigate("cash")} className="mt-4 rounded-lg bg-indigo-600 px-3 py-2 text-[10px] font-black text-white hover:bg-indigo-700">Add account</button></div> : <>
        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-7">
          <CashMetric label="Available cash" value={cashMoney(data.cashPosition.totalAvailableCash, data.selectedCurrency)} tone="success" />
          <CashMetric label="Bank accounts" value={cashMoney(data.cashPosition.bankAccounts, data.selectedCurrency)} />
          <CashMetric label="GCash / e-wallets" value={cashMoney(data.cashPosition.ewallets, data.selectedCurrency)} />
          <CashMetric label="Money in" value={cashMoney(data.cashPosition.moneyIn, data.selectedCurrency)} detail={data.activityLabel} />
          <CashMetric label="Money out" value={cashMoney(data.cashPosition.moneyOut, data.selectedCurrency)} detail={data.activityLabel} />
          <CashMetric label="Net cash flow" value={`${data.cashPosition.netCashFlow >= 0 ? "+" : "−"}${cashMoney(Math.abs(data.cashPosition.netCashFlow), data.selectedCurrency)}`} tone={data.cashPosition.netCashFlow >= 0 ? "success" : "warning"} detail={data.activityLabel} />
          <CashMetric label="Needs reconciliation" value={String(data.cashPosition.needsReconciliation)} tone={data.cashPosition.needsReconciliation ? "warning" : "success"} />
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {data.cashPosition.accounts.slice(0, 6).map((summary) => <div key={summary.account.id} className="rounded-xl border border-slate-100 bg-slate-50 p-3"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-xs font-black text-slate-900">{summary.account.displayName}</p><p className="mt-0.5 truncate text-[10px] text-slate-500">{summary.account.maskedIdentifier || summary.account.institutionName} · {summary.account.accountType === "EWALLET" ? "GCash / e-wallet" : summary.account.accountType === "BANK" ? "Bank account" : "Cash"}</p></div><StatusBadge tone={summary.source === "PROVIDER" ? "success" : summary.source === "CALCULATED" ? "neutral" : "info"}>{summary.source === "PROVIDER" ? "Provider" : summary.source === "CALCULATED" ? "Calculated" : summary.source === "STATEMENT" ? "Statement" : "Manual"}</StatusBadge></div><p className="mt-3 text-lg font-black tabular-nums text-slate-950">{cashMoney(summary.availableBalance ?? summary.ledgerBalance, data.selectedCurrency)}</p>{summary.balanceDifference !== undefined && <p className="mt-1 break-words text-[10px] font-semibold text-amber-700">Book balance differs by {cashMoney(Math.abs(summary.balanceDifference), data.selectedCurrency)}.</p>}{summary.pendingBalance !== undefined && summary.pendingBalance > 0 && <p className="mt-1 text-[10px] font-semibold text-amber-700">{cashMoney(summary.pendingBalance, data.selectedCurrency)} pending</p>}<p className="mt-2 break-words text-[10px] text-slate-500">{summary.freshnessLabel}</p><p className="mt-1 text-[10px] font-semibold text-slate-600">{summary.unresolvedCount ? `${summary.unresolvedCount} need review` : "Fully reconciled"}</p></div>)}
        </div>
        {(data.cashPosition.pendingIn > 0 || data.cashPosition.pendingOut > 0 || data.cashPosition.alerts.length > 0) && <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-[10px] text-amber-950"><span className="font-black">Cash signals</span>{data.cashPosition.pendingIn > 0 && <span className="inline-flex items-center gap-1"><ArrowDownLeft className="h-3 w-3" />{cashMoney(data.cashPosition.pendingIn, data.selectedCurrency)} pending in</span>}{data.cashPosition.pendingOut > 0 && <span>{cashMoney(data.cashPosition.pendingOut, data.selectedCurrency)} pending out</span>}{data.cashPosition.alerts.length > 0 && <span>{data.cashPosition.alerts.length} account signal{data.cashPosition.alerts.length === 1 ? "" : "s"}</span>}</div>}
      </>}
    </section>}

    <div className="grid grid-cols-2 gap-3 md:grid-cols-4" aria-label="Supporting dashboard metrics">
      <OperationsMetricCard label="Active projects" value={data.activeProjects} detail="Current project register" icon={BriefcaseBusiness} tone="info" />
      <OperationsMetricCard label="Total project budget" value={money(data.totalProjectBudget, data.selectedCurrency)} detail="Lifetime position" icon={WalletCards} tone="info" />
      <OperationsMetricCard label="Pending commitments" value={money(data.pendingProjectCost, data.selectedCurrency)} detail="Review, draft, calculated" icon={Clock3} tone="warning" />
      <OperationsMetricCard label="Available after commitments" value={money(data.availableAfterCommitments, data.selectedCurrency)} detail="Budget less confirmed and pending" icon={BarChart3} tone={data.availableAfterCommitments < 0 ? "danger" : "info"} />
    </div>

    {data.attention.length > 0 && <section className="rounded-xl border border-amber-200 bg-amber-50/70 p-4" aria-label="Items requiring attention"><div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-start"><div><h2 className="text-sm font-black text-amber-950">Items requiring attention</h2><p className="mt-1 text-[10px] leading-4 text-amber-900">Open the existing workflow or record that can resolve each issue.</p></div><StatusBadge tone="warning" icon={AlertTriangle}>{data.attention.length} active signal{data.attention.length === 1 ? "" : "s"}</StatusBadge></div><div className="mt-3 grid gap-2 md:grid-cols-2">{data.attention.slice(0, 4).map((item) => <button type="button" key={item.id} onClick={() => attentionAction(item)} className="flex items-start justify-between gap-3 rounded-lg border border-amber-200/80 bg-white/70 p-3 text-left hover:border-indigo-300 hover:bg-white"><span className="min-w-0"><strong className="block truncate text-xs text-slate-800">{item.label}{item.count !== undefined ? ` · ${item.count}` : ""}</strong><span className="mt-0.5 block text-[10px] leading-4 text-slate-500">{item.detail}</span></span><ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-indigo-600" aria-hidden="true" /></button>)}</div></section>}

    <ChartCard title="Project budget position" description="Lifetime position, sorted by financial pressure. Remaining never goes below zero; excess shows as a separate extension.">
      {!hasBudgetRows ? <ChartEmpty message="No active projects yet." /> : <><div className="h-[300px] w-full sm:h-[360px]"><ResponsiveContainer width="100%" height="100%"><BarChart data={data.projectRows} layout="vertical" margin={{ top: 4, right: 18, bottom: 4, left: 4 }} barCategoryGap="20%"><CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" /><XAxis type="number" tickFormatter={(value) => compactMoney(Number(value), data.selectedCurrency)} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} /><YAxis type="category" dataKey="projectCode" width={78} tick={{ fontSize: 10, fontWeight: 700 }} axisLine={false} tickLine={false} /><Tooltip content={renderTooltip(data.selectedCurrency, { confirmed: "Confirmed", pending: "Pending", remaining: "Remaining", excess: "Over commitment" })} /><Legend wrapperStyle={{ fontSize: 10 }} /><Bar dataKey="confirmed" stackId="position" fill="#4f46e5" name="Confirmed" /><Bar dataKey="pending" stackId="position" fill="#f59e0b" name="Pending" /><Bar dataKey="remaining" stackId="position" fill="#cbd5e1" name="Remaining" /><Bar dataKey="excess" stackId="position" fill="#e11d48" name="Over commitment" /></BarChart></ResponsiveContainer></div><div className="mt-3 grid gap-2 text-[10px] text-slate-500 sm:grid-cols-3"><p><strong className="text-slate-700">Confirmed</strong> is lifetime project cost.</p><p><strong className="text-slate-700">Pending</strong> is a commitment, not actual cost.</p><p><strong className="text-slate-700">Available</strong> is shown in each project row below.</p></div></>}
    </ChartCard>

    <section className="grid gap-4 xl:grid-cols-[1.45fr_0.85fr]">
      <ChartCard title="Monthly cost trend" description={data.payrollDetailAvailable ? `Confirmed project activity during ${data.activityLabel.toLowerCase()}, using invoice date, expense date, and payroll period end.` : `Confirmed invoice and expense activity during ${data.activityLabel.toLowerCase()}; lifetime project labor uses the safe aggregate.`}>
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
        {!data.payrollDetailAvailable ? <ChartEmpty message="Payroll detail is restricted. Project labor totals use the authorized project aggregate; period-level payroll activity is not exposed here." /> : !hasPayrollTrend ? <ChartEmpty message="No payroll activity in this period." /> : <div className="h-[270px] w-full"><ResponsiveContainer width="100%" height="100%"><ComposedChart data={data.payrollTrend} margin={{ top: 4, right: 12, bottom: 4, left: 0 }}><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" /><XAxis dataKey="label" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} /><YAxis tickFormatter={(value) => compactMoney(Number(value), data.selectedCurrency)} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} /><Tooltip content={renderTooltip(data.selectedCurrency, { projectLabor: "Project labor", overhead: "Admin / overhead", unallocated: "Unallocated labor", total: "Total payroll" })} /><Legend wrapperStyle={{ fontSize: 10 }} /><Bar dataKey="projectLabor" stackId="payroll" fill="#8b5cf6" name="Project labor" /><Bar dataKey="overhead" stackId="payroll" fill="#64748b" name="Admin / overhead" /><Bar dataKey="unallocated" stackId="payroll" fill="#f59e0b" name="Unallocated labor" /><Line type="monotone" dataKey="total" stroke="#0f172a" strokeWidth={2} dot={false} name="Total payroll" /></ComposedChart></ResponsiveContainer></div>}
      </ChartCard>
      <ChartCard title="Monthly direct expenses" description="Confirmed and pending expense trend uses expenseDate; category labels are not used as accounting rules.">
        {!hasExpenses ? <ChartEmpty message="No direct expenses in this period." /> : <div className="h-[270px] w-full"><ResponsiveContainer width="100%" height="100%"><BarChart data={data.expenseTrend} margin={{ top: 4, right: 12, bottom: 4, left: 0 }}><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" /><XAxis dataKey="label" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} /><YAxis tickFormatter={(value) => compactMoney(Number(value), data.selectedCurrency)} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} /><Tooltip content={renderTooltip(data.selectedCurrency, { directExpenses: "Direct expenses" })} /><Bar dataKey="directExpenses" name="Direct expenses" fill="#f59e0b" radius={[5, 5, 0, 0]} /></BarChart></ResponsiveContainer></div>}
      </ChartCard>
    </section>

    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start"><div><h2 className="text-sm font-black">Unallocated cost reconciliation</h2><p className="mt-1 text-[10px] leading-4 text-slate-500">Residual invoice, payroll, and expense values by currency. This is not derived by adding project rows.</p></div><RotateCcw className="h-4 w-4 text-indigo-500" aria-hidden="true" /></div>{!data.payrollDetailAvailable ? <div className="mt-4 rounded-xl border border-violet-100 bg-violet-50 p-4 text-xs text-violet-900">Payroll unallocated residuals are not exposed without payroll detail. Invoice and expense residuals remain visible by currency.</div> : data.unallocatedByCurrency.length ? <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{data.unallocatedByCurrency.map((row) => <div key={row.currency} className="rounded-xl border border-slate-100 bg-slate-50 p-3"><p className="text-xs font-black text-slate-900">{row.currency}</p><div className="mt-2 space-y-1 text-[10px] text-slate-600"><p className="flex justify-between gap-3"><span>Invoices</span><strong>{money(row.invoices, row.currency)}</strong></p><p className="flex justify-between gap-3"><span>Payroll</span><strong>{money(row.payroll, row.currency)}</strong></p><p className="flex justify-between gap-3"><span>Expenses</span><strong>{money(row.expenses, row.currency)}</strong></p><p className="mt-2 flex justify-between gap-3 border-t border-slate-200 pt-2 font-black text-slate-900"><span>Total</span><strong>{money(row.total, row.currency)}</strong></p></div></div>)}</div> : <div className="mt-4 rounded-xl border border-dashed border-emerald-200 bg-emerald-50 p-4 text-xs font-semibold text-emerald-800">No unallocated {data.selectedCurrency} costs.</div>}</section>

    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start"><div><h2 className="text-sm font-black">Company payroll overhead</h2><p className="mt-1 text-[10px] leading-4 text-slate-500">Administrative / office and general overhead payroll. Not included in project budget utilization.</p></div><HardHat className="h-4 w-4 text-slate-500" aria-hidden="true" /></div>{!data.payrollDetailAvailable ? <p className="mt-4 text-xs text-slate-500">Payroll detail is restricted; the project labor aggregate does not include employee-level overhead or unallocated payroll.</p> : data.overheadByCurrency.length ? <div className="mt-4 grid gap-3 sm:grid-cols-3">{data.overheadByCurrency.map((row) => <div key={row.currency} className="rounded-xl bg-slate-50 p-3"><p className="text-xs font-black">{row.currency}</p><p className="mt-2 text-[10px] text-slate-600">Administrative / Office <strong className="float-right text-slate-900">{money(row.adminOffice, row.currency)}</strong></p><p className="mt-1 text-[10px] text-slate-600">General overhead <strong className="float-right text-slate-900">{money(row.generalOverhead, row.currency)}</strong></p><p className="mt-2 border-t border-slate-200 pt-2 text-xs font-black">Total <span className="float-right">{money(row.total, row.currency)}</span></p></div>)}</div> : <p className="mt-4 text-xs text-slate-500">No company payroll overhead recorded.</p>}</section>

    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="flex flex-col justify-between gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-start sm:p-5"><div><h2 className="text-sm font-black">Project performance</h2><p className="mt-1 text-[10px] text-slate-500">Lifetime budget position; default order is greatest commitment pressure first.</p></div><button type="button" onClick={() => onNavigate("projects")} className="inline-flex items-center gap-1 text-[10px] font-black text-indigo-600">Open projects <ArrowUpRight className="h-3 w-3" /></button></div>{data.projectRows.length ? <div className="overflow-x-auto"><table className="min-w-[980px] w-full text-left text-xs"><thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Project</th><th className="px-4 py-3">Budget</th><th className="px-4 py-3">Confirmed</th><th className="px-4 py-3">Pending</th><th className="px-4 py-3">Available</th><th className="px-4 py-3">Invoices</th><th className="px-4 py-3">Labor</th><th className="px-4 py-3">Expenses</th><th className="px-4 py-3">Used %</th><th className="px-4 py-3">Health</th></tr></thead><tbody className="divide-y divide-slate-100">{data.projectRows.map((row) => <tr key={row.projectId} className="cursor-pointer hover:bg-slate-50" onClick={() => onOpenProject(row.projectId)}><td className="px-4 py-3"><button type="button" className="text-left" onClick={(event) => { event.stopPropagation(); onOpenProject(row.projectId); }}><p className="font-black text-indigo-700">{row.projectCode}</p><p className="mt-0.5 font-semibold text-slate-900">{row.projectName}</p></button></td><td className="px-4 py-3 font-black tabular-nums">{money(row.budget, row.currency)}</td><td className="px-4 py-3 font-black tabular-nums">{money(row.confirmed, row.currency)}</td><td className="px-4 py-3 font-black tabular-nums">{money(row.pending, row.currency)}</td><td className={`px-4 py-3 font-black tabular-nums ${row.availableAfterCommitments < 0 ? "text-rose-700" : "text-emerald-700"}`}>{money(row.availableAfterCommitments, row.currency)}</td><td className="px-4 py-3 tabular-nums">{money(row.invoiceCost, row.currency)}</td><td className="px-4 py-3 tabular-nums">{money(row.payrollCost, row.currency)}</td><td className="px-4 py-3 tabular-nums">{money(row.expenseCost, row.currency)}</td><td className="px-4 py-3 font-black tabular-nums">{percent(row.confirmedUtilization)}</td><td className="px-4 py-3"><StatusBadge tone={healthTone(row.health)}>{row.health}</StatusBadge></td></tr>)}</tbody></table></div> : <div className="p-10 text-center text-xs text-slate-500">No active projects yet.</div>}</section>


    <section className="grid gap-4 xl:grid-cols-2">
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-black">Payroll summary</h2>
            <p className="mt-1 text-xs text-slate-500">Current payroll status and labor classification.</p>
          </div>
          <HardHat className="h-4 w-4 text-violet-600" aria-hidden="true" />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
          <SummaryValue label="Current period" value={data.payrollSummary.currentPeriodLabel} />
          <SummaryValue label="Active workers" value={String(data.payrollSummary.activeWorkers)} />
          <SummaryValue label="Gross payroll" value={money(data.payrollSummary.grossPayroll, data.selectedCurrency)} />
          <SummaryValue label="Project labor" value={money(data.payrollSummary.projectLabor, data.selectedCurrency)} />
          <SummaryValue label="Admin / overhead" value={money(data.payrollSummary.overhead, data.selectedCurrency)} />
          <SummaryValue label="Unallocated labor" value={money(data.payrollSummary.unallocatedLabor, data.selectedCurrency)} />
          <SummaryValue label="Run status" value={data.payrollSummary.runStatus} />
          <SummaryValue label="Issues / warnings" value={`${data.payrollSummary.blockingIssues} / ${data.payrollSummary.warnings}`} />
        </div>
        <button type="button" onClick={() => onNavigate("payroll")} className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-2 text-xs font-black text-white hover:bg-indigo-700 transition">
          Open Payroll <ArrowUpRight className="h-3 w-3" />
        </button>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5 flex flex-col justify-between">
        <div>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-black">Expense summary</h2>
              <p className="mt-1 text-xs text-slate-500">Selected-period direct expenses; unassigned expenses remain non-project, not overhead.</p>
            </div>
            <Receipt className="h-4 w-4 text-amber-600" aria-hidden="true" />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
            <SummaryValue label="Selected-period total" value={money(data.expenseSummary.selectedPeriodTotal, data.selectedCurrency)} />
            <SummaryValue label="Confirmed project expenses" value={money(data.expenseSummary.confirmedProjectExpenses, data.selectedCurrency)} />
            <SummaryValue label="Pending project expenses" value={money(data.expenseSummary.pendingProjectExpenses, data.selectedCurrency)} />
            <SummaryValue label="Unallocated / non-project" value={money(data.expenseSummary.unallocatedExpenses, data.selectedCurrency)} />
          </div>
        </div>
        <div>
          <button type="button" onClick={() => onNavigate("expenses")} className="mt-4 inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 transition">
            Open Expenses <ArrowUpRight className="h-3 w-3" />
          </button>
        </div>
      </section>
    </section>

    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start"><div><h2 className="text-sm font-black">Invoice operations</h2><p className="mt-1 text-xs text-slate-500">Intake and VAT analysis remain available without crowding the management KPIs.</p></div><div className="flex flex-wrap gap-2"><button type="button" onClick={() => onNavigate("extractor")} className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-2 text-xs font-bold text-white"><Receipt className="h-3 w-3" /> Upload</button><button type="button" onClick={() => onNavigate("review")} className="inline-flex items-center gap-1.5 rounded-xl bg-amber-400 px-3 py-2 text-xs font-bold text-amber-950"><AlertTriangle className="h-3 w-3" /> Review {data.invoiceOperations.needsReviewCount}</button><button type="button" onClick={() => onNavigate("inbox")} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700"><Mail className="h-3 w-3" /> Process email</button></div></div><div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6"><SummaryValue label="Total invoice value" value={money(invoiceCurrencyTotal, data.selectedCurrency)} /><SummaryValue label="Outstanding" value={money(invoiceCurrencyOutstanding, data.selectedCurrency)} /><SummaryValue label="Overdue" value={String(data.invoiceOperations.overdueCount)} /><SummaryValue label="VAT amount" value={money(invoiceCurrencyVat, data.selectedCurrency)} /><SummaryValue label="Needs review" value={String(data.invoiceOperations.needsReviewCount)} /><SummaryValue label="Verified" value={String(data.invoiceOperations.verifiedCount)} /></div><div className="mt-4 grid gap-4 lg:grid-cols-2"><div className="rounded-xl bg-slate-50 p-3"><h3 className="text-xs font-black">Currency breakdown</h3>{Object.keys(data.invoiceOperations.totalsByCurrency).length ? <div className="mt-3 space-y-2">{Object.entries(data.invoiceOperations.totalsByCurrency).map(([currency, value]) => <div key={currency} className="flex items-center justify-between gap-3 text-xs"><span className="font-bold text-slate-700">{currency}</span><span className="font-black tabular-nums">{money(Number(value) || 0, currency)} <span className="font-semibold text-slate-400">outstanding {money(data.invoiceOperations.outstandingByCurrency[currency] || 0, currency)}</span></span></div>)}</div> : <p className="mt-3 text-xs text-slate-500">No invoice activity yet.</p>}</div><div className="rounded-xl bg-slate-50 p-3"><h3 className="text-xs font-black">Philippine VAT summary</h3><div className="mt-3 grid grid-cols-2 gap-2 text-xs"><SummaryValue label="VATable purchases" value={money(data.invoiceOperations.phpVatable, "PHP")} /><SummaryValue label="VAT amount" value={money(data.invoiceOperations.vatByCurrency.PHP || 0, "PHP")} /><SummaryValue label="Zero-rated" value={money(data.invoiceOperations.phpZeroRated, "PHP")} /><SummaryValue label="VAT-exempt" value={money(data.invoiceOperations.phpExempt, "PHP")} /><SummaryValue label="Missing details" value={String(data.invoiceOperations.phpMissingVatDetails)} /><SummaryValue label="PH review" value={String(data.invoiceOperations.phNeedsReviewCount)} /></div></div></div>{data.invoiceOperations.recent.length > 0 && <div className="mt-4 border-t border-slate-200 pt-4"><h3 className="text-xs font-black">Recent invoice activity</h3><div className="mt-2 space-y-1.5">{data.invoiceOperations.recent.slice(0, 5).map((invoice) => <button type="button" key={invoice.id} onClick={() => onOpenInvoice(invoice)} className="flex w-full items-center justify-between gap-3 rounded-xl p-2.5 text-left hover:bg-slate-50"><span className="min-w-0"><strong className="block truncate text-xs text-slate-800">{invoice.invoiceNumber || "Invoice"}</strong><span className="block truncate text-xs text-slate-500">{invoice.invoiceDate || "Date not set"} · {invoice.reviewStatus === "VERIFIED" ? "Verified" : "Needs review"}</span></span><span className="shrink-0 text-xs font-black tabular-nums">{money(invoice.grandTotal, invoice.currency || data.selectedCurrency)}</span></button>)}</div></div>}</section>
  </div>;
};

function SummaryValue({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-slate-50 p-2.5"><p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</p><p className="mt-1 truncate text-xs font-black tabular-nums text-slate-900" title={value}>{value}</p></div>;
}

function cashMoney(value: number, currency: string) {
  try { return new Intl.NumberFormat("en-PH", { style: "currency", currency: currency || "PHP", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number.isFinite(value) ? value : 0); }
  catch { return `${currency || "PHP"} ${(Number.isFinite(value) ? value : 0).toFixed(2)}`; }
}

function CashMetric({ label, value, detail, tone = "neutral" }: { label: string; value: string; detail?: string; tone?: "neutral" | "success" | "warning" }) {
  const toneClass = tone === "success" ? "border-emerald-200 bg-emerald-50/50" : tone === "warning" ? "border-amber-200 bg-amber-50/50" : "border-slate-100 bg-slate-50";
  return <div className={`min-w-0 rounded-xl border p-3 ${toneClass}`}><p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</p><p className="mt-1.5 truncate text-sm font-black tabular-nums text-slate-950 sm:text-base" title={value}>{value}</p>{detail && <p className="mt-1 text-[10px] text-slate-500">{detail}</p>}</div>;
}
