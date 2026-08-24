import type { PayrollAdjustment, PayrollEntry, PayrollPeriod, PayrollRun, WorkEntry } from "../types.ts";
import type { PayrollImportBatch } from "./payrollImportPersistence.ts";
import {
  generatePayrollPeriodsAroundReference,
  getPayrollScheduleVersions,
  validatePayrollPeriodShape,
  type PayrollSchedule,
  type PayrollScheduleVersion,
} from "./payrollSchedule.ts";

export type PayrollIntegrityIssueCode =
  | "MULTIPLE_ACTIVE_SCHEDULES"
  | "OVERLAPPING_OPEN_PERIODS"
  | "DUPLICATE_PERIOD_BOUNDARY"
  | "MULTIPLE_RUNS_FOR_PERIOD"
  | "DUPLICATE_EMPTY_RUN"
  | "ORPHAN_RUN"
  | "PERIOD_VERSION_MISSING"
  | "SCHEDULE_VERSION_CONFLICT"
  | "PERIOD_SHAPE_INVALID"
  | "STALE_AUTO_GENERATED_PERIOD"
  | "ORPHAN_ENTRY"
  | "ORPHAN_ALLOCATION";

export interface PayrollIntegrityIssue {
  code: PayrollIntegrityIssueCode;
  message: string;
  periodIds?: string[];
  scheduleIds?: string[];
  runIds?: string[];
  safeToRepair?: boolean;
}

export interface PayrollPeriodSourceContext {
  runs?: readonly PayrollRun[];
  entries?: readonly PayrollEntry[];
  workEntries?: readonly WorkEntry[];
  importBatches?: readonly PayrollImportBatch[];
  adjustments?: readonly PayrollAdjustment[];
  referenceDate?: string;
}

export interface PayrollPeriodOverlap {
  periodIds: string[];
  overlapStart: string;
  overlapEnd: string;
  locked: boolean;
}

export interface PayrollIntegrityReport {
  activeScheduleCount: number;
  overlappingPeriods: PayrollPeriodOverlap[];
  duplicateBoundaries: string[][];
  multipleRuns: string[][];
  duplicateEmptyRuns: string[][];
  orphanRuns: string[];
  staleGeneratedPeriods: string[];
  missingVersions: string[];
  mismatchedVersions: string[];
  invalidShapes: string[];
  orphanEntries: string[];
  orphanAllocations: string[];
  issues: PayrollIntegrityIssue[];
}

export interface PayrollPeriodReconciliationResult {
  periods: PayrollPeriod[];
  retiredPeriodIds: string[];
  issues: PayrollIntegrityIssue[];
}

export interface PayrollRepairPlan {
  report: PayrollIntegrityReport;
  periods: PayrollPeriod[];
  runs: PayrollRun[];
  retiredPeriodIds: string[];
  retiredRunIds: string[];
  protectedPeriodCount: number;
  protectedRunCount: number;
  messages: string[];
}

export interface PayrollRepairInput {
  schedules: readonly PayrollSchedule[];
  periods: readonly PayrollPeriod[];
  runs: readonly PayrollRun[];
  entries?: readonly PayrollEntry[];
  allocations?: readonly { id: string; payrollEntryId: string }[];
  workEntries?: readonly WorkEntry[];
  importBatches?: readonly PayrollImportBatch[];
  adjustments?: readonly PayrollAdjustment[];
  referenceDate?: string;
  desiredPeriods?: readonly PayrollPeriod[];
}

export interface PayrollResetPreview {
  safeGeneratedPeriods: number;
  emptyDraftRuns: number;
  protectedPeriods: number;
  protectedRuns: number;
  finalizedPeriods: number;
  dataBearingPeriods: number;
  messages: string[];
}

function dateBoundaryKey(period: Pick<PayrollPeriod, "periodStart" | "periodEnd">) {
  return `${period.periodStart}:${period.periodEnd}`;
}

function boundaryKey(period: Pick<PayrollPeriod, "scheduleId" | "periodStart" | "periodEnd">) {
  return `${period.scheduleId || "manual"}:${period.periodStart}:${period.periodEnd}`;
}

function overlaps(left: Pick<PayrollPeriod, "periodStart" | "periodEnd">, right: Pick<PayrollPeriod, "periodStart" | "periodEnd">) {
  return left.periodStart <= right.periodEnd && right.periodStart <= left.periodEnd;
}

function statusRank(status: string) {
  return status === "PAID" ? 5 : status === "APPROVED" ? 4 : status === "CALCULATED" ? 3 : status === "OPEN" ? 2 : status === "DRAFT" ? 1 : 0;
}

function unique<T>(items: readonly T[]) { return [...new Set(items)]; }

export function isPayrollPeriodLocked(period: Pick<PayrollPeriod, "status" | "lockedAt">) {
  return Boolean(period.lockedAt) || ["APPROVED", "PAID", "VOID"].includes(period.status);
}

function periodRunIds(period: PayrollPeriod, runs: readonly PayrollRun[]) { return runs.filter((run) => run.periodId === period.id).map((run) => run.id); }

function hasCommittedImport(period: PayrollPeriod, importBatches: readonly PayrollImportBatch[]) {
  return importBatches.some((batch) => batch.status !== "VOIDED" && batch.committedPayrollPeriodId === period.id);
}

function hasAdjustmentForPeriod(_period: PayrollPeriod, _runs: readonly PayrollRun[], adjustments: readonly PayrollAdjustment[]) {
  return adjustments.length > 0;
}

export function isPayrollPeriodDataBearing(period: PayrollPeriod, context: PayrollPeriodSourceContext = {}) {
  const runs = context.runs || [];
  const runIds = new Set(periodRunIds(period, runs));
  const entryIds = new Set((context.entries || []).filter((entry) => runIds.has(entry.payrollRunId)).map((entry) => entry.id));
  if (entryIds.size > 0) return true;
  if ((context.workEntries || []).some((entry) => entry.periodId === period.id && entry.status !== "VOID")) return true;
  if (hasCommittedImport(period, context.importBatches || [])) return true;
  if (hasAdjustmentForPeriod(period, runs, (context.adjustments || []).filter((adjustment) => entryIds.has(adjustment.payrollEntryId)))) return true;
  if (period.notes?.trim()) return true;
  if (runs.some((run) => runIds.has(run.id) && ["CALCULATED", "APPROVED", "PAID"].includes(run.status))) return true;
  return false;
}

export function isSafeToRetirePayrollPeriod(period: PayrollPeriod, context: PayrollPeriodSourceContext = {}) {
  return period.autoGenerated === true
    && (period.status === "DRAFT" || period.status === "OPEN")
    && !isPayrollPeriodLocked(period)
    && !isPayrollPeriodDataBearing(period, context);
}

export function isSafeToRetirePayrollRun(run: PayrollRun, context: PayrollPeriodSourceContext = {}) {
  if (run.status !== "DRAFT") return false;
  if ((context.entries || []).some((entry) => entry.payrollRunId === run.id)) return false;
  if ((context.adjustments || []).some((adjustment) => (context.entries || []).some((entry) => entry.id === adjustment.payrollEntryId && entry.payrollRunId === run.id))) return false;
  if (run.importBatchId) { const batch = (context.importBatches || []).find((candidate) => candidate.id === run.importBatchId); if (!batch || batch.status !== "VOIDED") return false; }
  return true;
}

export function findExactDuplicatePayrollPeriods(periods: readonly PayrollPeriod[]) {
  const groups = new Map<string, string[]>();
  for (const period of periods) {
    if (period.status === "VOID") continue;
    const ids = groups.get(dateBoundaryKey(period)) || [];
    ids.push(period.id);
    groups.set(dateBoundaryKey(period), ids);
  }
  return [...groups.values()].filter((ids) => ids.length > 1);
}

export function findOverlappingPayrollPeriods(periods: readonly PayrollPeriod[], includeLocked = true): PayrollPeriodOverlap[] {
  const active = periods.filter((period) => period.status !== "VOID" && (includeLocked || !isPayrollPeriodLocked(period))).slice().sort((left, right) => left.periodStart.localeCompare(right.periodStart) || left.periodEnd.localeCompare(right.periodEnd) || left.id.localeCompare(right.id));
  const result: PayrollPeriodOverlap[] = [];
  for (let leftIndex = 0; leftIndex < active.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < active.length; rightIndex += 1) {
      const left = active[leftIndex]!;
      const right = active[rightIndex]!;
      if (right.periodStart > left.periodEnd) break;
      if (!overlaps(left, right) || boundaryKey(left) === boundaryKey(right)) continue;
      const overlapStart = left.periodStart > right.periodStart ? left.periodStart : right.periodStart;
      const overlapEnd = left.periodEnd < right.periodEnd ? left.periodEnd : right.periodEnd;
      result.push({ periodIds: [left.id, right.id], overlapStart, overlapEnd, locked: isPayrollPeriodLocked(left) || isPayrollPeriodLocked(right) });
    }
  }
  return result;
}

function primaryScheduleSort(left: PayrollSchedule, right: PayrollSchedule) {
  return (right.updatedAt || "").localeCompare(left.updatedAt || "") || (right.createdAt || "").localeCompare(left.createdAt || "") || right.effectiveFrom.localeCompare(left.effectiveFrom) || right.id.localeCompare(left.id);
}

export function selectPrimaryPayrollSchedule(schedules: readonly PayrollSchedule[]) {
  return schedules.filter((schedule) => schedule.active).slice().sort(primaryScheduleSort)[0] || schedules.slice().sort(primaryScheduleSort)[0];
}

function scheduleVersionMaps(schedules: readonly PayrollSchedule[]) {
  const schedulesById = new Map(schedules.map((schedule) => [schedule.id, schedule]));
  const versionsById = new Map<string, PayrollScheduleVersion>();
  for (const schedule of schedules) for (const version of getPayrollScheduleVersions(schedule)) versionsById.set(version.id, version);
  return { schedulesById, versionsById };
}

export function resolvePayrollPeriodScheduleVersion(period: Pick<PayrollPeriod, "scheduleId" | "scheduleVersionId" | "periodStart">, schedules: readonly PayrollSchedule[]) {
  const { schedulesById, versionsById } = scheduleVersionMaps(schedules);
  if (!period.scheduleId || !period.scheduleVersionId) return undefined;
  const version = versionsById.get(period.scheduleVersionId);
  return version && schedulesById.has(period.scheduleId) && version.scheduleId === period.scheduleId ? version : undefined;
}

export function payrollPeriodFrequency(period: Pick<PayrollPeriod, "scheduleId" | "scheduleVersionId" | "periodStart">, schedules: readonly PayrollSchedule[]) {
  return resolvePayrollPeriodScheduleVersion(period, schedules)?.frequency;
}

export function payrollPeriodFrequencyLabel(period: Pick<PayrollPeriod, "scheduleId" | "scheduleVersionId" | "periodStart">, schedules: readonly PayrollSchedule[]) {
  const frequency = payrollPeriodFrequency(period, schedules);
  if (!frequency) return period.scheduleId || period.scheduleVersionId ? "Legacy payroll period" : "Payroll period";
  return frequency.replaceAll("_", " ");
}

export function validatePayrollPeriodAgainstSchedule(period: PayrollPeriod, schedules: readonly PayrollSchedule[]) {
  const version = resolvePayrollPeriodScheduleVersion(period, schedules);
  if (!period.scheduleId || !period.scheduleVersionId) return { valid: true, issues: [] as string[], version: undefined };
  if (!version) return { valid: false, issues: ["Payroll period is linked to a missing or mismatched schedule version."], version: undefined };
  const result = validatePayrollPeriodShape(period, version);
  return { ...result, version };
}

export function reconcileObsoleteGeneratedPayrollPeriods(
  periods: readonly PayrollPeriod[],
  desiredPeriods: readonly PayrollPeriod[],
  options: PayrollPeriodSourceContext & { referenceDate: string; horizonEnd?: string },
): PayrollPeriodReconciliationResult {
  const desiredBoundaries = new Set(desiredPeriods.map(boundaryKey));
  const retiredPeriodIds: string[] = [];
  const issues: PayrollIntegrityIssue[] = [];
  const context = options;
  const byBoundary = new Map<string, PayrollPeriod[]>();
  for (const period of periods) {
    const rows = byBoundary.get(boundaryKey(period)) || [];
    rows.push(period);
    byBoundary.set(boundaryKey(period), rows);
  }
  for (const rows of byBoundary.values()) {
    if (rows.length < 2) continue;
    const keeper = rows.slice().sort((left, right) => Number(!isSafeToRetirePayrollPeriod(left, context)) - Number(!isSafeToRetirePayrollPeriod(right, context)) || statusRank(right.status) - statusRank(left.status) || (left.createdAt || "").localeCompare(right.createdAt || "") || left.id.localeCompare(right.id))[0]!;
    for (const duplicate of rows) {
      if (duplicate.id === keeper.id || !isSafeToRetirePayrollPeriod(duplicate, context)) continue;
      retiredPeriodIds.push(duplicate.id);
      issues.push({ code: "DUPLICATE_PERIOD_BOUNDARY", message: "An empty duplicate payroll period can be retired safely.", periodIds: [keeper.id, duplicate.id], safeToRepair: true });
    }
  }
  const nextPeriods = periods.map((period) => {
    if (retiredPeriodIds.includes(period.id)) return { ...period, status: "VOID" as const, notes: [period.notes, "Retired during payroll integrity repair."].filter(Boolean).join(" ") };
    const withinHorizon = !options.horizonEnd || period.periodStart <= options.horizonEnd;
    const prospective = period.periodEnd >= options.referenceDate && withinHorizon;
    const obsolete = prospective && period.autoGenerated === true && !desiredBoundaries.has(boundaryKey(period));
    if (!obsolete || !isSafeToRetirePayrollPeriod(period, context)) return period;
    retiredPeriodIds.push(period.id);
    issues.push({ code: "STALE_AUTO_GENERATED_PERIOD", message: "An empty generated payroll period no longer matches the active schedule and can be retired safely.", periodIds: [period.id], safeToRepair: true });
    return { ...period, status: "VOID" as const, notes: [period.notes, "Retired during prospective payroll schedule reconciliation."].filter(Boolean).join(" ") };
  });
  return { periods: nextPeriods, retiredPeriodIds: unique(retiredPeriodIds), issues };
}

export function retireEmptyGeneratedPayrollRuns(runs: readonly PayrollRun[], retiredPeriodIds: readonly string[], entries: readonly PayrollEntry[] = []) {
  const retired = new Set(retiredPeriodIds);
  const entryRunIds = new Set(entries.map((entry) => entry.payrollRunId));
  return runs.map((run) => {
    if (!retired.has(run.periodId) || run.status !== "DRAFT" || entryRunIds.has(run.id)) return run;
    return { ...run, status: "VOID" as const, notes: [run.notes, "Retired with an empty obsolete generated payroll period."].filter(Boolean).join(" ") };
  });
}

export function inspectPayrollIntegrity(
  schedules: readonly PayrollSchedule[],
  periods: readonly PayrollPeriod[],
  runs: readonly PayrollRun[],
  entries: readonly PayrollEntry[] = [],
  allocations: readonly { id: string; payrollEntryId: string }[] = [],
  context: PayrollPeriodSourceContext = {},
): PayrollIntegrityReport {
  const activeSchedules = schedules.filter((schedule) => schedule.active);
  const duplicateBoundaries = findExactDuplicatePayrollPeriods(periods);
  const overlappingPeriods = findOverlappingPayrollPeriods(periods, true);
  const runsByPeriod = new Map<string, PayrollRun[]>();
  for (const run of runs) runsByPeriod.set(run.periodId, [...(runsByPeriod.get(run.periodId) || []), run]);
  const periodIds = new Set(periods.map((period) => period.id));
  const runIds = new Set(runs.map((run) => run.id));
  const entryIds = new Set(entries.map((entry) => entry.id));
  const { schedulesById, versionsById } = scheduleVersionMaps(schedules);
  const missingVersions = periods.filter((period) => period.scheduleId && period.scheduleVersionId && !versionsById.has(period.scheduleVersionId)).map((period) => period.id);
  const mismatchedVersions = periods.filter((period) => period.scheduleId && period.scheduleVersionId && versionsById.has(period.scheduleVersionId) && (versionsById.get(period.scheduleVersionId)?.scheduleId !== period.scheduleId || !schedulesById.has(period.scheduleId))).map((period) => period.id);
  const invalidShapes = periods.filter((period) => period.status !== "VOID" && period.scheduleId && period.scheduleVersionId && !validatePayrollPeriodAgainstSchedule(period, schedules).valid).map((period) => period.id);
  const orphanRuns = runs.filter((run) => !periodIds.has(run.periodId)).map((run) => run.id);
  const orphanEntries = entries.filter((entry) => !runIds.has(entry.payrollRunId)).map((entry) => entry.id);
  const orphanAllocations = allocations.filter((allocation) => !entryIds.has(allocation.payrollEntryId)).map((allocation) => allocation.id);
  const staleGeneratedPeriods = periods.filter((period) => period.autoGenerated && period.status !== "VOID" && !isPayrollPeriodDataBearing(period, context)).map((period) => period.id);
  const multipleRuns = [...runsByPeriod.entries()].filter(([, rows]) => rows.length > 1).map(([periodId]) => [periodId]);
  const duplicateEmptyRuns = [...runsByPeriod.entries()].filter(([, rows]) => rows.filter((run) => isSafeToRetirePayrollRun(run, context)).length > 1).map(([periodId]) => [periodId]);
  const issues: PayrollIntegrityIssue[] = [];
  if (activeSchedules.length > 1) issues.push({ code: "MULTIPLE_ACTIVE_SCHEDULES", message: "More than one active payroll schedule is configured.", scheduleIds: activeSchedules.map((schedule) => schedule.id), safeToRepair: false });
  for (const overlap of overlappingPeriods) issues.push({ code: "OVERLAPPING_OPEN_PERIODS", message: overlap.locked ? "Payroll periods overlap protected history and need manual review." : "Payroll periods overlap.", periodIds: overlap.periodIds, safeToRepair: !overlap.locked });
  for (const duplicate of duplicateBoundaries) issues.push({ code: "DUPLICATE_PERIOD_BOUNDARY", message: "Payroll periods share the same date boundary.", periodIds: duplicate, safeToRepair: duplicate.some((id) => { const period = periods.find((candidate) => candidate.id === id); return period ? isSafeToRetirePayrollPeriod(period, context) : false; }) });
  for (const periodIdsForRuns of multipleRuns) issues.push({ code: "MULTIPLE_RUNS_FOR_PERIOD", message: "A payroll period has more than one run.", periodIds: periodIdsForRuns });
  for (const periodIdsForRuns of duplicateEmptyRuns) issues.push({ code: "DUPLICATE_EMPTY_RUN", message: "A payroll period has duplicate empty draft runs that can be safely retired.", periodIds: periodIdsForRuns, safeToRepair: true });
  for (const periodId of orphanRuns) issues.push({ code: "ORPHAN_RUN", message: "A payroll run is not linked to a payroll period.", periodIds: [periodId], safeToRepair: false });
  for (const periodId of missingVersions) issues.push({ code: "PERIOD_VERSION_MISSING", message: "A payroll period references a missing schedule version and needs manual review.", periodIds: [periodId], safeToRepair: false });
  for (const periodId of mismatchedVersions) issues.push({ code: "SCHEDULE_VERSION_CONFLICT", message: "A payroll period is linked to the wrong schedule version and needs manual review.", periodIds: [periodId], safeToRepair: false });
  for (const periodId of invalidShapes) issues.push({ code: "PERIOD_SHAPE_INVALID", message: "A payroll period does not match the frequency of its own schedule version.", periodIds: [periodId], safeToRepair: false });
  for (const periodId of staleGeneratedPeriods) issues.push({ code: "STALE_AUTO_GENERATED_PERIOD", message: "An empty generated payroll period may be outdated after a schedule change.", periodIds: [periodId], safeToRepair: true });
  for (const entryId of orphanEntries) issues.push({ code: "ORPHAN_ENTRY", message: "A payroll entry is not linked to a payroll run.", periodIds: [entryId], safeToRepair: false });
  for (const allocationId of orphanAllocations) issues.push({ code: "ORPHAN_ALLOCATION", message: "A payroll allocation is not linked to a payroll entry.", periodIds: [allocationId], safeToRepair: false });
  return { activeScheduleCount: activeSchedules.length, overlappingPeriods, duplicateBoundaries, multipleRuns, duplicateEmptyRuns, orphanRuns, staleGeneratedPeriods, missingVersions, mismatchedVersions, invalidShapes, orphanEntries, orphanAllocations, issues };
}

function deterministicKeeper(rows: readonly PayrollPeriod[], context: PayrollPeriodSourceContext) {
  return rows.slice().sort((left, right) => Number(!isSafeToRetirePayrollPeriod(left, context)) - Number(!isSafeToRetirePayrollPeriod(right, context)) || statusRank(right.status) - statusRank(left.status) || (left.createdAt || "").localeCompare(right.createdAt || "") || left.id.localeCompare(right.id))[0]!;
}

function deterministicRunKeeper(rows: readonly PayrollRun[], context: PayrollPeriodSourceContext) {
  return rows.slice().sort((left, right) => Number(!isSafeToRetirePayrollRun(left, context)) - Number(!isSafeToRetirePayrollRun(right, context)) || statusRank(right.status) - statusRank(left.status) || (left.createdAt || "").localeCompare(right.createdAt || "") || left.id.localeCompare(right.id))[0]!;
}

export function planPayrollRepair(input: PayrollRepairInput): PayrollRepairPlan {
  const referenceDate = input.referenceDate || new Date().toISOString().slice(0, 10);
  const context: PayrollPeriodSourceContext = { runs: input.runs, entries: input.entries, workEntries: input.workEntries, importBatches: input.importBatches, adjustments: input.adjustments, referenceDate };
  const report = inspectPayrollIntegrity(input.schedules, input.periods, input.runs, input.entries || [], input.allocations || [], context);
  let periods = input.periods.slice();
  const retiredPeriodIds: string[] = [];
  const periodGroups = new Map<string, PayrollPeriod[]>();
  for (const period of periods.filter((candidate) => candidate.status !== "VOID")) periodGroups.set(dateBoundaryKey(period), [...(periodGroups.get(dateBoundaryKey(period)) || []), period]);
  for (const rows of periodGroups.values()) {
    if (rows.length < 2) continue;
    const keeper = deterministicKeeper(rows, context);
    for (const duplicate of rows) {
      if (duplicate.id === keeper.id || !isSafeToRetirePayrollPeriod(duplicate, context)) continue;
      retiredPeriodIds.push(duplicate.id);
    }
  }
  periods = periods.map((period) => retiredPeriodIds.includes(period.id) ? { ...period, status: "VOID" as const, notes: [period.notes, "Retired by payroll integrity repair."].filter(Boolean).join(" "), updatedAt: new Date().toISOString() } : period);

  const desiredPeriods = input.desiredPeriods || (() => {
    const primary = selectPrimaryPayrollSchedule(input.schedules);
    if (!primary || !primary.autoGeneratePeriods) return [];
    return generatePayrollPeriodsAroundReference(primary, referenceDate, { previous: 2, next: 2 }).map((period) => ({ id: `planned:${period.periodKey}`, periodStart: period.periodStart, periodEnd: period.periodEnd, payDate: period.payDate, scheduleId: period.scheduleId, scheduleVersionId: period.scheduleVersionId, autoGenerated: true, status: "DRAFT" as const, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }));
  })();
  if (desiredPeriods.length) {
    const horizonEnd = desiredPeriods.reduce((latest, period) => period.periodEnd > latest ? period.periodEnd : latest, referenceDate);
    const reconciliation = reconcileObsoleteGeneratedPayrollPeriods(periods, desiredPeriods, { ...context, referenceDate, horizonEnd });
    periods = reconciliation.periods;
    retiredPeriodIds.push(...reconciliation.retiredPeriodIds);
  }
  const retiredRuns = new Set<string>();
  const runsByPeriod = new Map<string, PayrollRun[]>();
  for (const run of input.runs) runsByPeriod.set(run.periodId, [...(runsByPeriod.get(run.periodId) || []), run]);
  for (const rows of runsByPeriod.values()) {
    if (rows.length < 2) continue;
    const keeper = deterministicRunKeeper(rows, context);
    for (const duplicate of rows) if (duplicate.id !== keeper.id && isSafeToRetirePayrollRun(duplicate, context)) retiredRuns.add(duplicate.id);
  }
  const retiredPeriodSet = new Set(retiredPeriodIds);
  for (const run of input.runs) if (retiredPeriodSet.has(run.periodId) && isSafeToRetirePayrollRun(run, context)) retiredRuns.add(run.id);
  const runs = input.runs.map((run) => retiredRuns.has(run.id) ? { ...run, status: "VOID" as const, notes: [run.notes, "Retired by payroll integrity repair."].filter(Boolean).join(" ") } : run);
  const protectedPeriodCount = periods.filter((period) => !isSafeToRetirePayrollPeriod(period, context)).length;
  const protectedRunCount = input.runs.filter((run) => !isSafeToRetirePayrollRun(run, context)).length;
  const messages = [
    `${retiredPeriodIds.length} ${retiredPeriodIds.length === 1 ? "empty period" : "empty periods"} can be retired safely.`,
    `${retiredRuns.size} ${retiredRuns.size === 1 ? "empty draft run" : "empty draft runs"} can be retired safely.`,
    `${protectedPeriodCount} ${protectedPeriodCount === 1 ? "period is" : "periods are"} protected because it is finalized, locked, or contains data.`,
    `${report.issues.filter((issue) => !issue.safeToRepair).length} ${report.issues.filter((issue) => !issue.safeToRepair).length === 1 ? "schedule conflict needs" : "schedule conflicts need"} manual review.`,
  ];
  return { report, periods, runs, retiredPeriodIds: unique(retiredPeriodIds), retiredRunIds: [...retiredRuns], protectedPeriodCount, protectedRunCount, messages };
}

export function applyPayrollRepairPlan(plan: PayrollRepairPlan) {
  return { periods: plan.periods, runs: plan.runs, retiredPeriodIds: plan.retiredPeriodIds, retiredRunIds: plan.retiredRunIds };
}

export function previewSafePayrollReset(input: PayrollRepairInput): PayrollResetPreview {
  const context: PayrollPeriodSourceContext = { runs: input.runs, entries: input.entries, workEntries: input.workEntries, importBatches: input.importBatches, adjustments: input.adjustments };
  const safeGeneratedPeriods = input.periods.filter((period) => isSafeToRetirePayrollPeriod(period, context)).length;
  const emptyDraftRuns = input.runs.filter((run) => isSafeToRetirePayrollRun(run, context)).length;
  const protectedPeriods = input.periods.length - safeGeneratedPeriods;
  const protectedRuns = input.runs.length - emptyDraftRuns;
  const finalizedPeriods = input.periods.filter((period) => ["APPROVED", "PAID", "VOID"].includes(period.status) || Boolean(period.lockedAt)).length;
  const dataBearingPeriods = input.periods.filter((period) => isPayrollPeriodDataBearing(period, context)).length;
  return { safeGeneratedPeriods, emptyDraftRuns, protectedPeriods, protectedRuns, finalizedPeriods, dataBearingPeriods, messages: [`${safeGeneratedPeriods} empty generated periods can be retired.`, `${emptyDraftRuns} empty draft runs can be retired.`, `${finalizedPeriods} finalized or locked periods are protected.`, `${dataBearingPeriods} data-bearing periods are protected.`] };
}

export function planSafePayrollReset(input: PayrollRepairInput) {
  const primary = selectPrimaryPayrollSchedule(input.schedules);
  const desiredPeriods = primary && primary.autoGeneratePeriods ? generatePayrollPeriodsAroundReference(primary, input.referenceDate || new Date().toISOString().slice(0, 10), { previous: 2, next: 2 }).map((period) => ({ id: `planned:${period.periodKey}`, periodStart: period.periodStart, periodEnd: period.periodEnd, payDate: period.payDate, scheduleId: period.scheduleId, scheduleVersionId: period.scheduleVersionId, autoGenerated: true, status: "DRAFT" as const, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() })) : [];
  return planPayrollRepair({ ...input, desiredPeriods });
}
