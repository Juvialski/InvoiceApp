import React, { useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Save, Upload, X } from "lucide-react";
import type { Project, Worker } from "../../types";
import { applyPayrollColumnMappings, parsePayrollWorkbook, type CanonicalPayrollField, type ParsedPayrollWorkbook, type PayrollColumnMapping, type PayrollCellValue } from "../../lib/payrollImport";
import {
  applySavedPayrollTemplate,
  buildDraftPayrollFromImport,
  matchPayrollImportRows,
  sha256Hex,
  stageParsedPayrollWorkbook,
  updatePayrollImportRowDecision,
  validatePayrollImportCommit,
  type StagedPayrollImport,
} from "../../lib/payrollImportWorkflow";
import type { PayrollImportBatch, PayrollImportRow, PayrollImportTemplate, LaborContextType } from "../../lib/payrollImportPersistence";

interface PayrollImportWorkflowProps {
  workers: Worker[];
  projects: Project[];
  batches: PayrollImportBatch[];
  templates: PayrollImportTemplate[];
  onStage: (batch: PayrollImportBatch, rows: PayrollImportRow[], bytes: Uint8Array) => void;
  onSaveTemplate: (template: PayrollImportTemplate) => void;
  onCommit: (staged: StagedPayrollImport, periodStart: string, periodEnd: string, payDate?: string) => void;
}

type Step = "upload" | "map" | "review";

const canonicalFields: Array<[CanonicalPayrollField, string]> = [
  ["employeeCode", "Employee code"], ["employeeName", "Employee name"], ["position", "Position"], ["payType", "Pay type"],
  ["dailyRate", "Daily rate"], ["hourlyRate", "Hourly rate"], ["monthlyRate", "Monthly rate"], ["daysWorked", "Days worked"],
  ["regularHours", "Regular hours"], ["overtimeHours", "Overtime hours"], ["overtimeRate", "Overtime rate"],
  ["regularPayImported", "Regular pay / amount"], ["overtimePayImported", "Overtime pay / amount"], ["grossPayImported", "Gross / total pay"],
  ["periodStart", "Period start"], ["periodEnd", "Period end"], ["payDate", "Pay date"], ["projectCode", "Project code"], ["projectName", "Project name"], ["costContext", "Cost context"],
];

function localId() { return globalThis.crypto?.randomUUID?.() || `local-template-${Date.now()}`; }
function money(value: number | undefined) { return new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", maximumFractionDigits: 2 }).format(value || 0); }
function displayContext(context: LaborContextType) { return context === "ADMIN_OFFICE" ? "Admin / office" : context === "GENERAL_OVERHEAD" ? "General overhead" : context === "PROJECT" ? "Project labor" : "Unallocated / needs review"; }

export const PayrollImportWorkflow: React.FC<PayrollImportWorkflowProps> = ({ workers, projects, batches, templates, onStage, onSaveTemplate, onCommit }) => {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [step, setStep] = useState<Step>("upload");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "error" | "info" | "success"; text: string } | null>(null);
  const [parsed, setParsed] = useState<ParsedPayrollWorkbook | null>(null);
  const [staged, setStaged] = useState<StagedPayrollImport | null>(null);
  const [selectedSheet, setSelectedSheet] = useState("");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [payDate, setPayDate] = useState("");
  const [templateName, setTemplateName] = useState("");

  const selectedParsedSheet = parsed?.sheets.find((sheet) => sheet.sourceSheet === selectedSheet) || parsed?.sheets.find((sheet) => sheet.status === "DETECTED");
  const selectedMapping = selectedParsedSheet?.table?.mappings || [];
  const duplicate = staged ? batches.find((batch) => batch.fileSha256 === staged.batch.fileSha256 && batch.status !== "VOIDED") : undefined;
  const validation = useMemo(() => staged ? validatePayrollImportCommit({ batch: staged.batch, rows: staged.rows, periodStart, periodEnd, payDate }) : { valid: false, issues: [], readyRows: [] }, [staged, periodStart, periodEnd, payDate]);
  const readyCount = staged?.rows.filter((row) => row.status !== "SKIPPED").length || 0;

  const reset = () => { setStep("upload"); setBusy(false); setMessage(null); setParsed(null); setStaged(null); setSelectedSheet(""); setPeriodStart(""); setPeriodEnd(""); setPayDate(""); setTemplateName(""); if (inputRef.current) inputRef.current.value = ""; };

  const handleFile = async (file?: File) => {
    if (!file) return;
    setBusy(true); setMessage(null);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const parsedWorkbook = parsePayrollWorkbook(bytes, { fileName: file.name });
      const matchedTemplate = parsedWorkbook.sheets.map((sheet) => sheet.structureSignature).map((signature) => signature ? templates.find((template) => template.structureSignature === signature) : undefined).find(Boolean);
      const workbook = matchedTemplate ? applySavedPayrollTemplate(parsedWorkbook, matchedTemplate) : parsedWorkbook;
      const hash = await sha256Hex(bytes);
      const stagedWorkbook = stageParsedPayrollWorkbook(workbook, { fileName: file.name, fileSha256: hash, fileSize: file.size, mimeType: file.type });
      const initial = matchedTemplate ? { ...stagedWorkbook, batch: { ...stagedWorkbook.batch, detectedTemplateId: matchedTemplate.id } } : stagedWorkbook;
      const matched = matchPayrollImportRows(initial.rows, workers, projects);
      const next = { ...initial, rows: matched.rows };
      setParsed(workbook); setStaged(next); setSelectedSheet(workbook.sheets.find((sheet) => sheet.status === "DETECTED")?.sourceSheet || workbook.sheetNames[0] || "");
      const metadata = workbook.sheets.find((sheet) => sheet.status === "DETECTED")?.metadata;
      setPeriodStart(metadata?.periodStart || ""); setPeriodEnd(metadata?.periodEnd || ""); setPayDate(metadata?.payDate || "");
      onStage(next.batch, next.rows, bytes);
      setStep(workbook.sheets.some((sheet) => sheet.table) ? "map" : "upload");
      setMessage({ tone: duplicate ? "info" : "success", text: `${file.name} detected with ${next.rows.length} payroll row${next.rows.length === 1 ? "" : "s"}. Review the mapping before commit.` });
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "Could not read this payroll workbook." });
    } finally { setBusy(false); }
  };

  const updateRows = (updater: (rows: PayrollImportRow[]) => PayrollImportRow[]) => setStaged((current) => current ? { ...current, rows: updater(current.rows) } : current);
  const updateRow = (rowId: string, patch: Parameters<typeof updatePayrollImportRowDecision>[1]) => updateRows((rows) => rows.map((row) => row.id === rowId ? updatePayrollImportRowDecision(row, patch) : row));

  const changeMapping = (columnIndex: number, value: string) => {
    if (!selectedParsedSheet?.table || !staged) return;
    const nextMappings: PayrollColumnMapping[] = selectedParsedSheet.table.mappings.map((mapping) => mapping.columnIndex === columnIndex ? { ...mapping, field: value === "IGNORE" ? undefined : value as CanonicalPayrollField, reason: "Manually confirmed by the reviewer." } : mapping);
    const nextRows = staged.rows.map((row) => {
      if (row.sourceSheet !== selectedParsedSheet.sourceSheet) return row;
      const defaults = { periodStart: row.canonicalData.periodStart, periodEnd: row.canonicalData.periodEnd, payDate: row.canonicalData.payDate, projectCode: row.canonicalData.projectCode, projectName: row.canonicalData.projectName, costContext: row.canonicalData.costContext };
      const mapped = applyPayrollColumnMappings(row.rawRow as PayrollCellValue[], nextMappings, defaults);
      return { ...row, canonicalData: { ...row.canonicalData, ...mapped }, originalEmployeeName: mapped.employeeName || row.originalEmployeeName, updatedAt: new Date().toISOString() };
    });
    setParsed((current) => current ? { ...current, sheets: current.sheets.map((sheet) => sheet.sourceSheet === selectedParsedSheet.sourceSheet && sheet.table ? { ...sheet, table: { ...sheet.table, mappings: nextMappings } } : sheet) } : current);
    setStaged({ ...staged, rows: nextRows, batch: { ...staged.batch, status: "MAPPED", mappingSnapshot: { ...staged.batch.mappingSnapshot, [selectedParsedSheet.sourceSheet]: nextMappings } } });
  };

  const saveTemplate = () => {
    if (!selectedParsedSheet?.table || !selectedParsedSheet.structureSignature || !templateName.trim()) { setMessage({ tone: "error", text: "Choose a detected sheet and enter a template name." }); return; }
    onSaveTemplate({ id: localId(), name: templateName.trim(), structureSignature: selectedParsedSheet.structureSignature, fieldMappings: selectedParsedSheet.table.mappings.map((mapping) => ({ columnIndex: mapping.columnIndex, sourceHeader: mapping.sourceHeader, normalizedHeader: mapping.normalizedHeader, canonicalField: mapping.field || "IGNORE", confidence: mapping.confidence.score })), headerConfiguration: { sourceSheet: selectedParsedSheet.sourceSheet, headerRow: selectedParsedSheet.table.headerRow, dataStartRow: selectedParsedSheet.table.dataStartRow }, metadataMappings: { detectedFields: selectedParsedSheet.metadata.detectedFields }, contextRules: { detectedContext: selectedParsedSheet.context.type }, active: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    setMessage({ tone: "success", text: "Mapping template saved for this workbook structure." });
  };

  const commit = () => {
    if (!staged || !validation.valid) { setMessage({ tone: "error", text: validation.issues.join(" ") || "Resolve import validation issues before committing." }); return; }
    try { buildDraftPayrollFromImport({ batch: staged.batch, rows: staged.rows, periodStart, periodEnd, payDate }); onCommit(staged, periodStart, periodEnd, payDate || undefined); setMessage({ tone: "success", text: "Draft payroll import queued for commit." }); }
    catch (error) { setMessage({ tone: "error", text: error instanceof Error ? error.message : "Payroll import validation failed." }); }
  };

  return <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-600">Adaptive payroll import</p><h3 className="mt-1 text-lg font-black">Import a payroll workbook</h3><p className="mt-1 max-w-2xl text-xs text-slate-500">Upload .xlsx, .xls, or .csv. The detector finds sheets, metadata, headers, duplicate amount columns, and footers, then keeps uncertain rows in review.</p></div><button onClick={() => inputRef.current?.click()} disabled={busy} className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"><Upload className="h-3.5 w-3.5" /> {busy ? "Reading…" : "Choose file"}</button><input ref={inputRef} type="file" accept=".xlsx,.xls,.xlsm,.csv" className="hidden" onChange={(event) => void handleFile(event.target.files?.[0])} /></div>
    <div className="grid gap-2 text-[10px] font-black uppercase tracking-wide text-slate-400 sm:grid-cols-3"><StepPill active={step === "upload"} done={Boolean(parsed)} label="1 · Upload" /><StepPill active={step === "map"} done={step === "review"} label="2 · Map & preview" /><StepPill active={step === "review"} done={false} label="3 · Confirm draft" /></div>
    {message && <div className={`flex items-start gap-2 rounded-xl p-3 text-xs ${message.tone === "error" ? "bg-rose-50 text-rose-800" : message.tone === "success" ? "bg-emerald-50 text-emerald-800" : "bg-indigo-50 text-indigo-800"}`}><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{message.text}</div>}
    {!parsed && <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center"><FileSpreadsheet className="mx-auto h-8 w-8 text-slate-300" /><p className="mt-3 text-sm font-bold text-slate-700">Start with a payroll spreadsheet</p><p className="mt-1 text-xs text-slate-500">No payroll data is committed during parsing.</p></div>}
    {parsed && staged && <>
      <div className="grid gap-3 sm:grid-cols-4"><Metric label="Workbook" value={staged.batch.originalFileName} /><Metric label="Sheets" value={staged.batch.sheetNames.length} /><Metric label="Rows" value={readyCount} /><Metric label="Detection" value={`${Math.round((parsed.confidence.score || 0) * 100)}% ${parsed.confidence.level}`} /></div>
      {duplicate && <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span>This file hash already exists in import history ({duplicate.status}). Review the existing batch before importing again.</span></div>}
      {step === "map" && <div className="space-y-4"><div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between"><label className="min-w-0 flex-1"><span className="mb-1 block text-[10px] font-black uppercase tracking-wide text-slate-500">Workbook sheet</span><select value={selectedSheet} onChange={(event) => setSelectedSheet(event.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold">{parsed.sheets.map((sheet) => <option key={sheet.sourceSheet} value={sheet.sourceSheet}>{sheet.sourceSheet} · {sheet.status} · {sheet.rows.length} rows</option>)}</select></label><button onClick={() => setStep("review")} disabled={!selectedParsedSheet?.table} className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-bold text-white disabled:opacity-40">Review row matches</button></div>{selectedParsedSheet?.table ? <div className="overflow-x-auto rounded-xl border border-slate-200"><table className="min-w-[760px] w-full text-left text-[10px]"><thead className="bg-slate-50 text-[9px] uppercase tracking-wide text-slate-500"><tr><th className="p-2">Source heading</th><th className="p-2">Canonical field</th><th className="p-2">Sample values</th><th className="p-2">Confidence</th></tr></thead><tbody>{selectedMapping.map((mapping) => <tr key={mapping.columnIndex} className="border-t border-slate-100"><td className="p-2 font-bold">#{mapping.columnIndex + 1} · {mapping.sourceHeader || "(blank)"}</td><td className="p-2"><select value={mapping.field || "IGNORE"} onChange={(event) => changeMapping(mapping.columnIndex, event.target.value)} className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-[10px]"><option value="IGNORE">Ignore column</option>{canonicalFields.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></td><td className="max-w-[250px] truncate p-2 text-slate-500">{mapping.sampleValues.map((value) => String(value)).join(" · ") || "—"}</td><td className="p-2 font-bold">{Math.round(mapping.confidence.score * 100)}%</td></tr>)}</tbody></table></div> : <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-900">This sheet was not recognized as a payroll table. Choose another sheet or map a supported, reasonably structured table.</p>}<div className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:flex-row sm:items-end"><label className="min-w-0 flex-1"><span className="mb-1 block text-[10px] font-black uppercase tracking-wide text-slate-500">Save mapping template</span><input value={templateName} onChange={(event) => setTemplateName(event.target.value)} placeholder="Client B weekly payroll" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs" /></label><button onClick={saveTemplate} className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-white px-3 py-2 text-xs font-bold text-slate-700 ring-1 ring-slate-200"><Save className="h-3.5 w-3.5" /> Save template</button><span className="text-[10px] text-slate-500">{templates.some((template) => template.structureSignature === selectedParsedSheet?.structureSignature) ? "Saved template matched by structure." : "Matches by structure, not filename."}</span></div></div>}
      {step === "review" && <div className="space-y-4"><div className="grid gap-3 sm:grid-cols-3"><label><span className="mb-1 block text-[10px] font-black uppercase tracking-wide text-slate-500">Period start</span><input type="date" value={periodStart} onChange={(event) => setPeriodStart(event.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs" /></label><label><span className="mb-1 block text-[10px] font-black uppercase tracking-wide text-slate-500">Period end</span><input type="date" value={periodEnd} onChange={(event) => setPeriodEnd(event.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs" /></label><label><span className="mb-1 block text-[10px] font-black uppercase tracking-wide text-slate-500">Pay date (optional)</span><input type="date" value={payDate} onChange={(event) => setPayDate(event.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs" /></label></div><div className="overflow-x-auto rounded-xl border border-slate-200"><table className="min-w-[1120px] w-full text-left text-[10px]"><thead className="bg-slate-50 text-[9px] uppercase tracking-wide text-slate-500"><tr><th className="p-2">Source</th><th className="p-2">Employee</th><th className="p-2">Worker match</th><th className="p-2">Cost context</th><th className="p-2">Project</th><th className="p-2">Gross</th><th className="p-2">Status</th><th className="p-2">Skip</th></tr></thead><tbody>{staged.rows.map((row) => <ImportRow key={row.id} row={row} workers={workers} projects={projects} onChange={(patch) => updateRow(row.id, patch)} />)}</tbody></table></div><div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-xs font-black">{validation.valid ? "Ready to create a DRAFT payroll run" : `${validation.issues.length} review issue${validation.issues.length === 1 ? "" : "s"} remain`}</p><p className="mt-1 text-[10px] text-slate-500">Project rows create project allocations only after the draft moves through the existing approval lifecycle. Admin/office rows never receive a project.</p></div><div className="flex gap-2"><button onClick={() => setStep("map")} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold">Back to mapping</button><button onClick={commit} className="rounded-xl bg-indigo-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-40" disabled={!validation.valid}>Confirm draft import</button><button onClick={reset} className="rounded-xl p-2 text-slate-400 hover:text-rose-700" aria-label="Clear import"><X className="h-4 w-4" /></button></div></div>{validation.issues.length > 0 && <div className="rounded-xl bg-amber-50 p-3 text-[10px] text-amber-900">{validation.issues.slice(0, 8).map((issue) => <p key={issue}>• {issue}</p>)}</div>}</div>}
    </>}
  </section>;
};

const StepPill: React.FC<{ active: boolean; done: boolean; label: string }> = ({ active, done, label }) => <span className={`rounded-full px-2 py-1 ${active ? "bg-indigo-50 text-indigo-700" : done ? "bg-emerald-50 text-emerald-700" : "bg-slate-50 text-slate-400"}`}>{done ? "✓ " : ""}{label}</span>;
const Metric: React.FC<{ label: string; value: string | number }> = ({ label, value }) => <div className="min-w-0 rounded-xl border border-slate-100 bg-slate-50 p-3"><p className="truncate text-[10px] font-semibold text-slate-500">{label}</p><p className="mt-1 truncate text-xs font-black">{value}</p></div>;

const ImportRow: React.FC<{ row: PayrollImportRow; workers: Worker[]; projects: Project[]; onChange: (patch: Parameters<typeof updatePayrollImportRowDecision>[1]) => void }> = ({ row, workers, projects, onChange }) => {
  const data = row.canonicalData;
  const gross = data.grossPayImported ?? (data.regularPayImported || 0) + (data.overtimePayImported || 0);
  return <tr className={`border-t border-slate-100 align-top ${row.status === "SKIPPED" ? "opacity-50" : ""}`}><td className="p-2"><p className="font-bold">{row.sourceSheet} · {row.sourceRow}</p><p className="mt-1 text-slate-500">{row.warnings[0] || "No row warnings"}</p></td><td className="p-2 font-bold">{row.originalEmployeeName || "(missing name)"}</td><td className="p-2"><select value={row.workerId || ""} onChange={(event) => onChange({ workerId: event.target.value || undefined })} className="w-48 rounded-lg border border-slate-200 px-2 py-1.5 text-[10px]"><option value="">Select worker · {row.workerMatchStatus}</option>{workers.map((worker) => <option key={worker.id} value={worker.id}>{worker.displayName} · {worker.employeeCode}</option>)}</select></td><td className="p-2"><select value={row.laborContext.type} onChange={(event) => onChange({ contextType: event.target.value as LaborContextType, projectId: undefined })} className="w-44 rounded-lg border border-slate-200 px-2 py-1.5 text-[10px]"><option value="PROJECT">Project labor</option><option value="ADMIN_OFFICE">Admin / office</option><option value="GENERAL_OVERHEAD">General overhead</option><option value="UNALLOCATED_REVIEW">Unallocated / review</option></select><p className="mt-1 text-[9px] text-slate-500">{displayContext(row.laborContext.type)}{row.laborContext.needsReview ? " · needs review" : ""}</p></td><td className="p-2">{row.laborContext.type === "PROJECT" ? <select value={row.laborContext.projectId || ""} onChange={(event) => onChange({ projectId: event.target.value || undefined })} className="w-56 rounded-lg border border-slate-200 px-2 py-1.5 text-[10px]"><option value="">Select project</option>{projects.filter((project) => project.status !== "ARCHIVED").map((project) => <option key={project.id} value={project.id}>{project.projectCode} — {project.projectName}</option>)}</select> : <span className="text-slate-400">No project</span>}</td><td className="p-2 text-right font-black tabular-nums">{money(gross)}</td><td className="p-2"><span className={`rounded-full px-2 py-1 text-[9px] font-black ${row.workerMatchStatus === "MATCHED" && (!row.laborContext.needsReview || row.laborContext.type !== "PROJECT") ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}>{row.workerMatchStatus}{row.projectMatchStatus !== "NOT_APPLICABLE" ? ` · ${row.projectMatchStatus}` : ""}</span></td><td className="p-2 text-center"><input type="checkbox" checked={row.status === "SKIPPED"} onChange={(event) => onChange({ status: event.target.checked ? "SKIPPED" : "STAGED" })} aria-label={`Skip ${row.originalEmployeeName || `row ${row.sourceRow}`}`} /></td></tr>;
};
