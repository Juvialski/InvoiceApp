import { basename } from "node:path";
import { WORKFLOW_GRAPH } from "./graph.ts";
import { WORKFLOW_MAP_CONSISTENCY_CONTRACTS, type WorkflowLifecycleContract, type WorkflowMapConsistencyContracts } from "./consistency-contracts.ts";
import type { WorkflowGraph, WorkflowNode } from "./types.ts";

function addError(errors: string[], category: string, owner: string, message: string) {
  errors.push(`[${category}] ${owner}: ${message}`);
}

function valuesDifference(expected: readonly string[], actual: readonly string[]) {
  const expectedSet = new Set(expected);
  const actualSet = new Set(actual);
  return {
    missing: expected.filter((value) => !actualSet.has(value)),
    extra: actual.filter((value) => !expectedSet.has(value)),
  };
}

function formatValues(values: readonly string[]) {
  return values.length ? values.map((value) => `\`${value}\``).join(", ") : "none";
}

function queryKeysFromPath(path: string): string[] {
  const query = path.split("?", 2)[1];
  return query ? [...new URLSearchParams(query).keys()] : [];
}

function pathWithoutQuery(path: string): string {
  return path.split("?", 1)[0] || "/";
}

function appPathForQaPath(path: string): string {
  const normalized = pathWithoutQuery(path);
  if (normalized === "/demo/app") return "/";
  return normalized.startsWith("/demo/app/") ? normalized.slice("/demo/app".length) : normalized;
}

function routePathForComparison(path: string): string {
  const normalized = pathWithoutQuery(path);
  return normalized.startsWith("/demo/app/") ? normalized.slice("/demo/app".length) : normalized;
}

function routePatternMatches(path: string, pattern: string): boolean {
  const actualSegments = routePathForComparison(path).split("/").filter(Boolean);
  const expectedSegments = routePathForComparison(pattern).split("/").filter(Boolean);
  if (actualSegments.length !== expectedSegments.length) return false;
  return expectedSegments.every((segment, index) => segment.startsWith(":") || segment === actualSegments[index]);
}

function stateLabelStatus(node: WorkflowNode): string | undefined {
  const separator = node.label.lastIndexOf("·");
  return separator >= 0 ? node.label.slice(separator + 1).trim() : undefined;
}

function transitionPairs(contract: WorkflowLifecycleContract): Set<string> {
  return new Set(Object.entries(contract.transitions).flatMap(([from, targets]) => targets.map((to) => `${from} -> ${to}`)));
}

function graphLifecycleTransitions(graph: WorkflowGraph, contract: WorkflowLifecycleContract, errors: string[]): Set<string> {
  const stateNodes = graph.nodes.filter((node) => node.type === "state" && node.id.startsWith(contract.stateNodePrefix));
  const statusByNodeId = new Map<string, string>();
  for (const node of stateNodes) {
    const status = stateLabelStatus(node);
    if (!status) {
      addError(errors, "lifecycle", contract.graphNodeId, `state node ${node.id} has no parseable status label`);
      continue;
    }
    if (statusByNodeId.has(status)) addError(errors, "lifecycle", contract.graphNodeId, `multiple graph state nodes represent ${status}`);
    statusByNodeId.set(node.id, status);
  }

  const graphStatuses = new Set(graph.nodes.find((node) => node.id === contract.graphNodeId)?.statusValues || []);
  for (const status of contract.statuses) {
    if (![...statusByNodeId.values()].includes(status)) addError(errors, "lifecycle", contract.graphNodeId, `graph is missing a state node for supported status ${status}`);
  }
  for (const status of statusByNodeId.values()) {
    if (!graphStatuses.has(status)) addError(errors, "lifecycle", contract.graphNodeId, `graph state node represents ${status}, but lifecycle metadata omits it`);
  }

  const stateIds = new Set(stateNodes.map((node) => node.id));
  const pairs = new Set<string>();
  for (const edge of graph.edges.filter((candidate) => candidate.type === "transitions" && (stateIds.has(candidate.source) || stateIds.has(candidate.target)))) {
    if (!stateIds.has(edge.source) || !stateIds.has(edge.target)) {
      addError(errors, "lifecycle", contract.graphNodeId, `transition edge ${edge.id} leaves the ${contract.stateNodePrefix} state set`);
      continue;
    }
    const from = statusByNodeId.get(edge.source);
    const to = statusByNodeId.get(edge.target);
    if (!from || !to) continue;
    pairs.add(`${from} -> ${to}`);
  }
  return pairs;
}

function validateRoutes(graph: WorkflowGraph, contracts: WorkflowMapConsistencyContracts, errors: string[]) {
  const contractById = new Map(contracts.routeContracts.map((contract) => [contract.id, contract]));
  for (const node of graph.nodes.filter((candidate) => candidate.type === "route")) {
    const route = node.route;
    if (!route) {
      addError(errors, "route", `node ${node.id}`, "is missing authoritative route metadata");
      continue;
    }
    const contractId = contracts.routeAdapter[node.id];
    if (!contractId) {
      addError(errors, "route", `node ${node.id}`, "has no authoritative route contract adapter");
      continue;
    }
    const contract = contractById.get(contractId);
    if (!contract) {
      addError(errors, "route", `node ${node.id}`, `adapter references missing source contract \`${contractId}\``);
      continue;
    }
    if ((contract.routeId || undefined) !== (route.routeId || undefined)) {
      addError(errors, "route", `node ${node.id}`, `route ID mismatch; graph: ${route.routeId ? `\`${route.routeId}\`` : "none"}; code: ${contract.routeId ? `\`${contract.routeId}\`` : "none"}`);
    }
    if (contract.canonicalPath !== route.canonicalPath) {
      addError(errors, "route", `node ${node.id}`, `canonical path mismatch; graph: \`${route.canonicalPath}\`; code: \`${contract.canonicalPath}\``);
    }
    if ((contract.pathPattern || contract.canonicalPath.split("?", 1)[0]) !== (route.pathPattern || route.canonicalPath.split("?", 1)[0])) {
      addError(errors, "route", `node ${node.id}`, `path pattern mismatch; graph: \`${route.pathPattern || "none"}\`; code: \`${contract.pathPattern || "none"}\``);
    }
    const queryDifference = valuesDifference(contract.queryKeys || [], route.queryKeys || []);
    if (queryDifference.missing.length || queryDifference.extra.length) {
      addError(errors, "route", `node ${node.id}`, `deep-link query keys mismatch; missing in graph: ${formatValues(queryDifference.missing)}; unexpected in graph: ${formatValues(queryDifference.extra)}`);
    }
    if (contract.scope && contract.scope !== route.scope) {
      addError(errors, "route", `node ${node.id}`, `scope mismatch; graph: \`${route.scope || "none"}\`; code: \`${contract.scope}\``);
    }
  }
}

function validatePermissions(graph: WorkflowGraph, contracts: WorkflowMapConsistencyContracts, errors: string[]) {
  const supported = new Set(contracts.permissionKeys);
  for (const node of graph.nodes) {
    for (const permission of node.permissionKeys || []) {
      if (!supported.has(permission)) addError(errors, "permission", `node ${node.id}`, `unknown permission key \`${permission}\`; source access-control contract does not define it`);
    }
  }
  for (const edge of graph.edges) {
    for (const permission of edge.permissionKeys || []) {
      if (!supported.has(permission)) addError(errors, "permission", `edge ${edge.id}`, `unknown permission key \`${permission}\`; source access-control contract does not define it`);
    }
  }
}

function validateFeatureAvailability(graph: WorkflowGraph, contracts: WorkflowMapConsistencyContracts, errors: string[]) {
  const activeRouteIds = new Set(contracts.activeFeatureRouteIds);
  for (const nodeId of contracts.featureRouteNodeIds) {
    const node = graph.nodes.find((candidate) => candidate.id === nodeId);
    const routeId = node?.route?.routeId;
    if (!node) {
      addError(errors, "feature", `node ${nodeId}`, "mapped major route node is missing");
    } else if (!routeId || !activeRouteIds.has(routeId)) {
      addError(errors, "feature", `node ${nodeId}`, `mapped route \`${routeId || "none"}\` is not present on an ACTIVE feature registration`);
    }
  }
}

function validateLifecycles(graph: WorkflowGraph, contracts: WorkflowMapConsistencyContracts, errors: string[]) {
  for (const contract of contracts.lifecycleContracts) {
    const node = graph.nodes.find((candidate) => candidate.id === contract.graphNodeId);
    if (!node) {
      addError(errors, "lifecycle", contract.graphNodeId, "mapped lifecycle node is missing");
      continue;
    }
    const actualStatuses = node.statusValues || [];
    const statusDifference = valuesDifference(contract.statuses, actualStatuses);
    if (statusDifference.missing.length || statusDifference.extra.length) {
      addError(errors, "lifecycle", contract.graphNodeId, `status set mismatch; missing in graph: ${formatValues(statusDifference.missing)}; unsupported in graph: ${formatValues(statusDifference.extra)}`);
    }
    const expectedTransitions = transitionPairs(contract);
    const actualTransitions = graphLifecycleTransitions(graph, contract, errors);
    const missingTransitions = [...expectedTransitions].filter((transition) => !actualTransitions.has(transition));
    const extraTransitions = [...actualTransitions].filter((transition) => !expectedTransitions.has(transition));
    for (const transition of missingTransitions) addError(errors, "lifecycle", contract.graphNodeId, `graph omits supported transition ${transition}`);
    for (const transition of extraTransitions) addError(errors, "lifecycle", contract.graphNodeId, `graph contains unsupported transition ${transition}`);
  }
}

function validateSettlementStatuses(graph: WorkflowGraph, contracts: WorkflowMapConsistencyContracts, errors: string[]) {
  for (const contract of contracts.settlementStatusContracts) {
    const node = graph.nodes.find((candidate) => candidate.id === contract.graphNodeId);
    if (!node) {
      addError(errors, "settlement", contract.graphNodeId, "mapped settlement lifecycle node is missing");
      continue;
    }
    for (const status of contract.requiredStatuses) {
      if (!(node.statusValues || []).includes(status)) addError(errors, "settlement", contract.graphNodeId, `stable source settlement status \`${status}\` is missing from the graph lifecycle`);
    }
  }
}

function validateAssistant(graph: WorkflowGraph, contracts: WorkflowMapConsistencyContracts, errors: string[]) {
  const preparedNode = graph.nodes.find((node) => node.id === "assistant-prepared-action");
  const executionNode = graph.nodes.find((node) => node.id === "assistant-guarded-execution");
  const expectedStatuses = contracts.assistant.preparedActionStatuses;
  const statusDifference = valuesDifference(expectedStatuses, preparedNode?.statusValues || []);
  if (statusDifference.missing.length || statusDifference.extra.length) {
    addError(errors, "assistant", "assistant-prepared-action", `prepared-action status mismatch; missing in graph: ${formatValues(statusDifference.missing)}; unsupported in graph: ${formatValues(statusDifference.extra)}`);
  }
  if (preparedNode?.confirmationRequirement !== "human") addError(errors, "assistant", "assistant-prepared-action", "graph must require human confirmation for persisted mutation actions");
  if (executionNode?.confirmationRequirement !== "human") addError(errors, "assistant", "assistant-guarded-execution", "graph must retain the human-confirmed guarded execution boundary");

  let mutationToolCount = 0;
  for (const tool of contracts.assistant.tools) {
    const policyValue = contracts.assistant.confirmationRequiredByRiskTier[tool.riskTier];
    if (policyValue === undefined) {
      addError(errors, "assistant", `tool ${tool.name}`, `risk tier \`${tool.riskTier}\` is absent from the authoritative confirmation policy`);
      continue;
    }
    if (policyValue) mutationToolCount += 1;
    if (tool.requiresConfirmation !== policyValue) {
      addError(errors, "assistant", `tool ${tool.name}`, `confirmation mismatch; graph/application contract expects ${policyValue ? "human confirmation" : "no confirmation"}, tool metadata says ${tool.requiresConfirmation ? "confirmation required" : "confirmation not required"}`);
    }
  }
  if (!mutationToolCount) addError(errors, "assistant", "assistant-mutation-request", "authoritative tool registry exposes no confirmation-gated mutation tools");
}

function validateDemoIsolation(graph: WorkflowGraph, contracts: WorkflowMapConsistencyContracts, errors: string[]) {
  for (const check of contracts.demo.checks) {
    const actual = contracts.demo.modeForPath(check.pathname, check.search);
    if (actual !== check.expectedMode) addError(errors, "demo", check.label, `application mode mismatch; expected \`${check.expectedMode}\`, received \`${actual}\``);
    if (check.expectedMode === "demo" && !contracts.demo.isDemoPath(check.pathname)) addError(errors, "demo", check.label, "source mode contract does not recognize the path as demo-isolated");
  }
  const demoNode = graph.nodes.find((node) => node.id === "demo-mode");
  if (demoNode?.scope !== "demo-only") addError(errors, "demo", "demo-mode", "graph scope must remain demo-only");
}

function validateQaReferences(graph: WorkflowGraph, contracts: WorkflowMapConsistencyContracts, errors: string[]) {
  const scenarios = new Map(contracts.qaScenarios.map((scenario) => [scenario.id, scenario]));
  for (const node of graph.nodes) {
    for (const scenarioId of node.qaScenarioIds || []) {
      const scenario = scenarios.get(scenarioId);
      if (!scenario) {
        addError(errors, "qa", `node ${node.id}`, `unknown QA scenario ID \`${scenarioId}\``);
        continue;
      }
      if (!node.route) continue;
      const graphPathPattern = routePathForComparison(node.route.pathPattern || node.route.canonicalPath);
      const scenarioCanonicalPath = appPathForQaPath(scenario.route.canonicalPath);
      if (pathWithoutQuery(graphPathPattern) !== pathWithoutQuery(scenarioCanonicalPath)) {
        addError(errors, "qa", `node ${node.id}`, `scenario ${scenarioId} route mismatch; graph pattern: \`${graphPathPattern}\`; scenario route: \`${scenario.route.canonicalPath}\``);
      }
      const scenarioQueryKeys = queryKeysFromPath(scenario.route.canonicalPath);
      const graphQueryKeys = new Set(node.route.queryKeys || []);
      const unexpectedScenarioKeys = scenarioQueryKeys.filter((key) => !graphQueryKeys.has(key));
      if (unexpectedScenarioKeys.length) addError(errors, "qa", `node ${node.id}`, `scenario ${scenarioId} uses query keys absent from the graph route: ${formatValues(unexpectedScenarioKeys)}`);
      const unexpectedActualKeys = queryKeysFromPath(scenario.path).filter((key) => !graphQueryKeys.has(key));
      if (unexpectedActualKeys.length) addError(errors, "qa", `node ${node.id}`, `scenario ${scenarioId} actual path uses query keys absent from the graph route: ${formatValues(unexpectedActualKeys)}`);
      if (!scenario.hasAction && !routePatternMatches(scenario.path, graphPathPattern)) addError(errors, "qa", `node ${node.id}`, `scenario ${scenarioId} actual path does not match graph pattern \`${node.route.pathPattern || node.route.canonicalPath}\`: \`${scenario.path}\``);
    }
  }
}

function validateCoverage(graph: WorkflowGraph, contracts: WorkflowMapConsistencyContracts, errors: string[]) {
  for (const nodeId of contracts.requiredCoverageNodeIds) {
    const node = graph.nodes.find((candidate) => candidate.id === nodeId);
    if (!node) {
      addError(errors, "coverage", `node ${nodeId}`, "required high-risk workflow node is missing");
    } else if (!node.testRefs?.some((reference) => reference.trim())) {
      addError(errors, "coverage", `node ${nodeId}`, "high-risk workflow has no committed regression test reference");
    }
  }
  for (const invariantId of contracts.requiredCoverageInvariantIds) {
    const invariant = graph.invariants.find((candidate) => candidate.id === invariantId);
    if (!invariant) {
      addError(errors, "coverage", `invariant ${invariantId}`, "required high-risk invariant is missing");
    } else if (!invariant.testRefs?.some((reference) => reference.trim())) {
      addError(errors, "coverage", `invariant ${invariantId}`, "high-risk invariant has no committed regression test reference");
    }
  }
}

function nodeDegrees(graph: WorkflowGraph): Map<string, number> {
  const degrees = new Map(graph.nodes.map((node) => [node.id, 0]));
  for (const edge of graph.edges) {
    degrees.set(edge.source, (degrees.get(edge.source) || 0) + 1);
    degrees.set(edge.target, (degrees.get(edge.target) || 0) + 1);
  }
  return degrees;
}

function validateOrphans(graph: WorkflowGraph, errors: string[]) {
  const degrees = nodeDegrees(graph);
  for (const node of graph.nodes) {
    if ((degrees.get(node.id) || 0) === 0) addError(errors, "graph", `node ${node.id}`, "structural orphan: no incoming or outgoing edge");
  }
}

function validateDiagrams(graph: WorkflowGraph, contracts: WorkflowMapConsistencyContracts, errors: string[]) {
  const nodeIds = new Set(graph.nodes.map((node) => node.id));
  const diagramIds = new Set<string>();
  const degrees = nodeDegrees(graph);
  for (const diagram of graph.diagrams) {
    if (diagramIds.has(diagram.id)) addError(errors, "diagram", diagram.id, "diagram ID is duplicated");
    diagramIds.add(diagram.id);
    if (!diagram.nodeIds.length) addError(errors, "diagram", diagram.id, "diagram is empty");
    if (new Set(diagram.nodeIds).size !== diagram.nodeIds.length) addError(errors, "diagram", diagram.id, "diagram repeats a node ID");
    const missing = diagram.nodeIds.filter((nodeId) => !nodeIds.has(nodeId));
    if (missing.length) addError(errors, "diagram", diagram.id, `diagram references missing node IDs: ${formatValues(missing)}`);
    const orphaned = diagram.nodeIds.filter((nodeId) => nodeIds.has(nodeId) && (degrees.get(nodeId) || 0) === 0);
    if (orphaned.length) addError(errors, "diagram", diagram.id, `diagram includes structurally orphaned nodes: ${formatValues(orphaned)}`);
  }
  for (const requiredId of contracts.requiredDiagramIds) {
    if (!diagramIds.has(requiredId)) addError(errors, "diagram", requiredId, "required WM-2 diagram preset is missing");
  }
}

function sameSelectedValues(actual: Readonly<Record<string, string | undefined>>, expected: Readonly<Record<string, string | undefined>>): string[] {
  const keys = new Set([...Object.keys(actual), ...Object.keys(expected)]);
  return [...keys].filter((key) => actual[key] !== expected[key]);
}

function validateRoundTrips(contracts: WorkflowMapConsistencyContracts, errors: string[]) {
  for (const contract of contracts.routeRoundTrips) {
    try {
      const { actual, expected } = contract.run();
      const differences: string[] = [];
      if (actual.kind !== expected.kind) differences.push(`kind graph=${actual.kind} code=${expected.kind}`);
      if (actual.routeId !== expected.routeId) differences.push(`routeId graph=${actual.routeId || "none"} code=${expected.routeId || "none"}`);
      if (actual.pathname !== expected.pathname) differences.push(`pathname graph=${actual.pathname} code=${expected.pathname}`);
      if (actual.search !== expected.search) differences.push(`search graph=${actual.search || "none"} code=${expected.search || "none"}`);
      const selectedDifferences = sameSelectedValues(actual.selected, expected.selected);
      if (selectedDifferences.length) differences.push(`selected keys ${selectedDifferences.join(", ")}`);
      if (differences.length) addError(errors, "roundtrip", `node ${contract.graphNodeId}`, `${contract.description} failed: ${differences.join("; ")}`);
    } catch (error) {
      addError(errors, "roundtrip", `node ${contract.graphNodeId}`, `${contract.description} threw ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

export interface WorkflowMapConsistencyOptions {
  readonly contracts?: WorkflowMapConsistencyContracts;
}

export function collectWorkflowMapConsistencyErrors(
  graph: WorkflowGraph = WORKFLOW_GRAPH,
  options: WorkflowMapConsistencyOptions = {},
): string[] {
  const contracts = options.contracts || WORKFLOW_MAP_CONSISTENCY_CONTRACTS;
  const errors: string[] = [];
  validateRoutes(graph, contracts, errors);
  validatePermissions(graph, contracts, errors);
  validateFeatureAvailability(graph, contracts, errors);
  validateLifecycles(graph, contracts, errors);
  validateSettlementStatuses(graph, contracts, errors);
  validateAssistant(graph, contracts, errors);
  validateDemoIsolation(graph, contracts, errors);
  validateQaReferences(graph, contracts, errors);
  validateCoverage(graph, contracts, errors);
  validateOrphans(graph, errors);
  validateDiagrams(graph, contracts, errors);
  validateRoundTrips(contracts, errors);
  return errors;
}

export function assertWorkflowMapConsistent(
  graph: WorkflowGraph = WORKFLOW_GRAPH,
  options: WorkflowMapConsistencyOptions = {},
): void {
  const errors = collectWorkflowMapConsistencyErrors(graph, options);
  if (errors.length) throw new Error(`Workflow map consistency validation failed:\n${errors.map((error) => `- ${error}`).join("\n")}`);
}

if (basename(process.argv[1] || "") === "consistency.ts") {
  try {
    assertWorkflowMapConsistent();
    console.log(`Workflow map consistent: ${WORKFLOW_GRAPH.nodes.length} nodes, ${WORKFLOW_GRAPH.edges.length} edges, ${WORKFLOW_GRAPH.invariants.length} invariants, ${WORKFLOW_GRAPH.diagrams.length} diagrams.`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
