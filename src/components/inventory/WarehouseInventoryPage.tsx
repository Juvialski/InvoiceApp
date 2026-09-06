import React, { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpFromLine,
  CheckCircle2,
  Edit3,
  History,
  Package,
  Plus,
  RotateCcw,
  Search,
  ShieldAlert,
  Truck,
  Undo2,
  Warehouse,
  X,
} from "lucide-react";
import type { Project, ProjectMaterial, PurchaseOrder, PurchaseOrderReceipt } from "../../types.ts";
import {
  deriveInventoryBalances,
  deriveProjectInventoryUsage,
  type InventoryBalance,
  type InventoryItem,
  type InventoryItemSaveInput,
  type InventoryMovement,
  type InventoryMovementInput,
  type InventoryMovementType,
} from "../../lib/inventory.ts";
import { PageHeader, StatusBadge, type StatusTone } from "../ui/OperationsUI.tsx";

const inputClass = "mt-1 w-full min-h-10 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100";
const labelClass = "block text-[11px] font-black uppercase tracking-[0.08em] text-slate-500";

type MovementAction = "OPENING" | "RECEIPT" | "PROJECT_ISSUE" | "PROJECT_RETURN";

interface ReceiptOption {
  key: string;
  receipt: PurchaseOrderReceipt;
  purchaseOrder: PurchaseOrder;
  line: NonNullable<PurchaseOrder["lines"]>[number];
}

interface MovementFormState {
  movementType: MovementAction;
  inventoryItemId: string;
  quantity: string;
  projectId: string;
  projectMaterialId: string;
  reason: string;
  reference: string;
  effectiveDate: string;
  sourceMode: "MANUAL" | "PURCHASE_ORDER_RECEIPT";
  receiptSourceKey: string;
  idempotencyKey: string;
}

function localId(prefix: string) {
  return globalThis.crypto?.randomUUID?.() || `local-${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function normalizeUnit(value: string | null | undefined) {
  return (value || "").trim().toLowerCase();
}

function quantity(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
}

function movementLabel(type: InventoryMovementType) {
  return type === "PROJECT_ISSUE" ? "Project issue" : type === "PROJECT_RETURN" ? "Project return" : type === "OPENING" ? "Opening stock" : type === "RECEIPT" ? "Stock receipt" : "Reversal";
}

function statusTone(status: InventoryItem["status"]): StatusTone {
  return status === "ACTIVE" ? "success" : "neutral";
}

function actionLabel(action: MovementAction) {
  return action === "OPENING" ? "Opening stock" : action === "RECEIPT" ? "Receive stock" : action === "PROJECT_ISSUE" ? "Issue to project" : "Return from project";
}

function actionIcon(action: MovementAction) {
  return action === "OPENING" ? ArrowDownToLine : action === "RECEIPT" ? Truck : action === "PROJECT_ISSUE" ? ArrowUpFromLine : Undo2;
}

function defaultMovementForm(action: MovementAction, inventoryItemId = ""): MovementFormState {
  return {
    movementType: action,
    inventoryItemId,
    quantity: "",
    projectId: "",
    projectMaterialId: "",
    reason: "",
    reference: "",
    effectiveDate: today(),
    sourceMode: "MANUAL",
    receiptSourceKey: "",
    idempotencyKey: localId("inventory-action"),
  };
}

function ModalShell({ title, eyebrow = "Warehouse Inventory", children, onClose, busy = false, wide = false }: { title: string; eyebrow?: string; children: React.ReactNode; onClose: () => void; busy?: boolean; wide?: boolean }) {
  const close = () => { if (!busy) onClose(); };
  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-950/45 p-0 sm:items-center sm:p-4" role="presentation">
      <section role="dialog" aria-modal="true" aria-label={title} className={`max-h-[min(94vh,58rem)] w-full overflow-y-auto rounded-t-3xl border border-slate-200 bg-white p-4 shadow-2xl sm:rounded-3xl sm:p-6 ${wide ? "max-w-5xl" : "max-w-2xl"}`}>
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-4">
          <div className="min-w-0"><p className="text-[10px] font-black uppercase tracking-[0.16em] text-indigo-600">{eyebrow}</p><h2 className="mt-1 break-words text-xl font-black text-slate-950">{title}</h2></div>
          <button type="button" disabled={busy} onClick={close} className="shrink-0 rounded-xl p-2 text-slate-400 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50" aria-label={busy ? "Close dialog unavailable while saving" : "Close dialog"}><X className="h-5 w-5" /></button>
        </div>
        <div className="pt-4">{children}</div>
      </section>
    </div>
  );
}

function ItemFormModal({ item, onClose, onSave }: { item?: InventoryItem; onClose: () => void; onSave: (input: InventoryItemSaveInput) => Promise<InventoryItem | void> }) {
  const [form, setForm] = useState<InventoryItemSaveInput>(() => ({
    id: item?.id,
    itemName: item?.itemName || "",
    itemCode: item?.itemCode || "",
    category: item?.category || "",
    stockUnit: item?.stockUnit || "pcs",
    status: item?.status || "ACTIVE",
  }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const update = <K extends keyof InventoryItemSaveInput>(key: K, value: InventoryItemSaveInput[K]) => setForm((current) => ({ ...current, [key]: value }));
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (!form.itemName.trim()) throw new Error("Item name is required.");
      if (!form.stockUnit.trim()) throw new Error("A canonical stock unit is required.");
      await onSave({ ...form, itemName: form.itemName.trim(), stockUnit: form.stockUnit.trim().toLowerCase() });
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The inventory item could not be saved.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <ModalShell title={`${item ? "Edit" : "Add"} canonical inventory item`} onClose={onClose} busy={busy}>
      <form onSubmit={(event) => void submit(event)} className="space-y-4">
        {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold leading-5 text-rose-800">{error}</div>}
        <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-3 text-xs leading-5 text-indigo-950">The item master identifies physical stock held by the company. It is separate from project requirements, procurement receipts, and valuation.</div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="sm:col-span-2"><span className={labelClass}>Canonical item name / description</span><input required className={inputClass} value={form.itemName} onChange={(event) => update("itemName", event.target.value)} placeholder="Ready-mix concrete 28 MPa" /></label>
          <label><span className={labelClass}>Item / reference code</span><input className={inputClass} value={form.itemCode || ""} onChange={(event) => update("itemCode", event.target.value)} placeholder="INV-CON-028" /></label>
          <label><span className={labelClass}>Category</span><input className={inputClass} value={form.category || ""} onChange={(event) => update("category", event.target.value)} placeholder="Concrete" /></label>
          <label><span className={labelClass}>Authoritative stock unit</span><input required className={inputClass} value={form.stockUnit} onChange={(event) => update("stockUnit", event.target.value)} placeholder="cu.m" /></label>
          <label><span className={labelClass}>Lifecycle status</span><select className={inputClass} value={form.status || "ACTIVE"} onChange={(event) => update("status", event.target.value as InventoryItem["status"])}><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option></select></label>
        </div>
        <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:justify-end"><button type="button" disabled={busy} onClick={onClose} className="min-h-11 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-black text-slate-700">Cancel</button><button type="submit" disabled={busy} className="min-h-11 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-black text-white disabled:opacity-50">{busy ? "Saving…" : "Save item"}</button></div>
      </form>
    </ModalShell>
  );
}

function MovementFormModal({
  action,
  initialItemId,
  items,
  balances,
  projects,
  projectMaterials,
  receiptOptions,
  canReadProjects,
  canReadProcurement,
  onClose,
  onSubmit,
}: {
  action: MovementAction;
  initialItemId?: string;
  items: readonly InventoryItem[];
  balances: readonly InventoryBalance[];
  projects: readonly Project[];
  projectMaterials: readonly ProjectMaterial[];
  receiptOptions: readonly ReceiptOption[];
  canReadProjects: boolean;
  canReadProcurement: boolean;
  onClose: () => void;
  onSubmit: (input: InventoryMovementInput) => Promise<void>;
}) {
  const [form, setForm] = useState<MovementFormState>(() => defaultMovementForm(action, initialItemId));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selectedItem = items.find((item) => item.id === form.inventoryItemId);
  const selectedBalance = balances.find((balance) => balance.inventoryItemId === form.inventoryItemId);
  const selectedReceipt = receiptOptions.find((option) => option.key === form.receiptSourceKey);
  const eligibleReceiptItems = selectedReceipt ? items.filter((item) => normalizeUnit(item.stockUnit) === normalizeUnit(selectedReceipt.line.unit) && item.status === "ACTIVE") : items.filter((item) => item.status === "ACTIVE");
  const projectOptions = projects.filter((project) => project.status !== "ARCHIVED");
  const materialOptions = projectMaterials.filter((material) => material.projectId === form.projectId && material.inventoryItemId === form.inventoryItemId && normalizeUnit(material.unit) === normalizeUnit(selectedItem?.stockUnit));
  const isProcurementReceipt = action === "RECEIPT" && form.sourceMode === "PURCHASE_ORDER_RECEIPT";
  const update = <K extends keyof MovementFormState>(key: K, value: MovementFormState[K]) => setForm((current) => ({ ...current, [key]: value }));

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (!form.inventoryItemId) throw new Error("Choose a canonical inventory item.");
      if (!form.reason.trim()) throw new Error("A reason is required for every movement.");
      if (action === "PROJECT_ISSUE" || action === "PROJECT_RETURN") {
        if (!form.projectId) throw new Error("Choose a project for this movement.");
        if (!canReadProjects) throw new Error("Project context is restricted for this role.");
      }
      if (isProcurementReceipt) {
        if (!canReadProcurement) throw new Error("Procurement evidence is restricted for this role.");
        if (!selectedReceipt) throw new Error("Choose an eligible procurement receipt line.");
        if (normalizeUnit(selectedReceipt.line.unit) !== normalizeUnit(selectedItem?.stockUnit)) throw new Error("The procurement receipt unit must exactly match the canonical item stock unit.");
      }
      const parsedQuantity = isProcurementReceipt ? selectedReceipt?.line.quantity : Number(form.quantity);
      if (!Number.isFinite(parsedQuantity) || (parsedQuantity || 0) <= 0) throw new Error("Enter a positive quantity.");
      if (action === "PROJECT_ISSUE" && (selectedBalance?.onHandQuantity || 0) < (parsedQuantity || 0)) throw new Error("This issue exceeds the currently displayed warehouse balance; the database will recheck the authoritative balance.");
      await onSubmit({
        movementType: action,
        inventoryItemId: form.inventoryItemId,
        quantity: parsedQuantity,
        projectId: action === "PROJECT_ISSUE" || action === "PROJECT_RETURN" ? form.projectId : null,
        projectMaterialId: action === "PROJECT_ISSUE" || action === "PROJECT_RETURN" ? form.projectMaterialId || null : null,
        reason: form.reason.trim(),
        reference: form.reference.trim() || (selectedReceipt ? selectedReceipt.receipt.receiptNumber : null),
        sourceType: isProcurementReceipt ? "PURCHASE_ORDER_RECEIPT" : "MANUAL",
        purchaseOrderReceiptId: selectedReceipt?.receipt.id || null,
        purchaseOrderLineId: selectedReceipt?.line.id || null,
        idempotencyKey: form.idempotencyKey,
        effectiveDate: form.effectiveDate,
      });
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The inventory movement could not be recorded.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalShell title={actionLabel(action)} onClose={onClose} busy={busy}>
      <form onSubmit={(event) => void submit(event)} className="space-y-4">
        {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold leading-5 text-rose-800">{error}</div>}
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-700">This is a quantity/custody movement. It does not create an Expense, Actual Cost, commitment, valuation, or Cash transaction.</div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="sm:col-span-2"><span className={labelClass}>Canonical inventory item</span><select required className={inputClass} value={form.inventoryItemId} onChange={(event) => { update("inventoryItemId", event.target.value); update("projectMaterialId", ""); }}><option value="">Choose item</option>{eligibleReceiptItems.map((item) => <option key={item.id} value={item.id}>{item.itemName} · {item.stockUnit}{item.itemCode ? ` · ${item.itemCode}` : ""}</option>)}</select>{selectedItem && <span className="mt-1 block text-[10px] text-slate-500">Current derived on-hand: {quantity(selectedBalance?.onHandQuantity || 0)} {selectedItem.stockUnit}</span>}</label>
          {action === "RECEIPT" && <label className="sm:col-span-2"><span className={labelClass}>Receipt source</span><select className={inputClass} value={form.sourceMode} onChange={(event) => { const sourceMode = event.target.value as MovementFormState["sourceMode"]; update("sourceMode", sourceMode); update("receiptSourceKey", ""); }}><option value="MANUAL">Manual warehouse receipt</option><option value="PURCHASE_ORDER_RECEIPT" disabled={!canReadProcurement}>Existing Procurement receipt line</option></select><span className="mt-1 block text-[10px] leading-4 text-slate-500">Procurement receipt evidence is never posted automatically. Choose an eligible line explicitly.</span></label>}
          {isProcurementReceipt && <label className="sm:col-span-2"><span className={labelClass}>Eligible procurement receipt line</span><select required className={inputClass} value={form.receiptSourceKey} onChange={(event) => { const selected = receiptOptions.find((option) => option.key === event.target.value); update("receiptSourceKey", event.target.value); if (selected) { update("quantity", String(selected.line.quantity)); update("inventoryItemId", items.find((item) => normalizeUnit(item.stockUnit) === normalizeUnit(selected.line.unit) && item.status === "ACTIVE")?.id || ""); } }}><option value="">Choose receipt line</option>{receiptOptions.map((option) => <option key={option.key} value={option.key}>{option.receipt.receiptNumber} · {option.purchaseOrder.poNumber} · line {option.line.lineNumber} · {option.line.description} · {option.line.quantity} {option.line.unit}</option>)}</select>{!receiptOptions.length && <span className="mt-1 block text-[10px] text-amber-700">No eligible non-void receipt lines are available, or all have already been posted into warehouse stock.</span>}</label>}
          {(action === "PROJECT_ISSUE" || action === "PROJECT_RETURN") && <label className="sm:col-span-2"><span className={labelClass}>Project</span><select required className={inputClass} value={form.projectId} onChange={(event) => { update("projectId", event.target.value); update("projectMaterialId", ""); }}><option value="">Choose project</option>{projectOptions.map((project) => <option key={project.id} value={project.id}>{project.projectCode} · {project.projectName}</option>)}</select>{!canReadProjects && <span className="mt-1 block text-[10px] text-slate-500">Project context is restricted for this role.</span>}</label>}
          {(action === "PROJECT_ISSUE" || action === "PROJECT_RETURN") && form.projectId && <label className="sm:col-span-2"><span className={labelClass}>Project material requirement (optional)</span><select className={inputClass} value={form.projectMaterialId} onChange={(event) => update("projectMaterialId", event.target.value)}><option value="">No requirement link</option>{materialOptions.map((material) => <option key={material.id} value={material.id}>{material.materialName} · planned {material.requiredQuantity} {material.unit}</option>)}</select><span className="mt-1 block text-[10px] text-slate-500">Only exact canonical-item and unit links are offered. Planned quantity stays separate from issued quantity.</span></label>}
          <label><span className={labelClass}>Quantity</span><input required={!isProcurementReceipt} readOnly={isProcurementReceipt} type="number" min="0.0001" step="0.0001" className={`${inputClass} ${isProcurementReceipt ? "bg-slate-50" : ""}`} value={form.quantity} onChange={(event) => update("quantity", event.target.value)} placeholder="0.0000" />{isProcurementReceipt && <span className="mt-1 block text-[10px] text-slate-500">Copied exactly from the selected receipt line.</span>}</label>
          <label><span className={labelClass}>Effective date</span><input required type="date" className={inputClass} value={form.effectiveDate} onChange={(event) => update("effectiveDate", event.target.value)} /></label>
          <label><span className={labelClass}>Reason</span><input required className={inputClass} value={form.reason} onChange={(event) => update("reason", event.target.value)} placeholder={action === "OPENING" ? "Initial physical count" : "Why did custody change?"} /></label>
          <label><span className={labelClass}>Reference (optional)</span><input className={inputClass} value={form.reference} onChange={(event) => update("reference", event.target.value)} placeholder="Count sheet, delivery note, or issue slip" /></label>
        </div>
        <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:justify-end"><button type="button" disabled={busy} onClick={onClose} className="min-h-11 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-black text-slate-700">Cancel</button><button type="submit" disabled={busy || (isProcurementReceipt && !receiptOptions.length)} className="min-h-11 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-50">{busy ? "Recording…" : "Confirm movement"}</button></div>
      </form>
    </ModalShell>
  );
}

function ReverseMovementModal({ movement, onClose, onSubmit }: { movement: InventoryMovement; onClose: () => void; onSubmit: (movementId: string, reason: string, idempotencyKey: string) => Promise<void> }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (reason.trim().length < 3) throw new Error("A correction reason of at least 3 characters is required.");
      await onSubmit(movement.id, reason.trim(), localId("inventory-reversal"));
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The movement could not be reversed.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <ModalShell title="Reverse inventory movement" eyebrow="Controlled correction" onClose={onClose} busy={busy}>
      <form onSubmit={(event) => void submit(event)} className="space-y-4">
        {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold leading-5 text-rose-800">{error}</div>}
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-950"><strong>{movementLabel(movement.movementType)} · {movement.quantity} {movement.stockUnitSnapshot}</strong><p className="mt-1 leading-5">The original movement remains in history. A compensating reversal will be recorded and the database will recheck stock and project-return provenance.</p></div>
        <label><span className={labelClass}>Correction reason</span><textarea required rows={4} className={`${inputClass} resize-y`} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Explain the correction and the evidence reviewed." /></label>
        <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:justify-end"><button type="button" disabled={busy} onClick={onClose} className="min-h-11 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-black text-slate-700">Cancel</button><button type="submit" disabled={busy} className="min-h-11 rounded-xl bg-amber-700 px-4 py-2.5 text-sm font-black text-white disabled:opacity-50">{busy ? "Reversing…" : "Record reversal"}</button></div>
      </form>
    </ModalShell>
  );
}

export interface WarehouseInventoryPageProps {
  items: readonly InventoryItem[];
  movements: readonly InventoryMovement[];
  balances?: readonly InventoryBalance[];
  projects?: readonly Project[];
  projectMaterials?: readonly ProjectMaterial[];
  purchaseOrders?: readonly PurchaseOrder[];
  receipts?: readonly PurchaseOrderReceipt[];
  canRead?: boolean;
  canManage?: boolean;
  canReadProjects?: boolean;
  canReadProcurement?: boolean;
  onOpenProject?: (project: Project) => void;
  onSaveItem?: (input: InventoryItemSaveInput) => Promise<InventoryItem>;
  onRecordMovement?: (input: InventoryMovementInput) => Promise<InventoryMovement>;
  onReverseMovement?: (movementId: string, reason: string, idempotencyKey: string) => Promise<InventoryMovement>;
}

export const WarehouseInventoryPage: React.FC<WarehouseInventoryPageProps> = ({
  items,
  movements,
  balances: providedBalances,
  projects = [],
  projectMaterials = [],
  purchaseOrders = [],
  receipts = [],
  canRead = false,
  canManage = false,
  canReadProjects = false,
  canReadProcurement = false,
  onOpenProject,
  onSaveItem,
  onRecordMovement,
  onReverseMovement,
}) => {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | InventoryItem["status"]>("ALL");
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [itemModal, setItemModal] = useState<{ item?: InventoryItem } | null>(null);
  const [movementModal, setMovementModal] = useState<{ action: MovementAction; itemId?: string } | null>(null);
  const [reverseMovement, setReverseMovement] = useState<InventoryMovement | null>(null);
  const balances = useMemo(() => providedBalances || deriveInventoryBalances(items, movements), [items, movements, providedBalances]);
  const itemById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  const projectById = useMemo(() => new Map(projects.map((project) => [project.id, project])), [projects]);
  const balanceById = useMemo(() => new Map(balances.map((balance) => [balance.inventoryItemId, balance])), [balances]);
  const reversedMovementIds = useMemo(() => new Set(movements.map((movement) => movement.reversalOfMovementId).filter((id): id is string => Boolean(id))), [movements]);
  const receiptOptions = useMemo<ReceiptOption[]>(() => {
    const purchaseOrderById = new Map(purchaseOrders.map((purchaseOrder) => [purchaseOrder.id, purchaseOrder]));
    return receipts.flatMap((receipt) => {
      if (receipt.status !== "RECEIVED") return [];
      const purchaseOrder = purchaseOrderById.get(receipt.purchaseOrderId);
      if (!purchaseOrder) return [];
      return (receipt.lines || []).flatMap((line) => {
        const alreadyPosted = movements.some((movement) => movement.sourceType === "PURCHASE_ORDER_RECEIPT" && movement.purchaseOrderReceiptId === receipt.id && movement.purchaseOrderLineId === line.purchaseOrderLineId);
        return alreadyPosted ? [] : [{ key: `${receipt.id}::${line.purchaseOrderLineId}`, receipt, purchaseOrder, line: purchaseOrder.lines?.find((candidate) => candidate.id === line.purchaseOrderLineId) || { ...line, description: "Receipt line", quantity: line.receivedQuantity, unit: "", unitPrice: 0, amount: 0, purchaseOrderId: purchaseOrder.id, lineNumber: line.lineNumber, id: line.purchaseOrderLineId } }];
      });
    });
  }, [movements, purchaseOrders, receipts]);
  const filteredBalances = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return balances.filter((balance) => (statusFilter === "ALL" || balance.status === statusFilter)
      && (!needle || `${balance.itemName} ${balance.itemCode || ""} ${balance.category || ""} ${balance.stockUnit}`.toLowerCase().includes(needle)));
  }, [balances, query, statusFilter]);
  const selectedItem = selectedItemId ? itemById.get(selectedItemId) : undefined;
  const selectedBalance = selectedItemId ? balanceById.get(selectedItemId) : undefined;
  const selectedMovements = useMemo(() => selectedItemId ? movements.filter((movement) => movement.inventoryItemId === selectedItemId).sort((left, right) => `${right.createdAt || right.effectiveDate}`.localeCompare(left.createdAt || left.effectiveDate)) : [], [movements, selectedItemId]);

  if (!canRead) {
    return <section className="space-y-4"><PageHeader eyebrow="Warehouse" title="Warehouse Inventory" description="Company-level physical stock and custody history." /><div role="status" className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-5 text-sm leading-6 text-slate-600 shadow-sm"><ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-slate-500" /><div><p className="font-black text-slate-900">Inventory access is restricted.</p><p className="mt-1">Your current permission set does not include warehouse inventory read access. No stock quantities are shown.</p></div></div></section>;
  }

  const openMovement = (action: MovementAction, itemId?: string) => setMovementModal({ action, itemId });
  const saveMovement = async (input: InventoryMovementInput) => {
    if (!onRecordMovement) throw new Error("Warehouse movement recording is not available in this workspace.");
    await onRecordMovement(input);
  };

  return (
    <section className="space-y-5" data-domain="warehouse-inventory">
      <PageHeader eyebrow="Company operations" title="Warehouse Inventory" description="Quantity and custody ledger derived from authoritative movements. No valuation or automatic procurement posting is performed." actions={canManage ? <div className="flex flex-wrap gap-2"><button type="button" onClick={() => setItemModal({})} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-2 text-xs font-black text-white"><Plus className="h-3.5 w-3.5" />Add item</button><button type="button" onClick={() => openMovement("OPENING")} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700"><ArrowDownToLine className="h-3.5 w-3.5" />Opening stock</button></div> : undefined} />
      <div className="flex items-start gap-3 rounded-2xl border border-indigo-100 bg-indigo-50 p-4 text-xs leading-5 text-indigo-950"><Warehouse className="mt-0.5 h-5 w-5 shrink-0 text-indigo-600" /><div><p className="font-black">Movement-derived stock truth</p><p className="mt-1">Opening stock, receipts, project issues, project returns, and compensating reversals are recorded as history. Planned project quantity, PO receipt quantity, and field observations remain visibly separate.</p></div></div>
      {movements.some((movement) => movement.requiresReconciliation) && <div role="status" className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs leading-5 text-amber-950"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" /><div><p className="font-black">Procurement reconciliation needs review</p><p className="mt-1">One or more warehouse receipts reference a PO receipt that is now voided. Stock history remains intact; review the movement and use the controlled reversal path when appropriate.</p></div></div>}
      <div className="grid gap-3 sm:grid-cols-3"><div className="rounded-2xl border border-indigo-100 bg-indigo-50 p-4"><Package className="h-5 w-5 text-indigo-600" /><p className="mt-3 text-2xl font-black text-indigo-950">{items.length}</p><p className="mt-1 text-[10px] font-black uppercase tracking-[0.1em] text-indigo-700">Canonical items</p></div><div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4"><CheckCircle2 className="h-5 w-5 text-emerald-600" /><p className="mt-3 text-2xl font-black text-emerald-950">{balances.filter((balance) => balance.onHandQuantity > 0).length}</p><p className="mt-1 text-[10px] font-black uppercase tracking-[0.1em] text-emerald-700">Items with positive on-hand</p></div><div className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><History className="h-5 w-5 text-slate-600" /><p className="mt-3 text-2xl font-black text-slate-950">{movements.length}</p><p className="mt-1 text-[10px] font-black uppercase tracking-[0.1em] text-slate-600">Movement events</p></div></div>
      <div className="grid gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm md:grid-cols-[minmax(0,1fr)_150px]"><label className="relative block"><span className="sr-only">Search inventory items</span><Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-slate-400" /><input className={`${inputClass} mt-0 pl-9`} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search item, code, category, or unit…" /></label><select aria-label="Filter item status" className={`${inputClass} mt-0`} value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}><option value="ALL">All statuses</option><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option></select></div>
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="hidden grid-cols-[minmax(210px,1.5fr)_110px_130px_130px_130px_minmax(230px,1fr)] gap-3 border-b border-slate-100 bg-slate-50 px-4 py-3 text-[10px] font-black uppercase tracking-[0.1em] text-slate-500 lg:grid"><span>Canonical item</span><span>Unit</span><span>On-hand</span><span>Movement totals</span><span>Status</span><span /></div>{filteredBalances.length ? filteredBalances.map((balance) => { const item = itemById.get(balance.inventoryItemId)!; const ActionIcon = actionIcon("RECEIPT"); return <div key={balance.inventoryItemId} data-inventory-item="true" className="grid gap-3 border-b border-slate-100 px-4 py-4 last:border-b-0 lg:grid-cols-[minmax(210px,1.5fr)_110px_130px_130px_130px_minmax(230px,1fr)] lg:items-center"><div className="min-w-0"><button type="button" className="text-left text-sm font-black text-indigo-700 hover:text-indigo-900 hover:underline" onClick={() => setSelectedItemId(item.id)}>{balance.itemName}</button><p className="mt-1 text-[10px] text-slate-500">{[balance.itemCode, balance.category].filter(Boolean).join(" · ") || "No code or category"}</p><span className="mt-2 inline-flex"><StatusBadge tone={statusTone(balance.status)}>{balance.status}</StatusBadge></span></div><div className="text-xs font-bold text-slate-700"><span className="lg:hidden text-[10px] font-black uppercase tracking-wide text-slate-400">Unit · </span>{balance.stockUnit}</div><div className="text-sm font-black tabular-nums text-slate-950"><span className="lg:hidden text-[10px] font-black uppercase tracking-wide text-slate-400">On-hand · </span>{quantity(balance.onHandQuantity)} {balance.stockUnit}</div><div className="text-[10px] leading-4 text-slate-600"><span className="lg:hidden text-[10px] font-black uppercase tracking-wide text-slate-400">Totals · </span>In {quantity(balance.openingQuantity + balance.receivedQuantity + balance.returnedQuantity)} · issued {quantity(balance.issuedQuantity)}<span className="mt-1 block text-slate-400">Opening {quantity(balance.openingQuantity)} · received {quantity(balance.receivedQuantity)} · returned {quantity(balance.returnedQuantity)}</span></div><div className="text-xs text-slate-600"><span className="lg:hidden text-[10px] font-black uppercase tracking-wide text-slate-400">Status · </span>{balance.latestMovementType ? `${movementLabel(balance.latestMovementType)} · ${balance.latestEffectiveDate || "date unavailable"}` : "No movements yet"}</div><div className="flex flex-wrap justify-start gap-1.5 lg:justify-end"><button type="button" onClick={() => setSelectedItemId(item.id)} className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[10px] font-black text-slate-700"><History className="h-3 w-3" />History</button>{canManage && <><button type="button" onClick={() => openMovement("RECEIPT", item.id)} className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-emerald-200 px-2.5 py-1.5 text-[10px] font-black text-emerald-800"><ActionIcon className="h-3 w-3" />Receive</button><button type="button" onClick={() => openMovement("PROJECT_ISSUE", item.id)} className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-amber-200 px-2.5 py-1.5 text-[10px] font-black text-amber-800"><ArrowUpFromLine className="h-3 w-3" />Issue</button><button type="button" onClick={() => openMovement("PROJECT_RETURN", item.id)} className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-cyan-200 px-2.5 py-1.5 text-[10px] font-black text-cyan-800"><Undo2 className="h-3 w-3" />Return</button><button type="button" onClick={() => setItemModal({ item })} className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[10px] font-black text-slate-700"><Edit3 className="h-3 w-3" />Edit</button></>}</div></div>; }) : <div className="p-12 text-center"><Package className="mx-auto h-9 w-9 text-slate-300" /><p className="mt-3 text-sm font-black text-slate-700">{items.length ? "No items match this filter." : "No canonical inventory items yet."}</p><p className="mt-1 text-xs leading-5 text-slate-500">{items.length ? "Change the search or status filter." : canManage ? "Add an item, then record explicit opening or received stock." : "Inventory records will appear here when authorized."}</p></div>}</div>
      {!canManage && <div className="flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-600"><ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" /><span>Read-only inventory view. Stock actions and corrections require inventory.manage; no quantities are editable from this screen.</span></div>}

      {selectedItem && <ModalShell title={selectedItem.itemName} eyebrow="Item history" onClose={() => setSelectedItemId(null)} wide>
        <div className="space-y-4"><div className="grid gap-3 sm:grid-cols-4"><div className="rounded-xl bg-slate-50 p-3"><p className="text-[10px] font-black uppercase tracking-wide text-slate-500">On-hand</p><p className="mt-1 text-lg font-black tabular-nums">{quantity(selectedBalance?.onHandQuantity || 0)} {selectedItem.stockUnit}</p></div><div className="rounded-xl bg-slate-50 p-3"><p className="text-[10px] font-black uppercase tracking-wide text-slate-500">Opening</p><p className="mt-1 text-lg font-black tabular-nums">{quantity(selectedBalance?.openingQuantity || 0)} {selectedItem.stockUnit}</p></div><div className="rounded-xl bg-slate-50 p-3"><p className="text-[10px] font-black uppercase tracking-wide text-slate-500">Received</p><p className="mt-1 text-lg font-black tabular-nums">{quantity(selectedBalance?.receivedQuantity || 0)} {selectedItem.stockUnit}</p></div><div className="rounded-xl bg-slate-50 p-3"><p className="text-[10px] font-black uppercase tracking-wide text-slate-500">Issued / returned</p><p className="mt-1 text-lg font-black tabular-nums">{quantity(selectedBalance?.issuedQuantity || 0)} / {quantity(selectedBalance?.returnedQuantity || 0)}</p></div></div><div className="flex flex-wrap gap-2">{canManage && <><button type="button" onClick={() => openMovement("RECEIPT", selectedItem.id)} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-emerald-200 px-3 py-2 text-xs font-black text-emerald-800"><Truck className="h-3.5 w-3.5" />Receive stock</button><button type="button" onClick={() => openMovement("PROJECT_ISSUE", selectedItem.id)} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-amber-200 px-3 py-2 text-xs font-black text-amber-800"><ArrowUpFromLine className="h-3.5 w-3.5" />Issue to project</button><button type="button" onClick={() => openMovement("PROJECT_RETURN", selectedItem.id)} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-cyan-200 px-3 py-2 text-xs font-black text-cyan-800"><Undo2 className="h-3.5 w-3.5" />Return from project</button><button type="button" onClick={() => setItemModal({ item: selectedItem })} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-black text-slate-700"><Edit3 className="h-3.5 w-3.5" />Edit item</button></>}</div><div className="overflow-hidden rounded-xl border border-slate-200"><div className="hidden grid-cols-[150px_110px_120px_minmax(220px,1fr)_minmax(180px,1fr)_110px] gap-3 border-b border-slate-100 bg-slate-50 px-3 py-2.5 text-[10px] font-black uppercase tracking-wide text-slate-500 md:grid"><span>Date</span><span>Movement</span><span>Quantity</span><span>Project / source</span><span>Reason / reference</span><span /></div>{selectedMovements.length ? selectedMovements.map((movement) => { const project = movement.projectId ? projectById.get(movement.projectId) : undefined; const canReverse = canManage && movement.movementType !== "REVERSAL" && !reversedMovementIds.has(movement.id) && Boolean(onReverseMovement); return <div key={movement.id} className="grid gap-2 border-b border-slate-100 px-3 py-3 last:border-b-0 md:grid-cols-[150px_110px_120px_minmax(220px,1fr)_minmax(180px,1fr)_110px] md:items-center"><div className="text-xs font-bold text-slate-700">{movement.effectiveDate}<span className="mt-1 block text-[10px] text-slate-400">{movement.createdAt ? new Date(movement.createdAt).toLocaleString() : "Recorded time unavailable"}</span></div><div><span className={`inline-flex rounded-full border px-2 py-1 text-[10px] font-black ${movement.movementType === "REVERSAL" ? "border-amber-200 bg-amber-50 text-amber-800" : movement.direction === "IN" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-rose-200 bg-rose-50 text-rose-800"}`}>{movementLabel(movement.movementType)}</span>{movement.movementType === "REVERSAL" && <span className="mt-1 block text-[10px] text-slate-500">Compensating history</span>}</div><div className={`text-sm font-black tabular-nums ${movement.direction === "IN" ? "text-emerald-700" : "text-rose-700"}`}>{movement.direction === "IN" ? "+" : "−"}{quantity(movement.quantity)} {movement.stockUnitSnapshot}</div><div className="text-xs text-slate-700">{project ? <>{onOpenProject ? <button type="button" onClick={() => onOpenProject(project)} className="font-black text-indigo-700 hover:underline">{project.projectCode} · {project.projectName}</button> : <span className="font-black">{project.projectName}</span>}{movement.projectMaterialId && <span className="mt-1 block text-[10px] text-slate-500">Project material requirement linked</span>}</> : movement.sourceType === "PURCHASE_ORDER_RECEIPT" ? <span className="font-semibold">Procurement receipt {movement.sourcePurchaseOrderReceiptNumber || movement.purchaseOrderReceiptId}{movement.sourcePurchaseOrderId ? ` · ${movement.sourcePurchaseOrderId}` : ""}</span> : <span className="text-slate-500">Company warehouse custody</span>}{movement.requiresReconciliation && <span className="mt-1 flex items-center gap-1 text-[10px] font-black text-amber-700"><AlertTriangle className="h-3 w-3" />PO receipt voided · review</span>}</div><div className="text-xs text-slate-700"><p>{movement.reason}</p>{movement.reference && <p className="mt-1 text-[10px] text-slate-500">Ref: {movement.reference}</p>}{movement.createdByUserId && <p className="mt-1 text-[10px] text-slate-400">Actor recorded</p>}</div><div className="flex justify-start md:justify-end">{canReverse ? <button type="button" onClick={() => setReverseMovement(movement)} className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-amber-200 px-2.5 py-1.5 text-[10px] font-black text-amber-800"><RotateCcw className="h-3 w-3" />Reverse</button> : movement.movementType !== "REVERSAL" && reversedMovementIds.has(movement.id) ? <span className="text-[10px] font-bold text-slate-400">Reversed</span> : null}</div></div>; }) : <div className="p-8 text-center text-xs text-slate-500">No movement history for this item yet.</div>}</div></div>
      </ModalShell>}

      {itemModal && onSaveItem && <ItemFormModal item={itemModal.item} onClose={() => setItemModal(null)} onSave={onSaveItem} />}
      {movementModal && <MovementFormModal action={movementModal.action} initialItemId={movementModal.itemId} items={items} balances={balances} projects={projects} projectMaterials={projectMaterials} receiptOptions={receiptOptions} canReadProjects={canReadProjects} canReadProcurement={canReadProcurement} onClose={() => setMovementModal(null)} onSubmit={saveMovement} />}
      {reverseMovement && onReverseMovement && <ReverseMovementModal movement={reverseMovement} onClose={() => setReverseMovement(null)} onSubmit={async (movementId, reason, idempotencyKey) => { await onReverseMovement(movementId, reason, idempotencyKey); }} />}
    </section>
  );
};

export default WarehouseInventoryPage;
