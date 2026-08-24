import test from "node:test";
import assert from "node:assert/strict";
import {
  isAllowlistedAssistantAction,
  isAssistantActionAllowed,
  isAssistantCompanyIdentityCurrent,
  sanitizeAssistantClientAction,
} from "../src/assistant/assistantActionPolicy.ts";

test("assistant actions are reduced to known routes, entities, and tours", () => {
  assert.deepEqual(sanitizeAssistantClientAction({ type: "NAVIGATE", routeId: "reports", label: "Reports" }), { type: "NAVIGATE", routeId: "reports", label: "Reports" });
  assert.deepEqual(sanitizeAssistantClientAction({ type: "OPEN_INVOICE", entityId: "invoice-42" }), { type: "OPEN_INVOICE", entityId: "invoice-42" });
  assert.deepEqual(sanitizeAssistantClientAction({ type: "START_TOUR", tourId: "assistant-basics" }), { type: "START_TOUR", tourId: "assistant-basics" });
  assert.equal(sanitizeAssistantClientAction({ type: "NAVIGATE", routeId: "https://evil.example" }), null);
  assert.equal(sanitizeAssistantClientAction({ type: "NAVIGATE", routeId: "not-a-route" }), null);
  assert.equal(sanitizeAssistantClientAction({ type: "START_TOUR", tourId: "invented-tour" }), null);
  assert.equal(isAllowlistedAssistantAction({ type: "OPEN_PROJECT", entityId: "project-1", route: "https://evil.example" }), true);
  assert.equal(isAllowlistedAssistantAction({ type: "OPEN_EXTERNAL_URL", url: "https://evil.example" }), false);
});

test("assistant actions honor optional frontend permissions", () => {
  const reports = { type: "NAVIGATE", routeId: "reports" } as const;
  assert.equal(isAssistantActionAllowed(reports), true);
  assert.equal(isAssistantActionAllowed(reports, ["reports.financial.read"]), true);
  assert.equal(isAssistantActionAllowed(reports, []), false);
  assert.equal(isAssistantActionAllowed({ type: "START_TOUR", tourId: "reports" }, []), true);
});

test("assistant results cannot cross company or generation boundaries", () => {
  const current = { companyId: "company-a", generation: 7 };
  assert.equal(isAssistantCompanyIdentityCurrent(current, { companyId: "company-a", generation: 7 }), true);
  assert.equal(isAssistantCompanyIdentityCurrent(current, { companyId: "company-a", generation: 8 }), false);
  assert.equal(isAssistantCompanyIdentityCurrent(current, { companyId: "company-b", generation: 7 }), false);
  assert.equal(isAssistantCompanyIdentityCurrent(current, { companyId: null, generation: 7 }), false);
});
