import test from "node:test";
import assert from "node:assert/strict";
import { buildPayrollDraft } from "../src/lib/payrollAutomation.ts";

test("monthly project labor follows dated project work without multiplying salary", () => {
  const draft = buildPayrollDraft({
    period: { id: "p1", startDate: "2026-08-01", endDate: "2026-08-31" },
    profiles: [{ workerId: "w1", effectiveFrom: "2026-01-01", frequency: "MONTHLY", rate: 2000, defaultLaborContext: "PROJECT" }],
    workEntries: [
      { id: "e1", workerId: "w1", workDate: "2026-08-05", projectId: "project-a", approved: true },
      { id: "e2", workerId: "w1", workDate: "2026-08-20", projectId: "project-b", approved: true },
    ],
  });
  assert.equal(draft.entries[0]?.grossEarnings, 2000);
  assert.deepEqual(draft.allocations.map((allocation) => allocation.projectId).sort(), ["project-a", "project-b"]);
  assert.equal(draft.exceptions.some((issue) => issue.code === "INVALID_PROJECT_CONTEXT"), false);
});

test("components effective during a period are included even when they start after period start", () => {
  const draft = buildPayrollDraft({
    period: { id: "p1", startDate: "2026-08-01", endDate: "2026-08-31" },
    profiles: [{ workerId: "w1", effectiveFrom: "2026-01-01", frequency: "MONTHLY", rate: 1000, defaultLaborContext: "ADMIN_OFFICE" }],
    workEntries: [{ id: "e1", workerId: "w1", workDate: "2026-08-05", approved: true }],
    recurringComponents: [{ id: "meal", workerId: "w1", type: "EARNING", name: "Meal", amount: 100, effectiveFrom: "2026-08-15", active: true }],
  });
  assert.equal(draft.entries[0]?.grossEarnings, 1100);
});

test("hourly workers without approved work do not create zero-value payroll rows", () => {
  const draft = buildPayrollDraft({
    period: { id: "p1", startDate: "2026-08-01", endDate: "2026-08-31" },
    workers: [{ id: "w1", frequency: "HOURLY", rate: 25, defaultLaborContext: "ADMIN_OFFICE" }],
    workEntries: [],
  });
  assert.equal(draft.entries.length, 0);
  assert.equal(draft.readiness, "WARNING");
});
