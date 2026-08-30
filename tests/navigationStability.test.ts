import assert from "node:assert/strict";
import test from "node:test";
import { appRouteTargetForLocation } from "../src/utils/appRouteTarget.ts";
import { appTabForLocation, parseAppLocation } from "../src/utils/appRouting.ts";
import { createWorkspaceLoadCache } from "../src/lib/workspaceSync.ts";

test("route target and active tab stay synchronized on every top-level navigation", () => {
  const paths = [
    ["/dashboard", "dashboard"],
    ["/projects", "projects"],
    ["/payroll", "payroll"],
    ["/cash", "cash"],
    ["/reports", "reports"],
    ["/settings", "settings"],
    ["/expenses", "expenses"],
    ["/invoices", "invoices"],
  ] as const;

  for (const [path, tab] of paths) {
    const location = parseAppLocation(path);
    assert.equal(appTabForLocation(location), tab, path);
    assert.equal(appRouteTargetForLocation(location), tab, path);
  }
});

test("deep links target their workspace without relying on a previous active tab", () => {
  assert.equal(appRouteTargetForLocation(parseAppLocation("/projects/project-1/payroll")), "projects");
  assert.equal(appRouteTargetForLocation(parseAppLocation("/invoices/invoice-1")), "invoice-workspace");
  assert.equal(appRouteTargetForLocation(parseAppLocation("/review?invoiceId=invoice-1")), "invoice-workspace");
});

test("route transitions do not discard shared workspace data", async () => {
  const cache = createWorkspaceLoadCache<string>({ staleAfterMs: Number.POSITIVE_INFINITY });
  const key = { userId: "user-1", companyId: "company-a", group: "engineering" as const };
  await cache.load(key, () => "rendered-project-snapshot");

  for (const path of ["/dashboard", "/projects", "/payroll", "/cash", "/reports", "/settings", "/dashboard"]) {
    assert.ok(appRouteTargetForLocation(parseAppLocation(path)));
    assert.equal(cache.get(key)?.data, "rendered-project-snapshot", path);
  }
});
