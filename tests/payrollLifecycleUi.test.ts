import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workers = readFileSync(new URL("../src/components/payroll/WorkersTable.tsx", import.meta.url), "utf8");
const assignments = readFileSync(new URL("../src/components/payroll/ProjectAssignments.tsx", import.meta.url), "utf8");
const profiles = readFileSync(new URL("../src/components/payroll/PayrollProfiles.tsx", import.meta.url), "utf8");
const sources = readFileSync(new URL("../src/components/payroll/TimeEntries.tsx", import.meta.url), "utf8");
const attendance = readFileSync(new URL("../src/components/payroll/AttendanceWorkspace.tsx", import.meta.url), "utf8");

test("worker UI names lifecycle outcomes instead of exposing an ambiguous delete action", () => {
  assert.match(workers, /Offboard/);
  assert.match(workers, /Reactivate/);
  assert.match(workers, /Delete unused/);
  assert.match(workers, /History retained · offboard instead/);
  for (const context of ["PROJECT", "ADMIN_OFFICE", "GENERAL_OVERHEAD", "UNALLOCATED_REVIEW"]) assert.match(workers, new RegExp(context));
  assert.match(workers, /actual work wins/i);
});

test("assignment and setup UI exposes history-preserving correction actions", () => {
  assert.match(assignments, /Multiple concurrent projects/);
  assert.match(assignments, /End/);
  assert.match(assignments, /Delete unused/);
  assert.match(assignments, /downstream workforce or payroll history/);
  assert.match(profiles, /Payroll history/);
  assert.match(profiles, /Deactivate/);
  assert.match(profiles, /Consumed components can only be ended or deactivated/);
});

test("work and attendance UI distinguishes draft deletion from void/cancel correction", () => {
  assert.match(sources, /Delete draft/);
  assert.match(sources, /Void/);
  assert.match(sources, /entry\.status === "APPROVED"/);
  assert.match(attendance, /Delete draft/);
  assert.match(attendance, /Void/);
  assert.match(attendance, /Cancel this leave request/);
  assert.match(attendance, /source will remain in history/);
});
