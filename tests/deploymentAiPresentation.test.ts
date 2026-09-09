import assert from "node:assert/strict";
import test from "node:test";
import {
  DEPLOYMENT_AI_STATUS_UNAVAILABLE,
  deploymentAiEnabledLabel,
  deploymentAiStatusText,
  deploymentAiValidationLabel,
  shouldShowDeploymentAiBootstrap,
  type DeploymentAiConfigLoadState,
} from "../src/lib/deploymentAiPresentation.ts";
import { readDeploymentAiResponse } from "../src/lib/deploymentAiApi.ts";
import type { CompanyAiConfigMetadata } from "../src/server/ai/companyAiTypes.ts";

const COMPANY_ID = "00000000-0000-4000-8000-000000000001";

function config(overrides: Partial<CompanyAiConfigMetadata> = {}): CompanyAiConfigMetadata {
  return {
    companyId: COMPANY_ID,
    provider: "GEMINI",
    enabled: true,
    primaryModel: "gemini-3.5-flash-lite",
    fallbackModel: "gemini-3.7-flash",
    credentialConfigured: true,
    credentialVersion: 1,
    status: "ACTIVE",
    lastTestStatus: "SUCCESS",
    ...overrides,
  };
}

function loaded(value: Partial<CompanyAiConfigMetadata> = {}): Extract<DeploymentAiConfigLoadState, { kind: "loaded" }> {
  return { kind: "loaded", config: config(value) };
}

test("configured and validated AI shows healthy status without a bootstrap form", () => {
  const state = loaded();
  assert.equal(shouldShowDeploymentAiBootstrap(state, true), false);
  assert.equal(deploymentAiStatusText(state.config), "Enabled and provider-validated");
  assert.equal(deploymentAiEnabledLabel(state.config), "Enabled");
  assert.equal(deploymentAiValidationLabel(state.config), "Provider validated");
});

test("deployment AI metadata preserves configured provider health and server eligibility", async () => {
  const parsed = await readDeploymentAiResponse(new Response(JSON.stringify({
    success: true,
    data: {
      companyId: COMPANY_ID,
      provider: "GEMINI",
      enabled: true,
      credentialConfigured: true,
      credentialVersion: 1,
      status: "ACTIVE",
      lastTestStatus: "SUCCESS",
      bootstrapAuthorized: false,
    },
  }), { status: 200 }), COMPANY_ID, "load");
  assert.equal(parsed.credentialConfigured, true);
  assert.equal(parsed.status, "ACTIVE");
  assert.equal(parsed.lastTestStatus, "SUCCESS");
  assert.equal(parsed.bootstrapAuthorized, false);
  assert.equal(shouldShowDeploymentAiBootstrap({ kind: "loaded", config: parsed }, Boolean(parsed.bootstrapAuthorized)), false);
});

test("metadata loading failures never become a bootstrap prompt", () => {
  const state: DeploymentAiConfigLoadState = { kind: "error", message: DEPLOYMENT_AI_STATUS_UNAVAILABLE };
  assert.equal(shouldShowDeploymentAiBootstrap(state, true), false);
  assert.equal(shouldShowDeploymentAiBootstrap({ kind: "loading" }, true), false);
});

test("only a genuinely unconfigured deployment and an eligible operator show initial setup", () => {
  assert.equal(shouldShowDeploymentAiBootstrap(loaded({ credentialConfigured: false, status: "NOT_CONFIGURED", enabled: false, lastTestStatus: "NOT_TESTED" }), true), true);
  assert.equal(shouldShowDeploymentAiBootstrap(loaded({ credentialConfigured: false, status: "NOT_CONFIGURED", enabled: false, lastTestStatus: "NOT_TESTED" }), false), false);
  assert.equal(shouldShowDeploymentAiBootstrap(loaded({ status: "ACTIVE" }), false), false);
});

test("invalid initial AI state keeps the existing authorized remediation path", () => {
  assert.equal(shouldShowDeploymentAiBootstrap(loaded({ status: "INVALID", lastTestStatus: "INVALID_CREDENTIAL", enabled: false }), true), true);
  assert.equal(shouldShowDeploymentAiBootstrap(loaded({ status: "INVALID", lastTestStatus: "INVALID_CREDENTIAL", enabled: false }), false), false);
});

test("a successful response without metadata is a bounded load failure, not NOT_CONFIGURED", async () => {
  await assert.rejects(
    () => readDeploymentAiResponse(new Response(JSON.stringify({ success: true }), { status: 200 }), COMPANY_ID, "load"),
    new RegExp(DEPLOYMENT_AI_STATUS_UNAVAILABLE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
  );
  await assert.rejects(
    () => readDeploymentAiResponse(new Response(JSON.stringify({ success: false, error: "forbidden" }), { status: 403 }), COMPANY_ID, "load"),
    new RegExp(DEPLOYMENT_AI_STATUS_UNAVAILABLE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
  );
  await assert.rejects(
    () => readDeploymentAiResponse(new Response(JSON.stringify({ success: false }), { status: 403 }), COMPANY_ID, "bootstrap"),
    /Initial deployment operator authorization is required/,
  );
});
