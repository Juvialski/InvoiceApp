export const SCHEDULE_TASK_KINDS = ["TASK", "MILESTONE"] as const;
export type ScheduleTaskKind = (typeof SCHEDULE_TASK_KINDS)[number];

export const SCHEDULE_TASK_STATUSES = [
  "PLANNED",
  "IN_PROGRESS",
  "COMPLETE",
  "ON_HOLD",
  "CANCELLED",
] as const;
export type ScheduleTaskStatus = (typeof SCHEDULE_TASK_STATUSES)[number];

export const SCHEDULE_DEPENDENCY_TYPES = [
  "FINISH_TO_START",
  "START_TO_START",
  "FINISH_TO_FINISH",
  "START_TO_FINISH",
] as const;
export type ScheduleDependencyType = (typeof SCHEDULE_DEPENDENCY_TYPES)[number];

export interface ProjectScheduleTask {
  readonly id: string;
  readonly companyId: string;
  readonly projectId: string;
  readonly parentTaskId?: string | null;
  readonly taskCode?: string | null;
  readonly name: string;
  readonly kind: ScheduleTaskKind;
  readonly status: ScheduleTaskStatus;
  readonly startDate: string;
  readonly endDate: string;
  readonly progressPercent: number;
  readonly sortOrder: number;
  readonly notes?: string | null;
}

export interface ProjectScheduleDependency {
  readonly id: string;
  readonly companyId: string;
  readonly projectId: string;
  readonly predecessorTaskId: string;
  readonly successorTaskId: string;
  readonly dependencyType: ScheduleDependencyType;
  readonly lagDays: number;
}

export interface ProjectScheduleTaskDraft {
  readonly name: string;
  readonly kind: ScheduleTaskKind;
  readonly status: ScheduleTaskStatus;
  readonly startDate: string;
  readonly endDate: string;
  readonly progressPercent: number;
  readonly parentTaskId?: string | null;
  readonly taskCode?: string | null;
  readonly notes?: string | null;
}

export interface ProjectScheduleDependencyDraft {
  readonly predecessorTaskId: string;
  readonly successorTaskId: string;
  readonly dependencyType: ScheduleDependencyType;
  readonly lagDays: number;
}

export type ScheduleValidationIssueCode =
  | "name-required"
  | "invalid-start-date"
  | "invalid-end-date"
  | "end-before-start"
  | "milestone-date-mismatch"
  | "progress-out-of-range"
  | "invalid-dependency-type"
  | "invalid-dependency-lag"
  | "dependency-task-required"
  | "dependency-self-reference"
  | "dependency-task-missing"
  | "dependency-cycle";

export interface ScheduleValidationIssue {
  readonly code: ScheduleValidationIssueCode;
  readonly field: string;
  readonly message: string;
}

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isScheduleIsoDate(value: string): boolean {
  const match = ISO_DATE_PATTERN.exec(value.trim());
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const candidate = new Date(Date.UTC(year, month - 1, day));
  return candidate.getUTCFullYear() === year
    && candidate.getUTCMonth() === month - 1
    && candidate.getUTCDate() === day;
}

export function validateScheduleTaskDraft(task: ProjectScheduleTaskDraft): ScheduleValidationIssue[] {
  const issues: ScheduleValidationIssue[] = [];
  const startDate = task.startDate.trim();
  const endDate = task.endDate.trim();
  const startValid = isScheduleIsoDate(startDate);
  const endValid = isScheduleIsoDate(endDate);

  if (!task.name.trim()) {
    issues.push({ code: "name-required", field: "name", message: "Task name is required." });
  }
  if (!startValid) {
    issues.push({ code: "invalid-start-date", field: "startDate", message: "Start date must be a valid YYYY-MM-DD date." });
  }
  if (!endValid) {
    issues.push({ code: "invalid-end-date", field: "endDate", message: "End date must be a valid YYYY-MM-DD date." });
  }
  if (startValid && endValid && endDate < startDate) {
    issues.push({ code: "end-before-start", field: "endDate", message: "End date cannot be before start date." });
  }
  if (startValid && endValid && task.kind === "MILESTONE" && startDate !== endDate) {
    issues.push({ code: "milestone-date-mismatch", field: "endDate", message: "Milestones must use the same start and end date." });
  }
  if (!Number.isFinite(task.progressPercent) || task.progressPercent < 0 || task.progressPercent > 100) {
    issues.push({ code: "progress-out-of-range", field: "progressPercent", message: "Progress must be between 0 and 100." });
  }

  return issues;
}

export function validateScheduleDependencyDraft(dependency: ProjectScheduleDependencyDraft): ScheduleValidationIssue[] {
  const issues: ScheduleValidationIssue[] = [];
  const predecessorTaskId = dependency.predecessorTaskId.trim();
  const successorTaskId = dependency.successorTaskId.trim();

  if (!predecessorTaskId || !successorTaskId) {
    issues.push({ code: "dependency-task-required", field: "taskId", message: "Both predecessor and successor task IDs are required." });
  }
  if (predecessorTaskId && predecessorTaskId === successorTaskId) {
    issues.push({ code: "dependency-self-reference", field: "successorTaskId", message: "A task cannot depend on itself." });
  }
  if (!SCHEDULE_DEPENDENCY_TYPES.includes(dependency.dependencyType)) {
    issues.push({ code: "invalid-dependency-type", field: "dependencyType", message: "Dependency type is not supported." });
  }
  if (!Number.isInteger(dependency.lagDays)) {
    issues.push({ code: "invalid-dependency-lag", field: "lagDays", message: "Dependency lag must be a whole number of days." });
  }

  return issues;
}

export function validateScheduleNetwork(
  taskIds: readonly string[],
  dependencies: readonly ProjectScheduleDependencyDraft[],
): ScheduleValidationIssue[] {
  const issues: ScheduleValidationIssue[] = [];
  const knownTaskIds = new Set(taskIds.map((taskId) => taskId.trim()).filter(Boolean));
  const adjacency = new Map<string, string[]>();
  for (const taskId of [...knownTaskIds].sort()) adjacency.set(taskId, []);

  for (const dependency of dependencies) {
    const predecessorTaskId = dependency.predecessorTaskId.trim();
    const successorTaskId = dependency.successorTaskId.trim();
    if (!knownTaskIds.has(predecessorTaskId) || !knownTaskIds.has(successorTaskId)) {
      issues.push({
        code: "dependency-task-missing",
        field: "taskId",
        message: `Dependency references a task outside the current schedule: ${predecessorTaskId || "?"} -> ${successorTaskId || "?"}.`,
      });
      continue;
    }
    if (predecessorTaskId === successorTaskId) continue;
    adjacency.get(predecessorTaskId)!.push(successorTaskId);
  }

  for (const targets of adjacency.values()) targets.sort();

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const stack: string[] = [];
  let cycle: string[] | null = null;

  const visit = (taskId: string): boolean => {
    if (visiting.has(taskId)) {
      const cycleStart = stack.indexOf(taskId);
      cycle = [...stack.slice(cycleStart), taskId];
      return true;
    }
    if (visited.has(taskId)) return false;

    visiting.add(taskId);
    stack.push(taskId);
    for (const target of adjacency.get(taskId) || []) {
      if (visit(target)) return true;
    }
    stack.pop();
    visiting.delete(taskId);
    visited.add(taskId);
    return false;
  };

  for (const taskId of [...knownTaskIds].sort()) {
    if (visit(taskId)) break;
  }

  if (cycle) {
    issues.push({
      code: "dependency-cycle",
      field: "dependencies",
      message: `Schedule dependencies must remain acyclic: ${cycle.join(" -> ")}.`,
    });
  }

  return issues;
}
