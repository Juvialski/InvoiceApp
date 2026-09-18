import React from "react";
import {
  AlertCircle,
  Building2,
  CheckCircle2,
  Clock,
  DollarSign,
  FileCheck,
  FileEdit,
  Percent,
  Plus,
  Search,
  X,
} from "lucide-react";
import type { Project, Subcontract } from "../../types.ts";
import { formatDate, formatMoney } from "../../utils/invoiceLogic.ts";
import { EmptyState } from "../ui/OperationsUI.tsx";

type CurrencyTotal = readonly [string, number];

export interface SubcontractRegisterRow {
  subcontract: Subcontract;
  vendorLabel: string;
  projectCode: string;
  projectName: string;
  variationCount: number;
  metrics: {
    originalAmount: number;
    revisedSubcontractValue: number;
    netApprovedVariations: number;
    cumulativeApprovedGross: number;
    remainingCommitment: number;
    claimsCount: number;
  };
  isApprovalReady: boolean;
}

export interface SubcontractRegisterCounts {
  total: number;
  active: number;
  drafts: number;
}

export interface SubcontractRegisterSectionProps {
  rows: readonly SubcontractRegisterRow[];
  counts: SubcontractRegisterCounts;
  activeCommittedSubcontractTotals: readonly CurrencyTotal[];
  certifiedSubcontractTotals: readonly CurrencyTotal[];
  retentionHeldTotals: readonly CurrencyTotal[];
  projects: readonly Project[];
  selectedProjectId?: string;
  query: string;
  projectFilter: string;
  statusFilter: string;
  canManage: boolean;
  canApprove: boolean;
  subcontractActionId: string | null;
  subcontractActionError: string | null;
  onQueryChange: (value: string) => void;
  onProjectFilterChange: (value: string) => void;
  onStatusFilterChange: (value: string) => void;
  onCreateSubcontract: () => void;
  onOpenVariations: (subcontract: Subcontract) => void;
  onOpenClaims: (subcontract: Subcontract) => void;
  onOpenSubcontract: (subcontract: Subcontract) => void;
  onApproveSubcontract: (subcontract: Subcontract) => void;
  onActivateSubcontract: (subcontract: Subcontract) => void;
  onCloseSubcontract: (subcontract: Subcontract) => void;
  onCancelSubcontract: (subcontract: Subcontract) => void;
  onDeleteDraftSubcontract: (subcontract: Subcontract) => void;
}

interface SubcontractRegisterActionsProps {
  row: SubcontractRegisterRow;
  canManage: boolean;
  canApprove: boolean;
  isBusy: boolean;
  actionId: string | null;
  onOpenVariations: (subcontract: Subcontract) => void;
  onOpenClaims: (subcontract: Subcontract) => void;
  onOpenSubcontract: (subcontract: Subcontract) => void;
  onApproveSubcontract: (subcontract: Subcontract) => void;
  onActivateSubcontract: (subcontract: Subcontract) => void;
  onCloseSubcontract: (subcontract: Subcontract) => void;
  onCancelSubcontract: (subcontract: Subcontract) => void;
  onDeleteDraftSubcontract: (subcontract: Subcontract) => void;
}

function SubcontractRegisterActions({
  row,
  canManage,
  canApprove,
  isBusy,
  actionId,
  onOpenVariations,
  onOpenClaims,
  onOpenSubcontract,
  onApproveSubcontract,
  onActivateSubcontract,
  onCloseSubcontract,
  onCancelSubcontract,
  onDeleteDraftSubcontract,
}: SubcontractRegisterActionsProps) {
  const { subcontract, metrics } = row;
  const isDraft = subcontract.status === "DRAFT";
  const isApproved = subcontract.status === "APPROVED";
  const isActive = subcontract.status === "ACTIVE";
  const isTerminal = subcontract.status === "CLOSED" || subcontract.status === "CANCELLED";
  const isWorking = actionId === subcontract.id;

  const confirmClose = () => {
    if (typeof window !== "undefined" && !window.confirm(`Close subcontract ${subcontract.subcontractNumber}? It will become terminal and no longer contribute to committed cost.`)) return;
    onCloseSubcontract(subcontract);
  };

  const confirmDelete = () => {
    if (typeof window !== "undefined" && !window.confirm(`Delete draft subcontract ${subcontract.subcontractNumber}?`)) return;
    onDeleteDraftSubcontract(subcontract);
  };

  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      <button
        type="button"
        onClick={() => onOpenVariations(subcontract)}
        disabled={isBusy}
        className="flex items-center gap-1 rounded-lg border border-purple-200 bg-purple-50/70 px-2.5 py-1 text-xs font-semibold text-purple-700 shadow-xs transition hover:bg-purple-100 disabled:cursor-not-allowed disabled:opacity-50"
        title={`Open variations register for ${subcontract.subcontractNumber}`}
      >
        <FileEdit className="h-3.5 w-3.5" />
        <span>Variations ({row.variationCount})</span>
      </button>

      <button
        type="button"
        onClick={() => onOpenClaims(subcontract)}
        disabled={isBusy}
        className="flex items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50/70 px-2.5 py-1 text-xs font-semibold text-indigo-700 shadow-xs transition hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-50"
        title={`Open claims register for ${subcontract.subcontractNumber}`}
      >
        <FileCheck className="h-3.5 w-3.5" />
        <span>Claims ({metrics.claimsCount})</span>
      </button>

      <button
        type="button"
        onClick={() => onOpenSubcontract(subcontract)}
        disabled={isBusy}
        className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isDraft && canManage ? "Edit" : "View"}
      </button>

      {isDraft && canApprove && (
        <button
          type="button"
          onClick={() => onApproveSubcontract(subcontract)}
          disabled={isBusy || !row.isApprovalReady}
          className="rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700 shadow-sm transition hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
          title={row.isApprovalReady ? "Approve Subcontract" : "Add a positive scope line before approval"}
          aria-label={`Approve subcontract ${subcontract.subcontractNumber}`}
          aria-busy={isWorking || undefined}
        >
          {isWorking ? "Working…" : "Approve"}
        </button>
      )}

      {isApproved && canApprove && (
        <button
          type="button"
          onClick={() => onActivateSubcontract(subcontract)}
          disabled={isBusy}
          className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 shadow-sm transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
          title="Activate Commitment (requires procurement.approve)"
          aria-label={`Activate subcontract ${subcontract.subcontractNumber}`}
          aria-busy={isWorking || undefined}
        >
          {isWorking ? "Working…" : "Activate"}
        </button>
      )}

      {isActive && canApprove && (
        <button
          type="button"
          onClick={confirmClose}
          disabled={isBusy}
          className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
          title="Close Subcontract (requires procurement.approve)"
          aria-label={`Close subcontract ${subcontract.subcontractNumber}`}
          aria-busy={isWorking || undefined}
        >
          {isWorking ? "Working…" : "Close"}
        </button>
      )}

      {!isTerminal && canApprove && (
        <button
          type="button"
          onClick={() => onCancelSubcontract(subcontract)}
          disabled={isBusy}
          className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 shadow-sm transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
          title="Cancel Subcontract (requires procurement.approve)"
          aria-label={`Cancel subcontract ${subcontract.subcontractNumber}`}
        >
          Cancel
        </button>
      )}

      {isDraft && canManage && (
        <button
          type="button"
          onClick={confirmDelete}
          disabled={isBusy}
          className="rounded p-1 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-50"
          title="Delete Draft"
          aria-label={`Delete draft subcontract ${subcontract.subcontractNumber}`}
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

interface SubcontractRegisterCardProps extends SubcontractRegisterActionsProps {
  row: SubcontractRegisterRow;
}

function SubcontractRegisterCard({ row, ...actionProps }: SubcontractRegisterCardProps) {
  const { subcontract, metrics } = row;
  const currency = subcontract.currency || "PHP";

  return (
    <article className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm" data-subcontract-register-card={subcontract.id}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="break-words font-mono text-sm font-black text-slate-950">{subcontract.subcontractNumber}</h3>
          <p className="mt-1 break-words text-xs font-semibold text-slate-800">{subcontract.title}</p>
          {subcontract.notes && <p className="mt-1 break-words text-[11px] text-slate-500">{subcontract.notes}</p>}
        </div>
        <SubcontractStatusBadge status={subcontract.status} />
      </div>

      <dl className="mt-3 grid gap-2 text-xs">
        <div>
          <dt className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Vendor</dt>
          <dd className="mt-0.5 break-words font-semibold text-slate-800">{row.vendorLabel}</dd>
        </div>
        <div>
          <dt className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Project</dt>
          <dd className="mt-0.5 break-words font-semibold text-indigo-700">{row.projectCode}<span className="block text-[10px] font-normal text-slate-500">{row.projectName}</span></dd>
        </div>
        <div>
          <dt className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Contract value</dt>
          <dd className="mt-0.5 font-mono font-black tabular-nums text-slate-950">{formatMoney(metrics.revisedSubcontractValue, currency)}</dd>
          {metrics.netApprovedVariations !== 0 && <dd className="text-[10px] text-purple-700">Orig: {formatMoney(metrics.originalAmount, currency)} ({metrics.netApprovedVariations > 0 ? "+" : ""}{formatMoney(metrics.netApprovedVariations, currency)})</dd>}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <dt className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Certified work</dt>
            <dd className="mt-0.5 font-mono font-bold tabular-nums text-emerald-700">{formatMoney(metrics.cumulativeApprovedGross, currency)}</dd>
          </div>
          <div>
            <dt className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Remaining</dt>
            <dd className="mt-0.5 font-mono font-bold tabular-nums text-blue-700">{formatMoney(metrics.remainingCommitment, currency)}</dd>
          </div>
        </div>
        <div>
          <dt className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Schedule</dt>
          <dd className="mt-0.5 text-slate-600">{subcontract.startDate || subcontract.targetCompletionDate ? `${subcontract.startDate ? formatDate(subcontract.startDate, "short") : "—"} to ${subcontract.targetCompletionDate ? formatDate(subcontract.targetCompletionDate, "short") : "—"}` : "Not scheduled"}</dd>
        </div>
      </dl>

      <div className="mt-3 border-t border-slate-100 pt-3">
        <SubcontractRegisterActions row={row} {...actionProps} />
      </div>
    </article>
  );
}

function SubcontractStatusBadge({ status }: { status: Subcontract["status"] }) {
  const className = status === "ACTIVE"
    ? "bg-emerald-100 text-emerald-800"
    : status === "APPROVED"
      ? "bg-blue-100 text-blue-800"
      : status === "CLOSED"
        ? "bg-slate-100 text-slate-700"
        : status === "CANCELLED"
          ? "bg-rose-100 text-rose-800"
          : "bg-amber-100 text-amber-800";

  return <span className={`inline-flex shrink-0 items-center rounded-md px-2 py-1 text-[10px] font-bold ${className}`}>{status}</span>;
}

export function SubcontractRegisterSection({
  rows,
  counts,
  activeCommittedSubcontractTotals,
  certifiedSubcontractTotals,
  retentionHeldTotals,
  projects,
  selectedProjectId,
  query,
  projectFilter,
  statusFilter,
  canManage,
  canApprove,
  subcontractActionId,
  subcontractActionError,
  onQueryChange,
  onProjectFilterChange,
  onStatusFilterChange,
  onCreateSubcontract,
  onOpenVariations,
  onOpenClaims,
  onOpenSubcontract,
  onApproveSubcontract,
  onActivateSubcontract,
  onCloseSubcontract,
  onCancelSubcontract,
  onDeleteDraftSubcontract,
}: SubcontractRegisterSectionProps) {
  const actionProps = {
    canManage,
    canApprove,
    isBusy: subcontractActionId !== null,
    actionId: subcontractActionId,
    onOpenVariations,
    onOpenClaims,
    onOpenSubcontract,
    onApproveSubcontract,
    onActivateSubcontract,
    onCloseSubcontract,
    onCancelSubcontract,
    onDeleteDraftSubcontract,
  };

  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <div className="rounded-xl border border-indigo-100 bg-gradient-to-br from-indigo-50/50 to-white p-3.5 shadow-xs">
          <div className="mb-1 flex items-center justify-between text-indigo-600"><span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Total Subcontracts</span><Building2 className="h-4 w-4 text-indigo-500" /></div>
          <div className="text-xl font-black tabular-nums text-slate-900">{counts.total}</div>
          <div className="mt-1 truncate text-[10px] text-slate-500">Registered trade packages</div>
        </div>

        <div className="rounded-xl border border-emerald-100 bg-gradient-to-br from-emerald-50/50 to-white p-3.5 shadow-xs">
          <div className="mb-1 flex items-center justify-between text-emerald-600"><span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Active Packages</span><CheckCircle2 className="h-4 w-4 text-emerald-500" /></div>
          <div className="text-xl font-black tabular-nums text-slate-900">{counts.active}</div>
          <div className="mt-1 truncate text-[10px] text-slate-500">In-progress commitments</div>
        </div>

        <div className="rounded-xl border border-emerald-100 bg-gradient-to-br from-emerald-50/40 to-white p-3.5 shadow-xs">
          <div className="mb-1 flex items-center justify-between text-emerald-600"><span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Certified Work</span><FileCheck className="h-4 w-4 text-emerald-500" /></div>
          <div className="text-xl font-black tabular-nums text-emerald-700">{certifiedSubcontractTotals.length > 0 ? certifiedSubcontractTotals.map(([currency, amount]) => <div key={currency}>{formatMoney(amount, currency)}</div>) : "—"}</div>
          <div className="mt-1 truncate text-[10px] text-slate-500">Approved progress claims</div>
        </div>

        <div className="rounded-xl border border-blue-100 bg-gradient-to-br from-blue-50/50 to-white p-3.5 shadow-xs">
          <div className="mb-1 flex items-center justify-between text-blue-600"><span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Remaining Commitment</span><DollarSign className="h-4 w-4 text-blue-500" /></div>
          <div className="text-xl font-black tabular-nums text-slate-900">{activeCommittedSubcontractTotals.length > 0 ? activeCommittedSubcontractTotals.map(([currency, amount]) => <div key={currency}>{formatMoney(amount, currency)}</div>) : "—"}</div>
          <div className="mt-1 truncate text-[10px] text-slate-500">Uncertified liability</div>
        </div>

        <div className="rounded-xl border border-amber-100 bg-gradient-to-br from-amber-50/50 to-white p-3.5 shadow-xs">
          <div className="mb-1 flex items-center justify-between text-amber-600"><span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Retention Held</span><Percent className="h-4 w-4 text-amber-500" /></div>
          <div className="text-xl font-black tabular-nums text-amber-700">{retentionHeldTotals.length > 0 ? retentionHeldTotals.map(([currency, amount]) => <div key={currency}>{formatMoney(amount, currency)}</div>) : "—"}</div>
          <div className="mt-1 truncate text-[10px] text-slate-500">Withheld retention</div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50/50 to-white p-3.5 shadow-xs">
          <div className="mb-1 flex items-center justify-between text-slate-600"><span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Drafts</span><Clock className="h-4 w-4 text-slate-400" /></div>
          <div className="text-xl font-black tabular-nums text-slate-900">{counts.drafts}</div>
          <div className="mt-1 truncate text-[10px] text-slate-500">Pending commercial review</div>
        </div>
      </div>

      {subcontractActionError && <div role="alert" className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-700"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /><span>{subcontractActionError}</span></div>}

      <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-1.5 focus-within:border-indigo-500 focus-within:bg-white focus-within:ring-1 focus-within:ring-indigo-500">
          <Search className="h-4 w-4 text-slate-400" />
          <input type="text" value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="Search subcontract #, vendor, project, scope title..." className="w-full bg-transparent text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none" />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!selectedProjectId && <select value={projectFilter} onChange={(event) => onProjectFilterChange(event.target.value)} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 focus:border-indigo-500 focus:outline-none"><option value="ALL">All Projects</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.projectCode} — {project.projectName}</option>)}</select>}
          <select value={statusFilter} onChange={(event) => onStatusFilterChange(event.target.value)} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm focus:border-indigo-500 focus:outline-none"><option value="ALL">All Statuses</option><option value="DRAFT">Draft</option><option value="APPROVED">Approved</option><option value="ACTIVE">Active Commitments</option><option value="CLOSED">Closed</option><option value="CANCELLED">Cancelled</option></select>
        </div>
      </div>

      {rows.length > 0 ? (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="space-y-2 p-3 lg:hidden" aria-label="Subcontract register cards">
            {rows.map((row) => <SubcontractRegisterCard key={row.subcontract.id} row={row} {...actionProps} />)}
          </div>
          <div className="hidden overflow-x-auto lg:block">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500"><tr><th scope="col" className="px-4 py-3">Subcontract #</th><th scope="col" className="px-4 py-3">Vendor</th><th scope="col" className="px-4 py-3">Project</th><th scope="col" className="px-4 py-3">Scope Title</th><th scope="col" className="px-4 py-3 text-right">Contract Value</th><th scope="col" className="px-4 py-3 text-right">Certified Work</th><th scope="col" className="px-4 py-3 text-right">Remaining Commitment</th><th scope="col" className="px-4 py-3 text-center">Status</th><th scope="col" className="px-4 py-3">Schedule (Start - Target)</th><th scope="col" className="px-4 py-3 text-right">Actions</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((row) => {
                  const { subcontract, metrics } = row;
                  const currency = subcontract.currency || "PHP";
                  return <tr key={subcontract.id} className="transition-colors hover:bg-slate-50/80">
                    <td className="px-4 py-3 font-mono font-bold text-slate-900">{subcontract.subcontractNumber}{subcontract.notes && <div className="mt-0.5 max-w-xs truncate font-sans text-[10px] font-normal text-slate-400">{subcontract.notes}</div>}</td>
                    <td className="px-4 py-3 font-semibold text-slate-800">{row.vendorLabel}</td>
                    <td className="px-4 py-3"><div className="font-semibold text-slate-800">{row.projectCode}</div><div className="max-w-[140px] truncate text-[10px] text-slate-500">{row.projectName}</div></td>
                    <td className="px-4 py-3"><div className="max-w-xs font-medium text-slate-900">{subcontract.title}</div>{subcontract.lines && subcontract.lines.length > 0 && <div className="text-[10px] text-slate-400">{subcontract.lines.length} {subcontract.lines.length === 1 ? "line item" : "line items"}</div>}</td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-slate-900"><div>{formatMoney(metrics.revisedSubcontractValue, currency)}</div>{metrics.netApprovedVariations !== 0 && <div className="font-sans text-[10px] font-medium text-purple-700">Orig: {formatMoney(metrics.originalAmount, currency)} ({metrics.netApprovedVariations > 0 ? "+" : ""}{formatMoney(metrics.netApprovedVariations, currency)})</div>}</td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-emerald-700">{formatMoney(metrics.cumulativeApprovedGross, currency)}</td>
                    <td className="px-4 py-3 text-right font-mono font-medium text-blue-700">{formatMoney(metrics.remainingCommitment, currency)}</td>
                    <td className="px-4 py-3 text-center"><SubcontractStatusBadge status={subcontract.status} /></td>
                    <td className="px-4 py-3 font-mono text-[11px] text-slate-600">{subcontract.startDate || subcontract.targetCompletionDate ? <span>{subcontract.startDate ? formatDate(subcontract.startDate, "short") : "—"} to {subcontract.targetCompletionDate ? formatDate(subcontract.targetCompletionDate, "short") : "—"}</span> : <span className="text-slate-400">Not scheduled</span>}</td>
                    <td className="px-4 py-3 text-right"><SubcontractRegisterActions row={row} {...actionProps} /></td>
                  </tr>;
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <EmptyState icon={Building2} title="No subcontracts found" description={query || statusFilter !== "ALL" || projectFilter !== "ALL" ? "No subcontracts matched your current search filters." : "No subcontract commitments have been established yet."} action={canManage ? <button type="button" onClick={onCreateSubcontract} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-indigo-700"><Plus className="h-4 w-4" />Create First Subcontract</button> : undefined} />
      )}
    </>
  );
}
