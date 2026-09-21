import { useMemo, useState } from "react";
import { Check, FileUp, Loader2 } from "lucide-react";
import type { Project } from "../../types.ts";
import { uploadManagedDocument, type ManagedDocumentCategory, type ManagedDocumentDetail } from "../../lib/managedDocuments.ts";
import { SectionHeader } from "../ui/OperationsUI.tsx";

interface ManagedDocumentUploadViewProps {
  readonly companyId?: string;
  readonly projects: readonly Project[];
  readonly demoMode?: boolean;
  readonly canManage?: boolean;
  readonly onCreated?: (document: ManagedDocumentDetail) => void;
}

const CATEGORY_OPTIONS: readonly { value: Exclude<ManagedDocumentCategory, "GENERATED_DOCUMENT" | "GENERATED_ARTIFACT">; label: string }[] = [
  { value: "GENERAL_UPLOAD", label: "General company upload" },
  { value: "WARRANTY_CERTIFICATE", label: "Warranty Certificate" },
  { value: "EQUIPMENT_MATERIALS_CHECKLIST", label: "Equipment / Materials Checklist" },
];

export function ManagedDocumentUploadView({ companyId, projects, demoMode = false, canManage = false, onCreated }: ManagedDocumentUploadViewProps) {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<ManagedDocumentCategory>("GENERAL_UPLOAD");
  const [description, setDescription] = useState("");
  const [projectId, setProjectId] = useState("");
  const [step, setStep] = useState<"FORM" | "REVIEW">("FORM");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selectedProject = useMemo(() => projects.find((project) => project.id === projectId), [projectId, projects]);

  const review = () => {
    setError(null);
    if (!file) return setError("Choose a file before reviewing the upload.");
    if (!title.trim()) return setError("Enter a title before reviewing the upload.");
    setStep("REVIEW");
  };

  const commit = async () => {
    if (!file || !companyId || demoMode) return;
    setBusy(true);
    setError(null);
    try {
      const created = await uploadManagedDocument(companyId, { file, title: title.trim(), category: category as Exclude<ManagedDocumentCategory, "GENERATED_DOCUMENT" | "GENERATED_ARTIFACT">, description: description.trim() || undefined, projectId: projectId || undefined });
      onCreated?.(created);
      setFile(null);
      setTitle("");
      setDescription("");
      setProjectId("");
      setStep("FORM");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The managed document could not be saved safely.");
    } finally {
      setBusy(false);
    }
  };

  if (!canManage && !demoMode) return null;

  return (
    <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5" aria-label="Upload a managed document" data-managed-document-upload="true">
      <SectionHeader title="Upload a company document" description="Add a standalone file with a clear title and optional project context. The file becomes an immutable version after confirmation." />
      {error && <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">{error}</div>}
      {step === "FORM" ? (
        <div className="grid gap-3 md:grid-cols-2">
          <label className="md:col-span-2"><span className="field-label">File</span><input type="file" className="field-input" onChange={(event) => setFile(event.target.files?.[0] || null)} accept=".pdf,.jpg,.jpeg,.png,.webp,.docx,.xlsx,.csv,.txt" /></label>
          <label><span className="field-label">Title</span><input className="field-input" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Warranty Certificate · Cebu project" /></label>
          <label><span className="field-label">Document type</span><select className="field-input" value={category} onChange={(event) => setCategory(event.target.value as typeof category)}>{CATEGORY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
          <label><span className="field-label">Project (optional)</span><select className="field-input" value={projectId} onChange={(event) => setProjectId(event.target.value)}><option value="">No project link</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.projectCode} · {project.projectName}</option>)}</select></label>
          <label><span className="field-label">Description (optional)</span><textarea className="field-input min-h-24" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Short business context" /></label>
          <div className="flex items-end justify-end md:col-span-2"><button type="button" onClick={review} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-black text-white hover:bg-indigo-700"><FileUp className="h-3.5 w-3.5" />Review upload</button></div>
        </div>
      ) : (
        <div className="space-y-4" data-managed-document-upload-review="true">
          <div className="rounded-xl border border-indigo-100 bg-indigo-50/60 p-4 text-xs text-indigo-950"><p className="font-black">Review before saving</p><dl className="mt-3 grid gap-2 sm:grid-cols-2"><div><dt className="text-[10px] font-bold uppercase tracking-wide text-indigo-700">File</dt><dd className="font-semibold">{file?.name} · {file ? Math.ceil(file.size / 1024) : 0} KB</dd></div><div><dt className="text-[10px] font-bold uppercase tracking-wide text-indigo-700">Type</dt><dd className="font-semibold">{CATEGORY_OPTIONS.find((option) => option.value === category)?.label}</dd></div><div><dt className="text-[10px] font-bold uppercase tracking-wide text-indigo-700">Title</dt><dd className="font-semibold">{title}</dd></div><div><dt className="text-[10px] font-bold uppercase tracking-wide text-indigo-700">Project</dt><dd className="font-semibold">{selectedProject ? `${selectedProject.projectCode} · ${selectedProject.projectName}` : "No project link"}</dd></div></dl>{description && <p className="mt-3 border-t border-indigo-100 pt-3 leading-5">{description}</p>}</div>
          {demoMode && <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">Demo upload review is available, but demo data is write-isolated. No file will be sent to Storage.</p>}
          <div className="flex flex-wrap justify-end gap-2"><button type="button" onClick={() => setStep("FORM")} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700">Back</button><button type="button" disabled={busy || demoMode} onClick={() => void commit()} className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-black text-white disabled:cursor-not-allowed disabled:opacity-45">{busy ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Saving…</> : <><Check className="h-3.5 w-3.5" />Save managed document</>}</button></div>
        </div>
      )}
    </section>
  );
}
