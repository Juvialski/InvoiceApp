import { existsSync } from "node:fs";
import { basename, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DEMO_QA_SCENARIOS } from "../qa/demoScenarios.ts";
import { ROUTE_DEFINITIONS } from "../../src/utils/routes.ts";
import {
  readGeneratedWorkflowMapFiles,
  renderWorkflowMapMarkdown,
  serializeWorkflowGraph,
  WORKFLOW_MAP_MARKDOWN_PATH,
  WORKFLOW_MAP_JSON_PATH,
  WORKFLOW_MAP_REPOSITORY_ROOT,
} from "./generate.ts";
import { WORKFLOW_GRAPH } from "./graph.ts";
import type { WorkflowEdge, WorkflowGraph } from "./types.ts";

export const REQUIRED_WORKFLOW_DOMAINS = [
  "platform-tenancy",
  "dashboard",
  "projects",
  "engineering",
  "finance",
  "workforce",
  "reporting",
  "assistant",
] as const;

export const REQUIRED_WORKFLOW_IDS = [
  "platform-entry",
  "dashboard-derived-metrics",
  "project-workspace",
  "engineering-document-lifecycle",
  "rfi-lifecycle",
  "submittal-lifecycle",
  "site-log-lifecycle",
  "invoice-extraction-workflow",
  "cash-settlement-lifecycle",
  "payroll-lifecycle",
  "reports-derived-surface",
  "assistant-guarded-execution",
] as const;

const ALLOWED_SPECIAL_ROUTE_IDS = new Set(["platform-companies"]);
const STATE_CHANGING_EDGE_TYPES = new Set<WorkflowEdge["type"]>(["writes", "derives", "feeds", "transitions", "executes-through"]);
const AUTHORITATIVE_SOURCE_NODE_IDS = new Set([
  "invoice-record",
  "invoice-project-allocation",
  "project-cost-aggregation",
  "payroll-project-labor-allocation",
  "payroll-project-labor-cost",
  "payroll-net-pay-basis",
  "cash-settlement-match",
  "cash-settlement-evidence",
  "payroll-attendance",
]);

function push(errors: string[], message: string) {
  errors.push(message);
}

function uniqueValues(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function repositoryReferenceError(repositoryRoot: string, reference: string): string | null {
  const normalized = reference.replaceAll("\\", "/");
  if (!normalized || normalized.startsWith("/") || /^[A-Za-z]:\//.test(normalized) || normalized.split("/").includes("..")) {
    return `reference must be a safe repository-relative path: ${reference}`;
  }
  const absolute = resolve(repositoryRoot, normalized);
  const rel = relative(repositoryRoot, absolute).replaceAll("\\", "/");
  if (rel.startsWith("../") || rel === ".." || /^[A-Za-z]:\//.test(rel)) return `reference escapes repository root: ${reference}`;
  if (!existsSync(absolute)) return `referenced path does not exist: ${reference}`;
  return null;
}

function validateReferences(graph: WorkflowGraph, repositoryRoot: string, errors: string[]) {
  const check = (owner: string, values: readonly string[] | undefined) => {
    for (const reference of values || []) {
      const error = repositoryReferenceError(repositoryRoot, reference);
      if (error) push(errors, `${owner}: ${error}`);
    }
  };
  for (const node of graph.nodes) {
    check(`node ${node.id} fileRefs`, node.fileRefs);
    check(`node ${node.id} testRefs`, node.testRefs);
  }
  for (const item of graph.invariants) {
    check(`invariant ${item.id} fileRefs`, item.fileRefs);
    check(`invariant ${item.id} testRefs`, item.testRefs);
  }
  for (const edge of graph.edges) check(`edge ${edge.id} testRefs`, edge.testRefs);
}

function validateRouteReferences(graph: WorkflowGraph, errors: string[]) {
  const knownRouteIds = new Set(ROUTE_DEFINITIONS.map((route) => route.id));
  for (const node of graph.nodes) {
    if (node.type !== "route") continue;
    if (!node.route) {
      push(errors, `route node ${node.id} is missing route metadata`);
      continue;
    }
    if (!node.route.canonicalPath.trim()) push(errors, `route node ${node.id} has an empty canonical path`);
    if (node.route.routeId && !knownRouteIds.has(node.route.routeId as typeof ROUTE_DEFINITIONS[number]["id"]) && !ALLOWED_SPECIAL_ROUTE_IDS.has(node.route.routeId)) {
      push(errors, `route node ${node.id} references unknown route ID ${node.route.routeId}`);
    }
    if (node.route.queryKeys && uniqueValues(node.route.queryKeys).length !== node.route.queryKeys.length) {
      push(errors, `route node ${node.id} repeats a query key`);
    }
  }
}

function validateSensitiveContent(graph: WorkflowGraph, errors: string[]) {
  const serialized = JSON.stringify(graph);
  const credentialPatterns = [
    /\bBearer\s+[A-Za-z0-9._~+/=-]{12,}/i,
    /\b(?:sk|pk|AIza)[-_][A-Za-z0-9_-]{12,}/i,
    /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/,
  ];
  const piiPatterns = [
    /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i,
    /(?:\+\d{1,3}[\s-]?\(?\d{2,4}\)?[\s-]?\d{3,4}[\s-]?\d{3,4}|\(\d{2,4}\)[\s-]\d{3,4}[\s-]\d{3,4})/,
  ];
  for (const pattern of credentialPatterns) if (pattern.test(serialized)) push(errors, `graph contains a credential-shaped value matching ${pattern}`);
  for (const pattern of piiPatterns) if (pattern.test(serialized)) push(errors, `graph contains a PII-shaped value matching ${pattern}`);
}

function edgeExists(graph: WorkflowGraph, source: string, target: string, predicate: (edge: WorkflowEdge) => boolean = () => true) {
  return graph.edges.some((edge) => edge.source === source && edge.target === target && predicate(edge));
}

function assertNoDirectStateChange(graph: WorkflowGraph, source: string, target: string, errors: string[], message: string) {
  const direct = graph.edges.filter((edge) => edge.source === source && edge.target === target && STATE_CHANGING_EDGE_TYPES.has(edge.type));
  if (direct.length) push(errors, `${message}: ${direct.map((edge) => edge.id).join(", ")}`);
}

export function collectHighValueSemanticErrors(graph: WorkflowGraph): string[] {
  const errors: string[] = [];
  const nodeIds = new Set(graph.nodes.map((node) => node.id));
  const requireNode = (id: string) => {
    if (!nodeIds.has(id)) push(errors, `semantic assertion requires node ${id}`);
  };

  // Invoice project cost and cash settlement must remain distinct axes.
  for (const id of ["invoice-project-allocation", "invoice-project-cost-contribution", "project-cost-aggregation", "invoice-payable-obligation", "cash-settlement-match", "cash-settlement-evidence"]) requireNode(id);
  if (!edgeExists(graph, "invoice-project-allocation", "invoice-project-cost-contribution")) push(errors, "verified invoice allocation is not connected to its project-cost contribution");
  if (!edgeExists(graph, "invoice-project-cost-contribution", "project-cost-aggregation")) push(errors, "invoice project-cost contribution is not connected to project-cost aggregation");
  if (!edgeExists(graph, "invoice-payable-obligation", "cash-settlement-candidates")) push(errors, "invoice payable obligation is not connected to settlement candidates");
  assertNoDirectStateChange(graph, "cash-settlement-match", "project-cost-aggregation", errors, "cash settlement match directly changes project cost");
  assertNoDirectStateChange(graph, "cash-settlement-evidence", "project-cost-aggregation", errors, "cash settlement evidence directly changes project cost");

  // Payroll labor cost and employee net-pay settlement are separate concepts.
  for (const id of ["payroll-project-labor-allocation", "payroll-project-labor-cost", "payroll-net-pay-basis", "cash-settlement-evidence"]) requireNode(id);
  if (!edgeExists(graph, "payroll-project-labor-allocation", "payroll-project-labor-cost")) push(errors, "payroll project labor allocation is not connected to labor cost");
  if (!edgeExists(graph, "payroll-entry-snapshot", "payroll-net-pay-basis")) push(errors, "payroll entry snapshot is not connected to net-pay basis");
  assertNoDirectStateChange(graph, "payroll-project-labor-cost", "cash-settlement-evidence", errors, "project labor cost directly changes cash settlement evidence");
  assertNoDirectStateChange(graph, "payroll-project-labor-allocation", "cash-settlement-evidence", errors, "project labor allocation directly changes cash settlement evidence");

  // The Site Log boundary must remain a non-authoritative, explicit separation.
  for (const id of ["site-log-crew-observation", "site-log-payroll-boundary", "payroll-attendance"]) requireNode(id);
  if (!edgeExists(graph, "site-log-crew-observation", "site-log-payroll-boundary", (edge) => edge.type === "separates")) push(errors, "Site Log crew observation is missing its explicit payroll separation boundary");
  const siteLogAttendanceWrites = graph.edges.filter((edge) => edge.source === "site-log-crew-observation" && edge.target === "payroll-attendance" && STATE_CHANGING_EDGE_TYPES.has(edge.type));
  if (siteLogAttendanceWrites.length) push(errors, `Site Log crew observation has an authoritative payroll-attendance edge: ${siteLogAttendanceWrites.map((edge) => edge.id).join(", ")}`);

  // Assistant mutation flow must include both confirmation and guarded execution.
  for (const id of ["assistant-mutation-request", "assistant-prepared-action", "assistant-deterministic-validation", "assistant-human-confirmation", "assistant-guarded-execution", "assistant-rpc-boundary", "assistant-executed-result"]) requireNode(id);
  if (!edgeExists(graph, "assistant-mutation-request", "assistant-prepared-action", (edge) => edge.type === "writes")) push(errors, "Assistant mutation request does not enter a PREPARE action");
  if (!edgeExists(graph, "assistant-prepared-action", "assistant-deterministic-validation", (edge) => edge.type === "guards")) push(errors, "Assistant prepared action is missing deterministic validation");
  if (!edgeExists(graph, "assistant-prepared-action", "assistant-human-confirmation", (edge) => edge.type === "requires-confirmation" && edge.confirmationRequirement === "human")) push(errors, "Assistant prepared action is missing a human confirmation boundary");
  if (!edgeExists(graph, "assistant-human-confirmation", "assistant-guarded-execution", (edge) => edge.type === "executes-through")) push(errors, "Assistant human confirmation is not connected to guarded execution");
  if (!edgeExists(graph, "assistant-guarded-execution", "assistant-rpc-boundary", (edge) => edge.type === "executes-through")) push(errors, "Assistant guarded execution is not connected to its application/RPC boundary");
  if (!edgeExists(graph, "assistant-rpc-boundary", "assistant-executed-result", (edge) => edge.type === "writes")) push(errors, "Assistant RPC boundary does not produce an executed result");
  if (graph.edges.some((edge) => ["assistant-screen", "assistant-mutation-request", "assistant-prepared-action"].includes(edge.source) && edge.target === "assistant-rpc-boundary" && STATE_CHANGING_EDGE_TYPES.has(edge.type))) {
    push(errors, "Assistant has a direct mutation edge to its RPC boundary that bypasses confirmation/execution");
  }

  // Demo isolation must be represented as a boundary, not just a label.
  for (const id of ["demo-mode", "demo-isolation", "production-persistence-boundary"]) requireNode(id);
  if (!edgeExists(graph, "demo-mode", "demo-isolation", (edge) => edge.type === "guards")) push(errors, "demo mode is missing its isolation guard");
  if (!edgeExists(graph, "demo-isolation", "production-persistence-boundary", (edge) => edge.type === "separates")) push(errors, "demo isolation is missing separation from production persistence");

  // Reports can consume source data but cannot create authoritative records.
  for (const id of ["reports-screen", "reports-derived-surface", "reporting-boundary"]) requireNode(id);
  if (!edgeExists(graph, "reports-screen", "reports-derived-surface", (edge) => edge.type === "reads")) push(errors, "reports screen is not connected to its derived surface");
  const reportMutationEdges = graph.edges.filter((edge) => edge.source === "reports-derived-surface" && AUTHORITATIVE_SOURCE_NODE_IDS.has(edge.target) && STATE_CHANGING_EDGE_TYPES.has(edge.type));
  if (reportMutationEdges.length) push(errors, `reports have an authoritative source mutation edge: ${reportMutationEdges.map((edge) => edge.id).join(", ")}`);
  if (!edgeExists(graph, "reports-derived-surface", "reporting-boundary", (edge) => edge.type === "guards")) push(errors, "reports are missing their non-authority guard");

  return errors;
}

export interface WorkflowMapValidationOptions {
  readonly repositoryRoot?: string;
  readonly checkGenerated?: boolean;
}

export function collectWorkflowMapErrors(graph: WorkflowGraph = WORKFLOW_GRAPH, options: WorkflowMapValidationOptions = {}): string[] {
  const repositoryRoot = options.repositoryRoot || WORKFLOW_MAP_REPOSITORY_ROOT;
  const errors: string[] = [];

  if (graph.schemaVersion !== 1) push(errors, `schemaVersion must be 1, received ${String(graph.schemaVersion)}`);
  if (!graph.graphId.trim()) push(errors, "graphId must be non-empty");
  if (!graph.version.trim()) push(errors, "graph version must be non-empty");
  if (!graph.product.trim()) push(errors, "product must be non-empty");
  if (!graph.canonicalSource.trim()) push(errors, "canonicalSource must be non-empty");
  const canonicalSourceError = repositoryReferenceError(repositoryRoot, graph.canonicalSource);
  if (canonicalSourceError) push(errors, `graph canonicalSource: ${canonicalSourceError}`);

  const nodeIds = graph.nodes.map((node) => node.id);
  const edgeIds = graph.edges.map((edge) => edge.id);
  if (nodeIds.some((id) => !id.trim())) push(errors, "node IDs must be non-empty");
  if (edgeIds.some((id) => !id.trim())) push(errors, "edge IDs must be non-empty");
  if (new Set(nodeIds).size !== nodeIds.length) push(errors, "node IDs must be unique");
  if (new Set(edgeIds).size !== edgeIds.length) push(errors, "edge IDs must be unique");

  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
  for (const edge of graph.edges) {
    if (!nodesById.has(edge.source)) push(errors, `edge ${edge.id} source does not exist: ${edge.source}`);
    if (!nodesById.has(edge.target)) push(errors, `edge ${edge.id} target does not exist: ${edge.target}`);
    if (!edge.label.trim()) push(errors, `edge ${edge.id} label must be non-empty`);
  }

  const domains = new Set(graph.nodes.map((node) => node.domain));
  for (const domain of REQUIRED_WORKFLOW_DOMAINS) if (!domains.has(domain)) push(errors, `required workflow domain is missing: ${domain}`);
  for (const id of REQUIRED_WORKFLOW_IDS) if (!nodesById.has(id)) push(errors, `required workflow node is missing: ${id}`);

  const invariantIds = graph.invariants.map((item) => item.id);
  if (new Set(invariantIds).size !== invariantIds.length) push(errors, "invariant IDs must be unique");
  const invariantSet = new Set(invariantIds);
  for (const item of graph.invariants) {
    if (!item.label.trim() || !item.description.trim()) push(errors, `invariant ${item.id} must have label and description`);
    for (const reference of item.fileRefs) if (!reference.trim()) push(errors, `invariant ${item.id} contains an empty file reference`);
  }
  for (const node of graph.nodes) {
    for (const invariantId of node.invariantIds || []) if (!invariantSet.has(invariantId)) push(errors, `node ${node.id} references missing invariant ${invariantId}`);
  }
  for (const edge of graph.edges) {
    for (const invariantId of edge.invariantIds || []) if (!invariantSet.has(invariantId)) push(errors, `edge ${edge.id} references missing invariant ${invariantId}`);
  }

  const diagramIds = new Set(graph.diagrams.map((diagram) => diagram.id));
  if (diagramIds.size !== graph.diagrams.length) push(errors, "diagram IDs must be unique");
  for (const diagram of graph.diagrams) {
    if (!diagram.title.trim() || !diagram.description.trim()) push(errors, `diagram ${diagram.id} must have title and description`);
    for (const nodeId of diagram.nodeIds) if (!nodesById.has(nodeId)) push(errors, `diagram ${diagram.id} references missing node ${nodeId}`);
  }

  validateReferences(graph, repositoryRoot, errors);
  validateRouteReferences(graph, errors);

  const qaScenarioIds = new Set(DEMO_QA_SCENARIOS.map((scenario) => scenario.id));
  for (const node of graph.nodes) {
    for (const scenarioId of node.qaScenarioIds || []) if (!qaScenarioIds.has(scenarioId)) push(errors, `node ${node.id} references missing QA-1 scenario ${scenarioId}`);
  }

  validateSensitiveContent(graph, errors);
  errors.push(...collectHighValueSemanticErrors(graph));

  if (options.checkGenerated) {
    try {
      const generated = readGeneratedWorkflowMapFiles(repositoryRoot);
      const expectedJson = serializeWorkflowGraph(graph);
      const expectedMarkdown = renderWorkflowMapMarkdown(graph);
      if (generated.json !== expectedJson) push(errors, `${WORKFLOW_MAP_JSON_PATH} is out of date; run npm.cmd run workflow-map:generate`);
      if (generated.markdown !== expectedMarkdown) push(errors, `${WORKFLOW_MAP_MARKDOWN_PATH} is out of date; run npm.cmd run workflow-map:generate`);
      JSON.parse(generated.json);
    } catch (error) {
      push(errors, `generated workflow-map outputs could not be read: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return errors;
}

export function assertWorkflowMapValid(graph: WorkflowGraph = WORKFLOW_GRAPH, options: WorkflowMapValidationOptions = {}): void {
  const errors = collectWorkflowMapErrors(graph, options);
  if (errors.length) throw new Error(`Workflow map validation failed:\n${errors.map((error) => `- ${error}`).join("\n")}`);
}

export function assertHighValueWorkflowSemantics(graph: WorkflowGraph = WORKFLOW_GRAPH): void {
  const errors = collectHighValueSemanticErrors(graph);
  if (errors.length) throw new Error(`Workflow map semantic validation failed:\n${errors.map((error) => `- ${error}`).join("\n")}`);
}

if (basename(process.argv[1] || "") === "validate.ts") {
  try {
    assertWorkflowMapValid(WORKFLOW_GRAPH, { checkGenerated: process.argv.includes("--check") });
    console.log(`Workflow map valid: ${WORKFLOW_GRAPH.nodes.length} nodes, ${WORKFLOW_GRAPH.edges.length} edges.`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
