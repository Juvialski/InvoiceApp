import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import { promises as fsp } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  BACKUP_HEADER_MAGIC,
  BACKUP_HEADER_MAGIC_BUFFER,
  calculateSha256,
  decryptBackupFile,
  decryptDatabasePayload,
  encryptBackupFile,
  encryptDatabasePayload,
  generateEncryptionKey,
  validateEncryptionKey,
} from "../src/lib/databaseBackup/crypto.ts";
import {
  getDatabaseBackupHealth,
  loadDatabaseBackupConfig,
} from "../src/lib/databaseBackup/config.ts";
import {
  DecryptionAuthenticationError,
  InvalidBackupHeaderError,
  InvalidEncryptionKeyError,
  KeyIdMismatchError,
  DatabaseBackupConfigurationError,
} from "../src/lib/databaseBackup/types.ts";
import {
  MockDatabaseExportRunner,
  PostgresDumpExportRunner,
  sanitizeDatabaseUrl,
  sanitizeLogOutput,
} from "../src/server/databaseBackup/exportRunner.ts";

test("validateEncryptionKey accepts 64-char hex, 44-char base64, 32-byte buffer, and 32-byte string", () => {
  const rawKey = crypto.randomBytes(32);
  const hexKey = rawKey.toString("hex");
  const base64Key = rawKey.toString("base64");

  const fromHex = validateEncryptionKey(hexKey);
  assert.equal(fromHex.length, 32);
  assert.deepEqual(fromHex, rawKey);

  const fromBase64 = validateEncryptionKey(base64Key);
  assert.equal(fromBase64.length, 32);
  assert.deepEqual(fromBase64, rawKey);

  const fromBuffer = validateEncryptionKey(rawKey);
  assert.equal(fromBuffer.length, 32);
  assert.deepEqual(fromBuffer, rawKey);

  const ascii32 = "12345678901234567890123456789012";
  const fromAscii = validateEncryptionKey(ascii32);
  assert.equal(fromAscii.length, 32);
});

test("validateEncryptionKey rejects invalid key lengths, formats, and empty keys without leaking secrets", () => {
  const secretKey = "super-secret-key-that-is-too-short";

  assert.throws(
    () => validateEncryptionKey(""),
    (err: any) => {
      assert(err instanceof InvalidEncryptionKeyError);
      assert(!err.message.includes(secretKey));
      return true;
    },
  );

  assert.throws(
    () => validateEncryptionKey(secretKey),
    (err: any) => {
      assert(err instanceof InvalidEncryptionKeyError);
      assert(!err.message.includes(secretKey));
      assert(err.message.includes("256 bits"));
      return true;
    },
  );

  // Short buffer (16 bytes)
  assert.throws(
    () => validateEncryptionKey(crypto.randomBytes(16)),
    (err: any) => {
      assert(err instanceof InvalidEncryptionKeyError);
      assert(err.message.includes("got 16 bytes"));
      return true;
    },
  );

  // Oversized buffer (64 bytes)
  assert.throws(
    () => validateEncryptionKey(crypto.randomBytes(64)),
    (err: any) => {
      assert(err instanceof InvalidEncryptionKeyError);
      assert(err.message.includes("got 64 bytes"));
      return true;
    },
  );
});

test("generateEncryptionKey produces unique valid 256-bit keys", () => {
  const key1 = generateEncryptionKey();
  const key2 = generateEncryptionKey();

  assert.equal(key1.keyBuffer.length, 32);
  assert.equal(key1.keyHex.length, 64);
  assert.notEqual(key1.keyHex, key2.keyHex);

  const validated = validateEncryptionKey(key1.keyHex);
  assert.deepEqual(validated, key1.keyBuffer);
});

test("encryptDatabasePayload and decryptDatabasePayload roundtrip with string and Buffer payloads", async () => {
  const { keyHex } = generateEncryptionKey();
  const keyId = "key-2026-v1";

  // Case 1: String payload (SQL dump)
  const sqlPlaintext = "CREATE TABLE public.test (id uuid PRIMARY KEY);\nINSERT INTO public.test VALUES ('11111111-2222-3333-4444-555555555555');";
  const encrypted1 = await encryptDatabasePayload(sqlPlaintext, keyHex, keyId);

  assert(encrypted1.sizeBytes > sqlPlaintext.length);
  assert.equal(encrypted1.keyId, keyId);
  assert.equal(encrypted1.plaintextSha256, calculateSha256(sqlPlaintext));

  const decrypted1 = await decryptDatabasePayload(encrypted1.encryptedBuffer, keyHex, keyId);
  assert.equal(decrypted1.plaintextBuffer.toString("utf-8"), sqlPlaintext);
  assert.equal(decrypted1.plaintextSha256, encrypted1.plaintextSha256);
  assert.equal(decrypted1.keyId, keyId);

  // Case 2: Binary Buffer payload (100KB)
  const binaryPayload = crypto.randomBytes(100 * 1024);
  const encrypted2 = await encryptDatabasePayload(binaryPayload, keyHex, keyId);
  const decrypted2 = await decryptDatabasePayload(encrypted2.encryptedBuffer, keyHex, keyId);

  assert.deepEqual(decrypted2.plaintextBuffer, binaryPayload);
  assert.equal(decrypted2.plaintextSha256, calculateSha256(binaryPayload));
});

test("encryptDatabasePayload generates unique IV and different ciphertexts for identical plaintext", async () => {
  const { keyHex } = generateEncryptionKey();
  const keyId = "key-test";
  const plaintext = "IDENTICAL_DATABASE_PLAINTEXT_CONTENT";

  const enc1 = await encryptDatabasePayload(plaintext, keyHex, keyId);
  const enc2 = await encryptDatabasePayload(plaintext, keyHex, keyId);

  assert.equal(enc1.plaintextSha256, enc2.plaintextSha256);
  assert.notEqual(enc1.encryptedSha256, enc2.encryptedSha256);
  assert.notDeepEqual(enc1.encryptedBuffer, enc2.encryptedBuffer);

  // Both decrypt to identical plaintext
  const dec1 = await decryptDatabasePayload(enc1.encryptedBuffer, keyHex);
  const dec2 = await decryptDatabasePayload(enc2.encryptedBuffer, keyHex);
  assert.equal(dec1.plaintextBuffer.toString("utf-8"), plaintext);
  assert.equal(dec2.plaintextBuffer.toString("utf-8"), plaintext);
});

test("decryptDatabasePayload rejects wrong decryption key with DecryptionAuthenticationError", async () => {
  const key1 = generateEncryptionKey();
  const key2 = generateEncryptionKey();
  const keyId = "key-a";

  const encrypted = await encryptDatabasePayload("SECRET_DATABASE_BACKUP_ROW", key1.keyHex, keyId);

  await assert.rejects(
    async () => {
      await decryptDatabasePayload(encrypted.encryptedBuffer, key2.keyHex, keyId);
    },
    (err: any) => {
      assert(err instanceof DecryptionAuthenticationError);
      return true;
    },
  );
});

test("decryptDatabasePayload rejects tampered ciphertext (even 1 flipped bit)", async () => {
  const { keyHex } = generateEncryptionKey();
  const keyId = "key-tamper-test";
  const plaintext = "CORRECT_TRANSACTION_LOGS_COMPANY_DATA";

  const encrypted = await encryptDatabasePayload(plaintext, keyHex, keyId);
  const tamperedBuffer = Buffer.from(encrypted.encryptedBuffer);

  // Flip 1 bit in the ciphertext region (last byte)
  tamperedBuffer[tamperedBuffer.length - 1] ^= 0x01;

  await assert.rejects(
    async () => {
      await decryptDatabasePayload(tamperedBuffer, keyHex, keyId);
    },
    (err: any) => {
      assert(err instanceof DecryptionAuthenticationError);
      return true;
    },
  );
});

test("decryptDatabasePayload rejects tampered authentication tag", async () => {
  const { keyHex } = generateEncryptionKey();
  const keyId = "key-auth-tag-tamper";
  const encrypted = await encryptDatabasePayload("CRITICAL_FINANCIAL_RECORDS", keyHex, keyId);

  const tampered = Buffer.from(encrypted.encryptedBuffer);
  // Header is 17 bytes + 2 bytes keyIdLen + keyId.length + 12 bytes IV + 16 bytes auth tag
  const authTagOffset = BACKUP_HEADER_MAGIC_BUFFER.length + 2 + Buffer.from(keyId).length + 12;

  // Corrupt a byte in the auth tag
  tampered[authTagOffset] ^= 0xff;

  await assert.rejects(
    async () => {
      await decryptDatabasePayload(tampered, keyHex, keyId);
    },
    (err: any) => {
      assert(err instanceof DecryptionAuthenticationError);
      return true;
    },
  );
});

test("decryptDatabasePayload rejects malformed magic header and truncated payloads", async () => {
  const { keyHex } = generateEncryptionKey();
  const keyId = "key-header-test";
  const encrypted = await encryptDatabasePayload("SOME_DATA", keyHex, keyId);

  // Case 1: Corrupted header prefix
  const badHeader = Buffer.from(encrypted.encryptedBuffer);
  badHeader[0] = 0x58; // Change first char from 'E'
  await assert.rejects(
    async () => {
      await decryptDatabasePayload(badHeader, keyHex, keyId);
    },
    (err: any) => {
      assert(err instanceof InvalidBackupHeaderError);
      return true;
    },
  );

  // Case 2: Truncated buffer (smaller than minimum header)
  const truncated = encrypted.encryptedBuffer.subarray(0, 20);
  await assert.rejects(
    async () => {
      await decryptDatabasePayload(truncated, keyHex, keyId);
    },
    (err: any) => {
      assert(err instanceof InvalidBackupHeaderError);
      return true;
    },
  );
});

test("decryptDatabasePayload rejects mismatched key ID when expectedKeyId is provided", async () => {
  const { keyHex } = generateEncryptionKey();
  const encrypted = await encryptDatabasePayload("PAYROLL_AND_INVOICE_DATA", keyHex, "key-actual-v1");

  await assert.rejects(
    async () => {
      await decryptDatabasePayload(encrypted.encryptedBuffer, keyHex, "key-expected-v2");
    },
    (err: any) => {
      assert(err instanceof KeyIdMismatchError);
      assert(err.message.includes("key-expected-v2"));
      assert(err.message.includes("key-actual-v1"));
      return true;
    },
  );

  // Succeeds when expectedKeyId matches
  const dec = await decryptDatabasePayload(encrypted.encryptedBuffer, keyHex, "key-actual-v1");
  assert.equal(dec.keyId, "key-actual-v1");
});

test("encryptBackupFile and decryptBackupFile perform disk-to-disk authenticated encryption", async () => {
  const { keyHex } = generateEncryptionKey();
  const keyId = "file-backup-key";
  const tmpDir = os.tmpdir();

  const plainFile = path.join(tmpDir, `test-plain-${crypto.randomUUID()}.sql`);
  const encFile = path.join(tmpDir, `test-enc-${crypto.randomUUID()}.engenc`);
  const restoreFile = path.join(tmpDir, `test-restored-${crypto.randomUUID()}.sql`);

  const originalContent = "INSERT INTO public.work_entries (id, work_date) VALUES ('uuid-1', '2026-09-01');\n".repeat(100);

  try {
    await fsp.writeFile(plainFile, originalContent, { mode: 0o600 });

    const encResult = await encryptBackupFile(plainFile, encFile, keyHex, keyId);
    assert(encResult.sizeBytes > 0);
    assert(fs.existsSync(encFile));

    const decResult = await decryptBackupFile(encFile, restoreFile, keyHex, keyId);
    assert.equal(decResult.keyId, keyId);
    assert.equal(decResult.plaintextSha256, encResult.plaintextSha256);

    const restoredContent = await fsp.readFile(restoreFile, "utf-8");
    assert.equal(restoredContent, originalContent);
  } finally {
    await fsp.unlink(plainFile).catch(() => {});
    await fsp.unlink(encFile).catch(() => {});
    await fsp.unlink(restoreFile).catch(() => {});
  }
});

test("loadDatabaseBackupConfig and getDatabaseBackupHealth inspect health safely without leaking secrets", () => {
  const { keyHex } = generateEncryptionKey();
  const fakeSecretKey = "b2-super-secret-access-key-99999";
  const fakePassword = "pg-super-secret-password-12345";

  const env = {
    DATABASE_BACKUP_ENCRYPTION_KEY: keyHex,
    DATABASE_BACKUP_KEY_ID: "prod-db-2026",
    DATABASE_BACKUP_STORAGE_PROVIDER: "s3",
    DATABASE_BACKUP_S3_ENDPOINT: "https://s3.us-west-004.backblazeb2.com",
    DATABASE_BACKUP_S3_BUCKET: "engoryx-prod-db-backups",
    DATABASE_BACKUP_S3_REGION: "us-west-004",
    DATABASE_BACKUP_S3_ACCESS_KEY_ID: "b2-access-key-id",
    DATABASE_BACKUP_S3_SECRET_ACCESS_KEY: fakeSecretKey,
    DATABASE_RESTORE_DRILLS_ENABLED: "true",
    DATABASE_RESTORE_TARGET_URL: `postgres://postgres:${fakePassword}@localhost:54322/restore_drill`,
    DATABASE_URL: `postgres://postgres:${fakePassword}@localhost:5432/engoryx_db`,
  };

  const config = loadDatabaseBackupConfig(env);
  assert.equal(config.encryption.keyId, "prod-db-2026");
  assert.equal(config.storageProvider, "s3");
  assert.equal(config.s3Config?.bucket, "engoryx-prod-db-backups");
  assert.equal(config.restoreDrillsEnabled, true);

  const health = getDatabaseBackupHealth(env);
  assert.equal(health.isConfigured, true);
  assert.equal(health.encryptionConfigured, true);
  assert.equal(health.storageConfigured, true);
  assert.equal(health.keyId, "prod-db-2026");
  assert.equal(health.storageBucket, "engoryx-prod-db-backups");
  assert.equal(health.storageEndpoint, "https://s3.us-west-004.backblazeb2.com");
  assert.equal(health.hasRestoreTarget, true);
  assert.equal(health.hasSourceDatabaseUrl, true);

  // Health JSON string MUST NOT contain any secret keys or passwords
  const healthJson = JSON.stringify(health);
  assert(!healthJson.includes(keyHex));
  assert(!healthJson.includes(fakeSecretKey));
  assert(!healthJson.includes(fakePassword));
});

test("loadDatabaseBackupConfig rejects missing or invalid encryption key", () => {
  assert.throws(
    () => loadDatabaseBackupConfig({}),
    (err: any) => {
      assert(err instanceof DatabaseBackupConfigurationError);
      assert(err.message.includes("Missing DATABASE_BACKUP_ENCRYPTION_KEY"));
      return true;
    },
  );

  assert.throws(
    () =>
      loadDatabaseBackupConfig({
        DATABASE_BACKUP_ENCRYPTION_KEY: "short-key",
      }),
    (err: any) => {
      assert(err instanceof DatabaseBackupConfigurationError);
      assert(err.message.includes("Invalid DATABASE_BACKUP_ENCRYPTION_KEY"));
      return true;
    },
  );
});

test("MockDatabaseExportRunner produces valid logical export and cleans up temporary file", async () => {
  const runner = new MockDatabaseExportRunner();
  const companyId = "11111111-2222-3333-4444-555555555555";

  // 1. Full logical export
  const fullExport = await runner.exportLogicalDatabase({
    companyId,
    backupType: "LOGICAL_FULL",
  });

  assert(fs.existsSync(fullExport.filePath));
  assert(fullExport.sizeBytes > 0);
  assert.equal(fullExport.plaintextSha256.length, 64);
  assert.equal(fullExport.pgDumpVersion, "16.2 (Mocked)");

  const fullContent = await fsp.readFile(fullExport.filePath, "utf-8");
  assert(fullContent.includes("CREATE TABLE IF NOT EXISTS public.companies"));
  assert(fullContent.includes("INSERT INTO public.companies"));
  assert(fullContent.includes(companyId));

  // Test cleanup()
  await fullExport.cleanup();
  assert(!fs.existsSync(fullExport.filePath));

  // 2. Schema only export
  const schemaExport = await runner.exportLogicalDatabase({
    companyId,
    backupType: "SCHEMA_ONLY",
  });
  const schemaContent = await fsp.readFile(schemaExport.filePath, "utf-8");
  assert(schemaContent.includes("CREATE TABLE"));
  assert(!schemaContent.includes("INSERT INTO"));
  await schemaExport.cleanup();

  // 3. Data only export
  const dataExport = await runner.exportLogicalDatabase({
    companyId,
    backupType: "DATA_ONLY",
  });
  const dataContent = await fsp.readFile(dataExport.filePath, "utf-8");
  assert(!dataContent.includes("CREATE TABLE"));
  assert(dataContent.includes("INSERT INTO"));
  await dataExport.cleanup();
});

test("sanitizeDatabaseUrl and sanitizeLogOutput redact passwords and database tokens", () => {
  const rawUrl = "postgres://postgres:SuperSecretPassword123!@db.internal.cloud:5432/engoryx_production?sslmode=require";
  const sanitized = sanitizeDatabaseUrl(rawUrl);

  assert(!sanitized.includes("SuperSecretPassword123!"));
  assert(sanitized.includes("******"));
  assert(sanitized.includes("db.internal.cloud"));

  const errorLog = `Error connecting to ${rawUrl}: authentication failed for user postgres with password SuperSecretPassword123!`;
  const sanitizedLog = sanitizeLogOutput(errorLog, ["SuperSecretPassword123!"]);

  assert(!sanitizedLog.includes("SuperSecretPassword123!"));
  assert(sanitizedLog.includes("******"));
});
