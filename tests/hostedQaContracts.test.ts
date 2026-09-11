import assert from "node:assert/strict";
import test from "node:test";
import {
  assertHostedQaTarget,
  createHostedQaEngineeringStorageFixture,
  hostedQaHealthFailureReasons,
  hostedQaRequiredTextPresent,
  hostedQaRouteReadinessState,
  probeHostedQaStorageObject,
  sanitizeHostedQaStorageError,
  waitForHostedQaHealth,
  waitForHostedQaRouteReadiness,
} from "../scripts/qa/hostedQaContracts.ts";

const COMPANY_ID = "c1234567-0000-4000-a000-000000000001";
const DOCUMENT_ID = "d1234567-0000-4000-a000-000000000001";
const REVISION_ID = "e1234567-0000-4000-a000-000000000001";

test("hosted QA route readiness stays unresolved while app/auth/company access is loading", () => {
  assert.equal(hostedQaRouteReadinessState("Loading HydroQualiSense…"), "loading");
  assert.equal(hostedQaRouteReadinessState("Loading Hydroqualisense…"), "loading");
  assert.equal(hostedQaRouteReadinessState("LOADING HYDROQUALISENSE…"), "loading");
  assert.equal(hostedQaRouteReadinessState("Loading company access…"), "loading");
  assert.equal(hostedQaRouteReadinessState("Checking your workspace session…"), "loading");
  assert.equal(hostedQaRouteReadinessState("Loading workspace…"), "loading");
  assert.equal(hostedQaRouteReadinessState("QA ENVIRONMENT · SYNTHETIC DATA ONLY HydroQualiSense QA Synthetic"), "resolved");
});

test("hosted QA health identity requires QA, deployment, exact SHA, and migration parity", () => {
  const expected = { environment: "qa" as const, deploymentId: "qa-hydroqualisense", repositorySha: "a".repeat(40), migrationLevel: "20260908235742" };
  assert.deepEqual(hostedQaHealthFailureReasons({ httpStatus: 200, release: { environment: "qa", deploymentId: "qa-hydroqualisense", repositorySha: expected.repositorySha, migrationLevel: expected.migrationLevel } }, expected), []);
  assert.deepEqual(hostedQaHealthFailureReasons({ httpStatus: 200, release: { environment: "qa", deploymentId: "qa-hydroqualisense", repositorySha: "b".repeat(40), migrationLevel: expected.migrationLevel } }, expected), ["repository_sha_mismatch"]);
  assert.deepEqual(hostedQaHealthFailureReasons({ httpStatus: 200, release: { environment: "production", deploymentId: "wrong", repositorySha: expected.repositorySha, migrationLevel: "old" } }, expected), ["environment_not_qa", "deployment_id_mismatch", "migration_level_mismatch"]);
});

test("hosted QA exact deployment readiness polls old SHA only within a bounded window", async () => {
  let now = 0;
  let reads = 0;
  const expected = { environment: "qa" as const, deploymentId: "qa-hydroqualisense", repositorySha: "a".repeat(40), migrationLevel: "20260908235742" };
  const result = await waitForHostedQaHealth(async () => {
    reads += 1;
    return { httpStatus: 200, release: { environment: "qa", deploymentId: "qa-hydroqualisense", repositorySha: reads === 1 ? "b".repeat(40) : expected.repositorySha, migrationLevel: expected.migrationLevel } };
  }, expected, { timeoutMs: 100, pollMs: 20, now: () => now, sleep: async (milliseconds) => { now += milliseconds; } });
  assert.equal(result.status, "PASS");
  assert.equal(result.attempts, 2);
  assert.equal(result.waitedMs, 20);

  now = 0;
  const timedOut = await waitForHostedQaHealth(async () => ({ httpStatus: 200, release: { environment: "qa", deploymentId: "qa-hydroqualisense", repositorySha: "b".repeat(40), migrationLevel: expected.migrationLevel } }), expected, { timeoutMs: 40, pollMs: 20, now: () => now, sleep: async (milliseconds) => { now += milliseconds; } });
  assert.equal(timedOut.status, "TIMEOUT");
  assert.ok(timedOut.failureReasons.includes("qa_deployment_not_ready_for_expected_sha"));
});

test("hosted QA route readiness uses a bounded timeout and preserves timeout failures", async () => {
  let captured: any[] = [];
  await waitForHostedQaRouteReadiness({
    waitForFunction: async (...args: any[]) => {
      captured = args;
      return undefined;
    },
  }, 4_321);
  assert.equal(captured[2]?.timeout, 4_321);
  assert.ok(captured[2]?.polling > 0);

  await assert.rejects(
    () => waitForHostedQaRouteReadiness({ waitForFunction: async () => { throw new Error("Timeout while waiting for company access"); } }, 50),
    /Timeout while waiting for company access/,
  );
});

test("hosted QA browser readiness predicate is case-insensitive for loading shells", async () => {
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  let invoked = false;

  try {
    await waitForHostedQaRouteReadiness({
      waitForFunction: async (predicate: (markers: readonly string[]) => boolean, markers: readonly string[]) => {
        invoked = true;
        Object.defineProperty(globalThis, "document", {
          configurable: true,
          value: { body: { innerText: "Loading Hydroqualisense…" } },
        });
        assert.equal(predicate(markers), false);

        Object.defineProperty(globalThis, "document", {
          configurable: true,
          value: { body: { innerText: "Dashboard\nEngineering operations" } },
        });
        assert.equal(predicate(markers), true);
      },
    }, 250);
    assert.equal(invoked, true);
  } finally {
    if (originalDocument) Object.defineProperty(globalThis, "document", originalDocument);
    else delete (globalThis as { document?: unknown }).document;
  }
});

test("hosted QA Engineering Documents fixtures use the canonical UUID-bound PDF path", () => {
  const fixture = createHostedQaEngineeringStorageFixture(COMPANY_ID, {
    documentId: DOCUMENT_ID,
    revisionId: REVISION_ID,
    fileName: "QA synthetic drawing.pdf",
    uniqueSuffix: "ignored-for-explicit-name",
  });
  assert.equal(fixture.fileName, "QA_synthetic_drawing.pdf");
  assert.equal(fixture.objectPath, `companies/${COMPANY_ID}/documents/${DOCUMENT_ID}/revisions/${REVISION_ID}/QA_synthetic_drawing.pdf`);
  assert.equal(fixture.companyId, COMPANY_ID);
});

test("hosted QA Storage object probe verifies bytes and cleans up after success", async () => {
  const bytes = new TextEncoder().encode("%PDF-1.4\nsynthetic hosted QA PDF");
  const fixture = createHostedQaEngineeringStorageFixture(COMPANY_ID, {
    documentId: DOCUMENT_ID,
    revisionId: REVISION_ID,
    fileName: "qa-runtime.pdf",
  });
  let uploadedOptions: { contentType: string; upsert: boolean } | undefined;
  let removedPaths: string[] = [];
  const result = await probeHostedQaStorageObject({
    objectPath: fixture.objectPath,
    bytes,
    bucket: {
      upload: async (_path, _body, options) => {
        uploadedOptions = options;
        return { error: null };
      },
      download: async () => ({ data: { arrayBuffer: async () => bytes.slice().buffer as ArrayBuffer }, error: null }),
      remove: async (paths) => {
        removedPaths = paths;
        return { error: null };
      },
    },
  });

  assert.equal(result.status, "PASS");
  assert.equal(result.authorizedRead, true);
  assert.equal(result.cleanup, "PASS");
  assert.deepEqual(uploadedOptions, { contentType: "application/pdf", upsert: false });
  assert.deepEqual(removedPaths, [fixture.objectPath]);
  assert.equal(result.sha256, result.downloadedSha256);
});

test("hosted QA Storage object probe cleans up after a read failure", async () => {
  const bytes = new TextEncoder().encode("%PDF-1.4\nsynthetic hosted QA PDF");
  const fixture = createHostedQaEngineeringStorageFixture(COMPANY_ID, {
    documentId: DOCUMENT_ID,
    revisionId: REVISION_ID,
    fileName: "qa-runtime-failure.pdf",
  });
  let removeCalls = 0;
  const result = await probeHostedQaStorageObject({
    objectPath: fixture.objectPath,
    bytes,
    bucket: {
      upload: async () => ({ error: null }),
      download: async () => ({ data: null, error: { statusCode: 404, message: "access_token=should-not-be-recorded" } }),
      remove: async () => {
        removeCalls += 1;
        return { error: null };
      },
    },
  });

  assert.equal(result.status, "FAIL");
  assert.equal(result.authorizedRead, false);
  assert.equal(result.cleanup, "PASS");
  assert.equal(removeCalls, 1);
  assert.equal(result.failure?.operation, "download");
  assert.doesNotMatch(JSON.stringify(result), /should-not-be-recorded/);
});

test("hosted QA Storage provider evidence reports safe classification/code/message", () => {
  const failure = sanitizeHostedQaStorageError("upload", {
    statusCode: "403",
    error: "Unauthorized",
    message: "access_token=ACCESS_SECRET refresh_token=REFRESH_SECRET Authorization: Bearer BEARER_SECRET session_token=SESSION_SECRET",
  });
  assert.equal(failure.classification, "http-403");
  assert.equal(failure.code, "403");
  assert.match(failure.message, /\[REDACTED\]/);
  assert.doesNotMatch(JSON.stringify(failure), /ACCESS_SECRET|REFRESH_SECRET|BEARER_SECRET|SESSION_SECRET/);
});

test("hosted QA production-host refusal remains intact", () => {
  assert.throws(() => assertHostedQaTarget("https://hydroqualisense.com"), /production host/i);
  assert.throws(() => assertHostedQaTarget("https://example.com"), /unapproved host/i);
  assert.doesNotThrow(() => assertHostedQaTarget("https://hydroqualisense-qa.onrender.com"));
});

test("hosted QA required-text contracts ignore presentation-only casing", () => {
  assert.equal(hostedQaRequiredTextPresent("UNIFIED ACCESS SURFACE", "Unified access surface"), true);
  assert.equal(hostedQaRequiredTextPresent("Documents register", "Unified access surface"), false);
});
