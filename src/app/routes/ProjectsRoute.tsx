import React from "react";
import { ProjectsPage } from "../../components/projects/ProjectsPage";
import { ProjectWorkspace, type WorkspaceTab } from "../../components/projects/ProjectWorkspace";
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
import type { ProjectDashboardViewData } from "../../utils/projectDashboardViewModel";
import type { EngineeringDailySiteLogsWorkspaceData } from "../../lib/dailySiteLogs.ts";
import type { EngineeringCoordinationWorkspaceData } from "../../lib/engineeringCoordination.ts";
import type { EngineeringDocumentsWorkspaceData } from "../../lib/engineeringDocuments.ts";
import type { ProjectLifecycleAction, ProjectLifecyclePreview } from "../../lib/projects.ts";
import type { ClientBilling, ClientBillingEvent, ClientBillingInput, ClientBillingLineInput, ClientBillingStatus } from "../../lib/clientBilling.ts";
import type { ClientCollection, ClientCollectionAllocationInput, ClientCollectionEvent, ClientCollectionInput } from "../../lib/clientCollections.ts";
import type { CashBankingWorkspaceData, FinancialTransaction, FinancialTransactionMatch } from "../../lib/cashBanking.ts";
import type { ProjectEquipmentSaveInput, ProjectMaterialSaveInput } from "../../lib/materialsEquipment.ts";
import type { InventoryItem, InventoryMovement } from "../../lib/inventory.ts";
import type { AppNavigate } from "../../utils/clientNavigation.ts";

export interface ProjectsRouteProps {
  projects: Project[];
  clientBillings?: ClientBilling[];
  clientBillingEvents?: ClientBillingEvent[];
  clientBillingLoading?: boolean;
  onSaveClientBilling?: (input: ClientBillingInput, lines: readonly ClientBillingLineInput[]) => Promise<void> | void;
  onTransitionClientBilling?: (id: string, targetStatus: ClientBillingStatus, reason?: string) => Promise<void> | void;
  clientCollections?: ClientCollection[];
  clientCollectionEvents?: ClientCollectionEvent[];
  onSaveClientCollection?: (input: ClientCollectionInput, allocations: readonly ClientCollectionAllocationInput[]) => Promise<void> | void;
  onRecordClientCollection?: (id: string) => Promise<void> | void;
  onReverseClientCollection?: (id: string, reason: string) => Promise<void> | void;
  cashData?: CashBankingWorkspaceData;
  canReconcileCash?: boolean;
  canSettleClientCollection?: boolean;
  onSaveFinancialMatch?: (match: FinancialTransactionMatch, transaction: FinancialTransaction) => Promise<void> | void;
  onReverseFinancialMatch?: (matchId: string, reason: string) => Promise<void> | void;
  canReverseFinancialMatch?: (match: FinancialTransactionMatch) => boolean;
  selectedProject?: Project | null;
  summaries: Record<string, ProjectCostSummary>;
  projectDashboard?: ProjectDashboardViewData;
  costCodes?: readonly ProjectCostCode[];
  invoices: InvoiceData[];
  invoiceAllocations: InvoiceProjectAllocation[];
  expenses: Expense[];
  purchaseOrders?: PurchaseOrder[];
  subcontracts?: Subcontract[];
  subcontractClaims?: SubcontractProgressClaim[];
  subcontractVariations?: SubcontractVariation[];
  receipts?: PurchaseOrderReceipt[];
  materials?: ProjectMaterial[];
  equipment?: ProjectEquipment[];
  inventoryItems?: InventoryItem[];
  inventoryMovements?: InventoryMovement[];
  inventoryBalances?: import("../../lib/inventory.ts").InventoryBalance[];
  vendors?: Vendor[];
  workers?: Worker[];
  assignments?: ProjectWorkerAssignment[];
  payrollAllocations?: PayrollProjectAllocation[];
  payrollPeriods?: PayrollPeriod[];
  projectFormSeed?: Project | null;
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
  onDailySiteLogsDataChange?: (data: EngineeringDailySiteLogsWorkspaceData) => void;
  onSaveMaterial?: (input: ProjectMaterialSaveInput) => Promise<void>;
  onSaveEquipment?: (input: ProjectEquipmentSaveInput) => Promise<void>;
  onOpenWarehouse?: () => void;
  attentionToday?: string;
  onTabChange?: (tab: WorkspaceTab) => void;
  onOpenProject: (project: Project) => void;
  onSaveProject: (project: Project) => Promise<void> | void;
  onPreviewProjectLifecycle: (project: Project) => Promise<ProjectLifecyclePreview>;
  onApplyProjectLifecycle: (project: Project, action: ProjectLifecycleAction, reason?: string) => Promise<void>;
  onArchiveProject: (project: Project) => Promise<void> | void;
  onReactivateProject: (project: Project) => Promise<void> | void;
  onEditProject?: () => void;
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
  onSavePO?: (
    po: Partial<PurchaseOrder> & { poNumber: string; vendorId: string; projectId: string },
    lines: Array<Partial<PurchaseOrderLine> & { description: string; quantity: number; unitPrice: number }>,
  ) => Promise<void>;
  onTransitionPO?: (id: string, targetStatus: PurchaseOrderStatus, reason?: string) => Promise<void>;
  onDeletePO?: (id: string) => Promise<void>;
  onSaveSubcontract?: (
    subcontract: Partial<Subcontract> & { subcontractNumber: string; vendorId: string; projectId: string; title: string },
    lines: Array<Partial<SubcontractLine> & { description: string; amount: number }>,
  ) => Promise<void>;
  onTransitionSubcontract?: (id: string, targetStatus: SubcontractStatus, reason?: string) => Promise<void>;
  onDeleteSubcontract?: (id: string) => Promise<void>;
  onSaveSubcontractClaim?: (
    claim: Partial<SubcontractProgressClaim> & { subcontractId: string; projectId: string; claimNumber: string; valuationDate: string },
    lines: Array<{ subcontractLineId?: string; subcontractVariationLineId?: string; claimedAmount: number; notes?: string }>,
  ) => Promise<void>;
  onTransitionSubcontractClaim?: (id: string, targetStatus: SubcontractProgressClaimStatus, reason?: string, lineApprovals?: Array<{ claimLineId: string; approvedAmount: number }>) => Promise<void>;
  onDeleteSubcontractClaim?: (id: string) => Promise<void>;
  onSaveSubcontractVariation?: (
    variation: Partial<SubcontractVariation> & { subcontractId: string; projectId: string; variationNumber: string; title: string; currency?: string },
    lines: Array<Partial<SubcontractVariationLine> & { description: string; amount: number }>,
  ) => Promise<void>;
  onTransitionSubcontractVariation?: (id: string, targetStatus: SubcontractVariationStatus, reason?: string) => Promise<void>;
  onDeleteSubcontractVariation?: (id: string) => Promise<void>;
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
  onBack: () => void;
  onOpenInvoice: (invoice: InvoiceData) => void;
  onUploadInvoice: () => void;
  onAddExpense?: () => void;
  onOpenExpenseCorrection?: (expense: Expense) => void;
  onOpenPayroll?: () => void;
}

export const ProjectsRoute: React.FC<ProjectsRouteProps> = ({
  projects,
  clientBillings = [],
  clientBillingEvents = [],
  clientBillingLoading = false,
  onSaveClientBilling = async () => {},
  onTransitionClientBilling = async () => {},
  clientCollections = [],
  clientCollectionEvents = [],
  onSaveClientCollection,
  onRecordClientCollection,
  onReverseClientCollection,
  cashData,
  canReconcileCash,
  canSettleClientCollection,
  onSaveFinancialMatch,
  onReverseFinancialMatch,
  canReverseFinancialMatch,
  selectedProject,
  summaries,
  projectDashboard,
  costCodes = [],
  invoices,
  invoiceAllocations,
  expenses,
  purchaseOrders = [],
  subcontracts = [],
  subcontractClaims = [],
  subcontractVariations = [],
  receipts = [],
  materials = [],
  equipment = [],
  inventoryItems = [],
  inventoryMovements = [],
  inventoryBalances,
  vendors = [],
  workers = [],
  assignments = [],
  payrollAllocations = [],
  payrollPeriods = [],
  projectFormSeed,
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
  engineeringDocumentsCanRead,
  engineeringDocumentsCanCreate,
  engineeringDocumentsCanAnnotate,
  engineeringDocumentsCanManage,
  engineeringRfisCanRead,
  engineeringRfisCanCreate,
  engineeringRfisCanRespond,
  engineeringRfisCanManage,
  engineeringSubmittalsCanRead,
  engineeringSubmittalsCanCreate,
  engineeringSubmittalsCanReview,
  engineeringSubmittalsCanManage,
  engineeringDocumentsGuestMode,
  engineeringDocumentsData,
  engineeringCoordinationData,
  projectDocumentsContent,
  dailySiteLogsData,
  onDailySiteLogsDataChange,
  onSaveMaterial,
  onSaveEquipment,
  onOpenWarehouse,
  attentionToday,
  onTabChange,
  onOpenProject,
  onSaveProject,
  onPreviewProjectLifecycle,
  onApplyProjectLifecycle,
  onArchiveProject,
  onReactivateProject,
  onEditProject,
  onSaveCostCode,
  onArchiveCostCode,
  onReactivateCostCode,
  onSaveInvoiceAllocations,
  onSavePO,
  onTransitionPO,
  onDeletePO,
  onSaveSubcontract,
  onTransitionSubcontract,
  onDeleteSubcontract,
  onSaveSubcontractClaim,
  onTransitionSubcontractClaim,
  onDeleteSubcontractClaim,
  onSaveSubcontractVariation,
  onTransitionSubcontractVariation,
  onDeleteSubcontractVariation,
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
  onBack,
  onOpenInvoice,
  onUploadInvoice,
  onAddExpense,
  onOpenExpenseCorrection,
  onOpenPayroll,
}) => {
  const query = typeof window === "undefined" ? null : new URLSearchParams(window.location.search);
  const linkedRfiId = initialRfiId || query?.get("rfiId")?.trim() || undefined;
  const linkedSubmittalId = initialSubmittalId || query?.get("submittalId")?.trim() || undefined;
  const linkedRoundId = initialSubmittalRoundId || query?.get("roundId")?.trim() || undefined;
  const linkedSiteLogId = initialSiteLogId || query?.get("siteLogId")?.trim() || undefined;

  if (selectedProject) {
    const summary = summaries[selectedProject.id] || ({
      budget: selectedProject.projectBudget,
      totalActualCost: 0,
      remainingBudget: selectedProject.projectBudget,
      budgetUsedPercent: 0,
      invoiceCost: 0,
      payrollCost: 0,
      otherExpenseCost: 0,
    } as ProjectCostSummary);
    const canReactivateSelectedProject = selectedProject.status === "ARCHIVED"
      && ["PLANNING", "ACTIVE", "ON_HOLD"].includes(selectedProject.archivedFromStatus || "");

    return (
      <ProjectWorkspace
        project={selectedProject}
        summary={summary}
        clientBillings={clientBillings}
        clientBillingEvents={clientBillingEvents}
        clientBillingLoading={clientBillingLoading}
        clientCollections={clientCollections}
        clientCollectionEvents={clientCollectionEvents}
        onSaveClientCollection={onSaveClientCollection}
        onRecordClientCollection={onRecordClientCollection}
        onReverseClientCollection={onReverseClientCollection}
        cashData={cashData}
        canReconcileCash={canReconcileCash}
        canSettleClientCollection={canSettleClientCollection}
        onSaveFinancialMatch={onSaveFinancialMatch}
        onReverseFinancialMatch={onReverseFinancialMatch}
        canReverseFinancialMatch={canReverseFinancialMatch}
        dashboard={projectDashboard}
        costCodes={costCodes}
        invoices={invoices}
        invoiceAllocations={invoiceAllocations}
        expenses={expenses}
        purchaseOrders={purchaseOrders}
        subcontracts={subcontracts}
        subcontractClaims={subcontractClaims}
        subcontractVariations={subcontractVariations}
        receipts={receipts}
        materials={materials}
        equipment={equipment}
        inventoryItems={inventoryItems}
        inventoryMovements={inventoryMovements}
        inventoryBalances={inventoryBalances}
        vendors={vendors}
        workers={workers}
        assignments={assignments}
        payrollAllocations={payrollAllocations}
        payrollPeriods={payrollPeriods}
        initialTab={initialTab}
        initialDocumentId={initialDocumentId}
        initialRevisionId={initialRevisionId}
        initialRfiId={linkedRfiId}
        initialSubmittalId={linkedSubmittalId}
        initialSubmittalRoundId={linkedRoundId}
        initialSiteLogId={linkedSiteLogId}
        pathForSiteLog={pathForSiteLog}
        onNavigatePath={onNavigatePath}
        companyId={companyId}
        engineeringDocumentsCanRead={engineeringDocumentsCanRead}
        engineeringDocumentsCanCreate={engineeringDocumentsCanCreate}
        engineeringDocumentsCanAnnotate={engineeringDocumentsCanAnnotate}
        engineeringDocumentsCanManage={engineeringDocumentsCanManage}
        engineeringRfisCanRead={engineeringRfisCanRead}
        engineeringRfisCanCreate={engineeringRfisCanCreate}
        engineeringRfisCanRespond={engineeringRfisCanRespond}
        engineeringRfisCanManage={engineeringRfisCanManage}
        engineeringSubmittalsCanRead={engineeringSubmittalsCanRead}
        engineeringSubmittalsCanCreate={engineeringSubmittalsCanCreate}
        engineeringSubmittalsCanReview={engineeringSubmittalsCanReview}
        engineeringSubmittalsCanManage={engineeringSubmittalsCanManage}
        engineeringDocumentsGuestMode={engineeringDocumentsGuestMode}
        engineeringDocumentsData={engineeringDocumentsData}
        engineeringCoordinationData={engineeringCoordinationData}
        projectDocumentsContent={projectDocumentsContent}
        dailySiteLogsData={dailySiteLogsData}
        attentionToday={attentionToday}
        onDailySiteLogsDataChange={onDailySiteLogsDataChange}
        onSaveMaterial={onSaveMaterial}
        onSaveEquipment={onSaveEquipment}
        onOpenWarehouse={onOpenWarehouse}
        onTabChange={onTabChange}
        onSaveInvoiceAllocations={onSaveInvoiceAllocations}
        onSaveClientBilling={onSaveClientBilling}
        onTransitionClientBilling={onTransitionClientBilling}
        onBack={onBack}
        onOpenInvoice={onOpenInvoice}
        onUploadInvoice={onUploadInvoice}
        onEditProject={onEditProject || (() => {})}
        onArchiveProject={() => void onArchiveProject(selectedProject)}
        onReactivateProject={canReactivateSelectedProject ? () => void onReactivateProject(selectedProject) : undefined}
        onAddExpense={onAddExpense}
        onOpenExpenseCorrection={onOpenExpenseCorrection}
        onOpenPayroll={onOpenPayroll}
        onSaveCostCode={onSaveCostCode}
        onArchiveCostCode={onArchiveCostCode}
        onReactivateCostCode={onReactivateCostCode}
        onSavePO={onSavePO}
        onTransitionPO={onTransitionPO}
        onDeletePO={onDeletePO}
        onSaveSubcontract={onSaveSubcontract}
        onTransitionSubcontract={onTransitionSubcontract}
        onDeleteSubcontract={onDeleteSubcontract}
        onSaveSubcontractClaim={onSaveSubcontractClaim}
        onTransitionSubcontractClaim={onTransitionSubcontractClaim}
        onDeleteSubcontractClaim={onDeleteSubcontractClaim}
        onSaveSubcontractVariation={onSaveSubcontractVariation}
        onTransitionSubcontractVariation={onTransitionSubcontractVariation}
        onDeleteSubcontractVariation={onDeleteSubcontractVariation}
        onRecordReceipt={onRecordReceipt}
        onVoidReceipt={onVoidReceipt}
        onAddVendor={onAddVendor}
        rfqs={rfqs}
        supplierQuotations={supplierQuotations}
        onSaveRFQ={onSaveRFQ}
        onTransitionRFQ={onTransitionRFQ}
        onDeleteRFQ={onDeleteRFQ}
        onSaveSupplierQuotation={onSaveSupplierQuotation}
        onSelectSupplierQuotation={onSelectSupplierQuotation}
        onRevertSupplierQuotationSelection={onRevertSupplierQuotationSelection}
        onConvertQuotationToPO={onConvertQuotationToPO}
      />
    );
  }

  return (
    <ProjectsPage
      projects={projects}
      summaries={summaries}
      clientBillings={clientBillings}
      clientCollections={clientCollections}
      clientFinancialDataLoading={clientBillingLoading}
      costCodes={costCodes}
      purchaseOrders={purchaseOrders}
      subcontracts={subcontracts}
      subcontractClaims={subcontractClaims}
      subcontractVariations={subcontractVariations}
      engineeringCoordinationData={engineeringCoordinationData}
      attentionToday={attentionToday}
      initialEditingProject={projectFormSeed}
      onOpenProject={onOpenProject}
      onSaveProject={onSaveProject}
      onPreviewProjectLifecycle={onPreviewProjectLifecycle}
      onApplyProjectLifecycle={onApplyProjectLifecycle}
    />
  );
};
