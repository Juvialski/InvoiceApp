import test from "node:test";
import assert from "node:assert/strict";
import type { PayrollPeriodStatus, PayrollRunStatus } from "../src/types.ts";
import type { PayrollImportBatch } from "../src/lib/payrollImportPersistence.ts";
import {
  buildPayrollMonthGrid,
  getCutoffMarkers,
  getImportedActivity,
  getIssueSummary,
  getLocalToday,
  getPayDateMarkers,
  getPayrollPeriodSlices,
  getRunStatus,
  getPeriodIntersection,
  isActiveCalendarPeriod,
  mondayFirstWeekday,
  formatPayrollPeriodLabel,
  findPayrollCalendarConflicts,
  selectStablePayrollPeriod,
  selectStablePayrollPeriodId,
} from "../src/utils/payrollCalendar.ts";

function period(id: string, periodStart: string, periodEnd: string, payDate?: string, status: PayrollPeriodStatus = "DRAFT") {
  return { id, periodStart, periodEnd, payDate, status };
}

test("builds a Monday-first month grid with previous/next dates and local today", () => {
  const grid = buildPayrollMonthGrid(2026, 2, { today: "2026-02-15", fixedWeeks: false });

  assert.equal(grid.monthStart, "2026-02-01");
  assert.equal(grid.monthEnd, "2026-02-28");
  assert.equal(grid.gridStart, "2026-01-26");
  assert.equal(grid.gridEnd, "2026-03-01");
  assert.equal(grid.days.length, 35);
  assert.equal(grid.weeks.length, 5);
  assert.equal(grid.weeks[0]?.[0]?.weekday, 0);
  assert.equal(grid.days[0]?.isCurrentMonth, false);
  assert.equal(grid.days[6]?.date, "2026-02-01");
  assert.equal(grid.days.find((day) => day.date === "2026-02-15")?.isToday, true);
  assert.equal(mondayFirstWeekday("2026-02-01"), 6);
});

test("supports fixed six-week grids without changing month boundaries", () => {
  const grid = buildPayrollMonthGrid(2026, 2, { today: "2026-02-15" });

  assert.equal(grid.days.length, 42);
  assert.equal(grid.weeks.length, 6);
  assert.equal(grid.monthStart, "2026-02-01");
  assert.equal(grid.monthEnd, "2026-02-28");
  assert.equal(grid.days.at(-1)?.isCurrentMonth, false);
});

test("keeps semi-monthly leap-year periods intact and slices them by month", () => {
  const semiMonthly = period("semi-feb-2", "2028-02-16", "2028-02-29", "2028-03-02", "OPEN");
  const slice = getPeriodIntersection(semiMonthly, { year: 2028, month: 2 });

  assert.deepEqual(slice && [slice.sliceStart, slice.sliceEnd, slice.startsInMonth, slice.endsInMonth, slice.spansMonth], ["2028-02-16", "2028-02-29", true, true, false]);
  assert.equal(getPayrollPeriodSlices([semiMonthly], 2028, 3).length, 0);
  assert.equal(getPayDateMarkers([semiMonthly], { year: 2028, month: 3 })[0]?.date, "2028-03-02");
});

test("handles weekly and biweekly periods crossing month boundaries", () => {
  const weekly = period("weekly-cross", "2027-01-29", "2027-02-04", "2027-02-05");
  const biweekly = period("biweekly-cross", "2027-02-25", "2027-03-10", "2027-03-12");

  const februarySlices = getPayrollPeriodSlices([weekly, biweekly], 2027, 2);
  const marchSlices = getPayrollPeriodSlices([weekly, biweekly], 2027, 3);

  assert.deepEqual(februarySlices.map((slice) => [slice.periodId, slice.sliceStart, slice.sliceEnd, slice.spansMonth]), [
    ["weekly-cross", "2027-02-01", "2027-02-04", true],
    ["biweekly-cross", "2027-02-25", "2027-02-28", true],
  ]);
  assert.deepEqual(marchSlices.map((slice) => [slice.periodId, slice.sliceStart, slice.sliceEnd, slice.spansMonth]), [["biweekly-cross", "2027-03-01", "2027-03-10", true]]);
});

test("projects daily, monthly, and custom actual period records without re-generating them", () => {
  const actualPeriods = [
    period("daily-2027-04-30", "2027-04-30", "2027-04-30", "2027-05-01"),
    period("monthly-2027-04", "2027-04-01", "2027-04-30", "2027-05-05"),
    period("custom-20", "2027-04-21", "2027-05-20", "2027-05-23"),
  ];
  const april = getPayrollPeriodSlices(actualPeriods, 2027, 4);
  const may = getPayrollPeriodSlices(actualPeriods, 2027, 5);

  assert.deepEqual(april.map((slice) => slice.periodId), ["monthly-2027-04", "custom-20", "daily-2027-04-30"]);
  assert.deepEqual(may.map((slice) => [slice.periodId, slice.sliceStart, slice.sliceEnd]), [
    ["custom-20", "2027-05-01", "2027-05-20"],
  ]);
  assert.equal(april.find((slice) => slice.periodId === "custom-20")?.spansMonth, true);
});

test("returns period-end cutoff markers and pay-date markers for the requested month", () => {
  const periods = [
    period("p1", "2026-08-01", "2026-08-15", "2026-08-19"),
    period("p2", "2026-08-16", "2026-08-31", "2026-09-02"),
    period("p3", "2026-07-16", "2026-07-31", "2026-08-03"),
  ];

  assert.deepEqual(getCutoffMarkers(periods, { year: 2026, month: 8 }).map((marker) => [marker.date, marker.periodId, marker.kind]), [
    ["2026-08-15", "p1", "PERIOD_END"],
    ["2026-08-31", "p2", "PERIOD_END"],
  ]);
  assert.deepEqual(getPayDateMarkers(periods, { year: 2026, month: 8 }).map((marker) => [marker.date, marker.periodId, marker.kind]), [
    ["2026-08-03", "p3", "PAY_DATE"],
    ["2026-08-19", "p1", "PAY_DATE"],
  ]);
});

test("looks up run statuses and combines automatic draft and persisted entry issues", () => {
  const runs: Array<{ id: string; periodId: string; status: PayrollRunStatus }> = [
    { id: "run-2", periodId: "p1", status: "CALCULATED" },
    { id: "run-1", periodId: "p1", status: "DRAFT" },
  ];
  const summary = getIssueSummary("p1", {
    runs,
    automaticDraft: {
      periodId: "p1",
      readiness: "BLOCKING",
      exceptions: [{ code: "MISSING_RATE", severity: "BLOCKING", message: "Missing rate" }],
    },
    entries: [{
      id: "entry-1",
      payrollRunId: "run-2",
      calculationSnapshot: {
        exceptions: [
          { code: "MISSING_RATE", severity: "BLOCKING", message: "Missing rate" },
          { code: "NO_ENTRIES", severity: "WARNING", message: "No approved entries" },
        ],
      },
    }],
  });

  assert.equal(getRunStatus("p1", runs), "DRAFT");
  assert.equal(summary.periodId, "p1");
  assert.equal(summary.issueCount, 2);
  assert.equal(summary.blockingCount, 1);
  assert.equal(summary.warningCount, 1);
  assert.equal(summary.readiness, "BLOCKING");
  assert.deepEqual(summary.issues.map((issue) => issue.code), ["MISSING_RATE", "NO_ENTRIES"]);
});

test("finds imported activity by canonical period ID and ignores voided batches", () => {
  const batches: PayrollImportBatch[] = [
    {
      id: "batch-old",
      originalFileName: "old.xlsx",
      fileSha256: "",
      storagePath: "",
      sheetNames: [],
      status: "UPLOADED",
      mappingSnapshot: {},
      rawMetadata: {},
      warnings: [],
      errors: [],
      committedPayrollPeriodId: "p1",
      createdAt: "2026-08-20T01:00:00.000Z",
      updatedAt: "2026-08-20T01:00:00.000Z",
    },
    {
      id: "batch-new",
      originalFileName: "new.xlsx",
      fileSha256: "",
      storagePath: "",
      sheetNames: [],
      status: "COMMITTED",
      mappingSnapshot: {},
      rawMetadata: {},
      warnings: [],
      errors: [],
      committedPayrollPeriodId: "p1",
      createdAt: "2026-08-21T01:00:00.000Z",
      updatedAt: "2026-08-21T01:00:00.000Z",
    },
    {
      id: "batch-void",
      originalFileName: "void.xlsx",
      fileSha256: "",
      storagePath: "",
      sheetNames: [],
      status: "VOIDED",
      mappingSnapshot: {},
      rawMetadata: {},
      warnings: [],
      errors: [],
      committedPayrollPeriodId: "p1",
      createdAt: "2026-08-22T01:00:00.000Z",
      updatedAt: "2026-08-22T01:00:00.000Z",
    },
  ];
  const activity = getImportedActivity("p1", batches);

  assert.deepEqual(activity && {
    periodId: activity.periodId,
    batchIds: activity.batchIds,
    batchCount: activity.batchCount,
    latestBatchId: activity.latestBatchId,
    statuses: activity.statuses,
    hasCommittedImport: activity.hasCommittedImport,
  }, {
    periodId: "p1",
    batchIds: ["batch-new", "batch-old"],
    batchCount: 2,
    latestBatchId: "batch-new",
    statuses: ["COMMITTED", "UPLOADED"],
    hasCommittedImport: true,
  });
});

test("selects a canonical period ID deterministically and preserves an existing selection", () => {
  const periods = [
    period("next", "2026-09-01", "2026-09-15", undefined, "DRAFT"),
    period("void-current", "2026-08-01", "2026-08-31", undefined, "VOID"),
    period("current", "2026-08-16", "2026-08-31", undefined, "OPEN"),
    period("previous", "2026-07-16", "2026-07-31", undefined, "PAID"),
  ];

  assert.equal(selectStablePayrollPeriodId(periods, "next", "2026-08-20"), "next");
  assert.equal(selectStablePayrollPeriodId([...periods].reverse(), undefined, "2026-08-20"), "current");
  assert.equal(selectStablePayrollPeriod(periods, "void-current", "2026-08-20")?.id, "current");
  assert.equal(selectStablePayrollPeriodId([period("next", "2026-09-01", "2026-09-15")], undefined, "2026-08-20"), "next");
  assert.equal(selectStablePayrollPeriodId([period("previous", "2026-07-01", "2026-07-15")], undefined, "2026-08-20"), "previous");
});

test("uses human period labels and one conflict record for overlapping active periods", () => {
  assert.equal(formatPayrollPeriodLabel(period("weekly", "2026-08-23", "2026-08-29"), "WEEKLY"), "Aug 23–29, 2026");
  assert.equal(formatPayrollPeriodLabel(period("semi", "2026-08-16", "2026-08-31"), "SEMI_MONTHLY"), "Aug 16–31, 2026");
  assert.equal(formatPayrollPeriodLabel(period("monthly", "2026-08-01", "2026-08-31"), "MONTHLY"), "August 2026");
  const conflicts = findPayrollCalendarConflicts([
    period("p1", "2026-08-23", "2026-08-29"),
    period("p2", "2026-08-28", "2026-09-04"),
    period("void", "2026-08-24", "2026-08-25", undefined, "VOID"),
  ]);
  assert.deepEqual(conflicts.map((conflict) => [conflict.overlapStart, conflict.overlapEnd]), [["2026-08-28", "2026-08-29"]]);
});

test("uses local calendar fields for today instead of UTC date conversion", () => {
  const localMidnight = new Date(2028, 1, 29, 0, 15, 0, 0);
  const expected = `${localMidnight.getFullYear()}-${String(localMidnight.getMonth() + 1).padStart(2, "0")}-${String(localMidnight.getDate()).padStart(2, "0")}`;

  assert.equal(getLocalToday(localMidnight), expected);
  assert.equal(getLocalToday(new Date(2028, 1, 29, 23, 59, 59, 999)), "2028-02-29");
});

test("VOID legacy periods never drive active month-calendar semantics", () => {
  const active = period("active-current", "2026-08-16", "2026-08-31", "2026-09-02", "OPEN");
  // Reproduces the corrupted workspace: dozens of overlapping retired rows.
  const voidLegions = Array.from({ length: 47 }, (_, index) =>
    period(`void-${index}`, "2026-08-01", "2026-08-31", "2026-09-01", "VOID"));
  const periods = [active, ...voidLegions];

  assert.equal(isActiveCalendarPeriod(active), true);
  assert.equal(isActiveCalendarPeriod(voidLegions[0]!), false);

  const grid = buildPayrollMonthGrid(2026, 8, { today: "2026-08-25", fixedWeeks: false, periods });
  const day = grid.days.find((candidate) => candidate.date === "2026-08-25")!;
  assert.deepEqual(day.periodIds, ["active-current"]);
  assert.deepEqual(day.periodSlices.map((slice) => slice.periodId), ["active-current"]);
  assert.equal(day.cutoffMarkers.every((marker) => marker.periodId === "active-current"), true);
  assert.equal(day.payDateMarkers.length, 0);

  const cutoffDay = grid.days.find((candidate) => candidate.date === "2026-08-31")!;
  assert.deepEqual(cutoffDay.cutoffMarkers.map((marker) => marker.periodId), ["active-current"]);
  assert.deepEqual(grid.days.find((candidate) => candidate.date === "2026-08-16")!.periodIds, ["active-current"]);

  // VOID-only days show nothing at all.
  const beforeSchedule = buildPayrollMonthGrid(2026, 7, { today: "2026-07-20", fixedWeeks: false });
  assert.equal(beforeSchedule.days.filter((candidate) => candidate.isCurrentMonth).every((candidate) => candidate.periodIds.length === 0 && candidate.cutoffMarkers.length === 0 && candidate.payDateMarkers.length === 0), true);

  assert.equal(findPayrollCalendarConflicts(periods).length, 0);
  assert.deepEqual(getPayrollPeriodSlices(periods, 2026, 8).map((slice) => slice.periodId), ["active-current"]);
  assert.deepEqual(getCutoffMarkers(periods, { year: 2026, month: 8 }).map((marker) => marker.periodId), ["active-current"]);
  assert.deepEqual(getPayDateMarkers([...periods, period("active-sep-pay", "2026-09-01", "2026-09-15", "2026-08-20", "DRAFT")], { year: 2026, month: 8 }).map((marker) => marker.date), ["2026-08-20"]);

  // An overlapping ACTIVE duplicate still renders and still conflicts.
  const activeDuplicate = period("active-overlap", "2026-08-20", "2026-09-05", undefined, "DRAFT");
  assert.deepEqual(buildPayrollMonthGrid(2026, 8, { today: "2026-08-25", fixedWeeks: false, periods: [active, activeDuplicate] }).days.find((candidate) => candidate.date === "2026-08-25")!.periodIds.sort(), ["active-current", "active-overlap"]);
  assert.equal(findPayrollCalendarConflicts([active, activeDuplicate]).length, 1);
});
