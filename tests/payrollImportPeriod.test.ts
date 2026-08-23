import test from "node:test";
import assert from "node:assert/strict";
import { matchPayrollImportPeriod } from "../src/lib/payrollImportPeriod.ts";

const periods = [
  { id: "p1", periodStart: "2026-08-16", periodEnd: "2026-08-31", status: "OPEN" as const, createdAt: "", updatedAt: "" },
  { id: "p2", periodStart: "2026-09-01", periodEnd: "2026-09-15", status: "DRAFT" as const, createdAt: "", updatedAt: "" },
];

test("matches workbook dates to a generated period", () => {
  const result = matchPayrollImportPeriod({ periodStart: "2026-08-16", periodEnd: "2026-08-31", periods });
  assert.equal(result.period?.id, "p1");
  assert.equal(result.exact, true);
  assert.equal(result.conflict, false);
});

test("warns when workbook dates conflict with the selected period", () => {
  const result = matchPayrollImportPeriod({ periodStart: "2026-09-01", periodEnd: "2026-09-15", selectedPeriodId: "p1", periods });
  assert.equal(result.period?.id, "p2");
  assert.equal(result.conflict, true);
  assert.match(result.message || "", /selected payroll period/);
});

test("does not silently invent a period for unknown workbook dates", () => {
  const result = matchPayrollImportPeriod({ periodStart: "2026-10-01", periodEnd: "2026-10-15", periods });
  assert.equal(result.period, undefined);
  assert.equal(result.exact, false);
});
