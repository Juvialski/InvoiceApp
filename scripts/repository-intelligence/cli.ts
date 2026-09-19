import path from "node:path";
import { fileURLToPath } from "node:url";
import { cleanIndexCache, loadIndexCache } from "./cache.ts";
import { findGitRoot } from "./inventory.ts";
import { buildRepositoryIndex, formatRepositoryIndexSummary, getDefaultCacheDirectory } from "./indexer.ts";
import type { RepositoryIndexMode } from "./types.ts";

export interface RepositoryIntelligenceCliArguments {
  readonly command: "index" | "clean" | "status" | "help";
  readonly rootDir?: string;
  readonly cacheDir?: string;
  readonly mode: RepositoryIndexMode;
  readonly json: boolean;
}

function valueAfter(args: readonly string[], flag: string): string {
  const index = args.indexOf(flag);
  const value = index >= 0 ? args[index + 1] : undefined;
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value.`);
  return value;
}

export function parseRepositoryIntelligenceCliArguments(args: readonly string[]): RepositoryIntelligenceCliArguments {
  const commandValue = args[0] && !args[0].startsWith("--") ? args[0] : "index";
  const command = commandValue === "update" ? "index" : commandValue;
  if (command !== "index" && command !== "clean" && command !== "status" && command !== "help") {
    throw new Error(`Unknown repo-intel command: ${commandValue}`);
  }
  return {
    command,
    rootDir: args.includes("--root") ? valueAfter(args, "--root") : undefined,
    cacheDir: args.includes("--cache") ? valueAfter(args, "--cache") : undefined,
    mode: args.includes("--full") ? "full" : "incremental",
    json: args.includes("--json"),
  };
}

function printHelp(): void {
  process.stdout.write([
    "Usage: npm.cmd run repo-intel:index -- [index|update|clean|status] [options]",
    "",
    "Commands:",
    "  index, update  Build or incrementally update the local RI-1 index (default)",
    "  clean          Delete the disposable local RI-1 cache",
    "  status         Report cache metadata without indexing source files",
    "",
    "Options:",
    "  --full         Force a full rebuild",
    "  --root <path>  Repository root (defaults to the current Git repository)",
    "  --cache <path> Override the disposable cache directory",
    "  --json         Emit machine-readable summary JSON where supported",
    "  --help         Show this help",
    "",
  ].join("\n"));
}

export function runRepositoryIntelligenceCli(args: readonly string[] = process.argv.slice(2)): void {
  if (args.includes("--help") || args.includes("-h")) {
    printHelp();
    return;
  }
  const parsed = parseRepositoryIntelligenceCliArguments(args);
  if (parsed.command === "help") {
    printHelp();
    return;
  }
  const rootDir = parsed.rootDir ? path.resolve(parsed.rootDir) : findGitRoot(process.cwd());
  const cacheDir = path.resolve(parsed.cacheDir || getDefaultCacheDirectory(rootDir));

  if (parsed.command === "clean") {
    cleanIndexCache(cacheDir);
    process.stdout.write(`RI-1 cache cleaned\ncache=${cacheDir}\n`);
    return;
  }
  if (parsed.command === "status") {
    const cache = loadIndexCache(cacheDir);
    const output = cache.status === "valid" && cache.manifest
      ? {
        status: cache.status,
        schemaVersion: cache.manifest.schemaVersion,
        generatorVersion: cache.manifest.generatorVersion,
        repositoryHeadSha: cache.manifest.repositoryHeadSha,
        indexedFiles: cache.manifest.files.length,
        cache: cacheDir,
      }
      : { status: cache.status, indexedFiles: 0, cache: cacheDir };
    process.stdout.write(parsed.json ? `${JSON.stringify(output)}\n` : `${Object.entries(output).map(([key, value]) => `${key}=${value}`).join("\n")}\n`);
    return;
  }

  const result = buildRepositoryIndex({ rootDir, cacheDir, mode: parsed.mode });
  process.stdout.write(parsed.json ? `${JSON.stringify({ ...result.summary, cache: result.cacheDirectory, head: result.index.repositoryHeadSha })}\n` : `${formatRepositoryIndexSummary(result)}\n`);
}

if (path.basename(process.argv[1] || "") === path.basename(fileURLToPath(import.meta.url))) {
  try {
    runRepositoryIntelligenceCli();
  } catch (error) {
    console.error(`RI-1: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
