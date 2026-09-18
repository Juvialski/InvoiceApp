import React from "react";
import { Award, Clock, FileCheck, FileText, Layers, Plus, Search, Users } from "lucide-react";
import type { Project, RFQ, SupplierQuotation, Vendor } from "../../types.ts";
import { formatDate, formatMoney } from "../../utils/invoiceLogic.ts";
import { EmptyState } from "../ui/OperationsUI.tsx";

export interface RfqRegisterCounts {
  draft: number;
  issued: number;
  closed: number;
  cancelled: number;
  decided: number;
  total: number;
  totalQuotes: number;
}

export interface RfqRegisterSectionProps {
  filteredRfqs: readonly RFQ[];
  rfqCounts: RfqRegisterCounts;
  quotationsByRfqId: ReadonlyMap<string, readonly SupplierQuotation[]>;
  vendorMap: ReadonlyMap<string, Vendor>;
  projectMap: ReadonlyMap<string, Project>;
  projects: readonly Project[];
  selectedProjectId?: string;
  query: string;
  projectFilter: string;
  statusFilter: string;
  canManage: boolean;
  onQueryChange: (value: string) => void;
  onProjectFilterChange: (value: string) => void;
  onStatusFilterChange: (value: string) => void;
  onCreateRfq: () => void;
  onCompareRfq: (rfq: RFQ) => void;
  onAddQuotation: (rfq: RFQ) => void;
  onEditRfq: (rfq: RFQ) => void;
  onIssueRfq: (rfq: RFQ) => void;
  onCancelRfq: (rfq: RFQ) => void;
}

interface RfqRegisterCardProps {
  rfq: RFQ;
  project?: Project;
  quotes: readonly SupplierQuotation[];
  selectedQuote?: SupplierQuotation;
  selectedVendor?: Vendor;
  invitedCount: number;
  canManage: boolean;
  onCompare: () => void;
  onAddQuote: () => void;
  onEdit: () => void;
  onIssue: () => void;
  onCancel: () => void;
}

function RfqRegisterCard({ rfq, project, quotes, selectedQuote, selectedVendor, invitedCount, canManage, onCompare, onAddQuote, onEdit, onIssue, onCancel }: RfqRegisterCardProps) {
  return <article className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm" data-rfq-register-card={rfq.id}>
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h3 className="break-words font-mono text-sm font-black text-slate-950">{rfq.rfqNumber}</h3>
        <p className="mt-1 break-words text-xs font-semibold text-slate-800">{rfq.title}</p>
        {rfq.description && <p className="mt-1 break-words text-[10px] leading-4 text-slate-500">{rfq.description}</p>}
      </div>
      <span className={`shrink-0 rounded-md px-2 py-1 text-[10px] font-bold ${rfq.status === "ISSUED" ? "bg-purple-100 text-purple-800" : rfq.status === "CLOSED" ? "bg-emerald-100 text-emerald-800" : rfq.status === "CANCELLED" ? "bg-rose-100 text-rose-800" : "bg-amber-100 text-amber-800"}`}>{rfq.status === "ISSUED" ? "OUT FOR QUOTE" : rfq.status}</span>
    </div>

    <dl className="mt-3 grid gap-2 text-xs">
      <div><dt className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Project</dt><dd className="mt-0.5 break-words font-semibold text-indigo-700">{project?.projectCode || "General"}<span className="block text-[10px] font-normal text-slate-500">{project?.projectName || "Unscoped"}</span></dd></div>
      <div className="grid grid-cols-3 gap-2"><div><dt className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Lines</dt><dd className="mt-0.5 font-semibold text-slate-800">{rfq.lines?.length || 0}</dd></div><div><dt className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Invited</dt><dd className="mt-0.5 font-semibold text-slate-800">{invitedCount}</dd></div><div><dt className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Quotes</dt><dd className="mt-0.5 font-semibold text-indigo-700">{quotes.length}</dd></div></div>
      <div><dt className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Dates</dt><dd className="mt-0.5 text-slate-700">{rfq.issueDate ? `Issued ${formatDate(rfq.issueDate, "short")}` : "Not issued"}{rfq.dueDate ? ` · Due ${formatDate(rfq.dueDate, "short")}` : ""}</dd></div>
      <div><dt className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Decision</dt><dd className="mt-0.5 break-words text-slate-700">{selectedQuote ? `Selected: ${selectedVendor?.name || "Supplier"} · ${formatMoney(selectedQuote.totalAmount, selectedQuote.currency)}` : "Pending decision"}</dd></div>
    </dl>

    <div className="mt-3 flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-3"><button type="button" onClick={onCompare} className="inline-flex min-h-10 items-center rounded-lg px-2.5 py-2 text-[10px] font-black text-indigo-700 hover:bg-indigo-50">{quotes.length > 0 ? "View & Compare" : "Compare"}</button>{canManage && rfq.status !== "CANCELLED" && <button type="button" onClick={onAddQuote} className="inline-flex min-h-10 items-center rounded-lg px-2.5 py-2 text-[10px] font-black text-purple-700 hover:bg-purple-50">+ Quote</button>}{canManage && rfq.status === "DRAFT" && <><button type="button" onClick={onEdit} className="inline-flex min-h-10 items-center rounded-lg px-2.5 py-2 text-[10px] font-semibold text-slate-700 hover:bg-slate-50">Edit</button><button type="button" onClick={onIssue} className="inline-flex min-h-10 items-center rounded-lg px-2.5 py-2 text-[10px] font-semibold text-emerald-700 hover:bg-emerald-50">Issue</button></>}{canManage && rfq.status !== "CLOSED" && rfq.status !== "CANCELLED" && <button type="button" onClick={onCancel} className="inline-flex min-h-10 items-center rounded-lg px-2.5 py-2 text-[10px] font-semibold text-rose-700 hover:bg-rose-50">Cancel</button>}</div>
  </article>;
}

export function RfqRegisterSection({
  filteredRfqs,
  rfqCounts,
  quotationsByRfqId,
  vendorMap,
  projectMap,
  projects,
  selectedProjectId,
  query,
  projectFilter,
  statusFilter,
  canManage,
  onQueryChange,
  onProjectFilterChange,
  onStatusFilterChange,
  onCreateRfq,
  onCompareRfq,
  onAddQuotation,
  onEditRfq,
  onIssueRfq,
  onCancelRfq,
}: RfqRegisterSectionProps) {
  return <>
    {/* RFQ KPI Cards */}
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between text-slate-600 mb-1">
          <span className="text-[11px] font-bold uppercase tracking-wider">Total RFQs</span>
          <FileText className="h-4 w-4 text-slate-400" />
        </div>
        <div className="text-lg font-black text-slate-900 tabular-nums">{rfqCounts.total}</div>
        <div className="text-[10px] text-slate-500 mt-0.5">Across active filters</div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between text-amber-700 mb-1">
          <span className="text-[11px] font-bold uppercase tracking-wider">In Draft</span>
          <Clock className="h-4 w-4 text-amber-500" />
        </div>
        <div className="text-lg font-black text-slate-900 tabular-nums">{rfqCounts.draft}</div>
        <div className="text-[10px] text-slate-500 mt-0.5">Specifications in preparation</div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between text-purple-700 mb-1">
          <span className="text-[11px] font-bold uppercase tracking-wider">Issued (Out for Quote)</span>
          <FileCheck className="h-4 w-4 text-purple-500" />
        </div>
        <div className="text-lg font-black text-slate-900 tabular-nums">{rfqCounts.issued}</div>
        <div className="text-[10px] text-slate-500 mt-0.5">Awaiting supplier quotes</div>
      </div>

      <div className="rounded-xl border border-emerald-100 bg-gradient-to-br from-emerald-50/50 to-white p-4 shadow-sm">
        <div className="flex items-center justify-between text-emerald-700 mb-1">
          <span className="text-[11px] font-bold uppercase tracking-wider">Decided / Selected</span>
          <Award className="h-4 w-4 text-emerald-500" />
        </div>
        <div className="text-lg font-black text-slate-900 tabular-nums">{rfqCounts.decided}</div>
        <div className="text-[10px] text-slate-500 mt-0.5">Preferred supplier chosen</div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm col-span-2 sm:col-span-1">
        <div className="flex items-center justify-between text-indigo-700 mb-1">
          <span className="text-[11px] font-bold uppercase tracking-wider">Total Quotations</span>
          <Layers className="h-4 w-4 text-indigo-500" />
        </div>
        <div className="text-lg font-black text-slate-900 tabular-nums">{rfqCounts.totalQuotes}</div>
        <div className="text-[10px] text-slate-500 mt-0.5">Supplier bids received</div>
      </div>
    </div>

    {/* RFQ Filters Bar */}
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex flex-1 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-1.5 focus-within:border-indigo-500 focus-within:bg-white focus-within:ring-1 focus-within:ring-indigo-500">
        <Search className="h-4 w-4 text-slate-400" />
        <input
          type="text"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Search RFQ #, title, description, project..."
          className="w-full bg-transparent text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {!selectedProjectId && (
          <select
            value={projectFilter}
            onChange={(event) => onProjectFilterChange(event.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 focus:border-indigo-500 focus:outline-none"
          >
            <option value="ALL">All Projects</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.projectCode} — {project.projectName}
              </option>
            ))}
          </select>
        )}

        <select
          value={statusFilter}
          onChange={(event) => onStatusFilterChange(event.target.value)}
          className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 focus:border-indigo-500 focus:outline-none"
        >
          <option value="ALL">All Statuses</option>
          <option value="DRAFT">Draft</option>
          <option value="ISSUED">Issued (Out for Quote)</option>
          <option value="CLOSED">Closed</option>
          <option value="CANCELLED">Cancelled</option>
        </select>
      </div>
    </div>

    {/* RFQ Register Table */}
    {filteredRfqs.length > 0 ? (
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="space-y-2 p-3 lg:hidden" aria-label="RFQ register cards">
          {filteredRfqs.map((rfq) => {
            const project = rfq.projectId ? projectMap.get(rfq.projectId) : undefined;
            const quotes = quotationsByRfqId.get(rfq.id) || [];
            const selectedQuote = quotes.find((quote) => quote.id === rfq.selectedQuotationId || quote.status === "SELECTED");
            const selectedVendor = selectedQuote ? vendorMap.get(selectedQuote.vendorId) : undefined;
            const invitedCount = rfq.invitedVendorIds?.length || rfq.invitedVendors?.length || 0;
            return <RfqRegisterCard key={rfq.id} rfq={rfq} project={project} quotes={quotes} selectedQuote={selectedQuote} selectedVendor={selectedVendor} invitedCount={invitedCount} canManage={canManage} onCompare={() => onCompareRfq(rfq)} onAddQuote={() => onAddQuotation(rfq)} onEdit={() => onEditRfq(rfq)} onIssue={() => onIssueRfq(rfq)} onCancel={() => onCancelRfq(rfq)} />;
          })}
        </div>
        <div className="hidden overflow-x-auto lg:block">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-200 bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">RFQ Number</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Project</th>
                <th className="px-4 py-3">Dates</th>
                <th className="px-4 py-3 text-center">Lines</th>
                <th className="px-4 py-3">Invited Vendors</th>
                <th className="px-4 py-3 text-center">Quotes</th>
                <th className="px-4 py-3">Decision Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredRfqs.map((rfq) => {
                const project = rfq.projectId ? projectMap.get(rfq.projectId) : undefined;
                const quotes = quotationsByRfqId.get(rfq.id) || [];
                const selectedQuote = quotes.find(
                  (quote) => quote.id === rfq.selectedQuotationId || quote.status === "SELECTED",
                );
                const selectedVendor = selectedQuote ? vendorMap.get(selectedQuote.vendorId) : undefined;
                const invitedCount = rfq.invitedVendorIds?.length || rfq.invitedVendors?.length || 0;

                return (
                  <tr
                    key={rfq.id}
                    className="hover:bg-slate-50/80 transition-colors"
                  >
                    {/* RFQ Number & Title */}
                    <td className="px-4 py-3 font-mono font-bold text-slate-900">
                      {rfq.rfqNumber}
                      <div className="font-sans font-medium text-[11px] text-slate-700 truncate max-w-xs mt-0.5">
                        {rfq.title}
                      </div>
                      {rfq.description && (
                        <div className="font-sans font-normal text-[10px] text-slate-400 truncate max-w-xs">
                          {rfq.description}
                        </div>
                      )}
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold ${
                          rfq.status === "ISSUED"
                            ? "bg-purple-100 text-purple-800"
                            : rfq.status === "CLOSED"
                            ? "bg-emerald-100 text-emerald-800"
                            : rfq.status === "CANCELLED"
                            ? "bg-rose-100 text-rose-800"
                            : "bg-amber-100 text-amber-800"
                        }`}
                      >
                        {rfq.status === "ISSUED" ? "ISSUED (OUT FOR QUOTE)" : rfq.status}
                      </span>
                    </td>

                    {/* Project */}
                    <td className="px-4 py-3">
                      <div className="font-semibold text-slate-800">{project?.projectCode || "General"}</div>
                      <div className="text-[10px] text-slate-500 truncate max-w-[140px]">
                        {project?.projectName || "Unscoped"}
                      </div>
                    </td>

                    {/* Dates */}
                    <td className="px-4 py-3 text-slate-600 font-mono text-[11px]">
                      {rfq.issueDate && (
                        <div>
                          <span className="text-[10px] text-slate-400">Issued: </span>
                          {formatDate(rfq.issueDate, "short")}
                        </div>
                      )}
                      {rfq.dueDate && (
                        <div className="text-slate-500">
                          <span className="text-[10px] text-slate-400">Due: </span>
                          {formatDate(rfq.dueDate, "short")}
                        </div>
                      )}
                      {!rfq.issueDate && !rfq.dueDate && <span className="text-slate-400 italic">—</span>}
                    </td>

                    {/* Line items count */}
                    <td className="px-4 py-3 text-center tabular-nums text-slate-700 font-semibold">
                      {rfq.lines?.length || 0}
                    </td>

                    {/* Invited vendors count */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5 text-slate-700">
                        <Users className="h-3.5 w-3.5 text-slate-400" />
                        <span className="font-semibold">{invitedCount}</span>
                        <span className="text-[10px] text-slate-400">invited</span>
                      </div>
                    </td>

                    {/* Quotes count */}
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${
                          quotes.length > 0
                            ? "bg-indigo-100 text-indigo-800"
                            : "bg-slate-100 text-slate-500"
                        }`}
                      >
                        {quotes.length} {quotes.length === 1 ? "quote" : "quotes"}
                      </span>
                    </td>

                    {/* Decision Status */}
                    <td className="px-4 py-3">
                      {selectedQuote ? (
                        <div className="space-y-0.5">
                          <span className="inline-flex items-center gap-1 rounded bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-900">
                            <Award className="h-3 w-3 text-emerald-600" />
                            Selected: {selectedVendor?.name || "Supplier"}
                          </span>
                          <div className="text-[10px] font-mono text-slate-500">
                            {formatMoney(selectedQuote.totalAmount, selectedQuote.currency)}
                          </div>
                        </div>
                      ) : (
                        <span className="text-[11px] text-slate-400 italic">Pending Decision</span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {/* Compare / View Quotes button */}
                        <button
                          type="button"
                          onClick={() => onCompareRfq(rfq)}
                          className="px-2.5 py-1 text-xs font-semibold text-indigo-600 hover:text-indigo-900 rounded-lg hover:bg-indigo-50 transition"
                        >
                          {quotes.length > 0 ? "View & Compare" : "Compare"}
                        </button>

                        {/* Add Quote button */}
                        {canManage && rfq.status !== "CANCELLED" && (
                          <button
                            type="button"
                            onClick={() => onAddQuotation(rfq)}
                            className="px-2.5 py-1 text-xs font-semibold text-purple-600 hover:text-purple-900 rounded-lg hover:bg-purple-50 transition"
                          >
                            + Quote
                          </button>
                        )}

                        {/* Edit RFQ (if draft) */}
                        {canManage && rfq.status === "DRAFT" && (
                          <>
                            <button
                              type="button"
                              onClick={() => onEditRfq(rfq)}
                              className="px-2 py-1 text-xs font-semibold text-slate-600 hover:text-slate-900 rounded-lg hover:bg-slate-100 transition"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => onIssueRfq(rfq)}
                              className="px-2 py-1 text-xs font-semibold text-emerald-600 hover:text-emerald-900 rounded-lg hover:bg-emerald-50 transition"
                            >
                              Issue
                            </button>
                          </>
                        )}

                        {/* Cancel RFQ */}
                        {canManage && rfq.status !== "CLOSED" && rfq.status !== "CANCELLED" && (
                          <button
                            type="button"
                            onClick={() => onCancelRfq(rfq)}
                            className="px-2 py-1 text-xs font-semibold text-rose-600 hover:text-rose-900 rounded-lg hover:bg-rose-50 transition"
                          >
                            Cancel
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    ) : (
      <EmptyState
        icon={FileText}
        title={
          query || statusFilter !== "ALL" || projectFilter !== "ALL"
            ? "No RFQs match your filter"
            : "No Requests for Quotation yet"
        }
        description="Create an RFQ to specify required materials, invite vendors, and compare competitive bids side-by-side."
        action={
          canManage ? (
            <button
              type="button"
              onClick={onCreateRfq}
              className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700 transition"
            >
              <Plus className="h-4 w-4" />
              New RFQ
            </button>
          ) : undefined
        }
      />
    )}
  </>;
}
