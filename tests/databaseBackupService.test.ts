import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import {
  DatabaseBackupService,
} from "../src/server/databaseBackup/databaseBackupService.ts";
import {
  MockDatabaseExportRunner,
} from "../src/server/databaseBackup/exportRunner.ts";
import {
  generateEncryptionKey,
} from "../src/lib/databaseBackup/crypto.ts";
import {
  type DatabaseBackupConfig,
} from "../src/lib/databaseBackup/types.ts";
import { MemoryStorageProvider } from "../src/lib/storage/providers/memoryProvider.ts";
import type { SupabaseClient } from "@supabase/supabase-js";

interface MockTableState {
  database_backup_runs: Array<Record<string, any>>;
}

let mockTimeCounter = Date.now();

function createMockSupabase(initialRuns: Array<Record<string, any>> = []): {
  client: SupabaseClient;
  state: MockTableState;
} {
  const state: MockTableState = {
    database_backup_runs: [...initialRuns],
  };

  const createQueryBuilder = (tableName: keyof MockTableState) => {
    const filters: Array<(row: Record<string, any>) => boolean> = [];
    let limitCount: number | null = null;
    let orderDesc = false;
    let orderCol = "created_at";

    const builder: any = {
      select: () => builder,
      eq: (col: string, val: any) => {
        filters.push((r) => r[col] === val);
        return builder;
      },
      neq: (col: string, val: any) => {
        filters.push((r) => r[col] !== val);
        return builder;
      },
      order: (col: string, opts?: { ascending?: boolean }) => {
        orderCol = col;
        orderDesc = opts?.ascending === false;
        return builder;
      },
      limit: (n: number) => {
        limitCount = n;
        return builder;
      },
      maybeSingle: async () => {
        let rows = state[tableName].filter((r) => filters.every((f) => f(r)));
        if (orderDesc) {
          rows.sort((a, b) => (b[orderCol] > a[orderCol] ? 1 : -1));
        }
        return { data: rows[0] ? { ...rows[0] } : null, error: null };
      },
      single: async () => {
        let rows = state[tableName].filter((r) => filters.every((f) => f(r)));
        if (orderDesc) {
          rows.sort((a, b) => (b[orderCol] > a[orderCol] ? 1 : -1));
        }
        if (rows.length === 0) return { data: null, error: { message: "Not found" } };
        return { data: { ...rows[0] }, error: null };
      },
      insert: (data: any) => {
        const items = Array.isArray(data) ? data : [data];
        for (const item of items) {
          mockTimeCounter += 1000;
          const row = {
            id: item.id || crypto.randomUUID(),
            created_at: new Date(mockTimeCounter).toISOString(),
            updated_at: new Date(mockTimeCounter).toISOString(),
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
            maybeSingle: async () => {
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
        if (orderDesc) {
          rows.sort((a, b) => (b[orderCol] > a[orderCol] ? 1 : -1));
        }
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

const COMPANY_ID = "33333333-3333-4333-8333-333333333333";
const TEST_DESCRIPTOR_KEY = generateEncryptionKey().keyHex;
process.env.NODE_ENV = "test";
process.env.DATABASE_BACKUP_ENCRYPTION_KEY = TEST_DESCRIPTOR_KEY;
process.env.DATABASE_BACKUP_STORAGE_PROVIDER = "memory";

function createTestConfig(): DatabaseBackupConfig {
  const { key } = generateEncryptionKey();
  return {
    encryption: {
      key,
      keyId: "test-key-2026",
      algorithm: "AES-256-GCM",
    },
    storageProvider: "memory",
    restoreDrillsEnabled: true,
    restoreTargetUrl: "postgresql://postgres:postgres@localhost:54323/restore_test",
    databaseUrl: "postgresql://postgres:postgres@localhost:54322/postgres",
  };
}

test("DatabaseBackupService: Successful end-to-end logical export, encryption, and independent verification", async () => {
  const { client, state } = createMockSupabase();
  const memoryProvider = new MemoryStorageProvider();
  const config = createTestConfig();
  const exportRunner = new MockDatabaseExportRunner({
    syntheticSize: 5000,
    pgDumpVersion: "pg_dump (PostgreSQL) 15.4",
  });

  const service = new DatabaseBackupService({
    supabaseClientSupplier: () => client,
    privilegedClientSupplier: () => client,
    exportRunner,
    storageProviderSupplier: () => memoryProvider,
    configSupplier: () => config,
  });

  const result = await service.createAndExecuteBackup({
    companyId: COMPANY_ID,
    backupType: "LOGICAL_FULL",
    databaseScope: "PUBLIC_APPLICATION_DATA",
  });

  assert.equal(result.success, true);
  assert.equal(result.record.status, "VERIFIED");
  assert.equal(result.record.verificationStatus, "MATCHED");
  assert.ok(result.record.encryptedSizeBytes > 0);
  assert.match(result.record.encryptedSha256, /^[0-9a-f]{64}$/i);
  assert.match(result.record.plaintextSha256!, /^[0-9a-f]{64}$/i);
  assert.equal(result.record.encryptionAlgorithm, "AES-256-GCM");
  assert.equal(result.record.encryptionKeyId, "test-key-2026");
  assert.ok(result.record.completedAt);
  assert.ok(result.record.lastVerifiedAt);

  const storedObject = await memoryProvider.getObject({
    companyId: COMPANY_ID,
    bucket: result.record.storageBucket,
    key: result.record.storageKey,
  });

  assert.ok(storedObject);
  assert.equal(storedObject.bytes.length, result.record.encryptedSizeBytes);
  assert.equal(Buffer.from(storedObject.bytes).subarray(0, 17).toString("utf-8"), "ENGORYX_ENC_DB_V1");

  assert.equal(state.database_backup_runs.length, 1);
  assert.equal(state.database_backup_runs[0].status, "VERIFIED");
  assert.equal(state.database_backup_runs[0].verification_status, "MATCHED");
});

test("DatabaseBackupService: Export runner failure safely records FAILED status without crashing", async () => {
  const { client, state } = createMockSupabase();
  const memoryProvider = new MemoryStorageProvider();
  const config = createTestConfig();
  const failingRunner = {
    exportLogicalDatabase: async () => {
      throw new Error("pg_dump connection refused: port 54322 unreachable");
    },
  };

  const service = new DatabaseBackupService({
    supabaseClientSupplier: () => client,
    privilegedClientSupplier: () => client,
    exportRunner: failingRunner,
    storageProviderSupplier: () => memoryProvider,
    configSupplier: () => config,
  });

  const result = await service.createAndExecuteBackup({
    companyId: COMPANY_ID,
  });

  assert.equal(result.success, false);
  assert.equal(result.record.status, "FAILED");
  assert.match(result.record.lastError || "", /pg_dump connection refused/);
  assert.equal(state.database_backup_runs.length, 1);
  assert.equal(state.database_backup_runs[0].status, "FAILED");
});

test("DatabaseBackupService: Re-verifying a backup detects corrupted remote archives", async () => {
  const { client } = createMockSupabase();
  const memoryProvider = new MemoryStorageProvider();
  const config = createTestConfig();
  const exportRunner = new MockDatabaseExportRunner();

  const service = new DatabaseBackupService({
    supabaseClientSupplier: () => client,
    privilegedClientSupplier: () => client,
    exportRunner,
    storageProviderSupplier: () => memoryProvider,
    configSupplier: () => config,
  });

  const { record } = await service.createAndExecuteBackup({ companyId: COMPANY_ID });
  assert.equal(record.verificationStatus, "MATCHED");

  const corruptedBuffer = Buffer.from("TAMPERED_DATA_BYTES");
  await memoryProvider.putObject({
    bucket: record.storageBucket,
    key: record.storageKey,
    bytes: new Uint8Array(corruptedBuffer),
    contentType: "application/octet-stream",
    companyId: COMPANY_ID,
  });

  const reverified = await service.verifyBackupRun(record.id);
  assert.equal(reverified.verificationStatus, "CORRUPTED");
});

test("DatabaseBackupService: List and get latest verified backup returns accurate records", async () => {
  const { client } = createMockSupabase();
  const memoryProvider = new MemoryStorageProvider();
  const config = createTestConfig();
  const exportRunner = new MockDatabaseExportRunner();

  const service = new DatabaseBackupService({
    supabaseClientSupplier: () => client,
    privilegedClientSupplier: () => client,
    exportRunner,
    storageProviderSupplier: () => memoryProvider,
    configSupplier: () => config,
  });

  const b1 = await service.createAndExecuteBackup({ companyId: COMPANY_ID });
  const b2 = await service.createAndExecuteBackup({ companyId: COMPANY_ID });

  const list = await service.listBackupRuns(COMPANY_ID);
  assert.equal(list.length, 2);

  const latest = await service.getLatestVerifiedBackup(COMPANY_ID);
  assert.ok(latest);
  assert.equal(latest.id, b2.record.id);
});
