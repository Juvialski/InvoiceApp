import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import {
  formatAgentFallbackContextPacket,
  isWorkflowCoverageGap,
  WORKFLOW_FALLBACK_WARNING,
} from "../scripts/agent-context.ts";
import type { ImpactSelectionResult } from "../scripts/test-impact.ts";
import { WORKFLOW_DOMAIN_ORDER } from "../scripts/workflow-map/domain-registry.ts";
import {
  generateP2WorkflowContext,
  selectP2WorkflowContextSeeds,
  WorkflowContextSelectionError,
} from "../scripts/workflow-map/p2-context.ts";
import { WORKFLOW_GRAPH } from "../scripts/workflow-map/p2-graph.ts";
import type { RepositoryMetadata } from "../scripts/workflow-map/repositoryContext.ts";
import { collectWorkflowMapErrors } from "../scripts/workflow-map/validate.ts";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const repository: RepositoryMetadata = {
  headSha: "b".repeat(40),
  branch: "infra/workflow-context-hardening",
  dirty: true,
  changedFilePaths: ["scripts/agent-context.ts"],
};

function impact(overrides: Partial<ImpactSelectionResult> = {}): ImpactSelectionResult {
  return {
    baseSha: "a".repeat(40),
    headSha: "b".repeat(40),
    changedFiles: ["scripts/agent-context.ts", "scripts/workflow-map/p2-graph.ts"],
    selectedTests: ["tests/agentEfficiency.test.ts", "tests/workflowP2Coverage.test.ts"],
    testReasons: {
      "tests/agentEfficiency.test.ts": ["Direct dependency"],
      "tests/workflowP2Coverage.test.ts": ["Direct dependency"],
    },
    smokeTests: [],
    totalAvailableTests: 200,
    isFallback: false,
    isDatabaseAffected: false,
    ...overrides,
  };
}

test("P2 workflow graph adds first-class procurement and commercial domains with valid repository references", () => {
  assert.ok(WORKFLOW_DOMAIN_ORDER.includes("procurement"));
  assert.ok(WORKFLOW_DOMAIN_ORDER.includes("commercial"));
  assert.ok(WORKFLOW_GRAPH.nodes.some((node) => node.domain === "procurement"));
  assert.ok(WORKFLOW_GRAPH.nodes.some((node) => node.domain === "commercial"));
  assert.deepEqual(collectWorkflowMapErrors(WORKFLOW_GRAPH, { repositoryRoot }), []);
});

test("purchase order approval resolves to the procurement lifecycle", () => {
  const selection = selectP2WorkflowContextSeeds(WORKFLOW_GRAPH, { query: "purchase order approval" });
  assert.ok(selection.seedNodeIds.includes("purchase-order-lifecycle"));
  assert.ok(selection.seedNodeIds.every((nodeId) => WORKFLOW_GRAPH.nodes.find((node) => node.id === nodeId)?.domain === "procurement"));
});

test("subcontract variations resolves to the commercial variation workflow", () => {
  const selection = selectP2WorkflowContextSeeds(WORKFLOW_GRAPH, { query: "subcontract variations" });
  assert.ok(selection.seedNodeIds.includes("subcontract-variations"));
  assert.ok(selection.seedNodeIds.every((nodeId) => WORKFLOW_GRAPH.nodes.find((node) => node.id === nodeId)?.domain === "commercial"));
});

test("commercial is accepted as an explicit bounded workflow domain", () => {
  const result = generateP2WorkflowContext(WORKFLOW_GRAPH, {
    domain: "commercial",
    query: "subcontract variations",
    characterBudget: 6_000,
  }, repository);
  assert.equal(result.packet.requestedScope.domain, "commercial");
  assert.equal(result.packet.requestedScope.query, "subcontract variations");
  assert.ok(result.packet.selection.seedNodeIds.includes("subcontract-variations"));
  assert.ok(result.characterCount <= 6_000);
});

test("P2 relationships preserve procurement/subcontract commitment and project-budget-control semantics", () => {
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

test("only task/query coverage gaps qualify for graceful fallback", () => {
  const noMatch = new WorkflowContextSelectionError("unknown-selector", "No workflow nodes matched the requested scope (query=new legitimate workflow). Check the current graph IDs.");
  assert.equal(isWorkflowCoverageGap(noMatch, { query: "new legitimate workflow" }), true);
  assert.equal(isWorkflowCoverageGap(noMatch, { nodeId: "does-not-exist", query: "new legitimate workflow" }), false);
  assert.equal(isWorkflowCoverageGap(noMatch, { route: "/does-not-exist", query: "new legitimate workflow" }), false);

  assert.throws(
    () => selectP2WorkflowContextSeeds(WORKFLOW_GRAPH, { nodeId: "does-not-exist" }),
    (error: unknown) => error instanceof WorkflowContextSelectionError
      && error.code === "unknown-selector"
      && /Unknown workflow node/.test(error.message),
  );
});

test("fallback packet is bounded and contains provenance, changed paths, impact tests, DB state, warning, and validation guidance", () => {
  const budget = 4_800;
  const output = formatAgentFallbackContextPacket({
    task: "support a newly added workflow that is not mapped yet",
    repository,
    impact: impact(),
    selection: {
      query: "newly added workflow not mapped yet",
      filePaths: ["scripts/agent-context.ts"],
      changedFilePaths: ["scripts/workflow-map/p2-graph.ts"],
      useChangedFiles: true,
    },
    graph: WORKFLOW_GRAPH,
  }, budget);

  assert.ok(output.length <= budget);
  assert.match(output, new RegExp(WORKFLOW_FALLBACK_WARNING.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(output, /## Provenance/);
  assert.match(output, /infra\/workflow-context-hardening/);
  assert.match(output, /Changed paths/);
  assert.match(output, /scripts\/agent-context\.ts/);
  assert.match(output, /Selected tests: 2\/200/);
  assert.match(output, /tests\/agentEfficiency\.test\.ts/);
  assert.match(output, /Database \/ RLS \/ migrations: unaffected/);
  assert.match(output, /## Validation recommendation/);
  assert.match(output, /test:affected:agent/);
  assert.match(output, /one.*exact known node|Retry Workflow Map once/i);
  assert.match(output, /Do not run speculative keyword retry loops/);
});

test("DB-affecting fallback recommends the real local migration/runtime ladder", () => {
  const output = formatAgentFallbackContextPacket({
    repository,
    impact: impact({ isDatabaseAffected: true }),
    selection: { query: "new database workflow" },
    graph: WORKFLOW_GRAPH,
  }, 6_000);
  assert.match(output, /Database \/ RLS \/ migrations: AFFECTED/);
  assert.match(output, /real local migration\/runtime ladder/);
  assert.match(output, /RPC\/trigger\/RLS changes require runtime\/database integration coverage/);
  assert.match(output, /static migration tests are insufficient/);
});
