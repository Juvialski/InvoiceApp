import { hasPermission, PERMISSION_KEYS, type PermissionKey } from "./accessControl.ts";

export const PROJECT_COST_SOURCE_REQUIREMENTS = Object.freeze({
  supplierInvoices: PERMISSION_KEYS.invoicesRead,
  payrollLabor: PERMISSION_KEYS.payrollSensitiveRead,
  directExpenses: PERMISSION_KEYS.expensesRead,
} as const);

export type ProjectCostSource = keyof typeof PROJECT_COST_SOURCE_REQUIREMENTS;
export type DataCompletenessReason = "permission" | "load-error" | "not-loaded";

export interface DataCompleteness<Source extends string = string> {
  readonly complete: boolean;
  readonly status: "complete" | "incomplete";
  readonly requiredSources: readonly Source[];
  readonly visibleSources: readonly Source[];
  readonly missingSources: readonly Source[];
  readonly reason?: DataCompletenessReason;
}

export const PROJECT_COST_SOURCE_LABELS: Readonly<Record<ProjectCostSource, string>> = Object.freeze({
  supplierInvoices: "supplier invoices",
  payrollLabor: "payroll detail",
  directExpenses: "direct expenses",
});

export function permissionDataCompleteness<Source extends string>(
  sourceRequirements: Readonly<Record<Source, PermissionKey>>,
  permissions: Iterable<PermissionKey> | null | undefined,
): DataCompleteness<Source> {
  const requiredSources = Object.keys(sourceRequirements) as Source[];
  const visibleSources = requiredSources.filter((source) => hasPermission(permissions, sourceRequirements[source]));
  const missingSources = requiredSources.filter((source) => !visibleSources.includes(source));
  const complete = missingSources.length === 0;
  return Object.freeze({
    complete,
    status: complete ? "complete" : "incomplete",
    requiredSources: Object.freeze([...requiredSources]),
    visibleSources: Object.freeze([...visibleSources]),
    missingSources: Object.freeze([...missingSources]),
    ...(complete ? {} : { reason: "permission" as const }),
  });
}

export function projectCostDataCompleteness(
  permissions: Iterable<PermissionKey> | null | undefined,
): DataCompleteness<ProjectCostSource> {
  return permissionDataCompleteness(PROJECT_COST_SOURCE_REQUIREMENTS, permissions);
}

export function projectCostMissingSourceLabels(completeness: DataCompleteness<ProjectCostSource>): string[] {
  return completeness.missingSources.map((source) => PROJECT_COST_SOURCE_LABELS[source]);
}
