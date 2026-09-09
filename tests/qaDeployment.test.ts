import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseDeploymentManifest } from "../src/lib/deploymentManifest.ts";
import { deploymentIdentityFromEnv } from "../src/lib/deploymentIdentity.ts";
import { validateQaDatabaseTarget } from "../src/lib/qaDatabaseTarget.ts";

const qaTemplate = JSON.parse(readFileSync(new URL("../deployment/qa-inventory.template.json", import.meta.url), "utf8")) as unknown;
const bannerSource = readFileSync(new URL("../src/components/DeploymentEnvironmentBanner.tsx", import.meta.url), "utf8");
const uploadSource = readFileSync(new URL("../src/components/UploadZone.tsx", import.meta.url), "utf8");
const publicSource = readFileSync(new URL("../src/public/PublicFunnelRoot.tsx", import.meta.url), "utf8");
const qaScript = readFileSync(new URL("../scripts/qa/run-supabase.ts", import.meta.url), "utf8");
const qaCliScript = readFileSync(new URL("../scripts/qa/supabaseCli.ts", import.meta.url), "utf8");
const runbook = readFileSync(new URL("../docs/HYDROQUALISENSE_DEPLOYMENT_RUNBOOK.md", import.meta.url), "utf8");

test("QA identity is explicit while normal production configuration has no QA marker", () => {
  const production = deploymentIdentityFromEnv({ VITE_HYDROQUALISENSE_ENVIRONMENT: "production", VITE_HYDROQUALISENSE_DEPLOYMENT_ID: "client-a" });
  assert.equal(production.isQa, false);
  assert.equal(production.sampleInvoicesEnabled, false);

  const qa = deploymentIdentityFromEnv({ VITE_HYDROQUALISENSE_ENVIRONMENT: "qa", VITE_HYDROQUALISENSE_DEPLOYMENT_ID: "qa-hydroqualisense", VITE_ENABLE_SAMPLE_INVOICES: "true" });
  assert.equal(qa.isQa, true);
  assert.equal(qa.sampleInvoicesEnabled, true);
});

test("unknown deployment identity fails visibly instead of silently presenting as QA or production", () => {
  const identity = deploymentIdentityFromEnv({ VITE_HYDROQUALISENSE_ENVIRONMENT: "client-a-production" });
  assert.equal(identity.environment, "unknown");
  assert.equal(identity.isQa, false);
});

test("QA inventory template is isolated, synthetic-only, and validates as a QA deployment", () => {
  const manifest = parseDeploymentManifest(qaTemplate);
  assert.equal(manifest.deployments[0]?.environment, "qa");
  assert.equal(manifest.deployments[0]?.configuration.values.synthetic_data_only, true);
  assert.equal(manifest.deployments[0]?.configuration.values.public_funnel_enabled, false);
  assert.equal(manifest.deployments[0]?.supabaseProjectRef, null);
});

test("QA database push requires explicit QA identity, expected/linked reference, and confirmation", () => {
  const base = { environment: "qa", deploymentId: "qa-hydroqualisense", targetProjectRef: "qa-project-ref", expectedQaProjectRef: "qa-project-ref", linkedProjectRef: "qa-project-ref", productionProjectRef: "prod-project-ref", operation: "push" as const };
  assert.equal(validateQaDatabaseTarget({ ...base, confirmation: "QA_DATABASE_PUSH" }).valid, true);
  assert.equal(validateQaDatabaseTarget({ ...base, environment: "production", confirmation: "QA_DATABASE_PUSH" }).valid, false);
  assert.equal(validateQaDatabaseTarget({ ...base, targetProjectRef: "prod-project-ref", confirmation: "QA_DATABASE_PUSH" }).valid, false);
  assert.equal(validateQaDatabaseTarget({ ...base, deploymentId: "qa", confirmation: "QA_DATABASE_PUSH" }).valid, false);
  assert.equal(validateQaDatabaseTarget({ ...base, linkedProjectRef: "prod-project-ref", confirmation: "QA_DATABASE_PUSH" }).valid, false);
  assert.equal(validateQaDatabaseTarget({ ...base, confirmation: "" }).valid, false);
});

test("QA database reset fails closed without the separate destructive confirmation", () => {
  const base = { environment: "qa", deploymentId: "qa-hydroqualisense", targetProjectRef: "qa-project-ref", expectedQaProjectRef: "qa-project-ref", linkedProjectRef: "qa-project-ref", productionProjectRef: "prod-project-ref", operation: "reset" as const };
  assert.equal(validateQaDatabaseTarget({ ...base, confirmation: "QA_DATABASE_PUSH" }).valid, false);
  assert.equal(validateQaDatabaseTarget({ ...base, confirmation: "QA_DATABASE_RESET" }).valid, true);
});

test("QA banner and sample presets remain deployment-gated and the wrapper never seeds reset data", () => {
  assert.match(bannerSource, /QA ENVIRONMENT · SYNTHETIC DATA ONLY/);
  assert.match(bannerSource, /identity\.environment === "production"/);
  assert.match(uploadSource, /currentDeploymentIdentity\(\)\.sampleInvoicesEnabled/);
  assert.match(publicSource, /DeploymentEnvironmentBanner/);
  assert.match(qaScript, /runSupabaseCliSync/);
  assert.match(qaScript, /--linked/);
  assert.match(qaScript, /--no-seed/);
  assert.match(qaCliScript, /process\.env\.ComSpec \|\| "cmd\.exe"/);
  assert.match(runbook, /Blank-project bootstrap and protected release sequence/);
  assert.match(runbook, /Never copy Client A.*production data/i);
});

test("QA wrapper launches the Windows Supabase CLI through cmd.exe", () => {
  assert.match(qaCliScript, /process\.env\.ComSpec \|\| "cmd\.exe"/);
  assert.match(qaCliScript, /\["\/d", "\/s", "\/c", "npx\.cmd", \.\.\.cliArgs\]/);
});
