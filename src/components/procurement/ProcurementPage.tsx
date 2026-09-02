import React, { useMemo, useState } from "react";
import {
  AlertCircle,
  Building2,
  CheckCircle2,
  Clock,
  DollarSign,
  FileCheck,
  FileText,
  Filter,
  Plus,
  Search,
  ShoppingCart,
} from "lucide-react";
import type { Project, ProjectCostCode, PurchaseOrder, PurchaseOrderLine, PurchaseOrderStatus, Vendor } from "../../types.ts";
import { formatDate, formatMoney } from "../../utils/invoiceLogic.ts";
import { isCommittedPurchaseOrder } from "../../utils/projectCosting.ts";
import { EmptyState, PageHeader, StatusBadge } from "../ui/OperationsUI.tsx";
import { PurchaseOrderEditorModal } from "./PurchaseOrderEditorModal.tsx";

export interface ProcurementPageProps {
  purchaseOrders: PurchaseOrder[];
  projects: Project[];
  vendors: Vendor[];
  costCodes: ProjectCostCode[];
  selectedProjectId?: string;
  canRead?: boolean;
  canManage?: boolean;
  canApprove?: boolean;
  onSavePO: (
    po: Partial<PurchaseOrder> & { poNumber: string; vendorId: string; projectId: string },
    lines: Array<Partial<PurchaseOrderLine> & { description: string; quantity: number; unitPrice: number }>,
  ) => Promise<void>;
  onTransitionPO: (id: string, targetStatus: PurchaseOrderStatus, reason?: string) => Promise<void>;
  onDeletePO: (id: string) => Promise<void>;
  onAddVendor?: (vendor: Partial<Vendor> & { name: string }) => Promise<Vendor>;
}

export const ProcurementPage: React.FC<ProcurementPageProps> = ({
  purchaseOrders,
  projects,
  vendors,
  costCodes,
  selectedProjectId,
  canRead = true,
  canManage = true,
  canApprove = true,
  onSavePO,
  onTransitionPO,
  onDeletePO,
  onAddVendor,
}) => {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [projectFilter, setProjectFilter] = useState<string>(selectedProjectId || "ALL");
  const [activePo, setActivePo] = useState<PurchaseOrder | null | undefined>(undefined);

  const vendorMap = useMemo(() => new Map(vendors.map((v) => [v.id, v])), [vendors]);
  const projectMap = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);

  const filteredOrders = useMemo(() => {
    return purchaseOrders.filter((po) => {
      if (selectedProjectId && po.projectId !== selectedProjectId) return false;
      if (projectFilter !== "ALL" && po.projectId !== projectFilter) return false;
      if (statusFilter !== "ALL" && po.status !== statusFilter) return false;

      if (query.trim()) {
        const q = query.trim().toLowerCase();
        const vendor = vendorMap.get(po.vendorId);
        const proj = projectMap.get(po.projectId);
        const matchPo = po.poNumber.toLowerCase().includes(q);
        const matchDesc = (po.description || "").toLowerCase().includes(q);
        const matchVendor = (vendor?.name || "").toLowerCase().includes(q);
        const matchProj = (proj?.projectName || "").toLowerCase().includes(q) || (proj?.projectCode || "").toLowerCase().includes(q);
        if (!matchPo && !matchDesc && !matchVendor && !matchProj) return false;
      }
      return true;
    });
  }, [purchaseOrders, selectedProjectId, projectFilter, statusFilter, query, vendorMap, projectMap]);

  // KPI Metrics
  const activeCommittedTotal = useMemo(() => {
    return filteredOrders
      .filter((po) => isCommittedPurchaseOrder(po.status))
      .reduce((sum, po) => sum + (Number(po.totalAmount) || 0), 0);
  }, [filteredOrders]);

  const counts = useMemo(() => {
    let draft = 0;
    let approved = 0;
    let issued = 0;
    let closed = 0;
    let cancelled = 0;
    for (const po of filteredOrders) {
      if (po.status === "DRAFT") draft++;
      else if (po.status === "APPROVED") approved++;
      else if (po.status === "ISSUED") issued++;
      else if (po.status === "CLOSED") closed++;
      else if (po.status === "CANCELLED") cancelled++;
    }
    return { draft, approved, issued, closed, cancelled, total: filteredOrders.length };
  }, [filteredOrders]);

  const selectedProject = selectedProjectId ? projectMap.get(selectedProjectId) : undefined;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <PageHeader
          eyebrow={selectedProject ? `Project Controls • ${selectedProject.projectCode}` : "Commercial Operations"}
          title={selectedProject ? `${selectedProject.projectName} Procurement` : "Procurement & Purchase Orders"}
          description="Manage supplier commitments, track purchase orders, and monitor committed cost obligations without distorting actual cost."
        />
        {canManage && (
          <button
            type="button"
            onClick={() => setActivePo(null)}
            className="flex items-center gap-1.5 self-start sm:self-auto px-3.5 py-2 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm transition"
          >
            <Plus className="h-4 w-4" />
            New Purchase Order
          </button>
        )}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-5">
        <div className="rounded-xl border border-indigo-100 bg-gradient-to-br from-indigo-50/50 to-white p-4 shadow-sm">
          <div className="flex items-center justify-between text-indigo-700 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider">Active Committed</span>
            <ShoppingCart className="h-4 w-4" />
          </div>
          <div className="text-lg font-black text-slate-900 tabular-nums">
            {formatMoney(activeCommittedTotal, selectedProject?.currency || "PHP")}
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">Approved & Issued orders</div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between text-slate-600 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider">Total Orders</span>
            <FileText className="h-4 w-4 text-slate-400" />
          </div>
          <div className="text-lg font-black text-slate-900 tabular-nums">{counts.total}</div>
          <div className="text-[10px] text-slate-500 mt-0.5">Across active filters</div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between text-blue-700 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider">Approved / Issued</span>
            <FileCheck className="h-4 w-4 text-blue-500" />
          </div>
          <div className="text-lg font-black text-slate-900 tabular-nums">
            {counts.approved + counts.issued}
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">
            {counts.approved} approved, {counts.issued} issued
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between text-amber-700 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider">In Draft</span>
            <Clock className="h-4 w-4 text-amber-500" />
          </div>
          <div className="text-lg font-black text-slate-900 tabular-nums">{counts.draft}</div>
          <div className="text-[10px] text-slate-500 mt-0.5">Not yet committed</div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm col-span-2 sm:col-span-1">
          <div className="flex items-center justify-between text-emerald-700 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider">Closed</span>
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          </div>
          <div className="text-lg font-black text-slate-900 tabular-nums">{counts.closed}</div>
          <div className="text-[10px] text-slate-500 mt-0.5">Completed obligations</div>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="flex flex-1 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-1.5 focus-within:border-indigo-500 focus-within:bg-white focus-within:ring-1 focus-within:ring-indigo-500">
          <Search className="h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search PO #, supplier, project, description..."
            className="w-full bg-transparent text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {!selectedProjectId && (
            <select
              value={projectFilter}
              onChange={(e) => setProjectFilter(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 focus:border-indigo-500 focus:outline-none"
            >
              <option value="ALL">All Projects</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.projectCode} — {p.projectName}
                </option>
              ))}
            </select>
          )}

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 focus:border-indigo-500 focus:outline-none"
          >
            <option value="ALL">All Statuses</option>
            <option value="DRAFT">Draft</option>
            <option value="APPROVED">Approved</option>
            <option value="ISSUED">Issued</option>
            <option value="CLOSED">Closed</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
        </div>
      </div>

      {/* PO Register Table */}
      {filteredOrders.length > 0 ? (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">PO Number</th>
                  <th className="px-4 py-3">Status</th>
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
                  const proj = projectMap.get(po.projectId);
                  return (
                    <tr
                      key={po.id}
                      onClick={() => setActivePo(po)}
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
                        <div className="font-semibold text-slate-800">{vendor?.name || "Unknown Vendor"}</div>
                        {vendor?.taxId && <div className="text-[10px] text-slate-400">TIN: {vendor.taxId}</div>}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-800">{proj?.projectCode || "—"}</div>
                        <div className="text-[10px] text-slate-500 truncate max-w-[140px]">
                          {proj?.projectName || "—"}
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
                      <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => setActivePo(po)}
                          className="px-2.5 py-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-900 rounded-lg hover:bg-indigo-50 transition"
                        >
                          View / Edit
                        </button>
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
          title={query || statusFilter !== "ALL" || projectFilter !== "ALL" ? "No purchase orders match your filter" : "No purchase orders yet"}
          description="Create purchase orders to establish authoritative commitments for materials, equipment, and subcontracts."
        />
      )}

      {/* Purchase Order Editor Modal */}
      {activePo !== undefined && (
        <PurchaseOrderEditorModal
          open={true}
          purchaseOrder={activePo}
          projects={projects}
          vendors={vendors}
          costCodes={costCodes}
          defaultProjectId={selectedProjectId}
          canApprove={canApprove}
          canManage={canManage}
          onSave={onSavePO}
          onTransition={onTransitionPO}
          onDelete={onDeletePO}
          onClose={() => setActivePo(undefined)}
          onAddVendor={onAddVendor}
        />
      )}
    </div>
  );
};
