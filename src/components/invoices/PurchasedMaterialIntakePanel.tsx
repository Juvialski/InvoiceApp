import React, { useEffect, useMemo, useState } from "react";
import { CheckCircle2, FileCheck2, Lock, PackageCheck, ShieldAlert, Truck } from "lucide-react";
import type { InvoiceData, PurchasedMaterialIntake, PurchaseOrder, PurchaseOrderInvoiceMatch, PurchaseOrderReceipt } from "../../types.ts";
import type { InventoryItem } from "../../lib/inventory.ts";
import {
  buildPurchasedMaterialIntake,
  buildPurchasedMaterialReceiptPlan,
  normalizeMaterialUnit,
  purchasedMaterialMeaningLabel,
  suggestInventoryItemForMaterialLine,
} from "../../lib/purchasedMaterialIntake.ts";

const inputClass = "mt-1 min-h-9 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[10px] font-semibold text-slate-800 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100";

export interface PurchasedMaterialIntakePanelProps {
  invoice: InvoiceData;
  inventoryItems: readonly InventoryItem[];
  purchaseOrders: readonly PurchaseOrder[];
  receipts: readonly PurchaseOrderReceipt[];
  matches: readonly PurchaseOrderInvoiceMatch[];
  readOnly?: boolean;
  canManage?: boolean;
  onUpdateInvoice?: (invoice: InvoiceData) => void;
  onRecordReceipt?: (
    receipt: Partial<PurchaseOrderReceipt> & { purchaseOrderId: string; receiptNumber: string },
    lines: Array<{ purchaseOrderLineId: string; receivedQuantity: number; inventoryItemId?: string | null; notes?: string }>,
  ) => Promise<void>;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function lineLabel(line: InvoiceData["items"][number], index: number) {
  return line.description?.trim() || `Material line ${index + 1}`;
}

export const PurchasedMaterialIntakePanel: React.FC<PurchasedMaterialIntakePanelProps> = ({
  invoice,
  inventoryItems,
  purchaseOrders,
  receipts,
  matches,
  readOnly = false,
  canManage = false,
  onUpdateInvoice,
  onRecordReceipt,
}) => {
  const initial = useMemo(() => buildPurchasedMaterialIntake(invoice), [invoice]);
  const [meaning, setMeaning] = useState<PurchasedMaterialIntake["meaning"]>(initial.meaning);
  const [lines, setLines] = useState(initial.lines);
  const [receiptNumber, setReceiptNumber] = useState("");
  const [receiptDate, setReceiptDate] = useState(today);
  const [supplierDeliveryReference, setSupplierDeliveryReference] = useState("");
  const [receiptNotes, setReceiptNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setMeaning(initial.meaning);
    setLines(initial.lines);
    setError(null);
  }, [initial, invoice.id]);

  const intake = useMemo<PurchasedMaterialIntake>(() => ({
    meaning,
    lines,
    procurementReceiptId: initial.procurementReceiptId,
  }), [initial.procurementReceiptId, lines, meaning]);
  const plan = useMemo(() => buildPurchasedMaterialReceiptPlan(invoice, intake, purchaseOrders, receipts, matches), [invoice, intake, matches, purchaseOrders, receipts]);
  const confirmedMatch = matches.find((match) => match.invoiceId === invoice.id && match.status === "CONFIRMED");
  const existingReceipt = receipts.find((receipt) => receipt.status === "RECEIVED" && (receipt.sourceInvoiceId === invoice.id || receipt.id === intake.procurementReceiptId));

  const updateLine = (invoiceLineId: string, patch: Partial<typeof lines[number]>) => {
    setLines((current) => current.map((line) => line.invoiceLineId === invoiceLineId ? { ...line, ...patch } : line));
  };

  const saveReview = () => {
    if (!onUpdateInvoice) return;
    onUpdateInvoice({ ...invoice, purchasedMaterialIntake: intake });
    setError(null);
  };

  const recordReceipt = async () => {
    if (!onRecordReceipt) return;
    if (!receiptNumber.trim()) {
      setError("A Procurement receipt number is required.");
      return;
    }
    if (!receiptDate) {
      setError("A Procurement receipt date is required.");
      return;
    }
    if (!plan.valid || !plan.purchaseOrderId) {
      setError(plan.errors.join(" ") || "Resolve the material intake before creating a Procurement receipt.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onRecordReceipt(
        {
          purchaseOrderId: plan.purchaseOrderId,
          receiptNumber: receiptNumber.trim().toUpperCase(),
          receiptDate,
          supplierDeliveryReference: supplierDeliveryReference.trim() || undefined,
          notes: receiptNotes.trim() || undefined,
          sourceDocumentId: invoice.sourceDocumentId || undefined,
          sourceInvoiceId: invoice.id,
        },
        plan.lines.map((line) => ({
          purchaseOrderLineId: line.purchaseOrderLineId,
          receivedQuantity: line.receivedQuantity,
          inventoryItemId: line.inventoryItemId,
          notes: `Source invoice line ${line.invoiceLineId}; canonical item match ${line.inventoryItemId}.`,
        })),
      );
      onUpdateInvoice?.({ ...invoice, purchasedMaterialIntake: intake });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The Procurement receipt could not be created.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="min-w-0 rounded-2xl border border-teal-100 bg-teal-50/60 p-4" data-domain="purchased-material-intake">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-teal-700">Purchased-material intake</p>
          <p className="mt-1 break-words text-[10px] leading-4 text-teal-950">AI extraction prepares candidates only. Confirm the document meaning, exact quantity/unit, PO line, and canonical Inventory Item before recording delivery evidence.</p>
        </div>
        <PackageCheck className="h-5 w-5 shrink-0 text-teal-700" />
      </div>

      <div className="mt-3 rounded-xl border border-teal-200 bg-white p-3">
        <label className="block"><span className="text-[10px] font-black uppercase tracking-wide text-slate-500">Operational meaning</span><select className={inputClass} disabled={readOnly || !canManage} value={meaning} onChange={(event) => setMeaning(event.target.value as PurchasedMaterialIntake["meaning"])}><option value="UNRESOLVED">{purchasedMaterialMeaningLabel("UNRESOLVED")}</option><option value="FINANCIAL_ONLY">{purchasedMaterialMeaningLabel("FINANCIAL_ONLY")}</option><option value="DELIVERY_EVIDENCE">{purchasedMaterialMeaningLabel("DELIVERY_EVIDENCE")}</option><option value="BOTH">{purchasedMaterialMeaningLabel("BOTH")}</option></select></label>
        <p className="mt-2 text-[10px] leading-4 text-slate-500">An uploaded Invoice does not prove physical custody. Financial-only documents never create Procurement receipts or Warehouse movements.</p>
      </div>

      {meaning === "DELIVERY_EVIDENCE" || meaning === "BOTH" ? <>
        <div className="mt-3 space-y-2">
          {(invoice.items || []).map((line, index) => {
            const invoiceLineId = line.id || `invoice-line-${index + 1}`;
            const reviewLine = lines.find((candidate) => candidate.invoiceLineId === invoiceLineId);
            const suggestion = suggestInventoryItemForMaterialLine(line, inventoryItems);
            const unit = normalizeMaterialUnit(line.unitOfMeasure);
            const exactItems = inventoryItems.filter((item) => item.status === "ACTIVE" && unit && normalizeMaterialUnit(item.stockUnit) === unit);
            const matchedPoLineId = reviewLine?.purchaseOrderLineId || confirmedMatch?.lines?.find((candidate) => candidate.invoiceLineId === invoiceLineId)?.purchaseOrderLineId;
            return <div key={invoiceLineId} className="rounded-xl border border-teal-100 bg-white p-3"><div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0"><p className="break-words text-xs font-black text-slate-900">{lineLabel(line, index)}</p><p className="mt-1 text-[10px] text-slate-500">Source quantity: {line.quantity === null || line.quantity === undefined ? "Unknown" : line.quantity} · unit: {line.unitOfMeasure || "Unknown"}{line.sku ? ` · code ${line.sku}` : ""}</p></div><span className={`rounded-full border px-2 py-1 text-[9px] font-black ${reviewLine?.status === "CONFIRMED" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-800"}`}>{reviewLine?.status === "CONFIRMED" ? "Canonical item confirmed" : "Review required"}</span></div><div className="mt-2 grid gap-2 sm:grid-cols-2"><label className="block"><span className="text-[10px] font-black uppercase tracking-wide text-slate-500">Canonical Inventory Item</span><select className={inputClass} disabled={readOnly || !canManage || !unit} value={reviewLine?.inventoryItemId || ""} onChange={(event) => updateLine(invoiceLineId, { inventoryItemId: event.target.value || undefined, status: event.target.value ? "CONFIRMED" : "UNRESOLVED" })}><option value="">{unit ? "Choose exact-unit item" : "Unit unresolved"}</option>{exactItems.map((item) => <option key={item.id} value={item.id}>{item.itemName}{item.itemCode ? ` · ${item.itemCode}` : ""} · {item.stockUnit}</option>)}</select>{suggestion.item && !reviewLine?.inventoryItemId && <button type="button" disabled={readOnly || !canManage} onClick={() => updateLine(invoiceLineId, { inventoryItemId: suggestion.item?.id, status: "CONFIRMED" })} className="mt-1 text-left text-[10px] font-bold text-indigo-700 disabled:text-slate-400">Use suggestion: {suggestion.item.itemName} ({suggestion.reason})</button>}{suggestion.ambiguous && <span className="mt-1 block text-[10px] font-bold text-amber-700">Ambiguous deterministic match; choose manually.</span>}{!suggestion.item && !suggestion.ambiguous && unit && !exactItems.length && <span className="mt-1 block text-[10px] text-amber-700">No active canonical item uses this exact unit.</span>}</label><label className="block"><span className="text-[10px] font-black uppercase tracking-wide text-slate-500">Confirmed PO line</span><span className="mt-1 block min-h-9 rounded-lg border border-slate-200 bg-slate-50 px-2 py-2 text-[10px] font-semibold text-slate-700">{matchedPoLineId ? `Line ${purchaseOrders.find((po) => po.id === confirmedMatch?.purchaseOrderId)?.lines?.find((candidate) => candidate.id === matchedPoLineId)?.lineNumber || "selected"}` : "Confirm a PO match above"}</span></label></div></div>;
          })}
        </div>
        <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3"><div className="flex items-start gap-2 text-[10px] leading-4 text-slate-600">{confirmedMatch ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> : <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />}<span>{confirmedMatch ? "A confirmed Purchase Order match supplies the PO-line candidate; receipt quantity still comes from the reviewed source line." : "No confirmed Purchase Order match is available. A Procurement receipt cannot be created from this document yet."}</span></div></div>
        {existingReceipt ? <div className="mt-3 flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-[10px] leading-4 text-emerald-950"><FileCheck2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" /><span><strong>Procurement receipt {existingReceipt.receiptNumber} recorded.</strong> Warehouse posting remains a separate explicit action using the actual receipt-line quantities.</span></div> : <>
          <div className="mt-3 grid gap-2 sm:grid-cols-3"><label><span className="text-[10px] font-black uppercase tracking-wide text-slate-500">Receipt / DR number</span><input className={inputClass} disabled={readOnly || !canManage} value={receiptNumber} onChange={(event) => setReceiptNumber(event.target.value.toUpperCase())} placeholder="DR-0001" /></label><label><span className="text-[10px] font-black uppercase tracking-wide text-slate-500">Receipt date</span><input type="date" className={inputClass} disabled={readOnly || !canManage} value={receiptDate} onChange={(event) => setReceiptDate(event.target.value)} /></label><label><span className="text-[10px] font-black uppercase tracking-wide text-slate-500">Supplier reference</span><input className={inputClass} disabled={readOnly || !canManage} value={supplierDeliveryReference} onChange={(event) => setSupplierDeliveryReference(event.target.value)} placeholder="Optional" /></label></div>
          <label className="mt-2 block"><span className="text-[10px] font-black uppercase tracking-wide text-slate-500">Receipt notes</span><input className={inputClass} disabled={readOnly || !canManage} value={receiptNotes} onChange={(event) => setReceiptNotes(event.target.value)} placeholder="Inspection / delivery remarks" /></label>
          {plan.errors.length > 0 && <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-[10px] leading-4 text-amber-950"><strong>Receipt blocked until review is complete.</strong><ul className="mt-1 list-disc pl-4">{plan.errors.map((item) => <li key={item}>{item}</li>)}</ul></div>}
          <div className="mt-3 flex flex-wrap items-center justify-end gap-2"><button type="button" disabled={readOnly || !canManage || busy} onClick={saveReview} className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-teal-200 bg-white px-3 py-1.5 text-[10px] font-black text-teal-800"><FileCheck2 className="h-3 w-3" />Save intake review</button><button type="button" disabled={readOnly || !canManage || busy || !plan.valid} onClick={() => void recordReceipt()} className="inline-flex min-h-9 items-center gap-1 rounded-lg bg-teal-700 px-3 py-1.5 text-[10px] font-black text-white disabled:opacity-50"><Truck className="h-3 w-3" />{busy ? "Recording…" : "Create Procurement receipt"}</button></div>
        </>}
      </> : <div className="mt-3 flex items-start gap-2 rounded-xl border border-slate-200 bg-white p-3 text-[10px] leading-4 text-slate-600"><Lock className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" /><span>{meaning === "FINANCIAL_ONLY" ? "Financial-only treatment selected. No Procurement receipt or Warehouse stock action is available." : "Choose an operational meaning before purchased-material lines can be matched or received."}</span></div>}
      {error && <p role="alert" className="mt-2 text-[10px] font-bold text-rose-700">{error}</p>}
    </section>
  );
};

export default PurchasedMaterialIntakePanel;
