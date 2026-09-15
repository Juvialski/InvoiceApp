import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("role screenshot harness is an exact-release, synthetic-QA-only capture path", () => {
  const source = readFileSync(new URL("../scripts/client-security/capture_role_screenshots.ts", import.meta.url), "utf8");
  for (const credentialName of [
    "CLIENT_SECURITY_QA_COMPANY_ADMIN_EMAIL",
    "CLIENT_SECURITY_QA_FINANCE_EMAIL",
    "CLIENT_SECURITY_QA_PAYROLL_EMAIL",
    "CLIENT_SECURITY_QA_VIEWER_EMAIL",
    "CLIENT_SECURITY_QA_CUSTOM_EMAIL",
  ]) assert.match(source, new RegExp(credentialName));
  assert.match(source, /CLIENT_SECURITY_QA_EXPECTED_SHA/);
  assert.match(source, /CLIENT_SECURITY_QA_EXPECTED_MIGRATION/);
  assert.match(source, /CLIENT_SECURITY_QA_DEPLOYMENT_ID/);
  assert.match(source, /environment.*qa|qa.*environment/i);
  assert.match(source, /hydroqualisense\.com|production/i);
  assert.match(source, /aside\[aria-label=["']Workspace navigation["']\]/);
  assert.match(source, /labels\.flatMap/);
  assert.match(source, /company-access-custom-role-editor-desktop/);
  assert.match(source, /scrollIntoViewIfNeeded/);
  assert.doesNotMatch(source, /\.evaluate\([\s\S]*?(display\s*=\s*["']none|visibility\s*=\s*["']hidden|style\.)/i);
  assert.doesNotMatch(source, /sharp|jimp|canvas|crop/i);
});
