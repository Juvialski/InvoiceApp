import type { Project, ProjectCostSummary } from "../types.ts";
import { normalizeCurrency, roundMoney } from "./projectCosting.ts";

export type ProjectFinancialMetricStatus = "available" | "partial" | "unavailable";

export interface ProjectFinancialMetric {
  status: ProjectFinancialMetricStatus;
  currency?: string;
  amount?: number;
  foreignAmounts?: Record<string, number>;
  reason?: string;
}

export interface ProjectFinancialTruth {
  currency: string;
  contractValue: ProjectFinancialMetric;
  approvedCostBudget: ProjectFinancialMetric;
  actualCost: ProjectFinancialMetric;
  committedCost: ProjectFinancialMetric;
  remainingBudget: ProjectFinancialMetric;
  billed: ProjectFinancialMetric;
  collected: ProjectFinancialMetric;
  outstandingReceivables: ProjectFinancialMetric;
  pendingCostExposure: ProjectFinancialMetric;
  outstandingPayables: ProjectFinancialMetric;
}

function available(amount: number, currency: string): ProjectFinancialMetric {
  return { status: "available", amount: roundMoney(amount), currency };
}

function unavailable(reason: string): ProjectFinancialMetric {
  return { status: "unavailable", reason };
}

const COMMITMENT_REASON = "No authoritative approved-obligation source is implemented yet; supplier invoice payables are actual incurred cost, not commitments.";
const RECEIVABLE_REASON = "Current project invoice records are supplier/AP costs and do not provide an authoritative client billing or collection ledger.";

/**
 * Builds the P1A project financial truth view from existing authoritative
 * records. It deliberately withholds metrics whose source model is absent and
 * never converts foreign currency amounts.
 *
 * ProjectCostSummary currently aggregates unconverted foreign actual and
 * pending costs into one currency bucket. Until that lower-level costing model
 * preserves status provenance, this view must not assign those foreign amounts
 * to either actual cost, pending exposure, or supplier payables. Base-currency
 * amounts remain useful but are explicitly partial whenever an unclassified
 * foreign source exists.
 */
export function buildProjectFinancialTruth(
  project: Pick<Project, "projectBudget" | "contractValue" | "currency">,
  summary: Pick<ProjectCostSummary,
    | "totalActualCost"
    | "pendingInvoiceCost"
    | "pendingPayrollCost"
    | "pendingExpenseCost"
    | "unpaidInvoiceCost"
    | "foreignCosts"
  >,
): ProjectFinancialTruth {
  const currency = normalizeCurrency(project.currency);
  const hasForeignAmounts = Object.entries(summary.foreignCosts || {})
    .some(([, amount]) => roundMoney(amount) !== 0);
  const actualBase = roundMoney(summary.totalActualCost);
  const pendingBase = roundMoney(summary.pendingInvoiceCost + summary.pendingPayrollCost + summary.pendingExpenseCost);
  const payableBase = roundMoney(summary.unpaidInvoiceCost);
  const budget = roundMoney(project.projectBudget);

  const actualCost: ProjectFinancialMetric = hasForeignAmounts
    ? {
        status: "partial",
        amount: actualBase,
        currency,
        reason: `Unconverted foreign-currency cost sources are present, but the current costing summary does not preserve whether they are confirmed or pending. Actual cost therefore shows only the authoritative ${currency} amount.`,
      }
    : available(actualBase, currency);

  const pendingCostExposure: ProjectFinancialMetric = hasForeignAmounts
    ? {
        status: "partial",
        amount: pendingBase,
        currency,
        reason: `Unconverted foreign-currency cost sources are present, but the current costing summary does not preserve whether they are confirmed or pending. Pending exposure therefore shows only the authoritative ${currency} amount.`,
      }
    : available(pendingBase, currency);

  const outstandingPayables: ProjectFinancialMetric = hasForeignAmounts
    ? {
        status: "partial",
        amount: payableBase,
        currency,
        reason: `Unconverted foreign-currency cost sources are present, but the current costing summary does not preserve which foreign amounts are supplier invoice payables. Outstanding payables therefore shows only the authoritative ${currency} amount.`,
      }
    : available(payableBase, currency);

  return {
    currency,
    contractValue: Number.isFinite(Number(project.contractValue))
      ? available(Number(project.contractValue), currency)
      : unavailable("No contract value has been recorded for this project."),
    approvedCostBudget: available(budget, currency),
    actualCost,
    committedCost: unavailable(COMMITMENT_REASON),
    remainingBudget: hasForeignAmounts
      ? unavailable("Remaining budget cannot be stated as a complete aggregate while foreign-currency cost sources are unconverted and their confirmed/pending status is not preserved.")
      : available(budget - actualBase, currency),
    billed: unavailable(RECEIVABLE_REASON),
    collected: unavailable(RECEIVABLE_REASON),
    outstandingReceivables: unavailable(RECEIVABLE_REASON),
    pendingCostExposure,
    outstandingPayables,
  };
}
