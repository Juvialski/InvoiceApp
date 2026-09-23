import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { navigationModuleTourTarget, navigationRouteTourTarget } from "../src/navigation/navigationTours.ts";

const header = readFileSync(new URL("../src/components/Header.tsx", import.meta.url), "utf8");
const accessStates = readFileSync(new URL("../src/components/access/AccessStates.tsx", import.meta.url), "utf8");
const operationsUI = readFileSync(new URL("../src/components/ui/OperationsUI.tsx", import.meta.url), "utf8");
const helpCenter = readFileSync(new URL("../src/components/help/HelpCenterPage.tsx", import.meta.url), "utf8");
const helpAction = readFileSync(new URL("../src/components/help/HelpAction.tsx", import.meta.url), "utf8");
const appShell = readFileSync(new URL("../src/app/AppShell.tsx", import.meta.url), "utf8");
const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");

test("route tour targets are deterministic and independent from module scope", () => {
  assert.equal(navigationRouteTourTarget("extract"), "route:extract");
  assert.equal(navigationRouteTourTarget("inbox"), "route:inbox");
  assert.equal(navigationRouteTourTarget("review"), "route:review");
  assert.equal(navigationRouteTourTarget("invoices"), "route:invoices");
  assert.equal(navigationRouteTourTarget("vendors"), "route:vendors");
  assert.equal(navigationModuleTourTarget("invoices"), "module:invoices");
  assert.equal(navigationModuleTourTarget("dashboard"), undefined);
  assert.match(header, /data-tour=\{navigationRouteTourTarget\(route\.id\)\}/);
  assert.doesNotMatch(header, /data-tour=\{module\.id === "invoices"/);
});

test("account actions use the sidebar menu while the compact header keeps navigation only", () => {
  assert.match(header, /data-app-shell-header="true"/);
  assert.match(header, /aria-label="Open navigation"/);
  assert.match(header, /lg:hidden/);
  assert.doesNotMatch(header, /flex min-w-0 flex-wrap items-center justify-end gap-2 pb-0\.5/);
  assert.doesNotMatch(header, /onBatchExportExcel|BrandMark variant="header"/);
  assert.match(header, /Workspace Settings/);
  assert.match(header, /bottom-\[calc\(100%\+0\.5rem\)\] left-2 right-2/);
  assert.match(header, /aria-controls="sidebar-account-menu"/);
  assert.match(accessStates, /never a tenant selector/);
  assert.match(accessStates, /aria-label=\{`Deployment company:/);
});

test("expanded navigation uses the supplied HydroQualiSense logo and wraps the full company name", () => {
  assert.match(header, /BrandMark variant="sidebar"/);
  assert.match(header, /BrandMark variant="compact"/);
  assert.match(header, /BRAND\.companyName/);
  assert.match(header, /whitespace-normal break-words/);
  assert.doesNotMatch(header, /BrandMark variant="header"/);
  assert.doesNotMatch(header, /<CompanySwitcher/);
  assert.doesNotMatch(header, /Deployment/);
  assert.doesNotMatch(header, new RegExp(["Engineering", "Operations"].join("\\s+")));
  assert.doesNotMatch(header, /BRAND\.tagline/);
});

test("PageHeader owns one route-aware Help action with an explicit Help Center opt-out", () => {
  assert.match(operationsUI, /HelpAction/);
  assert.match(operationsUI, /helpTopicId\?:/);
  assert.match(helpCenter, /helpTopicId=\{null\}/);
  assert.match(helpAction, /data-ui="page-header-help"/);
  assert.match(helpAction, /pathname\.startsWith\("\/demo\/"\)/);
});

test("Help shell context does not activate a business route or permission guard", () => {
  assert.match(appShell, /isHelpRoute/);
  assert.match(header, /isHelpRoute/);
  assert.match(app, /route\.kind === "help"/);
  assert.match(app, /route\.kind !== "help"/);
});
