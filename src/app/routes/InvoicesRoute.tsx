import React, { useState } from "react";
import { VerificationWorkspace, type SaveState } from "../../components/VerificationWorkspace";
import { UploadZone, type ExtractPayload } from "../../components/UploadZone";
import { EmailInbox } from "../../components/EmailInbox";
import { ReviewQueue } from "../../components/ReviewQueue";
import { InvoiceDirectory } from "../../components/InvoiceDirectory";
import { InvoiceDirectoryReadOnly } from "../../components/InvoiceDirectoryReadOnly.tsx";
import { InvoiceViewer } from "../../components/InvoiceViewer.tsx";
import { Vendors } from "../../components/Vendors";
import { FinancialSettlementCard } from "../../components/FinancialSettlementCard.tsx";
import { InvoiceSettlementDirectoryPanel } from "../../components/InvoiceSettlementDirectoryPanel.tsx";
import type {
  EmailClassification,
  GmailConnectionInfo,
  GmailMessageCandidate,
  GmailScanWindow,
  InvoiceData,
  InvoiceProjectAllocation,
  Project,
  ProjectCostCode,
  PurchaseOrder,
  PurchaseOrderInvoiceMatch,
  PurchaseOrderReceipt,
} from "../../types";
import { hasAllPermissions, hasPermission, PERMISSION_KEYS } from "../../utils/accessControl.ts";
import type { AppTab } from "../../utils/routes";
import { useAppPermissions } from "../AppPermissionContext.tsx";
import { FinancialCorrectionDialog } from "../../components/financial/FinancialCorrectionDialog.tsx";
import type { FinancialCorrectionAction, FinancialCorrectionPreview, FinancialCorrectionResult } from "../../lib/financialLifecycle.ts";
import type { AppNavigate } from "../../utils/clientNavigation.ts";

export interface InvoicesRouteProps {
  selectedInvoice?: InvoiceData | null;
  activeSubTab?: AppTab | "invoices" | "extractor" | "inbox" | "review" | "vendors";
  invoices: InvoiceData[];
  projects?: Project[];
  costCodes?: ProjectCostCode[];
  invoiceProjectAllocations?: InvoiceProjectAllocation[];
  preferredProjectId?: string;
  reviewQueue?: InvoiceData[];
  reviewIndex?: number;
  saveState?: SaveState;
  reviewCompletion?: { verifiedCount: number; totalCount: number; newItems: number } | null;
  retryingInvoiceId?: string | null;
  workspaceOriginLabel?: string;
  processingCount?: number;
  gmailConnection?: GmailConnectionInfo;
  onRetryExtraction?: (invoice: InvoiceData) => Promise<InvoiceData | null>;
  onUpdateInvoice?: (invoice: InvoiceData) => void;
  onBack?: () => void | Promise<void>;
  onPrevious?: () => Promise<boolean>;
  onNext?: () => Promise<boolean>;
  onSave?: () => Promise<boolean>;
  onVerifyAndNext?: () => Promise<boolean>;
  onReopen?: (invoice: InvoiceData) => Promise<void> | void;
  onContinueWithNewItems?: () => void;
  onReturnToDashboard?: () => void;
  onViewVerified?: () => void;
  onRevertToAI?: (invoice: InvoiceData) => void;
  onRevertField?: (invoice: InvoiceData, path: string) => void;
  onSaveProjectAllocations?: (invoice: InvoiceData, allocations: InvoiceProjectAllocation[]) => Promise<void>;
  onSelectInvoice?: (invoice: InvoiceData) => void;
  onOpenInvoiceForReview?: (invoice: InvoiceData) => void;
  onStartReview?: (queue?: InvoiceData[]) => void;
  onPreviewCorrection?: (invoice: InvoiceData) => Promise<FinancialCorrectionPreview>;
  onApplyCorrection?: (invoice: InvoiceData, action: FinancialCorrectionAction, reason?: string) => Promise<FinancialCorrectionResult>;
  onAddNew?: () => void;
  onExtract?: (payload: ExtractPayload) => Promise<InvoiceData>;
  onLoadPreset?: (invoice: InvoiceData) => void;
  onBatchComplete?: (successful: InvoiceData[], failed: Array<{ name: string; error: string }>) => void;
  onConnectGmail?: () => Promise<void> | void;
  onSignOut?: () => Promise<void> | void;
  onScanGmail?: (window: GmailScanWindow) => Promise<GmailMessageCandidate[]>;
  onSyncGmail?: () => Promise<GmailMessageCandidate[]>;
  onImportGmailMessage?: (message: GmailMessageCandidate) => Promise<number>;
  onProcessEmail?: (input: { sender: string; subject: string; receivedAt: string; body: string; attachments: File[] }) => Promise<EmailClassification | null>;
  onNavigatePath?: AppNavigate;
  purchaseOrders?: PurchaseOrder[];
  purchaseOrderReceipts?: PurchaseOrderReceipt[];
  purchaseOrderMatches?: PurchaseOrderInvoiceMatch[];
  onConfirmPurchaseOrderMatch?: (
    poId: string,
    lines: Array<{
      invoiceLineId: string;
      purchaseOrderLineId: string;
      matchedQuantity?: number;
      matchedAmount?: number;
    }>,
    notes?: string,
  ) => Promise<void>;
  onUnmatchPurchaseOrderMatch?: (matchId: string, reason: string) => Promise<void>;
  onOpenPurchaseOrder?: (purchaseOrderId: string) => void;
}

export const InvoicesRoute: React.FC<InvoicesRouteProps> = ({
  selectedInvoice,
  activeSubTab = "invoices",
  invoices,
  projects = [],
  costCodes = [],
  invoiceProjectAllocations = [],
  preferredProjectId,
  reviewQueue = [],
  reviewIndex = -1,
  saveState = "saved",
  reviewCompletion = null,
  retryingInvoiceId = null,
  workspaceOriginLabel,
  processingCount = 0,
  gmailConnection,
  onRetryExtraction,
  onUpdateInvoice = () => {},
  onBack = () => {},
  onPrevious = async () => false,
  onNext = async () => false,
  onSave = async () => false,
  onVerifyAndNext = async () => false,
  onReopen,
  onContinueWithNewItems,
  onReturnToDashboard = () => {},
  onViewVerified = () => {},
  onRevertToAI,
  onRevertField,
  onSaveProjectAllocations = async () => {},
  onSelectInvoice = () => {},
  onOpenInvoiceForReview = () => {},
  onStartReview = () => {},
  onPreviewCorrection,
  onApplyCorrection,
  onAddNew = () => {},
  onExtract = async () => { throw new Error("Extractor handler not configured."); },
  onLoadPreset,
  onBatchComplete,
  onConnectGmail = () => {},
  onSignOut = () => {},
  onScanGmail = async () => [],
  onSyncGmail = async () => [],
  onImportGmailMessage = async () => { throw new Error("Gmail import handler not configured."); },
  onProcessEmail = async () => { throw new Error("Process email handler not configured."); },
  onNavigatePath,
  purchaseOrders,
  purchaseOrderReceipts,
  purchaseOrderMatches,
  onConfirmPurchaseOrderMatch,
  onUnmatchPurchaseOrderMatch,
  onOpenPurchaseOrder,
}) => {
  const permissions = useAppPermissions();
  const canManageInvoices = hasPermission(permissions, PERMISSION_KEYS.invoicesWrite);
  const canVerifyInvoices = hasAllPermissions(permissions, [PERMISSION_KEYS.invoicesWrite, PERMISSION_KEYS.invoicesVerify]);
  const canExtractInvoices = hasAllPermissions(permissions, [PERMISSION_KEYS.invoicesWrite, PERMISSION_KEYS.invoicesExtract, PERMISSION_KEYS.invoicesVerify]);
  const canManageProjectAllocations = hasAllPermissions(permissions, [PERMISSION_KEYS.invoicesWrite, PERMISSION_KEYS.projectsWrite]);
  const canReadProcurement = hasPermission(permissions, PERMISSION_KEYS.procurementRead);
  const canManageProcurement = hasPermission(permissions, PERMISSION_KEYS.procurementWrite);
  const canManageGmail = hasPermission(permissions, PERMISSION_KEYS.gmailManage);
  const canImportBankStatements = hasPermission(permissions, PERMISSION_KEYS.cashImport);
  const canManageExpenses = hasAllPermissions(permissions, [PERMISSION_KEYS.expensesRead, PERMISSION_KEYS.expensesWrite]);
  const canReverseSettlement = hasPermission(permissions, PERMISSION_KEYS.cashReconcile) && hasPermission(permissions, PERMISSION_KEYS.invoicesWrite);
  const [correctionInvoice, setCorrectionInvoice] = useState<InvoiceData | null>(null);
  const [correctionPreview, setCorrectionPreview] = useState<FinancialCorrectionPreview | null>(null);
  const [correctionLoading, setCorrectionLoading] = useState(false);
  const [correctionError, setCorrectionError] = useState("");
  const [correctionReason, setCorrectionReason] = useState("");

  const openCorrection = async (invoice: InvoiceData) => {
    setCorrectionInvoice(invoice);
    setCorrectionPreview(null);
    setCorrectionError("");
    setCorrectionReason("");
    setCorrectionLoading(true);
    try {
      if (!onPreviewCorrection) throw new Error("Invoice correction is not available in this workspace.");
      setCorrectionPreview(await onPreviewCorrection(invoice));
    } catch (error) {
      setCorrectionError(error instanceof Error ? error.message : "Could not load the invoice correction preview. No action was taken.");
    } finally {
      setCorrectionLoading(false);
    }
  };
  const closeCorrection = () => {
    setCorrectionInvoice(null);
    setCorrectionPreview(null);
    setCorrectionError("");
    setCorrectionReason("");
  };

  const applyCorrection = async (action: FinancialCorrectionAction) => {
    if (!correctionInvoice || !correctionPreview || !onApplyCorrection) return;
    if ((action === "VOID" || action === "ARCHIVE" || action === "RESTORE") && correctionReason.trim().length < 3) return;
    setCorrectionLoading(true);
    setCorrectionError("");
    try {
      await onApplyCorrection(correctionInvoice, action, correctionReason.trim() || undefined);
      closeCorrection();
    } catch (error) {
      setCorrectionError(error instanceof Error ? error.message : "Could not complete the invoice correction. Nothing was changed.");
    } finally {
      setCorrectionLoading(false);
    }
  };

  const correctionDialog = correctionInvoice ? <FinancialCorrectionDialog entityLabel="invoice" recordLabel={`${correctionInvoice.invoiceNumber || "Invoice"}${correctionInvoice.vendor?.name ? ` · ${correctionInvoice.vendor.name}` : ""}`} preview={correctionPreview} loading={correctionLoading} error={correctionError} reason={correctionReason} onReasonChange={setCorrectionReason} onApply={(action) => void applyCorrection(action)} onClose={closeCorrection} /> : null;

  if (selectedInvoice) {
    if (!canManageInvoices && !canVerifyInvoices) {
      return <div className="space-y-5"><FinancialSettlementCard targetType="INVOICE" targetId={selectedInvoice.id} lifecycleStatus={selectedInvoice.lifecycleStatus} compact canReverse={canReverseSettlement} onNavigatePath={onNavigatePath} /><InvoiceViewer invoice={selectedInvoice} onUpdateInvoice={() => {}} onBack={() => void onBack()} readOnly /></div>;
    }
    const handleReopenCallback = async () => { if (onReopen) await onReopen(selectedInvoice); };
    return (
      <div className="space-y-5">
        <FinancialSettlementCard targetType="INVOICE" targetId={selectedInvoice.id} lifecycleStatus={selectedInvoice.lifecycleStatus} compact canReverse={canReverseSettlement} onNavigatePath={onNavigatePath} />
        {canManageInvoices && onPreviewCorrection && <button type="button" onClick={() => void openCorrection(selectedInvoice)} className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-900 hover:bg-amber-100">Review correction options</button>}
        <VerificationWorkspace
          invoice={selectedInvoice}
          queue={reviewQueue}
          queueIndex={reviewIndex}
          saveState={saveState}
          completion={reviewCompletion}
          isRetrying={retryingInvoiceId === selectedInvoice.id}
          onRetryExtraction={canExtractInvoices && onRetryExtraction ? () => onRetryExtraction(selectedInvoice) : async () => null}
          onUpdateInvoice={canManageInvoices && selectedInvoice.lifecycleStatus !== "VOID" ? onUpdateInvoice : () => {}}
          onBack={onBack}
          backLabel={workspaceOriginLabel}
          onPrevious={onPrevious}
          onNext={onNext}
          onSave={canManageInvoices && selectedInvoice.lifecycleStatus !== "VOID" ? onSave : async () => false}
          onVerifyAndNext={canVerifyInvoices ? onVerifyAndNext : async () => false}
          onReopen={canVerifyInvoices && selectedInvoice.lifecycleStatus !== "VOID" ? handleReopenCallback : undefined}
          onContinueWithNewItems={onContinueWithNewItems}
          onReturnToDashboard={onReturnToDashboard}
          onViewVerified={onViewVerified}
          onRevertToAI={canManageInvoices && onRevertToAI ? () => void onRevertToAI(selectedInvoice) : undefined}
          onRevertField={canManageInvoices && onRevertField ? (path) => void onRevertField(selectedInvoice, path) : undefined}
          projects={projects}
          costCodes={costCodes}
          invoiceProjectAllocations={invoiceProjectAllocations}
          preferredProjectId={preferredProjectId}
          onSaveProjectAllocations={canManageProjectAllocations && selectedInvoice.lifecycleStatus !== "VOID" ? onSaveProjectAllocations : undefined}
          onOpenExistingInvoice={(id) => {
            const match = invoices.find((inv) => inv.id === id);
            if (match && onSelectInvoice) onSelectInvoice(match);
          }}
          purchaseOrders={purchaseOrders}
          purchaseOrderReceipts={purchaseOrderReceipts}
          purchaseOrderMatches={purchaseOrderMatches}
          onConfirmPurchaseOrderMatch={onConfirmPurchaseOrderMatch}
          onUnmatchPurchaseOrderMatch={onUnmatchPurchaseOrderMatch}
          onOpenPurchaseOrder={onOpenPurchaseOrder}
          canReadProcurement={canReadProcurement}
          canManageProcurement={canManageInvoices && canManageProcurement}
        />
        {correctionDialog}
      </div>
    );
  }
  if (activeSubTab === "extractor") return <div className="space-y-5">{canExtractInvoices ? <UploadZone onExtract={onExtract} onLoadPreset={onLoadPreset} onBatchComplete={onBatchComplete} isLoading={processingCount > 0} /> : <div role="status" className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-950"><strong>Invoice extraction is unavailable for this access profile.</strong><p className="mt-1 text-xs">Creating a reviewable invoice requires invoice management, extraction, and verification permissions so source, invoice, and review history can be persisted together.</p></div>}</div>;
  if (activeSubTab === "inbox") {
    const fallbackConnection: GmailConnectionInfo = { configured: false, signedIn: false, hasGmailToken: false };
    const connection = gmailConnection || fallbackConnection;
    return <EmailInbox invoices={invoices} isProcessing={processingCount > 0} connection={connection} onConnectGmail={onConnectGmail} onSignOut={onSignOut} onScanGmail={onScanGmail} onSyncGmail={onSyncGmail} onImportGmailMessage={onImportGmailMessage} onProcessEmail={onProcessEmail} onOpenInvoice={onSelectInvoice} onNavigatePath={onNavigatePath} canManageMailbox={canManageGmail} canProcessInvoices={canExtractInvoices} canImportBankStatements={canImportBankStatements} canManageExpenses={canManageExpenses} />;
  }
  if (activeSubTab === "review") return <ReviewQueue invoices={invoices} onOpenInvoice={onOpenInvoiceForReview} onStartReview={canVerifyInvoices ? onStartReview : undefined} readOnly={!canVerifyInvoices} />;
  if (activeSubTab === "vendors") return <Vendors invoices={invoices} />;
  return <div className="space-y-5"><InvoiceSettlementDirectoryPanel invoices={invoices} onNavigatePath={onNavigatePath} />{canManageInvoices ? <InvoiceDirectory invoices={invoices} projects={projects} projectAllocations={invoiceProjectAllocations} onSelectInvoice={onSelectInvoice} onOpenCorrection={onPreviewCorrection ? (invoice) => void openCorrection(invoice) : undefined} onAddNew={onAddNew} /> : <InvoiceDirectoryReadOnly invoices={invoices} onSelectInvoice={onSelectInvoice} onAddNew={canExtractInvoices ? onAddNew : undefined} />}{correctionDialog}</div>;
};

export default InvoicesRoute;