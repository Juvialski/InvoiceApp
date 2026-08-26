import test from "node:test";
import assert from "node:assert/strict";
import {
  getDefaultChildRoute,
  getNavigationModel,
  getInvoiceContextualLabels,
  NAVIGATION_MODULES,
} from "../src/navigation/navigationModel.ts";
import { PERMISSION_KEYS } from "../src/utils/accessControl.ts";

test("exposes Cash & Banking as a primary module while keeping settings outside the module row", () => {
  assert.deepEqual(NAVIGATION_MODULES.map((module) => module.id), [
    "dashboard",
    "cash",
    "invoices",
    "projects",
    "expenses",
    "payroll",
    "reports",
  ]);
  assert.equal(getNavigationModel().settingsRoute?.id, "settings");
  assert.deepEqual(getInvoiceContextualLabels(), {
    extract: "Upload",
    inbox: "Gmail",
    review: "Review Queue",
    invoices: "All Invoices",
    vendors: "Vendors",
  });
});

test("filters modules and invoice subtabs by permissions", () => {
  const model = getNavigationModel({ permissions: [PERMISSION_KEYS.invoicesExtract] });
  assert.deepEqual(model.modules.map((module) => module.id), ["invoices"]);
  assert.deepEqual(model.modules[0]?.routes.map((route) => [route.id, route.label]), [["extract", "Upload"]]);
  assert.equal(model.settingsRoute, undefined);

  const financeModel = getNavigationModel({ permissions: [PERMISSION_KEYS.invoicesRead] });
  assert.deepEqual(financeModel.modules[0]?.routes.map((route) => [route.id, route.label]), [
    ["review", "Review Queue"],
    ["invoices", "All Invoices"],
  ]);
});

test("selects a usable default child when the preferred child is hidden", () => {
  assert.equal(getDefaultChildRoute("invoices")?.id, "invoices");
  assert.equal(getDefaultChildRoute("invoices", { permissions: [PERMISSION_KEYS.gmailRead] })?.id, "inbox");
  assert.equal(getDefaultChildRoute("invoices", { visibleRouteIds: ["extract"] })?.id, "extract");
});
