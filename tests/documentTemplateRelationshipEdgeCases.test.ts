import assert from "node:assert/strict";
import test from "node:test";
import PizZip from "pizzip";
import {
  buildStarterDocxTemplate,
  classifyExternalRelationship,
  DOCX_EXTERNAL_RESOURCE_MESSAGE,
  DocumentTemplateValidationError,
  validateDocxTemplateBytes,
} from "../src/server/documentTemplates/documentTemplateEngine.ts";

const IMAGE_RELATIONSHIP_TYPE = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/image";
const RELATIONSHIPS_NAMESPACE = "http://schemas.openxmlformats.org/package/2006/relationships";
const DOCX_MIME_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

function xmlText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&apos;");
}

test("package-root internal OPC relationship targets remain internal", () => {
  assert.deepEqual(
    classifyExternalRelationship({
      type: IMAGE_RELATIONSHIP_TYPE,
      target: "/word/media/image1.png",
    }),
    { kind: "INTERNAL", reason: "package-target" },
  );
});

test("namespace-prefixed Relationship elements cannot bypass external-resource validation", async () => {
  const starter = await buildStarterDocxTemplate("PURCHASE_ORDER");
  const zip = new PizZip(starter.bytes);
  const path = "word/_rels/document.xml.rels";
  const existing = zip.file(path)?.asText() || `<Relationships xmlns="${RELATIONSHIPS_NAMESPACE}"></Relationships>`;
  const injected = `<rel:Relationship xmlns:rel="${RELATIONSHIPS_NAMESPACE}" Id="rIdPrefixedExternal" Type="${xmlText(IMAGE_RELATIONSHIP_TYPE)}" Target="https://example.test/image.png" TargetMode="External"/>`;
  const next = existing.replace(/<\/Relationships>\s*$/i, `${injected}</Relationships>`);
  assert.notEqual(next, existing);
  zip.file(path, next);
  const bytes = new Uint8Array(zip.generate({ type: "uint8array" }));

  assert.throws(
    () => validateDocxTemplateBytes(bytes, "prefixed-external.docx", DOCX_MIME_TYPE),
    (error: unknown) => error instanceof DocumentTemplateValidationError && error.message === DOCX_EXTERNAL_RESOURCE_MESSAGE,
  );
});
