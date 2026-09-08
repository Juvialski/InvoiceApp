import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { validateQaDatabaseTarget, type QaDatabaseOperation } from "../../src/lib/qaDatabaseTarget.ts";

interface CliOptions {
  projectRef: string;
  confirmation: string;
}

function usage() {
  console.log("Usage: npm.cmd run qa:db:push -- --project-ref <qa-project-ref> --confirm-qa");
  console.log("   or: npm.cmd run qa:db:reset -- --project-ref <qa-project-ref> --confirm-qa-reset");
  console.log("QA-only wrapper: requires QA environment identity and a linked project match; reset never runs seed.sql.");
}

function parseArgs(args: readonly string[], operation: QaDatabaseOperation): CliOptions {
  let projectRef = "";
  let confirmation = "";
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--project-ref" && args[index + 1]) projectRef = args[++index]!;
    else if (arg === "--confirm-qa") confirmation = "QA_DATABASE_PUSH";
    else if (arg === "--confirm-qa-reset") confirmation = "QA_DATABASE_RESET";
    else if (arg === "--help" || arg === "-h") { usage(); process.exit(0); }
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (operation === "push" && confirmation !== "QA_DATABASE_PUSH") throw new Error("QA migration push requires --confirm-qa.");
  if (operation === "reset" && confirmation !== "QA_DATABASE_RESET") throw new Error("QA database reset requires --confirm-qa-reset.");
  return { projectRef, confirmation };
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
  const validation = validateQaDatabaseTarget({
    operation,
    environment: process.env.HYDROQUALISENSE_ENVIRONMENT,
    deploymentId: process.env.HYDROQUALISENSE_DEPLOYMENT_ID,
    targetProjectRef: options.projectRef,
    expectedQaProjectRef: process.env.HYDROQUALISENSE_QA_PROJECT_REF,
    linkedProjectRef: linkedProjectRef(),
    productionProjectRef: process.env.HYDROQUALISENSE_PRODUCTION_PROJECT_REF,
    confirmation: options.confirmation,
  });
  if (!validation.valid) throw new Error(`QA database command refused: ${validation.errors.join(" ")}`);

  const cliArgs = ["supabase", "db", operation, "--linked", "--yes"];
  if (operation === "push") cliArgs.push("--include-all");
  else cliArgs.push("--no-seed");
  const executable = process.platform === "win32" ? (process.env.ComSpec || "cmd.exe") : "npx";
  const executableArgs = process.platform === "win32"
    ? ["/d", "/s", "/c", "npx.cmd", ...cliArgs]
    : cliArgs;
  console.log(`QA-only Supabase ${operation}: ${validation.projectRef}`);
  console.log(operation === "reset" ? "No seed file will be executed; synthetic data remains outside this database reset." : "Applying the complete forward migration chain to the linked QA project.");
  execFileSync(executable, executableArgs, { cwd: process.cwd(), env: process.env, stdio: "inherit" });
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : "QA database command failed.");
  process.exitCode = 1;
}
