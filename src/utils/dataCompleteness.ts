import { hasPermission, PERMISSION_KEYS, type PermissionKey } from "./accessControl.ts";

export const PROJECT_COST_SOURCE_REQUIREMENTS = Object.freeze({
  supplierInvoices: PERMISSION_KEYS.invoicesRead,
  payrollLabor: PERMISSION_KEYS.payrollSensitiveRead,
  directExpenses: PERMISSION_KEYS.expensesRead,
} as const);

export type ProjectCostSource = keyof typeof PROJECT_COST_SOURCE_REQUIREMENTS;
export type DataSourceState = "detail" | "aggregate" | "unavailable" | "incomplete" | "currency-conflict";
export type DataCompletenessReason = "permission" | "load-error" | "not-loaded" | "incomplete" | "currency-conflict";

export interface DataCompleteness<Source extends string = string> {
  readonly complete: boolean;
  readonly status: "complete" | "incomplete";
  readonly requiredSources: readonly Source[];
  readonly visibleSources: readonly Source[];
  readonly missingSources: readonly Source[];
  readonly sourceStates: Readonly<Record<Source, DataSourceState>>;
  readonly reason?: DataCompletenessReason;
}

export const PROJECT_COST_SOURCE_LABELS: Readonly<Record<ProjectCostSource, string>> = Object.freeze({
  supplierInvoices: "supplier invoices",
  payrollLabor: "project labor data",
  directExpenses: "direct expenses",
});

export function permissionDataCompleteness<Source extends string>(
  sourceRequirements: Readonly<Record<Source, PermissionKey>>,
  permissions: Iterable<PermissionKey> | null | undefined,
): DataCompleteness<Source> {
  const requiredSources = Object.keys(sourceRequirements) as Source[];
  const sourceStates = Object.fromEntries(requiredSources.map((source) => [source, hasPermission(permissions, sourceRequirements[source]) ? "detail" : "unavailable"])) as Record<Source, DataSourceState>;
  const visibleSources = requiredSources.filter((source) => sourceStates[source] === "detail" || sourceStates[source] === "aggregate");
  const missingSources = requiredSources.filter((source) => !visibleSources.includes(source));
  const complete = missingSources.length === 0;
  return Object.freeze({
    complete,
    status: complete ? "complete" : "incomplete",
    requiredSources: Object.freeze([...requiredSources]),
    visibleSources: Object.freeze([...visibleSources]),
    missingSources: Object.freeze([...missingSources]),
    sourceStates: Object.freeze(sourceStates),
    ...(complete ? {} : { reason: "permission" as const }),
  });
}

export interface ProjectCostDataCompletenessOptions {
  sourceStates?: Partial<Readonly<Record<ProjectCostSource, DataSourceState>>>;
}

export function projectCostDataCompleteness(
  permissions: Iterable<PermissionKey> | null | undefined,
  options: ProjectCostDataCompletenessOptions = {},
): DataCompleteness<ProjectCostSource> {
  const sourceStates = {
    supplierInvoices: hasPermission(permissions, PROJECT_COST_SOURCE_REQUIREMENTS.supplierInvoices) ? "detail" : "unavailable",
    payrollLabor: hasPermission(permissions, PERMISSION_KEYS.payrollSensitiveRead)
      ? "detail"
      : hasPermission(permissions, PERMISSION_KEYS.payrollAggregateRead)
        ? "unavailable"
        : "unavailable",
    directExpenses: hasPermission(permissions, PROJECT_COST_SOURCE_REQUIREMENTS.directExpenses) ? "detail" : "unavailable",
    ...options.sourceStates,
  } satisfies Record<ProjectCostSource, DataSourceState>;
  const requiredSources = Object.keys(PROJECT_COST_SOURCE_REQUIREMENTS) as ProjectCostSource[];
  const visibleSources = requiredSources.filter((source) => sourceStates[source] === "detail" || sourceStates[source] === "aggregate");
  const missingSources = requiredSources.filter((source) => !visibleSources.includes(source));
  const complete = missingSources.length === 0;
  const missingStates = missingSources.map((source) => sourceStates[source]);
  const permissionAvailable = (source: ProjectCostSource) => source === "payrollLabor"
    ? hasPermission(permissions, PERMISSION_KEYS.payrollSensitiveRead) || hasPermission(permissions, PERMISSION_KEYS.payrollAggregateRead)
    : hasPermission(permissions, PROJECT_COST_SOURCE_REQUIREMENTS[source]);
  const reason = missingStates.includes("currency-conflict")
    ? "currency-conflict"
    : missingStates.includes("incomplete")
      ? "incomplete"
      : missingStates.includes("unavailable") && missingSources.some(permissionAvailable)
        ? "load-error"
        : missingStates.includes("unavailable")
          ? "permission"
          : undefined;
  return Object.freeze({
    complete,
    status: complete ? "complete" : "incomplete",
    requiredSources: Object.freeze([...requiredSources]),
    visibleSources: Object.freeze([...visibleSources]),
    missingSources: Object.freeze([...missingSources]),
    sourceStates: Object.freeze({ ...sourceStates }),
    ...(reason ? { reason } : {}),
  });
}

export function projectCostMissingSourceLabels(completeness: DataCompleteness<ProjectCostSource>): string[] {
  return completeness.missingSources.map((source) => {
    const label = PROJECT_COST_SOURCE_LABELS[source];
    const state = completeness.sourceStates[source];
    if (state === "currency-conflict") return `${label} in a non-combinable currency`;
    if (state === "incomplete") return `${label} incomplete`;
    if (state === "unavailable") return `${label} unavailable`;
    return label;
  });
}
