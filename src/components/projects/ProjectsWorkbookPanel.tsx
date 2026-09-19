import React, { useRef, useState } from "react";
import { Download, FileSpreadsheet, ShieldAlert, Upload } from "lucide-react";
import type { Project, ProjectCostCode } from "../../types.ts";
import {
  applyProjectsImport,
  buildProjectsImportReview,
  exportProjectsWorkbook,
  type CostCodeWorkbookFinancials,
  type ProjectWorkbookFinancials,
  type ProjectsApplyCallbacks,
  type ProjectsImportContext,
  type ProjectsImportReview,
  type ProjectsProposal,
} from "../../lib/projectsWorkbook.ts";
import { downloadWorkbookArtifact } from "../../lib/operationsWorkbook.ts";

export interface ProjectsWorkbookRecords {
  projects: readonly Project[];
  costCodes: readonly ProjectCostCode[];
  financials?: Readonly<Record<string, ProjectWorkbookFinancials>>;
  costCodeFinancials?: Readonly<Record<string, CostCodeWorkbookFinancials>>;
}

export interface ProjectsWorkbookPanelProps extends ProjectsWorkbookRecords {
  companyId?: string;
  canManage: boolean;
  onRefreshProjects?: () => Promise<ProjectsWorkbookRecords>;
  onApplyProjectWorkbookGroup: ProjectsApplyCallbacks["applyGroup"];
}

function statusClass(status: ProjectsProposal["status"]) {
  if (status === "WORKBOOK_ONLY_CHANGE") return "bg-amber-100 text-amber-900";
  if (status === "UNCHANGED") return "bg-slate-100 text-slate-600";
  if (status === "APP_ONLY_CHANGE") return "bg-blue-100 text-blue-900";
  if (status === "UNAUTHORIZED" || status === "UNSUPPORTED_PROTECTED_FIELD" || status === "STALE_CONFLICT") return "bg-rose-100 text-rose-900";
  return "bg-orange-100 text-orange-900";
}

function contextFor(records: ProjectsWorkbookRecords, companyId: string | undefined, canWrite: boolean): ProjectsImportContext {
  const derivedCompanyId = companyId || [...new Set(records.costCodes.map((costCode) => costCode.companyId).filter(Boolean))][0];
  return { ...records, expectedCompanyId: derivedCompanyId, canWrite };
}

function changeRows(proposal: ProjectsProposal) {
  return [
    ...proposal.changes.map((change) => ({ ...change, label: change.field })),
    ...proposal.costCodeChanges.map((change) => ({ ...change, label: `${change.costCodeId} · ${change.field}` })),
  ];
}

export function ProjectsWorkbookPanel({
  projects,
  costCodes,
  financials,
  costCodeFinancials,
  companyId,
  canManage,
  onRefreshProjects,
  onApplyProjectWorkbookGroup,
}: ProjectsWorkbookPanelProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [review, setReview] = useState<ProjectsImportReview | null>(null);
  const [selectedProposalIds, setSelectedProposalIds] = useState<string[]>([]);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const records = { projects, costCodes, financials, costCodeFinancials } satisfies ProjectsWorkbookRecords;

  const handleExport = () => {
    try {
      const artifact = exportProjectsWorkbook({ ...records, expectedCompanyId: companyId });
      downloadWorkbookArtifact(artifact);
      setMessage("Editable Projects and Cost Codes workbook downloaded.");
      setError(null);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Could not export the Projects workbook.");
    }
  };

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const fresh = onRefreshProjects ? await onRefreshProjects() : records;
      const nextReview = buildProjectsImportReview(bytes, contextFor(fresh, companyId, canManage), { fileName: file.name });
      setReview(nextReview);
      setSelectedProposalIds(nextReview.proposals.filter((proposal) => proposal.canApply).map((proposal) => proposal.id));
      setConfirmed(false);
      setMessage("Workbook validated. Review the proposed project and cost-code changes before Apply.");
    } catch (nextError) {
      setReview(null);
      setSelectedProposalIds([]);
      setError(nextError instanceof Error ? nextError.message : "Could not validate the Projects workbook.");
    } finally {
      setBusy(false);
    }
  };

  const handleApply = async () => {
    if (!review || !canManage || !confirmed || !selectedProposalIds.length) return;
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const fresh = onRefreshProjects ? await onRefreshProjects() : records;
      const result = await applyProjectsImport(
        review,
        contextFor(fresh, companyId, canManage),
        { applyGroup: onApplyProjectWorkbookGroup },
        selectedProposalIds,
      );
      const after = onRefreshProjects ? await onRefreshProjects() : fresh;
      setReview(buildProjectsImportReview(review.bytes, contextFor(after, companyId, canManage), { fileName: review.fileName }));
      setSelectedProposalIds([]);
      setConfirmed(false);
      setMessage(`Applied ${result.appliedProposalIds.length} reviewed project group${result.appliedProposalIds.length === 1 ? "" : "s"}. The page reflects authoritative state after refresh.`);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Could not apply the reviewed Projects workbook changes.");
    } finally {
      setBusy(false);
    }
  };

  const toggleProposal = (proposalId: string) => {
    setSelectedProposalIds((current) => current.includes(proposalId) ? current.filter((id) => id !== proposalId) : [...current, proposalId]);
    setConfirmed(false);
  };

  return (
    <section aria-labelledby="projects-workbook-title" className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2"><FileSpreadsheet className="h-4 w-4 text-emerald-700" /><h2 id="projects-workbook-title" className="text-sm font-black text-slate-950">Excel-native Projects workbook</h2></div>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-600">Export projects and cost-code controls for reviewed external editing. Upload creates proposals; nothing is saved until you inspect and explicitly Apply selected groups.</p>
          {!canManage && <p className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-amber-900"><ShieldAlert className="h-3.5 w-3.5" />Upload is available for review only; your current permissions cannot Apply changes.</p>}
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <button type="button" onClick={handleExport} disabled={busy} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-800 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"><Download className="h-3.5 w-3.5" />Export editable workbook</button>
          <button type="button" onClick={() => inputRef.current?.click()} disabled={busy} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60"><Upload className="h-3.5 w-3.5" />Import workbook</button>
          <input ref={inputRef} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(event) => void handleUpload(event)} className="sr-only" aria-label="Import Projects workbook" />
        </div>
      </div>

      {message && <p role="status" className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-900">{message}</p>}
      {error && <p role="alert" className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-900">{error}</p>}

      {review && <div className="mt-4 rounded-lg border border-slate-200 bg-white p-3">
        <div className="flex flex-col gap-2 border-b border-slate-100 pb-3 sm:flex-row sm:items-center sm:justify-between"><div><h3 className="text-xs font-black text-slate-900">Import review: {review.fileName || "Projects workbook"}</h3><p className="mt-1 text-[11px] text-slate-500">{review.proposals.filter((proposal) => proposal.status !== "UNCHANGED").length} proposal(s), {review.omittedProjectIds.length + review.omittedCostCodeIds.length} omitted row(s) preserved without deletion.</p></div><span className="text-[11px] font-semibold text-slate-500">Review before Apply</span></div>
        {review.workbookWarnings.length > 0 && <ul className="mt-3 list-disc pl-5 text-[11px] font-semibold text-rose-700">{review.workbookWarnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>}
        <div className="mt-3 space-y-2">
          {review.proposals.map((proposal) => <article key={proposal.id} className="rounded-lg border border-slate-200 p-3" data-project-proposal={proposal.id}>
            <div className="flex flex-wrap items-center gap-2"><input type="checkbox" checked={selectedProposalIds.includes(proposal.id)} onChange={() => toggleProposal(proposal.id)} disabled={!canManage || !proposal.canApply || busy} aria-label={`Select ${proposal.label}`} /><span className="font-mono text-xs font-black text-slate-900">{proposal.label}</span><span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${statusClass(proposal.status)}`}>{proposal.status}</span></div>
            {proposal.messages.length > 0 && <ul className="mt-2 list-disc pl-5 text-[11px] text-slate-600">{proposal.messages.map((item) => <li key={item}>{item}</li>)}</ul>}
            {changeRows(proposal).length > 0 && <div className="mt-2 overflow-x-auto"><table className="w-full text-left text-[11px]"><thead className="border-b border-slate-100 text-[10px] uppercase text-slate-400"><tr><th className="py-1 pr-3">Field</th><th className="py-1 pr-3">Current</th><th className="py-1 pr-3">Excel</th><th className="py-1">Editability</th></tr></thead><tbody>{changeRows(proposal).map((item) => <tr key={`${(item as { costCodeId?: string }).costCodeId || "project"}-${item.label}`} className="border-b border-slate-50"><td className="py-1 pr-3 font-semibold text-slate-700">{item.label}</td><td className="max-w-[14rem] truncate py-1 pr-3 text-slate-500">{String(item.currentValue ?? "—")}</td><td className="max-w-[14rem] truncate py-1 pr-3 font-semibold text-slate-900">{String(item.workbookValue ?? "—")}</td><td className={`py-1 font-semibold ${item.editable ? "text-emerald-700" : "text-rose-700"}`}>{item.editable ? "Editable" : "Protected"}</td></tr>)}</tbody></table></div>}
          </article>)}
        </div>
        <div className="mt-3 border-t border-slate-100 pt-3"><label className="flex items-start gap-2 text-xs text-slate-700"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.currentTarget.checked)} disabled={!canManage || !selectedProposalIds.length || busy} className="mt-0.5" />I reviewed the proposed project and cost-code values and want to Apply the selected valid groups through the authoritative project controls workflow.</label><button type="button" onClick={() => void handleApply()} disabled={!canManage || !confirmed || !selectedProposalIds.length || busy} className="mt-3 inline-flex min-h-10 items-center rounded-lg bg-indigo-700 px-3 py-2 text-xs font-black text-white hover:bg-indigo-800 disabled:cursor-not-allowed disabled:opacity-50">Apply selected changes</button></div>
      </div>}
    </section>
  );
}
