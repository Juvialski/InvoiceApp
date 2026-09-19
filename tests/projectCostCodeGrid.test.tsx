import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const panelSource = readFileSync(new URL("../src/components/projects/ProjectBudgetControlPanel.tsx", import.meta.url), "utf8");
const gridSource = readFileSync(new URL("../src/components/ui/OperationsGrid.tsx", import.meta.url), "utf8");

test("project budget control uses the shared OperationsGrid with protected financial columns", () => {
  assert.match(panelSource, /OperationsGrid/);
  assert.match(panelSource, /header:\s*["']Code|header:\s*["']Cost Code/);
  for (const label of ["Work Package", "Status", "Approved Budget", "Actual Cost", "Committed Cost", "Forecast Cost", "Actual Variance", "Forecast Variance"]) {
    assert.match(panelSource, new RegExp(label));
  }
  assert.match(panelSource, /protected:\s*true/);
  assert.match(panelSource, /onArchiveCostCode|handleArchive/);
  assert.match(panelSource, /onReactivateCostCode|handleReactivate/);
  assert.match(panelSource, /md:hidden/);
  assert.match(gridSource, /data-field-protected/);
});

