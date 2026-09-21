import { useEffect, useState } from "react";
import { Archive, ArrowLeft, Download, ExternalLink, FileText, History, Loader2, Upload } from "lucide-react";
import { useAppPermissions } from "../../app/AppPermissionContext.tsx";
import { useOptionalCompanyAccess } from "../../context/CompanyAccessContext.tsx";
import { archiveManagedDocument, getManagedDocument, getManagedDocumentVersionUrl, uploadManagedDocumentVersion, type ManagedDocumentDetail } from "../../lib/managedDocuments.ts";
import { hasPermission, PERMISSION_KEYS } from "../../utils/accessControl.ts";
import { SectionHeader } from "../ui/OperationsUI.tsx";

interface ManagedDocumentDetailViewProps {
  readonly companyId?: string;
  readonly documentId: string;
  readonly demoMode?: boolean;
  readonly initialDocument?: ManagedDocumentDetail;
  readonly onBack: () => void;
  readonly onChanged?: (document: ManagedDocumentDetail) => void;
}

function bytesLabel(value?: number) {
  if (!value) return "Size not recorded";
  if (value < 1024) return `${value} bytes`;
  if (value < 1024 * 1024) return `${Math.ceil(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function dateLabel(value?: string) {
  if (!value) return "Date not recorded";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export function ManagedDocumentDetailView({ companyId, documentId, demoMode = false, initialDocument, onBack, onChanged }: ManagedDocumentDetailViewProps) {
  const permissions = useAppPermissions();
  const access = useOptionalCompanyAccess();
  const resolvedCompanyId = companyId || access?.activeCompanyId;
  const canManage = demoMode || hasPermission(permissions, PERMISSION_KEYS.documentsManage);
  const [document, setDocument] = useState<ManagedDocumentDetail | undefined>(initialDocument);
  const [loading, setLoading] = useState(!demoMode && !initialDocument);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [versionFile, setVersionFile] = useState<File | null>(null);

  const refresh = async () => {
    if (demoMode || !resolvedCompanyId) return;
    setLoading(true);
    setError(null);
    try {
      const next = await getManagedDocument(resolvedCompanyId, documentId);
      setDocument(next);
      onChanged?.(next);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The managed document could not be loaded safely.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (!initialDocument && !demoMode) void refresh(); }, [documentId, resolvedCompanyId]);

  const openVersion = async (versionId: string, download = false) => {
    if (demoMode || !resolvedCompanyId) return;
    try {
      const url = await getManagedDocumentVersionUrl(resolvedCompanyId, documentId, versionId, download);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The managed document version could not be opened safely.");
    }
  };

  const saveVersion = async () => {
    if (!versionFile || !document || demoMode || !resolvedCompanyId) return;
    setBusy(true);
    setError(null);
    try {
      const next = await uploadManagedDocumentVersion(resolvedCompanyId, document.id, document.updatedAt, versionFile);
      setVersionFile(null);
      setDocument(next);
      onChanged?.(next);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The new document version could not be saved safely.");
    } finally {
      setBusy(false);
    }
  };

  const archive = async () => {
    if (!document || demoMode || !resolvedCompanyId || !window.confirm("Archive this document? Its versions will remain available to authorized users.")) return;
    setBusy(true);
    setError(null);
    try {
      const next = await archiveManagedDocument(resolvedCompanyId, document.id, document.updatedAt, "Archived from Documents");
      const detail = { ...document, ...next } as ManagedDocumentDetail;
      setDocument(detail);
      onChanged?.(detail);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The managed document could not be archived safely.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-4" aria-label="Managed document detail" data-managed-document-detail="true">
      <button type="button" onClick={onBack} className="inline-flex items-center gap-1.5 text-xs font-black text-indigo-700 hover:text-indigo-900"><ArrowLeft className="h-3.5 w-3.5" />Back to Documents</button>
      {loading && <div role="status" className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-5 text-xs text-slate-600"><Loader2 className="h-4 w-4 animate-spin text-indigo-600" />Loading document history…</div>}
      {error && <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">{error}</div>}
      {!loading && document && <>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start"><div className="flex min-w-0 items-start gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700"><FileText className="h-5 w-5" /></div><div className="min-w-0"><p className="text-[10px] font-black uppercase tracking-[0.16em] text-indigo-600">{document.category.replaceAll("_", " ")}</p><h1 className="mt-1 break-words text-xl font-black text-slate-950">{document.title}</h1>{document.description && <p className="mt-2 max-w-3xl text-xs leading-5 text-slate-600">{document.description}</p>}<p className="mt-2 text-[10px] text-slate-500">{document.status} · Created {dateLabel(document.createdAt)} · Updated {dateLabel(document.updatedAt)}</p></div></div><div className="flex flex-wrap gap-2"><button type="button" onClick={() => void openVersion(document.currentVersionId || document.versions[0]?.id)} disabled={demoMode || !document.versions.length} className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-[11px] font-black text-indigo-700 disabled:opacity-45"><ExternalLink className="h-3.5 w-3.5" />Open current file</button>{canManage && document.origin === "MANUAL_UPLOAD" && document.status === "ACTIVE" && <button type="button" onClick={() => void archive()} disabled={busy || demoMode} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-[11px] font-black text-slate-700 disabled:opacity-45"><Archive className="h-3.5 w-3.5" />Archive</button>}</div></div>{document.artifact && <details className="mt-4 rounded-lg border border-slate-100 bg-slate-50 p-3 text-xs text-slate-600"><summary className="cursor-pointer font-black text-slate-800">Generated source and template provenance</summary><dl className="mt-3 grid gap-2 sm:grid-cols-2"><div><dt className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Source</dt><dd>{document.artifact.sourceDomain} · {document.artifact.sourceRecordReference || "Record reference protected"}</dd></div><div><dt className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Artifact</dt><dd>{document.artifact.artifactType} · {document.artifact.displayName}</dd></div><div><dt className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Template</dt><dd>{document.artifact.templateVersionId ? "Pinned template version" : "No template relationship recorded"}</dd></div></dl></details>}</div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"><SectionHeader title="Version history" description="Every saved file remains immutable. Authorized users can add a new version; old bytes are never replaced." /><div className="mt-4 space-y-2">{document.versions.map((version) => <div key={version.id} className="flex flex-col justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50 p-3 sm:flex-row sm:items-center"><div className="flex min-w-0 items-start gap-3"><History className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" /><div className="min-w-0"><p className="break-words text-xs font-black text-slate-900">Version {version.versionNumber} · {version.originalFilename}{version.id === document.currentVersionId ? " · Current" : ""}</p><p className="mt-1 text-[10px] text-slate-500">{version.mimeType} · {bytesLabel(version.sizeBytes)} · Saved {dateLabel(version.createdAt)}</p></div></div><div className="flex shrink-0 gap-2"><button type="button" onClick={() => void openVersion(version.id)} disabled={demoMode} className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 bg-white px-2.5 py-1.5 text-[10px] font-black text-indigo-700 disabled:opacity-45"><ExternalLink className="h-3 w-3" />Open</button><button type="button" onClick={() => void openVersion(version.id, true)} disabled={demoMode} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[10px] font-black text-slate-700 disabled:opacity-45"><Download className="h-3 w-3" />Download</button></div></div>)}</div>{canManage && document.origin === "MANUAL_UPLOAD" && document.status === "ACTIVE" && <div className="mt-4 rounded-xl border border-dashed border-indigo-200 bg-indigo-50/40 p-3"><label><span className="field-label">Upload a new version</span><input type="file" className="field-input" onChange={(event) => setVersionFile(event.target.files?.[0] || null)} disabled={busy || demoMode} accept=".pdf,.jpg,.jpeg,.png,.webp,.docx,.xlsx,.xlsm,.csv,.txt" /></label>{versionFile && <div className="mt-3 flex flex-wrap items-center justify-between gap-2"><p className="text-[11px] text-slate-600">Ready to add <strong>{versionFile.name}</strong> as the next immutable version.</p><button type="button" onClick={() => void saveVersion()} disabled={busy || demoMode} className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-[11px] font-black text-white disabled:opacity-45">{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}Save new version</button></div>}</div>}</div>
      </>}
    </section>
  );
}
