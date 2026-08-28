import { randomUUID } from "node:crypto";
import type { AssistantRiskTier } from "../../assistant/assistantTypes.ts";
import { RFI_STATUSES as DOMAIN_RFI_STATUSES, SUBMITTAL_STATUSES as DOMAIN_SUBMITTAL_STATUSES } from "../../lib/engineeringCoordination.ts";
import { AssistantBackendError, AssistantToolError, type AssistantToolContext, type ToolExecutionResult } from "./assistantBackendTypes.ts";
import { boundedLimit, boundedText, enumValue, optionalDateOnly, plainObject, requireDateOnly, requireUuid } from "./toolValidation.ts";

export interface EngineeringCoordinationToolDefinition {
  name: string;
  description: string;
  riskTier: AssistantRiskTier;
  permissions: string[];
  parametersJsonSchema: Record<string, unknown>;
  requiresConfirmation: boolean;
}

const uuid = { type: "string", description: "Identifier supplied by a prior tool result or the current workspace context." };
const date = { type: "string", description: "Calendar date in YYYY-MM-DD format." };
const limit = { type: "integer", minimum: 1, maximum: 50 };
const discipline = { type: "string", enum: ["ARCHITECTURAL", "STRUCTURAL", "CIVIL", "MECHANICAL", "ELECTRICAL", "PLUMBING", "FIRE_PROTECTION", "GEOTECHNICAL", "GENERAL_ENGINEERING", "OTHER"] };
const rfiStatus = { type: "string", enum: DOMAIN_RFI_STATUSES };
const submittalStatus = { type: "string", enum: DOMAIN_SUBMITTAL_STATUSES };
const revisionIds = { type: "array", maxItems: 20, items: uuid, description: "Immutable engineering_document_revision IDs from the same company and project." };

function schema(properties: Record<string, unknown>, required: string[] = []) {
  return { type: "object", properties, required, additionalProperties: false };
}
function read(name: string, description: string, permissions: string[], properties: Record<string, unknown> = {}, required: string[] = []): EngineeringCoordinationToolDefinition {
  return { name, description, permissions, riskTier: "READ", parametersJsonSchema: schema(properties, required), requiresConfirmation: false };
}
function navigation(name: string, description: string, permissions: string[], properties: Record<string, unknown>, required: string[]): EngineeringCoordinationToolDefinition {
  return { name, description, permissions, riskTier: "NAVIGATION", parametersJsonSchema: schema(properties, required), requiresConfirmation: false };
}
function prepare(name: string, description: string, permissions: string[], properties: Record<string, unknown>, required: string[]): EngineeringCoordinationToolDefinition {
  return { name, description, permissions, riskTier: "PREPARE", parametersJsonSchema: schema(properties, required), requiresConfirmation: true };
}

export const ENGINEERING_COORDINATION_TOOL_DEFINITIONS: readonly EngineeringCoordinationToolDefinition[] = Object.freeze([
  read("search_rfis", "Search the current company RFI register using bounded persisted records.", ["engineering.rfis.read"], { projectId: uuid, query: { type: "string" }, status: rfiStatus, discipline, priority: { type: "string", enum: ["LOW", "NORMAL", "HIGH", "URGENT"] }, dueBefore: date, limit }),
  read("get_rfi", "Get one company RFI with append-only responses and immutable revision references.", ["engineering.rfis.read"], { rfiId: uuid }, ["rfiId"]),
  read("search_submittals", "Search the current company technical submittal register using bounded persisted records.", ["engineering.submittals.read"], { projectId: uuid, query: { type: "string" }, status: submittalStatus, discipline, dueBefore: date, limit }),
  read("get_submittal", "Get one company technical submittal with formal rounds, reviews, and immutable revision references.", ["engineering.submittals.read"], { submittalId: uuid }, ["submittalId"]),
  navigation("navigate_to_rfi", "Open a verified company RFI in its project workspace.", ["engineering.rfis.read", "projects.read"], { rfiId: uuid }, ["rfiId"]),
  navigation("navigate_to_submittal", "Open a verified company technical submittal in its project workspace.", ["engineering.submittals.read", "projects.read"], { submittalId: uuid, roundId: uuid }, ["submittalId"]),
  prepare("prepare_create_rfi", "Prepare a project RFI draft. Confirmation is required before persistence.", ["engineering.rfis.create"], { projectId: uuid, rfiNumber: { type: "string" }, subject: { type: "string" }, question: { type: "string" }, discipline, priority: { type: "string", enum: ["LOW", "NORMAL", "HIGH", "URGENT"] }, dateRaised: date, dueDate: date, assignedUserId: uuid, revisionIds }, ["projectId", "rfiNumber", "subject", "question", "discipline"]),
  prepare("prepare_respond_rfi", "Prepare an append-only RFI response or final answer. Confirmation is required before persistence.", ["engineering.rfis.respond"], { rfiId: uuid, responseText: { type: "string" }, responseType: { type: "string", enum: ["RESPONSE", "CORRECTION", "NOTE"] }, finalAnswer: { type: "boolean" }, revisionIds }, ["rfiId", "responseText"]),
  prepare("prepare_close_rfi", "Prepare closure of an answered RFI. Confirmation is required.", ["engineering.rfis.manage"], { rfiId: uuid, reason: { type: "string" } }, ["rfiId"]),
  prepare("prepare_create_submittal", "Prepare a technical submittal draft and Round 1. Confirmation is required before persistence.", ["engineering.submittals.create"], { projectId: uuid, submittalNumber: { type: "string" }, title: { type: "string" }, discipline, category: { type: "string" }, specificationReference: { type: "string" }, dueReviewDate: date, revisionIds }, ["projectId", "submittalNumber", "title", "discipline", "category"]),
  prepare("prepare_submit_submittal", "Prepare formal submission of the current draft submittal round. Confirmation is required.", ["engineering.submittals.create"], { submittalId: uuid }, ["submittalId"]),
  prepare("prepare_review_submittal", "Prepare an append-only formal review decision for the current submitted round. Confirmation is required.", ["engineering.submittals.review"], { submittalId: uuid, decision: { type: "string", enum: ["APPROVED", "APPROVED_AS_NOTED", "REVISE_AND_RESUBMIT", "REJECTED"] }, reviewComments: { type: "string" } }, ["submittalId", "decision", "reviewComments"]),
  prepare("prepare_resubmit_submittal", "Prepare a new formal submittal round after REVISE_AND_RESUBMIT. Confirmation is required.", ["engineering.submittals.create"], { submittalId: uuid, dueReviewDate: date, revisionIds }, ["submittalId"]),
]);

const TOOL_NAMES = new Set(ENGINEERING_COORDINATION_TOOL_DEFINITIONS.map((item) => item.name));
const DISCIPLINES = ["ARCHITECTURAL", "STRUCTURAL", "CIVIL", "MECHANICAL", "ELECTRICAL", "PLUMBING", "FIRE_PROTECTION", "GEOTECHNICAL", "GENERAL_ENGINEERING", "OTHER"] as const;
const DECISIONS = ["APPROVED", "APPROVED_AS_NOTED", "REVISE_AND_RESUBMIT", "REJECTED"] as const;

export function isEngineeringCoordinationTool(name: string): boolean { return TOOL_NAMES.has(name); }

function uuidArray(value: unknown, label: string): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > 20) throw new AssistantToolError("INVALID_ARGUMENT", `${label} must contain at most 20 revision IDs.`);
  return [...new Set(value.map((item, index) => requireUuid(item, `${label}[${index}]`)))];
}

export function validateEngineeringCoordinationToolArguments(toolName: string, input: unknown): Record<string, unknown> {
  const args = plainObject(input);
  switch (toolName) {
    case "search_rfis": return { projectId: args.projectId ? requireUuid(args.projectId, "projectId") : undefined, query: boundedText(args.query, "query", 200, false), status: enumValue(args.status, "status", DOMAIN_RFI_STATUSES, false), discipline: enumValue(args.discipline, "discipline", DISCIPLINES, false), priority: enumValue(args.priority, "priority", ["LOW", "NORMAL", "HIGH", "URGENT"] as const, false), dueBefore: optionalDateOnly(args.dueBefore, "dueBefore"), limit: boundedLimit(args.limit) };
    case "search_submittals": return { projectId: args.projectId ? requireUuid(args.projectId, "projectId") : undefined, query: boundedText(args.query, "query", 200, false), status: enumValue(args.status, "status", DOMAIN_SUBMITTAL_STATUSES, false), discipline: enumValue(args.discipline, "discipline", DISCIPLINES, false), dueBefore: optionalDateOnly(args.dueBefore, "dueBefore"), limit: boundedLimit(args.limit) };
    case "get_rfi":
    case "navigate_to_rfi": return { rfiId: requireUuid(args.rfiId, "rfiId") };
    case "get_submittal": return { submittalId: requireUuid(args.submittalId, "submittalId") };
    case "navigate_to_submittal": return { submittalId: requireUuid(args.submittalId, "submittalId"), roundId: args.roundId ? requireUuid(args.roundId, "roundId") : undefined };
    case "prepare_create_rfi": return { rfiId: args.rfiId ? requireUuid(args.rfiId, "rfiId") : randomUUID(), projectId: requireUuid(args.projectId, "projectId"), rfiNumber: boundedText(args.rfiNumber, "rfiNumber", 100), subject: boundedText(args.subject, "subject", 255), question: boundedText(args.question, "question", 8000), discipline: enumValue(args.discipline, "discipline", DISCIPLINES)!, priority: enumValue(args.priority || "NORMAL", "priority", ["LOW", "NORMAL", "HIGH", "URGENT"] as const)!, dateRaised: args.dateRaised ? requireDateOnly(args.dateRaised, "dateRaised") : undefined, dueDate: optionalDateOnly(args.dueDate, "dueDate"), assignedUserId: args.assignedUserId ? requireUuid(args.assignedUserId, "assignedUserId") : undefined, revisionIds: uuidArray(args.revisionIds, "revisionIds") };
    case "prepare_respond_rfi": return { responseId: args.responseId ? requireUuid(args.responseId, "responseId") : randomUUID(), rfiId: requireUuid(args.rfiId, "rfiId"), responseText: boundedText(args.responseText, "responseText", 8000), responseType: enumValue(args.responseType || "RESPONSE", "responseType", ["RESPONSE", "CORRECTION", "NOTE"] as const)!, finalAnswer: args.finalAnswer === true, revisionIds: uuidArray(args.revisionIds, "revisionIds") };
    case "prepare_close_rfi": return { rfiId: requireUuid(args.rfiId, "rfiId"), reason: boundedText(args.reason, "reason", 1000, false) };
    case "prepare_create_submittal": return { submittalId: args.submittalId ? requireUuid(args.submittalId, "submittalId") : randomUUID(), roundId: args.roundId ? requireUuid(args.roundId, "roundId") : randomUUID(), projectId: requireUuid(args.projectId, "projectId"), submittalNumber: boundedText(args.submittalNumber, "submittalNumber", 100), title: boundedText(args.title, "title", 255), discipline: enumValue(args.discipline, "discipline", DISCIPLINES)!, category: boundedText(args.category, "category", 160), specificationReference: boundedText(args.specificationReference, "specificationReference", 255, false), dueReviewDate: optionalDateOnly(args.dueReviewDate, "dueReviewDate"), revisionIds: uuidArray(args.revisionIds, "revisionIds") };
    case "prepare_submit_submittal": return { submittalId: requireUuid(args.submittalId, "submittalId") };
    case "prepare_review_submittal": return { reviewId: args.reviewId ? requireUuid(args.reviewId, "reviewId") : randomUUID(), submittalId: requireUuid(args.submittalId, "submittalId"), decision: enumValue(args.decision, "decision", DECISIONS)!, reviewComments: boundedText(args.reviewComments, "reviewComments", 8000) };
    case "prepare_resubmit_submittal": return { roundId: args.roundId ? requireUuid(args.roundId, "roundId") : randomUUID(), submittalId: requireUuid(args.submittalId, "submittalId"), dueReviewDate: optionalDateOnly(args.dueReviewDate, "dueReviewDate"), revisionIds: uuidArray(args.revisionIds, "revisionIds") };
    default: throw new AssistantToolError("UNKNOWN_TOOL", "That engineering coordination operation is not available.");
  }
}

function compactRow(row: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(row).filter(([, value]) => value !== null && value !== undefined));
}
async function maybeSingle(context: AssistantToolContext, table: string, id: string) {
  const result = await (context.auth.supabase as any).from(table).select("*").eq("company_id", context.auth.companyId).eq("id", id).maybeSingle();
  if (result.error) throw new AssistantBackendError("TOOL_READ_FAILED", "Engineering coordination records could not be read safely.", 503);
  return result.data as Record<string, unknown> | null;
}
async function requireEntity(context: AssistantToolContext, table: string, id: string, label: string) {
  const row = await maybeSingle(context, table, id);
  if (!row) throw new AssistantBackendError("NOT_FOUND", `${label} is not available in this company.`, 404);
  return row;
}

async function searchRfis(args: Record<string, unknown>, context: AssistantToolContext): Promise<ToolExecutionResult> {
  let query = (context.auth.supabase as any).from("engineering_rfis").select("id,project_id,rfi_number,subject,discipline,priority,status,date_raised,due_date,opened_at,answered_at,closed_at").eq("company_id", context.auth.companyId).order("created_at", { ascending: false }).limit(Number(args.limit || 20));
  if (args.projectId) query = query.eq("project_id", args.projectId);
  if (args.status) query = query.eq("status", args.status);
  if (args.discipline) query = query.eq("discipline", args.discipline);
  if (args.priority) query = query.eq("priority", args.priority);
  if (args.dueBefore) query = query.lte("due_date", args.dueBefore);
  if (args.query) query = query.or(`rfi_number.ilike.%${String(args.query).replaceAll(",", " ")}%,subject.ilike.%${String(args.query).replaceAll(",", " ")}%`);
  const result = await query;
  if (result.error) throw new AssistantBackendError("TOOL_READ_FAILED", "The RFI register could not be read safely.", 503);
  const records = (result.data || []).map((row: Record<string, unknown>) => compactRow(row));
  return { output: { count: records.length, records }, references: records.slice(0, 10).map((row: Record<string, unknown>) => ({ type: "rfi" as const, id: String(row.id), label: `${row.rfi_number}: ${row.subject}` })) };
}

async function getRfi(args: Record<string, unknown>, context: AssistantToolContext): Promise<ToolExecutionResult> {
  const rfi = await requireEntity(context, "engineering_rfis", String(args.rfiId), "RFI");
  const [responses, links] = await Promise.all([
    (context.auth.supabase as any).from("engineering_rfi_responses").select("id,response_text,response_type,is_final_answer,created_by_user_id,created_at").eq("company_id", context.auth.companyId).eq("rfi_id", rfi.id).order("created_at", { ascending: true }).limit(50),
    (context.auth.supabase as any).from("engineering_rfi_document_links").select("id,response_id,document_id,revision_id,created_at").eq("company_id", context.auth.companyId).eq("rfi_id", rfi.id).order("created_at", { ascending: true }).limit(50),
  ]);
  if (responses.error || links.error) throw new AssistantBackendError("TOOL_READ_FAILED", "The RFI history could not be read safely.", 503);
  return { output: { rfi: compactRow(rfi), responses: responses.data || [], revisionLinks: links.data || [] }, references: [{ type: "rfi", id: String(rfi.id), label: `${rfi.rfi_number}: ${rfi.subject}` }] };
}

async function searchSubmittals(args: Record<string, unknown>, context: AssistantToolContext): Promise<ToolExecutionResult> {
  let query = (context.auth.supabase as any).from("engineering_submittals").select("id,project_id,submittal_number,title,discipline,category,specification_reference,due_review_date,current_round,status,submitted_at").eq("company_id", context.auth.companyId).order("created_at", { ascending: false }).limit(Number(args.limit || 20));
  if (args.projectId) query = query.eq("project_id", args.projectId);
  if (args.status) query = query.eq("status", args.status);
  if (args.discipline) query = query.eq("discipline", args.discipline);
  if (args.dueBefore) query = query.lte("due_review_date", args.dueBefore);
  if (args.query) query = query.or(`submittal_number.ilike.%${String(args.query).replaceAll(",", " ")}%,title.ilike.%${String(args.query).replaceAll(",", " ")}%`);
  const result = await query;
  if (result.error) throw new AssistantBackendError("TOOL_READ_FAILED", "The submittal register could not be read safely.", 503);
  const records = (result.data || []).map((row: Record<string, unknown>) => compactRow(row));
  return { output: { count: records.length, records }, references: records.slice(0, 10).map((row: Record<string, unknown>) => ({ type: "submittal" as const, id: String(row.id), label: `${row.submittal_number}: ${row.title}` })) };
}

async function getSubmittal(args: Record<string, unknown>, context: AssistantToolContext): Promise<ToolExecutionResult> {
  const submittal = await requireEntity(context, "engineering_submittals", String(args.submittalId), "Submittal");
  const [rounds, reviews, links] = await Promise.all([
    (context.auth.supabase as any).from("engineering_submittal_rounds").select("*").eq("company_id", context.auth.companyId).eq("submittal_id", submittal.id).order("round_number", { ascending: true }).limit(50),
    (context.auth.supabase as any).from("engineering_submittal_reviews").select("*").eq("company_id", context.auth.companyId).eq("submittal_id", submittal.id).order("reviewed_at", { ascending: true }).limit(50),
    (context.auth.supabase as any).from("engineering_submittal_document_links").select("id,round_id,document_id,revision_id,created_at").eq("company_id", context.auth.companyId).eq("submittal_id", submittal.id).order("created_at", { ascending: true }).limit(50),
  ]);
  if (rounds.error || reviews.error || links.error) throw new AssistantBackendError("TOOL_READ_FAILED", "The submittal history could not be read safely.", 503);
  return { output: { submittal: compactRow(submittal), rounds: rounds.data || [], reviews: reviews.data || [], revisionLinks: links.data || [] }, references: [{ type: "submittal", id: String(submittal.id), label: `${submittal.submittal_number}: ${submittal.title}` }] };
}

async function prepareAction(toolName: string, args: Record<string, unknown>, context: AssistantToolContext): Promise<ToolExecutionResult> {
  let preview: Record<string, unknown> = { contextGeneration: context.context.generation, ...args };
  if (args.rfiId) {
    const rfi = await requireEntity(context, "engineering_rfis", String(args.rfiId), "RFI");
    preview = { ...preview, rfiNumber: rfi.rfi_number, subject: rfi.subject, currentStatus: rfi.status, projectId: rfi.project_id };
  }
  if (args.submittalId) {
    const submittal = await requireEntity(context, "engineering_submittals", String(args.submittalId), "Submittal");
    preview = { ...preview, submittalNumber: submittal.submittal_number, title: submittal.title, currentStatus: submittal.status, currentRound: submittal.current_round, projectId: submittal.project_id };
  }
  return context.prepareAction({ toolName, riskTier: "PREPARE", normalizedArgs: args, preview, contextGeneration: context.context.generation });
}

export async function executeEngineeringCoordinationTool(name: string, args: Record<string, unknown>, context: AssistantToolContext): Promise<ToolExecutionResult> {
  if (name === "search_rfis") return searchRfis(args, context);
  if (name === "get_rfi") return getRfi(args, context);
  if (name === "search_submittals") return searchSubmittals(args, context);
  if (name === "get_submittal") return getSubmittal(args, context);
  if (name === "navigate_to_rfi") {
    const rfi = await requireEntity(context, "engineering_rfis", String(args.rfiId), "RFI");
    return { output: { rfiId: rfi.id, projectId: rfi.project_id }, references: [{ type: "rfi", id: String(rfi.id), label: `${rfi.rfi_number}: ${rfi.subject}` }], clientActions: [{ type: "OPEN_RFI", entityId: String(rfi.id), projectId: String(rfi.project_id), label: "Open RFI" }] };
  }
  if (name === "navigate_to_submittal") {
    const submittal = await requireEntity(context, "engineering_submittals", String(args.submittalId), "Submittal");
    if (args.roundId) {
      const round = await requireEntity(context, "engineering_submittal_rounds", String(args.roundId), "Submittal round");
      if (String(round.submittal_id) !== String(submittal.id)) throw new AssistantBackendError("NOT_FOUND", "That round is not part of the selected submittal.", 404);
    }
    return { output: { submittalId: submittal.id, projectId: submittal.project_id, roundId: args.roundId }, references: [{ type: "submittal", id: String(submittal.id), label: `${submittal.submittal_number}: ${submittal.title}` }], clientActions: [{ type: "OPEN_SUBMITTAL", entityId: String(submittal.id), projectId: String(submittal.project_id), ...(args.roundId ? { roundId: String(args.roundId) } : {}), label: "Open submittal" }] };
  }
  if (name.startsWith("prepare_")) return prepareAction(name, args, context);
  throw new AssistantBackendError("UNKNOWN_TOOL", "That engineering coordination operation is not available.", 400);
}

async function rpc(context: AssistantToolContext, name: string, args: Record<string, unknown>) {
  const result = await (context.auth.supabase as any).rpc(name, { p_company_id: context.auth.companyId, ...args });
  if (result.error) throw new AssistantBackendError("DOMAIN_WRITE_REJECTED", result.error.message || "The engineering coordination action was rejected.", 409);
  return result.data as Record<string, unknown>;
}

export async function executePreparedEngineeringCoordinationAction(context: AssistantToolContext, toolName: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
  switch (toolName) {
    case "prepare_create_rfi": return { rfi: await rpc(context, "create_engineering_rfi", { p_rfi_id: args.rfiId, p_project_id: args.projectId, p_rfi_number: args.rfiNumber, p_subject: args.subject, p_question: args.question, p_discipline: args.discipline, p_priority: args.priority, p_date_raised: args.dateRaised || context.now.toISOString().slice(0, 10), p_due_date: args.dueDate || null, p_assigned_user_id: args.assignedUserId || null, p_revision_ids: args.revisionIds || [] }) };
    case "prepare_respond_rfi": return { response: await rpc(context, "respond_engineering_rfi", { p_rfi_id: args.rfiId, p_response_id: args.responseId, p_response_text: args.responseText, p_response_type: args.responseType, p_is_final_answer: args.finalAnswer === true, p_revision_ids: args.revisionIds || [] }) };
    case "prepare_close_rfi": return { rfi: await rpc(context, "close_engineering_rfi", { p_rfi_id: args.rfiId, p_reason: args.reason || null }) };
    case "prepare_create_submittal": return { submittal: await rpc(context, "create_engineering_submittal", { p_submittal_id: args.submittalId, p_round_id: args.roundId, p_project_id: args.projectId, p_submittal_number: args.submittalNumber, p_title: args.title, p_discipline: args.discipline, p_category: args.category, p_specification_reference: args.specificationReference || null, p_due_review_date: args.dueReviewDate || null, p_revision_ids: args.revisionIds || [] }) };
    case "prepare_submit_submittal": return { submittal: await rpc(context, "submit_engineering_submittal", { p_submittal_id: args.submittalId }) };
    case "prepare_review_submittal": return { review: await rpc(context, "review_engineering_submittal", { p_submittal_id: args.submittalId, p_review_id: args.reviewId, p_decision: args.decision, p_review_comments: args.reviewComments }) };
    case "prepare_resubmit_submittal": return { submittal: await rpc(context, "resubmit_engineering_submittal", { p_submittal_id: args.submittalId, p_round_id: args.roundId, p_due_review_date: args.dueReviewDate || null, p_revision_ids: args.revisionIds || [] }) };
    default: throw new AssistantBackendError("UNKNOWN_TOOL", "That prepared engineering coordination operation is no longer available.", 409);
  }
}
