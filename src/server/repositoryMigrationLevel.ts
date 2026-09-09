import { readdirSync } from "node:fs";
import { join } from "node:path";

const CANONICAL_MIGRATION_FILENAME = /^(\d{14})_[A-Za-z0-9][A-Za-z0-9_-]*\.sql$/;

export function latestCanonicalMigrationLevel(filenames: readonly string[]): string | null {
  let latest: string | null = null;

  for (const filename of filenames) {
    const match = CANONICAL_MIGRATION_FILENAME.exec(filename);
    if (!match) continue;

    const version = match[1];
    if (!latest || version > latest) latest = version;
  }

  return latest;
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
