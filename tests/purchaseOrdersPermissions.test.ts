import test from "node:test";
import assert from "node:assert/strict";
import { hasPermission, PERMISSION_KEYS } from "../src/utils/accessControl.ts";
import { isDeploymentModuleVisible } from "../src/config/moduleVisibility.ts";
import { getNavigationModel } from "../src/navigation/navigationModel.ts";

test("procurement permissions are registered in PERMISSION_KEYS", () => {
  assert.equal(PERMISSION_KEYS.procurementRead, "procurement.read");
  assert.equal(PERMISSION_KEYS.procurementWrite, "procurement.manage");
  assert.equal(PERMISSION_KEYS.procurementApprove, "procurement.approve");
});

test("hasPermission correctly evaluates procurement permissions", () => {
  const readerPermissions = ["projects.read", "procurement.read"];
  assert.equal(hasPermission(readerPermissions, PERMISSION_KEYS.procurementRead), true);
  assert.equal(hasPermission(readerPermissions, PERMISSION_KEYS.procurementWrite), false);
  assert.equal(hasPermission(readerPermissions, PERMISSION_KEYS.procurementApprove), false);

  const managerPermissions = ["projects.read", "procurement.read", "procurement.manage"];
  assert.equal(hasPermission(managerPermissions, PERMISSION_KEYS.procurementRead), true);
  assert.equal(hasPermission(managerPermissions, PERMISSION_KEYS.procurementWrite), true);
  assert.equal(hasPermission(managerPermissions, PERMISSION_KEYS.procurementApprove), false);

  const approverPermissions = ["projects.read", "procurement.read", "procurement.manage", "procurement.approve"];
  assert.equal(hasPermission(approverPermissions, PERMISSION_KEYS.procurementApprove), true);
});

test("procurement module visibility defaults to visible when not hidden", () => {
  assert.equal(isDeploymentModuleVisible("procurement", new Set()), true);
  assert.equal(isDeploymentModuleVisible("procurement", new Set(["procurement"])), false);
});

test("navigation model includes procurement when permitted", () => {
  const model = getNavigationModel({ permissions: ["projects.read", "procurement.read"] });
  const procurementModule = model.modules.find((m) => m.id === "procurement");
  assert.ok(procurementModule, "Procurement module should be present in navigation");
  assert.equal(procurementModule.label, "Procurement");
  assert.equal(procurementModule.routes[0]?.id, "procurement");
});
