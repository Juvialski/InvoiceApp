import fs from 'node:fs';
import path from 'node:path';

export const DEFAULT_FAILURE_CONTEXT_LINES = 80;
export const DEFAULT_FAILURE_CONTEXT_CHARS = 12_000;

export interface NodeTestSummary {
  tests?: number;
  suites?: number;
  pass?: number;
  fail?: number;
  cancelled?: number;
  skipped?: number;
  todo?: number;
  durationMs?: number;
}

export interface FailureContextOptions {
  maxLines?: number;
  maxChars?: number;
  contextLines?: number;
}

export interface FailurePacketOptions extends FailureContextOptions {
  workflow?: string;
  step?: string;
  command?: string;
}

const FAILURE_MARKER = /(?:\bnot ok\b|\bERR_[A-Z0-9_]+\b|AssertionError|failureType:|error:|Error:|npm error|Process completed with exit code|(?:^|\s)(?:FAIL|FAILED)(?:\s|:|$))/i;
const WARNING_MARKER = /(?:\bwarning\b|ExperimentalWarning|DeprecationWarning|npm warn)/i;
const SUMMARY_LINE = /^(?:#|ℹ)\s+(?:tests|suites|pass|fail|cancelled|skipped|todo|duration_ms)\s+/;

function positiveInteger(value: number | undefined, fallback: number): number {
  return Number.isInteger(value) && Number(value) > 0 ? Number(value) : fallback;
}

function compactNumber(output: string, key: string): number | undefined {
  const matches = [...output.matchAll(new RegExp(`^(?:#|ℹ)\\s+${key}\\s+([0-9]+(?:\\.[0-9]+)?)\\s*$`, 'gm'))];
  const match = matches.at(-1);
  if (!match) return undefined;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : undefined;
}

export function parseNodeTestSummary(output: string): NodeTestSummary {
  return {
    tests: compactNumber(output, 'tests'),
    suites: compactNumber(output, 'suites'),
    pass: compactNumber(output, 'pass'),
    fail: compactNumber(output, 'fail'),
    cancelled: compactNumber(output, 'cancelled'),
    skipped: compactNumber(output, 'skipped'),
    todo: compactNumber(output, 'todo'),
    durationMs: compactNumber(output, 'duration_ms'),
  };
}

function mergeRanges(ranges: Array<[number, number]>): Array<[number, number]> {
  if (ranges.length === 0) return [];
  const sorted = ranges.sort((left, right) => left[0] - right[0]);
  const merged: Array<[number, number]> = [sorted[0]!];
  for (let index = 1; index < sorted.length; index += 1) {
    const current = sorted[index]!;
    const previous = merged[merged.length - 1]!;
    if (current[0] <= previous[1] + 1) {
      previous[1] = Math.max(previous[1], current[1]);
    } else {
      merged.push(current);
    }
  }
  return merged;
}

function fitTextToBudget(lines: readonly string[], maxLines: number, maxChars: number): string {
  const output: string[] = [];
  let characterCount = 0;
  let truncated = false;

  for (const line of lines) {
    if (output.length >= maxLines) {
      truncated = true;
      break;
    }
    const nextSize = characterCount + line.length + (output.length > 0 ? 1 : 0);
    if (nextSize > maxChars) {
      truncated = true;
      break;
    }
    output.push(line);
    characterCount = nextSize;
  }

  if (truncated) {
    const marker = '... [failure context truncated]';
    while (output.length > 0 && `${output.join('\n')}\n${marker}`.length > maxChars) output.pop();
    if (output.length < maxLines && marker.length <= maxChars) output.push(marker);
  }

  return output.join('\n');
}

/**
 * Extracts only the useful neighborhoods around failure markers plus the final
 * node:test summary. It is deliberately line- and character-bounded so an agent
 * never needs to ingest a complete CI/test log just to find one failure.
 */
export function extractFailureContext(log: string, options: FailureContextOptions = {}): string {
  const maxLines = positiveInteger(options.maxLines, DEFAULT_FAILURE_CONTEXT_LINES);
  const maxChars = positiveInteger(options.maxChars, DEFAULT_FAILURE_CONTEXT_CHARS);
  const contextLines = Math.min(20, positiveInteger(options.contextLines, 8));
  const lines = log.replaceAll('\r\n', '\n').split('\n');
  const ranges: Array<[number, number]> = [];

  for (let index = 0; index < lines.length; index += 1) {
    if (FAILURE_MARKER.test(lines[index]!)) {
      ranges.push([
        Math.max(0, index - contextLines),
        Math.min(lines.length - 1, index + contextLines),
      ]);
    }
  }

  if (ranges.length === 0) {
    const tailStart = Math.max(0, lines.length - Math.min(maxLines, 40));
    ranges.push([tailStart, lines.length - 1]);
  }

  const summaryIndexes = lines
    .map((line, index) => (SUMMARY_LINE.test(line) ? index : -1))
    .filter((index) => index >= 0);
  if (summaryIndexes.length > 0) {
    ranges.push([
      Math.max(0, summaryIndexes[0]! - 1),
      Math.min(lines.length - 1, summaryIndexes[summaryIndexes.length - 1]! + 1),
    ]);
  }

  const selected: string[] = [];
  const merged = mergeRanges(ranges);
  for (let rangeIndex = 0; rangeIndex < merged.length; rangeIndex += 1) {
    const [start, end] = merged[rangeIndex]!;
    if (rangeIndex > 0) selected.push('...');
    for (let lineIndex = start; lineIndex <= end; lineIndex += 1) selected.push(lines[lineIndex]!);
  }

  return fitTextToBudget(selected, maxLines, maxChars);
}

export function extractWarnings(log: string, maxWarnings = 8): string[] {
  const warnings: string[] = [];
  const seen = new Set<string>();
  for (const rawLine of log.replaceAll('\r\n', '\n').split('\n')) {
    const line = rawLine.trim();
    if (!line || !WARNING_MARKER.test(line) || seen.has(line)) continue;
    seen.add(line);
    warnings.push(line);
    if (warnings.length >= maxWarnings) break;
  }
  return warnings;
}

export function formatFailurePacket(log: string, options: FailurePacketOptions = {}): string {
  const excerpt = extractFailureContext(log, options);
  const lines = [
    '# Engoryx Failure Context',
    '',
    `- Workflow: ${options.workflow || 'unspecified'}`,
    `- Step: ${options.step || 'unspecified'}`,
    ...(options.command ? [`- Command: \`${options.command}\``] : []),
    `- Source log: ${log.length} characters`,
    `- Excerpt: ${excerpt.length} characters`,
    '',
    '```text',
    excerpt,
    '```',
  ];
  return lines.join('\n');
}

interface CliOptions extends FailurePacketOptions {
  file?: string;
}

export function failureContextUsage(): string {
  return [
    'Usage: npm.cmd run ci:failure-context -- [options]',
    '',
    'Input:',
    '  --file <path>       Read a CI/test log from a file',
    '  stdin               Used automatically when --file is omitted',
    '',
    'Metadata:',
    '  --workflow <name>   Workflow name shown in the packet',
    '  --step <name>       Failed step shown in the packet',
    '  --command <text>    Command shown in the packet',
    '',
    'Bounds:',
    `  --max-lines <n>     Maximum excerpt lines (default: ${DEFAULT_FAILURE_CONTEXT_LINES})`,
    `  --max-chars <n>     Maximum excerpt characters (default: ${DEFAULT_FAILURE_CONTEXT_CHARS})`,
    '  --context <n>       Lines around each failure marker (default: 8; max: 20)',
    '  --help              Show this help',
  ].join('\n');
}

function nextValue(args: readonly string[], index: number, flag: string): { value: string; nextIndex: number } {
  const value = args[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value.`);
  return { value, nextIndex: index + 1 };
}

function parseInteger(value: string, flag: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`${flag} requires a positive integer.`);
  return parsed;
}

export function parseFailureContextCli(args: readonly string[]): CliOptions & { help?: boolean } {
  const options: CliOptions = {};
  for (let index = 0; index < args.length; index += 1) {
    const raw = args[index]!;
    if (raw === '--help' || raw === '-h') return { ...options, help: true };
    const equals = raw.indexOf('=');
    const flag = equals >= 0 ? raw.slice(0, equals) : raw;
    let value = equals >= 0 ? raw.slice(equals + 1) : undefined;
    if (!value) {
      const result = nextValue(args, index, flag);
      value = result.value;
      index = result.nextIndex;
    }
    switch (flag) {
      case '--file': options.file = value; break;
      case '--workflow': options.workflow = value; break;
      case '--step': options.step = value; break;
      case '--command': options.command = value; break;
      case '--max-lines': options.maxLines = parseInteger(value, flag); break;
      case '--max-chars': options.maxChars = parseInteger(value, flag); break;
      case '--context': options.contextLines = parseInteger(value, flag); break;
      default: throw new Error(`Unknown failure-context option ${raw}.`);
    }
  }
  return options;
}

export function runFailureContextCli(args: readonly string[] = process.argv.slice(2)): void {
  const options = parseFailureContextCli(args);
  if (options.help) {
    process.stdout.write(`${failureContextUsage()}\n`);
    return;
  }
  const input = options.file
    ? fs.readFileSync(path.resolve(process.cwd(), options.file), 'utf8')
    : fs.readFileSync(0, 'utf8');
  process.stdout.write(`${formatFailurePacket(input, options)}\n`);
}

if (['ci-failure-context.ts', 'ci-failure-context.js'].includes(path.basename(process.argv[1] || ''))) {
  try {
    runFailureContextCli();
  } catch (error) {
    console.error(`CI Failure Context: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
