import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, Copy, Download, FilePenLine, FilePlus2, LockKeyhole, RefreshCw, Search, Sparkles, Upload, WandSparkles, XCircle } from "lucide-react";
import { useOptionalCompanyAccess } from "../../context/CompanyAccessContext.tsx";
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
  retireDocumentTemplate,
  updateDocumentTemplateBindings,
  uploadDocumentTemplate,
  type DocumentTemplateRoot,
  type DocumentTemplateVersion,
} from "../../lib/documentTemplates.ts";
import {
  DOCUMENT_TEMPLATE_TYPES,
  getDocumentTemplateFields,
  type DocumentTemplateBinding,
  type DocumentTemplateType,
} from "../../lib/documentTemplateRegistry.ts";
import type { FinancialDocumentSnapshot } from "../../lib/documentGeneration.ts";
import { downloadPdfBytes } from "../../lib/documentGeneration.ts";
import { PERMISSION_KEYS } from "../../utils/accessControl.ts";
import { SectionHeader, StatusBadge, type StatusTone } from "../ui/OperationsUI.tsx";

interface CompanyDocumentTemplatesSettingsProps {
  demoMode?: boolean;
}

type Notice = { tone: "success" | "error" | "info"; text: string } | null;
type PdfCapabilityState = "CHECKING" | "AVAILABLE" | "UNAVAILABLE";

function typeLabel(documentType: DocumentTemplateType) {
  return documentType === "PURCHASE_ORDER" ? "Purchase Order" : "Client Invoice";
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
  canManage,
  onAction,
}: {
  root: DocumentTemplateRoot;
  canManage: boolean;
  onAction: (action: string, version?: DocumentTemplateVersion) => void;
}) {
  const active = root.versions.find((version) => version.status === "ACTIVE");
  const latest = root.versions[0];
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm" data-document-template-type={root.documentType}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-indigo-600">{typeLabel(root.documentType)}</p>
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
        <button type="button" disabled={!canManage} onClick={() => onAction("starter")} className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-[11px] font-black text-white disabled:cursor-not-allowed disabled:opacity-45"><FilePlus2 className="h-3.5 w-3.5" />Use starter</button>
        <button type="button" disabled={!canManage} onClick={() => onAction("upload")} className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-white px-3 py-2 text-[11px] font-black text-indigo-700 disabled:cursor-not-allowed disabled:opacity-45"><Upload className="h-3.5 w-3.5" />Upload DOCX</button>
        <button type="button" disabled={!canManage} onClick={() => onAction("ai")} className="inline-flex items-center gap-1.5 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-[11px] font-black text-violet-700 disabled:cursor-not-allowed disabled:opacity-45"><WandSparkles className="h-3.5 w-3.5" />Generate with AI</button>
        {latest && <button type="button" disabled={!canManage} onClick={() => onAction("duplicate", latest)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] font-bold text-slate-700 disabled:cursor-not-allowed disabled:opacity-45"><Copy className="h-3.5 w-3.5" />Duplicate latest</button>}
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
  const [selectedType, setSelectedType] = useState<DocumentTemplateType>("PURCHASE_ORDER");
  const [selectedVersion, setSelectedVersion] = useState<DocumentTemplateVersion | null>(null);
  const [analysis, setAnalysis] = useState<any>(null);
  const [bindings, setBindings] = useState<DocumentTemplateBinding[]>([]);
  const [fieldQuery, setFieldQuery] = useState("");
  const [aiOpen, setAiOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [pdfCapability, setPdfCapability] = useState<{ state: PdfCapabilityState; version?: string; message?: string }>({ state: "CHECKING" });
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploadType, setUploadType] = useState<DocumentTemplateType>("PURCHASE_ORDER");

  const refresh = async () => {
    if (!company || demoMode || !canRead) return;
    setBusy(true);
    try { setTemplates(await listDocumentTemplates(company.id)); }
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
      })
      .catch(() => {
        if (!cancelled) setPdfCapability({ state: "UNAVAILABLE", message: "The deployment could not verify its PDF converter." });
      });
    return () => { cancelled = true; };
  }, [company?.id, demoMode, canRead]);

  const visibleRoots = useMemo(() => templates.filter((root) => root.documentType === selectedType && (!query.trim() || `${root.displayName} ${root.variantKey}`.toLowerCase().includes(query.trim().toLowerCase()))), [query, selectedType, templates]);

  if (!company || !canRead) return null;

  const run = async (operation: () => Promise<void>, success: string) => {
    if (!canManage || busy) return;
    setBusy(true);
    setNotice(null);
    try { await operation(); setNotice({ tone: "success", text: success }); await refresh(); }
    catch (error) { setNotice({ tone: "error", text: error instanceof Error ? error.message : "The document-template operation failed safely." }); }
    finally { setBusy(false); }
  };

  const createStarter = () => void run(async () => { const version = await createStarterDocumentTemplate(company.id, { documentType: selectedType }); setSelectedVersion(version); setBindings([...version.bindings]); }, `The ${typeLabel(selectedType)} starter template is ready as a draft. Review it before activation.`);
  const upload = async (file: File) => {
    if (!canManage) return;
    setBusy(true); setNotice(null);
    try {
      const version = await uploadDocumentTemplate(company.id, { documentType: uploadType, file });
      setSelectedVersion(version); setBindings([]); setNotice({ tone: "info", text: "The original DOCX was preserved as a draft. Analyze it for proposals, then place or review supported merge tags in Word before activation." });
      await refresh();
      try { setAnalysis(await analyzeDocumentTemplate(company.id, version.id)); }
      catch { /* AI is optional; the manual field-reference route remains available. */ }
    } catch (error) { setNotice({ tone: "error", text: error instanceof Error ? error.message : "The DOCX could not be uploaded safely." }); }
    finally { setBusy(false); }
  };
  const generateAi = () => void run(async () => { const version = await generateDocumentTemplateWithAi(company.id, { documentType: selectedType, prompt: aiPrompt }); setSelectedVersion(version); setBindings([...version.bindings]); setAiOpen(false); setAiPrompt(""); }, "The AI-generated DOCX is a validated draft. Preview and activate it only after human review.");
  const duplicate = (version: DocumentTemplateVersion) => void run(async () => { const copied = await duplicateDocumentTemplate(company.id, version.id); setSelectedVersion(copied); setBindings([...copied.bindings]); }, "A new immutable draft version was created from the selected template.");
  const inspect = (version: DocumentTemplateVersion) => { setSelectedVersion(version); setBindings([...version.bindings]); setAnalysis(null); setNotice(null); };
  const saveBindings = () => void run(async () => { if (!selectedVersion) return; const result = await updateDocumentTemplateBindings(company.id, selectedVersion.id, bindings); setSelectedVersion(result.version); setBindings([...result.version.bindings]); }, "Mappings saved and the template was revalidated. Activation remains a separate confirmation.");
  const activate = () => void run(async () => { if (!selectedVersion) return; const activated = await activateDocumentTemplate(company.id, selectedVersion.id); setSelectedVersion(activated); }, "The validated template is now active for new issued documents.");
  const retire = () => void run(async () => { if (!selectedVersion) return; const retired = await retireDocumentTemplate(company.id, selectedVersion.id); setSelectedVersion(retired); }, "The template version was retired. Historical generated documents remain pinned.");
  const analyze = () => void run(async () => { if (!selectedVersion) return; setAnalysis(await analyzeDocumentTemplate(company.id, selectedVersion.id)); }, "AI analysis completed as a proposal. No mapping was activated automatically.");
  const download = () => void (async () => { if (!selectedVersion) return; setBusy(true); try { const result = await downloadDocumentTemplate(company.id, selectedVersion.id); downloadDocxBytes(result.bytes, result.fileName); } catch (error) { setNotice({ tone: "error", text: error instanceof Error ? error.message : "The DOCX could not be downloaded." }); } finally { setBusy(false); } })();
  const test = () => void (async () => { if (!selectedVersion) return; setBusy(true); setNotice(null); try { const result = await generateDocumentTemplateDocument(company.id, selectedVersion.id, { documentType: selectedVersion.documentType, previewSnapshot: previewSnapshot(selectedVersion.documentType) }); downloadDocxBytes(result.bytes, result.fileName); setNotice({ tone: "success", text: "A non-authoritative test DOCX was generated from demo snapshot data. No financial record was issued or changed." }); } catch (error) { setNotice({ tone: "error", text: error instanceof Error ? error.message : "The test DOCX could not be generated." }); } finally { setBusy(false); } })();
  const testPdf = () => void (async () => { if (!selectedVersion) return; setBusy(true); setNotice(null); try { const result = await generateDocumentTemplatePdf(company.id, selectedVersion.id, { documentType: selectedVersion.documentType, previewSnapshot: previewSnapshot(selectedVersion.documentType) }); downloadPdfBytes(result.bytes, result.fileName); setNotice({ tone: "success", text: "A non-authoritative final PDF was generated from demo snapshot data. No financial record was issued or changed." }); } catch (error) { setNotice({ tone: "error", text: error instanceof Error ? error.message : "The final PDF could not be generated safely." }); } finally { setBusy(false); } })();

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5" aria-labelledby="company-document-templates-title" data-document-template-settings="true" data-demo-mode={demoMode ? "true" : "false"}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700"><FilePenLine className="h-5 w-5" /></div><div className="min-w-0"><p id="company-document-templates-title" className="text-sm font-black text-slate-950">Document templates</p><p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">Keep each company’s editable Word design while HydroQualiSense merges deterministic values from the authoritative Purchase Order or Client Invoice snapshot.</p></div></div>
        <div className="flex items-center gap-2">{!demoMode && <button type="button" onClick={() => void refresh()} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[10px] font-bold text-slate-600 disabled:opacity-45"><RefreshCw className={`h-3.5 w-3.5 ${busy ? "animate-spin" : ""}`} />Refresh</button>}{!canManage && <StatusBadge tone="neutral">Read-only</StatusBadge>}</div>
      </div>

      {demoMode && <div className="mt-4 rounded-lg border border-indigo-100 bg-indigo-50/60 px-3 py-2.5 text-[11px] leading-5 text-indigo-950">Demo preview: template administration is shown for discoverability, while DOCX persistence and company data remain disabled in the local sample workspace.</div>}
      {notice && <div role={notice.tone === "error" ? "alert" : "status"} className={`mt-4 flex items-start gap-2 rounded-lg border px-3 py-2.5 text-xs leading-5 ${notice.tone === "error" ? "border-rose-200 bg-rose-50 text-rose-800" : notice.tone === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-indigo-200 bg-indigo-50 text-indigo-900"}`}>{notice.tone === "error" ? <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />}<span>{notice.text}</span></div>}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5" data-document-pdf-capability={pdfCapability.state.toLowerCase()}><div><p className="text-[10px] font-black uppercase tracking-wide text-slate-500">Final PDF conversion</p><p className="mt-1 text-[11px] text-slate-600">Uses the exact merged DOCX on the server; the legacy PDF remains available if this deployment has no converter.</p></div><StatusBadge tone={pdfCapability.state === "AVAILABLE" ? "success" : pdfCapability.state === "CHECKING" ? "neutral" : "warning"}>{pdfCapability.state === "AVAILABLE" ? `Available${pdfCapability.version ? ` · ${pdfCapability.version}` : ""}` : pdfCapability.state === "CHECKING" ? "Checking" : "Unavailable"}</StatusBadge></div>

      <div className="mt-5 flex flex-wrap items-center gap-2 border-b border-slate-100 pb-3"><div className="flex rounded-lg bg-slate-100 p-1">{DOCUMENT_TEMPLATE_TYPES.map((type) => <button key={type} type="button" onClick={() => { setSelectedType(type); setSelectedVersion(null); setAnalysis(null); }} className={`rounded-md px-3 py-1.5 text-[11px] font-black ${selectedType === type ? "bg-white text-indigo-700 shadow-sm" : "text-slate-500"}`}>{typeLabel(type)}</button>)}</div><label className="ml-auto flex min-w-[200px] items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5"><Search className="h-3.5 w-3.5 text-slate-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search templates" className="w-full bg-transparent text-[11px] outline-none" /></label></div>

      {demoMode ? <div className="mt-4 grid gap-3 lg:grid-cols-2">{DOCUMENT_TEMPLATE_TYPES.map((type) => <article key={type} className="rounded-xl border border-slate-200 bg-slate-50/60 p-4"><p className="text-[10px] font-black uppercase tracking-wide text-indigo-600">{typeLabel(type)}</p><h3 className="mt-1 text-sm font-black text-slate-900">HydroQualiSense starter</h3><p className="mt-1 text-[11px] leading-5 text-slate-600">Editable DOCX foundation with company, {type === "PURCHASE_ORDER" ? "supplier, project, and line-item" : "client, project, and invoice"} bindings.</p><div className="mt-3 flex flex-wrap gap-2"><StatusBadge tone="success">Available</StatusBadge><StatusBadge tone="neutral">Word editable</StatusBadge></div><div className="mt-4 flex flex-wrap gap-2"><button type="button" disabled className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-[11px] font-black text-white opacity-50"><FilePlus2 className="h-3.5 w-3.5" />Use starter</button><button type="button" disabled className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] font-bold text-slate-500 opacity-60"><Upload className="h-3.5 w-3.5" />Upload existing DOCX</button><button type="button" disabled className="inline-flex items-center gap-1.5 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-[11px] font-black text-violet-700 opacity-60"><Sparkles className="h-3.5 w-3.5" />Generate with AI</button></div></article>)}</div>
        : visibleRoots.length ? <div className="mt-4 grid gap-3 lg:grid-cols-2">{visibleRoots.map((root) => <TemplateCard key={root.id} root={root} canManage={canManage} onAction={(action, version) => { if (action === "starter") createStarter(); else if (action === "upload") { setUploadType(root.documentType); inputRef.current?.click(); } else if (action === "ai") { setSelectedType(root.documentType); setAiOpen(true); } else if (action === "duplicate" && version) duplicate(version); else if (action === "select" && version) inspect(version); }} />)}</div>
          : <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50/70 p-8 text-center"><FilePenLine className="mx-auto h-8 w-8 text-slate-300" /><p className="mt-3 text-sm font-black text-slate-700">No {typeLabel(selectedType)} template yet</p><p className="mt-1 text-xs text-slate-500">Start with a professional HydroQualiSense DOCX, upload the company’s Word form, or ask AI for an editable draft.</p><div className="mt-4 flex flex-wrap justify-center gap-2"><button type="button" disabled={!canManage || busy} onClick={createStarter} className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-[11px] font-black text-white disabled:opacity-45"><FilePlus2 className="h-3.5 w-3.5" />Use starter</button><button type="button" disabled={!canManage || busy} onClick={() => { setUploadType(selectedType); inputRef.current?.click(); }} className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-white px-3 py-2 text-[11px] font-black text-indigo-700 disabled:opacity-45"><Upload className="h-3.5 w-3.5" />Upload existing DOCX</button><button type="button" disabled={!canManage || busy} onClick={() => setAiOpen(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-[11px] font-black text-violet-700 disabled:opacity-45"><WandSparkles className="h-3.5 w-3.5" />Generate with AI</button></div></div>}

      <input ref={inputRef} type="file" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void upload(file); }} />

      {aiOpen && <div className="mt-4 rounded-xl border border-violet-200 bg-violet-50/50 p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-black text-violet-950">Generate an editable {typeLabel(selectedType)} DOCX</p><p className="mt-1 text-[11px] leading-5 text-violet-900/75">AI may design presentation only. HydroQualiSense will validate the blueprint and merge authoritative snapshot values later.</p></div><button type="button" onClick={() => setAiOpen(false)} className="rounded-lg p-1.5 text-violet-700 hover:bg-white" aria-label="Close AI template form"><XCircle className="h-4 w-4" /></button></div><textarea value={aiPrompt} onChange={(event) => setAiPrompt(event.target.value)} maxLength={4000} rows={4} className="mt-3 w-full rounded-lg border border-violet-200 bg-white px-3 py-2.5 text-xs text-slate-900 outline-none focus:border-violet-400" placeholder={`Create a professional ${typeLabel(selectedType)} for our construction company. Include company branding, parties, project/site, line items, totals, terms, and approval/signature areas.`} /><div className="mt-3 flex justify-end"><button type="button" onClick={generateAi} disabled={!canManage || busy || !aiPrompt.trim()} className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-2 text-[11px] font-black text-white disabled:opacity-45"><WandSparkles className="h-3.5 w-3.5" />{busy ? "Generating…" : "Create draft DOCX"}</button></div></div>}

      {selectedVersion && !demoMode && <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50/60 p-4" data-document-template-editor="true"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-wide text-indigo-600">Template version v{selectedVersion.versionNumber}</p><h3 className="mt-1 text-sm font-black text-slate-950">{selectedVersion.displayName}</h3><p className="mt-1 text-[10px] text-slate-500">{selectedVersion.origin} · SHA-256 {selectedVersion.contentSha256.slice(0, 16)}… · {statusLabel(selectedVersion)}</p></div><StatusBadge tone={statusTone(selectedVersion.status, selectedVersion.validationState)}>{statusLabel(selectedVersion)}</StatusBadge></div>
        <div className="mt-4 flex flex-wrap gap-2"><button type="button" onClick={download} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] font-bold text-slate-700 disabled:opacity-45"><Download className="h-3.5 w-3.5" />Download / edit in Word</button><button type="button" onClick={analyze} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-white px-3 py-2 text-[11px] font-black text-indigo-700 disabled:opacity-45"><Sparkles className="h-3.5 w-3.5" />Analyze with AI</button><button type="button" onClick={test} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-[11px] font-black text-white disabled:opacity-45"><FilePenLine className="h-3.5 w-3.5" />Test DOCX</button><button type="button" onClick={testPdf} disabled={busy || pdfCapability.state === "CHECKING" || selectedVersion.validationState !== "VALID"} className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] font-black text-emerald-800 disabled:opacity-45"><Download className="h-3.5 w-3.5" />Test final PDF</button>{selectedVersion.status !== "ACTIVE" && <button type="button" onClick={activate} disabled={busy || selectedVersion.validationState !== "VALID"} className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] font-black text-emerald-800 disabled:opacity-45"><CheckCircle2 className="h-3.5 w-3.5" />Activate</button>}{selectedVersion.status === "ACTIVE" && <button type="button" onClick={retire} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-black text-amber-800 disabled:opacity-45">Retire</button>}{selectedVersion.status !== "RETIRED" && <button type="button" onClick={() => duplicate(selectedVersion)} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] font-bold text-slate-700 disabled:opacity-45"><Copy className="h-3.5 w-3.5" />Duplicate</button>}</div>
        <div className="mt-4 grid gap-4 xl:grid-cols-[1.1fr_0.9fr]"><div><div className="flex items-center justify-between gap-2"><div><p className="text-xs font-black text-slate-900">Confirmed merge bindings</p><p className="mt-1 text-[10px] leading-4 text-slate-500">Only allowlisted fields can be saved. AI proposals remain separate until you confirm them.</p></div><button type="button" onClick={saveBindings} disabled={busy || selectedVersion.status !== "DRAFT"} className="rounded-lg bg-slate-900 px-3 py-2 text-[11px] font-black text-white disabled:opacity-45">Save &amp; validate</button></div>{analysis?.structure?.tags?.length ? <div className="mt-3 space-y-2">{bindingDraft(selectedVersion, analysis.structure.tags).map((binding, index) => <label key={`${binding.tag}-${index}`} className="grid gap-1 rounded-lg border border-slate-200 bg-white p-2.5 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] sm:items-center"><span className="truncate font-mono text-[10px] text-slate-600">{`{{${binding.tag}}}`}</span><select value={bindings.find((candidate) => candidate.tag === binding.tag)?.fieldKey || binding.fieldKey} onChange={(event) => setBindings((current) => [...current.filter((candidate) => candidate.tag !== binding.tag), { ...binding, fieldKey: event.target.value, confirmed: true }])} className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-[10px] font-semibold text-slate-800"><option value="">Select an application field</option>{getDocumentTemplateFields(selectedVersion.documentType).map((field) => <option key={field.key} value={field.key}>{field.label} · {field.key}</option>)}</select></label>)}</div> : <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-[11px] leading-5 text-amber-900">No supported merge tags were detected. The original design is preserved. Download it, place tags such as <code className="font-mono">{'{{company.legalName}}'}</code> and <code className="font-mono">{'{{#lines}}'}</code> in Word, then upload the revised DOCX as a new draft.</div>}</div>
          <div className="rounded-lg border border-slate-200 bg-white p-3"><p className="text-xs font-black text-slate-900">Validation and proposals</p><p className="mt-1 text-[10px] leading-4 text-slate-500">Activation is blocked until required fields, repeating rows, and mappings pass application validation.</p>{Array.isArray(selectedVersion.validationReport?.issues) && <ul className="mt-3 space-y-1.5 text-[10px] leading-4">{(selectedVersion.validationReport.issues as any[]).slice(0, 8).map((issue, index) => <li key={`${issue.code}-${index}`} className={issue.severity === "ERROR" ? "text-rose-700" : "text-amber-700"}>{issue.severity}: {issue.message}</li>)}</ul>}{analysis?.analysis && <div className="mt-3 border-t border-slate-100 pt-3"><p className="text-[10px] font-black uppercase tracking-wide text-violet-700">{analysis.aiStatus === "AVAILABLE" ? "AI proposals" : "Manual fallback"}</p><ul className="mt-2 space-y-2 text-[10px] leading-4 text-slate-700">{analysis.analysis.mappings.slice(0, 8).map((proposal: any, index: number) => <li key={`${proposal.sourceLabel}-${index}`}><span className="font-bold">{proposal.sourceLabel}</span> → <span className="font-mono">{proposal.fieldKey || "unresolved"}</span><span className="text-slate-400"> · {Math.round(proposal.confidence * 100)}% · {proposal.reason}</span></li>)}</ul>{analysis.message && <p className="mt-2 text-[10px] text-amber-700">{analysis.message}</p>}</div>}{<details className="mt-3 border-t border-slate-100 pt-3"><summary className="cursor-pointer text-[10px] font-black text-indigo-700">Field reference</summary><label className="mt-2 flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5"><Search className="h-3 w-3 text-slate-400" /><input value={fieldQuery} onChange={(event) => setFieldQuery(event.target.value)} placeholder="Search allowed fields" className="w-full bg-transparent text-[10px] outline-none" /></label><div className="mt-2 max-h-36 space-y-1 overflow-y-auto">{getDocumentTemplateFields(selectedVersion.documentType).filter((field) => `${field.key} ${field.label} ${field.description}`.toLowerCase().includes(fieldQuery.trim().toLowerCase())).map((field) => <div key={field.key} className="rounded-md bg-slate-50 px-2 py-1.5 text-[10px]"><p className="font-mono font-bold text-slate-700">{field.key}{field.collection ? "[]" : ""}</p><p className="text-slate-500">{field.label} · {field.type} · {field.required ? "required" : "optional"}</p></div>)}</div></details>}</div></div>
      </div>}

      {!demoMode && templates.length > 0 && <details className="mt-5 border-t border-slate-100 pt-4"><summary className="cursor-pointer text-[11px] font-black text-indigo-700">Version history</summary><div className="mt-3 grid gap-2 sm:grid-cols-2">{templates.filter((root) => root.documentType === selectedType).flatMap((root) => root.versions).map((version) => <button key={version.id} type="button" onClick={() => inspect(version)} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-left hover:border-indigo-200"><span className="min-w-0"><span className="block truncate text-[11px] font-bold text-slate-800">v{version.versionNumber} · {version.displayName}</span><span className="block text-[10px] text-slate-500">{version.origin} · {statusLabel(version)}</span></span><span className="text-[10px] font-black text-indigo-700">Inspect</span></button>)}</div></details>}
    </section>
  );
}

export default CompanyDocumentTemplatesSettings;
