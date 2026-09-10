import { readFileSync } from "node:fs";
import path from "node:path";
import { validateQaDatabaseTarget, type QaDatabaseOperation } from "../../src/lib/qaDatabaseTarget.ts";
import { buildQaSessionPoolerDatabaseUrl, HYDROQUALISENSE_QA_POOLER_HOST } from "../../src/lib/qaReleaseOrchestration.ts";
import { runSupabaseCliSync } from "./supabaseCli.ts";

interface CliOptions {
  projectRef: string;
  confirmation: string;
  directDb: boolean;
}

function usage() {
  console.log("Usage: npm.cmd run qa:db:push -- --project-ref <qa-project-ref> --confirm-qa [--direct-db]");
  console.log("   or: npm.cmd run qa:db:reset -- --project-ref <qa-project-ref> --confirm-qa-reset");
  console.log("QA-only wrapper: linked mode requires a linked project match; protected CI may use the pinned QA session pooler with --direct-db.");
}

function parseArgs(args: readonly string[], operation: QaDatabaseOperation): CliOptions {
  let projectRef = "";
  let confirmation = "";
  let directDb = false;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--project-ref" && args[index + 1]) projectRef = args[++index]!;
    else if (arg === "--confirm-qa") confirmation = "QA_DATABASE_PUSH";
    else if (arg === "--confirm-qa-reset") confirmation = "QA_DATABASE_RESET";
    else if (arg === "--direct-db") directDb = true;
    else if (arg === "--help" || arg === "-h") { usage(); process.exit(0); }
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (operation === "push" && confirmation !== "QA_DATABASE_PUSH") throw new Error("QA migration push requires --confirm-qa.");
  if (operation === "reset" && confirmation !== "QA_DATABASE_RESET") throw new Error("QA database reset requires --confirm-qa-reset.");
  if (operation === "reset" && directDb) throw new Error("Direct database mode is intentionally limited to forward QA migration pushes; QA reset remains linked-only.");
  return { projectRef, confirmation, directDb };
}

function linkedProjectRef() {
  try {
    return readFileSync(path.join(process.cwd(), "supabase", ".temp", "project-ref"), "utf8").trim();
  } catch {
    return "";
  }
}

function main() {
  const operation = process.argv[2] as QaDatabaseOperation;
  if (operation !== "push" && operation !== "reset") {
    usage();
    throw new Error("Choose the qa:db:push or qa:db:reset wrapper.");
  }
  const options = parseArgs(process.argv.slice(3), operation);
  const directDatabaseUrl = options.directDb
    ? buildQaSessionPoolerDatabaseUrl({
        projectRef: options.projectRef || process.env.HYDROQUALISENSE_QA_PROJECT_REF,
        password: process.env.SUPABASE_DB_PASSWORD,
        poolerHost: HYDROQUALISENSE_QA_POOLER_HOST,
      })
    : "";
  const validation = validateQaDatabaseTarget({
    operation,
    environment: process.env.HYDROQUALISENSE_ENVIRONMENT,
    deploymentId: process.env.HYDROQUALISENSE_DEPLOYMENT_ID,
    targetProjectRef: options.projectRef,
    expectedQaProjectRef: process.env.HYDROQUALISENSE_QA_PROJECT_REF,
    linkedProjectRef: options.directDb ? "" : linkedProjectRef(),
    productionProjectRef: process.env.HYDROQUALISENSE_PRODUCTION_PROJECT_REF,
    expectedDeploymentId: process.env.HYDROQUALISENSE_EXPECTED_DEPLOYMENT_ID,
    connectionMode: options.directDb ? "direct" : "linked",
    databaseHost: options.directDb ? HYDROQUALISENSE_QA_POOLER_HOST : "",
    confirmation: options.confirmation,
  });
  if (!validation.valid) throw new Error(`QA database command refused: ${validation.errors.join(" ")}`);

  const cliArgs = options.directDb
    ? ["db", operation, "--db-url", directDatabaseUrl, "--yes"]
    : ["db", operation, "--linked", "--yes"];
  if (operation === "push") cliArgs.push("--include-all");
  else cliArgs.push("--no-seed");
  console.log(`QA-only Supabase ${operation}: ${validation.projectRef}`);
  console.log(operation === "reset"
    ? "No seed file will be executed; synthetic data remains outside this database reset."
    : options.directDb
      ? "Applying the complete forward migration chain to the protected QA session pooler."
      : "Applying the complete forward migration chain to the linked QA project.");
  try {
    runSupabaseCliSync(cliArgs, { cwd: process.cwd(), env: process.env });
  } catch {
    throw new Error(`Supabase QA database ${operation} failed. See the sanitized CLI output above for the database error.`);
  }
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : "QA database command failed.");
  process.exitCode = 1;
}
