import React, { useMemo } from "react";
import { Inbox, Mail, MessageSquareText, Send, Smartphone } from "lucide-react";
import type { ClientBilling } from "../../lib/clientBilling.ts";
import type { EngineeringDocumentsWorkspaceData } from "../../lib/engineeringDocuments.ts";
import type { CashBankingWorkspaceData } from "../../lib/cashBanking.ts";
import type { AppNavigate } from "../../utils/clientNavigation.ts";
import { appPathForEmailWorkspace, appPathForProject, appPathForPurchaseOrder, type EmailWorkspaceContext } from "../../utils/appRouting.ts";
import { hasPermission, PERMISSION_KEYS } from "../../utils/accessControl.ts";
import { useAppPermissions } from "../AppPermissionContext.tsx";
import type { EmailClassification, Expense, GmailConnectionInfo, GmailMessageCandidate, GmailScanWindow, InvoiceData, Project, PurchaseOrder, Vendor } from "../../types.ts";
import { EmailInbox } from "../../components/EmailInbox.tsx";
import { EmailComposePanel } from "../../components/EmailComposePanel.tsx";
import { CommunicationHistoryPanel } from "../../components/CommunicationHistoryPanel.tsx";
import { SmsProviderStatusPanel } from "../../components/SmsProviderStatusPanel.tsx";
import { buildDocumentRegister, buildFinancialDocumentSnapshot } from "../../lib/documentRegister.ts";
import { DEFAULT_COMPANY_DOCUMENT_PROFILE } from "../../lib/companyDocumentProfile.ts";
import { PageHeader } from "../../components/ui/OperationsUI.tsx";

export interface EmailSmsRouteProps {
  readonly context: EmailWorkspaceContext;
  readonly invoices: readonly InvoiceData[];
  readonly expenses: readonly Expense[];
  readonly clientBillings: readonly ClientBilling[];
  readonly purchaseOrders: readonly PurchaseOrder[];
  readonly projects: readonly Project[];
  readonly vendors: readonly Vendor[];
  readonly cashData?: CashBankingWorkspaceData;
  readonly engineeringDocumentsData?: EngineeringDocumentsWorkspaceData;
  readonly gmailConnection?: GmailConnectionInfo;
  readonly processingCount?: number;
  readonly onConnectGmail?: () => Promise<void> | void;
  readonly onSignOut?: () => Promise<void> | void;
  readonly onScanGmail?: (window: GmailScanWindow) => Promise<GmailMessageCandidate[]>;
  readonly onSyncGmail?: () => Promise<GmailMessageCandidate[]>;
  readonly onImportGmailMessage?: (message: GmailMessageCandidate) => Promise<number>;
  readonly onProcessEmail?: (input: { sender: string; subject: string; receivedAt: string; body: string; attachments: File[] }) => Promise<EmailClassification | null>;
  readonly onOpenInvoice?: (invoice: InvoiceData) => void;
  readonly onNavigatePath?: AppNavigate;
}

const tabs = [
  { id: "inbox" as const, label: "Inbox / Intake", icon: Inbox },
  { id: "compose" as const, label: "Compose", icon: MessageSquareText },
  { id: "sent" as const, label: "Sent / Delivery History", icon: Send },
  { id: "sms" as const, label: "SMS / Provider Status", icon: Smartphone },
];

function go(path: string, onNavigatePath?: AppNavigate) {
  if (onNavigatePath) onNavigatePath(path);
  else if (typeof window !== "undefined") window.location.assign(path);
}

function permissionNotice(title: string, description: string) {
  return <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-xs leading-5 text-amber-950"><h2 className="font-black">{title}</h2><p className="mt-1">{description}</p></section>;
}

export function EmailSmsRoute({
  context,
  invoices,
  expenses,
  clientBillings,
  purchaseOrders,
  projects,
  vendors,
  cashData,
  engineeringDocumentsData,
  gmailConnection,
  processingCount = 0,
  onConnectGmail = () => {},
  onSignOut = () => {},
  onScanGmail = async () => [],
  onSyncGmail = async () => [],
  onImportGmailMessage = async () => { throw new Error("Gmail import is not configured."); },
  onProcessEmail = async () => null,
  onOpenInvoice = () => {},
  onNavigatePath,
}: EmailSmsRouteProps) {
  const permissions = useAppPermissions();
  const canReadInbox = hasPermission(permissions, PERMISSION_KEYS.gmailRead);
  const canSend = hasPermission(permissions, PERMISSION_KEYS.documentSend);
  const connection: GmailConnectionInfo = gmailConnection || { configured: false, signedIn: false, hasGmailToken: false };
  const visibility = useMemo(() => ({
    invoices: hasPermission(permissions, PERMISSION_KEYS.invoicesRead),
    projects: hasPermission(permissions, PERMISSION_KEYS.projectsRead),
    procurement: hasPermission(permissions, PERMISSION_KEYS.procurementRead),
    expenses: hasPermission(permissions, PERMISSION_KEYS.expensesRead),
    cash: hasPermission(permissions, PERMISSION_KEYS.cashSummaryRead) || hasPermission(permissions, PERMISSION_KEYS.cashImport),
    engineering: hasPermission(permissions, PERMISSION_KEYS.engineeringDocumentsRead),
  }), [permissions]);
  const documents = useMemo(() => buildDocumentRegister({ invoices, expenses, clientBillings, purchaseOrders, projects, vendors, importBatches: cashData?.importBatches, engineering: engineeringDocumentsData, visibility }), [cashData?.importBatches, clientBillings, engineeringDocumentsData, expenses, invoices, permissions, projects, purchaseOrders, vendors, visibility]);

  const navigateView = (view: "inbox" | "compose" | "sent" | "sms") => go(appPathForEmailWorkspace(view, view === "compose" ? { returnTo: context.returnTo } : {}), onNavigatePath);
  const buildSnapshot = (entry: typeof documents[number]) => buildFinancialDocumentSnapshot(entry, { purchaseOrders, clientBillings, projects, vendors, profile: DEFAULT_COMPANY_DOCUMENT_PROFILE });
  const openOwningDocument = (entry: { documentType?: "PURCHASE_ORDER" | "CLIENT_INVOICE"; documentId?: string }) => {
    if (!entry.documentType || !entry.documentId) return;
    if (entry.documentType === "PURCHASE_ORDER") go(appPathForPurchaseOrder(entry.documentId, appPathForEmailWorkspace("sent")), onNavigatePath);
    else {
      const billing = clientBillings.find((candidate) => candidate.id === entry.documentId);
      if (billing) go(appPathForProject(billing.projectId, "billing", { billingId: billing.id }), onNavigatePath);
    }
  };

  return (
    <section className="space-y-5" data-email-sms-workspace="true" aria-label="Email / SMS communications workspace">
      <PageHeader eyebrow="Company communications" title="Email / SMS" description="Use Inbox / Intake for read-only Gmail access, Compose for outbound email, and Delivery History to track each audited attempt. SMS status stays visible until a provider is configured." actions={<div className="inline-flex items-center gap-2 rounded-lg border border-indigo-100 bg-indigo-50 px-3 py-2 text-[10px] font-black text-indigo-800"><Mail className="h-3.5 w-3.5" />Connected identity stays server-authorized</div>} />
      <nav className="flex min-w-0 flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm" aria-label="Email and SMS workspace sections" data-email-sms-tabs="true">{tabs.map(({ id, label, icon: Icon }) => <button key={id} type="button" onClick={() => navigateView(id)} aria-current={context.view === id ? "page" : undefined} className={`inline-flex min-h-10 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-black transition ${context.view === id ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"}`}><Icon className="h-3.5 w-3.5" />{label}</button>)}</nav>

      {context.view === "inbox" && (canReadInbox ? <EmailInbox invoices={[...invoices]} isProcessing={processingCount > 0} connection={connection} onConnectGmail={onConnectGmail} onSignOut={onSignOut} onScanGmail={onScanGmail} onSyncGmail={onSyncGmail} onImportGmailMessage={onImportGmailMessage} onProcessEmail={onProcessEmail} onOpenInvoice={onOpenInvoice} onNavigatePath={onNavigatePath} canManageMailbox={hasPermission(permissions, PERMISSION_KEYS.gmailManage)} canProcessInvoices={hasPermission(permissions, PERMISSION_KEYS.invoicesWrite) && hasPermission(permissions, PERMISSION_KEYS.invoicesExtract) && hasPermission(permissions, PERMISSION_KEYS.invoicesVerify)} canImportBankStatements={hasPermission(permissions, PERMISSION_KEYS.cashImport)} canManageExpenses={hasPermission(permissions, PERMISSION_KEYS.expensesWrite)} /> : permissionNotice("Inbox / Intake is restricted", "This access profile does not include Gmail read permission. Ask a company administrator for mailbox access; no mailbox data is loaded here."))}
      {context.view === "compose" && <EmailComposePanel documents={documents} initialDocumentType={context.documentType} initialDocumentId={context.documentId} connection={connection} canSend={canSend} onConnectGmail={hasPermission(permissions, PERMISSION_KEYS.gmailManage) ? onConnectGmail : undefined} onOpenDocuments={() => go("/documents", onNavigatePath)} onNavigatePath={onNavigatePath} returnPath={context.returnTo} buildSnapshot={buildSnapshot} onSent={() => {}} />}
      {context.view === "sent" && <CommunicationHistoryPanel documentType={context.documentType} documentId={context.documentId} onOpenDocument={openOwningDocument} onCompose={(entry) => go(appPathForEmailWorkspace("compose", { ...(entry.documentType && entry.documentId ? { documentType: entry.documentType, documentId: entry.documentId } : {}), returnTo: "/email-sms?view=sent" }), onNavigatePath)} />}
      {context.view === "sms" && <SmsProviderStatusPanel />}
    </section>
  );
}

export default EmailSmsRoute;
