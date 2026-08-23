export interface LineItem {
  id: string;
  itemNumber?: number;
  sku?: string;
  description: string;
  quantity: number;
  unitOfMeasure?: string;
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
  dueDate?: number;
  vendorName?: number;
  vendorTin?: number;
  customerName?: number;
  customerTin?: number;
  currency?: number;
  lineItems?: number;
  subtotal?: number;
  vatAmount?: number;
  grandTotal?: number;
}

export interface ExtractionAttemptSummary {
  attemptNumber: number;
  model: string;
  responseParsed: boolean;
  qualityScore?: number;
  completenessScore?: number;
  lineItemCount?: number;
  selected?: boolean;
  automatic?: boolean;
  reason?: string;
}

export interface ExtractionQuality {
  score: number;
  completeness: number;
  status: "GOOD" | "NEEDS_REVIEW";
  requiresRetry: boolean;
  reasons: string[];
  criticalMissing: string[];
  lineItemCount: number;
  populatedFieldCount: number;
  reconciliation: {
    lineItems: "PASS" | "REVIEW" | "NOT_APPLICABLE";
    subtotal: "PASS" | "REVIEW" | "NOT_APPLICABLE";
    grandTotal: "PASS" | "REVIEW" | "NOT_APPLICABLE";
    balance: "PASS" | "REVIEW" | "NOT_APPLICABLE";
    philippineVat: "PASS" | "REVIEW" | "NOT_APPLICABLE";
  };
  attemptCount?: number;
  fallbackUsed?: boolean;
  selectedAttempt?: number;
  attempts?: ExtractionAttemptSummary[];
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
  projectReference?: string;
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
  extractionQuality?: ExtractionQuality;
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
  retryReason?: "automatic-quality" | "manual" | "request-failure";
  extractionFocus?: string;
}

export interface OriginalSourcePayload {
  fileData?: string;
  mimeType?: string;
  textData?: string;
  fileName?: string;
  previewUrl?: string;
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

// Engineering project-costing domain. These records deliberately remain
// separate from the invoice extraction model so the existing intake and
// review workflow can evolve without making project assignment mandatory.
export type ProjectStatus = "PLANNING" | "ACTIVE" | "ON_HOLD" | "COMPLETED" | "CANCELLED" | "ARCHIVED";
export type AllocationType = "AMOUNT" | "PERCENTAGE";

export interface Project {
  id: string;
  userId?: string;
  projectCode: string;
  projectName: string;
  description?: string;
  clientName?: string;
  clientReference?: string;
  location?: string;
  siteAddress?: string;
  projectManager?: string;
  status: ProjectStatus;
  startDate?: string;
  targetEndDate?: string;
  actualEndDate?: string;
  contractValue?: number;
  projectBudget: number;
  currency: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string;
}

export interface InvoiceProjectAllocation {
  id: string;
  invoiceId: string;
  projectId: string;
  allocationType: AllocationType;
  allocationPercentage?: number;
  allocationAmount: number;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}

export type ExpenseStatus = "DRAFT" | "APPROVED" | "PAID" | "VOID";

export interface Expense {
  id: string;
  userId?: string;
  projectId?: string;
  expenseDate: string;
  category: string;
  description: string;
  payee?: string;
  amount: number;
  currency: string;
  paymentMethod?: string;
  referenceNumber?: string;
  status: ExpenseStatus;
  receiptSourceDocumentId?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string;
}

export type EmploymentType = "REGULAR" | "PROJECT_BASED" | "CONTRACTUAL" | "DAILY" | "HOURLY" | "OTHER";
export type EmploymentStatus = "ACTIVE" | "INACTIVE" | "ONBOARDING" | "OFFBOARDED";
export type PayType = "MONTHLY" | "DAILY" | "HOURLY";
export type PayrollPeriodStatus = "DRAFT" | "OPEN" | "CALCULATED" | "APPROVED" | "PAID" | "VOID";
export type PayrollRunStatus = "DRAFT" | "CALCULATED" | "APPROVED" | "PAID" | "VOID";
export type WorkEntryStatus = "DRAFT" | "SUBMITTED" | "APPROVED" | "VOID";
export type PayrollLaborContextType = "PROJECT" | "ADMIN_OFFICE" | "GENERAL_OVERHEAD" | "UNALLOCATED_REVIEW";

export interface PayrollLaborContext {
  type: PayrollLaborContextType;
  projectId?: string;
  costCenterId?: string;
  label?: string;
  needsReview: boolean;
}

export interface Worker {
  id: string;
  userId?: string;
  authUserId?: string;
  employeeCode: string;
  firstName: string;
  middleName?: string;
  lastName: string;
  displayName: string;
  employmentType: EmploymentType;
  employmentStatus?: EmploymentStatus;
  jobTitle?: string;
  department?: string;
  departmentId?: string;
  managerWorkerId?: string;
  defaultPayType: PayType;
  defaultRate: number;
  active: boolean;
  hireDate?: string;
  endDate?: string;
  workingDays?: string[];
  workingHoursStart?: string;
  workingHoursEnd?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string;
}

export interface ProjectWorkerAssignment {
  id: string;
  workerId: string;
  projectId: string;
  startDate: string;
  endDate?: string;
  payType?: PayType;
  rate?: number;
  roleOnProject?: string;
  active: boolean;
  notes?: string;
}

export interface PayrollPeriod {
  id: string;
  userId?: string;
  periodStart: string;
  periodEnd: string;
  payDate?: string;
  scheduleId?: string;
  scheduleVersionId?: string;
  autoGenerated?: boolean;
  lockedAt?: string;
  status: PayrollPeriodStatus;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Department {
  id: string;
  userId?: string;
  name: string;
  description?: string;
  managerWorkerId?: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string;
}

export interface WorkEntry {
  id: string;
  workerId: string;
  projectId: string;
  /** Optional for legacy local rows; new persisted entries must link a period. */
  periodId?: string;
  workDate: string;
  regularHours?: number;
  overtimeHours?: number;
  daysWorked?: number;
  rate: number;
  overtimeRate?: number;
  description?: string;
  notes?: string;
  status: WorkEntryStatus;
}

export interface PayrollRun {
  id: string;
  userId?: string;
  periodId: string;
  importBatchId?: string;
  status: PayrollRunStatus;
  createdAt: string;
  calculatedAt?: string;
  approvedAt?: string;
  paidAt?: string;
  notes?: string;
}

export interface PayrollEntry {
  id: string;
  payrollRunId: string;
  workerId: string;
  basePay: number;
  regularPay: number;
  overtimePay: number;
  allowances: number;
  otherEarnings?: number;
  grossPay: number;
  deductions: number;
  otherDeductions?: number;
  employerCosts?: number;
  netPay: number;
  costContext?: PayrollLaborContext;
  importRowId?: string;
  projectAllocatedCost: number;
  calculationSnapshot?: Record<string, unknown>;
  createdAt?: string;
}

export type PayrollAllocationSource = "TIME_ENTRY" | "MANUAL" | "DEFAULT_ASSIGNMENT" | "IMPORT";

export interface PayrollProjectAllocation {
  id: string;
  payrollEntryId: string;
  projectId: string;
  allocationAmount: number;
  allocationPercentage?: number;
  source: PayrollAllocationSource;
}

export interface PayrollAdjustment {
  id: string;
  payrollEntryId: string;
  type: "EARNING" | "DEDUCTION" | "EMPLOYER_COST";
  code?: string;
  description?: string;
  amount: number;
}

export interface PayrollValidationResult {
  valid: boolean;
  issues: string[];
}

export interface ProjectCostSummary {
  projectId?: string;
  budget: number;
  invoiceCost: number;
  paidInvoiceCost: number;
  unpaidInvoiceCost: number;
  unallocatedPayrollCost: number;
  pendingInvoiceCost: number;
  payrollCost: number;
  pendingPayrollCost: number;
  otherExpenseCost: number;
  pendingExpenseCost: number;
  totalActualCost: number;
  committedCost: number;
  remainingBudget: number;
  budgetUsedPercent: number;
  foreignCosts: Record<string, number>;
  unallocatedInvoiceCost: number;
  unallocatedExpenseCost: number;
}
