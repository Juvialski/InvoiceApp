/**
 * CLI Operator Script: Execute Non-Production Database Restore Drill.
 * Usage:
 *   npx tsx scripts/db-backup-restore-drill.ts --company-id <uuid> --backup-id <uuid> [--target-db-url <url>]
 */

import { RestoreDrillService } from "../src/server/databaseBackup/restoreDrillService.ts";

async function main() {
  const args = process.argv.slice(2);
  let companyId = process.env.COMPANY_ID || "";
  let backupRunId = "";
  let targetDbUrl = process.env.DATABASE_RESTORE_TARGET_URL || "";

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--company-id" && args[i + 1]) {
      companyId = args[++i];
    } else if (args[i] === "--backup-id" && args[i + 1]) {
      backupRunId = args[++i];
    } else if (args[i] === "--target-db-url" && args[i + 1]) {
      targetDbUrl = args[++i];
    } else if (args[i] === "--help" || args[i] === "-h") {
      console.log("Usage: npx tsx scripts/db-backup-restore-drill.ts --company-id <uuid> --backup-id <uuid> [--target-db-url <url>]");
      process.exit(0);
    }
  }

  if (!companyId || !backupRunId) {
    console.error("Error: --company-id <uuid> and --backup-id <uuid> are required.");
    process.exit(1);
  }

  console.log(`[Engoryx Database Restore Drill] Initiating non-production restore drill for backup ${backupRunId}...`);

  const service = new RestoreDrillService();
  const result = await service.executeRestoreDrill({
    companyId,
    backupRunId,
    targetDatabaseUrl: targetDbUrl,
  });

  if (!result.success) {
    console.error(`[Engoryx Database Restore Drill] Drill failed: ${result.error}`);
    console.error(JSON.stringify(result.drillRecord, null, 2));
    process.exit(1);
  }

  console.log(`[Engoryx Database Restore Drill] Drill successfully completed and verified!`);
  console.log(JSON.stringify(result.drillRecord, null, 2));
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
