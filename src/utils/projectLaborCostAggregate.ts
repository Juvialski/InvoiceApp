export const PROJECT_LABOR_AGGREGATE_RPC = "get_project_labor_cost_aggregate" as const;

export type ProjectLaborAggregateStatus = "AVAILABLE" | "ZERO" | "CURRENCY_CONFLICT";
export type ProjectLaborSource = "detail" | "aggregate" | "unavailable" | "incomplete" | "currency-conflict";

export interface ProjectLaborCostAggregate {
  projectId: string;
  currency: string;
  confirmedLaborCost: number;
  pendingLaborCost: number;
  status: ProjectLaborAggregateStatus;
}

export class ProjectLaborAggregateDataError extends Error {
  readonly kind: "incomplete" | "currency-conflict";

  constructor(kind: "incomplete" | "currency-conflict", message: string) {
    super(message);
    this.name = "ProjectLaborAggregateDataError";
    this.kind = kind;
  }
}

function numericValue(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed * 100) / 100 : null;
}

function currencyValue(value: unknown) {
  const normalized = typeof value === "string" ? value.trim().toUpperCase() : "";
  return /^[A-Z]{3}$/.test(normalized) ? normalized : null;
}

function statusValue(value: unknown): ProjectLaborAggregateStatus | null {
  return value === "AVAILABLE" || value === "ZERO" || value === "CURRENCY_CONFLICT" ? value : null;
}

export function projectLaborAggregateFromRow(value: unknown): ProjectLaborCostAggregate | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const projectId = typeof row.project_id === "string" ? row.project_id.trim() : "";
  const currency = currencyValue(row.currency);
  const confirmedLaborCost = numericValue(row.confirmed_labor_cost);
  const pendingLaborCost = numericValue(row.pending_labor_cost);
  const status = statusValue(row.aggregate_status);
  if (!projectId || !currency || confirmedLaborCost === null || pendingLaborCost === null || !status) return null;
  if (status === "ZERO" && (confirmedLaborCost !== 0 || pendingLaborCost !== 0)) return null;
  return { projectId, currency, confirmedLaborCost, pendingLaborCost, status };
}

/**
 * Converts the narrow RPC response into a complete project index. A missing
 * requested row is an incomplete source, never an implicit zero.
 */
export function parseProjectLaborCostAggregates(
  rows: readonly unknown[],
  requestedProjectIds: readonly string[],
): ProjectLaborCostAggregate[] {
  const requested = [...new Set(requestedProjectIds.map((id) => String(id).trim()).filter(Boolean))];
  const parsed = rows.map(projectLaborAggregateFromRow);
  if (parsed.some((row) => !row)) {
    throw new ProjectLaborAggregateDataError("incomplete", "The project labor aggregate returned an invalid row.");
  }
  const aggregates = parsed as ProjectLaborCostAggregate[];
  const byProject = new Map<string, ProjectLaborCostAggregate>();
  for (const aggregate of aggregates) {
    const previous = byProject.get(aggregate.projectId);
    if (previous && previous.currency !== aggregate.currency) {
      throw new ProjectLaborAggregateDataError("currency-conflict", "Project labor aggregate returned multiple currencies for one project.");
    }
    if (previous) throw new ProjectLaborAggregateDataError("incomplete", "The project labor aggregate returned duplicate project rows.");
    byProject.set(aggregate.projectId, aggregate);
  }
  if (byProject.size !== requested.length || requested.some((projectId) => !byProject.has(projectId))) {
    throw new ProjectLaborAggregateDataError("incomplete", "The project labor aggregate did not cover every requested project.");
  }
  return requested.map((projectId) => byProject.get(projectId)!);
}

export function projectLaborAggregateCurrencyConflicts(
  projects: readonly { id: string; currency: string }[],
  aggregates: readonly ProjectLaborCostAggregate[],
) {
  const projectCurrencies = new Map(projects.map((project) => [project.id, String(project.currency || "").trim().toUpperCase()]));
  return aggregates
    .filter((aggregate) => (aggregate.confirmedLaborCost > 0 || aggregate.pendingLaborCost > 0)
      && projectCurrencies.get(aggregate.projectId)
      && projectCurrencies.get(aggregate.projectId) !== aggregate.currency)
    .map((aggregate) => aggregate.projectId);
}
