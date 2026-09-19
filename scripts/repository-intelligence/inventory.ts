import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { lstatSync, readFileSync } from "node:fs";
import path from "node:path";
import { classifyTrackedPath, normalizeRepositoryPath } from "./classification.ts";
import type { ExcludedFileRecord, TrackedFileCandidate } from "./types.ts";

export interface TrackedFileInventory {
  readonly repositoryHeadSha: string;
  readonly dirtyTrackedPaths: readonly string[];
  readonly trackedFiles: readonly TrackedFileCandidate[];
  readonly excludedFiles: readonly ExcludedFileRecord[];
}

function git(rootDir: string, args: readonly string[]): string {
  try {
    return execFileSync("git", ["-C", rootDir, ...args], { encoding: "utf8" });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`RI-1 Git command failed (${args.join(" ")}): ${detail}`);
  }
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function findGitRoot(startDir: string): string {
  return git(path.resolve(startDir), ["rev-parse", "--show-toplevel"]).trim();
}

export function listTrackedPaths(rootDir: string): readonly string[] {
  const output = git(rootDir, ["ls-files", "-z"]);
  return output
    .split("\0")
    .map(normalizeRepositoryPath)
    .filter(Boolean)
    .sort(compareText);
}

export function listDirtyTrackedPaths(rootDir: string): readonly string[] {
  const output = git(rootDir, ["diff", "--name-only", "-z", "HEAD", "--"]);
  return [...new Set(
    output
      .split("\0")
      .map(normalizeRepositoryPath)
      .filter(Boolean),
  )].sort(compareText);
}

function hashContents(contents: Buffer): string {
  return createHash("sha256").update(contents).digest("hex");
}

function lineCount(contents: Buffer): number {
  if (contents.length === 0) return 0;
  return contents.toString("utf8").split(/\r?\n/).length;
}

function hasSensitiveOrBinaryContent(contents: Buffer): boolean {
  if (contents.includes(0)) return true;
  const text = contents.toString("utf8");
  if (text.includes("-----BEGIN PRIVATE KEY-----") || text.includes("-----BEGIN RSA PRIVATE KEY-----")) return true;
  if (/\b(?:AWS_SECRET_ACCESS_KEY|SUPABASE_SERVICE_ROLE_KEY|DATABASE_URL)\s*[:=]\s*[^\s]{16,}/i.test(text)) return true;
  if (/\b(?:sk_live|ghp_|xox[baprs]-)[A-Za-z0-9_-]{12,}/.test(text)) return true;
  return false;
}

function absolutePathFor(rootDir: string, relativePath: string): string {
  const root = path.resolve(rootDir);
  const absolutePath = path.resolve(root, ...relativePath.split("/"));
  if (absolutePath !== root && !absolutePath.startsWith(`${root}${path.sep}`)) {
    throw new Error(`Tracked path escapes repository root: ${relativePath}`);
  }
  return absolutePath;
}

export function collectTrackedFileInventory(rootDir: string): TrackedFileInventory {
  const resolvedRoot = path.resolve(rootDir);
  const repositoryHeadSha = git(resolvedRoot, ["rev-parse", "HEAD"]).trim() || "unknown";
  const dirtyTrackedPaths = listDirtyTrackedPaths(resolvedRoot);
  const trackedFiles: TrackedFileCandidate[] = [];
  const excludedFiles: ExcludedFileRecord[] = [];

  for (const relativePath of listTrackedPaths(resolvedRoot)) {
    const classification = classifyTrackedPath(relativePath);
    const absolutePath = absolutePathFor(resolvedRoot, relativePath);
    let fileStats;
    try {
      fileStats = lstatSync(absolutePath);
    } catch {
      excludedFiles.push({
        path: relativePath,
        classification: "excluded",
        language: classification.language,
        size: 0,
        reason: "tracked path is missing from the working tree",
      });
      continue;
    }

    if (!fileStats.isFile()) {
      excludedFiles.push({
        path: relativePath,
        classification: "excluded",
        language: classification.language,
        size: fileStats.size,
        reason: "tracked path is not a regular file",
      });
      continue;
    }

    if (!classification.eligible) {
      excludedFiles.push({
        path: relativePath,
        classification: classification.classification as ExcludedFileRecord["classification"],
        language: classification.language,
        size: fileStats.size,
        reason: classification.exclusionReason || "excluded by RI-1 policy",
      });
      continue;
    }

    let contents: Buffer;
    try {
      contents = readFileSync(absolutePath);
    } catch {
      excludedFiles.push({
        path: relativePath,
        classification: "excluded",
        language: classification.language,
        size: fileStats.size,
        reason: "file could not be read safely",
      });
      continue;
    }
    if (hasSensitiveOrBinaryContent(contents)) {
      excludedFiles.push({
        path: relativePath,
        classification: "excluded",
        language: classification.language,
        size: fileStats.size,
        reason: contents.includes(0) ? "binary content" : "high-confidence sensitive content pattern",
      });
      continue;
    }

    trackedFiles.push({
      path: relativePath,
      absolutePath,
      classification: classification.classification as TrackedFileCandidate["classification"],
      language: classification.language,
      size: fileStats.size,
      contentHash: hashContents(contents),
      lineCount: lineCount(contents),
      contents,
    });
  }

  return {
    repositoryHeadSha,
    dirtyTrackedPaths,
    trackedFiles: trackedFiles.sort((left, right) => compareText(left.path, right.path)),
    excludedFiles: excludedFiles.sort((left, right) => compareText(left.path, right.path)),
  };
}
