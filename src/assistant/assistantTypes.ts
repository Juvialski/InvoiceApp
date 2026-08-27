export const ASSISTANT_RISK_TIERS = [
  "READ",
  "NAVIGATION",
  "PREPARE",
  "NORMAL_MUTATION",
  "BULK_MUTATION",
  "FINANCIAL_FINALIZATION",
] as const;
export type AssistantRiskTier = (typeof ASSISTANT_RISK_TIERS)[number];

export type AssistantMessageRole = "user" | "assistant" | "tool" | "system";

export interface AssistantContext {
  route?: string;
  companyId: string;
  companyName?: string;
  companyTimezone?: string;
  selectedInvoiceId?: string;
  selectedProjectId?: string;
  selectedRfiId?: string;
  selectedSubmittalId?: string;
  selectedSubmittalRoundId?: string;
  selectedSiteLogId?: string;
  selectedPayrollPeriodId?: string;
  selectedPayrollRunId?: string;
  attendanceDate?: string;
  activeFilters?: Record<string, string | number | boolean | null>;
  currency?: string;
  locale?: string;
  generation: number;
}

export interface AssistantAttachmentInput {
  id?: string;
  fileName: string;
  mimeType: string;
  size: number;
  dataBase64?: string;
  sha256?: string;
}

export interface AssistantAttachmentReference {
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
  kind: "TEXT" | "CSV" | "XLSX" | "IMAGE" | "PDF";
  rowCount?: number;
  warning?: string;
}

export interface AssistantClientAction {
  type: "NAVIGATE" | "OPEN_INVOICE" | "OPEN_PROJECT" | "OPEN_PROJECT_DOCUMENTS" | "OPEN_RFI" | "OPEN_SUBMITTAL" | "OPEN_SITE_LOG" | "OPEN_REVIEW_INVOICE" | "START_TOUR" | "OPEN_PAYROLL_PERIOD" | "OPEN_PAYROLL_RUN" | "OPEN_FINANCIAL_TRANSACTION" | "OPEN_ATTENDANCE_DATE";
  routeId?: string;
  entityId?: string;
  projectId?: string;
  roundId?: string;
  view?: string;
  date?: string;
  tourId?: string;
  label?: string;
}

export interface AssistantPreparedAction {
  id: string;
  toolName: string;
  riskTier: AssistantRiskTier;
  status: "PREPARED" | "CONFIRMED" | "EXECUTED" | "FAILED" | "CANCELLED" | "EXPIRED";
  preview: Record<string, unknown>;
  expiresAt: string;
}

export interface AssistantReference {
  type: "invoice" | "project" | "rfi" | "submittal" | "worker" | "payroll_period" | "payroll_run" | "attendance" | "report" | "help" | "document";
  id?: string;
  label: string;
}

export interface AssistantUsageMetadata {
  model?: string;
  fallbackUsed?: boolean;
  iterations?: number;
  functionCalls?: number;
}

export interface AssistantResponse {
  threadId: string;
  message: string;
  references: AssistantReference[];
  clientActions: AssistantClientAction[];
  preparedActions: AssistantPreparedAction[];
  attachments: AssistantAttachmentReference[];
  usage?: AssistantUsageMetadata;
  contextGeneration: number;
}

export interface AssistantRequest {
  threadId?: string;
  requestId?: string;
  message: string;
  context: AssistantContext;
  attachments?: AssistantAttachmentInput[];
}

export interface AssistantConfirmRequest {
  actionId: string;
  contextGeneration: number;
}

export interface AssistantErrorResponse {
  success: false;
  error: string;
  code?: string;
  reference?: string;
  threadId?: string;
  contextGeneration?: number;
}

export interface AssistantSuccessResponse {
  success: true;
  data: AssistantResponse;
}

export type AssistantApiResponse = AssistantSuccessResponse | AssistantErrorResponse;

export const ASSISTANT_ALLOWED_MIME_TYPES = Object.freeze([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "text/plain",
  "text/csv",
  "application/csv",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
] as const);

export const ASSISTANT_MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const ASSISTANT_MAX_TOTAL_ATTACHMENT_BYTES = 20 * 1024 * 1024;