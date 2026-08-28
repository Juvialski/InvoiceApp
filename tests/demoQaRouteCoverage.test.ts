import test from "node:test";
import assert from "node:assert/strict";
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
