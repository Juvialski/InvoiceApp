import path from "node:path";
import {
  buildRepositoryIntelligenceContext,
  type RepositoryIntelligenceContextPacket,
} from "../../repository-intelligence/contextEngine.ts";
import {
  detectChangedFiles,
} from "../../test-impact.ts";
import {
  rerankContextCandidates,
  type ContextCandidate,
  type ContextRerankResult,
} from "./contextReranker.ts";
import { seedTypesafeContextCandidates } from "./taskSeeding.ts";
import type { TypeSafeGateway } from "./client.ts";
import { WORKFLOW_GRAPH } from "../../workflow-map/graph.ts";
import { WORKFLOW_MAP_REPOSITORY_ROOT } from "../../workflow-map/generate.ts";
import { readRepositoryMetadata, type RepositoryMetadata } from "../../workflow-map/repositoryContext.ts";
import type { WorkflowContextSelectionInput } from "../../workflow-map/context.ts";
import type { WorkflowDomain } from "../../workflow-map/types.ts";

export interface RiCandidatePacketInput {
  readonly primarySource: readonly RepositoryIntelligenceContextPacket["primarySource"][number][];
  readonly supportingSource: readonly string[];
  readonly changedFilePaths: readonly string[];
}

export interface TypesafeContextCommandOptions {
  readonly rootDir?: string;
  readonly task: string;
  readonly query?: string;
  readonly domain?: WorkflowDomain;
  readonly filePaths?: readonly string[];
  readonly changedFilePaths?: readonly string[];
  readonly useChangedFiles?: boolean;
  readonly hops?: number;
  readonly maxSelected?: number;
  readonly live?: boolean;
  readonly gateway?: TypeSafeGateway;
  readonly env?: NodeJS.ProcessEnv;
  readonly timeoutMs?: number;
}

export interface TypesafeContextCommandResult {
  readonly task: string;
  readonly repository: Pick<RepositoryMetadata, "headSha" | "branch" | "dirty" | "changedFilePaths">;
  readonly riStatus: RepositoryIntelligenceContextPacket["status"];
  readonly baselineCandidates: readonly ContextCandidate[];
  readonly selectedCandidates: readonly ContextCandidate[];
  readonly effectivenessRecords: ContextRerankResult["effectivenessRecords"];
  readonly seedScopes: readonly string[];
  readonly noCandidates: boolean;
  readonly fallback: boolean;
  readonly diagnostic: ContextRerankResult["diagnostic"];
}

function normalizePath(value: string): string {
  return value.trim().replaceAll("\\", "/").replace(/^\.\//, "");
}

export function candidatesFromRiPacket(input: RiCandidatePacketInput): ContextCandidate[] {
  const byPath = new Map<string, ContextCandidate>();
  const add = (candidate: ContextCandidate) => {
    const normalized = normalizePath(candidate.path);
    if (!normalized) return;
    const previous = byPath.get(normalized);
    byPath.set(normalized, {
      ...(previous || {}),
      ...candidate,
      id: normalized,
      path: normalized,
      mustKeep: Boolean(previous?.mustKeep || candidate.mustKeep),
    });
  };
  for (const changedFilePath of input.changedFilePaths) add({ id: changedFilePath, path: changedFilePath, kind: "changed", mustKeep: true });
  for (const source of input.primarySource) {
    add({
      id: source.path,
      path: source.path,
      kind: "ri-primary",
      summary: source.reasons.join("; "),
      mustKeep: source.reasons.some((reason) => /exact|changed|curated Workflow Map|explicit/i.test(reason)),
    });
  }
  for (const supportingPath of input.supportingSource) add({ id: supportingPath, path: supportingPath, kind: "ri-supporting", mustKeep: false });
  return [...byPath.values()].sort((left, right) => left.path.localeCompare(right.path));
}

function selectionForOptions(options: TypesafeContextCommandOptions, changedFilePaths: readonly string[]): WorkflowContextSelectionInput {
  return {
    ...(options.domain ? { domain: options.domain } : {}),
    ...(options.filePaths?.length ? { filePaths: [...options.filePaths] } : {}),
    query: options.query || options.task,
    ...(changedFilePaths.length ? { changedFilePaths: [...changedFilePaths], useChangedFiles: true } : {}),
    hops: Math.min(2, Math.max(0, options.hops ?? 1)),
    characterBudget: 7_500,
  };
}

export async function buildTypesafeContextCommand(options: TypesafeContextCommandOptions): Promise<TypesafeContextCommandResult> {
  const rootDir = path.resolve(options.rootDir || WORKFLOW_MAP_REPOSITORY_ROOT);
  const repository = readRepositoryMetadata(rootDir);
  const diff = detectChangedFiles({ cwd: rootDir });
  const changedFilePaths = [...new Set([
    ...(options.changedFilePaths || []),
    ...(options.useChangedFiles ? diff.changedFiles : []),
    ...repository.changedFilePaths,
  ].map(normalizePath).filter(Boolean))].sort();
  const selection = selectionForOptions(options, changedFilePaths);
  const ri = buildRepositoryIntelligenceContext({
    rootDir,
    workflowGraph: WORKFLOW_GRAPH,
    repository,
    selection,
    task: options.task,
  });
  const riCandidates = candidatesFromRiPacket({
    primarySource: ri.packet.primarySource,
    supportingSource: ri.packet.supportingSource,
    changedFilePaths,
  });
  const seeded = seedTypesafeContextCandidates({
    rootDir,
    task: options.task,
    explicitFilePaths: options.filePaths,
    changedFilePaths,
    existingCandidates: riCandidates,
  });
  const reranked = await rerankContextCandidates({
    task: options.task,
    candidates: seeded.candidates,
    maxSelected: options.maxSelected,
    gateway: options.gateway,
    env: options.env,
    live: options.live,
    timeoutMs: options.timeoutMs,
  });
  return {
    task: options.task,
    repository: {
      headSha: repository.headSha,
      branch: repository.branch,
      dirty: repository.dirty,
      changedFilePaths: repository.changedFilePaths,
    },
    riStatus: ri.packet.status,
    baselineCandidates: reranked.baselineCandidates,
    selectedCandidates: reranked.selectedCandidates,
    effectivenessRecords: reranked.effectivenessRecords,
    seedScopes: seeded.matchedScopes,
    noCandidates: seeded.noCandidates,
    fallback: reranked.fallback,
    diagnostic: reranked.diagnostic,
  };
}
