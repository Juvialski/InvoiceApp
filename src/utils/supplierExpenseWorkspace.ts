import type { Expense, FinancialFxSnapshot, InvoiceData, InvoiceProjectAllocation, Project } from "../types.ts";
import { DEFAULT_COMPANY_DOCUMENT_PROFILE, supplierInvoiceBuyerMismatch, type CompanyDocumentProfile } from "../lib/companyDocumentProfile.ts";
import { hasFinancialFxSnapshot, normalizeFinancialCurrency } from "./financialCurrency.ts";
import { validateInvoiceProjectAllocationSet } from "./projectAllocations.ts";
import { supplierInvoiceAllocationSummaries } from "./supplierInvoiceCostOwnership.ts";

export type SupplierDocumentState = "NEEDS_REVIEW" | "READY_TO_LINK" | "LINKED";

export type SupplierInvoiceReadinessIssueCode =
  | "VOID_SOURCE"
  | "CANONICAL_VENDOR"
  | "INVOICE_NUMBER"
  | "INVOICE_DATE"
  | "CURRENCY"
  | "POSITIVE_TOTAL"
  | "EXPENSE_CATEGORY"
  | "EXPENSE_DESCRIPTION"
  | "BUYER_MISMATCH"
  | "BUYER_PROFILE_UNAVAILABLE"
  | "PROJECT_ALLOCATION";

export interface SupplierInvoiceReadinessIssue {
  code: SupplierInvoiceReadinessIssueCode;
  field: string;
  message: string;
}

export interface SupplierInvoiceExpenseReadiness {
  /** All authoritative facts required by the guarded Expense RPC are known. */
  complete: boolean;
  /** The invoice is complete and already VERIFIED, so linking is actionable. */
  readyToLink: boolean;
  issues: SupplierInvoiceReadinessIssue[];
  blockingReasons: string[];
}

export interface SupplierDocumentWorkspaceRow {
  invoice: InvoiceData;
  state: SupplierDocumentState;
  linkedExpense?: Expense;
  allocationSummaries: ReturnType<typeof supplierInvoiceAllocationSummaries>;
  allocationLabel: string;
  readiness: SupplierInvoiceExpenseReadiness;
}

function text(value: unknown) {
  return String(value ?? "").trim();
}

function validDate(value: unknown) {
  const normalized = text(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return false;
  const parsed = new Date(`${normalized}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === normalized;
}

function canonicalVendorId(invoice: Pick<InvoiceData, "vendor" | "entityResolution">) {
  const persistedId = text(invoice.vendor?.vendorId);
  if (persistedId) return persistedId;
  return invoice.entityResolution?.proposedAction === "LINK_EXISTING"
    ? text(invoice.entityResolution.matchedEntityId)
    : "";
}

function invoiceAllocations(invoice: InvoiceData, allocations?: readonly InvoiceProjectAllocation[]) {
  if (allocations !== undefined) return allocations.filter((allocation) => allocation.invoiceId === invoice.id);
  return (invoice as InvoiceData & { allocations?: readonly InvoiceProjectAllocation[] }).allocations;
}

/**
 * Mirrors the input facts checked by verify_supplier_invoice_and_create_expense.
 * This is presentation/readiness logic only; the database RPC remains the
 * authoritative permission, lock, provenance, and idempotency boundary.
 */
export function getSupplierInvoiceExpenseReadiness(
  invoice: InvoiceData,
  options: {
    allocations?: readonly InvoiceProjectAllocation[];
    projects?: readonly Project[];
    /** null means the deployment buyer profile is not available yet. */
    buyerProfile?: CompanyDocumentProfile | null;
  } = {},
): SupplierInvoiceExpenseReadiness {
  const issues: SupplierInvoiceReadinessIssue[] = [];
  const add = (code: SupplierInvoiceReadinessIssueCode, field: string, message: string) => issues.push({ code, field, message });
  const vendorId = canonicalVendorId(invoice);

  if (invoice.lifecycleStatus === "VOID") add("VOID_SOURCE", "lifecycleStatus", "Voided supplier invoices cannot create an Expense.");
  if (!vendorId) add("CANONICAL_VENDOR", "vendor", "Select or create a canonical Vendor before linking the Expense.");
  if (!text(invoice.invoiceNumber)) add("INVOICE_NUMBER", "invoiceNumber", "Confirm the invoice number before linking the Expense.");
  if (!validDate(invoice.invoiceDate)) add("INVOICE_DATE", "invoiceDate", "Confirm the invoice date before linking the Expense.");
  if (!/^[A-Za-z]{3}$/.test(text(invoice.currency))) add("CURRENCY", "currency", "Confirm an explicit three-letter invoice currency before linking the Expense.");

  const total = Number(invoice.grandTotal);
  if (!Number.isFinite(total) || total <= 0) add("POSITIVE_TOTAL", "grandTotal", "Confirm a positive, known invoice total before linking the Expense.");
  if (!text(invoice.category)) add("EXPENSE_CATEGORY", "category", "Confirm the Expense category before linking the Expense.");
  if (!text(invoice.description)) add("EXPENSE_DESCRIPTION", "description", "Confirm the Expense description before linking the Expense.");

  const buyerProfile = options.buyerProfile === undefined ? DEFAULT_COMPANY_DOCUMENT_PROFILE : options.buyerProfile;
  const buyerEvidence = [invoice.customer?.name, invoice.customer?.registeredName, invoice.customer?.companyName, invoice.customer?.taxId].some((value) => text(value));
  if (buyerEvidence && buyerProfile === null) {
    add("BUYER_PROFILE_UNAVAILABLE", "customer", "Confirm the buyer against this deployment company before linking the Expense.");
  } else if (buyerProfile && supplierInvoiceBuyerMismatch(invoice, buyerProfile)) {
    add("BUYER_MISMATCH", "customer", "Resolve the supplier invoice buyer mismatch before linking the Expense.");
  }

  const scopedAllocations = invoiceAllocations(invoice, options.allocations);
  if (scopedAllocations !== undefined && scopedAllocations.length > 0) {
    const allocationValidation = validateInvoiceProjectAllocationSet(Number.isFinite(total) ? total : 0, [...scopedAllocations]);
    const referencesUnavailableProject = options.projects !== undefined && scopedAllocations.some((allocation) => {
      const project = options.projects?.find((candidate) => candidate.id === allocation.projectId);
      return !project || project.status === "ARCHIVED";
    });
    if (!allocationValidation.valid || referencesUnavailableProject) {
      add("PROJECT_ALLOCATION", "projectAllocations", "Confirm the canonical project allocation before linking the Expense.");
    }
  }

  const complete = issues.length === 0;
  const blockingReasons = issues.map((issue) => issue.message);
  if (invoice.reviewStatus !== "VERIFIED") blockingReasons.push("Verify the supplier invoice before creating the authoritative Expense.");
  return { complete, readyToLink: complete && invoice.reviewStatus === "VERIFIED", issues, blockingReasons };
}

/**
 * Classifies preserved supplier documents without creating or inferring any
 * financial rows. A non-void Expense relationship is the authoritative link.
 */
export function classifySupplierDocuments(
  invoices: readonly InvoiceData[],
  expenses: readonly Expense[],
  projectAllocations?: readonly InvoiceProjectAllocation[],
  projects: readonly Project[] = [],
  buyerProfile?: CompanyDocumentProfile | null,
): SupplierDocumentWorkspaceRow[] {
  const linkedByInvoice = new Map<string, Expense>();
  for (const expense of expenses) {
    if (!expense.supplierInvoiceId || expense.status === "VOID") continue;
    if (!linkedByInvoice.has(expense.supplierInvoiceId)) linkedByInvoice.set(expense.supplierInvoiceId, expense);
  }

  return invoices
    .filter((invoice) => invoice.lifecycleStatus !== "VOID" && !invoice.archivedAt)
    .map((invoice) => {
      const linkedExpense = linkedByInvoice.get(invoice.id);
      const allocationSummaries = supplierInvoiceAllocationSummaries(
        invoice,
        projectAllocations !== undefined ? projectAllocations : (invoice as InvoiceData & { allocations?: InvoiceProjectAllocation[] }).allocations || [],
        projects,
      );
      const allocationLabel = allocationSummaries.length === 0
        ? "Project not allocated"
        : allocationSummaries.length === 1
          ? allocationSummaries[0]?.projectCode && allocationSummaries[0]?.projectName
            ? `${allocationSummaries[0].projectCode} · ${allocationSummaries[0].projectName}`
            : "Allocated to 1 project"
          : `Allocated across ${allocationSummaries.length} projects`;
      const readiness = getSupplierInvoiceExpenseReadiness(invoice, { allocations: projectAllocations, projects, buyerProfile });
      return {
        invoice,
        linkedExpense,
        allocationSummaries,
        allocationLabel,
        readiness,
        state: linkedExpense ? "LINKED" : readiness.readyToLink ? "READY_TO_LINK" : "NEEDS_REVIEW",
      };
    });
}

export function unresolvedForeignExpenseIds(
  expenses: readonly Expense[],
  snapshots: readonly FinancialFxSnapshot[] | undefined,
  baseCurrency: string,
) {
  const base = normalizeFinancialCurrency(baseCurrency);
  return expenses
    .filter((expense) => expense.status !== "VOID" && normalizeFinancialCurrency(expense.currency) !== base)
    .filter((expense) => !hasFinancialFxSnapshot(expense.amount, expense.currency, base, "EXPENSE", expense.id, snapshots))
    .map((expense) => expense.id);
}
