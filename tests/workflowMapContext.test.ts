import test from "node:test";
import assert from "node:assert/strict";
import {
  buildWorkflowContextPacket,
  generateWorkflowContext,
  MAX_CONTEXT_CHARACTER_BUDGET,
  MAX_CONTEXT_CHANGED_FILE_PATHS,
  MAX_CONTEXT_NEIGHBOR_EDGES,
  MAX_CONTEXT_NEIGHBOR_NODES,
  renderWorkflowContextMarkdown,
  selectWorkflowContextSeeds,
  serializeWorkflowContextPacket,
  WorkflowContextSelectionError,
  WORKFLOW_MAP_CONTEXT_SCHEMA_VERSION,
} from "../scripts/workflow-map/context.ts";
import {
  parseRepositoryChangedPaths,
  readRepositoryMetadata,
  type RepositoryCommandRunner,
  type RepositoryMetadata,
} from "../scripts/workflow-map/repositoryContext.ts";
import { WORKFLOW_GRAPH } from "../scripts/workflow-map/graph.ts";
import type { WorkflowEdge, WorkflowGraph, WorkflowInvariant, WorkflowNode } from "../scripts/workflow-map/types.ts";
import { contextCliUsage, parseContextCliArguments } from "../scripts/workflow-map/context-cli.ts";

const repository: RepositoryMetadata = {
  headSha: "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
  branch: "feat/context-test",
  dirty: true,
  changedFilePaths: ["src/lib/payroll.ts", "tests/payrollIntegrity.test.ts"],
};

function syntheticNode(id: string, overrides: Partial<WorkflowNode> = {}): WorkflowNode {
  return {
    id,
    label: id,
    domain: "engineering",
    type: "workflow",
    description: `Description for ${id}`,
    sourceClassification: "curated",
    ...overrides,
  };
}

function syntheticEdge(id: string, source: string, target: string, overrides: Partial<WorkflowEdge> = {}): WorkflowEdge {
  return {
    id,
    source,
    target,
    type: "links-to",
    kind: "context",
    label: `${source} to ${target}`,
    ...overrides,
  };
}

function syntheticInvariant(id = "protected-boundary"): WorkflowInvariant {
  return {
    id,
    label: "Protected boundary",
    description: "The protected boundary must remain explicit.",
    sourceClassification: "curated",
    fileRefs: ["src/protected.ts"],
    testRefs: ["tests/protected.test.ts"],
  };
}

function syntheticGraph(
  nodes: readonly WorkflowNode[],
  edges: readonly WorkflowEdge[],
  invariants: readonly WorkflowInvariant[] = [],
): WorkflowGraph {
  return {
    schemaVersion: 1,
    graphId: "synthetic-context-graph",
    version: "test",
    product: "Synthetic graph",
    purpose: "Context engine test graph",
    canonicalSource: "tests/workflowMapContext.test.ts",
    sourceClassification: "curated",
    phaseTags: ["test"],
    nodes,
    edges,
    invariants,
    diagrams: [],
  };
}

test("WM-5 selects an exact workflow node without consulting Git or source files", () => {
  const selection = selectWorkflowContextSeeds(WORKFLOW_GRAPH, { nodeId: "payroll-period" });
  assert.deepEqual(selection.seedNodeIds, ["payroll-period"]);
  assert.deepEqual(selection.seedMatches[0]?.reasons, ["node"]);

  const graph = syntheticGraph([
    syntheticNode("synthetic-seed", { fileRefs: ["does/not/exist.ts"], testRefs: ["does/not/exist.test.ts"] }),
  ], []);
  const result = generateWorkflowContext(graph, { nodeId: "synthetic-seed" }, { ...repository, changedFilePaths: [] });
  assert.deepEqual(result.packet.workflow.nodes.map((node) => node.nodeId), ["synthetic-seed"]);
});

test("WM-5 supports domain plus deterministic keyword selection", () => {
  const selection = selectWorkflowContextSeeds(WORKFLOW_GRAPH, { domain: "engineering", query: "RFI" });
  assert.equal(selection.queryMatchMode, "all-terms");
  assert.ok(selection.seedNodeIds.some((nodeId) => nodeId.includes("rfi")));
  assert.ok(selection.seedNodeIds.every((nodeId) => WORKFLOW_GRAPH.nodes.find((node) => node.id === nodeId)?.domain === "engineering"));
});

test("WM-5 selects route IDs and canonical route paths", () => {
  const byId = selectWorkflowContextSeeds(WORKFLOW_GRAPH, { route: "payroll" });
  assert.deepEqual(byId.seedNodeIds, ["route-payroll", "route-payroll-run"]);
  const byPath = selectWorkflowContextSeeds(WORKFLOW_GRAPH, { route: "/payroll?runId=:runId" });
  assert.deepEqual(byPath.seedNodeIds, ["route-payroll-run"]);
});

test("WM-5 selects source file references and keeps selection order deterministic", () => {
  const selection = selectWorkflowContextSeeds(WORKFLOW_GRAPH, { filePath: "src/lib/financialSettlement.ts" });
  assert.ok(selection.seedNodeIds.length > 0);
  assert.deepEqual(selection.seedNodeIds, [...selection.seedNodeIds].sort((left, right) => {
    const leftMatch = selection.seedMatches.find((match) => match.nodeId === left)!;
    const rightMatch = selection.seedMatches.find((match) => match.nodeId === right)!;
    return rightMatch.score - leftMatch.score || left.localeCompare(right);
  }));
});

test("WM-5 maps changed source and test paths to nodes and invariants", () => {
  const invariant = syntheticInvariant();
  const graph = syntheticGraph([
    syntheticNode("changed-node", { fileRefs: ["src/changed.ts"], testRefs: ["tests/changed.test.ts"], invariantIds: [invariant.id] }),
  ], [], [invariant]);
  const result = generateWorkflowContext(graph, {
    changedFilePaths: ["src/changed.ts", "tests/changed.test.ts", "src/protected.ts", "unmatched.ts"],
    useChangedFiles: true,
  }, { ...repository, changedFilePaths: [] });
  assert.deepEqual(result.packet.changedFileMapping.matched.map((entry) => entry.path), ["src/changed.ts", "src/protected.ts", "tests/changed.test.ts"]);
  assert.deepEqual(result.packet.changedFileMapping.unmatched, ["unmatched.ts"]);
  assert.ok(result.packet.changedFileMapping.matched.every((entry) => entry.nodeIds.includes("changed-node")));
  assert.ok(result.packet.changedFileMapping.matched.some((entry) => entry.invariantIds.includes(invariant.id)));
});

test("WM-5 expands a deterministic one-hop neighborhood", () => {
  const first = generateWorkflowContext(WORKFLOW_GRAPH, { nodeId: "payroll-period" }, repository);
  const reversedGraph = {
    ...WORKFLOW_GRAPH,
    nodes: [...WORKFLOW_GRAPH.nodes].reverse(),
    edges: [...WORKFLOW_GRAPH.edges].reverse(),
  };
  const second = generateWorkflowContext(reversedGraph, { nodeId: "payroll-period" }, repository);
  assert.deepEqual(first.packet.workflow.nodes, second.packet.workflow.nodes);
  assert.deepEqual(first.packet.workflow.edges, second.packet.workflow.edges);
  assert.ok(first.packet.workflow.nodes.every((node) => node.distance <= 1));
  assert.ok(first.packet.workflow.nodes.some((node) => node.distance === 1));
});

test("WM-5 honors an explicit two-hop maximum", () => {
  const graph = syntheticGraph(
    [syntheticNode("a"), syntheticNode("b"), syntheticNode("c"), syntheticNode("d")],
    [syntheticEdge("a-b", "a", "b"), syntheticEdge("b-c", "b", "c"), syntheticEdge("c-d", "c", "d")],
  );
  const result = generateWorkflowContext(graph, { nodeId: "a", maxHops: 2 }, { ...repository, changedFilePaths: [] });
  assert.deepEqual(result.packet.workflow.nodes.map((node) => [node.nodeId, node.distance]), [["a", 0], ["b", 1], ["c", 2]]);
  assert.equal(result.packet.workflow.nodes.some((node) => node.nodeId === "d"), false);
});

test("WM-5 includes relevant invariants, guards, permissions, and confirmations", () => {
  const invariant = syntheticInvariant();
  const graph = syntheticGraph([
    syntheticNode("seed", { invariantIds: [invariant.id] }),
    syntheticNode("guard", { type: "guard", permissionKeys: ["things.manage"], confirmationRequirement: "human" }),
  ], [
    syntheticEdge("seed-guard", "seed", "guard", { type: "guards", kind: "guard", permissionKeys: ["things.manage"], confirmationRequirement: "human", invariantIds: [invariant.id] }),
  ], [invariant]);
  const result = generateWorkflowContext(graph, { nodeId: "seed" }, { ...repository, changedFilePaths: [] });
  assert.ok(result.packet.protectedBoundaries.invariants.some((item) => item.invariantId === invariant.id));
  assert.ok(result.packet.protectedBoundaries.guards.some((item) => item.sourceId === "guard"));
  assert.ok(result.packet.protectedBoundaries.permissions.includes("things.manage"));
  assert.ok(result.packet.protectedBoundaries.confirmations.some((item) => item.sourceId === "guard" || item.sourceId === "seed-guard"));
});

test("WM-5 preserves lifecycle transition edges in the bounded workflow section", () => {
  const graph = syntheticGraph(
    [
      syntheticNode("lifecycle", { type: "workflow", statusValues: ["DRAFT", "APPROVED"] }),
      syntheticNode("draft", { type: "state", label: "Lifecycle · DRAFT" }),
      syntheticNode("approved", { type: "state", label: "Lifecycle · APPROVED" }),
    ],
    [
      syntheticEdge("lifecycle-draft", "lifecycle", "draft", { type: "contains", kind: "state-transition", label: "current state" }),
      syntheticEdge("draft-approved", "draft", "approved", { type: "transitions", kind: "state-transition", label: "approve" }),
    ],
  );
  const result = generateWorkflowContext(graph, { nodeId: "draft" }, { ...repository, changedFilePaths: [] });
  assert.deepEqual(result.packet.workflow.lifecycleTransitions.map((edge) => edge.edgeId), ["draft-approved"]);
});

test("WM-5 enforces hard neighborhood node and edge bounds with omission reporting", () => {
  const nodes = [syntheticNode("seed")];
  const edges: WorkflowEdge[] = [];
  for (let index = 0; index < MAX_CONTEXT_NEIGHBOR_NODES + 20; index++) {
    const id = `neighbor-${String(index).padStart(3, "0")}`;
    nodes.push(syntheticNode(id));
    edges.push(syntheticEdge(`seed-${id}`, "seed", id));
  }
  const result = generateWorkflowContext(
    syntheticGraph(nodes, edges),
    { nodeId: "seed" },
    { ...repository, changedFilePaths: [] },
  );
  assert.ok(result.packet.workflow.nodes.length <= MAX_CONTEXT_NEIGHBOR_NODES);
  assert.ok(result.packet.workflow.edges.length <= MAX_CONTEXT_NEIGHBOR_EDGES);
  assert.ok(result.packet.truncation.omitted.nodes > 0 || result.packet.truncation.omitted.edges > 0);
});

test("WM-5 removes duplicate files, tests, invariants, QA IDs, and routes", () => {
  const invariant = syntheticInvariant();
  const graph = syntheticGraph([
    syntheticNode("seed", {
      fileRefs: ["src/duplicate.ts", "src/duplicate.ts"],
      testRefs: ["tests/duplicate.test.ts", "tests/duplicate.test.ts"],
      qaScenarioIds: ["qa-one", "qa-one"],
      invariantIds: [invariant.id, invariant.id],
      route: { routeId: "synthetic", canonicalPath: "/synthetic" },
    }),
  ], [], [invariant]);
  const result = generateWorkflowContext(graph, { nodeId: "seed" }, { ...repository, changedFilePaths: [] });
  assert.deepEqual(result.packet.inspectFiles.filter((value) => value === "src/duplicate.ts"), ["src/duplicate.ts"]);
  assert.deepEqual(result.packet.relevantTests.filter((value) => value === "tests/duplicate.test.ts"), ["tests/duplicate.test.ts"]);
  assert.deepEqual(result.packet.qaScenarioIds, ["qa-one"]);
  assert.deepEqual(result.packet.workflow.nodes[0]?.invariantIds, [invariant.id]);
  assert.equal(result.packet.routes.length, 1);
});

test("WM-5 rejects broad and unknown queries clearly", () => {
  assert.throws(
    () => selectWorkflowContextSeeds(WORKFLOW_GRAPH, { query: "project" }),
    (error: unknown) => error instanceof WorkflowContextSelectionError && error.code === "broad-selector" && /too broad/.test(error.message),
  );
  assert.throws(
    () => selectWorkflowContextSeeds(WORKFLOW_GRAPH, { query: "not-a-real-workflow-term" }),
    (error: unknown) => error instanceof WorkflowContextSelectionError && error.code === "unknown-selector" && /No workflow nodes matched/.test(error.message),
  );
});

test("WM-5 keeps invalid explicit route and domain selectors as hard errors", () => {
  assert.throws(
    () => selectWorkflowContextSeeds(WORKFLOW_GRAPH, { route: "/does-not-exist" }),
    (error: unknown) => error instanceof WorkflowContextSelectionError && error.code === "unknown-selector",
  );
  assert.throws(
    () => selectWorkflowContextSeeds(WORKFLOW_GRAPH, { domain: "client-billing" as never, query: "client billing" }),
    (error: unknown) => error instanceof WorkflowContextSelectionError && error.code === "invalid-selector",
  );
});

test("WM-5 enforces the character budget and reports omitted content", () => {
  const result = generateWorkflowContext(WORKFLOW_GRAPH, { nodeId: "payroll-period", characterBudget: 4_000 }, repository);
  assert.ok(result.characterCount <= 4_000);
  assert.ok(result.packet.truncation.truncated);
  assert.ok(Object.values(result.packet.truncation.omitted).some((count) => count > 0) || result.packet.truncation.detailLevel !== "full");
  assert.ok(result.packet.selection.seedNodeIds.includes("payroll-period"));
});

test("WM-5 bounds a large dirty-worktree metadata list for a narrow exact-node packet", () => {
  const invariant = syntheticInvariant("dirty-worktree-boundary");
  const graph = syntheticGraph([
    syntheticNode("seed", { invariantIds: [invariant.id] }),
  ], [], [invariant]);
  const changedFilePaths = Array.from({ length: 500 }, (_, index) => `untracked/${String(index).padStart(4, "0")}.txt`);
  const budget = 3_000;
  const result = generateWorkflowContext(graph, {
    nodeId: "seed",
    changedFilePaths: ["src/protected.ts"],
    useChangedFiles: true,
    characterBudget: budget,
  }, {
    headSha: "feedfacefeedfacefeedfacefeedfacefeedface",
    branch: "feat/large-worktree",
    dirty: true,
    changedFilePaths,
  });

  assert.ok(result.characterCount <= budget);
  assert.ok(result.markdown.length <= budget);
  assert.ok(result.json.length <= budget);
  assert.ok(result.packet.workflow.nodes.some((node) => node.nodeId === "seed"));
  assert.ok(result.packet.protectedBoundaries.invariants.some((item) => item.invariantId === invariant.id));
  assert.ok(result.packet.repository.changedFilePaths.length <= MAX_CONTEXT_CHANGED_FILE_PATHS);
  assert.ok(result.packet.requestedScope.changedFilePaths.length <= MAX_CONTEXT_CHANGED_FILE_PATHS);
  assert.ok(new Set([
    ...result.packet.repository.changedFilePaths,
    ...result.packet.requestedScope.changedFilePaths,
  ]).size <= MAX_CONTEXT_CHANGED_FILE_PATHS);
  assert.ok(result.packet.requestedScope.changedFilePaths.includes("src/protected.ts"));
  assert.ok(result.packet.repository.changedFilePaths.length < changedFilePaths.length);
  assert.equal(result.packet.truncation.truncated, true);
  assert.ok(result.packet.truncation.omitted.changedFiles > 0);
});

test("WM-5 preserves the seed and high-risk invariant IDs under a small budget", () => {
  const invariant = syntheticInvariant();
  const graph = syntheticGraph([
    syntheticNode("seed", { invariantIds: [invariant.id], permissionKeys: ["things.read"] }),
    syntheticNode("neighbor", { description: "A long lower-priority description that may be bounded away." }),
  ], [syntheticEdge("seed-neighbor", "seed", "neighbor")], [invariant]);
  const result = generateWorkflowContext(graph, { nodeId: "seed", characterBudget: 2_500 }, { ...repository, changedFilePaths: [] });
  assert.ok(result.packet.workflow.nodes.some((node) => node.nodeId === "seed"));
  assert.ok(result.packet.protectedBoundaries.invariants.some((item) => item.invariantId === invariant.id));
  assert.ok(result.characterCount <= 2_500);
});

test("WM-5 Markdown and JSON are stable, versioned, and structurally equivalent", () => {
  const result = generateWorkflowContext(WORKFLOW_GRAPH, { nodeId: "route-project-rfis" }, repository);
  const repeated = buildWorkflowContextPacket(WORKFLOW_GRAPH, { nodeId: "route-project-rfis" }, repository);
  assert.equal(result.packet.schemaVersion, WORKFLOW_MAP_CONTEXT_SCHEMA_VERSION);
  assert.equal(result.markdown, renderWorkflowContextMarkdown(result.packet));
  assert.equal(result.json, serializeWorkflowContextPacket(result.packet));
  assert.equal(result.json, repeated.json);
  assert.match(result.markdown, /ENGORYX AGENT CONTEXT/);
  const parsed = JSON.parse(result.json) as typeof result.packet;
  assert.deepEqual(parsed.workflow.nodes.map((node) => node.nodeId), result.packet.workflow.nodes.map((node) => node.nodeId));
  assert.equal(parsed.repository.graphVersion, WORKFLOW_GRAPH.version);
});

test("WM-5 repository metadata adapter is injectable and does not depend on the test runner branch", () => {
  const calls: string[] = [];
  const responses: Record<string, string> = {
    "rev-parse HEAD": "abc123\n",
    "branch --show-current": "feat/fake-branch\n",
    "status --porcelain=v1 --untracked-files=all": " M src/b.ts\n?? tests/a.test.ts\nR  old.ts -> src/a.ts\n",
  };
  const runCommand: RepositoryCommandRunner = (_root, args) => {
    const key = args.join(" ");
    calls.push(key);
    return { exitCode: 0, stdout: responses[key] || "", stderr: "" };
  };
  const metadata = readRepositoryMetadata("fixture-repository", { runCommand });
  assert.deepEqual(metadata, {
    headSha: "abc123",
    branch: "feat/fake-branch",
    dirty: true,
    changedFilePaths: ["src/a.ts", "src/b.ts", "tests/a.test.ts"],
  });
  assert.deepEqual(calls, ["rev-parse HEAD", "branch --show-current", "status --porcelain=v1 --untracked-files=all"]);
  assert.deepEqual(parseRepositoryChangedPaths(" M src/b.ts\n"), ["src/b.ts"]);
});

test("WM-5 rejects a failed Git metadata command without exposing arbitrary output", () => {
  assert.throws(
    () => readRepositoryMetadata("fixture-repository", {
      runCommand: () => ({ exitCode: 1, stdout: "", stderr: "not a git repository" }),
    }),
    /Git metadata command failed \(git rev-parse HEAD\): not a git repository/,
  );
});

test("WM-5 CLI parsing supports exact, repeated, bounded, and JSON options", () => {
  const parsed = parseContextCliArguments([
    "--domain", "engineering",
    "--query", "RFI detail",
    "--file=src/lib/engineeringCoordination.ts",
    "--changed-file", "tests/rfi.test.ts",
    "--hops", "2",
    "--budget", "12000",
    "--json",
    "--out", "tmp/context.json",
  ]);
  assert.equal(parsed.format, "json");
  assert.equal(parsed.outPath, "tmp/context.json");
  assert.deepEqual(parsed.selection, {
    domain: "engineering",
    query: "RFI detail",
    filePaths: ["src/lib/engineeringCoordination.ts"],
    changedFilePaths: ["tests/rfi.test.ts"],
    useChangedFiles: true,
    hops: 2,
    characterBudget: 12_000,
  });
  assert.match(contextCliUsage(), /workflow-map:context/);
});

test("WM-5 validates the hard character-budget ceiling", () => {
  assert.throws(
    () => generateWorkflowContext(WORKFLOW_GRAPH, { nodeId: "payroll-period", characterBudget: MAX_CONTEXT_CHARACTER_BUDGET + 1 }, repository),
    (error: unknown) => error instanceof WorkflowContextSelectionError && error.code === "budget",
  );
});
