/**
 * CLI Operator Script: Verify Remote Database Backup Archive.
 * Usage:
 *   npx tsx scripts/db-backup-verify.ts --backup-id <uuid>
 */

import { DatabaseBackupService } from "../src/server/databaseBackup/databaseBackupService.ts";

async function main() {
  const args = process.argv.slice(2);
  let backupRunId = "";

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--backup-id" && args[i + 1]) {
      backupRunId = args[++i];
    } else if (args[i] === "--help" || args[i] === "-h") {
      console.log("Usage: npx tsx scripts/db-backup-verify.ts --backup-id <uuid>");
      process.exit(0);
    }
  }

  if (!backupRunId) {
    console.error("Error: --backup-id <uuid> is required.");
    process.exit(1);
  }

  console.log(`[Engoryx Database Backup] Verifying backup run ${backupRunId}...`);

  const service = new DatabaseBackupService();
  const record = await service.verifyBackupRun(backupRunId);

  console.log(`[Engoryx Database Backup] Verification status: ${record.verificationStatus}`);
  console.log(JSON.stringify({
    id: record.id,
    companyId: record.companyId,
    status: record.status,
    verificationStatus: record.verificationStatus,
    storageBucket: record.storageBucket,
    storageKey: record.storageKey,
    lastVerifiedAt: record.lastVerifiedAt,
  }, null, 2));

  if (record.verificationStatus !== "MATCHED") {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
