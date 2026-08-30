import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { demoPathForProject, parseDemoLocation } from "../src/demo/demoRouting.ts";
import { navigateInApp } from "../src/utils/clientNavigation.ts";

function source(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

test("host navigation uses SPA history and emits one router event", () => {
  const previousWindow = (globalThis as { window?: unknown }).window;
  const calls: string[] = [];
  const location = { pathname: "/demo/app/projects/project-1/rfis", search: "" };
  const updateLocation = (path: string) => {
    const [pathname, search = ""] = path.split("?", 2);
    location.pathname = pathname || "/";
    location.search = search ? `?${search}` : "";
  };
  const fakeWindow = {
    location,
    history: {
      pushState: (_state: unknown, _title: string, path: string) => { calls.push(`push:${path}`); updateLocation(path); },
      replaceState: (_state: unknown, _title: string, path: string) => { calls.push(`replace:${path}`); updateLocation(path); },
    },
    dispatchEvent: () => { calls.push("popstate"); return true; },
  };

  Object.defineProperty(globalThis, "window", { configurable: true, value: fakeWindow });
  try {
    navigateInApp("/demo/app/projects/project-1/rfis?rfiId=rfi-1");
    navigateInApp("/demo/app/projects/project-1/rfis", true);
    navigateInApp("/demo/app/projects/project-1/rfis", true);
    assert.deepEqual(calls, [
      "push:/demo/app/projects/project-1/rfis?rfiId=rfi-1",
      "popstate",
      "replace:/demo/app/projects/project-1/rfis",
      "popstate",
    ]);
  } finally {
    if (previousWindow === undefined) delete (globalThis as { window?: unknown }).window;
    else Object.defineProperty(globalThis, "window", { configurable: true, value: previousWindow });
  }
});

test("demo project detail paths stay inside the isolated route namespace", () => {
  const path = demoPathForProject("demo-project-warehouse", "rfis", { rfiId: "demo-rfi-1" });
  assert.equal(path, "/demo/app/projects/demo-project-warehouse/rfis?rfiId=demo-rfi-1");
  const location = parseDemoLocation(path);
  assert.equal(location.kind, "app");
  if (location.kind !== "app" || location.appLocation.kind !== "project") return;
  assert.equal(location.appLocation.view, "rfis");
  const [pathname, search = ""] = path.split("?", 2);
  const parsedWithBrowserSearch = parseDemoLocation(pathname, `?${search}`);
  assert.equal(parsedWithBrowserSearch.kind, "app");
  if (parsedWithBrowserSearch.kind !== "app" || parsedWithBrowserSearch.appLocation.kind !== "project") return;
  assert.equal(parsedWithBrowserSearch.appLocation.rfiId, "demo-rfi-1");
});

test("project detail routes use the host router and preserve usable refresh snapshots", () => {
  const router = source("src/app/routes/AppRouter.tsx");
  const workspace = source("src/components/projects/ProjectWorkspace.tsx");
  const rfi = source("src/components/engineering/ProjectRfis.tsx");
  const submittal = source("src/components/engineering/ProjectSubmittals.tsx");
  const siteLog = source("src/components/engineering/ProjectSiteLogs.tsx");
  const payrollRoute = source("src/app/routes/PayrollRoute.tsx");
  const coordination = source("src/features/engineering/useEngineeringCoordinationController.ts");
  const documents = source("src/features/engineering/useEngineeringDocumentsController.ts");
  const dailyLogs = source("src/features/engineering/useDailySiteLogsController.ts");
  const projectDocuments = source("src/components/engineering/ProjectDocuments.tsx");

  assert.match(router, /onNavigatePath\?: AppNavigate/);
  assert.match(router, /onNavigatePath=\{onNavigatePath\}/);
  assert.match(workspace, /onNavigatePath=\{onNavigatePath\}/);
  for (const component of [rfi, submittal, siteLog]) {
    assert.match(component, /onNavigatePath\?: AppNavigate/);
    assert.match(component, /navigateInApp/);
    assert.doesNotMatch(component, /history\.(?:pushState|replaceState)/);
  }
  for (const controller of [coordination, documents, dailyLogs]) {
    assert.match(controller, /hasLoaded/);
    assert.match(controller, /loadedScopeRef/);
  }
  for (const controller of [coordination, dailyLogs]) {
    assert.match(controller, /loadRequestRef/);
    assert.match(controller, /loadRequestRef\.current !== requestId/);
    assert.match(controller, /loadRequestRef\.current === requestId/);
  }
  assert.match(rfi, /isLoading && !controller\.hasLoaded/);
  assert.match(submittal, /isLoading && !controller\.hasLoaded/);
  assert.match(siteLog, /isLoading && !controller\.hasLoaded/);
  assert.match(payrollRoute, /requestedTargetMissing/);
  assert.match(payrollRoute, /Payroll destination unavailable/);
  assert.match(projectDocuments, /isLoading\s*&&\s*!hasLoaded/);
  assert.doesNotMatch(documents, /setDocuments\(\[\]\)/);
});

test("route-local settlement links can stay in the SPA", () => {
  const invoiceRoute = source("src/app/routes/InvoicesRoute.tsx");
  const payrollRoute = source("src/app/routes/PayrollRoute.tsx");
  const cashRoute = source("src/app/routes/CashBankingRoute.tsx");
  const cashWorkspace = source("src/components/CashSettlementAllocationWorkspace.tsx");
  const settlementCard = source("src/components/FinancialSettlementCard.tsx");

  assert.match(invoiceRoute, /onNavigatePath=\{onNavigatePath\}/);
  assert.match(payrollRoute, /props\.onNavigatePath/);
  assert.match(cashRoute, /onNavigatePath=\{props\.onNavigatePath\}/);
  assert.match(cashWorkspace, /selectedTransactionId/);
  assert.match(cashWorkspace, /requestedTransactionUnavailable/);
  assert.match(settlementCard, /onNavigatePath\?: AppNavigate/);
  assert.match(settlementCard, /refreshRequestRef/);
  assert.match(settlementCard, /refreshRequestRef\.current !== requestId/);
  assert.match(settlementCard, /\[targetKey\]/);
});

test("Assistant request recovery cannot let an aborted request clear a newer operation", () => {
  const provider = source("src/assistant/AssistantProvider.tsx");
  assert.match(provider, /requestAbortRef\.current !== controller/);
  assert.match(provider, /requestAbortRef\.current === controller && isAssistantCompanyIdentityCurrent/);
});
