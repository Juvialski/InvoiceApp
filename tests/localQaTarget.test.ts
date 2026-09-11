import assert from "node:assert/strict";
import test from "node:test";
import { assertLocalQaTarget, assertProductionTargetIsRefused, LOCAL_QA_DEPLOYMENT_ID, LOCAL_QA_PROJECT_REF, LOCAL_QA_PRODUCTION_PROJECT_REF } from "../src/lib/localQaTarget.ts";

const valid = {
  supabaseUrl: `https://${LOCAL_QA_PROJECT_REF}.supabase.co`,
  expectedQaProjectRef: LOCAL_QA_PROJECT_REF,
  productionProjectRef: LOCAL_QA_PRODUCTION_PROJECT_REF,
  environment: "qa",
  deploymentId: LOCAL_QA_DEPLOYMENT_ID,
  publishableKey: "sb_publishable_test-key",
};

test("local QA target accepts only the exact approved QA project", () => {
  assert.deepEqual(assertLocalQaTarget(valid), {
    projectRef: LOCAL_QA_PROJECT_REF,
    productionProjectRef: LOCAL_QA_PRODUCTION_PROJECT_REF,
    deploymentId: LOCAL_QA_DEPLOYMENT_ID,
  });
});

test("local QA explicitly refuses the configured production project", () => {
  assert.equal(assertProductionTargetIsRefused(valid), true);
  assert.throws(() => assertLocalQaTarget({ ...valid, supabaseUrl: `https://${LOCAL_QA_PRODUCTION_PROJECT_REF}.supabase.co` }), /approved QA project|collision/i);
});

test("local QA refuses mismatched project identity and privileged browser keys", () => {
  assert.throws(() => assertLocalQaTarget({ ...valid, expectedQaProjectRef: "wrong-project-ref" }), /approved QA project/i);
  assert.throws(() => assertLocalQaTarget({ ...valid, publishableKey: "sb_secret_do_not_expose" }), /publishable|anon/i);
});
