import React, { useMemo, useState } from "react";
import { ArrowRight, CheckCircle2, Landmark, Link2, RotateCcw, Search, Split, WalletCards } from "lucide-react";
import { financialId, reconciliationStatusForTransaction, type CashBankingWorkspaceData, type FinancialReconciliationCandidate, type FinancialTransaction, type FinancialTransactionMatch } from "../lib/cashBanking.ts";
import { defaultSettlementAllocation, type FinancialSettlementHistoryItem } from "../lib/financialSettlement.ts";
import { reverseFinancialSettlement } from "../lib/financialSettlementPersistence.ts";
import { appPathForInvoice, appPathForPayrollRun, financialTransactionIdFromSearch } from "../utils/appRouting.ts";
import { safeErrorMessage } from "../utils/errorNormalization.ts";
import { SettlementReversalDialog } from "./financial/SettlementReversalDialog.tsx";

interface Props {
  data: CashBankingWorkspaceData;
  candidates: readonly FinancialReconciliationCandidate[];
  canReconcile?: boolean;
  canSettleTarget?: (targetType: FinancialReconciliationCandidate["targetType"]) => boolean;
  onSaveMatch?: (match: FinancialTransactionMatch, transaction: FinancialTransaction) => Promise<void> | void;
  onSaveMatchBatch?: (matches: FinancialTransactionMatch[], transaction: FinancialTransaction) => Promise<void> | void;
  onReverseMatch?: (matchId: string, reason: string) => Promise<void> | void;
  canReverseMatch?: (match: FinancialTransactionMatch) => boolean;
}

function money(value: number, currency: string) {
  try { return new Intl.NumberFormat("en-PH", { style: "currency", currency, maximumFractionDigits: 2 }).format(value || 0); }
  catch { return `${currency} ${(value || 0).toFixed(2)}`; }
}

function round(value: number) { return Math.round((Number(value) || 0) * 100) / 100; }

function targetPath(candidate: FinancialReconciliationCandidate) {
  if (candidate.targetType === "INVOICE") return appPathForInvoice(candidate.targetId, "/cash");
  if (candidate.targetType === "PAYROLL") return appPathForPayrollRun(candidate.targetId, "/cash");
  return undefined;
}

export const CashSettlementAllocationWorkspace: React.FC<Props> = ({ data, candidates, canReconcile = true, canSettleTarget = () => true, onSaveMatch, onSaveMatchBatch, onReverseMatch, canReverseMatch }) => {
  const linkedId = typeof window === "undefined" ? undefined : financialTransactionIdFromSearch(window.location.search);
  const initial = data.transactions.find((transaction) => transaction.id === linkedId)
    || data.transactions.find((transaction) => transaction.status === "POSTED" && transaction.direction === "DEBIT" && !["MATCHED", "IGNORED"].includes(transaction.reconciliationStatus));
  const [transactionId, setTransactionId] = useState(initial?.id || "");
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [reversedIds, setReversedIds] = useState<Set<string>>(() => new Set());
  const [reversalMatch, setReversalMatch] = useState<FinancialTransactionMatch | null>(null);
  const [reversalReason, setReversalReason] = useState("");
  const [reversalError, setReversalError] = useState("");
  const [notice, setNotice] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const transaction = data.transactions.find((item) => item.id === transactionId);
  const account = transaction ? data.accounts.find((item) => item.id === transaction.accountId) : undefined;
  const activeMatches = useMemo(() => data.matches.filter((match) => match.status === "CONFIRMED" && !reversedIds.has(match.id)), [data.matches, reversedIds]);
  const transactionMatches = transaction ? activeMatches.filter((match) => match.transactionId === transaction.id && ["INVOICE", "PAYROLL", "EXPENSE"].includes(match.targetType) && Boolean(match.targetId)) : [];
  const reversedTransactionMatches = transaction ? data.matches.filter((match) => match.transactionId === transaction.id && match.status === "REVERSED" && ["INVOICE", "PAYROLL", "EXPENSE"].includes(match.targetType)) : [];
  const alreadyAllocated = round(transactionMatches.reduce((sum, match) => sum + match.matchedAmount, 0));
  const remaining = transaction ? round(Math.max(0, transaction.amount - alreadyAllocated)) : 0;

  const rows = useMemo(() => {
    if (!transaction || transaction.status !== "POSTED" || transaction.direction !== "DEBIT") return [];
    const search = query.trim().toLowerCase();
    return candidates.map((candidate) => {
      const settled = round(activeMatches.filter((match) => match.targetType === candidate.targetType && match.targetId === candidate.targetId).reduce((sum, match) => sum + match.matchedAmount, 0));
      const outstanding = round(Math.max(0, candidate.amount - settled));
      return { candidate, settled, outstanding };
    }).filter(({ candidate, outstanding }) => outstanding > 0.005
      && (!candidate.currency || candidate.currency.toUpperCase() === transaction.currency.toUpperCase())
      && (candidate.targetType === "INVOICE" || candidate.targetType === "PAYROLL" || candidate.targetType === "EXPENSE")
      && (!search || `${candidate.label} ${candidate.reference || ""} ${candidate.description || ""}`.toLowerCase().includes(search)))
      .sort((left, right) => {
        const leftGap = Math.abs(left.outstanding - remaining);
        const rightGap = Math.abs(right.outstanding - remaining);
        return leftGap - rightGap || left.candidate.label.localeCompare(right.candidate.label);
      });
  }, [activeMatches, candidates, query, remaining, transaction]);

  const selectedDrafts = rows.map((row) => {
    const raw = draft[`${row.candidate.targetType}:${row.candidate.targetId}`];
    const amount = raw === undefined ? 0 : round(Number(raw));
    return { ...row, amount: Number.isFinite(amount) ? amount : 0 };
  }).filter((row) => row.amount > 0);
  const canSettle = (targetType: FinancialReconciliationCandidate["targetType"]) => canReconcile && canSettleTarget(targetType);
  const draftTotal = round(selectedDrafts.reduce((sum, row) => sum + row.amount, 0));
  const afterDraft = round(Math.max(0, remaining - draftTotal));
  const draftInvalid = draftTotal > remaining + 0.005
    || selectedDrafts.some((row) => row.amount > row.outstanding + 0.005)
    || selectedDrafts.some((row) => !canSettle(row.candidate.targetType));

  const choose = (candidate: FinancialReconciliationCandidate, outstanding: number) => {
    const key = `${candidate.targetType}:${candidate.targetId}`;
    const alreadyDraftedElsewhere = selectedDrafts.filter((row) => `${row.candidate.targetType}:${row.candidate.targetId}` !== key).reduce((sum, row) => sum + row.amount, 0);
    const txRemaining = Math.max(0, remaining - alreadyDraftedElsewhere);
    setDraft((current) => ({ ...current, [key]: String(defaultSettlementAllocation(txRemaining, outstanding)) }));
  };

  const confirm = async () => {
    if (!transaction || (!onSaveMatch && !onSaveMatchBatch) || !selectedDrafts.length || draftInvalid || selectedDrafts.some((row) => !canSettle(row.candidate.targetType))) return;
    setBusy(true); setNotice(null);
    try {
      let confirmedMatches = activeMatches;
      const newMatches: FinancialTransactionMatch[] = [];
      for (const row of selectedDrafts) {
        const confirmedAt = new Date().toISOString();
        const match: FinancialTransactionMatch = {
          id: financialId("settlement"),
          transactionId: transaction.id,
          targetType: row.candidate.targetType,
          targetId: row.candidate.targetId,
          matchedAmount: row.amount,
          status: "CONFIRMED",
          confidence: 100,
          notes: "Confirmed through Cash & Banking allocation review.",
          createdAt: confirmedAt,
          updatedAt: confirmedAt,
        };
        confirmedMatches = [...confirmedMatches, match];
        newMatches.push(match);
      }
      const nextTransaction = {
        ...transaction,
        reconciliationStatus: reconciliationStatusForTransaction(transaction, confirmedMatches),
        updatedAt: new Date().toISOString(),
      };
      if (onSaveMatchBatch) {
        await onSaveMatchBatch(newMatches, nextTransaction);
      } else if (onSaveMatch) {
        for (const match of newMatches) await onSaveMatch(match, nextTransaction);
      }
      setDraft({});
      setNotice({ tone: "success", text: `${selectedDrafts.length} settlement allocation${selectedDrafts.length === 1 ? "" : "s"} confirmed by the guarded settlement operation.` });
    } catch (error) {
      setNotice({ tone: "danger", text: safeErrorMessage(error, "Settlement confirmation failed. Nothing is shown as paid until the server confirms it.") });
    } finally { setBusy(false); }
  };

  const openReversal = (match: FinancialTransactionMatch) => {
    setReversalMatch(match);
    setReversalReason("");
    setReversalError("");
  };

  const confirmReversal = async () => {
    if (!reversalMatch || reversalReason.trim().length < 3) return;
    setBusy(true); setReversalError(""); setNotice(null);
    try {
      if (onReverseMatch) {
        await onReverseMatch(reversalMatch.id, reversalReason.trim());
      } else if (!reversalMatch.id.startsWith("demo-")) {
        await reverseFinancialSettlement(reversalMatch.id, reversalReason.trim());
      }
      setReversedIds((current) => new Set([...current, reversalMatch.id]));
      setReversalMatch(null); setReversalReason("");
      setNotice({ tone: "success", text: "Settlement link reversed. The original confirmation remains in audit history." });
    } catch (error) {
      setReversalError(safeErrorMessage(error, "Settlement reversal failed."));
    } finally { setBusy(false); }
  };

  const reversalDialogItem: FinancialSettlementHistoryItem | null = reversalMatch && transaction ? {
    id: reversalMatch.id,
    transactionId: transaction.id,
    status: "CONFIRMED",
    amount: reversalMatch.matchedAmount,
    confirmedAt: reversalMatch.confirmedAt,
    accountId: transaction.accountId,
    accountName: account?.displayName,
    maskedIdentifier: account?.maskedIdentifier,
    transactionDate: transaction.transactionDate,
    referenceNumber: transaction.referenceNumber,
    description: transaction.description,
    currency: transaction.currency,
  } : null;

  const reversalTargetCandidate = reversalMatch ? candidates.find((item) => item.targetType === reversalMatch.targetType && item.targetId === reversalMatch.targetId) : undefined;

  return <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5" aria-label="Settlement allocation workspace" data-tour="cash-settlement-workspace">
    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
      <div><p className="text-[10px] font-black uppercase tracking-[0.14em] text-indigo-600">Reconciliation allocation</p><h2 className="mt-1 text-base font-black text-slate-950">Settle invoices and payroll from posted cash movements</h2><p className="mt-1 max-w-3xl text-xs text-slate-500">Allocate one debit across one or many obligations. Confirmation links payment evidence only; it does not create project cost or recalculate payroll.</p></div>
      <select aria-label="Transaction to reconcile" value={transactionId} onChange={(event) => { setTransactionId(event.target.value); setDraft({}); setNotice(null); }} className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700">
        <option value="">Select transaction</option>
        {data.transactions.filter((item) => item.status === "POSTED" && item.direction === "DEBIT" && item.reconciliationStatus !== "IGNORED").sort((a,b) => b.transactionDate.localeCompare(a.transactionDate)).map((item) => <option key={item.id} value={item.id}>{item.transactionDate} · {item.referenceNumber || item.description.slice(0, 30)} · {money(item.amount, item.currency)}</option>)}
      </select>
    </div>

    {notice && <div className={`mt-3 rounded-lg border px-3 py-2 text-xs font-semibold ${notice.tone === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-rose-200 bg-rose-50 text-rose-800"}`}>{notice.text}</div>}

    {!transaction ? <p className="mt-4 rounded-xl border border-dashed border-slate-200 p-5 text-sm text-slate-500">Choose a posted debit to start reconciliation.</p> : <>
      <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
        <Metric icon={Landmark} label="Account" value={`${account?.displayName || "Account"}${account?.maskedIdentifier ? ` · ${account.maskedIdentifier}` : ""}`} />
        <Metric label="Date / reference" value={`${transaction.transactionDate} · ${transaction.referenceNumber || "No reference"}`} />
        <Metric label="Transaction total" value={money(transaction.amount, transaction.currency)} />
        <Metric label="Already allocated" value={money(alreadyAllocated, transaction.currency)} />
        <Metric label="Remaining" value={money(remaining, transaction.currency)} emphasis />
      </div>
      <p className="mt-3 break-words rounded-lg bg-slate-50 px-3 py-2 text-[11px] text-slate-600">{transaction.description}</p>

      {transactionMatches.length > 0 && <div className="mt-4 space-y-2"><p className="text-[10px] font-black uppercase tracking-wide text-slate-500">Confirmed allocations</p>{transactionMatches.map((match) => {
        const candidate = candidates.find((item) => item.targetType === match.targetType && item.targetId === match.targetId);
        const href = candidate ? targetPath(candidate) : undefined;
        return <div key={match.id} className="flex flex-col gap-2 rounded-lg border border-emerald-100 bg-emerald-50/50 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="truncate text-xs font-bold text-slate-800">{candidate?.label || `${match.targetType} ${match.targetId || ""}`}</p>
            <p className="text-[10px] text-slate-500">{money(match.matchedAmount, transaction.currency)} · confirmed</p>
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            {href && <a href={href} className="inline-flex items-center gap-1 text-[10px] font-black text-indigo-700">Open target <ArrowRight className="h-3 w-3" /></a>}
            {(canReverseMatch?.(match) ?? canReconcile) && (
              <button
                type="button"
                onClick={() => openReversal(match)}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-bold text-rose-700 hover:bg-rose-50"
              >
                <RotateCcw className="h-3 w-3" /> Reverse settlement
              </button>
            )}
          </div>
        </div>;
        })}</div>}
      {reversedTransactionMatches.length > 0 && <details className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3"><summary className="cursor-pointer text-[10px] font-black uppercase tracking-wide text-slate-500">Reversed settlement history ({reversedTransactionMatches.length})</summary><div className="mt-2 space-y-2">{reversedTransactionMatches.map((match) => <div key={match.id} className="rounded-md border border-slate-200 bg-white px-3 py-2 text-[10px] text-slate-600"><div className="flex items-center justify-between gap-2"><span className="font-bold text-rose-700">{match.targetType} · {money(match.matchedAmount, transaction.currency)} · REVERSED</span><span>{match.reversedAt ? new Date(match.reversedAt).toLocaleDateString("en-PH") : "Date unavailable"}</span></div>{match.reversalReason && <p className="mt-1 break-words">Reason: {match.reversalReason}</p>}</div>)}</div></details>}

      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><label className="flex min-h-11 flex-1 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3"><Search className="h-4 w-4 text-slate-400" /><span className="sr-only">Search settlement candidates</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search invoice, vendor, payroll period, reference…" className="w-full bg-transparent text-xs outline-none" /></label><div className="text-right"><p className="text-[10px] text-slate-500">Draft allocation</p><p className={`text-sm font-black tabular-nums ${draftInvalid ? "text-rose-700" : "text-slate-900"}`}>{money(draftTotal, transaction.currency)} <span className="text-[10px] font-medium text-slate-400">· {money(afterDraft, transaction.currency)} left</span></p></div></div>

      {transaction.direction !== "DEBIT" || transaction.status !== "POSTED" ? <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">Only POSTED debit transactions can settle supplier invoices or payroll runs.</p> : <div className="mt-3 grid gap-2 lg:grid-cols-2">{rows.slice(0, 20).map(({ candidate, settled, outstanding }) => {
        const key = `${candidate.targetType}:${candidate.targetId}`;
        const href = targetPath(candidate);
        const targetCanBeSettled = canSettle(candidate.targetType);
        return <article key={key} className="rounded-xl border border-slate-200 p-3"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="flex items-center gap-1.5"><span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[9px] font-black text-indigo-700">{candidate.targetType}</span><strong className="truncate text-xs text-slate-900">{candidate.label}</strong></div><p className="mt-1 text-[10px] text-slate-500">{candidate.date || "Date unavailable"}{candidate.reference ? ` · ${candidate.reference}` : ""}</p><p className="mt-1 text-[10px] text-slate-500">Payable {money(candidate.amount, candidate.currency || transaction.currency)} · settled {money(settled, transaction.currency)} · <strong className="text-slate-700">outstanding {money(outstanding, transaction.currency)}</strong></p></div>{href && <a href={href} aria-label="Open settlement target" className="shrink-0 rounded-lg p-2 text-indigo-700 hover:bg-indigo-50"><Link2 className="h-4 w-4" /></a>}</div><div className="mt-3 flex gap-2"><div className="relative min-w-0 flex-1"><span className="pointer-events-none absolute left-3 top-2.5 text-[10px] font-bold text-slate-400">{transaction.currency}</span><input inputMode="decimal" value={draft[key] || ""} onChange={(event) => setDraft((current) => ({ ...current, [key]: event.target.value }))} placeholder="0.00" disabled={!targetCanBeSettled} className="min-h-10 w-full rounded-lg border border-slate-200 pl-12 pr-3 text-right text-xs font-bold tabular-nums outline-none focus:border-indigo-400 disabled:cursor-not-allowed disabled:bg-slate-50" /></div><button type="button" onClick={() => choose(candidate, outstanding)} disabled={!targetCanBeSettled || remaining <= 0} className="inline-flex min-h-10 items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50 px-3 text-[10px] font-black text-indigo-700 disabled:opacity-40"><Split className="h-3.5 w-3.5" /> {targetCanBeSettled ? "Allocate" : "Requires target permission"}</button></div></article>;
      })}{!rows.length && <p className="lg:col-span-2 rounded-xl border border-dashed border-slate-200 p-5 text-center text-xs text-slate-500">No eligible same-currency invoice, payroll, or expense obligation has a remaining balance for this debit.</p>}</div>}

      <div className="mt-4 flex flex-col gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="flex items-center gap-1.5 text-xs font-black text-slate-800"><WalletCards className="h-4 w-4" /> Confirmation review</p><p className="mt-1 text-[10px] text-slate-500">{selectedDrafts.length ? `${selectedDrafts.length} allocation${selectedDrafts.length === 1 ? "" : "s"} selected. Server validation is authoritative.` : "Select one or more allocations. Nothing is auto-confirmed."}</p>{draftInvalid && <p className="mt-1 text-[10px] font-bold text-rose-700">The allocation exceeds a remaining balance or needs the target domain permission.</p>}</div><button type="button" onClick={() => void confirm()} disabled={!canReconcile || (!onSaveMatch && !onSaveMatchBatch) || busy || !selectedDrafts.length || draftInvalid} className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-indigo-600 px-4 text-xs font-black text-white disabled:opacity-40"><CheckCircle2 className="h-4 w-4" /> {busy ? "Confirming…" : "Confirm settlement"}</button></div>
    </>}
    <p className="mt-3 flex items-center gap-1.5 text-[10px] text-slate-400"><Split className="h-3 w-3" /> Internal account transfers continue through the dedicated transfer workflow below and never become invoice/payroll settlement.</p>

    {reversalDialogItem && reversalMatch && (
      <SettlementReversalDialog
        item={reversalDialogItem}
        targetContext={{
          targetType: reversalMatch.targetType as any,
          targetId: reversalMatch.targetId || "",
          targetLabel: reversalTargetCandidate?.label,
          currency: transaction?.currency || "PHP",
          currentOutstanding: reversalTargetCandidate ? reversalTargetCandidate.amount : undefined,
        }}
        loading={busy}
        error={reversalError}
        reason={reversalReason}
        onReasonChange={setReversalReason}
        onConfirm={() => void confirmReversal()}
        onClose={() => { if (!busy) setReversalMatch(null); }}
      />
    )}
  </section>;
};

function Metric({ icon: Icon, label, value, emphasis = false }: { icon?: React.ElementType; label: string; value: string; emphasis?: boolean }) {
  return <div className={`rounded-xl border p-3 ${emphasis ? "border-amber-200 bg-amber-50" : "border-slate-100 bg-slate-50"}`}><p className="flex items-center gap-1 text-[10px] font-semibold text-slate-500">{Icon && <Icon className="h-3 w-3" />}{label}</p><p className={`mt-1 text-sm font-black tabular-nums ${emphasis ? "text-amber-900" : "text-slate-900"}`}>{value}</p></div>;
}

export default CashSettlementAllocationWorkspace;
