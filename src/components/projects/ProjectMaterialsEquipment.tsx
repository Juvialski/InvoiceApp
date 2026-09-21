import React, { useMemo, useState } from "react";
import { ClipboardList, Cog, Edit3, Package, Plus, ShieldAlert, Truck, Warehouse as WarehouseIcon } from "lucide-react";
import type { Equipment, EquipmentAssignment, Project, ProjectCostCode, ProjectEquipment, ProjectMaterial, PurchaseOrder, PurchaseOrderReceipt, Vendor } from "../../types.ts";
import { emptyDailySiteLogsWorkspaceData, scopeDailySiteLogsToProject, type EngineeringDailySiteLogsWorkspaceData } from "../../lib/dailySiteLogs.ts";
import { useDailySiteLogsController } from "../../features/engineering/useDailySiteLogsController.ts";
import {
  deriveProjectEquipmentViews,
  deriveProjectMaterialReconciliationDiscrepancies,
  deriveProjectMaterialViews,
  type ProjectEquipmentSaveInput,
  type ProjectMaterialSaveInput,
} from "../../lib/materialsEquipment.ts";
import { deriveInventoryBalances, deriveProjectMaterialInventoryUsage, type InventoryBalance, type InventoryItem, type InventoryMovement } from "../../lib/inventory.ts";
import { ProjectMaterialsEquipmentWorksheetModal } from "./ProjectMaterialsEquipmentWorksheet.tsx";

const inputClass = "mt-1 w-full min-h-10 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100";

function statusPill(value: string) {
  if (["ACTIVE", "RECEIVED"].includes(value)) return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (["OUT_OF_SERVICE", "CANCELLED"].includes(value)) return "border-rose-200 bg-rose-50 text-rose-800";
  if (["ON_HOLD", "PARTIALLY_RECEIVED"].includes(value)) return "border-amber-200 bg-amber-50 text-amber-800";
  return "border-slate-200 bg-slate-100 text-slate-700";
}

function procurementLabel(state: ReturnType<typeof deriveProjectMaterialViews>[number]["procurement"], unit: string) {
  if (state.state === "RESTRICTED") return "Restricted";
  if (state.state === "UNAVAILABLE") return "Unavailable";
  if (state.orderedQuantity === undefined || state.receivedQuantity === undefined || state.outstandingQuantity === undefined) return "Not linked";
  return `${state.receivedQuantity} / ${state.orderedQuantity} ${unit} received · ${state.outstandingQuantity} outstanding`;
}

function sourceStateClass(state: string) {
  if (state === "AVAILABLE") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (state === "RESTRICTED") return "border-slate-200 bg-slate-100 text-slate-600";
  return "border-amber-200 bg-amber-50 text-amber-800";
}

export interface ProjectMaterialsEquipmentProps {
  project: Project;
  materials?: readonly ProjectMaterial[];
  equipment?: readonly ProjectEquipment[];
  canonicalEquipment?: readonly Equipment[];
  equipmentAssignments?: readonly EquipmentAssignment[];
  inventoryItems?: readonly InventoryItem[];
  inventoryMovements?: readonly InventoryMovement[];
  inventoryBalances?: readonly InventoryBalance[];
  purchaseOrders?: readonly PurchaseOrder[];
  receipts?: readonly PurchaseOrderReceipt[];
  vendors?: readonly Vendor[];
  costCodes?: readonly ProjectCostCode[];
  dailySiteLogsData?: EngineeringDailySiteLogsWorkspaceData;
  canReadSiteLogs?: boolean;
  canReadProcurement?: boolean;
  canReadInventory?: boolean;
  canManage?: boolean;
  guestMode?: boolean;
  onOpenSiteLogs?: () => void;
  onOpenWarehouse?: () => void;
  onSaveMaterial?: (input: ProjectMaterialSaveInput) => Promise<void>;
  onSaveEquipment?: (input: ProjectEquipmentSaveInput) => Promise<void>;
}

export const ProjectMaterialsEquipment: React.FC<ProjectMaterialsEquipmentProps> = ({
  project,
  materials = [],
  equipment = [],
  canonicalEquipment = [],
  equipmentAssignments = [],
  inventoryItems = [],
  inventoryMovements = [],
  inventoryBalances,
  purchaseOrders = [],
  receipts = [],
  vendors = [],
  costCodes = [],
  dailySiteLogsData,
  canReadSiteLogs = false,
  canReadProcurement = false,
  canReadInventory = false,
  canManage = false,
  guestMode = false,
  onOpenSiteLogs,
  onOpenWarehouse,
  onSaveMaterial,
  onSaveEquipment,
}) => {
  const siteLogController = useDailySiteLogsController({
    project,
    canRead: dailySiteLogsData ? false : canReadSiteLogs,
    canCreate: false,
    canUpdate: false,
    canSubmit: false,
    canManage: false,
    guestMode,
    controlledData: dailySiteLogsData,
  });
  const siteData = useMemo(() => {
    if (!canReadSiteLogs) return emptyDailySiteLogsWorkspaceData();
    return scopeDailySiteLogsToProject(dailySiteLogsData || siteLogController.data, project.id);
  }, [canReadSiteLogs, dailySiteLogsData, project.id, siteLogController.data]);
  const siteLogsLoading = !dailySiteLogsData && siteLogController.isLoading && !siteLogController.hasLoaded;
  const siteLogsUnavailable = !dailySiteLogsData && Boolean(siteLogController.loadError && !siteLogController.hasLoaded);
  const [view, setView] = useState<"materials" | "equipment">("materials");
  const [query, setQuery] = useState("");
  const [modal, setModal] = useState<{ kind: "material" | "equipment"; mode: "create" | "edit"; rowId?: string } | null>(null);
  const selectedCostCodes = useMemo(() => costCodes.filter((code) => code.projectId === project.id), [costCodes, project.id]);
  const siteLogs = siteData.logs || [];
  const siteMaterialDeliveries = siteData.materialDeliveries || [];
  const siteEquipmentObservations = siteData.equipment || [];
  const materialViews = useMemo(() => deriveProjectMaterialViews(project.id, materials, canReadProcurement ? purchaseOrders : undefined, canReadProcurement ? receipts : undefined, siteLogs, siteMaterialDeliveries, vendors, canReadProcurement), [canReadProcurement, materials, project.id, purchaseOrders, receipts, siteLogs, siteMaterialDeliveries, vendors]);
  const materialDiscrepancies = useMemo(() => deriveProjectMaterialReconciliationDiscrepancies(project.id, materials, canReadProcurement ? purchaseOrders : undefined, canReadProcurement ? receipts : undefined, siteLogs, siteMaterialDeliveries, canReadProcurement), [canReadProcurement, materials, project.id, purchaseOrders, receipts, siteLogs, siteMaterialDeliveries]);
  const equipmentViews = useMemo(() => deriveProjectEquipmentViews(project.id, equipment, siteLogs, siteEquipmentObservations), [equipment, project.id, siteEquipmentObservations, siteLogs]);
  const inventoryBalanceById = useMemo(() => new Map((inventoryBalances || deriveInventoryBalances(inventoryItems, inventoryMovements)).map((balance) => [balance.inventoryItemId, balance])), [inventoryBalances, inventoryItems, inventoryMovements]);
  const inventoryUsageByMaterial = useMemo(() => new Map(materials.filter((material) => material.projectId === project.id).map((material) => [material.id, deriveProjectMaterialInventoryUsage(project.id, material, inventoryMovements)])), [inventoryMovements, materials, project.id]);
  const needle = query.trim().toLowerCase();
  const filteredMaterials = materialViews.filter((item) => !needle || `${item.material.materialName} ${item.material.referenceCode || ""} ${item.material.category || ""} ${item.procurement.poNumber || ""}`.toLowerCase().includes(needle));
  const filteredEquipment = equipmentViews.filter((item) => !needle || `${item.equipment.equipmentName} ${item.equipment.assetReference || ""} ${item.equipment.equipmentType || ""} ${item.equipment.equipmentSource}`.toLowerCase().includes(needle));
  const formalEquipment = canonicalEquipment.filter((item) => equipmentAssignments.some((assignment) => assignment.equipmentId === item.id && assignment.projectId === project.id && !assignment.assignmentEnd)).filter((item) => !needle || `${item.equipmentName} ${item.assetReference || ""} ${item.equipmentType || ""}`.toLowerCase().includes(needle));

  const saveMaterial = async (input: ProjectMaterialSaveInput) => {
    if (!onSaveMaterial) throw new Error("Material editing is not available in this workspace.");
    await onSaveMaterial({ ...input, projectId: project.id });
  };
  const saveEquipment = async (input: ProjectEquipmentSaveInput) => {
    if (!onSaveEquipment) throw new Error("Equipment editing is not available in this workspace.");
    await onSaveEquipment({ ...input, projectId: project.id });
  };

  return (
    <section className="space-y-4" data-phase3b="materials-equipment">
      {siteLogsLoading && <div role="status" className="rounded-xl border border-indigo-100 bg-indigo-50 p-3 text-xs font-semibold leading-5 text-indigo-800">Loading Daily Site Log evidence… Register metadata remains available while field observations load.</div>}
      {siteLogsUnavailable && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold leading-5 text-rose-800">Daily Site Log evidence is unavailable right now. Register metadata remains available; open Site Logs to retry. {siteLogController.loadError}</div>}
      {view === "materials" && materialDiscrepancies.length > 0 && <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-950"><ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" /><span>{materialDiscrepancies.length} deterministic procurement/site-evidence reconciliation item{materialDiscrepancies.length === 1 ? "" : "s"} needs review. Formal receipts remain authoritative.</span></div>}
      <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-start sm:justify-between sm:p-5">
        <div className="min-w-0"><p className="text-[10px] font-black uppercase tracking-[0.14em] text-indigo-600">Field operations</p><h2 className="mt-1 text-xl font-black text-slate-950">Materials &amp; Equipment</h2><p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">Current project registers with traceable procurement and Daily Site Log evidence. Register metadata never creates Actual Cost, commitments, or formal receipts.</p></div>
        {(canManage || onOpenWarehouse) && <div className="flex shrink-0 flex-wrap gap-2">{canManage && <button type="button" onClick={() => setModal({ kind: view === "materials" ? "material" : "equipment", mode: "create" })} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-2 text-xs font-black text-white"><Plus className="h-3.5 w-3.5" />Add {view === "materials" ? "material" : "equipment"}</button>}{onOpenSiteLogs && canManage && <button type="button" onClick={onOpenSiteLogs} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700"><ClipboardList className="h-3.5 w-3.5" />Daily Site Logs</button>}{onOpenWarehouse && <button type="button" onClick={onOpenWarehouse} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-black text-indigo-800"><WarehouseIcon className="h-3.5 w-3.5" />Warehouse Inventory</button>}</div>}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-indigo-100 bg-indigo-50 p-4"><Package className="h-5 w-5 text-indigo-600" /><p className="mt-3 text-2xl font-black text-indigo-950">{materialViews.length}</p><p className="mt-1 text-[10px] font-black uppercase tracking-[0.1em] text-indigo-700">Registered materials</p></div>
        <div className="rounded-2xl border border-orange-100 bg-orange-50 p-4"><Cog className="h-5 w-5 text-orange-600" /><p className="mt-3 text-2xl font-black text-orange-950">{equipmentViews.length}</p><p className="mt-1 text-[10px] font-black uppercase tracking-[0.1em] text-orange-700">Registered equipment</p></div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><Truck className="h-5 w-5 text-slate-600" /><p className="mt-3 text-2xl font-black text-slate-950">{siteLogsLoading ? "Loading" : canReadSiteLogs ? equipmentViews.reduce((sum, item) => sum + item.evidence.observationCount, 0) : "Restricted"}</p><p className="mt-1 text-[10px] font-black uppercase tracking-[0.1em] text-slate-600">Linked field observations</p></div>
      </div>

      {view === "equipment" && <section className="rounded-2xl border border-orange-100 bg-orange-50/60 p-4"><div className="flex items-start gap-2"><Cog className="mt-0.5 h-4 w-4 shrink-0 text-orange-700" /><div><p className="text-xs font-black text-orange-950">Formal Equipment assigned here</p><p className="mt-1 text-[10px] leading-4 text-orange-900">These rows reference the company Equipment Registry. This Project is the current operational context, not the owner of the canonical asset.</p></div></div>{formalEquipment.length ? <div className="mt-3 grid gap-2 sm:grid-cols-2">{formalEquipment.map((item) => <div key={item.id} className="rounded-xl border border-orange-100 bg-white p-3"><p className="text-xs font-black text-slate-900">{item.assetReference || "No asset code"} · {item.equipmentName}</p><p className="mt-1 text-[10px] text-slate-600">{item.equipmentType || "Type not recorded"} · {item.equipmentSource} · Assigned {item.currentAssignmentStart || "date unavailable"}</p><p className="mt-1 text-[10px] font-semibold text-orange-800">Canonical Registry identity · assignment history preserved</p></div>)}</div> : <p className="mt-3 text-[10px] text-orange-900">No canonical Equipment is formally assigned to this Project. Existing project-register rows below remain preserved as historical/read-through data.</p>}</section>}

      <div className="grid gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:grid-cols-[180px_minmax(0,1fr)]"><div className="flex rounded-xl bg-slate-100 p-1"><button type="button" onClick={() => setView("materials")} className={`flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-black ${view === "materials" ? "bg-white text-indigo-700 shadow-sm" : "text-slate-500"}`}><Package className="h-3.5 w-3.5" />Materials</button><button type="button" onClick={() => setView("equipment")} className={`flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-black ${view === "equipment" ? "bg-white text-orange-700 shadow-sm" : "text-slate-500"}`}><Cog className="h-3.5 w-3.5" />Equipment</button></div><input aria-label="Search materials and equipment" className={`${inputClass} mt-0`} value={query} onChange={(event) => setQuery(event.target.value)} placeholder={view === "materials" ? "Search material, category, PO…" : "Search equipment, reference, type…"} /></div>

      {view === "materials" ? <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="hidden grid-cols-[minmax(210px,1.3fr)_130px_minmax(170px,1fr)_minmax(180px,1fr)_150px_110px] gap-3 border-b border-slate-100 bg-slate-50 px-4 py-3 text-[10px] font-black uppercase tracking-[0.1em] text-slate-500 lg:grid"><span>Material</span><span>Planned</span><span>Warehouse</span><span>Procurement</span><span>Site evidence</span><span /></div>{filteredMaterials.length ? filteredMaterials.map(({ material, procurement, siteEvidence }) => { const linkedItem = material.inventoryItemId ? inventoryItems.find((item) => item.id === material.inventoryItemId) : undefined; const usage = inventoryUsageByMaterial.get(material.id); const balance = linkedItem ? inventoryBalanceById.get(linkedItem.id) : undefined; return <div key={material.id} className="grid gap-3 border-b border-slate-100 px-4 py-4 last:border-b-0 lg:grid-cols-[minmax(210px,1.3fr)_130px_minmax(170px,1fr)_minmax(180px,1fr)_150px_110px] lg:items-center"><div className="min-w-0"><p className="break-words text-sm font-black text-slate-900">{material.materialName}</p><p className="mt-1 text-[10px] text-slate-500">{[material.referenceCode, material.category].filter(Boolean).join(" · ") || "No reference or category"}</p><span className={`mt-2 inline-flex rounded-full border px-2 py-1 text-[10px] font-black ${statusPill(material.status)}`}>{material.status.replaceAll("_", " ")}</span></div><div className="text-xs font-bold text-slate-700"><span className="lg:hidden text-[10px] font-black uppercase tracking-wide text-slate-400">Planned requirement · </span>{material.requiredQuantity} {material.unit}</div><div className="text-xs text-slate-700"><span className="lg:hidden text-[10px] font-black uppercase tracking-wide text-slate-400">Warehouse on-hand · </span>{canReadInventory && linkedItem ? <><p className="font-black text-indigo-800">{linkedItem.itemName}</p><p className="mt-1 font-black tabular-nums">{balance?.onHandQuantity ?? 0} {linkedItem.stockUnit}</p><p className="text-[10px] text-slate-500">Current warehouse on-hand</p>{usage && <p className="mt-1 text-[10px] text-slate-500">Issued {usage.issuedQuantity} · returned {usage.returnedQuantity} {linkedItem.stockUnit}</p>}</> : canReadInventory ? "No canonical item linked" : "Restricted"}</div><div><div className="flex flex-wrap items-center gap-1.5"><span className={`rounded-full border px-2 py-1 text-[9px] font-black ${sourceStateClass(procurement.state)}`}>{procurement.state}</span>{procurement.poNumber && <span className="text-xs font-black text-slate-800">{procurement.poNumber}</span>}</div><p className="mt-1 text-[10px] leading-4 text-slate-500">{procurementLabel(procurement, material.unit)}</p>{procurement.supplierName && <p className="mt-1 text-[10px] text-slate-500">Supplier: {procurement.supplierName}</p>}{procurement.reason && <p className="mt-1 text-[10px] leading-4 text-amber-700">{procurement.reason}</p>}</div><div className="text-xs text-slate-700"><span className="lg:hidden text-[10px] font-black uppercase tracking-wide text-slate-400">Field observation · </span>{siteEvidence.count ? `${siteEvidence.count} observation${siteEvidence.count === 1 ? "" : "s"} · ${siteEvidence.latestDate}` : canReadSiteLogs ? "No linked site evidence" : "Restricted"}{siteEvidence.latestQuantity !== undefined && <span className="mt-1 block text-[10px] text-slate-500">Latest: {siteEvidence.latestQuantity} {siteEvidence.latestUnitSnapshot || material.unit}{siteEvidence.latestReference ? ` · ${siteEvidence.latestReference}` : ""}</span>}</div><div className="flex justify-start lg:justify-end">{canManage && onSaveMaterial && <button type="button" onClick={() => setModal({ kind: "material", mode: "edit", rowId: material.id })} className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[10px] font-black text-slate-700"><Edit3 className="h-3 w-3" />Edit</button>}</div></div>; }) : <div className="p-10 text-center"><Package className="mx-auto h-8 w-8 text-slate-300" /><p className="mt-3 text-sm font-black text-slate-700">No materials registered for this project.</p><p className="mt-1 text-xs text-slate-500">Add planned materials when the project team has a known requirement.</p></div>}</div> : <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="hidden grid-cols-[minmax(220px,1.3fr)_120px_130px_minmax(200px,1fr)_150px_110px] gap-3 border-b border-slate-100 bg-slate-50 px-4 py-3 text-[10px] font-black uppercase tracking-[0.1em] text-slate-500 lg:grid"><span>Equipment</span><span>Type / source</span><span>Status</span><span>Assignment / latest observation</span><span>Usage evidence</span><span /></div>{filteredEquipment.length ? filteredEquipment.map(({ equipment: item, evidence }) => <div key={item.id} className="grid gap-3 border-b border-slate-100 px-4 py-4 last:border-b-0 lg:grid-cols-[minmax(220px,1.3fr)_120px_130px_minmax(200px,1fr)_150px_110px] lg:items-center"><div><p className="break-words text-sm font-black text-slate-900">{item.equipmentName}</p><p className="mt-1 text-[10px] text-slate-500">{[item.assetReference, item.providerName].filter(Boolean).join(" · ") || "No asset reference or provider"}</p></div><div className="text-xs text-slate-700"><span className="lg:hidden text-[10px] font-black uppercase tracking-wide text-slate-400">Type / source · </span>{[item.equipmentType, item.equipmentSource].filter(Boolean).join(" · ")}</div><div><span className={`inline-flex rounded-full border px-2 py-1 text-[10px] font-black ${statusPill(item.status)}`}>{item.status.replaceAll("_", " ")}</span></div><div className="text-xs text-slate-700"><span className="lg:hidden text-[10px] font-black uppercase tracking-wide text-slate-400">Evidence · </span>{item.assignmentStart || "Unscheduled"}{item.assignmentEnd ? ` → ${item.assignmentEnd}` : ""}<span className="mt-1 block text-[10px] text-slate-500">{evidence.lastObservedDate ? `Last observed ${evidence.lastObservedDate} · ${evidence.latestCondition || "Condition not recorded"}` : canReadSiteLogs ? "No linked site observation" : "Restricted"}</span></div><div className="text-xs text-slate-700"><span className="lg:hidden text-[10px] font-black uppercase tracking-wide text-slate-400">Usage · </span>{canReadSiteLogs ? `${evidence.operatingHours} operating · ${evidence.idleHours} idle hrs` : "Restricted"}<span className="mt-1 block text-[10px] text-slate-500">{canReadSiteLogs ? `${evidence.observationCount} observation${evidence.observationCount === 1 ? "" : "s"}` : "Source restricted"}</span></div><div className="flex justify-start lg:justify-end">{canManage && onSaveEquipment && <button type="button" onClick={() => setModal({ kind: "equipment", mode: "edit", rowId: item.id })} className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[10px] font-black text-slate-700"><Edit3 className="h-3 w-3" />Edit</button>}</div></div>) : <div className="p-10 text-center"><Cog className="mx-auto h-8 w-8 text-slate-300" /><p className="mt-3 text-sm font-black text-slate-700">No equipment registered for this project.</p><p className="mt-1 text-xs text-slate-500">Register owned, rented, or subcontractor-provided equipment used on site.</p></div>}</div>}

      {!canReadSiteLogs && <div className="flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-600"><ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" /><span>Daily Site Log evidence is restricted for this role. Register rows remain visible; no zeroes or inferred field activity are shown.</span></div>}
      {modal && <ProjectMaterialsEquipmentWorksheetModal kind={modal.kind} project={project} materials={materials} equipment={equipment} costCodes={selectedCostCodes} purchaseOrders={canReadProcurement ? purchaseOrders.filter((po) => po.projectId === project.id) : []} inventoryItems={canReadInventory ? inventoryItems : []} canReadProcurement={canReadProcurement} canReadInventory={canReadInventory} canManage={canManage} createNew={modal.mode === "create"} initialRowId={modal.rowId} onClose={() => setModal(null)} onSaveMaterial={saveMaterial} onSaveEquipment={saveEquipment} />}
    </section>
  );
};
