import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../scripts/hosted-qa-certification.ts", import.meta.url), "utf8");

test("hosted QA route contracts track current task-first Expenses and Documents copy", () => {
  assert.match(source, /\{ route: "\/expenses", heading: "Expenses", requiredText: \["Expense register"\] \}/);
  assert.match(source, /\{ route: "\/documents", heading: "Documents", requiredText: \["Find, preview, and continue work on document records", "Procurement"\] \}/);
  assert.doesNotMatch(source, /Supplier invoices remain preserved evidence/);
  assert.doesNotMatch(source, /Unified access surface/);
});
