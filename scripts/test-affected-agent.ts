import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  detectChangedFiles,
  selectImpactedTests,
  writeGitHubStepSummary,
  type ImpactSelectionResult,
} from './test-impact.ts';
import {
  extractFailureContext,
  extractWarnings,
  parseNodeTestSummary,
} from './ci-failure-context.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');

export interface CompactTestExecutionResult {
  readonly exitCode: number;
  readonly command: string;
  readonly elapsedMs: number;
  readonly output: string;
}

function ratio(result: ImpactSelectionResult): string {
  return result.totalAvailableTests > 0
    ? `${((result.selectedTests.length / result.totalAvailableTests) * 100).toFixed(1)}%`
    : '0.0%';
}

export function formatAgentSelectionSummary(result: ImpactSelectionResult): string {
  return [
    'Engoryx affected-test selection',
    `base=${result.baseSha.slice(0, 10) || 'unknown'} head=${result.headSha.slice(0, 10) || 'unknown'}`,
    `changed_files=${result.changedFiles.length} selected_files=${result.selectedTests.length}/${result.totalAvailableTests} (${ratio(result)})`,
    `database=${result.isDatabaseAffected ? 'affected' : 'unaffected'} fallback=${result.isFallback ? 'yes' : 'no'}`,
    ...(result.isFallback ? [`fallback_reason=${result.fallbackReason || 'unspecified'}`] : []),
  ].join('\n');
}

function executeCommand(command: string, args: readonly string[], cwd: string): CompactTestExecutionResult {
  const started = Date.now();
  const isWindowsCommandShim = process.platform === 'win32' && command.toLowerCase().endsWith('.cmd');
  const spawnCommand = isWindowsCommandShim ? (process.env.ComSpec || 'cmd.exe') : command;
  const spawnArgs = isWindowsCommandShim ? ['/d', '/s', '/c', command, ...args] : [...args];
  const result = spawnSync(spawnCommand, spawnArgs, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: false,
    windowsHide: true,
    maxBuffer: 32 * 1024 * 1024,
  });
  const stdout = typeof result.stdout === 'string' ? result.stdout : '';
  const stderr = typeof result.stderr === 'string' ? result.stderr : '';
  return {
    exitCode: result.status ?? (result.error ? 1 : 0),
    command: [command, ...args].join(' '),
    elapsedMs: Date.now() - started,
    output: [stdout, stderr, result.error?.message || ''].filter(Boolean).join('\n'),
  };
}

export function executeAffectedTestsCompact(
  selection: ImpactSelectionResult,
  cwd: string = REPO_ROOT,
): CompactTestExecutionResult {
  if (selection.selectedTests.length === 0) {
    return { exitCode: 0, command: '(no tests selected)', elapsedMs: 0, output: '' };
  }

  if (selection.isFallback) {
    const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    return executeCommand(npmCommand, ['test'], cwd);
  }

  const args = ['--test', '--test-concurrency=1', '--experimental-strip-types'];
  if (selection.selectedTests.some((file) => file.endsWith('.tsx'))) args.push('--import', 'tsx');
  args.push(...selection.selectedTests);
  return executeCommand('node', args, cwd);
}

export function formatCompactExecutionResult(
  selection: ImpactSelectionResult,
  execution: CompactTestExecutionResult,
): string {
  const summary = parseNodeTestSummary(execution.output);
  const warnings = extractWarnings(execution.output);
  const elapsedSeconds = (execution.elapsedMs / 1000).toFixed(2);
  const lines = [
    execution.exitCode === 0 ? 'PASS affected application tests' : 'FAIL affected application tests',
    `files=${selection.selectedTests.length}/${selection.totalAvailableTests} tests=${summary.tests ?? '?'} pass=${summary.pass ?? '?'} fail=${summary.fail ?? '?'} skipped=${summary.skipped ?? 0}`,
    `elapsed=${elapsedSeconds}s database=${selection.isDatabaseAffected ? 'affected' : 'unaffected'} fallback=${selection.isFallback ? 'yes' : 'no'}`,
  ];

  if (selection.isFallback && selection.fallbackReason) lines.push(`fallback_reason=${selection.fallbackReason}`);
  if (warnings.length > 0) {
    lines.push('warnings:');
    for (const warning of warnings) lines.push(`- ${warning}`);
  }

  if (execution.exitCode !== 0) {
    lines.push(`command=${execution.command}`);
    lines.push('failure_context:');
    lines.push(extractFailureContext(execution.output, { maxLines: 100, maxChars: 12_000, contextLines: 8 }));
  }

  return lines.join('\n');
}

function valueAfter(args: readonly string[], flag: string): string | undefined {
  const equals = args.find((arg) => arg.startsWith(`${flag}=`));
  if (equals) return equals.slice(flag.length + 1);
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}

export function runAffectedAgentCli(args: readonly string[] = process.argv.slice(2)): void {
  if (args.includes('--help') || args.includes('-h')) {
    process.stdout.write([
      'Usage: npm.cmd run test:affected:agent -- [options]',
      '',
      'Runs the same deterministic impact selection as test:affected, but captures',
      'successful TAP output and emits only counts/warnings. Failures emit a bounded',
      'diagnostic excerpt instead of the complete log.',
      '',
      'Options:',
      '  --base <ref>          Optional diff base',
      '  --head <ref>          Optional diff head',
      '  --github-summary      Write the normal detailed selector summary to GITHUB_STEP_SUMMARY',
      '  --help                Show this help',
      '',
    ].join('\n'));
    return;
  }

  const diff = detectChangedFiles({
    base: valueAfter(args, '--base'),
    head: valueAfter(args, '--head'),
    cwd: REPO_ROOT,
  });
  const selection = selectImpactedTests({
    changedFiles: diff.changedFiles,
    baseSha: diff.baseSha,
    headSha: diff.headSha,
    isFallback: diff.isFallback,
    fallbackReason: diff.fallbackReason,
    packageJsonChangedDepsOrScripts: diff.packageJsonChangedDepsOrScripts,
  });

  process.stdout.write(`${formatAgentSelectionSummary(selection)}\n`);
  if (args.includes('--github-summary') || Boolean(process.env.GITHUB_STEP_SUMMARY)) writeGitHubStepSummary(selection);

  const execution = executeAffectedTestsCompact(selection, REPO_ROOT);
  process.stdout.write(`${formatCompactExecutionResult(selection, execution)}\n`);
  process.exitCode = execution.exitCode;
}

if (['test-affected-agent.ts', 'test-affected-agent.js'].includes(path.basename(process.argv[1] || ''))) {
  try {
    runAffectedAgentCli();
  } catch (error) {
    console.error(`Affected Agent Tests: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
