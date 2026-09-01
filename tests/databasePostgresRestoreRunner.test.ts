import test from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import {
  PostgresRestoreRunner,
  canonicalDatabaseIdentity,
  databaseUrlsPointToSameDatabase,
  type CommandRunner,
} from "../src/server/databaseBackup/postgresRestoreRunner.ts";

const TARGET_URL = "postgresql://restore_user:restore-secret@127.0.0.1:55432/engoryx_restore?sslmode=require";

test("PostgresRestoreRunner canonical DB identity ignores credentials and normalizes localhost", () => {
  assert.equal(
    canonicalDatabaseIdentity("postgresql://user:a@localhost:5432/app?sslmode=require"),
    "127.0.0.1:5432/app",
  );
  assert.equal(
    databaseUrlsPointToSameDatabase(
      "postgresql://user:a@localhost:5432/app?sslmode=require",
      "postgres://different:b@127.0.0.1/app?connect_timeout=3",
    ),
    true,
  );
});

test("PostgresRestoreRunner executes psql restore without putting credentials in argv and verifies RLS", async () => {
  const dumpPath = path.join(os.tmpdir(), `engoryx-restore-runner-${crypto.randomUUID()}.sql`);
  await fs.writeFile(dumpPath, "-- synthetic restore dump\nselect 1;\n", { mode: 0o600 });

  const calls: Array<{ binary: string; args: string[]; env: NodeJS.ProcessEnv }> = [];
  const commandRunner: CommandRunner = async (binary, args, env) => {
    calls.push({ binary, args: [...args], env: { ...env } });
    const commandIndex = args.indexOf("--command");
    const sql = commandIndex >= 0 ? args[commandIndex + 1] || "" : "";

    if (args.includes("--file")) {
      return { stdout: "", stderr: "", exitCode: 0 };
    }
    if (sql.includes("from pg_tables")) {
      return {
        stdout: "companies\ndatabase_backup_runs\nengineering_documents\ninvoices\npayroll_entries\nwork_entries\n",
        stderr: "",
        exitCode: 0,
      };
    }
    if (sql.includes("bool_and(c.relrowsecurity)")) {
      return { stdout: "t\n", stderr: "", exitCode: 0 };
    }
    if (sql.includes("count(*)::text")) {
      return { stdout: "3\n", stderr: "", exitCode: 0 };
    }
    return { stdout: "", stderr: "", exitCode: 0 };
  };

  const previousDatabaseUrl = process.env.DATABASE_URL;
  try {
    process.env.DATABASE_URL = "postgresql://live_user:live-secret@127.0.0.1:5432/engoryx_live";
    const runner = new PostgresRestoreRunner({ commandRunner });
    const result = await runner.restoreDatabase({
      decryptedFilePath: dumpPath,
      targetDatabaseUrl: TARGET_URL,
      companyId: "11111111-2222-4333-8444-555555555555",
    });

    assert.equal(result.success, true);
    assert.equal(result.rlsVerified, true);
    assert.ok(result.tablesRestored.includes("companies"));
    assert.ok(calls.some((call) => call.args.includes("--file")));

    for (const call of calls) {
      assert.equal(call.binary, "psql");
      assert.equal(call.args.join(" ").includes("restore-secret"), false);
      assert.equal(call.args.join(" ").includes(TARGET_URL), false);
      assert.equal(call.env.PGPASSWORD, "restore-secret");
      assert.equal(call.env.PGDATABASE, "engoryx_restore");
    }
  } finally {
    process.env.DATABASE_URL = previousDatabaseUrl;
    await fs.unlink(dumpPath).catch(() => {});
  }
});

test("PostgresRestoreRunner refuses an equivalent live database URL even when credentials differ", async () => {
  const dumpPath = path.join(os.tmpdir(), `engoryx-restore-runner-${crypto.randomUUID()}.sql`);
  await fs.writeFile(dumpPath, "select 1;", { mode: 0o600 });
  const previousDatabaseUrl = process.env.DATABASE_URL;
  try {
    process.env.DATABASE_URL = "postgresql://live:one@localhost:5432/engoryx_live?sslmode=require";
    let executed = false;
    const runner = new PostgresRestoreRunner({
      commandRunner: async () => {
        executed = true;
        return { stdout: "", stderr: "", exitCode: 0 };
      },
    });

    const result = await runner.restoreDatabase({
      decryptedFilePath: dumpPath,
      targetDatabaseUrl: "postgres://restore:two@127.0.0.1/engoryx_live?connect_timeout=2",
      companyId: "11111111-2222-4333-8444-555555555555",
    });

    assert.equal(result.success, false);
    assert.equal(executed, false);
    assert.match(result.error || "", /same PostgreSQL host\/port\/database/i);
  } finally {
    process.env.DATABASE_URL = previousDatabaseUrl;
    await fs.unlink(dumpPath).catch(() => {});
  }
});
