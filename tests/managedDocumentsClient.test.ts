import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const client = readFileSync(new URL("../src/lib/managedDocuments.ts", import.meta.url), "utf8");
const templateClient = readFileSync(new URL("../src/lib/documentTemplates.ts", import.meta.url), "utf8");
const templateRouter = readFileSync(new URL("../src/server/documentTemplates/documentTemplateRouter.ts", import.meta.url), "utf8");

test("managed document client uses company-scoped API boundaries and short-lived retrieval URLs", () => {
  assert.match(client, /companyApiRequest/);
  assert.match(client, /\/api\/managed-documents/);
  assert.match(client, /getManagedDocumentVersionUrl/);
  assert.match(client, /uploadManagedDocumentVersion/);
  assert.match(client, /validateManagedDocumentBytes/);
  assert.doesNotMatch(client, /storagePath/);
});

test("generated company-template outputs retain an index identity without replacing binary download behavior", () => {
  assert.match(templateRouter, /server_register_generated_document_artifact/);
  assert.match(templateRouter, /X-Managed-Document-Id/);
  assert.match(templateRouter, /X-Managed-Version-Id/);
  assert.match(templateClient, /generateManagedDocument/);
  assert.match(templateClient, /binaryRequest\("\/api\/document-templates\/managed-generate"/);
});
