import React, { useMemo, useState } from "react";
import {
  AlertTriangle,
  Archive,
  Calculator,
  CheckCircle2,
  DollarSign,
  Edit2,
  Filter,
  Layers,
  PieChart,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  Wallet,
} from "lucide-react";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import type {
  Expense,
  InvoiceData,
  InvoiceProjectAllocation,
  PayrollPeriod,
  PayrollProjectAllocation,
  PayrollRun,
  Project,
  ProjectCostCode,
  PurchaseOrder,
  Subcontract,
} from "../../types.ts";
import type { ProjectLaborCostAggregate, ProjectLaborSource } from "../../utils/projectLaborCostAggregate.ts";
import {
  calculateProjectBudgetControl,
  type CostCodeFinancialSummary,
  type CostInvoice,
  type CostPayrollRecord,
  type ProjectBudgetControlSummary,
} from "../../utils/projectCosting.ts";
import { EmptyState, MetricCard, StatusBadge, type StatusTone } from "../ui/OperationsUI.tsx";
import { ProjectCostCodeModal } from "./ProjectCostCodeModal.tsx";

export interface ProjectBudgetControlPanelProps {
  project: Project;
  costCodes: readonly ProjectCostCode[];
  invoices: InvoiceData[];
  invoiceAllocations: InvoiceProjectAllocation[];
  expenses: Expense[];
  purchaseOrders?: PurchaseOrder[];
  subcontracts?: Subcontract[];
  payrollAllocations?: PayrollProjectAllocation[];
  payrollPeriods?: PayrollPeriod[];
  payrollRuns?: PayrollRun[];
  projectLaborAggregates?: readonly ProjectLaborCostAggregate[];
  laborSource?: ProjectLaborSource;
  canManageProject?: boolean;
  onSaveCostCode: (costCode: {
    id?: string;
    projectId: string;
    code: string;
    name: string;
    description?: string;
    approvedBudgetAmount: number;
    forecastAmount?: number;
    status: ProjectCostCode["status"];
  }) => Promise<void> | void;
  onArchiveCostCode: (costCodeId: string) => Promise<void> | void;
  onReactivateCostCode: (costCodeId: string) => Promise<void> | void;
}

function money(value: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-PH", { style: "currency", currency, maximumFractionDigits: 2 }).format(value || 0);
  } catch {
    return `${currency} ${(value || 0).toFixed(2)}`;
  }
}

function statusTone(status: string): StatusTone {
  return status === "ACTIVE" ? "success" : "neutral";
}

export const ProjectBudgetControlPanel: React.FC<ProjectBudgetControlPanelProps> = ({
  project,
  costCodes,
  invoices,
  invoiceAllocations,
  expenses,
  purchaseOrders = [],
  subcontracts = [],
  payrollAllocations = [],
  payrollPeriods = [],
  payrollRuns = [],
  projectLaborAggregates = [],
  laborSource = "detail",
  canManageProject = true,
  onSaveCostCode,
  onArchiveCostCode,
  onReactivateCostCode,
}) => {
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCode, setEditingCode] = useState<ProjectCostCode | null>(null);
  const [modalLoading, setModalLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<"ALL" | "ACTIVE" | "ARCHIVED">("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  // 1. Prepare Cost Input
  const costInput = useMemo(() => {
    const costInvoices: CostInvoice[] = invoices.map((inv) => ({
      ...inv,
      allocations: invoiceAllocations.filter((a) => a.invoiceId === inv.id),
    }));

    const costPayroll: CostPayrollRecord[] = payrollRuns.map((run) => {
      const period = payrollPeriods.find((p) => p.id === run.periodId);
      return {
        id: run.id,
        status: run.status,
        currency: project.currency,
        periodStart: period?.periodStart,
        periodEnd: period?.periodEnd,
        allocations: payrollAllocations,
      };
    });

    return {
      invoices: costInvoices,
      payroll: costPayroll.length > 0 ? costPayroll : [{
        id: "payroll-fallback",
        status: "APPROVED" as const,
        currency: project.currency,
        allocations: payrollAllocations,
      }],
      expenses,
      purchaseOrders,
      subcontracts,
      projectLaborAggregates,
      laborSource,
      baseCurrency: project.currency,
    };
  }, [invoices, invoiceAllocations, expenses, purchaseOrders, subcontracts, payrollRuns, payrollPeriods, payrollAllocations, projectLaborAggregates, laborSource, project.currency]);

  // 2. Compute P1B Budget Control Summary
  const budgetControl: ProjectBudgetControlSummary = useMemo(() => {
    return calculateProjectBudgetControl(project, costCodes, costInput);
  }, [project, costCodes, costInput]);

  // 3. Filtered Cost Codes for display
  const projectCodes = useMemo(() => {
    return budgetControl.costCodes.filter((cc) => {
      const matchesStatus =
        statusFilter === "ALL" ||
        (statusFilter === "ACTIVE" && cc.status === "ACTIVE") ||
        (statusFilter === "ARCHIVED" && cc.status === "ARCHIVED");
      const normalizedQuery = searchQuery.trim().toLowerCase();
      const matchesSearch =
        !normalizedQuery ||
        cc.code.toLowerCase().includes(normalizedQuery) ||
        cc.name.toLowerCase().includes(normalizedQuery) ||
        (cc.description && cc.description.toLowerCase().includes(normalizedQuery));
      return matchesStatus && matchesSearch;
    });
  }, [budgetControl.costCodes, statusFilter, searchQuery]);

  const handleOpenCreateModal = () => {
    setEditingCode(null);
    setModalOpen(true);
  };

  const handleOpenEditModal = (ccSummary: CostCodeFinancialSummary) => {
    const original = costCodes.find((c) => c.id === ccSummary.costCodeId);
    if (original) {
      setEditingCode(original);
      setModalOpen(true);
    }
  };

  const handleSaveModal = async (input: {
    id?: string;
    projectId: string;
    code: string;
    name: string;
    description?: string;
    approvedBudgetAmount: number;
    forecastAmount?: number;
    status: ProjectCostCode["status"];
  }) => {
    setModalLoading(true);
    try {
      await onSaveCostCode(input);
      setModalOpen(false);
    } finally {
      setModalLoading(false);
    }
  };

  const handleArchive = async (costCodeId: string) => {
    if (typeof window !== "undefined" && !window.confirm("Archive this cost code? Historical actual costs will be preserved.")) {
      return;
    }
    setActionLoadingId(costCodeId);
    try {
      await onArchiveCostCode(costCodeId);
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleReactivate = async (costCodeId: string) => {
    setActionLoadingId(costCodeId);
    try {
      await onReactivateCostCode(costCodeId);
    } finally {
      setActionLoadingId(null);
    }
  };

  const hasCostCodes = budgetControl.costCodes.length > 0;
  const currency = project.currency || "PHP";
  const aggregatePayroll = laborSource === "aggregate";

  return (
    <div className="space-y-5">
      {/* Top 5 Summary Metrics Cards */}
      <section aria-label="Budget Control Summary" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <MetricCard
          label="Approved Project Budget"
          value={money(budgetControl.projectBudget, currency)}
          detail="Total approved project ceiling"
          icon={Calculator}
          tone="info"
          emphasis
        />
        <MetricCard
          label="Allocated Code Budget"
          value={money(budgetControl.allocatedCostCodeBudget, currency)}
          detail="Active work package budgets"
          icon={Layers}
          tone="neutral"
        />
        <MetricCard
          label="Unallocated Budget"
          value={money(budgetControl.unallocatedBudget, currency)}
          detail={budgetControl.unallocatedBudget < 0 ? "Exceeds project ceiling" : "Remaining unassigned budget"}
          icon={Wallet}
          tone={budgetControl.unallocatedBudget < 0 ? "danger" : "success"}
        />
        <MetricCard
          label="Coded Actual Cost"
          value={money(budgetControl.codedActualCost, currency)}
          detail={budgetControl.hasForeignAmounts ? "Base-currency coded actual; foreign costs stay separate" : "Authoritative costs assigned to codes"}
          icon={DollarSign}
          tone="neutral"
        />
        <MetricCard
          label="Uncoded Actual Cost"
          value={money(budgetControl.uncodedActualCost, currency)}
          detail={aggregatePayroll
            ? "Includes aggregate payroll without detail-level cost-code provenance"
            : budgetControl.hasForeignAmounts
              ? "Base-currency uncoded actual; foreign costs stay separate"
              : budgetControl.uncodedActualCost > 0
                ? "Requires cost-code assignment"
                : "All costs categorized"}
          icon={budgetControl.uncodedActualCost > 0 ? AlertTriangle : CheckCircle2}
          tone={budgetControl.uncodedActualCost > 0 ? "warning" : "success"}
        />
      </section>

      {/* Uncoded Actual Cost Alert Card */}
      {budgetControl.uncodedActualCost > 0 && (
        <Card className="border-amber-200 bg-amber-50/70 p-4 shadow-sm" elevation="low">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-800">
              <AlertTriangle className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1 text-xs text-amber-950">
              <h3 className="font-black text-amber-900">
                Uncoded Actual Cost: {money(budgetControl.uncodedActualCost, currency)}
              </h3>
              <p className="mt-1 leading-5">
                {aggregatePayroll
                  ? "Invoice and expense costs can be classified by cost code. Payroll is included here from the permission-safe authoritative aggregate, so its detail-level cost-code provenance is intentionally not exposed in this view."
                  : "Authoritative costs have been incurred on this project that are not yet assigned to a cost code. Assign cost codes when creating invoice allocations, approving payroll, or logging direct expenses."}
              </p>
              <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-[11px] font-semibold text-amber-900">
                <span>Invoices: <strong className="tabular-nums">{money(budgetControl.uncodedSummary.invoiceCost, currency)}</strong></span>
                <span>•</span>
                <span>Payroll: <strong className="tabular-nums">{money(budgetControl.uncodedSummary.payrollCost, currency)}</strong></span>
                <span>•</span>
                <span>Expenses: <strong className="tabular-nums">{money(budgetControl.uncodedSummary.otherExpenseCost, currency)}</strong></span>
                {budgetControl.uncodedPendingCost > 0 && (
                  <>
                    <span>•</span>
                    <span className="text-amber-800">Pending unverified: <strong className="tabular-nums">{money(budgetControl.uncodedPendingCost, currency)}</strong></span>
                  </>
                )}
              </div>
            </div>
          </div>
        </Card>
      )}

      {aggregatePayroll && (budgetControl.uncodedSummary.payrollCost > 0 || budgetControl.baseCostSummary.pendingPayrollCost > 0) && (
        <div role="status" className="flex items-start gap-2.5 rounded-xl border border-indigo-200 bg-indigo-50 p-3.5 text-xs text-indigo-950">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-indigo-700" />
          <div><strong>Payroll is aggregate-only in Budget Control.</strong> Confirmed and pending labor remain part of the authoritative project total, but individual payroll cost-code assignments are not exposed without detail-level lifecycle context.</div>
        </div>
      )}

      {/* Mixed Currency Notification */}
      {budgetControl.hasForeignAmounts && (
        <div role="status" className="flex items-start gap-2.5 rounded-xl border border-sky-200 bg-sky-50 p-3.5 text-xs text-sky-950">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-sky-700" />
          <div>
            <strong>Foreign currency costs detected.</strong> Foreign currency amounts remain recorded in their original currency and are not converted to {currency}. Base-currency actuals are partial, so actual variance and utilization are withheld where a cost code contains foreign amounts.
            {Object.entries(budgetControl.foreignCosts).map(([curr, amt]) => (
              <span key={curr} className="ml-2 font-mono font-bold">{curr} {Number(amt).toFixed(2)}</span>
            ))}
          </div>
        </div>
      )}

      {/* Main Cost Codes Section */}
      <Card className="overflow-hidden p-0 shadow-sm" elevation="low">
        {/* Table Header & Toolbar */}
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div>
            <h3 className="text-sm font-black text-slate-950">Work Package Cost Codes</h3>
            <p className="mt-0.5 text-xs text-slate-500">
              Budgets, actuals, committed costs, and forecasts structured by work package.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {canManageProject && (
              <Button
                variant="primary"
                label="Add Cost Code"
                icon={<Plus className="h-3.5 w-3.5" />}
                onClick={handleOpenCreateModal}
              />
            )}
          </div>
        </div>

        {/* Filter and Search Bar */}
        {hasCostCodes && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/50 px-4 py-3 sm:px-5">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setStatusFilter("ALL")}
                className={`rounded-lg px-2.5 py-1 text-xs font-bold ${statusFilter === "ALL" ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-100"}`}
              >
                All ({budgetControl.costCodes.length})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter("ACTIVE")}
                className={`rounded-lg px-2.5 py-1 text-xs font-bold ${statusFilter === "ACTIVE" ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-100"}`}
              >
                Active ({budgetControl.costCodes.filter((c) => c.status === "ACTIVE").length})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter("ARCHIVED")}
                className={`rounded-lg px-2.5 py-1 text-xs font-bold ${statusFilter === "ARCHIVED" ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-100"}`}
              >
                Archived ({budgetControl.costCodes.filter((c) => c.status === "ARCHIVED").length})
              </button>
            </div>

            <div className="relative min-w-[200px] max-w-xs flex-1">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search code or package..."
                className="w-full rounded-lg border border-slate-200 bg-white py-1.5 pl-8 pr-3 text-xs outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          </div>
        )}

        {/* Content View */}
        {!hasCostCodes ? (
          <div className="p-8 text-center sm:p-12">
            <EmptyState
              title="No cost codes defined for this project"
              description="Create cost codes (e.g. CIVIL, MECH, ELEC) to structure work packages and track actual costs against approved budget ceilings."
              icon={Calculator}
              action={
                canManageProject ? (
                  <Button
                    variant="primary"
                    label="Add First Cost Code"
                    icon={<Plus className="h-3.5 w-3.5" />}
                    onClick={handleOpenCreateModal}
                  />
                ) : undefined
              }
            />
          </div>
        ) : projectCodes.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">
            No cost codes match your filter or search query.
          </div>
        ) : (
          <>
            {/* Desktop / Tablet Table View */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-600">
                <thead className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  <tr>
                    <th scope="col" className="px-4 py-3">Cost Code</th>
                    <th scope="col" className="px-4 py-3">Work Package</th>
                    <th scope="col" className="px-4 py-3">Status</th>
                    <th scope="col" className="px-4 py-3 text-right">Approved Budget</th>
                    <th scope="col" className="px-4 py-3 text-right">Actual Cost</th>
                    <th scope="col" className="px-4 py-3 text-right">Committed Cost</th>
                    <th scope="col" className="px-4 py-3 text-right">Forecast Cost</th>
                    <th scope="col" className="px-4 py-3 text-right">Actual Variance</th>
                    <th scope="col" className="px-4 py-3 text-right">Forecast Variance</th>
                    {canManageProject && <th scope="col" className="px-4 py-3 text-right">Actions</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {projectCodes.map((cc) => {
                    const isArchived = cc.status === "ARCHIVED";
                    const isActionLoading = actionLoadingId === cc.costCodeId;
                    return (
                      <tr key={cc.costCodeId} className={`hover:bg-slate-50/60 ${isArchived ? "opacity-60 bg-slate-50/40" : ""}`}>
                        {/* Cost Code */}
                        <td className="px-4 py-3.5 font-mono font-bold text-slate-900">
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-800">
                            {cc.code}
                          </span>
                          {cc.hasForeignAmounts && (
                            <span className="ml-1.5 inline-block rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold text-amber-800" title="Contains unconverted foreign currency costs">
                              Partial
                            </span>
                          )}
                        </td>

                        {/* Name & Description */}
                        <td className="px-4 py-3.5">
                          <p className="font-bold text-slate-900">{cc.name}</p>
                          {cc.description && <p className="mt-0.5 text-[10px] text-slate-500 line-clamp-1">{cc.description}</p>}
                          {cc.hasForeignAmounts && (
                            <p className="mt-0.5 text-[10px] text-amber-700">
                              Foreign: {Object.entries(cc.foreignCosts).map(([c, v]) => `${c} ${Number(v).toFixed(2)}`).join(", ")}
                            </p>
                          )}
                        </td>

                        {/* Status */}
                        <td className="px-4 py-3.5">
                          <StatusBadge tone={statusTone(cc.status)}>
                            {cc.status}
                          </StatusBadge>
                        </td>

                        {/* Approved Budget */}
                        <td className="px-4 py-3.5 text-right font-black tabular-nums text-slate-900">
                          {money(cc.budgetAmount, currency)}
                        </td>

                        {/* Actual Cost */}
                        <td className="px-4 py-3.5 text-right font-black tabular-nums text-slate-900">
                          {money(cc.actualCost, currency)}
                          {cc.budgetAmount > 0 && (
                            <span className="block text-[10px] font-semibold text-slate-400">
                              {cc.hasForeignAmounts ? "Base-currency actual · partial" : `${cc.budgetUsedPercent.toFixed(1)}% used`}
                            </span>
                          )}
                        </td>

                        {/* Committed Cost */}
                        <td className="px-4 py-3.5 text-right font-black tabular-nums text-purple-700">
                          {cc.hasForeignAmounts ? (
                            <span className="font-semibold text-slate-400 italic">Partial</span>
                          ) : (
                            money(cc.committedCost || 0, currency)
                          )}
                        </td>

                        {/* Forecast Cost */}
                        <td className="px-4 py-3.5 text-right tabular-nums">
                          {cc.forecastAmount != null ? (
                            <span className="font-bold text-slate-900">{money(cc.forecastAmount, currency)}</span>
                          ) : (
                            <span className="font-semibold text-slate-400 italic">Not set</span>
                          )}
                        </td>

                        {/* Actual Variance */}
                        <td className="px-4 py-3.5 text-right font-black tabular-nums">
                          {cc.hasForeignAmounts ? (
                            <span className="font-semibold text-slate-400 italic">Unavailable</span>
                          ) : (
                            <span className={cc.actualVariance >= 0 ? "text-emerald-700" : "text-rose-600"}>
                              {cc.actualVariance >= 0 ? "+" : ""}{money(cc.actualVariance, currency)}
                            </span>
                          )}
                        </td>

                        {/* Forecast Variance */}
                        <td className="px-4 py-3.5 text-right tabular-nums">
                          {cc.forecastVariance != null ? (
                            <span className={`font-bold ${cc.forecastVariance >= 0 ? "text-emerald-700" : "text-rose-600"}`}>
                              {cc.forecastVariance >= 0 ? "+" : ""}{money(cc.forecastVariance, currency)}
                            </span>
                          ) : (
                            <span className="font-semibold text-slate-400 italic">Not set</span>
                          )}
                        </td>

                        {/* Actions */}
                        {canManageProject && (
                          <td className="px-4 py-3.5 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                type="button"
                                onClick={() => handleOpenEditModal(cc)}
                                disabled={isActionLoading}
                                className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-indigo-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-500"
                                aria-label={`Edit cost code ${cc.code}`}
                              >
                                <Edit2 className="h-3.5 w-3.5" />
                              </button>
                              {isArchived ? (
                                <button
                                  type="button"
                                  onClick={() => handleReactivate(cc.costCodeId)}
                                  disabled={isActionLoading}
                                  className="rounded-lg p-1.5 text-slate-500 hover:bg-emerald-50 hover:text-emerald-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-500"
                                  aria-label={`Reactivate cost code ${cc.code}`}
                                  title="Reactivate cost code"
                                >
                                  <RefreshCw className={`h-3.5 w-3.5 ${isActionLoading ? "animate-spin" : ""}`} />
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handleArchive(cc.costCodeId)}
                                  disabled={isActionLoading}
                                  className="rounded-lg p-1.5 text-slate-500 hover:bg-rose-50 hover:text-rose-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-rose-500"
                                  aria-label={`Archive cost code ${cc.code}`}
                                  title="Archive cost code"
                                >
                                  <Archive className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards View */}
            <div className="divide-y divide-slate-100 md:hidden">
              {projectCodes.map((cc) => {
                const isArchived = cc.status === "ARCHIVED";
                const isActionLoading = actionLoadingId === cc.costCodeId;
                return (
                  <article
                    key={cc.costCodeId}
                    className={`p-4 space-y-3 ${isArchived ? "opacity-60 bg-slate-50/40" : ""}`}
                    aria-label={`Cost code ${cc.code}`}
                  >
                    {/* Top Row: Code, Badge & Actions */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-black rounded bg-slate-100 px-2 py-0.5 text-slate-900">
                          {cc.code}
                        </span>
                        <StatusBadge tone={statusTone(cc.status)}>
                          {cc.status}
                        </StatusBadge>
                        {cc.hasForeignAmounts && (
                          <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold text-amber-800">
                            Partial
                          </span>
                        )}
                      </div>

                      {canManageProject && (
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleOpenEditModal(cc)}
                            disabled={isActionLoading}
                            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-indigo-600"
                            aria-label={`Edit cost code ${cc.code}`}
                          >
                            <Edit2 className="h-4 w-4" />
                          </button>
                          {isArchived ? (
                            <button
                              type="button"
                              onClick={() => handleReactivate(cc.costCodeId)}
                              disabled={isActionLoading}
                              className="rounded-lg p-1.5 text-slate-500 hover:bg-emerald-50 hover:text-emerald-700"
                              aria-label={`Reactivate cost code ${cc.code}`}
                            >
                              <RefreshCw className={`h-4 w-4 ${isActionLoading ? "animate-spin" : ""}`} />
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleArchive(cc.costCodeId)}
                              disabled={isActionLoading}
                              className="rounded-lg p-1.5 text-slate-500 hover:bg-rose-50 hover:text-rose-600"
                              aria-label={`Archive cost code ${cc.code}`}
                            >
                              <Archive className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Name & Description */}
                    <div>
                      <h4 className="text-xs font-bold text-slate-950">{cc.name}</h4>
                      {cc.description && (
                        <p className="mt-0.5 text-[11px] text-slate-500">{cc.description}</p>
                      )}
                      {cc.hasForeignAmounts && (
                        <p className="mt-1 text-[10px] text-amber-700">
                          Foreign: {Object.entries(cc.foreignCosts).map(([c, v]) => `${c} ${Number(v).toFixed(2)}`).join(", ")}
                        </p>
                      )}
                    </div>

                    {/* Financial Metrics Grid */}
                    <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-2.5 text-xs">
                      <div>
                        <span className="text-[10px] font-semibold text-slate-500">Approved Budget:</span>
                        <p className="font-black tabular-nums text-slate-900">{money(cc.budgetAmount, currency)}</p>
                      </div>
                      <div>
                        <span className="text-[10px] font-semibold text-slate-500">Actual Cost:</span>
                        <p className="font-black tabular-nums text-slate-900">{money(cc.actualCost, currency)}</p>
                        {cc.hasForeignAmounts && <p className="text-[9px] font-semibold text-slate-400">Base-currency actual · partial</p>}
                      </div>
                      <div>
                        <span className="text-[10px] font-semibold text-slate-500">Actual Variance:</span>
                        {cc.hasForeignAmounts ? (
                          <p className="font-semibold text-slate-400 italic">Unavailable</p>
                        ) : (
                          <p className={`font-black tabular-nums ${cc.actualVariance >= 0 ? "text-emerald-700" : "text-rose-600"}`}>
                            {cc.actualVariance >= 0 ? "+" : ""}{money(cc.actualVariance, currency)}
                          </p>
                        )}
                      </div>
                      <div>
                        <span className="text-[10px] font-semibold text-slate-500">Committed Cost:</span>
                        <p className="font-black tabular-nums text-purple-700">
                          {cc.hasForeignAmounts ? (
                            <span className="font-semibold text-slate-400 italic">Partial</span>
                          ) : (
                            money(cc.committedCost || 0, currency)
                          )}
                        </p>
                      </div>
                      <div>
                        <span className="text-[10px] font-semibold text-slate-500">Forecast Cost:</span>
                        <p className="font-bold tabular-nums text-slate-900">
                          {cc.forecastAmount != null ? money(cc.forecastAmount, currency) : <span className="text-slate-400 italic font-normal">Not set</span>}
                        </p>
                      </div>
                      <div>
                        <span className="text-[10px] font-semibold text-slate-500">Forecast Variance:</span>
                        <p className={`font-bold tabular-nums ${cc.forecastVariance != null && cc.forecastVariance >= 0 ? "text-emerald-700" : cc.forecastVariance != null ? "text-rose-600" : "text-slate-400 italic font-normal"}`}>
                          {cc.forecastVariance != null ? `${cc.forecastVariance >= 0 ? "+" : ""}${money(cc.forecastVariance, currency)}` : "Not set"}
                        </p>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </>
        )}
      </Card>

      {/* Modal Dialog */}
      <ProjectCostCodeModal
        open={modalOpen}
        projectId={project.id}
        projectBudget={project.projectBudget}
        currency={currency}
        costCode={editingCode}
        existingCodes={costCodes}
        loading={modalLoading}
        onSave={handleSaveModal}
        onClose={() => setModalOpen(false)}
      />
    </div>
  );
};

export default ProjectBudgetControlPanel;
