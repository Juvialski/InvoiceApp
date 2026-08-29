import React, { useMemo, useState } from "react";
import { ChevronRight, FileStack, History, Image, ShieldCheck, X } from "lucide-react";
import type { EngineeringDocument } from "../lib/engineeringDocuments.ts";
import { buildLocalEngineeringDocumentLifecyclePreview, type EngineeringLifecycleAction, type EngineeringLifecyclePreview } from "../lib/engineeringLifecycle.ts";
import { useDemoWorkspace } from "./DemoWorkspaceProvider.tsx";
import { EngineeringLifecycleDialog } from "../components/engineering/EngineeringLifecycleDialog.tsx";

function statusClass(status: EngineeringDocument["status"]) {
  if (status === "APPROVED") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "UNDER_REVIEW") return "border-amber-200 bg-amber-50 text-amber-700";
  if (status === "SUPERSEDED") return "border-amber-200 bg-amber-50 text-amber-800";
  if (status === "ARCHIVED") return "border-slate-300 bg-slate-100 text-slate-600";
  return "border-slate-200 bg-slate-50 text-slate-600";
}

export function DemoEngineeringDocuments({ projectId }: { projectId?: string }) {
  const { data, dispatch } = useDemoWorkspace();
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [showInactive, setShowInactive] = useState(false);
  const [lifecyclePreview, setLifecyclePreview] = useState<EngineeringLifecyclePreview | null>(null);
  const project = projectId ? data.projects.find((item) => item.id === projectId) : undefined;
  const documents = useMemo(() => data.engineering.documents.filter((document) => (!projectId || document.projectId === projectId) && (showInactive || !["ARCHIVED", "SUPERSEDED"].includes(document.status))), [data.engineering.documents, projectId, showInactive]);
  const previewableDocument = useMemo(() => documents.find((document) => Boolean(document.metadata?.demoAsset)), [documents]);
  const selected = documents.find((document) => document.id === selectedDocumentId) || previewableDocument || documents[0];
  const revisions = selected ? data.engineering.revisions.filter((revision) => revision.documentId === selected.id).sort((a, b) => a.createdAt.localeCompare(b.createdAt)) : [];
  const selectedProject = selected ? data.projects.find((item) => item.id === selected.projectId) : undefined;
  const asset = selected?.metadata?.demoAsset as string | undefined;

  const openLifecycleReview = () => {
    if (!selected) return;
    setLifecyclePreview(buildLocalEngineeringDocumentLifecyclePreview({
      documentId: selected.id,
      status: selected.status,
      projectId: selected.projectId,
      revisions: data.engineering.revisions.filter((revision) => revision.documentId === selected.id).length,
      annotations: data.engineering.annotations.filter((annotation) => annotation.documentId === selected.id).length,
      rfiLinks: data.coordination.rfiDocumentLinks.filter((link) => link.documentId === selected.id).length,
      submittalLinks: data.coordination.submittalDocumentLinks.filter((link) => link.documentId === selected.id).length,
      source: "demo",
    }));
  };

  const applyLifecycle = (action: EngineeringLifecycleAction, reason?: string) => {
    if (!selected || (action !== "DELETE_UNUSED" && action !== "ARCHIVE" && action !== "SUPERSEDE")) return;
    const preview = lifecyclePreview;
    if (!preview) return;
    const allowed = action === "DELETE_UNUSED" ? preview.canDelete : action === "ARCHIVE" ? preview.canArchive : preview.canSupersede;
    if (!allowed) return;
    if (action === "DELETE_UNUSED") {
      dispatch({ type: "SAVE_ENGINEERING_DOCUMENTS", value: { documents: data.engineering.documents.filter((item) => item.id !== selected.id), revisions: data.engineering.revisions.filter((item) => item.documentId !== selected.id), annotations: data.engineering.annotations.filter((item) => item.documentId !== selected.id) } });
      setSelectedDocumentId(null);
    } else {
      const updated: EngineeringDocument = action === "ARCHIVE"
        ? { ...selected, status: "ARCHIVED", archivedAt: selected.archivedAt || data.anchorDate, lifecycleReason: reason || "Confirmed demo document archive" }
        : { ...selected, status: "SUPERSEDED", supersededAt: selected.supersededAt || data.anchorDate, lifecycleReason: reason || "Confirmed demo document supersede" };
      dispatch({ type: "SAVE_ENGINEERING_DOCUMENTS", value: { ...data.engineering, documents: data.engineering.documents.map((item) => item.id === updated.id ? updated : item) } });
    }
    setLifecyclePreview(null);
  };

  return (
    <div className="space-y-5">
      <header className="border-b border-slate-200 pb-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-indigo-600">Engineering Documents • Demo source adapter</p>
            {project ? (
              <h2 className="mt-2 text-xl font-black tracking-tight text-slate-950 sm:text-2xl">Engineering Document Register</h2>
            ) : (
              <h1 className="mt-2 text-2xl font-black tracking-tight text-slate-950">Engineering Document Register</h1>
            )}
            <p className="mt-2 max-w-3xl text-xs leading-5 text-slate-500">Fictional project drawings and document revisions are served from the isolated demo bundle. Production Storage URLs and signed asset paths are never requested here.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 self-start"><label className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-[10px] font-bold text-slate-600"><input type="checkbox" checked={showInactive} onChange={(event) => setShowInactive(event.target.checked)} /> Show inactive</label><span className="inline-flex items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-[10px] font-black uppercase tracking-[0.12em] text-emerald-700"><ShieldCheck className="h-3.5 w-3.5" /> Sample assets only</span></div>
        </div>
      </header>

      <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="grid grid-cols-[minmax(0,1fr)_110px_120px] gap-3 border-b border-slate-100 bg-slate-50 px-4 py-2.5 text-[9px] font-black uppercase tracking-[0.12em] text-slate-400 sm:grid-cols-[130px_minmax(0,1fr)_120px_120px]">
            <span className="hidden sm:block">Document</span><span>Title</span><span>Discipline</span><span>Status</span>
          </div>
          <div className="divide-y divide-slate-100">
            {documents.map((document) => {
              const docProject = data.projects.find((item) => item.id === document.projectId);
              const active = selected?.id === document.id;
              return (
                <button key={document.id} type="button" onClick={() => setSelectedDocumentId(document.id)} className={`grid w-full grid-cols-[minmax(0,1fr)_110px_120px] gap-3 px-4 py-3.5 text-left transition sm:grid-cols-[130px_minmax(0,1fr)_120px_120px] ${active ? "bg-indigo-50/70" : "hover:bg-slate-50"}`}>
                  <span className="hidden text-[10px] font-black text-slate-500 sm:block">{document.documentNumber}</span>
                  <span className="min-w-0"><span className="block truncate text-xs font-black text-slate-900">{document.title}</span><span className="mt-1 block truncate text-[10px] text-slate-500">{docProject?.projectCode} • {document.currentRevisionNumber}</span></span>
                  <span className="self-center truncate text-[9px] font-bold text-slate-500">{document.discipline.replaceAll("_", " ")}</span>
                  <span className={`self-center justify-self-start rounded-md border px-2 py-1 text-[9px] font-black ${statusClass(document.status)}`}>{document.status.replaceAll("_", " ")}</span>
                </button>
              );
            })}
          </div>
        </div>

        <aside className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          {selected ? (
            <>
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600"><FileStack className="h-5 w-5" /></div>
                <div className="min-w-0"><p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">{selected.documentNumber}</p><h2 className="mt-1 text-sm font-black text-slate-900">{selected.title}</h2><p className="mt-1 text-[10px] text-slate-500">{selectedProject?.projectName}</p></div>
              </div>
              <p className="mt-4 text-xs leading-5 text-slate-600">{selected.description}</p>
              <button type="button" onClick={openLifecycleReview} className="mt-4 inline-flex w-full items-center justify-center rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-xs font-black text-slate-700 hover:bg-slate-50">Review lifecycle</button>
              <div className="mt-5 flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.12em] text-slate-500"><History className="h-3.5 w-3.5" /> Immutable revision history</div>
              <div className="mt-2 space-y-2">
                {revisions.map((revision) => (
                  <div key={revision.id} className="rounded-lg border border-slate-200 p-3">
                    <div className="flex items-center justify-between gap-2"><span className="text-xs font-black text-slate-800">{revision.revisionNumber}</span><span className="text-[9px] font-black text-slate-500">{revision.status.replaceAll("_", " ")}</span></div>
                    <p className="mt-1 text-[10px] font-semibold text-indigo-700">{revision.revisionLabel}</p>
                    <p className="mt-2 text-[10px] leading-4 text-slate-500">{revision.changeSummary}</p>
                  </div>
                ))}
              </div>
              {asset ? <button type="button" onClick={() => setPreviewOpen(true)} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-3 py-2.5 text-xs font-black text-white hover:bg-indigo-700"><Image className="h-4 w-4" /> Open original demo drawing <ChevronRight className="h-3.5 w-3.5" /></button> : <p className="mt-4 rounded-lg bg-slate-50 px-3 py-2.5 text-[10px] leading-4 text-slate-500">Metadata and revision history are fully interactive; this fictional record has no bundled drawing preview.</p>}
            </>
          ) : <p className="text-xs text-slate-500">No demo documents match this project.</p>}
        </aside>
      </section>

      {previewOpen && asset && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/80 p-3 sm:p-6" role="dialog" aria-modal="true" aria-label="Demo drawing preview">
          <div className="flex max-h-full w-full max-w-6xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3"><div><p className="text-xs font-black text-slate-900">{selected?.documentNumber} • {selected?.title}</p><p className="mt-0.5 text-[10px] text-slate-500">Original fictional SVG asset — no production Storage access</p></div><button type="button" onClick={() => setPreviewOpen(false)} className="rounded-md p-2 text-slate-500 hover:bg-slate-100"><X className="h-4 w-4" /></button></div>
            <div className="overflow-auto bg-slate-100 p-3 sm:p-5"><img src={asset} alt="Fictional Meridian Engineering structural foundation plan" className="mx-auto h-auto max-w-full border border-slate-300 bg-white shadow-sm" /></div>
          </div>
        </div>
      )}
      {lifecyclePreview && selected && <EngineeringLifecycleDialog entityLabel="engineering document" recordLabel={`${selected.documentNumber} · ${selected.title}`} preview={lifecyclePreview} actions={[{ action: "DELETE_UNUSED", label: "Delete unused", description: "Permanently remove only an untouched demo draft shell with no historical dependencies.", tone: "danger" }, { action: "ARCHIVE", label: "Archive", description: "Keep all fictional revisions and source metadata while removing this document from the normal active list.", requiresReason: true, tone: "warning" }, { action: "SUPERSEDE", label: "Supersede", description: "Mark this fictional document as replaced without deleting its revision history.", requiresReason: true, tone: "primary" }]} onClose={() => setLifecyclePreview(null)} onApply={applyLifecycle} />}
    </div>
  );
}
