import test from "node:test";
import assert from "node:assert/strict";
import {
  SCHEDULE_DEPENDENCY_TYPES,
  SCHEDULE_TASK_KINDS,
  SCHEDULE_TASK_STATUSES,
  isScheduleIsoDate,
  validateScheduleDependencyDraft,
  validateScheduleNetwork,
  validateScheduleTaskDraft,
} from "../src/features/scheduling/contracts.ts";

test("Phase 2A exposes stable scheduling vocabulary", () => {
  assert.deepEqual(SCHEDULE_TASK_KINDS, ["TASK", "MILESTONE"]);
  assert.deepEqual(SCHEDULE_TASK_STATUSES, ["PLANNED", "IN_PROGRESS", "COMPLETE", "ON_HOLD", "CANCELLED"]);
  assert.deepEqual(SCHEDULE_DEPENDENCY_TYPES, ["FINISH_TO_START", "START_TO_START", "FINISH_TO_FINISH", "START_TO_FINISH"]);
});

test("schedule dates require real ISO calendar dates", () => {
  assert.equal(isScheduleIsoDate("2026-08-28"), true);
  assert.equal(isScheduleIsoDate("2026-02-29"), false);
  assert.equal(isScheduleIsoDate("2028-02-29"), true);
  assert.equal(isScheduleIsoDate("08/28/2026"), false);
});

test("task validation preserves date, milestone, and progress invariants", () => {
  assert.deepEqual(validateScheduleTaskDraft({
    name: "Foundation works",
    kind: "TASK",
    status: "PLANNED",
    startDate: "2026-09-01",
    endDate: "2026-09-12",
    progressPercent: 0,
  }), []);

  const issues = validateScheduleTaskDraft({
    name: " ",
    kind: "MILESTONE",
    status: "PLANNED",
    startDate: "2026-09-12",
    endDate: "2026-09-10",
    progressPercent: 125,
  });
  assert.deepEqual(issues.map((issue) => issue.code), [
    "name-required",
    "end-before-start",
    "milestone-date-mismatch",
    "progress-out-of-range",
  ]);
});

test("dependency validation rejects self references and fractional lag", () => {
  const issues = validateScheduleDependencyDraft({
    predecessorTaskId: "task-a",
    successorTaskId: "task-a",
    dependencyType: "FINISH_TO_START",
    lagDays: 1.5,
  });
  assert.deepEqual(issues.map((issue) => issue.code), ["dependency-self-reference", "invalid-dependency-lag"]);
});

test("schedule network rejects missing task references", () => {
  const issues = validateScheduleNetwork(["task-a"], [{
    predecessorTaskId: "task-a",
    successorTaskId: "task-b",
    dependencyType: "FINISH_TO_START",
    lagDays: 0,
  }]);
  assert.equal(issues.length, 1);
  assert.equal(issues[0]?.code, "dependency-task-missing");
});

test("schedule network detects dependency cycles deterministically", () => {
  const issues = validateScheduleNetwork(["task-c", "task-a", "task-b"], [
    { predecessorTaskId: "task-b", successorTaskId: "task-c", dependencyType: "FINISH_TO_START", lagDays: 0 },
    { predecessorTaskId: "task-c", successorTaskId: "task-a", dependencyType: "FINISH_TO_START", lagDays: 0 },
    { predecessorTaskId: "task-a", successorTaskId: "task-b", dependencyType: "FINISH_TO_START", lagDays: 0 },
  ]);
  assert.equal(issues.length, 1);
  assert.equal(issues[0]?.code, "dependency-cycle");
  assert.match(issues[0]?.message || "", /task-a -> task-b -> task-c -> task-a/);
});

test("acyclic schedule network remains valid", () => {
  assert.deepEqual(validateScheduleNetwork(["task-a", "task-b", "task-c"], [
    { predecessorTaskId: "task-a", successorTaskId: "task-b", dependencyType: "FINISH_TO_START", lagDays: 0 },
    { predecessorTaskId: "task-b", successorTaskId: "task-c", dependencyType: "START_TO_START", lagDays: 2 },
  ]), []);
});
