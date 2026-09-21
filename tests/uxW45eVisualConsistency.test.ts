import assert from "node:assert/strict";
import test from "node:test";
import { documentPreviewFrameClass, documentPreviewState } from "../src/components/documentPreviewPresentation.ts";
import { readFileSync } from "node:fs";

function source(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

test("document preview states keep loading and unavailable layouts compact", () => {
  assert.equal(documentPreviewState({ loading: true, hasBytes: false, error: "" }), "loading");
  assert.equal(documentPreviewState({ loading: false, hasBytes: true, error: "" }), "ready");
  assert.equal(documentPreviewState({ loading: false, hasBytes: false, error: "PDF unavailable" }), "error");
  assert.match(documentPreviewFrameClass("loading"), /min-h-40/);
  assert.match(documentPreviewFrameClass("error"), /min-h-28/);
  assert.match(documentPreviewFrameClass("ready"), /min-h-0/);
});

test("shared visual primitives expose the app-wide grammar without repeating key chrome", () => {
  const ui = source("src/components/ui/OperationsUI.tsx");
  assert.match(ui, /data-ui="page-header"/);
  assert.match(ui, /data-ui="page-header-title"/);
  assert.match(ui, /data-ui="page-header-actions"/);
  assert.match(ui, /data-ui="filter-bar"/);
  assert.match(ui, /data-ui="metric-card"/);
  assert.doesNotMatch(ui, />Key<\/span>/);
});

test("document preview uses an explicit state frame instead of an unconditional blank wall", () => {
  const preview = source("src/components/DocumentPreviewModal.tsx");
  assert.match(preview, /data-document-preview-state=\{previewState\}/);
  assert.doesNotMatch(preview, /min-h-\[760px\]/);
});

test("demo RFI and Submittal scenarios label missing demo records as recovery evidence", () => {
  const scenarios = source("scripts/qa/demoScenarios.ts");
  assert.match(scenarios, /rfi-missing-record-recovery-visible/);
  assert.match(scenarios, /submittal-missing-record-recovery-visible/);
  assert.match(scenarios, /interactionState: "missing-record recovery rendered"/);
  assert.doesNotMatch(scenarios, /interactionState: "RFI detail opened"/);
  assert.doesNotMatch(scenarios, /interactionState: "Submittal detail and round opened"/);
});
