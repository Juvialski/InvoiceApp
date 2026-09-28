import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const script = readFileSync(new URL("../scripts/hosted-qa-certification.ts", import.meta.url), "utf8");
const hostedQaContracts = readFileSync(new URL("../scripts/qa/hostedQaContracts.ts", import.meta.url), "utf8");
const authPreflight = readFileSync(new URL("../scripts/hosted-qa-auth-preflight.ts", import.meta.url), "utf8");
const workbookCertification = readFileSync(new URL("../scripts/hosted-qa-workbook-certification.ts", import.meta.url), "utf8");
const workflow = readFileSync(new URL("../.github/workflows/hosted-qa-certification.yml", import.meta.url), "utf8");
const packageJson = readFileSync(new URL("../package.json", import.meta.url), "utf8");
const gitignore = readFileSync(new URL("../.gitignore", import.meta.url), "utf8");

test("hosted QA harness fails closed on production and requires authenticated state", () => {
  assert.match(script, /assertHostedQaTarget/);
  assert.match(script, /QA_E2E_STORAGE_STATE_PATH/);
  assert.match(script, /QA_E2E_EMAIL/);
  assert.match(script, /QA_E2E_PASSWORD/);
  assert.match(script, /qa-hydroqualisense/);
  assert.match(script, /QA ENVIRONMENT · SYNTHETIC DATA ONLY/);
  assert.match(script, /HydroQualiSense QA Synthetic/);
  assert.match(script, /waitForHostedQaRouteReadiness/);
  assert.match(script, /waitForHostedQaHealth/);
  assert.match(script, /ROUTE_CONTRACTS/);
  assert.match(script, /Email Provider Status/);
  assert.doesNotMatch(script, /page\.waitForTimeout\(/);
  assert.match(script, /company_access_readiness_timeout/);
  assert.match(script, /prepareEngineeringPdf/);
  assert.match(script, /createHostedQaEngineeringStorageFixture/);
  assert.match(script, /probeHostedQaStorageObject/);
  assert.match(hostedQaContracts, /upsert: false/);
  assert.match(hostedQaContracts, /Loading Engineering Operations Platform/);
  assert.match(hostedQaContracts, /Rechecking company access/);
  assert.match(script, /metadataRowsCreated: 0/);
  assert.doesNotMatch(script, /SUPABASE_SERVICE_ROLE|SUPABASE_AI_SERVER_KEY/i);
  assert.match(gitignore, /\.qa-e2e\//);
});

test("hosted QA authentication preflight requires bounded sign-in readiness and a persisted session", () => {
  assert.match(packageJson, /"qa:hosted": "tsx scripts\/hosted-qa-auth-preflight\.ts && tsx scripts\/hosted-qa-certification\.ts"/);
  assert.match(authPreflight, /AUTH_FORM_TIMEOUT_MS = 20_000/);
  assert.match(authPreflight, /waitForSignInForm/);
  assert.match(authPreflight, /emailInput\.waitFor\(\{ state: "visible", timeout: AUTH_FORM_TIMEOUT_MS \}\)/);
  assert.doesNotMatch(authPreflight, /page\.waitForTimeout\(500\)/);
  assert.match(authPreflight, /waitForPersistedSession/);
  assert.match(authPreflight, /waitForHostedQaHealth/);
  assert.match(authPreflight, /unauthenticatedProtectedNavigation/);
  assert.match(authPreflight, /access_token/);
  assert.match(authPreflight, /refresh_token/);
  assert.match(authPreflight, /page\.reload/);
  assert.match(authPreflight, /fresh protected-page navigation/);
  assert.match(authPreflight, /context\.storageState/);
  assert.match(authPreflight, /authentication\.json/);
  assert.match(authPreflight, /no persisted Supabase session was established/);
  assert.doesNotMatch(authPreflight, /SUPABASE_SERVICE_ROLE|SUPABASE_AI_SERVER_KEY/i);
});

test("Hosted QA workflow is reusable after protected parity and remains manually dispatchable", () => {
  assert.match(workflow, /workflow_call:/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /concurrency:/);
  assert.match(workflow, /QA_E2E_EMAIL/);
  assert.match(workflow, /QA_E2E_PASSWORD/);
  assert.match(workflow, /QA_E2E_STORAGE_PROBE: "1"/);
  assert.match(workflow, /expected_repository_sha/);
  assert.match(workflow, /QA_E2E_EXPECTED_DEPLOYMENT_ID: \$\{\{ inputs\.expected_deployment_id \|\| 'qa-hydroqualisense' \}\}/);
  assert.match(workflow, /QA_E2E_EXPECTED_REPOSITORY_SHA: \$\{\{ inputs\.expected_repository_sha \|\| github\.sha \}\}/);
  assert.doesNotMatch(workflow, /vars\.QA_E2E_EXPECTED_REPOSITORY_SHA/);
  assert.match(workflow, /expected_migration_level/);
  assert.doesNotMatch(workflow, /vars\.QA_E2E_EXPECTED_MIGRATION_LEVEL/);
  assert.match(workflow, /npx --no-install tsx scripts\/repository-migration-level\.ts/);
  assert.match(workflow, /QA_E2E_EXPECTED_MIGRATION_LEVEL=\$migration_level/);
  assert.match(workflow, /\$GITHUB_ENV/);
  assert.match(workflow, /ref: \$\{\{ github\.event_name == 'workflow_dispatch' && github\.sha \|\| inputs\.expected_repository_sha \|\| github\.sha \}\}/);
  assert.match(workflow, /run_operations_workbook_matrix/);
  assert.match(workflow, /always\(\).*inputs\.run_operations_workbook_matrix == true/);
});

test("hosted workbook QA checks the five-sheet round trip without logging credentials", () => {
  assert.match(workbookCertification, /parseOperationsWorkbook/);
  assert.match(workbookCertification, /STALE_CONFLICT/);
  assert.match(workbookCertification, /UNSUPPORTED_PROTECTED_FIELD/);
  assert.match(workbookCertification, /Apply selected/);
  assert.match(workbookCertification, /SUPPLIER_LINKED_SETTLEMENT_FIXTURE_MISSING/);
  assert.match(workbookCertification, /"Supplier Invoice"/);
  assert.match(workbookCertification, /"Confirmed Paid"/);
  assert.match(workbookCertification, /"Settlement State"/);
  assert.match(workbookCertification, /RUNTIME_ERROR_CHECK_FAILED/);
  assert.match(workbookCertification, /screenshotVisibleReview/);
  assert.match(workbookCertification, /rfqLineIdsUnchanged/);
  assert.match(workbookCertification, /purchaseOrderLineIdsUnchanged/);
  assert.match(workbookCertification, /laptop-1280x800/);
  assert.match(workbookCertification, /phone-390x844/);
  assert.doesNotMatch(workbookCertification, /QA_E2E_PASSWORD|QA_E2E_EMAIL/);
  assert.doesNotMatch(workbookCertification, /SUPABASE_SERVICE_ROLE|SUPABASE_AI_SERVER_KEY/i);
});
