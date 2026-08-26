import test from "node:test";
import assert from "node:assert/strict";
import {
  getHelpResponse,
  helpEntryPath,
  searchHelpCatalog,
  unknownHelpResponse,
} from "../src/assistant/helpCatalog.ts";

test("help search returns only current InvoiceApp features with deterministic ranking", () => {
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

test("unknown help questions stay honest instead of inventing a feature", () => {
  const response = getHelpResponse("custom CRM sync");
  assert.equal(response.kind, "unknown");
  if (response.kind === "unknown") {
    assert.match(response.message, /don’t have a verified (Engoryx|InvoiceApp) help answer/i);
    assert.doesNotMatch(response.message, /CRM sync is available/i);
  }
  assert.match(unknownHelpResponse("something else"), /Engineering Documents and blueprints/i);
});
