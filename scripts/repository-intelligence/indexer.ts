import path from "node:path";
import {
  cacheRecordFileName,
  cleanIndexCache,
  loadIndexCache,
  writeIndexCache,
} from "./cache.ts";
import { collectTrackedFileInventory } from "./inventory.ts";
import { extractTypeScriptFacts } from "./typescriptExtractor.ts";
import {
  REPOSITORY_INTELLIGENCE_GENERATOR_VERSION,
  REPOSITORY_INTELLIGENCE_INDEX_SCHEMA_VERSION,
  type BuildRepositoryIndexOptions,
  type FileIndexRecord,
  type IndexRunSummary,
  type RepositoryIndex,
  type RepositoryIndexResult,
  type TrackedFileCandidate,
} from "./types.ts";

export function getDefaultCacheDirectory(rootDir: string): string {
  return path.join(path.resolve(rootDir), ".cache", "repository-intelligence");
}

function emptyExtraction(): ReturnType<typeof extractTypeScriptFacts> {
  return { symbols: [], imports: [], exports: [], reExports: [] };
}

function createFileRecord(
  candidate: TrackedFileCandidate,
  schemaVersion: number,
  generatorVersion: string,
): FileIndexRecord {
  const extraction = candidate.language === "typescript" || candidate.language === "tsx"
    ? extractTypeScriptFacts(candidate.path, (candidate.contents || Buffer.alloc(0)).toString("utf8"))
    : emptyExtraction();
  return {
    schemaVersion,
    generatorVersion,
    path: candidate.path,
    classification: candidate.classification as FileIndexRecord["classification"],
    language: candidate.language,
    size: candidate.size,
    lineCount: candidate.lineCount || 0,
    contentHash: candidate.contentHash || "",
    symbols: extraction.symbols,
    imports: extraction.imports,
    exports: extraction.exports,
    reExports: extraction.reExports,
  };
}

function sortPaths(paths: Iterable<string>): string[] {
  return [...new Set(paths)].sort((left, right) => left < right ? -1 : left > right ? 1 : 0);
}

interface ReparsePlan {
  readonly currentRecords: Map<string, FileIndexRecord>;
  readonly reparsedPaths: string[];
  readonly reusedPaths: string[];
  readonly renamedPaths: string[];
  readonly deletedPaths: string[];
  readonly added: number;
  readonly modified: number;
  readonly hashChanged: number;
  readonly renamed: number;
}

function planRecords(
  candidates: readonly TrackedFileCandidate[],
  previousRecords: ReadonlyMap<string, FileIndexRecord>,
  fullRebuild: boolean,
  schemaVersion: number,
  generatorVersion: string,
): ReparsePlan {
  const currentRecords = new Map<string, FileIndexRecord>();
  const reparsedPaths: string[] = [];
  const reusedPaths: string[] = [];
  const renamedPaths: string[] = [];
  const deletedPaths: string[] = [];
  const currentByPath = new Map(candidates.map((candidate) => [candidate.path, candidate]));
  const pendingRenames = new Set<string>();
  let added = 0;
  let modified = 0;
  let hashChanged = 0;
  let renamed = 0;

  if (!fullRebuild) {
    for (const candidate of candidates) {
      const previous = previousRecords.get(candidate.path);
      if (!previous) {
        pendingRenames.add(candidate.path);
        continue;
      }
      if (previous.contentHash === candidate.contentHash
        && previous.schemaVersion === schemaVersion
        && previous.generatorVersion === generatorVersion) {
        currentRecords.set(candidate.path, previous);
        reusedPaths.push(candidate.path);
      } else {
        pendingRenames.add(candidate.path);
        modified += 1;
        if (previous.contentHash !== candidate.contentHash) hashChanged += 1;
      }
    }
  } else {
    for (const candidate of candidates) pendingRenames.add(candidate.path);
  }

  const previousPaths = new Set(previousRecords.keys());
  const matchedPreviousPaths = new Set<string>();
  for (const candidate of candidates) {
    if (currentRecords.has(candidate.path)) {
      matchedPreviousPaths.add(candidate.path);
      continue;
    }
    if (!pendingRenames.has(candidate.path)) continue;
    const previous = previousRecords.get(candidate.path);
    if (!previous) {
      const renameCandidates = [...previousRecords.values()].filter((record) => !currentByPath.has(record.path)
        && !matchedPreviousPaths.has(record.path)
        && record.contentHash === candidate.contentHash);
      if (renameCandidates.length === 1) {
        matchedPreviousPaths.add(renameCandidates[0].path);
        renamed += 1;
        renamedPaths.push(candidate.path);
      } else {
        added += 1;
      }
    } else {
      matchedPreviousPaths.add(candidate.path);
    }
    currentRecords.set(candidate.path, createFileRecord(candidate, schemaVersion, generatorVersion));
    reparsedPaths.push(candidate.path);
  }

  for (const previousPath of previousPaths) {
    if (!currentByPath.has(previousPath) && !matchedPreviousPaths.has(previousPath)) deletedPaths.push(previousPath);
  }

  if (fullRebuild) {
    added = 0;
    modified = 0;
    hashChanged = 0;
    renamed = 0;
    renamedPaths.length = 0;
    deletedPaths.length = 0;
    for (const candidate of candidates) {
      if (!currentRecords.has(candidate.path)) {
        currentRecords.set(candidate.path, createFileRecord(candidate, schemaVersion, generatorVersion));
        reparsedPaths.push(candidate.path);
      }
    }
  }

  return {
    currentRecords,
    reparsedPaths: sortPaths(reparsedPaths),
    reusedPaths: sortPaths(reusedPaths),
    renamedPaths: sortPaths(renamedPaths),
    deletedPaths: sortPaths(deletedPaths),
    added,
    modified,
    hashChanged,
    renamed,
  };
}

export function buildRepositoryIndex(options: BuildRepositoryIndexOptions): RepositoryIndexResult {
  const started = Date.now();
  const rootDir = path.resolve(options.rootDir);
  const cacheDirectory = path.resolve(options.cacheDir || getDefaultCacheDirectory(rootDir));
  const requestedMode = options.mode || "incremental";
  const schemaVersion = options.schemaVersion || REPOSITORY_INTELLIGENCE_INDEX_SCHEMA_VERSION;
  const generatorVersion = options.generatorVersion || REPOSITORY_INTELLIGENCE_GENERATOR_VERSION;
  const inventory = collectTrackedFileInventory(rootDir);
  const loadedCache = loadIndexCache(cacheDirectory);
  const versionMatches = loadedCache.status === "valid"
    && loadedCache.manifest?.schemaVersion === schemaVersion
    && loadedCache.manifest.generatorVersion === generatorVersion;
  const fullRebuild = requestedMode === "full" || !versionMatches;
  const plan = planRecords(
    inventory.trackedFiles,
    versionMatches ? loadedCache.records : new Map(),
    fullRebuild,
    schemaVersion,
    generatorVersion,
  );

  const files = [...plan.currentRecords.values()].sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
  const excludedFiles = [...inventory.excludedFiles].sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
  const index: RepositoryIndex = {
    schemaVersion,
    generatorVersion,
    repositoryHeadSha: inventory.repositoryHeadSha,
    dirtyTrackedPaths: inventory.dirtyTrackedPaths,
    files,
    excludedFiles,
  };
  const manifestFiles = files.map((record) => ({
    path: record.path,
    contentHash: record.contentHash,
    recordFile: cacheRecordFileName(record.path),
  }));
  const currentRecordFiles = new Set(manifestFiles.map((manifestFile) => manifestFile.recordFile));
  const staleRecordFiles = loadedCache.manifest?.files
    .filter((manifestFile) => !currentRecordFiles.has(manifestFile.recordFile))
    .map((manifestFile) => manifestFile.recordFile) || [];
  writeIndexCache(cacheDirectory, {
    schemaVersion,
    generatorVersion,
    repositoryHeadSha: inventory.repositoryHeadSha,
    dirtyTrackedPaths: inventory.dirtyTrackedPaths,
    files: manifestFiles,
  }, files, staleRecordFiles);

  const summary: IndexRunSummary = {
    requestedMode,
    mode: fullRebuild ? "full" : "incremental",
    trackedFiles: inventory.trackedFiles.length + excludedFiles.length,
    eligibleFiles: files.length,
    excludedFiles: excludedFiles.length,
    reparsed: plan.reparsedPaths.length,
    reused: plan.reusedPaths.length,
    added: plan.added,
    modified: plan.modified,
    hashChanged: plan.hashChanged,
    renamed: plan.renamed,
    deleted: plan.deletedPaths.length,
    cacheMissing: loadedCache.status === "missing",
    cacheRecovered: loadedCache.status === "corrupt",
    cacheInvalidated: loadedCache.status === "valid" && !versionMatches,
    reparsedPaths: plan.reparsedPaths,
    reusedPaths: plan.reusedPaths,
    renamedPaths: plan.renamedPaths,
    deletedPaths: plan.deletedPaths,
    elapsedMs: Date.now() - started,
  };
  return { index, summary, cacheDirectory };
}

export function formatRepositoryIndexSummary(result: RepositoryIndexResult): string {
  const { summary } = result;
  return [
    "RI-1 repository index updated",
    `mode=${summary.mode} requested=${summary.requestedMode}`,
    `head=${result.index.repositoryHeadSha} dirty_tracked=${result.index.dirtyTrackedPaths.length}`,
    `tracked=${summary.trackedFiles} eligible=${summary.eligibleFiles} excluded=${summary.excludedFiles}`,
    `reparsed=${summary.reparsed} reused=${summary.reused} added=${summary.added} modified=${summary.modified} hash_changed=${summary.hashChanged}`,
    `renamed=${summary.renamed} deleted=${summary.deleted}`,
    `cache=${result.cacheDirectory}`,
    `elapsed_ms=${summary.elapsedMs}`,
  ].join("\n");
}

export { cleanIndexCache };
export type { RepositoryIndexResult } from "./types.ts";
