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
  taxId?: string;
  address?: string;
  city?: string;
  state?: string;
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
export type DocumentType = "INVOICE" | "CREDIT_NOTE" | "RECEIPT" | "STATEMENT" | "PURCHASE_ORDER" | "OTHER";

export interface EmailSourceMetadata {
  sender?: string;
  subject?: string;
  receivedAt?: string;
  attachmentName?: string;
  emailReference?: string;
  gmailMessageId?: string;
  gmailThreadId?: string;
  emailRecordId?: string;
  sourceDocumentId?: string;
  sourceStoragePath?: string;
  rawEmailStoragePath?: string;
}

export interface FieldConfidence {
  invoiceNumber?: number;
  invoiceDate?: number;
  vendorName?: number;
  customerName?: number;
  lineItems?: number;
  grandTotal?: number;
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
}

export interface InvoiceData {
  id: string;
  fileName?: string;
  fileSize?: number;
  fileType?: string;
  previewUrl?: string;
  sourceDocumentId?: string;
  sourceStoragePath?: string;
  sourceEmailId?: string;
  extractionId?: string;

  documentType?: DocumentType | string;
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
  confidence: number;
  reason: string;
  suggestedVendor?: string;
  invoiceNumberHint?: string;
}

export interface GmailAttachmentSummary {
  attachmentId: string;
  partId?: string;
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
  to: string[];
  cc: string[];
  subject: string;
  receivedAt: string;
  snippet: string;
  bodyText: string;
  bodyHtml?: string;
  labels: string[];
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

export interface StoredEmailRecord {
  id: string;
  gmailMessageId: string;
  gmailThreadId?: string;
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
  filename: string;
  mimeType: string;
  size: number;
  storagePath: string;
  sha256: string;
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
