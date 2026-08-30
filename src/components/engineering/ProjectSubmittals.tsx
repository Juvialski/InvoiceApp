import React, { useEffect, useMemo, useState } from "react";
import { ChevronRight, ClipboardCheck, FileText, Plus, Search, X } from "lucide-react";
import type { Project } from "../../types.ts";
import { appPathForProject } from "../../utils/appRouting.ts";
import { navigateInApp, type AppNavigate } from "../../utils/clientNavigation.ts";
import { useEngineeringDocumentsController } from "../../features/engineering/useEngineeringDocumentsController.ts";
import { useEngineeringCoordinationController } from "../../features/engineering/useEngineeringCoordinationController.ts";
import type { DisciplineType } from "../../lib/engineeringDocuments.ts";
import type { EngineeringSubmittal, SubmittalDecision, SubmittalStatus } from "../../lib/engineeringCoordination.ts";
import type { EngineeringLifecycleAction, EngineeringLifecyclePreview } from "../../lib/engineeringLifecycle.ts";
import { CoordinationRevisionPicker } from "./CoordinationRevisionPicker.tsx";
import { EngineeringLifecycleDialog } from "./EngineeringLifecycleDialog.tsx";

const DISCIPLINES: DisciplineType[] = ["ARCHITECTURAL", "STRUCTURAL", "CIVIL", "MECHANICAL", "ELECTRICAL", "PLUMBING", "FIRE_PROTECTION", "GEOTECHNICAL", "GENERAL_ENGINEERING", "OTHER"];
const STATUSES: SubmittalStatus[] = ["DRAFT", "SUBMITTED", "UNDER_REVIEW", "APPROVED", "APPROVED_AS_NOTED", "REVISE_AND_RESUBMIT", "REJECTED", "CLOSED", "VOID"];
const DECISIONS: SubmittalDecision[] = ["APPROVED", "APPROVED_AS_NOTED", "REVISE_AND_RESUBMIT", "REJECTED"];
const fieldClass = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100";
const labelClass = "mb-1.5 block text-[11px] font-black uppercase tracking-[0.12em] text-slate-500";

function label(value: string) { return value.replaceAll("_", " "); }
function chip(status: SubmittalStatus) {
  if (status === "APPROVED" || status === "CLOSED") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (status === "APPROVED_AS_NOTED") return "border-teal-200 bg-teal-50 text-teal-800";
  if (status === "REVISE_AND_RESUBMIT") return "border-amber-200 bg-amber-50 text-amber-800";
  if (status === "REJECTED" || status === "VOID") return "border-rose-200 bg-rose-50 text-rose-800";
  if (status === "SUBMITTED" || status === "UNDER_REVIEW") return "border-blue-200 bg-blue-50 text-blue-800";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

export const ProjectSubmittals: React.FC<{
  project: Project;
  companyId?: string;
  initialSubmittalId?: string;
  initialRoundId?: string;
  canRead?: boolean;
  canCreate?: boolean;
  canReview?: boolean;
  canManage?: boolean;
  canReadDocuments?: boolean;
  guestMode?: boolean;
  onNavigatePath?: AppNavigate;
}> = ({ project, companyId, initialSubmittalId, initialRoundId, canRead = true, canCreate = true, canReview = true, canManage = true, canReadDocuments = true, guestMode = false, onNavigatePath }) => {
  const controller = useEngineeringCoordinationController({ project, companyId, canRead, canManage, guestMode });
  const documents = useEngineeringDocumentsController({ project, companyId, canRead: canReadDocuments, guestMode });
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<SubmittalStatus | "ALL">("ALL");
  const [discipline, setDiscipline] = useState<DisciplineType | "ALL">("ALL");
  const [selectedId, setSelectedId] = useState<string | undefined>(initialSubmittalId);
  const [selectedRoundId, setSelectedRoundId] = useState<string | undefined>(initialRoundId);
  const [showCreate, setShowCreate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [selectedRevisionIds, setSelectedRevisionIds] = useState<string[]>([]);
  const [reviewDecision, setReviewDecision] = useState<SubmittalDecision>("APPROVED_AS_NOTED");
  const [reviewComments, setReviewComments] = useState("");
  const [resubmitRevisionIds, setResubmitRevisionIds] = useState<string[]>([]);
  const [resubmitDueDate, setResubmitDueDate] = useState("");
  const [closeReason, setCloseReason] = useState("");
  const [lifecyclePreview, setLifecyclePreview] = useState<EngineeringLifecyclePreview | null>(null);
  const [form, setForm] = useState({ submittalNumber: "", title: "", discipline: "GENERAL_ENGINEERING" as DisciplineType, category: "PRODUCT_DATA", specificationReference: "", dueReviewDate: "" });

  useEffect(() => { setSelectedId(initialSubmittalId); setSelectedRoundId(initialRoundId); }, [initialRoundId, initialSubmittalId, project.id]);
  const selected = controller.data.submittals.find((item) => item.id === selectedId);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return controller.data.submittals.filter((item) => {
      if (status !== "ALL" && item.status !== status) return false;
      if (discipline !== "ALL" && item.discipline !== discipline) return false;
      return !needle || `${item.submittalNumber} ${item.title} ${item.category} ${item.specificationReference || ""}`.toLowerCase().includes(needle);
    });
  }, [controller.data.submittals, discipline, query, status]);

  const refsForIds = (ids: string[]) => ids.map((revisionId) => {
    const revision = documents.revisions.find((item) => item.id === revisionId);
    return revision ? { documentId: revision.documentId, revisionId } : null;
  }).filter((item): item is { documentId: string; revisionId: string } => Boolean(item));

  const navigate = (path: string, replace = false) => {
    if (onNavigatePath) onNavigatePath(path, replace);
    else navigateInApp(path, replace);
  };

  const selectSubmittal = (id: string, roundId?: string) => {
    setSelectedId(id); setSelectedRoundId(roundId);
    navigate(appPathForProject(project.id, "submittals", { submittalId: id, roundId }));
  };
  const refreshNotice = controller.hasLoaded && (controller.isLoading || controller.loadError) ? (
    <div role={controller.loadError ? "alert" : "status"} className={`flex items-center justify-between gap-3 rounded-xl border px-3 py-2 text-xs ${controller.loadError ? "border-rose-200 bg-rose-50 text-rose-800" : "border-indigo-100 bg-indigo-50 text-indigo-800"}`}>
      <span>{controller.loadError ? `Could not refresh the submittal register. Showing the last successful records. ${controller.loadError}` : "Refreshing the submittal register… Existing records remain available."}</span>
      {controller.loadError && <button type="button" onClick={controller.retryLoad} className="shrink-0 rounded-lg bg-white px-2.5 py-1.5 text-[10px] font-black text-rose-800 shadow-sm">Retry</button>}
    </div>
  ) : null;
  const run = async (operation: () => Promise<unknown>) => {
    setBusy(true); setActionError(null);
    try { await operation(); } catch (error) { setActionError(error instanceof Error ? error.message : "The submittal action could not be completed."); } finally { setBusy(false); }
  };

  const openLifecycleReview = async () => {
    if (!selected || !canManage) return;
    setBusy(true); setActionError(null);
    try { setLifecyclePreview(await controller.previewSubmittalLifecycle(selected)); } catch (error) { setActionError(error instanceof Error ? error.message : "The submittal lifecycle preview could not be loaded."); } finally { setBusy(false); }
  };

  if (!canRead) return <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm font-semibold text-slate-600">You do not have permission to read project submittals.</div>;
  if (controller.isLoading && !controller.hasLoaded) return <div role="status" className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm font-semibold text-slate-600">Loading submittal register…</div>;
  if (controller.loadError && !controller.hasLoaded) return <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-800"><p className="font-bold">Submittal register unavailable</p><p className="mt-1 text-xs">{controller.loadError}</p><button type="button" className="mt-3 rounded-lg bg-white px-3 py-2 text-xs font-bold shadow-sm" onClick={controller.retryLoad}>Retry</button></div>;
  if (selectedId && !selected) return <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-950"><p className="font-black">Submittal not available</p><p className="mt-1 text-xs leading-5">The requested technical submittal is not available in this project or company.</p><button type="button" onClick={() => { setSelectedId(undefined); setSelectedRoundId(undefined); navigate(appPathForProject(project.id, "submittals"), true); }} className="mt-3 rounded-xl bg-white px-3 py-2 text-xs font-black text-slate-700 shadow-sm">Return to register</button></div>;

  if (selected) {
    const rounds = controller.data.submittalRounds.filter((item) => item.submittalId === selected.id).sort((a, b) => b.roundNumber - a.roundNumber);
    const activeRound = rounds.find((item) => item.id === selectedRoundId) || rounds.find((item) => item.roundNumber === selected.currentRound) || rounds[0];
    const reviews = controller.data.submittalReviews.filter((item) => item.submittalId === selected.id);
    const roundLinks = activeRound ? controller.data.submittalDocumentLinks.filter((item) => item.roundId === activeRound.id) : [];
    return (
      <section className="space-y-4" data-phase1b="submittal-detail">
        {refreshNotice}
        <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0"><button type="button" className="text-xs font-bold text-indigo-700 hover:text-indigo-900" onClick={() => { setSelectedId(undefined); setSelectedRoundId(undefined); navigate(appPathForProject(project.id, "submittals"), true); }}>← Submittal register</button><div className="mt-2 flex flex-wrap items-center gap-2"><span className="text-sm font-black text-slate-900">{selected.submittalNumber}</span><span className={`rounded-full border px-2 py-1 text-[10px] font-black ${chip(selected.status)}`}>{label(selected.status)}</span><span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-600">Round {selected.currentRound}</span></div><h2 className="mt-2 truncate text-lg font-black text-slate-950">{selected.title}</h2><p className="mt-1 text-xs text-slate-500">{label(selected.discipline)} · {label(selected.category)}{selected.specificationReference ? ` · Spec ${selected.specificationReference}` : ""}</p></div>
          <div className="flex flex-wrap gap-2">{selected.status === "DRAFT" && canCreate && <button type="button" disabled={busy} onClick={() => run(() => controller.submitSubmittal(selected))} className="rounded-xl bg-indigo-600 px-4 py-2 text-xs font-black text-white disabled:opacity-50">Submit Round 1</button>}{selected.status === "SUBMITTED" && canReview && <button type="button" disabled={busy} onClick={() => run(() => controller.startReview(selected))} className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-black text-white disabled:opacity-50">Start review</button>}{["APPROVED", "APPROVED_AS_NOTED", "REJECTED"].includes(selected.status) && canManage && <button type="button" disabled={busy} onClick={() => run(() => controller.closeSubmittal(selected, closeReason))} className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-black text-white disabled:opacity-50">Close submittal</button>}{canManage && !["CLOSED", "VOID"].includes(selected.status) && <button type="button" disabled={busy} onClick={() => void openLifecycleReview()} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-black text-slate-700 hover:bg-slate-50 disabled:opacity-50">Review lifecycle</button>}</div>
        </div>
        {actionError && <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-800">{actionError}</div>}
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(330px,.85fr)]">
          <div className="space-y-4">
            <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><div><p className="text-[10px] font-bold uppercase text-slate-400">Review due</p><p className="mt-1 text-xs font-black text-slate-800">{selected.dueReviewDate || "—"}</p></div><div><p className="text-[10px] font-bold uppercase text-slate-400">Current round</p><p className="mt-1 text-xs font-black text-slate-800">{selected.currentRound}</p></div><div><p className="text-[10px] font-bold uppercase text-slate-400">Created</p><p className="mt-1 text-xs font-black text-slate-800">{new Date(selected.createdAt).toLocaleDateString()}</p></div><div><p className="text-[10px] font-bold uppercase text-slate-400">Latest submission</p><p className="mt-1 text-xs font-black text-slate-800">{selected.submittedAt ? new Date(selected.submittedAt).toLocaleDateString() : "—"}</p></div></div></article>
            <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><div><p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Formal round history</p><h3 className="mt-1 text-sm font-black text-slate-900">Submission rounds remain intact</h3></div><ClipboardCheck className="h-5 w-5 text-slate-400" /></div><div className="mt-4 space-y-3">{rounds.map((round) => { const roundReviews = reviews.filter((review) => review.roundId === round.id); const links = controller.data.submittalDocumentLinks.filter((item) => item.roundId === round.id); const active = round.id === activeRound?.id; return <button key={round.id} type="button" onClick={() => selectSubmittal(selected.id, round.id)} className={`w-full rounded-xl border p-4 text-left ${active ? "border-indigo-300 bg-indigo-50/50" : "border-slate-200 bg-slate-50 hover:bg-slate-100"}`}><div className="flex flex-wrap items-center justify-between gap-2"><span className="text-xs font-black text-slate-900">Round {round.roundNumber}</span><span className={`rounded-full border px-2 py-1 text-[10px] font-black ${chip(round.status)}`}>{label(round.status)}</span></div><div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[10px] font-semibold text-slate-500"><span>{round.submittedAt ? `Submitted ${new Date(round.submittedAt).toLocaleDateString()}` : "Draft"}</span><span>{links.length} revision reference{links.length === 1 ? "" : "s"}</span><span>{roundReviews.length} decision record{roundReviews.length === 1 ? "" : "s"}</span></div>{roundReviews.map((review) => <div key={review.id} className="mt-3 border-t border-slate-200 pt-3"><p className="text-[10px] font-black text-indigo-700">{label(review.decision)} · {new Date(review.reviewedAt).toLocaleString()}</p><p className="mt-1 text-xs leading-5 text-slate-700">{review.reviewComments}</p></div>)}</button>; })}</div></article>
          </div>
          <aside className="space-y-4">
            <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">{activeRound ? `Round ${activeRound.roundNumber} revisions` : "Linked revisions"}</p><div className="mt-3 space-y-2">{roundLinks.length ? roundLinks.map((link) => { const revision = documents.revisions.find((item) => item.id === link.revisionId); const document = documents.documents.find((item) => item.id === link.documentId); return <button key={link.id} type="button" onClick={() => navigate(appPathForProject(project.id, "documents", { docId: link.documentId, revId: link.revisionId }))} className="flex w-full items-start gap-3 rounded-xl border border-slate-200 p-3 text-left hover:border-indigo-200 hover:bg-indigo-50"><FileText className="mt-0.5 h-4 w-4 shrink-0 text-indigo-500" /><span className="min-w-0"><span className="block truncate text-xs font-black text-slate-800">{document?.documentNumber || "Engineering document"}</span><span className="mt-0.5 block text-[10px] text-slate-500">Revision {revision?.revisionNumber || link.revisionId}</span></span></button>; }) : <p className="rounded-xl bg-slate-50 p-4 text-xs text-slate-500">No immutable engineering revision references in this round.</p>}</div></article>
            {["SUBMITTED", "UNDER_REVIEW"].includes(selected.status) && canReview && <article className="rounded-2xl border border-blue-200 bg-blue-50/40 p-5 shadow-sm"><h3 className="text-sm font-black text-slate-900">Record review decision</h3><select className={`${fieldClass} mt-3`} value={reviewDecision} onChange={(e) => setReviewDecision(e.target.value as SubmittalDecision)}>{DECISIONS.map((value) => <option key={value} value={value}>{label(value)}</option>)}</select><textarea rows={5} className={`${fieldClass} mt-3 resize-y`} value={reviewComments} onChange={(e) => setReviewComments(e.target.value)} placeholder="Formal review comments…" /><button type="button" disabled={busy || !reviewComments.trim()} onClick={() => run(async () => { await controller.reviewSubmittal(selected, reviewDecision, reviewComments); setReviewComments(""); })} className="mt-3 w-full rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-black text-white disabled:opacity-50">Save decision</button></article>}
            {selected.status === "REVISE_AND_RESUBMIT" && canCreate && <article className="rounded-2xl border border-amber-200 bg-amber-50/50 p-5 shadow-sm"><h3 className="text-sm font-black text-slate-900">Create Round {selected.currentRound + 1}</h3><p className="mt-1 text-xs text-slate-600">A new formal round is created. Earlier rounds and reviews remain unchanged.</p><label className="mt-4 block"><span className={labelClass}>New review due date</span><input type="date" className={fieldClass} value={resubmitDueDate} onChange={(e) => setResubmitDueDate(e.target.value)} /></label><div className="mt-4"><CoordinationRevisionPicker documents={documents.projectDocuments} revisions={documents.revisions} selectedRevisionIds={resubmitRevisionIds} onChange={setResubmitRevisionIds} label="New round revision references" /></div><button type="button" disabled={busy} onClick={() => run(async () => { await controller.resubmitSubmittal(selected, refsForIds(resubmitRevisionIds), resubmitDueDate || undefined); setResubmitRevisionIds([]); setResubmitDueDate(""); })} className="mt-4 w-full rounded-xl bg-amber-600 px-4 py-2.5 text-xs font-black text-white disabled:opacity-50">Submit new round</button></article>}
            {["APPROVED", "APPROVED_AS_NOTED", "REJECTED"].includes(selected.status) && canManage && <label className="block rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><span className={labelClass}>Optional close note</span><input className={fieldClass} value={closeReason} onChange={(e) => setCloseReason(e.target.value)} placeholder="Close note" /></label>}
            {lifecyclePreview && <EngineeringLifecycleDialog entityLabel="technical submittal" recordLabel={`${selected.submittalNumber} · ${selected.title}`} preview={lifecyclePreview} actions={[{ action: "DELETE_UNUSED", label: "Delete unused", description: "Permanently remove only an untouched draft with its disposable Round 1 and no links or review history.", tone: "danger" }, { action: "VOID", label: "Void / withdraw", description: "Keep every submitted round and review decision while marking this record as terminal void history.", requiresReason: true, tone: "danger" }]} busy={busy} error={actionError} onClose={() => setLifecyclePreview(null)} onApply={(action: EngineeringLifecycleAction, reason?: string) => { if (action !== "DELETE_UNUSED" && action !== "VOID") return; void run(async () => { const result = await controller.applySubmittalLifecycle(selected, action, reason); setLifecyclePreview(null); if (result.deleted) { setSelectedId(undefined); setSelectedRoundId(undefined); navigate(appPathForProject(project.id, "submittals"), true); } }); }} />}
          </aside>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-4" data-phase1b="submittal-register">
      {refreshNotice}
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:flex-row lg:items-center lg:justify-between"><div><p className="text-[10px] font-black uppercase tracking-[0.14em] text-indigo-600">Engineering coordination</p><h2 className="mt-1 text-lg font-black text-slate-950">Technical Submittal Register</h2><p className="mt-1 text-xs text-slate-500">Track formal submission rounds, review decisions, and immutable drawing/specification revisions.</p></div>{canCreate && <button type="button" onClick={() => setShowCreate(true)} className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-black text-white"><Plus className="h-4 w-4" />Create submittal</button>}</div>
      <div className="grid gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:grid-cols-2 lg:grid-cols-[minmax(240px,1fr)_190px_190px]"><label className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" /><input className={`${fieldClass} pl-9`} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search number, title, category…" /></label><select className={fieldClass} value={status} onChange={(e) => setStatus(e.target.value as SubmittalStatus | "ALL")}><option value="ALL">All statuses</option>{STATUSES.map((value) => <option key={value} value={value}>{label(value)}</option>)}</select><select className={fieldClass} value={discipline} onChange={(e) => setDiscipline(e.target.value as DisciplineType | "ALL")}><option value="ALL">All disciplines</option>{DISCIPLINES.map((value) => <option key={value} value={value}>{label(value)}</option>)}</select></div>
      {filtered.length ? <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="hidden grid-cols-[130px_minmax(250px,1fr)_155px_115px_95px_125px_28px] gap-3 border-b border-slate-100 bg-slate-50 px-4 py-3 text-[10px] font-black uppercase tracking-[0.1em] text-slate-500 lg:grid"><span>Submittal</span><span>Title</span><span>Discipline</span><span>Status</span><span>Round</span><span>Review due</span><span /></div>{filtered.map((item) => <button type="button" key={item.id} onClick={() => selectSubmittal(item.id)} className="grid w-full gap-2 border-b border-slate-100 px-4 py-4 text-left last:border-b-0 hover:bg-slate-50 lg:grid-cols-[130px_minmax(250px,1fr)_155px_115px_95px_125px_28px] lg:items-center lg:gap-3"><span className="text-xs font-black text-slate-900">{item.submittalNumber}</span><span className="min-w-0"><span className="block truncate text-sm font-bold text-slate-800">{item.title}</span><span className="mt-1 block truncate text-[10px] text-slate-500">{label(item.category)}{item.specificationReference ? ` · ${item.specificationReference}` : ""}</span></span><span className="text-[10px] font-bold text-slate-500">{label(item.discipline)}</span><span><span className={`inline-flex rounded-full border px-2 py-1 text-[10px] font-black ${chip(item.status)}`}>{label(item.status)}</span></span><span className="text-xs font-black text-slate-700">{item.currentRound}</span><span className="text-[10px] font-bold text-slate-500">{item.dueReviewDate || "No date"}</span><ChevronRight className="hidden h-4 w-4 text-slate-300 lg:block" /></button>)}</div> : <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center"><ClipboardCheck className="mx-auto h-8 w-8 text-slate-300" /><p className="mt-3 text-sm font-black text-slate-700">No submittals match this view.</p><p className="mt-1 text-xs text-slate-500">Create a draft submittal or clear the filters.</p></div>}
      {showCreate && <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/40 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="Create technical submittal"><form className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl bg-white p-5 shadow-2xl sm:rounded-2xl" onSubmit={(e) => { e.preventDefault(); void run(async () => { const created = await controller.createSubmittal({ ...form, specificationReference: form.specificationReference || undefined, dueReviewDate: form.dueReviewDate || undefined, references: refsForIds(selectedRevisionIds) }); setShowCreate(false); setSelectedRevisionIds([]); setForm({ submittalNumber: "", title: "", discipline: "GENERAL_ENGINEERING", category: "PRODUCT_DATA", specificationReference: "", dueReviewDate: "" }); selectSubmittal(created.id); }); }}><div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[0.14em] text-indigo-600">New technical workflow</p><h3 className="mt-1 text-lg font-black">Create submittal draft</h3></div><button type="button" onClick={() => setShowCreate(false)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><X className="h-5 w-5" /></button></div>{actionError && <p className="mt-3 rounded-xl bg-rose-50 p-3 text-xs font-semibold text-rose-700">{actionError}</p>}<div className="mt-5 grid gap-4 sm:grid-cols-2"><label><span className={labelClass}>Submittal number</span><input required className={fieldClass} value={form.submittalNumber} onChange={(e) => setForm({ ...form, submittalNumber: e.target.value })} placeholder="SUB-014" /></label><label><span className={labelClass}>Discipline</span><select className={fieldClass} value={form.discipline} onChange={(e) => setForm({ ...form, discipline: e.target.value as DisciplineType })}>{DISCIPLINES.map((value) => <option key={value} value={value}>{label(value)}</option>)}</select></label><label className="sm:col-span-2"><span className={labelClass}>Title</span><input required className={fieldClass} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Structural steel shop drawings" /></label><label><span className={labelClass}>Category / type</span><input required className={fieldClass} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="SHOP_DRAWING" /></label><label><span className={labelClass}>Specification reference</span><input className={fieldClass} value={form.specificationReference} onChange={(e) => setForm({ ...form, specificationReference: e.target.value })} placeholder="05 12 00" /></label><label><span className={labelClass}>Review due date</span><input type="date" className={fieldClass} value={form.dueReviewDate} onChange={(e) => setForm({ ...form, dueReviewDate: e.target.value })} /></label></div><div className="mt-5"><CoordinationRevisionPicker documents={documents.projectDocuments} revisions={documents.revisions} selectedRevisionIds={selectedRevisionIds} onChange={setSelectedRevisionIds} /></div><div className="mt-5 flex justify-end gap-2 border-t border-slate-100 pt-4"><button type="button" onClick={() => setShowCreate(false)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-black text-slate-600">Cancel</button><button type="submit" disabled={busy} className="rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-black text-white disabled:opacity-50">Save draft</button></div></form></div>}
    </section>
  );
};
