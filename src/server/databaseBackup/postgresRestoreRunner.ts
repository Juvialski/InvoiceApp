import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import { StorageError } from "../../lib/storage/types.ts";
import type { RestoreRunner, RestoreRunnerOptions } from "./restoreDrillService.ts";
import { sanitizeLogOutput } from "./exportRunner.ts";

export interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export type CommandRunner = (
  binary: string,
  args: string[],
  env: NodeJS.ProcessEnv,
) => Promise<CommandResult>;

const DEFAULT_EXPECTED_RLS_TABLES = [
  "companies",
  "invoices",
  "work_entries",
  "payroll_entries",
  "engineering_documents",
  "database_backup_runs",
];

function normalizeHost(hostname: string): string {
  const lowered = hostname.trim().toLowerCase();
  if (lowered === "localhost") return "127.0.0.1";
  return lowered;
}

export function canonicalDatabaseIdentity(databaseUrl: string): string {
  let parsed: URL;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new StorageError(
      "Restore target database URL must be a valid postgres:// or postgresql:// URL.",
      "INVALID_DATABASE_URL",
      400,
    );
  }

  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    throw new StorageError(
      "Restore target database URL must use postgres:// or postgresql://.",
      "INVALID_DATABASE_URL",
      400,
    );
  }

  const database = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  if (!parsed.hostname || !database) {
    throw new StorageError(
      "Restore target database URL must include a hostname and database name.",
      "INVALID_DATABASE_URL",
      400,
    );
  }

  const port = parsed.port || "5432";
  return `${normalizeHost(parsed.hostname)}:${port}/${database}`;
}

export function databaseUrlsPointToSameDatabase(a: string, b: string): boolean {
  return canonicalDatabaseIdentity(a) === canonicalDatabaseIdentity(b);
}

export function postgresEnvironmentFromUrl(databaseUrl: string): NodeJS.ProcessEnv {
  const parsed = new URL(databaseUrl);
  const database = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  const env: NodeJS.ProcessEnv = { ...process.env };

  env.PGHOST = parsed.hostname;
  env.PGPORT = parsed.port || "5432";
  env.PGDATABASE = database;
  if (parsed.username) env.PGUSER = decodeURIComponent(parsed.username);
  if (parsed.password) env.PGPASSWORD = decodeURIComponent(parsed.password);

  const sslMode = parsed.searchParams.get("sslmode");
  if (sslMode) env.PGSSLMODE = sslMode;

  return env;
}

async function defaultCommandRunner(
  binary: string,
  args: string[],
  env: NodeJS.ProcessEnv,
): Promise<CommandResult> {
  return await new Promise<CommandResult>((resolve, reject) => {
    const child = spawn(binary, args, {
      env,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    const maxCapturedChars = 1024 * 1024;

    child.stdout.on("data", (chunk: Buffer) => {
      if (stdout.length < maxCapturedChars) stdout += chunk.toString("utf-8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      if (stderr.length < maxCapturedChars) stderr += chunk.toString("utf-8");
    });
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({ stdout, stderr, exitCode: code ?? 1 });
    });
  });
}

export interface PostgresRestoreRunnerOptions {
  psqlBinaryPath?: string;
  commandRunner?: CommandRunner;
}

export class PostgresRestoreRunner implements RestoreRunner {
  private readonly psqlBinaryPath: string;
  private readonly runCommand: CommandRunner;

  constructor(options: PostgresRestoreRunnerOptions = {}) {
    this.psqlBinaryPath = options.psqlBinaryPath || "psql";
    this.runCommand = options.commandRunner || defaultCommandRunner;
  }

  private async runPsql(
    targetDatabaseUrl: string,
    args: string[],
  ): Promise<CommandResult> {
    const env = postgresEnvironmentFromUrl(targetDatabaseUrl);
    const result = await this.runCommand(
      this.psqlBinaryPath,
      ["-X", "--set=ON_ERROR_STOP=1", ...args],
      env,
    );

    if (result.exitCode !== 0) {
      const secretCandidates = [targetDatabaseUrl, env.PGPASSWORD];
      const safeError = sanitizeLogOutput(result.stderr || result.stdout, secretCandidates);
      throw new StorageError(
        `PostgreSQL restore verification command failed with exit code ${result.exitCode}: ${safeError || "unknown psql error"}`,
        "POSTGRES_RESTORE_FAILED",
        500,
      );
    }

    return result;
  }

  async restoreDatabase(options: RestoreRunnerOptions): Promise<{
    success: boolean;
    tablesRestored: string[];
    schemaVersion?: string;
    rowCountSummary?: Record<string, number>;
    rlsVerified?: boolean;
    error?: string;
  }> {
    try {
      await fs.access(options.decryptedFilePath);

      const sourceDatabaseUrl = (
        process.env.DATABASE_URL ||
        process.env.SUPABASE_DB_URL ||
        process.env.POSTGRES_URL ||
        ""
      ).trim();

      if (
        sourceDatabaseUrl &&
        databaseUrlsPointToSameDatabase(sourceDatabaseUrl, options.targetDatabaseUrl)
      ) {
        throw new StorageError(
          "Restore target resolves to the same PostgreSQL host/port/database as the live source database.",
          "TARGET_EQUALS_SOURCE",
          400,
        );
      }

      await this.runPsql(options.targetDatabaseUrl, [
        "--file",
        options.decryptedFilePath,
      ]);

      const tableResult = await this.runPsql(options.targetDatabaseUrl, [
        "--tuples-only",
        "--no-align",
        "--command",
        "select tablename from pg_tables where schemaname = 'public' order by tablename;",
      ]);
      const tablesRestored = tableResult.stdout
        .split(/\r?\n/)
        .map((value) => value.trim())
        .filter(Boolean);

      if (!tablesRestored.includes("companies")) {
        throw new StorageError(
          "Restore verification failed: expected public.companies was not restored.",
          "RESTORE_SCHEMA_INCOMPLETE",
          500,
        );
      }

      const rowCountSummary: Record<string, number> = {};
      for (const table of ["companies", "invoices", "work_entries", "payroll_entries", "engineering_documents"]) {
        if (!tablesRestored.includes(table)) continue;
        const countResult = await this.runPsql(options.targetDatabaseUrl, [
          "--tuples-only",
          "--no-align",
          "--command",
          `select count(*)::text from public.${table};`,
        ]);
        const parsed = Number(countResult.stdout.trim());
        if (Number.isFinite(parsed)) rowCountSummary[table] = parsed;
      }

      const existingExpectedRlsTables = DEFAULT_EXPECTED_RLS_TABLES.filter((table) =>
        tablesRestored.includes(table),
      );
      let rlsVerified = true;
      if (existingExpectedRlsTables.length > 0) {
        const quotedTables = existingExpectedRlsTables
          .map((table) => `'${table.replaceAll("'", "''")}'`)
          .join(",");
        const rlsResult = await this.runPsql(options.targetDatabaseUrl, [
          "--tuples-only",
          "--no-align",
          "--command",
          `select coalesce(bool_and(c.relrowsecurity), false)::text from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname in (${quotedTables});`,
        ]);
        rlsVerified = rlsResult.stdout.trim() === "t";
      }

      if (!rlsVerified) {
        throw new StorageError(
          "Restore verification failed: one or more expected protected public tables do not have RLS enabled.",
          "RESTORE_RLS_VERIFICATION_FAILED",
          500,
        );
      }

      return {
        success: true,
        tablesRestored,
        rowCountSummary,
        rlsVerified,
      };
    } catch (err: any) {
      return {
        success: false,
        tablesRestored: [],
        rlsVerified: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}
