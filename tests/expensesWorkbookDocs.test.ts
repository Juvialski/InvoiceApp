import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

function read(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

test("roadmap and handoff keep the bounded Expenses rollout and current UX gate explicit", () => {
  const roadmap = read("docs/HYDROQUALISENSE_ACTIVE_ROADMAP.md");
  const handoff = read("docs/HYDROQUALISENSE_CURRENT_HANDOFF.md");
  for (const document of [roadmap, handoff]) {
    assert.match(document, /2026-09-20[^\n]*Phase 4A/i);
    assert.match(document, /Expenses/);
    assert.match(document, /Supplier Payables/);
    assert.match(document, /direct[\s\S]{0,120}DRAFT/i);
    assert.match(document, /Cash & Banking/i);
    assert.match(document, /UX-W4\.5E/i);
    assert.match(document, /UX-W5/i);
    assert.doesNotMatch(document, /all Finance[^\n]*Excel-native[^\n]*(available|complete|implemented)/i);
  }
});

test("the canonical Excel design records Expenses as bounded while preserving app-wide capability limits", () => {
  const design = read("docs/superpowers/specs/2026-09-18-excel-native-operations-ux-design.md");
  assert.match(design, /Expenses.*Supplier Payables/i);
  assert.match(design, /direct[\s\S]{0,120}DRAFT/i);
  assert.match(design, /app-wide Excel capability is not claimed/i);
  assert.match(design, /client receivables/i);
  assert.match(design, /Cash & Banking/i);
});

test("client-facing Supplier Invoices and Expenses truth mentions the usable controlled workbook workflow", () => {
  const features = read("src/config/productFeatures.ts");
  assert.match(features, /Supplier invoice review/);
  assert.match(features, /Excel/i);
  assert.match(features, /Expenses/i);
});
