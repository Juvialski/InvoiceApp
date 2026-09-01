import type {
  EmailIntakeProfile,
  EntityResolutionResult,
  Expense,
  GmailMessageCandidate,
  InvoiceData,
  Vendor,
} from "../types.ts";
import type { FinancialAccount } from "./cashBanking.ts";
import {
  classifyEmailIntakeCandidate,
  parseSenderAddress,
  type EmailIntakeClassification,
  type EmailIntakeDestination,
} from "./emailIntake.ts";
import {
  resolveBatchFinancialAccounts,
  resolveBatchVendors,
} from "./entityResolution.ts";

export type QueueStatus =
  | "DISCOVERED"
  | "PREPARING"
  | "READY_FOR_REVIEW"
  | "NEEDS_REVIEW"
  | "SUSPECTED_DUPLICATE"
  | "FAILED"
  | "COMPLETED";

export type SourcePreservationStatus =
  | "PRESERVED"
  | "PENDING"
  | "FAILED";

export type DuplicateStatus =
  | "NO_KNOWN_DUPLICATE"
  | "SUSPECTED_DUPLICATE"
  | "EXACT_DUPLICATE";

export interface QueueDuplicateEvidence {
  status: DuplicateStatus;
  reasons: string[];
  matchedRecordType?: "INVOICE" | "STATEMENT" | "EXPENSE";
  matchedRecordId?: string;
  matchedRecordLabel?: string;
}

export type EntityMatchStatus =
  | "MATCHED"
  | "POSSIBLE_MATCH"
  | "NEW_ENTITY_PROPOSED"
  | "CONFLICT"
  | "NOT_APPLICABLE";

export interface QueueEntityMatch {
  status: EntityMatchStatus;
  entityType?: "VENDOR" | "FINANCIAL_ACCOUNT";
  entityId?: string;
  entityName?: string;
  confidenceScore?: number;
  summaryLabel: string;
  resolution?: EntityResolutionResult;
}

export interface QueueBatchGroup {
  groupKey: string;
  groupType: "VENDOR" | "FINANCIAL_ACCOUNT" | "SENDER_DOMAIN";
  groupLabel: string;
  memberCount: number;
  isPrimary: boolean;
}

export type QueuePrimaryActionType =
  | "IMPORT_INVOICE"
  | "REVIEW_STATEMENT"
  | "REVIEW_EXPENSE"
  | "RETRY_PREPARATION"
  | "VIEW_EXISTING"
  | "MANUAL_REVIEW";

export interface QueuePrimaryAction {
  type: QueuePrimaryActionType;
  label: string;
  enabled: boolean;
  disabledReason?: string;
}

export interface EmailQueueItem {
  id: string;
  candidate: GmailMessageCandidate;
  subject: string;
  sender: string;
  senderName?: string;
  senderEmail?: string;
  senderDomain?: string;
  receivedAt: string;
  attachmentsCount: number;
  destination: EmailIntakeDestination;
  destinationLabel: string;
  destinationTone: string;
  classification: EmailIntakeClassification;
  queueStatus: QueueStatus;
  statusLabel: string;
  statusTone: "neutral" | "info" | "success" | "warning" | "danger";
  sourcePreservation: SourcePreservationStatus;
  sourcePreservationLabel: string;
  duplicate: QueueDuplicateEvidence;
  entityMatch: QueueEntityMatch;
  batchGroup?: QueueBatchGroup;
  itemErrors: string[];
  isEligibleForBatchPrep: boolean;
  primaryAction: QueuePrimaryAction;
}

export interface QueueSummaryCounts {
  total: number;
  invoices: number;
  statements: number;
  expenses: number;
  needsReview: number;
  suspectedDuplicates: number;
  failures: number;
  readyForReview: number;
  pending: number;
  completed: number;
}

export interface QueueFilters {
  destination?: "ALL" | "INVOICE" | "BANK_STATEMENT" | "EXPENSE" | "UNSUPPORTED";
  status?: "ALL" | QueueStatus;
  duplicateOnly?: boolean;
  searchQuery?: string;
}

export interface QueueContextOptions {
  profiles?: EmailIntakeProfile[];
  invoices?: InvoiceData[];
  expenses?: Expense[];
  vendors?: Vendor[];
  financialAccounts?: FinancialAccount[];
  manualResolutions?: Record<string, EntityResolutionResult>;
  canManageMailbox?: boolean;
  canProcessInvoices?: boolean;
  canImportBankStatements?: boolean;
  canManageExpenses?: boolean;
  itemErrors?: Record<string, string>;
  customAttachmentSelections?: {
    statement?: Record<string, string>;
    expense?: Record<string, string>;
  };
}

export function resolveEffectiveClassification(
  message: GmailMessageCandidate,
  profiles?: EmailIntakeProfile[],
): EmailIntakeClassification {
  const local = classifyEmailIntakeCandidate(message, profiles);
  const stored = message.classification as EmailIntakeClassification | undefined;
  const storedIsAiFallback = Boolean(stored?.reason?.startsWith("Ambiguous metadata classified by AI"));

  if (
    storedIsAiFallback
    && local.suggestedDestination === "UNSUPPORTED"
    && !local.matchedProfileId
    && !local.conflictReason
  ) {
    return stored!;
  }
  return local;
}

export function evaluateDuplicateEvidence(
  message: GmailMessageCandidate,
  destination: EmailIntakeDestination,
  invoices: InvoiceData[] = [],
  expenses: Expense[] = [],
): QueueDuplicateEvidence {
  // 1. Check existing invoices
  if (destination === "INVOICE" || destination === "UNSUPPORTED") {
    const matchingExistingInvoice = invoices.find((inv) => {
      if (inv.sourceMetadata?.gmailMessageId && inv.sourceMetadata.gmailMessageId === message.id) return true;
      if (inv.sourceEmailId && inv.sourceEmailId === message.id) return true;
      return message.attachments.some(
        (att) =>
          (inv.sourceMetadata?.gmailAttachmentId && inv.sourceMetadata.gmailAttachmentId === att.attachmentId) ||
          (inv.fileName && inv.fileName.toLowerCase() === att.filename.toLowerCase() && inv.fileSize === att.size),
      );
    });

    if (matchingExistingInvoice) {
      const isExactMessageOrAttachment =
        (matchingExistingInvoice.sourceMetadata?.gmailMessageId === message.id) ||
        (matchingExistingInvoice.sourceEmailId === message.id) ||
        message.attachments.some(
          (att) => matchingExistingInvoice.sourceMetadata?.gmailAttachmentId === att.attachmentId,
        );

      const label = matchingExistingInvoice.invoiceNumber
        ? `Invoice ${matchingExistingInvoice.invoiceNumber}`
        : `Invoice #${matchingExistingInvoice.id.slice(0, 8)}`;

      return {
        status: isExactMessageOrAttachment ? "EXACT_DUPLICATE" : "SUSPECTED_DUPLICATE",
        reasons: isExactMessageOrAttachment
          ? [`Source email or attachment is already processed as ${label}.`]
          : [`Matching filename and size detected in existing ${label}.`],
        matchedRecordType: "INVOICE",
        matchedRecordId: matchingExistingInvoice.id,
        matchedRecordLabel: label,
      };
    }
  }

  // 2. Check existing expenses
  if (destination === "EXPENSE" || destination === "UNSUPPORTED") {
    const matchingExpense = expenses.find((exp) => {
      if (exp.status === "VOID") return false;
      if (exp.receiptSourceDocumentId && message.attachments.some((att) => att.attachmentId === exp.receiptSourceDocumentId)) {
        return true;
      }
      return false;
    });

    if (matchingExpense) {
      const label = matchingExpense.referenceNumber
        ? `Expense #${matchingExpense.id.slice(0, 8)} (${matchingExpense.referenceNumber})`
        : `Expense #${matchingExpense.id.slice(0, 8)}`;

      return {
        status: "EXACT_DUPLICATE",
        reasons: [`Receipt source is already linked to ${label}.`],
        matchedRecordType: "EXPENSE",
        matchedRecordId: matchingExpense.id,
        matchedRecordLabel: label,
      };
    }
  }

  return {
    status: "NO_KNOWN_DUPLICATE",
    reasons: [],
  };
}

export function evaluateSourcePreservation(
  candidate: GmailMessageCandidate,
  duplicate: QueueDuplicateEvidence,
  itemError?: string,
): SourcePreservationStatus {
  if (itemError && (itemError.toLowerCase().includes("preserv") || itemError.toLowerCase().includes("import failed"))) {
    return "FAILED";
  }

  if (candidate.importStatus === "FAILED") {
    return "FAILED";
  }

  if (candidate.importStatus === "IMPORTED" || duplicate.status === "EXACT_DUPLICATE") {
    return "PRESERVED";
  }

  // Pure Gmail candidate discovered before storage ingestion
  return "PENDING";
}

export function evaluateQueueStatus(
  candidate: GmailMessageCandidate,
  destination: EmailIntakeDestination,
  classification: EmailIntakeClassification,
  duplicate: QueueDuplicateEvidence,
  sourcePreservation: SourcePreservationStatus,
  itemError?: string,
): QueueStatus {
  if (itemError || candidate.importStatus === "FAILED" || sourcePreservation === "FAILED") {
    return "FAILED";
  }

  if (candidate.importStatus === "IMPORTING" || candidate.importStatus === "CLASSIFYING") {
    return "PREPARING";
  }

  if (candidate.importStatus === "IMPORTED") {
    return "COMPLETED";
  }

  if (duplicate.status === "EXACT_DUPLICATE" || duplicate.status === "SUSPECTED_DUPLICATE") {
    return "SUSPECTED_DUPLICATE";
  }

  if (destination === "UNSUPPORTED" || classification.conflictReason) {
    return "NEEDS_REVIEW";
  }

  if (candidate.importStatus === "READY") {
    return "READY_FOR_REVIEW";
  }

  return "DISCOVERED";
}

export function deriveEntityMatch(
  candidate: GmailMessageCandidate,
  destination: EmailIntakeDestination,
  resolution?: EntityResolutionResult,
): QueueEntityMatch {
  if (!resolution) {
    return {
      status: "NOT_APPLICABLE",
      summaryLabel: destination === "UNSUPPORTED" ? "No entity match" : "Entity resolution pending",
    };
  }

  if (resolution.conflicts && resolution.conflicts.length > 0) {
    return {
      status: "CONFLICT",
      entityType: resolution.entityType === "VENDOR" ? "VENDOR" : "FINANCIAL_ACCOUNT",
      entityId: resolution.matchedEntityId,
      entityName: resolution.matchedEntityName,
      confidenceScore: resolution.confidenceScore,
      summaryLabel: `Conflict: ${resolution.conflicts[0]?.label || "Evidence mismatch"}`,
      resolution,
    };
  }

  if (resolution.proposedAction === "LINK_EXISTING" && resolution.matchedEntityName) {
    return {
      status: "MATCHED",
      entityType: resolution.entityType === "VENDOR" ? "VENDOR" : "FINANCIAL_ACCOUNT",
      entityId: resolution.matchedEntityId,
      entityName: resolution.matchedEntityName,
      confidenceScore: resolution.confidenceScore,
      summaryLabel: `Matched ${resolution.entityType === "VENDOR" ? "Vendor" : "Account"}: ${resolution.matchedEntityName}`,
      resolution,
    };
  }

  if (resolution.proposedAction === "ENRICH_EXISTING" && resolution.matchedEntityName) {
    return {
      status: "POSSIBLE_MATCH",
      entityType: resolution.entityType === "VENDOR" ? "VENDOR" : "FINANCIAL_ACCOUNT",
      entityId: resolution.matchedEntityId,
      entityName: resolution.matchedEntityName,
      confidenceScore: resolution.confidenceScore,
      summaryLabel: `Enrich ${resolution.entityType === "VENDOR" ? "Vendor" : "Account"}: ${resolution.matchedEntityName}`,
      resolution,
    };
  }

  if (resolution.proposedAction === "POSSIBLE_DUPLICATE" && resolution.matchedEntityName) {
    return {
      status: "POSSIBLE_MATCH",
      entityType: resolution.entityType === "VENDOR" ? "VENDOR" : "FINANCIAL_ACCOUNT",
      entityId: resolution.matchedEntityId,
      entityName: resolution.matchedEntityName,
      confidenceScore: resolution.confidenceScore,
      summaryLabel: `Possible ${resolution.entityType === "VENDOR" ? "Vendor" : "Account"} match: ${resolution.matchedEntityName}`,
      resolution,
    };
  }

  if (resolution.proposedAction === "CREATE_NEW") {
    return {
      status: "NEW_ENTITY_PROPOSED",
      entityType: resolution.entityType === "VENDOR" ? "VENDOR" : "FINANCIAL_ACCOUNT",
      summaryLabel: `New ${resolution.entityType === "VENDOR" ? "Vendor" : "Account"} proposed (Advisory)`,
      resolution,
    };
  }

  return {
    status: "NOT_APPLICABLE",
    summaryLabel: "Entity check complete",
    resolution,
  };
}

export function determinePrimaryAction(
  destination: EmailIntakeDestination,
  queueStatus: QueueStatus,
  duplicate: QueueDuplicateEvidence,
  permissions: {
    canManageMailbox?: boolean;
    canProcessInvoices?: boolean;
    canImportBankStatements?: boolean;
    canManageExpenses?: boolean;
  },
): QueuePrimaryAction {
  const {
    canManageMailbox = true,
    canProcessInvoices = true,
    canImportBankStatements = false,
    canManageExpenses = true,
  } = permissions;

  if (queueStatus === "COMPLETED" || duplicate.status === "EXACT_DUPLICATE") {
    return {
      type: "VIEW_EXISTING",
      label: duplicate.matchedRecordLabel ? `View ${duplicate.matchedRecordLabel}` : "View processed",
      enabled: true,
    };
  }

  if (queueStatus === "FAILED") {
    return {
      type: "RETRY_PREPARATION",
      label: "Retry preparation",
      enabled: canManageMailbox,
      disabledReason: !canManageMailbox ? "Requires Gmail management permission" : undefined,
    };
  }

  if (destination === "INVOICE") {
    const hasPerms = canManageMailbox && canProcessInvoices;
    return {
      type: "IMPORT_INVOICE",
      label: "Import & extract",
      enabled: hasPerms,
      disabledReason: !hasPerms
        ? !canManageMailbox && !canProcessInvoices
          ? "Requires Gmail + invoice permissions"
          : !canManageMailbox
            ? "Requires Gmail permission"
            : "Requires invoice permission"
        : undefined,
    };
  }

  if (destination === "BANK_STATEMENT") {
    const hasPerms = canManageMailbox && canImportBankStatements;
    return {
      type: "REVIEW_STATEMENT",
      label: "Review statement",
      enabled: hasPerms,
      disabledReason: !hasPerms
        ? !canManageMailbox && !canImportBankStatements
          ? "Requires Gmail + cash import permissions"
          : !canManageMailbox
            ? "Requires Gmail permission"
            : "Requires cash import permission"
        : undefined,
    };
  }

  if (destination === "EXPENSE") {
    const hasPerms = canManageMailbox && canManageExpenses;
    return {
      type: "REVIEW_EXPENSE",
      label: "Review expense",
      enabled: hasPerms,
      disabledReason: !hasPerms
        ? !canManageMailbox && !canManageExpenses
          ? "Requires Gmail + expense permissions"
          : !canManageMailbox
            ? "Requires Gmail permission"
            : "Requires expense permission"
        : undefined,
    };
  }

  return {
    type: "MANUAL_REVIEW",
    label: "Needs review",
    enabled: true,
  };
}

export function deriveEmailQueueItems(
  candidates: GmailMessageCandidate[],
  options: QueueContextOptions = {},
): {
  items: EmailQueueItem[];
  counts: QueueSummaryCounts;
  batchEntityResolutions: Record<string, EntityResolutionResult>;
} {
  const {
    profiles = [],
    invoices = [],
    expenses = [],
    vendors = [],
    financialAccounts = [],
    manualResolutions = {},
    canManageMailbox = true,
    canProcessInvoices = true,
    canImportBankStatements = false,
    canManageExpenses = true,
    itemErrors = {},
  } = options;

  // 1. Prepare candidate entity evidence
  const vendorCandidates = candidates
    .filter((c) => {
      const cls = resolveEffectiveClassification(c, profiles);
      const dest = cls.suggestedDestination || (cls.isInvoiceLike ? "INVOICE" : "UNSUPPORTED");
      return dest === "INVOICE" || dest === "EXPENSE";
    })
    .map((c) => {
      const cls = resolveEffectiveClassification(c, profiles);
      const parsed = parseSenderAddress(c.sender);
      const profile = profiles.find((p) => p.id === cls.matchedProfileId);
      return {
        candidateId: c.id,
        evidence: {
          name: parsed.name || parsed.email || c.sender,
          senderEmail: parsed.email || undefined,
          senderDomain: parsed.domain || undefined,
          matchedProfileId: profile?.id,
          linkedProfileVendorId: profile?.linkedVendorId,
        },
      };
    });

  const statementCandidates = candidates
    .filter((c) => {
      const cls = resolveEffectiveClassification(c, profiles);
      const dest = cls.suggestedDestination || (cls.isInvoiceLike ? "INVOICE" : "UNSUPPORTED");
      return dest === "BANK_STATEMENT";
    })
    .map((c) => {
      const cls = resolveEffectiveClassification(c, profiles);
      const parsed = parseSenderAddress(c.sender);
      const profile = profiles.find((p) => p.id === cls.matchedProfileId);
      return {
        candidateId: c.id,
        evidence: {
          institutionName: parsed.name || c.sender,
          senderEmail: parsed.email || undefined,
          senderDomain: parsed.domain || undefined,
          matchedProfileId: profile?.id,
          linkedProfileAccountId: profile?.linkedFinancialAccountId,
        },
      };
    });

  const vBatch = resolveBatchVendors(vendorCandidates, vendors, profiles);
  const aBatch = resolveBatchFinancialAccounts(statementCandidates, financialAccounts, profiles);

  const batchEntityResolutions: Record<string, EntityResolutionResult> = {
    ...vBatch.resolutions,
    ...aBatch.resolutions,
    ...manualResolutions,
  };

  // Group candidates by sender domain for cross-candidate overlap if not grouped by entity
  const domainGroups: Record<string, string[]> = {};
  for (const c of candidates) {
    const parsed = parseSenderAddress(c.sender);
    if (parsed.domain) {
      domainGroups[parsed.domain] = domainGroups[parsed.domain] || [];
      domainGroups[parsed.domain].push(c.id);
    }
  }

  // 2. Build Queue Items
  const items: EmailQueueItem[] = candidates.map((candidate) => {
    const classification = resolveEffectiveClassification(candidate, profiles);
    const destination: EmailIntakeDestination =
      classification.suggestedDestination || (classification.isInvoiceLike ? "INVOICE" : "UNSUPPORTED");

    const parsedSender = parseSenderAddress(candidate.sender);
    const itemError = itemErrors[candidate.id];
    const errors: string[] = itemError ? [itemError] : [];

    const duplicate = evaluateDuplicateEvidence(candidate, destination, invoices, expenses);
    const sourcePreservation = evaluateSourcePreservation(candidate, duplicate, itemError);
    const queueStatus = evaluateQueueStatus(candidate, destination, classification, duplicate, sourcePreservation, itemError);

    const resolution = batchEntityResolutions[candidate.id];
    const entityMatch = deriveEntityMatch(candidate, destination, resolution);

    // Derive same-batch grouping
    let batchGroup: QueueBatchGroup | undefined;
    if (resolution?.batchGroupId && resolution.groupMemberCount && resolution.groupMemberCount > 1) {
      batchGroup = {
        groupKey: resolution.batchGroupId,
        groupType: resolution.entityType === "VENDOR" ? "VENDOR" : "FINANCIAL_ACCOUNT",
        groupLabel: `Batch: ${resolution.groupMemberCount} items for ${resolution.matchedEntityName || parsedSender.name || "same entity"}`,
        memberCount: resolution.groupMemberCount,
        isPrimary: Boolean(resolution.isGroupPrimary),
      };
    } else if (parsedSender.domain && domainGroups[parsedSender.domain]?.length > 1) {
      const count = domainGroups[parsedSender.domain].length;
      batchGroup = {
        groupKey: `domain:${parsedSender.domain}`,
        groupType: "SENDER_DOMAIN",
        groupLabel: `Batch: ${count} items from ${parsedSender.domain}`,
        memberCount: count,
        isPrimary: domainGroups[parsedSender.domain][0] === candidate.id,
      };
    }

    const primaryAction = determinePrimaryAction(destination, queueStatus, duplicate, {
      canManageMailbox,
      canProcessInvoices,
      canImportBankStatements,
      canManageExpenses,
    });

    const isEligibleForBatchPrep =
      destination !== "UNSUPPORTED" &&
      queueStatus !== "COMPLETED" &&
      queueStatus !== "PREPARING" &&
      duplicate.status !== "EXACT_DUPLICATE" &&
      primaryAction.enabled;

    const destinationLabel =
      destination === "BANK_STATEMENT"
        ? "Bank statement"
        : destination === "INVOICE"
          ? "Invoice"
          : destination === "EXPENSE"
            ? "Receipt"
            : "Needs review";

    const destinationTone =
      destination === "BANK_STATEMENT"
        ? "bg-sky-100 text-sky-800 border-sky-200"
        : destination === "INVOICE"
          ? "bg-emerald-100 text-emerald-700 border-emerald-200"
          : destination === "EXPENSE"
            ? "bg-amber-100 text-amber-800 border-amber-200"
            : "bg-slate-100 text-slate-600 border-slate-200";

    const statusLabel =
      queueStatus === "READY_FOR_REVIEW"
        ? "Ready for review"
        : queueStatus === "PREPARING"
          ? "Preparing"
          : queueStatus === "NEEDS_REVIEW"
            ? "Needs review"
            : queueStatus === "SUSPECTED_DUPLICATE"
              ? "Suspected duplicate"
              : queueStatus === "FAILED"
                ? "Preparation failed"
                : queueStatus === "COMPLETED"
                  ? "Completed"
                  : "Discovered";

    const statusTone =
      queueStatus === "READY_FOR_REVIEW"
        ? "success"
        : queueStatus === "PREPARING"
          ? "info"
          : queueStatus === "NEEDS_REVIEW"
            ? "warning"
            : queueStatus === "SUSPECTED_DUPLICATE"
              ? "warning"
              : queueStatus === "FAILED"
                ? "danger"
                : queueStatus === "COMPLETED"
                  ? "neutral"
                  : "neutral";

    const sourcePreservationLabel =
      sourcePreservation === "PRESERVED"
        ? "Source preserved"
        : sourcePreservation === "FAILED"
          ? "Preservation failed"
          : "Preservation pending";

    return {
      id: candidate.id,
      candidate,
      subject: candidate.subject || "(No subject)",
      sender: candidate.sender,
      senderName: parsedSender.name || undefined,
      senderEmail: parsedSender.email || undefined,
      senderDomain: parsedSender.domain || undefined,
      receivedAt: candidate.receivedAt,
      attachmentsCount: (candidate.attachments || []).length,
      destination,
      destinationLabel,
      destinationTone,
      classification,
      queueStatus,
      statusLabel,
      statusTone,
      sourcePreservation,
      sourcePreservationLabel,
      duplicate,
      entityMatch,
      batchGroup,
      itemErrors: errors,
      isEligibleForBatchPrep,
      primaryAction,
    };
  });

  // 3. Compute Summary Counts
  let invoicesCount = 0;
  let statementsCount = 0;
  let expensesCount = 0;
  let needsReviewCount = 0;
  let suspectedDuplicatesCount = 0;
  let failuresCount = 0;
  let readyForReviewCount = 0;
  let pendingCount = 0;
  let completedCount = 0;

  for (const item of items) {
    if (item.destination === "INVOICE") invoicesCount++;
    else if (item.destination === "BANK_STATEMENT") statementsCount++;
    else if (item.destination === "EXPENSE") expensesCount++;
    else needsReviewCount++;

    if (item.queueStatus === "SUSPECTED_DUPLICATE") suspectedDuplicatesCount++;
    else if (item.queueStatus === "FAILED") failuresCount++;
    else if (item.queueStatus === "READY_FOR_REVIEW") readyForReviewCount++;
    else if (item.queueStatus === "COMPLETED") completedCount++;
    else if (item.queueStatus === "DISCOVERED") pendingCount++;
  }

  const counts: QueueSummaryCounts = {
    total: items.length,
    invoices: invoicesCount,
    statements: statementsCount,
    expenses: expensesCount,
    needsReview: needsReviewCount,
    suspectedDuplicates: suspectedDuplicatesCount,
    failures: failuresCount,
    readyForReview: readyForReviewCount,
    pending: pendingCount,
    completed: completedCount,
  };

  return { items, counts, batchEntityResolutions };
}

export function filterEmailQueueItems(
  items: EmailQueueItem[],
  filters: QueueFilters = {},
): EmailQueueItem[] {
  return items.filter((item) => {
    // 1. Destination filter
    if (filters.destination && filters.destination !== "ALL") {
      if (item.destination !== filters.destination) return false;
    }

    // 2. Queue status filter
    if (filters.status && filters.status !== "ALL") {
      if (item.queueStatus !== filters.status) return false;
    }

    // 3. Duplicate filter
    if (filters.duplicateOnly) {
      if (item.duplicate.status === "NO_KNOWN_DUPLICATE") return false;
    }

    // 4. Search query
    if (filters.searchQuery && filters.searchQuery.trim()) {
      const q = filters.searchQuery.trim().toLowerCase();
      const matchSubject = item.subject.toLowerCase().includes(q);
      const matchSender = item.sender.toLowerCase().includes(q);
      const matchEntity = item.entityMatch.entityName?.toLowerCase().includes(q);
      const matchAttachments = item.candidate.attachments.some((a) => a.filename.toLowerCase().includes(q));
      if (!matchSubject && !matchSender && !matchEntity && !matchAttachments) {
        return false;
      }
    }

    return true;
  });
}
