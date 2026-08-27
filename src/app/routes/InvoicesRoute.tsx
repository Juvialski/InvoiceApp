import React from "react";
import { VerificationWorkspace, type SaveState } from "../../components/VerificationWorkspace";
import { UploadZone, type ExtractPayload } from "../../components/UploadZone";
import { EmailInbox } from "../../components/EmailInbox";
import { ReviewQueue } from "../../components/ReviewQueue";
import { InvoiceDirectory } from "../../components/InvoiceDirectory";
import { Vendors } from "../../components/Vendors";
import { FinancialSettlementCard } from "../../components/FinancialSettlementCard.tsx";
import type {
  EmailClassification,
  GmailConnectionInfo,
  GmailMessageCandidate,
  GmailScanWindow,
  InvoiceData,
  InvoiceProjectAllocation,
  Project,
} from "../../types";
import type { AppTab } from "../../utils/routes";

export interface InvoicesRouteProps {
  selectedInvoice?: InvoiceData | null;
  activeSubTab?: AppTab | "invoices" | "extractor" | "inbox" | "review" | "vendors";
  invoices: InvoiceData[];
  projects?: Project[];
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
  onDeleteInvoice?: (id: string) => void;
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
}

export const InvoicesRoute: React.FC<InvoicesRouteProps> = ({
  selectedInvoice,
  activeSubTab = "invoices",
  invoices,
  projects = [],
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
  onDeleteInvoice = () => {},
  onAddNew = () => {},
  onExtract = async () => { throw new Error("Extractor handler not configured."); },
  onLoadPreset,
  onBatchComplete,
  onConnectGmail = () => {},
  onSignOut,
  onScanGmail = async () => [],
  onSyncGmail = async () => [],
  onImportGmailMessage = async () => { throw new Error("Gmail import handler not configured."); },
  onProcessEmail = async () => { throw new Error("Process email handler not configured."); },
}) => {
  if (selectedInvoice) {
    const handleReopenCallback = async () => { if (onReopen) await onReopen(selectedInvoice); };
    return (
      <div className="space-y-5">
        <FinancialSettlementCard targetType="INVOICE" targetId={selectedInvoice.id} compact />
        <VerificationWorkspace
          invoice={selectedInvoice}
          queue={reviewQueue}
          queueIndex={reviewIndex}
          saveState={saveState}
          completion={reviewCompletion}
          isRetrying={retryingInvoiceId === selectedInvoice.id}
          onRetryExtraction={onRetryExtraction ? () => onRetryExtraction(selectedInvoice) : async () => null}
          onUpdateInvoice={onUpdateInvoice}
          onBack={onBack}
          backLabel={workspaceOriginLabel}
          onPrevious={onPrevious}
          onNext={onNext}
          onSave={onSave}
          onVerifyAndNext={onVerifyAndNext}
          onReopen={handleReopenCallback}
          onContinueWithNewItems={onContinueWithNewItems}
          onReturnToDashboard={onReturnToDashboard}
          onViewVerified={onViewVerified}
          onRevertToAI={onRevertToAI ? () => void onRevertToAI(selectedInvoice) : () => {}}
          onRevertField={onRevertField ? (path) => void onRevertField(selectedInvoice, path) : () => {}}
          projects={projects}
          invoiceProjectAllocations={invoiceProjectAllocations}
          preferredProjectId={preferredProjectId}
          onSaveProjectAllocations={onSaveProjectAllocations}
        />
      </div>
    );
  }
  if (activeSubTab === "extractor") return <div className="space-y-5"><UploadZone onExtract={onExtract} onLoadPreset={onLoadPreset} onBatchComplete={onBatchComplete} isLoading={processingCount > 0} /></div>;
  if (activeSubTab === "inbox") {
    const fallbackConnection: GmailConnectionInfo = { configured: false, signedIn: false, hasGmailToken: false };
    return <EmailInbox invoices={invoices} isProcessing={processingCount > 0} connection={gmailConnection || fallbackConnection} onConnectGmail={onConnectGmail} onSignOut={onSignOut} onScanGmail={onScanGmail} onSyncGmail={onSyncGmail} onImportGmailMessage={onImportGmailMessage} onProcessEmail={onProcessEmail} onOpenInvoice={onSelectInvoice} />;
  }
  if (activeSubTab === "review") return <ReviewQueue invoices={invoices} onOpenInvoice={onOpenInvoiceForReview} onStartReview={onStartReview} />;
  if (activeSubTab === "vendors") return <Vendors invoices={invoices} />;
  return <InvoiceDirectory invoices={invoices} projects={projects} projectAllocations={invoiceProjectAllocations} onSelectInvoice={onSelectInvoice} onDeleteInvoice={onDeleteInvoice} onAddNew={onAddNew} />;
};

export default InvoicesRoute;
