import test from "node:test";
import assert from "node:assert/strict";
import {
  ASSISTANT_TOUR_IDS,
  TOUR_REGISTRY,
  isRegisteredTourId,
  isRegisteredTourTarget,
  tourTargetSelector,
  validateTourRegistry,
} from "../src/assistant/tourRegistry.ts";

test("tour registry contains the stable Wave 1 tour set and valid targets", () => {
  assert.deepEqual([...ASSISTANT_TOUR_IDS], [
    "engoryx-overview",
    "cash-banking",
    "first-invoice",
    "gmail-import",
    "projects-costing",
    "engineering-documents",
    "project-lifecycle",
    "payroll-basics",
    "attendance-overtime",
    "payroll-run",
    "workforce-lifecycle",
    "cash-corrections",
    "company-access",
    "reports",
    "assistant-basics",
  ]);
  assert.equal(validateTourRegistry().valid, true);
  assert.equal(isRegisteredTourId("assistant-basics"), true);
  assert.equal(isRegisteredTourId("unknown"), false);
  assert.equal(isRegisteredTourTarget("assistant-composer"), true);
  assert.equal(isRegisteredTourTarget("route:review"), true);
  assert.equal(isRegisteredTourTarget("[data-tour=evil]"), false);
  assert.equal(tourTargetSelector("assistant-composer"), "[data-tour=\"assistant-composer\"]");
  assert.equal(TOUR_REGISTRY["payroll-run"].steps.length, 3);
});
