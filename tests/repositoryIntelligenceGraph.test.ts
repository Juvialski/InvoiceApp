import assert from "node:assert/strict";
import test from "node:test";
import {
  buildRepositoryIntelligenceGraph,
  RepositoryGraphQuery,
  type RepositoryIntelligenceGraph,
} from "../scripts/repository-intelligence/graph.ts";
import type {
  FileIndexRecord,
  RepositoryIndex,
} from "../scripts/repository-intelligence/types.ts";
import type { WorkflowGraph } from "../scripts/workflow-map/types.ts";

function fileRecord(
  path: string,
  overrides: Partial<FileIndexRecord> = {},
): FileIndexRecord {
  return {
    schemaVersion: 1,
    generatorVersion: "ri-1.0.0",
    path,
    classification: path.startsWith("tests/") ? "test" : "source",
    language: "typescript",
    size: 100,
    lineCount: 4,
    contentHash: `${path.replace(/[^a-z0-9]/gi, "").padEnd(64, "0")}`.slice(0, 64),
    symbols: [],
    imports: [],
    exports: [],
    reExports: [],
    ...overrides,
  };
}

const repositoryIndex: RepositoryIndex = {
  schemaVersion: 1,
  generatorVersion: "ri-1.0.0",
  repositoryHeadSha: "a".repeat(40),
  dirtyTrackedPaths: ["src/procurement-helper.ts"],
  files: [
    fileRecord("src/procurement.ts", {
      symbols: [{
        id: "symbol:src/procurement.ts#preparePurchaseOrder:function",
        name: "preparePurchaseOrder",
        qualifiedName: "preparePurchaseOrder",
        kind: "function",
        isExported: true,
        sourceSpan: { startLine: 1, endLine: 3, startColumn: 1, endColumn: 2 },
      }],
      imports: [{ moduleSpecifier: "./shared", importedNames: ["shared"], isTypeOnly: false }],
      exports: [{ name: "preparePurchaseOrder", exportedName: "preparePurchaseOrder", kind: "local", isTypeOnly: false }],
    }),
    fileRecord("src/shared.ts", {
      symbols: [{
        id: "symbol:src/shared.ts#shared:const",
        name: "shared",
        qualifiedName: "shared",
        kind: "const",
        isExported: true,
      }],
      exports: [{ name: "shared", exportedName: "shared", kind: "local", isTypeOnly: false }],
    }),
    fileRecord("src/procurement-helper.ts"),
    fileRecord("tests/procurement.test.ts", {
      imports: [{ moduleSpecifier: "../src/procurement", importedNames: ["preparePurchaseOrder"], isTypeOnly: false }],
    }),
  ],
  excludedFiles: [],
};

const workflowGraph: WorkflowGraph = {
  schemaVersion: 1,
  graphId: "test-workflow-map",
  version: "test-v1",
  product: "HydroQualiSense",
  purpose: "test graph",
  canonicalSource: "scripts/workflow-map/graph.ts",
  sourceClassification: "curated",
  reviewedCommitSha: "b".repeat(40),
  phaseTags: ["test"],
  invariants: [{
    id: "po-authority",
    label: "Purchase order authority",
    description: "Purchase orders remain committed cost, not actual cost.",
    sourceClassification: "curated",
    fileRefs: ["src/procurement.ts"],
    testRefs: ["tests/procurement.test.ts"],
  }],
  nodes: [
    {
      id: "procurement-flow",
      label: "Purchase order workflow",
      domain: "procurement",
      type: "workflow",
      description: "Purchase order preparation and approval.",
      sourceClassification: "curated",
      fileRefs: ["src/procurement.ts"],
      testRefs: ["tests/procurement.test.ts"],
      permissionKeys: ["procurement.read"],
      invariantIds: ["po-authority"],
    },
    {
      id: "finance-boundary",
      label: "Finance boundary",
      domain: "finance",
      type: "guard",
      description: "Finance remains a separate authority.",
      sourceClassification: "curated",
      fileRefs: ["src/procurement-helper.ts"],
    },
  ],
  edges: [{
    id: "procurement-to-finance",
    source: "procurement-flow",
    target: "finance-boundary",
    type: "separates",
    kind: "separation",
    label: "separates committed cost from actual cost",
    invariantIds: ["po-authority"],
  }],
  diagrams: [],
};

function build(): RepositoryIntelligenceGraph {
  return buildRepositoryIntelligenceGraph({ index: repositoryIndex, workflowGraph });
}

test("RI-2 builds stable source and curated graph identities with separate authority", () => {
  const graph = build();
  const query = new RepositoryGraphQuery(graph);
  const file = query.getNode("file:src/procurement.ts");
  const workflow = query.getNode("procurement-flow");
  const mapping = graph.edges.find((edge) => edge.source === file?.id && edge.target === workflow?.id);

  assert.equal(file?.provenance.kind, "source-derived");
  assert.equal(file?.provenance.authority, "authoritative");
  assert.equal(workflow?.provenance.kind, "curated");
  assert.equal(workflow?.provenance.authority, "authoritative");
  assert.equal(mapping?.provenance.kind, "curated");
  assert.equal(mapping?.provenance.authority, "authoritative");
  assert.equal(query.getNode("symbol:src/procurement.ts#preparePurchaseOrder:function")?.sourcePath, "src/procurement.ts");
  assert.equal(graph.freshness.repositoryHeadSha, "a".repeat(40));
  assert.equal(graph.freshness.workflowMapVersion, "test-v1");
});

test("RI-2 reports source-versus-curated domain conflicts without dropping either fact", () => {
  const graph = build();
  const query = new RepositoryGraphQuery(graph);
  const helper = query.getNode("file:src/procurement-helper.ts");
  const inferredProcurement = graph.edges.find((edge) => edge.source === helper?.id && edge.target === "domain:procurement");
  const curatedFinance = graph.edges.find((edge) => edge.source === helper?.id && edge.target === "finance-boundary");

  assert.equal(inferredProcurement?.provenance.kind, "inferred");
  assert.equal(inferredProcurement?.provenance.authority, "advisory");
  assert.equal(curatedFinance?.provenance.kind, "curated");
  assert.ok(query.conflicts({ subjectId: "file:src/procurement-helper.ts" }).some((conflict) => conflict.reason === "source-curated-disagreement"));
});

test("RI-2 queries are deterministic and cover neighbors, bounded paths, source tests, mappings, and domains", () => {
  const graph = build();
  const query = new RepositoryGraphQuery(graph);
  const repeated = build();

  assert.deepEqual(graph.nodes.map((node) => node.id), repeated.nodes.map((node) => node.id));
  assert.deepEqual(graph.edges.map((edge) => edge.id), repeated.edges.map((edge) => edge.id));
  assert.deepEqual(query.findNodes({ path: "src/procurement.ts" }).map((node) => node.id), ["file:src/procurement.ts", "module:src/procurement.ts"]);
  assert.deepEqual(query.findNodes({ symbol: "preparePurchaseOrder" }).map((node) => node.id), ["symbol:src/procurement.ts#preparePurchaseOrder:function"]);
  assert.deepEqual(query.testsForSource("src/procurement.ts").map((node) => node.id), ["test:tests/procurement.test.ts"]);
  assert.deepEqual(query.sourceToCurated("src/procurement.ts").map((node) => node.id), ["procurement-flow", "po-authority"]);
  assert.ok(query.neighbors("file:src/procurement.ts", { direction: "outgoing", maxHops: 1 }).some((node) => node.id === "symbol:src/procurement.ts#preparePurchaseOrder:function"));
  assert.deepEqual(query.boundedPaths("test:tests/procurement.test.ts", "procurement-flow", { maxHops: 3 }).map((path) => path.nodes), [
    ["test:tests/procurement.test.ts", "procurement-flow"],
    ["test:tests/procurement.test.ts", "file:src/procurement.ts", "procurement-flow"],
  ]);
  const procurement = query.domainIsolation("procurement");
  assert.ok(procurement.nodes.some((node) => node.id === "procurement-flow"));
  assert.equal(procurement.nodes.some((node) => node.id === "finance-boundary"), false);
  assert.ok(procurement.edges.every((edge) => procurement.nodes.some((node) => node.id === edge.source) && procurement.nodes.some((node) => node.id === edge.target)));
});

test("RI-2 freshness checks distinguish exact revisions from stale graph data", () => {
  const query = new RepositoryGraphQuery(build());
  assert.equal(query.isFreshFor({ repositoryHeadSha: "a".repeat(40), dirtyTrackedPaths: ["src/procurement-helper.ts"] }), true);
  assert.equal(query.isFreshFor({ repositoryHeadSha: "c".repeat(40), dirtyTrackedPaths: [] }), false);
  assert.equal(query.isFreshFor({ repositoryHeadSha: "a".repeat(40), dirtyTrackedPaths: [] }), false);
});
