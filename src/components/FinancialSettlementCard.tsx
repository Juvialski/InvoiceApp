import React, { useEffect, useMemo, useState } from "react";
import { ArrowRight, Landmark, RotateCcw, ShieldCheck, WalletCards } from "lucide-react";
import type { FinancialSettlementSummary, SettlementTargetType } from "../lib/financialSettlement.ts";
import { loadFinancialSettlementSummary, reverseFinancialSettlement } from "../lib/financialSettlementPersistence.ts";
import { demoSettlementSummaryForTarget } from "../demo/data/settlements.ts";
import { appPathForCashTransaction } from "../utils/appRouting.ts";
import { safeErrorMessage } from "../utils/errorNormalization.ts";

export interface FinancialSettlementCardProps {
  targetType: Extract<SettlementTargetType, "INVOICE" | "PAYROLL">;
  targetId: string;
  title?: string;
  compact?: boolean;
  canReverse?: boolean;
  fallbackSummary?: FinancialSettlementSummary | null;
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

export const FinancialSettlementCard: React.FC<FinancialSettlementCardProps> = ({ targetType, targetId, title, compact = false, canReverse = true, fallbackSummary }) => {
  const demoSummary = useMemo(() => targetId.startsWith("demo-") ? demoSettlementSummaryForTarget(targetType, targetId) : null, [targetId, targetType]);
  const [summary, setSummary] = useState<FinancialSettlementSummary | null>(fallbackSummary || demoSummary);
  const [loading, setLoading] = useState(!fallbackSummary && !demoSummary);
  const [error, setError] = useState("");
  const [reversingId, setReversingId] = useState<string | null>(null);
  const [reversalReason, setReversalReason] = useState("");

  const refresh = async () => {
    if (targetId.startsWith("demo-")) {
      setSummary(fallbackSummary || demoSummary);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try { setSummary(await loadFinancialSettlementSummary(targetType, targetId)); }
    catch (cause) { setError(safeErrorMessage(cause, "Settlement details could not be loaded.")); }
    finally { setLoading(false); }
  };

  useEffect(() => { void refresh(); }, [targetId, targetType]);

  const reverse = async (matchId: string) => {
    if (targetId.startsWith("demo-")) { setError("Demo settlement history is deterministic. Reset Demo restores the original fixtures."); return; }
    if (reversalReason.trim().length < 3) { setError("Enter a short reason before reversing this payment link."); return; }
    setReversingId(matchId);
    setError("");
    try {
      await reverseFinancialSettlement(matchId, reversalReason.trim());
      setReversalReason("");
      await refresh();
    } catch (cause) { setError(safeErrorMessage(cause, "The settlement could not be reversed.")); }
    finally { setReversingId(null); }
  };

  if (loading) return <section className="rounded-xl border border-slate-200 bg-white p-4 text-xs text-slate-500">Loading settlement evidence…</section>;
  if (!summary && !error) return null;

  const active = summary?.history.filter((item) => item.status === "CONFIRMED") || [];
  const reversed = summary?.history.filter((item) => item.status === "REVERSED") || [];
  return <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm" aria-label={`${targetType.toLowerCase()} settlement`}>
    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
      <div><p className="text-[10px] font-black uppercase tracking-[0.14em] text-indigo-600">Payment / settlement</p><h3 className="mt-1 text-sm font-black text-slate-950">{title || (targetType === "PAYROLL" ? "Disbursement evidence" : "Supplier payment evidence")}</h3><p className="mt-1 text-[10px] text-slate-500">Cash evidence only. Project cost and payroll cost are not recreated here.</p></div>
      {summary && <span className={`w-fit rounded-full border px-2.5 py-1 text-[10px] font-black ${stateTone(summary.settlementState)}`}>{String(summary.settlementState).replaceAll("_", " ")}</span>}
    </div>
    {error && <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[10px] font-semibold text-rose-800">{error}</div>}
    {summary && <>
      <div className={`mt-4 grid gap-2 ${compact ? "sm:grid-cols-3" : "sm:grid-cols-3"}`}>
        <Metric label={targetType === "PAYROLL" ? "Expected employee net pay" : summary.basisSource === "EXPLICIT_NET_PAYABLE" ? "Invoice net payable" : "Invoice payable"} value={money(summary.settlementBasis, summary.currency)} />
        <Metric label={targetType === "PAYROLL" ? "Confirmed disbursement" : "Confirmed bank payments"} value={money(summary.reconciledCashPaid, summary.currency)} />
        <Metric label="Outstanding" value={money(summary.outstanding, summary.currency)} emphasis={summary.outstanding > 0.005} />
      </div>
      {targetType === "INVOICE" && summary.documentReportedPaid > 0 && <div className="mt-3 rounded-lg border border-sky-100 bg-sky-50 px-3 py-2 text-[10px] text-sky-800"><ShieldCheck className="mr-1 inline h-3 w-3" />Document-reported paid: <strong>{money(summary.documentReportedPaid, summary.currency)}</strong>. It is shown separately and is not added to confirmed bank payments.</div>}
      {summary.legacyPaidWithoutBankLink && <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[10px] text-slate-700">Paid lifecycle status exists, but no bank reconciliation is linked. Historical status is preserved.</div>}
      <div className="mt-4 space-y-2">
        {active.length ? active.map((item) => <div key={item.id} className="rounded-lg border border-slate-100 bg-slate-50 p-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><p className="flex items-center gap-1.5 truncate text-[10px] font-black text-slate-800"><Landmark className="h-3 w-3" />{item.accountName || "Financial account"} {item.maskedIdentifier ? `· ${item.maskedIdentifier}` : ""}</p><p className="mt-1 break-words text-[10px] text-slate-500">{date(item.transactionDate || item.confirmedAt)} · {item.referenceNumber || "No bank reference"}</p></div><p className="shrink-0 text-xs font-black tabular-nums text-slate-900">{money(item.amount, summary.currency)}</p></div>
          <div className="mt-2 flex flex-wrap items-center gap-3"><a href={appPathForCashTransaction(item.transactionId, targetType, targetId)} className="inline-flex items-center gap-1 text-[10px] font-black text-indigo-700 hover:underline"><WalletCards className="h-3 w-3" /> View payment in Cash & Banking <ArrowRight className="h-3 w-3" /></a>{canReverse && <button type="button" onClick={() => setReversingId(reversingId === item.id ? null : item.id)} className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-700"><RotateCcw className="h-3 w-3" /> Reverse link</button>}</div>
          {canReverse && reversingId === item.id && <div className="mt-2 flex flex-col gap-2 sm:flex-row"><input value={reversalReason} onChange={(event) => setReversalReason(event.target.value)} placeholder="Reason for reversal" className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-indigo-400" /><button type="button" disabled={reversalReason.trim().length < 3} onClick={() => void reverse(item.id)} className="rounded-lg bg-rose-600 px-3 py-2 text-[10px] font-black text-white disabled:opacity-50">Confirm reversal</button></div>}
        </div>) : <p className="rounded-lg border border-dashed border-slate-200 p-3 text-[10px] text-slate-500">No confirmed bank payment is linked yet.</p>}
      </div>
      {reversed.length > 0 && <details className="mt-3"><summary className="cursor-pointer text-[10px] font-bold text-slate-500">Reversed settlement history ({reversed.length})</summary><div className="mt-2 space-y-1">{reversed.map((item) => <p key={item.id} className="rounded-lg bg-slate-50 px-3 py-2 text-[10px] text-slate-500"><s>{money(item.amount, summary.currency)} · {item.referenceNumber || item.transactionId}</s>{item.reversalReason ? ` · ${item.reversalReason}` : ""}</p>)}</div></details>}
    </>}
  </section>;
};

function Metric({ label, value, emphasis = false }: { label: string; value: string; emphasis?: boolean }) {
  return <div className={`rounded-lg border p-3 ${emphasis ? "border-amber-200 bg-amber-50" : "border-slate-100 bg-slate-50"}`}><p className="text-[10px] font-semibold text-slate-500">{label}</p><p className={`mt-1 text-sm font-black tabular-nums ${emphasis ? "text-amber-900" : "text-slate-900"}`}>{value}</p></div>;
}

export default FinancialSettlementCard;
