import test from "node:test";
import assert from "node:assert/strict";
import {
  assertBackupFailureIsolation,
  createPendingBackupRecord,
} from "../src/lib/storage/index.ts";

test("createPendingBackupRecord creates valid replication manifest with normalized hash", () => {
  const companyId = "11111111-2222-3333-4444-555555555555";
  const docId = "doc-999";
  const sha256 = "E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855";

  const record = createPendingBackupRecord({
    companyId,
    documentId: docId,
    sourceProvider: "s3",
    sourceBucket: "primary-bucket",
    sourceKey: `companies/${companyId}/objects/${docId}/v1/inv.pdf`,
    sha256,
    sizeBytes: 1024,
    replicaProvider: "b2",
    replicaBucket: "backup-b2-bucket",
  });

  assert.equal(record.companyId, companyId);
  assert.equal(record.documentId, docId);
  assert.equal(record.sourceProvider, "s3");
  assert.equal(record.replicaProvider, "b2");
  assert.equal(record.replicationState, "PENDING");
  assert.equal(record.verificationStatus, "UNVERIFIED");
  assert.equal(record.sha256, sha256.toLowerCase());
  assert.equal(record.replicaKey, `companies/${companyId}/objects/${docId}/v1/inv.pdf`);
});

test("assertBackupFailureIsolation ensures primary writes never fail due to async backup errors", () => {
  // Case 1: Primary write succeeded, backup encountered network error
  const backupNetworkError = new Error("Connection timed out to Backblaze B2");
  const result1 = assertBackupFailureIsolation(true, backupNetworkError);
  assert.equal(result1.primaryStatus, "COMMITTED");
  assert.equal(result1.backupLogged, true);

  // Case 2: Primary write succeeded, backup succeeded without error
  const result2 = assertBackupFailureIsolation(true, undefined);
  assert.equal(result2.primaryStatus, "COMMITTED");
  assert.equal(result2.backupLogged, false);

  // Case 3: Primary write aborted
  const result3 = assertBackupFailureIsolation(false, undefined);
  assert.equal(result3.primaryStatus, "ABORTED");
});
