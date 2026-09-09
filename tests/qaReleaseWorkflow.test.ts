import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const releaseWorkflow = readFileSync(new URL("../.github/workflows/qa-release.yml", import.meta.url), "utf8");
const hostedWorkflow = readFileSync(new URL("../.github/workflows/hosted-qa-certification.yml", import.meta.url), "utf8");
const renderWaitScript = readFileSync(new URL("../scripts/qa/wait-for-qa-deployment.ts", import.meta.url), "utf8");

test("protected QA release workflow is push-driven, QA-environment protected, and exact-SHA bound", () => {
  assert.match(releaseWorkflow, /push:\s*\n\s+branches:\s*\[main\]/);
  assert.match(releaseWorkflow, /workflow_dispatch:/);
  assert.match(releaseWorkflow, /environment:\s+qa/);
  assert.match(releaseWorkflow, /HYDROQUALISENSE_QA_PROJECT_REF:\s*vrpuznofrntyqsbugrib/);
  assert.match(releaseWorkflow, /HYDROQUALISENSE_PRODUCTION_PROJECT_REF:\s*qijjshdwiylojvqojxyz/);
  assert.match(releaseWorkflow, /SUPABASE_ACCESS_TOKEN/);
  assert.match(releaseWorkflow, /SUPABASE_DB_PASSWORD/);
  assert.match(releaseWorkflow, /Missing QA secret/);
  assert.match(releaseWorkflow, /Supabase authentication or project-link failure/);
  assert.match(releaseWorkflow, /Run the existing guarded QA migration promotion/);
  assert.match(releaseWorkflow, /wait-for-qa-deployment\.ts/);
  assert.match(releaseWorkflow, /npm run qa:db:push -- --project-ref "\$HYDROQUALISENSE_QA_PROJECT_REF" --confirm-qa/);
  assert.match(releaseWorkflow, /verify-migration-parity\.ts --phase after/);
  assert.match(releaseWorkflow, /needs: \[classify, qa_release\]/);
  assert.match(releaseWorkflow, /\.\/\.github\/workflows\/hosted-qa-certification\.yml/);
  assert.match(renderWaitScript, /render_deployment_timeout/);
  assert.match(renderWaitScript, /render_identity_mismatch/);
  assert.match(releaseWorkflow, /migration-history|migration parity|parity/i);
});

test("protected QA release serializes active promotion and correctly references pre-parity outputs", () => {
  assert.match(releaseWorkflow, /cancel-in-progress:\s*false/);
  assert.doesNotMatch(releaseWorkflow, /steps\.pre-parity/);
  assert.match(releaseWorkflow, /steps\.pre_parity\.outputs\.needs_promotion/);
  assert.match(releaseWorkflow, /migration_was_behind:\s*\$\{\{\s*steps\.pre_parity\.outputs\.needs_promotion\s*\}\}/);
  assert.match(releaseWorkflow, /needs\.qa_release\.outputs\.migration_was_behind == 'true'/);
});

test("Hosted QA remains manually dispatchable and is reusable only after the protected release job", () => {
  assert.match(hostedWorkflow, /workflow_call:/);
  assert.match(hostedWorkflow, /workflow_dispatch:/);
  assert.doesNotMatch(hostedWorkflow, /^\s+push:/m);
  assert.match(hostedWorkflow, /expected_repository_sha/);
  assert.match(hostedWorkflow, /expected_migration_level/);
  assert.match(hostedWorkflow, /environment:\s+qa/);
});
