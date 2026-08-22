import React, { useEffect, useMemo, useState } from "react";
import { Bot, Clock3, ExternalLink, FileText, Mail, ShieldCheck } from "lucide-react";
import { InvoiceData, ReviewEvent } from "../types";
import { loadEmailSource, loadReviewEvents } from "../lib/persistence";
import { isSupabaseConfigured } from "../lib/supabase";

interface SourceComparisonProps {
  invoice: InvoiceData;
}

function shortValue(value: unknown) {
  if (value === undefined || value === null || value === "") return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export const SourceComparison: React.FC<SourceComparisonProps> = ({ invoice }) => {
  const [tab, setTab] = useState<"document" | "email" | "compare" | "history">("document");
  const [email, setEmail] = useState<Awaited<ReturnType<typeof loadEmailSource>>>(null);
  const [events, setEvents] = useState<ReviewEvent[]>([]);
  const ai = invoice.aiSnapshot;

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
    if (!isSupabaseConfigured || !invoice.extractionId) {
      setEvents([]);
      return;
    }
    void loadReviewEvents(invoice.id).then((value) => { if (!cancelled) setEvents(value); }).catch(() => { if (!cancelled) setEvents([]); });
    return () => { cancelled = true; };
  }, [invoice.id, invoice.extractionId, invoice.verifiedAt]);

  const differences = useMemo(() => {
    if (!ai) return [];
    const pairs: Array<[string, unknown, unknown]> = [
      ["Invoice #", ai.invoiceNumber, invoice.invoiceNumber],
      ["Invoice date", ai.invoiceDate, invoice.invoiceDate],
      ["Due date", ai.dueDate, invoice.dueDate],
      ["Vendor", ai.vendor?.name, invoice.vendor?.name],
      ["Customer", ai.customer?.name, invoice.customer?.name],
      ["Subtotal", ai.subtotal, invoice.subtotal],
      ["Tax", ai.totalTax, invoice.totalTax],
      ["Grand total", ai.grandTotal, invoice.grandTotal],
      ["Balance due", ai.balanceDue, invoice.balanceDue],
      ["Category", ai.category, invoice.category],
    ];
    return pairs.filter(([, before, after]) => JSON.stringify(before ?? null) !== JSON.stringify(after ?? null));
  }, [ai, invoice]);

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
      <div className="flex overflow-x-auto border-b border-slate-200 bg-slate-50 p-1.5 gap-1">
        <button onClick={() => setTab("document")} className={`px-3 py-2 rounded-xl text-xs font-bold inline-flex gap-1.5 items-center ${tab === "document" ? "bg-white shadow-sm text-slate-900" : "text-slate-500"}`}><FileText className="w-3.5 h-3.5" />Original document</button>
        <button onClick={() => setTab("email")} className={`px-3 py-2 rounded-xl text-xs font-bold inline-flex gap-1.5 items-center ${tab === "email" ? "bg-white shadow-sm text-slate-900" : "text-slate-500"}`}><Mail className="w-3.5 h-3.5" />Source email</button>
        <button onClick={() => setTab("compare")} className={`px-3 py-2 rounded-xl text-xs font-bold inline-flex gap-1.5 items-center ${tab === "compare" ? "bg-white shadow-sm text-slate-900" : "text-slate-500"}`}><Bot className="w-3.5 h-3.5" />AI vs human</button>
        <button onClick={() => setTab("history")} className={`px-3 py-2 rounded-xl text-xs font-bold inline-flex gap-1.5 items-center ${tab === "history" ? "bg-white shadow-sm text-slate-900" : "text-slate-500"}`}><Clock3 className="w-3.5 h-3.5" />Review history</button>
      </div>

      {tab === "document" && <div className="p-4">
        {invoice.previewUrl ? (invoice.fileType?.startsWith("image/") || /\.(png|jpe?g|webp)$/i.test(invoice.fileName || "") ? <img src={invoice.previewUrl} alt={invoice.fileName || "Original invoice"} className="max-h-[560px] mx-auto rounded-xl border border-slate-200 object-contain" /> : <iframe title="Original invoice document" src={invoice.previewUrl} className="w-full h-[560px] rounded-xl border border-slate-200 bg-slate-50" />) : <div className="p-10 rounded-xl border border-dashed border-slate-300 text-center text-xs text-slate-500">No stored file preview is available for this older/local record. New Supabase-backed uploads and Gmail imports preserve the original PDF/image here.</div>}
        {invoice.sourceStoragePath && <p className="text-[10px] text-slate-400 mt-2 font-mono truncate">Supabase Storage: {invoice.sourceStoragePath}</p>}
      </div>}

      {tab === "email" && <div className="p-5 space-y-4 text-xs">
        {invoice.sourceType === "EMAIL" ? <>
          <div className="grid sm:grid-cols-2 gap-3"><div><p className="text-[9px] font-black uppercase text-slate-400">From</p><p className="font-semibold mt-1">{email?.sender || invoice.sourceMetadata?.sender || "—"}</p></div><div><p className="text-[9px] font-black uppercase text-slate-400">Received</p><p className="font-semibold mt-1">{(email?.receivedAt || invoice.sourceMetadata?.receivedAt) ? new Date(email?.receivedAt || invoice.sourceMetadata?.receivedAt || "").toLocaleString() : "—"}</p></div></div>
          <div><p className="text-[9px] font-black uppercase text-slate-400">Subject</p><p className="font-semibold mt-1">{email?.subject || invoice.sourceMetadata?.subject || "—"}</p></div>
          {email?.bodyText ? <div><p className="text-[9px] font-black uppercase text-slate-400 mb-1.5">Original email body</p><div className="whitespace-pre-wrap rounded-xl bg-slate-50 border border-slate-200 p-4 text-[11px] leading-relaxed max-h-80 overflow-auto">{email.bodyText}</div></div> : <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-[10px] text-slate-500">The complete searchable email body is stored in Supabase for Gmail imports and loads here when the workspace is connected.</div>}
          {email?.rawSignedUrl && <a href={email.rawSignedUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-[10px] font-bold text-indigo-700 hover:text-indigo-900"><ExternalLink className="w-3.5 h-3.5" />Open preserved raw email (.eml)</a>}
        </> : <div className="text-slate-500">This invoice was not imported from Gmail.</div>}
      </div>}

      {tab === "compare" && <div className="p-5">
        {!ai ? <div className="text-xs text-slate-500">No immutable AI snapshot is attached to this older/local record. New Supabase extractions store one automatically.</div> : differences.length === 0 ? <div className="flex items-center gap-2 p-4 rounded-xl bg-emerald-50 text-emerald-800 text-xs font-semibold"><ShieldCheck className="w-4 h-4" />No human changes from the original Gemini extraction yet.</div> : <div className="overflow-x-auto"><table className="w-full text-xs"><thead><tr className="text-left text-[9px] uppercase text-slate-400"><th className="py-2 pr-3">Field</th><th className="py-2 pr-3">Gemini originally extracted</th><th className="py-2">Current human-editable value</th></tr></thead><tbody>{differences.map(([field, before, after]) => <tr key={field} className="border-t border-slate-100"><td className="py-2.5 pr-3 font-bold">{field}</td><td className="py-2.5 pr-3 text-rose-700 break-all">{shortValue(before)}</td><td className="py-2.5 text-emerald-700 break-all">{shortValue(after)}</td></tr>)}</tbody></table></div>}
      </div>}

      {tab === "history" && <div className="p-5">
        {events.length === 0 ? <p className="text-xs text-slate-500">No persisted review events are available for this record yet.</p> : <div className="space-y-2">{events.map((event) => <div key={event.id} className="rounded-xl border border-slate-200 p-3 flex items-start gap-3"><Clock3 className="w-4 h-4 text-slate-400 mt-0.5" /><div><p className="text-xs font-black">{event.eventType.replace(/_/g, " ")}</p><p className="text-[10px] text-slate-500 mt-0.5">{new Date(event.createdAt).toLocaleString()}</p></div></div>)}</div>}
      </div>}
    </div>
  );
};
