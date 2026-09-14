import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import test from "node:test";
import {
  extractDocxStructure,
  inspectDocxArchive,
} from "../src/server/documentTemplates/documentTemplateEngine.ts";

const FIXTURE_ROOT = fileURLToPath(new URL("./fixtures/document-templates/hsc/", import.meta.url));

const FIXTURES = [
  {
    fileName: "HSC P.O. Template - Revised.docx",
    sha256: "b0069dd8aa4e730e8746f2a89453436d2a938758d19f8057af41d4b8c315bd07",
    mediaCount: 1,
  },
  {
    fileName: "HSC Checklist Template - Revised.docx",
    sha256: "83c4184ead92395574d56e63c190df5530cf773855dd7314d2c0b6c0bc1d8b46",
    mediaCount: 1,
  },
  {
    fileName: "Warranty Certificate Template - Revised.docx",
    sha256: "0491db419ddfc008ae5751b4da8fd9b97ec381dc15348dd98dc1fc3c5aeac42c",
    mediaCount: 2,
  },
] as const;

test("the supplied HSC fixtures remain exact valid DOCX acceptance assets", () => {
  for (const fixture of FIXTURES) {
    const bytes = new Uint8Array(readFileSync(join(FIXTURE_ROOT, fixture.fileName)));
    assert.equal(createHash("sha256").update(bytes).digest("hex"), fixture.sha256, fixture.fileName);
    const entries = inspectDocxArchive(bytes);
    assert.ok(entries.some((entry) => entry.name === "word/document.xml"));
    assert.equal(entries.filter((entry) => entry.name.startsWith("word/media/")).length, fixture.mediaCount);
    assert.equal(extractDocxStructure(bytes, fixture.fileName).tags.length, 0);
  }
});

test("the warranty fixture supplies its approved wording from the document package", () => {
  const bytes = new Uint8Array(readFileSync(join(FIXTURE_ROOT, "Warranty Certificate Template - Revised.docx")));
  const structure = extractDocxStructure(bytes, "Warranty Certificate Template - Revised.docx");
  assert.equal(structure.paragraphs.filter((paragraph) => /one [(]1[)].*warranty/i.test(paragraph)).length, 1);
  assert.equal(structure.paragraphs.filter((paragraph) => /faults arising.*specifically excluded/i.test(paragraph)).length, 1);
});
