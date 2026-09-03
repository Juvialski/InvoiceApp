import test from "node:test";
import assert from "node:assert/strict";
import { isWorkflowCoverageGap } from "../scripts/agent-context.ts";
import {
  selectP2WorkflowContextSeeds,
  WorkflowContextSelectionError,
  type WorkflowContextSelectionInput,
} from "../scripts/workflow-map/p2-context.ts";
import { WORKFLOW_GRAPH } from "../scripts/workflow-map/p2-graph.ts";

function expectCoverageGap(selection: WorkflowContextSelectionInput): void {
  let captured: unknown;
  try {
    selectP2WorkflowContextSeeds(WORKFLOW_GRAPH, selection);
  } catch (error) {
    captured = error;
  }

  assert.ok(captured instanceof WorkflowContextSelectionError);
  assert.equal(captured.code, "unknown-selector");
  assert.match(captured.message, /No workflow nodes matched the requested scope/);
  assert.equal(isWorkflowCoverageGap(captured, selection), true);
}

test("P2 extension domains preserve a true coverage gap for future unmapped work", () => {
  expectCoverageGap({
    domain: "commercial",
    query: "client billing collections settlement",
  });
});

test("P2 extension domains cannot borrow a query match from another domain", () => {
  expectCoverageGap({
    domain: "procurement",
    query: "subcontract variations",
  });
});

test("P2 extension domains still resolve known bounded workflows", () => {
  const commercial = selectP2WorkflowContextSeeds(WORKFLOW_GRAPH, {
    domain: "commercial",
    query: "subcontract variations",
  });
  assert.ok(commercial.seedNodeIds.includes("subcontract-variations"));

  const procurement = selectP2WorkflowContextSeeds(WORKFLOW_GRAPH, {
    domain: "procurement",
    query: "purchase order approval",
  });
  assert.ok(procurement.seedNodeIds.includes("purchase-order-lifecycle"));
});
