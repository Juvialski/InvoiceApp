import React from "react";
import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { OperationsGrid, sortOperationsGridRows, type OperationsGridColumn } from "../src/components/ui/OperationsGrid.tsx";

interface Row {
  id: string;
  name: string;
  amount: number;
}

const columns: OperationsGridColumn<Row>[] = [
  { key: "name", header: "Name", value: (row) => row.name, sortValue: (row) => row.name, editable: () => true },
  { key: "amount", header: "Amount", value: (row) => row.amount, sortValue: (row) => row.amount, align: "right", protected: true },
];

test("sorts typed rows without changing the source array", () => {
  const rows: Row[] = [{ id: "1", name: "B", amount: 10 }, { id: "2", name: "A", amount: 20 }];
  const sorted = sortOperationsGridRows(rows, columns[1], "asc");
  assert.deepEqual(sorted.map((row) => row.id), ["1", "2"]);
  assert.deepEqual(rows.map((row) => row.id), ["1", "2"]);
});

test("renders stable accessible columns, typed alignment, protected semantics, and actions", () => {
  const rows: Row[] = [{ id: "1", name: "B", amount: 10 }];
  const markup = renderToStaticMarkup(
    <OperationsGrid
      ariaLabel="Purchase order register"
      rows={rows}
      columns={columns}
      rowKey={(row) => row.id}
      selectedRowId="1"
      onRowActivate={() => {}}
      renderActions={(row) => <button type="button">Open {row.name}</button>}
    />,
  );
  assert.match(markup, /data-operations-grid="true"/);
  assert.match(markup, /aria-label="Purchase order register"/);
  assert.match(markup, />Name</);
  assert.match(markup, /text-right/);
  assert.match(markup, /data-field-editable="false"/);
  assert.match(markup, /aria-selected="true"/);
  assert.match(markup, /Open B/);
});
