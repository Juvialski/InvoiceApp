/**
 * Deterministic source identity helpers for payroll calculations.
 *
 * The helpers intentionally accept structural records.  This keeps the
 * calculation layer independent from persistence and allows callers to pass
 * either the local domain types or API-shaped records without a mapping step.
 */

export interface PayrollSourceRevisionInput {
  period?: unknown;
  workers?: readonly unknown[];
  worker?: readonly unknown[];
  attendance?: readonly unknown[];
  confirmedAttendance?: readonly unknown[];
  attendanceRecords?: readonly unknown[];
  leave?: readonly unknown[];
  leaves?: readonly unknown[];
  leaveRequests?: readonly unknown[];
  overtime?: readonly unknown[];
  overtimeRequests?: readonly unknown[];
  holidays?: readonly unknown[];
  payrollHolidays?: readonly unknown[];
  workEntries?: readonly unknown[];
  compensation?: readonly unknown[];
  compensationProfiles?: readonly unknown[];
  profiles?: readonly unknown[];
  assignments?: readonly unknown[];
  recurringComponents?: readonly unknown[];
  /** Project rows are reduced to payroll-relevant identity/status fields. */
  projects?: readonly unknown[];
  [key: string]: unknown;
}

export interface PayrollRunSourceMetadataLike {
  calculatedSourceRevision?: number;
  sourceRevision?: number;
  calculatedFingerprint?: string;
  sourceFingerprint?: string;
  calculationSnapshot?: Record<string, unknown>;
}

export interface PayrollPeriodSourceRevisionLike {
  sourceRevision?: number;
  periodRevision?: number;
  calculatedSourceRevision?: number;
}

export interface PayrollSourceRevisionValidationInput {
  run?: PayrollRunSourceMetadataLike | null;
  period?: PayrollPeriodSourceRevisionLike | null;
  sourceInput?: PayrollSourceRevisionInput;
  currentSources?: PayrollSourceRevisionInput;
  currentSourceFingerprint?: string;
  currentFingerprint?: string;
  currentSourceRevision?: number;
  periodSourceRevision?: number;
}

export interface PayrollSourceRevisionValidationResult {
  valid: boolean;
  stale: boolean;
  legacy: boolean;
  checkedRevision: boolean;
  checkedFingerprint: boolean;
  calculatedRevision?: number;
  currentRevision?: number;
  calculatedFingerprint?: string;
  currentFingerprint?: string;
  issues: string[];
}

type PlainRecord = Record<string, unknown>;

function isPlainRecord(value: unknown): value is PlainRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && !(value instanceof Date);
}

function canonicalValue(value: unknown, sortArrays: boolean): unknown {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'number') {
    if (Number.isNaN(value)) return 'NaN';
    if (value === Number.POSITIVE_INFINITY) return 'Infinity';
    if (value === Number.NEGATIVE_INFINITY) return '-Infinity';
    if (Object.is(value, -0)) return 0;
    return value;
  }
  if (typeof value === 'bigint') return `${value.toString()}n`;
  if (typeof value === 'function' || typeof value === 'symbol' || value === undefined) return undefined;
  if (Array.isArray(value)) {
    const items = value.map((item) => canonicalValue(item, sortArrays)).filter((item) => item !== undefined);
    return sortArrays ? items.sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right))) : items;
  }
  if (isPlainRecord(value)) {
    const result: PlainRecord = {};
    for (const key of Object.keys(value).sort()) {
      const item = canonicalValue(value[key], sortArrays);
      if (item !== undefined) result[key] = item;
    }
    return result;
  }
  return String(value);
}

/** Return stable JSON with object keys and source record arrays normalized. */
export function canonicalizePayrollSources(input: unknown): string {
  return JSON.stringify(canonicalValue(input, true));
}

function uniqueSourceArrays(input: PayrollSourceRevisionInput, keys: string[]): unknown[] {
  const seen = new Set<string>();
  const result: unknown[] = [];
  for (const key of keys) {
    const records = input[key];
    if (!Array.isArray(records)) continue;
    for (const record of records) {
      const identity = canonicalizePayrollSources(record);
      if (seen.has(identity)) continue;
      seen.add(identity);
      result.push(record);
    }
  }
  return result;
}

function projectIdFromSource(value: unknown): string | undefined {
  if (!isPlainRecord(value)) return undefined;
  const candidate = value.projectId ?? value.project_id ?? value.defaultProjectId ?? value.default_project_id ?? value.id;
  return typeof candidate === "string" && candidate.trim() ? candidate : undefined;
}

function relevantProjectSources(input: PayrollSourceRevisionInput): unknown[] {
  const referencedIds = new Set<string>();
  for (const key of ["workEntries", "assignments", "overtime", "overtimeRequests", "compensation", "compensationProfiles", "profiles", "recurringComponents"]) {
    const values = input[key];
    if (!Array.isArray(values)) continue;
    for (const value of values) {
      const id = projectIdFromSource(value);
      if (id) referencedIds.add(id);
    }
  }
  if (!Array.isArray(input.projects) || referencedIds.size === 0) return [];
  return input.projects
    .filter((project) => {
      const id = projectIdFromSource(project);
      return Boolean(id && referencedIds.has(id));
    })
    .map((project) => {
      if (!isPlainRecord(project)) return project;
      return {
        id: project.id ?? project.projectId ?? project.project_id,
        status: project.status ?? null,
        archivedAt: project.archivedAt ?? project.archived_at ?? null,
      };
    });
}

/**
 * Select only the payroll source families that can change a calculated run.
 * Array order is intentionally ignored, while each record's fields are
 * retained so edits to rates, approvals, dates, or quantities change the
 * resulting fingerprint.
 */
export function normalizePayrollSourceInput(input: PayrollSourceRevisionInput): PlainRecord {
  return {
    period: input.period,
    workers: uniqueSourceArrays(input, ['workers', 'worker']),
    attendance: uniqueSourceArrays(input, ['confirmedAttendance', 'attendanceRecords', 'attendance']),
    leave: uniqueSourceArrays(input, ['leaveRequests', 'leaves', 'leave']),
    overtime: uniqueSourceArrays(input, ['overtimeRequests', 'overtime']),
    holidays: uniqueSourceArrays(input, ['payrollHolidays', 'holidays']),
    workEntries: uniqueSourceArrays(input, ['workEntries']),
    compensation: uniqueSourceArrays(input, ['compensationProfiles', 'profiles', 'compensation', 'assignments', 'recurringComponents']),
    projects: relevantProjectSources(input),
  };
}

function fnv1a64(value: string): string {
  const mask = 0xffffffffffffffffn;
  let hash = 0xcbf29ce484222325n;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= BigInt(value.charCodeAt(index));
    hash = (hash * 0x100000001b3n) & mask;
  }
  return hash.toString(16).padStart(16, '0');
}

/** Create a stable, local, runtime-independent fingerprint for payroll inputs. */
export function fingerprintPayrollSources(input: PayrollSourceRevisionInput): string {
  return `payroll-source-v1:${fnv1a64(canonicalizePayrollSources(normalizePayrollSourceInput(input)))}`;
}

export const calculatePayrollSourceFingerprint = fingerprintPayrollSources;
export const computePayrollSourceFingerprint = fingerprintPayrollSources;
export const createPayrollSourceFingerprint = fingerprintPayrollSources;
export const getPayrollSourceFingerprint = fingerprintPayrollSources;

export function payrollSourceMetadata(input: PayrollSourceRevisionInput, sourceRevision?: number) {
  return {
    ...(Number.isFinite(sourceRevision) ? { sourceRevision } : {}),
    sourceFingerprint: fingerprintPayrollSources(input),
  };
}

export const calculatePayrollSourceMetadata = payrollSourceMetadata;

function finiteRevision(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function metadataFromSnapshot(run: PayrollRunSourceMetadataLike | null | undefined): PayrollRunSourceMetadataLike {
  const snapshot = run?.calculationSnapshot;
  if (!snapshot) return run ?? {};
  return {
    ...run,
    sourceFingerprint: run?.sourceFingerprint ?? (typeof snapshot.sourceFingerprint === 'string' ? snapshot.sourceFingerprint : undefined),
    calculatedFingerprint: run?.calculatedFingerprint ?? (typeof snapshot.calculatedFingerprint === 'string' ? snapshot.calculatedFingerprint : undefined),
    calculatedSourceRevision: run?.calculatedSourceRevision ?? (finiteRevision(snapshot.calculatedSourceRevision) ?? finiteRevision(snapshot.sourceRevision)),
  };
}

function validateSourceRevision(input: PayrollSourceRevisionValidationInput): PayrollSourceRevisionValidationResult {
  const run = metadataFromSnapshot(input.run);
  const currentInput = input.sourceInput ?? input.currentSources;
  const calculatedRevision = finiteRevision(run.calculatedSourceRevision ?? run.sourceRevision);
  const currentRevision = finiteRevision(
    input.currentSourceRevision ?? input.periodSourceRevision ?? input.period?.sourceRevision ?? input.period?.periodRevision,
  );
  const calculatedFingerprint = run.sourceFingerprint ?? run.calculatedFingerprint;
  const currentFingerprint = input.currentSourceFingerprint ?? input.currentFingerprint ?? (currentInput ? fingerprintPayrollSources(currentInput) : undefined);
  const checkedRevision = calculatedRevision !== undefined && currentRevision !== undefined;
  const checkedFingerprint = calculatedFingerprint !== undefined && currentFingerprint !== undefined;
  const legacy = calculatedRevision === undefined && calculatedFingerprint === undefined;
  const issues: string[] = [];

  if (checkedRevision && calculatedRevision !== currentRevision) {
    issues.push(`Payroll source revision is stale: calculated ${calculatedRevision}, current ${currentRevision}.`);
  }
  if (checkedFingerprint && calculatedFingerprint !== currentFingerprint) {
    issues.push('Payroll source fingerprint is stale: calculated inputs differ from the current period sources.');
  }

  const stale = issues.length > 0;
  return {
    valid: !stale,
    stale,
    legacy,
    checkedRevision,
    checkedFingerprint,
    ...(calculatedRevision !== undefined ? { calculatedRevision } : {}),
    ...(currentRevision !== undefined ? { currentRevision } : {}),
    ...(calculatedFingerprint !== undefined ? { calculatedFingerprint } : {}),
    ...(currentFingerprint !== undefined ? { currentFingerprint } : {}),
    issues,
  };
}

/**
 * Validate a calculated run against the current period/source state. Runs that
 * predate source metadata remain valid and are explicitly marked as legacy.
 */
export function validatePayrollRunSourceRevision(input: PayrollSourceRevisionValidationInput): PayrollSourceRevisionValidationResult;
export function validatePayrollRunSourceRevision(
  run: PayrollRunSourceMetadataLike,
  period?: PayrollPeriodSourceRevisionLike,
  sourceInput?: PayrollSourceRevisionInput,
): PayrollSourceRevisionValidationResult;
export function validatePayrollRunSourceRevision(
  inputOrRun: PayrollSourceRevisionValidationInput | PayrollRunSourceMetadataLike,
  period?: PayrollPeriodSourceRevisionLike,
  sourceInput?: PayrollSourceRevisionInput,
): PayrollSourceRevisionValidationResult {
  if ('run' in inputOrRun || 'sourceInput' in inputOrRun || 'currentSources' in inputOrRun || 'currentSourceFingerprint' in inputOrRun || 'currentSourceRevision' in inputOrRun) {
    return validateSourceRevision(inputOrRun as PayrollSourceRevisionValidationInput);
  }
  return validateSourceRevision({ run: inputOrRun as PayrollRunSourceMetadataLike, period, sourceInput });
}

export const validatePayrollSourceRevision = validatePayrollRunSourceRevision;
export const validatePayrollRunFreshness = validatePayrollRunSourceRevision;

export function isPayrollRunSourceCurrent(
  input: PayrollSourceRevisionValidationInput,
): boolean {
  return validateSourceRevision(input).valid;
}

export function isPayrollRunStale(input: PayrollSourceRevisionValidationInput): boolean {
  return validateSourceRevision(input).stale;
}

export function getPayrollSourceRevision(input: PayrollSourceRevisionInput | PayrollPeriodSourceRevisionLike): number | undefined {
  const candidate = input as PayrollPeriodSourceRevisionLike;
  return finiteRevision(candidate.sourceRevision ?? candidate.periodRevision ?? candidate.calculatedSourceRevision);
}
