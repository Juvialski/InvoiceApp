import React, { useMemo } from "react";
import { Mail, MessageSquareText, Send, Smartphone } from "lucide-react";
import type { ClientBilling } from "../../lib/clientBilling.ts";
import type { EngineeringDocumentsWorkspaceData } from "../../lib/engineeringDocuments.ts";
import type { CashBankingWorkspaceData } from "../../lib/cashBanking.ts";
import type { AppNavigate } from "../../utils/clientNavigation.ts";
import { appPathForEmailWorkspace, appPathForProject, appPathForPurchaseOrder, type EmailWorkspaceContext } from "../../utils/appRouting.ts";
import { hasPermission, PERMISSION_KEYS } from "../../utils/accessControl.ts";
import { useAppPermissions } from "../AppPermissionContext.tsx";
import type { Expense, InvoiceData, PurchaseOrder, Project, Vendor } from "../../types.ts";
import { EmailComposePanel } from "../../components/EmailComposePanel.tsx";
import { CommunicationHistoryPanel } from "../../components/CommunicationHistoryPanel.tsx";
import { EmailProviderStatusPanel } from "../../components/EmailProviderStatusPanel.tsx";
import { SmsProviderStatusPanel } from "../../components/SmsProviderStatusPanel.tsx";
import { SmsComposePanel } from "../../components/SmsComposePanel.tsx";
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
  readonly onNavigatePath?: AppNavigate;
}

const tabs = [
  { id: "compose" as const, label: "Compose", icon: MessageSquareText },
  { id: "sent" as const, label: "Sent / Delivery History", icon: Send },
  { id: "email-status" as const, label: "Email Provider Status", icon: Mail },
  { id: "sms" as const, label: "SMS status", icon: Smartphone },
];

function go(path: string, onNavigatePath?: AppNavigate) {
  if (onNavigatePath) onNavigatePath(path);
  else if (typeof window !== "undefined") window.location.assign(path);
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
  onNavigatePath,
}: EmailSmsRouteProps) {
  const permissions = useAppPermissions();
  const canSend = hasPermission(permissions, PERMISSION_KEYS.documentSend);
  const visibility = useMemo(() => ({
    invoices: hasPermission(permissions, PERMISSION_KEYS.invoicesRead),
    projects: hasPermission(permissions, PERMISSION_KEYS.projectsRead),
    procurement: hasPermission(permissions, PERMISSION_KEYS.procurementRead),
    expenses: hasPermission(permissions, PERMISSION_KEYS.expensesRead),
    cash: hasPermission(permissions, PERMISSION_KEYS.cashSummaryRead) || hasPermission(permissions, PERMISSION_KEYS.cashImport),
    engineering: hasPermission(permissions, PERMISSION_KEYS.engineeringDocumentsRead),
  }), [permissions]);
  const documents = useMemo(() => buildDocumentRegister({ invoices, expenses, clientBillings, purchaseOrders, projects, vendors, importBatches: cashData?.importBatches, engineering: engineeringDocumentsData, visibility }), [cashData?.importBatches, clientBillings, engineeringDocumentsData, expenses, invoices, permissions, projects, purchaseOrders, vendors, visibility]);

  const navigateView = (view: "compose" | "sent" | "email-status" | "sms", channel?: "email" | "sms") => go(appPathForEmailWorkspace(view, view === "compose" ? { returnTo: context.returnTo, channel } : {}), onNavigatePath);
  const sectionDescription = context.view === "compose"
    ? context.channel === "sms" ? "Prepare one reviewed transactional SMS." : "Draft an email, choose an eligible document, then review before sending through Brevo."
    : context.view === "sent"
      ? "Review outbound attempts, provider status, and safe next actions."
      : context.view === "email-status"
        ? "Check Brevo sender setup and connection status before sending."
        : "Check approved SMS provider configuration and the next setup action.";
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
      <PageHeader eyebrow="Company communications" title="Email / SMS" description={sectionDescription} actions={<div className="inline-flex items-center gap-2 rounded-lg border border-indigo-100 bg-indigo-50 px-3 py-2 text-[10px] font-black text-indigo-800"><Mail className="h-3.5 w-3.5" />Company-scoped</div>} />
      <nav className="flex min-w-0 flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm" aria-label="Email and SMS workspace sections" data-email-sms-tabs="true">
        {tabs.map(({ id, label, icon: Icon }) => <button key={id} type="button" onClick={() => navigateView(id)} aria-current={context.view === id ? "page" : undefined} className={`inline-flex min-h-10 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-black transition ${context.view === id ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"}`}><Icon className="h-3.5 w-3.5" />{label}</button>)}
      </nav>

      {context.view === "compose" && (context.channel === "sms"
        ? <SmsComposePanel canSend={canSend} onOpenStatus={() => navigateView("sms")} onOpenEmailCompose={() => navigateView("compose", "email")} onSent={() => {}} />
        : <EmailComposePanel documents={documents} initialDocumentType={context.documentType} initialDocumentId={context.documentId} canSend={canSend} onOpenDocuments={() => go("/documents", onNavigatePath)} onOpenEmailStatus={() => navigateView("email-status")} onOpenSmsCompose={() => navigateView("compose", "sms")} onNavigatePath={onNavigatePath} returnPath={context.returnTo} buildSnapshot={buildSnapshot} onSent={() => {}} />)}
      {context.view === "sent" && <CommunicationHistoryPanel documentType={context.documentType} documentId={context.documentId} onOpenDocument={openOwningDocument} onCompose={(entry) => go(appPathForEmailWorkspace("compose", { ...(entry.documentType && entry.documentId ? { documentType: entry.documentType, documentId: entry.documentId } : {}), channel: entry.channel === "SMS" ? "sms" : "email", returnTo: "/email-sms?view=sent" }), onNavigatePath)} />}
      {context.view === "email-status" && <EmailProviderStatusPanel onOpenCompose={() => navigateView("compose", "email")} />}
      {context.view === "sms" && <SmsProviderStatusPanel onOpenCompose={() => navigateView("compose", "sms")} />}
    </section>
  );
}

export default EmailSmsRoute;
