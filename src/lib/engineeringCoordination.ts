import { engineeringId, type DisciplineType, type EngineeringDocument, type EngineeringDocumentRevision } from "./engineeringDocuments.ts";

export const RFI_STATUSES = ["DRAFT", "OPEN", "ANSWERED", "CLOSED", "VOID"] as const;
export type RfiStatus = (typeof RFI_STATUSES)[number];
export type RfiPriority = "LOW" | "NORMAL" | "HIGH" | "URGENT";
export type RfiResponseType = "RESPONSE" | "CORRECTION" | "NOTE";

export interface EngineeringRfi {
  id: string;
  companyId?: string;
  projectId: string;
  rfiNumber: string;
  subject: string;
  question: string;
  discipline: DisciplineType;
  priority: RfiPriority;
  status: RfiStatus;
  dateRaised: string;
  dueDate?: string;
  assignedUserId?: string;
  createdByUserId?: string;
  createdAt: string;
  updatedAt: string;
  openedAt?: string;
  answeredAt?: string;
  closedAt?: string;
  voidedAt?: string;
  closeVoidReason?: string;
}

export interface EngineeringRfiResponse {
  id: string;
  companyId?: string;
  rfiId: string;
  responseText: string;
  responseType: RfiResponseType;
  isFinalAnswer: boolean;
  createdByUserId?: string;
  createdAt: string;
}

export interface EngineeringRfiDocumentLink {
  id: string;
  companyId?: string;
  rfiId: string;
  responseId?: string;
  documentId: string;
  revisionId: string;
  linkedByUserId?: string;
  createdAt: string;
}

export const SUBMITTAL_STATUSES = ["DRAFT", "SUBMITTED", "UNDER_REVIEW", "APPROVED", "APPROVED_AS_NOTED", "REVISE_AND_RESUBMIT", "REJECTED", "CLOSED", "VOID"] as const;
export type SubmittalStatus = (typeof SUBMITTAL_STATUSES)[number];

export type SubmittalDecision = "APPROVED" | "APPROVED_AS_NOTED" | "REVISE_AND_RESUBMIT" | "REJECTED";

export interface EngineeringSubmittal {
  id: string;
  companyId?: string;
  projectId: string;
  submittalNumber: string;
  title: string;
  discipline: DisciplineType;
  category: string;
  specificationReference?: string;
  dueReviewDate?: string;
  currentRound: number;
  status: SubmittalStatus;
  createdByUserId?: string;
  createdAt: string;
  updatedAt: string;
  submittedAt?: string;
  closedAt?: string;
  voidedAt?: string;
  closeVoidReason?: string;
}

export interface EngineeringSubmittalRound {
  id: string;
  companyId?: string;
  submittalId: string;
  roundNumber: number;
  status: SubmittalStatus;
  dueReviewDate?: string;
  submittedAt?: string;
  completedAt?: string;
  createdByUserId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface EngineeringSubmittalReview {
  id: string;
  companyId?: string;
  submittalId: string;
  roundId: string;
  roundNumber: number;
  decision: SubmittalDecision;
  reviewComments: string;
  reviewedByUserId?: string;
  reviewedAt: string;
}

export interface EngineeringSubmittalDocumentLink {
  id: string;
  companyId?: string;
  submittalId: string;
  roundId: string;
  documentId: string;
  revisionId: string;
  linkedByUserId?: string;
  createdAt: string;
}

export interface EngineeringCoordinationWorkspaceData {
  rfis: EngineeringRfi[];
  rfiResponses: EngineeringRfiResponse[];
  rfiDocumentLinks: EngineeringRfiDocumentLink[];
  submittals: EngineeringSubmittal[];
  submittalRounds: EngineeringSubmittalRound[];
  submittalReviews: EngineeringSubmittalReview[];
  submittalDocumentLinks: EngineeringSubmittalDocumentLink[];
}

export interface RevisionReference {
  documentId: string;
  revisionId: string;
}

export const RFI_TRANSITIONS: Readonly<Record<RfiStatus, readonly RfiStatus[]>> = Object.freeze({
  DRAFT: ["OPEN", "VOID"],
  OPEN: ["ANSWERED", "VOID"],
  ANSWERED: ["CLOSED", "VOID"],
  CLOSED: [],
  VOID: [],
});

export const SUBMITTAL_TRANSITIONS: Readonly<Record<SubmittalStatus, readonly SubmittalStatus[]>> = Object.freeze({
  DRAFT: ["SUBMITTED", "VOID"],
  SUBMITTED: ["UNDER_REVIEW", "APPROVED", "APPROVED_AS_NOTED", "REVISE_AND_RESUBMIT", "REJECTED", "VOID"],
  UNDER_REVIEW: ["APPROVED", "APPROVED_AS_NOTED", "REVISE_AND_RESUBMIT", "REJECTED", "VOID"],
  APPROVED: ["CLOSED", "VOID"],
  APPROVED_AS_NOTED: ["CLOSED", "VOID"],
  REVISE_AND_RESUBMIT: ["SUBMITTED", "VOID"],
  REJECTED: ["CLOSED", "VOID"],
  CLOSED: [],
  VOID: [],
});

function nowIso(now = new Date()): string {
  return now.toISOString();
}

function normalizedCode(value: string, label: string): string {
  const normalized = value.trim().toUpperCase();
  if (!normalized) throw new Error(`${label} is required.`);
  return normalized;
}

function requiredText(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} is required.`);
  return normalized;
}

export function emptyEngineeringCoordinationWorkspaceData(): EngineeringCoordinationWorkspaceData {
  return {
    rfis: [],
    rfiResponses: [],
    rfiDocumentLinks: [],
    submittals: [],
    submittalRounds: [],
    submittalReviews: [],
    submittalDocumentLinks: [],
  };
}

export function canTransitionRfi(from: RfiStatus, to: RfiStatus): boolean {
  return RFI_TRANSITIONS[from].includes(to);
}

export function canTransitionSubmittal(from: SubmittalStatus, to: SubmittalStatus): boolean {
  return SUBMITTAL_TRANSITIONS[from].includes(to);
}

export function createDraftRfi(input: {
  id?: string;
  companyId?: string;
  projectId: string;
  rfiNumber: string;
  subject: string;
  question: string;
  discipline: DisciplineType;
  priority?: RfiPriority;
  dateRaised?: string;
  dueDate?: string;
  assignedUserId?: string;
  createdByUserId?: string;
  now?: Date;
}): EngineeringRfi {
  const timestamp = nowIso(input.now);
  return {
    id: input.id || engineeringId("rfi"),
    companyId: input.companyId,
    projectId: requiredText(input.projectId, "Project"),
    rfiNumber: normalizedCode(input.rfiNumber, "RFI number"),
    subject: requiredText(input.subject, "RFI subject"),
    question: requiredText(input.question, "RFI question"),
    discipline: input.discipline,
    priority: input.priority || "NORMAL",
    status: "DRAFT",
    dateRaised: input.dateRaised || timestamp.slice(0, 10),
    dueDate: input.dueDate || undefined,
    assignedUserId: input.assignedUserId || undefined,
    createdByUserId: input.createdByUserId,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function transitionRfi(rfi: EngineeringRfi, target: RfiStatus, options: { reason?: string; now?: Date } = {}): EngineeringRfi {
  if (!canTransitionRfi(rfi.status, target)) throw new Error(`RFI cannot transition from ${rfi.status} to ${target}.`);
  const timestamp = nowIso(options.now);
  const next: EngineeringRfi = { ...rfi, status: target, updatedAt: timestamp };
  if (target === "OPEN") next.openedAt = timestamp;
  if (target === "ANSWERED") next.answeredAt = timestamp;
  if (target === "CLOSED") {
    next.closedAt = timestamp;
    next.closeVoidReason = options.reason?.trim() || undefined;
  }
  if (target === "VOID") {
    next.voidedAt = timestamp;
    next.closeVoidReason = requiredText(options.reason || "", "Void reason");
  }
  return next;
}

export function appendRfiResponse(
  rfi: EngineeringRfi,
  input: { id?: string; companyId?: string; responseText: string; responseType?: RfiResponseType; isFinalAnswer?: boolean; createdByUserId?: string; now?: Date },
): { rfi: EngineeringRfi; response: EngineeringRfiResponse } {
  if (!["OPEN", "ANSWERED"].includes(rfi.status)) throw new Error("Responses may only be added to an open or answered RFI.");
  const isFinalAnswer = input.isFinalAnswer === true;
  if (isFinalAnswer && rfi.status !== "OPEN") throw new Error("Only an open RFI can receive its final answer.");
  const timestamp = nowIso(input.now);
  return {
    rfi: isFinalAnswer ? transitionRfi(rfi, "ANSWERED", { now: input.now }) : { ...rfi, updatedAt: timestamp },
    response: {
      id: input.id || engineeringId("rfi-response"),
      companyId: input.companyId ?? rfi.companyId,
      rfiId: rfi.id,
      responseText: requiredText(input.responseText, "Response"),
      responseType: input.responseType || "RESPONSE",
      isFinalAnswer,
      createdByUserId: input.createdByUserId,
      createdAt: timestamp,
    },
  };
}

export function createDraftSubmittal(input: {
  id?: string;
  roundId?: string;
  companyId?: string;
  projectId: string;
  submittalNumber: string;
  title: string;
  discipline: DisciplineType;
  category: string;
  specificationReference?: string;
  dueReviewDate?: string;
  createdByUserId?: string;
  now?: Date;
}): { submittal: EngineeringSubmittal; round: EngineeringSubmittalRound } {
  const timestamp = nowIso(input.now);
  const id = input.id || engineeringId("submittal");
  return {
    submittal: {
      id,
      companyId: input.companyId,
      projectId: requiredText(input.projectId, "Project"),
      submittalNumber: normalizedCode(input.submittalNumber, "Submittal number"),
      title: requiredText(input.title, "Submittal title"),
      discipline: input.discipline,
      category: requiredText(input.category, "Submittal category"),
      specificationReference: input.specificationReference?.trim() || undefined,
      dueReviewDate: input.dueReviewDate || undefined,
      currentRound: 1,
      status: "DRAFT",
      createdByUserId: input.createdByUserId,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    round: {
      id: input.roundId || engineeringId("submittal-round"),
      companyId: input.companyId,
      submittalId: id,
      roundNumber: 1,
      status: "DRAFT",
      dueReviewDate: input.dueReviewDate || undefined,
      createdByUserId: input.createdByUserId,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  };
}

export function transitionSubmittal(submittal: EngineeringSubmittal, target: SubmittalStatus, options: { reason?: string; now?: Date } = {}): EngineeringSubmittal {
  if (!canTransitionSubmittal(submittal.status, target)) throw new Error(`Submittal cannot transition from ${submittal.status} to ${target}.`);
  const timestamp = nowIso(options.now);
  const next: EngineeringSubmittal = { ...submittal, status: target, updatedAt: timestamp };
  if (target === "SUBMITTED") next.submittedAt = timestamp;
  if (target === "CLOSED") {
    next.closedAt = timestamp;
    next.closeVoidReason = options.reason?.trim() || undefined;
  }
  if (target === "VOID") {
    next.voidedAt = timestamp;
    next.closeVoidReason = requiredText(options.reason || "", "Void reason");
  }
  return next;
}

export function reviewSubmittalRound(
  submittal: EngineeringSubmittal,
  round: EngineeringSubmittalRound,
  input: { id?: string; companyId?: string; decision: SubmittalDecision; reviewComments: string; reviewedByUserId?: string; now?: Date },
): { submittal: EngineeringSubmittal; round: EngineeringSubmittalRound; review: EngineeringSubmittalReview } {
  if (round.submittalId !== submittal.id || round.roundNumber !== submittal.currentRound) throw new Error("Only the current submittal round may be reviewed.");
  if (!["SUBMITTED", "UNDER_REVIEW"].includes(submittal.status) || !["SUBMITTED", "UNDER_REVIEW"].includes(round.status)) throw new Error("The current round is not available for review.");
  const timestamp = nowIso(input.now);
  return {
    submittal: transitionSubmittal(submittal, input.decision, { now: input.now }),
    round: { ...round, status: input.decision, completedAt: timestamp, updatedAt: timestamp },
    review: {
      id: input.id || engineeringId("submittal-review"),
      companyId: input.companyId ?? submittal.companyId,
      submittalId: submittal.id,
      roundId: round.id,
      roundNumber: round.roundNumber,
      decision: input.decision,
      reviewComments: requiredText(input.reviewComments, "Review comments"),
      reviewedByUserId: input.reviewedByUserId,
      reviewedAt: timestamp,
    },
  };
}

export function createResubmissionRound(
  submittal: EngineeringSubmittal,
  previousRound: EngineeringSubmittalRound,
  input: { id?: string; dueReviewDate?: string; createdByUserId?: string; now?: Date } = {},
): { submittal: EngineeringSubmittal; round: EngineeringSubmittalRound } {
  if (submittal.status !== "REVISE_AND_RESUBMIT" || previousRound.status !== "REVISE_AND_RESUBMIT") throw new Error("A new round requires a revise-and-resubmit decision on the previous round.");
  if (previousRound.roundNumber !== submittal.currentRound) throw new Error("The previous round is not the current formal round.");
  const timestamp = nowIso(input.now);
  const nextRoundNumber = previousRound.roundNumber + 1;
  return {
    submittal: { ...submittal, currentRound: nextRoundNumber, status: "SUBMITTED", submittedAt: timestamp, updatedAt: timestamp },
    round: {
      id: input.id || engineeringId("submittal-round"),
      companyId: submittal.companyId,
      submittalId: submittal.id,
      roundNumber: nextRoundNumber,
      status: "SUBMITTED",
      dueReviewDate: input.dueReviewDate || submittal.dueReviewDate,
      submittedAt: timestamp,
      createdByUserId: input.createdByUserId,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  };
}

export function assertUniqueProjectNumber<T extends { companyId?: string; projectId: string }>(
  records: readonly T[],
  candidate: T,
  numberOf: (record: T) => string,
): void {
  const candidateNumber = numberOf(candidate).trim().toUpperCase();
  if (records.some((record) => record.projectId === candidate.projectId && (record.companyId || "") === (candidate.companyId || "") && numberOf(record).trim().toUpperCase() === candidateNumber)) {
    throw new Error("The register number is already used for this project.");
  }
}

export function validateRevisionReference(
  projectId: string,
  companyId: string | undefined,
  reference: RevisionReference,
  documents: readonly EngineeringDocument[],
  revisions: readonly EngineeringDocumentRevision[],
): { document: EngineeringDocument; revision: EngineeringDocumentRevision } {
  const document = documents.find((item) => item.id === reference.documentId);
  const revision = revisions.find((item) => item.id === reference.revisionId);
  if (!document || !revision) throw new Error("The linked engineering document revision does not exist.");
  if (revision.documentId !== document.id) throw new Error("The linked revision does not belong to the selected document.");
  if (document.projectId !== projectId) throw new Error("The linked engineering document is outside this project.");
  if (companyId && (document.companyId !== companyId || revision.companyId !== companyId)) throw new Error("The linked engineering document revision is outside this company.");
  return { document, revision };
}

export function coordinationProjectSummary(data: EngineeringCoordinationWorkspaceData, projectId: string, today = new Date().toISOString().slice(0, 10)) {
  const rfis = data.rfis.filter((item) => item.projectId === projectId && item.status !== "VOID");
  const submittals = data.submittals.filter((item) => item.projectId === projectId && item.status !== "VOID");
  return {
    openRfis: rfis.filter((item) => item.status === "OPEN").length,
    overdueRfis: rfis.filter((item) => item.status === "OPEN" && Boolean(item.dueDate && item.dueDate < today)).length,
    submittalsPendingReview: submittals.filter((item) => item.status === "SUBMITTED" || item.status === "UNDER_REVIEW").length,
    submittalsRequiringResubmission: submittals.filter((item) => item.status === "REVISE_AND_RESUBMIT").length,
  };
}
