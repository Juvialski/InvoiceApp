import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  BookmarkPlus,
  Building2,
  CheckCircle2,
  ChevronDown,
  FileSpreadsheet,
  FileText,
  Inbox,
  Loader2,
  Mail,
  Paperclip,
  Receipt,
  RefreshCw,
  ScanSearch,
  SlidersHorizontal,
  Sparkles,
  UploadCloud,
} from "lucide-react";
import {
  EmailClassification,
  EmailIntakeProfile,
  EmailIntakeProfileInput,
  EntityResolutionResult,
  GmailConnectionInfo,
  GmailMessageCandidate,
  GmailScanWindow,
  InvoiceData,
  Vendor,
} from "../types";
import { formatDateTime } from "../config/regional";
import { getInvoiceDisplay } from "../utils/invoiceDisplay";
import { appPathForTab } from "../utils/appRouting.ts";
import type { AppNavigate } from "../utils/clientNavigation.ts";
import type { FinancialAccount } from "../lib/cashBanking.ts";
import {
  classifyEmailIntakeCandidate,
  DISALLOWED_DOMAIN_RULES,
  isGmailAuthorizationError,
  parseSenderAddress,
  prepareGmailExpenseReview,
  prepareGmailStatementReview,
  resolveGmailConnectionStatus,
  scanConnectedMailbox,
  syncConnectedMailbox,
  type EmailIntakeClassification,
  type EmailIntakeDestination,
} from "../lib/emailIntake.ts";
import {
  deleteEmailIntakeProfile,
  listCompanyVendors,
  listEmailIntakeProfiles,
  saveEmailIntakeProfile,
  toggleEmailIntakeProfile,
} from "../lib/persistence.ts";
import { listFinancialAccounts } from "../lib/cashBankingPersistence.ts";
import {
  resolveBatchFinancialAccounts,
  resolveBatchVendors,
} from "../lib/entityResolution.ts";
import { PageHeader, StatusBadge } from "./ui/OperationsUI";
import { IntakeRulesModal } from "./email/IntakeRulesModal.tsx";
import { EntityResolutionModal } from "./email/EntityResolutionModal.tsx";

interface EmailInboxProps {
  invoices: InvoiceData[];
  isProcessing: boolean;
  connection: GmailConnectionInfo;
  onConnectGmail: () => Promise<void> | void;
  onSignOut: () => Promise<void> | void;
  onScanGmail: (window: GmailScanWindow) => Promise<GmailMessageCandidate[]>;
  onSyncGmail: () => Promise<GmailMessageCandidate[]>;
  onImportGmailMessage: (message: GmailMessageCandidate) => Promise<number>;
  onProcessEmail: (input: { sender: string; subject: string; receivedAt: string; body: string; attachments: File[] }) => Promise<EmailClassification | null>;
  onOpenInvoice: (invoice: InvoiceData) => void;
  onNavigatePath?: AppNavigate;
  canManageMailbox?: boolean;
  canProcessInvoices?: boolean;
  canImportBankStatements?: boolean;
  canManageExpenses?: boolean;
}

function effectiveClassification(
  message: GmailMessageCandidate,
  profiles?: EmailIntakeProfile[],
): EmailIntakeClassification {
  const local = classifyEmailIntakeCandidate(message, profiles);
  const stored = message.classification as EmailIntakeClassification | undefined;
  const storedIsAiFallback = Boolean(stored?.reason?.startsWith("Ambiguous metadata classified by AI"));

  // Re-evaluate deterministic/profile evidence whenever saved rules change so
  // disabling/editing a rule has immediate zero effect on existing cards. Keep
  // a prior AI fallback only while the current deterministic pass is still
  // genuinely ambiguous and no saved-rule/conflict evidence supersedes it.
  if (
    storedIsAiFallback
    && local.suggestedDestination === "UNSUPPORTED"
    && !local.matchedProfileId
    && !local.conflictReason
  ) {
    return stored!;
  }
  return local;
}

function destinationFor(message: GmailMessageCandidate, profiles?: EmailIntakeProfile[]): EmailIntakeDestination {
  const classification = effectiveClassification(message, profiles);
  return classification.suggestedDestination || (classification.isInvoiceLike ? "INVOICE" : "UNSUPPORTED");
}

export const EmailInbox: React.FC<EmailInboxProps> = ({
  invoices,
  isProcessing,
  connection,
  onConnectGmail,
  onImportGmailMessage,
  onProcessEmail,
  onOpenInvoice,
  onNavigatePath,
  canManageMailbox = true,
  canProcessInvoices = true,
  canImportBankStatements = false,
  canManageExpenses = true,
}) => {
  const [days, setDays] = useState(30);
  const [scanMode, setScanMode] = useState<"days" | "custom">("days");
  const [customAfter, setCustomAfter] = useState(() => new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10));
  const [customBefore, setCustomBefore] = useState(() => new Date().toISOString().slice(0, 10));
  const [candidates, setCandidates] = useState<GmailMessageCandidate[]>([]);
  const [destinationFilter, setDestinationFilter] = useState<"ALL" | "INVOICE" | "BANK_STATEMENT" | "EXPENSE">("ALL");
  const [gmailBusy, setGmailBusy] = useState(false);
  const [connectBusy, setConnectBusy] = useState(false);
  const [gmailError, setGmailError] = useState<string | null>(null);
  const [historyId, setHistoryId] = useState(connection.lastHistoryId || "");
  const [lastSyncedAt, setLastSyncedAt] = useState(connection.lastSyncedAt || "");
  const [statementAttachmentSelection, setStatementAttachmentSelection] = useState<Record<string, string>>({});
  const [expenseAttachmentSelection, setExpenseAttachmentSelection] = useState<Record<string, string>>({});
  const [sender, setSender] = useState("");
  const [subject, setSubject] = useState("");
  const [receivedAt, setReceivedAt] = useState(() => new Date().toISOString().slice(0, 16));
  const [body, setBody] = useState("");
  const [attachments, setAttachments] = useState<File[]>([]);
  const [classification, setClassification] = useState<EmailClassification | null>(null);
  const [manualError, setManualError] = useState<string | null>(null);

  const [profiles, setProfiles] = useState<EmailIntakeProfile[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [financialAccounts, setFinancialAccounts] = useState<FinancialAccount[]>([]);
  const [activeResolutionCandidate, setActiveResolutionCandidate] = useState<GmailMessageCandidate | null>(null);
  const [activeResolutionResult, setActiveResolutionResult] = useState<EntityResolutionResult | null>(null);
  const [manualResolutions, setManualResolutions] = useState<Record<string, EntityResolutionResult>>({});
  const [isRulesModalOpen, setIsRulesModalOpen] = useState(false);
  const [editingProfileInput, setEditingProfileInput] = useState<Partial<EmailIntakeProfileInput> | null>(null);

  const loadProfiles = useCallback(async () => {
    try {
      const list = await listEmailIntakeProfiles();
      setProfiles(list);
    } catch {
      setProfiles([]);
    }
  }, []);

  const loadEntities = useCallback(async () => {
    try {
      const [vList, aList] = await Promise.all([
        listCompanyVendors().catch(() => []),
        listFinancialAccounts().catch(() => []),
      ]);
      setVendors(vList);
      setFinancialAccounts(aList);
    } catch {
      // Safe fallback
    }
  }, []);

  useEffect(() => {
    loadProfiles();
    loadEntities();
  }, [loadProfiles, loadEntities]);

  useEffect(() => {
    if (connection.hasGmailToken && isGmailAuthorizationError(gmailError)) {
      setGmailError(null);
    }
  }, [connection.hasGmailToken, gmailError]);

  const handleSaveProfile = async (input: EmailIntakeProfileInput) => {
    await saveEmailIntakeProfile(input);
    await loadProfiles();
  };

  const handleDeleteProfile = async (id: string) => {
    await deleteEmailIntakeProfile(id);
    await loadProfiles();
  };

  const handleToggleProfile = async (id: string, enabled: boolean) => {
    await toggleEmailIntakeProfile(id, enabled);
    await loadProfiles();
  };

  const handleOpenRulesModal = () => {
    setEditingProfileInput(null);
    setIsRulesModalOpen(true);
  };

  const handleSaveSenderRuleShortcut = (message: GmailMessageCandidate) => {
    const parsed = parseSenderAddress(message.sender || "");
    const dest = destinationFor(message, profiles);
    const suggestedDest = (dest === "UNSUPPORTED" ? "INVOICE" : dest) as "INVOICE" | "BANK_STATEMENT" | "EXPENSE";
    const initialDomain = parsed.domain && !DISALLOWED_DOMAIN_RULES.has(parsed.domain) ? parsed.domain : undefined;
    setEditingProfileInput({
      name: parsed.name || (initialDomain ? `Rule for ${initialDomain}` : `Rule for ${parsed.email || "sender"}`),
      senderEmail: parsed.email || undefined,
      senderDomain: initialDomain,
      suggestedDestination: suggestedDest,
      enabled: true,
    });
    setIsRulesModalOpen(true);
  };

  const handleConfirmResolution = (candidateId: string, updated: EntityResolutionResult) => {
    setManualResolutions((prev) => ({ ...prev, [candidateId]: updated }));
  };

  const { allEntityResolutions } = useMemo(() => {
    const vendorCandidates = candidates
      .filter((c) => {
        const dest = destinationFor(c, profiles);
        return dest === "INVOICE" || dest === "EXPENSE";
      })
      .map((c) => {
        const cls = effectiveClassification(c, profiles);
        const parsed = parseSenderAddress(c.sender);
        const profile = profiles.find((p) => p.id === cls.matchedProfileId);
        return {
          candidateId: c.id,
          evidence: {
            name: parsed.name || parsed.email || c.sender,
            senderEmail: parsed.email || undefined,
            senderDomain: parsed.domain || undefined,
            matchedProfileId: profile?.id,
            linkedProfileVendorId: profile?.linkedVendorId,
          },
        };
      });

    const statementCandidates = candidates
      .filter((c) => destinationFor(c, profiles) === "BANK_STATEMENT")
      .map((c) => {
        const cls = effectiveClassification(c, profiles);
        const parsed = parseSenderAddress(c.sender);
        const profile = profiles.find((p) => p.id === cls.matchedProfileId);
        return {
          candidateId: c.id,
          evidence: {
            institutionName: parsed.name || c.sender,
            senderEmail: parsed.email || undefined,
            senderDomain: parsed.domain || undefined,
            matchedProfileId: profile?.id,
            linkedProfileAccountId: profile?.linkedFinancialAccountId,
          },
        };
      });

    const vBatch = resolveBatchVendors(vendorCandidates, vendors, profiles);
    const aBatch = resolveBatchFinancialAccounts(statementCandidates, financialAccounts, profiles);

    const merged: Record<string, EntityResolutionResult> = {
      ...vBatch.resolutions,
      ...aBatch.resolutions,
      ...manualResolutions,
    };

    return {
      vendorResolutions: vBatch.resolutions,
      accountResolutions: aBatch.resolutions,
      allEntityResolutions: merged,
    };
  }, [candidates, profiles, vendors, financialAccounts, manualResolutions]);

  const emailInvoices = useMemo(() => invoices.filter((invoice) => invoice.sourceType === "EMAIL").slice(0, 10), [invoices]);

  const connectionStatus = resolveGmailConnectionStatus(connection, gmailError);

  const counts = useMemo(() => {
    let invoice = 0;
    let statement = 0;
    let expense = 0;
    for (const item of candidates) {
      const dest = destinationFor(item, profiles);
      if (dest === "INVOICE") invoice++;
      else if (dest === "BANK_STATEMENT") statement++;
      else if (dest === "EXPENSE") expense++;
    }
    return { all: candidates.length, invoice, statement, expense };
  }, [candidates, profiles]);

  const filteredCandidates = useMemo(() => {
    if (destinationFilter === "ALL") return candidates;
    return candidates.filter((item) => destinationFor(item, profiles) === destinationFilter);
  }, [candidates, destinationFilter, profiles]);

  const connectMailbox = async () => {
    if (!canManageMailbox) {
      setGmailError("Mailbox connection management requires Gmail management permission. Your Engoryx session remains active.");
      return;
    }
    setConnectBusy(true);
    setGmailError(null);
    try {
      await onConnectGmail();
    } catch (error: any) {
      setGmailError(error?.message || "Gmail could not be connected. Your Engoryx session remains active.");
    } finally {
      setConnectBusy(false);
    }
  };

  const runScan = async (incremental = false) => {
    if (connectionStatus !== "HEALTHY") {
      setGmailError("Connect or reconnect Gmail above before scanning.");
      return;
    }
    setGmailBusy(true);
    setGmailError(null);
    try {
      if (!incremental && scanMode === "custom" && (!customAfter || !customBefore || customAfter > customBefore)) {
        throw new Error("Choose a valid custom Gmail date range.");
      }
      const scanWindow: GmailScanWindow = scanMode === "custom" ? { after: customAfter, before: customBefore } : { days };
      const result = incremental && historyId ? await syncConnectedMailbox(historyId, profiles) : await scanConnectedMailbox(scanWindow, profiles);
      setCandidates(result.messages);
      if (result.historyId) setHistoryId(result.historyId);
      if (result.lastSyncedAt) setLastSyncedAt(result.lastSyncedAt);
    } catch (error: any) {
      setGmailError(error?.message || "Connected mailbox scan failed.");
    } finally {
      setGmailBusy(false);
    }
  };

  const importCandidate = async (message: GmailMessageCandidate) => {
    if (!canManageMailbox) {
      setGmailError("Preserving and importing an email requires Gmail management permission.");
      return;
    }
    if (!canProcessInvoices) {
      setGmailError("Invoice extraction requires invoice management, extraction, and verification permissions in this company.");
      return;
    }
    setCandidates((current) => current.map((item) => item.id === message.id ? { ...item, importStatus: "IMPORTING" } : item));
    try {
      // Mailbox entity matching is intentionally advisory. Do not carry a
      // sender-only LINK_EXISTING decision into invoice extraction, where it
      // could override stronger post-extraction TIN/name evidence.
      await onImportGmailMessage({
        ...message,
        classification: effectiveClassification(message, profiles),
      });
      setCandidates((current) => current.map((item) => item.id === message.id ? { ...item, importStatus: "IMPORTED" } : item));
    } catch (error: any) {
      setCandidates((current) => current.map((item) => item.id === message.id ? { ...item, importStatus: "FAILED" } : item));
      setGmailError(error?.message || `Could not import ${message.subject || "email"}.`);
    }
  };

  const reviewStatement = async (message: GmailMessageCandidate) => {
    if (!canManageMailbox) {
      setGmailError("Preserving a statement email requires Gmail management permission.");
      return;
    }
    if (!canImportBankStatements) {
      setGmailError("Reviewing a bank statement requires Cash & Banking import permission.");
      return;
    }
    setCandidates((current) => current.map((item) => item.id === message.id ? { ...item, importStatus: "IMPORTING" } : item));
    try {
      const classification = effectiveClassification(message, profiles);
      const attachmentId = statementAttachmentSelection[message.id] || classification.statementAttachmentIds?.[0];
      const resolution = allEntityResolutions[message.id];
      const matchingProfile = profiles.find((p) => p.id === classification.matchedProfileId);
      await prepareGmailStatementReview({ ...message, classification }, attachmentId, {
        // Preserve the mailbox result only as explanatory context. Final
        // account selection comes from parsed statement evidence in Cash & Banking.
        preliminaryResolution: resolution,
        profile: matchingProfile,
      });
      setCandidates((current) => current.map((item) => item.id === message.id ? { ...item, importStatus: "IMPORTED" } : item));
      const cashPath = appPathForTab("cash");
      if (onNavigatePath) onNavigatePath(cashPath);
      else if (typeof window !== "undefined") window.location.assign(cashPath);
    } catch (error: any) {
      setCandidates((current) => current.map((item) => item.id === message.id ? { ...item, importStatus: "FAILED" } : item));
      setGmailError(error?.message || `Could not prepare ${message.subject || "statement"} for review.`);
    }
  };

  const reviewExpense = async (message: GmailMessageCandidate) => {
    if (!canManageMailbox) {
      setGmailError("Preserving an expense receipt email requires Gmail management permission.");
      return;
    }
    if (!canManageExpenses) {
      setGmailError("Reviewing an expense requires expense management permission.");
      return;
    }
    setCandidates((current) => current.map((item) => item.id === message.id ? { ...item, importStatus: "IMPORTING" } : item));
    try {
      const classification = effectiveClassification(message, profiles);
      const attachmentId = expenseAttachmentSelection[message.id] || classification.expenseAttachmentIds?.[0];
      const resolution = allEntityResolutions[message.id];
      const matchingProfile = profiles.find((p) => p.id === classification.matchedProfileId);
      await prepareGmailExpenseReview({ ...message, classification }, attachmentId, {
        // Preserve the mailbox result only as explanatory context. Final
        // Vendor resolution comes from extracted receipt/payee evidence.
        preliminaryResolution: resolution,
        profile: matchingProfile,
      });
      setCandidates((current) => current.map((item) => item.id === message.id ? { ...item, importStatus: "IMPORTED" } : item));
      const expensesPath = appPathForTab("expenses");
      if (onNavigatePath) onNavigatePath(expensesPath);
      else if (typeof window !== "undefined") window.location.assign(expensesPath);
    } catch (error: any) {
      setCandidates((current) => current.map((item) => item.id === message.id ? { ...item, importStatus: "FAILED" } : item));
      setGmailError(error?.message || `Could not prepare ${message.subject || "expense"} for review.`);
    }
  };

  const handleManualSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setManualError(null);
    if (!canProcessInvoices) {
      setManualError("Invoice extraction requires invoice management, extraction, and verification permissions in this company.");
      return;
    }
    if (!subject.trim() && !body.trim() && attachments.length === 0) {
      setManualError("Add an email subject/body or at least one invoice attachment.");
      return;
    }
    const result = await onProcessEmail({ sender, subject, receivedAt, body, attachments });
    setClassification(result);
  };

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Financial operations"
        title="Email Intake"
        description="Scan a connected read-only Gmail mailbox, classify finance documents, and route supported invoices, bank statements, or expense receipts into their existing review workflows."
      />

      <section
        className={`rounded-2xl border p-4 sm:p-5 shadow-sm transition ${
          connectionStatus === "RECONNECT_REQUIRED"
            ? "border-amber-300 bg-amber-50/70 text-amber-950"
            : "border-slate-200 bg-white"
        }`}
      >
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div
              className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${
                connectionStatus === "HEALTHY"
                  ? "bg-emerald-50 text-emerald-600"
                  : connectionStatus === "RECONNECT_REQUIRED"
                    ? "bg-amber-100 text-amber-700"
                    : "bg-indigo-50 text-indigo-600"
              }`}
            >
              {connectionStatus === "RECONNECT_REQUIRED" ? <AlertCircle className="w-5 h-5" /> : <Mail className="w-5 h-5" />}
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-black text-slate-900">
                  {connectionStatus === "HEALTHY"
                    ? "Connected mailbox"
                    : connectionStatus === "RECONNECT_REQUIRED"
                      ? "Gmail connection needs attention"
                      : "Connect Gmail"}
                </h3>
                <StatusBadge
                  tone={
                    connectionStatus === "HEALTHY"
                      ? "success"
                      : connectionStatus === "RECONNECT_REQUIRED"
                        ? "warning"
                        : "neutral"
                  }
                >
                  {connectionStatus === "HEALTHY"
                    ? "Read-only"
                    : connectionStatus === "RECONNECT_REQUIRED"
                      ? "Authorization expired or revoked"
                      : "Setup required"}
                </StatusBadge>
              </div>

              {connectionStatus === "HEALTHY" && (
                <>
                  <p className="mt-1 text-xs font-semibold text-slate-700">{connection.email || "Authorized Gmail mailbox"}</p>
                  {lastSyncedAt && <p className="mt-0.5 text-[10px] text-slate-400">Last sync: {formatDateTime(lastSyncedAt)}</p>}
                  {connection.displayName && <p className="mt-0.5 text-[10px] text-slate-400">Connected identity: {connection.displayName}</p>}
                </>
              )}

              {connectionStatus === "RECONNECT_REQUIRED" && (
                <>
                  <p className="mt-1 text-xs font-medium text-amber-900">
                    {connection.email ? `Previously connected mailbox: ${connection.email}` : "Previous mailbox authorization is no longer valid."}
                  </p>
                  <p className="mt-1 text-[11px] text-amber-800">
                    Gmail authorization expired or was revoked. Your Engoryx session remains active. Reconnect Gmail below to resume search and routing.
                  </p>
                </>
              )}

              {connectionStatus === "NEVER_CONNECTED" && (
                <p className="mt-1 text-xs text-slate-500">
                  Each user authorizes their own mailbox with read-only permissions. Entering an email address alone never grants access.
                </p>
              )}

              <p className="mt-1 text-[10px] text-slate-400">
                Gmail authorization is separate from your Engoryx sign-in. Reconnecting Gmail does not sign you out of Engoryx.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 items-center">
            <button
              type="button"
              onClick={handleOpenRulesModal}
              className="px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-800 inline-flex items-center gap-2 hover:bg-slate-50 transition"
              title="Manage saved company sender and template rules"
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-slate-500" />
              Intake Rules
              {profiles.length > 0 && (
                <span className="px-1.5 py-0.5 rounded-md bg-indigo-50 text-indigo-700 text-[10px] font-black">
                  {profiles.length}
                </span>
              )}
            </button>

            {connectionStatus === "HEALTHY" && (
              <>
                <button
                  type="button"
                  onClick={() => void runScan(true)}
                  disabled={gmailBusy}
                  className="px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-800 inline-flex items-center gap-2 hover:bg-slate-50 disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${gmailBusy ? "animate-spin" : ""}`} />
                  Sync new
                </button>
                {canManageMailbox && (
                  <button
                    type="button"
                    onClick={() => void connectMailbox()}
                    disabled={connectBusy}
                    className="px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-800 inline-flex items-center gap-2 hover:bg-slate-50 disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${connectBusy ? "animate-spin" : ""}`} />
                    Reconnect Gmail
                  </button>
                )}
              </>
            )}

            {connectionStatus === "RECONNECT_REQUIRED" && (
              canManageMailbox ? (
                <button
                  type="button"
                  onClick={() => void connectMailbox()}
                  disabled={connectBusy}
                  className="px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold disabled:opacity-50 inline-flex items-center gap-2 shadow-sm"
                >
                  {connectBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                  Reconnect Gmail
                </button>
              ) : (
                <span className="rounded-xl border border-amber-300 bg-amber-100 px-3.5 py-2 text-xs font-bold text-amber-900">
                  Requires Gmail management permission
                </span>
              )
            )}

            {connectionStatus === "NEVER_CONNECTED" && (
              <button
                type="button"
                disabled={!connection.configured || !connection.signedIn || !canManageMailbox || connectBusy}
                onClick={() => void connectMailbox()}
                className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold disabled:opacity-50 inline-flex items-center gap-2 shadow-sm"
              >
                {connectBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                Connect Google + Gmail
              </button>
            )}
          </div>
        </div>

        {!connection.configured && (
          <div className="mt-4 p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900">
            <b>Email connection is not configured.</b> Contact your administrator to enable mailbox access.
          </div>
        )}
        {connection.configured && !canManageMailbox && connectionStatus !== "HEALTHY" && (
          <div className="mt-4 p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900">
            <b>Mailbox connection requires Gmail management permission.</b> Existing read-only authorization can still be used for scanning when available.
          </div>
        )}

        {connectionStatus === "HEALTHY" ? (
          <div className="mt-5 pt-5 border-t border-slate-100 flex flex-col sm:flex-row sm:items-end gap-3">
            <label className="text-[10px] font-bold uppercase text-slate-500">
              Initial scan window
              <select
                value={scanMode === "custom" ? "custom" : String(days)}
                onChange={(e) => {
                  if (e.target.value === "custom") setScanMode("custom");
                  else {
                    setScanMode("days");
                    setDays(Number(e.target.value));
                  }
                }}
                className="block mt-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-800"
              >
                <option value={7}>Last 7 days</option>
                <option value={30}>Last 30 days</option>
                <option value={90}>Last 90 days</option>
                <option value="custom">Custom range</option>
              </select>
            </label>
            {scanMode === "custom" && (
              <div className="flex items-end gap-2">
                <label className="text-[10px] uppercase font-bold text-slate-500">
                  From
                  <input
                    type="date"
                    value={customAfter}
                    onChange={(e) => setCustomAfter(e.target.value)}
                    className="block mt-1 rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-2 text-xs font-bold text-slate-800"
                  />
                </label>
                <label className="text-[10px] uppercase font-bold text-slate-500">
                  To
                  <input
                    type="date"
                    value={customBefore}
                    onChange={(e) => setCustomBefore(e.target.value)}
                    className="block mt-1 rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-2 text-xs font-bold text-slate-800"
                  />
                </label>
              </div>
            )}
            <button
              type="button"
              onClick={() => void runScan(false)}
              disabled={gmailBusy}
              className="px-4 py-2.5 rounded-xl bg-slate-900 text-white text-xs font-bold inline-flex items-center gap-2 hover:bg-slate-800 disabled:opacity-50"
            >
              {gmailBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ScanSearch className="w-4 h-4" />}
              Scan finance emails
            </button>
            <p className="text-[10px] text-slate-500 sm:pb-2">
              Search is bounded by date and finance signals. Classification does not import or mutate records.
            </p>
          </div>
        ) : (
          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/80 p-3.5 text-xs text-slate-600 flex items-center justify-between gap-3">
            <div>
              <strong className="font-semibold text-slate-800">Mailbox scan paused.</strong>{" "}
              {connectionStatus === "RECONNECT_REQUIRED"
                ? "Reconnect Gmail above to search and route finance emails."
                : "Connect a Gmail account to begin scanning for financial documents."}
            </div>
          </div>
        )}

        {gmailError && (
          <div className="mt-4 p-3 rounded-xl bg-rose-50 border border-rose-100 text-xs text-rose-700 flex gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {gmailError}
          </div>
        )}
      </section>

      {candidates.length > 0 && (
        <section className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-black text-slate-900">Connected mailbox results</h3>
              <p className="text-[10px] text-slate-500 mt-0.5">
                Nothing is committed until you choose an invoice extraction, statement review, or expense review action.
              </p>
            </div>
            <span className="text-[10px] font-black bg-slate-100 px-2.5 py-1 rounded-full text-slate-700 self-start sm:self-auto">
              {candidates.length} candidates
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2 mt-4 pb-3 border-b border-slate-100">
            <span className="text-[10px] font-bold uppercase text-slate-500 mr-1">Filter destination:</span>
            <button
              type="button"
              onClick={() => setDestinationFilter("ALL")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                destinationFilter === "ALL"
                  ? "bg-slate-900 text-white shadow-sm"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              All ({counts.all})
            </button>
            <button
              type="button"
              onClick={() => setDestinationFilter("INVOICE")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                destinationFilter === "INVOICE"
                  ? "bg-emerald-600 text-white shadow-sm"
                  : "bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
              }`}
            >
              Invoices ({counts.invoice})
            </button>
            <button
              type="button"
              onClick={() => setDestinationFilter("BANK_STATEMENT")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                destinationFilter === "BANK_STATEMENT"
                  ? "bg-sky-700 text-white shadow-sm"
                  : "bg-sky-50 text-sky-800 hover:bg-sky-100"
              }`}
            >
              Bank Statements ({counts.statement})
            </button>
            <button
              type="button"
              onClick={() => setDestinationFilter("EXPENSE")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                destinationFilter === "EXPENSE"
                  ? "bg-amber-600 text-white shadow-sm"
                  : "bg-amber-50 text-amber-800 hover:bg-amber-100"
              }`}
            >
              Expenses ({counts.expense})
            </button>
          </div>

          {filteredCandidates.length === 0 ? (
            <p className="mt-4 text-xs text-slate-500 py-3 text-center">
              No candidates match the selected filter.
            </p>
          ) : (
            <div className="mt-4 space-y-2.5">
              {filteredCandidates.map((message) => {
                const cls = effectiveClassification(message, profiles);
                const resolution = allEntityResolutions[message.id];
                const destination = cls.suggestedDestination || (cls.isInvoiceLike ? "INVOICE" : "UNSUPPORTED");
                const statementAttachments =
                  destination === "BANK_STATEMENT"
                    ? message.attachments.filter((attachment) => cls.statementAttachmentIds?.includes(attachment.attachmentId))
                    : [];
                const selectedStatementAttachment = statementAttachmentSelection[message.id] || statementAttachments[0]?.attachmentId || "";
                const expenseAttachments =
                  destination === "EXPENSE"
                    ? message.attachments.filter((attachment) => cls.expenseAttachmentIds?.includes(attachment.attachmentId))
                    : [];
                const selectedExpenseAttachment = expenseAttachmentSelection[message.id] || expenseAttachments[0]?.attachmentId || "";
                const destinationLabel =
                  destination === "BANK_STATEMENT"
                    ? "Bank statement"
                    : destination === "INVOICE"
                      ? "Invoice"
                      : destination === "EXPENSE"
                        ? "Receipt"
                        : "Needs review";
                const destinationTone =
                  destination === "BANK_STATEMENT"
                    ? "bg-sky-100 text-sky-800"
                    : destination === "INVOICE"
                      ? "bg-emerald-100 text-emerald-700"
                      : destination === "EXPENSE"
                        ? "bg-amber-100 text-amber-800"
                        : "bg-slate-100 text-slate-600";

                return (
                  <div key={message.id} className="border border-slate-200 rounded-2xl p-3.5 flex flex-col lg:flex-row lg:items-center gap-3">
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                        destination === "BANK_STATEMENT"
                          ? "bg-sky-50 text-sky-700"
                          : destination === "INVOICE"
                            ? "bg-emerald-50 text-emerald-600"
                            : destination === "EXPENSE"
                              ? "bg-amber-50 text-amber-700"
                              : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {destination === "BANK_STATEMENT" ? (
                        <FileSpreadsheet className="w-4 h-4" />
                      ) : destination === "EXPENSE" ? (
                        <Receipt className="w-4 h-4" />
                      ) : (
                        <Inbox className="w-4 h-4" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex gap-2 items-center flex-wrap">
                        <p className="text-xs font-black truncate text-slate-900">{message.subject || "(No subject)"}</p>
                        <span className={`text-[9px] px-2 py-0.5 rounded-full font-black uppercase ${destinationTone}`}>
                          {destinationLabel} {Math.round(cls.confidence || 0)}%
                        </span>
                        {cls.matchedProfileName && (
                          <span className="text-[9px] px-2 py-0.5 rounded-full font-bold bg-sky-50 text-sky-800 border border-sky-200">
                            Rule: {cls.matchedProfileName}
                          </span>
                        )}
                        {resolution && (
                          <button
                            type="button"
                            onClick={() => {
                              setActiveResolutionCandidate(message);
                              setActiveResolutionResult(resolution);
                            }}
                            className={`inline-flex items-center gap-1 text-[9px] px-2 py-0.5 rounded-full font-bold transition border ${
                              resolution.proposedAction === "LINK_EXISTING"
                                ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
                                : resolution.proposedAction === "ENRICH_EXISTING"
                                  ? "bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100"
                                  : resolution.proposedAction === "CREATE_NEW"
                                    ? "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                                    : resolution.proposedAction === "POSSIBLE_DUPLICATE"
                                      ? "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100"
                                      : "bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100"
                            }`}
                            title="Preliminary sender-level match hint. Authoritative entity resolution happens post-extraction."
                          >
                            <Building2 className="w-2.5 h-2.5" />
                            <span>
                              {resolution.proposedAction === "LINK_EXISTING"
                                ? `Hint: ${resolution.matchedEntityName}`
                                : resolution.proposedAction === "ENRICH_EXISTING"
                                  ? `Enrich hint: ${resolution.matchedEntityName}`
                                  : resolution.proposedAction === "CREATE_NEW"
                                    ? `Unmatched sender${resolution.groupMemberCount && resolution.groupMemberCount > 1 ? ` (${resolution.groupMemberCount} in batch)` : ""}`
                                    : resolution.proposedAction === "POSSIBLE_DUPLICATE"
                                      ? `Similar hint: ${resolution.matchedEntityName}`
                                      : `Review: ${resolution.conflicts[0]?.label || "Sender hint"}`}
                            </span>
                          </button>
                        )}
                      </div>
                      <p className="text-[10px] text-slate-500 mt-1 truncate">
                        {message.sender} • {formatDateTime(message.receivedAt)} • {message.attachments.length} attachment
                        {message.attachments.length === 1 ? "" : "s"}
                      </p>
                      {cls.reason && <p className="text-[10px] text-slate-600 mt-1 line-clamp-2">{cls.reason}</p>}
                      {destination === "BANK_STATEMENT" && statementAttachments.length > 1 && (
                        <label className="mt-2 block max-w-sm text-[10px] font-bold uppercase text-slate-500">
                          Statement attachment
                          <select
                            className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-semibold normal-case text-slate-800"
                            value={selectedStatementAttachment}
                            onChange={(event) =>
                              setStatementAttachmentSelection((current) => ({ ...current, [message.id]: event.target.value }))
                            }
                          >
                            {statementAttachments.map((attachment) => (
                              <option key={attachment.attachmentId} value={attachment.attachmentId}>
                                {attachment.filename}
                              </option>
                            ))}
                          </select>
                        </label>
                      )}
                      {destination === "EXPENSE" && expenseAttachments.length > 1 && (
                        <label className="mt-2 block max-w-sm text-[10px] font-bold uppercase text-slate-500">
                          Receipt attachment
                          <select
                            className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-semibold normal-case text-slate-800"
                            value={selectedExpenseAttachment}
                            onChange={(event) =>
                              setExpenseAttachmentSelection((current) => ({ ...current, [message.id]: event.target.value }))
                            }
                          >
                            {expenseAttachments.map((attachment) => (
                              <option key={attachment.attachmentId} value={attachment.attachmentId}>
                                {attachment.filename}
                              </option>
                            ))}
                          </select>
                        </label>
                      )}
                    </div>
                    <div className="flex items-center gap-2 self-start lg:self-center shrink-0">
                      {resolution && (
                        <button
                          type="button"
                          onClick={() => {
                            setActiveResolutionCandidate(message);
                            setActiveResolutionResult(resolution);
                          }}
                          className="px-2.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-[11px] font-bold text-slate-700 inline-flex items-center gap-1.5 shrink-0 transition"
                          title="Review preliminary entity resolution hint"
                        >
                          <Building2 className="w-3.5 h-3.5 text-slate-500" />
                          Entity hint
                        </button>
                      )}
                      {canManageMailbox && (
                        <button
                          type="button"
                          onClick={() => handleSaveSenderRuleShortcut(message)}
                          className="px-2.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-[11px] font-bold text-slate-700 inline-flex items-center gap-1.5 shrink-0 transition"
                          title="Save a sender/domain rule for this email"
                        >
                          <SlidersHorizontal className="w-3.5 h-3.5 text-slate-500" />
                          Save rule
                        </button>
                      )}
                      {destination === "INVOICE" ? (
                        canManageMailbox && canProcessInvoices ? (
                          <button
                            type="button"
                            disabled={message.importStatus === "IMPORTING" || message.importStatus === "IMPORTED"}
                            onClick={() => void importCandidate(message)}
                            className="px-3.5 py-2 rounded-xl text-xs font-bold inline-flex items-center justify-center gap-1.5 disabled:opacity-60 bg-indigo-600 text-white hover:bg-indigo-700"
                          >
                            {message.importStatus === "IMPORTING" ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : message.importStatus === "IMPORTED" ? (
                              <CheckCircle2 className="w-3.5 h-3.5" />
                            ) : (
                              <UploadCloud className="w-3.5 h-3.5" />
                            )}
                            {message.importStatus === "IMPORTED" ? "Imported" : "Import & extract"}
                          </button>
                        ) : (
                          <span className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2 text-xs font-bold text-amber-900">
                            {!canManageMailbox && !canProcessInvoices
                              ? "Requires Gmail + invoice permission"
                              : !canManageMailbox
                                ? "Requires Gmail permission"
                                : "Requires invoice permission"}
                          </span>
                        )
                      ) : destination === "BANK_STATEMENT" ? (
                        canManageMailbox && canImportBankStatements ? (
                          <button
                            type="button"
                            disabled={message.importStatus === "IMPORTING"}
                            onClick={() => void reviewStatement(message)}
                            className="px-3.5 py-2 rounded-xl text-xs font-bold inline-flex items-center justify-center gap-1.5 disabled:opacity-60 bg-sky-700 text-white hover:bg-sky-800"
                          >
                            {message.importStatus === "IMPORTING" ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <FileSpreadsheet className="w-3.5 h-3.5" />
                            )}
                            Review statement
                          </button>
                        ) : (
                          <span className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2 text-xs font-bold text-amber-900">
                            {!canManageMailbox && !canImportBankStatements
                              ? "Requires Gmail + cash import permission"
                              : !canManageMailbox
                                ? "Requires Gmail permission"
                                : "Requires cash import permission"}
                          </span>
                        )
                      ) : destination === "EXPENSE" ? (
                        canManageMailbox && canManageExpenses ? (
                          <button
                            type="button"
                            disabled={message.importStatus === "IMPORTING"}
                            onClick={() => void reviewExpense(message)}
                            className="px-3.5 py-2 rounded-xl text-xs font-bold inline-flex items-center justify-center gap-1.5 disabled:opacity-60 bg-amber-600 text-white hover:bg-amber-700"
                          >
                            {message.importStatus === "IMPORTING" ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Receipt className="w-3.5 h-3.5" />
                            )}
                            Review expense
                          </button>
                        ) : (
                          <span className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2 text-xs font-bold text-amber-900">
                            {!canManageMailbox && !canManageExpenses
                              ? "Requires Gmail + expense permission"
                              : !canManageMailbox
                                ? "Requires Gmail permission"
                                : "Requires expense permission"}
                          </span>
                        )
                      ) : (
                        <span className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs font-bold text-slate-600">
                          No automatic destination
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* Manual invoice fallback is made visually secondary using collapsible disclosure */}
      <details className="group rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm">
        <summary className="flex items-center justify-between cursor-pointer list-none select-none">
          <div className="flex items-center gap-2.5">
            <Sparkles className="w-4 h-4 text-indigo-600 shrink-0" />
            <div>
              <h3 className="text-sm font-bold text-slate-800">Manual invoice email fallback (Optional)</h3>
              <p className="text-[10px] text-slate-500">For forwarded invoice text or unsupported mailboxes. Invoice-specific.</p>
            </div>
          </div>
          <span className="text-xs font-bold text-indigo-600 group-open:rotate-180 transition-transform duration-200 inline-flex items-center gap-1">
            <ChevronDown className="w-4 h-4" />
          </span>
        </summary>

        <div className="mt-4 pt-4 border-t border-slate-100">
          {!canProcessInvoices && (
            <div role="status" className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-950">
              Invoice extraction requires invoice management, extraction, and verification permissions. Connected-mailbox scanning remains available, but this access profile cannot create invoice records.
            </div>
          )}
          <form onSubmit={handleManualSubmit} className="grid lg:grid-cols-2 gap-4">
            <div className="space-y-3">
              <input
                value={sender}
                onChange={(e) => setSender(e.target.value)}
                placeholder="Sender (e.g. billing@vendor.com)"
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
              <input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Subject"
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
              <input
                type="datetime-local"
                value={receivedAt}
                onChange={(e) => setReceivedAt(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
              <label className="block rounded-xl border border-dashed border-slate-300 p-3 text-xs text-slate-600 cursor-pointer hover:border-indigo-400">
                <div className="flex items-center gap-2">
                  <Paperclip className="w-4 h-4" />
                  <span>{attachments.length ? `${attachments.length} attachment(s) selected` : "Attach PDF/image invoices"}</span>
                </div>
                <input
                  type="file"
                  multiple
                  accept=".pdf,.png,.jpg,.jpeg,.webp,image/*,application/pdf"
                  className="hidden"
                  onChange={(e) => setAttachments(Array.from(e.target.files || []))}
                />
              </label>
            </div>
            <div className="space-y-3">
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={8}
                placeholder="Paste email body..."
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-xs resize-y focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
              <button
                type="submit"
                disabled={isProcessing || !canProcessInvoices}
                className="px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-xs font-bold inline-flex items-center gap-2 hover:bg-indigo-700 disabled:opacity-50"
              >
                {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                Classify & extract
              </button>
            </div>
          </form>
          {manualError && (
            <div className="mt-3 text-xs text-rose-700 flex gap-2">
              <AlertCircle className="w-4 h-4" />
              {manualError}
            </div>
          )}
          {classification && (
            <div className="mt-3 p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-800">
              <b>{classification.documentType}</b>
              {classification.invoiceSubtype ? ` • ${classification.invoiceSubtype}` : ""} • {Math.round(classification.confidence || 0)}% • {classification.reason}
            </div>
          )}
        </div>
      </details>

      {emailInvoices.length > 0 && (
        <section className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
          <h3 className="text-sm font-black text-slate-900">Recently imported from email</h3>
          <div className="mt-3 grid md:grid-cols-2 gap-2">
            {emailInvoices.map((invoice) => {
              const display = getInvoiceDisplay(invoice);
              return (
                <button
                  key={invoice.id}
                  type="button"
                  onClick={() => onOpenInvoice(invoice)}
                  className="text-left border border-slate-200 rounded-xl p-3 hover:bg-slate-50 transition"
                >
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-indigo-600 shrink-0" />
                    <span className="text-xs font-black truncate text-slate-800">{display.primaryLabel}</span>
                  </div>
                  <p className="text-[10px] text-slate-600 mt-1 truncate">
                    {display.invoiceLabel} • {display.dateLabel}
                  </p>
                  <p className="text-[10px] text-slate-500 mt-1 truncate">
                    {invoice.sourceMetadata?.subject || invoice.sourceMetadata?.sender || "Email source"}
                  </p>
                </button>
              );
            })}
          </div>
        </section>
      )}

      <IntakeRulesModal
        isOpen={isRulesModalOpen}
        onClose={() => setIsRulesModalOpen(false)}
        profiles={profiles}
        vendors={vendors}
        financialAccounts={financialAccounts}
        onSaveProfile={handleSaveProfile}
        onDeleteProfile={handleDeleteProfile}
        onToggleProfile={handleToggleProfile}
        initialForm={editingProfileInput}
        canManageMailbox={canManageMailbox}
      />

      {activeResolutionCandidate && activeResolutionResult && (
        <EntityResolutionModal
          isOpen={Boolean(activeResolutionCandidate && activeResolutionResult)}
          onClose={() => {
            setActiveResolutionCandidate(null);
            setActiveResolutionResult(null);
          }}
          candidate={activeResolutionCandidate}
          resolution={activeResolutionResult}
          allCandidates={candidates}
          allResolutions={allEntityResolutions}
          vendors={vendors}
          financialAccounts={financialAccounts}
          onConfirmResolution={handleConfirmResolution}
        />
      )}
    </div>
  );
};