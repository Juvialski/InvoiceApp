import test from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("Postgres dump backup scope excludes Supabase-managed auth/storage data", async () => {
  const source = await fs.readFile(
    path.join(ROOT, "src/server/databaseBackup/exportRunner.ts"),
    "utf-8",
  );

  assert.match(source, /--schema=public/);
  assert.match(source, /--schema=private/);
  assert.match(source, /--exclude-table-data=private\.\*/);
  assert.doesNotMatch(source, /--schema=auth/);
  assert.doesNotMatch(source, /--schema=storage/);
  assert.doesNotMatch(source, /--schema=vault/);
});
