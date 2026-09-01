import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  RestoreDrillService,
  MockRestoreRunner,
} from "../src/server/databaseBackup/restoreDrillService.ts";
import {
  encryptDatabasePayload,
  generateEncryptionKey,
} from "../src/lib/databaseBackup/crypto.ts";
import {
  type DatabaseBackupConfig,
  type DatabaseBackupRunRecord,
} from "../src/lib/databaseBackup/types.ts";
import { MemoryStorageProvider } from "../src/lib/storage/providers/memoryProvider.ts";
import { StorageError } from "../src/lib/storage/types.ts";
import type { SupabaseClient } from "@supabase/supabase-js";

interface MockTableState {
  database_backup_runs: Array<Record<string, any>>;
  database_restore_drills: Array<Record<string, any>>;
}

function createMockSupabase(initialRuns: Array<Record<string, any>> = []): {
  client: SupabaseClient;
  state: MockTableState;
} {
  const state: MockTableState = {
    database_backup_runs: [...initialRuns],
    database_restore_drills: [],
  };

  const createQueryBuilder = (tableName: keyof MockTableState) => {
    const filters: Array<(row: Record<string, any>) => boolean> = [];
    let limitCount: number | null = null;

    const builder: any = {
      select: () => builder,
      eq: (col: string, val: any) => {
        filters.push((r) => r[col] === val);
        return builder;
      },
      order: () => builder,
      limit: (n: number) => {
        limitCount = n;
        return builder;
      },
      maybeSingle: async () => {
        const rows = state[tableName].filter((r) => filters.every((f) => f(r)));
        return { data: rows[0] ? { ...rows[0] } : null, error: null };
      },
      single: async () => {
        const rows = state[tableName].filter((r) => filters.every((f) => f(r)));
        if (rows.length === 0) return { data: null, error: { message: "Not found" } };
        return { data: { ...rows[0] }, error: null };
      },
      insert: (data: any) => {
        const items = Array.isArray(data) ? data : [data];
        for (const item of items) {
          const row = {
            id: item.id || crypto.randomUUID(),
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            ...item,
          };
          state[tableName].push(row);
        }
        return {
          select: () => ({
            single: async () => ({ data: { ...items[0] }, error: null }),
            maybeSingle: async () => ({ data: { ...items[0] }, error: null }),
            then: (res: any, rej: any) => Promise.resolve({ data: items.map((i) => ({ ...i })), error: null }).then(res, rej),
          }),
          then: (res: any, rej: any) => Promise.resolve({ data: items[0], error: null }).then(res, rej),
        };
      },
      update: (patch: Record<string, any>) => {
        const applyPatch = () => {
          const matching = state[tableName].filter((r) => filters.every((f) => f(r)));
          for (const row of matching) {
            Object.assign(row, patch, { updated_at: new Date().toISOString() });
          }
          return matching;
        };

        const updateBuilder: any = {
          eq: (col: string, val: any) => {
            filters.push((r) => r[col] === val);
            return updateBuilder;
          },
          select: () => ({
            single: async () => {
              const updatedRows = applyPatch();
              return { data: updatedRows[0] ? { ...updatedRows[0] } : null, error: null };
            },
            then: (res: any, rej: any) => {
              const updatedRows = applyPatch();
              return Promise.resolve({ data: updatedRows.map((r) => ({ ...r })), error: null }).then(res, rej);
            },
          }),
          then: (resolve: any, reject: any) => {
            const updatedRows = applyPatch();
            return Promise.resolve({ data: updatedRows.map((r) => ({ ...r })), error: null }).then(resolve, reject);
          },
        };
        return updateBuilder;
      },
      then: (resolve: any, reject: any) => {
        let rows = state[tableName].filter((r) => filters.every((f) => f(r)));
        if (limitCount !== null) {
          rows = rows.slice(0, limitCount);
        }
        return Promise.resolve({ data: rows.map((r) => ({ ...r })), error: null }).then(resolve, reject);
      },
    };

    return builder;
  };

  const client: any = {
    from: (table: keyof MockTableState) => createQueryBuilder(table),
  };

  return { client, state };
}

const COMPANY_ID = "44444444-4444-4444-8444-444444444444";

function createTestConfig(keyBuffer?: Buffer): DatabaseBackupConfig {
  const key = keyBuffer || generateEncryptionKey().key;
  return {
    encryption: {
      key,
      keyId: "restore-test-key-2026",
      algorithm: "AES-256-GCM",
    },
    storageProvider: "memory",
    restoreDrillsEnabled: true,
    restoreTargetUrl: "postgresql://postgres:postgres@localhost:54323/restore_test",
    databaseUrl: "postgresql://postgres:postgres@localhost:54322/postgres",
  };
}

test("RestoreDrillService: Rejects in production environment (fail closed)", async () => {
  const origNodeEnv = process.env.NODE_ENV;
  const origFlag = process.env.DATABASE_RESTORE_DRILLS_ENABLED;

  try {
    process.env.NODE_ENV = "production";
    process.env.DATABASE_RESTORE_DRILLS_ENABLED = "true";

    const { client } = createMockSupabase();
    const service = new RestoreDrillService({ supabaseClientSupplier: () => client });

    await assert.rejects(
      () => service.executeRestoreDrill({ companyId: COMPANY_ID, backupRunId: "any-id" }),
      (err: any) => {
        assert.ok(err instanceof StorageError);
        assert.equal(err.code, "RESTORE_DRILLS_DISABLED");
        return true;
      },
    );
  } finally {
    process.env.NODE_ENV = origNodeEnv;
    process.env.DATABASE_RESTORE_DRILLS_ENABLED = origFlag;
  }
});

test("RestoreDrillService: Rejects when explicit DATABASE_RESTORE_DRILLS_ENABLED is missing or false", async () => {
  const origNodeEnv = process.env.NODE_ENV;
  const origFlag = process.env.DATABASE_RESTORE_DRILLS_ENABLED;

  try {
    process.env.NODE_ENV = "development";
    delete process.env.DATABASE_RESTORE_DRILLS_ENABLED;

    const { client } = createMockSupabase();
    const service = new RestoreDrillService({ supabaseClientSupplier: () => client });

    await assert.rejects(
      () => service.executeRestoreDrill({ companyId: COMPANY_ID, backupRunId: "any-id" }),
      (err: any) => {
        assert.ok(err instanceof StorageError);
        assert.equal(err.code, "RESTORE_DRILLS_DISABLED");
        return true;
      },
    );
  } finally {
    process.env.NODE_ENV = origNodeEnv;
    process.env.DATABASE_RESTORE_DRILLS_ENABLED = origFlag;
  }
});

test("RestoreDrillService: Rejects when target DB URL matches live source DB URL", async () => {
  const origNodeEnv = process.env.NODE_ENV;
  const origFlag = process.env.DATABASE_RESTORE_DRILLS_ENABLED;
  const origSourceDb = process.env.DATABASE_URL;

  try {
    process.env.NODE_ENV = "test";
    process.env.DATABASE_RESTORE_DRILLS_ENABLED = "true";
    process.env.DATABASE_URL = "postgresql://postgres:secret@127.0.0.1:5432/live_db";

    const { client } = createMockSupabase();
    const service = new RestoreDrillService({ supabaseClientSupplier: () => client });

    await assert.rejects(
      () =>
        service.executeRestoreDrill({
          companyId: COMPANY_ID,
          backupRunId: "any-id",
          targetDatabaseUrl: "postgresql://postgres:secret@127.0.0.1:5432/live_db",
        }),
      (err: any) => {
        assert.ok(err instanceof StorageError);
        assert.equal(err.code, "TARGET_EQUALS_SOURCE");
        return true;
      },
    );
  } finally {
    process.env.NODE_ENV = origNodeEnv;
    process.env.DATABASE_RESTORE_DRILLS_ENABLED = origFlag;
    process.env.DATABASE_URL = origSourceDb;
  }
});

test("RestoreDrillService: Successful non-production restore drill verification", async () => {
  const origNodeEnv = process.env.NODE_ENV;
  const origFlag = process.env.DATABASE_RESTORE_DRILLS_ENABLED;

  try {
    process.env.NODE_ENV = "test";
    process.env.DATABASE_RESTORE_DRILLS_ENABLED = "true";

    const config = createTestConfig();
    const memoryProvider = new MemoryStorageProvider();

    // 1. Prepare synthetic backup
    const sampleSql = "CREATE TABLE test_restore (id serial primary key, name text); INSERT INTO test_restore (name) VALUES ('restored_item');";
    const encResult = await encryptDatabasePayload(sampleSql, config.encryption.key, config.encryption.keyId);

    const backupRunId = crypto.randomUUID();
    const storageKey = `companies/${COMPANY_ID}/database-backups/2026-09-01/${backupRunId}.engoryx.enc`;
    const storageBucket = "database-backups";

    await memoryProvider.putObject({
      bucket: storageBucket,
      key: storageKey,
      bytes: new Uint8Array(encResult.encryptedBuffer),
      contentType: "application/octet-stream",
      companyId: COMPANY_ID,
    });

    const { client, state } = createMockSupabase([
      {
        id: backupRunId,
        company_id: COMPANY_ID,
        backup_type: "LOGICAL_FULL",
        database_scope: "ALL_PUBLIC_TABLES",
        storage_provider: "memory",
        storage_bucket: storageBucket,
        storage_key: storageKey,
        encryption_algorithm: "AES-256-GCM",
        encryption_key_id: config.encryption.keyId,
        encrypted_size_bytes: encResult.sizeBytes,
        encrypted_sha256: encResult.encryptedSha256,
        plaintext_sha256: encResult.plaintextSha256,
        status: "VERIFIED",
        verification_status: "MATCHED",
        schema_version: "20260901160000",
      },
    ]);

    const service = new RestoreDrillService({
      supabaseClientSupplier: () => client,
      privilegedClientSupplier: () => client,
      storageProviderSupplier: () => memoryProvider,
      configSupplier: () => config,
      restoreRunner: new MockRestoreRunner(),
    });

    // 2. Execute restore drill
    const result = await service.executeRestoreDrill({
      companyId: COMPANY_ID,
      backupRunId,
      targetDatabaseUrl: "postgresql://postgres:secret@127.0.0.1:54323/non_prod_restore",
    });

    assert.equal(result.success, true);
    assert.equal(result.drillRecord.drillStatus, "SUCCESS");
    assert.equal(result.drillRecord.backupRunId, backupRunId);
    assert.equal(result.drillRecord.companyId, COMPANY_ID);
    assert.ok(result.drillRecord.completedAt);
    assert.ok(result.drillRecord.verificationSummary);
    assert.equal(result.drillRecord.verificationSummary.rlsVerified, true);

    // 3. Verify state in DB
    assert.equal(state.database_restore_drills.length, 1);
    assert.equal(state.database_restore_drills[0].drill_status, "SUCCESS");
  } finally {
    process.env.NODE_ENV = origNodeEnv;
    process.env.DATABASE_RESTORE_DRILLS_ENABLED = origFlag;
  }
});
