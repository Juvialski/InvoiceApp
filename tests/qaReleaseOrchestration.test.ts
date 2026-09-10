import assert from "node:assert/strict";
import test from "node:test";
import {
  HYDROQUALISENSE_PRODUCTION_PROJECT_REF,
  HYDROQUALISENSE_QA_DEPLOYMENT_ID,
  HYDROQUALISENSE_QA_POOLER_HOST,
  HYDROQUALISENSE_QA_PROJECT_REF,
  buildQaSessionPoolerDatabaseUrl,
  classifyQaReleasePaths,
  evaluateMigrationParity,
  parseSupabaseMigrationList,
  validateQaReleaseIdentity,
} from "../src/lib/qaReleaseOrchestration.ts";

const migrationList = `
   Local            | Remote           | Time (UTC)
-------------------|------------------|-----------------------
   20260909053311   | 20260909053311   | 2026-09-09 05:33:11
   20260909073452   |                  | 2026-09-09 07:34:52
`;

test("QA release change decisions distinguish docs, runtime, migration, and orchestration commits", () => {
  assert.deepEqual(classifyQaReleasePaths(["docs/release.md", "README.md"]), {
    changeClass: "docs-only",
    hasMigration: false,
    hasRuntime: false,
    hasHostedQaHarness: false,
    requiresHostedQa: false,
  });
  assert.equal(classifyQaReleasePaths(["src/server/releaseMetadata.ts"]).requiresHostedQa, true);
  assert.equal(classifyQaReleasePaths(["supabase/migrations/20270101000000_release.sql"]).changeClass, "migration-bearing");
  assert.equal(classifyQaReleasePaths([".github/workflows/qa-release.yml", "scripts/qa/verify-migration-parity.ts"]).requiresHostedQa, false);
  assert.equal(classifyQaReleasePaths(["scripts/qa/run-supabase.ts", "src/lib/qaDatabaseTarget.ts"]).requiresHostedQa, false);
  assert.equal(classifyQaReleasePaths([], true).requiresHostedQa, true);
});

test("migration parity distinguishes an exact match, a safe remote prefix, and divergent history", () => {
  const rows = parseSupabaseMigrationList(migrationList);
  assert.equal(rows.length, 2);
  const behind = evaluateMigrationParity(["20260909053311", "20260909073452"], rows);
  assert.equal(behind.status, "BEHIND");
  assert.equal(behind.needsPromotion, true);
  assert.equal(behind.observedRemoteHead, "20260909053311");

  const pass = evaluateMigrationParity(["20260909053311"], [rows[0]!]);
  assert.equal(pass.status, "PASS");
  assert.equal(pass.needsPromotion, false);

  const divergent = evaluateMigrationParity(["20260909053311"], [{ local: "20260909053311", remote: "20260909060000" }]);
  assert.equal(divergent.status, "FAIL");
  assert.equal(divergent.needsPromotion, false);
});

test("migration list parsing accepts the current Supabase CLI JSON output", () => {
  const rows = parseSupabaseMigrationList(`Initialising login role...\n{"migrations":[{"local":"20260909053311","remote":"20260909053311","time":"2026-09-09 05:33:11"},{"local":"20260909073452","remote":"","time":"2026-09-09 07:34:52"}],"message":"Migrations listed"}\nConnecting to remote database...`);
  assert.deepEqual(rows, [
    { local: "20260909053311", remote: "20260909053311" },
    { local: "20260909073452", remote: null },
  ]);
});

test("migration list parsing accepts the current Supabase CLI table output with backtick-quoted timestamps", () => {
  const rows = parseSupabaseMigrationList("Initialising login role...\n   `20260909053311` | `20260909053311` | 2026-09-09 05:33:11\n   `20260909073452` |                  | 2026-09-09 07:34:52");
  assert.deepEqual(rows, [
    { local: "20260909053311", remote: "20260909053311" },
    { local: "20260909073452", remote: null },
  ]);
});

test("protected QA release identity fails closed for linked and direct database targets", () => {
  const valid = {
    environment: "qa",
    deploymentId: HYDROQUALISENSE_QA_DEPLOYMENT_ID,
    qaProjectRef: HYDROQUALISENSE_QA_PROJECT_REF,
    productionProjectRef: HYDROQUALISENSE_PRODUCTION_PROJECT_REF,
    linkedProjectRef: HYDROQUALISENSE_QA_PROJECT_REF,
    confirmation: "QA_DATABASE_PUSH",
  };
  assert.deepEqual(validateQaReleaseIdentity(valid), []);
  assert.ok(validateQaReleaseIdentity({ ...valid, environment: "" }).includes("environment_not_qa"));
  assert.ok(validateQaReleaseIdentity({ ...valid, deploymentId: "qa" }).includes("deployment_id_mismatch"));
  assert.ok(validateQaReleaseIdentity({ ...valid, qaProjectRef: "wrong-project-ref" }).includes("qa_project_ref_mismatch"));
  assert.ok(validateQaReleaseIdentity({ ...valid, qaProjectRef: HYDROQUALISENSE_PRODUCTION_PROJECT_REF }).includes("qa_target_is_production"));
  assert.ok(validateQaReleaseIdentity({ ...valid, linkedProjectRef: "wrong-project-ref" }).includes("linked_project_ref_mismatch"));
  assert.ok(validateQaReleaseIdentity({ ...valid, confirmation: "" }).includes("missing_explicit_qa_confirmation"));
  assert.ok(validateQaReleaseIdentity({ ...valid, qaProjectRef: "", productionProjectRef: "" }).includes("qa_target_is_production"));

  const direct = {
    ...valid,
    linkedProjectRef: "",
    connectionMode: "direct",
    databaseHost: HYDROQUALISENSE_QA_POOLER_HOST,
  };
  assert.deepEqual(validateQaReleaseIdentity(direct), []);
  assert.ok(validateQaReleaseIdentity({ ...direct, databaseHost: "aws-1-ap-southeast-1.pooler.supabase.com" }).includes("qa_database_host_mismatch"));
  assert.ok(validateQaReleaseIdentity({ ...direct, qaProjectRef: HYDROQUALISENSE_PRODUCTION_PROJECT_REF }).includes("qa_target_is_production"));
});

test("protected QA session-pooler URL is pinned to QA and safely encodes the password", () => {
  const fakePassword = "p@ss word?#%";
  const databaseUrl = buildQaSessionPoolerDatabaseUrl({
    projectRef: HYDROQUALISENSE_QA_PROJECT_REF,
    password: fakePassword,
    poolerHost: HYDROQUALISENSE_QA_POOLER_HOST,
  });
  const parsed = new URL(databaseUrl);
  assert.equal(parsed.hostname, HYDROQUALISENSE_QA_POOLER_HOST);
  assert.equal(parsed.port, "5432");
  assert.equal(parsed.username, `postgres.${HYDROQUALISENSE_QA_PROJECT_REF}`);
  assert.equal(decodeURIComponent(parsed.password), fakePassword);
  assert.equal(parsed.pathname, "/postgres");
  assert.equal(parsed.searchParams.get("sslmode"), "require");
  assert.equal(databaseUrl.includes(fakePassword), false);
  assert.throws(() => buildQaSessionPoolerDatabaseUrl({ projectRef: HYDROQUALISENSE_PRODUCTION_PROJECT_REF, password: fakePassword }));
  assert.throws(() => buildQaSessionPoolerDatabaseUrl({ projectRef: HYDROQUALISENSE_QA_PROJECT_REF, password: fakePassword, poolerHost: "wrong.example.com" }));
});
