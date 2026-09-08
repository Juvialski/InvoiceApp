import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { parseDeploymentManifest } from "../../src/lib/deploymentManifest.ts";
import { buildDeploymentTransferPreflight, type TransferPreflightReport } from "../../src/lib/deploymentTransferPreflight.ts";

interface CliOptions {
  file: string;
  deploymentId: string;
  json: boolean;
}

function usage() {
  console.log("Usage: npm.cmd run deployment:transfer-preflight -- --file <private-inventory-file> [--deployment <deployment-id>] [--json]");
  console.log("Read-only: validates local inventory metadata, repository/migration identity and records manual checks; it does not call or mutate Supabase, Render, Storage, or provider configuration.");
}

function parseArgs(args: readonly string[]): CliOptions {
  let file = "";
  let deploymentId = "";
  let json = false;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--file" && args[index + 1]) file = args[++index]!;
    else if (arg === "--deployment" && args[index + 1]) deploymentId = args[++index]!;
    else if (arg === "--json") json = true;
    else if (arg === "--help" || arg === "-h") { usage(); process.exit(0); }
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!file) throw new Error("--file <private-inventory-file> is required.");
  return { file, deploymentId, json };
}

function currentRepositorySha(root: string) {
  try {
    const value = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim().toLowerCase();
    return /^[0-9a-f]{40}$/.test(value) ? value : null;
  } catch {
    return null;
  }
}

function knownMigrationLevels(root: string) {
  const directory = path.join(root, "supabase", "migrations");
  try {
    return readdirSync(directory).filter((name) => name.endsWith(".sql")).sort();
  } catch {
    return [];
  }
}

function environmentVariableNames(root: string) {
  try {
    const content = readFileSync(path.join(root, ".env.example"), "utf8");
    return [...new Set(content.split(/\r?\n/).flatMap((line) => {
      const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(line);
      return match ? [match[1]!] : [];
    }))].sort();
  } catch {
    return [];
  }
}

function printHuman(report: TransferPreflightReport) {
  console.log("HydroQualiSense Client A Supabase transfer preflight");
  console.log("READ ONLY: no Supabase, Render, Storage, provider API, or inventory write was performed.");
  console.log(`Deployment: ${report.deploymentId} · ${report.clientName} · ${report.environment}`);
  console.log("");
  for (const item of report.checks) {
    console.log(`${item.status.padEnd(22)} ${item.label}: ${item.detail}`);
  }
  console.log("");
  console.log(`Summary: PASS=${report.summary.pass} BLOCKED=${report.summary.blocked} MANUAL CHECK REQUIRED=${report.summary.manual}`);
  console.log(`OVERALL: ${report.summary.overall}`);
}

function exitCode(report: TransferPreflightReport) {
  return report.summary.blocked > 0 ? 1 : report.summary.manual > 0 ? 2 : 0;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const root = process.cwd();
  const filePath = path.resolve(root, options.file);
  const inventory = parseDeploymentManifest(JSON.parse(readFileSync(filePath, "utf8")) as unknown);
  const migrations = knownMigrationLevels(root);
  const report = buildDeploymentTransferPreflight({
    manifest: inventory,
    deploymentId: options.deploymentId || undefined,
    currentRepositorySha: currentRepositorySha(root),
    latestMigrationLevel: migrations[migrations.length - 1] || null,
    knownMigrationLevels: migrations,
    environmentVariableNames: environmentVariableNames(root),
  });
  if (options.json) console.log(JSON.stringify(report, null, 2));
  else printHuman(report);
  process.exitCode = exitCode(report);
}

try {
  main();
} catch (error) {
  console.error(`Transfer preflight could not run: ${error instanceof Error ? error.message : "unknown error"}`);
  process.exitCode = 1;
}
