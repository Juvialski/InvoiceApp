import test from "node:test";
import assert from "node:assert/strict";
import {
  generateEncryptionKey,
} from "../src/lib/databaseBackup/crypto.ts";
import {
  getDatabaseBackupHealth,
  loadDatabaseBackupConfig,
} from "../src/lib/databaseBackup/config.ts";
import { DatabaseBackupConfigurationError } from "../src/lib/databaseBackup/types.ts";

const KEY = generateEncryptionKey().keyHex;

test("database backup config requires an explicit backup provider", () => {
  assert.throws(
    () => loadDatabaseBackupConfig({ DATABASE_BACKUP_ENCRYPTION_KEY: KEY }),
    (err: any) => {
      assert.ok(err instanceof DatabaseBackupConfigurationError);
      assert.match(err.message, /storage is not configured/i);
      return true;
    },
  );
});

test("durable S3 database backup config requires endpoint, bucket and credentials in every environment", () => {
  assert.throws(
    () => loadDatabaseBackupConfig({
      NODE_ENV: "development",
      DATABASE_BACKUP_ENCRYPTION_KEY: KEY,
      DATABASE_BACKUP_STORAGE_PROVIDER: "s3",
      DATABASE_BACKUP_S3_ENDPOINT: "https://example.invalid",
      DATABASE_BACKUP_S3_ACCESS_KEY_ID: "access",
      DATABASE_BACKUP_S3_SECRET_ACCESS_KEY: "secret",
    }),
    (err: any) => {
      assert.ok(err instanceof DatabaseBackupConfigurationError);
      assert.match(err.message, /endpoint, bucket, access key id, and secret access key/i);
      return true;
    },
  );
});

test("memory database backup provider is test-only", () => {
  assert.throws(
    () => loadDatabaseBackupConfig({
      NODE_ENV: "development",
      DATABASE_BACKUP_ENCRYPTION_KEY: KEY,
      DATABASE_BACKUP_STORAGE_PROVIDER: "memory",
    }),
    (err: any) => {
      assert.ok(err instanceof DatabaseBackupConfigurationError);
      assert.match(err.message, /test-only/i);
      return true;
    },
  );

  const config = loadDatabaseBackupConfig({
    NODE_ENV: "test",
    DATABASE_BACKUP_ENCRYPTION_KEY: KEY,
    DATABASE_BACKUP_STORAGE_PROVIDER: "memory",
  });
  assert.equal(config.storageProvider, "memory");
});

test("database backup health reports unconfigured instead of inventing an S3 bucket", () => {
  const health = getDatabaseBackupHealth({ DATABASE_BACKUP_ENCRYPTION_KEY: KEY });
  assert.equal(health.isConfigured, false);
  assert.equal(health.storageConfigured, false);
  assert.equal(health.storageProvider, undefined);
  assert.equal(health.storageBucket, undefined);
});
