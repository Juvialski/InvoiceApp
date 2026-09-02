import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const projectOverview = readFileSync(
  new URL("../src/components/projects/ProjectOverview.tsx", import.meta.url),
  "utf8",
);

test("project overview withholds complete analytics when foreign costs are unresolved", () => {
  assert.match(projectOverview, /const hasForeignAmounts = foreignEntries\.length > 0/);
  assert.match(projectOverview, /Complete cost health is withheld while unconverted foreign-currency costs are present/);
  assert.match(projectOverview, /Complete budget position withheld while unconverted foreign-currency costs are present/);
  assert.match(projectOverview, /showTrendAnalytics = !hasForeignAmounts && trendReconciles/);
  assert.match(projectOverview, /Cost trend withheld while unconverted foreign-currency costs are present/);
  assert.match(projectOverview, /Cumulative budget burn withheld while unconverted foreign-currency costs are present/);
});

test("project overview withholds source-dated analytics when they do not reconcile", () => {
  assert.match(projectOverview, /finalTrendPoint\.cumulative - summary\.totalActualCost/);
  assert.match(projectOverview, /finalTrendPoint\.cumulativeCommitted - \(summary\.totalActualCost \+ pendingBase\)/);
  assert.match(projectOverview, /source-dated analytics do not reconcile to the authoritative project cost summary/);
});
