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
export type InvoiceLifecycleStatus = "ACTIVE" | "VOID";
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
  duplicateReasons?: string[];
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
  duplicateReasons?: string[];

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
  lifecycleStatus?: InvoiceLifecycleStatus;
  voidedAt?: string;
  voidedByUserId?: string;
  voidReason?: string;
  exportedAt?: string;
  /** Database optimistic-concurrency token for persisted invoice edits. */
  updatedAt?: string;
  aiSnapshot?: Partial<InvoiceData>;
  entityResolution?: EntityResolutionResult;
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
  matchedProfileId?: string;
  matchedProfileName?: string;
  conflictReason?: string;
}

export type EmailIntakeProfileDestination = "INVOICE" | "BANK_STATEMENT" | "EXPENSE";

export interface EmailIntakeProfile {
  id: string;
  companyId: string;
  name: string;
  enabled: boolean;
  senderEmail?: string;
  senderDomain?: string;
  subjectContains?: string;
  attachmentCondition?: string;
  suggestedDestination: EmailIntakeProfileDestination;
  linkedVendorId?: string;
  linkedFinancialAccountId?: string;
  statementParserProfile?: string;
  expectedInstitution?: string;
  expectedCurrency?: string;
  defaultExpenseCategory?: string;
  createdByUserId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface EmailIntakeProfileInput {
  id?: string;
  name: string;
  enabled?: boolean;
  senderEmail?: string;
  senderDomain?: string;
  subjectContains?: string;
  attachmentCondition?: string;
  suggestedDestination: EmailIntakeProfileDestination;
  linkedVendorId?: string;
  linkedFinancialAccountId?: string;
  statementParserProfile?: string;
  expectedInstitution?: string;
  expectedCurrency?: string;
  defaultExpenseCategory?: string;
}

export interface Vendor {
  id: string;
  companyId?: string;
  name: string;
  normalizedName: string;
  email?: string | null;
  phone?: string | null;
  taxId?: string | null;
  address?: string | null;
  defaultCurrency?: string | null;
  defaultCategory?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export type EntityResolutionType = "VENDOR" | "FINANCIAL_ACCOUNT";

export type EntityResolutionAction =
  | "LINK_EXISTING"
  | "ENRICH_EXISTING"
  | "CREATE_NEW"
  | "POSSIBLE_DUPLICATE"
  | "NEEDS_REVIEW";

export type EntityResolutionConfidence = "HIGH" | "MEDIUM" | "LOW";

export interface EntityResolutionConflict {
  field: string;
  label: string;
  existingValue?: string;
  candidateValue?: string;
  reason: string;
}

export interface EntityResolutionEnrichmentField {
  field: string;
  label: string;
  currentValue?: string;
  proposedValue: string;
}

export interface VendorIdentityEvidence {
  name: string;
  companyName?: string;
  registeredName?: string;
  tradeName?: string;
  taxId?: string;
  email?: string;
  phone?: string;
  address?: string;
  senderEmail?: string;
  senderDomain?: string;
  matchedProfileId?: string;
  matchedProfileName?: string;
  linkedProfileVendorId?: string;
}

export interface FinancialAccountIdentityEvidence {
  institutionName?: string;
  institutionCode?: string;
  accountNumber?: string;
  maskedIdentifier?: string;
  currency?: string;
  displayName?: string;
  senderEmail?: string;
  senderDomain?: string;
  matchedProfileId?: string;
  matchedProfileName?: string;
  linkedProfileAccountId?: string;
}

export interface EntityResolutionResult {
  entityType: EntityResolutionType;
  candidateId: string;
  proposedAction: EntityResolutionAction;
  confidence: EntityResolutionConfidence;
  confidenceScore: number;
  matchedEntityId?: string;
  matchedEntityName?: string;
  matchedEntityDetails?: Record<string, string | number | boolean | null | undefined>;
  batchGroupId?: string;
  isGroupPrimary?: boolean;
  groupMemberCount?: number;
  matchReasons: string[];
  conflicts: EntityResolutionConflict[];
  proposedEnrichments: EntityResolutionEnrichmentField[];
  extractedEvidence: Record<string, any>;
  normalizedEvidence: Record<string, string>;
  sourceReference?: {
    messageId?: string;
    subject?: string;
    sender?: string;
    fileName?: string;
    attachmentId?: string;
  };
}

export interface BatchEntityResolutionSummary {
  vendorResolutions: Record<string, EntityResolutionResult>;
  financialAccountResolutions: Record<string, EntityResolutionResult>;
  vendorGroups: Record<string, string[]>;
  financialAccountGroups: Record<string, string[]>;
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
  authError?: string;
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
  storageProvider?: string;
  storageBucket?: string;
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
  archivedFromStatus?: Exclude<ProjectStatus, "ARCHIVED">;
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
  voidedAt?: string;
  voidedByUserId?: string;
  voidReason?: string;
}

export type EmploymentType = "REGULAR" | "PROJECT_BASED" | "CONTRACTUAL" | "DAILY" | "HOURLY" | "OTHER";
export type EmploymentStatus = "ACTIVE" | "INACTIVE" | "ONBOARDING" | "OFFBOARDED";
export type PayType = "MONTHLY" | "DAILY" | "HOURLY";
export type PayrollPeriodStatus = "DRAFT" | "OPEN" | "CALCULATED" | "APPROVED" | "PAID" | "VOID";
export type PayrollRunStatus = "DRAFT" | "CALCULATED" | "APPROVED" | "PAID" | "VOID";
export type WorkEntryStatus = "DRAFT" | "SUBMITTED" | "APPROVED" | "VOID";
export type PayrollLaborContextType = "PROJECT" | "ADMIN_OFFICE" | "GENERAL_OVERHEAD" | "UNALLOCATED_REVIEW";
export type AttendanceStatus = "PRESENT" | "ABSENT" | "PARTIAL" | "ON_LEAVE" | "REST_DAY" | "HOLIDAY" | "OFFICIAL_BUSINESS";

export type LeaveStatus = "DRAFT" | "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";
export type AttendanceRecordStatus = "DRAFT" | "CONFIRMED" | "VOID";
export type AttendanceSource = "MANUAL" | "BULK" | "IMPORT" | "SYSTEM" | "LEAVE";
export type LeavePartialDay = "FULL" | "AM" | "PM";
export type OvertimeStatus = "DRAFT" | "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";
export type OvertimeSource = "MANUAL" | "IMPORT" | "SYSTEM" | "LEGACY_WORK_ENTRY";
/** First-class daily presence record. One active row is allowed per worker/date/company. */
export interface AttendanceRecord {
  id: string;
  companyId?: string;
  workerId: string;
  periodId?: string;
  attendanceDate: string;
  scheduledStart?: string;
  scheduledEnd?: string;
  scheduledMinutes: number;
  breakMinutes: number;
  actualTimeIn?: string;
  actualTimeOut?: string;
  regularMinutes: number;
  lateMinutes: number;
  undertimeMinutes: number;
  overtimeMinutes: number;
  paidDayFraction: number;
  attendanceStatus: AttendanceStatus;
  recordStatus: AttendanceRecordStatus;
  source: AttendanceSource;
  notes?: string;
  voidedAt?: string;
  voidReason?: string;
  createdBy?: string;
  updatedBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface LeaveRequest {
  id: string;
  companyId?: string;
  workerId: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  partialDay?: LeavePartialDay;
  /** Explicit configuration only; undefined means pay treatment is unknown. */
  paid?: boolean;
  status: LeaveStatus;
  notes?: string;
  cancelledAt?: string;
  cancellationReason?: string;
  createdBy?: string;
  updatedBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface OvertimeRequest {
  id: string;
  companyId?: string;
  workerId: string;
  periodId?: string;
  overtimeDate: string;
  projectId?: string;
  laborContext?: PayrollLaborContextType;
  requestedMinutes: number;
  approvedMinutes: number;
  reason?: string;
  status: OvertimeStatus;
  approvedBy?: string;
  approvedAt?: string;
  notes?: string;
  source: OvertimeSource;
  cancelledAt?: string;
  cancellationReason?: string;
  createdBy?: string;
  updatedBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PayrollHoliday {
  id: string;
  companyId?: string;
  holidayDate: string;
  name: string;
  category?: string;
  notes?: string;
  active: boolean;
  createdBy?: string;
  updatedBy?: string;
  createdAt: string;
  updatedAt: string;
}

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
  /** The worker's home context; actual work entries remain authoritative. */
  defaultLaborContext?: PayrollLaborContextType;
  /** Convenience only; must be absent for office, overhead, and review contexts. */
  defaultProjectId?: string;
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
  /** Monotonic revision of attendance, leave, overtime, labor, and compensation sources. */
  sourceRevision?: number;
  sourceRevisionUpdatedAt?: string;
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
  /** Required only when laborContext is PROJECT. */
  projectId?: string;
  laborContext?: PayrollLaborContextType;
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
  voidedAt?: string;
  voidReason?: string;
}

export interface PayrollRun {
  id: string;
  userId?: string;
  periodId: string;
  importBatchId?: string;
  status: PayrollRunStatus;
  createdAt: string;
  calculatedAt?: string;
  /** Source revision/fingerprint captured by the last calculation. */
  calculatedSourceRevision?: number;
  sourceFingerprint?: string;
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
