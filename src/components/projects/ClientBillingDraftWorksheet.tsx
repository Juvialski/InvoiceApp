import React, { useMemo, useRef, useState } from "react";
import type { Project } from "../../types.ts";
import {
  clientBillingLinesForPersistence,
  clientBillingTotal,
  type ClientBilling,
  type ClientBillingInput,
  type ClientBillingLineInput,
  type ClientBillingWorksheetLine,
} from "../../lib/clientBilling.ts";
import { projectTaxTreatmentLabel } from "../../utils/projectTaxTreatment.ts";
import { WorksheetEditor, type WorksheetColumn } from "../ui/WorksheetEditor.tsx";

export interface ClientBillingDraftWorksheetProps {
  project: Project;
  billing?: ClientBilling;
  initialBillingNumber?: string;
  isSaving?: boolean;
  errorMessage?: string | null;
  onSave: (input: ClientBillingInput, lines: readonly ClientBillingLineInput[]) => Promise<void> | void;
  onCancel: () => void;
}

interface BillingDetailsWorksheetRow {
  worksheetId: string;
  billingNumber: string;
  billingDate: string;
  dueDate: string;
  paymentTerms: string;
  periodStart: string;
  periodEnd: string;
  clientNameSnapshot: string;
  clientReferenceSnapshot: string;
  billingContactName: string;
  billingEmail: string;
  billingAddress: string;
  notes: string;
  projectContext: string;
  currency: string;
  taxTreatment: string;
  status: string;
  calculatedTotal: number;
  amountCollected: string;
  amountRemaining: string;
}

function textValue(value: unknown): string {
  return String(value ?? "");
}

function optionalText(value: unknown): string | undefined {
  const normalized = textValue(value).trim();
  return normalized || undefined;
}

function requiredField(label: string) {
  return (value: unknown) => textValue(value).trim() ? undefined : `${label} is required.`;
}

function nonNegativeAmount(value: unknown) {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) && amount >= 0 ? undefined : "Amount must be zero or greater.";
}

function billingEmail(value: unknown) {
  const email = textValue(value).trim();
  return !email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? undefined : "Enter a valid billing email or leave it blank.";
}

function emptyLine(worksheetId: string): ClientBillingWorksheetLine {
  return { worksheetId, description: "", amount: 0, notes: "" };
}

function detailsFromBilling(project: Project, billing?: ClientBilling, initialBillingNumber?: string): BillingDetailsWorksheetRow {
  return {
    worksheetId: billing?.id ? `billing-details-${billing.id}` : "billing-details-new",
    billingNumber: billing?.billingNumber || initialBillingNumber || "",
    billingDate: billing?.billingDate || new Date().toISOString().slice(0, 10),
    dueDate: billing?.dueDate || "",
    paymentTerms: billing?.paymentTerms || "",
    periodStart: billing?.periodStart || "",
    periodEnd: billing?.periodEnd || "",
    clientNameSnapshot: billing?.clientNameSnapshot || project.clientName || "",
    clientReferenceSnapshot: billing?.clientReferenceSnapshot || project.clientReference || "",
    billingContactName: billing?.billingContactName || project.billingContactName || "",
    billingEmail: billing?.billingEmail || project.billingEmail || "",
    billingAddress: billing?.billingAddress || project.billingAddress || project.siteAddress || "",
    notes: billing?.notes || "",
    projectContext: `${project.projectCode} — ${project.projectName}`,
    currency: project.currency,
    taxTreatment: projectTaxTreatmentLabel(project.taxTreatment),
    status: billing?.status || "DRAFT",
    calculatedTotal: clientBillingTotal({ lines: billing?.lines || [] }),
    amountCollected: "Not collectible",
    amountRemaining: "Not collectible",
  };
}

function linesFromBilling(billing: ClientBilling | undefined, nextWorksheetId: () => string): ClientBillingWorksheetLine[] {
  const lines = billing?.lines || [];
  return lines.length
    ? lines.map((line) => ({ worksheetId: line.id || nextWorksheetId(), description: line.description, amount: line.amount, notes: line.notes || "" }))
    : [emptyLine(nextWorksheetId())];
}

export function ClientBillingDraftWorksheet({
  project,
  billing,
  initialBillingNumber,
  isSaving = false,
  errorMessage,
  onSave,
  onCancel,
}: ClientBillingDraftWorksheetProps) {
  const worksheetRootRef = useRef<HTMLElement | null>(null);
  const lineSequence = useRef(0);
  const nextWorksheetId = () => `draft-client-billing-line-${lineSequence.current++}`;
  const [details, setDetails] = useState<BillingDetailsWorksheetRow>(() => detailsFromBilling(project, billing, initialBillingNumber));
  const [lineRows, setLineRows] = useState<ClientBillingWorksheetLine[]>(() => linesFromBilling(billing, nextWorksheetId));
  const detailsRef = useRef(details);
  const lineRowsRef = useRef(lineRows);
  const [localError, setLocalError] = useState<string | null>(null);

  const currency = project.currency || "PHP";
  const detailsColumns = useMemo<readonly WorksheetColumn<BillingDetailsWorksheetRow>[]>(() => [
    { key: "billingNumber", header: "Invoice Number", minWidth: "14rem", frozen: true, value: (row) => row.billingNumber, setValue: (row, value) => ({ ...row, billingNumber: textValue(value) }), validate: requiredField("Invoice Number") },
    { key: "billingDate", header: "Invoice Date", kind: "date", minWidth: "11rem", value: (row) => row.billingDate, setValue: (row, value) => ({ ...row, billingDate: textValue(value) }), validate: requiredField("Invoice Date") },
    { key: "dueDate", header: "Due Date", kind: "date", minWidth: "11rem", value: (row) => row.dueDate, setValue: (row, value) => ({ ...row, dueDate: textValue(value) }) },
    { key: "paymentTerms", header: "Payment Terms", minWidth: "15rem", value: (row) => row.paymentTerms, setValue: (row, value) => ({ ...row, paymentTerms: textValue(value) }) },
    { key: "periodStart", header: "Period Start", kind: "date", minWidth: "11rem", value: (row) => row.periodStart, setValue: (row, value) => ({ ...row, periodStart: textValue(value) }) },
    { key: "periodEnd", header: "Period End", kind: "date", minWidth: "11rem", value: (row) => row.periodEnd, setValue: (row, value) => ({ ...row, periodEnd: textValue(value) }) },
    { key: "clientNameSnapshot", header: "Client Name Snapshot", minWidth: "17rem", value: (row) => row.clientNameSnapshot, setValue: (row, value) => ({ ...row, clientNameSnapshot: textValue(value) }) },
    { key: "clientReferenceSnapshot", header: "Client Reference Snapshot", minWidth: "18rem", value: (row) => row.clientReferenceSnapshot, setValue: (row, value) => ({ ...row, clientReferenceSnapshot: textValue(value) }) },
    { key: "billingContactName", header: "Billing Contact", minWidth: "15rem", value: (row) => row.billingContactName, setValue: (row, value) => ({ ...row, billingContactName: textValue(value) }) },
    { key: "billingEmail", header: "Billing Email", minWidth: "18rem", value: (row) => row.billingEmail, setValue: (row, value) => ({ ...row, billingEmail: textValue(value) }), validate: billingEmail },
    { key: "billingAddress", header: "Billing Address", minWidth: "24rem", value: (row) => row.billingAddress, setValue: (row, value) => ({ ...row, billingAddress: textValue(value) }) },
    { key: "notes", header: "Notes", minWidth: "24rem", value: (row) => row.notes, setValue: (row, value) => ({ ...row, notes: textValue(value) }) },
    { key: "projectContext", header: "Project", minWidth: "22rem", protected: true, editable: false, value: (row) => row.projectContext },
    { key: "currency", header: "Currency", minWidth: "9rem", protected: true, editable: false, value: (row) => row.currency },
    { key: "taxTreatment", header: "Tax Treatment", minWidth: "12rem", protected: true, editable: false, value: (row) => row.taxTreatment },
    { key: "status", header: "Status", minWidth: "10rem", protected: true, editable: false, value: (row) => row.status },
    { key: "calculatedTotal", header: "Calculated Total", kind: "currency", align: "right", minWidth: "14rem", protected: true, editable: false, currency, value: (row) => row.calculatedTotal },
    { key: "amountCollected", header: "Amount Collected", minWidth: "14rem", protected: true, editable: false, value: (row) => row.amountCollected },
    { key: "amountRemaining", header: "Amount Remaining", minWidth: "14rem", protected: true, editable: false, value: (row) => row.amountRemaining },
  ], [currency]);

  const lineColumns = useMemo<readonly WorksheetColumn<ClientBillingWorksheetLine>[]>(() => [
    { key: "description", header: "Description", minWidth: "26rem", frozen: true, value: (row) => row.description, setValue: (row, value) => ({ ...row, description: textValue(value) }), validate: requiredField("Description") },
    { key: "amount", header: `Amount (${currency})`, kind: "currency", align: "right", minWidth: "13rem", currency, value: (row) => row.amount, setValue: (row, value) => ({ ...row, amount: Number(value ?? 0) }), validate: nonNegativeAmount },
    { key: "notes", header: "Line Notes", minWidth: "24rem", value: (row) => row.notes, setValue: (row, value) => ({ ...row, notes: textValue(value) }) },
  ], [currency]);

  const handleDetailsChange = (rows: readonly BillingDetailsWorksheetRow[]) => {
    const next = rows[0];
    if (!next) return;
    detailsRef.current = next;
    setDetails(next);
  };

  const handleLinesChange = (rows: readonly ClientBillingWorksheetLine[]) => {
    const next = [...rows];
    lineRowsRef.current = next;
    setLineRows(next);
    const nextDetails = { ...detailsRef.current, calculatedTotal: clientBillingTotal({ lines: next }) };
    detailsRef.current = nextDetails;
    setDetails(nextDetails);
  };

  const handleSave = async () => {
    const activeElement = typeof document !== "undefined" ? document.activeElement : null;
    if (typeof HTMLElement !== "undefined" && activeElement instanceof HTMLElement && worksheetRootRef.current?.contains(activeElement) && activeElement.matches("input, select")) {
      activeElement.blur();
    }
    await new Promise<void>((resolve) => {
      if (typeof requestAnimationFrame === "function") requestAnimationFrame(() => resolve());
      else setTimeout(resolve, 0);
    });
    if (worksheetRootRef.current?.querySelector('[data-worksheet-state="error"]')) {
      setLocalError("Resolve the highlighted worksheet validation errors before saving.");
      return;
    }

    const currentDetails = detailsRef.current;
    const lines = clientBillingLinesForPersistence(lineRowsRef.current).map((line) => ({
      description: line.description.trim(),
      amount: Number(line.amount),
      notes: optionalText(line.notes),
    }));
    if (!currentDetails.billingNumber.trim()) { setLocalError("Invoice number is required."); return; }
    if (!currentDetails.billingDate) { setLocalError("Invoice date is required."); return; }
    if (!lines.length || lines.some((line) => !line.description)) { setLocalError("Every billing line needs a description."); return; }
    if (lines.some((line) => !Number.isFinite(line.amount) || line.amount < 0)) { setLocalError("Billing line amounts must be zero or greater."); return; }
    if (currentDetails.periodStart && currentDetails.periodEnd && currentDetails.periodEnd < currentDetails.periodStart) { setLocalError("Period end cannot precede period start."); return; }
    setLocalError(null);
    try {
      await onSave({
        id: billing?.id,
        expectedUpdatedAt: billing?.updatedAt,
        projectId: project.id,
        billingNumber: currentDetails.billingNumber,
        billingDate: currentDetails.billingDate,
        dueDate: optionalText(currentDetails.dueDate),
        paymentTerms: optionalText(currentDetails.paymentTerms),
        periodStart: optionalText(currentDetails.periodStart),
        periodEnd: optionalText(currentDetails.periodEnd),
        clientNameSnapshot: optionalText(currentDetails.clientNameSnapshot),
        clientReferenceSnapshot: optionalText(currentDetails.clientReferenceSnapshot),
        billingContactName: optionalText(currentDetails.billingContactName),
        billingEmail: optionalText(currentDetails.billingEmail),
        billingAddress: optionalText(currentDetails.billingAddress),
        currency: project.currency,
        taxTreatment: project.taxTreatment,
        notes: optionalText(currentDetails.notes),
      }, lines);
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <section ref={worksheetRootRef} data-testid="client-billing-draft-worksheet" data-worksheet-responsive-surface="client-billing" aria-labelledby="client-billing-draft-worksheet-title" className="min-w-0 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-indigo-600">Client invoice draft</p>
          <h2 id="client-billing-draft-worksheet-title" className="mt-1 text-xl font-black text-slate-950">{billing ? `Edit client invoice draft · ${billing.billingNumber}` : "Create client invoice draft"}</h2>
          <p className="mt-1 text-xs leading-5 text-slate-500">Edit safe billing details and lines in one worksheet. The project remains the receivable context and the total is derived from line values.</p>
        </div>
      </div>

      <div className="rounded-xl border border-indigo-100 bg-indigo-50/60 px-3 py-2.5 text-[10px] leading-4 text-indigo-950">
        <p className="font-black uppercase tracking-[0.12em]">Draft boundary</p>
        <p className="mt-1">Save draft persists the complete header/details and line aggregate. Submit, issue, cancel, void, collection recording, Cash &amp; Banking settlement, and billing history remain outside this worksheet.</p>
      </div>

      <section aria-labelledby="client-billing-details-heading" className="min-w-0 space-y-2">
        <h3 id="client-billing-details-heading" className="text-sm font-black text-slate-800">Billing Details</h3>
        <div data-worksheet-scroll-container="client-billing-details" className="min-w-0">
          <WorksheetEditor
            ariaLabel="Client Billing details worksheet"
            rows={[details]}
            columns={detailsColumns}
            rowKey={(row) => row.worksheetId}
            onRowsChange={handleDetailsChange}
            disabled={isSaving}
            density="comfortable"
          />
        </div>
      </section>

      <section aria-labelledby="client-billing-lines-heading" className="min-w-0 space-y-2">
        <h3 id="client-billing-lines-heading" className="text-sm font-black text-slate-800">Billing Lines</h3>
        <div data-worksheet-scroll-container="client-billing-lines" className="min-w-0">
          <WorksheetEditor
            ariaLabel="Client Billing lines worksheet"
            rows={lineRows}
            columns={lineColumns}
            rowKey={(row) => row.worksheetId}
            onRowsChange={handleLinesChange}
            onAddRow={() => emptyLine(nextWorksheetId())}
            canAddRow={!isSaving}
            onRemoveRow={() => undefined}
            canRemoveRow={(_row, index) => !isSaving && lineRows.length > 1 && index >= 0}
            disabled={isSaving}
            emptyState="No billing lines yet. Add a row for each billed item or progress amount."
          />
        </div>
      </section>

      {(errorMessage || localError) && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-800">{localError || errorMessage}</div>}
      <div className="flex flex-wrap items-center justify-end gap-2">
        <button type="button" onClick={onCancel} disabled={isSaving} className="inline-flex min-h-10 items-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 disabled:cursor-not-allowed disabled:opacity-50">Cancel</button>
        <button type="button" data-testid="client-billing-save-draft" onClick={() => void handleSave()} disabled={isSaving} className="inline-flex min-h-10 items-center rounded-lg bg-indigo-600 px-4 py-2.5 text-xs font-black text-white disabled:cursor-not-allowed disabled:opacity-50">{isSaving ? "Saving…" : "Save draft"}</button>
      </div>
    </section>
  );
}

export default ClientBillingDraftWorksheet;
