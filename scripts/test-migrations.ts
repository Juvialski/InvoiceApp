import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { runUpgradeTests } from "./test-migration-upgrade.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

async function main() {
  console.log("============================================================");
  console.log("🚀 InvoiceApp Database Migration Validation Suite");
  console.log("============================================================\n");

  const isCI = process.env.CI === "true";
  const requireDb = process.argv.includes("--require-db") || isCI;

  // 1. Static Invariant & Ordering Checks
  console.log("▶ Phase 1: Static Migration Invariants & Naming Safety");
  const testFiles = [
    path.join(ROOT, "tests", "migrationInvariants.test.ts"),
    path.join(ROOT, "tests", "cashBankingMigration.test.ts")
  ];

  const nodeCmd = "node";
  const nodeArgs = ["--test", "--experimental-strip-types", ...testFiles];
  const staticResult = spawnSync(nodeCmd, nodeArgs, {
    cwd: ROOT,
    stdio: "inherit",
    shell: process.platform === "win32"
  });

  if (staticResult.status !== 0) {
    console.error("\n❌ Static migration invariants failed. Aborting.");
    process.exit(staticResult.status ?? 1);
  }
  console.log("\n✔ Static migration invariants passed.");

  // 2. Upgrade-path & Live Migration Tests
  console.log("\n▶ Phase 2: Upgrade-Path & Historical Data Compatibility");
  try {
    const upgradeResult = await runUpgradeTests({ throwOnUnreachable: requireDb });
    if (upgradeResult && (upgradeResult as any).skipped && requireDb) {
      console.error("\n❌ Database connection required in CI / strict mode.");
      process.exit(1);
    }
  } catch (err: any) {
    console.error(`\n❌ Migration validation failed:\n   ${err.message}`);
    process.exit(1);
  }

  console.log("\n============================================================");
  console.log("✅ All migration validation checks passed!");
  console.log("============================================================\n");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
