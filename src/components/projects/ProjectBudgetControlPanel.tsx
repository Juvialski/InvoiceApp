import React, { useMemo, useState } from "react";
import {
  AlertTriangle,
  Calculator,
  CheckCircle2,
  DollarSign,
  Layers,
  Search,
  ShieldAlert,
  Wallet,
} from "lucide-react";
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
  SubcontractProgressClaim,
  SubcontractVariation,
} from "../../types.ts";
import type { ProjectLaborCostAggregate, ProjectLaborSource } from "../../utils/projectLaborCostAggregate.ts";
import {
  calculateProjectBudgetControl,
  type CostInvoice,
  type CostPayrollRecord,
  type ProjectBudgetControlSummary,
} from "../../utils/projectCosting.ts";
import { MetricCard } from "../ui/OperationsUI.tsx";
import { ProjectCostCodesWorksheet, projectCostCodeWorksheetRow, type ProjectCostCodeWorksheetRow } from "./ProjectCostCodesWorksheet.tsx";

export interface ProjectBudgetControlPanelProps {
  project: Project;
  costCodes: readonly ProjectCostCode[];
  invoices: InvoiceData[];
  invoiceAllocations: InvoiceProjectAllocation[];
  expenses: Expense[];
  purchaseOrders?: PurchaseOrder[];
  subcontracts?: Subcontract[];
  subcontractClaims?: SubcontractProgressClaim[];
  subcontractVariations?: SubcontractVariation[];
  payrollAllocations?: PayrollProjectAllocation[];
  payrollPeriods?: PayrollPeriod[];
  payrollRuns?: PayrollRun[];
  projectLaborAggregates?: readonly ProjectLaborCostAggregate[];
  laborSource?: ProjectLaborSource;
  canManageProject?: boolean;
  onSaveCostCode: (costCode: {
    id?: string;
    updatedAt?: string;
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

export const ProjectBudgetControlPanel: React.FC<ProjectBudgetControlPanelProps> = ({
  project,
  costCodes,
  invoices,
  invoiceAllocations,
  expenses,
  purchaseOrders = [],
  subcontracts = [],
  subcontractClaims = [],
  subcontractVariations = [],
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
  const [statusFilter, setStatusFilter] = useState<"ALL" | "ACTIVE" | "ARCHIVED">("ALL");
  const [searchQuery, setSearchQuery] = useState("");

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
      subcontractClaims,
      subcontractVariations,
      projectLaborAggregates,
      laborSource,
      baseCurrency: project.currency,
    };
  }, [invoices, invoiceAllocations, expenses, purchaseOrders, subcontracts, subcontractClaims, subcontractVariations, payrollRuns, payrollPeriods, payrollAllocations, projectLaborAggregates, laborSource, project.currency]);

  // 2. Compute P1B Budget Control Summary
  const budgetControl: ProjectBudgetControlSummary = useMemo(() => {
    return calculateProjectBudgetControl(project, costCodes, costInput);
  }, [project, costCodes, costInput]);

  // 3. Filtered Cost Codes for display
  const projectCodes = useMemo<readonly ProjectCostCodeWorksheetRow[]>(() => {
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
    }).flatMap((summary) => {
      const source = costCodes.find((costCode) => costCode.id === summary.costCodeId);
      return source ? [projectCostCodeWorksheetRow(source, summary)] : [];
    });
  }, [budgetControl.costCodes, costCodes, statusFilter, searchQuery]);
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
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div>
            <h3 className="text-sm font-black text-slate-950">Work Package Cost Codes</h3>
            <p className="mt-0.5 text-xs text-slate-500">Edit code, work package, budget, and forecast fields in a worksheet. Actuals, commitments, variances, and lifecycle remain protected workflows.</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/50 px-4 py-3 sm:px-5">
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => setStatusFilter("ALL")} className={statusFilter === "ALL" ? "rounded-lg bg-indigo-600 px-2.5 py-1 text-xs font-bold text-white" : "rounded-lg px-2.5 py-1 text-xs font-bold text-slate-600 hover:bg-slate-100"}>All ({budgetControl.costCodes.length})</button>
            <button type="button" onClick={() => setStatusFilter("ACTIVE")} className={statusFilter === "ACTIVE" ? "rounded-lg bg-indigo-600 px-2.5 py-1 text-xs font-bold text-white" : "rounded-lg px-2.5 py-1 text-xs font-bold text-slate-600 hover:bg-slate-100"}>Active ({budgetControl.costCodes.filter((c) => c.status === "ACTIVE").length})</button>
            <button type="button" onClick={() => setStatusFilter("ARCHIVED")} className={statusFilter === "ARCHIVED" ? "rounded-lg bg-indigo-600 px-2.5 py-1 text-xs font-bold text-white" : "rounded-lg px-2.5 py-1 text-xs font-bold text-slate-600 hover:bg-slate-100"}>Archived ({budgetControl.costCodes.filter((c) => c.status === "ARCHIVED").length})</button>
          </div>
          <div className="relative min-w-[200px] max-w-xs flex-1">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <input type="text" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search code or package..." aria-label="Search cost codes" className="w-full rounded-lg border border-slate-200 bg-white py-1.5 pl-8 pr-3 text-xs outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" />
          </div>
        </div>

        <div className="min-w-0 p-3 sm:p-5">
          <ProjectCostCodesWorksheet
            project={project}
            rows={projectCodes}
            existingCodes={costCodes}
            canManageProject={canManageProject}
            onSaveCostCode={onSaveCostCode}
            onArchiveCostCode={onArchiveCostCode}
            onReactivateCostCode={onReactivateCostCode}
          />
        </div>
      </Card>
    </div>
  );
};

export default ProjectBudgetControlPanel;
