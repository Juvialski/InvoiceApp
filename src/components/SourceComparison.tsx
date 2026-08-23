import React, { useEffect, useMemo, useState } from "react";
import { Bot, Clock3, ExternalLink, FileText, Mail, Paperclip, ShieldCheck, ZoomIn, ZoomOut } from "lucide-react";
import { InvoiceData, ReviewEvent } from "../types";
import { loadEmailSource, loadReviewEvents } from "../lib/persistence";
import { isSupabaseConfigured } from "../lib/supabase";
import { formatDateTime, formatMoney } from "../config/regional";

type SourceTab = "document" | "email" | "compare" | "history";

interface SourceComparisonProps {
  invoice: InvoiceData;
  onRevertField?: (path: string) => void;
  mode?: "full" | "source";
}

function shortValue(value: unknown) {
  if (value === undefined || value === null || value === "") return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function valueAt(value: any, path: string) {
  return path.split(".").reduce((current, key) => current?.[key], value);
}

export const SourceComparison: React.FC<SourceComparisonProps> = ({ invoice, onRevertField, mode = "full" }) => {
  const [tab, setTab] = useState<SourceTab>("document");
  const [email, setEmail] = useState<Awaited<ReturnType<typeof loadEmailSource>>>(null);
  const [events, setEvents] = useState<ReviewEvent[]>([]);
  const [zoom, setZoom] = useState(1);
  const ai = invoice.aiSnapshot;
  const sourcePane = mode === "source";
  const imageSource = Boolean(invoice.fileType?.startsWith("image/") || /\.(png|jpe?g|webp)$/i.test(invoice.fileName || ""));
  const hasEmail = invoice.sourceType === "EMAIL" || Boolean(invoice.sourceEmailId);

  useEffect(() => {
    setTab("document");
    setZoom(1);
  }, [invoice.id, mode]);

  useEffect(() => {
    let cancelled = false;
    if (!isSupabaseConfigured || !invoice.sourceEmailId) {
      setEmail(null);
      return;
    }
    void loadEmailSource(invoice.sourceEmailId).then((value) => { if (!cancelled) setEmail(value); }).catch(() => { if (!cancelled) setEmail(null); });
    return () => { cancelled = true; };
  }, [invoice.sourceEmailId]);

  useEffect(() => {
    let cancelled = false;
    if (!isSupabaseConfigured || !invoice.extractionId || sourcePane) {
      setEvents([]);
      return;
    }
    void loadReviewEvents(invoice.id).then((value) => { if (!cancelled) setEvents(value); }).catch(() => { if (!cancelled) setEvents([]); });
    return () => { cancelled = true; };
  }, [invoice.id, invoice.extractionId, invoice.verifiedAt, invoice.validation?.status, sourcePane]);

  const differences = useMemo(() => {
    if (!ai) return [];
    const pairs: Array<{ path: string; label: string }> = [
      { path: "invoiceNumber", label: "Invoice #" },
      { path: "invoiceDate", label: "Invoice date" },
      { path: "dueDate", label: "Due date" },
      { path: "projectReference", label: "Project / reference" },
      { path: "vendor.name", label: "Vendor" },
      { path: "vendor.taxId", label: "Vendor TIN" },
      { path: "customer.name", label: "Customer" },
      { path: "customer.taxId", label: "Customer TIN" },
      { path: "subtotal", label: "Subtotal" },
      { path: "totalTax", label: "Tax" },
      { path: "grandTotal", label: "Grand total" },
      { path: "balanceDue", label: "Balance due" },
      { path: "philippineTaxDetails.vatableSales", label: "PH VATable Sales" },
      { path: "philippineTaxDetails.vatAmount", label: "PH VAT Amount" },
      { path: "philippineTaxDetails.zeroRatedSales", label: "PH Zero-Rated Sales" },
      { path: "philippineTaxDetails.vatExemptSales", label: "PH VAT-Exempt Sales" },
      { path: "withholdingTaxAmount", label: "Withholding Tax" },
      { path: "category", label: "Category" },
    ];
    return pairs.map(({ path, label }) => ({ path, label, before: valueAt(ai, path), after: valueAt(invoice, path) })).filter(({ before, after }) => JSON.stringify(before ?? null) !== JSON.stringify(after ?? null));
  }, [ai, invoice]);

  const displayValue = (path: string, value: unknown) => {
    const normalizedPath = path.toLowerCase();
    if (typeof value === "number" && (normalizedPath.includes("sales") || normalizedPath.includes("vatamount") || normalizedPath.includes("tax") || ["subtotal", "grandtotal", "balancedue"].includes(normalizedPath))) return formatMoney(value, invoice.currency || "PHP");
    return shortValue(value);
  };

  const tabButton = (value: SourceTab, icon: React.ReactNode, label: string) => <button type="button" onClick={() => setTab(value)} className={`px-3 py-2 rounded-xl text-xs font-bold inline-flex gap-1.5 items-center whitespace-nowrap ${tab === value ? "bg-white shadow-sm text-slate-900" : "text-slate-500 hover:text-slate-800"}`}>{icon}{label}</button>;

  return <div className={`${sourcePane ? "h-full flex flex-col" : "bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden"}`}>
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 p-1.5 shrink-0"><div className="flex overflow-x-auto gap-1">{tabButton("document", <FileText className="w-3.5 h-3.5" />, "Document")}{hasEmail && tabButton("email", <Mail className="w-3.5 h-3.5" />, "Email")}{!sourcePane && tabButton("compare", <Bot className="w-3.5 h-3.5" />, "Original vs current")}{!sourcePane && tabButton("history", <Clock3 className="w-3.5 h-3.5" />, "History")}</div>{tab === "document" && imageSource && invoice.previewUrl && <div className="flex items-center gap-1 pr-1"><button type="button" onClick={() => setZoom((value) => Math.max(0.5, value - 0.25))} className="p-1.5 rounded-lg bg-white border border-slate-200 text-slate-600 hover:text-indigo-700" title="Zoom out"><ZoomOut className="w-3.5 h-3.5" /></button><span className="min-w-12 text-center text-[10px] font-mono text-slate-500">{Math.round(zoom * 100)}%</span><button type="button" onClick={() => setZoom((value) => Math.min(3, value + 0.25))} className="p-1.5 rounded-lg bg-white border border-slate-200 text-slate-600 hover:text-indigo-700" title="Zoom in"><ZoomIn className="w-3.5 h-3.5" /></button><button type="button" onClick={() => setZoom(1)} className="px-2 py-1.5 rounded-lg bg-white border border-slate-200 text-[10px] font-bold text-slate-600 hover:text-indigo-700">Fit</button><button type="button" onClick={() => setZoom(1.5)} className="px-2 py-1.5 rounded-lg bg-white border border-slate-200 text-[10px] font-bold text-slate-600 hover:text-indigo-700">Actual size</button></div>}</div>

    {tab === "document" && <div className={`${sourcePane ? "flex-1 min-h-0 p-3" : "p-4"}`}>
      {!invoice.previewUrl ? <div className={`${sourcePane ? "h-full" : "p-10"} rounded-xl border border-dashed border-slate-300 text-center text-xs text-slate-500 flex items-center justify-center`}>Original source is unavailable for this older invoice. The extracted editor remains usable.</div> : imageSource ? <div className="h-full min-h-0 overflow-auto rounded-xl border border-slate-200 bg-slate-100 p-3"><div className="flex min-h-full items-start justify-center" style={{ width: zoom === 1 ? "100%" : `${zoom * 100}%` }}><img src={invoice.previewUrl} alt={invoice.fileName || "Original invoice"} className="max-w-none rounded-lg border border-slate-200 bg-white object-contain shadow-sm" style={{ width: zoom === 1 ? "100%" : "100%" }} /></div></div> : <div className="h-full min-h-0 flex flex-col gap-2"><div className="flex items-center justify-end"><a href={invoice.previewUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[10px] font-bold text-indigo-700 hover:text-indigo-900"><ExternalLink className="w-3.5 h-3.5" />Open original</a></div><iframe title="Original invoice document" src={invoice.previewUrl} className={`w-full flex-1 min-h-[440px] ${sourcePane ? "h-full" : "h-[560px]"} rounded-xl border border-slate-200 bg-slate-50`} /></div>}
    </div>}

    {tab === "email" && <div className={`${sourcePane ? "flex-1 min-h-0 overflow-auto" : "p-5"} space-y-4 text-xs`}>
      {hasEmail ? <><div className="grid sm:grid-cols-2 gap-3"><div><p className="text-[9px] font-black uppercase text-slate-400">From</p><p className="font-semibold mt-1">{email?.sender || invoice.sourceMetadata?.sender || "—"}</p></div><div><p className="text-[9px] font-black uppercase text-slate-400">To</p><p className="font-semibold mt-1">{email?.recipients?.join(", ") || "—"}</p></div><div><p className="text-[9px] font-black uppercase text-slate-400">Received</p><p className="font-semibold mt-1">{formatDateTime(email?.receivedAt || invoice.sourceMetadata?.receivedAt)}</p></div><div><p className="text-[9px] font-black uppercase text-slate-400">Attachments</p><p className="font-semibold mt-1">{email?.attachments?.length || email?.attachmentCount || (invoice.sourceMetadata?.attachmentName ? 1 : 0)}</p></div></div><div><p className="text-[9px] font-black uppercase text-slate-400">Subject</p><p className="font-semibold mt-1">{email?.subject || invoice.sourceMetadata?.subject || "—"}</p></div>{email?.attachments?.length ? <div><p className="text-[9px] font-black uppercase text-slate-400 mb-1.5">Preserved attachments</p><div className="space-y-1.5">{email.attachments.map((attachment) => <div key={attachment.id} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2"><Paperclip className="w-3.5 h-3.5 text-slate-400" /><span className="truncate">{attachment.filename}</span></div>)}</div></div> : null}{email?.bodyText ? <div><p className="text-[9px] font-black uppercase text-slate-400 mb-1.5">Original email body</p><div className="whitespace-pre-wrap rounded-xl bg-slate-50 border border-slate-200 p-4 text-[11px] leading-relaxed max-h-80 overflow-auto">{email.bodyText}</div></div> : <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-[10px] text-slate-500">The preserved email body will appear here when the workspace is connected.</div>}{email?.rawSignedUrl && <a href={email.rawSignedUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-[10px] font-bold text-indigo-700 hover:text-indigo-900"><ExternalLink className="w-3.5 h-3.5" />Open preserved raw email (.eml)</a>}</> : <div className="p-4 rounded-xl border border-dashed border-slate-300 text-slate-500">This invoice has no preserved email source.</div>}
    </div>}

    {!sourcePane && tab === "compare" && <div className="p-5">{!ai ? <div className="text-xs text-slate-500">No original AI snapshot is attached to this older/local record. New extractions store one automatically.</div> : differences.length === 0 ? <div className="flex items-center gap-2 p-4 rounded-xl bg-emerald-50 text-emerald-800 text-xs font-semibold"><ShieldCheck className="w-4 h-4" />No changes from the original AI extraction yet.</div> : <div className="overflow-x-auto"><table className="w-full text-xs"><thead><tr className="text-left text-[9px] uppercase text-slate-400"><th className="py-2 pr-3">Field</th><th className="py-2 pr-3">Original AI value</th><th className="py-2 pr-3">Current value</th><th className="py-2">Action</th></tr></thead><tbody>{differences.map(({ path, label, before, after }) => <tr key={path} className="border-t border-slate-100"><td className="py-2.5 pr-3 font-bold">{label}</td><td className="py-2.5 pr-3 text-rose-700 break-all">{displayValue(path, before)}</td><td className="py-2.5 pr-3 text-emerald-700 break-all">{displayValue(path, after)}</td><td className="py-2.5 text-right">{onRevertField && <button onClick={() => onRevertField(path)} className="px-2 py-1 rounded-lg border border-slate-200 bg-white text-[10px] font-bold text-slate-700 hover:bg-slate-50">Revert to original</button>}</td></tr>)}</tbody></table></div>}</div>}

    {!sourcePane && tab === "history" && <div className="p-5">{events.length === 0 ? <p className="text-xs text-slate-500">No persisted review events are available for this record yet.</p> : <div className="space-y-2">{events.map((event) => <div key={event.id} className="rounded-xl border border-slate-200 p-3 flex items-start gap-3"><Clock3 className="w-4 h-4 text-slate-400 mt-0.5" /><div><p className="text-xs font-black">{event.eventType.replace(/_/g, " ")}</p><p className="text-[10px] text-slate-500 mt-0.5">{formatDateTime(event.createdAt)}{event.fieldName ? ` • ${event.fieldName}` : ""}</p></div></div>)}</div>}</div>}
  </div>;
};
