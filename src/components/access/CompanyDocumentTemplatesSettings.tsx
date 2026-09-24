import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, Copy, Download, FilePenLine, FilePlus2, LockKeyhole, RefreshCw, Search, Sparkles, Upload, WandSparkles, XCircle } from "lucide-react";
import { useOptionalCompanyAccess } from "../../context/CompanyAccessContext.tsx";
import { presentWorkspaceCopy } from "../../config/workspacePresentation.ts";
import {
  activateDocumentTemplate,
  analyzeDocumentTemplate,
  createStarterDocumentTemplate,
  downloadDocxBytes,
  downloadDocumentTemplate,
  duplicateDocumentTemplate,
  generateDocumentTemplateDocument,
  generateDocumentTemplatePdf,
  generateDocumentTemplateWithAi,
  getDocumentTemplatePdfCapability,
  listDocumentTemplates,
  listDocumentTemplateTypes,
  createDocumentTemplateType,
  updateDocumentTemplateType,
  retireDocumentTemplateType,
  prepareDocumentTemplate,
  retireDocumentTemplate,
  updateDocumentTemplateBindings,
  uploadDocumentTemplate,
  type DocumentTemplateRoot,
  type DocumentTemplateVersion,
  type DocumentTemplateTypeDefinitionApi,
} from "../../lib/documentTemplates.ts";
import type { DocumentTemplatePreparationPlan } from "../../server/documentTemplates/documentTemplateAutoTagger.ts";
import {
  getDocumentTemplateFieldCatalog,
  isSystemDocumentType,
  type DocumentTemplateBinding,
  type DocumentTemplateType,
} from "../../lib/documentTemplateRegistry.ts";
import type { DocumentTemplateTypeDefinition } from "../../lib/documentTemplateTypes.ts";
import type { FinancialDocumentSnapshot } from "../../lib/documentGeneration.ts";
import { downloadPdfBytes } from "../../lib/documentGeneration.ts";
import { loadDeploymentAiConfig } from "../../lib/deploymentAiApi.ts";
import { PERMISSION_KEYS } from "../../utils/accessControl.ts";
import { SectionHeader, StatusBadge, type StatusTone } from "../ui/OperationsUI.tsx";

interface CompanyDocumentTemplatesSettingsProps {
  demoMode?: boolean;
}

type Notice = { tone: "success" | "error" | "info"; text: string } | null;
type PdfCapabilityState = "CHECKING" | "AVAILABLE" | "UNAVAILABLE";
type TemplateActionCapability = { state: "CHECKING" | "AVAILABLE" | "UNAVAILABLE"; code?: string; message: string };

function typeLabel(documentType: DocumentTemplateType, definition?: Pick<DocumentTemplateTypeDefinition, "displayName">) {
  if (definition?.displayName) return definition.displayName;
  return documentType === "PURCHASE_ORDER" ? "Purchase Order" : documentType === "CLIENT_INVOICE" ? "Client Invoice" : documentType;
}

function systemTypeFallback(companyId: string): DocumentTemplateTypeDefinitionApi[] {
  return [
    { id: `system-${companyId}-po`, companyId, key: "PURCHASE_ORDER", displayName: "Purchase Order", sourceContext: "PURCHASE_ORDER", customFields: [], repeatSections: [], status: "ACTIVE", schemaVersion: "1" },
    { id: `system-${companyId}-invoice`, companyId, key: "CLIENT_INVOICE", displayName: "Client Invoice", sourceContext: "CLIENT_INVOICE", customFields: [], repeatSections: [], status: "ACTIVE", schemaVersion: "1" },
  ];
}

function statusTone(status: string, validationState: string): StatusTone {
  if (status === "ACTIVE" || validationState === "VALID") return "success";
  if (validationState === "BLOCKED") return "danger";
  if (status === "RETIRED") return "neutral";
  return "warning";
}

function statusLabel(version: DocumentTemplateVersion) {
  if (version.status === "ACTIVE") return "Active";
  if (version.status === "RETIRED") return "Retired";
  if (version.validationState === "VALID") return "Draft · valid";
  if (version.validationState === "WARNINGS") return "Draft · warnings";
  if (version.validationState === "BLOCKED") return "Draft · needs setup";
  return "Draft · not validated";
}

function previewSnapshot(documentType: DocumentTemplateType): FinancialDocumentSnapshot {
  if (documentType !== "PURCHASE_ORDER" && documentType !== "CLIENT_INVOICE") throw new Error("This preview is available only for system financial templates.");
  const company = { legalName: "Demo Construction Company", address: "Demo address", contactNumber: "09000000000", email: "demo@example.com", vatTin: "000-000-000-000", paymentInstructions: "Use the approved company payment account." };
  const lines = documentType === "PURCHASE_ORDER"
    ? [{ lineNumber: 1, description: "Concrete materials", quantity: 12, unit: "bags", unitPrice: 125, amount: 1500 }, { lineNumber: 2, description: "Steel supports", quantity: 3, unit: "pcs", unitPrice: 800, amount: 2400 }]
    : [{ lineNumber: 1, description: "Progress billing services", amount: 3900, notes: "Demo line" }];
  if (documentType === "PURCHASE_ORDER") return {
    documentType, documentId: "demo-po", documentNumber: "PO-DEMO-001", status: "DRAFT", issueDate: "2026-09-10", currency: "PHP", description: "Demo purchase order", notes: "Demo only", termsAndConditions: "Payment follows agreed terms.", company, supplier: { name: "Demo Supplier", address: "Supplier address", email: "supplier@example.com", phone: "09170000000", vatTin: "000-000-000-000", attention: "Purchasing" }, project: { projectCode: "DEMO-001", projectName: "Demo Project", deliverTo: "Demo site" }, lines, totalAmount: 3900, amountInWords: "three thousand nine hundred PHP only", processor: { name: "Demo User", title: "Coordinator" }, templateVersion: "demo",
  };
  return {
    documentType, documentId: "demo-invoice", documentNumber: "INV-DEMO-001", status: "DRAFT", invoiceDate: "2026-09-10", dueDate: "2026-10-10", paymentTerms: "30 days", currency: "PHP", taxTreatment: "NON_VAT", company, project: { projectCode: "DEMO-001", projectName: "Demo Project" }, billTo: { name: "Demo Client", contactName: "Accounts Payable", email: "client@example.com", address: "Client address", reference: "Demo contract" }, lines, subtotal: 3900, totalAmount: 3900, amountInWords: "three thousand nine hundred PHP only", notes: "Demo only", termsAndConditions: "Payment follows agreed terms.", processor: { name: "Demo User", title: "Coordinator" }, templateVersion: "demo",
  };
}

function bindingDraft(version: DocumentTemplateVersion, tags: readonly string[]): DocumentTemplateBinding[] {
  const existing = new Map(version.bindings.map((binding) => [binding.tag, binding]));
  return tags.filter((tag) => !tag.startsWith("#") && !tag.startsWith("/")).map((tag) => ({
    tag,
    fieldKey: existing.get(tag)?.fieldKey || "",
    ...(existing.get(tag)?.sourceLabel ? { sourceLabel: existing.get(tag)?.sourceLabel } : {}),
    ...(existing.get(tag)?.location ? { location: existing.get(tag)?.location } : {}),
    ...(existing.get(tag)?.confidence !== undefined ? { confidence: existing.get(tag)?.confidence } : {}),
    confirmed: existing.get(tag)?.confirmed !== false,
  }));
}

function TemplateCard({
  root,
  definition,
  canManage,
  storageCapability,
  aiCapability,
  onAction,
}: {
  root: DocumentTemplateRoot;
  definition?: DocumentTemplateTypeDefinitionApi;
  canManage: boolean;
  storageCapability: TemplateActionCapability;
  aiCapability: TemplateActionCapability;
  onAction: (action: string, version?: DocumentTemplateVersion) => void;
}) {
  const active = root.versions.find((version) => version.status === "ACTIVE");
  const latest = root.versions[0];
  const storageReady = storageCapability.state === "AVAILABLE";
  const aiReady = aiCapability.state === "AVAILABLE";
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm" data-document-template-type={root.documentType}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-indigo-600">{typeLabel(root.documentType, definition)}</p>
          <h3 className="mt-1 truncate text-sm font-black text-slate-950">{root.displayName}</h3>
          <p className="mt-1 text-[11px] text-slate-500">Variant {root.variantKey} · {root.versions.length} version{root.versions.length === 1 ? "" : "s"}</p>
        </div>
        {active ? <StatusBadge tone="success">Active v{active.versionNumber}</StatusBadge> : <StatusBadge tone="warning">No active version</StatusBadge>}
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <div className="rounded-lg border border-slate-100 bg-slate-50 p-3"><p className="text-[10px] font-black uppercase tracking-wide text-slate-500">Current template</p><p className="mt-1 text-xs font-bold text-slate-800">{active ? `${active.displayName} v${active.versionNumber}` : "Not activated"}</p><p className="mt-1 text-[10px] text-slate-500">{active ? `${active.origin} · ${active.contentSha256.slice(0, 12)}…` : "Use a starter, upload, or create a draft."}</p></div>
        <div className="rounded-lg border border-slate-100 bg-slate-50 p-3"><p className="text-[10px] font-black uppercase tracking-wide text-slate-500">Latest draft/version</p><p className="mt-1 text-xs font-bold text-slate-800">{latest ? `v${latest.versionNumber} · ${statusLabel(latest)}` : "No version yet"}</p><p className="mt-1 text-[10px] text-slate-500">Bytes are immutable; edits create a new version.</p></div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {isSystemDocumentType(root.documentType) && <button type="button" disabled={!canManage || !storageReady} title={!storageReady ? storageCapability.message : undefined} onClick={() => onAction("starter")} className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-[11px] font-black text-white disabled:cursor-not-allowed disabled:opacity-45"><FilePlus2 className="h-3.5 w-3.5" />Use starter</button>}
        <button type="button" disabled={!canManage || !storageReady} title={!storageReady ? storageCapability.message : undefined} onClick={() => onAction("upload")} className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-white px-3 py-2 text-[11px] font-black text-indigo-700 disabled:cursor-not-allowed disabled:opacity-45"><Upload className="h-3.5 w-3.5" />Upload DOCX</button>
        {isSystemDocumentType(root.documentType) && <button type="button" disabled={!canManage || !storageReady || !aiReady} title={!aiReady ? aiCapability.message : !storageReady ? storageCapability.message : undefined} onClick={() => onAction("ai")} className="inline-flex items-center gap-1.5 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-[11px] font-black text-violet-700 disabled:cursor-not-allowed disabled:opacity-45"><WandSparkles className="h-3.5 w-3.5" />Generate with AI</button>}
        {latest && <button type="button" disabled={!canManage || !storageReady} title={!storageReady ? storageCapability.message : undefined} onClick={() => onAction("duplicate", latest)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] font-bold text-slate-700 disabled:cursor-not-allowed disabled:opacity-45"><Copy className="h-3.5 w-3.5" />Duplicate latest</button>}
      </div>
      {active && <button type="button" onClick={() => onAction("select", active)} className="mt-3 inline-flex items-center gap-1.5 text-[11px] font-black text-indigo-700 hover:text-indigo-900"><FilePenLine className="h-3.5 w-3.5" />Inspect mappings and test active version</button>}
      {!canManage && <p className="mt-3 inline-flex items-center gap-1.5 text-[10px] text-slate-500"><LockKeyhole className="h-3 w-3" />Template administration is read-only for this account.</p>}
    </article>
  );
}

export function CompanyDocumentTemplatesSettings({ demoMode = false }: CompanyDocumentTemplatesSettingsProps) {
  const access = useOptionalCompanyAccess();
  const company = demoMode ? { id: "demo-company" } : access?.activeCompany;
  const canRead = demoMode || Boolean(access?.can(PERMISSION_KEYS.settingsRead));
  const canManage = demoMode || Boolean(access?.can(PERMISSION_KEYS.companyManage));
  const [templates, setTemplates] = useState<readonly DocumentTemplateRoot[]>([]);
  const [typeDefinitions, setTypeDefinitions] = useState<readonly DocumentTemplateTypeDefinitionApi[]>([]);
  const [selectedType, setSelectedType] = useState<DocumentTemplateType>("PURCHASE_ORDER");
  const [selectedVersion, setSelectedVersion] = useState<DocumentTemplateVersion | null>(null);
  const [analysis, setAnalysis] = useState<Awaited<ReturnType<typeof analyzeDocumentTemplate>> | null>(null);
  const [bindings, setBindings] = useState<DocumentTemplateBinding[]>([]);
  const [mappingSelections, setMappingSelections] = useState<Record<string, string>>({});
  const [fieldQuery, setFieldQuery] = useState("");
  const [aiOpen, setAiOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [pdfCapability, setPdfCapability] = useState<{ state: PdfCapabilityState; version?: string; message?: string }>({ state: "CHECKING" });
  const [templateStorageCapability, setTemplateStorageCapability] = useState<TemplateActionCapability>({ state: "CHECKING", message: "Checking template storage capability…" });
  const [aiCapability, setAiCapability] = useState<TemplateActionCapability>({ state: "CHECKING", message: "Checking AI provider capability…" });
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploadType, setUploadType] = useState<DocumentTemplateType>("PURCHASE_ORDER");
  const [typeEditorOpen, setTypeEditorOpen] = useState(false);
  const [typeDraft, setTypeDraft] = useState({ key: "", displayName: "", category: "", description: "", sourceContext: "PROJECT" as DocumentTemplateTypeDefinition["sourceContext"], customFields: [] as DocumentTemplateTypeDefinition["customFields"], repeatSections: [] as DocumentTemplateTypeDefinition["repeatSections"] });

  const refresh = async () => {
    if (!company || demoMode || !canRead) return;
    setBusy(true);
    try {
      const [loadedTemplates, loadedTypes] = await Promise.all([listDocumentTemplates(company.id), listDocumentTemplateTypes(company.id)]);
      setTemplates(loadedTemplates);
      setTypeDefinitions(loadedTypes.length ? loadedTypes : systemTypeFallback(company.id));
    }
    catch (error) { setNotice({ tone: "error", text: error instanceof Error ? error.message : "Document templates could not be loaded." }); }
    finally { setBusy(false); }
  };

  useEffect(() => { void refresh(); }, [company?.id, demoMode, canRead]);

  useEffect(() => {
    let cancelled = false;
    if (!company || demoMode || !canRead) {
      setPdfCapability({ state: "UNAVAILABLE", message: "A deployment capability check is required." });
      return () => { cancelled = true; };
    }
    setPdfCapability({ state: "CHECKING" });
    void getDocumentTemplatePdfCapability(company.id)
      .then((capability) => {
        if (cancelled) return;
        setPdfCapability({ state: capability.status, version: capability.converterVersion, message: capability.message });
        setTemplateStorageCapability(capability.templateStorage
          ? { state: capability.templateStorage.status, code: capability.templateStorage.code, message: capability.templateStorage.message }
          : { state: "UNAVAILABLE", code: "TEMPLATE_STORAGE_UNAVAILABLE", message: "This deployment did not report a usable server-side Storage capability." });
      })
      .catch(() => {
        if (!cancelled) {
          setPdfCapability({ state: "UNAVAILABLE", message: "The deployment could not verify its PDF converter." });
          setTemplateStorageCapability({ state: "UNAVAILABLE", code: "TEMPLATE_STORAGE_UNAVAILABLE", message: "The deployment could not verify server-side template storage." });
        }
      });
    return () => { cancelled = true; };
  }, [company?.id, demoMode, canRead]);

  useEffect(() => {
    let cancelled = false;
    if (!company || demoMode || !canRead) {
      setAiCapability({ state: "UNAVAILABLE", message: "AI template generation is not available in the demo workspace." });
      return () => { cancelled = true; };
    }
    setAiCapability({ state: "CHECKING", message: "Checking AI provider capability…" });
    void loadDeploymentAiConfig(company.id)
      .then((config) => {
        if (cancelled) return;
        const available = config.runtimeCapability?.status === "AVAILABLE";
        setAiCapability({
          state: available ? "AVAILABLE" : "UNAVAILABLE",
          code: config.runtimeCapability?.code,
          message: available
            ? config.runtimeCapability?.message || "AI runtime is ready for this company."
            : config.runtimeCapability?.message || "The server could not verify a usable company AI runtime.",
        });
      })
      .catch((error) => {
        if (!cancelled) setAiCapability({
          state: "UNAVAILABLE",
          message: error instanceof Error ? error.message : "AI configuration status is unavailable.",
        });
      });
    return () => { cancelled = true; };
  }, [company?.id, demoMode, canRead]);

  const visibleRoots = useMemo(() => templates.filter((root) => root.documentType === selectedType && (!query.trim() || `${root.displayName} ${root.variantKey}`.toLowerCase().includes(query.trim().toLowerCase()))), [query, selectedType, templates]);
  const availableDefinitions = typeDefinitions.length ? typeDefinitions : company ? systemTypeFallback(company.id) : [];
  const selectedDefinition = availableDefinitions.find((definition) => definition.key === selectedType);
  const selectedFields = selectedVersion ? getDocumentTemplateFieldCatalog(selectedVersion.documentType, selectedDefinition) : [];
  const templateStorageReady = templateStorageCapability.state === "AVAILABLE";
  const aiReady = aiCapability.state === "AVAILABLE";

  if (!company || !canRead) return null;

  const run = async (operation: () => Promise<void>, success: string) => {
    if (!canManage || busy) return;
    setBusy(true);
    setNotice(null);
    try { await operation(); setNotice({ tone: "success", text: success }); await refresh(); }
    catch (error) { setNotice({ tone: "error", text: error instanceof Error ? error.message : "The document-template operation failed safely." }); }
    finally { setBusy(false); }
  };

  const createType = () => void run(async () => {
    const created = await createDocumentTemplateType(company.id, { key: typeDraft.key.trim(), displayName: typeDraft.displayName.trim(), ...(typeDraft.category.trim() ? { category: typeDraft.category.trim() } : {}), ...(typeDraft.description.trim() ? { description: typeDraft.description.trim() } : {}), sourceContext: typeDraft.sourceContext, customFields: [...typeDraft.customFields], repeatSections: [...typeDraft.repeatSections], status: "ACTIVE" });
    setTypeDefinitions((current) => [...current.filter((definition) => definition.key !== created.key), created]);
    setSelectedType(created.key);
    setUploadType(created.key);
    setTypeEditorOpen(false);
    setTypeDraft({ key: "", displayName: "", category: "", description: "", sourceContext: "PROJECT", customFields: [], repeatSections: [] });
  }, "The new company document type is ready for its DOCX template.");

  const setAnalysisResult = (result: Awaited<ReturnType<typeof analyzeDocumentTemplate>>) => {
    setAnalysis(result);
    const defaults: Record<string, string> = {};
    for (const proposal of result.analysis.mappings) if (proposal.anchorId && proposal.fieldKey && !proposal.unresolved) defaults[proposal.anchorId] = proposal.fieldKey;
    for (const column of result.analysis.lineTable?.columns || []) defaults[`line:${column.columnIndex}`] = column.fieldKey;
    setMappingSelections(defaults);
    if (result.aiStatus === "AVAILABLE") setAiCapability({ state: "AVAILABLE", message: "AI runtime is ready for this company." });
  };

  const createStarter = () => void run(async () => { if (!isSystemDocumentType(selectedType)) throw new Error("Starter templates are available only for core system workflows."); const version = await createStarterDocumentTemplate(company.id, { documentType: selectedType }); setSelectedVersion(version); setBindings([...version.bindings]); }, `The ${typeLabel(selectedType, selectedDefinition)} starter template is ready as a draft. Review it before activation.`);
  const upload = async (file: File) => {
    if (!canManage) return;
    setBusy(true); setNotice(null);
    try {
      const version = await uploadDocumentTemplate(company.id, { documentType: uploadType, file });
      setSelectedVersion(version); setBindings([]); setAnalysis(null); setMappingSelections({}); setNotice({ tone: "info", text: presentWorkspaceCopy("The original DOCX was preserved as a draft. Review the detected mappings, then prepare a new tagged draft inside HydroQualiSense.") });
      await refresh();
      try { setAnalysisResult(await analyzeDocumentTemplate(company.id, version.id)); }
      catch { /* AI is optional; the manual field-reference route remains available. */ }
    } catch (error) { setNotice({ tone: "error", text: error instanceof Error ? error.message : "The DOCX could not be uploaded safely." }); }
    finally { setBusy(false); }
  };
  const generateAi = () => void run(async () => { if (!isSystemDocumentType(selectedType)) throw new Error("AI blueprint generation is available only for core system workflows."); const version = await generateDocumentTemplateWithAi(company.id, { documentType: selectedType, prompt: aiPrompt }); setSelectedVersion(version); setBindings([...version.bindings]); setAiOpen(false); setAiPrompt(""); }, "The AI-generated DOCX is a validated draft. Preview and activate it only after human review.");
  const duplicate = (version: DocumentTemplateVersion) => void run(async () => { const copied = await duplicateDocumentTemplate(company.id, version.id); setSelectedVersion(copied); setBindings([...copied.bindings]); }, "A new immutable draft version was created from the selected template.");
  const inspect = (version: DocumentTemplateVersion) => { setSelectedVersion(version); setBindings([...version.bindings]); setAnalysis(null); setMappingSelections({}); setNotice(null); };
  const saveBindings = () => void run(async () => { if (!selectedVersion) return; const result = await updateDocumentTemplateBindings(company.id, selectedVersion.id, bindings); setSelectedVersion(result.version); setBindings([...result.version.bindings]); }, "Mappings saved and the template was revalidated. Activation remains a separate confirmation.");
  const activate = () => void run(async () => { if (!selectedVersion) return; const activated = await activateDocumentTemplate(company.id, selectedVersion.id); setSelectedVersion(activated); }, "The validated template is now active for new issued documents.");
  const retire = () => void run(async () => { if (!selectedVersion) return; const retired = await retireDocumentTemplate(company.id, selectedVersion.id); setSelectedVersion(retired); }, "The template version was retired. Historical generated documents remain pinned.");
  const analyze = () => void run(async () => { if (!selectedVersion) return; setAnalysisResult(await analyzeDocumentTemplate(company.id, selectedVersion.id)); }, "Analysis completed as a proposal. Review the mappings, then prepare a new draft.");
  const prepare = () => void run(async () => {
    if (!selectedVersion || !analysis) return;
    const mappings = analysis.analysis.mappings.flatMap((proposal) => {
      if (!proposal.anchorId || proposal.unresolved) return [];
      const fieldKey = mappingSelections[proposal.anchorId] || proposal.fieldKey;
      if (!fieldKey || !proposal.targetText) return [];
      return [{ fieldKey, anchorId: proposal.anchorId, targetText: proposal.targetText, confidence: proposal.confidence, sourceLabel: proposal.sourceLabel, reason: proposal.reason, confirmed: true }];
    });
    const lineTable = analysis.analysis.lineTable?.candidateId
      ? {
        candidateId: analysis.analysis.lineTable.candidateId,
        columns: (analysis.analysis.lineTable.columns || []).map((column) => ({ columnIndex: column.columnIndex, fieldKey: mappingSelections[`line:${column.columnIndex}`] || column.fieldKey })),
      }
      : undefined;
    const plan: DocumentTemplatePreparationPlan = { documentType: selectedVersion.documentType, mappings, ...(lineTable ? { lineTable } : {}) };
    const result = await prepareDocumentTemplate(company.id, selectedVersion.id, plan);
    setSelectedVersion(result.version);
    setBindings([...result.version.bindings]);
    setAnalysis(null);
    setMappingSelections({});
  }, "A new tagged draft was created from the reviewed mappings. The original upload remains unchanged.");
  const download = () => void (async () => { if (!selectedVersion) return; setBusy(true); try { const result = await downloadDocumentTemplate(company.id, selectedVersion.id); downloadDocxBytes(result.bytes, result.fileName); } catch (error) { setNotice({ tone: "error", text: error instanceof Error ? error.message : "The DOCX could not be downloaded." }); } finally { setBusy(false); } })();
  const test = () => void (async () => { if (!selectedVersion) return; setBusy(true); setNotice(null); try { const result = await generateDocumentTemplateDocument(company.id, selectedVersion.id, { documentType: selectedVersion.documentType, previewSnapshot: previewSnapshot(selectedVersion.documentType) }); downloadDocxBytes(result.bytes, result.fileName); setNotice({ tone: "success", text: "A non-authoritative test DOCX was generated from demo snapshot data. No financial record was issued or changed." }); } catch (error) { setNotice({ tone: "error", text: error instanceof Error ? error.message : "The test DOCX could not be generated." }); } finally { setBusy(false); } })();
  const testPdf = () => void (async () => { if (!selectedVersion) return; setBusy(true); setNotice(null); try { const result = await generateDocumentTemplatePdf(company.id, selectedVersion.id, { documentType: selectedVersion.documentType, previewSnapshot: previewSnapshot(selectedVersion.documentType) }); downloadPdfBytes(result.bytes, result.fileName); setNotice({ tone: "success", text: "A non-authoritative final PDF was generated from demo snapshot data. No financial record was issued or changed." }); } catch (error) { setNotice({ tone: "error", text: error instanceof Error ? error.message : "The final PDF could not be generated safely." }); } finally { setBusy(false); } })();

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5" aria-labelledby="company-document-templates-title" data-document-template-settings="true" data-demo-mode={demoMode ? "true" : "false"}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700"><FilePenLine className="h-5 w-5" /></div><div className="min-w-0"><p id="company-document-templates-title" className="text-sm font-black text-slate-950">Document templates</p><p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">Keep each company’s editable Word design while {presentWorkspaceCopy("HydroQualiSense")} merges deterministic values from the authoritative Purchase Order or Client Invoice snapshot.</p></div></div>
        <div className="flex items-center gap-2">{!demoMode && <button type="button" onClick={() => void refresh()} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[10px] font-bold text-slate-600 disabled:opacity-45"><RefreshCw className={`h-3.5 w-3.5 ${busy ? "animate-spin" : ""}`} />Refresh</button>}{!canManage && <StatusBadge tone="neutral">Read-only</StatusBadge>}</div>
      </div>

      {demoMode && <div className="mt-4 rounded-lg border border-indigo-100 bg-indigo-50/60 px-3 py-2.5 text-[11px] leading-5 text-indigo-950">Demo preview: template administration is shown for discoverability, while DOCX persistence and company data remain disabled in the local sample workspace.</div>}
      {!demoMode && templateStorageCapability.state === "CHECKING" && <div role="status" className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-700" data-template-storage-capability="checking">Checking server-side template storage before enabling template actions…</div>}
      {!demoMode && templateStorageCapability.state === "UNAVAILABLE" && <div role="alert" className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs leading-5 text-amber-950" data-template-storage-capability="unavailable"><strong>Template storage is unavailable.</strong> {templateStorageCapability.message} Starter creation, DOCX upload, and template duplication are disabled until the deployment prerequisite is restored.</div>}
      {!demoMode && aiCapability.state === "CHECKING" && <div role="status" className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-700" data-template-ai-capability="checking">Checking the company AI runtime before enabling AI template generation…</div>}
      {!demoMode && aiCapability.state === "UNAVAILABLE" && <div role="status" className="mt-3 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2.5 text-xs leading-5 text-violet-950" data-template-ai-capability="unavailable"><strong>AI template generation is unavailable.</strong> {aiCapability.message} Starter and Upload remain separate from this provider.</div>}
      {notice && <div role={notice.tone === "error" ? "alert" : "status"} className={`mt-4 flex items-start gap-2 rounded-lg border px-3 py-2.5 text-xs leading-5 ${notice.tone === "error" ? "border-rose-200 bg-rose-50 text-rose-800" : notice.tone === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-indigo-200 bg-indigo-50 text-indigo-900"}`}>{notice.tone === "error" ? <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />}<span>{notice.text}</span></div>}
      {typeEditorOpen && canManage && <form className="mt-4 rounded-xl border border-indigo-200 bg-indigo-50/50 p-4" onSubmit={(event) => { event.preventDefault(); void createType(); }} data-document-template-type-editor="true"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-black text-indigo-950">New template type</p><p className="mt-1 text-[11px] leading-5 text-indigo-900/75">Define a business document once; future templates use this type without an application change.</p></div><button type="button" onClick={() => setTypeEditorOpen(false)} className="rounded-lg p-1.5 text-indigo-700 hover:bg-white" aria-label="Close new template type form"><XCircle className="h-4 w-4" /></button></div><div className="mt-3 grid gap-3 sm:grid-cols-2"><label><span className="field-label">Business name</span><input required className="field-input" value={typeDraft.displayName} onChange={(event) => setTypeDraft((current) => ({ ...current, displayName: event.target.value }))} placeholder="Warranty Certificate" /></label><label><span className="field-label">Stable key</span><input required pattern="[A-Za-z][A-Za-z0-9_-]{1,79}" className="field-input" value={typeDraft.key} onChange={(event) => setTypeDraft((current) => ({ ...current, key: event.target.value }))} placeholder="warranty-certificate" /></label><label><span className="field-label">Category</span><input className="field-input" value={typeDraft.category} onChange={(event) => setTypeDraft((current) => ({ ...current, category: event.target.value }))} placeholder="Project operations" /></label><label><span className="field-label">Source context</span><select className="field-input" value={typeDraft.sourceContext} onChange={(event) => setTypeDraft((current) => ({ ...current, sourceContext: event.target.value as DocumentTemplateTypeDefinition["sourceContext"] }))}><option value="PROJECT">Project</option><option value="GENERAL">Company fields and inputs</option><option value="PURCHASE_ORDER">Purchase Order</option><option value="CLIENT_INVOICE">Client Invoice</option></select></label><label className="sm:col-span-2"><span className="field-label">Description</span><textarea className="field-input min-h-20" value={typeDraft.description} onChange={(event) => setTypeDraft((current) => ({ ...current, description: event.target.value }))} placeholder="What this document is used for" /></label></div><div className="mt-3 rounded-lg border border-indigo-100 bg-white p-3"><div className="flex items-center justify-between gap-2"><div><p className="text-[11px] font-black text-slate-800">Structured fields</p><p className="text-[10px] text-slate-500">Values that are specific to this document, not a second business record.</p></div><button type="button" onClick={() => setTypeDraft((current) => ({ ...current, customFields: [...current.customFields, { key: `custom.field_${current.customFields.length + 1}`, label: "New field", type: "TEXT", required: false }] }))} className="rounded-lg border border-indigo-200 px-2.5 py-1.5 text-[10px] font-black text-indigo-700">Add field</button></div>{typeDraft.customFields.map((field, index) => <div key={field.key} className="mt-2 grid gap-2 sm:grid-cols-[1.2fr_1fr_auto]"><input aria-label={`Field ${index + 1} label`} className="field-input" value={field.label} onChange={(event) => setTypeDraft((current) => ({ ...current, customFields: current.customFields.map((candidate, candidateIndex) => candidateIndex === index ? { ...candidate, label: event.target.value } : candidate) }))} /><select aria-label={`Field ${index + 1} type`} className="field-input" value={field.type} onChange={(event) => setTypeDraft((current) => ({ ...current, customFields: current.customFields.map((candidate, candidateIndex) => candidateIndex === index ? { ...candidate, type: event.target.value as any } : candidate) }))}><option value="TEXT">Text</option><option value="DATE">Date</option><option value="NUMBER">Number</option><option value="BOOLEAN">Yes / No</option><option value="SELECT">Choice</option></select><button type="button" onClick={() => setTypeDraft((current) => ({ ...current, customFields: current.customFields.filter((_, candidateIndex) => candidateIndex !== index) }))} className="rounded-lg border border-slate-200 px-2 text-[10px] text-slate-600">Remove</button></div>)}</div><div className="mt-3 rounded-lg border border-indigo-100 bg-white p-3"><div className="flex items-center justify-between gap-2"><div><p className="text-[11px] font-black text-slate-800">Repeating sections</p><p className="text-[10px] text-slate-500">Use this for checklist rows or other structured lists.</p></div><button type="button" onClick={() => setTypeDraft((current) => ({ ...current, repeatSections: [...current.repeatSections, { key: `items_${current.repeatSections.length + 1}`, label: "Items", source: "INPUT", fields: [{ key: "item", label: "Item", type: "TEXT", required: true, source: "INPUT" }] }] }))} className="rounded-lg border border-indigo-200 px-2.5 py-1.5 text-[10px] font-black text-indigo-700">Add section</button></div>{typeDraft.repeatSections.map((section) => <p key={section.key} className="mt-2 rounded-md bg-slate-50 px-2 py-1.5 text-[10px] text-slate-700">{section.label} · {section.fields.length} field{section.fields.length === 1 ? "" : "s"}</p>)}</div><div className="mt-3 flex justify-end gap-2"><button type="button" onClick={() => setTypeEditorOpen(false)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] font-bold text-slate-700">Cancel</button><button type="submit" disabled={busy || !typeDraft.key.trim() || !typeDraft.displayName.trim()} className="rounded-lg bg-indigo-600 px-3 py-2 text-[11px] font-black text-white disabled:opacity-45">Create type</button></div></form>}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5" data-document-pdf-capability={pdfCapability.state.toLowerCase()}><div><p className="text-[10px] font-black uppercase tracking-wide text-slate-500">Final PDF conversion</p><p className="mt-1 text-[11px] text-slate-600">{pdfCapability.state === "UNAVAILABLE" ? (pdfCapability.message || "High-fidelity PDF conversion is unavailable on this deployment. Use the existing programmatic PDF fallback for final PDF output.") : "Uses the exact merged DOCX on the server; the existing programmatic PDF fallback remains available when needed."}</p></div><StatusBadge tone={pdfCapability.state === "AVAILABLE" ? "success" : pdfCapability.state === "CHECKING" ? "neutral" : "warning"}>{pdfCapability.state === "AVAILABLE" ? `Available${pdfCapability.version ? ` · ${pdfCapability.version}` : ""}` : pdfCapability.state === "CHECKING" ? "Checking" : "Unavailable"}</StatusBadge></div>
      <div className="mt-5 flex flex-wrap items-center gap-2 border-b border-slate-100 pb-3"><div className="flex rounded-lg bg-slate-100 p-1">{availableDefinitions.map((definition) => <button key={definition.key} type="button" onClick={() => { setSelectedType(definition.key); setSelectedVersion(null); setAnalysis(null); setMappingSelections({}); }} className={`rounded-md px-3 py-1.5 text-[11px] font-black ${selectedType === definition.key ? "bg-white text-indigo-700 shadow-sm" : "text-slate-500"}`}>{typeLabel(definition.key, definition)}</button>)}</div>{canManage && <button type="button" onClick={() => setTypeEditorOpen(true)} className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-[11px] font-black text-white"><FilePlus2 className="h-3.5 w-3.5" />New template type</button>}<label className="ml-auto flex min-w-[200px] items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5"><Search className="h-3.5 w-3.5 text-slate-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search templates" className="w-full bg-transparent text-[11px] outline-none" /></label></div>

      {demoMode ? <div className="mt-4 grid gap-3 lg:grid-cols-2">{availableDefinitions.map((definition) => <article key={definition.key} className="rounded-xl border border-slate-200 bg-slate-50/60 p-4"><p className="text-[10px] font-black uppercase tracking-wide text-indigo-600">{typeLabel(definition.key, definition)}</p><h3 className="mt-1 text-sm font-black text-slate-900">{presentWorkspaceCopy("HydroQualiSense")} starter</h3><p className="mt-1 text-[11px] leading-5 text-slate-600">Editable DOCX foundation with company, {definition.sourceContext === "PURCHASE_ORDER" ? "supplier, project, and line-item" : definition.sourceContext === "PROJECT" ? "project and structured fields" : "company and structured fields"} bindings.</p><div className="mt-3 flex flex-wrap gap-2"><StatusBadge tone="success">Available</StatusBadge><StatusBadge tone="neutral">Word editable</StatusBadge></div><div className="mt-4 flex flex-wrap gap-2"><button type="button" disabled className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-[11px] font-black text-white opacity-50"><FilePlus2 className="h-3.5 w-3.5" />Use starter</button><button type="button" disabled className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] font-bold text-slate-500 opacity-60"><Upload className="h-3.5 w-3.5" />Upload existing DOCX</button><button type="button" disabled className="inline-flex items-center gap-1.5 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-[11px] font-black text-violet-700 opacity-60"><Sparkles className="h-3.5 w-3.5" />Generate with AI</button></div></article>)}</div>
        : visibleRoots.length ? <div className="mt-4 grid gap-3 lg:grid-cols-2">{visibleRoots.map((root) => <TemplateCard key={root.id} root={root} definition={availableDefinitions.find((candidate) => candidate.key === root.documentType)} canManage={canManage} storageCapability={templateStorageCapability} aiCapability={aiCapability} onAction={(action, version) => { if (action === "starter") createStarter(); else if (action === "upload") { setUploadType(root.documentType); inputRef.current?.click(); } else if (action === "ai") { setSelectedType(root.documentType); setAiOpen(true); } else if (action === "duplicate" && version) duplicate(version); else if (action === "select" && version) inspect(version); }} />)}</div>
          : <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50/70 p-8 text-center"><FilePenLine className="mx-auto h-8 w-8 text-slate-300" /><p className="mt-3 text-sm font-black text-slate-700">No {typeLabel(selectedType, selectedDefinition)} template yet</p><p className="mt-1 text-xs text-slate-500">Upload the company Word form to create a reviewed immutable template version.</p><div className="mt-4 flex flex-wrap justify-center gap-2">{isSystemDocumentType(selectedType) && <button type="button" disabled={!canManage || busy || !templateStorageReady} onClick={createStarter} className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-[11px] font-black text-white disabled:opacity-45"><FilePlus2 className="h-3.5 w-3.5" />Use starter</button>}<button type="button" disabled={!canManage || busy || !templateStorageReady} title={!templateStorageReady ? templateStorageCapability.message : undefined} onClick={() => { setUploadType(selectedType); inputRef.current?.click(); }} className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-white px-3 py-2 text-[11px] font-black text-indigo-700 disabled:opacity-45"><Upload className="h-3.5 w-3.5" />Upload DOCX</button>{isSystemDocumentType(selectedType) && <button type="button" disabled={!canManage || busy || !templateStorageReady || !aiReady} onClick={() => setAiOpen(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-[11px] font-black text-violet-700 disabled:opacity-45"><WandSparkles className="h-3.5 w-3.5" />Generate with AI</button>}</div></div>}

      <input ref={inputRef} type="file" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void upload(file); }} />

      {aiOpen && <div className="mt-4 rounded-xl border border-violet-200 bg-violet-50/50 p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-black text-violet-950">Generate an editable {typeLabel(selectedType)} DOCX</p><p className="mt-1 text-[11px] leading-5 text-violet-900/75">{presentWorkspaceCopy("AI may design presentation only. HydroQualiSense will validate the blueprint and merge authoritative snapshot values later.")}</p></div><button type="button" onClick={() => setAiOpen(false)} className="rounded-lg p-1.5 text-violet-700 hover:bg-white" aria-label="Close AI template form"><XCircle className="h-4 w-4" /></button></div><textarea value={aiPrompt} onChange={(event) => setAiPrompt(event.target.value)} maxLength={4000} rows={4} className="mt-3 w-full rounded-lg border border-violet-200 bg-white px-3 py-2.5 text-xs text-slate-900 outline-none focus:border-violet-400" placeholder={`Create a professional ${typeLabel(selectedType)} for our construction company. Include company branding, parties, project/site, line items, totals, terms, and approval/signature areas.`} /><div className="mt-3 flex justify-end"><button type="button" onClick={generateAi} disabled={!canManage || busy || !aiPrompt.trim()} className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-2 text-[11px] font-black text-white disabled:opacity-45"><WandSparkles className="h-3.5 w-3.5" />{busy ? "Generating…" : "Create draft DOCX"}</button></div></div>}

      {selectedVersion && !demoMode && <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50/60 p-4" data-document-template-editor="true"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-wide text-indigo-600">Template version v{selectedVersion.versionNumber}</p><h3 className="mt-1 text-sm font-black text-slate-950">{selectedVersion.displayName}</h3><p className="mt-1 text-[10px] text-slate-500">{selectedVersion.origin} · SHA-256 {selectedVersion.contentSha256.slice(0, 16)}… · {statusLabel(selectedVersion)}</p></div><StatusBadge tone={statusTone(selectedVersion.status, selectedVersion.validationState)}>{statusLabel(selectedVersion)}</StatusBadge></div>
        <div className="mt-4 flex flex-wrap gap-2"><button type="button" onClick={download} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] font-bold text-slate-700 disabled:opacity-45"><Download className="h-3.5 w-3.5" />Advanced fallback: edit in Word</button><button type="button" onClick={analyze} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-white px-3 py-2 text-[11px] font-black text-indigo-700 disabled:opacity-45"><Sparkles className="h-3.5 w-3.5" />Analyze with AI</button><button type="button" onClick={test} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-[11px] font-black text-white disabled:opacity-45"><FilePenLine className="h-3.5 w-3.5" />Test DOCX</button><button type="button" onClick={testPdf} disabled={busy || pdfCapability.state !== "AVAILABLE" || selectedVersion.validationState !== "VALID"} className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] font-black text-emerald-800 disabled:opacity-45"><Download className="h-3.5 w-3.5" />Test final PDF</button>{selectedVersion.status !== "ACTIVE" && <button type="button" onClick={activate} disabled={busy || selectedVersion.validationState !== "VALID"} className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] font-black text-emerald-800 disabled:opacity-45"><CheckCircle2 className="h-3.5 w-3.5" />Activate</button>}{selectedVersion.status === "ACTIVE" && <button type="button" onClick={retire} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-black text-amber-800 disabled:opacity-45">Retire</button>}{selectedVersion.status !== "RETIRED" && <button type="button" onClick={() => duplicate(selectedVersion)} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] font-bold text-slate-700 disabled:opacity-45"><Copy className="h-3.5 w-3.5" />Duplicate</button>}</div>
        <div className="mt-4 grid gap-4 xl:grid-cols-[1.1fr_0.9fr]"><div>
          {analysis?.analysis && (analysis.analysis.mappings.some((proposal) => Boolean(proposal.anchorId)) || Boolean(analysis.analysis.lineTable)) && <div className="rounded-lg border border-violet-200 bg-violet-50/60 p-3" data-template-mapping-review="true"><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-xs font-black text-violet-950">Review detected mappings</p><p className="mt-1 text-[10px] leading-4 text-violet-900/75">Choose only allowlisted application fields. Applying mappings creates a new tagged draft; the uploaded version stays unchanged.</p></div><button type="button" onClick={prepare} disabled={busy} className="rounded-lg bg-violet-700 px-3 py-2 text-[11px] font-black text-white disabled:opacity-45">Prepare template</button></div><div className="mt-3 space-y-2">{analysis.analysis.mappings.filter((proposal) => Boolean(proposal.anchorId)).map((proposal, index) => { const key = proposal.anchorId || `${proposal.sourceLabel}-${index}`; const selectedField = mappingSelections[key] || proposal.fieldKey || ""; return <label key={`${key}-${index}`} className="grid gap-1 rounded-lg border border-violet-100 bg-white p-2.5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] sm:items-center"><span className="min-w-0 text-[10px] text-slate-700"><span className="font-bold">{proposal.sourceLabel}</span><span className="block truncate text-slate-400">{proposal.targetText || proposal.location} · {Math.round(proposal.confidence * 100)}% · {proposal.reason}</span></span><select value={selectedField} onChange={(event) => setMappingSelections((current) => ({ ...current, [key]: event.target.value }))} className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-[10px] font-semibold text-slate-800"><option value="">Leave unresolved</option>{selectedFields.filter((field) => !field.collection).map((field) => <option key={field.key} value={field.key}>{field.label} · {field.key}</option>)}</select></label>; })}</div>{analysis.analysis.lineTable && <div className="mt-3 border-t border-violet-100 pt-3"><p className="text-[10px] font-black text-violet-950">Repeating line table</p><div className="mt-2 grid gap-2">{(analysis.analysis.lineTable.columns || []).map((column) => <label key={column.columnIndex} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-center gap-2 text-[10px]"><span>Column {column.columnIndex + 1}</span><select value={mappingSelections[`line:${column.columnIndex}`] || column.fieldKey} onChange={(event) => setMappingSelections((current) => ({ ...current, [`line:${column.columnIndex}`]: event.target.value }))} className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-[10px] text-slate-700">{selectedFields.filter((field) => field.collection).map((field) => <option key={field.key} value={field.key}>{field.label}</option>)}</select></label>)}</div></div>}</div>}
          <div className="mt-4 flex items-center justify-between gap-2"><div><p className="text-xs font-black text-slate-900">Confirmed merge bindings</p><p className="mt-1 text-[10px] leading-4 text-slate-500">Only allowlisted fields can be saved. AI proposals remain separate until you confirm them.</p></div><button type="button" onClick={saveBindings} disabled={busy || selectedVersion.status !== "DRAFT"} className="rounded-lg bg-slate-900 px-3 py-2 text-[11px] font-black text-white disabled:opacity-45">Save &amp; validate</button></div>{analysis?.structure?.tags?.length ? <div className="mt-3 space-y-2">{bindingDraft(selectedVersion, analysis.structure.tags).map((binding, index) => <label key={`${binding.tag}-${index}`} className="grid gap-1 rounded-lg border border-slate-200 bg-white p-2.5 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] sm:items-center"><span className="truncate font-mono text-[10px] text-slate-600">{`{{${binding.tag}}}`}</span><select value={bindings.find((candidate) => candidate.tag === binding.tag)?.fieldKey || binding.fieldKey} onChange={(event) => setBindings((current) => [...current.filter((candidate) => candidate.tag !== binding.tag), { ...binding, fieldKey: event.target.value, confirmed: true }])} className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-[10px] font-semibold text-slate-800"><option value="">Select an application field</option>{selectedFields.map((field) => <option key={field.key} value={field.key}>{field.label} · {field.key}</option>)}</select></label>)}</div> : <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-[11px] leading-5 text-amber-900">No supported tags are present yet. Review the detected fields above and use <strong>Prepare template</strong>. If the layout cannot be safely transformed, use the advanced Word fallback.</div>}</div>
          <div className="rounded-lg border border-slate-200 bg-white p-3"><p className="text-xs font-black text-slate-900">Validation and proposals</p><p className="mt-1 text-[10px] leading-4 text-slate-500">Activation is blocked until required fields, repeating rows, and mappings pass application validation.</p>{Array.isArray(selectedVersion.validationReport?.issues) && <ul className="mt-3 space-y-1.5 text-[10px] leading-4">{(selectedVersion.validationReport.issues as any[]).slice(0, 8).map((issue, index) => <li key={`${issue.code}-${index}`} className={issue.severity === "ERROR" ? "text-rose-700" : "text-amber-700"}>{issue.severity}: {issue.message}</li>)}</ul>}{analysis?.analysis && <div className="mt-3 border-t border-slate-100 pt-3"><p className="text-[10px] font-black uppercase tracking-wide text-violet-700">{analysis.aiStatus === "AVAILABLE" ? "AI proposals" : "Manual fallback"}</p><ul className="mt-2 space-y-2 text-[10px] leading-4 text-slate-700">{analysis.analysis.mappings.slice(0, 8).map((proposal: any, index: number) => <li key={`${proposal.sourceLabel}-${index}`}><span className="font-bold">{proposal.sourceLabel}</span> → <span className="font-mono">{proposal.fieldKey || "unresolved"}</span><span className="text-slate-400"> · {Math.round(proposal.confidence * 100)}% · {proposal.reason}</span></li>)}</ul>{analysis.message && <p className="mt-2 text-[10px] text-amber-700">{analysis.message}</p>}</div>}{<details className="mt-3 border-t border-slate-100 pt-3"><summary className="cursor-pointer text-[10px] font-black text-indigo-700">Field reference</summary><label className="mt-2 flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5"><Search className="h-3 w-3 text-slate-400" /><input value={fieldQuery} onChange={(event) => setFieldQuery(event.target.value)} placeholder="Search allowed fields" className="w-full bg-transparent text-[10px] outline-none" /></label><div className="mt-2 max-h-36 space-y-1 overflow-y-auto">{selectedFields.filter((field) => `${field.key} ${field.label} ${field.description}`.toLowerCase().includes(fieldQuery.trim().toLowerCase())).map((field) => <div key={field.key} className="rounded-md bg-slate-50 px-2 py-1.5 text-[10px]"><p className="font-mono font-bold text-slate-700">{field.key}{field.collection ? "[]" : ""}</p><p className="text-slate-500">{field.label} · {field.type} · {field.required ? "required" : "optional"}</p></div>)}</div></details>}</div></div>
      </div>}

      {!demoMode && templates.length > 0 && <details className="mt-5 border-t border-slate-100 pt-4"><summary className="cursor-pointer text-[11px] font-black text-indigo-700">Version history</summary><div className="mt-3 grid gap-2 sm:grid-cols-2">{templates.filter((root) => root.documentType === selectedType).flatMap((root) => root.versions).map((version) => <button key={version.id} type="button" onClick={() => inspect(version)} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-left hover:border-indigo-200"><span className="min-w-0"><span className="block truncate text-[11px] font-bold text-slate-800">v{version.versionNumber} · {version.displayName}</span><span className="block text-[10px] text-slate-500">{version.origin} · {statusLabel(version)}</span></span><span className="text-[10px] font-black text-indigo-700">Inspect</span></button>)}</div></details>}
    </section>
  );
}

export default CompanyDocumentTemplatesSettings;
