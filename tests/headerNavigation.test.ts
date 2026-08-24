import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { navigationModuleTourTarget, navigationRouteTourTarget } from "../src/navigation/navigationTours.ts";

const header = readFileSync(new URL("../src/components/Header.tsx", import.meta.url), "utf8");
const accessStates = readFileSync(new URL("../src/components/access/AccessStates.tsx", import.meta.url), "utf8");

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

test("global controls are outside the scrollable navigation and expose the expected account actions", () => {
  assert.match(header, /flex min-w-0 flex-wrap items-center justify-end gap-2 pb-0\.5/);
  assert.doesNotMatch(header, /items-center justify-end gap-2 overflow-x-auto/);
  assert.match(header, /Workspace Settings/);
  assert.match(header, /Manage Companies/);
  assert.match(accessStates, /onOpenPlatformManagement\?: \(\) => void/);
  assert.match(accessStates, /right-0 top-\[calc\(100%\+0\.5rem\)\].*overflow-y-auto/);
});
