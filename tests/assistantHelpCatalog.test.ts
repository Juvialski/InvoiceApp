import test from "node:test";
import assert from "node:assert/strict";
import {
  getHelpResponse,
  helpEntryPath,
  searchHelpCatalog,
  unknownHelpResponse,
} from "../src/assistant/helpCatalog.ts";

test("help search returns only current HydroQualiSense features with deterministic ranking", () => {
  const payrollMatches = searchHelpCatalog("payroll import");
  assert.equal(payrollMatches[0]?.id, "payroll-runs-imports");
  assert.equal(helpEntryPath(payrollMatches[0]!), "/payroll");
  assert.equal(searchHelpCatalog("gmail read-only")[0]?.id, "gmail-import");
  assert.equal(searchHelpCatalog("made-up CRM integration").length, 0);
});

test("help search resolves engineering documents and blueprint topics", () => {
  const docMatches = searchHelpCatalog("blueprint drawings");
  assert.equal(docMatches[0]?.id, "engineering-documents");
  assert.equal(helpEntryPath(docMatches[0]!), "/projects");

  const revMatches = searchHelpCatalog("blueprint revisions");
  assert.equal(revMatches[0]?.id, "blueprint-revisions");
  assert.match(revMatches[0]!.details, /immutable/i);

  const markupMatches = searchHelpCatalog("redline annotations");
  assert.equal(markupMatches[0]?.id, "redline-annotations");
  assert.match(markupMatches[0]!.details, /\[0\.0, 1\.0\]/);

  const disciplineMatches = searchHelpCatalog("structural discipline");
  assert.equal(disciplineMatches[0]?.id, "drawing-disciplines");
  assert.match(disciplineMatches[0]!.details, /STRUCTURAL/);
});

test("help search resolves Daily Site Logs and preserves the payroll boundary", () => {
  const matches = searchHelpCatalog("daily site logs weather crew");
  assert.equal(matches[0]?.id, "daily-site-logs");
  assert.equal(helpEntryPath(matches[0]!), "/projects");
  assert.match(matches[0]!.details, /never create payroll attendance/i);
});

test("help search covers current correction, access, and lifecycle workflows", () => {
  assert.equal(searchHelpCatalog("archive project reactivate")[0]?.id, "project-lifecycle");
  assert.equal(searchHelpCatalog("worker offboard reactivate")[0]?.id, "workforce-lifecycle");
  assert.equal(searchHelpCatalog("company member permission deny")[0]?.id, "company-access");
  assert.equal(searchHelpCatalog("cash transaction reverse")[0]?.id, "cash-corrections");
  const response = getHelpResponse("invoice void archive");
  assert.equal(response.kind, "matches");
  if (response.kind === "matches") assert.equal(response.matches[0]?.id, "invoice-corrections");
});

test("unknown help questions stay honest instead of inventing a feature", () => {
  const response = getHelpResponse("custom CRM sync");
  assert.equal(response.kind, "unknown");
  if (response.kind === "unknown") {
    assert.match(response.message, /don’t have a verified HydroQualiSense help answer/i);
    assert.doesNotMatch(response.message, /CRM sync is available/i);
  }
  assert.match(unknownHelpResponse("something else"), /Engineering Documents and blueprints/i);
});
