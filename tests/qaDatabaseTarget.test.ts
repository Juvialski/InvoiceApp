import assert from "node:assert/strict";
import test from "node:test";
import { validateQaDatabaseTarget } from "../src/lib/qaDatabaseTarget.ts";
import {
  HYDROQUALISENSE_PRODUCTION_PROJECT_REF,
  HYDROQUALISENSE_QA_DEPLOYMENT_ID,
  HYDROQUALISENSE_QA_POOLER_HOST,
  HYDROQUALISENSE_QA_PROJECT_REF,
} from "../src/lib/qaReleaseOrchestration.ts";

const common = {
  operation: "push" as const,
  environment: "qa",
  deploymentId: HYDROQUALISENSE_QA_DEPLOYMENT_ID,
  expectedDeploymentId: HYDROQUALISENSE_QA_DEPLOYMENT_ID,
  targetProjectRef: HYDROQUALISENSE_QA_PROJECT_REF,
  expectedQaProjectRef: HYDROQUALISENSE_QA_PROJECT_REF,
  productionProjectRef: HYDROQUALISENSE_PRODUCTION_PROJECT_REF,
  confirmation: "QA_DATABASE_PUSH",
};

test("linked QA database target keeps the existing fail-closed project checks", () => {
  const valid = validateQaDatabaseTarget({
    ...common,
    linkedProjectRef: HYDROQUALISENSE_QA_PROJECT_REF,
  });
  assert.equal(valid.valid, true);
  assert.equal(valid.projectRef, HYDROQUALISENSE_QA_PROJECT_REF);

  const mismatch = validateQaDatabaseTarget({ ...common, linkedProjectRef: "wrong-project-ref" });
  assert.equal(mismatch.valid, false);
  assert.ok(mismatch.errors.some((error) => error.includes("linked Supabase project")));
});

test("direct QA database target requires the exact protected session pooler", () => {
  const valid = validateQaDatabaseTarget({
    ...common,
    connectionMode: "direct",
    databaseHost: HYDROQUALISENSE_QA_POOLER_HOST,
  });
  assert.equal(valid.valid, true);

  const wrongHost = validateQaDatabaseTarget({
    ...common,
    connectionMode: "direct",
    databaseHost: "aws-1-ap-southeast-1.pooler.supabase.com",
  });
  assert.equal(wrongHost.valid, false);
  assert.ok(wrongHost.errors.some((error) => error.includes("approved protected QA session pooler")));
});

test("direct QA database target still refuses production and missing confirmation", () => {
  const production = validateQaDatabaseTarget({
    ...common,
    targetProjectRef: HYDROQUALISENSE_PRODUCTION_PROJECT_REF,
    expectedQaProjectRef: HYDROQUALISENSE_PRODUCTION_PROJECT_REF,
    connectionMode: "direct",
    databaseHost: HYDROQUALISENSE_QA_POOLER_HOST,
  });
  assert.equal(production.valid, false);
  assert.ok(production.errors.some((error) => error.includes("configured production project")));

  const missingConfirmation = validateQaDatabaseTarget({
    ...common,
    connectionMode: "direct",
    databaseHost: HYDROQUALISENSE_QA_POOLER_HOST,
    confirmation: "",
  });
  assert.equal(missingConfirmation.valid, false);
  assert.ok(missingConfirmation.errors.some((error) => error.includes("--confirm-qa")));
});
