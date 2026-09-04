import React, { useEffect, useMemo, useState } from "react";
import { ArrowRight, CheckCircle2, Landmark, Link2, RotateCcw, WalletCards } from "lucide-react";
import type { ClientCollection } from "../../lib/clientCollections.ts";
import { clientCollectionTotal } from "../../lib/clientCollections.ts";
import {
  deriveClientCollectionSettlementSummary,
  type FinancialSettlementHistoryItem,
  type FinancialSettlementSummary,
} from "../../lib/financialSettlement.ts";
import { loadFinancialSettlementSummary, reverseFinancialSettlement } from "../../lib/financialSettlementPersistence.ts";
import {
  confirmedMatchedAmount,
  createFinancialMatch,
  reconciliationStatusForTransaction,
  type CashBankingWorkspaceData,
  type FinancialTransaction,
  type FinancialTransactionMatch,
} from "../../lib/cashBanking.ts";
import type { AppNavigate } from "../../utils/clientNavigation.ts";
import { appPathForCashTransaction } from "../../utils/appRouting.ts";
import { safeErrorMessage } from "../../utils/errorNormalization.ts";
import { SettlementReversalDialog } from "../financial/SettlementReversalDialog.tsx";

interface ClientCollectionSettlementPanelProps {
  collection: ClientCollection;
  cashData?: CashBankingWorkspaceData;
  canReconcileCash?: boolean;
  canSettleClientCollection?: boolean;
  onSaveMatch?: (match: FinancialTransactionMatch, transaction: FinancialTransaction) => Promise<void> | void;
  onReverseMatch?: (matchId: string, reason: string) => Promise<void> | void;
  canReverseMatch?: (match: FinancialTransactionMatch) => boolean;
  onNavigatePath?: AppNavigate;
}

function round(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.round((numeric + Number.EPSILON) * 100) / 100 : 0;
}

function money(value: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-PH", { style: "currency", currency: currency || "PHP", maximumFractionDigits: 2 }).format(value || 0);
  } catch {
    return `${currency || "PHP"} ${(value || 0).toFixed(2)}`;
  }
}

function historyFromWorkspace(collection: ClientCollection, data?: CashBankingWorkspaceData): FinancialSettlementHistoryItem[] {
  return (data?.matches || [])
    .filter((match) => match.targetType === "CLIENT_COLLECTION" && match.targetId === collection.id && (match.status === "CONFIRMED" || match.status === "REVERSED"))
    .map((match) => {
      const transaction = data?.transactions.find((item) => item.id === match.transactionId);
      const account = transaction ? data?.accounts.find((item) => item.id === transaction.accountId) : undefined;
      return {
        id: match.id,
        transactionId: match.transactionId,
        status: match.status === "REVERSED" ? "REVERSED" : "CONFIRMED",
        amount: round(match.matchedAmount),
        confirmedAt: match.confirmedAt,
        confirmedByUserId: match.confirmedByUserId,
        reversedAt: match.reversedAt,
        reversedByUserId: match.reversedByUserId,
        reversalReason: match.reversalReason,
        confirmationSource: match.confirmationSource,
        accountId: transaction?.accountId,
        accountName: account?.displayName,
        accountType: account?.accountType,
        maskedIdentifier: account?.maskedIdentifier,
        transactionDate: transaction?.transactionDate,
        referenceNumber: transaction?.referenceNumber,
        description: transaction?.description,
        currency: transaction?.currency,
      } satisfies FinancialSettlementHistoryItem;
    })
    .sort((left, right) => String(right.confirmedAt || right.reversedAt || "").localeCompare(String(left.confirmedAt || left.reversedAt || "")));
}

function localCollectionId(id: string) {
  return id.startsWith("demo-") || id.startsWith("local-");
}

function linkStateLabel(summary: FinancialSettlementSummary) {
  return String(summary.linkState || summary.settlementState || "UNLINKED").replaceAll("_", " ");
}

function stateTone(summary: FinancialSettlementSummary) {
  const state = summary.linkState || summary.settlementState;
  if (state === "LINKED") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (state === "PARTIALLY_LINKED") return "border-amber-200 bg-amber-50 text-amber-900";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

export const ClientCollectionSettlementPanel: React.FC<ClientCollectionSettlementPanelProps> = ({
  collection,
  cashData,
  canReconcileCash = false,
  canSettleClientCollection = false,
  onSaveMatch,
  onReverseMatch,
  canReverseMatch,
  onNavigatePath,
}) => {
  const workspaceHistory = useMemo(() => historyFromWorkspace(collection, cashData), [cashData, collection]);
  const localSummary = useMemo(
    () => deriveClientCollectionSettlementSummary(collection, workspaceHistory),
    [collection, workspaceHistory],
  );
  const [summary, setSummary] = useState<FinancialSettlementSummary>(localSummary);
  const [loading, setLoading] = useState(false);
  const [refreshError, setRefreshError] = useState("");
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const [reversalTarget, setReversalTarget] = useState<FinancialSettlementHistoryItem | null>(null);
  const [reversalReason, setReversalReason] = useState("");
  const [reversalError, setReversalError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setSummary(localSummary);
    setRefreshError("");
    if (localCollectionId(collection.id)) {
      setLoading(false);
      return () => { cancelled = true; };
    }
    setLoading(true);
    loadFinancialSettlementSummary("CLIENT_COLLECTION", collection.id)
      .then((loaded) => {
        if (!cancelled && loaded) setSummary(loaded);
      })
      .catch((cause) => {
        if (!cancelled) setRefreshError(safeErrorMessage(cause, "Bank settlement details could not be loaded."));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [collection.id, localSummary]);

  const activeMatches = useMemo(
    () => (cashData?.matches || []).filter((match) => match.targetType === "CLIENT_COLLECTION" && match.targetId === collection.id && match.status === "CONFIRMED"),
    [cashData?.matches, collection.id],
  );
  const settlementHistory = summary.history;
  const collectionTotal = round(summary.collectionTotal ?? summary.settlementBasis ?? clientCollectionTotal(collection));
  const linkedAmount = round(summary.linkedAmount ?? summary.reconciledCashPaid);
  const remainingUnlinkedAmount = round(Math.max(0, summary.remainingUnlinkedAmount ?? collectionTotal - linkedAmount));
  const canLink = collection.status === "RECORDED" && canReconcileCash && canSettleClientCollection && Boolean(onSaveMatch);

  const eligibleTransactions = useMemo(() => {
    if (!cashData || collection.status !== "RECORDED" || remainingUnlinkedAmount <= 0.005) return [];
    return cashData.transactions
      .filter((transaction) => transaction.status === "POSTED"
        && transaction.direction === "CREDIT"
        && transaction.reconciliationStatus !== "IGNORED"
        && transaction.currency.toUpperCase() === collection.currency.toUpperCase()
        && !cashData.matches.some((match) => match.transactionId === transaction.id && match.targetType === "TRANSFER" && match.status === "CONFIRMED")
        && round(transaction.amount - confirmedMatchedAmount(transaction.id, cashData.matches)) > 0.005)
      .map((transaction) => ({
        transaction,
        remaining: round(Math.max(0, transaction.amount - confirmedMatchedAmount(transaction.id, cashData.matches))),
      }))
      .sort((left, right) => right.transaction.transactionDate.localeCompare(left.transaction.transactionDate));
  }, [cashData, collection.currency, collection.status, remainingUnlinkedAmount]);

  const confirmLink = async (transaction: FinancialTransaction) => {
    if (!canLink) return;
    const amount = round(amounts[transaction.id]);
    if (amount <= 0 || amount > transaction.amount - confirmedMatchedAmount(transaction.id, cashData?.matches || []) + 0.005 || amount > remainingUnlinkedAmount + 0.005) {
      setNotice({ tone: "danger", text: "Enter a positive amount within both the transaction and collection remaining balances." });
      return;
    }
    const confirmed = typeof window === "undefined"
      || window.confirm(`Link ${money(amount, collection.currency)} from ${transaction.description} to recorded collection ${collection.collectionNumber}? This creates bank evidence only.`);
    if (!confirmed) return;
    setBusy(transaction.id);
    setNotice(null);
    try {
      const match = createFinancialMatch({
        companyId: transaction.companyId,
        transactionId: transaction.id,
        targetType: "CLIENT_COLLECTION",
        targetId: collection.id,
        matchedAmount: amount,
        status: "CONFIRMED",
        confidence: 100,
        notes: "Confirmed through Project Workspace client collection settlement review.",
        confirmedAt: new Date().toISOString(),
      });
      const nextMatches = [...(cashData?.matches || []), match];
      await onSaveMatch?.(match, { ...transaction, reconciliationStatus: reconciliationStatusForTransaction(transaction, nextMatches) });
      setAmounts((current) => ({ ...current, [transaction.id]: "" }));
      setNotice({ tone: "success", text: `${money(amount, collection.currency)} was linked as bank evidence. Collected to Date and project cost were not changed.` });
    } catch (cause) {
      setNotice({ tone: "danger", text: safeErrorMessage(cause, "The bank settlement link could not be created.") });
    } finally {
      setBusy(null);
    }
  };

  const confirmReversal = async () => {
    if (!reversalTarget || reversalReason.trim().length < 3) return;
    setBusy(`reverse:${reversalTarget.id}`);
    setReversalError("");
    try {
      if (onReverseMatch) await onReverseMatch(reversalTarget.id, reversalReason.trim());
      else if (!localCollectionId(collection.id)) await reverseFinancialSettlement(reversalTarget.id, reversalReason.trim());
      const nextHistory = summary.history.map((item) => item.id === reversalTarget.id
        ? { ...item, status: "REVERSED" as const, reversedAt: new Date().toISOString(), reversalReason: reversalReason.trim() }
        : item);
      const nextLinked = round(nextHistory.filter((item) => item.status === "CONFIRMED").reduce((sum, item) => sum + item.amount, 0));
      const nextRemaining = round(Math.max(0, collectionTotal - nextLinked));
      setSummary({
        ...summary,
        reconciledCashPaid: nextLinked,
        linkedAmount: nextLinked,
        effectiveSettled: nextLinked,
        outstanding: nextRemaining,
        remainingUnlinkedAmount: nextRemaining,
        linkState: nextLinked <= 0.005 ? "UNLINKED" : nextRemaining <= 0.005 ? "LINKED" : "PARTIALLY_LINKED",
        settlementState: nextLinked <= 0.005 ? "UNLINKED" : nextRemaining <= 0.005 ? "LINKED" : "PARTIALLY_LINKED",
        history: nextHistory,
      });
      setReversalTarget(null);
      setReversalReason("");
      setNotice({ tone: "success", text: "Bank settlement link reversed. The original confirmation remains in settlement history." });
    } catch (cause) {
      setReversalError(safeErrorMessage(cause, "The bank settlement link could not be reversed."));
    } finally {
      setBusy(null);
    }
  };

  const openTransaction = (transactionId: string) => {
    const path = appPathForCashTransaction(transactionId, "CLIENT_COLLECTION", collection.id);
    if (onNavigatePath) onNavigatePath(path);
  };

  return (
    <section className="mt-5 rounded-xl border border-emerald-100 bg-emerald-50/30 p-4" aria-label="Client collection bank settlement">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-emerald-700"><Landmark className="h-3.5 w-3.5" /> Cash settlement linkage</p>
          <p className="mt-1 text-[10px] leading-4 text-slate-600">Bank evidence is separate from the recorded collection. It never creates another collection, changes Collected to Date, or enters project cost.</p>
        </div>
        <span className={`w-fit rounded-full border px-2.5 py-1 text-[10px] font-black ${stateTone(summary)}`}>{linkStateLabel(summary)}</span>
      </div>

      {refreshError && <p role="alert" className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[10px] text-amber-900">{refreshError} Showing local match data where available.</p>}
      {loading && <p role="status" className="mt-3 text-[10px] font-semibold text-indigo-700">Refreshing bank settlement evidence…</p>}

      <div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Metric icon={WalletCards} label="Collection amount" value={money(collectionTotal, collection.currency)} />
        <Metric icon={Link2} label="Bank-linked amount" value={money(linkedAmount, collection.currency)} />
        <Metric label="Remaining unlinked" value={money(remainingUnlinkedAmount, collection.currency)} emphasis={remainingUnlinkedAmount > 0.005} />
        <Metric label="Commercial status" value={collection.status} />
      </div>

      {notice && <p className={`mt-3 rounded-lg border px-3 py-2 text-[10px] font-semibold ${notice.tone === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-rose-200 bg-rose-50 text-rose-800"}`}>{notice.text}</p>}
      {summary.historyRedacted && linkedAmount > 0.005 && <p className="mt-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[10px] text-slate-600">Confirmed bank linkage exists, but transaction metadata and reversal controls require cash transaction read access.</p>}

      {settlementHistory.length > 0 && (
        <div className="mt-4 space-y-2">
          <p className="text-[10px] font-black uppercase tracking-wide text-slate-500">Linked financial transaction history</p>
          {settlementHistory.map((item) => {
            const match = activeMatches.find((candidate) => candidate.id === item.id);
            const isActive = item.status === "CONFIRMED";
            const canReverse = isActive && canReconcileCash && (match ? (canReverseMatch?.(match) ?? true) : true);
            return <div key={item.id} className={`flex flex-col gap-2 rounded-lg border bg-white px-3 py-2 sm:flex-row sm:items-center sm:justify-between ${isActive ? "border-emerald-100" : "border-slate-200"}`}>
              <div className="min-w-0"><p className="truncate text-xs font-bold text-slate-800">{item.description || "Financial transaction"}</p><p className="text-[10px] text-slate-500">{item.transactionDate || "Date unavailable"} · {item.referenceNumber || "No reference"} · {money(item.amount, item.currency || collection.currency)} · <span className={isActive ? "text-emerald-700" : "text-slate-500"}>{item.status}</span></p><p className="text-[10px] text-slate-500">{item.accountName || "Bank account"}{item.maskedIdentifier ? ` · ${item.maskedIdentifier}` : ""}{item.reversalReason ? ` · ${item.reversalReason}` : ""}</p></div>
              <div className="flex shrink-0 flex-wrap items-center gap-2"><button type="button" onClick={() => openTransaction(item.transactionId)} className="inline-flex items-center gap-1 text-[10px] font-black text-indigo-700">Open in Cash &amp; Banking <ArrowRight className="h-3 w-3" /></button>{canReverse && <button type="button" onClick={() => { setReversalTarget(item); setReversalReason(""); setReversalError(""); }} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-bold text-rose-700 hover:bg-rose-50"><RotateCcw className="h-3 w-3" /> Reverse link</button>}</div>
            </div>;
          })}
        </div>
      )}

      {collection.status !== "RECORDED" ? (
        <p className="mt-4 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[10px] text-slate-600">Only a RECORDED client collection can receive bank settlement evidence. This {collection.status.toLowerCase()} collection remains separate from cash.</p>
      ) : !canReconcileCash ? (
        <p className="mt-4 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[10px] text-slate-600">Cash reconciliation permission is required to link or reverse bank evidence. The collection remains recorded commercial truth.</p>
      ) : !canSettleClientCollection ? (
        <p className="mt-4 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[10px] text-slate-600">Project management permission is required in addition to cash reconciliation permission to link this collection.</p>
      ) : !eligibleTransactions.length ? (
        <p className="mt-4 rounded-lg border border-dashed border-slate-200 bg-white px-3 py-3 text-[10px] text-slate-600">No eligible same-company POSTED CREDIT transaction with a positive remaining balance is available for this currency.</p>
      ) : (
        <div className="mt-4 space-y-2">
          <p className="text-[10px] font-black uppercase tracking-wide text-slate-500">Eligible CREDIT transactions</p>
          {eligibleTransactions.map(({ transaction, remaining }) => {
            const amount = round(amounts[transaction.id]);
            const overCollection = amount > remainingUnlinkedAmount + 0.005;
            return <div key={transaction.id} className="rounded-lg border border-white bg-white p-3 shadow-sm"><div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><p className="truncate text-xs font-bold text-slate-800">{transaction.description}</p><p className="mt-1 text-[10px] text-slate-500">{transaction.transactionDate} · {transaction.referenceNumber || "No reference"} · {money(transaction.amount, transaction.currency)} · remaining {money(remaining, transaction.currency)}</p></div><span className="inline-flex w-fit items-center gap-1 rounded-full bg-sky-50 px-2 py-1 text-[9px] font-black text-sky-800">CREDIT · POSTED</span></div><div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center"><label className="flex min-h-10 min-w-0 flex-1 items-center gap-2 rounded-lg border border-slate-200 px-3"><span className="text-[10px] font-bold text-slate-400">{collection.currency}</span><input aria-label={`Amount to link from ${transaction.description}`} inputMode="decimal" value={amounts[transaction.id] || ""} onChange={(event) => setAmounts((current) => ({ ...current, [transaction.id]: event.target.value }))} placeholder={`Up to ${Math.min(remaining, remainingUnlinkedAmount).toFixed(2)}`} className="w-full text-right text-xs font-bold outline-none" /></label><button type="button" disabled={busy !== null || amount <= 0 || overCollection} onClick={() => void confirmLink(transaction)} className="inline-flex min-h-10 items-center justify-center gap-1 rounded-lg bg-emerald-600 px-3 text-[10px] font-black text-white disabled:cursor-not-allowed disabled:opacity-40"><CheckCircle2 className="h-3.5 w-3.5" /> {busy === transaction.id ? "Linking…" : "Confirm link"}</button></div></div>;
          })}
          <p className="text-[10px] text-slate-500">Enter a partial amount when needed. Confirmation is explicit; the guarded database operation rechecks company, permission, CREDIT direction, currency, lifecycle, and both allocation ceilings.</p>
        </div>
      )}

      {reversalTarget && <SettlementReversalDialog item={reversalTarget} targetContext={{ targetType: "CLIENT_COLLECTION", targetId: collection.id, targetLabel: collection.collectionNumber, currency: collection.currency, settlementBasis: collectionTotal, currentReconciledPaid: linkedAmount, currentOutstanding: remainingUnlinkedAmount }} loading={busy === `reverse:${reversalTarget.id}`} error={reversalError} reason={reversalReason} onReasonChange={setReversalReason} onConfirm={() => void confirmReversal()} onClose={() => { if (!busy) setReversalTarget(null); }} />}
    </section>
  );
};

function Metric({ icon: Icon, label, value, emphasis = false }: { icon?: React.ElementType; label: string; value: string; emphasis?: boolean }) {
  return <div className={`rounded-lg border p-2.5 ${emphasis ? "border-amber-200 bg-amber-50" : "border-white bg-white"}`}><p className="flex items-center gap-1 text-[10px] font-semibold text-slate-500">{Icon && <Icon className="h-3 w-3" />}{label}</p><p className={`mt-1 text-xs font-black tabular-nums ${emphasis ? "text-amber-900" : "text-slate-900"}`}>{value}</p></div>;
}

export default ClientCollectionSettlementPanel;
