import test from "node:test";
import assert from "node:assert/strict";
import { createDemoWorkspace } from "../src/demo/data/createDemoWorkspace.ts";
import { buildAutomaticPayrollDraft } from "../src/lib/payrollWorkflow.ts";

const ANCHOR = "2026-08-27";

test("demo payroll keeps real overtime cost without presentation warnings", () => {
  const data = createDemoWorkspace(ANCHOR);
  const period = data.payroll.periods.find((item) => item.status === "OPEN");
  assert.ok(period);
  const run = data.payroll.runs.find((item) => item.periodId === period.id && item.status !== "VOID");
  assert.ok(run);

  const approvedRatedWork = data.payroll.workEntries.filter((entry) =>
    entry.status === "APPROVED" && (entry.overtimeHours || 0) > 0 && (entry.overtimeRate || 0) > 0,
  );
  assert.ok(approvedRatedWork.length >= 3, "demo should retain approved overtime with explicit rates");
  assert.ok((data.payroll.overtimeRequests || []).some((request) => request.status === "PENDING"));
  assert.ok((data.payroll.overtimeRequests || []).some((request) => request.status === "REJECTED" || request.status === "CANCELLED"));
  assert.equal((data.payroll.overtimeRequests || []).some((request) => request.status === "APPROVED" && request.approvedMinutes > 0), false);

  const draft = buildAutomaticPayrollDraft({
    period,
    run,
    workers: data.payroll.workers,
    assignments: data.payroll.assignments,
    profiles: data.payroll.compensationProfiles,
    recurringComponents: data.payroll.recurringComponents,
    workEntries: data.payroll.workEntries,
    attendanceRecords: data.payroll.attendanceRecords,
    leaveRequests: data.payroll.leaveRequests,
    overtimeRequests: data.payroll.overtimeRequests,
    holidays: data.payroll.holidays,
    projects: data.projects,
    mode: "ASSISTED",
  });

  const overtimeIssues = draft.exceptions.filter((issue) => issue.code === "OVERTIME_WITHOUT_RULE" || issue.code === "OVERTIME_CONFLICT");
  assert.deepEqual(overtimeIssues, []);
});
