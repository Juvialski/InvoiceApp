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

test("exposes Email / SMS and Documents as primary modules while keeping settings outside the module row", () => {
  assert.deepEqual(NAVIGATION_MODULES.map((module) => module.id), [
    "dashboard",
    "cash",
    "email-sms",
    "documents",
    "projects",
    "procurement",
    "warehouse",
    "equipment",
    "invoices",
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

test("groups visible modules by business workflow without duplicating routes", () => {
  const model = getNavigationModel();
  assert.deepEqual(model.groups.map((group) => group.id), ["operations", "finance", "people", "communications"]);
  const groupedModules = model.groups.flatMap((group) => group.modules.map((module) => module.id));
  assert.deepEqual(new Set(groupedModules), new Set(model.modules.map((module) => module.id)));
  assert.equal(new Set(groupedModules).size, groupedModules.length);
  assert.equal(model.settingsRoute?.id, "settings");
});

test("navigation grouping never bypasses permission filtering", () => {
  const model = getNavigationModel({ permissions: [PERMISSION_KEYS.payrollRead] });
  assert.deepEqual(model.modules.map((module) => module.id), ["payroll"]);
  assert.deepEqual(model.groups.flatMap((group) => group.modules.map((module) => module.id)), ["payroll"]);
  assert.deepEqual(model.groups.map((group) => group.id), ["people"]);
});

test("filters modules and invoice subtabs by permissions", () => {
  const model = getNavigationModel({ permissions: [PERMISSION_KEYS.invoicesExtract] });
  assert.deepEqual(model.modules.map((module) => module.id), ["invoices"]);
  assert.deepEqual(model.modules[0]?.routes.map((route) => [route.id, route.label]), [["extract", "Upload supplier invoice"]]);
  assert.equal(model.settingsRoute, undefined);

  const financeModel = getNavigationModel({ permissions: [PERMISSION_KEYS.invoicesRead] });
  const financeInvoices = financeModel.modules.find((module) => module.id === "invoices");
  assert.deepEqual(financeInvoices?.routes.map((route) => [route.id, route.label]), [
    ["invoices", "Supplier documents"],
    ["review", "Supplier review queue"],
  ]);

  const emailModel = getNavigationModel({ permissions: [PERMISSION_KEYS.gmailRead] });
  assert.deepEqual(emailModel.modules.map((module) => module.id), ["email-sms"]);
  const engineeringDocumentsModel = getNavigationModel({ permissions: [PERMISSION_KEYS.engineeringDocumentsRead] });
  assert.deepEqual(engineeringDocumentsModel.modules.map((module) => module.id), ["documents"]);
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
  assert.equal(getDefaultChildRoute("invoices")?.id, "invoices");
  assert.equal(getDefaultChildRoute("invoices", { permissions: [PERMISSION_KEYS.invoicesExtract] })?.id, "extract");
  assert.equal(getDefaultChildRoute("email-sms", { permissions: [PERMISSION_KEYS.gmailRead] })?.id, "inbox");
  assert.equal(getDefaultChildRoute("invoices", { visibleRouteIds: ["extract"] })?.id, "extract");
});
