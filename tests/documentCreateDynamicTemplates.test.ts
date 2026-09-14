import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const routeSource = readFileSync(new URL("../src/app/routes/DocumentsRoute.tsx", import.meta.url), "utf8");
const createSource = readFileSync(new URL("../src/components/documents/DocumentCreateView.tsx", import.meta.url), "utf8") + readFileSync(new URL("../src/components/documents/ManagedDocumentCreateView.tsx", import.meta.url), "utf8");

test("Documents Create discovers active company-defined templates generically", () => {
  assert.match(createSource, /listAvailableDocumentTemplates/);
  assert.match(createSource, /generateManagedDocument/);
  assert.match(createSource, /Choose|Select/);
  assert.match(createSource, /Review/);
  assert.match(createSource, /structured|custom|document-specific/i);
  assert.doesNotMatch(createSource, /PROJECT_EQUIPMENT_MATERIALS_CHECKLIST/);
  assert.doesNotMatch(createSource, /PROJECT_WARRANTY_CERTIFICATE/);
});

test("Documents Create supports every server-backed source context including Client Invoice", () => {
  assert.match(createSource, /CLIENT_INVOICE/);
  assert.match(createSource, /clientBillings/);
  assert.match(createSource, /billingNumber/);
  assert.match(routeSource, /clientBillings={clientBillings}/);
});

test("Documents Create keeps generation ID/input based and does not build authoritative totals in the browser", () => {
  assert.match(createSource, /templateVersionId/);
  assert.match(createSource, /sourceId/);
  assert.doesNotMatch(createSource, /calculate.*total|reduce\(.*amount/i);
});
