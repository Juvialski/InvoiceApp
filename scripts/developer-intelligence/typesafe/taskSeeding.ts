import { spawnSync } from "node:child_process";
import type { ContextCandidate } from "./contextReranker.ts";

export interface TypesafeTaskSeedOptions {
  readonly task: string;
  readonly rootDir?: string;
  readonly explicitFilePaths?: readonly string[];
  readonly changedFilePaths?: readonly string[];
  readonly availablePaths?: readonly string[];
  readonly existingCandidates?: readonly ContextCandidate[];
}

export interface TypesafeTaskSeedResult {
  readonly candidates: readonly ContextCandidate[];
  readonly matchedScopes: readonly string[];
  readonly noCandidates: boolean;
}

interface TaskSeedScope {
  readonly id: string;
  readonly terms: readonly string[];
  readonly pathPrefixes: readonly string[];
  readonly exactPaths: readonly string[];
}

const TASK_SEED_SCOPES: readonly TaskSeedScope[] = [
  {
    id: "typesafe-workflow-intelligence",
    terms: ["typesafe", "jev", "workflow intelligence", "payload-safe", "test triage", "developer-intelligence"],
    pathPrefixes: ["scripts/developer-intelligence/typesafe/", "tests/typesafe"],
    exactPaths: [
      "scripts/agent-context.ts",
      "scripts/test-impact.ts",
      "scripts/test-impact-config.ts",
      "scripts/repository-intelligence/contextEngine.ts",
      "tests/repositoryIntelligenceContext.test.ts",
    ],
  },
  {
    id: "repository-intelligence-context",
    terms: ["repository intelligence", "ri-", "context engine", "workflow map context"],
    pathPrefixes: ["scripts/repository-intelligence/", "tests/repositoryIntelligence"],
    exactPaths: [
      "scripts/agent-context.ts",
      "scripts/workflow-map/context.ts",
      "tests/workflowMapContext.test.ts",
      "tests/repositoryIntelligenceContext.test.ts",
    ],
  },
];

function normalizePath(value: string): string {
  return value.trim().replaceAll("\\", "/").replace(/^\.\//, "");
}

function compareLex(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values.map(normalizePath).filter(Boolean))].sort(compareLex);
}

function matchesScope(path: string, scope: TaskSeedScope): boolean {
  return scope.pathPrefixes.some((prefix) => path.startsWith(prefix)) || scope.exactPaths.includes(path);
}

function matchesTask(task: string, scope: TaskSeedScope): boolean {
  const normalized = task.toLocaleLowerCase();
  return scope.terms.some((term) => normalized.includes(term));
}

function trackedPaths(rootDir: string): string[] {
  const result = spawnSync("git", ["ls-files"], { cwd: rootDir, encoding: "utf8", windowsHide: true });
  if (result.status !== 0 || typeof result.stdout !== "string") return [];
  return result.stdout.split(/\r?\n/).map(normalizePath).filter(Boolean);
}

function mergeCandidate(byPath: Map<string, ContextCandidate>, candidate: ContextCandidate): void {
  const path = normalizePath(candidate.path);
  if (!path) return;
  const previous = byPath.get(path);
  byPath.set(path, {
    ...(previous || {}),
    ...candidate,
    id: path,
    path,
    mustKeep: Boolean(previous?.mustKeep || candidate.mustKeep),
  });
}

/**
 * Seeds only from explicit selectors, current changed paths, existing RI
 * metadata, and a small inspectable developer-tooling catalog. Jev never
 * participates in defining this universe.
 */
export function seedTypesafeContextCandidates(options: TypesafeTaskSeedOptions): TypesafeTaskSeedResult {
  const byPath = new Map<string, ContextCandidate>();
  for (const candidate of options.existingCandidates || []) mergeCandidate(byPath, candidate);
  for (const filePath of uniqueSorted(options.explicitFilePaths || [])) {
    mergeCandidate(byPath, { id: filePath, path: filePath, kind: "explicit-selector", mustKeep: true });
  }
  for (const filePath of uniqueSorted(options.changedFilePaths || [])) {
    mergeCandidate(byPath, { id: filePath, path: filePath, kind: "changed", mustKeep: true });
  }

  const availablePaths = uniqueSorted([
    ...(options.availablePaths || []),
    ...(options.availablePaths ? [] : trackedPaths(options.rootDir || process.cwd())),
    ...(options.explicitFilePaths || []),
    ...(options.changedFilePaths || []),
  ]);
  const matchedScopes = TASK_SEED_SCOPES.filter((scope) => matchesTask(options.task, scope)).map((scope) => scope.id);
  for (const scope of TASK_SEED_SCOPES) {
    if (!matchedScopes.includes(scope.id)) continue;
    for (const filePath of availablePaths) {
      if (!matchesScope(filePath, scope)) continue;
      mergeCandidate(byPath, {
        id: filePath,
        path: filePath,
        kind: "task-seed",
        summary: `Deterministic ${scope.id} candidate.`,
      });
    }
  }

  const candidates = [...byPath.values()].sort((left, right) => compareLex(left.path, right.path));
  return {
    candidates,
    matchedScopes,
    noCandidates: candidates.length === 0,
  };
}

export const TYPESAFE_TASK_SEED_SCOPES = TASK_SEED_SCOPES;
