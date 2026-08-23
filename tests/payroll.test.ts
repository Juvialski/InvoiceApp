import test from "node:test";
import assert from "node:assert/strict";
import { calculateMonthlyProjectAllocations, calculateWorkEntryCost, payrollStatusIsConfirmed } from "../src/lib/payroll.ts";

test("monthly worker allocations preserve a 40,000 salary across projects", () => {
  const allocations = calculateMonthlyProjectAllocations(40_000, [{ projectId: "project-a", percentage: 60 }, { projectId: "project-b", percentage: 40 }]);
  assert.deepEqual(allocations.map((item) => item.allocationAmount), [24_000, 16_000]);
  assert.equal(allocations.reduce((sum, item) => sum + item.allocationAmount, 0), 40_000);
});

test("daily and hourly time entries calculate project labor cost", () => {
  assert.equal(calculateWorkEntryCost({ daysWorked: 10, regularHours: 0, overtimeHours: 0, rate: 1_800 }, "DAILY"), 18_000);
  assert.equal(calculateWorkEntryCost({ daysWorked: 0, regularHours: 40, overtimeHours: 5, rate: 500, overtimeRate: 750 }, "HOURLY"), 23_750);
});

test("only approved and paid payroll runs are confirmed labor cost", () => {
  assert.equal(payrollStatusIsConfirmed("DRAFT"), false);
  assert.equal(payrollStatusIsConfirmed("APPROVED"), true);
  assert.equal(payrollStatusIsConfirmed("PAID"), true);
});

