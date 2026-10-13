import React, { useMemo } from "react";
import type { InvoiceData, Project } from "../../types.ts";
import type { SupplierInvoiceSettlementProjection } from "../../lib/supplierInvoiceSettlement.ts";
import { supplierInvoicePaymentStateFor } from "../../lib/supplierInvoiceSettlement.ts";
import { WorkbookRecordSheet } from "./WorkbookRecordSheet.tsx";
import type { WorksheetColumn } from "../../components/ui/WorksheetEditor.tsx";
import type { AppNavigate } from "../../utils/clientNavigation.ts";
import { appPathForInvoice, appPathForReviewInvoice, appPathForTab } from "../../utils/appRouting.ts";

export function WorkbookInvoiceSheet({ invoices, projects = [], projections, onNavigate, onDirtyChange, canAdd, disabled }: {
  invoices: readonly InvoiceData[]; projections?: ReadonlyMap<string, SupplierInvoiceSettlementProjection>;
  onNavigate?: AppNavigate; onDirtyChange: (dirty: boolean) => void; canAdd: boolean; disabled?: boolean;
  projects?: readonly Project[];
}) {
  const columns = useMemo<readonly WorksheetColumn<InvoiceData>[]>(() => [
    { key: "supplier", header: "Supplier", minWidth: "17rem", protected: true, value: (row) => row.vendor.name },
    { key: "invoiceNumber", header: "Bill number", minWidth: "11rem", protected: true, value: (row) => row.invoiceNumber },
    { key: "invoiceDate", header: "Date", protected: true, value: (row) => row.invoiceDate },
    { key: "dueDate", header: "Due date", protected: true, value: (row) => row.dueDate || "—" },
    ...(projects.length ? [{ key: "project", header: "Project", minWidth: "15rem", protected: true, value: (row: InvoiceData) => { const project = projects.find((candidate) => [candidate.id, candidate.projectCode].includes(row.projectReference || "")); return project ? `${project.projectCode} · ${project.projectName}` : "Unassigned"; } }] : []),
    { key: "grandTotal", mobileSummary: true, header: "Source amount", kind: "currency", currency: (row) => row.currency, protected: true, align: "right", minWidth: "11rem", value: (row) => row.grandTotal ?? "Unknown", format: (_value, row) => {
      if (row.grandTotal === null || row.grandTotal === undefined) return "Unknown";
      try { return new Intl.NumberFormat("en-PH", { style: "currency", currency: row.currency }).format(row.grandTotal); }
      catch { return `${row.currency || "Currency unknown"} ${row.grandTotal}`; }
    } },
    { key: "reviewStatus", header: "Review", protected: true, value: (row) => row.reviewStatus || "Pending review" },
    { key: "payment", mobileSummary: true, header: "Payment", protected: true, value: (row) => supplierInvoicePaymentStateFor(row, projections?.get(row.id)).replaceAll("_", " ") },
    { key: "open", mobileSummary: true, header: "Next action", protected: true, minWidth: "10rem", value: (row) => row.invoiceNumber, render: (_value, row) => <button type="button" className="hqs-focus-ring hqs-accent-text min-h-9 rounded-md px-2 font-semibold" onClick={() => onNavigate?.(row.reviewStatus === "VERIFIED" || row.archivedAt || row.voidedAt ? appPathForInvoice(row.id, "workbook") : appPathForReviewInvoice(row.id, "workbook"))}>{row.reviewStatus === "VERIFIED" || row.archivedAt || row.voidedAt ? "Open bill" : "Edit bill"}</button> },
  ], [onNavigate, projects, projections]);
  return <WorkbookRecordSheet label="Supplier Invoices" sourceRows={invoices} columns={columns} disabled={disabled} validate={() => []} onDirtyChange={onDirtyChange}
    actions={canAdd && onNavigate ? <button type="button" onClick={() => onNavigate(appPathForTab("extractor"))} className="hqs-focus-ring rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white">Add bill</button> : undefined} />;
}
