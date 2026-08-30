import test from "node:test";
import assert from "node:assert/strict";
import {
  isAllowlistedAssistantAction,
  isAssistantActionAllowed,
  isAssistantCompanyIdentityCurrent,
  sanitizeAssistantClientAction,
} from "../src/assistant/assistantActionPolicy.ts";
import { pathForAssistantAction } from "../src/assistant/assistantNavigation.ts";

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

test("Phase 1B assistant actions preserve project-scoped RFI and Submittal deep links", () => {
  const rfi = sanitizeAssistantClientAction({ type: "OPEN_RFI", entityId: "rfi-42", projectId: "project-7", label: "Open RFI" });
  const submittal = sanitizeAssistantClientAction({ type: "OPEN_SUBMITTAL", entityId: "submittal-9", projectId: "project-7", roundId: "round-2" });
  assert.deepEqual(rfi, { type: "OPEN_RFI", entityId: "rfi-42", projectId: "project-7", label: "Open RFI" });
  assert.deepEqual(submittal, { type: "OPEN_SUBMITTAL", entityId: "submittal-9", projectId: "project-7", roundId: "round-2" });
  assert.equal(pathForAssistantAction(rfi!), "/projects/project-7/rfis?rfiId=rfi-42");
  assert.equal(pathForAssistantAction(submittal!), "/projects/project-7/submittals?submittalId=submittal-9&roundId=round-2");
  assert.equal(isAssistantActionAllowed(rfi, ["projects.read", "engineering.rfis.read"]), true);
  assert.equal(isAssistantActionAllowed(rfi, ["projects.read"]), false);
  assert.equal(isAssistantActionAllowed(submittal, ["projects.read", "engineering.submittals.read"]), true);
  assert.equal(isAssistantActionAllowed(submittal, ["projects.read"]), false);
});

test("Phase 1C assistant actions preserve project-scoped Daily Site Log deep links", () => {
  const action = sanitizeAssistantClientAction({ type: "OPEN_SITE_LOG", entityId: "site-log-42", projectId: "project-7", label: "Open Site Log" });
  assert.deepEqual(action, { type: "OPEN_SITE_LOG", entityId: "site-log-42", projectId: "project-7", label: "Open Site Log" });
  assert.equal(pathForAssistantAction(action!), "/projects/project-7/site-logs?siteLogId=site-log-42");
  assert.equal(isAssistantActionAllowed(action, ["projects.read", "engineering.sitelogs.read"]), true);
  assert.equal(isAssistantActionAllowed(action, ["projects.read"]), false);
});

test("engineering document actions preserve project and revision deep links", () => {
  const action = sanitizeAssistantClientAction({ type: "OPEN_ENGINEERING_DOCUMENT", entityId: "document-42", projectId: "project-7", revisionId: "revision-3", label: "Open drawing" });
  assert.deepEqual(action, { type: "OPEN_ENGINEERING_DOCUMENT", entityId: "document-42", projectId: "project-7", revisionId: "revision-3", label: "Open drawing" });
  assert.equal(pathForAssistantAction(action!), "/projects/project-7/documents?docId=document-42&revId=revision-3");
  assert.equal(isAssistantActionAllowed(action, ["projects.read", "engineering.documents.read"]), true);
  assert.equal(isAssistantActionAllowed(action, ["projects.read"]), false);
});

test("project workspace navigation respects the selected subview permission", () => {
  const expenses = sanitizeAssistantClientAction({ type: "OPEN_PROJECT", entityId: "project-7", view: "expenses" });
  assert.deepEqual(expenses, { type: "OPEN_PROJECT", entityId: "project-7", view: "expenses" });
  assert.equal(pathForAssistantAction(expenses!), "/projects/project-7/expenses");
  assert.equal(isAssistantActionAllowed(expenses, ["projects.read", "expenses.read"]), true);
  assert.equal(isAssistantActionAllowed(expenses, ["projects.read"]), false);
  assert.deepEqual(sanitizeAssistantClientAction({ type: "OPEN_PROJECT", entityId: "project-7", view: "unknown" }), { type: "OPEN_PROJECT", entityId: "project-7" });
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
