import React, { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, History, Landmark, LockKeyhole, RotateCcw, ShieldCheck, WalletCards } from "lucide-react";
import type { FinancialSettlementHistoryItem, FinancialSettlementSummary, SettlementTargetType } from "../lib/financialSettlement.ts";
import { loadFinancialSettlementSummary, reverseFinancialSettlement } from "../lib/financialSettlementPersistence.ts";
import { demoSettlementSummaryForTarget } from "../demo/data/settlements.ts";
import { appPathForCashTransaction } from "../utils/appRouting.ts";
import type { AppNavigate } from "../utils/clientNavigation.ts";
import { safeErrorMessage } from "../utils/errorNormalization.ts";
import { SettlementReversalDialog } from "./financial/SettlementReversalDialog.tsx";

export interface FinancialSettlementCardProps {
  targetType: SettlementTargetType;
  targetId: string;
  title?: string;
  targetLabel?: string;
  compact?: boolean;
  canReverse?: boolean;
  fallbackSummary?: FinancialSettlementSummary | null;
  lifecycleStatus?: string;
  onReversed?: (item: FinancialSettlementHistoryItem) => void;
  onNavigatePath?: AppNavigate;
}

function money(value: number, currency: string) {
  try { return new Intl.NumberFormat("en-PH", { style: "currency", currency, maximumFractionDigits: 2 }).format(value || 0); }
  catch { return `${currency} ${(value || 0).toFixed(2)}`; }
}

function stateTone(state: FinancialSettlementSummary["settlementState"]) {
  if (state === "PAID" || state === "SETTLED") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (state === "PARTIALLY_PAID" || state === "PARTIALLY_DISBURSED") return "border-amber-200 bg-amber-50 text-amber-900";
  if (state === "OVERDUE") return "border-rose-200 bg-rose-50 text-rose-800";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

function date(value?: string) {
  if (!value) return "Date unavailable";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
}

export const FinancialSettlementCard: React.FC<FinancialSettlementCardProps> = ({
  targetType,
  targetId,
  title,
  targetLabel,
  compact = false,
  canReverse = false,
  fallbackSummary,
  lifecycleStatus,
  onReversed,
  onNavigatePath,
}) => {
  const demoSummary = useMemo(() => targetId.startsWith("demo-") ? demoSettlementSummaryForTarget(targetType, targetId) : null, [targetId, targetType]);
  const [summary, setSummary] = useState<FinancialSettlementSummary | null>(fallbackSummary || demoSummary);
  const [loading, setLoading] = useState(!fallbackSummary && !demoSummary);
  const [refreshing, setRefreshing] = useState(false);
  const targetKey = `${targetType}:${targetId}`;
  const resolvedTargetKeyRef = useRef<string | null>((fallbackSummary || demoSummary) ? targetKey : null);
  const refreshRequestRef = useRef(0);
  const visibleSummary = resolvedTargetKeyRef.current === targetKey ? summary : null;
  const [error, setError] = useState("");
  const [reversalTarget, setReversalTarget] = useState<FinancialSettlementHistoryItem | null>(null);
  const [reversalReason, setReversalReason] = useState("");
  const [reversing, setReversing] = useState(false);
  const [reversalError, setReversalError] = useState("");

  const refresh = async () => {
    const requestId = ++refreshRequestRef.current;
    if (targetId.startsWith("demo-")) {
      setSummary(fallbackSummary || demoSummary);
      resolvedTargetKeyRef.current = targetKey;
      setError("");
      setLoading(false);
      setRefreshing(false);
      return;
    }
    if (summary && resolvedTargetKeyRef.current === targetKey) setRefreshing(true);
    else setLoading(true);
    setError("");
    try {
      const loaded = await loadFinancialSettlementSummary(targetType, targetId);
      if (refreshRequestRef.current !== requestId) return;
      setSummary(loaded);
      resolvedTargetKeyRef.current = targetKey;
    }
    catch (cause) {
      if (refreshRequestRef.current !== requestId) return;
      setError(safeErrorMessage(cause, "Settlement details could not be loaded."));
    }
    finally {
      if (refreshRequestRef.current === requestId) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  };

  useEffect(() => { void refresh(); }, [targetId, targetType, fallbackSummary, demoSummary, targetKey]);
  useEffect(() => {
    setReversalTarget(null);
    setReversalReason("");
    setReversalError("");
  }, [targetKey]);

  const openReversalDialog = (item: FinancialSettlementHistoryItem) => {
    setReversalTarget(item);
    setReversalReason("");
    setReversalError("");
  };

  const closeReversalDialog = () => {
    if (reversing) return;
    setReversalTarget(null);
    setReversalReason("");
    setReversalError("");
  };

  const confirmReversal = async () => {
    if (!reversalTarget || reversalReason.trim().length < 3) return;
    setReversing(true);
    setReversalError("");

    try {
      if (targetId.startsWith("demo-")) {
        // Truthful local demo reversal state update
        const updatedHistory: FinancialSettlementHistoryItem[] = (summary?.history || []).map((h) => {
          if (h.id === reversalTarget.id) {
            return {
              ...h,
              status: "REVERSED" as const,
              reversedAt: new Date().toISOString(),
              reversalReason: reversalReason.trim(),
            };
          }
          return h;
        });
        const activePaid = updatedHistory
          .filter((h) => h.status === "CONFIRMED")
          .reduce((sum, h) => sum + (h.amount || 0), 0);
        const basis = summary?.settlementBasis || 0;
        const docPaid = summary?.documentReportedPaid || 0;
        const effective = Math.max(activePaid, docPaid);
        const outstanding = Math.max(0, basis - effective);
        const isVoided = summary?.lifecycleStatus === "VOID" || lifecycleStatus === "VOID";
        const state = isVoided
          ? "VOID"
          : targetType === "PAYROLL"
            ? (activePaid <= 0.005 ? "UNSETTLED" : outstanding <= 0.005 ? "SETTLED" : "PARTIALLY_DISBURSED")
            : (effective >= basis - 0.005 ? "PAID" : effective > 0.005 ? "PARTIALLY_PAID" : "UNPAID");

        const updatedSummary: FinancialSettlementSummary = {
          ...summary!,
          reconciledCashPaid: activePaid,
          effectiveSettled: effective,
          outstanding,
          settlementState: state,
          history: updatedHistory,
        };
        setSummary(updatedSummary);
        onReversed?.(reversalTarget);
        setReversalTarget(null);
        setReversalReason("");
        return;
      }

      await reverseFinancialSettlement(reversalTarget.id, reversalReason.trim());
      onReversed?.(reversalTarget);
      setReversalTarget(null);
      setReversalReason("");
      await refresh();
    } catch (cause) {
      setReversalError(safeErrorMessage(cause, "The settlement could not be reversed."));
    } finally {
      setReversing(false);
    }
  };

  if (loading || (!visibleSummary && !error)) return <section className="rounded-xl border border-slate-200 bg-white p-4 text-xs text-slate-500">Loading settlement evidence…</section>;
  if (!visibleSummary && error) return <section className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-800"><div className="flex items-center justify-between gap-3"><span>{error}</span><button type="button" onClick={() => void refresh()} className="shrink-0 rounded-md bg-white px-2 py-1 font-black text-rose-800 shadow-sm">Retry</button></div></section>;

  const active = visibleSummary?.history.filter((item) => item.status === "CONFIRMED") || [];
  const reversed = visibleSummary?.history.filter((item) => item.status === "REVERSED") || [];

  const defaultTitle = targetType === "PAYROLL"
    ? "Disbursement evidence"
    : targetType === "EXPENSE"
      ? "Expense payment evidence"
      : "Supplier payment evidence";

  const basisLabel = targetType === "PAYROLL"
    ? "Expected employee net pay"
    : targetType === "EXPENSE"
      ? "Expense obligation"
      : summary?.basisSource === "EXPLICIT_NET_PAYABLE"
        ? "Invoice net payable"
        : "Invoice payable";

  return (
    <>
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm" aria-label={`${targetType.toLowerCase()} settlement`}>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-indigo-600">Payment / settlement</p>
            <h3 className="mt-1 text-sm font-black text-slate-950">{title || defaultTitle}</h3>
            <p className="mt-1 text-[10px] text-slate-500">Cash evidence only. Project cost and operational history are not recreated or erased here.</p>
          </div>
          {visibleSummary && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className={`w-fit rounded-full border px-2.5 py-1 text-[10px] font-black ${stateTone(summary.settlementState)}`}>
                {String(summary.settlementState).replaceAll("_", " ")}
              </span>
              {(summary.lifecycleStatus === "VOID" || lifecycleStatus === "VOID") && (
                <span className="w-fit rounded-full border border-slate-300 bg-slate-100 px-2.5 py-1 text-[10px] font-black text-slate-700">
                  VOID FINANCIAL RECORD
                </span>
              )}
            </div>
          )}
        </div>

        {error && <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[10px] font-semibold text-rose-800"><span>{error}{visibleSummary ? " Showing the last successful settlement evidence." : ""}</span><button type="button" onClick={() => void refresh()} className="shrink-0 rounded-md bg-white px-2 py-1 font-black text-rose-800 shadow-sm">Retry</button></div>}

        {refreshing && <p role="status" className="mt-3 text-[10px] font-semibold text-indigo-700">Refreshing settlement evidence… Existing evidence remains visible.</p>}

        {visibleSummary && (
          <>
            <div className={`mt-4 grid gap-2 ${compact ? "sm:grid-cols-3" : "sm:grid-cols-3"}`}>
              <Metric label={basisLabel} value={money(summary.settlementBasis, summary.currency)} />
              <Metric label={targetType === "PAYROLL" ? "Confirmed disbursement" : "Confirmed bank payments"} value={money(summary.reconciledCashPaid, summary.currency)} />
              <Metric label="Outstanding" value={money(summary.outstanding, summary.currency)} emphasis={summary.outstanding > 0.005} />
            </div>

            {targetType === "INVOICE" && summary.documentReportedPaid > 0 && (
              <div className="mt-3 rounded-lg border border-sky-100 bg-sky-50 px-3 py-2 text-[10px] text-sky-800">
                <ShieldCheck className="mr-1 inline h-3 w-3" />
                Document-reported paid: <strong>{money(summary.documentReportedPaid, summary.currency)}</strong>. It is shown separately and is not added to confirmed bank payments.
              </div>
            )}

            {summary.legacyPaidWithoutBankLink && (
              <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[10px] text-slate-700">
                Paid lifecycle status exists, but no bank reconciliation is linked. Historical status is preserved.
              </div>
            )}

            <div className="mt-4 space-y-2">
              {summary.historyRedacted && summary.reconciledCashPaid > 0.005 ? (
                <p className="flex items-start gap-1.5 rounded-lg border border-slate-200 bg-slate-50 p-3 text-[10px] text-slate-600">
                  <LockKeyhole className="mt-0.5 h-3 w-3 shrink-0" />
                  Confirmed settlement exists, but linked account, transaction date, reference, and reversal controls require Cash & Banking transaction access.
                </p>
              ) : active.length ? (
                active.map((item) => (
                  <div key={item.id} className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <p className="flex items-center gap-1.5 truncate text-[10px] font-black text-slate-800">
                          <Landmark className="h-3 w-3 shrink-0 text-slate-400" />
                          {item.accountName || "Financial account"} {item.maskedIdentifier ? `· ${item.maskedIdentifier}` : ""}
                        </p>
                        <p className="mt-1 break-words text-[10px] text-slate-500">
                          {date(item.transactionDate || item.confirmedAt)} · {item.referenceNumber || "No bank reference"}
                        </p>
                      </div>
                      <p className="shrink-0 text-xs font-black tabular-nums text-slate-900">
                        {money(item.amount, summary.currency)}
                      </p>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-3">
                      <a
                        href={appPathForCashTransaction(item.transactionId, targetType, targetId)}
                        onClick={(event) => {
                          if (!onNavigatePath) return;
                          event.preventDefault();
                          onNavigatePath(appPathForCashTransaction(item.transactionId, targetType, targetId));
                        }}
                        className="inline-flex items-center gap-1 text-[10px] font-black text-indigo-700 hover:underline"
                      >
                        <WalletCards className="h-3 w-3" /> View payment in Cash & Banking <ArrowRight className="h-3 w-3" />
                      </a>
                      {canReverse && (
                        <button
                          type="button"
                          onClick={() => openReversalDialog(item)}
                          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-bold text-rose-700 hover:bg-rose-50"
                        >
                          <RotateCcw className="h-3 w-3" /> Reverse settlement
                        </button>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <p className="rounded-lg border border-dashed border-slate-200 p-3 text-[10px] text-slate-500">
                  No confirmed bank payment is linked yet.
                </p>
              )}
            </div>

            {!summary.historyRedacted && reversed.length > 0 && (
              <details className="mt-3 group">
                <summary className="cursor-pointer text-[10px] font-bold text-slate-500 hover:text-slate-700 flex items-center gap-1">
                  <History className="h-3 w-3" />
                  <span>Reversed settlement history ({reversed.length})</span>
                </summary>
                <div className="mt-2 space-y-2">
                  {reversed.map((item) => (
                    <div key={item.id} className="rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-[10px] text-slate-600">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0 flex items-center gap-1.5">
                          <span className="rounded bg-rose-100 px-1.5 py-0.5 text-[9px] font-black text-rose-800">REVERSED</span>
                          <span className="truncate font-semibold text-slate-700">
                            {item.accountName || "Account"}{item.maskedIdentifier ? ` (${item.maskedIdentifier})` : ""}
                          </span>
                        </div>
                        <span className="shrink-0 font-bold line-through text-slate-400 tabular-nums">
                          {money(item.amount, summary.currency)}
                        </span>
                      </div>
                      <p className="mt-1 text-slate-500">
                        {date(item.transactionDate || item.confirmedAt)}
                        {item.referenceNumber ? ` · Ref: ${item.referenceNumber}` : ""}
                        {item.reversedAt ? ` · Reversed: ${date(item.reversedAt)}` : ""}
                      </p>
                      {item.reversalReason && (
                        <p className="mt-1 rounded bg-white px-2 py-1 text-[10px] italic text-slate-700 border border-slate-100">
                          Reason: "{item.reversalReason}"
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </details>
            )}
          </>
        )}
      </section>

      {reversalTarget && summary && (
        <SettlementReversalDialog
          item={reversalTarget}
          targetContext={{
            targetType,
            targetId,
            targetLabel,
            currency: summary.currency,
            settlementBasis: summary.settlementBasis,
            currentReconciledPaid: summary.reconciledCashPaid,
            currentOutstanding: summary.outstanding,
          }}
          loading={reversing}
          error={reversalError}
          reason={reversalReason}
          onReasonChange={setReversalReason}
          onConfirm={() => void confirmReversal()}
          onClose={closeReversalDialog}
        />
      )}
    </>
  );
};

function Metric({ label, value, emphasis = false }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <div className={`rounded-lg border p-3 ${emphasis ? "border-amber-200 bg-amber-50" : "border-slate-100 bg-slate-50"}`}>
      <p className="text-[10px] font-semibold text-slate-500">{label}</p>
      <p className={`mt-1 text-sm font-black tabular-nums ${emphasis ? "text-amber-900" : "text-slate-900"}`}>{value}</p>
    </div>
  );
}

export default FinancialSettlementCard;