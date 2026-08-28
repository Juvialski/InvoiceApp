import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DEMO_QA_SCENARIOS } from "../scripts/qa/demoScenarios.ts";
import { ROUTE_DEFINITIONS } from "../src/utils/routes.ts";

test("every canonical active application route has demo browser smoke coverage", () => {
  const coveredRouteIds = new Set(DEMO_QA_SCENARIOS.map((scenario) => scenario.route.id));
  const missing = ROUTE_DEFINITIONS
    .map((route) => route.id)
    .filter((routeId) => !coveredRouteIds.has(routeId));

  assert.deepEqual(missing, []);
});

test("settings QA verifies product roadmap status labels", () => {
  const scenario = DEMO_QA_SCENARIOS.find((candidate) => candidate.route.id === "settings");
  assert.ok(scenario);
  assert.equal(scenario.interactionState, "feature status verified");
  assert.equal(typeof scenario.action, "function");
});

test("demo settings does not mount production company access management", () => {
  const demoWorkspace = readFileSync(new URL("../src/demo/DemoWorkspace.tsx", import.meta.url), "utf8");
  const settings = readFileSync(new URL("../src/components/Settings.tsx", import.meta.url), "utf8");
  assert.match(demoWorkspace, /showDeploymentAccessManagement=\{false\}/);
  assert.match(settings, /showDeploymentAccessManagement && <DeploymentAccessManagement \/>/);
});
