import { readFileSync } from "node:fs";
import path from "node:path";
import { buildTypesafeContextCommand } from "./contextCommand.ts";
import { runTypesafeBenchmark } from "./benchmark.ts";
import { classifyCiFailure } from "./ciTriage.ts";
import { checkCompletionEvidence } from "./completionCheck.ts";
import { runTypeSafeDoctor } from "./doctor.ts";
import { triageAffectedTests } from "./testTriage.ts";
import type { WorkflowDomain } from "../../workflow-map/types.ts";
import type { CompletionEvidenceCategory, CompletionCheckInput } from "./completionCheck.ts";

export type TypesafeCliCommand = "doctor" | "context" | "test-triage" | "ci-triage" | "completion" | "benchmark" | "help";

export interface TypesafeCliArguments {
  readonly command: TypesafeCliCommand;
  readonly live: boolean;
  readonly json: boolean;
  readonly task?: string;
  readonly domain?: string;
  readonly query?: string;
  readonly inputPath?: string;
  readonly filePath?: string;
  readonly maxSelected?: number;
}

function valueAfter(args: readonly string[], index: number, flag: string): { value: string; nextIndex: number } {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value.`);
  return { value, nextIndex: index + 1 };
}

function positiveInteger(value: string, flag: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`${flag} requires a positive integer.`);
  return parsed;
}

export function parseTypesafeCliArguments(args: readonly string[]): TypesafeCliArguments {
  const commandValue = args[0] && !args[0].startsWith("--") ? args[0] : "help";
  const allowed: readonly TypesafeCliCommand[] = ["doctor", "context", "test-triage", "ci-triage", "completion", "benchmark", "help"];
  if (!allowed.includes(commandValue as TypesafeCliCommand)) throw new Error(`Unknown TypeSafe command: ${commandValue}`);
  let live = false;
  let json = false;
  let task: string | undefined;
  let domain: string | undefined;
  let query: string | undefined;
  let inputPath: string | undefined;
  let filePath: string | undefined;
  let maxSelected: number | undefined;
  for (let index = 1; index < args.length; index += 1) {
    const raw = args[index]!;
    if (raw === "--live") { live = true; continue; }
    if (raw === "--json") { json = true; continue; }
    const equals = raw.indexOf("=");
    const flag = equals >= 0 ? raw.slice(0, equals) : raw;
    let value = equals >= 0 ? raw.slice(equals + 1) : undefined;
    if (value === undefined) {
      const result = valueAfter(args, index, flag);
      value = result.value;
      index = result.nextIndex;
    }
    if (!value.trim()) throw new Error(`${flag} requires a non-empty value.`);
    switch (flag) {
      case "--task": task = value; break;
      case "--domain": domain = value; break;
      case "--query": query = value; break;
      case "--input": inputPath = value; break;
      case "--file": filePath = value; break;
      case "--max-selected": maxSelected = positiveInteger(value, flag); break;
      default: throw new Error(`Unknown TypeSafe option ${raw}.`);
    }
  }
  return {
    command: commandValue as TypesafeCliCommand,
    live,
    json,
    ...(task ? { task } : {}),
    ...(domain ? { domain } : {}),
    ...(query ? { query } : {}),
    ...(inputPath ? { inputPath } : {}),
    ...(filePath ? { filePath } : {}),
    ...(maxSelected === undefined ? {} : { maxSelected }),
  };
}

export function typesafeCliUsage(): string {
  return [
    "Usage: npm.cmd run typesafe -- <doctor|context|test-triage|ci-triage|completion|benchmark> [options]",
    "",
    "Live requests require the explicit --live flag; normal tests and CI stay offline.",
    "  doctor [--live]",
    "  context --task <text> [--domain <domain>] [--max-selected <n>] [--live]",
    "  test-triage --input <json> [--live]",
    "  ci-triage --file <log> [--live]",
    "  completion --input <json> [--live]",
    "  benchmark [--live]",
  ].join("\n");
}

function inputJson(inputPath: string): Record<string, unknown> {
  const value = JSON.parse(readFileSync(path.resolve(process.cwd(), inputPath), "utf8")) as unknown;
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("TypeSafe input JSON must be an object.");
  return value as Record<string, unknown>;
}

function output(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

export async function runTypesafeCli(args: readonly string[] = process.argv.slice(2)): Promise<void> {
  const parsed = parseTypesafeCliArguments(args);
  if (parsed.command === "help") {
    process.stdout.write(`${typesafeCliUsage()}\n`);
    return;
  }
  if (parsed.command === "doctor") {
    output(await runTypeSafeDoctor({ live: parsed.live }));
    return;
  }
  if (parsed.command === "benchmark") {
    output(await runTypesafeBenchmark({ mode: parsed.live ? "live" : "mock" }));
    return;
  }
  if (parsed.command === "context") {
    if (!parsed.task) throw new Error("context requires --task.");
    output(await buildTypesafeContextCommand({ task: parsed.task, query: parsed.query, domain: parsed.domain as WorkflowDomain | undefined, maxSelected: parsed.maxSelected, live: parsed.live, useChangedFiles: true }));
    return;
  }
  if (parsed.command === "ci-triage") {
    const excerpt = parsed.filePath ? readFileSync(path.resolve(process.cwd(), parsed.filePath), "utf8") : readFileSync(0, "utf8");
    output(await classifyCiFailure({ excerpt, task: parsed.task, live: parsed.live }));
    return;
  }
  if (!parsed.inputPath) throw new Error(`${parsed.command} requires --input <json>.`);
  const input = inputJson(parsed.inputPath);
  if (parsed.command === "test-triage") {
    output(await triageAffectedTests({ task: String(input.task || parsed.task || "TypeSafe test triage"), selection: input.selection as never, live: parsed.live }));
    return;
  }
  const completionInput: CompletionCheckInput = {
    taskScope: String(input.taskScope || parsed.task || "TypeSafe completion evidence"),
    changedFileCategories: Array.isArray(input.changedFileCategories) ? input.changedFileCategories.map(String) : [],
    validation: typeof input.validation === "object" && input.validation !== null && !Array.isArray(input.validation)
      ? Object.fromEntries(Object.entries(input.validation).map(([key, value]) => [key, String(value)]))
      : {},
    declaredEvidence: Array.isArray(input.declaredEvidence) ? input.declaredEvidence.map(String) : [],
    ...(Array.isArray(input.expectedEvidence) ? { expectedEvidence: input.expectedEvidence.map(String) as CompletionEvidenceCategory[] } : {}),
    live: parsed.live,
  };
  output(await checkCompletionEvidence(completionInput));
}

if (path.basename(process.argv[1] || "") === "cli.ts") {
  runTypesafeCli().catch((error: unknown) => {
    process.stderr.write(`${JSON.stringify({ ok: false, errorType: error instanceof Error ? error.constructor.name : "UnknownError" })}\n`);
    process.exitCode = 1;
  });
}
