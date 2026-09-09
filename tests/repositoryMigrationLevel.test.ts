import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { latestCanonicalMigrationLevel, repositoryMigrationLevel } from "../src/server/repositoryMigrationLevel.ts";

test("latest canonical migration level is derived without manual version metadata", () => {
  assert.equal(
    latestCanonicalMigrationLevel([
      "20260901090000_initial.sql",
      "README.md",
      "20260903120000_second.sql",
      "20260902100000_middle.sql",
      "not-a-migration.sql",
    ]),
    "20260903120000",
  );
});

test("non-canonical migration filenames are ignored", () => {
  assert.equal(
    latestCanonicalMigrationLevel([
      "2026090312000_too_short.sql",
      "202609031200000_too_long.sql",
      "20260903120000.sql",
      "20260903120000_bad name.sql",
      "20260903120000_valid-name.sql",
    ]),
    "20260903120000",
  );
});

test("repository migration level reads the checked-out canonical migration directory", () => {
  const repositoryRoot = mkdtempSync(join(tmpdir(), "hydroqualisense-migrations-"));
  const migrationsDirectory = join(repositoryRoot, "supabase", "migrations");
  mkdirSync(migrationsDirectory, { recursive: true });

  try {
    writeFileSync(join(migrationsDirectory, "20270101000000_first.sql"), "select 1;\n");
    writeFileSync(join(migrationsDirectory, "20270102000000_second.sql"), "select 1;\n");
    assert.equal(repositoryMigrationLevel(repositoryRoot), "20270102000000");
  } finally {
    rmSync(repositoryRoot, { recursive: true, force: true });
  }
});

test("repository migration level fails closed when the migration directory is unavailable", () => {
  const repositoryRoot = mkdtempSync(join(tmpdir(), "hydroqualisense-missing-migrations-"));

  try {
    assert.equal(repositoryMigrationLevel(repositoryRoot), null);
  } finally {
    rmSync(repositoryRoot, { recursive: true, force: true });
  }
});
