import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { DEMO_QA_SCENARIOS } from "../scripts/qa/demoScenarios.ts";
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
