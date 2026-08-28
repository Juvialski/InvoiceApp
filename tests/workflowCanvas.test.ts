import test from "node:test";
import assert from "node:assert/strict";
import { WORKFLOW_GRAPH } from "../scripts/workflow-map/graph.ts";
import {
  computeNeighborhood,
  DEFAULT_FILTER,
  filterGraph,
  formatWorkflowMapUrlQuery,
  getCanvasPresets,
  getNodeDetails,
  layoutGraph,
  parseWorkflowMapUrlState,
  searchNodes,
} from "../src/workflow-map/workflowCanvasUtils.ts";
import type { WorkflowCanvasFilter } from "../src/workflow-map/workflowCanvasTypes.ts";

test("getCanvasPresets produces curated diagrams, domain views, and full architecture preset", () => {
  const presets = getCanvasPresets(WORKFLOW_GRAPH);
  assert.ok(presets.length >= 14);

  const curated = presets.filter((p) => p.category === "curated");
  assert.equal(curated.length, WORKFLOW_GRAPH.diagrams.length);
  assert.deepEqual(
    curated.map((c) => c.id),
    WORKFLOW_GRAPH.diagrams.map((d) => d.id),
  );

  const allPreset = presets.find((p) => p.id === "all");
  assert.ok(allPreset);
  assert.equal(allPreset.category, "all");

  const domainPresets = presets.filter((p) => p.category === "domain");
  assert.equal(domainPresets.length, 8);
});

test("filterGraph respects curated preset definitions and does not show all 183 nodes by default", () => {
  // Default filter uses "overview"
  const defaultResult = filterGraph(WORKFLOW_GRAPH, DEFAULT_FILTER);
  const overviewDiagram = WORKFLOW_GRAPH.diagrams.find((d) => d.id === "overview")!;
  assert.equal(defaultResult.nodes.length, overviewDiagram.nodeIds.length);
  assert.ok(defaultResult.nodes.length < WORKFLOW_GRAPH.nodes.length);
  assert.ok(defaultResult.edges.length > 0);

  // Curated presets match canonical diagram node counts
  for (const diagram of WORKFLOW_GRAPH.diagrams) {
    const res = filterGraph(WORKFLOW_GRAPH, { ...DEFAULT_FILTER, presetId: diagram.id });
    assert.equal(res.nodes.length, diagram.nodeIds.length);
    assert.deepEqual(
      new Set(res.nodes.map((n) => n.id)),
      new Set(diagram.nodeIds),
    );
  }

  // "all" preset returns all nodes and edges
  const allResult = filterGraph(WORKFLOW_GRAPH, { ...DEFAULT_FILTER, presetId: "all" });
  assert.equal(allResult.nodes.length, WORKFLOW_GRAPH.nodes.length);
  assert.equal(allResult.edges.length, WORKFLOW_GRAPH.edges.length);
});

test("domain and node-type filtering correctly reduce visible nodes", () => {
  // Domain filter
  const financeOnly = filterGraph(WORKFLOW_GRAPH, {
    ...DEFAULT_FILTER,
    presetId: "all",
    selectedDomains: ["finance"],
  });
  assert.ok(financeOnly.nodes.length > 0);
  assert.ok(financeOnly.nodes.every((n) => n.domain === "finance"));

  // Node type filter
  const guardsOnly = filterGraph(WORKFLOW_GRAPH, {
    ...DEFAULT_FILTER,
    presetId: "all",
    selectedNodeTypes: ["guard"],
  });
  assert.ok(guardsOnly.nodes.length > 0);
  assert.ok(guardsOnly.nodes.every((n) => n.type === "guard"));

  // Invariants only filter
  const invariantsOnly = filterGraph(WORKFLOW_GRAPH, {
    ...DEFAULT_FILTER,
    presetId: "all",
    filterInvariantOnly: true,
  });
  assert.ok(invariantsOnly.nodes.length > 0);
  assert.ok(invariantsOnly.nodes.every((n) => n.invariantIds && n.invariantIds.length > 0));
});

test("searchNodes finds matching nodes across labels, IDs, routes, statuses, and descriptions", () => {
  const terms = ["payroll", "invoice", "settlement", "RFI", "submittal", "site log", "confirmation"];
  for (const term of terms) {
    const results = searchNodes(WORKFLOW_GRAPH.nodes, term);
    assert.ok(results.length > 0, `Search for "${term}" returned at least one result`);
  }

  // Exact ID search prioritizes target node
  const idSearch = searchNodes(WORKFLOW_GRAPH.nodes, "cash-settlement-match");
  assert.equal(idSearch[0].id, "cash-settlement-match");

  // Canonical route search
  const routeSearch = searchNodes(WORKFLOW_GRAPH.nodes, "/invoices");
  assert.ok(routeSearch.some((n) => n.route?.canonicalPath === "/invoices"));
});

test("computeNeighborhood accurately resolves 1-hop and 2-hop graph connectivity", () => {
  const targetId = "assistant-human-confirmation";
  const neighborhood1 = computeNeighborhood(WORKFLOW_GRAPH, targetId, 1);

  assert.equal(neighborhood1.selectedNodeId, targetId);
  assert.ok(neighborhood1.neighborNodeIds.has(targetId));
  assert.ok(neighborhood1.directIncomingNodeIds.size > 0);
  assert.ok(neighborhood1.directOutgoingNodeIds.size > 0);

  // Incoming to human confirmation should include prepared action
  assert.ok(neighborhood1.directIncomingNodeIds.has("assistant-prepared-action"));
  // Outgoing from human confirmation should include guarded execution
  assert.ok(neighborhood1.directOutgoingNodeIds.has("assistant-guarded-execution"));

  // 2-hop neighborhood expands scope
  const neighborhood2 = computeNeighborhood(WORKFLOW_GRAPH, targetId, 2);
  assert.ok(neighborhood2.neighborNodeIds.size > neighborhood1.neighborNodeIds.size);
});

test("focusNeighborhood in filterGraph isolates selected node and immediate neighbors", () => {
  const targetId = "site-log-crew-observation";
  const result = filterGraph(WORKFLOW_GRAPH, {
    ...DEFAULT_FILTER,
    presetId: "all",
    selectedNodeId: targetId,
    focusNeighborhood: true,
    neighborhoodHops: 1,
  });

  assert.ok(result.nodes.some((n) => n.id === targetId));
  const neighborhood = computeNeighborhood(WORKFLOW_GRAPH, targetId, 1);
  assert.equal(result.nodes.length, neighborhood.neighborNodeIds.size);
  assert.deepEqual(
    new Set(result.nodes.map((n) => n.id)),
    new Set(neighborhood.neighborNodeIds),
  );
});

test("getNodeDetails builds comprehensive node view with invariants, edges, and file references", () => {
  const details = getNodeDetails(WORKFLOW_GRAPH, "invoice-project-cost-contribution");
  assert.ok(details);
  assert.equal(details.node.id, "invoice-project-cost-contribution");
  assert.equal(details.domainMeta.id, "projects");

  // Invariant reference
  assert.ok(details.invariants.length > 0);
  assert.ok(details.invariants.some((i) => i.id === "invoice-project-cost-independent-from-settlement"));

  // Source files & tests
  assert.ok(details.fileRefs.length > 0);
  assert.ok(details.testRefs.length > 0);

  // Incoming and outgoing edges
  assert.ok(details.incomingEdges.length > 0);

  // Missing node returns null safely
  assert.equal(getNodeDetails(WORKFLOW_GRAPH, "non-existent-node-id"), null);
});

test("layoutGraph produces deterministic, valid coordinate positions for nodes", () => {
  const { nodes, edges } = filterGraph(WORKFLOW_GRAPH, DEFAULT_FILTER);
  const layout1 = layoutGraph(nodes, edges);
  const layout2 = layoutGraph(nodes, edges);

  assert.equal(layout1.nodePositions.size, nodes.length);
  for (const node of nodes) {
    const pos1 = layout1.nodePositions.get(node.id)!;
    const pos2 = layout2.nodePositions.get(node.id)!;
    assert.ok(Number.isFinite(pos1.x));
    assert.ok(Number.isFinite(pos1.y));
    assert.equal(pos1.x, pos2.x);
    assert.equal(pos1.y, pos2.y);
  }
});

test("canonical graph remains immutable and unmutated after canvas operations", () => {
  const originalNodeCount = WORKFLOW_GRAPH.nodes.length;
  const originalEdgeCount = WORKFLOW_GRAPH.edges.length;

  filterGraph(WORKFLOW_GRAPH, { ...DEFAULT_FILTER, presetId: "all" });
  searchNodes(WORKFLOW_GRAPH.nodes, "payroll");
  computeNeighborhood(WORKFLOW_GRAPH, "platform-entry", 2);

  assert.equal(WORKFLOW_GRAPH.nodes.length, originalNodeCount);
  assert.equal(WORKFLOW_GRAPH.edges.length, originalEdgeCount);
});

test("URL state parser and formatter round-trip correctly", () => {
  const sampleFilter: WorkflowCanvasFilter = {
    presetId: "projects-engineering",
    selectedDomains: ["engineering"],
    selectedNodeTypes: ["route"],
    searchQuery: "blueprint",
    selectedNodeId: "blueprint-viewer",
    focusNeighborhood: true,
    neighborhoodHops: 2,
    filterInvariantOnly: false,
  };

  const queryString = formatWorkflowMapUrlQuery(sampleFilter);
  assert.match(queryString, /preset=projects-engineering/);
  assert.match(queryString, /node=blueprint-viewer/);
  assert.match(queryString, /domain=engineering/);
  assert.match(queryString, /q=blueprint/);
  assert.match(queryString, /focus=1/);
  assert.match(queryString, /hops=2/);

  const parsed = parseWorkflowMapUrlState(queryString);
  assert.equal(parsed.presetId, sampleFilter.presetId);
  assert.equal(parsed.selectedNodeId, sampleFilter.selectedNodeId);
  assert.deepEqual(parsed.selectedDomains, sampleFilter.selectedDomains);
  assert.equal(parsed.searchQuery, sampleFilter.searchQuery);
  assert.equal(parsed.focusNeighborhood, sampleFilter.focusNeighborhood);
  assert.equal(parsed.neighborhoodHops, sampleFilter.neighborhoodHops);
});

test("workflow-map application mode is isolated from demo and production authentication", async () => {
  const { applicationModeForPath, isWorkflowMapApplicationPath } = await import("../src/app/applicationMode.ts");
  assert.equal(applicationModeForPath("/workflow-map"), "workflow-map");
  assert.equal(applicationModeForPath("/dev/workflow-map"), "workflow-map");
  assert.equal(applicationModeForPath("/", "?view=workflow-map"), "workflow-map");
  assert.equal(isWorkflowMapApplicationPath("/workflow-map"), true);
  assert.equal(isWorkflowMapApplicationPath("/demo"), false);
  assert.equal(isWorkflowMapApplicationPath("/invoices"), false);
});

