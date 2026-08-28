import { getActiveCompanyId, requireActiveCompanyId } from "./companyContext.ts";
import { supabase } from "./supabase.ts";
import {
  emptyEngineeringCoordinationWorkspaceData,
  type EngineeringCoordinationWorkspaceData,
  type EngineeringRfi,
  type EngineeringRfiDocumentLink,
  type EngineeringRfiResponse,
  type EngineeringSubmittal,
  type EngineeringSubmittalDocumentLink,
  type EngineeringSubmittalReview,
  type EngineeringSubmittalRound,
  type RevisionReference,
  type RfiResponseType,
  type SubmittalDecision,
} from "./engineeringCoordination.ts";
import type { DisciplineType } from "./engineeringDocuments.ts";

export const ENGINEERING_COORDINATION_STORAGE_KEY = "invoice_engineering_coordination_workspace_v1";
type Row = Record<string, unknown>;

function text(value: unknown): string | undefined {
  return value === null || value === undefined || value === "" ? undefined : String(value);
}

function numberValue(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function rfiFromRow(row: Row): EngineeringRfi {
  return {
    id: String(row.id), companyId: text(row.company_id), projectId: String(row.project_id), rfiNumber: String(row.rfi_number || ""),
    subject: String(row.subject || ""), question: String(row.question || ""), discipline: String(row.discipline || "GENERAL_ENGINEERING") as EngineeringRfi["discipline"],
    priority: String(row.priority || "NORMAL") as EngineeringRfi["priority"], status: String(row.status || "DRAFT") as EngineeringRfi["status"],
    dateRaised: String(row.date_raised || ""), dueDate: text(row.due_date), assignedUserId: text(row.assigned_user_id), createdByUserId: text(row.created_by_user_id),
    createdAt: String(row.created_at || ""), updatedAt: String(row.updated_at || ""), openedAt: text(row.opened_at), answeredAt: text(row.answered_at),
    closedAt: text(row.closed_at), voidedAt: text(row.voided_at), closeVoidReason: text(row.close_void_reason),
  };
}

export function rfiResponseFromRow(row: Row): EngineeringRfiResponse {
  return {
    id: String(row.id), companyId: text(row.company_id), rfiId: String(row.rfi_id), responseText: String(row.response_text || ""),
    responseType: String(row.response_type || "RESPONSE") as EngineeringRfiResponse["responseType"], isFinalAnswer: Boolean(row.is_final_answer),
    createdByUserId: text(row.created_by_user_id), createdAt: String(row.created_at || ""),
  };
}

export function rfiLinkFromRow(row: Row): EngineeringRfiDocumentLink {
  return {
    id: String(row.id), companyId: text(row.company_id), rfiId: String(row.rfi_id), responseId: text(row.response_id), documentId: String(row.document_id),
    revisionId: String(row.revision_id), linkedByUserId: text(row.linked_by_user_id), createdAt: String(row.created_at || ""),
  };
}

export function submittalFromRow(row: Row): EngineeringSubmittal {
  return {
    id: String(row.id), companyId: text(row.company_id), projectId: String(row.project_id), submittalNumber: String(row.submittal_number || ""), title: String(row.title || ""),
    discipline: String(row.discipline || "GENERAL_ENGINEERING") as EngineeringSubmittal["discipline"], category: String(row.category || ""), specificationReference: text(row.specification_reference),
    dueReviewDate: text(row.due_review_date), currentRound: numberValue(row.current_round, 1), status: String(row.status || "DRAFT") as EngineeringSubmittal["status"],
    createdByUserId: text(row.created_by_user_id), createdAt: String(row.created_at || ""), updatedAt: String(row.updated_at || ""), submittedAt: text(row.submitted_at),
    closedAt: text(row.closed_at), voidedAt: text(row.voided_at), closeVoidReason: text(row.close_void_reason),
  };
}

export function submittalRoundFromRow(row: Row): EngineeringSubmittalRound {
  return {
    id: String(row.id), companyId: text(row.company_id), submittalId: String(row.submittal_id), roundNumber: numberValue(row.round_number, 1),
    status: String(row.status || "DRAFT") as EngineeringSubmittalRound["status"], dueReviewDate: text(row.due_review_date), submittedAt: text(row.submitted_at),
    completedAt: text(row.completed_at), createdByUserId: text(row.created_by_user_id), createdAt: String(row.created_at || ""), updatedAt: String(row.updated_at || ""),
  };
}

export function submittalReviewFromRow(row: Row): EngineeringSubmittalReview {
  return {
    id: String(row.id), companyId: text(row.company_id), submittalId: String(row.submittal_id), roundId: String(row.round_id), roundNumber: numberValue(row.round_number, 1),
    decision: String(row.decision || "REJECTED") as EngineeringSubmittalReview["decision"], reviewComments: String(row.review_comments || ""),
    reviewedByUserId: text(row.reviewed_by_user_id), reviewedAt: String(row.reviewed_at || ""),
  };
}

export function submittalLinkFromRow(row: Row): EngineeringSubmittalDocumentLink {
  return {
    id: String(row.id), companyId: text(row.company_id), submittalId: String(row.submittal_id), roundId: String(row.round_id), documentId: String(row.document_id),
    revisionId: String(row.revision_id), linkedByUserId: text(row.linked_by_user_id), createdAt: String(row.created_at || ""),
  };
}

function resolveCompanyId(companyId?: string): string {
  const active = getActiveCompanyId();
  const resolved = companyId?.trim() || active || requireActiveCompanyId();
  if (active && active !== resolved) throw new Error("Deployment company access changed. Reload the coordination register and retry.");
  return resolved;
}

async function requireAuthenticatedCompany(companyId?: string): Promise<string> {
  if (!supabase) throw new Error("Authentication required for engineering coordination.");
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  if (!data.user?.id) throw new Error("Authentication required for engineering coordination.");
  return resolveCompanyId(companyId);
}

async function rpc(name: string, args: Record<string, unknown>, companyId?: string): Promise<unknown> {
  const resolvedCompanyId = await requireAuthenticatedCompany(companyId);
  const { data, error } = await supabase!.rpc(name, { p_company_id: resolvedCompanyId, ...args });
  if (error) throw error;
  return data;
}

export async function loadEngineeringCoordinationFromSupabase(companyId?: string, projectId?: string): Promise<EngineeringCoordinationWorkspaceData> {
  const resolvedCompanyId = await requireAuthenticatedCompany(companyId);
  const projectFilter = <T extends { eq: (column: string, value: string) => T }>(query: T) => projectId ? query.eq("project_id", projectId) : query;
  const [rfis, rfiResponses, rfiLinks, submittals, rounds, reviews, submittalLinks] = await Promise.all([
    projectFilter(supabase!.from("engineering_rfis").select("*").eq("company_id", resolvedCompanyId)).order("created_at", { ascending: false }),
    supabase!.from("engineering_rfi_responses").select("*").eq("company_id", resolvedCompanyId).order("created_at", { ascending: true }),
    supabase!.from("engineering_rfi_document_links").select("*").eq("company_id", resolvedCompanyId).order("created_at", { ascending: true }),
    projectFilter(supabase!.from("engineering_submittals").select("*").eq("company_id", resolvedCompanyId)).order("created_at", { ascending: false }),
    supabase!.from("engineering_submittal_rounds").select("*").eq("company_id", resolvedCompanyId).order("round_number", { ascending: true }),
    supabase!.from("engineering_submittal_reviews").select("*").eq("company_id", resolvedCompanyId).order("reviewed_at", { ascending: true }),
    supabase!.from("engineering_submittal_document_links").select("*").eq("company_id", resolvedCompanyId).order("created_at", { ascending: true }),
  ]);
  for (const result of [rfis, rfiResponses, rfiLinks, submittals, rounds, reviews, submittalLinks]) if (result.error) throw result.error;
  const projectRfiIds = new Set((rfis.data || []).map((row) => String((row as Row).id)));
  const projectSubmittalIds = new Set((submittals.data || []).map((row) => String((row as Row).id)));
  const projectRoundIds = new Set((rounds.data || []).filter((row) => projectSubmittalIds.has(String((row as Row).submittal_id))).map((row) => String((row as Row).id)));
  return {
    rfis: (rfis.data || []).map((row) => rfiFromRow(row as Row)),
    rfiResponses: (rfiResponses.data || []).filter((row) => projectRfiIds.has(String((row as Row).rfi_id))).map((row) => rfiResponseFromRow(row as Row)),
    rfiDocumentLinks: (rfiLinks.data || []).filter((row) => projectRfiIds.has(String((row as Row).rfi_id))).map((row) => rfiLinkFromRow(row as Row)),
    submittals: (submittals.data || []).map((row) => submittalFromRow(row as Row)),
    submittalRounds: (rounds.data || []).filter((row) => projectSubmittalIds.has(String((row as Row).submittal_id))).map((row) => submittalRoundFromRow(row as Row)),
    submittalReviews: (reviews.data || []).filter((row) => projectSubmittalIds.has(String((row as Row).submittal_id))).map((row) => submittalReviewFromRow(row as Row)),
    submittalDocumentLinks: (submittalLinks.data || []).filter((row) => projectSubmittalIds.has(String((row as Row).submittal_id)) && projectRoundIds.has(String((row as Row).round_id))).map((row) => submittalLinkFromRow(row as Row)),
  };
}

export function readEngineeringCoordinationFromLocal(storage: Storage | undefined = typeof localStorage === "undefined" ? undefined : localStorage): EngineeringCoordinationWorkspaceData {
  if (!storage) return emptyEngineeringCoordinationWorkspaceData();
  try {
    const raw = storage.getItem(ENGINEERING_COORDINATION_STORAGE_KEY);
    if (!raw) return emptyEngineeringCoordinationWorkspaceData();
    return { ...emptyEngineeringCoordinationWorkspaceData(), ...JSON.parse(raw) };
  } catch {
    return emptyEngineeringCoordinationWorkspaceData();
  }
}

export function writeEngineeringCoordinationToLocal(data: EngineeringCoordinationWorkspaceData, storage: Storage | undefined = typeof localStorage === "undefined" ? undefined : localStorage): void {
  try { storage?.setItem(ENGINEERING_COORDINATION_STORAGE_KEY, JSON.stringify(data)); } catch { /* best effort browser-only fallback */ }
}

function revisionIds(references: readonly RevisionReference[] = []): string[] {
  return [...new Set(references.map((reference) => reference.revisionId))];
}

export function createRfiRpc(input: { id: string; projectId: string; rfiNumber: string; subject: string; question: string; discipline: DisciplineType; priority: EngineeringRfi["priority"]; dateRaised: string; dueDate?: string; assignedUserId?: string; references?: RevisionReference[] }, companyId?: string) {
  return rpc("create_engineering_rfi", {
    p_rfi_id: input.id, p_project_id: input.projectId, p_rfi_number: input.rfiNumber, p_subject: input.subject, p_question: input.question,
    p_discipline: input.discipline, p_priority: input.priority, p_date_raised: input.dateRaised, p_due_date: input.dueDate || null,
    p_assigned_user_id: input.assignedUserId || null, p_revision_ids: revisionIds(input.references),
  }, companyId);
}

export function openRfiRpc(rfiId: string, companyId?: string) { return rpc("open_engineering_rfi", { p_rfi_id: rfiId }, companyId); }
export function respondRfiRpc(input: { rfiId: string; responseId: string; responseText: string; responseType?: RfiResponseType; isFinalAnswer?: boolean; references?: RevisionReference[] }, companyId?: string) {
  return rpc("respond_engineering_rfi", { p_rfi_id: input.rfiId, p_response_id: input.responseId, p_response_text: input.responseText, p_response_type: input.responseType || "RESPONSE", p_is_final_answer: input.isFinalAnswer === true, p_revision_ids: revisionIds(input.references) }, companyId);
}
export function closeRfiRpc(rfiId: string, reason?: string, companyId?: string) { return rpc("close_engineering_rfi", { p_rfi_id: rfiId, p_reason: reason || null }, companyId); }
export function voidRfiRpc(rfiId: string, reason: string, companyId?: string) { return rpc("void_engineering_rfi", { p_rfi_id: rfiId, p_reason: reason }, companyId); }

export function createSubmittalRpc(input: { id: string; roundId: string; projectId: string; submittalNumber: string; title: string; discipline: DisciplineType; category: string; specificationReference?: string; dueReviewDate?: string; references?: RevisionReference[] }, companyId?: string) {
  return rpc("create_engineering_submittal", {
    p_submittal_id: input.id, p_round_id: input.roundId, p_project_id: input.projectId, p_submittal_number: input.submittalNumber, p_title: input.title,
    p_discipline: input.discipline, p_category: input.category, p_specification_reference: input.specificationReference || null, p_due_review_date: input.dueReviewDate || null,
    p_revision_ids: revisionIds(input.references),
  }, companyId);
}
export function submitSubmittalRpc(submittalId: string, companyId?: string) { return rpc("submit_engineering_submittal", { p_submittal_id: submittalId }, companyId); }
export function startSubmittalReviewRpc(submittalId: string, companyId?: string) { return rpc("start_engineering_submittal_review", { p_submittal_id: submittalId }, companyId); }
export function reviewSubmittalRpc(input: { submittalId: string; reviewId: string; decision: SubmittalDecision; reviewComments: string }, companyId?: string) {
  return rpc("review_engineering_submittal", { p_submittal_id: input.submittalId, p_review_id: input.reviewId, p_decision: input.decision, p_review_comments: input.reviewComments }, companyId);
}
export function resubmitSubmittalRpc(input: { submittalId: string; roundId: string; dueReviewDate?: string; references?: RevisionReference[] }, companyId?: string) {
  return rpc("resubmit_engineering_submittal", { p_submittal_id: input.submittalId, p_round_id: input.roundId, p_due_review_date: input.dueReviewDate || null, p_revision_ids: revisionIds(input.references) }, companyId);
}
export function closeSubmittalRpc(submittalId: string, reason?: string, companyId?: string) { return rpc("close_engineering_submittal", { p_submittal_id: submittalId, p_reason: reason || null }, companyId); }
export function voidSubmittalRpc(submittalId: string, reason: string, companyId?: string) { return rpc("void_engineering_submittal", { p_submittal_id: submittalId, p_reason: reason }, companyId); }
