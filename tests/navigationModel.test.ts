import test from "node:test";
import assert from "node:assert/strict";
import {
  getDefaultChildRoute,
  getNavigationModel,
  getInvoiceContextualLabels,
  NAVIGATION_MODULES,
} from "../src/navigation/navigationModel.ts";
import { parseHiddenDeploymentModules } from "../src/config/moduleVisibility.ts";
import { PERMISSION_KEYS } from "../src/utils/accessControl.ts";

test("exposes Cash & Banking and Email Intake as primary modules while keeping settings outside the module row", () => {
  assert.deepEqual(NAVIGATION_MODULES.map((module) => module.id), [
    "dashboard",
    "cash",
    "email-intake",
    "projects",
    "procurement",
    "warehouse",
    "expenses",
    "payroll",
    "reports",
  ]);
  assert.equal(getNavigationModel().settingsRoute?.id, "settings");
  assert.deepEqual(getInvoiceContextualLabels(), {
    extract: "Upload supplier invoice",
    review: "Supplier review queue",
    invoices: "Supplier documents",
    vendors: "Vendors",
  });
});

test("filters modules and invoice subtabs by permissions", () => {
  const model = getNavigationModel({ permissions: [PERMISSION_KEYS.invoicesExtract] });
  assert.deepEqual(model.modules.map((module) => module.id), ["expenses"]);
  assert.deepEqual(model.modules[0]?.routes.map((route) => [route.id, route.label]), [["extract", "Upload supplier invoice"]]);
  assert.equal(model.settingsRoute, undefined);

  const financeModel = getNavigationModel({ permissions: [PERMISSION_KEYS.invoicesRead] });
  assert.deepEqual(financeModel.modules[0]?.routes.map((route) => [route.id, route.label]), [
    ["review", "Supplier review queue"],
  ]);

  const emailModel = getNavigationModel({ permissions: [PERMISSION_KEYS.gmailRead] });
  assert.deepEqual(emailModel.modules.map((module) => module.id), ["email-intake"]);
});

test("deployment visibility hides navigation without changing permission or route vocabulary", () => {
  const hiddenModules = parseHiddenDeploymentModules("cash,payroll,settings");
  const model = getNavigationModel({ hiddenModules });
  assert.equal(model.modules.some((module) => module.id === "cash"), false);
  assert.equal(model.modules.some((module) => module.id === "payroll"), false);
  assert.equal(model.modules.some((module) => module.id === "projects"), true);
  assert.equal(model.settingsRoute, undefined);

  const hiddenPayroll = getDefaultChildRoute("payroll", { hiddenModules });
  assert.equal(hiddenPayroll, undefined);

  const visiblePayroll = getDefaultChildRoute("payroll", {
    hiddenModules: parseHiddenDeploymentModules("cash"),
    permissions: [PERMISSION_KEYS.payrollRead],
  });
  assert.equal(visiblePayroll?.id, "payroll");
});

test("selects a usable default child when the preferred child is hidden", () => {
  assert.equal(getDefaultChildRoute("expenses")?.id, "expenses");
  assert.equal(getDefaultChildRoute("expenses", { permissions: [PERMISSION_KEYS.invoicesExtract] })?.id, "extract");
  assert.equal(getDefaultChildRoute("email-intake", { permissions: [PERMISSION_KEYS.gmailRead] })?.id, "inbox");
  assert.equal(getDefaultChildRoute("expenses", { visibleRouteIds: ["extract"] })?.id, "extract");
});
