import type { ClientBilling } from "./clientBilling.ts";
import type { EngineeringDocumentsWorkspaceData } from "./engineeringDocuments.ts";
import type { FinancialImportBatch } from "./cashBanking.ts";
import { buildClientInvoiceDocumentSnapshot, buildPurchaseOrderDocumentSnapshot, type FinancialDocumentSnapshot } from "./documentGeneration.ts";
import type { CompanyDocumentProfile } from "./companyDocumentProfile.ts";
import type {
  Expense,
  InvoiceData,
  Project,
  PurchaseOrder,
  Vendor,
} from "../types.ts";
import { appPathForExpense, appPathForInvoice, appPathForProject, appPathForPurchaseOrder, appPathForTab } from "../utils/appRouting.ts";

export type DocumentRegisterKind =
  | "PURCHASE_ORDER"
  | "CLIENT_INVOICE"
  | "SUPPLIER_INVOICE"
  | "EXPENSE_RECEIPT"
  | "BANK_STATEMENT"
  | "ENGINEERING_DOCUMENT";

export type DocumentRegisterOrigin = "SOURCE" | "ISSUED" | "ENGINEERING";

export interface DocumentRegisterEntry {
  readonly id: string;
  readonly kind: DocumentRegisterKind;
  readonly title: string;
  readonly subtitle: string;
  readonly module: string;
  readonly origin: DocumentRegisterOrigin;
  readonly status: string;
  readonly date?: string;
  readonly projectId?: string;
  readonly projectLabel?: string;
  readonly counterparty?: string;
  readonly counterpartyEmail?: string;
  readonly ownerPath: string;
  readonly documentType?: "PURCHASE_ORDER" | "CLIENT_INVOICE";
  readonly documentId?: string;
  readonly artifactName?: string;
  readonly sourceDocumentId?: string;
  readonly emailEligible: boolean;
  readonly searchableText: string;
}

export interface DocumentRegisterVisibility {
  readonly invoices: boolean;
  readonly projects: boolean;
  readonly procurement: boolean;
  readonly expenses: boolean;
  readonly cash: boolean;
  readonly engineering: boolean;
}

export interface DocumentRegisterInput {
  readonly invoices?: readonly InvoiceData[];
  readonly clientBillings?: readonly ClientBilling[];
  readonly purchaseOrders?: readonly PurchaseOrder[];
  readonly expenses?: readonly Expense[];
  readonly importBatches?: readonly FinancialImportBatch[];
  readonly projects?: readonly Project[];
  readonly vendors?: readonly Vendor[];
  readonly engineering?: EngineeringDocumentsWorkspaceData;
  readonly visibility: DocumentRegisterVisibility;
  readonly returnPath?: string;
}

export interface FinancialDocumentSnapshotLookup {
  readonly purchaseOrders?: readonly PurchaseOrder[];
  readonly clientBillings?: readonly ClientBilling[];
  readonly projects?: readonly Project[];
  readonly vendors?: readonly Vendor[];
  readonly profile: CompanyDocumentProfile;
}

function text(value: unknown) {
  return String(value || "").trim();
}

function projectLabel(project?: Project) {
  if (!project) return undefined;
  return [text(project.projectCode), text(project.projectName)].filter(Boolean).join(" · ") || undefined;
}

function searchable(...values: unknown[]) {
  return values.map(text).filter(Boolean).join(" ").toLowerCase();
}

function entry(input: Omit<DocumentRegisterEntry, "searchableText">): DocumentRegisterEntry {
  return { ...input, searchableText: searchable(input.title, input.subtitle, input.module, input.origin, input.status, input.projectLabel, input.counterparty, input.counterpartyEmail, input.artifactName, input.sourceDocumentId) };
}

function isIssuedPurchaseOrder(status: unknown) {
  const value = text(status).toUpperCase();
  return value === "ISSUED" || value === "CLOSED";
}

function isIssuedClientBilling(status: unknown) {
  return text(status).toUpperCase() === "ISSUED";
}

/**
 * Build a permission-filtered index over existing records. This function is
 * intentionally projection-only: it creates no editable document entity and
 * every ownerPath points back to the domain that owns the record/history.
 */
export function buildDocumentRegister(input: DocumentRegisterInput): readonly DocumentRegisterEntry[] {
  const visibility = input.visibility;
  const projects = input.projects || [];
  const vendors = input.vendors || [];
  const returnPath = input.returnPath || appPathForTab("documents");
  const projectById = new Map(projects.map((project) => [project.id, project]));
  const vendorById = new Map(vendors.map((vendor) => [vendor.id, vendor]));
  const rows: DocumentRegisterEntry[] = [];

  if (visibility.procurement) {
    for (const purchaseOrder of input.purchaseOrders || []) {
      const project = projectById.get(purchaseOrder.projectId);
      const vendor = vendorById.get(purchaseOrder.vendorId);
      const issued = isIssuedPurchaseOrder(purchaseOrder.status);
      rows.push(entry({
        id: `po:${purchaseOrder.id}`,
        kind: "PURCHASE_ORDER",
        title: purchaseOrder.poNumber || "Purchase Order",
        subtitle: [vendor?.name || "Supplier not resolved", projectLabel(project), purchaseOrder.currency].filter(Boolean).join(" · "),
        module: "Procurement",
        origin: issued ? "ISSUED" : "SOURCE",
        status: text(purchaseOrder.status) || "UNKNOWN",
        date: purchaseOrder.issueDate || purchaseOrder.updatedAt || purchaseOrder.createdAt,
        projectId: purchaseOrder.projectId,
        projectLabel: projectLabel(project),
        counterparty: vendor?.name,
        counterpartyEmail: vendor?.email || undefined,
        ownerPath: appPathForPurchaseOrder(purchaseOrder.id, returnPath),
        ...(issued ? { documentType: "PURCHASE_ORDER" as const, documentId: purchaseOrder.id } : {}),
        artifactName: issued ? `${purchaseOrder.poNumber || "purchase-order"}.pdf` : undefined,
        emailEligible: issued,
      }));
    }
  }

  if (visibility.projects) {
    for (const billing of input.clientBillings || []) {
      const project = projectById.get(billing.projectId);
      const issued = isIssuedClientBilling(billing.status);
      rows.push(entry({
        id: `client-invoice:${billing.id}`,
        kind: "CLIENT_INVOICE",
        title: billing.billingNumber || "Client Invoice",
        subtitle: [billing.clientNameSnapshot || project?.clientName || "Client not recorded", projectLabel(project), billing.currency].filter(Boolean).join(" · "),
        module: "Client Billing",
        origin: issued ? "ISSUED" : "SOURCE",
        status: text(billing.status) || "UNKNOWN",
        date: billing.billingDate || billing.updatedAt || billing.createdAt,
        projectId: billing.projectId,
        projectLabel: projectLabel(project),
        counterparty: billing.clientNameSnapshot || project?.clientName,
        counterpartyEmail: billing.billingEmail || project?.billingEmail,
        ownerPath: appPathForProject(billing.projectId, "billing", { billingId: billing.id }),
        ...(issued ? { documentType: "CLIENT_INVOICE" as const, documentId: billing.id } : {}),
        artifactName: issued ? `${billing.billingNumber || "client-invoice"}.pdf` : undefined,
        emailEligible: issued,
      }));
    }
  }

  if (visibility.invoices) {
    for (const invoice of input.invoices || []) {
      const project = invoice.projectReference ? projects.find((candidate) => searchable(candidate.projectCode, candidate.projectName) === searchable(invoice.projectReference)) : undefined;
      rows.push(entry({
        id: `supplier-invoice:${invoice.id}`,
        kind: "SUPPLIER_INVOICE",
        title: invoice.invoiceNumber || invoice.fileName || "Supplier invoice",
        subtitle: [invoice.vendor?.name || "Supplier not resolved", invoice.currency, invoice.documentType || "Supplier evidence"].filter(Boolean).join(" · "),
        module: "Supplier Invoices",
        origin: "SOURCE",
        status: text(invoice.lifecycleStatus || invoice.reviewStatus || invoice.processingStatus) || "UNKNOWN",
        date: invoice.invoiceDate || invoice.extractedAt,
        ...(project ? { projectId: project.id, projectLabel: projectLabel(project) } : {}),
        counterparty: invoice.vendor?.name,
        ownerPath: appPathForInvoice(invoice.id, returnPath),
        artifactName: invoice.fileName,
        sourceDocumentId: invoice.sourceDocumentId,
        emailEligible: false,
      }));
    }
  }

  if (visibility.expenses) {
    for (const expense of input.expenses || []) {
      if (!expense.receiptSourceDocumentId) continue;
      const project = expense.projectId ? projectById.get(expense.projectId) : undefined;
      const vendor = expense.vendorId ? vendorById.get(expense.vendorId) : undefined;
      rows.push(entry({
        id: `expense-receipt:${expense.id}`,
        kind: "EXPENSE_RECEIPT",
        title: expense.description || "Expense receipt",
        subtitle: [expense.payee || vendor?.name || "Payee not recorded", expense.currency, expense.category].filter(Boolean).join(" · "),
        module: "Expenses",
        origin: "SOURCE",
        status: text(expense.status) || "UNKNOWN",
        date: expense.expenseDate || expense.createdAt,
        ...(project ? { projectId: project.id, projectLabel: projectLabel(project) } : {}),
        counterparty: expense.payee || vendor?.name,
        ownerPath: appPathForExpense(expense.id, returnPath),
        sourceDocumentId: expense.receiptSourceDocumentId,
        emailEligible: false,
      }));
    }
  }

  if (visibility.cash) {
    for (const batch of input.importBatches || []) {
      rows.push(entry({
        id: `bank-statement:${batch.id}`,
        kind: "BANK_STATEMENT",
        title: batch.fileName || "Bank statement",
        subtitle: [batch.sourceType, batch.statementFrom && batch.statementTo ? `${batch.statementFrom} – ${batch.statementTo}` : "Date range not recorded"].filter(Boolean).join(" · "),
        module: "Cash & Banking",
        origin: "SOURCE",
        status: text(batch.status) || "UNKNOWN",
        date: batch.statementTo || batch.createdAt,
        ownerPath: appPathForTab("cash"),
        artifactName: batch.fileName,
        sourceDocumentId: batch.sourceDocumentId,
        emailEligible: false,
      }));
    }
  }

  if (visibility.engineering) {
    const revisions = input.engineering?.revisions || [];
    const revisionById = new Map(revisions.map((revision) => [revision.id, revision]));
    for (const document of input.engineering?.documents || []) {
      const project = document.projectId ? projectById.get(document.projectId) : undefined;
      const revision = document.currentRevisionId ? revisionById.get(document.currentRevisionId) : undefined;
      rows.push(entry({
        id: `engineering:${document.id}`,
        kind: "ENGINEERING_DOCUMENT",
        title: document.documentNumber || document.title || "Engineering document",
        subtitle: [document.title, document.discipline, document.currentRevisionNumber ? `Rev ${document.currentRevisionNumber}` : undefined].filter(Boolean).join(" · "),
        module: "Engineering",
        origin: "ENGINEERING",
        status: text(document.status) || "UNKNOWN",
        date: document.updatedAt || document.createdAt,
        ...(project ? { projectId: project.id, projectLabel: projectLabel(project) } : {}),
        ownerPath: document.projectId ? appPathForProject(document.projectId, "documents", { docId: document.id, revId: revision?.id }) : appPathForTab("projects"),
        artifactName: revision?.fileName,
        sourceDocumentId: revision?.id,
        emailEligible: false,
      }));
    }
  }

  return rows.sort((left, right) => String(right.date || "").localeCompare(String(left.date || "")) || left.title.localeCompare(right.title));
}

export function buildFinancialDocumentSnapshot(entry: DocumentRegisterEntry, lookup: FinancialDocumentSnapshotLookup): FinancialDocumentSnapshot {
  const projects = lookup.projects || [];
  const vendors = lookup.vendors || [];
  if (entry.documentType === "PURCHASE_ORDER" && entry.documentId) {
    const purchaseOrder = (lookup.purchaseOrders || []).find((candidate) => candidate.id === entry.documentId);
    if (!purchaseOrder) throw new Error("The Purchase Order is not available in this company workspace.");
    return buildPurchaseOrderDocumentSnapshot(purchaseOrder, vendors.find((vendor) => vendor.id === purchaseOrder.vendorId), projects.find((project) => project.id === purchaseOrder.projectId), lookup.profile);
  }
  if (entry.documentType === "CLIENT_INVOICE" && entry.documentId) {
    const billing = (lookup.clientBillings || []).find((candidate) => candidate.id === entry.documentId);
    if (!billing) throw new Error("The Client Invoice is not available in this company workspace.");
    return buildClientInvoiceDocumentSnapshot(billing, projects.find((project) => project.id === billing.projectId), lookup.profile);
  }
  throw new Error("This document has no supported financial preview.");
}
