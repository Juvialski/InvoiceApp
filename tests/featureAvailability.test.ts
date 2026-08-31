import test from "node:test";
import assert from "node:assert/strict";
import { ENGORYX_FEATURE_REGISTRY } from "../src/features/registry.ts";
import {
  featureAvailability,
  featureAvailabilityLabel,
  featureAvailabilityForStatus,
} from "../src/features/availability.ts";

test("feature status maps to explicit in-app availability labels", () => {
  assert.equal(featureAvailabilityForStatus("ACTIVE"), "AVAILABLE_NOW");
  assert.equal(featureAvailabilityForStatus("PLANNED"), "PLANNED_NOT_AVAILABLE");
  assert.equal(featureAvailabilityForStatus("FUTURE"), "FUTURE_ROADMAP");

  assert.equal(featureAvailabilityLabel("AVAILABLE_NOW"), "Available now");
  assert.equal(featureAvailabilityLabel("PLANNED_NOT_AVAILABLE"), "Planned — not available");
  assert.equal(featureAvailabilityLabel("FUTURE_ROADMAP"), "Future roadmap");
});

test("every registered feature has an unambiguous product availability state", () => {
  for (const feature of ENGORYX_FEATURE_REGISTRY) {
    const availability = featureAvailability(feature);
    if (feature.status === "ACTIVE") assert.equal(availability, "AVAILABLE_NOW", feature.id);
    if (feature.status === "PLANNED") assert.equal(availability, "PLANNED_NOT_AVAILABLE", feature.id);
    if (feature.status === "FUTURE") assert.equal(availability, "FUTURE_ROADMAP", feature.id);
  }
});

test("unfinished near-term phases remain planned and explicitly unavailable rather than active", () => {
  const planned = ENGORYX_FEATURE_REGISTRY.filter((feature) => feature.status === "PLANNED");
  assert.ok(planned.length > 0);
  assert.ok(planned.every((feature) => featureAvailabilityLabel(featureAvailability(feature)) === "Planned — not available"));
  assert.ok(planned.every((feature) => feature.phase >= 2));
});
