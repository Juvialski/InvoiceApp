export const DOCUMENT_TEMPLATE_SOURCE_CONTEXTS = ["PURCHASE_ORDER", "CLIENT_INVOICE", "PROJECT", "GENERAL"] as const;
export type DocumentTemplateSourceContext = (typeof DOCUMENT_TEMPLATE_SOURCE_CONTEXTS)[number];

export const DOCUMENT_TEMPLATE_CUSTOM_FIELD_TYPES = ["TEXT", "DATE", "NUMBER", "BOOLEAN", "SELECT"] as const;
export type DocumentTemplateCustomFieldType = (typeof DOCUMENT_TEMPLATE_CUSTOM_FIELD_TYPES)[number];
export type DocumentTemplateCatalogFieldType = DocumentTemplateCustomFieldType | "MONEY";

export const DOCUMENT_TEMPLATE_REPEAT_FIELD_SOURCES = ["INPUT", "PROJECT_ASSET"] as const;
export type DocumentTemplateRepeatFieldSource = (typeof DOCUMENT_TEMPLATE_REPEAT_FIELD_SOURCES)[number];

export interface DocumentTemplateCustomFieldDefinition {
  readonly key: string;
  readonly label: string;
  readonly type: DocumentTemplateCustomFieldType;
  readonly required: boolean;
  readonly options?: readonly string[];
}

export interface DocumentTemplateRepeatFieldDefinition {
  readonly key: string;
  readonly label: string;
  readonly type: DocumentTemplateCustomFieldType;
  readonly required: boolean;
  readonly source: DocumentTemplateRepeatFieldSource;
  readonly sourceKey?: "item" | "notes" | "sourceType" | "quantity" | "unit";
}

export interface DocumentTemplateRepeatSectionDefinition {
  readonly key: string;
  readonly label: string;
  readonly source: "INPUT" | "PROJECT_ASSETS";
  readonly fields: readonly DocumentTemplateRepeatFieldDefinition[];
}

export interface DocumentTemplateTypeDefinition {
  readonly key: string;
  readonly displayName: string;
  readonly description?: string;
  readonly category?: string;
  readonly sourceContext: DocumentTemplateSourceContext;
  readonly customFields: readonly DocumentTemplateCustomFieldDefinition[];
  readonly repeatSections: readonly DocumentTemplateRepeatSectionDefinition[];
  readonly outputFileNamePrefix?: string;
  readonly status: "ACTIVE" | "RETIRED";
  readonly schemaVersion?: string;
}

export type DocumentTemplateCatalogFieldSource = "SAFE" | "CUSTOM_INPUT" | "PROJECT_ASSET";

export interface DocumentTemplateCatalogField {
  readonly key: string;
  readonly label: string;
  readonly type: DocumentTemplateCatalogFieldType;
  readonly format: DocumentTemplateCatalogFieldType;
  readonly required: boolean;
  readonly collection: boolean;
  readonly collectionKey?: string;
  readonly source: DocumentTemplateCatalogFieldSource;
  readonly description: string;
}

const TYPE_KEY_PATTERN = /^[A-Za-z][A-Za-z0-9_-]{1,79}$/;
const CUSTOM_FIELD_KEY_PATTERN = /^custom[.][a-z][a-z0-9_]{0,63}$/;
const SIMPLE_KEY_PATTERN = /^[a-z][a-z0-9_]{0,39}$/;
const FILENAME_PREFIX_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/;
const FIELD_DEFINITION_KEYS = new Set(["key", "label", "type", "required", "options"]);
const REPEAT_FIELD_DEFINITION_KEYS = new Set(["key", "label", "type", "required", "source", "sourceKey"]);
const REPEAT_SECTION_DEFINITION_KEYS = new Set(["key", "label", "source", "fields"]);
const DEFINITION_KEYS = new Set(["key", "displayName", "description", "category", "sourceContext", "customFields", "repeatSections", "outputFileNamePrefix", "status", "schemaVersion"]);
const PROJECT_ASSET_KEYS = new Set(["item", "notes", "sourceType", "quantity", "unit"]);

export function isDocumentTemplateTypeKey(value: unknown): value is string {
  return typeof value === "string" && TYPE_KEY_PATTERN.test(value.trim());
}

function boundedText(value: unknown, maximum: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed && trimmed.length <= maximum ? trimmed : undefined;
}

function objectValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function validateCustomField(value: unknown, index: number): { ok: true; field: DocumentTemplateCustomFieldDefinition } | { ok: false; error: string } {
  const source = objectValue(value);
  if (!source) return { ok: false, error: "custom field " + (index + 1) + " must be an object." };
  if (Object.keys(source).some((key) => !FIELD_DEFINITION_KEYS.has(key))) return { ok: false, error: "custom field " + (index + 1) + " contains an unsupported property." };
  const key = typeof source.key === "string" ? source.key.trim() : "";
  const label = boundedText(source.label, 120);
  const type = source.type;
  if (!DOCUMENT_TEMPLATE_CUSTOM_FIELD_TYPES.includes(type as DocumentTemplateCustomFieldType) || !CUSTOM_FIELD_KEY_PATTERN.test(key) || !label || typeof source.required !== "boolean") return { ok: false, error: "custom field " + (index + 1) + " has an invalid key, label, type, or required flag." };
  const rawOptions = source.options;
  if (rawOptions !== undefined && (type !== "SELECT" || !Array.isArray(rawOptions) || rawOptions.length < 1 || rawOptions.length > 20 || rawOptions.some((option) => !boundedText(option, 80)))) return { ok: false, error: "custom field " + (index + 1) + " has invalid select options." };
  return { ok: true, field: { key, label, type: type as DocumentTemplateCustomFieldType, required: source.required, ...(Array.isArray(rawOptions) ? { options: rawOptions.map((option) => String(option).trim()) } : {}) } };
}

function validateRepeatField(value: unknown, sectionIndex: number, fieldIndex: number): { ok: true; field: DocumentTemplateRepeatFieldDefinition } | { ok: false; error: string } {
  const source = objectValue(value);
  if (!source) return { ok: false, error: "repeat section " + (sectionIndex + 1) + " field " + (fieldIndex + 1) + " must be an object." };
  if (Object.keys(source).some((key) => !REPEAT_FIELD_DEFINITION_KEYS.has(key))) return { ok: false, error: "repeat section " + (sectionIndex + 1) + " field " + (fieldIndex + 1) + " contains an unsupported property." };
  const key = typeof source.key === "string" ? source.key.trim() : "";
  const label = boundedText(source.label, 120);
  const type = source.type;
  const sourceKind = source.source;
  const sourceKey = source.sourceKey;
  if (!SIMPLE_KEY_PATTERN.test(key) || !label || !DOCUMENT_TEMPLATE_CUSTOM_FIELD_TYPES.includes(type as DocumentTemplateCustomFieldType) || typeof source.required !== "boolean" || !DOCUMENT_TEMPLATE_REPEAT_FIELD_SOURCES.includes(sourceKind as DocumentTemplateRepeatFieldSource)) return { ok: false, error: "repeat section " + (sectionIndex + 1) + " field " + (fieldIndex + 1) + " is invalid." };
  if (sourceKind === "PROJECT_ASSET" && (typeof sourceKey !== "string" || !PROJECT_ASSET_KEYS.has(sourceKey))) return { ok: false, error: "repeat section " + (sectionIndex + 1) + " field " + (fieldIndex + 1) + " has an invalid project-asset source." };
  if (sourceKind === "INPUT" && sourceKey !== undefined) return { ok: false, error: "repeat section " + (sectionIndex + 1) + " input fields cannot declare a source key." };
  return { ok: true, field: { key, label, type: type as DocumentTemplateCustomFieldType, required: source.required, source: sourceKind as DocumentTemplateRepeatFieldSource, ...(typeof sourceKey === "string" ? { sourceKey: sourceKey as DocumentTemplateRepeatFieldDefinition["sourceKey"] } : {}) } };
}

export function validateDocumentTemplateTypeDefinition(value: unknown): { ok: true; definition: DocumentTemplateTypeDefinition } | { ok: false; errors: readonly string[] } {
  const source = objectValue(value);
  const errors: string[] = [];
  if (!source) return { ok: false, errors: ["The document-template type definition must be an object."] };
  if (Object.keys(source).some((key) => !DEFINITION_KEYS.has(key))) errors.push("The document-template type definition contains an unsupported property.");
  const key = typeof source.key === "string" ? source.key.trim() : "";
  const displayName = boundedText(source.displayName, 160);
  const sourceContext = source.sourceContext;
  const status = source.status === undefined ? "ACTIVE" : source.status;
  if (!TYPE_KEY_PATTERN.test(key)) errors.push("The document-template type key is invalid.");
  if (!displayName) errors.push("The document-template type display name is required.");
  if (!DOCUMENT_TEMPLATE_SOURCE_CONTEXTS.includes(sourceContext as DocumentTemplateSourceContext)) errors.push("The document-template source context is invalid.");
  if (status !== "ACTIVE" && status !== "RETIRED") errors.push("The document-template type status is invalid.");
  if (source.description !== undefined && !boundedText(source.description, 500)) errors.push("The document-template description is invalid.");
  if (source.category !== undefined && !boundedText(source.category, 100)) errors.push("The document-template category is invalid.");
  if (source.outputFileNamePrefix !== undefined && (!boundedText(source.outputFileNamePrefix, 80) || !FILENAME_PREFIX_PATTERN.test(String(source.outputFileNamePrefix).trim()))) errors.push("The document-template output filename prefix is invalid.");

  const customFields: DocumentTemplateCustomFieldDefinition[] = [];
  if (!Array.isArray(source.customFields) || source.customFields.length > 40) errors.push("customFields must contain at most 40 entries.");
  else source.customFields.forEach((field, index) => {
    const validated = validateCustomField(field, index);
    if (validated.ok === false) errors.push(validated.error);
    else customFields.push(validated.field);
  });
  if (new Set(customFields.map((field) => field.key)).size !== customFields.length) errors.push("Custom field keys must be unique.");

  const repeatSections: DocumentTemplateRepeatSectionDefinition[] = [];
  if (!Array.isArray(source.repeatSections) || source.repeatSections.length > 5) errors.push("repeatSections must contain at most five entries.");
  else source.repeatSections.forEach((sectionValue, sectionIndex) => {
    const section = objectValue(sectionValue);
    if (!section || Object.keys(section).some((property) => !REPEAT_SECTION_DEFINITION_KEYS.has(property))) {
      errors.push("repeat section " + (sectionIndex + 1) + " is invalid.");
      return;
    }
    const sectionKey = typeof section.key === "string" ? section.key.trim() : "";
    const label = boundedText(section.label, 120);
    const sourceKind = section.source;
    if (!SIMPLE_KEY_PATTERN.test(sectionKey) || !label || (sourceKind !== "INPUT" && sourceKind !== "PROJECT_ASSETS") || !Array.isArray(section.fields) || section.fields.length < 1 || section.fields.length > 12) {
      errors.push("repeat section " + (sectionIndex + 1) + " has invalid metadata.");
      return;
    }
    const fields: DocumentTemplateRepeatFieldDefinition[] = [];
    section.fields.forEach((field, fieldIndex) => {
      const validated = validateRepeatField(field, sectionIndex, fieldIndex);
      if (validated.ok === false) errors.push(validated.error);
      else fields.push(validated.field);
    });
    if (new Set(fields.map((field) => field.key)).size !== fields.length) errors.push("repeat section " + (sectionIndex + 1) + " field keys must be unique.");
    if (sourceKind === "PROJECT_ASSETS" && fields.some((field) => field.source === "INPUT" && field.type !== "BOOLEAN" && field.type !== "TEXT")) errors.push("repeat section " + (sectionIndex + 1) + " project-asset input fields must be bounded text or boolean fields.");
    repeatSections.push({ key: sectionKey, label, source: sourceKind, fields });
  });
  if (new Set(repeatSections.map((section) => section.key)).size !== repeatSections.length) errors.push("Repeat section keys must be unique.");
  if (sourceContext !== "PROJECT" && repeatSections.some((section) => section.source === "PROJECT_ASSETS")) errors.push("Project-asset repeating sections require the PROJECT source context.");
  if ((sourceContext === "PURCHASE_ORDER" || sourceContext === "CLIENT_INVOICE") && repeatSections.some((section) => section.key === "lines")) errors.push("The lines repeating-section key is reserved for the authoritative financial source.");
  if (errors.length) return { ok: false, errors };
  return { ok: true, definition: Object.freeze({ key, displayName: displayName!, ...(source.description ? { description: String(source.description).trim() } : {}), ...(source.category ? { category: String(source.category).trim() } : {}), sourceContext: sourceContext as DocumentTemplateSourceContext, customFields: Object.freeze(customFields), repeatSections: Object.freeze(repeatSections), ...(source.outputFileNamePrefix ? { outputFileNamePrefix: String(source.outputFileNamePrefix).trim() } : {}), status: status as "ACTIVE" | "RETIRED", schemaVersion: typeof source.schemaVersion === "string" ? source.schemaVersion : "1" }) };
}

const SAFE_FIELDS: readonly DocumentTemplateCatalogField[] = [
  { key: "company.legalName", label: "Company legal name", type: "TEXT", format: "TEXT", required: false, collection: false, source: "SAFE", description: "Approved company identity." },
  { key: "company.address", label: "Company address", type: "TEXT", format: "TEXT", required: false, collection: false, source: "SAFE", description: "Approved company address." },
  { key: "company.contactNumber", label: "Company contact number", type: "TEXT", format: "TEXT", required: false, collection: false, source: "SAFE", description: "Approved company contact number." },
  { key: "company.email", label: "Company email", type: "TEXT", format: "TEXT", required: false, collection: false, source: "SAFE", description: "Approved company email." },
  { key: "company.vatTin", label: "Company VAT/TIN", type: "TEXT", format: "TEXT", required: false, collection: false, source: "SAFE", description: "Approved company tax identifier." },
  { key: "currentUser.name", label: "Current user name", type: "TEXT", format: "TEXT", required: false, collection: false, source: "SAFE", description: "Authenticated current-user display name." },
  { key: "currentUser.title", label: "Current user title", type: "TEXT", format: "TEXT", required: false, collection: false, source: "SAFE", description: "Authenticated current-user title when recorded." },
];

const PROJECT_FIELDS: readonly DocumentTemplateCatalogField[] = [
  { key: "project.projectCode", label: "Project code", type: "TEXT", format: "TEXT", required: false, collection: false, source: "SAFE", description: "Authorized project code." },
  { key: "project.projectName", label: "Project name", type: "TEXT", format: "TEXT", required: true, collection: false, source: "SAFE", description: "Authorized project name." },
  { key: "project.location", label: "Project location", type: "TEXT", format: "TEXT", required: false, collection: false, source: "SAFE", description: "Authorized project location." },
  { key: "project.siteAddress", label: "Project site address", type: "TEXT", format: "TEXT", required: false, collection: false, source: "SAFE", description: "Authorized project site address." },
  { key: "project.clientName", label: "Project client", type: "TEXT", format: "TEXT", required: false, collection: false, source: "SAFE", description: "Authorized project client name." },
  { key: "project.clientReference", label: "Project client reference", type: "TEXT", format: "TEXT", required: false, collection: false, source: "SAFE", description: "Authorized project client reference." },
  { key: "project.billingContactName", label: "Project billing contact", type: "TEXT", format: "TEXT", required: false, collection: false, source: "SAFE", description: "Authorized project billing contact." },
  { key: "project.billingEmail", label: "Project billing email", type: "TEXT", format: "TEXT", required: false, collection: false, source: "SAFE", description: "Authorized project billing email." },
  { key: "project.billingAddress", label: "Project billing address", type: "TEXT", format: "TEXT", required: false, collection: false, source: "SAFE", description: "Authorized project billing address." },
];

const FINANCIAL_COMMON_FIELDS: readonly DocumentTemplateCatalogField[] = [
  { key: "company.paymentInstructions", label: "Company payment instructions", type: "TEXT", format: "TEXT", required: false, collection: false, source: "SAFE", description: "Approved company payment instructions." },
  { key: "processor.name", label: "Prepared / processed by", type: "TEXT", format: "TEXT", required: true, collection: false, source: "SAFE", description: "Authenticated processor captured for the generated document." },
  { key: "processor.title", label: "Processor title", type: "TEXT", format: "TEXT", required: false, collection: false, source: "SAFE", description: "Processor title when recorded." },
  { key: "lines.lineNumber", label: "Line number", type: "NUMBER", format: "NUMBER", required: true, collection: true, collectionKey: "lines", source: "SAFE", description: "Authoritative line ordering." },
  { key: "lines.description", label: "Line description", type: "TEXT", format: "TEXT", required: true, collection: true, collectionKey: "lines", source: "SAFE", description: "Authoritative line description." },
  { key: "lines.quantity", label: "Quantity", type: "NUMBER", format: "NUMBER", required: false, collection: true, collectionKey: "lines", source: "SAFE", description: "Authoritative quantity when present." },
  { key: "lines.unit", label: "Unit", type: "TEXT", format: "TEXT", required: false, collection: true, collectionKey: "lines", source: "SAFE", description: "Authoritative unit of measure when present." },
  { key: "lines.unitPrice", label: "Unit price", type: "MONEY", format: "MONEY", required: false, collection: true, collectionKey: "lines", source: "SAFE", description: "Authoritative unit price when present." },
  { key: "lines.amount", label: "Line amount", type: "MONEY", format: "MONEY", required: true, collection: true, collectionKey: "lines", source: "SAFE", description: "Authoritative line amount." },
  { key: "lines.notes", label: "Line notes", type: "TEXT", format: "TEXT", required: false, collection: true, collectionKey: "lines", source: "SAFE", description: "Authoritative line notes when present." },
];

const PURCHASE_ORDER_FIELDS: readonly DocumentTemplateCatalogField[] = [
  { key: "purchaseOrder.documentNumber", label: "Purchase Order number", type: "TEXT", format: "TEXT", required: true, collection: false, source: "SAFE", description: "Authoritative Purchase Order number." },
  { key: "purchaseOrder.issueDate", label: "Purchase Order date", type: "DATE", format: "DATE", required: false, collection: false, source: "SAFE", description: "Authoritative Purchase Order date." },
  { key: "purchaseOrder.currency", label: "Purchase Order currency", type: "TEXT", format: "TEXT", required: true, collection: false, source: "SAFE", description: "Original source currency." },
  { key: "purchaseOrder.description", label: "Purchase Order description", type: "TEXT", format: "TEXT", required: false, collection: false, source: "SAFE", description: "Authoritative Purchase Order description." },
  { key: "purchaseOrder.notes", label: "Purchase Order notes", type: "TEXT", format: "TEXT", required: false, collection: false, source: "SAFE", description: "Authoritative Purchase Order notes." },
  { key: "purchaseOrder.termsAndConditions", label: "Purchase Order terms", type: "TEXT", format: "TEXT", required: false, collection: false, source: "SAFE", description: "Approved Purchase Order terms." },
  { key: "purchaseOrder.totalAmount", label: "Purchase Order total", type: "MONEY", format: "MONEY", required: true, collection: false, source: "SAFE", description: "Authoritative Purchase Order total." },
  { key: "purchaseOrder.amountInWords", label: "Purchase Order total in words", type: "TEXT", format: "TEXT", required: false, collection: false, source: "SAFE", description: "Snapshot wording for the authoritative total." },
  { key: "supplier.name", label: "Supplier name", type: "TEXT", format: "TEXT", required: true, collection: false, source: "SAFE", description: "Authorized supplier identity." },
  { key: "supplier.address", label: "Supplier address", type: "TEXT", format: "TEXT", required: false, collection: false, source: "SAFE", description: "Authorized supplier address." },
  { key: "supplier.email", label: "Supplier email", type: "TEXT", format: "TEXT", required: false, collection: false, source: "SAFE", description: "Authorized supplier email." },
  { key: "supplier.phone", label: "Supplier phone", type: "TEXT", format: "TEXT", required: false, collection: false, source: "SAFE", description: "Authorized supplier phone." },
  { key: "supplier.vatTin", label: "Supplier VAT/TIN", type: "TEXT", format: "TEXT", required: false, collection: false, source: "SAFE", description: "Authorized supplier tax identifier." },
  { key: "supplier.attention", label: "Supplier attention", type: "TEXT", format: "TEXT", required: false, collection: false, source: "SAFE", description: "Authorized supplier attention line." },
  { key: "project.projectCode", label: "Project code", type: "TEXT", format: "TEXT", required: false, collection: false, source: "SAFE", description: "Project code captured in the Purchase Order snapshot." },
  { key: "project.projectName", label: "Project name", type: "TEXT", format: "TEXT", required: false, collection: false, source: "SAFE", description: "Project name captured in the Purchase Order snapshot." },
  { key: "project.deliverTo", label: "Deliver to / site", type: "TEXT", format: "TEXT", required: false, collection: false, source: "SAFE", description: "Purchase Order delivery location." },
  ...FINANCIAL_COMMON_FIELDS,
];

const CLIENT_INVOICE_FIELDS: readonly DocumentTemplateCatalogField[] = [
  { key: "invoice.documentNumber", label: "Client Invoice number", type: "TEXT", format: "TEXT", required: true, collection: false, source: "SAFE", description: "Authoritative Client Invoice number." },
  { key: "invoice.invoiceDate", label: "Invoice date", type: "DATE", format: "DATE", required: false, collection: false, source: "SAFE", description: "Authoritative invoice date." },
  { key: "invoice.dueDate", label: "Invoice due date", type: "DATE", format: "DATE", required: false, collection: false, source: "SAFE", description: "Authoritative invoice due date." },
  { key: "invoice.paymentTerms", label: "Invoice payment terms", type: "TEXT", format: "TEXT", required: false, collection: false, source: "SAFE", description: "Authoritative invoice payment terms." },
  { key: "invoice.currency", label: "Invoice currency", type: "TEXT", format: "TEXT", required: true, collection: false, source: "SAFE", description: "Original source currency." },
  { key: "invoice.taxTreatment", label: "Tax treatment", type: "TEXT", format: "TEXT", required: false, collection: false, source: "SAFE", description: "Authoritative tax treatment." },
  { key: "invoice.subtotal", label: "Invoice subtotal", type: "MONEY", format: "MONEY", required: true, collection: false, source: "SAFE", description: "Authoritative invoice subtotal." },
  { key: "invoice.taxAmount", label: "Invoice tax amount", type: "MONEY", format: "MONEY", required: false, collection: false, source: "SAFE", description: "Authoritative invoice tax amount when present." },
  { key: "invoice.taxLabel", label: "Invoice tax label", type: "TEXT", format: "TEXT", required: false, collection: false, source: "SAFE", description: "Authoritative invoice tax label." },
  { key: "invoice.totalAmount", label: "Invoice total", type: "MONEY", format: "MONEY", required: true, collection: false, source: "SAFE", description: "Authoritative Client Invoice total." },
  { key: "invoice.amountInWords", label: "Invoice total in words", type: "TEXT", format: "TEXT", required: false, collection: false, source: "SAFE", description: "Snapshot wording for the authoritative total." },
  { key: "invoice.notes", label: "Invoice notes", type: "TEXT", format: "TEXT", required: false, collection: false, source: "SAFE", description: "Authoritative invoice notes." },
  { key: "invoice.termsAndConditions", label: "Invoice terms", type: "TEXT", format: "TEXT", required: false, collection: false, source: "SAFE", description: "Approved invoice terms." },
  { key: "billTo.name", label: "Bill-to client name", type: "TEXT", format: "TEXT", required: true, collection: false, source: "SAFE", description: "Authorized client identity." },
  { key: "billTo.contactName", label: "Bill-to contact", type: "TEXT", format: "TEXT", required: false, collection: false, source: "SAFE", description: "Authorized client billing contact." },
  { key: "billTo.email", label: "Bill-to email", type: "TEXT", format: "TEXT", required: false, collection: false, source: "SAFE", description: "Authorized client billing email." },
  { key: "billTo.address", label: "Bill-to address", type: "TEXT", format: "TEXT", required: false, collection: false, source: "SAFE", description: "Authorized client billing address." },
  { key: "billTo.reference", label: "Client reference", type: "TEXT", format: "TEXT", required: false, collection: false, source: "SAFE", description: "Authorized client reference." },
  { key: "project.projectCode", label: "Project code", type: "TEXT", format: "TEXT", required: false, collection: false, source: "SAFE", description: "Project code captured in the Client Invoice snapshot." },
  { key: "project.projectName", label: "Project name", type: "TEXT", format: "TEXT", required: false, collection: false, source: "SAFE", description: "Project name captured in the Client Invoice snapshot." },
  ...FINANCIAL_COMMON_FIELDS,
];

export function getDocumentTemplateFieldCatalog(typeKey: string, definition?: DocumentTemplateTypeDefinition): readonly DocumentTemplateCatalogField[] {
  const fields = [...SAFE_FIELDS];
  if (definition?.sourceContext === "PROJECT") fields.push(...PROJECT_FIELDS);
  if (definition?.sourceContext === "PURCHASE_ORDER") fields.push(...PURCHASE_ORDER_FIELDS);
  if (definition?.sourceContext === "CLIENT_INVOICE") fields.push(...CLIENT_INVOICE_FIELDS);
  for (const field of definition?.customFields || []) fields.push({ key: field.key, label: field.label, type: field.type, format: field.type, required: field.required, collection: false, source: "CUSTOM_INPUT", description: "Structured input declared by the company document type." });
  for (const section of definition?.repeatSections || []) {
    for (const field of section.fields) fields.push({ key: section.key + "." + field.key, label: section.label + ": " + field.label, type: field.type, format: field.type, required: field.required, collection: true, collectionKey: section.key, source: field.source === "PROJECT_ASSET" ? "PROJECT_ASSET" : "CUSTOM_INPUT", description: field.source === "PROJECT_ASSET" ? "Safe project register context." : "Structured repeating input declared by the company document type." });
  }
  return Object.freeze(fields);
}
