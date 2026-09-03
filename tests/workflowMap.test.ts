import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { DEMO_QA_SCENARIOS } from "../scripts/qa/demoScenarios.ts";
import {
  formatAgentFallbackContextPacket,
  isWorkflowCoverageGap,
  WORKFLOW_FALLBACK_WARNING,
} from "../scripts/agent-context.ts";
import type { ImpactSelectionResult } from "../scripts/test-impact.ts";
import { WORKFLOW_DOMAIN_ORDER } from "../scripts/workflow-map/domain-registry.ts";
import {
  generateWorkflowContext,
  selectWorkflowContextSeeds,
  WorkflowContextSelectionError,
} from "../scripts/workflow-map/context.ts";
import type { RepositoryMetadata } from "../scripts/workflow-map/repositoryContext.ts";
import {
  renderWorkflowMapMarkdown,
  serializeWorkflowGraph,
  WORKFLOW_MAP_MARKDOWN_PATH,
  WORKFLOW_MAP_JSON_PATH,
} from "../scripts/workflow-map/generate.ts";
import { WORKFLOW_GRAPH } from "../scripts/workflow-map/graph.ts";
import {
  assertHighValueWorkflowSemantics,
  assertWorkflowMapValid,
  collectWorkflowMapErrors,
  REQUIRED_WORKFLOW_DOMAINS,
  REQUIRED_WORKFLOW_IDS,
} from "../scripts/workflow-map/validate.ts";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));

const p2Repository: RepositoryMetadata = {
  headSha: "b".repeat(40),
  branch: "infra/workflow-context-hardening",
  dirty: true,
  changedFilePaths: ["scripts/agent-context.ts"],
};

function p2Impact(overrides: Partial<ImpactSelectionResult> = {}): ImpactSelectionResult {
  return {
    baseSha: "a".repeat(40),
    headSha: "b".repeat(40),
    changedFiles: ["scripts/agent-context.ts", "scripts/workflow-map/graph.ts"],
    selectedTests: ["tests/agentEfficiency.test.ts", "tests/workflowMap.test.ts"],
    testReasons: {
      "tests/agentEfficiency.test.ts": ["Direct dependency"],
      "tests/workflowMap.test.ts": ["Direct dependency"],
    },
    smokeTests: [],
    totalAvailableTests: 200,
    isFallback: false,
    isDatabaseAffected: false,
    ...overrides,
  };
}

test("canonical workflow graph has the required version, domains, workflows, and unique references", () => {
  assert.equal(WORKFLOW_GRAPH.schemaVersion, 1);
  assert.deepEqual(
    REQUIRED_WORKFLOW_DOMAINS.every((domain) => WORKFLOW_GRAPH.nodes.some((node) => node.domain === domain)),
    true,
  );
  assert.deepEqual(
    REQUIRED_WORKFLOW_IDS.every((id) => WORKFLOW_GRAPH.nodes.some((node) => node.id === id)),
    true,
  );
  assert.equal(new Set(WORKFLOW_GRAPH.nodes.map((node) => node.id)).size, WORKFLOW_GRAPH.nodes.length);
  assert.equal(new Set(WORKFLOW_GRAPH.edges.map((edge) => edge.id)).size, WORKFLOW_GRAPH.edges.length);
  assert.deepEqual(collectWorkflowMapErrors(WORKFLOW_GRAPH, { repositoryRoot }), []);
});

test("all graph file, test, route, and QA-1 references resolve from the current repository", () => {
  assert.doesNotThrow(() => assertWorkflowMapValid(WORKFLOW_GRAPH, { repositoryRoot }));
  const scenarioIds = new Set(DEMO_QA_SCENARIOS.map((scenario) => scenario.id));
  for (const node of WORKFLOW_GRAPH.nodes) {
    for (const scenarioId of node.qaScenarioIds || []) assert.ok(scenarioIds.has(scenarioId), `${node.id}: ${scenarioId}`);
  }
});

test("generated JSON and Markdown are deterministic and match committed outputs", () => {
  const expectedJson = serializeWorkflowGraph(WORKFLOW_GRAPH);
  const expectedMarkdown = renderWorkflowMapMarkdown(WORKFLOW_GRAPH);
  assert.equal(serializeWorkflowGraph(WORKFLOW_GRAPH), expectedJson);
  assert.equal(renderWorkflowMapMarkdown(WORKFLOW_GRAPH), expectedMarkdown);
  assert.equal(readFileSync(new URL(`../${WORKFLOW_MAP_JSON_PATH}`, import.meta.url), "utf8"), expectedJson);
  assert.equal(readFileSync(new URL(`../${WORKFLOW_MAP_MARKDOWN_PATH}`, import.meta.url), "utf8"), expectedMarkdown);
  assert.match(expectedMarkdown, /```mermaid/);
  assert.match(expectedMarkdown, /Whole-platform overview/);
  assert.match(expectedMarkdown, /Assistant guarded mutation flow/);
});

test("high-value graph semantics preserve financial, payroll, field, Assistant, demo, and reporting boundaries", () => {
  assert.doesNotThrow(() => assertHighValueWorkflowSemantics(WORKFLOW_GRAPH));
  const serialized = JSON.stringify(WORKFLOW_GRAPH);
  assert.doesNotMatch(serialized, /Bearer\s+[A-Za-z0-9._~+/=-]{12,}/i);
  assert.doesNotMatch(serialized, /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  assert.doesNotMatch(serialized, /(?:\+\d{1,3}[\s-]?\(?\d{2,4}\)?[\s-]?\d{3,4}[\s-]?\d{3,4})/);
});

test("canonical workflow graph includes first-class procurement and commercial domains with valid repository references", () => {
  assert.ok(WORKFLOW_DOMAIN_ORDER.includes("procurement"));
  assert.ok(WORKFLOW_DOMAIN_ORDER.includes("commercial"));
  assert.equal(WORKFLOW_GRAPH.canonicalSource, "scripts/workflow-map/graph.ts");
  assert.ok(WORKFLOW_GRAPH.nodes.some((node) => node.domain === "procurement"));
  assert.ok(WORKFLOW_GRAPH.nodes.some((node) => node.domain === "commercial"));
  assert.deepEqual(collectWorkflowMapErrors(WORKFLOW_GRAPH, { repositoryRoot }), []);
});

test("canonical context resolves purchase order approval and subcontract variations", () => {
  const procurement = selectWorkflowContextSeeds(WORKFLOW_GRAPH, { query: "purchase order approval" });
  assert.ok(procurement.seedNodeIds.includes("purchase-order-lifecycle"));
  assert.ok(procurement.seedNodeIds.every((nodeId) => WORKFLOW_GRAPH.nodes.find((node) => node.id === nodeId)?.domain === "procurement"));

  const commercial = selectWorkflowContextSeeds(WORKFLOW_GRAPH, { query: "subcontract variations" });
  assert.ok(commercial.seedNodeIds.includes("subcontract-variations"));
  assert.ok(commercial.seedNodeIds.every((nodeId) => WORKFLOW_GRAPH.nodes.find((node) => node.id === nodeId)?.domain === "commercial"));
});

test("explicit P2 domain context stays inside the requested domain", () => {
  const result = generateWorkflowContext(WORKFLOW_GRAPH, {
    domain: "commercial",
    query: "subcontract variations",
    characterBudget: 6_000,
  }, p2Repository);
  assert.equal(result.packet.requestedScope.domain, "commercial");
  assert.equal(result.packet.requestedScope.query, "subcontract variations");
  assert.ok(result.packet.selection.seedNodeIds.includes("subcontract-variations"));
  assert.ok(result.packet.workflow.nodes.every((node) => node.domain === "commercial"));
  const nodesById = new Map(result.packet.workflow.nodes.map((node) => [node.nodeId, node.domain]));
  assert.ok(result.packet.workflow.edges.every((edge) => nodesById.get(edge.source) === "commercial" && nodesById.get(edge.target) === "commercial"));
  assert.ok(result.characterCount <= 6_000);
});

test("P2 relationships and financial invariants preserve commitment truth", () => {
  const edge = (source: string, target: string) => WORKFLOW_GRAPH.edges.some((item) => item.source === source && item.target === target);
  assert.equal(edge("purchase-order-lifecycle", "project-cost-aggregation"), true);
  assert.equal(edge("procurement-rfq", "supplier-quotation-selection"), true);
  assert.equal(edge("supplier-quotation-selection", "rfq-draft-po-conversion"), true);
  assert.equal(edge("rfq-draft-po-conversion", "purchase-order-lifecycle"), true);
  assert.equal(edge("subcontract-progress-claims", "remaining-subcontract-commitment"), true);
  assert.equal(edge("subcontract-variations", "revised-subcontract-value"), true);
  assert.equal(edge("remaining-subcontract-commitment", "project-cost-aggregation"), true);
  assert.equal(edge("project-cost-aggregation", "project-budget-control"), true);

  const invariants = new Set(WORKFLOW_GRAPH.invariants.map((item) => item.id));
  for (const id of [
    "procurement-po-commitment-not-actual",
    "procurement-rfq-precommitment",
    "commercial-subcontract-remaining-commitment",
    "commercial-progress-claim-certification-not-actual",
    "commercial-approved-variation-revises-subcontract-only",
    "p2-no-implicit-cross-currency-aggregation",
  ]) assert.ok(invariants.has(id), `missing invariant ${id}`);
});

test("only task/query coverage gaps qualify for graceful agent-context fallback", () => {
  const noMatch = new WorkflowContextSelectionError("unknown-selector", "No workflow nodes matched the requested scope (query=new legitimate workflow). Check the current graph IDs.");
  assert.equal(isWorkflowCoverageGap(noMatch, { query: "new legitimate workflow" }), true);
  assert.equal(isWorkflowCoverageGap(noMatch, { nodeId: "does-not-exist", query: "new legitimate workflow" }), false);
  assert.equal(isWorkflowCoverageGap(noMatch, { route: "/does-not-exist", query: "new legitimate workflow" }), false);
  assert.equal(isWorkflowCoverageGap(noMatch, { filePath: "src/missing.ts", query: "new legitimate workflow" }), false);
  assert.throws(
    () => selectWorkflowContextSeeds(WORKFLOW_GRAPH, { nodeId: "does-not-exist" }),
    (error: unknown) => error instanceof WorkflowContextSelectionError
      && error.code === "unknown-selector"
      && /Unknown workflow node/.test(error.message),
  );
});

test("fallback packet is bounded and contains provenance, changed paths, impact tests, DB state, warning, and validation guidance", () => {
  const budget = 4_800;
  const output = formatAgentFallbackContextPacket({
    task: "support a newly added workflow that is not mapped yet",
    repository: p2Repository,
    impact: p2Impact(),
    selection: {
      query: "newly added workflow not mapped yet",
      filePaths: ["scripts/agent-context.ts"],
      changedFilePaths: ["scripts/workflow-map/graph.ts"],
      useChangedFiles: true,
    },
    graph: WORKFLOW_GRAPH,
  }, budget);

  assert.ok(output.length <= budget);
  assert.ok(output.includes(WORKFLOW_FALLBACK_WARNING));
  assert.match(output, /## Provenance/);
  assert.match(output, /infra\/workflow-context-hardening/);
  assert.match(output, /Changed paths/);
  assert.match(output, /scripts\/agent-context\.ts/);
  assert.match(output, /Selected tests: 2\/200/);
  assert.match(output, /tests\/agentEfficiency\.test\.ts/);
  assert.match(output, /Database \/ RLS \/ migrations: unaffected/);
  assert.match(output, /## Validation recommendation/);
  assert.match(output, /test:affected:agent/);
  assert.match(output, /Retry Workflow Map once/);
  assert.match(output, /Do not run speculative keyword retry loops/);
  assert.match(output, /current source implementation/);
  assert.match(output, /advisory context/);
});

test("DB-affecting fallback recommends real migration/runtime evidence", () => {
  const output = formatAgentFallbackContextPacket({
    repository: p2Repository,
    impact: p2Impact({ isDatabaseAffected: true }),
    selection: { query: "new database workflow" },
    graph: WORKFLOW_GRAPH,
  }, 6_000);
  assert.match(output, /Database \/ RLS \/ migrations: AFFECTED/);
  assert.match(output, /real local migration\/runtime ladder/);
  assert.match(output, /RPC\/trigger\/RLS changes require runtime\/database integration coverage/);
  assert.match(output, /static migration tests are insufficient/);
});
