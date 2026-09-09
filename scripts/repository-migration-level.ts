import { repositoryMigrationLevel } from "../src/server/repositoryMigrationLevel.ts";

const migrationLevel = repositoryMigrationLevel();

if (!migrationLevel) {
  console.error("No canonical migration could be derived from supabase/migrations.");
  process.exitCode = 1;
} else {
  process.stdout.write(`${migrationLevel}\n`);
}
