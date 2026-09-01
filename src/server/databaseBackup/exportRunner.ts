import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import { promises as fsp } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  type LogicalExportOptions,
  type LogicalExportResult,
  DatabaseBackupExportError,
} from "../../lib/databaseBackup/types.ts";

export interface DatabaseExportRunner {
  exportLogicalDatabase(options: LogicalExportOptions): Promise<LogicalExportResult>;
}

/**
 * Redacts passwords and sensitive tokens from PostgreSQL connection strings.
 */
export function sanitizeDatabaseUrl(urlStr: string): string {
  if (!urlStr || typeof urlStr !== "string") return "[EMPTY_DB_URL]";
  try {
    const u = new URL(urlStr);
    if (u.password) {
      u.password = "******";
    }
    return u.toString();
  } catch {
    return urlStr.replace(/(postgres(?:ql)?:\/\/[^:]+:)([^@]+)(@)/gi, "$1******$3");
  }
}

/**
 * Sanitizes output or error strings to prevent leaking database credentials.
 */
export function sanitizeLogOutput(
  rawText: string,
  secretCandidates: (string | undefined)[] = [],
): string {
  let sanitized = rawText || "";
  for (const secret of secretCandidates) {
    if (secret && secret.trim().length >= 4) {
      sanitized = sanitized.split(secret).join("******");
    }
  }
  sanitized = sanitized.replace(/(postgres(?:ql)?:\/\/[^:]+:)([^@]+)(@)/gi, "$1******$3");
  return sanitized;
}

/**
 * Real PostgreSQL pg_dump runner using safe child_process.spawn (no shell interpolation).
 *
 * Scope invariant: ordinary Engoryx application backups include the public application schema
 * plus private helper definitions, but exclude private-schema table data and do not sweep
 * Supabase-managed auth/storage/vault schemas into the archive.
 */
export class PostgresDumpExportRunner implements DatabaseExportRunner {
  private pgDumpBinaryPath: string;

  constructor(pgDumpBinaryPath: string = "pg_dump") {
    this.pgDumpBinaryPath = pgDumpBinaryPath;
  }

  async exportLogicalDatabase(options: LogicalExportOptions): Promise<LogicalExportResult> {
    const dbUrl =
      options.databaseUrl ||
      process.env.DATABASE_URL ||
      process.env.SUPABASE_DB_URL ||
      process.env.POSTGRES_URL;

    if (!dbUrl) {
      throw new DatabaseBackupExportError(
        "Database export failed: No database connection URL provided in options or environment.",
      );
    }

    const tempDir = options.tempDir || os.tmpdir();
    const randomSuffix = crypto.randomUUID().slice(0, 8);
    const tempFileName = `engoryx-export-${options.companyId}-${Date.now()}-${randomSuffix}.sql`;
    const tempFilePath = path.join(tempDir, tempFileName);

    let parsedPassword = "";
    const spawnEnv: NodeJS.ProcessEnv = { ...process.env };

    try {
      const url = new URL(dbUrl);
      if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
        throw new Error("unsupported database URL protocol");
      }
      if (!url.hostname || !url.pathname || url.pathname === "/") {
        throw new Error("database URL must include host and database name");
      }
      if (url.password) {
        parsedPassword = decodeURIComponent(url.password);
        spawnEnv.PGPASSWORD = parsedPassword;
      }
      spawnEnv.PGHOST = url.hostname;
      spawnEnv.PGPORT = url.port || "5432";
      if (url.username) spawnEnv.PGUSER = decodeURIComponent(url.username);
      spawnEnv.PGDATABASE = decodeURIComponent(url.pathname.slice(1));
      const sslMode = url.searchParams.get("sslmode");
      if (sslMode) spawnEnv.PGSSLMODE = sslMode;
    } catch {
      throw new DatabaseBackupExportError(
        "Database export failed: database URL must be a valid postgres:// or postgresql:// connection URL.",
      );
    }

    const args: string[] = [
      "--format=plain",
      "--no-owner",
      "--no-privileges",
      "--clean",
      "--if-exists",
      "--schema=public",
      "--schema=private",
      "--exclude-table-data=private.*",
      "-f",
      tempFilePath,
    ];

    if (options.backupType === "SCHEMA_ONLY") {
      args.push("--schema-only");
    } else if (options.backupType === "DATA_ONLY") {
      args.push("--data-only");
    }

    if (options.targetTables && options.targetTables.length > 0) {
      for (const table of options.targetTables) {
        args.push("-t", table);
      }
    }

    if (options.excludeTables && options.excludeTables.length > 0) {
      for (const table of options.excludeTables) {
        args.push("-T", table);
      }
    }

    if (options.customFlags && options.customFlags.length > 0) {
      args.push(...options.customFlags);
    }

    args.push(spawnEnv.PGDATABASE!);

    let stderrBuffer = "";

    try {
      await new Promise<void>((resolve, reject) => {
        const proc = spawn(this.pgDumpBinaryPath, args, {
          env: spawnEnv,
          stdio: ["ignore", "pipe", "pipe"],
          shell: false,
        });

        proc.stderr.on("data", (chunk: Buffer) => {
          if (stderrBuffer.length < 1024 * 1024) {
            stderrBuffer += chunk.toString("utf-8");
          }
        });

        proc.on("error", (err) => {
          reject(err);
        });

        proc.on("close", (code) => {
          if (code === 0) {
            resolve();
          } else {
            const sanitizedErr = sanitizeLogOutput(stderrBuffer, [parsedPassword, dbUrl]);
            reject(
              new DatabaseBackupExportError(
                `pg_dump execution failed with exit code ${code}: ${sanitizedErr || "Unknown error"}`,
              ),
            );
          }
        });
      });

      const hash = crypto.createHash("sha256");
      const stat = await fsp.stat(tempFilePath);
      const fileStream = fs.createReadStream(tempFilePath);

      await new Promise<void>((resolve, reject) => {
        fileStream.on("data", (chunk) => hash.update(chunk));
        fileStream.on("error", reject);
        fileStream.on("end", () => resolve());
      });

      const plaintextSha256 = hash.digest("hex").toLowerCase();

      return {
        filePath: tempFilePath,
        plaintextSha256,
        sizeBytes: stat.size,
        pgDumpVersion: "pg_dump",
        cleanup: async () => {
          try {
            await fsp.unlink(tempFilePath);
          } catch (err: any) {
            if (err.code !== "ENOENT") throw err;
          }
        },
      };
    } catch (err: any) {
      try {
        await fsp.unlink(tempFilePath);
      } catch {
        // Ignore unlink error during failure handler.
      }

      const rawMsg = err instanceof Error ? err.message : String(err);
      const sanitized = sanitizeLogOutput(rawMsg, [parsedPassword, dbUrl]);
      throw new DatabaseBackupExportError(`Database export failed: ${sanitized}`);
    }
  }
}

/**
 * Mock database export runner for unit/integration tests and environments without PostgreSQL installed.
 */
export class MockDatabaseExportRunner implements DatabaseExportRunner {
  readonly options: { syntheticSize?: number; pgDumpVersion?: string };

  constructor(options: { syntheticSize?: number; pgDumpVersion?: string } = {}) {
    this.options = options;
  }

  async exportLogicalDatabase(options: LogicalExportOptions): Promise<LogicalExportResult> {
    const tempDir = options.tempDir || os.tmpdir();
    const randomSuffix = crypto.randomUUID().slice(0, 8);
    const tempFileName = `engoryx-mock-export-${options.companyId}-${Date.now()}-${randomSuffix}.sql`;
    const tempFilePath = path.join(tempDir, tempFileName);

    const nowIso = new Date().toISOString();
    const lines: string[] = [
      `-- Engoryx Logical Database Export (MOCK)`,
      `-- Company ID: ${options.companyId}`,
      `-- Backup Type: ${options.backupType}`,
      `-- Export Timestamp: ${nowIso}`,
      `-- Scope: ${options.targetTables ? options.targetTables.join(", ") : "PUBLIC_APPLICATION_DATA_PLUS_PRIVATE_HELPERS"}`,
      `-- Version: 16.2 (Mocked)`,
      `SET statement_timeout = 0;`,
      `SET lock_timeout = 0;`,
      `SET client_encoding = 'UTF8';`,
      `SET standard_conforming_strings = on;`,
      ``,
    ];

    if (options.backupType !== "DATA_ONLY") {
      lines.push(
        `-- Schema definitions`,
        `CREATE TABLE IF NOT EXISTS public.companies (id uuid PRIMARY KEY, name text NOT NULL);`,
        `CREATE TABLE IF NOT EXISTS public.invoices (id uuid PRIMARY KEY, company_id uuid NOT NULL, amount numeric);`,
        `CREATE TABLE IF NOT EXISTS public.work_entries (id uuid PRIMARY KEY, company_id uuid NOT NULL, work_date date);`,
        ``,
      );
    }

    if (options.backupType !== "SCHEMA_ONLY") {
      lines.push(
        `-- Table data`,
        `INSERT INTO public.companies (id, name) VALUES ('${options.companyId}', 'Mock Client Company Ltd.');`,
        `INSERT INTO public.invoices (id, company_id, amount) VALUES ('${crypto.randomUUID()}', '${options.companyId}', 4500.00);`,
        `INSERT INTO public.work_entries (id, company_id, work_date) VALUES ('${crypto.randomUUID()}', '${options.companyId}', '2026-09-01');`,
        ``,
      );
    }

    lines.push(`-- Dump completed at ${new Date().toISOString()}`);

    const sqlContent = lines.join("\n");
    await fsp.writeFile(tempFilePath, sqlContent, { mode: 0o600, encoding: "utf-8" });

    const plaintextSha256 = crypto
      .createHash("sha256")
      .update(Buffer.from(sqlContent, "utf-8"))
      .digest("hex")
      .toLowerCase();

    const stat = await fsp.stat(tempFilePath);

    return {
      filePath: tempFilePath,
      plaintextSha256,
      sizeBytes: stat.size,
      pgDumpVersion: "16.2 (Mocked)",
      cleanup: async () => {
        try {
          await fsp.unlink(tempFilePath);
        } catch (err: any) {
          if (err.code !== "ENOENT") throw err;
        }
      },
    };
  }
}

export function createDatabaseExportRunner(
  runnerType?: "postgres" | "mock" | "auto",
): DatabaseExportRunner {
  if (runnerType === "postgres") {
    return new PostgresDumpExportRunner();
  }
  if (runnerType === "mock") {
    return new MockDatabaseExportRunner();
  }

  if (
    process.env.NODE_ENV === "test" ||
    process.env.DATABASE_BACKUP_USE_MOCK_RUNNER === "true" ||
    process.env.USE_MOCK_EXPORT_RUNNER === "true"
  ) {
    return new MockDatabaseExportRunner();
  }

  return new PostgresDumpExportRunner();
}
