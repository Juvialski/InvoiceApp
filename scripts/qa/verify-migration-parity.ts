import { appendFileSync } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { canonicalMigrationLevels } from "../../src/server/repositoryMigrationLevel.ts";
import {
  buildQaSessionPoolerDatabaseUrl,
  HYDROQUALISENSE_QA_POOLER_HOST,
  validateQaReleaseIdentity,
} from "../../src/lib/qaReleaseOrchestration.ts";
import { normalizeErrorMessage, redactSensitiveText } from "./structuredEvidence.ts";
import { runSupabaseCli } from "./supabaseCli.ts";
import { evaluateMigrationParity, parseSupabaseMigrationList, type MigrationParityResult } from "../../src/lib/qaReleaseOrchestration.ts";

type Phase = "before" | "after";

function option(name: string, fallback: string): string {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1]!.trim() : fallback;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(name);
}

function requiredEnvironment(name: string): string {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`Missing protected QA configuration: ${name}.`);
  return value;
}

async function readLinkedProjectRef(): Promise<string> {
  try {
    return (await readFile(path.join(process.cwd(), "supabase", ".temp", "project-ref"), "utf8")).trim();
  } catch {
    return "";
  }
}

function writeGithubOutput(values: Record<string, string>): void {
  const outputPath = String(process.env.GITHUB_OUTPUT || "").trim();
  if (!outputPath) return;
  const lines = Object.entries(values).map(([key, value]) => `${key}=${value}`);
  appendFileSync(outputPath, `${lines.join("\n")}\n`, "utf8");
}

async function repositoryMigrationLevels(): Promise<string[]> {
  const entries = await readdir(path.join(process.cwd(), "supabase", "migrations"), { withFileTypes: true });
  return canonicalMigrationLevels(entries.filter((entry) => entry.isFile()).map((entry) => entry.name));
}

function safeCliFailure(error: unknown): string {
  const message = redactSensitiveText(normalizeErrorMessage(error, "Supabase CLI command failed."))
    .replace(/(postgres(?:ql)?:\/\/[^:\s]+:)[^@\s]+(@)/gi, "$1[REDACTED]$2");
  return message.replace(/\s+/g, " ").slice(0, 600);
}

async function writeEvidence(
  outputPath: string,
  phase: Phase,
  connectionMode: "linked" | "direct",
  linked: string,
  parity: MigrationParityResult,
): Promise<void> {
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify({
    schemaVersion: 1,
    phase,
    status: parity.status,
    needsPromotion: parity.needsPromotion,
    environment: "qa",
    deploymentId: process.env.HYDROQUALISENSE_DEPLOYMENT_ID || null,
    targetProjectRef: process.env.HYDROQUALISENSE_QA_PROJECT_REF || null,
    productionProjectRef: process.env.HYDROQUALISENSE_PRODUCTION_PROJECT_REF || null,
    connectionMode,
    databaseHost: connectionMode === "direct" ? HYDROQUALISENSE_QA_POOLER_HOST : null,
    linkedProjectRef: linked || null,
    expectedMigrationLevel: parity.expectedHead,
    observedMigrationLevel: parity.observedRemoteHead,
    localMigrationCount: parity.localLevels.length,
    remoteMigrationCount: parity.remoteLevels.length,
    mismatches: parity.mismatches,
    timestamp: new Date().toISOString(),
  }, null, 2)}\n`, "utf8");
}

async function main(): Promise<void> {
  const phase = option("--phase", "before") as Phase;
  if (phase !== "before" && phase !== "after") throw new Error("Migration parity phase must be before or after.");
  const directDb = hasFlag("--direct-db");
  const connectionMode = directDb ? "direct" : "linked";
  const outputPath = path.resolve(option("--output", `artifacts/qa-release/migration-parity-${phase}.json`));
  const environment = requiredEnvironment("HYDROQUALISENSE_ENVIRONMENT");
  const deploymentId = requiredEnvironment("HYDROQUALISENSE_DEPLOYMENT_ID");
  const qaProjectRef = requiredEnvironment("HYDROQUALISENSE_QA_PROJECT_REF");
  const productionProjectRef = requiredEnvironment("HYDROQUALISENSE_PRODUCTION_PROJECT_REF");
  const linked = directDb ? "" : (await readLinkedProjectRef()).toLowerCase();
  const identityErrors = validateQaReleaseIdentity({
    environment,
    deploymentId,
    qaProjectRef,
    productionProjectRef,
    linkedProjectRef: linked,
    connectionMode,
    databaseHost: directDb ? HYDROQUALISENSE_QA_POOLER_HOST : "",
    confirmation: "QA_DATABASE_PUSH",
  });
  if (identityErrors.length > 0) throw new Error(`QA release identity refused before migration history inspection: ${identityErrors.join(", ")}.`);

  const localLevels = await repositoryMigrationLevels();
  if (localLevels.length === 0) throw new Error("Repository has no canonical Supabase migrations; refusing to certify migration parity.");

  const databaseUrl = directDb
    ? buildQaSessionPoolerDatabaseUrl({
        projectRef: qaProjectRef,
        password: requiredEnvironment("SUPABASE_DB_PASSWORD"),
        poolerHost: HYDROQUALISENSE_QA_POOLER_HOST,
      })
    : "";
  const cliArgs = directDb ? ["migration", "list", "--db-url", databaseUrl] : ["migration", "list", "--linked"];
  let cliOutput: { stdout: string | Buffer; stderr: string | Buffer };
  try {
    cliOutput = await runSupabaseCli(cliArgs, { cwd: process.cwd(), env: process.env });
  } catch (error) {
    throw new Error(`Supabase database authentication or migration-history inspection failed: ${safeCliFailure(error)}`);
  }
  const rows = parseSupabaseMigrationList(`${String(cliOutput.stdout)}\n${String(cliOutput.stderr)}`);
  if (rows.length === 0) throw new Error("Supabase migration-history inspection returned no parseable migration rows; refusing to infer parity.");
  const parity = evaluateMigrationParity(localLevels, rows);
  await writeEvidence(outputPath, phase, connectionMode, linked, parity);
  writeGithubOutput({
    parity_status: parity.status,
    needs_promotion: parity.needsPromotion ? "true" : "false",
    observed_migration_level: parity.observedRemoteHead || "none",
  });
  if (phase === "after" && parity.status !== "PASS") {
    throw new Error(`QA migration parity verification failed after promotion: ${parity.status} ${parity.mismatches.join("; ")}`);
  }
  if (parity.status === "FAIL") {
    throw new Error(`QA migration history diverges from the repository: ${parity.mismatches.join("; ")}`);
  }
  console.log(`QA migration parity=${parity.status} expected=${parity.expectedHead} observed=${parity.observedRemoteHead || "none"} needs-promotion=${parity.needsPromotion ? "true" : "false"}`);
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : "QA migration parity verification failed.");
  process.exitCode = 1;
}
