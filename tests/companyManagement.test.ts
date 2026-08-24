import test from "node:test";
import assert from "node:assert/strict";
import { isCurrentManagementRequest, managementResourcesForTab } from "../src/utils/companyManagement.ts";

test("company management loads only resources for the active tab", () => {
  assert.deepEqual(managementResourcesForTab("general"), []);
  assert.deepEqual(managementResourcesForTab("members"), ["members", "invitations"]);
  assert.deepEqual(managementResourcesForTab("ai"), ["ai"]);
  assert.deepEqual(managementResourcesForTab("activity"), ["audit"]);
  assert.deepEqual(managementResourcesForTab("danger"), []);
});

test("late management responses are rejected after company or generation changes", () => {
  const request = { companyId: "company-a", generation: 1 };
  assert.equal(isCurrentManagementRequest(request, { companyId: "company-a", generation: 1 }), true);
  assert.equal(isCurrentManagementRequest(request, { companyId: "company-b", generation: 1 }), false);
  assert.equal(isCurrentManagementRequest(request, { companyId: "company-a", generation: 2 }), false);
});
