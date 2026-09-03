import { mkdirSync, writeFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { WORKFLOW_GRAPH } from "./p2-graph.ts";
import { WORKFLOW_MAP_REPOSITORY_ROOT } from "./generate.ts";
import {
  generateP2WorkflowContext,
  type WorkflowContextSelectionInput,
} from "./p2-context.ts";
import { readRepositoryMetadata } from "./repositoryContext.ts";
import type { WorkflowDomain } from "./types.ts";

export interface ParsedContextCliArguments {
  readonly format: "markdown" | "json";
  readonly outPath?: string;
  readonly includeRepositoryChanges: boolean;
  readonly selection: WorkflowContextSelectionInput;
}

const VALUE_FLAGS = new Set(["--node", "--domain", "--route", "--file", "--query", "--changed-file", "--hops", "--budget", "--format", "--out"]);

function nextValue(args: readonly string[], index: number, flag: string): { value: string; nextIndex: number } {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value.`);
  return { value, nextIndex: index + 1 };
}

function integerValue(value: string, flag: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) throw new Error(`${flag} requires an integer; received ${value}.`);
  return parsed;
}

export function contextCliUsage(): string {
  return [
    "Usage: npm.cmd run workflow-map:context -- [selectors] [options]",
    "",
    "Selectors:",
    "  --node <id>                 Exact workflow node ID",
    "  --domain <domain>           Workflow domain; includes procurement and commercial",
    "  --route <id-or-path>         Route ID, canonical path, or path pattern",
    "  --file <repo/path>           Source/test reference; repeatable",
    "  --query <keywords>           Deterministic lexical task search",
    "  --changed                    Use locally changed Git paths as selectors",
    "  --changed-file <repo/path>   Explicit changed path; repeatable",
    "",
    "Bounding/output:",
    "  --hops <0|1|2>               Neighborhood depth (default: 1)",
    "  --budget <chars>             Character budget (default: 10000; max: 20000)",
    "  --format <markdown|json>     Output format (default: markdown)",
    "  --json                       Shorthand for --format json",
    "  --out <path>                 Write an explicitly requested output file",
    "  --help                       Show this help",
    "",
    "Examples:",
    "  npm.cmd run workflow-map:context -- --domain procurement --query \"purchase order approval\"",
    "  npm.cmd run workflow-map:context -- --domain commercial --query \"subcontract variations\"",
  ].join("\n");
}

export function parseContextCliArguments(args: readonly string[]): ParsedContextCliArguments {
  const files: string[] = [];
  const changedFiles: string[] = [];
  let nodeId: string | undefined;
  let domain: WorkflowDomain | undefined;
  let route: string | undefined;
  let query: string | undefined;
  let hops: number | undefined;
  let budget: number | undefined;
  let format: "markdown" | "json" = "markdown";
  let outPath: string | undefined;
  let includeRepositoryChanges = false;

  for (let index = 0; index < args.length; index++) {
    const rawArg = args[index]!;
    const equalsIndex = rawArg.indexOf("=");
    const flag = equalsIndex >= 0 ? rawArg.slice(0, equalsIndex) : rawArg;
    const inlineValue = equalsIndex >= 0 ? rawArg.slice(equalsIndex + 1) : undefined;
    if (flag === "--help" || flag === "-h") {
      return { format, outPath, includeRepositoryChanges, selection: { query: "__HELP__" } };
    }
    if (flag === "--changed" || flag === "--changed-files") {
      includeRepositoryChanges = true;
      continue;
    }
    if (flag === "--json") {
      format = "json";
      continue;
    }
    if (!VALUE_FLAGS.has(flag)) throw new Error(`Unknown context option ${rawArg}.\n\n${contextCliUsage()}`);
    let value = inlineValue;
    if (value === undefined) {
      const result = nextValue(args, index, flag);
      value = result.value;
      index = result.nextIndex;
    }
    if (!value.trim()) throw new Error(`${flag} requires a non-empty value.`);
    switch (flag) {
      case "--node": nodeId = value; break;
      case "--domain": domain = value as WorkflowDomain; break;
      case "--route": route = value; break;
      case "--file": files.push(value); break;
      case "--query": query = value; break;
      case "--changed-file": changedFiles.push(value); break;
      case "--hops": hops = integerValue(value, flag); break;
      case "--budget": budget = integerValue(value, flag); break;
      case "--format":
        if (value !== "markdown" && value !== "json") throw new Error(`--format must be markdown or json; received ${value}.`);
        format = value;
        break;
      case "--out": outPath = value; break;
    }
  }

  return {
    format,
    ...(outPath ? { outPath } : {}),
    includeRepositoryChanges,
    selection: {
      ...(nodeId ? { nodeId } : {}),
      ...(domain ? { domain } : {}),
      ...(route ? { route } : {}),
      ...(files.length ? { filePaths: files } : {}),
      ...(query ? { query } : {}),
      ...(changedFiles.length ? { changedFilePaths: changedFiles, useChangedFiles: true } : {}),
      ...(hops !== undefined ? { hops } : {}),
      ...(budget !== undefined ? { characterBudget: budget } : {}),
    },
  };
}

export function runContextCli(args: readonly string[] = process.argv.slice(2)): void {
  const parsed = parseContextCliArguments(args);
  if (parsed.selection.query === "__HELP__") {
    process.stdout.write(`${contextCliUsage()}\n`);
    return;
  }
  const repository = readRepositoryMetadata(WORKFLOW_MAP_REPOSITORY_ROOT);
  const changedFilePaths = [
    ...(parsed.selection.changedFilePaths || []),
    ...(parsed.includeRepositoryChanges ? repository.changedFilePaths : []),
  ];
  const result = generateP2WorkflowContext(
    WORKFLOW_GRAPH,
    {
      ...parsed.selection,
      ...(changedFilePaths.length ? { changedFilePaths, useChangedFiles: true } : {}),
      ...(parsed.includeRepositoryChanges ? { useChangedFiles: true } : {}),
    },
    repository,
  );
  const output = parsed.format === "json" ? result.json : result.markdown;
  if (!parsed.outPath || parsed.outPath === "-") {
    process.stdout.write(output);
    return;
  }
  const outputPath = resolve(process.cwd(), parsed.outPath);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, output, "utf8");
  process.stdout.write(`Wrote ${parsed.format} workflow context to ${outputPath} (${output.length} characters).\n`);
}

if (basename(process.argv[1] || "") === "context-cli.ts") {
  try {
    runContextCli();
  } catch (error) {
    console.error(`Workflow Map Context: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
