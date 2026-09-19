import assert from "node:assert/strict";
import test from "node:test";
import {
  buildRepositoryIntelligenceContext,
  formatRepositoryIntelligenceContextMarkdown,
} from "../scripts/repository-intelligence/contextEngine.ts";
import type { FileIndexRecord, RepositoryIndex } from "../scripts/repository-intelligence/types.ts";
import type { RepositoryMetadata } from "../scripts/workflow-map/repositoryContext.ts";
import type { WorkflowGraph } from "../scripts/workflow-map/types.ts";

function record(path: string, overrides: Partial<FileIndexRecord> = {}): FileIndexRecord {
  return {
    schemaVersion: 1,
    generatorVersion: "ri-1.0.0",
    path,
    classification: path.startsWith("tests/") ? "test" : "source",
    language: "typescript",
    size: 10,
    lineCount: 1,
    contentHash: path.padEnd(64, "0").slice(0, 64),
    symbols: [],
    imports: [],
    exports: [],
    reExports: [],
    ...overrides,
  };
}

const index: RepositoryIndex = {
  schemaVersion: 1,
  generatorVersion: "ri-1.0.0",
  repositoryHeadSha: "a".repeat(40),
  dirtyTrackedPaths: [],
  files: [
    record("src/procurement.ts", {
      symbols: [{ id: "symbol:src/procurement.ts#preparePurchaseOrder:function", name: "preparePurchaseOrder", qualifiedName: "preparePurchaseOrder", kind: "function", isExported: true }],
      imports: [{ moduleSpecifier: "./shared", importedNames: ["shared"], isTypeOnly: false }],
    }),
    record("src/shared.ts"),
    record("tests/procurement.test.ts", { imports: [{ moduleSpecifier: "../src/procurement", importedNames: ["preparePurchaseOrder"], isTypeOnly: false }] }),
  ],
  excludedFiles: [],
};

const workflowGraph: WorkflowGraph = {
  schemaVersion: 1,
  graphId: "context-test",
  version: "context-v1",
  product: "HydroQualiSense",
  purpose: "context test",
  canonicalSource: "scripts/workflow-map/graph.ts",
  sourceClassification: "curated",
  phaseTags: ["test"],
  invariants: [{ id: "po-authority", label: "Purchase order authority", description: "PO remains committed cost.", sourceClassification: "curated", fileRefs: ["src/procurement.ts"], testRefs: ["tests/procurement.test.ts"] }],
  nodes: [
    { id: "purchase-order", label: "Purchase order approval", domain: "procurement", type: "workflow", description: "Prepare and approve a purchase order.", sourceClassification: "curated", fileRefs: ["src/procurement.ts"], testRefs: ["tests/procurement.test.ts"], permissionKeys: ["procurement.read"], invariantIds: ["po-authority"] },
    { id: "finance-boundary", label: "Finance boundary", domain: "finance", type: "guard", description: "Actual cost remains separate.", sourceClassification: "curated", fileRefs: ["src/shared.ts"] },
  ],
  edges: [{ id: "purchase-order-to-finance", source: "purchase-order", target: "finance-boundary", type: "separates", kind: "separation", label: "separates cost truth" }],
  diagrams: [],
};

const repository: RepositoryMetadata = {
  headSha: "a".repeat(40),
  branch: "codex/context",
  dirty: false,
  changedFilePaths: [],
};

test("RI-3 resolves a bounded deterministic packet with ranked sources, symbols, tests, boundaries, and exclusions", () => {
  const result = buildRepositoryIntelligenceContext({
    index,
    workflowGraph,
    repository,
    task: "purchase order approval",
    selection: { domain: "procurement", query: "purchase order approval", hops: 1, characterBudget: 6_000 },
  });

  assert.equal(result.packet.status, "fresh");
  assert.deepEqual(result.packet.repository.headSha, repository.headSha);
  assert.deepEqual(result.packet.resolvedDomains, ["procurement"]);
  assert.deepEqual(result.packet.primarySource.map((item) => item.path), ["src/procurement.ts"]);
  assert.ok(result.packet.primarySource[0]?.symbolIds.includes("symbol:src/procurement.ts#preparePurchaseOrder:function"));
  assert.ok(result.packet.supportingSource.includes("src/shared.ts"));
  assert.deepEqual(result.packet.tests, ["tests/procurement.test.ts"]);
  assert.deepEqual(result.packet.invariants, ["po-authority"]);
  assert.deepEqual(result.packet.permissions, ["procurement.read"]);
  assert.ok(result.packet.explicitlyExcludedDomains.includes("finance"));
  assert.ok(result.packet.provenanceNotes.some((note) => note.includes("curated")));
  const markdown = formatRepositoryIntelligenceContextMarkdown(result.packet, 6_000);
  assert.ok(markdown.length <= 6_000);
  assert.match(markdown, /Primary source/);
  assert.match(markdown, /src\/procurement\.ts/);
  assert.match(markdown, /po-authority/);
});

test("RI-3 respects explicit hop bounds instead of widening execution paths", () => {
  const zeroHop = buildRepositoryIntelligenceContext({
    index,
    workflowGraph,
    repository,
    task: "purchase order approval",
    selection: { domain: "procurement", query: "purchase order approval", hops: 0, characterBudget: 6_000 },
  });

  assert.equal(zeroHop.packet.status, "fresh");
  assert.deepEqual(zeroHop.packet.executionPath, []);
});

test("RI-3 refuses stale index claims and exposes the current Workflow Map fallback", () => {
  const stale = buildRepositoryIntelligenceContext({
    index: { ...index, repositoryHeadSha: "b".repeat(40) },
    workflowGraph,
    repository,
    task: "purchase order approval",
    selection: { domain: "procurement", query: "purchase order approval", hops: 1, characterBudget: 6_000 },
  });

  assert.equal(stale.packet.status, "stale-fallback");
  assert.equal(stale.packet.primarySource.length, 0);
  assert.ok(stale.packet.fallbackReason?.includes("revision"));
  assert.ok(stale.packet.provenanceNotes.some((note) => note.includes("Workflow Map")));
});
