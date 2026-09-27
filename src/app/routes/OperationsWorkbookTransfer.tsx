import React, { useEffect, useMemo, useRef, useState } from "react";
import { Download, FileSpreadsheet, Upload } from "lucide-react";
import {
  hasAnyPermission,
  PERMISSION_KEYS,
  type PermissionKey,
} from "../../utils/accessControl.ts";
import {
  applyCombinedOperationsWorkbookDomain,
  buildCombinedOperationsWorkbookImportReview,
  exportCombinedOperationsWorkbook,
  refreshCombinedOperationsWorkbookDomainReview,
  type CombinedOperationsWorkbookApplyCallbacks,
  type CombinedOperationsWorkbookDomainId,
  type CombinedOperationsWorkbookDomainReview,
  type CombinedOperationsWorkbookImportContext,
  type CombinedOperationsWorkbookImportReview,
  type CombinedOperationsWorkbookProposal,
} from "../../lib/combinedOperationsWorkbook.ts";
import {
  downloadWorkbookArtifact,
} from "../../lib/operationsWorkbook.ts";
import type { ProjectsApplyCallbacks } from "../../lib/projectsWorkbook.ts";
import type { ProjectsWorkbookRecords } from "../../components/projects/ProjectsWorkbookPanel.tsx";
import type {
  ExpensesApplyCallbacks,
  ExpensesWorkbookRecords,
} from "../../lib/expensesWorkbook.ts";
import type {
  ProcurementApplyCallbacks,
  ProcurementRefreshContext,
} from "../../lib/procurementWorkbook.ts";

type SelectedByDomain = Record<CombinedOperationsWorkbookDomainId, string[]>;
type ConfirmedByDomain = Record<CombinedOperationsWorkbookDomainId, boolean>;

export interface OperationsWorkbookTransferProps {
  permissions: readonly PermissionKey[];
  companyId?: string;
  projectRecords: ProjectsWorkbookRecords;
  expenseRecords: ExpensesWorkbookRecords;
  procurementRecords: ProcurementRefreshContext;
  onRefreshProjects?: () => Promise<ProjectsWorkbookRecords>;
  onApplyProjectWorkbookGroup?: ProjectsApplyCallbacks["applyGroup"];
  onRefreshExpenses?: () => Promise<ExpensesWorkbookRecords>;
  onApplyExpenseWorkbook?: ExpensesApplyCallbacks["saveExpense"];
  onRefreshProcurement?: () => Promise<ProcurementRefreshContext>;
  onSaveRFQ?: ProcurementApplyCallbacks["saveRFQ"];
  onSavePurchaseOrder?: ProcurementApplyCallbacks["savePurchaseOrder"];
  demoMode?: boolean;
  disabled?: boolean;
}

const EMPTY_SELECTION: SelectedByDomain = { projects: [], expenses: [], procurement: [] };
const EMPTY_CONFIRMATION: ConfirmedByDomain = { projects: false, expenses: false, procurement: false };

function statusClass(status: string) {
  if (status === "WORKBOOK_ONLY_CHANGE") return "bg-amber-100 text-amber-900";
  if (status === "UNCHANGED") return "bg-slate-100 text-slate-700";
  if (status === "APP_ONLY_CHANGE") return "bg-blue-100 text-blue-900";
  if (["STALE_CONFLICT", "UNAUTHORIZED", "UNSUPPORTED_PROTECTED_FIELD"].includes(status)) return "bg-rose-100 text-rose-900";
  return "bg-orange-100 text-orange-900";
}

function statusLabel(state: CombinedOperationsWorkbookDomainReview["state"]) {
  if (state === "UNAUTHORIZED") return "Not reviewed · access";
  if (state === "NOT_INCLUDED") return "Not included";
  return "Ready for review";
}

function safeDomainForDisplay(
  domain: CombinedOperationsWorkbookDomainReview,
  permissions: readonly PermissionKey[],
): CombinedOperationsWorkbookDomainReview {
  const requiredRead = domain.id === "projects"
    ? [PERMISSION_KEYS.projectsRead]
    : domain.id === "expenses"
      ? [PERMISSION_KEYS.expensesRead, PERMISSION_KEYS.expensesWrite]
      : [PERMISSION_KEYS.procurementRead];
  if (!hasAnyPermission(permissions, requiredRead)) {
    return {
      ...domain,
      state: "UNAUTHORIZED",
      canWrite: false,
      proposals: [],
      changeCount: 0,
      omittedRowCount: 0,
      workbookWarnings: [],
      underlyingReview: undefined,
    } as CombinedOperationsWorkbookDomainReview;
  }
  const currentWrite = domain.id === "projects"
    ? hasAnyPermission(permissions, [PERMISSION_KEYS.projectsWrite])
    : domain.id === "expenses"
      ? hasAnyPermission(permissions, [PERMISSION_KEYS.expensesWrite])
      : hasAnyPermission(permissions, [PERMISSION_KEYS.procurementWrite]);
  const permissionSafeDomain = { ...domain, canWrite: domain.canWrite && currentWrite } as CombinedOperationsWorkbookDomainReview;
  if (permissionSafeDomain.id === "expenses" && permissionSafeDomain.sourceSupplierPayablesIncluded && !hasAnyPermission(permissions, [PERMISSION_KEYS.invoicesRead])) {
    return {
      ...permissionSafeDomain,
      state: "UNAUTHORIZED",
      canWrite: false,
      proposals: [],
      changeCount: 0,
      omittedRowCount: 0,
      workbookWarnings: [],
      sheetIssues: [{ sheetName: "Supplier Payables", state: "UNAUTHORIZED", message: "Supplier Payables was not reviewed for this access profile." }],
      underlyingReview: undefined,
    } as CombinedOperationsWorkbookDomainReview;
  }
  if (permissionSafeDomain.id === "expenses" && !hasAnyPermission(permissions, [PERMISSION_KEYS.invoicesRead])) {
    const proposals = permissionSafeDomain.proposals.map((proposal) => ({
      ...proposal,
      changes: proposal.changes.filter((change) => change.field !== "Supplier Invoice"),
    }));
    return {
      ...permissionSafeDomain,
      proposals,
      changeCount: proposals.reduce((sum, proposal) => sum + proposal.changes.length, 0),
      sheetIssues: permissionSafeDomain.sheetIssues.some((issue) => issue.sheetName === "Supplier Payables")
        ? permissionSafeDomain.sheetIssues
        : [{ sheetName: "Supplier Payables", state: "UNAUTHORIZED", message: "Supplier Payables was not reviewed for this access profile." }],
    } as CombinedOperationsWorkbookDomainReview;
  }
  return permissionSafeDomain;
}

function formatReviewValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    try { return JSON.stringify(value); } catch { return "[value]"; }
  }
  return String(value);
}

function callbackForDomain(
  id: CombinedOperationsWorkbookDomainId,
  callbacks: CombinedOperationsWorkbookApplyCallbacks,
) {
  if (id === "projects") return Boolean(callbacks.projects);
  if (id === "expenses") return Boolean(callbacks.expenses);
  return Boolean(callbacks.procurement);
}

function domainRowsContext(
  permissions: readonly PermissionKey[],
  allowApply: boolean,
  companyId: string | undefined,
  projectRecords: ProjectsWorkbookRecords,
  expenseRecords: ExpensesWorkbookRecords,
  procurementRecords: ProcurementRefreshContext,
): CombinedOperationsWorkbookImportContext {
  return {
    permissions,
    allowApply,
    companyId,
    projects: {
      ...projectRecords,
      expectedCompanyId: companyId,
    },
    expenses: {
      ...expenseRecords,
      expectedCompanyId: expenseRecords.expectedCompanyId || companyId,
    },
    procurement: {
      ...procurementRecords,
      expectedCompanyId: companyId,
    },
  };
}

function domainTitle(domain: CombinedOperationsWorkbookDomainReview) {
  return domain.id === "projects" ? "Projects / Cost Codes"
    : domain.id === "expenses" ? "Expenses / Supplier Payables"
      : "Procurement";
}

export function OperationsWorkbookTransfer({
  permissions,
  companyId,
  projectRecords,
  expenseRecords,
  procurementRecords,
  onRefreshProjects,
  onApplyProjectWorkbookGroup,
  onRefreshExpenses,
  onApplyExpenseWorkbook,
  onRefreshProcurement,
  onSaveRFQ,
  onSavePurchaseOrder,
  demoMode = false,
  disabled = false,
}: OperationsWorkbookTransferProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [review, setReview] = useState<CombinedOperationsWorkbookImportReview | null>(null);
  const [selectedByDomain, setSelectedByDomain] = useState<SelectedByDomain>(EMPTY_SELECTION);
  const [confirmedByDomain, setConfirmedByDomain] = useState<ConfirmedByDomain>(EMPTY_CONFIRMATION);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const permissionSnapshotKey = useMemo(() => [...permissions].sort().join("\u0000"), [permissions]);

  useEffect(() => {
    setSelectedByDomain(EMPTY_SELECTION);
    setConfirmedByDomain(EMPTY_CONFIRMATION);
  }, [companyId, demoMode, permissionSnapshotKey]);

  const callbacks = useMemo<CombinedOperationsWorkbookApplyCallbacks>(() => ({
    ...(onApplyProjectWorkbookGroup ? { projects: { applyGroup: onApplyProjectWorkbookGroup } } : {}),
    ...(onApplyExpenseWorkbook ? { expenses: { saveExpense: onApplyExpenseWorkbook } } : {}),
    ...(onSaveRFQ && onSavePurchaseOrder ? {
      procurement: { saveRFQ: onSaveRFQ, savePurchaseOrder: onSavePurchaseOrder },
    } : {}),
  }), [onApplyExpenseWorkbook, onApplyProjectWorkbookGroup, onSavePurchaseOrder, onSaveRFQ]);

  const visibleDomains = useMemo(
    () => review?.domains.map((domain) => safeDomainForDisplay(domain, permissions)) || [],
    [permissions, review],
  );

  const latestContext = async (): Promise<CombinedOperationsWorkbookImportContext> => {
    const canReadProjects = hasAnyPermission(permissions, [PERMISSION_KEYS.projectsRead]);
    const canReadExpenses = hasAnyPermission(permissions, [PERMISSION_KEYS.expensesRead, PERMISSION_KEYS.expensesWrite]);
    const canReadProcurement = hasAnyPermission(permissions, [PERMISSION_KEYS.procurementRead]);
    const [freshProjects, freshExpenses, freshProcurement] = await Promise.all([
      canReadProjects && onRefreshProjects ? onRefreshProjects() : Promise.resolve(projectRecords),
      canReadExpenses && onRefreshExpenses ? onRefreshExpenses() : Promise.resolve(expenseRecords),
      canReadProcurement && onRefreshProcurement ? onRefreshProcurement() : Promise.resolve(procurementRecords),
    ]);
    return domainRowsContext(permissions, !demoMode, companyId, freshProjects, freshExpenses, freshProcurement);
  };

  const handleExport = () => {
    setNotice("");
    setError("");
    try {
      const artifact = exportCombinedOperationsWorkbook({
        permissions,
        companyId,
        projects: projectRecords,
        expenses: expenseRecords,
        procurement: procurementRecords,
      });
      downloadWorkbookArtifact(artifact, "HydroQualiSense_Operations_Workbook.xlsx");
      setNotice("Combined Operations Workbook downloaded.");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Could not export the combined workbook.");
    }
  };

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    setBusy(true);
    setNotice("");
    setError("");
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const latest = await latestContext();
      const nextReview = buildCombinedOperationsWorkbookImportReview(bytes, latest, { fileName: file.name });
      setReview(nextReview);
      const selected: SelectedByDomain = { projects: [], expenses: [], procurement: [] };
      for (const domain of nextReview.domains) {
        selected[domain.id] = domain.state === "READY" && domain.canWrite && callbackForDomain(domain.id, callbacks)
          ? domain.proposals.filter((proposal) => proposal.canApply).map((proposal) => proposal.id)
          : [];
      }
      setSelectedByDomain(selected);
      setConfirmedByDomain(EMPTY_CONFIRMATION);
      setNotice("Workbook reviewed. Changes remain pending until you apply them within a domain.");
    } catch (nextError) {
      setReview(null);
      setSelectedByDomain(EMPTY_SELECTION);
      setConfirmedByDomain(EMPTY_CONFIRMATION);
      setError(nextError instanceof Error ? nextError.message : "Could not review the combined workbook.");
    } finally {
      setBusy(false);
    }
  };

  const toggleProposal = (domainId: CombinedOperationsWorkbookDomainId, proposalId: string) => {
    setSelectedByDomain((current) => ({
      ...current,
      [domainId]: current[domainId].includes(proposalId)
        ? current[domainId].filter((id) => id !== proposalId)
        : [...current[domainId], proposalId],
    }));
    setConfirmedByDomain((current) => ({ ...current, [domainId]: false }));
  };

  const updateDomainReview = (domainReview: CombinedOperationsWorkbookDomainReview) => {
    setReview((current) => current ? {
      ...current,
      domains: current.domains.map((domain) => domain.id === domainReview.id ? domainReview : domain),
    } : current);
  };

  const handleApply = async (domain: CombinedOperationsWorkbookDomainReview) => {
    const proposalIds = selectedByDomain[domain.id];
    if (!proposalIds.length || !confirmedByDomain[domain.id] || !callbackForDomain(domain.id, callbacks)) return;
    setBusy(true);
    setNotice("");
    setError("");
    try {
      const latest = await latestContext();
      const result = await applyCombinedOperationsWorkbookDomain(domain, latest, callbacks, proposalIds);
      const after = await latestContext();
      const refreshedDomain = refreshCombinedOperationsWorkbookDomainReview(result.domainReview, after);
      updateDomainReview(refreshedDomain);
      setSelectedByDomain((current) => ({ ...current, [domain.id]: [] }));
      setConfirmedByDomain((current) => ({ ...current, [domain.id]: false }));
      setNotice(`Applied ${result.appliedProposalIds.length} reviewed change${result.appliedProposalIds.length === 1 ? "" : "s"} in ${domainTitle(domain)}.`);
    } catch (nextError) {
      try {
        const latest = await latestContext();
        updateDomainReview(refreshCombinedOperationsWorkbookDomainReview(domain, latest));
      } catch {
        // Keep the original review available when a refresh itself is unavailable.
      }
      setConfirmedByDomain((current) => ({ ...current, [domain.id]: false }));
      setError(nextError instanceof Error ? nextError.message : `Could not apply ${domainTitle(domain)} changes.`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-label="Combined Operations Workbook" className="border-b border-slate-200 bg-slate-50/70 px-3 py-3 sm:px-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4 shrink-0 text-emerald-700" aria-hidden="true" />
            <h2 className="text-sm font-bold text-slate-950">Combined workbook</h2>
          </div>
          <p className="mt-1 text-xs text-slate-600">Review imported changes, then Apply separately within each domain.</p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <button type="button" onClick={handleExport} disabled={busy || disabled} className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-800 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50">
            <Download className="h-3.5 w-3.5" aria-hidden="true" />Download workbook
          </button>
          <button type="button" onClick={() => inputRef.current?.click()} disabled={busy || disabled} className="inline-flex min-h-9 items-center gap-1.5 rounded-md bg-emerald-700 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50">
            <Upload className="h-3.5 w-3.5" aria-hidden="true" />Import workbook
          </button>
          <input ref={inputRef} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(event) => void handleImport(event)} className="sr-only" aria-label="Import combined Operations Workbook" />
        </div>
      </div>

      {demoMode && <p role="status" className="mt-2 text-[11px] font-semibold text-slate-500">Synthetic demo · Apply is disabled.</p>}
      {notice && <p role="status" className="mt-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-900">{notice}</p>}
      {error && <p role="alert" className="mt-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-900">{error}</p>}

      {review && <div className="mt-3 space-y-2" aria-label={`Import review: ${review.fileName || "Combined workbook"}`}>
        <div className="flex flex-wrap items-start justify-between gap-2 rounded-md border border-slate-200 bg-white px-3 py-2">
          <div className="min-w-0">
            <h3 className="text-xs font-bold text-slate-900">Review: {review.fileName || "Combined workbook"}</h3>
            {review.workbookWarnings.map((warning) => <p key={warning} className="mt-1 text-[11px] text-slate-600">{warning}</p>)}
          </div>
          <button type="button" onClick={() => { setReview(null); setSelectedByDomain(EMPTY_SELECTION); setConfirmedByDomain(EMPTY_CONFIRMATION); setNotice("Review closed."); }} disabled={busy} className="min-h-8 rounded-md border border-slate-300 px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">Cancel review</button>
        </div>
        {visibleDomains.map((domain) => {
          const selected = selectedByDomain[domain.id];
          const callbackReady = callbackForDomain(domain.id, callbacks);
          const actionable = domain.state === "READY" && domain.canWrite && callbackReady && !demoMode;
          return <details key={domain.id} open className="rounded-md border border-slate-200 bg-white" data-combined-workbook-domain={domain.id}>
            <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 px-3 py-2.5 [&::-webkit-details-marker]:hidden">
              <span className="text-xs font-bold text-slate-900">{domain.label}</span>
              <span className="flex flex-wrap items-center gap-2 text-[10px] font-semibold text-slate-600">
                {domain.state === "READY" && <span>{domain.proposals.length} proposal(s) · {domain.changeCount} changed field(s)</span>}
                {domain.state === "READY" && domain.omittedRowCount > 0 && <span>{domain.omittedRowCount} omitted row(s) preserved</span>}
                <span className={`rounded-full px-2 py-0.5 ${domain.state === "READY" ? "bg-emerald-100 text-emerald-900" : "bg-slate-100 text-slate-700"}`}>{statusLabel(domain.state)}</span>
              </span>
            </summary>
            <div className="space-y-2 border-t border-slate-100 p-3">
              {domain.workbookWarnings.map((warning) => <p key={warning} className="rounded-md bg-amber-50 px-2.5 py-2 text-[11px] font-medium text-amber-900">{warning}</p>)}
              {domain.sheetIssues.map((issue) => <p key={issue.sheetName} role="status" className="rounded-md bg-slate-50 px-2.5 py-2 text-[11px] font-medium text-slate-700">{issue.message}</p>)}
              {domain.state === "READY" && domain.proposals.length === 0 && <p className="text-xs text-slate-600">No records to review in this section.</p>}
              {domain.proposals.map((proposal: CombinedOperationsWorkbookProposal) => <article key={proposal.id} className="rounded-md border border-slate-200 p-2.5" data-combined-workbook-proposal={proposal.id}>
                <div className="flex flex-wrap items-center gap-2">
                  <input type="checkbox" checked={selected.includes(proposal.id)} onChange={() => toggleProposal(domain.id, proposal.id)} disabled={!actionable || !proposal.canApply || busy} aria-label={`Select ${domain.label}: ${proposal.label}`} />
                  <span className="break-words font-mono text-xs font-semibold text-slate-900">{proposal.label}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${statusClass(proposal.status)}`}>{proposal.status}</span>
                </div>
                {proposal.messages.map((message, index) => <p key={`${proposal.id}:message:${index}`} className="mt-1 text-[11px] text-slate-600">{message}</p>)}
                {proposal.changes.length > 0 && <div className="mt-2 overflow-x-auto">
                  <table className="min-w-full text-left text-[11px]">
                    <thead className="border-b border-slate-100 text-[10px] uppercase tracking-wide text-slate-500"><tr><th className="px-2 py-1">Field</th><th className="px-2 py-1">Current</th><th className="px-2 py-1">Workbook</th><th className="px-2 py-1">Result</th></tr></thead>
                    <tbody className="divide-y divide-slate-100">{proposal.changes.map((change, index) => <tr key={`${proposal.id}:change:${index}`}>
                      <td className="px-2 py-1 font-semibold text-slate-700">{change.field}</td>
                      <td className="max-w-48 break-words px-2 py-1 text-slate-600">{formatReviewValue(change.currentValue)}</td>
                      <td className="max-w-48 break-words px-2 py-1 text-slate-900">{formatReviewValue(change.workbookValue)}</td>
                      <td className={`px-2 py-1 font-semibold ${change.editable ? "text-emerald-700" : "text-rose-700"}`}>{change.editable ? "Change" : "Protected"}</td>
                    </tr>)}</tbody>
                  </table>
                </div>}
              </article>)}
              {domain.state === "READY" && <div className="border-t border-slate-100 pt-3">
                {actionable && <label className="flex items-start gap-2 text-[11px] text-slate-700">
                  <input type="checkbox" className="mt-0.5" checked={confirmedByDomain[domain.id]} onChange={(event) => setConfirmedByDomain((current) => ({ ...current, [domain.id]: event.currentTarget.checked }))} disabled={!selected.length || busy} />
                  I reviewed the selected {domain.label} proposals and want to Apply them through this domain’s existing workflow.
                </label>}
                {domain.canWrite && callbackReady && !demoMode
                  ? <button type="button" onClick={() => void handleApply(domain)} disabled={!selected.length || !confirmedByDomain[domain.id] || busy} className="mt-2 inline-flex min-h-9 items-center rounded-md bg-indigo-700 px-3 py-2 text-xs font-bold text-white hover:bg-indigo-800 disabled:cursor-not-allowed disabled:opacity-50">Apply selected {domain.label} changes</button>
                  : <p className="mt-2 text-[11px] text-slate-500">{demoMode ? "Apply is disabled in synthetic demo mode." : "Review only for the current access profile."}</p>}
              </div>}
            </div>
          </details>;
        })}
      </div>}
    </section>
  );
}
