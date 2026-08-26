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

test("unknown help questions stay honest instead of inventing a feature", () => {
  const response = getHelpResponse("custom CRM sync");
  assert.equal(response.kind, "unknown");
  if (response.kind === "unknown") {
    assert.match(response.message, /don’t have a verified (Engoryx|InvoiceApp) help answer/i);
    assert.doesNotMatch(response.message, /CRM sync is available/i);
  }
  assert.match(unknownHelpResponse("something else"), /settings/i);
});
