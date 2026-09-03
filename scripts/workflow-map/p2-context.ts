import {
  generateWorkflowContext as generateBaseWorkflowContext,
  renderWorkflowContextMarkdown,
  selectWorkflowContextSeeds as selectBaseWorkflowContextSeeds,
  serializeWorkflowContextPacket,
  WorkflowContextSelectionError,
  type WorkflowContextRequestedScope,
  type WorkflowContextResult,
  type WorkflowContextSelectionInput,
} from "./context.ts";
import { WORKFLOW_DOMAIN_ORDER, isWorkflowDomain } from "./domain-registry.ts";
import type { RepositoryMetadata } from "./repositoryContext.ts";
import type { WorkflowDomain, WorkflowGraph } from "./types.ts";

export * from "./context.ts";

const EXTENSION_DOMAINS = new Set<WorkflowDomain>(["procurement", "commercial"]);

function normalizeDomainSelection(input: WorkflowContextSelectionInput): {
  delegated: WorkflowContextSelectionInput;
  requestedDomain?: WorkflowDomain;
  requestedQuery?: string;
} {
  const requestedDomain = input.domain;
  if (requestedDomain && !isWorkflowDomain(requestedDomain)) {
    throw new WorkflowContextSelectionError(
      "invalid-selector",
      `Unknown workflow domain \`${String(requestedDomain)}\`. Supported domains: ${WORKFLOW_DOMAIN_ORDER.join(", ")}.`,
    );
  }
  if (!requestedDomain || !EXTENSION_DOMAINS.has(requestedDomain)) {
    return { delegated: input };
  }

  const requestedQuery = input.query?.trim() || undefined;
  const query = [requestedDomain, requestedQuery].filter(Boolean).join(" ");
  const { domain: _domain, query: _query, ...rest } = input;
  return {
    delegated: { ...rest, query },
    requestedDomain,
    ...(requestedQuery ? { requestedQuery } : {}),
  };
}

function validateExtensionDomainCoverage(
  graph: WorkflowGraph,
  input: WorkflowContextSelectionInput,
  requestedDomain?: WorkflowDomain,
  requestedQuery?: string,
): void {
  if (!requestedDomain || !requestedQuery || !EXTENSION_DOMAINS.has(requestedDomain)) return;

  const scopedNodeIds = new Set(
    graph.nodes.filter((node) => node.domain === requestedDomain).map((node) => node.id),
  );
  const scopedGraph: WorkflowGraph = {
    ...graph,
    nodes: graph.nodes.filter((node) => scopedNodeIds.has(node.id)),
    edges: graph.edges.filter((edge) => scopedNodeIds.has(edge.source) && scopedNodeIds.has(edge.target)),
  };
  const { domain: _domain, query: _query, ...rest } = input;

  // Extension domains currently pass through the legacy context engine by
  // injecting the domain as a query term. Preflight the user's actual query
  // against that domain first so the injected term cannot turn a true map
  // coverage gap into misleading generic domain context.
  selectBaseWorkflowContextSeeds(scopedGraph, {
    ...rest,
    query: requestedQuery,
  });
}

function restoredRequestedScope(
  scope: WorkflowContextRequestedScope,
  requestedDomain: WorkflowDomain,
  requestedQuery?: string,
): WorkflowContextRequestedScope {
  const { query: _delegatedQuery, ...rest } = scope;
  return {
    ...rest,
    domain: requestedDomain,
    ...(requestedQuery ? { query: requestedQuery } : {}),
  };
}

function restoreRequestedScope(
  result: WorkflowContextResult,
  requestedDomain?: WorkflowDomain,
  requestedQuery?: string,
): WorkflowContextResult {
  if (!requestedDomain) return result;
  const packet = {
    ...result.packet,
    requestedScope: restoredRequestedScope(result.packet.requestedScope, requestedDomain, requestedQuery),
  };
  const markdown = renderWorkflowContextMarkdown(packet);
  const json = serializeWorkflowContextPacket(packet);
  const characterCount = Math.max(markdown.length, json.length);
  if (characterCount > packet.truncation.characterBudget) {
    throw new WorkflowContextSelectionError(
      "budget",
      `Context character budget ${packet.truncation.characterBudget} is too small after preserving the requested ${requestedDomain} domain. Increase --budget or narrow the selector.`,
    );
  }
  return {
    ...result,
    packet,
    markdown,
    json,
    markdownCharacters: markdown.length,
    jsonCharacters: json.length,
    characterCount,
  };
}

export function selectP2WorkflowContextSeeds(graph: WorkflowGraph, input: WorkflowContextSelectionInput) {
  const normalized = normalizeDomainSelection(input);
  validateExtensionDomainCoverage(graph, input, normalized.requestedDomain, normalized.requestedQuery);
  const selection = selectBaseWorkflowContextSeeds(graph, normalized.delegated);
  if (!normalized.requestedDomain) return selection;
  return {
    ...selection,
    requested: restoredRequestedScope(selection.requested, normalized.requestedDomain, normalized.requestedQuery),
  };
}

export function generateP2WorkflowContext(
  graph: WorkflowGraph,
  input: WorkflowContextSelectionInput,
  repository?: RepositoryMetadata,
): WorkflowContextResult {
  const normalized = normalizeDomainSelection(input);
  validateExtensionDomainCoverage(graph, input, normalized.requestedDomain, normalized.requestedQuery);
  const result = generateBaseWorkflowContext(graph, normalized.delegated, repository);
  return restoreRequestedScope(result, normalized.requestedDomain, normalized.requestedQuery);
}
