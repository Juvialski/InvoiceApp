import type {
  WorkflowConfirmationRequirement,
  WorkflowDomain,
  WorkflowEdge,
  WorkflowGraph,
  WorkflowInvariant,
  WorkflowNode,
  WorkflowRouteReference,
} from "./types.ts";
import type { RepositoryMetadata } from "./repositoryContext.ts";

export const WORKFLOW_MAP_CONTEXT_SCHEMA_VERSION = 1 as const;
export const DEFAULT_CONTEXT_CHARACTER_BUDGET = 10_000;
export const MAX_CONTEXT_CHARACTER_BUDGET = 20_000;
export const MIN_CONTEXT_CHARACTER_BUDGET = 1_024;
export const DEFAULT_CONTEXT_HOPS = 1 as const;
export const MAX_CONTEXT_HOPS = 2 as const;
export const MAX_CONTEXT_SEED_NODES = 2;
export const MAX_CONTEXT_NEIGHBOR_NODES = 80;
export const MAX_CONTEXT_NEIGHBOR_EDGES = 140;

const REQUIRED_VERIFICATION = [
  "Inspect the current source implementation referenced by this packet.",
  "Inspect current GitHub/CI state before relying on this orientation.",
  "Treat this packet as advisory context, not authoritative implementation truth.",
] as const;

const SUPPORTED_DOMAINS = new Set<WorkflowDomain>([
  "platform-tenancy",
  "dashboard",
  "projects",
  "engineering",
  "finance",
  "workforce",
  "reporting",
  "assistant",
]);

const EDGE_KIND_PRIORITY: Record<WorkflowEdge["kind"], number> = {
  guard: 120,
  permission: 118,
  confirmation: 116,
  history: 112,
  separation: 110,
  "state-transition": 106,
  mutation: 100,
  "external-boundary": 98,
  navigation: 82,
  "read-flow": 76,
  context: 68,
  "derived-data": 64,
};

const NODE_TYPE_PRIORITY: Record<WorkflowNode["type"], number> = {
  guard: 120,
  "external-boundary": 108,
  action: 102,
  state: 98,
  workflow: 94,
  route: 90,
  screen: 84,
  data: 80,
  "derived-data": 76,
};

const CONTEXT_MATCH_REASONS = ["node", "domain", "route", "file", "query", "changed-file"] as const;
export type ContextMatchReason = typeof CONTEXT_MATCH_REASONS[number];

const QUERY_STOP_WORDS = new Set(["a", "an", "and", "by", "for", "from", "in", "is", "of", "on", "or", "the", "to", "with"]);

export interface WorkflowContextSelectionInput {
  readonly nodeId?: string;
  readonly domain?: WorkflowDomain;
  /** Route ID, canonical path, or path pattern. */
  readonly route?: string;
  readonly filePath?: string;
  readonly filePaths?: readonly string[];
  readonly query?: string;
  readonly changedFilePaths?: readonly string[];
  /** Select from repository-changed paths when true. */
  readonly useChangedFiles?: boolean;
  readonly hops?: number;
  readonly maxHops?: number;
  readonly characterBudget?: number;
}

export interface WorkflowContextRequestedScope {
  readonly nodeId?: string;
  readonly domain?: WorkflowDomain;
  readonly route?: string;
  readonly filePaths: readonly string[];
  readonly query?: string;
  readonly useChangedFiles: boolean;
  readonly changedFilePaths: readonly string[];
  readonly hops: number;
  readonly characterBudget: number;
}

export interface WorkflowContextSeedMatch {
  readonly nodeId: string;
  readonly score: number;
  readonly reasons: readonly ContextMatchReason[];
  readonly matchedTerms: readonly string[];
  readonly matchedInvariantIds: readonly string[];
}

export interface WorkflowContextSelection {
  readonly seedNodeIds: readonly string[];
  readonly seedMatches: readonly WorkflowContextSeedMatch[];
  readonly candidateNodeCount: number;
  readonly omittedCandidateNodeCount: number;
  readonly queryMatchMode: "all-terms" | "any-term" | "none";
  readonly matchedInvariantIds: readonly string[];
}

interface InternalWorkflowContextSelection extends WorkflowContextSelection {
  readonly requested: WorkflowContextRequestedScope;
}

export interface WorkflowContextNodeSummary {
  readonly nodeId: string;
  readonly label: string;
  readonly domain: WorkflowDomain;
  readonly type: WorkflowNode["type"];
  readonly sourceClassification: WorkflowNode["sourceClassification"];
  readonly distance: number;
  readonly seed: boolean;
  readonly description?: string;
  readonly scope?: WorkflowNode["scope"];
  readonly route?: WorkflowRouteReference;
  readonly statusValues?: readonly string[];
  readonly permissionKeys?: readonly string[];
  readonly confirmationRequirement?: WorkflowConfirmationRequirement;
  readonly invariantIds?: readonly string[];
  readonly tags?: readonly string[];
}

export interface WorkflowContextEdgeSummary {
  readonly edgeId: string;
  readonly source: string;
  readonly target: string;
  readonly type: WorkflowEdge["type"];
  readonly kind: WorkflowEdge["kind"];
  readonly label: string;
  readonly condition?: string;
  readonly permissionKeys?: readonly string[];
  readonly confirmationRequirement?: WorkflowConfirmationRequirement;
  readonly invariantIds?: readonly string[];
}

export interface WorkflowContextInvariantSummary {
  readonly invariantId: string;
  readonly label: string;
  readonly sourceClassification: WorkflowInvariant["sourceClassification"];
  readonly description?: string;
  readonly sourceFiles: readonly string[];
  readonly tests: readonly string[];
}

export interface WorkflowContextGuardSummary {
  readonly guardId: string;
  readonly source: "node" | "edge";
  readonly sourceId: string;
  readonly fromNodeId?: string;
  readonly toNodeId?: string;
  readonly label: string;
  readonly kind: string;
  readonly permissionKeys: readonly string[];
  readonly confirmationRequirement?: WorkflowConfirmationRequirement;
  readonly invariantIds: readonly string[];
}

export interface WorkflowContextConfirmationSummary {
  readonly sourceId: string;
  readonly source: "node" | "edge";
  readonly label: string;
  readonly requirement: "human";
}

export type ChangedFileMatchKind = "node-file" | "node-test" | "invariant-file" | "invariant-test";

export interface WorkflowContextChangedFileMatch {
  readonly path: string;
  readonly nodeIds: readonly string[];
  readonly invariantIds: readonly string[];
  readonly matchKinds: readonly ChangedFileMatchKind[];
}

export interface WorkflowContextChangedFileMapping {
  readonly matched: readonly WorkflowContextChangedFileMatch[];
  readonly unmatched: readonly string[];
}

export interface WorkflowContextTruncation {
  readonly truncated: boolean;
  readonly characterBudget: number;
  readonly detailLevel: "full" | "compact" | "minimal";
  readonly omitted: {
    readonly candidateSeeds: number;
    readonly nodes: number;
    readonly edges: number;
    readonly invariants: number;
    readonly routes: number;
    readonly inspectFiles: number;
    readonly relevantTests: number;
    readonly qaScenarioIds: number;
    readonly changedFiles: number;
  };
}

export interface WorkflowContextPacket {
  readonly packetType: "engoryx-agent-context";
  readonly schemaVersion: typeof WORKFLOW_MAP_CONTEXT_SCHEMA_VERSION;
  readonly repository: {
    readonly headSha: string;
    readonly branch: string;
    readonly dirty: boolean;
    readonly changedFilePaths: readonly string[];
    readonly graphSchemaVersion: number;
    readonly graphVersion: string;
  };
  readonly requestedScope: WorkflowContextRequestedScope;
  readonly selection: WorkflowContextSelection;
  readonly workflow: {
    readonly hops: number;
    readonly nodes: readonly WorkflowContextNodeSummary[];
    readonly edges: readonly WorkflowContextEdgeSummary[];
    readonly lifecycleTransitions: readonly WorkflowContextEdgeSummary[];
  };
  readonly protectedBoundaries: {
    readonly invariants: readonly WorkflowContextInvariantSummary[];
    readonly guards: readonly WorkflowContextGuardSummary[];
    readonly permissions: readonly string[];
    readonly confirmations: readonly WorkflowContextConfirmationSummary[];
  };
  readonly routes: readonly WorkflowContextRouteSummary[];
  readonly inspectFiles: readonly string[];
  readonly relevantTests: readonly string[];
  readonly qaScenarioIds: readonly string[];
  readonly changedFileMapping: WorkflowContextChangedFileMapping;
  readonly requiredVerification: readonly string[];
  readonly truncation: WorkflowContextTruncation;
}

export interface WorkflowContextRouteSummary {
  readonly nodeId: string;
  readonly label: string;
  readonly domain: WorkflowDomain;
  readonly route: WorkflowRouteReference;
}

export interface WorkflowContextResult {
  readonly packet: WorkflowContextPacket;
  readonly markdown: string;
  readonly json: string;
  readonly markdownCharacters: number;
  readonly jsonCharacters: number;
  readonly characterCount: number;
}

export class WorkflowContextSelectionError extends Error {
  readonly code: "invalid-selector" | "unknown-selector" | "broad-selector" | "budget";

  constructor(code: WorkflowContextSelectionError["code"], message: string) {
    super(message);
    this.name = "WorkflowContextSelectionError";
    this.code = code;
  }
}

interface SearchField {
  readonly text: string;
  readonly weight: number;
  readonly invariantId?: string;
}

interface InternalSeedMatch extends WorkflowContextSeedMatch {
  readonly changedPathMatches: readonly string[];
}

interface Neighborhood {
  readonly nodeIds: readonly string[];
  readonly candidateNodeIds: readonly string[];
  readonly edgeIds: readonly string[];
  readonly candidateEdgeIds: readonly string[];
  readonly distanceByNodeId: ReadonlyMap<string, number>;
}

interface RankedReference {
  readonly value: string;
  readonly score: number;
}

interface FullContextCandidates {
  readonly graphNodes: ReadonlyMap<string, WorkflowNode>;
  readonly graphEdges: ReadonlyMap<string, WorkflowEdge>;
  readonly graphInvariants: ReadonlyMap<string, WorkflowInvariant>;
  readonly seedNodeIds: readonly string[];
  readonly candidateSeedCount: number;
  readonly neighborhoodNodeIds: readonly string[];
  readonly candidateNodeIds: readonly string[];
  readonly edgeIds: readonly string[];
  readonly candidateEdgeIds: readonly string[];
  readonly invariantIds: readonly string[];
  readonly requiredInvariantIds: ReadonlySet<string>;
  readonly requiredNodeIds: ReadonlySet<string>;
  readonly requiredEdgeIds: ReadonlySet<string>;
  readonly files: readonly string[];
  readonly tests: readonly string[];
  readonly qaScenarioIds: readonly string[];
  readonly repositoryChangedFilePaths: readonly string[];
  readonly changedFilePaths: readonly string[];
  readonly changedFileMapping: WorkflowContextChangedFileMapping;
  readonly distanceByNodeId: ReadonlyMap<string, number>;
}

interface ContextBuildState {
  readonly nodeIds: Set<string>;
  readonly edgeIds: Set<string>;
  readonly invariantIds: Set<string>;
  readonly files: string[];
  readonly tests: string[];
  readonly qaScenarioIds: string[];
  readonly changedFilePaths: string[];
  detailLevel: 0 | 1 | 2;
}

const UNKNOWN_REPOSITORY: RepositoryMetadata = {
  headSha: "unknown",
  branch: "unknown",
  dirty: false,
  changedFilePaths: [],
};

function compareLex(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values.filter((value) => value.trim()))].sort(compareLex);
}

function uniqueInOrder(values: readonly string[]): string[] {
  return [...new Set(values.filter((value) => value.trim()))];
}

function normalizeText(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function normalizeRepositoryPath(value: string): string {
  let normalized = value.trim().replaceAll("\\", "/");
  if (normalized.startsWith("./")) normalized = normalized.slice(2);
  return normalized;
}

function pathMatches(selector: string, reference: string): boolean {
  const normalizedSelector = normalizeRepositoryPath(selector).toLocaleLowerCase();
  const normalizedReference = normalizeRepositoryPath(reference).toLocaleLowerCase();
  if (!normalizedSelector || !normalizedReference) return false;
  return normalizedSelector === normalizedReference
    || normalizedReference.endsWith(`/${normalizedSelector}`)
    || normalizedSelector.endsWith(`/${normalizedReference}`);
}

function tokenize(value: string): string[] {
  return uniqueInOrder((value.toLocaleLowerCase().match(/[a-z0-9]+/g) || []).filter((token) => token.length >= 2 && !QUERY_STOP_WORDS.has(token)));
}

function textIncludes(text: string, token: string): boolean {
  return tokenize(text).some((fieldToken) => fieldToken === token || fieldToken.startsWith(token));
}

function graphInvariantMap(graph: WorkflowGraph): Map<string, WorkflowInvariant> {
  return new Map(graph.invariants.map((item) => [item.id, item]));
}

function nodeSearchFields(
  node: WorkflowNode,
  invariants: ReadonlyMap<string, WorkflowInvariant>,
  includeInvariantFields = true,
): SearchField[] {
  const fields: SearchField[] = [
    { text: node.id.toLocaleLowerCase(), weight: 18 },
    { text: node.label.toLocaleLowerCase(), weight: 14 },
    { text: node.domain.toLocaleLowerCase(), weight: 6 },
    { text: node.description.toLocaleLowerCase(), weight: 3 },
    ...((node.tags || []).map((value) => ({ text: value.toLocaleLowerCase(), weight: 10 }))),
    ...((node.statusValues || []).map((value) => ({ text: value.toLocaleLowerCase(), weight: 8 }))),
    ...((node.permissionKeys || []).map((value) => ({ text: value.toLocaleLowerCase(), weight: 8 }))),
    ...((node.fileRefs || []).map((value) => ({ text: value.toLocaleLowerCase(), weight: 4 }))),
    ...((node.testRefs || []).map((value) => ({ text: value.toLocaleLowerCase(), weight: 3 }))),
  ];
  if (node.route) {
    fields.push(
      { text: (node.route.routeId || "").toLocaleLowerCase(), weight: 16 },
      { text: node.route.canonicalPath.toLocaleLowerCase(), weight: 16 },
      { text: (node.route.pathPattern || "").toLocaleLowerCase(), weight: 15 },
      ...((node.route.queryKeys || []).map((value) => ({ text: value.toLocaleLowerCase(), weight: 8 }))),
    );
  }
  if (includeInvariantFields) {
    for (const invariantId of node.invariantIds || []) {
      const invariant = invariants.get(invariantId);
      fields.push({ text: invariantId.toLocaleLowerCase(), weight: 11, invariantId });
      if (invariant) {
        fields.push(
          { text: invariant.label.toLocaleLowerCase(), weight: 10, invariantId },
          { text: invariant.description.toLocaleLowerCase(), weight: 4, invariantId },
          ...invariant.fileRefs.map((value) => ({ text: value.toLocaleLowerCase(), weight: 3, invariantId })),
          ...((invariant.testRefs || []).map((value) => ({ text: value.toLocaleLowerCase(), weight: 2, invariantId }))),
        );
      }
    }
  }
  return fields.filter((field) => field.text);
}

function routeMatches(node: WorkflowNode, selector: string): boolean {
  if (!node.route) return false;
  const normalizedSelector = normalizeText(selector);
  return [node.id, node.route.routeId, node.route.canonicalPath, node.route.pathPattern]
    .filter((value): value is string => Boolean(value))
    .some((value) => normalizeText(value) === normalizedSelector);
}

function nodeReferenceMatches(node: WorkflowNode, invariantMap: ReadonlyMap<string, WorkflowInvariant>, selector: string): boolean {
  const nodeReferences = [...(node.fileRefs || []), ...(node.testRefs || [])];
  if (nodeReferences.some((reference) => pathMatches(selector, reference))) return true;
  return (node.invariantIds || []).some((invariantId) => {
    const invariant = invariantMap.get(invariantId);
    return Boolean(invariant && [
      ...invariant.fileRefs,
      ...(invariant.testRefs || []),
    ].some((reference) => pathMatches(selector, reference)));
  });
}

function changedMatches(node: WorkflowNode, invariantMap: ReadonlyMap<string, WorkflowInvariant>, changedPaths: readonly string[]): string[] {
  const references = [
    ...(node.fileRefs || []),
    ...(node.testRefs || []),
    ...(node.invariantIds || []).flatMap((invariantId) => {
      const invariant = invariantMap.get(invariantId);
      return invariant ? [...invariant.fileRefs, ...(invariant.testRefs || [])] : [];
    }),
  ];
  return changedPaths.filter((changedPath) => references.some((reference) => pathMatches(changedPath, reference)));
}

function matchNode(
  node: WorkflowNode,
  input: WorkflowContextSelectionInput,
  normalizedFilePaths: readonly string[],
  normalizedChangedPaths: readonly string[],
  invariantMap: ReadonlyMap<string, WorkflowInvariant>,
  queryTerms: readonly string[],
  requireAllQueryTerms: boolean,
  includeInvariantFields = true,
): InternalSeedMatch | null {
  const reasons = new Set<ContextMatchReason>();
  const matchedInvariantIds = new Set<string>();
  const matchedTerms = new Set<string>();
  let score = 0;

  if (input.nodeId?.trim()) {
    if (node.id !== input.nodeId.trim()) return null;
    reasons.add("node");
    score += 10_000;
  }
  if (input.domain) {
    if (node.domain !== input.domain) return null;
    reasons.add("domain");
    score += 100;
  }
  if (input.route?.trim()) {
    if (!routeMatches(node, input.route)) return null;
    reasons.add("route");
    score += 2_000;
  }
  if (normalizedFilePaths.length) {
    if (!normalizedFilePaths.some((filePath) => nodeReferenceMatches(node, invariantMap, filePath))) return null;
    reasons.add("file");
    score += 1_500;
  }

  const changedPathMatches = normalizedChangedPaths.length
    ? changedMatches(node, invariantMap, normalizedChangedPaths)
    : [];
  if (input.useChangedFiles || normalizedChangedPaths.length) {
    if (!changedPathMatches.length) return null;
    reasons.add("changed-file");
    score += 1_800 + changedPathMatches.length;
  }

  if (queryTerms.length) {
    const fields = nodeSearchFields(node, invariantMap, includeInvariantFields);
    const matchingFields = fields.filter((field) => queryTerms.some((term) => textIncludes(field.text, term)));
    const termMatches = queryTerms.filter((term) => fields.some((field) => textIncludes(field.text, term)));
    if (requireAllQueryTerms && termMatches.length !== queryTerms.length) return null;
    if (!termMatches.length) return null;
    reasons.add("query");
    for (const term of termMatches) matchedTerms.add(term);
    for (const field of matchingFields) {
      if (field.invariantId) matchedInvariantIds.add(field.invariantId);
      score += queryTerms.filter((term) => textIncludes(field.text, term)).length * field.weight;
    }
    if (termMatches.length === queryTerms.length) score += 200;
    if (queryTerms.length > 1 && queryTerms.every((term) => node.id.toLocaleLowerCase().includes(term))) score += 100;
  }

  for (const invariantId of node.invariantIds || []) {
    if (queryTerms.some((term) => invariantId.toLocaleLowerCase().includes(term))) matchedInvariantIds.add(invariantId);
    if (normalizedChangedPaths.some((changedPath) => {
      const invariant = invariantMap.get(invariantId);
      return Boolean(invariant && [...invariant.fileRefs, ...(invariant.testRefs || [])].some((reference) => pathMatches(changedPath, reference)));
    })) matchedInvariantIds.add(invariantId);
  }

  return {
    nodeId: node.id,
    score,
    reasons: [...reasons].sort((left, right) => CONTEXT_MATCH_REASONS.indexOf(left) - CONTEXT_MATCH_REASONS.indexOf(right)),
    matchedTerms: [...matchedTerms],
    matchedInvariantIds: [...matchedInvariantIds].sort(compareLex),
    changedPathMatches,
  };
}

function compareSeedMatches(left: InternalSeedMatch, right: InternalSeedMatch): number {
  return right.score - left.score || compareLex(left.nodeId, right.nodeId);
}

function validateBudget(value: number | undefined): number {
  const budget = value ?? DEFAULT_CONTEXT_CHARACTER_BUDGET;
  if (!Number.isInteger(budget) || budget < MIN_CONTEXT_CHARACTER_BUDGET || budget > MAX_CONTEXT_CHARACTER_BUDGET) {
    throw new WorkflowContextSelectionError(
      "budget",
      `Context character budget must be an integer from ${MIN_CONTEXT_CHARACTER_BUDGET} to ${MAX_CONTEXT_CHARACTER_BUDGET}; received ${String(value)}.`,
    );
  }
  return budget;
}

function validateHops(input: WorkflowContextSelectionInput): number {
  const hops = input.maxHops ?? input.hops ?? DEFAULT_CONTEXT_HOPS;
  if (!Number.isInteger(hops) || hops < 0 || hops > MAX_CONTEXT_HOPS) {
    throw new WorkflowContextSelectionError(
      "invalid-selector",
      `Context neighborhood hops must be an integer from 0 to ${MAX_CONTEXT_HOPS}; received ${String(hops)}.`,
    );
  }
  return hops;
}

function normalizeRequestedScope(input: WorkflowContextSelectionInput, changedPaths: readonly string[]): WorkflowContextRequestedScope {
  const filePaths = uniqueSorted([
    ...(input.filePaths || []),
    ...(input.filePath ? [input.filePath] : []),
  ].map(normalizeRepositoryPath));
  const normalizedChangedPaths = uniqueSorted(changedPaths.map(normalizeRepositoryPath));
  return {
    ...(input.nodeId?.trim() ? { nodeId: input.nodeId.trim() } : {}),
    ...(input.domain ? { domain: input.domain } : {}),
    ...(input.route?.trim() ? { route: input.route.trim() } : {}),
    filePaths,
    ...(input.query?.trim() ? { query: input.query.trim() } : {}),
    useChangedFiles: Boolean(input.useChangedFiles),
    changedFilePaths: normalizedChangedPaths,
    hops: validateHops(input),
    characterBudget: validateBudget(input.characterBudget),
  };
}

function validateDomain(domain: WorkflowDomain | undefined): void {
  if (domain && !SUPPORTED_DOMAINS.has(domain)) {
    throw new WorkflowContextSelectionError(
      "invalid-selector",
      `Unknown workflow domain \`${String(domain)}\`. Supported domains: ${[...SUPPORTED_DOMAINS].join(", ")}.`,
    );
  }
}

/**
 * Selects a small deterministic set of workflow seeds. This function only
 * inspects the canonical graph object and never reads repository source.
 */
export function selectWorkflowContextSeeds(
  graph: WorkflowGraph,
  input: WorkflowContextSelectionInput,
): InternalWorkflowContextSelection {
  validateDomain(input.domain);
  const queryTerms = tokenize(input.query || "");
  const filePaths = uniqueSorted([
    ...(input.filePaths || []),
    ...(input.filePath ? [input.filePath] : []),
  ].map(normalizeRepositoryPath));
  const changedPaths = uniqueSorted((input.changedFilePaths || []).map(normalizeRepositoryPath));
  const hasSelector = Boolean(
    input.nodeId?.trim()
    || input.domain
    || input.route?.trim()
    || filePaths.length
    || queryTerms.length
    || input.useChangedFiles
    || changedPaths.length,
  );
  if (!hasSelector) {
    throw new WorkflowContextSelectionError(
      "invalid-selector",
      "A context selector is required. Use --node, --domain with --query, --route, --file, --query, or --changed.",
    );
  }
  if ((input.useChangedFiles || changedPaths.length) && !changedPaths.length) {
    throw new WorkflowContextSelectionError(
      "unknown-selector",
      "Changed-file selection was requested, but no changed paths were available or supplied.",
    );
  }
  if (input.nodeId?.trim() && !graph.nodes.some((node) => node.id === input.nodeId!.trim())) {
    throw new WorkflowContextSelectionError(
      "unknown-selector",
      `Unknown workflow node \`${input.nodeId.trim()}\`. Use an ID from scripts/workflow-map/graph.ts or add a narrower query.`,
    );
  }

  const invariantMap = graphInvariantMap(graph);
  const matchCandidates = (requireAllQueryTerms: boolean, includeInvariantFields = true): InternalSeedMatch[] => graph.nodes
    .map((node) => matchNode(node, input, filePaths, changedPaths, invariantMap, queryTerms, requireAllQueryTerms, includeInvariantFields))
    .filter((match): match is InternalSeedMatch => Boolean(match))
    .sort(compareSeedMatches);

  let queryMatchMode: WorkflowContextSelection["queryMatchMode"] = "none";
  const allMetadataCandidates = matchCandidates(true);
  const directMetadataCandidates = queryTerms.length ? matchCandidates(true, false) : [];
  let candidates = queryTerms.length && directMetadataCandidates.length ? directMetadataCandidates : allMetadataCandidates;
  if (queryTerms.length) {
    if (candidates.length) {
      queryMatchMode = "all-terms";
    } else {
      // Multi-word task queries are intentionally conjunctive. Falling back
      // to OR semantics makes a typo plus a generic word look like a valid
      // feature request and can select a misleadingly broad packet.
      candidates = [];
      queryMatchMode = "all-terms";
    }
  }

  if (!candidates.length) {
    const selectorSummary = [
      input.nodeId ? `node=${input.nodeId}` : undefined,
      input.domain ? `domain=${input.domain}` : undefined,
      input.route ? `route=${input.route}` : undefined,
      filePaths.length ? `file=${filePaths.join(",")}` : undefined,
      input.query ? `query=${input.query}` : undefined,
    ].filter(Boolean).join("; ");
    throw new WorkflowContextSelectionError(
      "unknown-selector",
      `No workflow nodes matched the requested scope (${selectorSummary || "changed files"}). Check the current graph IDs, route paths, and repository-relative file references.`,
    );
  }

  const hasExplicitNarrowSelector = Boolean(input.nodeId?.trim() || input.route?.trim() || filePaths.length || changedPaths.length || input.useChangedFiles);
  if (queryTerms.length <= 1 && candidates.length > 24 && !hasExplicitNarrowSelector && !input.domain) {
    throw new WorkflowContextSelectionError(
      "broad-selector",
      `Query \`${input.query}\` matches ${candidates.length} workflow nodes, which is too broad for a bounded packet. Add a second task keyword, --domain, --route, --file, or --node.`,
    );
  }
  if (!queryTerms.length && !input.nodeId && !input.route && !filePaths.length && !changedPaths.length && input.domain && candidates.length > 16) {
    throw new WorkflowContextSelectionError(
      "broad-selector",
      `Domain \`${input.domain}\` contains ${candidates.length} workflow nodes. Add --query, --route, --file, or --node for a feature-scoped packet.`,
    );
  }
  if (candidates.length > 64) {
    throw new WorkflowContextSelectionError(
      "broad-selector",
      `The requested scope is too broad: it matches ${candidates.length} workflow nodes, above the bounded selection limit. Add a narrower selector.`,
    );
  }

  const seedMatches = candidates.slice(0, MAX_CONTEXT_SEED_NODES);
  const seedNodeIds = seedMatches.map((match) => match.nodeId);
  const matchedInvariantIds = uniqueSorted(candidates.flatMap((match) => match.matchedInvariantIds));
  return {
    requested: normalizeRequestedScope(input, changedPaths),
    seedNodeIds,
    seedMatches: seedMatches.map(({ changedPathMatches: _changedPathMatches, ...match }) => match),
    candidateNodeCount: candidates.length,
    omittedCandidateNodeCount: Math.max(0, candidates.length - seedMatches.length),
    queryMatchMode,
    matchedInvariantIds,
  };
}

function edgePriority(edge: WorkflowEdge): number {
  return EDGE_KIND_PRIORITY[edge.kind] || 0;
}

function nodePriority(node: WorkflowNode): number {
  return NODE_TYPE_PRIORITY[node.type]
    + (node.invariantIds?.length ? 16 : 0)
    + (node.permissionKeys?.length ? 12 : 0)
    + (node.confirmationRequirement === "human" ? 14 : 0);
}

function compareEdges(left: WorkflowEdge, right: WorkflowEdge): number {
  return edgePriority(right) - edgePriority(left)
    || compareLex(left.source, right.source)
    || compareLex(left.target, right.target)
    || compareLex(left.id, right.id);
}

function compareNodes(left: WorkflowNode, right: WorkflowNode): number {
  return nodePriority(right) - nodePriority(left) || compareLex(left.id, right.id);
}

function buildNeighborhood(graph: WorkflowGraph, seedNodeIds: readonly string[], hops: number): Neighborhood {
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const edgeById = new Map(graph.edges.map((edge) => [edge.id, edge]));
  const adjacency = new Map<string, Array<{ edge: WorkflowEdge; nodeId: string }>>();
  for (const node of graph.nodes) adjacency.set(node.id, []);
  for (const edge of graph.edges) {
    if (!nodeById.has(edge.source) || !nodeById.has(edge.target)) continue;
    adjacency.get(edge.source)!.push({ edge, nodeId: edge.target });
    adjacency.get(edge.target)!.push({ edge, nodeId: edge.source });
  }
  for (const values of adjacency.values()) values.sort((left, right) => compareEdges(left.edge, right.edge) || compareLex(left.nodeId, right.nodeId));

  const selectedNodeIds = new Set(seedNodeIds);
  const candidateNodeIds = new Set(seedNodeIds);
  const distanceByNodeId = new Map<string, number>(seedNodeIds.map((nodeId) => [nodeId, 0]));
  let frontier = [...seedNodeIds];
  for (let distance = 0; distance < hops && frontier.length; distance++) {
    const nextFrontier: string[] = [];
    for (const currentNodeId of frontier) {
      const neighbors = adjacency.get(currentNodeId) || [];
      for (const neighbor of neighbors) {
        if (candidateNodeIds.has(neighbor.nodeId)) continue;
        candidateNodeIds.add(neighbor.nodeId);
        distanceByNodeId.set(neighbor.nodeId, distance + 1);
        if (selectedNodeIds.size < MAX_CONTEXT_NEIGHBOR_NODES) {
          selectedNodeIds.add(neighbor.nodeId);
          nextFrontier.push(neighbor.nodeId);
        }
      }
    }
    frontier = nextFrontier;
  }

  const candidateEdgeIds = [...edgeById.values()]
    .filter((edge) => selectedNodeIds.has(edge.source) && selectedNodeIds.has(edge.target))
    .sort(compareEdges)
    .map((edge) => edge.id);
  return {
    nodeIds: [...selectedNodeIds],
    candidateNodeIds: [...candidateNodeIds],
    edgeIds: candidateEdgeIds.slice(0, MAX_CONTEXT_NEIGHBOR_EDGES),
    candidateEdgeIds,
    distanceByNodeId,
  };
}

function mapChangedFiles(graph: WorkflowGraph, changedFilePaths: readonly string[]): WorkflowContextChangedFileMapping {
  const nodeMatches = new Map<string, Set<string>>();
  const invariantMatches = new Map<string, Set<string>>();
  const kindMatches = new Map<string, Set<ChangedFileMatchKind>>();
  const nodesByInvariant = new Map<string, string[]>();
  for (const node of graph.nodes) {
    for (const invariantId of node.invariantIds || []) {
      const nodes = nodesByInvariant.get(invariantId) || [];
      nodes.push(node.id);
      nodesByInvariant.set(invariantId, nodes);
    }
  }
  for (const path of uniqueSorted(changedFilePaths.map(normalizeRepositoryPath))) {
    for (const node of graph.nodes) {
      if ((node.fileRefs || []).some((reference) => pathMatches(path, reference))) {
        if (!nodeMatches.has(path)) nodeMatches.set(path, new Set());
        nodeMatches.get(path)!.add(node.id);
        if (!kindMatches.has(path)) kindMatches.set(path, new Set());
        kindMatches.get(path)!.add("node-file");
      }
      if ((node.testRefs || []).some((reference) => pathMatches(path, reference))) {
        if (!nodeMatches.has(path)) nodeMatches.set(path, new Set());
        nodeMatches.get(path)!.add(node.id);
        if (!kindMatches.has(path)) kindMatches.set(path, new Set());
        kindMatches.get(path)!.add("node-test");
      }
    }
    for (const invariant of graph.invariants) {
      const fileMatch = invariant.fileRefs.some((reference) => pathMatches(path, reference));
      const testMatch = (invariant.testRefs || []).some((reference) => pathMatches(path, reference));
      if (!fileMatch && !testMatch) continue;
      if (!invariantMatches.has(path)) invariantMatches.set(path, new Set());
      invariantMatches.get(path)!.add(invariant.id);
      if (!nodeMatches.has(path)) nodeMatches.set(path, new Set());
      for (const nodeId of nodesByInvariant.get(invariant.id) || []) nodeMatches.get(path)!.add(nodeId);
      if (!kindMatches.has(path)) kindMatches.set(path, new Set());
      if (fileMatch) kindMatches.get(path)!.add("invariant-file");
      if (testMatch) kindMatches.get(path)!.add("invariant-test");
    }
  }
  const normalizedPaths = uniqueSorted(changedFilePaths.map(normalizeRepositoryPath));
  const matched = normalizedPaths
    .filter((path) => nodeMatches.has(path) || invariantMatches.has(path))
    .map((path) => ({
      path,
      nodeIds: [...(nodeMatches.get(path) || [])].sort(compareLex),
      invariantIds: [...(invariantMatches.get(path) || [])].sort(compareLex),
      matchKinds: [...(kindMatches.get(path) || [])].sort(compareLex),
    }));
  return {
    matched,
    unmatched: normalizedPaths.filter((path) => !nodeMatches.has(path) && !invariantMatches.has(path)),
  };
}

function collectRankedReferences(
  values: Array<{ value: string; score: number }>,
): string[] {
  return [...new Map(values.map((entry) => {
    const existing = values.filter((candidate) => candidate.value === entry.value).reduce((max, candidate) => Math.max(max, candidate.score), 0);
    return [entry.value, existing] as const;
  })).entries()]
    .map(([value, score]) => ({ value, score }))
    .sort((left, right) => right.score - left.score || compareLex(left.value, right.value))
    .map((entry) => entry.value);
}

function buildFullCandidates(
  graph: WorkflowGraph,
  selection: InternalWorkflowContextSelection,
  repository: RepositoryMetadata,
): FullContextCandidates {
  const graphNodes = new Map(graph.nodes.map((node) => [node.id, node]));
  const graphEdges = new Map(graph.edges.map((edge) => [edge.id, edge]));
  const graphInvariants = graphInvariantMap(graph);
  const neighborhood = buildNeighborhood(graph, selection.seedNodeIds, selection.requested.hops);
  const seedSet = new Set(selection.seedNodeIds);
  const edgeValues = neighborhood.edgeIds.map((edgeId) => graphEdges.get(edgeId)).filter((edge): edge is WorkflowEdge => Boolean(edge));

  const invariantIds = new Set<string>(selection.matchedInvariantIds);
  for (const nodeId of neighborhood.nodeIds) for (const invariantId of graphNodes.get(nodeId)?.invariantIds || []) invariantIds.add(invariantId);
  for (const edge of edgeValues) for (const invariantId of edge.invariantIds || []) invariantIds.add(invariantId);
  for (const edge of graph.edges) {
    if (seedSet.has(edge.source) || seedSet.has(edge.target)) for (const invariantId of edge.invariantIds || []) invariantIds.add(invariantId);
  }

  const requiredNodeIds = new Set<string>(selection.seedNodeIds);
  for (const nodeId of neighborhood.nodeIds) {
    const node = graphNodes.get(nodeId);
    if (!node) continue;
    if (
      node.type === "guard"
      || node.type === "external-boundary"
      || node.confirmationRequirement === "human"
      || (node.type === "state" && (neighborhood.distanceByNodeId.get(nodeId) || 0) <= 1)
    ) requiredNodeIds.add(nodeId);
  }
  const requiredEdgeIds = new Set<string>();
  for (const edge of edgeValues) {
    if (["guard", "permission", "confirmation", "history", "separation", "state-transition"].includes(edge.kind)) requiredEdgeIds.add(edge.id);
    if (seedSet.has(edge.source) || seedSet.has(edge.target)) requiredEdgeIds.add(edge.id);
  }
  const requiredInvariantIds = new Set<string>(selection.matchedInvariantIds);
  for (const nodeId of requiredNodeIds) for (const invariantId of graphNodes.get(nodeId)?.invariantIds || []) requiredInvariantIds.add(invariantId);
  for (const edgeId of requiredEdgeIds) for (const invariantId of graphEdges.get(edgeId)?.invariantIds || []) requiredInvariantIds.add(invariantId);

  const rankedFiles: RankedReference[] = [];
  const rankedTests: RankedReference[] = [];
  for (const nodeId of neighborhood.nodeIds) {
    const node = graphNodes.get(nodeId);
    if (!node) continue;
    const score = (seedSet.has(nodeId) ? 1_000 : 0) + nodePriority(node) + ((neighborhood.distanceByNodeId.get(nodeId) || 0) * -4);
    for (const value of node.fileRefs || []) rankedFiles.push({ value: normalizeRepositoryPath(value), score });
    for (const value of node.testRefs || []) rankedTests.push({ value: normalizeRepositoryPath(value), score });
  }
  for (const invariantId of invariantIds) {
    const invariant = graphInvariants.get(invariantId);
    if (!invariant) continue;
    const score = requiredInvariantIds.has(invariantId) ? 900 : 500;
    for (const value of invariant.fileRefs) rankedFiles.push({ value: normalizeRepositoryPath(value), score });
    for (const value of invariant.testRefs || []) rankedTests.push({ value: normalizeRepositoryPath(value), score });
  }
  for (const edge of edgeValues) for (const value of edge.testRefs || []) rankedTests.push({ value: normalizeRepositoryPath(value), score: edgePriority(edge) });

  return {
    graphNodes,
    graphEdges,
    graphInvariants,
    seedNodeIds: selection.seedNodeIds,
    candidateSeedCount: selection.candidateNodeCount,
    neighborhoodNodeIds: neighborhood.nodeIds,
    candidateNodeIds: neighborhood.candidateNodeIds,
    edgeIds: neighborhood.edgeIds,
    candidateEdgeIds: neighborhood.candidateEdgeIds,
    invariantIds: uniqueSorted([...invariantIds]),
    requiredInvariantIds,
    requiredNodeIds,
    requiredEdgeIds,
    files: collectRankedReferences(rankedFiles),
    tests: collectRankedReferences(rankedTests),
    qaScenarioIds: uniqueSorted(neighborhood.nodeIds.flatMap((nodeId) => graphNodes.get(nodeId)?.qaScenarioIds || [])),
    repositoryChangedFilePaths: uniqueSorted(repository.changedFilePaths.map(normalizeRepositoryPath)),
    changedFilePaths: uniqueSorted([
      ...repository.changedFilePaths.map(normalizeRepositoryPath),
      ...selection.requested.changedFilePaths.map(normalizeRepositoryPath),
    ]),
    changedFileMapping: mapChangedFiles(graph, [
      ...repository.changedFilePaths,
      ...selection.requested.changedFilePaths,
    ]),
    distanceByNodeId: neighborhood.distanceByNodeId,
  };
}

function cloneRoute(route: WorkflowRouteReference): WorkflowRouteReference {
  return {
    ...route,
    ...(route.queryKeys ? { queryKeys: [...route.queryKeys] } : {}),
  };
}

function nodeSummary(
  node: WorkflowNode,
  state: ContextBuildState,
  candidates: FullContextCandidates,
): WorkflowContextNodeSummary {
  const detailLevel = state.detailLevel;
  const isRequired = candidates.seedNodeIds.includes(node.id) || candidates.requiredNodeIds.has(node.id);
  return {
    nodeId: node.id,
    label: node.label,
    domain: node.domain,
    type: node.type,
    sourceClassification: node.sourceClassification,
    distance: candidates.distanceByNodeId.get(node.id) || 0,
    seed: candidates.seedNodeIds.includes(node.id),
    ...(detailLevel === 0 || (detailLevel === 1 && isRequired) ? { description: node.description } : {}),
    ...(node.scope ? { scope: node.scope } : {}),
    ...(node.route ? { route: cloneRoute(node.route) } : {}),
    ...(node.statusValues?.length && (detailLevel < 2 || isRequired) ? { statusValues: [...node.statusValues] } : {}),
    ...(node.permissionKeys?.length ? { permissionKeys: [...node.permissionKeys] } : {}),
    ...(node.confirmationRequirement && node.confirmationRequirement !== "none" ? { confirmationRequirement: node.confirmationRequirement } : {}),
    ...(node.invariantIds?.length ? { invariantIds: uniqueSorted(node.invariantIds) } : {}),
    ...(node.tags?.length && detailLevel === 0 ? { tags: [...node.tags].sort(compareLex) } : {}),
  };
}

function edgeSummary(edge: WorkflowEdge, detailLevel: ContextBuildState["detailLevel"]): WorkflowContextEdgeSummary {
  return {
    edgeId: edge.id,
    source: edge.source,
    target: edge.target,
    type: edge.type,
    kind: edge.kind,
    label: edge.label,
    ...(edge.condition && detailLevel < 2 ? { condition: edge.condition } : {}),
    ...(edge.permissionKeys?.length ? { permissionKeys: [...edge.permissionKeys].sort(compareLex) } : {}),
    ...(edge.confirmationRequirement && edge.confirmationRequirement !== "none" ? { confirmationRequirement: edge.confirmationRequirement } : {}),
    ...(edge.invariantIds?.length ? { invariantIds: [...edge.invariantIds].sort(compareLex) } : {}),
  };
}

function invariantSummary(invariant: WorkflowInvariant, detailLevel: ContextBuildState["detailLevel"]): WorkflowContextInvariantSummary {
  return {
    invariantId: invariant.id,
    label: invariant.label,
    sourceClassification: invariant.sourceClassification,
    ...(detailLevel < 2 ? { description: invariant.description } : {}),
    sourceFiles: detailLevel < 2 ? [...invariant.fileRefs].sort(compareLex) : [],
    tests: detailLevel < 2 ? [...(invariant.testRefs || [])].sort(compareLex) : [],
  };
}

function guardSummaries(
  nodes: readonly WorkflowContextNodeSummary[],
  edges: readonly WorkflowContextEdgeSummary[],
): WorkflowContextGuardSummary[] {
  const guards: WorkflowContextGuardSummary[] = [];
  for (const node of nodes) {
    if (node.type !== "guard" && node.confirmationRequirement !== "human") continue;
    guards.push({
      guardId: `node:${node.nodeId}`,
      source: "node",
      sourceId: node.nodeId,
      label: node.label,
      kind: node.type === "guard" ? "guard" : "node-boundary",
      ...(node.permissionKeys?.length ? { permissionKeys: [...node.permissionKeys] } : { permissionKeys: [] }),
      ...(node.confirmationRequirement ? { confirmationRequirement: node.confirmationRequirement } : {}),
      ...(node.invariantIds?.length ? { invariantIds: [...node.invariantIds] } : { invariantIds: [] }),
    });
  }
  for (const edge of edges) {
    if (!["guard", "permission", "confirmation"].includes(edge.kind)) continue;
    guards.push({
      guardId: `edge:${edge.edgeId}`,
      source: "edge",
      sourceId: edge.edgeId,
      fromNodeId: edge.source,
      toNodeId: edge.target,
      label: edge.label,
      kind: edge.kind,
      ...(edge.permissionKeys?.length ? { permissionKeys: [...edge.permissionKeys] } : { permissionKeys: [] }),
      ...(edge.confirmationRequirement ? { confirmationRequirement: edge.confirmationRequirement } : {}),
      ...(edge.invariantIds?.length ? { invariantIds: [...edge.invariantIds] } : { invariantIds: [] }),
    });
  }
  return guards.sort((left, right) => compareLex(left.guardId, right.guardId));
}

function confirmationSummaries(
  nodes: readonly WorkflowContextNodeSummary[],
  edges: readonly WorkflowContextEdgeSummary[],
): WorkflowContextConfirmationSummary[] {
  const confirmations: WorkflowContextConfirmationSummary[] = [];
  for (const node of nodes) {
    if (node.confirmationRequirement !== "human") continue;
    confirmations.push({ sourceId: node.nodeId, source: "node", label: node.label, requirement: "human" });
  }
  for (const edge of edges) {
    if (edge.confirmationRequirement !== "human") continue;
    confirmations.push({ sourceId: edge.edgeId, source: "edge", label: edge.label, requirement: "human" });
  }
  return confirmations.sort((left, right) => compareLex(`${left.source}:${left.sourceId}`, `${right.source}:${right.sourceId}`));
}

function omittedCounts(state: ContextBuildState, candidates: FullContextCandidates): WorkflowContextTruncation["omitted"] {
  const includedNodeIds = state.nodeIds;
  const includedEdgeIds = state.edgeIds;
  const includedInvariantIds = state.invariantIds;
  const includedRouteCount = candidates.neighborhoodNodeIds.filter((nodeId) => candidates.graphNodes.get(nodeId)?.type === "route" && includedNodeIds.has(nodeId)).length;
  const fullRouteCount = candidates.neighborhoodNodeIds.filter((nodeId) => candidates.graphNodes.get(nodeId)?.type === "route").length;
  return {
    candidateSeeds: Math.max(0, candidates.candidateSeedCount - candidates.seedNodeIds.length),
    nodes: candidates.candidateNodeIds.filter((nodeId) => !includedNodeIds.has(nodeId)).length,
    edges: candidates.candidateEdgeIds.filter((edgeId) => !includedEdgeIds.has(edgeId)).length,
    invariants: candidates.invariantIds.filter((invariantId) => !includedInvariantIds.has(invariantId)).length,
    routes: Math.max(0, fullRouteCount - includedRouteCount),
    inspectFiles: Math.max(0, candidates.files.length - state.files.length),
    relevantTests: Math.max(0, candidates.tests.length - state.tests.length),
    qaScenarioIds: Math.max(0, candidates.qaScenarioIds.length - state.qaScenarioIds.length),
    changedFiles: Math.max(0, candidates.changedFilePaths.length - state.changedFilePaths.length),
  };
}

function createPacket(
  graph: WorkflowGraph,
  selection: InternalWorkflowContextSelection,
  repository: RepositoryMetadata,
  candidates: FullContextCandidates,
  state: ContextBuildState,
): WorkflowContextPacket {
  const nodes = [...state.nodeIds]
    .map((nodeId) => candidates.graphNodes.get(nodeId))
    .filter((node): node is WorkflowNode => Boolean(node))
    .sort((left, right) => {
      const leftSeed = candidates.seedNodeIds.indexOf(left.id);
      const rightSeed = candidates.seedNodeIds.indexOf(right.id);
      return (leftSeed < 0 ? Number.MAX_SAFE_INTEGER : leftSeed) - (rightSeed < 0 ? Number.MAX_SAFE_INTEGER : rightSeed)
        || (candidates.distanceByNodeId.get(left.id) || 0) - (candidates.distanceByNodeId.get(right.id) || 0)
        || compareNodes(left, right);
    })
    .map((node) => nodeSummary(node, state, candidates));
  const edges = [...state.edgeIds]
    .map((edgeId) => candidates.graphEdges.get(edgeId))
    .filter((edge): edge is WorkflowEdge => Boolean(edge) && state.nodeIds.has(edge.source) && state.nodeIds.has(edge.target))
    .sort(compareEdges)
    .map((edge) => edgeSummary(edge, state.detailLevel));
  const invariants = [...state.invariantIds]
    .map((invariantId) => candidates.graphInvariants.get(invariantId))
    .filter((invariant): invariant is WorkflowInvariant => Boolean(invariant))
    .sort((left, right) => {
      const leftRequired = candidates.requiredInvariantIds.has(left.id) ? 0 : 1;
      const rightRequired = candidates.requiredInvariantIds.has(right.id) ? 0 : 1;
      return leftRequired - rightRequired || compareLex(left.id, right.id);
    })
    .map((invariant) => invariantSummary(invariant, state.detailLevel));
  const routes = nodes
    .filter((node) => node.route)
    .map((node) => ({ nodeId: node.nodeId, label: node.label, domain: node.domain, route: node.route! }))
    .sort((left, right) => compareLex(left.nodeId, right.nodeId));
  const permissions = uniqueSorted([
    ...nodes.flatMap((node) => node.permissionKeys || []),
    ...edges.flatMap((edge) => edge.permissionKeys || []),
  ]);
  const guardEntries = guardSummaries(nodes, edges);
  const confirmations = confirmationSummaries(nodes, edges);
  const omitted = omittedCounts(state, candidates);
  const truncated = Object.values(omitted).some((count) => count > 0) || state.detailLevel > 0;
  const changedFileMapping = mapChangedFiles(graph, state.changedFilePaths);
  return {
    packetType: "engoryx-agent-context",
    schemaVersion: WORKFLOW_MAP_CONTEXT_SCHEMA_VERSION,
    repository: {
      headSha: repository.headSha,
      branch: repository.branch,
      dirty: repository.dirty,
      changedFilePaths: [...candidates.repositoryChangedFilePaths],
      graphSchemaVersion: graph.schemaVersion,
      graphVersion: graph.version,
    },
    requestedScope: selection.requested,
    selection: {
      seedNodeIds: selection.seedNodeIds,
      seedMatches: selection.seedMatches,
      candidateNodeCount: selection.candidateNodeCount,
      omittedCandidateNodeCount: selection.omittedCandidateNodeCount,
      queryMatchMode: selection.queryMatchMode,
      matchedInvariantIds: selection.matchedInvariantIds,
    },
    workflow: {
      hops: selection.requested.hops,
      nodes,
      edges,
      lifecycleTransitions: edges.filter((edge) => edge.type === "transitions"),
    },
    protectedBoundaries: {
      invariants,
      guards: guardEntries,
      permissions,
      confirmations,
    },
    routes,
    inspectFiles: [...state.files],
    relevantTests: [...state.tests],
    qaScenarioIds: [...state.qaScenarioIds],
    changedFileMapping,
    requiredVerification: [...REQUIRED_VERIFICATION],
    truncation: {
      truncated,
      characterBudget: selection.requested.characterBudget,
      detailLevel: state.detailLevel === 0 ? "full" : state.detailLevel === 1 ? "compact" : "minimal",
      omitted,
    },
  };
}

function removeLast(values: string[]): boolean {
  if (!values.length) return false;
  values.pop();
  return true;
}

function removeLowestPriorityEdge(state: ContextBuildState, candidates: FullContextCandidates): boolean {
  const removable = [...state.edgeIds]
    .map((edgeId) => candidates.graphEdges.get(edgeId))
    .filter((edge): edge is WorkflowEdge => Boolean(edge) && !candidates.requiredEdgeIds.has(edge.id))
    .sort((left, right) => compareEdges(left, right));
  const target = removable.at(-1);
  if (!target) return false;
  state.edgeIds.delete(target.id);
  return true;
}

function removeLowestPriorityNode(state: ContextBuildState, candidates: FullContextCandidates): boolean {
  const removable = [...state.nodeIds]
    .map((nodeId) => candidates.graphNodes.get(nodeId))
    .filter((node): node is WorkflowNode => Boolean(node) && !candidates.requiredNodeIds.has(node.id))
    .sort((left, right) => compareNodes(left, right));
  const target = removable.at(-1);
  if (!target) return false;
  state.nodeIds.delete(target.id);
  for (const edgeId of [...state.edgeIds]) {
    const edge = candidates.graphEdges.get(edgeId);
    if (edge && (edge.source === target.id || edge.target === target.id)) state.edgeIds.delete(edgeId);
  }
  return true;
}

function removeLowestPriorityInvariant(state: ContextBuildState, candidates: FullContextCandidates): boolean {
  const removable = [...state.invariantIds]
    .filter((invariantId) => !candidates.requiredInvariantIds.has(invariantId))
    .sort(compareLex);
  const target = removable.at(-1);
  if (!target) return false;
  state.invariantIds.delete(target);
  return true;
}

function packetCharacterCount(packet: WorkflowContextPacket): { markdown: string; json: string; count: number } {
  const markdown = renderWorkflowContextMarkdown(packet);
  const json = serializeWorkflowContextPacket(packet);
  return {
    markdown,
    json,
    count: Math.max(markdown.length, json.length),
  };
}

function fitPacket(
  graph: WorkflowGraph,
  selection: InternalWorkflowContextSelection,
  repository: RepositoryMetadata,
  candidates: FullContextCandidates,
): WorkflowContextResult {
  const state: ContextBuildState = {
    nodeIds: new Set(candidates.neighborhoodNodeIds),
    edgeIds: new Set(candidates.edgeIds),
    invariantIds: new Set(candidates.invariantIds),
    files: [...candidates.files],
    tests: [...candidates.tests],
    qaScenarioIds: [...candidates.qaScenarioIds],
    changedFilePaths: [...candidates.changedFilePaths],
    detailLevel: 0,
  };
  const budget = selection.requested.characterBudget;
  const maxIterations = candidates.files.length + candidates.tests.length + candidates.qaScenarioIds.length
    + candidates.changedFilePaths.length + candidates.edgeIds.length + candidates.neighborhoodNodeIds.length
    + candidates.invariantIds.length + 10;
  for (let iteration = 0; iteration < maxIterations; iteration++) {
    const packet = createPacket(graph, selection, repository, candidates, state);
    const rendered = packetCharacterCount(packet);
    if (rendered.count <= budget) {
      return {
        packet,
        markdown: rendered.markdown,
        json: rendered.json,
        markdownCharacters: rendered.markdown.length,
        jsonCharacters: rendered.json.length,
        characterCount: rendered.count,
      };
    }

    // Remove low-value neighborhood detail before source/test references so a
    // normal packet still answers "which files and tests should I inspect?".
    const removed = removeLast(state.qaScenarioIds)
      || removeLowestPriorityNode(state, candidates)
      || removeLowestPriorityEdge(state, candidates)
      || removeLowestPriorityInvariant(state, candidates)
      || removeLast(state.tests)
      || removeLast(state.files)
      || (state.changedFilePaths.length > 0 && removeLast(state.changedFilePaths));
    if (removed) continue;
    if (state.detailLevel < 2) {
      state.detailLevel = (state.detailLevel + 1) as 0 | 1 | 2;
      continue;
    }
    throw new WorkflowContextSelectionError(
      "budget",
      `Context character budget ${budget} is too small to preserve the selected seed nodes and relevant protected boundaries. Increase --budget (minimum supported value is ${MIN_CONTEXT_CHARACTER_BUDGET}).`,
    );
  }
  throw new WorkflowContextSelectionError("budget", "Context packet bounding reached its deterministic iteration limit; use a narrower selector.");
}

function markdownText(value: string): string {
  return value.replaceAll("`", "'").replaceAll("\n", " ").trim();
}

function markdownValues(values: readonly string[]): string {
  return values.length ? values.map((value) => `\`${markdownText(value)}\``).join(", ") : "none";
}

function renderChangedFileMapping(mapping: WorkflowContextChangedFileMapping): string[] {
  const lines: string[] = [];
  for (const item of mapping.matched) {
    const nodes = item.nodeIds.length ? item.nodeIds.map((value) => `\`${markdownText(value)}\``).join(", ") : "none";
    const invariants = item.invariantIds.length ? item.invariantIds.map((value) => `\`${markdownText(value)}\``).join(", ") : "none";
    lines.push(`- \`${markdownText(item.path)}\` → nodes: ${nodes}; invariants: ${invariants}; matches: ${markdownValues(item.matchKinds)}`);
  }
  for (const path of mapping.unmatched) lines.push(`- \`${markdownText(path)}\` → no graph file/test reference`);
  return lines.length ? lines : ["- none"];
}

export function renderWorkflowContextMarkdown(packet: WorkflowContextPacket): string {
  const lines: string[] = [
    "# ENGORYX AGENT CONTEXT",
    "",
    "## Repository",
    "",
    `- revision: \`${markdownText(packet.repository.headSha)}\``,
    `- branch: \`${markdownText(packet.repository.branch)}\``,
    `- worktree: ${packet.repository.dirty ? "dirty" : "clean"}`,
    `- graph: schema \`${packet.repository.graphSchemaVersion}\`, version \`${markdownText(packet.repository.graphVersion)}\``,
    `- changed paths: ${markdownValues(packet.repository.changedFilePaths)}`,
    "",
    "## Requested scope",
    "",
    `- selectors: ${[
      packet.requestedScope.nodeId ? `node=${packet.requestedScope.nodeId}` : undefined,
      packet.requestedScope.domain ? `domain=${packet.requestedScope.domain}` : undefined,
      packet.requestedScope.route ? `route=${packet.requestedScope.route}` : undefined,
      packet.requestedScope.filePaths.length ? `file=${packet.requestedScope.filePaths.join(",")}` : undefined,
      packet.requestedScope.query ? `query=${packet.requestedScope.query}` : undefined,
      packet.requestedScope.useChangedFiles ? "changed-files" : undefined,
    ].filter(Boolean).map((value) => `\`${markdownText(value as string)}\``).join(", ") || "none"}`,
    `- neighborhood: ${packet.workflow.hops} hop${packet.workflow.hops === 1 ? "" : "s"}; seed candidates ${packet.selection.candidateNodeCount}; selected seeds ${packet.selection.seedNodeIds.length}`,
    `- matched seeds: ${packet.selection.seedNodeIds.map((value) => `\`${markdownText(value)}\``).join(", ") || "none"}`,
    "",
    "## Workflow",
    "",
    "### Selected nodes",
    "",
  ];
  for (const node of packet.workflow.nodes) {
    lines.push(`- **${markdownText(node.label)}** (\`${markdownText(node.nodeId)}\`) — ${node.domain} / ${node.type}; distance ${node.distance}${node.seed ? "; seed" : ""}`);
    if (node.description) lines.push(`  - ${markdownText(node.description)}`);
    if (node.statusValues?.length) lines.push(`  - statuses: ${markdownValues(node.statusValues)}`);
    if (node.permissionKeys?.length) lines.push(`  - permissions: ${markdownValues(node.permissionKeys)}`);
    if (node.confirmationRequirement && node.confirmationRequirement !== "none") lines.push(`  - confirmation: \`${node.confirmationRequirement}\``);
    if (node.invariantIds?.length) lines.push(`  - invariants: ${markdownValues(node.invariantIds)}`);
  }
  if (!packet.workflow.nodes.length) lines.push("- none");
  lines.push("", "### Important relationships", "");
  const importantEdges = packet.workflow.edges.filter((edge) => ["guard", "permission", "confirmation", "history", "separation", "state-transition", "external-boundary"].includes(edge.kind));
  for (const edge of importantEdges) lines.push(`- \`${markdownText(edge.edgeId)}\`: \`${markdownText(edge.source)}\` → \`${markdownText(edge.target)}\` — ${markdownText(edge.label)} [${edge.kind}]`);
  if (!importantEdges.length) lines.push("- none in the bounded neighborhood");
  lines.push("", "### Lifecycle/state transitions", "");
  for (const edge of packet.workflow.lifecycleTransitions) lines.push(`- \`${markdownText(edge.source)}\` → \`${markdownText(edge.target)}\` — ${markdownText(edge.label)}`);
  if (!packet.workflow.lifecycleTransitions.length) lines.push("- none in the bounded neighborhood");

  lines.push("", "## Protected boundaries", "", "### High-risk invariants", "");
  for (const invariant of packet.protectedBoundaries.invariants) {
    lines.push(`- **${markdownText(invariant.label)}** (\`${markdownText(invariant.invariantId)}\`)${invariant.description ? ` — ${markdownText(invariant.description)}` : ""}`);
    if (invariant.sourceFiles.length) lines.push(`  - source: ${markdownValues(invariant.sourceFiles)}`);
    if (invariant.tests.length) lines.push(`  - tests: ${markdownValues(invariant.tests)}`);
  }
  if (!packet.protectedBoundaries.invariants.length) lines.push("- none in the bounded neighborhood");
  lines.push("", "### Guards, permissions, and confirmations", "", `- permissions: ${markdownValues(packet.protectedBoundaries.permissions)}`);
  for (const guard of packet.protectedBoundaries.guards) lines.push(`- guard \`${markdownText(guard.guardId)}\`: ${markdownText(guard.label)} [${markdownText(guard.kind)}]${guard.permissionKeys.length ? `; permissions: ${markdownValues(guard.permissionKeys)}` : ""}`);
  for (const confirmation of packet.protectedBoundaries.confirmations) lines.push(`- human confirmation: \`${markdownText(confirmation.sourceId)}\` — ${markdownText(confirmation.label)}`);
  if (!packet.protectedBoundaries.guards.length && !packet.protectedBoundaries.confirmations.length) lines.push("- none in the bounded neighborhood");

  lines.push("", "## Relevant routes", "");
  for (const route of packet.routes) lines.push(`- **${markdownText(route.label)}** (\`${markdownText(route.nodeId)}\`) — \`${markdownText(route.route.canonicalPath)}\`${route.route.routeId ? `; route ID \`${markdownText(route.route.routeId)}\`` : ""}`);
  if (!packet.routes.length) lines.push("- none in the bounded neighborhood");
  lines.push("", "## Inspect these files", "", ...packet.inspectFiles.map((file) => `- \`${markdownText(file)}\``));
  if (!packet.inspectFiles.length) lines.push("- none listed");
  lines.push("", "## Relevant tests", "", ...packet.relevantTests.map((test) => `- \`${markdownText(test)}\``));
  if (!packet.relevantTests.length) lines.push("- none listed");
  lines.push("", "## QA mappings", "", packet.qaScenarioIds.length ? `- ${markdownValues(packet.qaScenarioIds)}` : "- none listed");
  lines.push("", "## Changed-file mapping", "", ...renderChangedFileMapping(packet.changedFileMapping));
  lines.push("", "## Required verification", "", ...packet.requiredVerification.map((item) => `- ${markdownText(item)}`));
  lines.push("", "## Truncation", "");
  const omitted = packet.truncation.omitted;
  const omittedEntries = Object.entries(omitted).filter(([, count]) => count > 0).map(([key, count]) => `${key}=${count}`);
  lines.push(packet.truncation.truncated
    ? `- bounded/truncated: detail level \`${packet.truncation.detailLevel}\`; omitted ${omittedEntries.join(", ") || "lower-value metadata"}`
    : `- none; packet fits the ${packet.truncation.characterBudget}-character budget at full detail`);
  return `${lines.join("\n")}\n`;
}

export function serializeWorkflowContextPacket(packet: WorkflowContextPacket): string {
  // JSON is the machine-facing format; keeping it compact leaves more of the
  // character budget for workflow facts while remaining deterministic.
  return `${JSON.stringify(packet)}\n`;
}

/**
 * Generates the bounded packet and both stable renderings. The repository
 * metadata is injectable so pure tests never depend on the caller's Git state.
 */
export function generateWorkflowContext(
  graph: WorkflowGraph,
  input: WorkflowContextSelectionInput,
  repository: RepositoryMetadata = UNKNOWN_REPOSITORY,
): WorkflowContextResult {
  const selection = selectWorkflowContextSeeds(graph, input);
  const candidates = buildFullCandidates(graph, selection, repository);
  return fitPacket(graph, selection, repository, candidates);
}

export const buildWorkflowContextPacket = generateWorkflowContext;
