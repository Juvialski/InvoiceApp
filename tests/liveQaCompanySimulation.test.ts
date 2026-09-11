import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("full live QA harness is exact-deployment-bound and production-read-only", () => {
  const source = readFileSync(new URL("../scripts/live-qa-company-simulation.ts", import.meta.url), "utf8");
  assert.match(source, /assertHostedQaTarget\(BASE_URL/);
  assert.match(source, /waitForHostedQaHealth/);
  assert.match(source, /QA_E2E_EXPECTED_REPOSITORY_SHA/);
  assert.match(source, /QA_E2E_EXPECTED_MIGRATION_LEVEL/);
  assert.match(source, /ROUTE_DEFINITIONS/);
  assert.match(source, /390, 844/);
  assert.match(source, /waitForEvent\("download"/);
  assert.match(source, /QA_E2E_CONTROLLED_RECIPIENT/);
  assert.match(source, /productionWritePolicy: "READ_ONLY"/);
  assert.doesNotMatch(source, /supabase_execute_sql|service_role|apply_migration|from\("[^"]+"\)\.insert\(/i);
});

test("live QA workflow is manually dispatched against QA secrets only", () => {
  const workflow = readFileSync(new URL("../.github/workflows/live-qa-company-simulation.yml", import.meta.url), "utf8");
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /environment: qa/);
  assert.match(workflow, /QA_E2E_EMAIL/);
  assert.match(workflow, /QA_E2E_PASSWORD/);
  assert.match(workflow, /QA_E2E_CONTROLLED_RECIPIENT/);
  assert.doesNotMatch(workflow, /production|PROD|qijjshdwiylojvqojxyz/i);
});
