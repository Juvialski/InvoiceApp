import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const route = readFileSync(new URL("../src/app/routes/DocumentsRoute.tsx", import.meta.url), "utf8");
const create = readFileSync(new URL("../src/components/documents/DocumentCreateView.tsx", import.meta.url), "utf8");
const upload = readFileSync(new URL("../src/components/documents/ManagedDocumentUploadView.tsx", import.meta.url), "utf8");
const detail = readFileSync(new URL("../src/components/documents/ManagedDocumentDetailView.tsx", import.meta.url), "utf8");
const register = readFileSync(new URL("../src/lib/documentRegister.ts", import.meta.url), "utf8");

test("Documents workspace distinguishes managed documents and generated artifacts", () => {
  assert.match(route, /ManagedDocumentDetailView/);
  assert.match(route, /listManagedDocuments/);
  assert.match(route, /managedDocumentId/);
  assert.match(route, /GENERATED_ARTIFACT/);
  assert.match(register, /MANAGED_DOCUMENT/);
  assert.match(register, /GENERATED_ARTIFACT/);
});

test("standalone upload is document-oriented and explicitly reviewed before commit", () => {
  assert.match(create, /ManagedDocumentUploadView/);
  assert.match(create, /documentsManage/);
  assert.match(upload, /Review upload/);
  assert.match(upload, /Save managed document/);
  assert.match(upload, /No file will be sent to Storage/);
});

test("managed detail retains immutable history and controlled version/archive actions", () => {
  assert.match(detail, /Version history/);
  assert.match(detail, /Save new version/);
  assert.match(detail, /Archive this document/);
  assert.match(detail, /Generated source and template provenance/);
  assert.doesNotMatch(detail, /storagePath/);
});
