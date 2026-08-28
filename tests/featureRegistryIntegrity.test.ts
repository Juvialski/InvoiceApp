import test from "node:test";
import assert from "node:assert/strict";
import { ENGORYX_FEATURE_REGISTRY } from "../src/features/registry.ts";
import { ALL_PERMISSION_KEYS } from "../src/utils/accessControl.ts";
import { getRouteDefinition } from "../src/utils/routes.ts";

test("feature registry permission metadata uses canonical permission keys", () => {
  const canonicalPermissions = new Set(ALL_PERMISSION_KEYS);
  const invalid = ENGORYX_FEATURE_REGISTRY.flatMap((feature) =>
    (feature.requiredPermissions || [])
      .filter((permission) => !canonicalPermissions.has(permission))
      .map((permission) => `${feature.id}:${permission}`),
  );

  assert.deepEqual(invalid, []);
});

test("registered route metadata points only to canonical app routes", () => {
  const invalid = ENGORYX_FEATURE_REGISTRY
    .filter((feature) => feature.routeId && !getRouteDefinition(feature.routeId))
    .map((feature) => `${feature.id}:${feature.routeId}`);

  assert.deepEqual(invalid, []);
});

test("roadmap status matches the current delivery boundary", () => {
  for (const feature of ENGORYX_FEATURE_REGISTRY) {
    if (feature.status === "ACTIVE") assert.ok(feature.phase <= 1, `${feature.id} should not be active before implementation`);
    if (feature.status === "PLANNED") assert.ok(feature.phase === 2 || feature.phase === 3, `${feature.id} should be a near-term planned feature`);
    if (feature.status === "FUTURE") assert.ok(feature.phase >= 4, `${feature.id} should remain a future roadmap feature`);
  }
});
