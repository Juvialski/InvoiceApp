import React, { useEffect, useMemo, useState } from "react";
import { FileSpreadsheet, Loader2, Mail, X } from "lucide-react";
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

export const ConnectedStatementReview: React.FC<ConnectedStatementReviewProps> = ({ data, canImport = false, onCommitImport }) => {
  const [pending, setPending] = useState<PendingEmailStatementReview | null>(null);
  const [document, setDocument] = useState<ParsedStatementDocument | null>(null);
  const [mapping, setMapping] = useState<StatementColumnMapping>({});
  const [accountId, setAccountId] = useState("");
  const [preview, setPreview] = useState<ProvenancedStatementPreview | null>(null);
  const [importCommitted, setImportCommitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const activeAccounts = useMemo(() => data.accounts.filter((account) => account.active), [data.accounts]);

  useEffect(() => {
    const staged = readPendingEmailStatementReview();
    if (!staged || !canImport) return;
    let cancelled = false;
    setPending(staged);
    setAccountId((current) => current || activeAccounts[0]?.id || "");
    setBusy(true);
    setError("");
    void loadPendingEmailStatementFile(staged).then(async (file) => {
      const parsed = parseStatementFile(await file.arrayBuffer(), file.name);
      if (cancelled) return;
      setDocument(parsed);
      setMapping(parsed.structure.mapping);
    }).catch((reason) => {
      if (!cancelled) setError(reason instanceof Error ? reason.message : "The preserved email statement could not be prepared for review.");
    }).finally(() => { if (!cancelled) setBusy(false); });
    return () => { cancelled = true; };
  }, [canImport, activeAccounts]);

  if (!pending) return null;

  const dismiss = () => {
    clearPendingEmailStatementReview();
    setPending(null);
    setDocument(null);
    setPreview(null);
    setImportCommitted(false);
    setError("");
  };

  const resetPreview = () => {
    setPreview(null);
    setImportCommitted(false);
  };

  const buildPreview = () => {
    if (!document || !accountId) {
      setError("Choose an account and wait for the preserved statement to load.");
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
    );
    setPreview({ ...built, sourceDocumentId: pending.sourceDocumentId });
    setImportCommitted(false);
    setError("");
  };

  const commit = async () => {
    if (!preview || !onCommitImport) return;
    const account = data.accounts.find((item) => item.id === accountId && item.active);
    if (!account) return;
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

  return <section className="rounded-2xl border border-sky-200 bg-sky-50/50 p-4 shadow-sm sm:p-5" aria-label="Connected mailbox statement review">
    <div className="flex items-start justify-between gap-3">
      <SectionHeader title="Review statement from Email Intake" description="The original Gmail message and selected attachment are already preserved. Preview remains non-mutating until you explicitly commit the import." icon={Mail} />
      <button type="button" disabled={busy || importCommitted} onClick={dismiss} aria-label="Dismiss connected statement review" className="rounded-lg p-1.5 text-slate-500 hover:bg-white disabled:opacity-50"><X className="h-4 w-4" /></button>
    </div>
    <div className="mt-3 rounded-xl border border-sky-100 bg-white p-3">
      <p className="text-xs font-black text-slate-900">{pending.subject || "Bank statement"}</p>
      <p className="mt-1 text-xs text-slate-500">{pending.sender || "Connected mailbox"} · {pending.fileName}</p>
      <p className="mt-1 text-[10px] text-slate-400">Source document: {pending.sourceDocumentId}</p>
    </div>

    {!activeAccounts.length && <Notice tone="warning">Add an active Cash & Banking account before reviewing this statement. The preserved email source will remain staged until you dismiss it.</Notice>}
    {error && <div role="alert" className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-900">{error}</div>}
    {importCommitted && <Notice tone="warning">The financial import is already committed. The only remaining action is to finalize its preserved email-source link; retrying will not re-import statement rows.</Notice>}
    {busy && !document && <div className="mt-3 flex items-center gap-2 rounded-lg border border-sky-100 bg-white p-3 text-xs font-semibold text-sky-900"><Loader2 className="h-4 w-4 animate-spin" />Loading and verifying the preserved statement source…</div>}

    {document && activeAccounts.length > 0 && <div className="mt-4 space-y-4">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
        <label className="space-y-1"><span className="field-label">Cash account</span><select disabled={importCommitted} className="field-input disabled:bg-slate-100" value={accountId} onChange={(event) => { setAccountId(event.target.value); resetPreview(); }}>{activeAccounts.map((account) => <option key={account.id} value={account.id}>{account.displayName} · {account.currency}</option>)}</select></label>
        <div className="rounded-lg border border-slate-200 bg-white p-3"><div className="flex items-start gap-2"><FileSpreadsheet className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /><div className="min-w-0"><p className="text-xs font-black text-slate-900">{document.fileName} · {document.sheetName || "Statement"}</p><p className="mt-1 text-xs text-slate-500">Detected {document.structure.confidence} confidence. {document.structure.reasons.join(" ") || "Confirm the column mapping below."}</p></div></div></div>
      </div>

      <div><SectionHeader title="Confirm statement columns" description="Required: date, description, and either credit/debit or amount + direction. This uses the same parser and validation as manual Cash & Banking imports." icon={FileSpreadsheet} /><div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{(["date", "reference", "description", "credit", "debit", "amount", "direction", "runningBalance"] as Array<keyof StatementColumnMapping>).map((field) => <label key={field} className="space-y-1"><span className="field-label">{field === "credit" ? "Income / Credit" : field === "debit" ? "Expense / Debit" : field === "runningBalance" ? "Running balance" : field[0]!.toUpperCase() + field.slice(1)}</span><select disabled={importCommitted} className="field-input disabled:bg-slate-100" value={mapping[field] === undefined ? "" : String(mapping[field])} onChange={(event) => { setMapping((current) => ({ ...current, [field]: event.target.value === "" ? undefined : Number(event.target.value) })); resetPreview(); }}><option value="">Not mapped</option>{document.structure.headers.map((header, index) => <option key={`${field}-${index}`} value={index}>{header || `Column ${index + 1}`}</option>)}</select></label>)}</div><button type="button" disabled={busy || importCommitted} onClick={buildPreview} className="mt-4 rounded-lg bg-sky-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">Build statement preview</button></div>

      {preview && <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-3"><div className="grid grid-cols-2 gap-2 sm:grid-cols-4"><Summary label="Rows found" value={String(preview.rowsFound)} /><Summary label="Money in" value={money(preview.credits, preview.currency)} /><Summary label="Money out" value={money(preview.debits, preview.currency)} /><Summary label="Duplicates" value={String(preview.duplicateCount)} /><Summary label="Opening balance" value={preview.openingBalance === undefined ? "Not found" : money(preview.openingBalance, preview.currency)} /><Summary label="Calculated ending" value={money(preview.calculatedEndingBalance, preview.currency)} /><Summary label="Statement ending" value={preview.statementEndingBalance === undefined ? "Not found" : money(preview.statementEndingBalance, preview.currency)} /><Summary label="Difference" value={preview.difference === undefined ? "Not available" : money(preview.difference, preview.currency)} /></div>{preview.balanceIssues.length > 0 && <Notice tone="danger">Statement balance validation failed. Resolve the mapping or source rows before committing.</Notice>}{preview.invalidRows.length > 0 && <Notice tone="warning">{preview.invalidRows.length} row{preview.invalidRows.length === 1 ? "" : "s"} require review before this import can be committed.</Notice>}<div className="flex flex-col justify-between gap-3 border-t border-slate-100 pt-3 sm:flex-row sm:items-center"><div><p className="text-xs font-black text-slate-900">{preview.transactionsToImport.length} transaction{preview.transactionsToImport.length === 1 ? "" : "s"} ready</p><p className="mt-1 text-[10px] text-slate-500">Commit creates the normal statement import batch and links it back to this preserved email source.</p></div><button type="button" disabled={(!preview.canCommit && !importCommitted) || busy || !onCommitImport} onClick={() => void commit()} className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-40">{busy ? "Working…" : importCommitted ? "Retry source link" : preview.canCommit ? "Commit statement import" : "Resolve preview issues"}</button></div></div>}
    </div>}
  </section>;
};

function Summary({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg bg-slate-50 p-2.5"><p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</p><p className="mt-1 truncate text-xs font-black tabular-nums text-slate-900" title={value}>{value}</p></div>;
}
