import { mkdirSync, writeFileSync } from 'node:fs';
import path, { basename, dirname, resolve } from 'node:path';
import {
  detectChangedFiles,
  selectImpactedTests,
  type ImpactSelectionResult,
} from './test-impact.ts';
import {
  generateWorkflowContext,
  type WorkflowContextPacket,
  type WorkflowContextSelectionInput,
} from './workflow-map/context.ts';
import { WORKFLOW_GRAPH } from './workflow-map/graph.ts';
import { WORKFLOW_MAP_REPOSITORY_ROOT } from './workflow-map/generate.ts';
import {
  readRepositoryMetadata,
  type RepositoryMetadata,
} from './workflow-map/repositoryContext.ts';
import type { WorkflowDomain } from './workflow-map/types.ts';

export const DEFAULT_AGENT_CONTEXT_BUDGET = 12_000;
export const MIN_AGENT_CONTEXT_BUDGET = 4_000;
export const MAX_AGENT_CONTEXT_BUDGET = 16_000;
export const DEFAULT_AGENT_WORKFLOW_BUDGET = 7_500;

export interface AgentContextCliArguments {
  readonly task?: string;
  readonly base?: string;
  readonly head?: string;
  readonly outPath?: string;
  readonly characterBudget: number;
  readonly includeDetectedChanges: boolean;
  readonly help: boolean;
  readonly selection: WorkflowContextSelectionInput;
}

export interface AgentContextFormatInput {
  readonly task?: string;
  readonly repository: RepositoryMetadata;
  readonly impact: ImpactSelectionResult;
  readonly workflow: WorkflowContextPacket;
}

const VALUE_FLAGS = new Set([
  '--task', '--node', '--domain', '--route', '--file', '--query', '--changed-file',
  '--hops', '--budget', '--base', '--head', '--out',
]);

function nextValue(args: readonly string[], index: number, flag: string): { value: string; nextIndex: number } {
  const value = args[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value.`);
  return { value, nextIndex: index + 1 };
}

function integerValue(value: string, flag: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) throw new Error(`${flag} requires an integer; received ${value}.`);
  return parsed;
}

function boundedBudget(value: number): number {
  if (value < MIN_AGENT_CONTEXT_BUDGET || value > MAX_AGENT_CONTEXT_BUDGET) {
    throw new Error(`--budget must be between ${MIN_AGENT_CONTEXT_BUDGET} and ${MAX_AGENT_CONTEXT_BUDGET} characters.`);
  }
  return value;
}

function normalizePath(value: string): string {
  return value.trim().replaceAll('\\', '/').replace(/^\.\//, '');
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values.map(normalizePath).filter(Boolean))];
}

function percent(part: number, total: number): string {
  return total > 0 ? `${((part / total) * 100).toFixed(1)}%` : '0.0%';
}

function fitToBudget(text: string, budget: number): string {
  if (text.length <= budget) return text;
  const marker = '\n... [agent context truncated to budget]\n';
  const available = Math.max(0, budget - marker.length);
  const candidate = text.slice(0, available);
  const lastNewline = candidate.lastIndexOf('\n');
  const body = lastNewline > Math.floor(available * 0.75) ? candidate.slice(0, lastNewline) : candidate;
  return `${body}${marker}`.slice(0, budget);
}

function compactList(values: readonly string[], limit: number): string[] {
  const selected = values.slice(0, limit);
  return values.length > limit
    ? [...selected, `... +${values.length - limit} more`]
    : selected;
}

function formatValidationRecommendation(impact: ImpactSelectionResult): string[] {
  const lines: string[] = [];
  if (impact.isFallback) {
    lines.push('- Application: `npm.cmd run test:full` (selector fallback is already justified).');
  } else {
    lines.push('- Application: focused/new tests while iterating, then `npm.cmd run test:affected:agent`.');
  }
  lines.push('- Lint: `npm.cmd run lint` once after implementation stabilizes.');
  lines.push('- Build: run only when production/runtime/UI integration is affected or required for PR handoff.');
  lines.push(impact.isDatabaseAffected
    ? '- Database: changed surface is DB/RLS/migration-affecting; run the required migration/runtime ladder.'
    : '- Database: unaffected; do not start Supabase containers or replay migrations for this change.');
  lines.push('- Final gate: exact-head PR CI; inspect only concrete failing jobs/steps.');
  return lines;
}

/**
 * Builds the single compact packet agents should consume instead of separately
 * rediscovering Git provenance, workflow-map scope, protected boundaries, and
 * impacted tests. The result is hard-capped by character budget.
 */
export function formatAgentContextPacket(input: AgentContextFormatInput, characterBudget = DEFAULT_AGENT_CONTEXT_BUDGET): string {
  const budget = boundedBudget(characterBudget);
  const { repository, impact, workflow } = input;
  const lines: string[] = [
    '# Engoryx Agent Context',
    '',
    ...(input.task ? [`Task: ${input.task}`, ''] : []),
    '## Provenance',
    `- Base: \`${impact.baseSha || 'unknown'}\``,
    `- Head: \`${impact.headSha || repository.headSha}\``,
    `- Branch: \`${repository.branch}\``,
    `- Working tree: ${repository.dirty ? 'dirty' : 'clean'}`,
    `- Changed files: ${impact.changedFiles.length}`,
    '',
    '## Change / validation impact',
    `- Test selector: ${impact.isFallback ? `FULL FALLBACK — ${impact.fallbackReason || 'unspecified reason'}` : 'selective'}`,
    `- Selected tests: ${impact.selectedTests.length}/${impact.totalAvailableTests} (${percent(impact.selectedTests.length, impact.totalAvailableTests)})`,
    `- Database / RLS / migrations: ${impact.isDatabaseAffected ? 'AFFECTED' : 'unaffected'}`,
  ];

  if (impact.changedFiles.length > 0) {
    lines.push('- Changed paths:');
    for (const file of compactList(impact.changedFiles, 12)) lines.push(`  - \`${file}\``);
  }

  lines.push('', '## Working set');
  lines.push(`- Seed nodes: ${workflow.selection.seedNodeIds.map((id) => `\`${id}\``).join(', ') || 'none'}`);
  lines.push('- Inspect first:');
  for (const file of compactList(workflow.inspectFiles, 8)) lines.push(`  - \`${file}\``);
  lines.push('- Workflow-relevant tests:');
  for (const test of compactList(workflow.relevantTests, 10)) lines.push(`  - \`${test}\``);
  lines.push('- Impact-selected tests:');
  for (const test of compactList(impact.selectedTests, 12)) lines.push(`  - \`${test}\``);

  lines.push('', '## Protected boundaries');
  if (workflow.protectedBoundaries.permissions.length > 0) {
    lines.push(`- Permissions: ${compactList(workflow.protectedBoundaries.permissions, 12).map((value) => `\`${value}\``).join(', ')}`);
  }
  if (workflow.protectedBoundaries.invariants.length > 0) {
    lines.push('- Invariants:');
    for (const invariant of workflow.protectedBoundaries.invariants.slice(0, 8)) {
      lines.push(`  - \`${invariant.invariantId}\`: ${invariant.label}`);
    }
    if (workflow.protectedBoundaries.invariants.length > 8) lines.push(`  - ... +${workflow.protectedBoundaries.invariants.length - 8} more`);
  }
  if (workflow.protectedBoundaries.guards.length > 0) {
    lines.push('- Guards / confirmations:');
    for (const guard of workflow.protectedBoundaries.guards.slice(0, 8)) {
      lines.push(`  - ${guard.kind}: ${guard.label}`);
    }
    if (workflow.protectedBoundaries.guards.length > 8) lines.push(`  - ... +${workflow.protectedBoundaries.guards.length - 8} more`);
  }

  lines.push('', '## Workflow neighborhood');
  for (const node of workflow.workflow.nodes.slice(0, 14)) {
    lines.push(`- [d${node.distance}] \`${node.nodeId}\` — ${node.label} (${node.domain}/${node.type})`);
  }
  if (workflow.workflow.nodes.length > 14) lines.push(`- ... +${workflow.workflow.nodes.length - 14} more nodes`);
  if (workflow.workflow.edges.length > 0) {
    lines.push('- Key edges:');
    for (const edge of workflow.workflow.edges.slice(0, 14)) {
      lines.push(`  - ${edge.kind}: \`${edge.source}\` -> \`${edge.target}\` — ${edge.label}`);
    }
    if (workflow.workflow.edges.length > 14) lines.push(`  - ... +${workflow.workflow.edges.length - 14} more edges`);
  }

  if (workflow.changedFileMapping.unmatched.length > 0) {
    lines.push('', '## Unmapped changed paths');
    for (const file of compactList(workflow.changedFileMapping.unmatched, 8)) lines.push(`- \`${file}\``);
    lines.push('- Treat unmapped paths as a reason for targeted source inspection, not automatic repository-wide exploration.');
  }

  lines.push('', '## Validation recommendation', ...formatValidationRecommendation(impact));
  lines.push('', '## Required verification');
  for (const requirement of workflow.requiredVerification) lines.push(`- ${requirement}`);
  lines.push('- Expand context only when a specific unresolved dependency, safety boundary, or failing evidence requires it.');

  return fitToBudget(lines.join('\n'), budget);
}

export function agentContextUsage(): string {
  return [
    'Usage: npm.cmd run agent:context -- [selectors] [options]',
    '',
    'Task / selectors:',
    '  --task <text>              Human-readable objective; also becomes query when --query is omitted',
    '  --node <id>                Exact workflow node ID',
    '  --domain <domain>          Workflow domain (for example finance, projects, workforce)',
    '  --route <id-or-path>       Route ID, canonical path, or path pattern',
    '  --file <repo/path>         Source/test reference; repeatable',
    '  --query <keywords>         Deterministic workflow-map task search',
    '  --changed                  Include detected diff paths as workflow selectors',
    '  --changed-file <path>      Explicit changed path; repeatable',
    '',
    'Git / bounds:',
    '  --base <ref>               Optional diff base; defaults to merge-base against main',
    '  --head <ref>               Optional diff head; defaults to HEAD',
    '  --hops <0|1|2>            Workflow neighborhood depth (default: 1)',
    `  --budget <chars>           Entire packet budget (default: ${DEFAULT_AGENT_CONTEXT_BUDGET}; ${MIN_AGENT_CONTEXT_BUDGET}-${MAX_AGENT_CONTEXT_BUDGET})`,
    '  --out <path>               Write packet to a file instead of stdout',
    '  --help                     Show this help',
  ].join('\n');
}

export function parseAgentContextCliArguments(args: readonly string[]): AgentContextCliArguments {
  const files: string[] = [];
  const changedFiles: string[] = [];
  let task: string | undefined;
  let nodeId: string | undefined;
  let domain: WorkflowDomain | undefined;
  let route: string | undefined;
  let query: string | undefined;
  let hops: number | undefined;
  let base: string | undefined;
  let head: string | undefined;
  let outPath: string | undefined;
  let includeDetectedChanges = false;
  let characterBudget = DEFAULT_AGENT_CONTEXT_BUDGET;
  let help = false;

  for (let index = 0; index < args.length; index += 1) {
    const raw = args[index]!;
    const equalsIndex = raw.indexOf('=');
    const flag = equalsIndex >= 0 ? raw.slice(0, equalsIndex) : raw;
    const inlineValue = equalsIndex >= 0 ? raw.slice(equalsIndex + 1) : undefined;
    if (flag === '--help' || flag === '-h') {
      help = true;
      continue;
    }
    if (flag === '--changed' || flag === '--changed-files') {
      includeDetectedChanges = true;
      continue;
    }
    if (!VALUE_FLAGS.has(flag)) throw new Error(`Unknown agent-context option ${raw}.`);
    let value = inlineValue;
    if (value === undefined) {
      const result = nextValue(args, index, flag);
      value = result.value;
      index = result.nextIndex;
    }
    if (!value.trim()) throw new Error(`${flag} requires a non-empty value.`);
    switch (flag) {
      case '--task': task = value; break;
      case '--node': nodeId = value; break;
      case '--domain': domain = value as WorkflowDomain; break;
      case '--route': route = value; break;
      case '--file': files.push(value); break;
      case '--query': query = value; break;
      case '--changed-file': changedFiles.push(value); break;
      case '--hops': hops = integerValue(value, flag); break;
      case '--budget': characterBudget = boundedBudget(integerValue(value, flag)); break;
      case '--base': base = value; break;
      case '--head': head = value; break;
      case '--out': outPath = value; break;
    }
  }

  if (hops !== undefined && (hops < 0 || hops > 2)) throw new Error('--hops must be 0, 1, or 2.');

  return {
    ...(task ? { task } : {}),
    ...(base ? { base } : {}),
    ...(head ? { head } : {}),
    ...(outPath ? { outPath } : {}),
    characterBudget,
    includeDetectedChanges,
    help,
    selection: {
      ...(nodeId ? { nodeId } : {}),
      ...(domain ? { domain } : {}),
      ...(route ? { route } : {}),
      ...(files.length ? { filePaths: files } : {}),
      ...((query || task) ? { query: query || task } : {}),
      ...(changedFiles.length ? { changedFilePaths: changedFiles, useChangedFiles: true } : {}),
      ...(hops !== undefined ? { hops } : {}),
    },
  };
}

function hasExplicitSelector(selection: WorkflowContextSelectionInput): boolean {
  return Boolean(
    selection.nodeId
    || selection.domain
    || selection.route
    || selection.query
    || selection.filePath
    || (selection.filePaths && selection.filePaths.length > 0)
    || (selection.changedFilePaths && selection.changedFilePaths.length > 0),
  );
}

export function runAgentContextCli(args: readonly string[] = process.argv.slice(2)): void {
  const parsed = parseAgentContextCliArguments(args);
  if (parsed.help) {
    process.stdout.write(`${agentContextUsage()}\n`);
    return;
  }

  const repository = readRepositoryMetadata(WORKFLOW_MAP_REPOSITORY_ROOT);
  const diff = detectChangedFiles({
    base: parsed.base,
    head: parsed.head,
    cwd: WORKFLOW_MAP_REPOSITORY_ROOT,
  });
  const impact = selectImpactedTests({
    changedFiles: diff.changedFiles,
    baseSha: diff.baseSha,
    headSha: diff.headSha,
    isFallback: diff.isFallback,
    fallbackReason: diff.fallbackReason,
    packageJsonChangedDepsOrScripts: diff.packageJsonChangedDepsOrScripts,
  });

  const detectedSelectors = parsed.includeDetectedChanges ? diff.changedFiles : [];
  const changedFilePaths = unique([
    ...(parsed.selection.changedFilePaths || []),
    ...detectedSelectors,
  ]);
  let selection: WorkflowContextSelectionInput = {
    ...parsed.selection,
    ...(changedFilePaths.length ? { changedFilePaths, useChangedFiles: true } : {}),
    characterBudget: Math.min(DEFAULT_AGENT_WORKFLOW_BUDGET, Math.max(1_024, parsed.characterBudget - 3_500)),
  };

  if (!hasExplicitSelector(selection) && diff.changedFiles.length > 0) {
    selection = {
      ...selection,
      changedFilePaths: diff.changedFiles,
      useChangedFiles: true,
    };
  }
  if (!hasExplicitSelector(selection)) {
    throw new Error('Provide --task/--query, --node, --domain, --route, --file, or --changed so the packet stays scoped.');
  }

  const workflow = generateWorkflowContext(WORKFLOW_GRAPH, selection, repository).packet;
  const output = formatAgentContextPacket({
    ...(parsed.task ? { task: parsed.task } : {}),
    repository,
    impact,
    workflow,
  }, parsed.characterBudget);

  if (!parsed.outPath || parsed.outPath === '-') {
    process.stdout.write(`${output}\n`);
    return;
  }
  const outputPath = resolve(process.cwd(), parsed.outPath);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, output, 'utf8');
  process.stdout.write(`Wrote agent context to ${outputPath} (${output.length} characters).\n`);
}

if (['agent-context.ts', 'agent-context.js'].includes(basename(process.argv[1] || path.sep))) {
  try {
    runAgentContextCli();
  } catch (error) {
    console.error(`Agent Context: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
