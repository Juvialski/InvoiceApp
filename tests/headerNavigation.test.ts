import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { navigationModuleTourTarget, navigationRouteTourTarget } from "../src/navigation/navigationTours.ts";

const header = readFileSync(new URL("../src/components/Header.tsx", import.meta.url), "utf8");

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
