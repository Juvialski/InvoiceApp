import React, { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ChevronRight, Clock3, FileText, MessageSquareText, Plus, Search, X } from "lucide-react";
import type { Project } from "../../types.ts";
import { appPathForProject } from "../../utils/appRouting.ts";
import { useEngineeringDocumentsController } from "../../features/engineering/useEngineeringDocumentsController.ts";
import { useEngineeringCoordinationController } from "../../features/engineering/useEngineeringCoordinationController.ts";
import type { DisciplineType } from "../../lib/engineeringDocuments.ts";
import type { EngineeringRfi, RfiPriority, RfiStatus } from "../../lib/engineeringCoordination.ts";
import type { EngineeringLifecycleAction, EngineeringLifecyclePreview } from "../../lib/engineeringLifecycle.ts";
import { CoordinationRevisionPicker } from "./CoordinationRevisionPicker.tsx";
import { EngineeringLifecycleDialog } from "./EngineeringLifecycleDialog.tsx";

const DISCIPLINES: DisciplineType[] = ["ARCHITECTURAL", "STRUCTURAL", "CIVIL", "MECHANICAL", "ELECTRICAL", "PLUMBING", "FIRE_PROTECTION", "GEOTECHNICAL", "GENERAL_ENGINEERING", "OTHER"];
const STATUSES: RfiStatus[] = ["DRAFT", "OPEN", "ANSWERED", "CLOSED", "VOID"];
const PRIORITIES: RfiPriority[] = ["LOW", "NORMAL", "HIGH", "URGENT"];

const statusClass: Record<RfiStatus, string> = {
  DRAFT: "border-slate-200 bg-slate-50 text-slate-700",
  OPEN: "border-amber-200 bg-amber-50 text-amber-800",
  ANSWERED: "border-blue-200 bg-blue-50 text-blue-800",
  CLOSED: "border-emerald-200 bg-emerald-50 text-emerald-800",
  VOID: "border-rose-200 bg-rose-50 text-rose-700",
};

const fieldClass = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100";
const labelClass = "mb-1.5 block text-[11px] font-black uppercase tracking-[0.12em] text-slate-500";

function dueLabel(rfi: EngineeringRfi, today: string) {
  if (!rfi.dueDate) return null;
  if (rfi.status === "OPEN" && rfi.dueDate < today) return { text: `Overdue · ${rfi.dueDate}`, className: "text-rose-700" };
  return { text: `Due ${rfi.dueDate}`, className: "text-slate-500" };
}

function statusLabel(value: string) { return value.replaceAll("_", " "); }

export const ProjectRfis: React.FC<{
  project: Project;
  companyId?: string;
  initialRfiId?: string;
  canRead?: boolean;
  canCreate?: boolean;
  canRespond?: boolean;
  canManage?: boolean;
  canReadDocuments?: boolean;
  guestMode?: boolean;
}> = ({ project, companyId, initialRfiId, canRead = true, canCreate = true, canRespond = true, canManage = true, canReadDocuments = true, guestMode = false }) => {
  const controller = useEngineeringCoordinationController({ project, companyId, canRead, canManage, guestMode });
  const documents = useEngineeringDocumentsController({ project, companyId, canRead: canReadDocuments, guestMode });
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<RfiStatus | "ALL">("ALL");
  const [discipline, setDiscipline] = useState<DisciplineType | "ALL">("ALL");
  const [priority, setPriority] = useState<RfiPriority | "ALL">("ALL");
  const [selectedId, setSelectedId] = useState<string | undefined>(initialRfiId);
  const [showCreate, setShowCreate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [selectedRevisionIds, setSelectedRevisionIds] = useState<string[]>([]);
  const [form, setForm] = useState({ rfiNumber: "", subject: "", question: "", discipline: "GENERAL_ENGINEERING" as DisciplineType, priority: "NORMAL" as RfiPriority, dateRaised: new Date().toISOString().slice(0, 10), dueDate: "" });
  const [responseText, setResponseText] = useState("");
  const [responseFinal, setResponseFinal] = useState(true);
  const [responseRevisionIds, setResponseRevisionIds] = useState<string[]>([]);
  const [closeReason, setCloseReason] = useState("");
  const [responseType, setResponseType] = useState<"RESPONSE" | "CORRECTION" | "NOTE">("RESPONSE");
  const [lifecyclePreview, setLifecyclePreview] = useState<EngineeringLifecyclePreview | null>(null);
  const today = new Date().toISOString().slice(0, 10);

  useEffect(() => setSelectedId(initialRfiId), [initialRfiId, project.id]);
  const selected = controller.data.rfis.find((item) => item.id === selectedId);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return controller.data.rfis.filter((item) => {
      if (status !== "ALL" && item.status !== status) return false;
      if (discipline !== "ALL" && item.discipline !== discipline) return false;
      if (priority !== "ALL" && item.priority !== priority) return false;
      return !needle || `${item.rfiNumber} ${item.subject} ${item.question}`.toLowerCase().includes(needle);
    });
  }, [controller.data.rfis, discipline, priority, query, status]);

  const refsForIds = (ids: string[]) => ids.map((revisionId) => {
    const revision = documents.revisions.find((item) => item.id === revisionId);
    return revision ? { documentId: revision.documentId, revisionId } : null;
  }).filter((item): item is { documentId: string; revisionId: string } => Boolean(item));

  const selectRfi = (id: string) => {
    setSelectedId(id);
    if (typeof window !== "undefined") window.history.replaceState({}, "", appPathForProject(project.id, "rfis", { rfiId: id }));
  };

  const run = async (operation: () => Promise<unknown>) => {
    setBusy(true); setActionError(null);
    try { await operation(); } catch (error) { setActionError(error instanceof Error ? error.message : "The RFI action could not be completed."); } finally { setBusy(false); }
  };

  const openLifecycleReview = async () => {
    if (!selected || !canManage) return;
    setBusy(true); setActionError(null);
    try { setLifecyclePreview(await controller.previewRfiLifecycle(selected)); } catch (error) { setActionError(error instanceof Error ? error.message : "The RFI lifecycle preview could not be loaded."); } finally { setBusy(false); }
  };

  if (!canRead) return <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm font-semibold text-slate-600">You do not have permission to read project RFIs.</div>;
  if (controller.isLoading) return <div role="status" className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm font-semibold text-slate-600">Loading RFI register…</div>;
  if (controller.loadError) return <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-800"><p className="font-bold">RFI register unavailable</p><p className="mt-1 text-xs">{controller.loadError}</p><button type="button" className="mt-3 rounded-lg bg-white px-3 py-2 text-xs font-bold shadow-sm" onClick={controller.retryLoad}>Retry</button></div>;

  if (selected) {
    const responses = controller.data.rfiResponses.filter((item) => item.rfiId === selected.id);
    const links = controller.data.rfiDocumentLinks.filter((item) => item.rfiId === selected.id && !item.responseId);
    const linkedRows = links.map((link) => ({ link, revision: documents.revisions.find((item) => item.id === link.revisionId), document: documents.documents.find((item) => item.id === link.documentId) }));
    const due = dueLabel(selected, today);
    return (
      <section className="space-y-4" data-phase1b="rfi-detail">
        <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <button type="button" className="text-xs font-bold text-indigo-700 hover:text-indigo-900" onClick={() => { setSelectedId(undefined); if (typeof window !== "undefined") window.history.replaceState({}, "", appPathForProject(project.id, "rfis")); }}>← RFI register</button>
            <div className="mt-2 flex flex-wrap items-center gap-2"><span className="text-sm font-black text-slate-900">{selected.rfiNumber}</span><span className={`rounded-full border px-2 py-1 text-[10px] font-black ${statusClass[selected.status]}`}>{statusLabel(selected.status)}</span><span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-600">{statusLabel(selected.discipline)}</span><span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-600">{selected.priority}</span></div>
            <h2 className="mt-2 truncate text-lg font-black text-slate-950">{selected.subject}</h2>
            {due && <p className={`mt-1 text-xs font-bold ${due.className}`}><Clock3 className="mr-1 inline h-3.5 w-3.5" />{due.text}</p>}
          </div>
          <div className="flex flex-wrap gap-2">
            {selected.status === "DRAFT" && canCreate && <button type="button" disabled={busy} onClick={() => run(() => controller.openRfi(selected))} className="rounded-xl bg-indigo-600 px-4 py-2 text-xs font-black text-white disabled:opacity-50">Open RFI</button>}
            {selected.status === "ANSWERED" && canManage && <button type="button" disabled={busy} onClick={() => run(() => controller.closeRfi(selected, closeReason))} className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-black text-white disabled:opacity-50">Close RFI</button>}
            {canManage && !["CLOSED", "VOID"].includes(selected.status) && <button type="button" disabled={busy} onClick={() => void openLifecycleReview()} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-black text-slate-700 hover:bg-slate-50 disabled:opacity-50">Review lifecycle</button>}
          </div>
        </div>

        {actionError && <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-800">{actionError}</div>}

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,.85fr)]">
          <div className="space-y-4">
            <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Formal question</p>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-800">{selected.question}</p>
              <dl className="mt-5 grid grid-cols-2 gap-3 border-t border-slate-100 pt-4 text-xs md:grid-cols-4">
                <div><dt className="font-bold text-slate-400">Raised</dt><dd className="mt-1 font-bold text-slate-700">{selected.dateRaised}</dd></div>
                <div><dt className="font-bold text-slate-400">Due</dt><dd className="mt-1 font-bold text-slate-700">{selected.dueDate || "—"}</dd></div>
                <div><dt className="font-bold text-slate-400">Opened</dt><dd className="mt-1 font-bold text-slate-700">{selected.openedAt ? new Date(selected.openedAt).toLocaleDateString() : "—"}</dd></div>
                <div><dt className="font-bold text-slate-400">Answered</dt><dd className="mt-1 font-bold text-slate-700">{selected.answeredAt ? new Date(selected.answeredAt).toLocaleDateString() : "—"}</dd></div>
              </dl>
            </article>

            <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Response history</p><h3 className="mt-1 text-sm font-black text-slate-900">Append-only timeline</h3></div><MessageSquareText className="h-5 w-5 text-slate-400" /></div>
              {responses.length ? <ol className="mt-4 space-y-3">{responses.map((response) => {
                const responseLinks = controller.data.rfiDocumentLinks.filter((item) => item.responseId === response.id);
                return <li key={response.id} className="relative rounded-xl border border-slate-200 bg-slate-50 p-4"><div className="flex flex-wrap items-center gap-2"><span className="text-[10px] font-black text-indigo-700">{response.isFinalAnswer ? "FINAL ANSWER" : response.responseType}</span><span className="text-[10px] text-slate-400">{new Date(response.createdAt).toLocaleString()}</span></div><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{response.responseText}</p>{responseLinks.length > 0 && <p className="mt-2 text-[10px] font-bold text-slate-500">{responseLinks.length} immutable revision reference{responseLinks.length === 1 ? "" : "s"}</p>}</li>;
              })}</ol> : <div className="mt-4 rounded-xl border border-dashed border-slate-200 p-6 text-center text-xs text-slate-500">No responses have been recorded.</div>}
            </article>
          </div>

          <aside className="space-y-4">
            <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Referenced revisions</p>
              <div className="mt-3 space-y-2">{linkedRows.length ? linkedRows.map(({ link, document, revision }) => <a key={link.id} href={appPathForProject(project.id, "documents", { docId: link.documentId, revId: link.revisionId })} className="flex items-start gap-3 rounded-xl border border-slate-200 p-3 hover:border-indigo-200 hover:bg-indigo-50"><FileText className="mt-0.5 h-4 w-4 shrink-0 text-indigo-500" /><span className="min-w-0"><span className="block truncate text-xs font-black text-slate-800">{document?.documentNumber || "Engineering document"}</span><span className="mt-0.5 block text-[10px] text-slate-500">Revision {revision?.revisionNumber || link.revisionId}</span></span></a>) : <p className="rounded-xl bg-slate-50 p-4 text-xs text-slate-500">No engineering revisions linked.</p>}</div>
            </article>

            {(selected.status === "OPEN" || selected.status === "ANSWERED") && canRespond && <article className="rounded-2xl border border-indigo-200 bg-indigo-50/40 p-5 shadow-sm"><h3 className="text-sm font-black text-slate-900">{selected.status === "ANSWERED" ? "Add correction or note" : "Add response"}</h3>{selected.status === "ANSWERED" && <select aria-label="Response type" value={responseType} onChange={(e) => { setResponseType(e.target.value as typeof responseType); setResponseFinal(false); }} className={`${fieldClass} mt-3`}><option value="CORRECTION">Correction</option><option value="NOTE">Note</option></select>}<textarea value={responseText} onChange={(e) => setResponseText(e.target.value)} rows={5} className={`${fieldClass} mt-3 resize-y`} placeholder={selected.status === "ANSWERED" ? "Record an append-only correction or note…" : "Record the formal response or clarification…"} /><label className="mt-3 flex items-center gap-2 text-xs font-bold text-slate-700"><input type="checkbox" checked={selected.status === "OPEN" && responseFinal} disabled={selected.status !== "OPEN"} onChange={(e) => setResponseFinal(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-indigo-600" />Mark as final answer</label><div className="mt-4"><CoordinationRevisionPicker documents={documents.projectDocuments} revisions={documents.revisions} selectedRevisionIds={responseRevisionIds} onChange={setResponseRevisionIds} label="Response revision references" /></div><button type="button" disabled={busy || !responseText.trim()} onClick={() => run(async () => { await controller.respondRfi({ rfi: selected, responseText, responseType: selected.status === "ANSWERED" ? responseType : "RESPONSE", isFinalAnswer: selected.status === "OPEN" && responseFinal, references: refsForIds(responseRevisionIds) }); setResponseText(""); setResponseRevisionIds([]); setResponseType("RESPONSE"); })} className="mt-4 w-full rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-black text-white disabled:opacity-50">{selected.status === "ANSWERED" ? "Save correction" : "Save response"}</button></article>}

            {selected.status === "ANSWERED" && canManage && <label className="block rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><span className={labelClass}>Optional close note</span><input className={fieldClass} value={closeReason} onChange={(e) => setCloseReason(e.target.value)} placeholder="Resolution / close note" /></label>}
            {lifecyclePreview && <EngineeringLifecycleDialog entityLabel="RFI" recordLabel={`${selected.rfiNumber} · ${selected.subject}`} preview={lifecyclePreview} actions={[{ action: "DELETE_UNUSED", label: "Delete unused", description: "Permanently remove only an untouched draft with no responses, links, or lifecycle history.", tone: "danger" }, { action: "VOID", label: "Void RFI", description: "Keep the formal record and responses while marking this RFI as invalid history.", requiresReason: true, tone: "danger" }]} busy={busy} error={actionError} onClose={() => setLifecyclePreview(null)} onApply={(action: EngineeringLifecycleAction, reason?: string) => { if (action !== "DELETE_UNUSED" && action !== "VOID") return; void run(async () => { const result = await controller.applyRfiLifecycle(selected, action, reason); setLifecyclePreview(null); if (result.deleted) { setSelectedId(undefined); if (typeof window !== "undefined") window.history.replaceState({}, "", appPathForProject(project.id, "rfis")); } }); }} />}
          </aside>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-4" data-phase1b="rfi-register">
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <div><p className="text-[10px] font-black uppercase tracking-[0.14em] text-indigo-600">Engineering coordination</p><h2 className="mt-1 text-lg font-black text-slate-950">RFI Register</h2><p className="mt-1 text-xs text-slate-500">Formal project questions, answers, due dates, and immutable drawing/specification references.</p></div>
        {canCreate && <button type="button" onClick={() => setShowCreate(true)} className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-black text-white"><Plus className="h-4 w-4" />Create RFI</button>}
      </div>

      <div className="grid gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:grid-cols-2 lg:grid-cols-[minmax(220px,1fr)_160px_180px_140px]">
        <label className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" /><input value={query} onChange={(e) => setQuery(e.target.value)} className={`${fieldClass} pl-9`} placeholder="Search number, subject, question…" /></label>
        <select className={fieldClass} value={status} onChange={(e) => setStatus(e.target.value as RfiStatus | "ALL")}><option value="ALL">All statuses</option>{STATUSES.map((value) => <option key={value} value={value}>{statusLabel(value)}</option>)}</select>
        <select className={fieldClass} value={discipline} onChange={(e) => setDiscipline(e.target.value as DisciplineType | "ALL")}><option value="ALL">All disciplines</option>{DISCIPLINES.map((value) => <option key={value} value={value}>{statusLabel(value)}</option>)}</select>
        <select className={fieldClass} value={priority} onChange={(e) => setPriority(e.target.value as RfiPriority | "ALL")}><option value="ALL">All priorities</option>{PRIORITIES.map((value) => <option key={value} value={value}>{value}</option>)}</select>
      </div>

      {filtered.length ? <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="hidden grid-cols-[120px_minmax(240px,1fr)_140px_110px_130px_30px] gap-3 border-b border-slate-100 bg-slate-50 px-4 py-3 text-[10px] font-black uppercase tracking-[0.1em] text-slate-500 md:grid"><span>RFI</span><span>Subject</span><span>Discipline</span><span>Status</span><span>Due</span><span /></div>{filtered.map((rfi) => { const due = dueLabel(rfi, today); return <button type="button" key={rfi.id} onClick={() => selectRfi(rfi.id)} className="grid w-full gap-2 border-b border-slate-100 px-4 py-4 text-left last:border-b-0 hover:bg-slate-50 md:grid-cols-[120px_minmax(240px,1fr)_140px_110px_130px_30px] md:items-center md:gap-3"><span className="text-xs font-black text-slate-900">{rfi.rfiNumber}</span><span className="min-w-0"><span className="block truncate text-sm font-bold text-slate-800">{rfi.subject}</span><span className="mt-1 block truncate text-[10px] text-slate-500">{rfi.question}</span></span><span className="text-[10px] font-bold text-slate-500">{statusLabel(rfi.discipline)}</span><span><span className={`inline-flex rounded-full border px-2 py-1 text-[10px] font-black ${statusClass[rfi.status]}`}>{statusLabel(rfi.status)}</span></span><span className={`text-[10px] font-bold ${due?.className || "text-slate-400"}`}>{due?.text || "No due date"}</span><ChevronRight className="hidden h-4 w-4 text-slate-300 md:block" /></button>; })}</div> : <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center"><MessageSquareText className="mx-auto h-8 w-8 text-slate-300" /><p className="mt-3 text-sm font-black text-slate-700">No RFIs match this view.</p><p className="mt-1 text-xs text-slate-500">Create a draft RFI or clear the register filters.</p></div>}

      {showCreate && <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/40 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="Create RFI"><form className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl bg-white p-5 shadow-2xl sm:rounded-2xl" onSubmit={(e) => { e.preventDefault(); void run(async () => { const created = await controller.createRfi({ ...form, dueDate: form.dueDate || undefined, references: refsForIds(selectedRevisionIds) }); setShowCreate(false); setSelectedRevisionIds([]); setForm({ rfiNumber: "", subject: "", question: "", discipline: "GENERAL_ENGINEERING", priority: "NORMAL", dateRaised: new Date().toISOString().slice(0, 10), dueDate: "" }); selectRfi(created.id); }); }}><div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[0.14em] text-indigo-600">New formal question</p><h3 className="mt-1 text-lg font-black">Create RFI draft</h3></div><button type="button" onClick={() => setShowCreate(false)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><X className="h-5 w-5" /></button></div>{actionError && <p className="mt-3 rounded-xl bg-rose-50 p-3 text-xs font-semibold text-rose-700">{actionError}</p>}<div className="mt-5 grid gap-4 sm:grid-cols-2"><label><span className={labelClass}>RFI number</span><input required className={fieldClass} value={form.rfiNumber} onChange={(e) => setForm({ ...form, rfiNumber: e.target.value })} placeholder="RFI-014" /></label><label><span className={labelClass}>Discipline</span><select className={fieldClass} value={form.discipline} onChange={(e) => setForm({ ...form, discipline: e.target.value as DisciplineType })}>{DISCIPLINES.map((value) => <option key={value} value={value}>{statusLabel(value)}</option>)}</select></label><label className="sm:col-span-2"><span className={labelClass}>Subject</span><input required className={fieldClass} value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} placeholder="Clarify transfer slab reinforcement at grid C5" /></label><label className="sm:col-span-2"><span className={labelClass}>Question</span><textarea required rows={5} className={`${fieldClass} resize-y`} value={form.question} onChange={(e) => setForm({ ...form, question: e.target.value })} /></label><label><span className={labelClass}>Priority</span><select className={fieldClass} value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value as RfiPriority })}>{PRIORITIES.map((value) => <option key={value}>{value}</option>)}</select></label><label><span className={labelClass}>Date raised</span><input required type="date" className={fieldClass} value={form.dateRaised} onChange={(e) => setForm({ ...form, dateRaised: e.target.value })} /></label><label><span className={labelClass}>Due date</span><input type="date" min={form.dateRaised} className={fieldClass} value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} /></label></div><div className="mt-5"><CoordinationRevisionPicker documents={documents.projectDocuments} revisions={documents.revisions} selectedRevisionIds={selectedRevisionIds} onChange={setSelectedRevisionIds} /></div><div className="mt-5 flex justify-end gap-2 border-t border-slate-100 pt-4"><button type="button" onClick={() => setShowCreate(false)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-black text-slate-600">Cancel</button><button type="submit" disabled={busy} className="rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-black text-white disabled:opacity-50">Save draft</button></div></form></div>}
    </section>
  );
};
