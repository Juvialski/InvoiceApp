/**
 * CLI Operator Script: Create Encrypted Database Backup.
 * Usage:
 *   npx tsx scripts/db-backup-create.ts --company-id <uuid> [--backup-type LOGICAL_FULL]
 */

import { DatabaseBackupService } from "../src/server/databaseBackup/databaseBackupService.ts";
import { type DatabaseBackupType } from "../src/lib/databaseBackup/types.ts";

async function main() {
  const args = process.argv.slice(2);
  let companyId = process.env.COMPANY_ID || "";
  let backupType: DatabaseBackupType = "LOGICAL_FULL";

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--company-id" && args[i + 1]) {
      companyId = args[++i];
    } else if (args[i] === "--backup-type" && args[i + 1]) {
      backupType = args[++i] as DatabaseBackupType;
    } else if (args[i] === "--help" || args[i] === "-h") {
      console.log("Usage: npx tsx scripts/db-backup-create.ts --company-id <uuid> [--backup-type LOGICAL_FULL|SCHEMA_ONLY|DATA_ONLY]");
      process.exit(0);
    }
  }

  if (!companyId) {
    console.error("Error: --company-id <uuid> is required (or set COMPANY_ID environment variable).");
    process.exit(1);
  }

  console.log(`[Engoryx Database Backup] Starting encrypted logical backup for company ${companyId}...`);

  const service = new DatabaseBackupService();
  const result = await service.createAndExecuteBackup({
    companyId,
    backupType,
  });

  if (!result.success) {
    console.error(`[Engoryx Database Backup] Backup failed: ${result.error}`);
    console.error(JSON.stringify(result.record, null, 2));
    process.exit(1);
  }

  console.log(`[Engoryx Database Backup] Backup successfully completed and verified!`);
  console.log(JSON.stringify({
    id: result.record.id,
    companyId: result.record.companyId,
    status: result.record.status,
    verificationStatus: result.record.verificationStatus,
    storageBucket: result.record.storageBucket,
    storageKey: result.record.storageKey,
    encryptedSizeBytes: result.record.encryptedSizeBytes,
    encryptedSha256: result.record.encryptedSha256,
    completedAt: result.record.completedAt,
  }, null, 2));
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
