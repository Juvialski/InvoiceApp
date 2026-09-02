import test from "node:test";
import assert from "node:assert/strict";
import { parseHiddenDeploymentModules } from "../src/config/moduleVisibility.ts";
import { isProjectWorkspaceTabDeploymentVisible } from "../src/components/projects/projectWorkspaceVisibility.ts";

test("project workspace module visibility is independent from permission checks", () => {
  const hidden = parseHiddenDeploymentModules("engineering-documents,payroll,reports");
  assert.equal(isProjectWorkspaceTabDeploymentVisible("documents", hidden), false);
  assert.equal(isProjectWorkspaceTabDeploymentVisible("rfis", hidden), false);
  assert.equal(isProjectWorkspaceTabDeploymentVisible("submittals", hidden), false);
  assert.equal(isProjectWorkspaceTabDeploymentVisible("payroll", hidden), false);
  assert.equal(isProjectWorkspaceTabDeploymentVisible("reports", hidden), false);
  assert.equal(isProjectWorkspaceTabDeploymentVisible("invoices", hidden), true);
  assert.equal(isProjectWorkspaceTabDeploymentVisible("site-logs", hidden), true);
  assert.equal(isProjectWorkspaceTabDeploymentVisible("people", hidden), true);
  assert.equal(isProjectWorkspaceTabDeploymentVisible("overview", hidden), true);
});
