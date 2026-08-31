import React, { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  CreditCard,
  FileSpreadsheet,
  Info,
  Loader2,
  Mail,
  PlusCircle,
  Sparkles,
  X,
} from "lucide-react";
import {
  buildStatementPreview,
  type CashBankingWorkspaceData,
  type FinancialAccount,
  type StatementColumnMapping,
  type StatementPreview,
  type ParsedStatementDocument,
} from "../lib/cashBanking.ts";
import { parseStatementFile } from "../lib/cashBankingImport.ts";
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
  const [error, setError] = useState("");
  const [resolution, setResolution] = useState<EntityResolutionResult | null>(null);
  const [accountEvidence, setAccountEvidence] = useState<FinancialAccountIdentityEvidence | null>(null);

  const activeAccounts = useMemo(() => data.accounts.filter((account) => account.active), [data.accounts]);

  useEffect(() => {
    const staged = readPendingEmailStatementReview();
    if (!staged || !canImport) return;
    let cancelled = false;
    setPending(staged);
    setBusy(true);
    setError("");

    void (async () => {
      try {
        const file = await loadPendingEmailStatementFile(staged);
        if (cancelled) return;

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

        const parsed = parseStatementFile(
          await file.arrayBuffer(),
          file.name,
          matchingProfile?.statementParserProfile,
          matchingProfile?.expectedInstitution,
        );
        if (cancelled) return;

        const extractedEvidence = extractAccountEvidenceFromStatement(
          { fileName: parsed.fileName, sheetName: parsed.sheetName, rawRows: parsed.rawRows as any },
          { sender: staged.sender, subject: staged.subject },
          matchingProfile,
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
          profiles.length ? profiles : (matchingProfile ? [matchingProfile] : []),
          data.importBatches,
        );

        if (cancelled) return;

        setDocument(parsed);
        setMapping(parsed.structure.mapping);
        setAccountEvidence(extractedEvidence);
        setResolution(candidateResolution);

        // Saved sender/profile links remain advisory. Automatic account
        // selection requires independent account identity from the parsed
        // statement (account number/suffix), not merely a conflict-free rule.
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
          // Profile-only suggestions, NEEDS_REVIEW, POSSIBLE_DUPLICATE,
          // CREATE_NEW, conflicts, and unresolved cases require an explicit
          // destination choice.
          setAccountId("");
        }
      } catch (reason) {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "The preserved email statement could not be prepared for review.");
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [canImport, activeAccounts, data.accounts, data.importBatches]);

  if (!pending) return null;

  const dismiss = () => {
    clearPendingEmailStatementReview();
    setPending(null);
    setDocument(null);
    setPreview(null);
    setImportCommitted(false);
    setResolution(null);
    setAccountEvidence(null);
    setError("");
  };

  const resetPreview = () => {
    setPreview(null);
    setImportCommitted(false);
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

      {!activeAccounts.length && (
        <div className="mt-3">
          <Notice tone="warning">Add an active Cash & Banking account before reviewing this statement. The preserved email source will remain staged until you dismiss it.</Notice>
        </div>
      )}

      {error && <div role="alert" className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-900">{error}</div>}
      {importCommitted && <Notice tone="warning">The financial import is already committed. The only remaining action is to finalize its preserved email-source link; retrying will not re-import statement rows.</Notice>}
      {busy && !document && (
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-sky-100 bg-white p-3 text-xs font-semibold text-sky-900">
          <Loader2 className="h-4 w-4 animate-spin" />Loading and verifying the preserved statement source…
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