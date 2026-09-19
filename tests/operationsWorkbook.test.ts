import test from "node:test";
import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import {
  WorkbookImportError,
  exportOperationsWorkbook,
  fingerprintValue,
  parseOperationsWorkbook,
  type WorkbookSchema,
} from "../src/lib/operationsWorkbook.ts";

const schema: WorkbookSchema = {
  schemaVersion: 1,
  domain: "TEST",
  workbookKind: "TEST_EDIT",
  metadataSheetName: "_HydroQualiSense",
  sheets: [
    { name: "Records", headers: ["Record ID", "Quantity", "Date", "Description"], hiddenHeaders: ["Record ID"] },
  ],
};

test("exports and parses typed cells with hidden synchronization metadata", () => {
  const artifact = exportOperationsWorkbook({
    schema,
    metadata: { companyId: "company-1", exportedAt: "2026-09-19T00:00:00.000Z" },
    metadataRows: [{ entity: "RECORD", recordId: "record-1", fingerprint: "fp-1" }],
    sheets: [{
      name: "Records",
      hiddenHeaders: ["Record ID"],
      rows: [{ "Record ID": "record-1", Quantity: 12.5, Date: new Date("2026-09-19T00:00:00.000Z"), Description: "Pipe" }],
    }],
  });

  assert.ok(artifact.bytes.byteLength > 0);
  const parsed = parseOperationsWorkbook(artifact.bytes, { schema });
  assert.deepEqual(parsed.metadata, { companyId: "company-1", exportedAt: "2026-09-19T00:00:00.000Z" });
  assert.deepEqual(parsed.metadataRows, [{ entity: "RECORD", recordId: "record-1", fingerprint: "fp-1" }]);
  assert.equal(parsed.sheets.Records.rows[0]["Quantity"], 12.5);
  assert.ok(parsed.sheets.Records.rows[0]["Date"] instanceof Date);
  assert.equal(parsed.sheets.Records.hidden, false);
  assert.deepEqual(parsed.sheets.Records.headers, schema.sheets[0].headers);
});

test("fingerprints are deterministic across object key order and change with values", () => {
  assert.equal(fingerprintValue({ b: 2, a: 1 }), fingerprintValue({ a: 1, b: 2 }));
  assert.notEqual(fingerprintValue({ a: 1 }), fingerprintValue({ a: 2 }));
});

test("rejects formulas, macro-enabled files, unsupported sheets, and oversized rows", () => {
  const formulaWorkbook = XLSX.utils.book_new();
  const formulaSheet = XLSX.utils.aoa_to_sheet([["Record ID", "Quantity", "Date", "Description"], ["record-1", 1, new Date(), "=2+2"]]);
  formulaSheet.A2 = { t: "n", f: "1+1", v: 2 };
  XLSX.utils.book_append_sheet(formulaWorkbook, formulaSheet, "Records");
  const formulaBytes = XLSX.write(formulaWorkbook, { bookType: "xlsx", type: "array" }) as Uint8Array;
  assert.throws(
    () => parseOperationsWorkbook(formulaBytes, { schema }),
    (error: unknown) => error instanceof WorkbookImportError && error.code === "UNSAFE_CONTENT",
  );

  const safeArtifact = exportOperationsWorkbook({
    schema,
    metadata: {},
    sheets: [{ name: "Records", rows: [{ "Record ID": "record-1", Quantity: 1, Date: new Date(), Description: "safe" }] }],
  });
  assert.throws(
    () => parseOperationsWorkbook(safeArtifact.bytes, { schema, fileName: "unsafe.xlsm" }),
    (error: unknown) => error instanceof WorkbookImportError && error.code === "UNSUPPORTED_FORMAT",
  );
  assert.throws(
    () => parseOperationsWorkbook(safeArtifact.bytes, { schema: { ...schema, sheets: [{ name: "Other", headers: schema.sheets[0].headers }] } }),
    (error: unknown) => error instanceof WorkbookImportError && error.code === "SCHEMA_MISMATCH",
  );
  assert.throws(
    () => parseOperationsWorkbook(safeArtifact.bytes, { schema, limits: { maxRowsPerSheet: 0 } }),
    (error: unknown) => error instanceof WorkbookImportError && error.code === "SHEET_TOO_LARGE",
  );
});

test("rejects duplicate metadata identities and malformed workbook bytes", () => {
  const duplicateArtifact = exportOperationsWorkbook({
    schema,
    metadata: {},
    metadataRows: [
      { entity: "RECORD", recordId: "record-1", fingerprint: "fp-1" },
      { entity: "RECORD", recordId: "record-1", fingerprint: "fp-2" },
    ],
    sheets: [{ name: "Records", rows: [{ "Record ID": "record-1", Quantity: 1, Date: new Date(), Description: "safe" }] }],
  });
  assert.throws(
    () => parseOperationsWorkbook(duplicateArtifact.bytes, { schema }),
    (error: unknown) => error instanceof WorkbookImportError && error.code === "DUPLICATE_ID",
  );
  assert.throws(
    () => parseOperationsWorkbook(new Uint8Array([1, 2, 3]), { schema }),
    (error: unknown) => error instanceof WorkbookImportError && error.code === "MALFORMED_WORKBOOK",
  );
});

test("enforces the configured cell-text limit", () => {
  const artifact = exportOperationsWorkbook({
    schema,
    metadata: {},
    sheets: [{ name: "Records", rows: [{ "Record ID": "record-1", Quantity: 1, Date: new Date(), Description: "long text" }] }],
  });
  assert.throws(
    () => parseOperationsWorkbook(artifact.bytes, { schema, limits: { maxCellTextLength: 3 } }),
    (error: unknown) => error instanceof WorkbookImportError && error.code === "SHEET_TOO_LARGE",
  );
});
