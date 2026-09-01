import test from "node:test";
import assert from "node:assert/strict";
import {
  DEPLOYMENT_MODULE_KEYS,
  isDeploymentModuleVisible,
  parseHiddenDeploymentModules,
  visibleDeploymentModules,
} from "../src/config/moduleVisibility.ts";

test("module visibility defaults preserve every existing deployment module", () => {
  const hidden = parseHiddenDeploymentModules("");
  assert.deepEqual(visibleDeploymentModules(hidden), DEPLOYMENT_MODULE_KEYS);
});

test("module visibility parses configured modules without inventing authorization state", () => {
  const hidden = parseHiddenDeploymentModules(" payroll, CASH,engineering-documents,unknown,payroll ");
  assert.deepEqual([...hidden], ["payroll", "cash", "engineering-documents"]);
  assert.equal(isDeploymentModuleVisible("payroll", hidden), false);
  assert.equal(isDeploymentModuleVisible("projects", hidden), true);
});
