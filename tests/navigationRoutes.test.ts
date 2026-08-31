import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_ROUTE_PATH,
  getCanonicalRoutePath,
  getRootRedirect,
  getRouteForAppTab,
  normalizeRoutePath,
  resolveActiveRoute,
  resolveActiveRouteForAppTab,
  resolveRoute,
  ROUTE_DEFINITIONS,
} from "../src/utils/routes.ts";

test("defines one predictable canonical route for every application destination", () => {
  assert.deepEqual(ROUTE_DEFINITIONS.map((route) => route.id), [
    "dashboard",
    "cash",
    "projects",
    "extract",
    "invoices",
    "payroll",
    "expenses",
    "vendors",
    "reports",
    "inbox",
    "review",
    "settings",
  ]);
  assert.equal(new Set(ROUTE_DEFINITIONS.map((route) => route.path)).size, ROUTE_DEFINITIONS.length);
  assert.equal(getRouteForAppTab("extractor")?.id, "extract");
  assert.equal(getRouteForAppTab("inbox")?.path, "/email-intake");
  assert.equal(getRouteForAppTab("cash")?.path, "/cash");
});

test("normalizes paths and resolves root and legacy extract aliases", () => {
  assert.equal(normalizeRoutePath(" projects///?filter=open#top "), "/projects");
  assert.equal(normalizeRoutePath("https://invoice.example/reports/?year=2026"), "/reports");
  assert.equal(getRootRedirect("/"), DEFAULT_ROUTE_PATH);
  assert.equal(getRootRedirect("/projects"), undefined);
  assert.equal(resolveRoute("/").routeId, "dashboard");
  assert.equal(resolveRoute("/extractor").routeId, "extract");
  assert.equal(resolveRoute("/email-intake").routeId, "inbox");
  assert.equal(resolveRoute("/inbox").routeId, "inbox");
  assert.equal(resolveRoute("/projects/project-42").routeId, "projects");
});

test("resolves active route state and marks overflow destinations through More", () => {
  const payroll = resolveActiveRoute("/payroll");
  assert.equal(payroll.routeId, "payroll");
  assert.equal(payroll.appTab, "payroll");
  assert.equal(payroll.isMoreActive, true);
  assert.equal(payroll.activeOverflowRouteId, "payroll");

  const invoices = resolveActiveRoute("/invoices");
  assert.equal(invoices.isMoreActive, false);
  assert.equal(invoices.activeOverflowRouteId, null);

  const review = resolveActiveRouteForAppTab("review");
  assert.equal(review.routeId, "review");
  assert.equal(review.canonicalPath, "/review");
  assert.equal(getCanonicalRoutePath("/"), "/dashboard");
  assert.equal(getCanonicalRoutePath("/unknown"), "/unknown");
  assert.equal(resolveRoute("/cash").appTab, "cash");
});
