import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

const panelSource = readFileSync(new URL("../src/components/projects/ProjectBudgetControlPanel.tsx", import.meta.url), "utf8");
const worksheetPath = new URL("../src/components/projects/ProjectCostCodesWorksheet.tsx", import.meta.url);
const worksheetSource = existsSync(worksheetPath) ? readFileSync(worksheetPath, "utf8") : "";

test("project budget control uses the shared WorksheetEditor with protected financial columns", () => {
  assert.match(panelSource, /ProjectCostCodesWorksheet/);
  assert.match(worksheetSource, /WorksheetEditor/);
  for (const label of ["Work Package", "Status", "Approved Budget", "Actual Cost", "Committed Cost", "Forecast Cost", "Actual Variance", "Forecast Variance"]) {
    assert.match(worksheetSource, new RegExp(label.replace("Forecast Cost", "Forecast Amount")));
  }
  assert.match(worksheetSource, /protected:\s*true/);
  assert.match(worksheetSource, /onArchiveCostCode|handleArchive/);
  assert.match(worksheetSource, /onReactivateCostCode|handleReactivate/);
});

test("project cost-code maintenance uses WorksheetEditor with protected financial context and explicit lifecycle actions", () => {
  assert.match(panelSource, /ProjectCostCodesWorksheet/);
  assert.match(worksheetSource, /WorksheetEditor/);
  for (const label of ["Code", "Work Package", "Description", "Approved Budget", "Forecast Amount"]) {
    assert.match(worksheetSource, new RegExp(label));
  }
  for (const label of ["Status", "Actual Cost", "Committed Cost", "Actual Variance", "Forecast Variance"]) {
    assert.match(worksheetSource, new RegExp(label));
  }
  assert.match(worksheetSource, /validateProjectCostCodeInput/);
  assert.match(worksheetSource, /updatedAt/);
  assert.match(worksheetSource, /onSaveCostCode/);
  assert.match(worksheetSource, /onArchiveCostCode/);
  assert.match(worksheetSource, /onReactivateCostCode/);
  assert.match(worksheetSource, /data-cost-code-save-plan/);
  assert.doesNotMatch(worksheetSource, /onRemoveRow/);
});

