import { buildRepositoryIndex } from "./indexer.ts";
import {
  buildRepositoryIntelligenceGraph,
  RepositoryGraphQuery,
  type RepositoryGraphNode,
  type RepositoryIntelligenceGraph,
} from "./graph.ts";
import type { RepositoryIndex } from "./types.ts";
import {
  generateWorkflowContext,
  WorkflowContextSelectionError,
  type WorkflowContextPacket,
  type WorkflowContextSelectionInput,
} from "../workflow-map/context.ts";
import { WORKFLOW_DOMAIN_ORDER } from "../workflow-map/domain-registry.ts";
import type { RepositoryMetadata } from "../workflow-map/repositoryContext.ts";
import type { WorkflowDomain, WorkflowGraph } from "../workflow-map/types.ts";

export const REPOSITORY_INTELLIGENCE_CONTEXT_SCHEMA_VERSION = 1 as const;
export const DEFAULT_REPOSITORY_INTELLIGENCE_CONTEXT_BUDGET = 7_500;

export type RepositoryIntelligenceContextStatus = "fresh" | "stale-fallback" | "unavailable-fallback";
export type RepositoryIntelligenceImpact = "none/unlikely" | "possible" | "affected";

export interface RepositoryIntelligencePrimarySource {
  readonly path: string;
  readonly symbolIds: readonly string[];
  readonly score: number;
  readonly reasons: readonly string[];
}

export interface RepositoryIntelligenceContextPacket {
  readonly packetType: "hydroqualisense-repository-intelligence-context";
  readonly schemaVersion: typeof REPOSITORY_INTELLIGENCE_CONTEXT_SCHEMA_VERSION;
  readonly status: RepositoryIntelligenceContextStatus;
  readonly truncated?: boolean;
  readonly task?: string;
  readonly repository: {
    readonly headSha: string;
    readonly branch: string;
    readonly dirty: boolean;
    readonly changedFilePaths: readonly string[];
    readonly indexHeadSha?: string;
    readonly graphSchemaVersion?: number;
    readonly graphVersion?: string;
  };
  readonly resolvedDomains: readonly WorkflowDomain[];
  readonly resolvedWorkflows: readonly string[];
  readonly primarySource: readonly RepositoryIntelligencePrimarySource[];
  readonly supportingSource: readonly string[];
  readonly symbols: readonly string[];
  readonly executionPath: readonly string[];
  readonly boundaries: readonly string[];
  readonly tests: readonly string[];
  readonly invariants: readonly string[];
  readonly permissions: readonly string[];
  readonly confirmations: readonly string[];
  readonly databaseImpact: RepositoryIntelligenceImpact;
  readonly providerImpact: RepositoryIntelligenceImpact;
  readonly explicitlyExcludedDomains: readonly WorkflowDomain[];
  readonly conflicts: readonly string[];
  readonly provenanceNotes: readonly string[];
  readonly fallbackReason?: string;
}

export interface RepositoryIntelligenceContextOptions {
  readonly rootDir?: string;
  readonly index?: RepositoryIndex;
  readonly workflowGraph: WorkflowGraph;
  readonly repository: RepositoryMetadata;
  readonly selection: WorkflowContextSelectionInput;
  readonly task?: string;
}

export interface RepositoryIntelligenceContextResult {
  readonly packet: RepositoryIntelligenceContextPacket;
  readonly graph?: RepositoryIntelligenceGraph;
  readonly workflow?: WorkflowContextPacket;
}

function compactValues(values: readonly string[], limit: number): string[] {
  return values.slice(0, limit);
}

function compactText(value: string | undefined, limit = 240): string | undefined {
  if (!value) return value;
  return value.length <= limit ? value : `${value.slice(0, Math.max(0, limit - 1))}…`;
}

/**
 * Keeps RI metadata useful when it is embedded beside a Workflow Map packet.
 * The compatibility commands have one shared character budget, so a graph
 * packet must be compactable without dropping its status or revision truth.
 */
export function compactRepositoryIntelligenceContextPacket(
  packet: RepositoryIntelligenceContextPacket,
  characterBudget: number,
): RepositoryIntelligenceContextPacket {
  const budget = Math.max(256, characterBudget);
  const candidates: RepositoryIntelligenceContextPacket[] = [
    {
      ...packet,
      truncated: true,
      repository: { ...packet.repository, changedFilePaths: compactValues(packet.repository.changedFilePaths, 12) },
      primarySource: packet.primarySource.slice(0, 2).map((source) => ({ ...source, symbolIds: compactValues(source.symbolIds, 12), reasons: compactValues(source.reasons, 4) })),
      supportingSource: compactValues(packet.supportingSource, 8),
      symbols: compactValues(packet.symbols, 16),
      executionPath: compactValues(packet.executionPath, 6),
      boundaries: compactValues(packet.boundaries, 12),
      tests: compactValues(packet.tests, 12),
      invariants: compactValues(packet.invariants, 12),
      permissions: compactValues(packet.permissions, 12),
      confirmations: compactValues(packet.confirmations, 8),
      explicitlyExcludedDomains: compactValues(packet.explicitlyExcludedDomains, 12) as WorkflowDomain[],
      conflicts: compactValues(packet.conflicts, 6),
      provenanceNotes: compactValues(packet.provenanceNotes, 4),
      ...(packet.task ? { task: compactText(packet.task) } : {}),
      ...(packet.fallbackReason ? { fallbackReason: compactText(packet.fallbackReason) } : {}),
    },
    {
      ...packet,
      truncated: true,
      repository: { ...packet.repository, changedFilePaths: compactValues(packet.repository.changedFilePaths, 4) },
      primarySource: packet.primarySource.slice(0, 1).map((source) => ({ ...source, symbolIds: compactValues(source.symbolIds, 4), reasons: compactValues(source.reasons, 2) })),
      supportingSource: compactValues(packet.supportingSource, 2),
      symbols: compactValues(packet.symbols, 4),
      executionPath: compactValues(packet.executionPath, 2),
      boundaries: compactValues(packet.boundaries, 4),
      tests: compactValues(packet.tests, 4),
      invariants: compactValues(packet.invariants, 4),
      permissions: compactValues(packet.permissions, 4),
      confirmations: compactValues(packet.confirmations, 2),
      explicitlyExcludedDomains: compactValues(packet.explicitlyExcludedDomains, 8) as WorkflowDomain[],
      conflicts: compactValues(packet.conflicts, 2),
      provenanceNotes: compactValues(packet.provenanceNotes, 2),
      ...(packet.task ? { task: compactText(packet.task, 120) } : {}),
      ...(packet.fallbackReason ? { fallbackReason: compactText(packet.fallbackReason, 160) } : {}),
    },
    {
      packetType: packet.packetType,
      schemaVersion: packet.schemaVersion,
      status: packet.status,
      truncated: true,
      ...(packet.task ? { task: compactText(packet.task, 80) } : {}),
      repository: {
        headSha: packet.repository.headSha,
        branch: compactText(packet.repository.branch, 80) || "unknown",
        dirty: packet.repository.dirty,
        changedFilePaths: compactValues(packet.repository.changedFilePaths, 2),
        ...(packet.repository.indexHeadSha ? { indexHeadSha: packet.repository.indexHeadSha } : {}),
        ...(packet.repository.graphSchemaVersion !== undefined ? { graphSchemaVersion: packet.repository.graphSchemaVersion } : {}),
        ...(packet.repository.graphVersion ? { graphVersion: packet.repository.graphVersion } : {}),
      },
      resolvedDomains: compactValues(packet.resolvedDomains, 8) as WorkflowDomain[],
      resolvedWorkflows: compactValues(packet.resolvedWorkflows, 4),
      primarySource: packet.primarySource.slice(0, 1).map((source) => ({ path: source.path, symbolIds: [], score: source.score, reasons: compactValues(source.reasons, 1) })),
      supportingSource: [],
      symbols: [],
      executionPath: [],
      boundaries: [],
      tests: [],
      invariants: compactValues(packet.invariants, 2),
      permissions: compactValues(packet.permissions, 2),
      confirmations: compactValues(packet.confirmations, 1),
      databaseImpact: packet.databaseImpact,
      providerImpact: packet.providerImpact,
      explicitlyExcludedDomains: compactValues(packet.explicitlyExcludedDomains, 8) as WorkflowDomain[],
      conflicts: compactValues(packet.conflicts, 1),
      provenanceNotes: compactValues(packet.provenanceNotes, 1),
      ...(packet.fallbackReason ? { fallbackReason: compactText(packet.fallbackReason, 160) } : {}),
    },
  ];
  for (const candidate of candidates) if (JSON.stringify(candidate).length <= budget) return candidate;
  return candidates[candidates.length - 1]!;
}

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

function fitToBudget(value: string, budget: number): string {
  if (value.length <= budget) return value;
  const marker = "\n... [repository intelligence context truncated to budget]\n";
  const available = Math.max(0, budget - marker.length);
  const candidate = value.slice(0, available);
  const boundary = candidate.lastIndexOf("\n");
  const body = boundary > Math.floor(available * 0.75) ? candidate.slice(0, boundary) : candidate;
  return `${body}${marker}`.slice(0, budget);
}

function workflowPacketFor(
  graph: WorkflowGraph,
  selection: WorkflowContextSelectionInput,
  repository: RepositoryMetadata,
): WorkflowContextPacket | undefined {
  try {
    return generateWorkflowContext(graph, selection, repository).packet;
  } catch (error) {
    if (error instanceof WorkflowContextSelectionError && ["unknown-selector", "broad-selector"].includes(error.code)) return undefined;
    throw error;
  }
}

function sourcePathForNode(node: RepositoryGraphNode): string | undefined {
  if (node.type === "file" || node.type === "module" || node.type === "test" || node.type === "migration" || node.type === "database-object") return node.sourcePath;
  return undefined;
}

function addCandidate(
  candidates: Map<string, { score: number; reasons: Set<string> }>,
  sourcePath: string | undefined,
  score: number,
  reason: string,
): void {
  if (!sourcePath) return;
  const normalized = normalizePath(sourcePath);
  const existing = candidates.get(normalized) || { score: 0, reasons: new Set<string>() };
  existing.score = Math.max(existing.score, score);
  existing.reasons.add(reason);
  candidates.set(normalized, existing);
}

function sourceNodesForCuratedNode(graph: RepositoryIntelligenceGraph, nodeId: string): RepositoryGraphNode[] {
  const sourceIds = graph.edges
    .filter((edge) => edge.target === nodeId && edge.type === "source-to-curated")
    .map((edge) => edge.source);
  const byId = new Map(graph.nodes.map((node) => [node.id, node]));
  return sourceIds
    .map((id) => byId.get(id))
    .filter((node): node is RepositoryGraphNode => Boolean(node) && ["file", "module", "migration", "database-object"].includes(node.type));
}

function nodeAttributeStrings(node: RepositoryGraphNode, key: string): string[] {
  const value = node.attributes?.[key];
  return Array.isArray(value) ? value.map(String) : typeof value === "string" ? [value] : [];
}

function selectedBoundaryNodes(graph: RepositoryIntelligenceGraph, selectedPaths: readonly string[]): RepositoryGraphNode[] {
  const pathSet = new Set(selectedPaths);
  return graph.nodes.filter((node) => {
    if (!["api-endpoint", "server-handler", "provider-boundary", "migration", "database-object", "external-boundary"].includes(node.type)) return false;
    return !node.sourcePath || pathSet.has(node.sourcePath);
  });
}

function impactFor(
  graph: RepositoryIntelligenceGraph,
  selectedPaths: readonly string[],
  kind: "database" | "provider",
): RepositoryIntelligenceImpact {
  const paths = selectedPaths.map((value) => value.toLocaleLowerCase());
  if (kind === "database" && paths.some((value) => value.startsWith("supabase/") || value.includes("migration") || value.includes("database"))) return "affected";
  if (kind === "provider" && paths.some((value) => value.includes("provider") || value.includes("messaging") || value.includes("email") || value.includes("sms"))) return "affected";
  const types = selectedBoundaryNodes(graph, selectedPaths).map((node) => node.type);
  if (kind === "database" && types.some((type) => type === "migration" || type === "database-object")) return "affected";
  if (kind === "provider" && types.includes("provider-boundary")) return "affected";
  const hasPossibleEdge = graph.edges.some((edge) => selectedPaths.some((path) => edge.provenance.sourcePath === path) && ["defines-db-object", "handles-endpoint", "external"].includes(edge.type));
  return hasPossibleEdge ? "possible" : "none/unlikely";
}

function emptyPacket(
  options: RepositoryIntelligenceContextOptions,
  status: RepositoryIntelligenceContextStatus,
  fallbackReason: string,
  notes: readonly string[],
): RepositoryIntelligenceContextPacket {
  return {
    packetType: "hydroqualisense-repository-intelligence-context",
    schemaVersion: REPOSITORY_INTELLIGENCE_CONTEXT_SCHEMA_VERSION,
    status,
    ...(options.task ? { task: options.task } : {}),
    repository: {
      headSha: options.repository.headSha,
      branch: options.repository.branch,
      dirty: options.repository.dirty,
      changedFilePaths: uniqueSorted(options.repository.changedFilePaths.map(normalizePath)),
    },
    resolvedDomains: options.selection.domain ? [options.selection.domain] : [],
    resolvedWorkflows: [],
    primarySource: [],
    supportingSource: [],
    symbols: [],
    executionPath: [],
    boundaries: [],
    tests: [],
    invariants: [],
    permissions: [],
    confirmations: [],
    databaseImpact: "none/unlikely",
    providerImpact: "none/unlikely",
    explicitlyExcludedDomains: WORKFLOW_DOMAIN_ORDER.filter((domain) => domain !== options.selection.domain),
    conflicts: [],
    provenanceNotes: [...notes, "Workflow Map remains the bounded fallback when Repository Intelligence cannot prove exact current context."],
    fallbackReason,
  };
}

export function buildRepositoryIntelligenceContext(
  options: RepositoryIntelligenceContextOptions,
): RepositoryIntelligenceContextResult {
  const workflow = workflowPacketFor(options.workflowGraph, options.selection, options.repository);
  let index = options.index;
  if (!index) {
    if (!options.rootDir) {
      return { packet: emptyPacket(options, "unavailable-fallback", "No repository root was supplied to refresh the RI-1 index.", ["Repository Intelligence index unavailable."]) };
    }
    try {
      index = buildRepositoryIndex({ rootDir: options.rootDir, mode: "incremental" }).index;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { packet: emptyPacket(options, "unavailable-fallback", `Index refresh failed: ${message}`, ["Repository Intelligence index refresh failed."]) };
    }
  }

  const graph = buildRepositoryIntelligenceGraph({ index, workflowGraph: options.workflowGraph });
  const query = new RepositoryGraphQuery(graph);
  const expectedDirty = uniqueSorted(options.repository.changedFilePaths.map(normalizePath));
  if (!query.isFreshFor({ repositoryHeadSha: options.repository.headSha, dirtyTrackedPaths: expectedDirty })) {
    const staleReasons: string[] = [];
    if (graph.freshness.repositoryHeadSha !== options.repository.headSha) {
      staleReasons.push(`revision ${graph.freshness.repositoryHeadSha} does not match current repository revision ${options.repository.headSha}`);
    }
    if (JSON.stringify(graph.freshness.dirtyTrackedPaths) !== JSON.stringify(expectedDirty)) {
      staleReasons.push(`dirty paths ${graph.freshness.dirtyTrackedPaths.join(", ") || "none"} do not match current paths ${expectedDirty.join(", ") || "none"}`);
    }
    return {
      graph,
      ...(workflow ? { workflow } : {}),
      packet: emptyPacket(
        options,
        "stale-fallback",
        `Repository Intelligence is stale: ${staleReasons.join("; ") || "freshness metadata differs"}.`,
        ["Stale graph data was not presented as exact current context.", "Workflow Map + Git diff/test impact remains the active fallback."],
      ),
    };
  }

  const workflowSeedIds = workflow?.selection.seedNodeIds || [];
  const candidates = new Map<string, { score: number; reasons: Set<string> }>();
  const requestedPaths = uniqueSorted([
    ...(options.selection.filePaths || []),
    ...(options.selection.filePath ? [options.selection.filePath] : []),
  ].map(normalizePath));
  for (const filePath of requestedPaths) addCandidate(candidates, filePath, 1_400, "exact file selector");
  for (const filePath of options.selection.changedFilePaths || []) addCandidate(candidates, filePath, 800, "explicit changed path");
  for (const filePath of options.repository.changedFilePaths) addCandidate(candidates, filePath, 700, "current changed path");
  for (const filePath of workflow?.inspectFiles || []) addCandidate(candidates, filePath, 1_100, "curated Workflow Map source");
  for (const seedId of workflowSeedIds) {
    for (const node of sourceNodesForCuratedNode(graph, seedId)) addCandidate(candidates, sourcePathForNode(node), 1_050, "source mapped to curated workflow");
  }

  const queryText = options.selection.query || options.task;
  if (queryText) {
    for (const node of query.findNodes({ query: queryText, ...(options.selection.domain ? { domain: options.selection.domain } : {}) })) {
      const directPath = sourcePathForNode(node);
      const degreePenalty = Math.min(200, graph.edges.filter((edge) => edge.source === node.id || edge.target === node.id).length * 2);
      const queryScore = Math.max(100, (node.provenance.kind === "curated" ? 950 : 850) - degreePenalty);
      if (directPath) addCandidate(candidates, directPath, queryScore, node.provenance.kind === "curated" ? "curated query match" : "source query match");
      if (node.provenance.kind === "curated") {
        for (const mapped of sourceNodesForCuratedNode(graph, node.id)) addCandidate(candidates, sourcePathForNode(mapped), queryScore, "curated source mapping");
      }
    }
  }

  const rankedCandidates = [...candidates.entries()]
    .sort((left, right) => right[1].score - left[1].score || compareLex(left[0], right[0]))
    .slice(0, 8);
  const primarySource = rankedCandidates.map(([filePath, details]) => {
    const symbols = graph.nodes.filter((node) => node.type === "symbol" && node.sourcePath === filePath).map((node) => node.id).sort(compareLex);
    return { path: filePath, symbolIds: symbols, score: details.score, reasons: [...details.reasons].sort(compareLex) };
  });
  const primaryPaths = primarySource.map((source) => source.path);
  const byId = new Map(graph.nodes.map((node) => [node.id, node]));
  const supporting = new Set<string>();
  for (const filePath of primaryPaths) {
    for (const edge of graph.edges.filter((candidate) => candidate.source === `file:${filePath}` && candidate.type === "imports")) {
      const target = byId.get(edge.target);
      if (target?.sourcePath && target.sourcePath !== filePath) supporting.add(target.sourcePath);
    }
  }
  const supportingSource = [...supporting].sort(compareLex).slice(0, 12);
  const symbols = uniqueSorted(primarySource.flatMap((source) => source.symbolIds));
  const tests = uniqueSorted([
    ...(workflow?.relevantTests || []),
    ...primaryPaths.flatMap((filePath) => query.testsForSource(filePath).map((node) => node.sourcePath || node.label)),
  ]);
  const curatedNodes = primaryPaths.flatMap((filePath) => query.sourceToCurated(filePath));
  const workflowNodes = [...new Map([
    ...workflowSeedIds.map((id) => [id, byId.get(id)] as const),
    ...curatedNodes.filter((node) => node.type === "workflow" || node.type === "guard").map((node) => [node.id, node] as const),
  ]).values()].filter((node): node is RepositoryGraphNode => Boolean(node));
  const resolvedDomains = uniqueSorted([
    ...(options.selection.domain ? [options.selection.domain] : []),
    ...(workflow?.workflow.nodes.map((node) => node.domain) || []),
    ...primaryPaths.flatMap((filePath) => byId.get(`file:${filePath}`)?.domains || []),
  ]) as WorkflowDomain[];
  const invariants = uniqueSorted([
    ...(workflow?.protectedBoundaries.invariants.map((item) => item.invariantId) || []),
    ...curatedNodes.filter((node) => node.type === "invariant").map((node) => node.id),
    ...workflowNodes.flatMap((node) => nodeAttributeStrings(node, "invariantIds")),
  ]);
  const permissions = uniqueSorted([
    ...(workflow?.protectedBoundaries.permissions || []),
    ...curatedNodes.filter((node) => node.type === "permission").map((node) => node.label),
    ...workflowNodes.flatMap((node) => nodeAttributeStrings(node, "permissionKeys")),
  ]);
  const confirmations = uniqueSorted([
    ...(workflow?.protectedBoundaries.confirmations.map((item) => item.label) || []),
    ...workflowNodes.flatMap((node) => nodeAttributeStrings(node, "confirmationRequirement")),
  ]);
  const requestedHops = Math.min(2, Math.max(1, options.selection.hops ?? 1));
  const executionPath: string[] = [];
  for (const filePath of primaryPaths) {
    for (const workflowId of workflowSeedIds) {
      for (const candidate of query.boundedPaths(`file:${filePath}`, workflowId, { maxHops: requestedHops, maxPaths: 2 })) {
        const labels = candidate.nodes.map((nodeId) => byId.get(nodeId)?.label || nodeId);
        executionPath.push(labels.join(" -> "));
      }
    }
  }
  const boundaries = uniqueSorted([
    ...(workflow?.protectedBoundaries.guards.map((guard) => guard.label) || []),
    ...workflowNodes.filter((node) => ["guard", "external-boundary", "provider-boundary", "api-endpoint", "server-handler"].includes(node.type)).map((node) => node.label),
    ...selectedBoundaryNodes(graph, [...primaryPaths, ...supportingSource]).map((node) => node.label),
  ]);
  const selectedConflicts = graph.conflicts
    .filter((conflict) => !primaryPaths.length || primaryPaths.some((filePath) => conflict.subjectId === `file:${filePath}` || conflict.subjectId === filePath))
    .map((conflict) => conflict.message)
    .sort(compareLex)
    .slice(0, 12);
  const excluded = WORKFLOW_DOMAIN_ORDER.filter((domain) => !resolvedDomains.includes(domain));
  const notes = [
    `Graph revision ${graph.freshness.repositoryHeadSha}; index ${graph.freshness.indexGeneratorVersion}; graph ${graph.freshness.graphGeneratorVersion}.`,
    `Dirty tracked paths: ${graph.freshness.dirtyTrackedPaths.length ? graph.freshness.dirtyTrackedPaths.join(", ") : "none"}.`,
    "curated Workflow Map financial, security, permission, history, and source-of-truth facts outrank inferred relationships.",
    "Repository Intelligence contains metadata and extracted structure only; it does not expose source contents, credentials, or customer documents.",
  ];
  if (selectedConflicts.length) notes.push("Graph conflicts are surfaced below; inference has not overridden curated evidence.");
  return {
    graph,
    ...(workflow ? { workflow } : {}),
    packet: {
      packetType: "hydroqualisense-repository-intelligence-context",
      schemaVersion: REPOSITORY_INTELLIGENCE_CONTEXT_SCHEMA_VERSION,
      status: "fresh",
      ...(options.task ? { task: options.task } : {}),
      repository: {
        headSha: options.repository.headSha,
        branch: options.repository.branch,
        dirty: options.repository.dirty,
        changedFilePaths: uniqueSorted(options.repository.changedFilePaths.map(normalizePath)),
        indexHeadSha: graph.freshness.repositoryHeadSha,
        graphSchemaVersion: graph.schemaVersion,
        graphVersion: graph.generatorVersion,
      },
      resolvedDomains,
      resolvedWorkflows: uniqueSorted(workflowSeedIds),
      primarySource,
      supportingSource,
      symbols,
      executionPath: uniqueSorted(executionPath),
      boundaries,
      tests,
      invariants,
      permissions,
      confirmations,
      databaseImpact: impactFor(graph, [...primaryPaths, ...supportingSource], "database"),
      providerImpact: impactFor(graph, [...primaryPaths, ...supportingSource], "provider"),
      explicitlyExcludedDomains: excluded,
      conflicts: selectedConflicts,
      provenanceNotes: notes,
    },
  };
}

function list(values: readonly string[]): string[] {
  return values.length ? values.map((value) => `- \`${value.replaceAll("`", "'")}\``) : ["- none"];
}

export function formatRepositoryIntelligenceContextMarkdown(
  packet: RepositoryIntelligenceContextPacket,
  characterBudget = DEFAULT_REPOSITORY_INTELLIGENCE_CONTEXT_BUDGET,
): string {
  const lines: string[] = [
    "## Repository Intelligence",
    "",
    `- status: **${packet.status}**${packet.truncated ? " (truncated)" : ""}`,
    ...(packet.task ? [`- task: ${packet.task}`] : []),
    `- revision: \`${packet.repository.headSha}\`; branch: \`${packet.repository.branch}\`; worktree: ${packet.repository.dirty ? "dirty" : "clean"}`,
    ...(packet.repository.indexHeadSha ? [`- graph: schema \`${packet.repository.graphSchemaVersion}\`; version \`${packet.repository.graphVersion}\`; index revision \`${packet.repository.indexHeadSha}\``] : []),
    `- resolved domains: ${packet.resolvedDomains.join(", ") || "none"}`,
    `- workflows: ${packet.resolvedWorkflows.join(", ") || "none"}`,
    "",
    "### Primary source",
    "",
  ];
  if (packet.primarySource.length) {
    for (const source of packet.primarySource) {
      lines.push(`- **${source.path}** (score ${source.score}; ${source.reasons.join(", ")})`);
      if (source.symbolIds.length) lines.push(`  - symbols: ${source.symbolIds.map((symbol) => `\`${symbol}\``).join(", ")}`);
    }
  } else lines.push("- none");
  lines.push("", "### Supporting source", "", ...list(packet.supportingSource));
  lines.push("", "### Symbols", "", ...list(packet.symbols));
  lines.push("", "### Execution path and boundaries", "", ...list(packet.executionPath), ...list(packet.boundaries));
  lines.push("", "### Tests", "", ...list(packet.tests));
  lines.push("", "### Invariants, permissions, and confirmation", "", `- invariants: ${packet.invariants.join(", ") || "none"}`, `- permissions: ${packet.permissions.join(", ") || "none"}`, `- confirmations: ${packet.confirmations.join(", ") || "none"}`);
  lines.push("", "### Validation implications", "", `- database/RLS/migrations: **${packet.databaseImpact}**`, `- provider boundary: **${packet.providerImpact}**`);
  lines.push("", "### Explicitly excluded domains", "", `- ${packet.explicitlyExcludedDomains.join(", ") || "none"}`);
  if (packet.conflicts.length) lines.push("", "### Conflicts", "", ...packet.conflicts.map((conflict) => `- ${conflict}`));
  lines.push("", "### Provenance and staleness", "", ...packet.provenanceNotes.map((note) => `- ${note}`));
  if (packet.fallbackReason) lines.push(`- fallback: ${packet.fallbackReason}`);
  return fitToBudget(`${lines.join("\n")}\n`, characterBudget);
}
