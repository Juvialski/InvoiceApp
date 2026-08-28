import test from "node:test";
import assert from "node:assert/strict";
import { WORKFLOW_GRAPH } from "../scripts/workflow-map/graph.ts";
import {
  generateWorkflowMapEvidenceOverlay,
  mapEvidenceToWorkflowGraph,
  parseQaManifest,
  WORKFLOW_MAP_EVIDENCE_SCHEMA_VERSION,
} from "../scripts/workflow-map/evidence.ts";
import { DEMO_QA_SCENARIOS } from "../scripts/qa/demoScenarios.ts";
import {
  createOverflowResult,
  createQaManifest,
  createScenarioEvidence,
  type QaRunManifest,
  type QaScenarioEvidence,
} from "../scripts/qa/structuredEvidence.ts";

function createSyntheticEvidence(
  scenarioDef = DEMO_QA_SCENARIOS[0],
  overrides: Partial<Parameters<typeof createScenarioEvidence>[0]> = {},
): QaScenarioEvidence {
  return createScenarioEvidence({
    scenario: scenarioDef,
    timestamp: "2026-08-28T00:00:00.000Z",
    durationMs: 50,
    navigation: {
      requestedPath: scenarioDef.path,
      finalPath: scenarioDef.path,
      status: 200,
      loaded: true,
    },
    consoleErrors: [],
    pageErrors: [],
    failedRequests: [],
    overflow: createOverflowResult({
      documentWidth: scenarioDef.viewport.width,
      bodyWidth: scenarioDef.viewport.width,
      viewportWidth: scenarioDef.viewport.width,
    }),
    assertions: [{ id: "page-has-content", passed: true }],
    screenshotPath: `screenshots/${scenarioDef.id}.png`,
    ...overrides,
  });
}

function buildSyntheticManifest(scenarios: QaScenarioEvidence[], runOverrides = {}): QaRunManifest {
  return createQaManifest({
    run: {
      commitSha: "6a1c8d20e0d846d04f9bb760189f4a22f23c527b",
      branch: "feat/workflow-map-browser-evidence-overlay",
      timestamp: "2026-08-28T12:00:00.000Z",
      trigger: "workflow_dispatch",
      appMode: "demo",
      ...runOverrides,
    },
    scenarios,
    artifacts: {
      manifestPath: "manifest.json",
      screenshotsDirectory: "screenshots",
      logPath: "logs/qa.log",
    },
  });
}

test("1. valid schema-1 manifest parses correctly", () => {
  const validManifest = buildSyntheticManifest([createSyntheticEvidence()]);
  const parsed = parseQaManifest(JSON.stringify(validManifest));
  assert.equal(parsed.schemaVersion, 1);
  assert.equal(parsed.run.commitSha, "6a1c8d20e0d846d04f9bb760189f4a22f23c527b");
  assert.equal(parsed.scenarios.length, 1);
  assert.equal(parsed.scenarios[0].scenarioId, DEMO_QA_SCENARIOS[0].id);
});

test("2. unsupported manifest schema version rejects with clear error", () => {
  const manifest = buildSyntheticManifest([createSyntheticEvidence()]);
  const raw = { ...manifest, schemaVersion: 99 };
  assert.throws(() => parseQaManifest(raw), /Unsupported QA manifest schema version: expected 1, received 99/);
});

test("3. malformed manifest rejects with actionable error", () => {
  assert.throws(() => parseQaManifest("{ broken json "), /Malformed QA manifest JSON/);
  assert.throws(() => parseQaManifest("null"), /Invalid QA manifest: top-level value must be a JSON object/);
  assert.throws(() => parseQaManifest([]), /Invalid QA manifest: top-level value must be a JSON object/);
  assert.throws(() => parseQaManifest({ schemaVersion: 1, run: null }), /missing or invalid 'run' metadata object/);
  assert.throws(() => parseQaManifest({ schemaVersion: 1, run: {} }), /run\.commitSha must be a non-empty string/);
});

test("4. oversized manifest input rejects if size exceeds limit", () => {
  const smallLimitBytes = 50;
  const validManifest = buildSyntheticManifest([createSyntheticEvidence()]);
  assert.throws(
    () => parseQaManifest(JSON.stringify(validManifest), smallLimitBytes),
    /exceeds maximum allowed size/,
  );
});

test("5. node with no qaScenarioIds evaluates to UNMAPPED", () => {
  const allScenarios = DEMO_QA_SCENARIOS.map((s) => createSyntheticEvidence(s));
  const manifest = buildSyntheticManifest(allScenarios);
  const model = mapEvidenceToWorkflowGraph(WORKFLOW_GRAPH, manifest);

  const unmappedNode = WORKFLOW_GRAPH.nodes.find((n) => !n.qaScenarioIds || n.qaScenarioIds.length === 0);
  assert.ok(unmappedNode, "At least one unmapped node exists in canonical graph");
  
  const evidence = model.evidenceForNode(unmappedNode.id);
  assert.equal(evidence.state, "UNMAPPED");
  assert.equal(evidence.mappedScenarioIds.length, 0);
  assert.equal(evidence.scenarios.length, 0);
});

test("6. mapped node with zero scenarios present in manifest evaluates to NOT_RUN", () => {
  // Empty manifest scenarios
  const manifest = buildSyntheticManifest([]);
  const model = mapEvidenceToWorkflowGraph(WORKFLOW_GRAPH, manifest);

  const mappedNode = WORKFLOW_GRAPH.nodes.find((n) => n.qaScenarioIds && n.qaScenarioIds.length > 0);
  assert.ok(mappedNode, "Mapped node exists");

  const evidence = model.evidenceForNode(mappedNode.id);
  assert.equal(evidence.state, "NOT_RUN");
  assert.ok(evidence.mappedScenarioIds.length > 0);
  assert.equal(evidence.presentScenarioIds.length, 0);
  assert.equal(evidence.missingScenarioIds.length, evidence.mappedScenarioIds.length);
});

test("7. node with some mapped scenarios present/pass and some missing evaluates to PARTIAL", () => {
  // Find a node with multiple mapped scenario IDs
  const multiScenarioNode = WORKFLOW_GRAPH.nodes.find((n) => n.qaScenarioIds && n.qaScenarioIds.length >= 2);
  assert.ok(multiScenarioNode, "Found node with multiple mapped scenarios");

  const mappedIds = multiScenarioNode.qaScenarioIds!;
  const firstScenarioDef = DEMO_QA_SCENARIOS.find((s) => s.id === mappedIds[0])!;
  assert.ok(firstScenarioDef);

  // Manifest only contains the first scenario (which passed), other scenarios missing
  const manifest = buildSyntheticManifest([createSyntheticEvidence(firstScenarioDef)]);
  const model = mapEvidenceToWorkflowGraph(WORKFLOW_GRAPH, manifest);

  const evidence = model.evidenceForNode(multiScenarioNode.id);
  assert.equal(evidence.state, "PARTIAL");
  assert.ok(evidence.presentScenarioIds.includes(mappedIds[0]));
  assert.ok(evidence.missingScenarioIds.includes(mappedIds[1]));
  assert.equal(evidence.failedScenarioIds.length, 0);
});

test("8. all mapped scenarios present and passing evaluates to PASS", () => {
  const multiScenarioNode = WORKFLOW_GRAPH.nodes.find((n) => n.qaScenarioIds && n.qaScenarioIds.length >= 2);
  assert.ok(multiScenarioNode);

  const presentEvidence = multiScenarioNode.qaScenarioIds!.map((id) => {
    const def = DEMO_QA_SCENARIOS.find((s) => s.id === id)!;
    return createSyntheticEvidence(def);
  });

  const manifest = buildSyntheticManifest(presentEvidence);
  const model = mapEvidenceToWorkflowGraph(WORKFLOW_GRAPH, manifest);

  const evidence = model.evidenceForNode(multiScenarioNode.id);
  assert.equal(evidence.state, "PASS");
  assert.equal(evidence.presentScenarioIds.length, multiScenarioNode.qaScenarioIds!.length);
  assert.equal(evidence.missingScenarioIds.length, 0);
  assert.equal(evidence.failedScenarioIds.length, 0);
});

test("9. any present mapped scenario FAIL forces node state to FAIL", () => {
  const multiScenarioNode = WORKFLOW_GRAPH.nodes.find((n) => n.qaScenarioIds && n.qaScenarioIds.length >= 2);
  assert.ok(multiScenarioNode);

  const mappedIds = multiScenarioNode.qaScenarioIds!;
  const def1 = DEMO_QA_SCENARIOS.find((s) => s.id === mappedIds[0])!;
  const def2 = DEMO_QA_SCENARIOS.find((s) => s.id === mappedIds[1])!;

  // 1 passing scenario, 1 failing scenario
  const ev1 = createSyntheticEvidence(def1);
  const ev2 = createSyntheticEvidence(def2, {
    assertions: [{ id: "page-has-content", passed: false, details: "Page failed" }],
  });

  const manifest = buildSyntheticManifest([ev1, ev2]);
  const model = mapEvidenceToWorkflowGraph(WORKFLOW_GRAPH, manifest);

  const evidence = model.evidenceForNode(multiScenarioNode.id);
  assert.equal(evidence.state, "FAIL");
  assert.equal(evidence.failedScenarioIds.length, 1);
  assert.ok(evidence.failedScenarioIds.includes(def2.id));
  assert.ok(evidence.failureReasons.includes("deterministic_assertions"));
});

test("10. FAIL wins even when another mapped scenario is absent", () => {
  const multiScenarioNode = WORKFLOW_GRAPH.nodes.find((n) => n.qaScenarioIds && n.qaScenarioIds.length >= 2);
  assert.ok(multiScenarioNode);

  const mappedIds = multiScenarioNode.qaScenarioIds!;
  const def1 = DEMO_QA_SCENARIOS.find((s) => s.id === mappedIds[0])!;

  // Only 1 scenario present, and it failed (second scenario missing)
  const failingEv = createSyntheticEvidence(def1, {
    navigation: { requestedPath: def1.path, finalPath: def1.path, status: 500, loaded: false, error: "HTTP 500" },
  });

  const manifest = buildSyntheticManifest([failingEv]);
  const model = mapEvidenceToWorkflowGraph(WORKFLOW_GRAPH, manifest);

  const evidence = model.evidenceForNode(multiScenarioNode.id);
  assert.equal(evidence.state, "FAIL");
  assert.equal(evidence.missingScenarioIds.length, mappedIds.length - 1);
  assert.equal(evidence.failedScenarioIds.length, 1);
});

test("11. unknown manifest scenario does not crash the mapper", () => {
  const customScenario = {
    ...DEMO_QA_SCENARIOS[0],
    id: "unknown-synthetic-scenario-not-in-graph",
  };
  const unknownEv = createSyntheticEvidence(customScenario);
  const manifest = buildSyntheticManifest([unknownEv]);

  const model = mapEvidenceToWorkflowGraph(WORKFLOW_GRAPH, manifest);
  assert.ok(model);
  assert.equal(model.summary.runtimeScenariosCount, 1);
});

test("12. unmapped runtime scenarios are counted and listed in summary", () => {
  const customScenario = {
    ...DEMO_QA_SCENARIOS[0],
    id: "unmapped-custom-runtime-scenario",
  };
  const normalEv = createSyntheticEvidence(DEMO_QA_SCENARIOS[0]);
  const unknownEv = createSyntheticEvidence(customScenario);
  const manifest = buildSyntheticManifest([normalEv, unknownEv]);

  const model = mapEvidenceToWorkflowGraph(WORKFLOW_GRAPH, manifest);
  assert.equal(model.summary.unmappedRuntimeScenariosCount, 1);
  assert.deepEqual(model.summary.unmappedScenarioIds, ["unmapped-custom-runtime-scenario"]);
});

test("13. visible-subset aggregation computes correct counts for given node IDs", () => {
  const allScenarios = DEMO_QA_SCENARIOS.map((s) => createSyntheticEvidence(s));
  const manifest = buildSyntheticManifest(allScenarios);
  const model = mapEvidenceToWorkflowGraph(WORKFLOW_GRAPH, manifest);

  const sampleNodes = WORKFLOW_GRAPH.nodes.slice(0, 10);
  const sampleIds = sampleNodes.map((n) => n.id);

  const visibleSummary = model.visibleSummary(sampleIds);
  assert.equal(visibleSummary.visibleTotal, 10);
  assert.equal(
    visibleSummary.visibleMapped + visibleSummary.visibleUnmapped,
    10,
  );
  assert.equal(
    visibleSummary.visiblePass + visibleSummary.visibleFail + visibleSummary.visiblePartial + visibleSummary.visibleNotRun,
    visibleSummary.visibleMapped,
  );
});

test("14. failure-node list is deterministic and correctly populated", () => {
  const targetNode1 = WORKFLOW_GRAPH.nodes.find((n) => n.id === "dashboard-screen")!;
  const targetNode2 = WORKFLOW_GRAPH.nodes.find((n) => n.id === "route-invoices")!;

  const sc1 = DEMO_QA_SCENARIOS.find((s) => s.id === targetNode1.qaScenarioIds![0])!;
  const sc2 = DEMO_QA_SCENARIOS.find((s) => s.id === targetNode2.qaScenarioIds![0])!;

  const fail1 = createSyntheticEvidence(sc1, {
    assertions: [{ id: "dashboard-render", passed: false, details: "Widget missing" }],
  });
  const fail2 = createSyntheticEvidence(sc2, {
    assertions: [{ id: "invoice-table", passed: false, details: "Table failed" }],
  });

  const manifest = buildSyntheticManifest([fail1, fail2]);
  const model = mapEvidenceToWorkflowGraph(WORKFLOW_GRAPH, manifest);

  assert.ok(model.summary.failCount >= 2);
  assert.ok(model.summary.failureNodeIds.includes(targetNode1.id));
  assert.ok(model.summary.failureNodeIds.includes(targetNode2.id));
  // Deterministic ascending sorting
  assert.deepEqual(
    model.summary.failureNodeIds,
    [...model.summary.failureNodeIds].sort(),
  );
});

test("15. provenance is retained accurately from run metadata", () => {
  const runData = {
    commitSha: "deadbeef1234567890abcdef",
    branch: "feat/test-run-branch",
    timestamp: "2026-08-28T14:30:00.000Z",
    trigger: "push",
    appMode: "demo" as const,
  };
  const manifest = buildSyntheticManifest([], runData);
  const model = mapEvidenceToWorkflowGraph(WORKFLOW_GRAPH, manifest);

  assert.deepEqual(model.provenance, runData);
  assert.equal(model.provenance.commitSha, "deadbeef1234567890abcdef");
  assert.equal(model.provenance.branch, "feat/test-run-branch");
});

test("16. canonical graph source objects are not mutated by mapping", () => {
  const nodeCountBefore = WORKFLOW_GRAPH.nodes.length;
  const edgeCountBefore = WORKFLOW_GRAPH.edges.length;
  const sampleNodeBefore = JSON.stringify(WORKFLOW_GRAPH.nodes[0]);

  const allScenarios = DEMO_QA_SCENARIOS.map((s) => createSyntheticEvidence(s));
  const manifest = buildSyntheticManifest(allScenarios);
  mapEvidenceToWorkflowGraph(WORKFLOW_GRAPH, manifest);
  generateWorkflowMapEvidenceOverlay(WORKFLOW_GRAPH, manifest);

  assert.equal(WORKFLOW_GRAPH.nodes.length, nodeCountBefore);
  assert.equal(WORKFLOW_GRAPH.edges.length, edgeCountBefore);
  assert.equal(JSON.stringify(WORKFLOW_GRAPH.nodes[0]), sampleNodeBefore);
});

test("17. derived overlay generation is deterministic and reproducible", () => {
  const allScenarios = DEMO_QA_SCENARIOS.map((s) => createSyntheticEvidence(s));
  const manifest = buildSyntheticManifest(allScenarios);

  const overlay1 = generateWorkflowMapEvidenceOverlay(WORKFLOW_GRAPH, manifest);
  const overlay2 = generateWorkflowMapEvidenceOverlay(WORKFLOW_GRAPH, manifest);

  assert.equal(overlay1.schemaVersion, WORKFLOW_MAP_EVIDENCE_SCHEMA_VERSION);
  assert.deepEqual(overlay1.summary, overlay2.summary);
  assert.deepEqual(overlay1.graph, overlay2.graph);
  assert.deepEqual(overlay1.nodes, overlay2.nodes);
});

test("18. derived output contains no screenshot bytes or forbidden payload keys", () => {
  const allScenarios = DEMO_QA_SCENARIOS.map((s) => createSyntheticEvidence(s));
  const manifest = buildSyntheticManifest(allScenarios);
  const overlay = generateWorkflowMapEvidenceOverlay(WORKFLOW_GRAPH, manifest);
  const serialized = JSON.stringify(overlay);

  for (const forbidden of [
    "data:image",
    "base64",
    "requestBody",
    "requestHeaders",
    "cookies",
    "accessToken",
    "apiKey",
    "password",
    "secret",
  ]) {
    assert.doesNotMatch(serialized, new RegExp(forbidden, "i"), `Derived JSON must not contain '${forbidden}'`);
  }
});
