import test from "node:test";
import assert from "node:assert/strict";
import { getFeatureById } from "../src/features/registry.ts";
import { ALL_PERMISSION_KEYS, PERMISSION_KEYS, permissionDisplayName } from "../src/utils/accessControl.ts";

test("Phase 2 scheduling remains planned while pointing at the prepared foundation", () => {
  const feature = getFeatureById("eng-schedule-gantt");
  assert.ok(feature);
  assert.equal(feature.status, "PLANNED");
  assert.equal(feature.phase, 2);
  assert.equal(feature.moduleId, "projects");
  assert.equal(feature.routeId, "projects");
  assert.deepEqual(feature.requiredPermissions, ["scheduling.read"]);
  assert.equal(feature.documentationRef, "docs/ENGORYX_PHASE_2_PROJECT_SCHEDULING.md");
});

test("Phase 2 scheduling permission vocabulary is reserved without changing route access", () => {
  assert.equal(PERMISSION_KEYS.projectScheduleRead, "scheduling.read");
  assert.equal(PERMISSION_KEYS.projectScheduleManage, "scheduling.manage");
  assert.ok(ALL_PERMISSION_KEYS.includes("scheduling.read"));
  assert.ok(ALL_PERMISSION_KEYS.includes("scheduling.manage"));
  assert.equal(permissionDisplayName("scheduling.read"), "Project schedule viewing");
  assert.equal(permissionDisplayName("scheduling.manage"), "Project schedule management");
});
