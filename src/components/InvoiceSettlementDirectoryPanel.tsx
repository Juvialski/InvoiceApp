import React, { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock3, Landmark, WalletCards } from "lucide-react";
import type { InvoiceData } from "../types.ts";
import { deriveInvoiceSettlementSummary, type FinancialSettlementSummary } from "../lib/financialSettlement.ts";
import { loadFinancialSettlementSummary } from "../lib/financialSettlementPersistence.ts";
import { demoSettlementSummaryForTarget } from "../demo/data/settlements.ts";
import { appPathForInvoice } from "../utils/appRouting.ts";
import type { AppNavigate } from "../utils/clientNavigation.ts";
import { safeErrorMessage } from "../utils/errorNormalization.ts";
import { isVoidedInvoice } from "../utils/projectCosting.ts";

interface Props {
  invoices: readonly InvoiceData[];
  maxRows?: number;
  onNavigatePath?: AppNavigate;
}

function money(value: number, currency: string) {
  try { return new Intl.NumberFormat("en-PH", { style: "currency", currency, maximumFractionDigits: 2 }).format(value || 0); }
  catch { return `${currency} ${(value || 0).toFixed(2)}`; }
}

function localSummary(invoice: InvoiceData) {
  const demo = invoice.id.startsWith("demo-") ? demoSettlementSummaryForTarget("INVOICE", invoice.id) : null;
  return demo || deriveInvoiceSettlementSummary(invoice, []);
}

function tone(state: FinancialSettlementSummary["settlementState"]) {
  if (state === "PAID") return "bg-emerald-50 text-emerald-700";
  if (state === "OVERDUE") return "bg-rose-50 text-rose-700";
  if (state === "PARTIALLY_PAID") return "bg-amber-50 text-amber-800";
  return "bg-slate-100 text-slate-600";
}

export const InvoiceSettlementDirectoryPanel: React.FC<Props> = ({ invoices, maxRows = 8, onNavigatePath }) => {
  const eligible = useMemo(() => invoices.filter((invoice) => invoice.reviewStatus === "VERIFIED" && !isVoidedInvoice(invoice)), [invoices]);
  const [summaries, setSummaries] = useState<Map<string, FinancialSettlementSummary>>(() => new Map(eligible.map((invoice) => [invoice.id, localSummary(invoice)])));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setSummaries(new Map(eligible.map((invoice) => [invoice.id, localSummary(invoice)])));
    const remote = eligible.filter((invoice) => !invoice.id.startsWith("demo-") && !invoice.id.startsWith("local-")).slice(0, 50);
    if (!remote.length) return () => { cancelled = true; };
    setLoading(true);
    setError("");
    Promise.all(remote.map(async (invoice) => {
      try { return [invoice.id, await loadFinancialSettlementSummary("INVOICE", invoice.id)] as const; }
      catch { return [invoice.id, null] as const; }
    })).then((rows) => {
      if (cancelled) return;
      setSummaries((current) => {
        const next = new Map(current);
        for (const [id, summary] of rows) if (summary) next.set(id, summary);
        return next;
      });
      if (rows.some(([, summary]) => !summary)) setError("Some settlement summaries could not be refreshed; local document evidence is shown for those invoices.");
    }).catch((cause) => { if (!cancelled) setError(safeErrorMessage(cause, "Settlement summaries could not be refreshed.")); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [eligible]);

  const rows = eligible.map((invoice) => ({ invoice, summary: summaries.get(invoice.id) || localSummary(invoice) }));
  const open = rows.filter(({ summary }) => summary.outstanding > 0.005);
  const paid = rows.filter(({ summary }) => summary.settlementState === "PAID").length;
  const partial = rows.filter(({ summary }) => summary.settlementState === "PARTIALLY_PAID").length;
  const overdue = rows.filter(({ summary }) => summary.settlementState === "OVERDUE").length;
  const visible = [...open].sort((a, b) => {
    const overdueOrder = Number(b.summary.settlementState === "OVERDUE") - Number(a.summary.settlementState === "OVERDUE");
    return overdueOrder || (a.invoice.dueDate || "9999-12-31").localeCompare(b.invoice.dueDate || "9999-12-31");
  }).slice(0, maxRows);

  return <section className="rounded-xl border border-slate-200 bg-white p-4" aria-label="Supplier invoice settlement overview">
    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
      <div><p className="text-[10px] font-black uppercase tracking-[0.14em] text-indigo-600">Authoritative cash settlement</p><h2 className="mt-1 text-sm font-black text-slate-950">Supplier payment overview</h2><p className="mt-1 max-w-3xl text-[11px] text-slate-500">Bank reconciliation is shown separately from extracted document payment fields. Paying an invoice changes paid/payable evidence only; verified project cost does not change.</p></div>
      {loading && <span className="text-[10px] font-semibold text-slate-400">Refreshing bank evidence…</span>}
    </div>
    {error && <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[10px] text-amber-900"><AlertTriangle className="mr-1 inline h-3 w-3" />{error}</p>}
    <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
      <Metric icon={Clock3} label="Outstanding" value={String(open.length)} />
      <Metric icon={CheckCircle2} label="Paid" value={String(paid)} />
      <Metric icon={WalletCards} label="Partial" value={String(partial)} />
      <Metric icon={AlertTriangle} label="Overdue" value={String(overdue)} warning={overdue > 0} />
    </div>
    {visible.length > 0 ? <div className="mt-4 grid gap-2 lg:grid-cols-2">{visible.map(({ invoice, summary }) => <a key={invoice.id} href={appPathForInvoice(invoice.id)} onClick={(event) => { if (!onNavigatePath) return; event.preventDefault(); onNavigatePath(appPathForInvoice(invoice.id)); }} className="min-w-0 rounded-lg border border-slate-100 bg-slate-50 p-3 transition hover:border-indigo-200 hover:bg-indigo-50/40">
      <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-xs font-black text-slate-900">{invoice.invoiceNumber || "Supplier invoice"} · {invoice.vendor?.name || "Supplier"}</p><p className="mt-1 text-[10px] text-slate-500">Payable {money(summary.settlementBasis, summary.currency)} · confirmed cash {money(summary.reconciledCashPaid, summary.currency)}</p></div><span className={`shrink-0 rounded-full px-2 py-1 text-[9px] font-black ${tone(summary.settlementState)}`}>{String(summary.settlementState).replaceAll("_", " ")}</span></div>
      <div className="mt-2 flex items-center justify-between gap-3"><span className="text-[10px] text-slate-500">Due {invoice.dueDate || "not recorded"}</span><strong className="text-[10px] tabular-nums text-slate-800">{money(summary.outstanding, summary.currency)} outstanding</strong></div>
    </a>)}</div> : <p className="mt-4 rounded-lg border border-dashed border-slate-200 p-4 text-center text-xs text-slate-500">No verified supplier invoice currently has an outstanding settlement balance.</p>}
  </section>;
};

function Metric({ icon: Icon, label, value, warning = false }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string; warning?: boolean }) {
  return <div className={`rounded-lg border p-3 ${warning ? "border-rose-200 bg-rose-50" : "border-slate-100 bg-slate-50"}`}><p className={`flex items-center gap-1 text-[10px] font-semibold ${warning ? "text-rose-700" : "text-slate-500"}`}><Icon className="h-3 w-3" />{label}</p><p className={`mt-1 text-lg font-black ${warning ? "text-rose-900" : "text-slate-900"}`}>{value}</p></div>;
}

export default InvoiceSettlementDirectoryPanel;
