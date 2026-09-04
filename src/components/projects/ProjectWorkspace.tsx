import React, { useEffect, useMemo, useState } from "react";
import { AlertTriangle, BarChart3, Calculator, ClipboardCheck, ClipboardList, Compass, FileQuestion, FileText, HardHat, Package, Receipt, ShoppingCart, Users } from "lucide-react";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import type {
  Expense,
  InvoiceData,
  InvoiceProjectAllocation,
  PayrollPeriod,
  PayrollProjectAllocation,
  Project,
  ProjectCostCode,
  ProjectCostSummary,
  ProjectEquipment,
  ProjectMaterial,
  ProjectWorkerAssignment,
  PurchaseOrder,
  PurchaseOrderLine,
  PurchaseOrderReceipt,
  PurchaseOrderStatus,
  RFQ,
  RFQLine,
  RFQStatus,
  Subcontract,
  SubcontractLine,
  SubcontractProgressClaim,
  SubcontractProgressClaimStatus,
  SubcontractStatus,
  SubcontractVariation,
  SubcontractVariationLine,
  SubcontractVariationStatus,
  SupplierQuotation,
  SupplierQuotationLine,
  Vendor,
  Worker,
} from "../../types";
import { ProjectExpenses } from "../expenses/ProjectExpenses";
import { ClientBillingPanel } from "./ClientBillingPanel.tsx";
import type {
  ClientCollection,
  ClientCollectionAllocationInput,
  ClientCollectionEvent,
  ClientCollectionInput,
} from "../../lib/clientCollections.ts";
import { ProjectInvoices } from "./ProjectInvoices";
import { ProjectInvoicesReadOnly } from "./ProjectInvoicesReadOnly.tsx";
import { ProjectOverview } from "./ProjectOverview";
import { ProjectBudgetControlPanel } from "./ProjectBudgetControlPanel.tsx";
import { ProcurementPage } from "../procurement/ProcurementPage.tsx";
import { ProjectDocuments } from "../engineering/ProjectDocuments";
import { ProjectRfis } from "../engineering/ProjectRfis";
import { ProjectSubmittals } from "../engineering/ProjectSubmittals";
import { ProjectSiteLogs } from "../engineering/ProjectSiteLogs";
import { ProjectMaterialsEquipment } from "./ProjectMaterialsEquipment.tsx";
import { useEngineeringCoordinationAccess } from "../../features/engineering/useEngineeringCoordinationAccess";
import type { EngineeringDailySiteLogsWorkspaceData } from "../../lib/dailySiteLogs.ts";
import type { EngineeringCoordinationWorkspaceData } from "../../lib/engineeringCoordination.ts";
import type { EngineeringDocumentsWorkspaceData } from "../../lib/engineeringDocuments.ts";
import type { ProjectDashboardViewData } from "../../utils/projectDashboardViewModel";
import type { CostInvoice, ProjectCostInput } from "../../utils/projectCosting.ts";
import { hasAllPermissions, hasAnyPermission, hasPermission, PERMISSION_KEYS } from "../../utils/accessControl.ts";
import type { AppNavigate } from "../../utils/clientNavigation.ts";
import { useAppPermissions, useProjectCostCompleteness } from "../../app/AppPermissionContext.tsx";
import { projectCostMissingSourceLabels } from "../../utils/dataCompleteness.ts";
import { PageHeader, StatusBadge, type StatusTone } from "../ui/OperationsUI";
import { isProjectWorkspaceTabDeploymentVisible } from "./projectWorkspaceVisibility.ts";
import type { ClientBilling, ClientBillingEvent, ClientBillingInput, ClientBillingLineInput, ClientBillingStatus } from "../../lib/clientBilling.ts";
import type { CashBankingWorkspaceData, FinancialTransaction, FinancialTransactionMatch } from "../../lib/cashBanking.ts";

export type WorkspaceTab = "overview" | "billing" | "budget" | "procurement" | "documents" | "rfis" | "submittals" | "site-logs" | "materials-equipment" | "invoices" | "payroll" | "expenses" | "people" | "reports";

interface ProjectWorkspaceProps {
  project: Project;
  summary: ProjectCostSummary;
  clientBillings?: readonly ClientBilling[];
  clientBillingEvents?: readonly ClientBillingEvent[];
  clientBillingLoading?: boolean;
  dashboard?: ProjectDashboardViewData;
  costCodes?: readonly ProjectCostCode[];
  invoices: InvoiceData[];
  invoiceAllocations: InvoiceProjectAllocation[];
  expenses: Expense[];
  purchaseOrders?: PurchaseOrder[];
  receipts?: PurchaseOrderReceipt[];
  materials?: readonly ProjectMaterial[];
  equipment?: readonly ProjectEquipment[];
  subcontracts?: Subcontract[];
  subcontractClaims?: SubcontractProgressClaim[];
  subcontractVariations?: SubcontractVariation[];
  vendors?: Vendor[];
  workers?: Worker[];
  assignments?: ProjectWorkerAssignment[];
  payrollAllocations?: PayrollProjectAllocation[];
  payrollPeriods?: PayrollPeriod[];
  initialTab?: WorkspaceTab;
  initialDocumentId?: string;
  initialRevisionId?: string;
  initialRfiId?: string;
  initialSubmittalId?: string;
  initialSubmittalRoundId?: string;
  initialSiteLogId?: string;
  pathForSiteLog?: (siteLogId?: string) => string;
  onNavigatePath?: AppNavigate;
  companyId?: string;
  engineeringDocumentsCanRead?: boolean;
  engineeringDocumentsCanCreate?: boolean;
  engineeringDocumentsCanAnnotate?: boolean;
  engineeringDocumentsCanManage?: boolean;
  engineeringRfisCanRead?: boolean;
  engineeringRfisCanCreate?: boolean;
  engineeringRfisCanRespond?: boolean;
  engineeringRfisCanManage?: boolean;
  engineeringSubmittalsCanRead?: boolean;
  engineeringSubmittalsCanCreate?: boolean;
  engineeringSubmittalsCanReview?: boolean;
  engineeringSubmittalsCanManage?: boolean;
  engineeringDocumentsGuestMode?: boolean;
  engineeringDocumentsData?: EngineeringDocumentsWorkspaceData;
  engineeringCoordinationData?: EngineeringCoordinationWorkspaceData;
  projectDocumentsContent?: React.ReactNode;
  dailySiteLogsData?: EngineeringDailySiteLogsWorkspaceData;
  attentionToday?: string;
  onDailySiteLogsDataChange?: (data: EngineeringDailySiteLogsWorkspaceData) => void;
  onSaveMaterial?: (input: import("../../lib/materialsEquipment.ts").ProjectMaterialSaveInput) => Promise<void>;
  onSaveEquipment?: (input: import("../../lib/materialsEquipment.ts").ProjectEquipmentSaveInput) => Promise<void>;
  onTabChange?: (tab: WorkspaceTab) => void;
  onBack: () => void;
  onOpenInvoice: (invoice: InvoiceData) => void;
  onUploadInvoice: () => void;
  onEditProject: () => void;
  onArchiveProject: () => void;
  onReactivateProject?: () => void;
  onAddExpense?: () => void;
  onOpenExpenseCorrection?: (expense: Expense) => void;
  onOpenPayroll?: () => void;
  onSaveCostCode?: (costCode: {
    id?: string;
    projectId: string;
    code: string;
    name: string;
    description?: string;
    approvedBudgetAmount: number;
    forecastAmount?: number;
    status: ProjectCostCode["status"];
  }) => Promise<void> | void;
  onArchiveCostCode?: (costCodeId: string) => Promise<void> | void;
  onReactivateCostCode?: (costCodeId: string) => Promise<void> | void;
  onSaveInvoiceAllocations: (invoice: InvoiceData, allocations: InvoiceProjectAllocation[]) => Promise<void>;
  onSaveClientBilling?: (input: ClientBillingInput, lines: readonly ClientBillingLineInput[]) => Promise<void> | void;
  onTransitionClientBilling?: (id: string, targetStatus: ClientBillingStatus, reason?: string) => Promise<void> | void;
  clientCollections?: readonly ClientCollection[];
  clientCollectionEvents?: readonly ClientCollectionEvent[];
  onSaveClientCollection?: (input: ClientCollectionInput, allocations: readonly ClientCollectionAllocationInput[]) => Promise<void> | void;
  onRecordClientCollection?: (id: string) => Promise<void> | void;
  onReverseClientCollection?: (id: string, reason: string) => Promise<void> | void;
  cashData?: CashBankingWorkspaceData;
  canReconcileCash?: boolean;
  canSettleClientCollection?: boolean;
  onSaveFinancialMatch?: (match: FinancialTransactionMatch, transaction: FinancialTransaction) => Promise<void> | void;
  onReverseFinancialMatch?: (matchId: string, reason: string) => Promise<void> | void;
  canReverseFinancialMatch?: (match: FinancialTransactionMatch) => boolean;
  onSavePO?: (
    po: Partial<PurchaseOrder> & { poNumber: string; vendorId: string; projectId: string },
    lines: Array<Partial<PurchaseOrderLine> & { description: string; quantity: number; unitPrice: number }>,
  ) => Promise<void>;
  onTransitionPO?: (id: string, targetStatus: PurchaseOrderStatus, reason?: string) => Promise<void>;
  onDeletePO?: (id: string) => Promise<void>;
  onRecordReceipt?: (
    receipt: Partial<PurchaseOrderReceipt> & { purchaseOrderId: string; receiptNumber: string },
    lines: Array<{ purchaseOrderLineId: string; receivedQuantity: number; notes?: string }>,
  ) => Promise<void>;
  onVoidReceipt?: (receiptId: string, reason: string) => Promise<void>;
  onAddVendor?: (vendor: Partial<Vendor> & { name: string }) => Promise<Vendor>;
  rfqs?: RFQ[];
  supplierQuotations?: SupplierQuotation[];
  onSaveRFQ?: (
    rfq: Partial<RFQ> & { rfqNumber: string; title: string },
    lines: Array<Partial<RFQLine> & { description: string; quantity: number }>,
    invitedVendorIds?: string[],
  ) => Promise<void>;
  onTransitionRFQ?: (id: string, targetStatus: RFQStatus, reason?: string) => Promise<void>;
  onDeleteRFQ?: (id: string) => Promise<void>;
  onSaveSupplierQuotation?: (
    quotation: Partial<SupplierQuotation> & { rfqId: string; vendorId: string; quotationNumber: string },
    lines: Array<Partial<SupplierQuotationLine> & { description: string; quantity: number; unitPrice: number }>,
  ) => Promise<void>;
  onSelectSupplierQuotation?: (quotationId: string, reason: string) => Promise<void>;
  onRevertSupplierQuotationSelection?: (rfqId: string, reason: string) => Promise<void>;
  onConvertQuotationToPO?: (quotationId: string, poNumber: string, notes?: string) => Promise<void>;
  onSaveSubcontract?: (
    sc: Partial<Subcontract> & { subcontractNumber: string; vendorId: string; projectId: string; title: string },
    lines: Array<Partial<SubcontractLine> & { description: string; amount: number }>,
  ) => Promise<void>;
  onTransitionSubcontract?: (id: string, targetStatus: SubcontractStatus, reason?: string) => Promise<void>;
  onDeleteSubcontract?: (id: string) => Promise<void>;
  onSaveSubcontractClaim?: (
    claim: Partial<SubcontractProgressClaim> & {
      subcontractId: string;
      projectId: string;
      claimNumber: string;
      valuationDate: string;
    },
    lines: Array<{ subcontractLineId?: string; subcontractVariationLineId?: string; claimedAmount: number; notes?: string }>,
  ) => Promise<void>;
  onTransitionSubcontractClaim?: (
    id: string,
    targetStatus: SubcontractProgressClaimStatus,
    reason?: string,
    lineApprovals?: Array<{ claimLineId: string; approvedAmount: number }>,
  ) => Promise<void>;
  onDeleteSubcontractClaim?: (id: string) => Promise<void>;
  onSaveSubcontractVariation?: (
    variation: Partial<SubcontractVariation> & {
      subcontractId: string;
      projectId: string;
      variationNumber: string;
      title: string;
      currency?: string;
    },
    lines: Array<Partial<SubcontractVariationLine> & { description: string; amount: number }>,
  ) => Promise<void>;
  onTransitionSubcontractVariation?: (
    id: string,
    targetStatus: SubcontractVariationStatus,
    reason?: string,
  ) => Promise<void>;
  onDeleteSubcontractVariation?: (id: string) => Promise<void>;
}

function money(value: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-PH", { style: "currency", currency, maximumFractionDigits: 2 }).format(value || 0);
  } catch {
    return `${currency} ${(value || 0).toFixed(2)}`;
  }
}

function projectStatusTone(status: string): StatusTone {
  return status === "ACTIVE" || status === "IN_PROGRESS"
    ? "success"
    : status === "ARCHIVED" || status === "CANCELLED"
      ? "neutral"
      : status === "ON_HOLD"
        ? "warning"
        : "info";
}

export const ProjectWorkspace: React.FC<ProjectWorkspaceProps> = ({
  project,
  summary,
  clientBillings = [],
  clientBillingEvents = [],
  clientCollections = [],
  clientCollectionEvents = [],
  clientBillingLoading = false,
  dashboard,
  costCodes = [],
  invoices,
  invoiceAllocations,
  expenses,
  purchaseOrders = [],
  receipts = [],
  materials = [],
  equipment = [],
  vendors = [],
  workers = [],
  assignments = [],
  payrollAllocations = [],
  payrollPeriods = [],
  initialTab = "overview",
  initialDocumentId,
  initialRevisionId,
  initialRfiId,
  initialSubmittalId,
  initialSubmittalRoundId,
  initialSiteLogId,
  pathForSiteLog,
  onNavigatePath,
  companyId,
  engineeringDocumentsCanRead = true,
  engineeringDocumentsCanCreate = true,
  engineeringDocumentsCanAnnotate = true,
  engineeringDocumentsCanManage = true,
  engineeringRfisCanRead,
  engineeringRfisCanCreate,
  engineeringRfisCanRespond,
  engineeringRfisCanManage,
  engineeringSubmittalsCanRead,
  engineeringSubmittalsCanCreate,
  engineeringSubmittalsCanReview,
  engineeringSubmittalsCanManage,
  engineeringDocumentsGuestMode = false,
  engineeringDocumentsData,
  engineeringCoordinationData,
  projectDocumentsContent,
  dailySiteLogsData,
  onDailySiteLogsDataChange,
  onSaveMaterial,
  onSaveEquipment,
  attentionToday,
  onTabChange,
  onBack,
  onOpenInvoice,
  onUploadInvoice,
  onEditProject,
  onArchiveProject,
  onReactivateProject,
  onAddExpense,
  onOpenPayroll,
  onOpenExpenseCorrection,
  onSaveCostCode,
  onArchiveCostCode,
  onReactivateCostCode,
  onSaveInvoiceAllocations,
  onSaveClientBilling = async () => {},
  onTransitionClientBilling = async () => {},
  onSaveClientCollection,
  onRecordClientCollection,
  onReverseClientCollection,
  cashData,
  canReconcileCash,
  canSettleClientCollection,
  onSaveFinancialMatch,
  onReverseFinancialMatch,
  canReverseFinancialMatch,
  onSavePO,
  onTransitionPO,
  onDeletePO,
  onRecordReceipt,
  onVoidReceipt,
  onAddVendor,
  rfqs,
  supplierQuotations,
  onSaveRFQ,
  onTransitionRFQ,
  onDeleteRFQ,
  onSaveSupplierQuotation,
  onSelectSupplierQuotation,
  onRevertSupplierQuotationSelection,
  onConvertQuotationToPO,
  subcontracts,
  subcontractClaims,
  subcontractVariations,
  onSaveSubcontract,
  onTransitionSubcontract,
  onDeleteSubcontract,
  onSaveSubcontractClaim,
  onTransitionSubcontractClaim,
  onDeleteSubcontractClaim,
  onSaveSubcontractVariation,
  onTransitionSubcontractVariation,
  onDeleteSubcontractVariation,
}) => {
  const permissions = useAppPermissions();
  const canManageProject = hasPermission(permissions, PERMISSION_KEYS.projectsWrite);
  const canReadClientBilling = hasPermission(permissions, PERMISSION_KEYS.projectsRead);
  const canManageInvoiceAllocations = canManageProject && hasPermission(permissions, PERMISSION_KEYS.invoicesWrite);
  const canReadInvoices = hasPermission(permissions, PERMISSION_KEYS.invoicesRead);
  const canExtractInvoices = hasAllPermissions(permissions, [PERMISSION_KEYS.invoicesWrite, PERMISSION_KEYS.invoicesExtract, PERMISSION_KEYS.invoicesVerify]);
  const canReadPayroll = hasPermission(permissions, PERMISSION_KEYS.payrollRead);
  const canReadExpenses = hasPermission(permissions, PERMISSION_KEYS.expensesRead);
  const canManageExpenses = hasPermission(permissions, PERMISSION_KEYS.expensesWrite);
  const canReadProcurement = hasPermission(permissions, PERMISSION_KEYS.procurementRead);
  const canManageProcurement = hasPermission(permissions, PERMISSION_KEYS.procurementWrite);
  const canApproveProcurement = hasPermission(permissions, PERMISSION_KEYS.procurementApprove);
  const canReadWorkers = hasPermission(permissions, PERMISSION_KEYS.workersRead);
  const canReadReports = hasAnyPermission(permissions, [PERMISSION_KEYS.reportsRead, PERMISSION_KEYS.reportsPayrollRead]);
  const completeness = useProjectCostCompleteness();
  const costDataComplete = completeness.complete;
  const hiddenCostSources = projectCostMissingSourceLabels(completeness);

  const [tab, setTab] = useState<WorkspaceTab>(initialTab);
  const coordinationAccess = useEngineeringCoordinationAccess(companyId, engineeringDocumentsGuestMode);
  const canReadSiteLogs = engineeringDocumentsGuestMode || coordinationAccess.siteLogsRead;
  const phase1bAccess = {
    rfisRead: engineeringRfisCanRead ?? coordinationAccess.rfisRead,
    rfisCreate: engineeringRfisCanCreate ?? coordinationAccess.rfisCreate,
    rfisRespond: engineeringRfisCanRespond ?? coordinationAccess.rfisRespond,
    rfisManage: engineeringRfisCanManage ?? coordinationAccess.rfisManage,
    submittalsRead: engineeringSubmittalsCanRead ?? coordinationAccess.submittalsRead,
    submittalsCreate: engineeringSubmittalsCanCreate ?? coordinationAccess.submittalsCreate,
    submittalsReview: engineeringSubmittalsCanReview ?? coordinationAccess.submittalsReview,
    submittalsManage: engineeringSubmittalsCanManage ?? coordinationAccess.submittalsManage,
  };

  const tabs: Array<[WorkspaceTab, string, React.ElementType]> = [
    ["overview", "Overview", BarChart3],
    ...(canReadClientBilling && isProjectWorkspaceTabDeploymentVisible("billing") ? [["billing", "Client Billing", FileText] as [WorkspaceTab, string, React.ElementType]] : []),
    ...(isProjectWorkspaceTabDeploymentVisible("budget") ? [["budget", "Budget Control", Calculator] as [WorkspaceTab, string, React.ElementType]] : []),
    ...(canReadProcurement && isProjectWorkspaceTabDeploymentVisible("procurement") ? [["procurement", "Procurement", ShoppingCart] as [WorkspaceTab, string, React.ElementType]] : []),
    ...(isProjectWorkspaceTabDeploymentVisible("documents") ? [["documents", "Documents", Compass] as [WorkspaceTab, string, React.ElementType]] : []),
    ...(isProjectWorkspaceTabDeploymentVisible("rfis") ? [["rfis", "RFIs", FileQuestion] as [WorkspaceTab, string, React.ElementType]] : []),
    ...(isProjectWorkspaceTabDeploymentVisible("submittals") ? [["submittals", "Submittals", ClipboardCheck] as [WorkspaceTab, string, React.ElementType]] : []),
    ["site-logs", "Site Logs", ClipboardList],
    ...(hasPermission(permissions, PERMISSION_KEYS.projectsRead) && isProjectWorkspaceTabDeploymentVisible("materials-equipment") ? [["materials-equipment", "Materials & Equipment", Package] as [WorkspaceTab, string, React.ElementType]] : []),
    ...(canReadInvoices && isProjectWorkspaceTabDeploymentVisible("invoices") ? [["invoices", "Invoices", FileText] as [WorkspaceTab, string, React.ElementType]] : []),
    ...(canReadPayroll && isProjectWorkspaceTabDeploymentVisible("payroll") ? [["payroll", "Payroll", HardHat] as [WorkspaceTab, string, React.ElementType]] : []),
    ...(canReadExpenses && isProjectWorkspaceTabDeploymentVisible("expenses") ? [["expenses", "Expenses", Receipt] as [WorkspaceTab, string, React.ElementType]] : []),
    ...(canReadWorkers ? [["people", "People", Users] as [WorkspaceTab, string, React.ElementType]] : []),
    ...(canReadReports && isProjectWorkspaceTabDeploymentVisible("reports") ? [["reports", "Reports", BarChart3] as [WorkspaceTab, string, React.ElementType]] : []),
  ];
  const visibleTabIds = useMemo(() => new Set(tabs.map(([id]) => id)), [canReadClientBilling, canReadExpenses, canReadInvoices, canReadPayroll, canReadProcurement, canReadReports, canReadWorkers, permissions]);

  useEffect(() => {
    if (visibleTabIds.has(initialTab)) setTab(initialTab);
    else {
      setTab("overview");
      onTabChange?.("overview");
    }
  }, [initialTab, onTabChange, project.id, visibleTabIds]);

  const selectTab = (next: WorkspaceTab) => {
    if (!visibleTabIds.has(next)) return;
    setTab(next);
    onTabChange?.(next);
  };

  const projectExpenses = useMemo(() => expenses.filter((expense) => expense.projectId === project.id), [expenses, project.id]);
  const projectAssignments = assignments.filter((assignment) => assignment.projectId === project.id && assignment.active);
  const projectPayroll = payrollAllocations.filter((allocation) => allocation.projectId === project.id);
  const budgetControlLaborAggregate = useMemo(() => [{
    projectId: project.id,
    currency: project.currency,
    confirmedLaborCost: summary.payrollCost,
    pendingLaborCost: summary.pendingPayrollCost,
    status: summary.payrollCost > 0 || summary.pendingPayrollCost > 0 ? ("AVAILABLE" as const) : ("ZERO" as const),
  }], [project.id, project.currency, summary.payrollCost, summary.pendingPayrollCost]);
  const overviewCostInput = useMemo<ProjectCostInput>(() => ({
    invoices: invoices.map((invoice): CostInvoice => ({
      ...invoice,
      allocations: invoiceAllocations.filter((allocation) => allocation.invoiceId === invoice.id),
    })),
    expenses,
    purchaseOrders,
    subcontracts,
    subcontractClaims,
    subcontractVariations,
    // Overview receives only the permission-safe project labor aggregate.
    projectLaborAggregates: budgetControlLaborAggregate,
    laborSource: "aggregate",
    baseCurrency: project.currency,
  }), [budgetControlLaborAggregate, expenses, invoiceAllocations, invoices, project.currency, purchaseOrders, subcontractClaims, subcontractVariations, subcontracts]);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={project.projectCode || "Project reference missing"}
        title={project.projectName || "Unnamed project"}
        description="Project workspace sections keep client billing, engineering drawings, RFIs, technical submittals, materials, equipment, daily field records, supplier, labor, and expense records in one operational context."
        actions={(
          <>
            <Button variant="secondary" label="← Projects" onClick={onBack} />
            <StatusBadge tone={projectStatusTone(project.status)}>{project.status.replaceAll("_", " ")}</StatusBadge>
            {canManageProject && <Button variant="secondary" label="Edit" onClick={onEditProject} />}
            {canManageProject && project.status !== "ARCHIVED" && <Button variant="destructive" label="Archive" onClick={onArchiveProject} />}
            {canManageProject && project.status === "ARCHIVED" && onReactivateProject && <Button variant="secondary" label="Reactivate" onClick={onReactivateProject} />}
          </>
        )}
      />

      {!costDataComplete && (
        <div role="status" className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-xs leading-5 text-amber-950">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
          <div><strong>Partial cost visibility.</strong> Financial totals on this project are based only on available authoritative sources and exclude {hiddenCostSources.join(", ")}. They must not be treated as the complete company cost position.</div>
        </div>
      )}

      <nav className="flex gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-white p-1" aria-label="Project workspace sections">
        {tabs.map(([id, tabLabel, Icon]) => (
          <button key={id} type="button" onClick={() => selectTab(id)} aria-current={tab === id ? "page" : undefined} className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-xs font-bold ${tab === id ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-50"}`}>
            <Icon aria-hidden="true" className="h-3.5 w-3.5" />{tabLabel}
          </button>
        ))}
      </nav>

      {tab === "overview" && <ProjectOverview project={project} summary={summary} dashboard={dashboard} costCodes={costCodes} costInput={overviewCostInput} clientBillings={clientBillings} clientCollections={clientCollections} clientDataLoading={clientBillingLoading} companyId={companyId} engineeringDocumentsCanRead={engineeringDocumentsCanRead} engineeringRfisCanRead={engineeringRfisCanRead} engineeringSubmittalsCanRead={engineeringSubmittalsCanRead} engineeringSiteLogsCanRead={engineeringDocumentsGuestMode ? true : coordinationAccess.loading ? undefined : coordinationAccess.siteLogsRead} engineeringAccessLoading={coordinationAccess.loading} engineeringDocumentsGuestMode={engineeringDocumentsGuestMode} engineeringDocumentsData={engineeringDocumentsData} engineeringCoordinationData={engineeringCoordinationData} dailySiteLogsData={dailySiteLogsData} materials={materials} equipment={equipment} purchaseOrders={purchaseOrders} receipts={receipts} canReadProcurement={canReadProcurement} attentionToday={attentionToday} hideHeader onOpenTab={(next) => selectTab(next as WorkspaceTab)} />}

      {tab === "billing" && canReadClientBilling && (
        <ClientBillingPanel
          project={project}
          billings={clientBillings}
          events={clientBillingEvents}
          collections={clientCollections}
          collectionEvents={clientCollectionEvents}
          loading={clientBillingLoading}
          canManage={canManageProject}
          onSave={onSaveClientBilling}
          onTransition={onTransitionClientBilling}
          onSaveCollection={onSaveClientCollection}
          onRecordCollection={onRecordClientCollection}
          onReverseCollection={onReverseClientCollection}
          cashData={cashData}
          canReconcileCash={canReconcileCash}
          canSettleClientCollection={canSettleClientCollection}
          onSaveFinancialMatch={onSaveFinancialMatch}
          onReverseFinancialMatch={onReverseFinancialMatch}
          canReverseFinancialMatch={canReverseFinancialMatch}
          onNavigatePath={onNavigatePath}
        />
      )}

      {tab === "budget" && (
        <ProjectBudgetControlPanel
          project={project}
          costCodes={costCodes}
          invoices={invoices}
          invoiceAllocations={invoiceAllocations}
          expenses={expenses}
          purchaseOrders={purchaseOrders}
          subcontracts={subcontracts ? subcontracts.filter((s) => s.projectId === project.id) : []}
          subcontractClaims={subcontractClaims ? subcontractClaims.filter((c) => c.projectId === project.id) : []}
          subcontractVariations={subcontractVariations ? subcontractVariations.filter((v) => v.projectId === project.id) : []}
          payrollAllocations={payrollAllocations}
          payrollPeriods={payrollPeriods}
          projectLaborAggregates={budgetControlLaborAggregate}
          laborSource="aggregate"
          canManageProject={canManageProject}
          onSaveCostCode={onSaveCostCode || (async () => {})}
          onArchiveCostCode={onArchiveCostCode || (async () => {})}
          onReactivateCostCode={onReactivateCostCode || (async () => {})}
        />
      )}

      {tab === "procurement" && canReadProcurement && (
        <ProcurementPage
          purchaseOrders={purchaseOrders}
          receipts={receipts}
          projects={[project]}
          vendors={vendors}
          costCodes={costCodes as ProjectCostCode[]}
          selectedProjectId={project.id}
          canRead={canReadProcurement}
          canManage={canManageProcurement}
          canApprove={canApproveProcurement}
          onSavePO={onSavePO || (async () => {})}
          onTransitionPO={onTransitionPO || (async () => {})}
          onDeletePO={onDeletePO || (async () => {})}
          onRecordReceipt={onRecordReceipt}
          onVoidReceipt={onVoidReceipt}
          onAddVendor={onAddVendor}
          rfqs={rfqs ? rfqs.filter((r) => r.projectId === project.id) : undefined}
          supplierQuotations={supplierQuotations}
          onSaveRFQ={onSaveRFQ}
          onTransitionRFQ={onTransitionRFQ}
          onDeleteRFQ={onDeleteRFQ}
          onSaveSupplierQuotation={onSaveSupplierQuotation}
          onSelectSupplierQuotation={onSelectSupplierQuotation}
          onRevertSupplierQuotationSelection={onRevertSupplierQuotationSelection}
          onConvertQuotationToPO={onConvertQuotationToPO}
          subcontracts={subcontracts ? subcontracts.filter((s) => s.projectId === project.id) : undefined}
          onSaveSubcontract={onSaveSubcontract}
          onTransitionSubcontract={onTransitionSubcontract}
          onDeleteSubcontract={onDeleteSubcontract}
          subcontractClaims={subcontractClaims ? subcontractClaims.filter((c) => c.projectId === project.id) : undefined}
          onSaveSubcontractClaim={onSaveSubcontractClaim}
          onTransitionSubcontractClaim={onTransitionSubcontractClaim}
          onDeleteSubcontractClaim={onDeleteSubcontractClaim}
          subcontractVariations={subcontractVariations ? subcontractVariations.filter((v) => v.projectId === project.id) : undefined}
          onSaveSubcontractVariation={onSaveSubcontractVariation}
          onTransitionSubcontractVariation={onTransitionSubcontractVariation}
          onDeleteSubcontractVariation={onDeleteSubcontractVariation}
        />
      )}

      {tab === "documents" && (projectDocumentsContent ?? <ProjectDocuments project={project} companyId={companyId} initialDocumentId={initialDocumentId} initialRevisionId={initialRevisionId} canRead={engineeringDocumentsCanRead} canCreate={engineeringDocumentsCanCreate} canAnnotate={engineeringDocumentsCanAnnotate} canManage={engineeringDocumentsCanManage} guestMode={engineeringDocumentsGuestMode} />)}

      {tab === "rfis" && (coordinationAccess.loading && engineeringRfisCanRead === undefined ? <div role="status" className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm font-semibold text-slate-600">Checking RFI access…</div> : <ProjectRfis project={project} companyId={companyId} initialRfiId={initialRfiId} canRead={phase1bAccess.rfisRead} canCreate={phase1bAccess.rfisCreate} canRespond={phase1bAccess.rfisRespond} canManage={phase1bAccess.rfisManage} canReadDocuments={engineeringDocumentsCanRead} guestMode={engineeringDocumentsGuestMode} onNavigatePath={onNavigatePath} />)}

      {tab === "submittals" && (coordinationAccess.loading && engineeringSubmittalsCanRead === undefined ? <div role="status" className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm font-semibold text-slate-600">Checking submittal access…</div> : <ProjectSubmittals project={project} companyId={companyId} initialSubmittalId={initialSubmittalId} initialRoundId={initialSubmittalRoundId} canRead={phase1bAccess.submittalsRead} canCreate={phase1bAccess.submittalsCreate} canReview={phase1bAccess.submittalsReview} canManage={phase1bAccess.submittalsManage} canReadDocuments={engineeringDocumentsCanRead} guestMode={engineeringDocumentsGuestMode} onNavigatePath={onNavigatePath} />)}

      {tab === "site-logs" && (coordinationAccess.loading && !engineeringDocumentsGuestMode && dailySiteLogsData === undefined ? <div role="status" className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm font-semibold text-slate-600">Checking Site Log access…</div> : <ProjectSiteLogs project={project} companyId={companyId} initialSiteLogId={initialSiteLogId} pathForSiteLog={pathForSiteLog} onNavigatePath={onNavigatePath} canRead={engineeringDocumentsGuestMode || coordinationAccess.siteLogsRead} canCreate={engineeringDocumentsGuestMode || coordinationAccess.siteLogsCreate} canUpdate={engineeringDocumentsGuestMode || coordinationAccess.siteLogsUpdate} canSubmit={engineeringDocumentsGuestMode || coordinationAccess.siteLogsSubmit} canManage={engineeringDocumentsGuestMode || coordinationAccess.siteLogsManage} guestMode={engineeringDocumentsGuestMode} controlledData={dailySiteLogsData} onControlledDataChange={onDailySiteLogsDataChange} materials={materials.filter((material) => material.projectId === project.id)} registeredEquipment={equipment.filter((item) => item.projectId === project.id)} purchaseOrders={purchaseOrders.filter((purchaseOrder) => purchaseOrder.projectId === project.id)} receipts={receipts} costCodes={costCodes.filter((costCode) => costCode.projectId === project.id)} canReadProcurement={canReadProcurement} />)}

      {tab === "materials-equipment" && <ProjectMaterialsEquipment project={project} materials={materials} equipment={equipment} purchaseOrders={purchaseOrders} receipts={receipts} vendors={vendors} costCodes={costCodes} dailySiteLogsData={dailySiteLogsData} canReadSiteLogs={canReadSiteLogs} canReadProcurement={canReadProcurement} canManage={canManageProject} guestMode={engineeringDocumentsGuestMode} onOpenSiteLogs={() => selectTab("site-logs")} onSaveMaterial={onSaveMaterial} onSaveEquipment={onSaveEquipment} />}

      {tab === "invoices" && canReadInvoices && (canManageInvoiceAllocations
        ? <ProjectInvoices project={project} invoices={invoices} allocations={invoiceAllocations} costCodes={costCodes as ProjectCostCode[]} onOpenInvoice={onOpenInvoice} onUploadInvoice={canExtractInvoices ? onUploadInvoice : undefined} onSaveAllocations={onSaveInvoiceAllocations} />
        : <ProjectInvoicesReadOnly project={project} invoices={invoices} allocations={invoiceAllocations} onOpenInvoice={onOpenInvoice} />)}

      {tab === "expenses" && canReadExpenses && <ProjectExpenses projectId={project.id} currency={project.currency} expenses={projectExpenses} onAdd={canManageExpenses ? onAddExpense : undefined} onOpenCorrection={canManageExpenses ? onOpenExpenseCorrection : undefined} />}

      {tab === "payroll" && canReadPayroll && <Card className="overflow-hidden p-0 shadow-sm" elevation="low"><div className="flex items-center justify-between gap-3 border-b border-slate-100 p-5"><div><h3 className="text-sm font-black">Project payroll</h3><p className="mt-1 text-xs text-slate-500">Approved and paid payroll allocations feed labor cost.</p></div>{onOpenPayroll && <Button variant="primary" label="Open payroll" onClick={onOpenPayroll} />}</div>{projectPayroll.length ? <div className="divide-y divide-slate-100">{projectPayroll.map((allocation) => <div key={allocation.id} className="flex items-center justify-between gap-3 px-5 py-4"><div><p className="text-xs font-bold">Payroll allocation</p><p className="mt-1 text-[10px] text-slate-500">{payrollPeriods[0] ? `${payrollPeriods[0].periodStart} – ${payrollPeriods[0].periodEnd}` : "Current period"} • {allocation.source.replaceAll("_", " ")}</p></div><p className="text-xs font-black tabular-nums">{money(allocation.allocationAmount, project.currency)}</p></div>)}</div> : <div className="p-10 text-center"><HardHat className="mx-auto h-8 w-8 text-slate-300" /><p className="mt-3 text-sm font-bold text-slate-700">No payroll recorded for this project.</p><p className="mt-1 text-xs text-slate-500">Approve a payroll run with a project allocation to populate this view.</p></div>}</Card>}

      {tab === "people" && canReadWorkers && <Card className="overflow-hidden p-0 shadow-sm" elevation="low"><div className="border-b border-slate-100 p-5"><h3 className="text-sm font-black">Project people</h3><p className="mt-1 text-xs text-slate-500">Workers can move between projects over time.</p></div>{projectAssignments.length ? <div className="divide-y divide-slate-100">{projectAssignments.map((assignment) => { const worker = workers.find((item) => item.id === assignment.workerId); return <div key={assignment.id} className="flex items-center justify-between gap-3 px-5 py-4"><div><p className="text-xs font-black">{worker?.displayName || "Worker"}</p><p className="mt-1 text-[10px] text-slate-500">{assignment.roleOnProject || worker?.jobTitle || "Role not set"} • since {assignment.startDate}</p></div><span className="text-[10px] font-bold text-emerald-700">{assignment.active ? "Active" : "Inactive"}</span></div>; })}</div> : <div className="p-10 text-center"><Users className="mx-auto h-8 w-8 text-slate-300" /><p className="mt-3 text-sm font-bold text-slate-700">No workers assigned to this project.</p><p className="mt-1 text-xs text-slate-500">Use Payroll to add a project assignment.</p></div>}</Card>}

      {tab === "reports" && canReadReports && <section className="grid gap-4 md:grid-cols-2"><Card className="p-5 shadow-sm" elevation="low"><h3 className="text-sm font-black">{costDataComplete ? "Project cost summary" : "Visible project cost summary"}</h3>{!costDataComplete && <p className="mt-1 text-[10px] leading-4 text-amber-700">This report excludes unavailable, incomplete, or non-combinable cost sources.</p>}<div className="mt-4 space-y-3">{[["Invoice cost", summary.invoiceCost], ["Payroll cost", summary.payrollCost], ["Other expenses", summary.otherExpenseCost], [costDataComplete ? "Actual cost" : "Visible actual cost", summary.totalActualCost], [costDataComplete ? "Remaining budget" : "Visible-data budget balance", summary.remainingBudget]].map(([itemLabel, value]) => <div key={String(itemLabel)} className="flex items-center justify-between gap-3 text-xs"><span className="font-semibold text-slate-600">{itemLabel}</span><span className="font-black tabular-nums">{money(Number(value), project.currency)}</span></div>)}</div></Card><Card className="p-5 shadow-sm" elevation="low"><h3 className="text-sm font-black">Operational notes</h3><p className="mt-4 whitespace-pre-wrap text-xs text-slate-600">{project.notes || project.description || "No project notes yet."}</p></Card></section>}
    </div>
  );
};
