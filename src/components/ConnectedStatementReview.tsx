import React, { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  CreditCard,
  Eye,
  EyeOff,
  FileSpreadsheet,
  FileText,
  Info,
  Loader2,
  Lock,
  Mail,
  PlusCircle,
  Sparkles,
  Unlock,
  X,
} from "lucide-react";
import {
  buildStatementPreview,
  type CashBankingWorkspaceData,
  type FinancialAccount,
  type FinancialImportBatch,
  type StatementColumnMapping,
  type StatementPreview,
  type ParsedStatementDocument,
} from "../lib/cashBanking.ts";
import { parseStatementFileAsync, workbookFormat } from "../lib/cashBankingImport.ts";
import {
  clearPendingEmailStatementReview,
  linkFinancialImportSource,
  loadPendingEmailStatementFile,
  readPendingEmailStatementReview,
  type PendingEmailStatementReview,
} from "../lib/emailIntake.ts";
import {
  extractAccountEvidenceFromStatement,
  resolveFinancialAccountCandidate,
} from "../lib/entityResolution.ts";
import { listEmailIntakeProfiles } from "../lib/persistence.ts";
import {
  clearTransientSessionPassword,
  getTransientSessionPassword,
  setTransientSessionPassword,
} from "../lib/statementSessionMemory.ts";
import type {
  EmailIntakeProfile,
  EntityResolutionResult,
  FinancialAccountIdentityEvidence,
} from "../types.ts";
import { Notice, SectionHeader } from "./ui/OperationsUI.tsx";

interface ConnectedStatementReviewProps {
  data: CashBankingWorkspaceData;
  canImport?: boolean;
  onCommitImport?: (preview: StatementPreview, account: FinancialAccount) => Promise<void> | void;
}

type ProvenancedStatementPreview = StatementPreview & { sourceDocumentId: string };

function money(value: number | undefined, currency: string) {
  if (value === undefined) return "Not available";
  try { return new Intl.NumberFormat("en-PH", { style: "currency", currency: currency || "PHP", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value); }
  catch { return `${currency || "PHP"} ${value.toFixed(2)}`; }
}

function resolutionActionBadge(action: string) {
  switch (action) {
    case "LINK_EXISTING":
      return { label: "Link to Existing Account", bg: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: CheckCircle2 };
    case "ENRICH_EXISTING":
      return { label: "Enrich Existing Account", bg: "bg-blue-50 text-blue-700 border-blue-200", icon: Sparkles };
    case "CREATE_NEW":
      return { label: "Proposed New Account", bg: "bg-purple-50 text-purple-700 border-purple-200", icon: PlusCircle };
    case "POSSIBLE_DUPLICATE":
      return { label: "Possible Duplicate Account", bg: "bg-amber-50 text-amber-700 border-amber-200", icon: AlertTriangle };
    case "NEEDS_REVIEW":
    default:
      return { label: "Needs Human Review", bg: "bg-rose-50 text-rose-700 border-rose-200", icon: AlertTriangle };
  }
}

export const ConnectedStatementReview: React.FC<ConnectedStatementReviewProps> = ({ data, canImport = false, onCommitImport }) => {
  const [pending, setPending] = useState<PendingEmailStatementReview | null>(null);
  const [document, setDocument] = useState<ParsedStatementDocument | null>(null);
  const [mapping, setMapping] = useState<StatementColumnMapping>({});
  const [accountId, setAccountId] = useState("");
  const [preview, setPreview] = useState<ProvenancedStatementPreview | null>(null);
  const [importCommitted, setImportCommitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [busyMessage, setBusyMessage] = useState("Loading and verifying the preserved statement source…");
  const [error, setError] = useState("");
  const [resolution, setResolution] = useState<EntityResolutionResult | null>(null);
  const [accountEvidence, setAccountEvidence] = useState<FinancialAccountIdentityEvidence | null>(null);

  // Password-Protected PDF and state management
  const [isProtectedPdf, setIsProtectedPdf] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberSessionPassword, setRememberSessionPassword] = useState(false);
  const [unlockError, setUnlockError] = useState("");
  const [stagedFile, setStagedFile] = useState<File | null>(null);
  const [matchedProfile, setMatchedProfile] = useState<EmailIntakeProfile | undefined>(undefined);
  const [isScannedPdf, setIsScannedPdf] = useState(false);
  const [duplicateShortCircuitBatch, setDuplicateShortCircuitBatch] = useState<FinancialImportBatch | null>(null);

  const activeAccounts = useMemo(() => data.accounts.filter((account) => account.active), [data.accounts]);

  // Clean transient password inputs on unmount
  useEffect(() => {
    return () => {
      setPasswordInput("");
      setUnlockError("");
    };
  }, []);

  const processLoadedStatement = async (
    file: File,
    staged: PendingEmailStatementReview,
    profile: EmailIntakeProfile | undefined,
    passwordAttempt?: string,
  ) => {
    const isPdf = workbookFormat(file.name) === "PDF";
    setBusy(true);
    setBusyMessage(isPdf ? (passwordAttempt ? "Unlocking and parsing PDF statement…" : "Parsing statement…") : "Parsing statement…");
    setError("");
    setUnlockError("");

    try {
      const parsed = await parseStatementFileAsync(
        await file.arrayBuffer(),
        file.name,
        profile?.statementParserProfile,
        profile?.expectedInstitution,
        passwordAttempt,
      );

      // If password succeeded and remember option was chosen, store in memory
      if (isPdf && passwordAttempt && rememberSessionPassword) {
        const scopeKey = profile?.expectedInstitution || profile?.statementParserProfile || staged.matchedProfileName || profile?.name || "default";
        setTransientSessionPassword(scopeKey, passwordAttempt);
      }

      const extractedEvidence = extractAccountEvidenceFromStatement(
        {
          fileName: parsed.fileName,
          sheetName: parsed.sheetName,
          rawRows: parsed.rawRows as any,
          extractedMetadata: (parsed as any).extractedMetadata,
        },
        { sender: staged.sender, subject: staged.subject },
        profile,
      );

      const hasIndependentParsedAccountIdentity = Boolean(
        extractedEvidence.accountNumber || extractedEvidence.maskedIdentifier,
      );

      const candidateResolution = resolveFinancialAccountCandidate(
        {
          candidateId: staged.id,
          evidence: extractedEvidence,
          sourceRef: {
            messageId: staged.emailMessageId || staged.gmailMessageId,
            subject: staged.subject,
            sender: staged.sender,
            fileName: staged.fileName,
            attachmentId: staged.gmailAttachmentId || staged.sourceDocumentId,
          },
        },
        data.accounts,
        profile ? [profile] : [],
        data.importBatches,
      );

      setDocument(parsed);
      setMapping(parsed.structure.mapping);
      setAccountEvidence(extractedEvidence);
      setResolution(candidateResolution);
      setIsProtectedPdf(false);
      setIsScannedPdf(false);
      setPasswordInput("");

      const stagedConfirmedAccountIsStillValid = Boolean(
        hasIndependentParsedAccountIdentity
        && staged.confirmedAccountId
        && candidateResolution.proposedAction === "LINK_EXISTING"
        && candidateResolution.conflicts.length === 0
        && candidateResolution.matchedEntityId === staged.confirmedAccountId
        && activeAccounts.some((a) => a.id === staged.confirmedAccountId),
      );

      if (stagedConfirmedAccountIsStillValid) {
        setAccountId(staged.confirmedAccountId!);
      } else if (
        hasIndependentParsedAccountIdentity &&
        candidateResolution.proposedAction === "LINK_EXISTING" &&
        candidateResolution.matchedEntityId &&
        candidateResolution.conflicts.length === 0 &&
        activeAccounts.some((a) => a.id === candidateResolution.matchedEntityId)
      ) {
        setAccountId(candidateResolution.matchedEntityId);
      } else {
        setAccountId("");
      }
    } catch (err: any) {
      const code = err?.code || err?.status;
      if (code === "PASSWORD_REQUIRED") {
        setIsProtectedPdf(true);
        setUnlockError("");
      } else if (code === "INCORRECT_PASSWORD") {
        setIsProtectedPdf(true);
        setUnlockError("Incorrect statement password. Try again.");
        const scopeKey = profile?.expectedInstitution || profile?.statementParserProfile || staged.matchedProfileName || profile?.name || "default";
        clearTransientSessionPassword(scopeKey);
      } else if (code === "SCANNED_OR_IMAGE_ONLY") {
        setIsScannedPdf(true);
        setError("This statement appears to be scanned or image-based and cannot yet be parsed reliably.");
      } else {
        setError(err instanceof Error ? err.message : "The preserved email statement could not be prepared for review.");
      }
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    const staged = readPendingEmailStatementReview();
    if (!staged || !canImport) return;
    let cancelled = false;
    setPending(staged);
    setBusy(true);
    setError("");
    setUnlockError("");
    setIsProtectedPdf(false);
    setIsScannedPdf(false);
    setDuplicateShortCircuitBatch(null);

    void (async () => {
      try {
        // Pre-decryption duplicate short-circuit check using source document id
        const existingLinkedBatch = data.importBatches.find(
          (b) => b.sourceDocumentId === staged.sourceDocumentId && b.status === "IMPORTED"
        );
        if (existingLinkedBatch) {
          if (cancelled) return;
          setDuplicateShortCircuitBatch(existingLinkedBatch);
          setBusy(false);
          return;
        }

        const file = await loadPendingEmailStatementFile(staged);
        if (cancelled) return;
        setStagedFile(file);

        const profiles = await listEmailIntakeProfiles().catch(() => [] as EmailIntakeProfile[]);
        if (cancelled) return;

        const matchingProfile = profiles.find((p) => p.id === staged.matchedProfileId && p.enabled !== false) || (
          staged.matchedProfileId
            ? ({
                id: staged.matchedProfileId,
                name: staged.matchedProfileName || "Matched Profile",
                linkedFinancialAccountId: staged.linkedProfileAccountId,
                enabled: true,
              } as EmailIntakeProfile)
            : undefined
        );
        setMatchedProfile(matchingProfile);

        const scopeKey = matchingProfile?.expectedInstitution || matchingProfile?.statementParserProfile || staged.matchedProfileName || matchingProfile?.name || "default";
        const sessionPassword = getTransientSessionPassword(scopeKey);

        if (!cancelled) {
          await processLoadedStatement(file, staged, matchingProfile, sessionPassword);
        }
      } catch (reason) {
        if (!cancelled) {
          setError(reason instanceof Error ? reason.message : "The preserved email statement could not be prepared for review.");
          setBusy(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [canImport, activeAccounts, data.accounts, data.importBatches]);

  if (!pending) return null;

  const dismiss = () => {
    clearPendingEmailStatementReview();
    setPasswordInput("");
    setUnlockError("");
    setPending(null);
    setDocument(null);
    setPreview(null);
    setImportCommitted(false);
    setResolution(null);
    setAccountEvidence(null);
    setStagedFile(null);
    setIsProtectedPdf(false);
    setIsScannedPdf(false);
    setDuplicateShortCircuitBatch(null);
    setError("");
  };

  const resetPreview = () => {
    setPreview(null);
    setImportCommitted(false);
  };

  const handleUnlockPdf = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!stagedFile || !pending) return;
    const password = passwordInput.trim();
    if (!password) {
      setUnlockError("Please enter the statement password.");
      return;
    }
    await processLoadedStatement(stagedFile, pending, matchedProfile, password);
  };

  const buildPreview = () => {
    if (!document || !accountId) {
      setError("Choose an active Cash & Banking account and wait for the preserved statement to load.");
      return;
    }
    const account = data.accounts.find((item) => item.id === accountId && item.active);
    if (!account) {
      setError("Choose an active Cash & Banking account before building the preview.");
      return;
    }
    const built = buildStatementPreview(
      document,
      mapping,
      account.id,
      account.currency,
      data.transactions,
      data.importBatches.filter((batch) => batch.accountId === account.id).map((batch) => batch.fileFingerprint),
      data.importBatches,
    );
    setPreview({ ...built, sourceDocumentId: pending.sourceDocumentId });
    setImportCommitted(false);
    setError("");
  };

  const commit = async () => {
    if (!preview || !onCommitImport) return;
    if (!canImport) {
      setError("Cash statement import permission is required.");
      return;
    }
    const account = data.accounts.find((item) => item.id === accountId && item.active);
    if (!account) {
      setError("The selected Cash & Banking account is no longer active. Please choose an active account.");
      return;
    }
    if (preview.isExactDuplicate || (!importCommitted && data.importBatches.some((b) => b.fileFingerprint === preview.fileFingerprint && b.status === "IMPORTED" && b.id !== preview.duplicateBreakdown?.existingBatchId))) {
      setError("This statement has already been imported. Cannot commit an exact duplicate statement.");
      return;
    }
    setBusy(true);
    setBusyMessage("Importing statement rows into Cash & Banking…");
    setError("");
    try {
      if (!importCommitted) {
        await onCommitImport(preview, account);
        setImportCommitted(true);
      }
      await linkFinancialImportSource({ accountId: account.id, fileFingerprint: preview.fileFingerprint, sourceDocumentId: preview.sourceDocumentId });
      dismiss();
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "The statement import could not be completed.";
      setError(importCommitted ? `The statement is imported, but its source link still needs to be finalized. Retry this step. ${message}` : message);
    } finally { setBusy(false); }
  };

  const selectedAccount = activeAccounts.find((a) => a.id === accountId);
  const badge = resolution ? resolutionActionBadge(resolution.proposedAction) : null;
  const BadgeIcon = badge?.icon;

  return (
    <section className="rounded-2xl border border-sky-200 bg-sky-50/50 p-4 shadow-sm sm:p-5" aria-label="Connected mailbox statement review">
      <div className="flex items-start justify-between gap-3">
        <SectionHeader
          title="Review statement from Email Intake"
          description="The original Gmail message and selected attachment are already preserved. Preview remains non-mutating until you explicitly commit the import."
          icon={Mail}
        />
        <button
          type="button"
          disabled={busy || importCommitted}
          onClick={dismiss}
          aria-label="Dismiss connected statement review"
          className="rounded-lg p-1.5 text-slate-500 hover:bg-white disabled:opacity-50"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-3 rounded-xl border border-sky-100 bg-white p-3">
        <p className="text-xs font-black text-slate-900">{pending.subject || "Bank statement"}</p>
        <p className="mt-1 text-xs text-slate-500">{pending.sender || "Connected mailbox"} · {pending.fileName}</p>
        <p className="mt-1 text-[10px] text-slate-400">Source document: {pending.sourceDocumentId}</p>
      </div>

      {/* Exact Duplicate Short-Circuit Banner */}
      {duplicateShortCircuitBatch && (
        <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4 space-y-2">
          <div className="flex items-center gap-2 font-black text-amber-900 text-xs uppercase tracking-wide">
            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
            <span>Exact Duplicate Statement Detected</span>
          </div>
          <p className="text-xs text-amber-900 leading-relaxed">
            This statement was already imported into{" "}
            <strong>
              {data.accounts.find((a) => a.id === duplicateShortCircuitBatch.accountId)?.displayName || "Cash & Banking"}
            </strong>
            {duplicateShortCircuitBatch.createdAt ? ` on ${new Date(duplicateShortCircuitBatch.createdAt).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })}` : ""}{" "}
            (Batch ID: <code className="bg-amber-100 px-1 py-0.5 rounded text-[11px]">{duplicateShortCircuitBatch.id}</code>).
          </p>
          <p className="text-[11px] text-amber-800">
            Source document provenance confirmed that this exact file has already been imported. No decryption or duplicate import is needed.
          </p>
          <button
            type="button"
            onClick={dismiss}
            className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-amber-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-amber-800"
          >
            Dismiss Review
          </button>
        </div>
      )}

      {/* Scanned or Image-Only PDF Notice */}
      {isScannedPdf && (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-2">
          <div className="flex items-center gap-2 font-black text-amber-900 text-xs">
            <FileText className="h-4 w-4 text-amber-600 shrink-0" />
            <span>Scanned / Image-Based Statement</span>
          </div>
          <p className="text-xs text-amber-900 leading-relaxed">
            This statement appears to be scanned or image-based without a machine-readable text layer.
          </p>
          <p className="text-[11px] text-amber-800">
            You can export a CSV/XLSX file from your bank or enter statement transactions manually in Cash & Banking.
          </p>
          <button
            type="button"
            onClick={dismiss}
            className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-slate-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-slate-800"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Password Prompt Card */}
      {isProtectedPdf && !duplicateShortCircuitBatch && !isScannedPdf && (
        <div className="mt-4 rounded-xl border border-indigo-200 bg-indigo-50/70 p-4 sm:p-5 space-y-4 shadow-xs" data-testid="protected-statement-prompt">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0">
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm font-black text-slate-900">Protected bank statement</h4>
              <p className="mt-0.5 text-xs text-slate-600">
                This PDF is password protected. Enter the statement password to continue.
              </p>
            </div>
          </div>

          {unlockError && (
            <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-900">
              {unlockError}
            </div>
          )}

          <form onSubmit={handleUnlockPdf} className="space-y-3 max-w-md">
            <div>
              <label htmlFor="statement-password-input" className="block text-xs font-bold text-slate-700 mb-1">
                Statement password
              </label>
              <div className="relative">
                <input
                  id="statement-password-input"
                  type={showPassword ? "text" : "password"}
                  autoComplete="off"
                  disabled={busy}
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  placeholder="Enter PDF password"
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 pr-10 focus:ring-2 focus:ring-indigo-500 focus:outline-hidden disabled:bg-slate-100"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <label className="flex items-center gap-2 cursor-pointer select-none text-xs text-slate-700">
              <input
                type="checkbox"
                checked={rememberSessionPassword}
                onChange={(e) => setRememberSessionPassword(e.target.checked)}
                className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span>Use this password for other statement PDFs this session</span>
            </label>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                type="submit"
                disabled={busy || !passwordInput.trim()}
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold disabled:opacity-50 inline-flex items-center gap-2 shadow-xs"
              >
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Unlock className="w-4 h-4" />}
                Unlock statement
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={dismiss}
                className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
            </div>
          </form>

          <p className="text-[10px] text-slate-400 border-t border-indigo-100/80 pt-2">
            Statement passwords are sensitive credentials. Engoryx never stores passwords in databases, storage, logs, or telemetry.
          </p>
        </div>
      )}

      {!activeAccounts.length && (
        <div className="mt-3">
          <Notice tone="warning">Add an active Cash & Banking account before reviewing this statement. The preserved email source will remain staged until you dismiss it.</Notice>
        </div>
      )}

      {error && !isScannedPdf && <div role="alert" className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-900">{error}</div>}
      {importCommitted && <Notice tone="warning">The financial import is already committed. The only remaining action is to finalize its preserved email-source link; retrying will not re-import statement rows.</Notice>}
      {busy && !document && (
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-sky-100 bg-white p-3 text-xs font-semibold text-sky-900">
          <Loader2 className="h-4 w-4 animate-spin" />{busyMessage}
        </div>
      )}

      {document && (
        <div className="mt-4 space-y-4">
          {resolution && (
            <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3 shadow-xs">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
                <div className="flex items-center gap-2">
                  <CreditCard className="h-4 w-4 text-sky-700" />
                  <span className="text-xs font-black text-slate-900">Account Identity Resolution</span>
                </div>
                {badge && (
                  <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${badge.bg}`}>
                    {BadgeIcon && <BadgeIcon className="h-3 w-3" />}
                    {badge.label}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 text-xs">
                <div className="rounded-lg bg-slate-50 p-2 border border-slate-100">
                  <p className="text-[10px] font-bold uppercase text-slate-500">Detected Institution</p>
                  <p className="mt-0.5 font-bold text-slate-800 truncate" title={accountEvidence?.institutionName || "Unknown"}>
                    {accountEvidence?.institutionName || "Unknown"}
                  </p>
                </div>
                <div className="rounded-lg bg-slate-50 p-2 border border-slate-100">
                  <p className="text-[10px] font-bold uppercase text-slate-500">Account Suffix</p>
                  <p className="mt-0.5 font-bold text-slate-800">
                    {accountEvidence?.maskedIdentifier ? `•••• ${accountEvidence.maskedIdentifier}` : (accountEvidence?.accountNumber || "Not detected")}
                  </p>
                </div>
                <div className="rounded-lg bg-slate-50 p-2 border border-slate-100">
                  <p className="text-[10px] font-bold uppercase text-slate-500">Statement Currency</p>
                  <p className="mt-0.5 font-bold text-slate-800">
                    {accountEvidence?.currency || "Not specified"}
                  </p>
                </div>
                <div className="rounded-lg bg-slate-50 p-2 border border-slate-100">
                  <p className="text-[10px] font-bold uppercase text-slate-500">Sender Rule</p>
                  <p className="mt-0.5 font-bold text-slate-800 truncate" title={pending.matchedProfileName || "None"}>
                    {pending.matchedProfileName || "None"}
                  </p>
                </div>
              </div>

              {resolution.conflicts.length > 0 && (
                <div className="rounded-lg border border-rose-200 bg-rose-50/80 p-3 space-y-1.5 text-xs text-rose-950">
                  <div className="flex items-center gap-1.5 font-black text-rose-900 uppercase tracking-wide text-[11px]">
                    <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0" />
                    <span>Authoritative Account Identity Conflicts</span>
                  </div>
                  <ul className="space-y-1 pl-5 list-disc text-rose-900 text-xs">
                    {resolution.conflicts.map((conflict, idx) => (
                      <li key={idx}>
                        <span className="font-semibold">{conflict.label}: </span>
                        <span>{conflict.reason}</span>
                        {conflict.existingValue && conflict.candidateValue && (
                          <span className="ml-1 text-[11px] text-rose-700">
                            (Existing: <code className="bg-rose-100 px-1 py-0.5 rounded">{conflict.existingValue}</code> vs Statement: <code className="bg-rose-100 px-1 py-0.5 rounded">{conflict.candidateValue}</code>)
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                  <p className="text-[11px] text-rose-700 italic">
                    Saved sender rule points to an account that conflicts with the parsed statement details. Please choose the correct account explicitly below.
                  </p>
                </div>
              )}

              {resolution.proposedAction === "CREATE_NEW" && (
                <div className="rounded-lg border border-purple-200 bg-purple-50/70 p-3 space-y-1 text-xs text-purple-950">
                  <div className="flex items-center gap-1.5 font-black text-purple-900 uppercase tracking-wide text-[11px]">
                    <PlusCircle className="h-4 w-4 text-purple-600 shrink-0" />
                    <span>Proposed new account: {resolution.matchedEntityName || "New Account"}</span>
                  </div>
                  <p className="text-purple-900">
                    No existing active account matches the detected institution and suffix. Automatic creation is prohibited; select an existing Cash & Banking account from the dropdown or configure the account in settings.
                  </p>
                </div>
              )}

              {(resolution.proposedAction === "NEEDS_REVIEW" && resolution.conflicts.length === 0) || resolution.proposedAction === "POSSIBLE_DUPLICATE" ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-3 text-xs text-amber-950 space-y-1">
                  <div className="flex items-center gap-1.5 font-bold text-amber-900">
                    <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                    <span>Explicit Account Selection Required</span>
                  </div>
                  <p className="text-amber-800">
                    {resolution.proposedAction === "POSSIBLE_DUPLICATE"
                      ? "A potential duplicate or similar account exists. Verify and select the target account below."
                      : "Multiple matches or incomplete account identification. Select the target account below."}
                  </p>
                </div>
              ) : null}

              {resolution.matchReasons.length > 0 && (
                <div className="pt-2 border-t border-slate-100">
                  <div className="flex items-center gap-1 text-[11px] font-bold text-slate-600 mb-1">
                    <Info className="h-3.5 w-3.5 text-slate-400" />
                    <span>Resolution Details & Evidence</span>
                  </div>
                  <ul className="space-y-0.5 pl-4 list-disc text-[11px] text-slate-600">
                    {resolution.matchReasons.map((reason, idx) => (
                      <li key={idx}>{reason}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
            <label className="space-y-1">
              <span className="field-label">Cash account</span>
              <select
                disabled={importCommitted}
                className="field-input disabled:bg-slate-100"
                value={accountId}
                onChange={(event) => {
                  setAccountId(event.target.value);
                  resetPreview();
                }}
              >
                <option value="">-- Select Cash & Banking Account --</option>
                {activeAccounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.displayName} ({account.institutionName || "Bank"} •••• {account.maskedIdentifier?.replace(/\D/g, "").slice(-4) || "N/A"} · {account.currency})
                  </option>
                ))}
              </select>
              {selectedAccount ? (
                <p className="text-[11px] font-semibold text-emerald-700 flex items-center gap-1 mt-1">
                  <CheckCircle2 className="h-3 w-3" />
                  Target: {selectedAccount.displayName} ({selectedAccount.currency})
                  {pending.confirmedAccountId === accountId && resolution?.matchedEntityId === accountId && resolution?.conflicts.length === 0 ? (
                    <span className="text-slate-500 font-normal">· Legacy selection confirmed by parsed identity</span>
                  ) : resolution?.matchedEntityId === accountId && resolution?.proposedAction === "LINK_EXISTING" ? (
                    <span className="text-slate-500 font-normal">· Matched via parsed account identity</span>
                  ) : null}
                </p>
              ) : (
                <p className="text-[11px] text-slate-400 mt-1">
                  Please select an active Cash & Banking account to build the statement preview.
                </p>
              )}
            </label>

            <div className="rounded-lg border border-slate-200 bg-white p-3">
              <div className="flex items-start gap-2">
                <FileSpreadsheet className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-1.5">
                    <p className="text-xs font-black text-slate-900">{document.fileName} · {document.sheetName || "Statement"}</p>
                    {document.structure.appliedProfileName && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-sky-700 bg-sky-50 px-2 py-0.5 rounded border border-sky-200">
                        Profile: {document.structure.appliedProfileName}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-slate-500">Detected {document.structure.confidence} confidence. {document.structure.reasons.join(" ") || "Confirm the column mapping below."}</p>
                  {document.structure.isProfileFallback && document.structure.profileValidationWarning && (
                    <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900 flex items-start gap-1.5">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600 mt-0.5" />
                      <span>{document.structure.profileValidationWarning}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div>
            <SectionHeader
              title="Confirm statement columns"
              description="Required: date, description, and either credit/debit or amount + direction. Deterministic spreadsheet parser with verified structure mapping."
              icon={FileSpreadsheet}
            />
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {(["date", "reference", "description", "credit", "debit", "amount", "direction", "runningBalance"] as Array<keyof StatementColumnMapping>).map((field) => (
                <label key={field} className="space-y-1">
                  <span className="field-label">
                    {field === "credit" ? "Income / Credit" : field === "debit" ? "Expense / Debit" : field === "runningBalance" ? "Running balance" : field[0]!.toUpperCase() + field.slice(1)}
                  </span>
                  <select
                    disabled={importCommitted}
                    className="field-input disabled:bg-slate-100"
                    value={mapping[field] === undefined ? "" : String(mapping[field])}
                    onChange={(event) => {
                      setMapping((current) => ({ ...current, [field]: event.target.value === "" ? undefined : Number(event.target.value) }));
                      resetPreview();
                    }}
                  >
                    <option value="">Not mapped</option>
                    {document.structure.headers.map((header, index) => (
                      <option key={`${field}-${index}`} value={index}>
                        {header || `Column ${index + 1}`}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
            <button
              type="button"
              disabled={busy || importCommitted}
              onClick={buildPreview}
              className="mt-4 rounded-lg bg-sky-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
            >
              Build statement preview
            </button>
          </div>

          {preview && (
            <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-3">
              {preview.isExactDuplicate && (
                <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 space-y-1.5 text-xs text-amber-950">
                  <div className="flex items-center gap-2 font-black text-amber-900 uppercase tracking-wide text-[11px]">
                    <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                    <span>Exact Duplicate Statement Detected</span>
                  </div>
                  <p className="text-amber-900">
                    This statement was already imported into {data.accounts.find((a) => a.id === preview.duplicateBreakdown?.existingAccountId)?.displayName || selectedAccount?.displayName || "Cash & Banking"}{preview.duplicateBreakdown?.existingImportDate ? ` on ${new Date(preview.duplicateBreakdown.existingImportDate).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })}` : ""} (Batch ID: {preview.duplicateBreakdown?.existingBatchId || preview.fileFingerprint.slice(0, 16)}).
                  </p>
                  <p className="text-amber-800 text-[11px]">
                    Exact duplicate statements cannot be imported again to protect account balance and transaction history integrity.
                  </p>
                </div>
              )}

              {preview.duplicateBreakdown && !preview.isExactDuplicate && preview.duplicateBreakdown.duplicateTransactions > 0 && (
                <div className="rounded-lg border border-sky-200 bg-sky-50/70 p-3 text-xs text-sky-950 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Info className="h-4 w-4 text-sky-600 shrink-0" />
                    <span>
                      <strong>{preview.duplicateBreakdown.totalRows}</strong> transactions detected: <strong>{preview.duplicateBreakdown.newTransactions}</strong> new, <strong>{preview.duplicateBreakdown.duplicateTransactions}</strong> already imported / duplicate.
                    </span>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Summary label="Rows found" value={String(preview.rowsFound)} />
                <Summary label="Money in" value={money(preview.credits, preview.currency)} />
                <Summary label="Money out" value={money(preview.debits, preview.currency)} />
                <Summary label="Duplicates" value={String(preview.duplicateCount)} />
                <Summary label="Opening balance" value={preview.openingBalance === undefined ? "Not found" : money(preview.openingBalance, preview.currency)} />
                <Summary label="Calculated ending" value={money(preview.calculatedEndingBalance, preview.currency)} />
                <Summary label="Statement ending" value={preview.statementEndingBalance === undefined ? "Not found" : money(preview.statementEndingBalance, preview.currency)} />
                <Summary label="Difference" value={preview.difference === undefined ? "Not available" : money(preview.difference, preview.currency)} />
              </div>
              {preview.balanceIssues.length > 0 && <Notice tone="danger">Statement balance validation failed. Resolve the mapping or source rows before committing.</Notice>}
              {preview.invalidRows.length > 0 && <Notice tone="warning">{preview.invalidRows.length} row{preview.invalidRows.length === 1 ? "" : "s"} require review before this import can be committed.</Notice>}
              <div className="flex flex-col justify-between gap-3 border-t border-slate-100 pt-3 sm:flex-row sm:items-center">
                <div>
                  <p className="text-xs font-black text-slate-900">{preview.transactionsToImport.length} transaction{preview.transactionsToImport.length === 1 ? "" : "s"} ready</p>
                  <p className="mt-1 text-[10px] text-slate-500">Commit creates the normal statement import batch and links it back to this preserved email source.</p>
                </div>
                <button
                  type="button"
                  disabled={preview.isExactDuplicate || (!preview.canCommit && !importCommitted) || busy || !onCommitImport}
                  onClick={() => void commit()}
                  className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {busy ? "Working…" : importCommitted ? "Retry source link" : preview.isExactDuplicate ? "Already imported (duplicate)" : preview.canCommit ? "Commit statement import" : "Resolve preview issues"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
};

function Summary({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg bg-slate-50 p-2.5"><p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</p><p className="mt-1 truncate text-xs font-black tabular-nums text-slate-900" title={value}>{value}</p></div>;
}