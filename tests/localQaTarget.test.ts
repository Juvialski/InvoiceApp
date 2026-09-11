import assert from "node:assert/strict";
import test from "node:test";
import { assertLocalQaTarget, assertProductionTargetIsRefused, isBrowserSafeSupabaseKey, LOCAL_QA_DEPLOYMENT_ID, LOCAL_QA_PROJECT_REF, LOCAL_QA_PRODUCTION_PROJECT_REF } from "../src/lib/localQaTarget.ts";

const valid = {
  supabaseUrl: `https://${LOCAL_QA_PROJECT_REF}.supabase.co`,
  expectedQaProjectRef: LOCAL_QA_PROJECT_REF,
  productionProjectRef: LOCAL_QA_PRODUCTION_PROJECT_REF,
  environment: "qa",
  deploymentId: LOCAL_QA_DEPLOYMENT_ID,
  publishableKey: "sb_publishable_test-key",
};

function legacyJwt(role: string) {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({ role })).toString("base64url");
  return `${header}.${payload}.signature`;
}

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

test("local QA accepts a legacy anon JWT but rejects privileged or unknown browser keys", () => {
  assert.equal(isBrowserSafeSupabaseKey(legacyJwt("anon")), true);
  assert.equal(isBrowserSafeSupabaseKey(legacyJwt("service_role")), false);
  assert.equal(isBrowserSafeSupabaseKey("sb_secret_do_not_expose"), false);
  assert.equal(isBrowserSafeSupabaseKey("not-a-supabase-browser-key"), false);
  assert.doesNotThrow(() => assertLocalQaTarget({ ...valid, publishableKey: legacyJwt("anon") }));
  assert.throws(() => assertLocalQaTarget({ ...valid, publishableKey: legacyJwt("service_role") }), /publishable|anon/i);
  assert.throws(() => assertLocalQaTarget({ ...valid, publishableKey: "sb_secret_do_not_expose" }), /publishable|anon/i);
});

test("local QA refuses mismatched project identity", () => {
  assert.throws(() => assertLocalQaTarget({ ...valid, expectedQaProjectRef: "wrong-project-ref" }), /approved QA project/i);
});
