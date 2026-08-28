import test from "node:test";
import assert from "node:assert/strict";
import {
  collectWorkflowMapConsistencyErrors,
} from "../scripts/workflow-map/consistency.ts";
import {
  WORKFLOW_MAP_CONSISTENCY_CONTRACTS,
  type WorkflowMapConsistencyContracts,
} from "../scripts/workflow-map/consistency-contracts.ts";
import { WORKFLOW_GRAPH } from "../scripts/workflow-map/graph.ts";
import type { WorkflowGraph, WorkflowNode } from "../scripts/workflow-map/types.ts";

function graphWithNode(nodeId: string, update: (node: WorkflowNode) => WorkflowNode): WorkflowGraph {
  return {
    ...WORKFLOW_GRAPH,
    nodes: WORKFLOW_GRAPH.nodes.map((node) => node.id === nodeId ? update({ ...node, route: node.route ? { ...node.route } : undefined }) : node),
  };
}

function graphWithEdges(edges: WorkflowGraph["edges"]): WorkflowGraph {
  return { ...WORKFLOW_GRAPH, edges };
}

function graphWithInvariant(invariantId: string, testRefs: readonly string[]): WorkflowGraph {
  return {
    ...WORKFLOW_GRAPH,
    invariants: WORKFLOW_GRAPH.invariants.map((invariant) => invariant.id === invariantId ? { ...invariant, testRefs } : invariant),
  };
}

function graphWithDiagram(diagramId: string, nodeIds: readonly string[]): WorkflowGraph {
  return {
    ...WORKFLOW_GRAPH,
    diagrams: WORKFLOW_GRAPH.diagrams.map((diagram) => diagram.id === diagramId ? { ...diagram, nodeIds } : diagram),
  };
}

function contractsWith(overrides: Partial<WorkflowMapConsistencyContracts>): WorkflowMapConsistencyContracts {
  return { ...WORKFLOW_MAP_CONSISTENCY_CONTRACTS, ...overrides };
}

function assertHasError(errors: readonly string[], fragment: string) {
  assert.ok(errors.some((error) => error.includes(fragment)), `Expected an error containing ${fragment}; received:\n${errors.join("\n")}`);
}

test("WM-3 accepts the current graph and authoritative source contracts", () => {
  assert.deepEqual(collectWorkflowMapConsistencyErrors(WORKFLOW_GRAPH), []);
});

test("WM-3 catches a renamed route ID", () => {
  const graph = graphWithNode("route-dashboard", (node) => ({ ...node, route: { ...node.route!, routeId: "renamed-dashboard" } }));
  assertHasError(collectWorkflowMapConsistencyErrors(graph), "[route] node route-dashboard: route ID mismatch");
});

test("WM-3 catches a canonical route path mismatch", () => {
  const graph = graphWithNode("route-dashboard", (node) => ({ ...node, route: { ...node.route!, canonicalPath: "/changed-dashboard" } }));
  assertHasError(collectWorkflowMapConsistencyErrors(graph), "[route] node route-dashboard: canonical path mismatch");
});

test("WM-3 catches a deep-link query-key mismatch", () => {
  const graph = graphWithNode("route-payroll-run", (node) => ({ ...node, route: { ...node.route!, queryKeys: ["from"] } }));
  assertHasError(collectWorkflowMapConsistencyErrors(graph), "[route] node route-payroll-run: deep-link query keys mismatch");
});

test("WM-3 rejects unknown node and edge permission keys", () => {
  const nodeGraph = graphWithNode("company-rbac", (node) => ({ ...node, permissionKeys: [...(node.permissionKeys || []), "company.typo"] }));
  assertHasError(collectWorkflowMapConsistencyErrors(nodeGraph), "[permission] node company-rbac: unknown permission key `company.typo`");

  const edgeGraph: WorkflowGraph = {
    ...WORKFLOW_GRAPH,
    edges: WORKFLOW_GRAPH.edges.map((edge) => edge.id === "directory-to-selection" ? { ...edge, permissionKeys: ["projects.read", "projects.typo"] } : edge),
  };
  assertHasError(collectWorkflowMapConsistencyErrors(edgeGraph), "[permission] edge directory-to-selection: unknown permission key `projects.typo`");
});

test("WM-3 catches RFI lifecycle status drift", () => {
  const graph = graphWithNode("rfi-lifecycle", (node) => ({ ...node, statusValues: node.statusValues?.slice(0, -1) }));
  assertHasError(collectWorkflowMapConsistencyErrors(graph), "[lifecycle] rfi-lifecycle: status set mismatch");
});

test("WM-3 catches Technical Submittal lifecycle transition drift", () => {
  const transition = WORKFLOW_GRAPH.edges.find((edge) => edge.id === "submittal-review-to-approved");
  assert.ok(transition);
  const graph = graphWithEdges(WORKFLOW_GRAPH.edges.filter((edge) => edge.id !== transition.id));
  assertHasError(collectWorkflowMapConsistencyErrors(graph), "[lifecycle] submittal-lifecycle: graph omits supported transition UNDER_REVIEW -> APPROVED");
});

test("WM-3 catches Daily Site Log lifecycle status drift", () => {
  const graph = graphWithNode("site-log-lifecycle", (node) => ({ ...node, statusValues: [...(node.statusValues || []), "ARCHIVED"] }));
  assertHasError(collectWorkflowMapConsistencyErrors(graph), "[lifecycle] site-log-lifecycle: status set mismatch");
});

test("WM-3 catches unknown QA scenario references", () => {
  const graph = graphWithNode("demo-mode", (node) => ({ ...node, qaScenarioIds: [...(node.qaScenarioIds || []), "synthetic-qa-missing"] }));
  assertHasError(collectWorkflowMapConsistencyErrors(graph), "[qa] node demo-mode: unknown QA scenario ID `synthetic-qa-missing`");
});

test("WM-3 catches a deterministic QA route mismatch", () => {
  const qaScenarios = WORKFLOW_MAP_CONSISTENCY_CONTRACTS.qaScenarios.map((scenario) => scenario.id === "rfis--rfi-detail--rfi-detail-opened--desktop-1440"
    ? { ...scenario, route: { ...scenario.route, canonicalPath: "/projects/:projectId/wrong" } }
    : scenario);
  const contracts = contractsWith({ qaScenarios });
  assertHasError(collectWorkflowMapConsistencyErrors(WORKFLOW_GRAPH, { contracts }), "[qa] node route-rfi-detail: scenario rfis--rfi-detail--rfi-detail-opened--desktop-1440 route mismatch");
});

test("WM-3 requires regression coverage for selected high-risk workflows", () => {
  const graph = graphWithNode("rfi-lifecycle", (node) => ({ ...node, testRefs: [] }));
  assertHasError(collectWorkflowMapConsistencyErrors(graph), "[coverage] node rfi-lifecycle: high-risk workflow has no committed regression test reference");

  const invariantGraph = graphWithInvariant("assistant-mutations-require-confirmation", []);
  assertHasError(collectWorkflowMapConsistencyErrors(invariantGraph), "[coverage] invariant assistant-mutations-require-confirmation: high-risk invariant has no committed regression test reference");
});

test("WM-3 catches an Assistant confirmation-policy mismatch", () => {
  const mutationTool = WORKFLOW_MAP_CONSISTENCY_CONTRACTS.assistant.tools.find((tool) => WORKFLOW_MAP_CONSISTENCY_CONTRACTS.assistant.confirmationRequiredByRiskTier[tool.riskTier]);
  assert.ok(mutationTool);
  const assistant = {
    ...WORKFLOW_MAP_CONSISTENCY_CONTRACTS.assistant,
    tools: WORKFLOW_MAP_CONSISTENCY_CONTRACTS.assistant.tools.map((tool) => tool.name === mutationTool.name ? { ...tool, requiresConfirmation: false } : tool),
  };
  const contracts = contractsWith({ assistant });
  assertHasError(collectWorkflowMapConsistencyErrors(WORKFLOW_GRAPH, { contracts }), `[assistant] tool ${mutationTool.name}: confirmation mismatch`);
});

test("WM-3 catches an obvious graph orphan", () => {
  const orphan: WorkflowNode = {
    id: "synthetic-orphan",
    label: "Synthetic orphan",
    domain: "dashboard",
    type: "screen",
    description: "Synthetic fixture used to prove orphan detection.",
    sourceClassification: "curated",
  };
  const graph: WorkflowGraph = { ...WORKFLOW_GRAPH, nodes: [...WORKFLOW_GRAPH.nodes, orphan] };
  assertHasError(collectWorkflowMapConsistencyErrors(graph), "[graph] node synthetic-orphan: structural orphan");
});

test("WM-3 catches invalid diagram references and duplicate diagram nodes", () => {
  const missingReference = graphWithDiagram("overview", [...WORKFLOW_GRAPH.diagrams[0]!.nodeIds, "synthetic-missing-node"]);
  assertHasError(collectWorkflowMapConsistencyErrors(missingReference), "[diagram] overview: diagram references missing node IDs");

  const duplicateNode = graphWithDiagram("overview", [...WORKFLOW_GRAPH.diagrams[0]!.nodeIds, WORKFLOW_GRAPH.diagrams[0]!.nodeIds[0]!]);
  assertHasError(collectWorkflowMapConsistencyErrors(duplicateNode), "[diagram] overview: diagram repeats a node ID");
});

test("WM-3 preserves the settlement/project-cost separation contract", () => {
  const errors = collectWorkflowMapConsistencyErrors(WORKFLOW_GRAPH);
  assert.deepEqual(errors.filter((error) => error.startsWith("[settlement]")), []);
  assert.deepEqual(errors.filter((error) => error.includes("invoice-project-cost-independent-from-settlement")), []);
});

test("WM-3 preserves the payroll labor-cost/net-pay settlement contract", () => {
  const errors = collectWorkflowMapConsistencyErrors(WORKFLOW_GRAPH);
  assert.deepEqual(errors.filter((error) => error.includes("payroll-labor-cost-independent-from-net-pay-settlement")), []);
  assert.deepEqual(errors.filter((error) => error.startsWith("[lifecycle] payroll-lifecycle")), []);
});

test("WM-3 accepts the current demo isolation contract", () => {
  const errors = collectWorkflowMapConsistencyErrors(WORKFLOW_GRAPH);
  assert.deepEqual(errors.filter((error) => error.startsWith("[demo]")), []);
});
