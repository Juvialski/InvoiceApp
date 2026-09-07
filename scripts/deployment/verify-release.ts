import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseDeploymentManifest, recordDeploymentHealthVerification, verifyDeploymentHealth } from "../../src/lib/deploymentManifest.ts";

interface CliOptions {
  file: string;
  deploymentId: string;
  record: boolean;
  timeoutMs: number;
}

function usage() {
  console.log("Usage: npm.cmd run deployment:verify -- --file <deployment-inventory.json> --deployment <deployment-id> [--record] [--timeout-ms <ms>]");
}

function parseArgs(args: readonly string[]): CliOptions {
  let file = "";
  let deploymentId = "";
  let timeoutMs = 15_000;
  let record = false;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--file" && args[index + 1]) file = args[++index]!;
    else if (arg === "--deployment" && args[index + 1]) deploymentId = args[++index]!;
    else if (arg === "--timeout-ms" && args[index + 1]) timeoutMs = Number(args[++index]);
    else if (arg === "--record") record = true;
    else if (arg === "--help" || arg === "-h") { usage(); process.exit(0); }
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!file) throw new Error("--file <deployment-inventory.json> is required.");
  if (!deploymentId) throw new Error("--deployment <deployment-id> is required.");
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 60_000) throw new Error("--timeout-ms must be an integer from 1000 to 60000.");
  return { file, deploymentId, record, timeoutMs };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const filePath = path.resolve(process.cwd(), options.file);
  const manifest = parseDeploymentManifest(JSON.parse(readFileSync(filePath, "utf8")) as unknown);
  const entry = manifest.deployments.find((candidate) => candidate.deploymentId === options.deploymentId);
  if (!entry) throw new Error(`Deployment ${options.deploymentId} is not present in ${filePath}.`);
  if (!entry.productionUrl) throw new Error(`Deployment ${options.deploymentId} has no productionUrl; record the isolated deployment URL before verifying it.`);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs);
  let response: Response;
  let payload: unknown = null;
  try {
    response = await fetch(new URL("/api/health", entry.productionUrl), {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: controller.signal,
    });
    payload = await response.json().catch(() => null);
  } finally {
    clearTimeout(timeout);
  }

  const checkedAt = new Date().toISOString();
  const verification = verifyDeploymentHealth(entry, payload, checkedAt, response.status);
  const output = {
    deploymentId: entry.deploymentId,
    productionUrl: entry.productionUrl,
    status: verification.status,
    httpStatus: verification.httpStatus,
    checkedAt: verification.checkedAt,
    observed: {
      repositorySha: verification.observedRepositorySha,
      appVersion: verification.observedAppVersion,
      migrationLevel: verification.observedMigrationLevel,
      configurationVersion: verification.observedConfigurationVersion,
    },
    notes: verification.notes,
    recorded: options.record,
  };
  console.log(JSON.stringify(output, null, 2));

  if (options.record) {
    const updated = recordDeploymentHealthVerification(manifest, entry.deploymentId, verification);
    writeFileSync(filePath, `${JSON.stringify(updated, null, 2)}\n`, "utf8");
    console.log(`Recorded the verification result in ${filePath}.`);
  }
  if (verification.status !== "PASS") process.exitCode = 1;
}

main().catch((error) => {
  console.error(`Release verification failed: ${error instanceof Error ? error.message : "unknown error"}`);
  process.exitCode = 1;
});
