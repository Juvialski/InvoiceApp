import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { countActiveFilters, isActiveFilterValue } from "../src/components/ui/filterActionBarModel.ts";

function source(path: string): string {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

test("active filter values exclude sentinel and empty values", () => {
  assert.equal(isActiveFilterValue("ALL"), false);
  assert.equal(isActiveFilterValue(""), false);
  assert.equal(isActiveFilterValue(null), false);
  assert.equal(isActiveFilterValue(undefined), false);
  assert.equal(isActiveFilterValue("ACTIVE"), true);
  assert.equal(countActiveFilters(["ALL", "", null, undefined]), 0);
  assert.equal(countActiveFilters(["ACTIVE", "manager-a", "ALL", "CRITICAL"]), 3);
});

test("compact action bar exposes responsive and accessible disclosure contracts", () => {
  const operationsUi = source("src/components/ui/OperationsUI.tsx");
  assert.match(operationsUi, /data-ui="compact-action-bar"/);
  assert.match(operationsUi, /aria-expanded=\{open\}/);
  assert.match(operationsUi, /aria-controls=\{panelId\}/);
  assert.match(operationsUi, /role="dialog"/);
  assert.match(operationsUi, /event\.key === "Escape"/);
  assert.match(operationsUi, /triggerRef\.current\?\.focus/);
  assert.match(operationsUi, /basis-full[^\"]*sm:basis-auto/);
  assert.match(operationsUi, /activeFilters\.length > 0/);
  assert.match(operationsUi, /Clear all/);
});
