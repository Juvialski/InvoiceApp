import React from "react";
import { CheckCircle2, Clock, FileCheck, FileText, Search, ShoppingCart, Truck } from "lucide-react";
import type { Project, PurchaseOrder, Vendor } from "../../types.ts";
import { formatDate, formatMoney } from "../../utils/invoiceLogic.ts";
import { calculatePOReceiptProgress } from "../../utils/purchaseOrderReceipts.ts";
import { EmptyState } from "../ui/OperationsUI.tsx";

export interface PurchaseOrderRegisterCounts {
  draft: number;
  approved: number;
  issued: number;
  closed: number;
  cancelled: number;
  total: number;
}

export interface PurchaseOrderRegisterSectionProps {
  filteredOrders: readonly PurchaseOrder[];
  activeCommittedPurchaseOrderTotals: readonly (readonly [string, number])[];
  poCounts: PurchaseOrderRegisterCounts;
  poProgressMap: ReadonlyMap<string, ReturnType<typeof calculatePOReceiptProgress>>;
  vendorMap: ReadonlyMap<string, Vendor>;
  projectMap: ReadonlyMap<string, Project>;
  projects: readonly Project[];
  selectedProjectId?: string;
  query: string;
  projectFilter: string;
  statusFilter: string;
  deliveryFilter: string;
  onQueryChange: (value: string) => void;
  onProjectFilterChange: (value: string) => void;
  onStatusFilterChange: (value: string) => void;
  onDeliveryFilterChange: (value: string) => void;
  onPreviewPo: (po: PurchaseOrder) => void;
  onOpenPo: (po: PurchaseOrder) => void;
}

interface PurchaseOrderRegisterCardProps {
  po: PurchaseOrder;
  vendor?: Vendor;
  project?: Project;
  progress?: ReturnType<typeof calculatePOReceiptProgress>;
  onPreview: () => void;
  onOpen: () => void;
}

function PurchaseOrderRegisterCard({ po, vendor, project, progress, onPreview, onOpen }: PurchaseOrderRegisterCardProps) {
  const deliveryLabel = po.status === "ISSUED" || po.status === "CLOSED"
    ? progress?.deliveryStatus === "FULLY_RECEIVED"
      ? "Fully delivered"
      : progress?.deliveryStatus === "PARTIALLY_RECEIVED"
        ? `${progress.overallProgressPercent}% received`
        : "0% delivered"
    : po.status === "DRAFT" ? "Draft" : po.status === "APPROVED" ? "Not issued" : "—";

  return <article className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm" data-purchase-order-register-card={po.id}>
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h3 className="break-words font-mono text-sm font-black text-slate-950">{po.poNumber}</h3>
        {po.description && <p className="mt-1 break-words text-xs text-slate-600">{po.description}</p>}
      </div>
      <span className={`shrink-0 rounded-md px-2 py-1 text-[10px] font-bold ${po.status === "ISSUED" ? "bg-purple-100 text-purple-800" : po.status === "CLOSED" ? "bg-emerald-100 text-emerald-800" : po.status === "CANCELLED" ? "bg-rose-100 text-rose-800" : po.status === "APPROVED" ? "bg-blue-100 text-blue-800" : "bg-slate-100 text-slate-700"}`}>{po.status}</span>
    </div>

    <dl className="mt-3 grid gap-2 text-xs">
      <div><dt className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Supplier</dt><dd className="mt-0.5 break-words font-semibold text-slate-800">{vendor?.name || "Unknown vendor"}</dd></div>
      <div><dt className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Project</dt><dd className="mt-0.5 break-words font-semibold text-indigo-700">{project?.projectCode || "—"}<span className="block text-[10px] font-normal text-slate-500">{project?.projectName || "Unscoped"}</span></dd></div>
      <div className="grid grid-cols-2 gap-3"><div><dt className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Delivery</dt><dd className="mt-0.5 font-semibold text-slate-800">{deliveryLabel}{progress && progress.totalOrderedQuantity > 0 && <span className="block text-[10px] font-normal text-slate-500">{progress.totalReceivedQuantity} / {progress.totalOrderedQuantity} units</span>}</dd></div><div><dt className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Committed amount</dt><dd className="mt-0.5 font-mono font-black tabular-nums text-slate-950">{formatMoney(po.totalAmount || 0, po.currency || "PHP")}</dd></div></div>
      <div><dt className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Issue date · items</dt><dd className="mt-0.5 text-slate-700">{po.issueDate ? formatDate(po.issueDate, "short") : "Not issued"} · {po.lines?.length || 0} item{po.lines?.length === 1 ? "" : "s"}</dd></div>
    </dl>

    <div className="mt-3 flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-3"><button type="button" onClick={onPreview} className="inline-flex min-h-10 items-center gap-1 rounded-lg px-2.5 py-2 text-[10px] font-semibold text-slate-700 hover:bg-slate-50"><FileText className="h-3.5 w-3.5" />Preview</button><button type="button" onClick={onOpen} className="inline-flex min-h-10 items-center rounded-lg px-2.5 py-2 text-[10px] font-black text-indigo-700 hover:bg-indigo-50">View / Edit</button></div>
  </article>;
}

export function PurchaseOrderRegisterSection({
  filteredOrders,
  activeCommittedPurchaseOrderTotals,
  poCounts,
  poProgressMap,
  vendorMap,
  projectMap,
  projects,
  selectedProjectId,
  query,
  projectFilter,
  statusFilter,
  deliveryFilter,
  onQueryChange,
  onProjectFilterChange,
  onStatusFilterChange,
  onDeliveryFilterChange,
  onPreviewPo,
  onOpenPo,
}: PurchaseOrderRegisterSectionProps) {
  return <>
    {/* PO KPI Cards */}
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-5">
      <div className="rounded-xl border border-indigo-100 bg-gradient-to-br from-indigo-50/50 to-white p-4 shadow-sm">
        <div className="flex items-center justify-between text-indigo-700 mb-1">
          <span className="text-[11px] font-bold uppercase tracking-wider">Active Committed</span>
          <ShoppingCart className="h-4 w-4" />
        </div>
        <div className="text-lg font-black text-slate-900 tabular-nums">
          {activeCommittedPurchaseOrderTotals.length > 0 ? (
            <div className="space-y-0.5">
              {activeCommittedPurchaseOrderTotals.map(([currency, amount]) => (
                <div key={currency}>{formatMoney(amount, currency)}</div>
              ))}
            </div>
          ) : (
            "—"
          )}
        </div>
        <div className="text-[10px] text-slate-500 mt-0.5">Approved &amp; Issued orders; currencies shown separately</div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between text-slate-600 mb-1">
          <span className="text-[11px] font-bold uppercase tracking-wider">Total Orders</span>
          <FileText className="h-4 w-4 text-slate-400" />
        </div>
        <div className="text-lg font-black text-slate-900 tabular-nums">{poCounts.total}</div>
        <div className="text-[10px] text-slate-500 mt-0.5">Across active filters</div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between text-blue-700 mb-1">
          <span className="text-[11px] font-bold uppercase tracking-wider">Approved / Issued</span>
          <FileCheck className="h-4 w-4 text-blue-500" />
        </div>
        <div className="text-lg font-black text-slate-900 tabular-nums">
          {poCounts.approved + poCounts.issued}
        </div>
        <div className="text-[10px] text-slate-500 mt-0.5">
          {poCounts.approved} approved, {poCounts.issued} issued
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between text-amber-700 mb-1">
          <span className="text-[11px] font-bold uppercase tracking-wider">In Draft</span>
          <Clock className="h-4 w-4 text-amber-500" />
        </div>
        <div className="text-lg font-black text-slate-900 tabular-nums">{poCounts.draft}</div>
        <div className="text-[10px] text-slate-500 mt-0.5">Not yet committed</div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm col-span-2 sm:col-span-1">
        <div className="flex items-center justify-between text-emerald-700 mb-1">
          <span className="text-[11px] font-bold uppercase tracking-wider">Closed</span>
          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
        </div>
        <div className="text-lg font-black text-slate-900 tabular-nums">{poCounts.closed}</div>
        <div className="text-[10px] text-slate-500 mt-0.5">Completed obligations</div>
      </div>
    </div>

    {/* PO Filters Bar */}
    <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm xl:grid-cols-[minmax(18rem,1fr)_minmax(0,auto)] xl:items-center">
      <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-1.5 focus-within:border-indigo-500 focus-within:bg-white focus-within:ring-1 focus-within:ring-indigo-500">
        <Search className="h-4 w-4 text-slate-400" />
        <input
          type="text"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Search PO #, supplier, project, description..."
          className="w-full bg-transparent text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none"
        />
      </div>

      <div className="flex w-full min-w-0 flex-wrap items-center gap-2 xl:w-auto">
        {!selectedProjectId && (
          <select
            value={projectFilter}
            onChange={(event) => onProjectFilterChange(event.target.value)}
            className="min-w-0 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 focus:border-indigo-500 focus:outline-none sm:w-auto"
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
          className="min-w-0 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 focus:border-indigo-500 focus:outline-none sm:w-auto"
        >
          <option value="ALL">All Statuses</option>
          <option value="DRAFT">Draft</option>
          <option value="APPROVED">Approved</option>
          <option value="ISSUED">Issued</option>
          <option value="CLOSED">Closed</option>
          <option value="CANCELLED">Cancelled</option>
        </select>

        <select
          value={deliveryFilter}
          onChange={(event) => onDeliveryFilterChange(event.target.value)}
          className="min-w-0 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 focus:border-indigo-500 focus:outline-none sm:w-auto"
        >
          <option value="ALL">All Delivery States</option>
          <option value="NOT_RECEIVED">Pending Delivery (0%)</option>
          <option value="PARTIALLY_RECEIVED">Partially Delivered</option>
          <option value="FULLY_RECEIVED">Fully Delivered (100%)</option>
        </select>
      </div>
    </div>

    {/* PO Register Table */}
    {filteredOrders.length > 0 ? (
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="space-y-2 p-3 lg:hidden" aria-label="Purchase order register cards">
          {filteredOrders.map((po) => <PurchaseOrderRegisterCard key={po.id} po={po} vendor={vendorMap.get(po.vendorId)} project={projectMap.get(po.projectId)} progress={poProgressMap.get(po.id)} onPreview={() => onPreviewPo(po)} onOpen={() => onOpenPo(po)} />)}
        </div>
        <div className="hidden overflow-x-auto lg:block">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-200 bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">PO Number</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Delivery Progress</th>
                <th className="px-4 py-3">Supplier / Vendor</th>
                <th className="px-4 py-3">Project</th>
                <th className="px-4 py-3">Issue Date</th>
                <th className="px-4 py-3 text-center">Items</th>
                <th className="px-4 py-3 text-right">Committed Amount</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredOrders.map((po) => {
                const vendor = vendorMap.get(po.vendorId);
                const project = projectMap.get(po.projectId);
                const progress = poProgressMap.get(po.id);
                return (
                  <tr
                    key={po.id}
                    onClick={() => onOpenPo(po)}
                    className="cursor-pointer hover:bg-slate-50/80 transition-colors"
                  >
                    <td className="px-4 py-3 font-mono font-bold text-slate-900">
                      {po.poNumber}
                      {po.description && (
                        <div className="font-sans font-normal text-[11px] text-slate-500 truncate max-w-xs">
                          {po.description}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold ${
                          po.status === "APPROVED"
                            ? "bg-blue-100 text-blue-800"
                            : po.status === "ISSUED"
                            ? "bg-purple-100 text-purple-800"
                            : po.status === "CLOSED"
                            ? "bg-emerald-100 text-emerald-800"
                            : po.status === "CANCELLED"
                            ? "bg-rose-100 text-rose-800"
                            : "bg-slate-100 text-slate-800"
                        }`}
                      >
                        {po.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {po.status === "ISSUED" || po.status === "CLOSED" ? (
                        <div className="space-y-0.5">
                          <span
                            className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-bold ${
                              progress?.deliveryStatus === "FULLY_RECEIVED"
                                ? "bg-emerald-100 text-emerald-800"
                                : progress?.deliveryStatus === "PARTIALLY_RECEIVED"
                                ? "bg-amber-100 text-amber-800"
                                : "bg-slate-100 text-slate-600"
                            }`}
                          >
                            <Truck className="h-3 w-3" />
                            {progress?.deliveryStatus === "FULLY_RECEIVED"
                              ? "Fully Delivered"
                              : progress?.deliveryStatus === "PARTIALLY_RECEIVED"
                              ? `${progress.overallProgressPercent}% Received`
                              : "0% Delivered"}
                          </span>
                          {progress && progress.totalOrderedQuantity > 0 && (
                            <div className="text-[10px] text-slate-400 font-mono">
                              {progress.totalReceivedQuantity} / {progress.totalOrderedQuantity} units
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-[11px] text-slate-400 italic">
                          {po.status === "DRAFT" ? "Draft" : po.status === "APPROVED" ? "Not issued" : "—"}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-slate-800">{vendor?.name || "Unknown Vendor"}</div>
                      {vendor?.taxId && <div className="text-[10px] text-slate-400">TIN: {vendor.taxId}</div>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-slate-800">{project?.projectCode || "—"}</div>
                      <div className="text-[10px] text-slate-500 truncate max-w-[140px]">
                        {project?.projectName || "—"}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-600 font-mono">
                      {po.issueDate ? formatDate(po.issueDate, "short") : "—"}
                    </td>
                    <td className="px-4 py-3 text-center tabular-nums text-slate-600">
                      {po.lines?.length || 0}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-slate-900">
                      {formatMoney(po.totalAmount || 0, po.currency || "PHP")}
                    </td>
                    <td className="px-4 py-3 text-right" onClick={(event) => event.stopPropagation()}>
                      <div className="flex justify-end gap-1"><button type="button" onClick={() => onPreviewPo(po)} className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition"><FileText className="h-3.5 w-3.5" />Preview</button><button type="button" onClick={() => onOpenPo(po)} className="px-2.5 py-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-900 rounded-lg hover:bg-indigo-50 transition">View / Edit</button></div>
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
        icon={ShoppingCart}
        title={
          query || statusFilter !== "ALL" || projectFilter !== "ALL" || deliveryFilter !== "ALL"
            ? "No purchase orders match your filter"
            : "No purchase orders yet"
        }
        description="Create purchase orders to establish authoritative commitments for materials, equipment, and subcontracts."
      />
    )}
  </>;
}
