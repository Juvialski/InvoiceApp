import React, { useEffect, useMemo, useRef, useState } from "react";
import type {
  InvoiceData,
  InvoiceFinancialFieldStatus,
  LineItem,
} from "../../types.ts";
import {
  getWorksheetCellId,
  getWorksheetColumnValue,
  WorksheetEditor,
  type WorksheetColumn,
} from "../ui/WorksheetEditor.tsx";

export interface SupplierInvoiceWorksheetProps {
  invoice: InvoiceData;
  readOnly?: boolean;
  onUpdateInvoice?: (invoice: InvoiceData) => void;
}

type ProvenanceLabel = "Source evidence" | "Manually corrected" | "Calculated" | "Unresolved";

const BASIS_OPTIONS = [
  { value: "UNKNOWN", label: "Unknown / ambiguous" },
  { value: "PRE_TAX", label: "Pre-tax" },
  { value: "TAX_INCLUSIVE", label: "Tax-inclusive" },
] as const;

const TAX_INCLUSION_OPTIONS = [
  { value: "UNKNOWN", label: "Unknown / ambiguous" },
  { value: "ADDED_TO_TOTAL", label: "Tax added to base" },
  { value: "INCLUDED_IN_TOTAL", label: "Tax included in total" },
  { value: "NOT_APPLICABLE", label: "No tax / not applicable" },
] as const;

const PAYABLE_BASIS_OPTIONS = [
  { value: "UNKNOWN", label: "Unknown / ambiguous" },
  { value: "GROSS_INVOICE", label: "Gross invoice" },
  { value: "NET_AFTER_WITHHOLDING", label: "Net after withholding" },
] as const;

const DETERMINATION_OPTIONS = [
  { value: "UNKNOWN", label: "Unknown" },
  { value: "EXPLICIT", label: "Explicit on source" },
  { value: "INFERRED", label: "Inferred from source" },
] as const;

const TAX_TREATMENT_OPTIONS = [
  { value: "UNKNOWN", label: "Unknown" },
  { value: "VATABLE", label: "VATable" },
  { value: "ZERO_RATED", label: "Zero-rated" },
  { value: "VAT_EXEMPT", label: "VAT-exempt" },
  { value: "NON_VAT", label: "Non-VAT" },
] as const;

let lineSequence = 0;

function textValue(value: unknown) {
  return String(value ?? "");
}

function valueAt(value: unknown, path: string): unknown {
  return path.split(".").reduce((current: any, key) => current?.[key], value);
}

function setPath<T extends object>(source: T, path: string, value: unknown): T {
  const next: any = { ...source };
  const parts = path.split(".");
  let cursor = next;
  for (let index = 0; index < parts.length - 1; index += 1) {
    cursor[parts[index]] = { ...(cursor[parts[index]] || {}) };
    cursor = cursor[parts[index]];
  }
  cursor[parts.at(-1)!] = value;
  return next as T;
}

function sameValue(left: unknown, right: unknown) {
  return Object.is(left, right) || JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

function provenanceFor(invoice: InvoiceData, path: string, value: unknown): ProvenanceLabel | undefined {
  const status: InvoiceFinancialFieldStatus | undefined = invoice.financialFieldStatus?.[path];
  if (status === "MANUAL") return "Manually corrected";
  if (status === "CALCULATED") return "Calculated";
  if (status === "UNKNOWN") return "Unresolved";

  const snapshotValue = valueAt(invoice.aiSnapshot, path);
  if (status === "KNOWN") {
    if (invoice.aiSnapshot && snapshotValue !== undefined && !sameValue(snapshotValue, value)) return "Manually corrected";
    return "Source evidence";
  }
  if (!invoice.aiSnapshot || snapshotValue === undefined) return undefined;
  return sameValue(snapshotValue, value) ? "Source evidence" : "Manually corrected";
}

function formatMoney(value: unknown, currency: string) {
  if (value === null || value === undefined || value === "") return "—";
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return String(value);
  try {
    return new Intl.NumberFormat("en-PH", { style: "currency", currency: currency || "PHP", maximumFractionDigits: 2 }).format(numericValue);
  } catch {
    return `${currency || "PHP"} ${numericValue.toFixed(2)}`;
  }
}

function formatCellValue(value: unknown, kind: WorksheetColumn<InvoiceData>["kind"], currency?: string, options?: readonly { value: string; label: string }[]) {
  if (value === null || value === undefined || value === "") return "—";
  if (kind === "currency") return formatMoney(value, currency || "PHP");
  return options?.find((option) => option.value === String(value))?.label || String(value);
}

function provenanceBadge(label: ProvenanceLabel | undefined) {
  if (!label) return null;
  const tone = label === "Calculated"
    ? "bg-slate-200 text-slate-700"
    : label === "Manually corrected"
      ? "bg-indigo-100 text-indigo-800"
      : label === "Unresolved"
        ? "bg-amber-100 text-amber-900"
        : "bg-emerald-100 text-emerald-800";
  const visible = label === "Manually corrected" || label === "Unresolved";
  return <span data-provenance={label} className={visible ? `ml-2 inline-flex rounded-full px-1.5 py-0.5 text-[9px] font-black ${tone}` : "sr-only"}>{label}</span>;
}

function invoiceCellRenderer(
  path: string,
  kind: WorksheetColumn<InvoiceData>["kind"],
  options?: readonly { value: string; label: string }[],
) {
  return (value: unknown, row: InvoiceData) => <span className="inline-flex min-w-0 flex-wrap items-center gap-y-1">
    <span>{formatCellValue(value, kind, row.currency, options)}</span>
    {provenanceBadge(provenanceFor(row, path, value))}
  </span>;
}

function lineCellRenderer(
  field: string,
  kind: WorksheetColumn<LineItem>["kind"],
  invoice: InvoiceData,
  options?: readonly { value: string; label: string }[],
) {
  return (value: unknown, row: LineItem) => {
    const sourceIndex = supplierInvoiceLineSourceIndex(invoice, row);
    const provenance = sourceIndex === undefined ? undefined : provenanceFor(invoice, `items.${sourceIndex}.${field}`, value);
    return <span className="inline-flex min-w-0 flex-wrap items-center gap-y-1">
      <span>{formatCellValue(value, kind, invoice.currency, options)}</span>
      {provenanceBadge(provenance)}
    </span>;
  };
}

function normalizeValue(kind: WorksheetColumn<InvoiceData>["kind"], value: unknown) {
  if (kind === "number" || kind === "currency") return value === "" || value === undefined ? null : Number(value);
  return value === undefined || value === null ? "" : value;
}

function invoiceColumn({
  key,
  path = key,
  header,
  kind = "text",
  readOnly,
  minWidth,
  align,
  frozen = false,
  options,
  parse,
  validate,
  protectedWhen,
  setValue,
}: {
  key: string;
  path?: string;
  header: string;
  kind?: WorksheetColumn<InvoiceData>["kind"];
  readOnly: boolean;
  minWidth: string;
  align?: WorksheetColumn<InvoiceData>["align"];
  frozen?: boolean;
  options?: readonly { value: string; label: string }[];
  parse?: WorksheetColumn<InvoiceData>["parse"];
  validate?: WorksheetColumn<InvoiceData>["validate"];
  protectedWhen?: (row: InvoiceData) => boolean;
  setValue?: (row: InvoiceData, value: unknown) => InvoiceData;
}): WorksheetColumn<InvoiceData> {
  const protectedCell = (row: InvoiceData) => readOnly || Boolean(protectedWhen?.(row));
  return {
    key,
    header,
    kind,
    minWidth,
    align,
    frozen,
    options,
    value: (row) => valueAt(row, path),
    setValue: setValue || ((row, value) => setPath(row, path, normalizeValue(kind, value))),
    editable: (row) => !protectedCell(row),
    protected: protectedCell,
    parse,
    validate,
    render: invoiceCellRenderer(path, kind, options),
  };
}

function lineColumn({
  key,
  header,
  kind = "text",
  readOnly,
  invoice,
  minWidth,
  align,
  frozen = false,
  options,
}: {
  key: keyof LineItem & string;
  header: string;
  kind?: WorksheetColumn<LineItem>["kind"];
  readOnly: boolean;
  invoice: InvoiceData;
  minWidth: string;
  align?: WorksheetColumn<LineItem>["align"];
  frozen?: boolean;
  options?: readonly { value: string; label: string }[];
}): WorksheetColumn<LineItem> {
  const calculated = (row: LineItem) => {
    const sourceIndex = supplierInvoiceLineSourceIndex(invoice, row);
    return sourceIndex !== undefined && invoice.financialFieldStatus?.[`items.${sourceIndex}.${key}`] === "CALCULATED";
  };
  const protectedCell = (row: LineItem) => readOnly || calculated(row);
  return {
    key,
    header,
    kind,
    minWidth,
    align,
    frozen,
    options,
    value: (row) => row[key],
    setValue: (row, value) => ({ ...row, [key]: normalizeValue(kind, value) }),
    editable: (row) => !protectedCell(row),
    protected: protectedCell,
    render: lineCellRenderer(key, kind, invoice, options),
  };
}

function dirtyCellsForRows<T>(currentRows: readonly T[], originalRows: readonly T[], columns: readonly WorksheetColumn<T>[], rowKey: (row: T, rowIndex: number) => string) {
  const dirty = new Set<string>();
  const originalByKey = new Map(originalRows.map((row, index) => [rowKey(row, index), row]));
  for (const [rowIndex, row] of currentRows.entries()) {
    const original = originalByKey.get(rowKey(row, rowIndex));
    for (const column of columns) {
      if (!original || !sameValue(getWorksheetColumnValue(row, column), getWorksheetColumnValue(original, column))) {
        dirty.add(getWorksheetCellId(rowKey(row, rowIndex), column.key));
      }
    }
  }
  for (const [rowIndex, row] of originalRows.entries()) {
    if (!currentRows.some((candidate, candidateIndex) => rowKey(candidate, candidateIndex) === rowKey(row, rowIndex))) {
      dirty.add(getWorksheetCellId(rowKey(row, rowIndex), "row"));
    }
  }
  return dirty;
}

function newLineItem(invoiceId: string): LineItem {
  lineSequence += 1;
  return {
    id: `line-${invoiceId}-${Date.now()}-${lineSequence}`,
    description: "",
    quantity: null,
    unitPrice: null,
    total: null,
  };
}

export function supplierInvoiceLineSourceIndex(invoice: InvoiceData, row: LineItem): number | undefined {
  const originalIndex = Array.isArray(invoice.items) ? invoice.items.findIndex((candidate) => candidate.id === row.id) : -1;
  return originalIndex >= 0 ? originalIndex : undefined;
}

function normalizedInvoice(invoice: InvoiceData): InvoiceData {
  return Array.isArray(invoice.items) ? invoice : { ...invoice, items: [] };
}

function WorksheetSection({ testId, title, children }: { testId: string; title: string; children: React.ReactNode }) {
  return <section data-testid={testId} className="min-w-0 space-y-2">
    <h3 className="text-xs font-black uppercase tracking-[0.14em] text-slate-700">{title}</h3>
    {children}
  </section>;
}

export function SupplierInvoiceWorksheet({ invoice, readOnly = false, onUpdateInvoice }: SupplierInvoiceWorksheetProps) {
  const [draftInvoice, setDraftInvoice] = useState(() => normalizedInvoice(invoice));
  const draftInvoiceRef = useRef(draftInvoice);
  const worksheetRootRef = useRef<HTMLElement | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    const nextInvoice = normalizedInvoice(invoice);
    setDraftInvoice(nextInvoice);
    draftInvoiceRef.current = nextInvoice;
  }, [invoice]);

  const updateDraftInvoice = (next: InvoiceData) => {
    draftInvoiceRef.current = next;
    setDraftInvoice(next);
  };

  const headerColumns = useMemo<readonly WorksheetColumn<InvoiceData>[]>(() => [
    invoiceColumn({ key: "invoiceNumber", header: "Invoice Number", readOnly, minWidth: "12rem", frozen: true }),
    invoiceColumn({ key: "invoiceDate", header: "Invoice Date", kind: "date", readOnly, minWidth: "10rem" }),
    invoiceColumn({ key: "dueDate", header: "Due Date", kind: "date", readOnly, minWidth: "10rem" }),
    invoiceColumn({ key: "currency", header: "Currency", readOnly, minWidth: "8rem", parse: (raw) => raw.trim().toUpperCase(), validate: (value) => /^[A-Z]{3}$/.test(textValue(value).trim()) ? undefined : "Use a three-letter invoice currency." }),
    invoiceColumn({ key: "purchaseOrderNumber", header: "Purchase Order Number", readOnly, minWidth: "13rem" }),
    invoiceColumn({ key: "projectReference", header: "Project / Reference", readOnly, minWidth: "14rem" }),
    invoiceColumn({ key: "category", header: "Expense Category", readOnly, minWidth: "13rem" }),
    invoiceColumn({ key: "description", header: "Expense Description", readOnly, minWidth: "18rem" }),
    invoiceColumn({ key: "notes", header: "Notes / Terms", readOnly, minWidth: "20rem" }),
  ], [readOnly]);

  const vendorColumns = useMemo<readonly WorksheetColumn<InvoiceData>[]>(() => [
    invoiceColumn({ key: "vendor.name", path: "vendor.name", header: "Supplier Name", readOnly, minWidth: "16rem", frozen: true }),
    invoiceColumn({ key: "vendor.registeredName", path: "vendor.registeredName", header: "Registered Name", readOnly, minWidth: "18rem" }),
    invoiceColumn({ key: "vendor.tradeName", path: "vendor.tradeName", header: "Trade Name", readOnly, minWidth: "16rem" }),
    invoiceColumn({ key: "vendor.taxId", path: "vendor.taxId", header: "TIN", readOnly, minWidth: "12rem" }),
    invoiceColumn({ key: "vendor.address", path: "vendor.address", header: "Address", readOnly, minWidth: "22rem" }),
    invoiceColumn({ key: "vendor.email", path: "vendor.email", header: "Email", readOnly, minWidth: "18rem" }),
    invoiceColumn({ key: "vendor.phone", path: "vendor.phone", header: "Phone", readOnly, minWidth: "14rem" }),
  ], [readOnly]);

  const lineColumns = useMemo<readonly WorksheetColumn<LineItem>[]>(() => [
    lineColumn({ key: "itemNumber", header: "Item / Line Number", kind: "number", readOnly, invoice, minWidth: "9rem", frozen: true }),
    lineColumn({ key: "sku", header: "SKU", readOnly, invoice, minWidth: "11rem" }),
    lineColumn({ key: "description", header: "Description", readOnly, invoice, minWidth: "20rem" }),
    lineColumn({ key: "quantity", header: "Quantity", kind: "number", readOnly, invoice, minWidth: "9rem", align: "right" }),
    lineColumn({ key: "unitOfMeasure", header: "Unit", readOnly, invoice, minWidth: "9rem" }),
    lineColumn({ key: "unitPrice", header: "Unit Price", kind: "currency", readOnly, invoice, minWidth: "12rem", align: "right" }),
    lineColumn({ key: "discount", header: "Discount", kind: "currency", readOnly, invoice, minWidth: "11rem", align: "right" }),
    lineColumn({ key: "taxRate", header: "Tax Rate", kind: "number", readOnly, invoice, minWidth: "10rem", align: "right" }),
    lineColumn({ key: "taxAmount", header: "Tax Amount", kind: "currency", readOnly, invoice, minWidth: "12rem", align: "right" }),
    lineColumn({ key: "taxTreatment", header: "Tax Treatment", kind: "select", options: TAX_TREATMENT_OPTIONS, readOnly, invoice, minWidth: "12rem" }),
    lineColumn({ key: "total", header: "Line Amount", kind: "currency", readOnly, invoice, minWidth: "13rem", align: "right" }),
  ], [invoice, readOnly]);

  const totalColumns = useMemo<readonly WorksheetColumn<InvoiceData>[]>(() => [
    ...([
      ["subtotal", "Subtotal"],
      ["totalDiscount", "Invoice Discount"],
      ["totalTax", "Tax / VAT"],
      ["shippingFee", "Shipping"],
      ["otherFees", "Other Fees"],
      ["grandTotal", "Gross Total"],
      ["amountPaid", "Source Amount Paid"],
      ["amountDue", "Source Amount Due"],
      ["balanceDue", "Balance Due"],
      ["withholdingTaxAmount", "Withholding Tax"],
      ["netAmountPayable", "Net Payable"],
    ] as const).map(([key, header]) => invoiceColumn({
      key,
      header,
      kind: "currency",
      readOnly,
      minWidth: "13rem",
      align: "right",
      protectedWhen: (row) => row.financialFieldStatus?.[key] === "CALCULATED",
    })),
    invoiceColumn({ key: "unitPriceBasis", path: "financialSemantics.unitPriceBasis", header: "Unit Price Basis", kind: "select", options: BASIS_OPTIONS, readOnly, minWidth: "14rem" }),
    invoiceColumn({ key: "lineTotalBasis", path: "financialSemantics.lineTotalBasis", header: "Line Amount Basis", kind: "select", options: BASIS_OPTIONS, readOnly, minWidth: "14rem" }),
    invoiceColumn({ key: "subtotalBasis", path: "financialSemantics.subtotalBasis", header: "Subtotal Basis", kind: "select", options: BASIS_OPTIONS, readOnly, minWidth: "14rem" }),
    invoiceColumn({ key: "taxInclusion", path: "financialSemantics.taxInclusion", header: "Tax Treatment Evidence", kind: "select", options: TAX_INCLUSION_OPTIONS, readOnly, minWidth: "16rem" }),
    invoiceColumn({
      key: "discountIncludedInSubtotal",
      path: "financialSemantics.discountIncludedInSubtotal",
      header: "Discount Treatment",
      kind: "select",
      options: [
        { value: "UNKNOWN", label: "Unknown / ambiguous" },
        { value: "SEPARATE", label: "Separate from subtotal" },
        { value: "INCLUDED", label: "Included in subtotal" },
      ],
      readOnly,
      minWidth: "16rem",
      setValue: (row, value) => setPath(row, "financialSemantics.discountIncludedInSubtotal", value === "UNKNOWN" ? null : value === "INCLUDED"),
    }),
    invoiceColumn({ key: "payableBasis", path: "financialSemantics.payableBasis", header: "Payable Basis", kind: "select", options: PAYABLE_BASIS_OPTIONS, readOnly, minWidth: "16rem" }),
    invoiceColumn({ key: "determination", path: "financialSemantics.determination", header: "Basis Determination", kind: "select", options: DETERMINATION_OPTIONS, readOnly, minWidth: "16rem" }),
  ], [readOnly]);

  const draftItems = Array.isArray(draftInvoice.items) ? draftInvoice.items : [];
  const originalItems = Array.isArray(invoice.items) ? invoice.items : [];
  const headerDirtyCells = useMemo(() => dirtyCellsForRows([draftInvoice], [invoice], headerColumns, (row) => row.id), [draftInvoice, headerColumns, invoice]);
  const vendorDirtyCells = useMemo(() => dirtyCellsForRows([draftInvoice], [invoice], vendorColumns, (row) => row.id), [draftInvoice, invoice, vendorColumns]);
  const lineDirtyCells = useMemo(() => dirtyCellsForRows(draftItems, originalItems, lineColumns, (row) => row.id), [draftItems, lineColumns, originalItems]);
  const totalDirtyCells = useMemo(() => dirtyCellsForRows([draftInvoice], [invoice], totalColumns, (row) => row.id), [draftInvoice, invoice, totalColumns]);

  const handleHeaderRowsChange = (rows: readonly InvoiceData[]) => { if (rows[0]) updateDraftInvoice(rows[0]); };
  const handleVendorRowsChange = (rows: readonly InvoiceData[]) => { if (rows[0]) updateDraftInvoice(rows[0]); };
  const handleLineRowsChange = (rows: readonly LineItem[]) => updateDraftInvoice({ ...draftInvoiceRef.current, items: [...rows] });
  const handleTotalRowsChange = (rows: readonly InvoiceData[]) => { if (rows[0]) updateDraftInvoice(rows[0]); };

  const handleSave = () => {
    if (readOnly || !onUpdateInvoice) return;
    const activeElement = typeof document !== "undefined" ? document.activeElement : null;
    if (typeof HTMLElement !== "undefined" && activeElement instanceof HTMLElement && worksheetRootRef.current?.contains(activeElement) && activeElement.matches("input, select")) {
      activeElement.blur();
    }
    const finish = () => {
      if (worksheetRootRef.current?.querySelector('[data-worksheet-state="error"]')) {
        setSaveError("Resolve the highlighted worksheet validation errors before saving.");
        return;
      }
      setSaveError(null);
      onUpdateInvoice(draftInvoiceRef.current);
    };
    if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") window.requestAnimationFrame(finish);
    else finish();
  };

  const handleCancel = () => {
    setSaveError(null);
    updateDraftInvoice(normalizedInvoice(invoice));
  };

  const handleAddLine = () => {
    if (readOnly) return;
    updateDraftInvoice({ ...draftInvoiceRef.current, items: [...(draftInvoiceRef.current.items || []), newLineItem(invoice.id)] });
  };

  return <section ref={worksheetRootRef} data-testid="supplier-invoice-extracted-worksheet" data-worksheet-responsive-surface="supplier-invoice" aria-label="Supplier invoice extracted worksheet" className="min-w-0 space-y-3">
    <div data-testid="supplier-invoice-worksheet-action-bar" className="flex min-w-0 flex-col gap-2 border-b border-slate-200 pb-2 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <h2 className="text-sm font-black text-slate-950">Extracted invoice data</h2>
        <p className="sr-only">Only permitted fields are editable. The original source is preserved.</p>
      </div>
      <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
        {!readOnly && <button type="button" data-worksheet-add-row="true" onClick={handleAddLine} className="inline-flex min-h-9 items-center rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50">Add line</button>}
        {!readOnly && onUpdateInvoice && <>
          <button type="button" onClick={handleCancel} className="inline-flex min-h-9 items-center rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50">Discard all worksheet edits</button>
          <button type="button" onClick={handleSave} className="inline-flex min-h-9 items-center rounded-lg border border-indigo-200 bg-white px-2.5 py-1.5 text-xs font-black text-indigo-700 hover:bg-indigo-50">Save worksheet edits</button>
        </>}
      </div>
    </div>
    {saveError && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[10px] font-bold text-rose-800">{saveError}</p>}
    <WorksheetSection testId="supplier-invoice-header-worksheet" title="Invoice Header">
      <WorksheetEditor
        ariaLabel="Supplier invoice header worksheet"
        rows={[draftInvoice]}
        columns={headerColumns}
        rowKey={(row) => row.id}
        onRowsChange={handleHeaderRowsChange}
        dirtyCells={headerDirtyCells}
        showActionBar={false}
        disabled={readOnly}
        density="comfortable"
      />
    </WorksheetSection>

    <WorksheetSection testId="supplier-invoice-vendor-worksheet" title="Vendor Evidence">
      <WorksheetEditor
        ariaLabel="Supplier invoice vendor evidence worksheet"
        rows={[draftInvoice]}
        columns={vendorColumns}
        rowKey={(row) => row.id}
        onRowsChange={handleVendorRowsChange}
        dirtyCells={vendorDirtyCells}
        showActionBar={false}
        disabled={readOnly}
        density="comfortable"
      />
      <details data-testid="supplier-invoice-canonical-vendor-boundary" className="rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2 text-[10px] leading-4 text-slate-600">
        <summary className="cursor-pointer font-bold text-slate-700">Vendor identity controls</summary>
        <p className="mt-2">Canonical Vendor ID and master-data ownership are protected from ordinary worksheet editing. Confirm a deliberate link or create action in the controlled Vendor workflow below.</p>
      </details>
    </WorksheetSection>

    <WorksheetSection testId="supplier-invoice-line-items-worksheet" title="Line Items">
      <WorksheetEditor
        ariaLabel="Supplier invoice line items worksheet"
        rows={draftItems}
        columns={lineColumns}
        rowKey={(row) => row.id}
        onRowsChange={handleLineRowsChange}
        dirtyCells={lineDirtyCells}
        onRemoveRow={readOnly ? undefined : () => undefined}
        canRemoveRow={!readOnly}
        showActionBar={false}
        disabled={readOnly}
        emptyState="No line items extracted. Add a row only when the source supports it."
        density="compact"
      />
    </WorksheetSection>

    <WorksheetSection testId="supplier-invoice-totals-worksheet" title="Totals / Monetary Facts">
      <WorksheetEditor
        ariaLabel="Supplier invoice totals and monetary facts worksheet"
        rows={[draftInvoice]}
        columns={totalColumns}
        rowKey={(row) => row.id}
        onRowsChange={handleTotalRowsChange}
        dirtyCells={totalDirtyCells}
        showActionBar={false}
        disabled={readOnly}
        density="compact"
      />
    </WorksheetSection>

    <details data-testid="supplier-invoice-worksheet-help" className="rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2 text-[10px] leading-4 text-slate-600">
      <summary className="cursor-pointer font-bold text-slate-700">Worksheet help</summary>
      <div className="mt-2 space-y-2">
        <p>One draft spans all sections. Save permitted fields together; discard resets the draft. Calculated values remain protected, and Vendor linking stays separate.</p>
        <div className="flex flex-wrap gap-1.5" aria-label="Worksheet state legend">
          <span className="rounded-full bg-indigo-100 px-2 py-0.5 font-bold text-indigo-800">Manually corrected</span>
          <span className="rounded-full bg-amber-100 px-2 py-0.5 font-bold text-amber-900">Unresolved</span>
          <span className="rounded-full bg-slate-200 px-2 py-0.5 font-bold text-slate-700">Calculated / protected</span>
          <span className="px-1 text-slate-500">Source evidence is the normal state.</span>
        </div>
      </div>
    </details>
  </section>;
}

export default SupplierInvoiceWorksheet;
