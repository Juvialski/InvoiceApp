import test from "node:test";
import assert from "node:assert/strict";
import {
  canTransitionPayrollRun,
  readPayrollWorkspaceFromLocal,
  validatePayrollAllocations,
  validatePayrollRunApproval,
  writePayrollWorkspaceToLocal,
} from "../src/lib/payroll.ts";
import type { PayrollAdjustment, PayrollEntry, PayrollValidationResult, WorkEntry } from "../src/types.ts";

class MemoryStorage implements Storage {
  private values = new Map<string, string>();

  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

const workEntry: WorkEntry = {
  id: "work-1",
  workerId: "worker-1",
  projectId: "project-1",
  periodId: "period-1",
  workDate: "2026-08-15",
  regularHours: 8,
  overtimeHours: 0,
  daysWorked: 1,
  rate: 1_000,
  status: "DRAFT",
};

const payrollEntry: PayrollEntry = {
  id: "entry-1",
  payrollRunId: "run-1",
  workerId: "worker-1",
  basePay: 10_000,
  regularPay: 10_000,
  overtimePay: 0,
  allowances: 0,
  grossPay: 10_000,
  deductions: 0,
  netPay: 10_000,
  projectAllocatedCost: 10_000,
  calculationSnapshot: { source: "time-entry", calculatedAt: "2026-08-15T00:00:00.000Z" },
};

const adjustment: PayrollAdjustment = {
  id: "adjustment-1",
  payrollEntryId: "entry-1",
  type: "EARNING",
  code: "ALLOWANCE",
  description: "Meal allowance",
  amount: 250,
};

test("local payroll persistence round-trips entries, adjustments, and work-entry period linkage", () => {
  const storage = new MemoryStorage();
  writePayrollWorkspaceToLocal({ departments: [], workers: [], assignments: [], periods: [], runs: [], entries: [payrollEntry], allocations: [], workEntries: [workEntry], adjustments: [adjustment] }, storage);
  const loaded = readPayrollWorkspaceFromLocal(storage);
  assert.deepEqual(loaded.entries, [payrollEntry]);
  assert.deepEqual(loaded.adjustments, [adjustment]);
  assert.equal(loaded.workEntries[0]?.periodId, "period-1");
});

test("payroll run transitions follow the database state machine", () => {
  assert.equal(canTransitionPayrollRun("DRAFT", "CALCULATED"), true);
  assert.equal(canTransitionPayrollRun("CALCULATED", "APPROVED"), true);
  assert.equal(canTransitionPayrollRun("APPROVED", "PAID"), true);
  assert.equal(canTransitionPayrollRun("DRAFT", "APPROVED"), false);
  assert.equal(canTransitionPayrollRun("PAID", "DRAFT"), false);
});

test("approval validation requires matching, unique entries with non-empty snapshots", () => {
  const valid: PayrollValidationResult = validatePayrollRunApproval({ id: "run-1", status: "CALCULATED" }, [payrollEntry]);
  assert.equal(valid.valid, true);

  const invalid = validatePayrollRunApproval({ id: "run-1", status: "CALCULATED" }, [{ ...payrollEntry, calculationSnapshot: {} }, { ...payrollEntry, id: "entry-2" }]);
  assert.equal(invalid.valid, false);
  assert.match(invalid.issues.join(" "), /non-empty calculation snapshot/);
  assert.match(invalid.issues.join(" "), /appears more than once/);
});

test("allocation validation caps percentages and total project cost", () => {
  const invalid = validatePayrollAllocations(payrollEntry, [
    { id: "allocation-1", payrollEntryId: "entry-1", projectId: "project-1", allocationAmount: 6_000, allocationPercentage: 60, source: "MANUAL" },
    { id: "allocation-2", payrollEntryId: "entry-1", projectId: "project-2", allocationAmount: 5_000, allocationPercentage: 50, source: "MANUAL" },
  ]);
  assert.equal(invalid.valid, false);
  assert.match(invalid.issues.join(" "), /percentages exceed/);
  assert.match(invalid.issues.join(" "), /amounts exceed/);
});
