import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import type {
  CacheManifestFile,
  FileIndexRecord,
  RepositoryIndexCacheManifest,
} from "./types.ts";

export const CACHE_MANIFEST_FILE = "manifest.json" as const;
export const CACHE_RECORDS_DIRECTORY = "records" as const;

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export type CacheLoadStatus = "missing" | "corrupt" | "valid";

export interface LoadedIndexCache {
  readonly status: CacheLoadStatus;
  readonly manifest?: RepositoryIndexCacheManifest;
  readonly records: ReadonlyMap<string, FileIndexRecord>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseManifest(value: unknown): RepositoryIndexCacheManifest | undefined {
  if (!isRecord(value)) return undefined;
  if (typeof value.schemaVersion !== "number" || typeof value.generatorVersion !== "string" || typeof value.repositoryHeadSha !== "string") return undefined;
  if (!Array.isArray(value.dirtyTrackedPaths) || value.dirtyTrackedPaths.some((item) => typeof item !== "string")) return undefined;
  if (!Array.isArray(value.files)) return undefined;
  const files: CacheManifestFile[] = [];
  for (const item of value.files) {
    if (!isRecord(item) || typeof item.path !== "string" || typeof item.contentHash !== "string" || typeof item.recordFile !== "string") return undefined;
    if (item.recordFile !== cacheRecordFileName(item.path)) return undefined;
    files.push({ path: item.path, contentHash: item.contentHash, recordFile: item.recordFile });
  }
  return {
    schemaVersion: value.schemaVersion,
    generatorVersion: value.generatorVersion,
    repositoryHeadSha: value.repositoryHeadSha,
    dirtyTrackedPaths: [...value.dirtyTrackedPaths].sort(compareText),
    files,
  };
}

function parseFileRecord(value: unknown): FileIndexRecord | undefined {
  if (!isRecord(value)) return undefined;
  if (typeof value.schemaVersion !== "number" || typeof value.generatorVersion !== "string" || typeof value.path !== "string"
    || typeof value.classification !== "string" || typeof value.language !== "string" || typeof value.size !== "number"
    || typeof value.lineCount !== "number" || typeof value.contentHash !== "string" || !Array.isArray(value.symbols)
    || !Array.isArray(value.imports) || !Array.isArray(value.exports) || !Array.isArray(value.reExports)) return undefined;
  return value as unknown as FileIndexRecord;
}

export function cacheRecordFileName(relativePath: string): string {
  return `${createHash("sha256").update(relativePath).digest("hex")}.json`;
}

export function cacheManifestPath(cacheDir: string): string {
  return path.join(cacheDir, CACHE_MANIFEST_FILE);
}

export function loadIndexCache(cacheDir: string): LoadedIndexCache {
  const manifestPath = cacheManifestPath(cacheDir);
  if (!existsSync(manifestPath)) return { status: "missing", records: new Map() };
  try {
    const manifest = parseManifest(JSON.parse(readFileSync(manifestPath, "utf8")) as unknown);
    if (!manifest) return { status: "corrupt", records: new Map() };
    const records = new Map<string, FileIndexRecord>();
    for (const manifestFile of manifest.files) {
      const recordPath = path.join(cacheDir, CACHE_RECORDS_DIRECTORY, manifestFile.recordFile);
      const record = parseFileRecord(JSON.parse(readFileSync(recordPath, "utf8")) as unknown);
      if (!record || record.path !== manifestFile.path || record.contentHash !== manifestFile.contentHash) {
        return { status: "corrupt", records: new Map() };
      }
      records.set(record.path, record);
    }
    return { status: "valid", manifest, records };
  } catch {
    return { status: "corrupt", records: new Map() };
  }
}

function writeJsonAtomically(filePath: string, value: unknown): void {
  const temporaryPath = `${filePath}.tmp-${process.pid}`;
  writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  rmSync(filePath, { force: true });
  writeFileSync(filePath, readFileSync(temporaryPath));
  unlinkSync(temporaryPath);
}

export function writeIndexCache(
  cacheDir: string,
  manifest: RepositoryIndexCacheManifest,
  records: readonly FileIndexRecord[],
  staleRecordFiles: readonly string[] = [],
): void {
  const recordsDir = path.join(cacheDir, CACHE_RECORDS_DIRECTORY);
  mkdirSync(recordsDir, { recursive: true });
  const sortedRecords = [...records].sort((left, right) => compareText(left.path, right.path));
  for (const record of sortedRecords) {
    writeJsonAtomically(path.join(recordsDir, cacheRecordFileName(record.path)), record);
  }
  for (const staleRecordFile of [...new Set(staleRecordFiles)]) {
    if (staleRecordFile) rmSync(path.join(recordsDir, staleRecordFile), { force: true });
  }
  writeJsonAtomically(cacheManifestPath(cacheDir), {
    ...manifest,
    files: [...manifest.files].sort((left, right) => compareText(left.path, right.path)),
  });
}

export function cleanIndexCache(cacheDir: string): void {
  rmSync(cacheDir, { force: true, recursive: true });
}
