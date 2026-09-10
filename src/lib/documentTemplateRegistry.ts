import type { FinancialDocumentSnapshot } from "./documentGeneration.ts";

export const DOCUMENT_TEMPLATE_TYPES = ["PURCHASE_ORDER", "CLIENT_INVOICE"] as const;
export type DocumentTemplateType = (typeof DOCUMENT_TEMPLATE_TYPES)[number];

export const DOCUMENT_TEMPLATE_ORIGINS = ["UPLOADED", "AI_GENERATED", "STARTER", "DUPLICATED"] as const;
export type DocumentTemplateOrigin = (typeof DOCUMENT_TEMPLATE_ORIGINS)[number];

export const DOCUMENT_TEMPLATE_STATUSES = ["DRAFT", "ACTIVE", "RETIRED"] as const;
export type DocumentTemplateStatus = (typeof DOCUMENT_TEMPLATE_STATUSES)[number];

export const DOCUMENT_TEMPLATE_VALIDATION_STATES = ["UNVALIDATED", "VALID", "WARNINGS", "BLOCKED"] as const;
export type DocumentTemplateValidationState = (typeof DOCUMENT_TEMPLATE_VALIDATION_STATES)[number];

export type DocumentTemplateFieldType = "TEXT" | "DATE" | "NUMBER" | "MONEY";
export type DocumentTemplateFieldFormat = "TEXT" | "DATE" | "NUMBER" | "MONEY";

export interface DocumentTemplateField {
  readonly key: string;
  readonly label: string;
  readonly documentType: DocumentTemplateType;
  readonly type: DocumentTemplateFieldType;
  readonly format: DocumentTemplateFieldFormat;
  readonly required: boolean;
  readonly collection: boolean;
  readonly example: string;
  readonly description: string;
}

export interface DocumentTemplateBinding {
  readonly tag: string;
  readonly fieldKey: string;
  readonly sourceLabel?: string;
  readonly location?: string;
  readonly confidence?: number;
  readonly confirmed?: boolean;
}

export type TemplateValidationSeverity = "ERROR" | "WARNING" | "INFO";

export interface TemplateValidationIssue {
  readonly code: string;
  readonly severity: TemplateValidationSeverity;
  readonly message: string;
  readonly tag?: string;
  readonly fieldKey?: string;
}

export interface TemplateValidationReport {
  readonly state: DocumentTemplateValidationState;
  readonly issues: readonly TemplateValidationIssue[];
  readonly tags: readonly string[];
  readonly confirmedBindingCount: number;
}

export interface TemplateBlueprintSection {
  readonly heading: string;
  readonly fields: readonly string[];
}

export interface TemplateBlueprint {
  readonly schemaVersion: "1";
  readonly documentType: DocumentTemplateType;
  readonly title: string;
  readonly style: "PROFESSIONAL" | "COMPACT" | "FORMAL";
  readonly sections: readonly TemplateBlueprintSection[];
  readonly lineColumns: readonly string[];
  readonly includeCompanyProfile: boolean;
  readonly includePaymentInstructions: boolean;
  readonly includeTerms: boolean;
  readonly signatureLabels: readonly string[];
  readonly footerText?: string;
}

export interface DocumentTemplateMappingProposal {
  readonly fieldKey?: string;
  readonly sourceLabel: string;
  readonly location: string;
  readonly confidence: number;
  readonly reason: string;
  readonly unresolved: boolean;
}

export interface DocumentTemplateMappingAnalysis {
  readonly suggestedDocumentType?: DocumentTemplateType;
  readonly confidence: number;
  readonly mappings: readonly DocumentTemplateMappingProposal[];
  readonly lineTable?: {
    readonly location: string;
    readonly confidence: number;
    readonly fieldKeys: readonly string[];
  };
  readonly unresolved: readonly string[];
  readonly warnings: readonly string[];
}

type Snapshot = FinancialDocumentSnapshot;
type LineSnapshot = Snapshot["lines"][number];

function text(value: unknown): string {
  return value === undefined || value === null ? "" : String(value);
}

function dateValue(value: unknown): string {
  const source = text(value).slice(0, 10);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(source);
  return match ? `${match[2]}.${match[3]}.${match[1]}` : source;
}

function moneyValue(value: unknown, currency: string): string {
  const amount = Number(value);
  return Number.isFinite(amount) ? `${currency} ${amount.toFixed(2)}` : "";
}

function numberValue(value: unknown): string {
  const amount = Number(value);
  return Number.isFinite(amount) ? String(amount) : "";
}

function field(
  key: string,
  label: string,
  documentType: DocumentTemplateType,
  type: DocumentTemplateFieldType,
  required: boolean,
  collection: boolean,
  example: string,
  description: string,
  format: DocumentTemplateFieldFormat = type,
): DocumentTemplateField {
  return Object.freeze({ key, label, documentType, type, format, required, collection, example, description });
}

const COMPANY_FIELDS = (documentType: DocumentTemplateType): readonly DocumentTemplateField[] => [
  field("company.legalName", "Company legal name", documentType, "TEXT", true, false, "HydroQualiSense Solutions Corp.", "Approved company identity from the document profile."),
  field("company.address", "Company address", documentType, "TEXT", false, false, "01 Pasong Tulo, Santa Rita Bata", "Company address from the document profile."),
  field("company.contactNumber", "Company contact number", documentType, "TEXT", false, false, "09760721144", "Company telephone or mobile number."),
  field("company.email", "Company email", documentType, "TEXT", false, false, "accounts@example.com", "Company email from the document profile."),
  field("company.vatTin", "Company VAT/TIN", documentType, "TEXT", false, false, "000-000-000-000", "Company tax identifier when recorded."),
  field("company.paymentInstructions", "Payment instructions", documentType, "TEXT", false, false, "Pay by bank transfer using the account on file.", "Approved payment instructions from the document profile."),
];

const PROCESSOR_FIELDS = (documentType: DocumentTemplateType): readonly DocumentTemplateField[] => [
  field("processor.name", "Prepared / processed by", documentType, "TEXT", true, false, "Authorized User", "Processor captured in the document snapshot."),
  field("processor.title", "Processor title", documentType, "TEXT", false, false, "Project Coordinator", "Optional processor title captured in the snapshot."),
];

const LINE_FIELDS = (documentType: DocumentTemplateType): readonly DocumentTemplateField[] => [
  field("lines.lineNumber", "Line number", documentType, "NUMBER", true, true, "1", "Authoritative line ordering."),
  field("lines.description", "Line description", documentType, "TEXT", true, true, "Concrete works", "Authoritative line description."),
  field("lines.quantity", "Quantity", documentType, "NUMBER", false, true, "12", "Quantity when the source document provides it."),
  field("lines.unit", "Unit", documentType, "TEXT", false, true, "pcs", "Unit of measure when available."),
  field("lines.unitPrice", "Unit price", documentType, "MONEY", false, true, "PHP 125.00", "Unit price from the authoritative snapshot."),
  field("lines.amount", "Line amount", documentType, "MONEY", true, true, "PHP 1,500.00", "Authoritative line amount; never calculated by AI during merge."),
  field("lines.notes", "Line notes", documentType, "TEXT", false, true, "Phase 1", "Optional line notes when supported by the source snapshot."),
];

const PURCHASE_ORDER_FIELDS: readonly DocumentTemplateField[] = [
  ...COMPANY_FIELDS("PURCHASE_ORDER"),
  field("purchaseOrder.documentNumber", "Purchase Order number", "PURCHASE_ORDER", "TEXT", true, false, "PO-2026-001", "Authoritative purchase-order number."),
  field("purchaseOrder.issueDate", "Purchase Order date", "PURCHASE_ORDER", "DATE", false, false, "10.09.2026", "Authoritative issue date."),
  field("purchaseOrder.currency", "Purchase Order currency", "PURCHASE_ORDER", "TEXT", true, false, "PHP", "Original source currency; no FX conversion is performed."),
  field("purchaseOrder.description", "Purchase Order description", "PURCHASE_ORDER", "TEXT", false, false, "Materials for site works", "Purchase-order description."),
  field("purchaseOrder.notes", "Purchase Order notes", "PURCHASE_ORDER", "TEXT", false, false, "Deliver during site hours.", "Purchase-order notes."),
  field("purchaseOrder.termsAndConditions", "Purchase Order terms", "PURCHASE_ORDER", "TEXT", false, false, "Payment within agreed terms.", "Approved terms from the document profile or snapshot."),
  field("purchaseOrder.totalAmount", "Purchase Order total", "PURCHASE_ORDER", "MONEY", true, false, "PHP 15,000.00", "Authoritative Purchase Order total."),
  field("purchaseOrder.amountInWords", "Purchase Order total in words", "PURCHASE_ORDER", "TEXT", false, false, "fifteen thousand PHP only", "Snapshot wording for the authoritative total."),
  field("supplier.name", "Supplier name", "PURCHASE_ORDER", "TEXT", true, false, "ABC Supply Co.", "Canonical supplier identity captured in the snapshot."),
  field("supplier.address", "Supplier address", "PURCHASE_ORDER", "TEXT", false, false, "Bulacan", "Supplier address."),
  field("supplier.email", "Supplier email", "PURCHASE_ORDER", "TEXT", false, false, "supplier@example.com", "Supplier email."),
  field("supplier.phone", "Supplier phone", "PURCHASE_ORDER", "TEXT", false, false, "09170000000", "Supplier phone."),
  field("supplier.vatTin", "Supplier VAT/TIN", "PURCHASE_ORDER", "TEXT", false, false, "000-000-000-000", "Supplier tax identifier."),
  field("supplier.attention", "Supplier attention", "PURCHASE_ORDER", "TEXT", false, false, "Purchasing Department", "Supplier attention line."),
  field("project.projectCode", "Project code", "PURCHASE_ORDER", "TEXT", false, false, "PRJ-001", "Project code captured in the snapshot."),
  field("project.projectName", "Project name", "PURCHASE_ORDER", "TEXT", false, false, "Riverside Office", "Project name captured in the snapshot."),
  field("project.deliverTo", "Deliver to / site", "PURCHASE_ORDER", "TEXT", false, false, "Riverside site, Bulacan", "Project delivery location."),
  ...PROCESSOR_FIELDS("PURCHASE_ORDER"),
  ...LINE_FIELDS("PURCHASE_ORDER"),
];

const CLIENT_INVOICE_FIELDS: readonly DocumentTemplateField[] = [
  ...COMPANY_FIELDS("CLIENT_INVOICE"),
  field("invoice.documentNumber", "Client Invoice number", "CLIENT_INVOICE", "TEXT", true, false, "INV-2026-001", "Authoritative issued client-invoice number."),
  field("invoice.invoiceDate", "Invoice date", "CLIENT_INVOICE", "DATE", false, false, "10.09.2026", "Authoritative invoice date."),
  field("invoice.dueDate", "Invoice due date", "CLIENT_INVOICE", "DATE", false, false, "10.10.2026", "Authoritative due date."),
  field("invoice.paymentTerms", "Invoice payment terms", "CLIENT_INVOICE", "TEXT", false, false, "30 days", "Payment terms captured in the snapshot."),
  field("invoice.currency", "Invoice currency", "CLIENT_INVOICE", "TEXT", true, false, "PHP", "Original source currency; no FX conversion is performed."),
  field("invoice.taxTreatment", "Tax treatment", "CLIENT_INVOICE", "TEXT", false, false, "VAT", "Tax treatment captured at issuance."),
  field("invoice.subtotal", "Invoice subtotal", "CLIENT_INVOICE", "MONEY", true, false, "PHP 15,000.00", "Authoritative invoice subtotal."),
  field("invoice.taxAmount", "Invoice tax amount", "CLIENT_INVOICE", "MONEY", false, false, "PHP 1,800.00", "Authoritative snapshot tax amount when present."),
  field("invoice.taxLabel", "Invoice tax label", "CLIENT_INVOICE", "TEXT", false, false, "VAT", "Tax label captured in the snapshot."),
  field("invoice.totalAmount", "Invoice total", "CLIENT_INVOICE", "MONEY", true, false, "PHP 16,800.00", "Authoritative issued invoice total."),
  field("invoice.amountInWords", "Invoice total in words", "CLIENT_INVOICE", "TEXT", false, false, "sixteen thousand eight hundred PHP only", "Snapshot wording for the authoritative total."),
  field("invoice.notes", "Invoice notes", "CLIENT_INVOICE", "TEXT", false, false, "Thank you for your business.", "Invoice notes."),
  field("invoice.termsAndConditions", "Invoice terms", "CLIENT_INVOICE", "TEXT", false, false, "Payment is due within the agreed terms.", "Approved terms from the document profile or snapshot."),
  field("billTo.name", "Bill-to client name", "CLIENT_INVOICE", "TEXT", true, false, "Client Company", "Client identity captured at issuance."),
  field("billTo.contactName", "Bill-to contact", "CLIENT_INVOICE", "TEXT", false, false, "Accounts Payable", "Client billing contact."),
  field("billTo.email", "Bill-to email", "CLIENT_INVOICE", "TEXT", false, false, "client@example.com", "Client billing email."),
  field("billTo.address", "Bill-to address", "CLIENT_INVOICE", "TEXT", false, false, "Manila", "Client billing address."),
  field("billTo.reference", "Client reference", "CLIENT_INVOICE", "TEXT", false, false, "Contract 2026-01", "Client reference captured at issuance."),
  field("project.projectCode", "Project code", "CLIENT_INVOICE", "TEXT", false, false, "PRJ-001", "Project code captured in the snapshot."),
  field("project.projectName", "Project name", "CLIENT_INVOICE", "TEXT", false, false, "Riverside Office", "Project name captured in the snapshot."),
  ...PROCESSOR_FIELDS("CLIENT_INVOICE"),
  ...LINE_FIELDS("CLIENT_INVOICE"),
];

const REGISTRY: Readonly<Record<DocumentTemplateType, readonly DocumentTemplateField[]>> = Object.freeze({
  PURCHASE_ORDER: Object.freeze(PURCHASE_ORDER_FIELDS),
  CLIENT_INVOICE: Object.freeze(CLIENT_INVOICE_FIELDS),
});

export function getDocumentTemplateFields(documentType: DocumentTemplateType): readonly DocumentTemplateField[] {
  return REGISTRY[documentType];
}

export function getDocumentTemplateField(documentType: DocumentTemplateType, key: string): DocumentTemplateField | undefined {
  return getDocumentTemplateFields(documentType).find((candidate) => candidate.key === key);
}

export function isDocumentTemplateType(value: unknown): value is DocumentTemplateType {
  return DOCUMENT_TEMPLATE_TYPES.includes(value as DocumentTemplateType);
}

export function isDocumentTemplateFieldKey(documentType: DocumentTemplateType, key: string): boolean {
  return Boolean(getDocumentTemplateField(documentType, key));
}

export function tagForDocumentTemplateField(fieldKey: string): string {
  return fieldKey.startsWith("lines.") ? fieldKey.slice("lines.".length) : fieldKey;
}

function directFieldValue(snapshot: Snapshot, key: string, line?: LineSnapshot): unknown {
  switch (key) {
    case "company.legalName": return snapshot.company.legalName;
    case "company.address": return snapshot.company.address;
    case "company.contactNumber": return snapshot.company.contactNumber;
    case "company.email": return snapshot.company.email;
    case "company.vatTin": return snapshot.company.vatTin;
    case "company.paymentInstructions": return snapshot.company.paymentInstructions;
    case "purchaseOrder.documentNumber": return snapshot.documentType === "PURCHASE_ORDER" ? snapshot.documentNumber : undefined;
    case "purchaseOrder.issueDate": return snapshot.documentType === "PURCHASE_ORDER" ? snapshot.issueDate : undefined;
    case "purchaseOrder.currency": return snapshot.documentType === "PURCHASE_ORDER" ? snapshot.currency : undefined;
    case "purchaseOrder.description": return snapshot.documentType === "PURCHASE_ORDER" ? snapshot.description : undefined;
    case "purchaseOrder.notes": return snapshot.documentType === "PURCHASE_ORDER" ? snapshot.notes : undefined;
    case "purchaseOrder.termsAndConditions": return snapshot.documentType === "PURCHASE_ORDER" ? snapshot.termsAndConditions : undefined;
    case "purchaseOrder.totalAmount": return snapshot.documentType === "PURCHASE_ORDER" ? snapshot.totalAmount : undefined;
    case "purchaseOrder.amountInWords": return snapshot.documentType === "PURCHASE_ORDER" ? snapshot.amountInWords : undefined;
    case "invoice.documentNumber": return snapshot.documentType === "CLIENT_INVOICE" ? snapshot.documentNumber : undefined;
    case "invoice.invoiceDate": return snapshot.documentType === "CLIENT_INVOICE" ? snapshot.invoiceDate : undefined;
    case "invoice.dueDate": return snapshot.documentType === "CLIENT_INVOICE" ? snapshot.dueDate : undefined;
    case "invoice.paymentTerms": return snapshot.documentType === "CLIENT_INVOICE" ? snapshot.paymentTerms : undefined;
    case "invoice.currency": return snapshot.documentType === "CLIENT_INVOICE" ? snapshot.currency : undefined;
    case "invoice.taxTreatment": return snapshot.documentType === "CLIENT_INVOICE" ? snapshot.taxTreatment : undefined;
    case "invoice.subtotal": return snapshot.documentType === "CLIENT_INVOICE" ? snapshot.subtotal : undefined;
    case "invoice.taxAmount": return snapshot.documentType === "CLIENT_INVOICE" ? snapshot.taxAmount : undefined;
    case "invoice.taxLabel": return snapshot.documentType === "CLIENT_INVOICE" ? snapshot.taxLabel : undefined;
    case "invoice.totalAmount": return snapshot.documentType === "CLIENT_INVOICE" ? snapshot.totalAmount : undefined;
    case "invoice.amountInWords": return snapshot.documentType === "CLIENT_INVOICE" ? snapshot.amountInWords : undefined;
    case "invoice.notes": return snapshot.documentType === "CLIENT_INVOICE" ? snapshot.notes : undefined;
    case "invoice.termsAndConditions": return snapshot.documentType === "CLIENT_INVOICE" ? snapshot.termsAndConditions : undefined;
    case "supplier.name": return snapshot.documentType === "PURCHASE_ORDER" ? snapshot.supplier.name : undefined;
    case "supplier.address": return snapshot.documentType === "PURCHASE_ORDER" ? snapshot.supplier.address : undefined;
    case "supplier.email": return snapshot.documentType === "PURCHASE_ORDER" ? snapshot.supplier.email : undefined;
    case "supplier.phone": return snapshot.documentType === "PURCHASE_ORDER" ? snapshot.supplier.phone : undefined;
    case "supplier.vatTin": return snapshot.documentType === "PURCHASE_ORDER" ? snapshot.supplier.vatTin : undefined;
    case "supplier.attention": return snapshot.documentType === "PURCHASE_ORDER" ? snapshot.supplier.attention : undefined;
    case "billTo.name": return snapshot.documentType === "CLIENT_INVOICE" ? snapshot.billTo.name : undefined;
    case "billTo.contactName": return snapshot.documentType === "CLIENT_INVOICE" ? snapshot.billTo.contactName : undefined;
    case "billTo.email": return snapshot.documentType === "CLIENT_INVOICE" ? snapshot.billTo.email : undefined;
    case "billTo.address": return snapshot.documentType === "CLIENT_INVOICE" ? snapshot.billTo.address : undefined;
    case "billTo.reference": return snapshot.documentType === "CLIENT_INVOICE" ? snapshot.billTo.reference : undefined;
    case "project.projectCode": return snapshot.project.projectCode;
    case "project.projectName": return snapshot.project.projectName;
    case "project.deliverTo": return snapshot.documentType === "PURCHASE_ORDER" ? snapshot.project.deliverTo : undefined;
    case "processor.name": return snapshot.processor.name;
    case "processor.title": return snapshot.processor.title;
    case "lines.lineNumber": return line?.lineNumber;
    case "lines.description": return line?.description;
    case "lines.quantity": return line?.quantity;
    case "lines.unit": return line?.unit;
    case "lines.unitPrice": return line?.unitPrice;
    case "lines.amount": return line?.amount;
    case "lines.notes": return line?.notes;
    default: return undefined;
  }
}

export function resolveDocumentTemplateFieldValue(
  snapshot: Snapshot,
  documentType: DocumentTemplateType,
  fieldKey: string,
  line?: LineSnapshot,
): string {
  const definition = getDocumentTemplateField(documentType, fieldKey);
  if (!definition) return "";
  const raw = directFieldValue(snapshot, fieldKey, line);
  if (raw === undefined || raw === null) return "";
  if (definition.format === "DATE") return dateValue(raw);
  if (definition.format === "MONEY") return moneyValue(raw, snapshot.currency);
  if (definition.format === "NUMBER") return numberValue(raw);
  return text(raw);
}

export function minimumRequiredFieldKeys(documentType: DocumentTemplateType): readonly string[] {
  return documentType === "PURCHASE_ORDER"
    ? ["company.legalName", "purchaseOrder.documentNumber", "purchaseOrder.currency", "purchaseOrder.totalAmount", "supplier.name", "lines.lineNumber", "lines.description", "lines.amount"]
    : ["company.legalName", "invoice.documentNumber", "invoice.currency", "invoice.subtotal", "invoice.totalAmount", "billTo.name", "lines.lineNumber", "lines.description", "lines.amount"];
}

function normalizeTag(tag: unknown): string {
  return typeof tag === "string" ? tag.trim() : "";
}

function bindingForTag(tag: string, bindings: readonly DocumentTemplateBinding[]): DocumentTemplateBinding | undefined {
  return bindings.find((binding) => normalizeTag(binding.tag) === tag);
}

function bindingKeyForTag(documentType: DocumentTemplateType, tag: string, bindings: readonly DocumentTemplateBinding[]): string | undefined {
  const direct = isDocumentTemplateFieldKey(documentType, tag) ? tag : undefined;
  return direct || bindingForTag(tag, bindings)?.fieldKey;
}

export function validateDocumentTemplateBindings(
  documentType: DocumentTemplateType,
  tags: readonly string[],
  bindings: readonly DocumentTemplateBinding[],
): TemplateValidationReport {
  const issues: TemplateValidationIssue[] = [];
  const normalizedTags = tags.map(normalizeTag).filter(Boolean);
  const uniqueTags = [...new Set(normalizedTags)];
  if (uniqueTags.length !== normalizedTags.length) {
    issues.push({ code: "DUPLICATE_TAG", severity: "ERROR", message: "The template contains a duplicate merge tag." });
  }
  const confirmed = bindings.filter((binding) => binding.confirmed !== false);
  const seenBindingTags = new Set<string>();
  for (const binding of bindings) {
    const tag = normalizeTag(binding.tag);
    const fieldKey = normalizeTag(binding.fieldKey);
    if (!tag || !fieldKey) {
      issues.push({ code: "MALFORMED_BINDING", severity: "ERROR", message: "Every field mapping needs a tag and an application field." });
      continue;
    }
    if (seenBindingTags.has(tag)) issues.push({ code: "DUPLICATE_BINDING", severity: "ERROR", message: `The merge tag ${tag} is mapped more than once.`, tag });
    seenBindingTags.add(tag);
    if (!isDocumentTemplateFieldKey(documentType, fieldKey)) {
      issues.push({ code: "UNKNOWN_FIELD", severity: "ERROR", message: `${fieldKey} is not an allowed field for this document type.`, tag, fieldKey });
    }
    if (!uniqueTags.includes(tag)) issues.push({ code: "UNUSED_BINDING", severity: "WARNING", message: `The mapping for ${tag} is not present in the uploaded document.`, tag, fieldKey });
  }

  let hasLinesStart = false;
  let hasLinesEnd = false;
  for (const tag of uniqueTags) {
    if (tag === "#lines") { hasLinesStart = true; continue; }
    if (tag === "/lines") { hasLinesEnd = true; continue; }
    if (tag.startsWith("#") || tag.startsWith("/") || tag.startsWith("^")) {
      issues.push({ code: "UNSUPPORTED_STRUCTURE", severity: "ERROR", message: `The structural tag ${tag} is not supported.`, tag });
      continue;
    }
    const fieldKey = bindingKeyForTag(documentType, tag, bindings);
    if (!fieldKey) {
      issues.push({ code: "UNKNOWN_TAG", severity: "ERROR", message: `The merge tag ${tag} is not mapped to an allowed application field.`, tag });
    } else if (getDocumentTemplateField(documentType, fieldKey)?.collection && !hasLinesStart) {
      issues.push({ code: "REPEATING_ROW_START_MISSING", severity: "ERROR", message: `The repeating field ${fieldKey} must be inside a {{#lines}} row block.`, tag, fieldKey });
    }
  }
  if (hasLinesStart !== hasLinesEnd) issues.push({ code: "UNBALANCED_LINES", severity: "ERROR", message: "The repeating line-item tags must include both {{#lines}} and {{/lines}}." });
  if (hasLinesStart && !uniqueTags.some((tag) => tag === "lines.description" || tag === "description")) {
    issues.push({ code: "REPEATING_DESCRIPTION_MISSING", severity: "ERROR", message: "A repeating line-item block must include a description field." });
  }

  for (const requiredKey of minimumRequiredFieldKeys(documentType)) {
    const present = uniqueTags.some((tag) => bindingKeyForTag(documentType, tag, bindings) === requiredKey);
    if (!present) issues.push({ code: "REQUIRED_FIELD_MISSING", severity: "ERROR", message: `The required field ${getDocumentTemplateField(documentType, requiredKey)?.label || requiredKey} is not mapped.`, fieldKey: requiredKey });
  }
  if (confirmed.length !== bindings.length) issues.push({ code: "UNCONFIRMED_MAPPING", severity: "ERROR", message: "Every mapping must be explicitly confirmed before activation." });
  if (!uniqueTags.length) issues.push({ code: "NO_MERGE_TAGS", severity: "ERROR", message: "The template has no supported merge tags. Add tags in Word or use a starter template." });

  const state: DocumentTemplateValidationState = issues.some((issue) => issue.severity === "ERROR")
    ? "BLOCKED"
    : issues.some((issue) => issue.severity === "WARNING") ? "WARNINGS" : "VALID";
  return { state, issues, tags: uniqueTags, confirmedBindingCount: confirmed.length };
}

function boundedString(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed && trimmed.length <= max ? trimmed : undefined;
}

function booleanValue(value: unknown, fallback: boolean): boolean | undefined {
  return typeof value === "boolean" ? value : fallback;
}

function stringArray(value: unknown, maxItems: number, maxLength: number): string[] | undefined {
  if (!Array.isArray(value) || value.length > maxItems) return undefined;
  const result = value.map((item) => boundedString(item, maxLength));
  return result.every(Boolean) ? result as string[] : undefined;
}

export function validateTemplateBlueprint(value: unknown, documentType: DocumentTemplateType): { ok: true; blueprint: TemplateBlueprint } | { ok: false; errors: readonly string[] } {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const errors: string[] = [];
  const blueprintKeys = new Set(["schemaVersion", "documentType", "title", "style", "sections", "lineColumns", "includeCompanyProfile", "includePaymentInstructions", "includeTerms", "signatureLabels", "footerText"]);
  for (const key of Object.keys(source)) if (!blueprintKeys.has(key)) errors.push(`${key} is not an allowed blueprint property.`);
  if (source.schemaVersion !== "1") errors.push("schemaVersion must be 1.");
  if (source.documentType !== documentType) errors.push("documentType does not match the requested document type.");
  const title = boundedString(source.title, 160);
  if (!title) errors.push("title is required.");
  const style = source.style === "PROFESSIONAL" || source.style === "COMPACT" || source.style === "FORMAL" ? source.style : undefined;
  if (!style) errors.push("style is invalid.");
  const rawSections = Array.isArray(source.sections) && source.sections.length <= 8 ? source.sections : undefined;
  const sections: TemplateBlueprintSection[] = [];
  if (!rawSections) errors.push("sections must contain at most eight sections.");
  else rawSections.forEach((item, index) => {
    const section = item && typeof item === "object" && !Array.isArray(item) ? item as Record<string, unknown> : {};
    const heading = boundedString(section.heading, 120);
    const fields = stringArray(section.fields, 8, 120);
    if (!heading || !fields) { errors.push(`section ${index + 1} is invalid.`); return; }
    for (const key of fields) {
      const candidate = getDocumentTemplateField(documentType, key);
      if (!candidate || candidate.collection) errors.push(`section ${index + 1} contains an unsupported field.`);
    }
    sections.push({ heading, fields });
  });
  const lineColumns = stringArray(source.lineColumns, 8, 120);
  if (!lineColumns || lineColumns.length < 3) errors.push("lineColumns must contain at least three allowed line fields.");
  else for (const key of lineColumns) {
    const candidate = getDocumentTemplateField(documentType, key);
    if (!candidate?.collection) errors.push(`${key} is not an allowed repeating line field.`);
  }
  const signatureLabels = stringArray(source.signatureLabels, 4, 80);
  if (!signatureLabels || signatureLabels.length < 1) errors.push("signatureLabels must contain at least one label.");
  const footerText = source.footerText === undefined ? undefined : boundedString(source.footerText, 500);
  if (source.footerText !== undefined && !footerText) errors.push("footerText is invalid.");
  const includeCompanyProfile = booleanValue(source.includeCompanyProfile, true);
  const includePaymentInstructions = booleanValue(source.includePaymentInstructions, documentType === "CLIENT_INVOICE");
  const includeTerms = booleanValue(source.includeTerms, true);
  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    blueprint: Object.freeze({
      schemaVersion: "1",
      documentType,
      title: title!,
      style: style!,
      sections: Object.freeze(sections),
      lineColumns: Object.freeze(lineColumns!),
      includeCompanyProfile: includeCompanyProfile!,
      includePaymentInstructions: includePaymentInstructions!,
      includeTerms: includeTerms!,
      signatureLabels: Object.freeze(signatureLabels!),
      ...(footerText ? { footerText } : {}),
    }),
  };
}

export function starterTemplateBlueprint(documentType: DocumentTemplateType): TemplateBlueprint {
  const isPo = documentType === "PURCHASE_ORDER";
  return {
    schemaVersion: "1",
    documentType,
    title: isPo ? "PURCHASE ORDER" : "CLIENT INVOICE",
    style: "PROFESSIONAL",
    sections: isPo
      ? [
        { heading: "Supplier and delivery", fields: ["supplier.name", "supplier.address", "supplier.attention", "project.projectCode", "project.projectName", "project.deliverTo"] },
        { heading: "Order details", fields: ["purchaseOrder.documentNumber", "purchaseOrder.issueDate", "purchaseOrder.currency", "purchaseOrder.description"] },
      ]
      : [
        { heading: "Invoice details", fields: ["invoice.documentNumber", "invoice.invoiceDate", "invoice.dueDate", "invoice.paymentTerms", "invoice.currency", "project.projectCode", "project.projectName"] },
        { heading: "Bill to", fields: ["billTo.name", "billTo.contactName", "billTo.email", "billTo.address", "billTo.reference"] },
      ],
    lineColumns: isPo
      ? ["lines.lineNumber", "lines.quantity", "lines.unit", "lines.description", "lines.unitPrice", "lines.amount"]
      : ["lines.lineNumber", "lines.description", "lines.amount"],
    includeCompanyProfile: true,
    includePaymentInstructions: !isPo,
    includeTerms: true,
    signatureLabels: isPo ? ["Prepared by", "Supplier conforme"] : ["Prepared by"],
    footerText: "Generated from an immutable HydroQualiSense document snapshot.",
  };
}

export function validateTemplateMappingAnalysis(value: unknown, documentType: DocumentTemplateType): { ok: true; analysis: DocumentTemplateMappingAnalysis } | { ok: false; errors: readonly string[] } {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const errors: string[] = [];
  const analysisKeys = new Set(["suggestedDocumentType", "confidence", "mappings", "lineTable", "unresolved", "warnings"]);
  for (const key of Object.keys(source)) if (!analysisKeys.has(key)) errors.push(`${key} is not an allowed analysis property.`);
  const suggestedDocumentType = source.suggestedDocumentType === undefined || source.suggestedDocumentType === null
    ? undefined
    : isDocumentTemplateType(source.suggestedDocumentType) ? source.suggestedDocumentType : undefined;
  if (source.suggestedDocumentType !== undefined && source.suggestedDocumentType !== null && !suggestedDocumentType) errors.push("suggestedDocumentType is invalid.");
  const confidence = Number(source.confidence);
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) errors.push("confidence must be between 0 and 1.");
  const rawMappings = Array.isArray(source.mappings) && source.mappings.length <= 100 ? source.mappings : undefined;
  const mappings: DocumentTemplateMappingProposal[] = [];
  if (!rawMappings) errors.push("mappings must contain at most 100 entries.");
  else rawMappings.forEach((item, index) => {
    const mapping = item && typeof item === "object" && !Array.isArray(item) ? item as Record<string, unknown> : {};
    const fieldKey = mapping.fieldKey === null || mapping.fieldKey === undefined || mapping.fieldKey === "" ? undefined : boundedString(mapping.fieldKey, 120);
    const sourceLabel = boundedString(mapping.sourceLabel, 160);
    const location = boundedString(mapping.location, 160);
    const reason = boundedString(mapping.reason, 400);
    const itemConfidence = Number(mapping.confidence);
    const unresolved = mapping.unresolved === true;
    if (!sourceLabel || !location || !reason || !Number.isFinite(itemConfidence) || itemConfidence < 0 || itemConfidence > 1 || (!unresolved && !fieldKey)) {
      errors.push(`mapping ${index + 1} is invalid.`);
      return;
    }
    if (fieldKey && !isDocumentTemplateFieldKey(documentType, fieldKey)) {
      errors.push(`mapping ${index + 1} references an unavailable field.`);
      return;
    }
    mappings.push({ ...(fieldKey ? { fieldKey } : {}), sourceLabel, location, confidence: itemConfidence, reason, unresolved });
  });
  const rawLineTable = source.lineTable;
  let lineTable: DocumentTemplateMappingAnalysis["lineTable"];
  if (rawLineTable !== undefined && rawLineTable !== null) {
    const table = rawLineTable && typeof rawLineTable === "object" && !Array.isArray(rawLineTable) ? rawLineTable as Record<string, unknown> : {};
    const location = boundedString(table.location, 160);
    const lineConfidence = Number(table.confidence);
    const fieldKeys = stringArray(table.fieldKeys, 8, 120);
    if (!location || !Number.isFinite(lineConfidence) || lineConfidence < 0 || lineConfidence > 1 || !fieldKeys) errors.push("lineTable is invalid.");
    else {
      const invalid = fieldKeys.some((key) => !getDocumentTemplateField(documentType, key)?.collection);
      if (invalid) errors.push("lineTable contains an unavailable line field.");
      else lineTable = { location, confidence: lineConfidence, fieldKeys };
    }
  }
  const unresolved = stringArray(source.unresolved, 100, 240);
  const warnings = stringArray(source.warnings, 100, 400);
  if (!unresolved || !warnings) errors.push("unresolved and warnings must be bounded string arrays.");
  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    analysis: {
      ...(suggestedDocumentType ? { suggestedDocumentType } : {}),
      confidence,
      mappings: Object.freeze(mappings),
      ...(lineTable ? { lineTable } : {}),
      unresolved: Object.freeze(unresolved!),
      warnings: Object.freeze(warnings!),
    },
  };
}
