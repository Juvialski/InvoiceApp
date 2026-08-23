export interface LineItem {
  id: string;
  itemNumber?: number;
  sku?: string;
  description: string;
  quantity: number;
  unitPrice: number;
  discount?: number;
  taxRate?: number;
  taxAmount?: number;
  taxTreatment?: "VATABLE" | "ZERO_RATED" | "VAT_EXEMPT" | "NON_VAT" | "UNKNOWN" | string;
  total: number;
}

export interface TaxBreakdown {
  name: string;
  rate?: number;
  amount: number;
}

export interface PartyDetails {
  name: string;
  companyName?: string;
  registeredName?: string;
  tradeName?: string;
  taxId?: string;
  branchCode?: string;
  taxRegistration?: "VAT" | "NON_VAT" | "UNKNOWN" | string;
  address?: string;
  city?: string;
  cityMunicipality?: string;
  state?: string;
  province?: string;
  barangay?: string;
  region?: string;
  postalCode?: string;
  country?: string;
  email?: string;
  phone?: string;
  website?: string;
}

export type SourceType = "UPLOAD" | "PASTED_TEXT" | "EMAIL" | "SAMPLE";
export type ProcessingStatus = "NEW" | "EXTRACTING" | "EXTRACTED" | "FAILED";
export type ReviewStatus = "NEEDS_REVIEW" | "VERIFIED";
export type DuplicateStatus = "UNIQUE" | "POSSIBLE_DUPLICATE";
export type DocumentType = "INVOICE" | "CREDIT_NOTE" | "RECEIPT" | "STATEMENT" | "PURCHASE_ORDER" | "SUPPLEMENTARY_DOCUMENT" | "UNKNOWN" | "OTHER";
export type InvoiceSubtype = "VAT_INVOICE" | "NON_VAT_INVOICE" | "SERVICE_INVOICE" | "SALES_INVOICE" | "COMMERCIAL_INVOICE" | "CASH_INVOICE" | "CHARGE_INVOICE" | "CREDIT_INVOICE" | "UNKNOWN" | string;

export interface PhilippineTaxDetails {
  invoiceKind?: "VAT_INVOICE" | "NON_VAT_INVOICE" | "UNKNOWN";
  sellerRegistration?: "VAT" | "NON_VAT" | "UNKNOWN";
  vatableSales?: number;
  vatAmount?: number;
  zeroRatedSales?: number;
  vatExemptSales?: number;
  salesSubjectToPercentageTax?: number;
  authorityToPrintNumber?: string;
  outboundCorrespondenceNumber?: string;
  permitToUseNumber?: string;
  approvedSerialFrom?: string;
  approvedSerialTo?: string;
  birPermitDetailsRaw?: string;
  withholdingTaxRate?: number;
  withholdingTaxAmount?: number;
  netAmountPayable?: number;
  vatInclusive?: boolean;
}

export type CompletenessItemStatus = "COMPLETE" | "REVIEW" | "MISSING_INFORMATION" | "NOT_APPLICABLE";

export interface PhilippineInvoiceCompletenessItem {
  id: string;
  label: string;
  status: CompletenessItemStatus;
  field?: string;
  note?: string;
}

export interface PhilippineInvoiceCompleteness {
  status: "COMPLETE" | "REVIEW" | "MISSING_INFORMATION" | "NOT_APPLICABLE";
  items: PhilippineInvoiceCompletenessItem[];
  disclaimer: string;
}

export interface EmailSourceMetadata {
  sender?: string;
  subject?: string;
  receivedAt?: string;
  attachmentName?: string;
  emailReference?: string;
  gmailMessageId?: string;
  gmailThreadId?: string;
  gmailAttachmentId?: string;
  emailRecordId?: string;
  sourceDocumentId?: string;
  sourceStoragePath?: string;
  sourceSha256?: string;
  rawEmailStoragePath?: string;
}

export interface FieldConfidence {
  invoiceNumber?: number;
  invoiceDate?: number;
  vendorName?: number;
  customerName?: number;
  lineItems?: number;
  grandTotal?: number;
  vendorTin?: number;
  vatAmount?: number;
  currency?: number;
}

export interface ValidationIssue {
  id: string;
  severity: "info" | "warning" | "error";
  field: string;
  message: string;
  expected?: number | string;
  actual?: number | string;
}

export interface ValidationSummary {
  status: "PASS" | "REVIEW";
  issues: ValidationIssue[];
  calculatedSubtotal?: number;
  calculatedGrandTotal?: number;
  calculatedBalanceDue?: number;
  philippineVat?: {
    applicable: boolean;
    status: "PASS" | "REVIEW" | "NOT_APPLICABLE";
    expectedVat?: number;
    documentVat?: number;
    difference?: number;
  };
}

export interface InvoiceData {
  id: string;
  fileName?: string;
  fileSize?: number;
  fileType?: string;
  previewUrl?: string;
  sourceDocumentId?: string;
  sourceStoragePath?: string;
  sourceSha256?: string;
  sourceEmailId?: string;
  extractionId?: string;

  documentType?: DocumentType | string;
  invoiceSubtype?: InvoiceSubtype;
  sourceType?: SourceType;
  sourceMetadata?: EmailSourceMetadata;
  processingStatus?: ProcessingStatus;
  reviewStatus?: ReviewStatus;
  duplicateStatus?: DuplicateStatus;
  duplicateOfId?: string;

  invoiceNumber: string;
  invoiceDate: string;
  dueDate?: string;
  purchaseOrderNumber?: string;
  currency: string;
  currencySymbol?: string;
  paymentTerms?: string;
  status?: "PAID" | "PARTIALLY_PAID" | "UNPAID" | "OVERDUE" | "DRAFT" | "PENDING" | string;

  vendor: PartyDetails;
  customer: PartyDetails;
  shippingAddress?: PartyDetails;
  items: LineItem[];

  subtotal: number;
  totalDiscount?: number;
  taxBreakdown?: TaxBreakdown[];
  totalTax: number;
  shippingFee?: number;
  otherFees?: number;
  grandTotal: number;
  amountPaid?: number;
  balanceDue?: number;
  withholdingTaxRate?: number;
  withholdingTaxAmount?: number;
  netAmountPayable?: number;

  philippineTaxDetails?: PhilippineTaxDetails;
  philippineInvoiceCompleteness?: PhilippineInvoiceCompleteness;

  notes?: string;
  termsAndConditions?: string;
  category?: string;
  costCenter?: string;
  accountCode?: string;

  extractedAt: string;
  modelUsed: string;
  confidenceScore?: number;
  fieldConfidence?: FieldConfidence;
  validation?: ValidationSummary;
  rawJson?: string;
  verifiedAt?: string;
  archivedAt?: string;
  exportedAt?: string;
  aiSnapshot?: Partial<InvoiceData>;
}

export interface ExtractionRequest {
  fileData?: string;
  mimeType?: string;
  textData?: string;
  fileName?: string;
  model?: string;
  sourceType?: SourceType;
  emailContext?: EmailSourceMetadata & { body?: string };
}

export interface ExtractionResponse {
  success: boolean;
  data?: InvoiceData;
  error?: string;
}

export interface EmailClassification {
  isInvoiceLike: boolean;
  documentType: DocumentType | string;
  invoiceSubtype?: InvoiceSubtype;
  confidence: number;
  reason: string;
  suggestedVendor?: string;
  invoiceNumberHint?: string;
}

export interface GmailAttachmentSummary {
  attachmentId: string;
  partId?: string;
  attachmentIndex?: number;
  filename: string;
  mimeType: string;
  size: number;
}

export interface GmailMessageCandidate {
  id: string;
  threadId: string;
  historyId?: string;
  internalDate?: string;
  sender: string;
  senderName?: string;
  senderEmail?: string;
  to: string[];
  cc: string[];
  subject: string;
  receivedAt: string;
  snippet: string;
  bodyText: string;
  bodyHtml?: string;
  labels: string[];
  hasAttachments?: boolean;
  attachments: GmailAttachmentSummary[];
  classification?: EmailClassification;
  importStatus?: "NEW" | "CLASSIFYING" | "READY" | "IGNORED" | "IMPORTING" | "IMPORTED" | "FAILED";
}

export interface GmailImportedAttachment extends GmailAttachmentSummary {
  dataBase64: string;
}

export interface GmailImportedMessage extends GmailMessageCandidate {
  rawBase64Url?: string;
  attachments: GmailImportedAttachment[];
}

export interface GmailConnectionInfo {
  configured: boolean;
  signedIn: boolean;
  hasGmailToken: boolean;
  email?: string;
  displayName?: string;
  lastSyncedAt?: string;
  lastHistoryId?: string;
}

export interface GmailScanWindow {
  days?: number;
  after?: string;
  before?: string;
}

export interface StoredEmailRecord {
  id: string;
  gmailMessageId: string;
  gmailThreadId?: string;
  senderName?: string;
  senderEmail?: string;
  subject: string;
  sender: string;
  receivedAt?: string;
  bodyText?: string;
  bodyHtml?: string;
  rawStoragePath?: string;
}

export interface StoredSourceDocument {
  id: string;
  emailMessageId?: string;
  gmailAttachmentId?: string;
  gmailPartId?: string;
  attachmentIndex?: number;
  filename: string;
  mimeType: string;
  size: number;
  storagePath: string;
  sha256: string;
  processingStatus?: string;
  documentType?: string;
  previewUrl?: string;
}

export interface ReviewEvent {
  id: string;
  invoiceId: string;
  eventType: string;
  fieldName?: string;
  previousValue?: unknown;
  newValue?: unknown;
  createdAt: string;
}
