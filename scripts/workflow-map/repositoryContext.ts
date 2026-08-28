import { spawnSync } from "node:child_process";

export interface RepositoryCommandResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

export type RepositoryCommandRunner = (
  repositoryRoot: string,
  args: readonly string[],
) => RepositoryCommandResult;

export interface RepositoryMetadata {
  readonly headSha: string;
  readonly branch: string;
  readonly dirty: boolean;
  readonly changedFilePaths: readonly string[];
}

export interface RepositoryMetadataOptions {
  readonly runCommand?: RepositoryCommandRunner;
}

function runGitCommand(repositoryRoot: string, args: readonly string[]): RepositoryCommandResult {
  const result = spawnSync("git", [...args], {
    cwd: repositoryRoot,
    encoding: "utf8",
    windowsHide: true,
  });

  return {
    exitCode: result.status ?? 1,
    stdout: typeof result.stdout === "string" ? result.stdout : "",
    stderr: typeof result.stderr === "string" ? result.stderr : result.error?.message || "",
  };
}

function runRequiredGitCommand(
  repositoryRoot: string,
  args: readonly string[],
  runCommand: RepositoryCommandRunner,
  trimOutput = true,
): string {
  const result = runCommand(repositoryRoot, args);
  if (result.exitCode !== 0) {
    const detail = result.stderr.trim() || result.stdout.trim() || "no diagnostic output";
    throw new Error(`Git metadata command failed (${["git", ...args].join(" ")}): ${detail}`);
  }
  return trimOutput ? result.stdout.trim() : result.stdout;
}

function normalizeRepositoryPath(value: string): string {
  let normalized = value.trim().replaceAll("\\", "/");
  if (normalized.startsWith('"') && normalized.endsWith('"')) normalized = normalized.slice(1, -1);
  if (normalized.startsWith("./")) normalized = normalized.slice(2);
  return normalized;
}

function compareLex(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function parseChangedPaths(statusOutput: string): string[] {
  const paths = new Set<string>();
  for (const rawLine of statusOutput.split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    if (!line) continue;
    const pathPart = line.length >= 3 ? line.slice(3) : line;
    const renamedPath = pathPart.includes(" -> ") ? pathPart.slice(pathPart.lastIndexOf(" -> ") + 4) : pathPart;
    const normalized = normalizeRepositoryPath(renamedPath);
    if (normalized) paths.add(normalized);
  }
  return [...paths].sort(compareLex);
}

/**
 * Reads only lightweight local Git provenance. It never reads source files,
 * environment variables, remotes, commit messages, authors, or credentials.
 */
export function readRepositoryMetadata(
  repositoryRoot: string,
  options: RepositoryMetadataOptions = {},
): RepositoryMetadata {
  const runCommand = options.runCommand || runGitCommand;
  const headSha = runRequiredGitCommand(repositoryRoot, ["rev-parse", "HEAD"], runCommand);
  const branchOutput = runRequiredGitCommand(repositoryRoot, ["branch", "--show-current"], runCommand);
  const statusOutput = runRequiredGitCommand(repositoryRoot, ["status", "--porcelain=v1", "--untracked-files=all"], runCommand, false);

  return {
    headSha,
    // A detached checkout has no branch name; HEAD is more truthful than an
    // invented branch label and remains safe to put in an advisory packet.
    branch: branchOutput || "HEAD",
    dirty: statusOutput.trim().length > 0,
    changedFilePaths: parseChangedPaths(statusOutput),
  };
}

export const parseRepositoryChangedPaths = parseChangedPaths;
