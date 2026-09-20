import React, { useMemo, useRef, useState } from "react";
import type {
  Expense,
  FinancialFxSnapshot,
  InvoiceData,
  Project,
  ProjectCostCode,
  PurchaseOrder,
  Vendor,
} from "../../types.ts";
import { createLocalExpense } from "../../lib/expenses.ts";
import { formatCostCodeOptionLabel, getSelectableCostCodes } from "../../lib/projectCostCodes.ts";
import { displayFinancialAmountInPhp } from "../../utils/financialCurrency.ts";
import { WorksheetEditor, type WorksheetColumn } from "../ui/WorksheetEditor.tsx";

export const EXPENSE_PAYMENT_METHODS = [
  "Cash",
  "GCash",
  "Maya",
  "Credit Card",
  "Debit Card",
  "Bank Transfer",
  "Check",
  "Petty Cash / Reimbursement",
] as const;

export interface ExpenseDraftWorksheetRow {
  worksheetId: string;
  expenseDate: string;
  projectId: string;
  projectCostCodeId: string;
  category: string;
  description: string;
  payee: string;
  amount: number;
  currency: string;
  paymentMethod: string;
  referenceNumber: string;
  notes: string;
  expenseIdentity: string;
  status: string;
  sourceDocument: string;
  supplierInvoice: string;
  vendor: string;
  purchaseOrder: string;
  settlementState: string;
  phpBaseCurrency: string;
  fxProvenance: string;
  archivedState: string;
  voidState: string;
  createdAt: string;
  updatedAt: string;
}

export interface ExpenseDraftValues {
  expenseDate?: string;
  projectId?: string;
  projectCostCodeId?: string;
  category?: string;
  description?: string;
  payee?: string;
  amount?: number | string | null;
  currency?: string;
  paymentMethod?: string;
  referenceNumber?: string;
  notes?: string;
}

export interface ExpenseDraftWorksheetProps {
  projects: readonly Project[];
  costCodes?: readonly ProjectCostCode[];
  expense?: Expense;
  invoice?: InvoiceData;
  purchaseOrder?: PurchaseOrder;
  vendor?: Vendor;
  financialFxSnapshots?: readonly FinancialFxSnapshot[];
  baseCurrency?: string;
  settlementState?: string;
  initialProjectId?: string;
  isSaving?: boolean;
  errorMessage?: string | null;
  onSave: (expense: Expense) => Promise<void> | void;
  onCancel: () => void;
}

function textValue(value: unknown): string {
  return String(value ?? "");
}

function optionalText(value: unknown): string | undefined {
  const normalized = textValue(value).trim();
  return normalized || undefined;
}

function uniqueOptions(values: readonly string[]) {
  return [...new Set(values.filter(Boolean))].map((value) => ({ value, label: value }));
}

function newExpenseDraft(initialProjectId?: string): Expense {
  return createLocalExpense({
    projectId: initialProjectId,
    expenseDate: new Date().toISOString().slice(0, 10),
    category: "Miscellaneous",
    description: "",
    payee: "",
    amount: 0,
    currency: "PHP",
    paymentMethod: "",
    referenceNumber: "",
    status: "DRAFT",
    notes: "",
  });
}

export function isEditableExpenseDraft(expense?: Expense | null): boolean {
  return !expense || (expense.status === "DRAFT" && !expense.archivedAt && !expense.supplierInvoiceId);
}

function rowFromExpense(
  expense: Expense,
  context: Pick<ExpenseDraftWorksheetProps, "projects" | "costCodes" | "invoice" | "purchaseOrder" | "vendor" | "financialFxSnapshots" | "baseCurrency" | "settlementState">,
): ExpenseDraftWorksheetRow {
  const sourceDocument = expense.supplierInvoiceId
    ? "Supplier Invoice evidence"
    : expense.receiptSourceDocumentId
      ? `Source document ${expense.receiptSourceDocumentId}`
      : "Direct manual entry";
  const supplierInvoice = context.invoice?.invoiceNumber
    || (expense.supplierInvoiceId ? `Supplier Invoice ${expense.supplierInvoiceId}` : "None · direct expense");
  const vendor = context.vendor?.name
    || (expense.vendorId ? `Vendor ${expense.vendorId}` : "None · payee is manual text");
  const purchaseOrder = context.purchaseOrder?.poNumber
    || (expense.purchaseOrderId ? `Purchase Order ${expense.purchaseOrderId}` : "None");
  const php = displayFinancialAmountInPhp(
    expense.amount,
    expense.currency,
    "EXPENSE",
    expense.id,
    context.financialFxSnapshots,
  );
  const baseCurrency = (context.baseCurrency || "PHP").toUpperCase();

  return {
    worksheetId: expense.id,
    expenseDate: expense.expenseDate,
    projectId: expense.projectId || "",
    projectCostCodeId: expense.projectCostCodeId || "",
    category: expense.category,
    description: expense.description,
    payee: expense.payee || "",
    amount: expense.amount,
    currency: expense.currency,
    paymentMethod: expense.paymentMethod || "",
    referenceNumber: expense.referenceNumber || "",
    notes: expense.notes || "",
    expenseIdentity: expense.id,
    status: expense.status,
    sourceDocument,
    supplierInvoice,
    vendor,
    purchaseOrder,
    settlementState: context.settlementState || "Controlled by Cash & Banking",
    phpBaseCurrency: `${php.baseLabel}${baseCurrency === "PHP" ? "" : ` · reporting ${baseCurrency}`}`,
    fxProvenance: php.requiresFx ? "FX rate required · confirm outside worksheet" : "Derived from current FX evidence",
    archivedState: expense.archivedAt ? "Archived · correction workflow" : "Not archived · correction workflow controls this state",
    voidState: expense.status === "VOID" ? "VOID · correction workflow" : "Void only through correction workflow",
    createdAt: expense.createdAt || "Assigned on save",
    updatedAt: expense.updatedAt || "Assigned on save",
  };
}

export function normalizeExpenseDraft(row: ExpenseDraftValues, authoritative: Expense): Expense {
  const description = textValue(row.description).trim();
  const currency = textValue(row.currency).trim().toUpperCase();
  const amount = Number(row.amount);
  const expenseDate = textValue(row.expenseDate).trim();
  if (!description) throw new Error("Enter an expense description before saving.");
  if (!expenseDate) throw new Error("Enter an expense date before saving.");
  if (!Number.isFinite(amount) || amount < 0) throw new Error("Enter a valid non-negative expense amount.");
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error("Enter a three-letter currency code such as PHP.");

  const projectId = optionalText(row.projectId);
  return {
    ...authoritative,
    expenseDate,
    projectId,
    projectCostCodeId: projectId ? optionalText(row.projectCostCodeId) : undefined,
    category: textValue(row.category).trim() || "Miscellaneous",
    description,
    payee: optionalText(row.payee),
    amount,
    currency,
    paymentMethod: optionalText(row.paymentMethod),
    referenceNumber: optionalText(row.referenceNumber),
    notes: optionalText(row.notes),
  };
}

function requiredField(label: string) {
  return (value: unknown) => textValue(value).trim() ? undefined : `${label} is required.`;
}

function nonNegativeAmount(value: unknown) {
  if (value === null || value === undefined || value === "") return "Amount is required.";
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 ? undefined : "Amount must be zero or greater.";
}

function currencyCode(value: unknown) {
  return /^[A-Z]{3}$/.test(textValue(value).trim().toUpperCase())
    ? undefined
    : "Currency must be a three-letter code such as PHP.";
}

function dateValue(value: unknown) {
  return textValue(value).trim() ? undefined : "Expense Date is required.";
}

export function ExpenseDraftWorksheet({
  projects,
  costCodes = [],
  expense,
  invoice,
  purchaseOrder,
  vendor,
  financialFxSnapshots = [],
  baseCurrency = "PHP",
  settlementState,
  initialProjectId,
  isSaving = false,
  errorMessage,
  onSave,
  onCancel,
}: ExpenseDraftWorksheetProps) {
  const [authoritativeExpense] = useState<Expense>(() => expense || newExpenseDraft(initialProjectId));
  const [rows, setRows] = useState<ExpenseDraftWorksheetRow[]>(() => [rowFromExpense(authoritativeExpense, { projects, costCodes, invoice, purchaseOrder, vendor, financialFxSnapshots, baseCurrency, settlementState })]);
  const rowRef = useRef(rows[0]);
  const worksheetRootRef = useRef<HTMLElement | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const editable = isEditableExpenseDraft(expense);

  const columns = useMemo<readonly WorksheetColumn<ExpenseDraftWorksheetRow>[]>(() => [
    {
      key: "expenseDate",
      header: "Expense Date",
      kind: "date",
      minWidth: "11rem",
      frozen: true,
      editable,
      protected: !editable,
      value: (row) => row.expenseDate,
      setValue: (row, value) => ({ ...row, expenseDate: textValue(value) }),
      validate: dateValue,
    },
    {
      key: "projectId",
      header: "Project",
      kind: "select",
      minWidth: "19rem",
      editable,
      protected: !editable,
      options: (row) => projects
        .filter((project) => project.status !== "ARCHIVED" || Boolean(expense && project.id === row.projectId))
        .map((project) => ({ value: project.id, label: `${project.projectCode} — ${project.projectName}${project.status === "ARCHIVED" ? " (archived)" : ""}` })),
      value: (row) => row.projectId,
      setValue: (row, value) => {
        const nextProjectId = optionalText(value) || "";
        const currentCode = costCodes.find((candidate) => candidate.id === row.projectCostCodeId);
        return {
          ...row,
          projectId: nextProjectId,
          projectCostCodeId: currentCode?.projectId === nextProjectId ? row.projectCostCodeId : "",
        };
      },
    },
    {
      key: "projectCostCodeId",
      header: "Cost Code",
      kind: "select",
      minWidth: "18rem",
      editable: (row) => editable && Boolean(row.projectId),
      protected: (row) => !editable || !row.projectId,
      options: (row) => getSelectableCostCodes(costCodes, row.projectId, row.projectCostCodeId)
        .map((costCode) => ({ value: costCode.id, label: formatCostCodeOptionLabel(costCode) })),
      value: (row) => row.projectCostCodeId,
      setValue: (row, value) => ({ ...row, projectCostCodeId: optionalText(value) || "" }),
      validate: (value, context) => {
        const selected = optionalText(value);
        if (!selected) return undefined;
        return getSelectableCostCodes(costCodes, context.row.projectId, context.row.projectCostCodeId).some((costCode) => costCode.id === selected)
          ? undefined
          : "Choose a cost code belonging to the selected project.";
      },
    },
    {
      key: "category",
      header: "Category",
      minWidth: "16rem",
      editable,
      protected: !editable,
      value: (row) => row.category,
      setValue: (row, value) => ({ ...row, category: textValue(value) }),
      render: (value) => <span title={textValue(value)}>{textValue(value)}</span>,
    },
    {
      key: "description",
      header: "Description",
      minWidth: "24rem",
      editable,
      protected: !editable,
      value: (row) => row.description,
      setValue: (row, value) => ({ ...row, description: textValue(value) }),
      validate: requiredField("Description"),
    },
    {
      key: "payee",
      header: "Payee",
      minWidth: "18rem",
      editable,
      protected: !editable,
      value: (row) => row.payee,
      setValue: (row, value) => ({ ...row, payee: textValue(value) }),
    },
    {
      key: "amount",
      header: "Amount",
      kind: "currency",
      align: "right",
      minWidth: "13rem",
      currency: (row) => row.currency || "PHP",
      editable,
      protected: !editable,
      value: (row) => row.amount,
      setValue: (row, value) => ({ ...row, amount: Number(value) }),
      validate: nonNegativeAmount,
    },
    {
      key: "currency",
      header: "Currency",
      minWidth: "9rem",
      editable,
      protected: !editable,
      value: (row) => row.currency,
      parse: (raw) => raw.trim().toUpperCase(),
      setValue: (row, value) => ({ ...row, currency: textValue(value).trim().toUpperCase() }),
      validate: currencyCode,
    },
    {
      key: "paymentMethod",
      header: "Payment Method",
      kind: "select",
      minWidth: "18rem",
      editable,
      protected: !editable,
      options: (row) => uniqueOptions([...EXPENSE_PAYMENT_METHODS, row.paymentMethod]),
      value: (row) => row.paymentMethod,
      setValue: (row, value) => ({ ...row, paymentMethod: textValue(value) }),
    },
    {
      key: "referenceNumber",
      header: "Reference",
      minWidth: "16rem",
      editable,
      protected: !editable,
      value: (row) => row.referenceNumber,
      setValue: (row, value) => ({ ...row, referenceNumber: textValue(value) }),
    },
    {
      key: "notes",
      header: "Notes",
      minWidth: "24rem",
      editable,
      protected: !editable,
      value: (row) => row.notes,
      setValue: (row, value) => ({ ...row, notes: textValue(value) }),
    },
    { key: "expenseIdentity", header: "Expense Identity", minWidth: "18rem", protected: true, editable: false, value: (row) => row.expenseIdentity },
    { key: "status", header: "Status", minWidth: "12rem", protected: true, editable: false, value: (row) => row.status },
    { key: "sourceDocument", header: "Source Document", minWidth: "22rem", protected: true, editable: false, value: (row) => row.sourceDocument },
    { key: "supplierInvoice", header: "Supplier Invoice", minWidth: "22rem", protected: true, editable: false, value: (row) => row.supplierInvoice },
    { key: "vendor", header: "Vendor", minWidth: "20rem", protected: true, editable: false, value: (row) => row.vendor },
    { key: "purchaseOrder", header: "Purchase Order", minWidth: "20rem", protected: true, editable: false, value: (row) => row.purchaseOrder },
    { key: "settlementState", header: "Settlement State", minWidth: "22rem", protected: true, editable: false, value: (row) => row.settlementState },
    { key: "phpBaseCurrency", header: "PHP / Base Currency", minWidth: "20rem", protected: true, editable: false, value: (row) => row.phpBaseCurrency },
    { key: "fxProvenance", header: "FX / Provenance", minWidth: "25rem", protected: true, editable: false, value: (row) => row.fxProvenance },
    { key: "archivedState", header: "Archived", minWidth: "24rem", protected: true, editable: false, value: (row) => row.archivedState },
    { key: "voidState", header: "Void", minWidth: "24rem", protected: true, editable: false, value: (row) => row.voidState },
    { key: "createdAt", header: "Created", minWidth: "22rem", protected: true, editable: false, value: (row) => row.createdAt },
    { key: "updatedAt", header: "Updated", minWidth: "22rem", protected: true, editable: false, value: (row) => row.updatedAt },
  ], [costCodes, editable, projects]);

  const handleRowsChange = (nextRows: readonly ExpenseDraftWorksheetRow[]) => {
    const next = nextRows[0];
    if (!next) return;
    rowRef.current = next;
    setRows([next]);
  };

  const handleSave = async (nextRows: readonly ExpenseDraftWorksheetRow[]) => {
    if (!editable) return;
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

    const current = nextRows[0] || rowRef.current;
    if (!current) return;
    const projectId = optionalText(current.projectId);
    const costCodeId = optionalText(current.projectCostCodeId);
    if (costCodeId && !projectId) {
      setLocalError("Choose a project before assigning a cost code.");
      return;
    }
    if (projectId) {
      const selectedProject = projects.find((candidate) => candidate.id === projectId);
      if (!selectedProject || (selectedProject.status === "ARCHIVED" && (!expense || selectedProject.id !== authoritativeExpense.projectId))) {
        setLocalError("Choose an active project before saving the expense.");
        return;
      }
      if (costCodeId && !getSelectableCostCodes(costCodes, projectId, authoritativeExpense.projectCostCodeId).some((costCode) => costCode.id === costCodeId)) {
        setLocalError("Choose a cost code belonging to the selected project.");
        return;
      }
    }

    try {
      const normalized = normalizeExpenseDraft(current, authoritativeExpense);
      setLocalError(null);
      await onSave(normalized);
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <section ref={worksheetRootRef} data-testid="expense-draft-worksheet" data-worksheet-responsive-surface="expense-draft" aria-labelledby="expense-draft-worksheet-title" className="min-w-0 space-y-4">
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-indigo-600">Direct Expense draft</p>
          <h2 id="expense-draft-worksheet-title" className="mt-1 text-xl font-black text-slate-950">{expense ? `Edit Expense Draft · ${expense.description || expense.id}` : "Create Expense Draft"}</h2>
          <p className="mt-1 max-w-4xl text-xs leading-5 text-slate-500">Enter ordinary direct Expense fields in one contained worksheet. The existing parent save path keeps company scope, references, history, and the authoritative updated-at concurrency token.</p>
        </div>
      </div>

      <div className="rounded-xl border border-indigo-100 bg-indigo-50/60 px-3 py-2.5 text-[10px] leading-4 text-indigo-950">
        <p className="font-black uppercase tracking-[0.12em]">Draft worksheet boundary</p>
        <p className="mt-1">Approval, payment, settlement, reconciliation, correction, archive, and void actions remain outside this worksheet. Supplier Invoice evidence remains protected and is never rewritten as ordinary direct Expense input.</p>
      </div>

      <div data-worksheet-scroll-container="expense-draft" className="min-w-0">
        <WorksheetEditor
          ariaLabel="Expense draft worksheet"
          rows={rows}
          columns={columns}
          rowKey={(row) => row.worksheetId}
          onRowsChange={handleRowsChange}
          onSave={editable ? handleSave : undefined}
          onCancel={onCancel}
          disabled={isSaving}
          isSaving={isSaving}
          saveLabel="Save expense draft"
          cancelLabel="Cancel"
          className="min-w-0"
          density="comfortable"
        />
      </div>

      {(errorMessage || localError) && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-800">{localError || errorMessage}</div>}
    </section>
  );
}

export default ExpenseDraftWorksheet;
