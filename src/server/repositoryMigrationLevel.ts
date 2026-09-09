import { readdirSync } from "node:fs";
import { join } from "node:path";

const CANONICAL_MIGRATION_FILENAME = /^(\d{14})_[A-Za-z0-9][A-Za-z0-9_-]*\.sql$/;

export function canonicalMigrationLevels(filenames: readonly string[]): string[] {
  return filenames
    .map((filename) => CANONICAL_MIGRATION_FILENAME.exec(filename)?.[1] || null)
    .filter((version): version is string => Boolean(version))
    .sort();
}

export function latestCanonicalMigrationLevel(filenames: readonly string[]): string | null {
  return canonicalMigrationLevels(filenames).at(-1) || null;
}

export function repositoryMigrationLevel(repositoryRoot = process.cwd()): string | null {
  try {
    const migrationsDirectory = join(repositoryRoot, "supabase", "migrations");
    const filenames = readdirSync(migrationsDirectory, { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name);

    return latestCanonicalMigrationLevel(filenames);
  } catch {
    return null;
  }
}
