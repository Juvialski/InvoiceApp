import assert from "node:assert/strict";
import test from "node:test";
import type { PayrollEntry, PayrollPeriod, PayrollRun, ProjectWorkerAssignment, Worker, WorkEntry } from "../src/types.ts";
import type { RecurringPayrollComponent, WorkerCompensationProfile } from "../src/lib/payrollAutomation.ts";
import { assignmentDependencySummary, isCompensationProfileConsumed, isRecurringComponentConsumed, workerDependencySummary, workerForLifecycle } from "../src/lib/payrollLifecycle.ts";
import { calculatePayrollRunFromWorkEntries } from "../src/lib/payrollCalculation.ts";

const worker = (id: string, overrides: Partial<Worker> = {}): Worker => ({
  id,
  employeeCode: id,
  firstName: "Test",
  lastName: id,
  displayName: `Test ${id}`,
  employmentType: "REGULAR",
  defaultPayType: "MONTHLY",
  defaultRate: 1000,
  defaultLaborContext: "UNALLOCATED_REVIEW",
  active: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

const period: PayrollPeriod = {
  id: "period-1",
  periodStart: "2026-01-01",
  periodEnd: "2026-01-31",
  status: "APPROVED",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const run: PayrollRun = {
  id: "run-1",
  periodId: period.id,
  status: "APPROVED",
  createdAt: "2026-01-31T00:00:00.000Z",
};

const payrollEntry = (workerId: string, snapshot: Record<string, unknown> = {}): PayrollEntry => ({
  id: `entry-${workerId}`,
  payrollRunId: run.id,
  workerId,
  basePay: 1000,
  regularPay: 1000,
  overtimePay: 0,
  allowances: 0,
  grossPay: 1000,
  deductions: 0,
  netPay: 1000,
  projectAllocatedCost: 1000,
  calculationSnapshot: snapshot,
});

test("worker lifecycle classification only allows permanent deletion for a dependency-free worker", () => {
  const unused = workerDependencySummary("unused", { workers: [worker("unused")] });
  assert.equal(unused.canDelete, true);
  assert.equal(unused.recommendedAction, "DELETE_UNUSED");

  const used = workerDependencySummary("used", {
    workers: [worker("used")],
    assignments: [{ id: "assignment-1", workerId: "used", projectId: "project-1", startDate: "2026-01-01", active: true }],
    workEntries: [{ id: "work-1", workerId: "used", projectId: "project-1", periodId: period.id, workDate: "2026-01-03", rate: 1000, status: "APPROVED" }],
    payrollEntries: [payrollEntry("used")],
  });
  assert.equal(used.canDelete, false);
  assert.equal(used.recommendedAction, "OFFBOARD");
  assert.match(used.blockedReason || "", /cannot be permanently deleted/i);
});

test("worker offboarding keeps the identity and historical employment meaning", () => {
  const original = worker("juan", { employmentStatus: "ACTIVE" });
  const offboarded = workerForLifecycle(original, "OFFBOARD", "2026-08-29");
  assert.equal(offboarded.id, original.id);
  assert.equal(offboarded.active, false);
  assert.equal(offboarded.employmentStatus, "OFFBOARDED");
  assert.equal(offboarded.endDate, "2026-08-29");
  const reactivated = workerForLifecycle(offboarded, "REACTIVATE", "2026-08-29");
  assert.equal(reactivated.active, true);
  assert.equal(reactivated.employmentStatus, "ACTIVE");
  assert.equal(reactivated.endDate, undefined);
});

test("multiple project assignments are membership context, not duplicated cost dependencies", () => {
  const assignments: ProjectWorkerAssignment[] = [
    { id: "assignment-a", workerId: "juan", projectId: "project-a", startDate: "2026-01-01", active: true },
    { id: "assignment-b", workerId: "juan", projectId: "project-b", startDate: "2026-01-01", active: true },
  ];
  const summary = workerDependencySummary("juan", { workers: [worker("juan")], assignments });
  assert.equal(summary.assignmentCount, 2);
  assert.equal(summary.canDelete, false);

  const assignment = assignmentDependencySummary(assignments[0]!, {
    workEntries: [{ id: "work-a", workerId: "juan", projectId: "project-a", workDate: "2026-01-04", rate: 1000, status: "APPROVED" }],
    overtimeRequests: [],
    payrollEntries: [],
    allocations: [],
  });
  assert.equal(assignment.hasDownstreamUsage, true);
  assert.equal(assignment.canDelete, false);
});

test("effective-dated compensation and recurring components distinguish consumed snapshots from future setup", () => {
  const profile: WorkerCompensationProfile = { id: "profile-used", workerId: "juan", effectiveFrom: "2026-01-01", frequency: "MONTHLY", rate: 1000, defaultLaborContext: "ADMIN_OFFICE" };
  assert.equal(isCompensationProfileConsumed({ profile, payrollEntries: [payrollEntry("juan", { sourceIds: [profile.id] })], payrollRuns: [run], periods: [period] }), true);
  const futureProfile = { ...profile, effectiveFrom: "2027-01-01" };
  assert.equal(isCompensationProfileConsumed({ profile: futureProfile, payrollEntries: [], payrollRuns: [run], periods: [period] }), false);

  const component: RecurringPayrollComponent = { id: "component-used", workerId: "juan", type: "EARNING", name: "Allowance", amount: 100, effectiveFrom: "2026-01-01", active: true };
  assert.equal(isRecurringComponentConsumed({ component, payrollEntries: [payrollEntry("juan", { components: [{ id: component.id }] })], payrollRuns: [run], periods: [period] }), true);
});

test("explicit actual project work wins over a worker default and multiple assignments do not double-count labor", () => {
  const projectA = "project-a";
  const projectB = "project-b";
  const entries: WorkEntry[] = [
    { id: "work-b", workerId: "juan", projectId: projectB, periodId: period.id, workDate: "2026-01-03", regularHours: 8, rate: 125, status: "APPROVED" },
  ];
  const result = calculatePayrollRunFromWorkEntries({
    runId: run.id,
    periodId: period.id,
    periodStart: period.periodStart,
    periodEnd: period.periodEnd,
    workers: [worker("juan", { defaultLaborContext: "PROJECT", defaultProjectId: projectA, defaultRate: 1000 })],
    assignments: [
      { id: "assignment-a", workerId: "juan", projectId: projectA, startDate: "2026-01-01", active: true },
      { id: "assignment-b", workerId: "juan", projectId: projectB, startDate: "2026-01-01", active: true },
    ],
    workEntries: entries,
  });
  assert.equal(result.allocations.length, 1);
  assert.equal(result.allocations[0]!.projectId, projectB);
  assert.equal(result.allocations.reduce((sum, allocation) => sum + allocation.allocationAmount, 0), result.entries[0]!.grossPay);
});
