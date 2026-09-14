import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Download, FileText, Loader2, Plus, WandSparkles } from "lucide-react";
import { useAppPermissions } from "../../app/AppPermissionContext.tsx";
import { useOptionalCompanyAccess } from "../../context/CompanyAccessContext.tsx";
import {
  downloadDocxBytes,
  generateManagedDocument,
  listAvailableDocumentTemplates,
  type AvailableDocumentTemplate,
} from "../../lib/documentTemplates.ts";
import type { DocumentTemplateSourceContext, DocumentTemplateTypeDefinition } from "../../lib/documentTemplateTypes.ts";
import type { Project, PurchaseOrder } from "../../types.ts";
import { hasPermission, PERMISSION_KEYS } from "../../utils/accessControl.ts";
import { SectionHeader } from "../ui/OperationsUI.tsx";

interface ManagedDocumentCreateViewProps {
  readonly projects: readonly Project[];
  readonly purchaseOrders: readonly PurchaseOrder[];
}

type Step = "CHOOSE" | "SOURCE" | "INPUT" | "REVIEW";

const SOURCE_CONTEXTS: readonly DocumentTemplateSourceContext[] = ["PURCHASE_ORDER", "PROJECT", "GENERAL"];

function inputValue(value: unknown) {
  return value === undefined || value === null ? "" : String(value);
}

function typeLabel(definition: DocumentTemplateTypeDefinition) {
  return definition.displayName;
}

function sourceLabel(context: DocumentTemplateSourceContext) {
  return context === "PURCHASE_ORDER" ? "Purchase Order" : context === "PROJECT" ? "Project" : "Company information";
}

export function ManagedDocumentCreateView({ projects, purchaseOrders }: ManagedDocumentCreateViewProps) {
  const access = useOptionalCompanyAccess();
  const permissions = useAppPermissions();
  const companyId = access?.activeCompanyId;
  const [available, setAvailable] = useState<readonly AvailableDocumentTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<Step>("CHOOSE");
  const [selectedKey, setSelectedKey] = useState("");
  const [sourceId, setSourceId] = useState("");
  const [fields, setFields] = useState<Record<string, unknown>>({});
  const [repeats, setRepeats] = useState<Record<string, Array<Record<string, unknown>>>>({});
  const [busy, setBusy] = useState(false);

  const load = async () => {
    if (!companyId) return;
    const contexts = SOURCE_CONTEXTS.filter((context) => {
      if (context === "PURCHASE_ORDER") return hasPermission(permissions, PERMISSION_KEYS.procurementRead);
      if (context === "PROJECT") return hasPermission(permissions, PERMISSION_KEYS.projectsRead);
      return hasPermission(permissions, PERMISSION_KEYS.settingsRead);
    });
    setLoading(true);
    setError(null);
    try {
      const results = await Promise.all(contexts.map((context) => listAvailableDocumentTemplates(companyId, context)));
      setAvailable(results.flat());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Company document templates could not be loaded.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [companyId, permissions]);

  const selected = useMemo(() => available.find((entry) => entry.type.key === selectedKey), [available, selectedKey]);
  const sourceOptions = selected?.type.sourceContext === "PURCHASE_ORDER"
    ? purchaseOrders.map((order) => ({ id: order.id, label: `${order.poNumber} · ${order.currency}` }))
    : selected?.type.sourceContext === "PROJECT"
      ? projects.map((project) => ({ id: project.id, label: `${project.projectCode} · ${project.projectName}` }))
      : [];

  const chooseType = (entry: AvailableDocumentTemplate) => {
    setSelectedKey(entry.type.key);
    setSourceId("");
    setFields({});
    setRepeats({});
    setStep(entry.type.sourceContext === "GENERAL" ? "INPUT" : "SOURCE");
  };

  const addRepeatRow = (sectionKey: string) => setRepeats((current) => ({ ...current, [sectionKey]: [...(current[sectionKey] || []), {}] }));

  const generate = async () => {
    if (!companyId || !selected) return;
    setBusy(true);
    setError(null);
    try {
      const result = await generateManagedDocument(companyId, {
        typeKey: selected.type.key,
        templateVersionId: selected.activeVersion.id,
        sourceContext: selected.type.sourceContext,
        ...(sourceId ? { sourceId } : {}),
        inputs: { fields, repeats },
      });
      downloadDocxBytes(result.bytes, result.fileName);
      setStep("REVIEW");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The company document could not be generated safely.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-4" aria-label="Company template documents" data-managed-document-create="true">
      <SectionHeader title="Company document templates" description="Use an active approved Word template with an authorized source and reviewed document-specific fields." />
      {!companyId && <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-xs text-slate-500">Sign in to load active company document templates.</div>}
      {companyId && loading && <div role="status" className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-5 text-xs text-slate-600"><Loader2 className="h-4 w-4 animate-spin text-indigo-600" />Loading active templates…</div>}
      {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs leading-5 text-rose-800">{error}</div>}
      {companyId && !loading && available.length === 0 && <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center"><FileText className="mx-auto h-7 w-7 text-slate-300" /><p className="mt-2 text-sm font-black text-slate-800">No active company templates yet</p><p className="mt-1 text-xs leading-5 text-slate-500">Create and activate a document type under Documents → Templates before generating a DOCX.</p></div>}
      {companyId && available.length > 0 && <>
        <div className="flex flex-wrap gap-2" data-managed-document-step="choose">{available.map((entry) => <button key={entry.type.key} type="button" onClick={() => chooseType(entry)} className={`min-w-[12rem] rounded-xl border px-3 py-3 text-left ${selectedKey === entry.type.key ? "border-indigo-300 bg-indigo-50" : "border-slate-200 bg-white"}`}><span className="block text-xs font-black text-slate-900">{typeLabel(entry.type)}</span><span className="mt-1 block text-[10px] text-slate-500">{sourceLabel(entry.type.sourceContext)} · v{entry.activeVersion.versionNumber}</span></button>)}</div>
        {selected && <div className="rounded-xl border border-slate-200 bg-white p-4" data-managed-document-step={step.toLowerCase()}>
          <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-[10px] font-black uppercase tracking-wide text-indigo-600">{typeLabel(selected.type)}</p><p className="mt-1 text-xs text-slate-600">Step {step === "SOURCE" ? "2" : step === "INPUT" ? "3" : step === "REVIEW" ? "4" : "1"} · {step === "SOURCE" ? "Choose an authorized source" : step === "INPUT" ? "Enter permitted fields" : step === "REVIEW" ? "Review and generate" : "Choose a document"}</p></div><span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] font-black text-emerald-800">Active template</span></div>
          {step === "SOURCE" && <div className="mt-4 space-y-3"><label><span className="field-label">Source {sourceLabel(selected.type.sourceContext)}</span><select className="field-input" value={sourceId} onChange={(event) => setSourceId(event.target.value)}><option value="">Choose a source</option>{sourceOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label><button type="button" disabled={!sourceId} onClick={() => setStep("INPUT")} className="rounded-lg bg-indigo-600 px-3 py-2 text-[11px] font-black text-white disabled:opacity-45">Review source</button></div>}
          {(step === "INPUT" || step === "REVIEW") && <div className="mt-4 space-y-4"><div className="rounded-lg border border-slate-100 bg-slate-50 p-3 text-[11px] leading-5 text-slate-600">Source values are loaded and rechecked on the server. Only the fields declared for this company document type can be entered here.</div>{selected.type.customFields.length > 0 && <div className="grid gap-3 sm:grid-cols-2">{selected.type.customFields.map((field) => <label key={field.key}><span className="field-label">{field.label}{field.required ? " *" : ""}</span>{field.type === "BOOLEAN" ? <input type="checkbox" checked={fields[field.key] === true} onChange={(event) => setFields((current) => ({ ...current, [field.key]: event.target.checked }))} className="mt-3 h-4 w-4" /> : <input required={field.required} type={field.type === "DATE" ? "date" : field.type === "NUMBER" ? "number" : "text"} className="field-input" value={inputValue(fields[field.key])} onChange={(event) => setFields((current) => ({ ...current, [field.key]: event.target.value }))} />}</label>)}</div>}{selected.type.repeatSections.map((section) => <div key={section.key} className="rounded-lg border border-slate-200 p-3"><div className="flex items-center justify-between gap-2"><div><p className="text-xs font-black text-slate-800">{section.label}</p><p className="text-[10px] text-slate-500">{section.source === "PROJECT_ASSETS" ? "Authorized project register context" : "Structured repeating input"}</p></div>{section.source === "INPUT" && <button type="button" onClick={() => addRepeatRow(section.key)} className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 px-2 py-1.5 text-[10px] font-black text-indigo-700"><Plus className="h-3 w-3" />Add row</button>}</div>{(repeats[section.key] || []).map((row, rowIndex) => <div key={rowIndex} className="mt-2 grid gap-2 sm:grid-cols-2">{section.fields.filter((field) => field.source === "INPUT").map((field) => <label key={field.key}><span className="field-label">{field.label}</span><input className="field-input" value={inputValue(row[field.key])} onChange={(event) => setRepeats((current) => ({ ...current, [section.key]: (current[section.key] || []).map((candidate, candidateIndex) => candidateIndex === rowIndex ? { ...candidate, [field.key]: event.target.value } : candidate) }))} /></label>)}</div>)}</div>)}<div className="flex flex-wrap justify-end gap-2"><button type="button" onClick={() => setStep(selected.type.sourceContext === "GENERAL" ? "INPUT" : "SOURCE")} className="rounded-lg border border-slate-200 px-3 py-2 text-[11px] font-bold text-slate-700">Back</button>{step === "INPUT" ? <button type="button" onClick={() => setStep("REVIEW")} className="rounded-lg bg-indigo-600 px-3 py-2 text-[11px] font-black text-white">Review</button> : <button type="button" disabled={busy} onClick={() => void generate()} className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-[11px] font-black text-white disabled:opacity-45">{busy ? "Generating…" : <><WandSparkles className="h-3.5 w-3.5" />Generate DOCX</>}</button>}</div></div>}
        </div>}
      </>}
    </section>
  );
}
