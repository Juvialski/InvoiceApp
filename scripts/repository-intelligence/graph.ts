import path from "node:path";
import type {
  FileIndexRecord,
  IndexedSourceSpan,
  RepositoryIndex,
} from "./types.ts";
import type {
  WorkflowDomain,
  WorkflowEdge,
  WorkflowGraph,
  WorkflowInvariant,
  WorkflowNode,
} from "../workflow-map/types.ts";

export const REPOSITORY_INTELLIGENCE_GRAPH_SCHEMA_VERSION = 1 as const;
export const REPOSITORY_INTELLIGENCE_GRAPH_GENERATOR_VERSION = "ri-2.0.0" as const;

export type RepositoryGraphProvenanceKind =
  | "source-derived"
  | "curated"
  | "inferred"
  | "runtime-observed";

export type RepositoryGraphAuthority = "authoritative" | "advisory";

export type RepositoryGraphNodeType =
  | "file"
  | "symbol"
  | "module"
  | "domain"
  | "route"
  | "screen"
  | "api-endpoint"
  | "server-handler"
  | "test"
  | "invariant"
  | "permission"
  | "provider-boundary"
  | "migration"
  | "database-object"
  | "workflow"
  | "state"
  | "action"
  | "data"
  | "derived-data"
  | "guard"
  | "external-boundary";

export type RepositoryGraphEdgeType =
  | "declares"
  | "imports"
  | "exports"
  | "re-exports"
  | "references"
  | "tests"
  | "source-to-curated"
  | "belongs-to-domain"
  | "registers-route"
  | "handles-endpoint"
  | "defines-db-object"
  | "contains"
  | "routes-to"
  | "opens"
  | "reads"
  | "writes"
  | "derives"
  | "transitions"
  | "guards"
  | "requires-permission"
  | "requires-confirmation"
  | "executes-through"
  | "links-to"
  | "feeds"
  | "preserves"
  | "separates"
  | "external";

export interface RepositoryGraphProvenance {
  readonly kind: RepositoryGraphProvenanceKind;
  readonly authority: RepositoryGraphAuthority;
  readonly producer: string;
  readonly sourceRevision: string;
  readonly sourcePath?: string;
  readonly sourceSpan?: IndexedSourceSpan;
  readonly ruleVersion?: string;
  readonly confidence?: number;
  readonly observedEnvironment?: string;
  readonly observedAt?: string;
}

export type RepositoryGraphAttribute = string | number | boolean | readonly string[];

export interface RepositoryGraphNode {
  readonly id: string;
  readonly label: string;
  readonly type: RepositoryGraphNodeType;
  readonly domains?: readonly WorkflowDomain[];
  readonly sourcePath?: string;
  readonly sourceSpan?: IndexedSourceSpan;
  readonly aliases?: readonly string[];
  readonly attributes?: Readonly<Record<string, RepositoryGraphAttribute>>;
  readonly provenance: RepositoryGraphProvenance;
}

export interface RepositoryGraphEdge {
  readonly id: string;
  readonly source: string;
  readonly target: string;
  readonly type: RepositoryGraphEdgeType;
  readonly label: string;
  readonly attributes?: Readonly<Record<string, RepositoryGraphAttribute>>;
  readonly provenance: RepositoryGraphProvenance;
}

export type RepositoryGraphConflictReason =
  | "source-curated-disagreement"
  | "missing-curated-reference"
  | "duplicate-authoritative-identity";

export interface RepositoryGraphConflict {
  readonly id: string;
  readonly subjectId: string;
  readonly reason: RepositoryGraphConflictReason;
  readonly message: string;
  readonly sourceEvidence?: readonly string[];
  readonly curatedEvidence?: readonly string[];
}

export interface RepositoryGraphFileHash {
  readonly path: string;
  readonly contentHash: string;
}

export interface RepositoryGraphFreshness {
  readonly repositoryHeadSha: string;
  readonly dirtyTrackedPaths: readonly string[];
  readonly indexSchemaVersion: number;
  readonly indexGeneratorVersion: string;
  readonly graphSchemaVersion: number;
  readonly graphGeneratorVersion: string;
  readonly workflowMapSchemaVersion: number;
  readonly workflowMapVersion: string;
  readonly fileHashes: readonly RepositoryGraphFileHash[];
}

export interface RepositoryIntelligenceGraph {
  readonly schemaVersion: typeof REPOSITORY_INTELLIGENCE_GRAPH_SCHEMA_VERSION;
  readonly generatorVersion: typeof REPOSITORY_INTELLIGENCE_GRAPH_GENERATOR_VERSION;
  readonly freshness: RepositoryGraphFreshness;
  readonly nodes: readonly RepositoryGraphNode[];
  readonly edges: readonly RepositoryGraphEdge[];
  readonly conflicts: readonly RepositoryGraphConflict[];
}

export interface BuildRepositoryIntelligenceGraphOptions {
  readonly index: RepositoryIndex;
  readonly workflowGraph: WorkflowGraph;
}

export interface RepositoryGraphNodeQuery {
  readonly id?: string;
  readonly path?: string;
  readonly symbol?: string;
  readonly domain?: WorkflowDomain;
  readonly query?: string;
  readonly provenance?: RepositoryGraphProvenanceKind;
  readonly authority?: RepositoryGraphAuthority;
}

export interface RepositoryGraphNeighborOptions {
  readonly direction?: "incoming" | "outgoing" | "both";
  readonly maxHops?: number;
  readonly domain?: WorkflowDomain;
}

export interface RepositoryGraphPathOptions {
  readonly maxHops?: number;
  readonly maxPaths?: number;
  readonly domain?: WorkflowDomain;
}

export interface RepositoryGraphPath {
  readonly nodes: readonly string[];
  readonly edges: readonly string[];
  readonly hops: number;
}

export interface RepositoryGraphFreshnessExpectation {
  readonly repositoryHeadSha: string;
  readonly dirtyTrackedPaths: readonly string[];
  readonly fileHashes?: readonly RepositoryGraphFileHash[];
}

const NODE_TYPE_ORDER: readonly RepositoryGraphNodeType[] = [
  "file", "module", "test", "symbol", "migration", "database-object", "domain", "route", "screen",
  "workflow", "state", "action", "data", "derived-data", "guard", "external-boundary", "invariant", "permission", "provider-boundary", "api-endpoint", "server-handler",
];

const DOMAIN_TOKENS: Readonly<Record<WorkflowDomain, readonly string[]>> = {
  "platform-tenancy": ["auth", "company", "tenant", "member", "role", "access", "deployment", "session"],
  dashboard: ["dashboard", "overview"],
  projects: ["project", "projects", "allocation", "costing"],
  procurement: ["procurement", "purchase-order", "purchaseorder", "rfq", "quotation", "supplier"],
  inventory: ["inventory", "warehouse", "material", "equipment", "stock"],
  commercial: ["commercial", "subcontract", "claim", "variation", "billing", "collection"],
  engineering: ["engineering", "rfi", "annotation", "site-log", "document"],
  finance: ["finance", "cash", "bank", "expense", "accounting", "settlement"],
  workforce: ["workforce", "payroll", "attendance", "worker", "employee"],
  reporting: ["report", "statistics", "analytics"],
  assistant: ["assistant", "messaging", "email", "sms", "gemini", "ai"],
};

function compareLex(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort(compareLex);
}

function normalizePath(value: string): string {
  let normalized = value.trim().replaceAll("\\", "/");
  while (normalized.startsWith("./")) normalized = normalized.slice(2);
  return normalized;
}

function fileNodeId(filePath: string): string {
  return `file:${normalizePath(filePath)}`;
}

function moduleNodeId(filePath: string): string {
  return `module:${normalizePath(filePath)}`;
}

function testNodeId(filePath: string): string {
  return `test:${normalizePath(filePath)}`;
}

function migrationNodeId(filePath: string): string {
  return `migration:${normalizePath(filePath)}`;
}

function sourceRevision(index: RepositoryIndex): string {
  return index.repositoryHeadSha || "unknown";
}

function makeProvenance(
  kind: RepositoryGraphProvenanceKind,
  authority: RepositoryGraphAuthority,
  producer: string,
  revision: string,
  extra: Partial<Omit<RepositoryGraphProvenance, "kind" | "authority" | "producer" | "sourceRevision">> = {},
): RepositoryGraphProvenance {
  return { kind, authority, producer, sourceRevision: revision, ...extra };
}

function nodeTypeRank(type: RepositoryGraphNodeType): number {
  const index = NODE_TYPE_ORDER.indexOf(type);
  return index < 0 ? NODE_TYPE_ORDER.length : index;
}

function compareNodes(left: RepositoryGraphNode, right: RepositoryGraphNode): number {
  return nodeTypeRank(left.type) - nodeTypeRank(right.type) || compareLex(left.id, right.id);
}

function compareEdges(left: RepositoryGraphEdge, right: RepositoryGraphEdge): number {
  return compareLex(left.source, right.source) || compareLex(left.target, right.target) || compareLex(left.type, right.type) || compareLex(left.id, right.id);
}

function workflowNodeType(node: WorkflowNode): RepositoryGraphNodeType {
  return node.type;
}

function workflowNodeAttributes(node: WorkflowNode): Readonly<Record<string, RepositoryGraphAttribute>> {
  return {
    description: node.description,
    sourceClassification: node.sourceClassification,
    ...(node.scope ? { scope: node.scope } : {}),
    ...(node.fileRefs?.length ? { fileRefs: [...node.fileRefs].sort(compareLex) } : {}),
    ...(node.testRefs?.length ? { testRefs: [...node.testRefs].sort(compareLex) } : {}),
    ...(node.permissionKeys?.length ? { permissionKeys: [...node.permissionKeys].sort(compareLex) } : {}),
    ...(node.invariantIds?.length ? { invariantIds: [...node.invariantIds].sort(compareLex) } : {}),
    ...(node.confirmationRequirement ? { confirmationRequirement: node.confirmationRequirement } : {}),
    ...(node.statusValues?.length ? { statusValues: [...node.statusValues].sort(compareLex) } : {}),
    ...(node.tags?.length ? { tags: [...node.tags].sort(compareLex) } : {}),
    ...(node.route ? { canonicalPath: node.route.canonicalPath, ...(node.route.routeId ? { routeId: node.route.routeId } : {}) } : {}),
  };
}

function addNode(nodes: Map<string, RepositoryGraphNode>, node: RepositoryGraphNode, conflicts: RepositoryGraphConflict[]): void {
  const existing = nodes.get(node.id);
  if (!existing) {
    nodes.set(node.id, node);
    return;
  }
  if (existing.provenance.kind === "curated" && node.provenance.kind !== "curated") return;
  if (existing.provenance.kind !== node.provenance.kind || existing.label !== node.label) {
    conflicts.push({
      id: `conflict:duplicate:${node.id}:${node.provenance.kind}`,
      subjectId: node.id,
      reason: "duplicate-authoritative-identity",
      message: `Multiple graph producers supplied different evidence for ${node.id}; the existing node was retained.`,
      sourceEvidence: [existing.provenance.producer],
      curatedEvidence: node.provenance.kind === "curated" ? [node.provenance.producer] : [],
    });
  }
}

function addEdge(edges: Map<string, RepositoryGraphEdge>, edge: RepositoryGraphEdge): void {
  if (!edges.has(edge.id)) edges.set(edge.id, edge);
}

function resolveRelativeImport(sourcePath: string, specifier: string, filePaths: ReadonlySet<string>): string | undefined {
  if (!specifier.startsWith(".")) return undefined;
  const base = normalizePath(path.posix.normalize(path.posix.join(path.posix.dirname(sourcePath), specifier)));
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.js`,
    `${base}.jsx`,
    `${base}.json`,
    `${base}/index.ts`,
    `${base}/index.tsx`,
    `${base}/index.js`,
  ];
  return candidates.find((candidate) => filePaths.has(candidate));
}

function inferredDomainsForPath(filePath: string): WorkflowDomain[] {
  const normalized = normalizePath(filePath).toLocaleLowerCase();
  const matches: WorkflowDomain[] = [];
  for (const [domain, tokens] of Object.entries(DOMAIN_TOKENS) as Array<[WorkflowDomain, readonly string[]]>) {
    if (tokens.some((token) => normalized.includes(token))) matches.push(domain);
  }
  return matches.sort(compareLex);
}

function curatedDomainByReference(workflowGraph: WorkflowGraph): Map<string, Set<WorkflowDomain>> {
  const domainsByPath = new Map<string, Set<WorkflowDomain>>();
  const add = (reference: string, domain: WorkflowDomain) => {
    const normalized = normalizePath(reference);
    if (!normalized) return;
    const domains = domainsByPath.get(normalized) || new Set<WorkflowDomain>();
    domains.add(domain);
    domainsByPath.set(normalized, domains);
  };
  for (const node of workflowGraph.nodes) {
    for (const reference of node.fileRefs || []) add(reference, node.domain);
    for (const reference of node.testRefs || []) add(reference, node.domain);
  }
  for (const invariant of workflowGraph.invariants) {
    const domains = workflowGraph.nodes.filter((node) => node.invariantIds?.includes(invariant.id)).map((node) => node.domain);
    for (const domain of domains) {
      for (const reference of invariant.fileRefs) add(reference, domain);
      for (const reference of invariant.testRefs || []) add(reference, domain);
    }
  }
  return domainsByPath;
}

function addConflict(
  conflicts: RepositoryGraphConflict[],
  subjectId: string,
  message: string,
  sourceEvidence: readonly string[],
  curatedEvidence: readonly string[],
): void {
  const id = `conflict:source-curated:${subjectId}:${sourceEvidence.join(",")}:${curatedEvidence.join(",")}`;
  if (conflicts.some((conflict) => conflict.id === id)) return;
  conflicts.push({ id, subjectId, reason: "source-curated-disagreement", message, sourceEvidence, curatedEvidence });
}

function addReferenceConflict(
  conflicts: RepositoryGraphConflict[],
  subjectId: string,
  reference: string,
  kind: "file" | "test",
): void {
  conflicts.push({
    id: `conflict:missing-reference:${subjectId}:${kind}:${reference}`,
    subjectId,
    reason: "missing-curated-reference",
    message: `Curated Workflow Map reference ${reference} does not resolve to an indexed ${kind}.`,
    curatedEvidence: [reference],
  });
}

function mapWorkflowEdgeType(edge: WorkflowEdge): RepositoryGraphEdgeType {
  return edge.type;
}

export function buildRepositoryIntelligenceGraph(
  options: BuildRepositoryIntelligenceGraphOptions,
): RepositoryIntelligenceGraph {
  const { index, workflowGraph } = options;
  const nodes = new Map<string, RepositoryGraphNode>();
  const edges = new Map<string, RepositoryGraphEdge>();
  const conflicts: RepositoryGraphConflict[] = [];
  const revision = sourceRevision(index);
  const recordsByPath = new Map(index.files.map((record) => [normalizePath(record.path), record]));
  const filePaths = new Set(recordsByPath.keys());
  const curatedDomains = curatedDomainByReference(workflowGraph);
  const curatedDomainListByPath = new Map([...curatedDomains.entries()].map(([filePath, domains]) => [filePath, [...domains].sort(compareLex)]));

  for (const record of [...index.files].sort((left, right) => compareLex(left.path, right.path))) {
    const normalizedPath = normalizePath(record.path);
    const curated = curatedDomainListByPath.get(normalizedPath) || [];
    const inferred = inferredDomainsForPath(normalizedPath);
    const domains = uniqueSorted([...curated, ...inferred]) as WorkflowDomain[];
    const fileId = fileNodeId(normalizedPath);
    addNode(nodes, {
      id: fileId,
      label: normalizedPath,
      type: "file",
      ...(domains.length ? { domains } : {}),
      sourcePath: normalizedPath,
      aliases: [normalizedPath],
      attributes: {
        classification: record.classification,
        language: record.language,
        size: record.size,
        lineCount: record.lineCount,
        contentHash: record.contentHash,
      },
      provenance: makeProvenance("source-derived", "authoritative", "ri-1-indexer", revision, { sourcePath: normalizedPath }),
    }, conflicts);
    const moduleId = moduleNodeId(normalizedPath);
    addNode(nodes, {
      id: moduleId,
      label: normalizedPath,
      type: "module",
      ...(domains.length ? { domains } : {}),
      sourcePath: normalizedPath,
      aliases: [normalizedPath],
      attributes: { classification: record.classification, language: record.language },
      provenance: makeProvenance("source-derived", "authoritative", "ri-1-indexer", revision, { sourcePath: normalizedPath }),
    }, conflicts);
    addEdge(edges, {
      id: `source:declares-module:${normalizedPath}`,
      source: fileId,
      target: moduleId,
      type: "declares",
      label: "defines module",
      provenance: makeProvenance("source-derived", "authoritative", "ri-2-graph", revision, { sourcePath: normalizedPath }),
    });
    if (record.classification === "test") {
      const testId = testNodeId(normalizedPath);
      addNode(nodes, {
        id: testId,
        label: normalizedPath,
        type: "test",
        ...(domains.length ? { domains } : {}),
        sourcePath: normalizedPath,
        aliases: [normalizedPath],
        attributes: { language: record.language, classification: record.classification },
        provenance: makeProvenance("source-derived", "authoritative", "ri-1-indexer", revision, { sourcePath: normalizedPath }),
      }, conflicts);
      addEdge(edges, {
        id: `source:declares-test:${normalizedPath}`,
        source: fileId,
        target: testId,
        type: "declares",
        label: "declares test entry",
        provenance: makeProvenance("source-derived", "authoritative", "ri-2-graph", revision, { sourcePath: normalizedPath }),
      });
    }
    if (record.classification === "migration") {
      const migrationId = migrationNodeId(normalizedPath);
      addNode(nodes, {
        id: migrationId,
        label: normalizedPath,
        type: "migration",
        sourcePath: normalizedPath,
        aliases: [normalizedPath],
        attributes: { language: record.language, classification: record.classification },
        provenance: makeProvenance("source-derived", "authoritative", "ri-1-indexer", revision, { sourcePath: normalizedPath }),
      }, conflicts);
      addEdge(edges, {
        id: `source:declares-migration:${normalizedPath}`,
        source: fileId,
        target: migrationId,
        type: "declares",
        label: "contains migration",
        provenance: makeProvenance("source-derived", "authoritative", "ri-2-graph", revision, { sourcePath: normalizedPath }),
      });
    }
    for (const symbol of [...record.symbols].sort((left, right) => compareLex(left.id, right.id))) {
      addNode(nodes, {
        id: symbol.id,
        label: symbol.qualifiedName,
        type: "symbol",
        ...(domains.length ? { domains } : {}),
        sourcePath: normalizedPath,
        ...(symbol.sourceSpan ? { sourceSpan: symbol.sourceSpan } : {}),
        aliases: uniqueSorted([symbol.name, symbol.qualifiedName]),
        attributes: { name: symbol.name, qualifiedName: symbol.qualifiedName, kind: symbol.kind, exported: symbol.isExported },
        provenance: makeProvenance("source-derived", "authoritative", "ri-1-typescript-extractor", revision, {
          sourcePath: normalizedPath,
          ...(symbol.sourceSpan ? { sourceSpan: symbol.sourceSpan } : {}),
        }),
      }, conflicts);
      addEdge(edges, {
        id: `source:declares-symbol:${normalizedPath}:${symbol.id}`,
        source: fileId,
        target: symbol.id,
        type: "declares",
        label: `declares ${symbol.qualifiedName}`,
        provenance: makeProvenance("source-derived", "authoritative", "ri-1-typescript-extractor", revision, { sourcePath: normalizedPath, ...(symbol.sourceSpan ? { sourceSpan: symbol.sourceSpan } : {}) }),
      });
    }
  }

  for (const record of [...index.files].sort((left, right) => compareLex(left.path, right.path))) {
    const sourcePath = normalizePath(record.path);
    const sourceId = fileNodeId(sourcePath);
    const sourceTestId = record.classification === "test" ? testNodeId(sourcePath) : undefined;
    for (const imported of record.imports) {
      const targetPath = resolveRelativeImport(sourcePath, imported.moduleSpecifier, filePaths);
      if (!targetPath) continue;
      const targetId = fileNodeId(targetPath);
      addEdge(edges, {
        id: `source:imports:${sourcePath}:${targetPath}:${imported.moduleSpecifier}`,
        source: sourceId,
        target: targetId,
        type: "imports",
        label: `imports ${imported.moduleSpecifier}`,
        attributes: { importedNames: [...imported.importedNames].sort(compareLex), typeOnly: imported.isTypeOnly },
        provenance: makeProvenance("source-derived", "authoritative", "ri-1-typescript-extractor", revision, { sourcePath }),
      });
      if (sourceTestId && recordsByPath.get(targetPath)?.classification !== "test") {
        addEdge(edges, {
          id: `source:tests:${sourcePath}:${targetPath}`,
          source: sourceTestId,
          target: targetId,
          type: "tests",
          label: `tests ${targetPath}`,
          provenance: makeProvenance("source-derived", "authoritative", "ri-2-test-mapper", revision, { sourcePath }),
        });
      }
    }
    for (const exported of record.exports) {
      const symbol = record.symbols.find((candidate) => candidate.name === exported.name || candidate.qualifiedName === exported.name);
      if (!symbol) continue;
      addEdge(edges, {
        id: `source:exports:${sourcePath}:${symbol.id}:${exported.exportedName}`,
        source: sourceId,
        target: symbol.id,
        type: "exports",
        label: `exports ${exported.exportedName}`,
        attributes: { typeOnly: exported.isTypeOnly },
        provenance: makeProvenance("source-derived", "authoritative", "ri-1-typescript-extractor", revision, { sourcePath }),
      });
    }
    for (const exported of record.reExports) {
      if (!exported.moduleSpecifier) continue;
      const targetPath = resolveRelativeImport(sourcePath, exported.moduleSpecifier, filePaths);
      if (!targetPath) continue;
      addEdge(edges, {
        id: `source:re-exports:${sourcePath}:${targetPath}:${exported.exportedName}`,
        source: sourceId,
        target: fileNodeId(targetPath),
        type: "re-exports",
        label: `re-exports ${exported.exportedName}`,
        attributes: { typeOnly: exported.isTypeOnly },
        provenance: makeProvenance("source-derived", "authoritative", "ri-1-typescript-extractor", revision, { sourcePath }),
      });
    }
  }

  const workflowRevision = workflowGraph.reviewedCommitSha || revision;
  const workflowNodesById = new Map(workflowGraph.nodes.map((node) => [node.id, node]));
  const domainSet = uniqueSorted(workflowGraph.nodes.map((node) => node.domain)) as WorkflowDomain[];
  for (const domain of domainSet) {
    addNode(nodes, {
      id: `domain:${domain}`,
      label: domain,
      type: "domain",
      domains: [domain],
      aliases: [domain],
      provenance: makeProvenance("curated", "authoritative", "workflow-map", workflowRevision, { sourcePath: workflowGraph.canonicalSource }),
    }, conflicts);
  }
  for (const node of [...workflowGraph.nodes].sort((left, right) => compareLex(left.id, right.id))) {
    addNode(nodes, {
      id: node.id,
      label: node.label,
      type: workflowNodeType(node),
      domains: [node.domain],
      aliases: uniqueSorted([node.id, ...(node.route?.routeId ? [node.route.routeId] : []), ...(node.route?.canonicalPath ? [node.route.canonicalPath] : [])]),
      attributes: workflowNodeAttributes(node),
      provenance: makeProvenance("curated", "authoritative", "workflow-map", workflowRevision, { sourcePath: workflowGraph.canonicalSource }),
    }, conflicts);
    addEdge(edges, {
      id: `curated:domain:${node.id}:${node.domain}`,
      source: node.id,
      target: `domain:${node.domain}`,
      type: "belongs-to-domain",
      label: `belongs to ${node.domain}`,
      provenance: makeProvenance("curated", "authoritative", "workflow-map", workflowRevision, { sourcePath: workflowGraph.canonicalSource }),
    });
    for (const reference of node.fileRefs || []) {
      const normalized = normalizePath(reference);
      if (!recordsByPath.has(normalized)) {
        addReferenceConflict(conflicts, node.id, normalized, "file");
        continue;
      }
      addEdge(edges, {
        id: `curated:source-to-workflow:file:${normalized}:${node.id}`,
        source: fileNodeId(normalized),
        target: node.id,
        type: "source-to-curated",
        label: `maps source file to ${node.label}`,
        provenance: makeProvenance("curated", "authoritative", "workflow-map", workflowRevision, { sourcePath: workflowGraph.canonicalSource }),
      });
    }
    for (const reference of node.testRefs || []) {
      const normalized = normalizePath(reference);
      if (!recordsByPath.has(normalized)) {
        addReferenceConflict(conflicts, node.id, normalized, "test");
        continue;
      }
      addEdge(edges, {
        id: `curated:source-to-workflow:test:${normalized}:${node.id}`,
        source: testNodeId(normalized),
        target: node.id,
        type: "source-to-curated",
        label: `maps test to ${node.label}`,
        provenance: makeProvenance("curated", "authoritative", "workflow-map", workflowRevision, { sourcePath: workflowGraph.canonicalSource }),
      });
    }
    for (const permission of node.permissionKeys || []) {
      const permissionId = `permission:${permission}`;
      addNode(nodes, {
        id: permissionId,
        label: permission,
        type: "permission",
        domains: [node.domain],
        aliases: [permission],
        provenance: makeProvenance("curated", "authoritative", "workflow-map", workflowRevision, { sourcePath: workflowGraph.canonicalSource }),
      }, conflicts);
      addEdge(edges, {
        id: `curated:permission:${node.id}:${permission}`,
        source: node.id,
        target: permissionId,
        type: "requires-permission",
        label: `requires ${permission}`,
        provenance: makeProvenance("curated", "authoritative", "workflow-map", workflowRevision, { sourcePath: workflowGraph.canonicalSource }),
      });
    }
    for (const invariantId of node.invariantIds || []) {
      const invariantIdNode = invariantId;
      addEdge(edges, {
        id: `curated:invariant:${node.id}:${invariantId}`,
        source: node.id,
        target: invariantIdNode,
        type: "preserves",
        label: `preserves ${invariantId}`,
        provenance: makeProvenance("curated", "authoritative", "workflow-map", workflowRevision, { sourcePath: workflowGraph.canonicalSource }),
      });
    }
    if (node.route) {
      const routeKey = node.route.routeId || node.route.canonicalPath;
      const routeId = `route:${routeKey}`;
      addNode(nodes, {
        id: routeId,
        label: node.route.canonicalPath,
        type: "route",
        domains: [node.domain],
        aliases: uniqueSorted([routeKey, node.route.canonicalPath]),
        attributes: { ...(node.route.routeId ? { routeId: node.route.routeId } : {}), canonicalPath: node.route.canonicalPath },
        provenance: makeProvenance("curated", "authoritative", "workflow-map", workflowRevision, { sourcePath: workflowGraph.canonicalSource }),
      }, conflicts);
      addEdge(edges, {
        id: `curated:route:${node.id}:${routeId}`,
        source: node.id,
        target: routeId,
        type: "registers-route",
        label: `exposes ${node.route.canonicalPath}`,
        provenance: makeProvenance("curated", "authoritative", "workflow-map", workflowRevision, { sourcePath: workflowGraph.canonicalSource }),
      });
    }
  }
  for (const invariant of [...workflowGraph.invariants].sort((left, right) => compareLex(left.id, right.id))) {
    const referencedDomains = workflowGraph.nodes.filter((node) => node.invariantIds?.includes(invariant.id)).map((node) => node.domain);
    const invariantId = invariant.id;
    addNode(nodes, {
      id: invariantId,
      label: invariant.label,
      type: "invariant",
      ...(referencedDomains.length ? { domains: uniqueSorted(referencedDomains) as WorkflowDomain[] } : {}),
      aliases: [invariant.id],
      attributes: { description: invariant.description, sourceClassification: invariant.sourceClassification },
      provenance: makeProvenance("curated", "authoritative", "workflow-map", workflowRevision, { sourcePath: workflowGraph.canonicalSource }),
    }, conflicts);
    for (const reference of invariant.fileRefs) {
      const normalized = normalizePath(reference);
      if (!recordsByPath.has(normalized)) {
        addReferenceConflict(conflicts, invariantId, normalized, "file");
        continue;
      }
      addEdge(edges, {
        id: `curated:source-to-invariant:file:${normalized}:${invariant.id}`,
        source: fileNodeId(normalized),
        target: invariantId,
        type: "source-to-curated",
        label: `maps source file to ${invariant.label}`,
        provenance: makeProvenance("curated", "authoritative", "workflow-map", workflowRevision, { sourcePath: workflowGraph.canonicalSource }),
      });
    }
    for (const reference of invariant.testRefs || []) {
      const normalized = normalizePath(reference);
      if (!recordsByPath.has(normalized)) {
        addReferenceConflict(conflicts, invariantId, normalized, "test");
        continue;
      }
      addEdge(edges, {
        id: `curated:source-to-invariant:test:${normalized}:${invariant.id}`,
        source: testNodeId(normalized),
        target: invariantId,
        type: "source-to-curated",
        label: `maps test to ${invariant.label}`,
        provenance: makeProvenance("curated", "authoritative", "workflow-map", workflowRevision, { sourcePath: workflowGraph.canonicalSource }),
      });
    }
  }
  for (const edge of [...workflowGraph.edges].sort((left, right) => compareLex(left.id, right.id))) {
    if (!workflowNodesById.has(edge.source) || !workflowNodesById.has(edge.target)) continue;
    addEdge(edges, {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      type: mapWorkflowEdgeType(edge),
      label: edge.label,
      attributes: {
        kind: edge.kind,
        ...(edge.condition ? { condition: edge.condition } : {}),
        ...(edge.permissionKeys?.length ? { permissionKeys: [...edge.permissionKeys].sort(compareLex) } : {}),
        ...(edge.invariantIds?.length ? { invariantIds: [...edge.invariantIds].sort(compareLex) } : {}),
        ...(edge.testRefs?.length ? { testRefs: [...edge.testRefs].sort(compareLex) } : {}),
      },
      provenance: makeProvenance("curated", "authoritative", "workflow-map", workflowRevision, { sourcePath: workflowGraph.canonicalSource }),
    });
  }

  for (const record of [...index.files].sort((left, right) => compareLex(left.path, right.path))) {
    const normalizedPath = normalizePath(record.path);
    const sourceId = fileNodeId(normalizedPath);
    const sourceDomains = curatedDomainListByPath.get(normalizedPath) || [];
    const inferred = inferredDomainsForPath(normalizedPath);
    const disagreements = inferred.filter((domain) => sourceDomains.length > 0 && !sourceDomains.includes(domain));
    if (disagreements.length) {
      addConflict(
        conflicts,
        sourceId,
        `Source path heuristics suggest ${disagreements.join(", ")} while curated Workflow Map evidence assigns ${sourceDomains.join(", ")}. Curated evidence remains authoritative.`,
        disagreements.map((domain) => `path:${domain}`),
        sourceDomains.map((domain) => `workflow:${domain}`),
      );
    }
    for (const domain of inferred) {
      if (sourceDomains.includes(domain)) continue;
      addEdge(edges, {
        id: `inferred:domain:${normalizedPath}:${domain}`,
        source: sourceId,
        target: `domain:${domain}`,
        type: "belongs-to-domain",
        label: `likely belongs to ${domain}`,
        provenance: makeProvenance("inferred", "advisory", "ri-2-path-domain-heuristic", revision, { sourcePath: normalizedPath, ruleVersion: "ri-2.0.0", confidence: 0.55 }),
      });
    }
  }

  const fileHashes = [...index.files]
    .map((record) => ({ path: normalizePath(record.path), contentHash: record.contentHash }))
    .sort((left, right) => compareLex(left.path, right.path));
  return {
    schemaVersion: REPOSITORY_INTELLIGENCE_GRAPH_SCHEMA_VERSION,
    generatorVersion: REPOSITORY_INTELLIGENCE_GRAPH_GENERATOR_VERSION,
    freshness: {
      repositoryHeadSha: index.repositoryHeadSha,
      dirtyTrackedPaths: uniqueSorted(index.dirtyTrackedPaths.map(normalizePath)),
      indexSchemaVersion: index.schemaVersion,
      indexGeneratorVersion: index.generatorVersion,
      graphSchemaVersion: REPOSITORY_INTELLIGENCE_GRAPH_SCHEMA_VERSION,
      graphGeneratorVersion: REPOSITORY_INTELLIGENCE_GRAPH_GENERATOR_VERSION,
      workflowMapSchemaVersion: workflowGraph.schemaVersion,
      workflowMapVersion: workflowGraph.version,
      fileHashes,
    },
    nodes: [...nodes.values()].sort(compareNodes),
    edges: [...edges.values()].sort(compareEdges),
    conflicts: [...conflicts].sort((left, right) => compareLex(left.id, right.id)),
  };
}

export const buildUnifiedRepositoryGraph = buildRepositoryIntelligenceGraph;

function tokens(value: string): string[] {
  return uniqueSorted(value.toLocaleLowerCase().match(/[a-z0-9]+/g) || []);
}

function nodeMatchesQuery(node: RepositoryGraphNode, query: string): boolean {
  const haystack = [node.id, node.label, node.sourcePath || "", ...(node.aliases || [])].join(" ").toLocaleLowerCase();
  return tokens(query).every((token) => haystack.includes(token));
}

function nodeMatchesDomain(node: RepositoryGraphNode, domain: WorkflowDomain): boolean {
  return Boolean(node.domains?.includes(domain));
}

function sortTargetNodes(nodes: RepositoryGraphNode[]): RepositoryGraphNode[] {
  return [...nodes].sort(compareNodes);
}

export class RepositoryGraphQuery {
  readonly graph: RepositoryIntelligenceGraph;
  private readonly nodesById: ReadonlyMap<string, RepositoryGraphNode>;
  private readonly aliases: ReadonlyMap<string, readonly string[]>;
  private readonly outgoing: ReadonlyMap<string, readonly RepositoryGraphEdge[]>;
  private readonly incoming: ReadonlyMap<string, readonly RepositoryGraphEdge[]>;

  constructor(graph: RepositoryIntelligenceGraph) {
    this.graph = graph;
    this.nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
    const aliases = new Map<string, string[]>();
    for (const node of graph.nodes) {
      for (const alias of [node.id, ...(node.aliases || [])]) {
        const values = aliases.get(alias) || [];
        values.push(node.id);
        aliases.set(alias, values);
      }
    }
    this.aliases = new Map([...aliases.entries()].map(([key, value]) => [key, uniqueSorted(value)]));
    const outgoing = new Map<string, RepositoryGraphEdge[]>();
    const incoming = new Map<string, RepositoryGraphEdge[]>();
    for (const edge of graph.edges) {
      const out = outgoing.get(edge.source) || [];
      out.push(edge);
      outgoing.set(edge.source, out);
      const into = incoming.get(edge.target) || [];
      into.push(edge);
      incoming.set(edge.target, into);
    }
    for (const values of outgoing.values()) values.sort(compareEdges);
    for (const values of incoming.values()) values.sort(compareEdges);
    this.outgoing = outgoing;
    this.incoming = incoming;
  }

  getNode(idOrAlias: string): RepositoryGraphNode | undefined {
    const direct = this.nodesById.get(idOrAlias);
    if (direct) return direct;
    const ids = this.aliases.get(idOrAlias) || [];
    return ids.length === 1 ? this.nodesById.get(ids[0]) : undefined;
  }

  findNodes(query: RepositoryGraphNodeQuery = {}): RepositoryGraphNode[] {
    const result = this.graph.nodes.filter((node) => {
      if (query.id && node.id !== query.id && !(node.aliases || []).includes(query.id)) return false;
      if (query.path) {
        const normalizedPath = normalizePath(query.path);
        if (node.sourcePath !== normalizedPath && !(node.aliases || []).includes(normalizedPath)) return false;
        if (!["file", "module", "test", "migration", "database-object"].includes(node.type)) return false;
      }
      if (query.symbol && node.type !== "symbol") return false;
      if (query.symbol && !(node.label === query.symbol || node.id === query.symbol || (node.aliases || []).includes(query.symbol))) return false;
      if (query.domain && !nodeMatchesDomain(node, query.domain)) return false;
      if (query.provenance && node.provenance.kind !== query.provenance) return false;
      if (query.authority && node.provenance.authority !== query.authority) return false;
      if (query.query && !nodeMatchesQuery(node, query.query)) return false;
      return true;
    });
    return sortTargetNodes(result);
  }

  neighbors(idOrAlias: string, options: RepositoryGraphNeighborOptions = {}): RepositoryGraphNode[] {
    const node = this.getNode(idOrAlias);
    if (!node) return [];
    const direction = options.direction || "both";
    const maxHops = Math.max(1, Math.min(8, options.maxHops || 1));
    const found = new Map<string, number>([[node.id, 0]]);
    let frontier = [node.id];
    while (frontier.length) {
      const next: string[] = [];
      for (const current of frontier) {
        const distance = found.get(current) || 0;
        if (distance >= maxHops) continue;
        const edges = [
          ...(direction === "incoming" || direction === "both" ? this.incoming.get(current) || [] : []),
          ...(direction === "outgoing" || direction === "both" ? this.outgoing.get(current) || [] : []),
        ].sort(compareEdges);
        for (const edge of edges) {
          const neighborId = edge.source === current ? edge.target : edge.source;
          if (found.has(neighborId)) continue;
          const neighbor = this.nodesById.get(neighborId);
          if (!neighbor || (options.domain && !nodeMatchesDomain(neighbor, options.domain))) continue;
          found.set(neighborId, distance + 1);
          next.push(neighborId);
        }
      }
      frontier = next;
    }
    return sortTargetNodes([...found.entries()].filter(([id]) => id !== node.id).map(([id]) => this.nodesById.get(id)).filter((value): value is RepositoryGraphNode => Boolean(value)));
  }

  boundedPaths(fromIdOrAlias: string, toIdOrAlias: string, options: RepositoryGraphPathOptions = {}): RepositoryGraphPath[] {
    const from = this.getNode(fromIdOrAlias);
    const to = this.getNode(toIdOrAlias);
    if (!from || !to) return [];
    const maxHops = Math.max(1, Math.min(8, options.maxHops || 2));
    const maxPaths = Math.max(1, Math.min(64, options.maxPaths || 16));
    const paths: RepositoryGraphPath[] = [];
    const walk = (nodeId: string, nodeIds: string[], edgeIds: string[]) => {
      if (paths.length >= maxPaths || edgeIds.length > maxHops) return;
      if (nodeId === to.id) {
        paths.push({ nodes: [...nodeIds], edges: [...edgeIds], hops: edgeIds.length });
        return;
      }
      for (const edge of this.outgoing.get(nodeId) || []) {
        const next = this.nodesById.get(edge.target);
        if (!next || nodeIds.includes(next.id) || (options.domain && !nodeMatchesDomain(next, options.domain))) continue;
        walk(next.id, [...nodeIds, next.id], [...edgeIds, edge.id]);
      }
    };
    walk(from.id, [from.id], []);
    return paths.sort((left, right) => left.hops - right.hops || compareLex(left.nodes.join("\n"), right.nodes.join("\n")));
  }

  testsForSource(sourceIdOrPath: string): RepositoryGraphNode[] {
    const source = this.getNode(sourceIdOrPath) || this.findNodes({ path: sourceIdOrPath }).find((node) => node.type === "file");
    if (!source) return [];
    const testIds = (this.incoming.get(source.id) || []).filter((edge) => edge.type === "tests").map((edge) => edge.source);
    return sortTargetNodes(testIds.map((id) => this.nodesById.get(id)).filter((node): node is RepositoryGraphNode => Boolean(node)));
  }

  sourcesForTest(testIdOrPath: string): RepositoryGraphNode[] {
    const test = this.getNode(testIdOrPath) || this.findNodes({ path: testIdOrPath }).find((node) => node.type === "test");
    if (!test) return [];
    const sourceIds = (this.outgoing.get(test.id) || []).filter((edge) => edge.type === "tests").map((edge) => edge.target);
    return sortTargetNodes(sourceIds.map((id) => this.nodesById.get(id)).filter((node): node is RepositoryGraphNode => Boolean(node)));
  }

  sourceToCurated(sourceIdOrPath: string): RepositoryGraphNode[] {
    const source = this.getNode(sourceIdOrPath) || this.findNodes({ path: sourceIdOrPath }).find((node) => node.type === "file" || node.type === "test");
    if (!source) return [];
    const curated = (this.outgoing.get(source.id) || [])
      .filter((edge) => edge.type === "source-to-curated" && edge.provenance.kind === "curated")
      .map((edge) => this.nodesById.get(edge.target))
      .filter((node): node is RepositoryGraphNode => Boolean(node));
    return curated.sort((left, right) => nodeTypeRank(left.type) - nodeTypeRank(right.type) || compareLex(left.id, right.id));
  }

  byProvenance(kind: RepositoryGraphProvenanceKind): RepositoryGraphNode[] {
    return this.findNodes({ provenance: kind });
  }

  conflicts(options: { subjectId?: string; reason?: RepositoryGraphConflictReason } = {}): RepositoryGraphConflict[] {
    return this.graph.conflicts
      .filter((conflict) => (!options.subjectId || conflict.subjectId === options.subjectId) && (!options.reason || conflict.reason === options.reason))
      .sort((left, right) => compareLex(left.id, right.id));
  }

  domainIsolation(domain: WorkflowDomain): { readonly nodes: readonly RepositoryGraphNode[]; readonly edges: readonly RepositoryGraphEdge[] } {
    const nodes = this.findNodes({ domain });
    const ids = new Set(nodes.map((node) => node.id));
    return {
      nodes,
      edges: this.graph.edges.filter((edge) => ids.has(edge.source) && ids.has(edge.target)).sort(compareEdges),
    };
  }

  isFreshFor(expected: RepositoryGraphFreshnessExpectation): boolean {
    if (this.graph.freshness.repositoryHeadSha !== expected.repositoryHeadSha) return false;
    if (JSON.stringify(this.graph.freshness.dirtyTrackedPaths) !== JSON.stringify(uniqueSorted(expected.dirtyTrackedPaths.map(normalizePath)))) return false;
    if (expected.fileHashes) {
      const actual = this.graph.freshness.fileHashes;
      const wanted = [...expected.fileHashes].map((item) => ({ path: normalizePath(item.path), contentHash: item.contentHash })).sort((left, right) => compareLex(left.path, right.path));
      if (JSON.stringify(actual) !== JSON.stringify(wanted)) return false;
    }
    return true;
  }
}

export function queryRepositoryIntelligenceGraph(
  graph: RepositoryIntelligenceGraph,
): RepositoryGraphQuery {
  return new RepositoryGraphQuery(graph);
}

export type { FileIndexRecord };
