import test from "node:test";
import assert from "node:assert/strict";
import { calculatePayroll, resolvePayrollRate, validatePayrollCalculationInput, validatePayrollProjectAllocations } from "../src/lib/payrollCalculation.ts";

const worker = { defaultPayType: "HOURLY" as const, defaultRate: 500 };

test("assignment pay type and rate override the worker default only for its active date range", () => {
  const assignment = { startDate: "2026-08-01", endDate: "2026-08-31", payType: "DAILY" as const, rate: 1_800, active: true };
  assert.deepEqual(resolvePayrollRate({ worker, assignment, workDate: "2026-08-15" }), {
    payType: "DAILY", rate: 1_800, payTypeSource: "ASSIGNMENT", rateSource: "ASSIGNMENT", assignmentValidForWorkDate: true,
  });
  assert.deepEqual(resolvePayrollRate({ worker, assignment, workDate: "2026-09-01" }), {
    payType: "HOURLY", rate: 500, payTypeSource: "WORKER_DEFAULT", rateSource: "WORKER_DEFAULT", assignmentValidForWorkDate: false,
  });
});

test("explicit manual overrides are opt-in and can replace either resolved field", () => {
  const result = resolvePayrollRate({ worker, workDate: "2026-08-15", manualOverride: { payType: "MONTHLY", rate: 40_000 } });
  assert.equal(result.payType, "MONTHLY");
  assert.equal(result.rate, 40_000);
  assert.equal(result.payTypeSource, "MANUAL");
  assert.equal(result.rateSource, "MANUAL");
});

test("hourly, daily, monthly, and overtime calculations are deterministic", () => {
  assert.equal(calculatePayroll({ payType: "HOURLY", rate: 500, regularHours: 40, overtimeHours: 5, overtimeRate: 750 }).grossPay, 23_750);
  assert.equal(calculatePayroll({ payType: "DAILY", rate: 1_800, daysWorked: 10 }).basePay, 18_000);
  assert.equal(calculatePayroll({ payType: "MONTHLY", rate: 40_000, monthlyAllocationPercentage: 60 }).regularPay, 24_000);
  assert.equal(calculatePayroll({ payType: "HOURLY", rate: 500, regularHours: 8, overtimeHours: 2, overtimeMultiplier: 1.5 }).overtimePay, 1_500);
});

test("structured adjustments produce gross, net, employer cost, and a reproducible snapshot", () => {
  const input = { payType: "MONTHLY" as const, rate: 40_000, adjustments: [
    { type: "EARNING" as const, code: "ALLOWANCE", amount: 2_000 },
    { type: "DEDUCTION" as const, code: "LOAN", amount: 3_000 },
    { type: "EMPLOYER_COST" as const, code: "FUTURE", amount: 1_000 },
  ] };
  const first = calculatePayroll(input);
  const second = calculatePayroll(input);
  assert.equal(first.grossPay, 42_000);
  assert.equal(first.netPay, 39_000);
  assert.equal(first.totalEmployerCost, 43_000);
  assert.deepEqual(first.calculationSnapshot, second.calculationSnapshot);
});

test("validation exposes allocation percentages and unallocated labor", () => {
  const result = validatePayrollProjectAllocations(100_000, [{ projectId: "a", allocationAmount: 60_000, allocationPercentage: 60 }]);
  assert.equal(result.valid, true);
  assert.equal(result.allocationPercentage, 60);
  assert.equal(result.unallocatedAmount, 40_000);
  assert.equal(validatePayrollProjectAllocations(100_000, [{ projectId: "a", allocationAmount: 60_000, allocationPercentage: 101 }]).valid, false);
  assert.equal(validatePayrollCalculationInput({ payType: "HOURLY", rate: 0 }).valid, false);
});
