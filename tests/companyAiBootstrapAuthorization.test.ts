import assert from "node:assert/strict";
import test from "node:test";
import { isDeploymentAiBootstrapAuthorized } from "../src/server/ai/companyAiCredentials.ts";

const OPERATOR = "operator-a";
const OTHER_USER = "operator-b";

function base(overrides: Record<string, unknown> = {}) {
  return {
    companyStatus: "ACTIVE",
    membershipStatus: "ACTIVE",
    membershipRole: "COMPANY_ADMIN",
    aiStatus: "NOT_CONFIGURED",
    credentialConfigured: false,
    operatorUserId: OPERATOR,
    auditEvents: [
      { event_type: "COMPANY_CREATED", metadata: { bootstrap: true, initial_admin_user_id: OPERATOR } },
    ],
    ...overrides,
  } as const;
}

test("only the exact initial Company Admin can bootstrap an unconfigured deployment", () => {
  assert.equal(isDeploymentAiBootstrapAuthorized(base()), true);
  assert.equal(isDeploymentAiBootstrapAuthorized(base({ operatorUserId: OTHER_USER })), false);
  assert.equal(isDeploymentAiBootstrapAuthorized(base({ membershipRole: "FINANCE" })), false);
  assert.equal(isDeploymentAiBootstrapAuthorized(base({ auditEvents: [] })), false);
});

test("invalid AI recovery remains limited to the bootstrap owner before any successful provider test", () => {
  const events = [
    { event_type: "COMPANY_CREATED", metadata: { bootstrap: true, initial_admin_user_id: OPERATOR } },
    { event_type: "COMPANY_AI_CREDENTIAL_CONFIGURED", metadata: { bootstrap: true, operator_user_id: OPERATOR } },
  ];
  assert.equal(isDeploymentAiBootstrapAuthorized(base({ aiStatus: "INVALID", credentialConfigured: true, auditEvents: events })), true);
  assert.equal(isDeploymentAiBootstrapAuthorized(base({ aiStatus: "INVALID", credentialConfigured: true, operatorUserId: OTHER_USER, auditEvents: events })), false);
  assert.equal(isDeploymentAiBootstrapAuthorized(base({ aiStatus: "INVALID", credentialConfigured: true, auditEvents: [...events, { event_type: "COMPANY_AI_CREDENTIAL_TESTED", metadata: { test_status: "SUCCESS" } }] })), false);
});

test("configured healthy or disabled AI never exposes bootstrap eligibility", () => {
  const initial = base();
  assert.equal(isDeploymentAiBootstrapAuthorized({ ...initial, aiStatus: "ACTIVE", credentialConfigured: true }), false);
  assert.equal(isDeploymentAiBootstrapAuthorized({ ...initial, aiStatus: "DISABLED", credentialConfigured: true }), false);
});
