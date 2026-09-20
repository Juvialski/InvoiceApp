import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  WorksheetEditor,
  WorksheetTabs,
  applyWorksheetCellEdit,
  applyWorksheetPaste,
  copyWorksheetTsv,
  getNextWorksheetCell,
  getWorksheetCellId,
  type WorksheetColumn,
  type WorksheetRow,
} from "../src/components/ui/WorksheetEditor.tsx";

interface Row extends WorksheetRow {
  id: string;
  name: string;
  amount: number;
  date: string;
  status: string;
  protectedValue: string;
}

interface PlainRow {
  id: string;
  label: string;
}

const rows: Row[] = [
  { id: "row-1", name: "Concrete", amount: 100, date: "2026-09-20", status: "OPEN", protectedValue: "system" },
  { id: "row-2", name: "Steel", amount: 200, date: "2026-09-21", status: "OPEN", protectedValue: "system" },
];

const columns: WorksheetColumn<Row>[] = [
  { key: "name", header: "Name", kind: "text", editable: true },
  { key: "amount", header: "Amount", kind: "currency", editable: true },
  { key: "date", header: "Date", kind: "date", editable: true },
  { key: "status", header: "Status", kind: "select", editable: true, options: [{ value: "OPEN", label: "Open" }, { value: "CLOSED", label: "Closed" }] },
  { key: "protectedValue", header: "System value", kind: "text", protected: true },
];

function cellId(rowIndex: number, columnKey: string) {
  return getWorksheetCellId(rows[rowIndex].id, columnKey);
}

test("edits an editable cell through its column parser", () => {
  const result = applyWorksheetCellEdit(rows, columns, (row) => row.id, 0, "amount", "1,250.50");
  assert.equal(result.changed, true);
  assert.equal(result.rows[0].amount, 1250.5);
  assert.deepEqual(rows[0], { id: "row-1", name: "Concrete", amount: 100, date: "2026-09-20", status: "OPEN", protectedValue: "system" });
});

test("rejects an edit to a protected cell without mutating the row", () => {
  const result = applyWorksheetCellEdit(rows, columns, (row) => row.id, 0, "protectedValue", "tampered");
  assert.equal(result.changed, false);
  assert.equal(result.rows[0].protectedValue, "system");
  assert.match(result.issue?.message || "", /protected/i);
});

test("applies valid edits while preserving warning-level validation state", () => {
  const warningColumns: WorksheetColumn<Row>[] = [{
    key: "amount",
    header: "Amount",
    kind: "currency",
    editable: true,
    validate: () => ({ severity: "warning", message: "This amount needs a second review." }),
  }];
  const result = applyWorksheetCellEdit(rows, warningColumns, (row) => row.id, 0, "amount", "125");
  assert.equal(result.changed, true);
  assert.equal(result.rows[0].amount, 125);
  assert.equal(result.warnings?.[0].message, "This amount needs a second review.");
});

test("moves through worksheet cells with arrows, tab, shift-tab, and enter", () => {
  assert.deepEqual(getNextWorksheetCell({ row: 0, column: 0 }, "ArrowRight", 2, 5), { row: 0, column: 1 });
  assert.deepEqual(getNextWorksheetCell({ row: 1, column: 1 }, "ArrowUp", 2, 5), { row: 0, column: 1 });
  assert.deepEqual(getNextWorksheetCell({ row: 0, column: 4 }, "Tab", 2, 5), { row: 1, column: 0 });
  assert.deepEqual(getNextWorksheetCell({ row: 1, column: 0 }, "Tab", 2, 5, true), { row: 0, column: 4 });
  assert.deepEqual(getNextWorksheetCell({ row: 0, column: 2 }, "Enter", 2, 5), { row: 1, column: 2 });
});

test("Escape cancels navigation instead of moving the active cell", () => {
  assert.equal(getNextWorksheetCell({ row: 0, column: 0 }, "Escape", 2, 5), null);
});

test("Tab can leave the worksheet at its forward and backward boundaries", () => {
  assert.equal(getNextWorksheetCell({ row: 1, column: 4 }, "Tab", 2, 5), null);
  assert.equal(getNextWorksheetCell({ row: 0, column: 0 }, "Tab", 2, 5, true), null);
});

test("serializes selected worksheet values as plain TSV", () => {
  assert.equal(copyWorksheetTsv([["Name", "Amount"], ["Concrete", "100"]]), "Name\tAmount\nConcrete\t100");
});

test("pastes one typed cell into an existing editable row", () => {
  const result = applyWorksheetPaste(rows, columns, (row) => row.id, 0, 1, "1,500");
  assert.equal(result.rows[0].amount, 1500);
  assert.equal(result.changes.length, 1);
  assert.equal(result.rejected.length, 0);
});

test("rejects impossible calendar dates instead of normalizing them", () => {
  const result = applyWorksheetCellEdit(rows, columns, (row) => row.id, 0, "date", "2026-02-31");
  assert.equal(result.changed, false);
  assert.match(result.issue?.message || "", /calendar date/i);
});

test("pastes a rectangular TSV matrix across existing rows and columns", () => {
  const result = applyWorksheetPaste(rows, columns, (row) => row.id, 0, 0, "Cement\t250\nRebar\t350");
  assert.equal(result.rows[0].name, "Cement");
  assert.equal(result.rows[0].amount, 250);
  assert.equal(result.rows[1].name, "Rebar");
  assert.equal(result.rows[1].amount, 350);
  assert.equal(result.changes.length, 4);
});

test("ignores the terminal row delimiter emitted by spreadsheet clipboard copy", () => {
  const result = applyWorksheetPaste(rows, columns, (row) => row.id, 0, 0, "Cement\t250\r\n");
  assert.equal(result.rows[0].name, "Cement");
  assert.equal(result.rows[0].amount, 250);
  assert.equal(result.rows[1].name, "Steel");
  assert.equal(result.rows[1].amount, 200);
  assert.equal(result.changes.length, 2);
  assert.equal(result.rejected.length, 0);
});

test("reports invalid pasted values without corrupting the original cell", () => {
  const result = applyWorksheetPaste(rows, columns, (row) => row.id, 0, 1, "not-a-number");
  assert.equal(result.rows[0].amount, 100);
  assert.equal(result.rejected[0].reason, "validation");
  assert.equal(result.issues[0].severity, "error");
});

test("skips protected cells during rectangular paste", () => {
  const result = applyWorksheetPaste(rows, columns, (row) => row.id, 0, 4, "changed\nchanged-again");
  assert.equal(result.rows[0].protectedValue, "system");
  assert.equal(result.rows[1].protectedValue, "system");
  assert.equal(result.rejected.length, 2);
  assert.ok(result.rejected.every((item) => item.reason === "protected"));
});

test("does not expand paste beyond the authorized row or column rectangle", () => {
  const result = applyWorksheetPaste(rows, columns, (row) => row.id, 1, 4, "system\tignored\nextra\tignored");
  assert.equal(result.rows.length, 2);
  assert.ok(result.rejected.some((item) => item.reason === "out-of-bounds"));
});

test("renders add-row and enabled remove-row callbacks as worksheet actions", () => {
  const html = renderToStaticMarkup(
    <WorksheetEditor
      ariaLabel="Materials worksheet"
      rows={rows}
      columns={columns}
      rowKey={(row) => row.id}
      onAddRow={() => ({ ...rows[0], id: "row-3" })}
      onRemoveRow={() => undefined}
      canAddRow
      canRemoveRow
    />,
  );
  assert.match(html, /Add row/);
  assert.match(html, /Remove row 1/);
  assert.doesNotMatch(html, /data-worksheet-add-row="true"[^>]*\sdisabled=""(?:\s|>)/);
});

test("renders disabled row operations when the parent does not authorize them", () => {
  const html = renderToStaticMarkup(
    <WorksheetEditor
      ariaLabel="Materials worksheet"
      rows={rows}
      columns={columns}
      rowKey={(row) => row.id}
      onAddRow={() => ({ ...rows[0], id: "row-3" })}
      onRemoveRow={() => undefined}
      canAddRow={false}
      canRemoveRow={() => false}
    />,
  );
  assert.match(html, /data-worksheet-add-row="true"[^>]*\sdisabled=""(?:\s|>)/);
  assert.match(html, /data-worksheet-remove-row="row-1"[^>]*\sdisabled=""(?:\s|>)/);
});

test("exposes dirty state and editable focus semantics without relying on color", () => {
  const html = renderToStaticMarkup(
    <WorksheetEditor
      ariaLabel="Materials worksheet"
      rows={rows}
      columns={columns}
      rowKey={(row) => row.id}
      dirtyCells={new Set([cellId(0, "name")])}
      initialEditingCell={{ row: 0, column: 0 }}
    />,
  );
  assert.match(html, /data-worksheet-dirty="true"/);
  assert.match(html, /data-worksheet-state="editing"/);
  assert.match(html, /aria-label="Name, row 1"/);
});

test("renders externally supplied conflict state next to the affected cell", () => {
  const html = renderToStaticMarkup(
    <WorksheetEditor
      ariaLabel="Materials worksheet"
      rows={rows}
      columns={columns}
      rowKey={(row) => row.id}
      conflicts={{ [cellId(0, "amount")]: "The worksheet is older than the current record." }}
    />,
  );
  assert.match(html, /data-worksheet-state="conflict"/);
  assert.match(html, /The worksheet is older than the current record/);
});

test("renders warning validation state as a distinct accessible cell state", () => {
  const html = renderToStaticMarkup(
    <WorksheetEditor
      ariaLabel="Materials worksheet"
      rows={rows}
      columns={columns}
      rowKey={(row) => row.id}
      cellIssues={{ [cellId(0, "amount")]: { severity: "warning", message: "Review this amount." } }}
    />,
  );
  assert.match(html, /data-worksheet-state="warning"/);
  assert.match(html, /Review this amount/);
});

test("renders accessible headers, protected semantics, and contained responsive scrolling", () => {
  const html = renderToStaticMarkup(
    <WorksheetEditor
      ariaLabel="Materials worksheet"
      rows={rows}
      columns={columns}
      rowKey={(row) => row.id}
    />,
  );
  assert.match(html, /role="grid"/);
  assert.match(html, /aria-label="Materials worksheet"/);
  assert.match(html, /scope="col"/);
  assert.match(html, /data-worksheet-protected="true"/);
  assert.match(html, /Protected/);
  assert.match(html, /data-worksheet-scroll-container="true"/);
  assert.match(html, /overflow-x-auto/);
});

test("supports select option resolvers and custom cell renderers", () => {
  const html = renderToStaticMarkup(
    <WorksheetEditor
      ariaLabel="Materials worksheet"
      rows={rows}
      columns={[
        { key: "status", header: "Status", kind: "select", options: (_row, rowIndex) => [{ value: "OPEN", label: `Status ${rowIndex + 1}` }] },
        { key: "name", header: "Name", render: (value) => <strong data-custom-cell="true">{String(value)}</strong> },
      ]}
      rowKey={(row) => row.id}
    />,
  );
  assert.match(html, /Status 1/);
  assert.match(html, /data-custom-cell="true"/);
});

test("renders controlled worksheet tabs with one selected tab", () => {
  const html = renderToStaticMarkup(
    <WorksheetTabs
      ariaLabel="Project worksheets"
      tabs={[{ id: "details", label: "Project Details" }, { id: "codes", label: "Cost Codes" }]}
      value="codes"
      onChange={() => undefined}
    />,
  );
  assert.match(html, /Project Details/);
  assert.match(html, /Cost Codes/);
  assert.match(html, /aria-selected="true"/);
  assert.match(html, /role="tablist"/);
});

test("worksheet focus is requested only for deliberate navigation and editing", () => {
  const source = readFileSync(new URL("../src/components/ui/WorksheetEditor.tsx", import.meta.url), "utf8");
  assert.match(source, /if \(!editingCell && !focusActiveCellRef\.current\) return;/);
  assert.match(source, /const focusCell = \(position: WorksheetCellPosition\) =>/);
  assert.match(source, /if \(next\) focusCell\(next\);/);
  assert.doesNotMatch(source, /useEffect\(\(\) => \{[\s\S]{0,900}?else \{\s*cell\.focus\(\);\s*\}\s*\}, \[activeCell/);
});

test("accepts typed rows without requiring a database-shaped index signature", () => {
  const plainRows: PlainRow[] = [{ id: "plain-1", label: "Plain row" }];
  const html = renderToStaticMarkup(
    <WorksheetEditor
      ariaLabel="Plain worksheet"
      rows={plainRows}
      columns={[{ key: "label", header: "Label", editable: true }]}
      rowKey={(row) => row.id}
    />,
  );
  assert.match(html, /Plain row/);
});
