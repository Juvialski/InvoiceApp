import test from "node:test";
import assert from "node:assert/strict";
import { isWorkflowCoverageGap } from "../scripts/agent-context.ts";
import {
  selectWorkflowContextSeeds,
  WorkflowContextSelectionError,
  type WorkflowContextSelectionInput,
} from "../scripts/workflow-map/context.ts";
import { WORKFLOW_GRAPH } from "../scripts/workflow-map/graph.ts";

function expectCoverageGap(selection: WorkflowContextSelectionInput): void {
  let captured: unknown;
  try {
    selectWorkflowContextSeeds(WORKFLOW_GRAPH, selection);
  } catch (error) {
    captured = error;
  }

  assert.ok(captured instanceof WorkflowContextSelectionError);
  assert.equal(captured.code, "unknown-selector");
  assert.match(captured.message, /No workflow nodes matched the requested scope/);
  assert.equal(isWorkflowCoverageGap(captured, selection), true);
}

test("canonical commercial domain preserves a true coverage gap for future unmapped work", () => {
  expectCoverageGap({
    domain: "commercial",
    query: "client collection matching",
  });
});

test("canonical domain selection cannot borrow a query match from another domain", () => {
  expectCoverageGap({
    domain: "procurement",
    query: "subcontract variations",
  });
});

test("canonical domain selection still resolves known bounded workflows", () => {
  const commercial = selectWorkflowContextSeeds(WORKFLOW_GRAPH, {
    domain: "commercial",
    query: "subcontract variations",
  });
  assert.ok(commercial.seedNodeIds.includes("subcontract-variations"));

  const procurement = selectWorkflowContextSeeds(WORKFLOW_GRAPH, {
    domain: "procurement",
    query: "purchase order approval",
  });
  assert.ok(procurement.seedNodeIds.includes("purchase-order-lifecycle"));
});

test("P2 domain selectors reject explicit nodes from the other P2 domain", () => {
  for (const selection of [
    { domain: "procurement" as const, nodeId: "subcontract-variations" },
    { domain: "commercial" as const, nodeId: "purchase-order-lifecycle" },
  ]) {
    assert.throws(
      () => selectWorkflowContextSeeds(WORKFLOW_GRAPH, selection),
      (error: unknown) => error instanceof WorkflowContextSelectionError
        && error.code === "invalid-selector"
        && error.message.includes(`not the requested \`${selection.domain}\` domain`),
    );
  }
});

test("invalid explicit domains fail loudly instead of falling back", () => {
  assert.throws(
    () => selectWorkflowContextSeeds(WORKFLOW_GRAPH, { domain: "client-billing" as never, query: "client billing" }),
    (error: unknown) => error instanceof WorkflowContextSelectionError
      && error.code === "invalid-selector"
      && error.message.includes("Unknown workflow domain"),
  );
});
