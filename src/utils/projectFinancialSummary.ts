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
  const foreignAmounts = Object.fromEntries(
    Object.entries(summary.foreignCosts || {})
      .map(([code, amount]) => [normalizeCurrency(code), roundMoney(amount)] as const)
      .filter(([, amount]) => amount !== 0),
  );
  const hasForeignAmounts = Object.keys(foreignAmounts).length > 0;
  const actualBase = roundMoney(summary.totalActualCost);
  const pendingBase = roundMoney(summary.pendingInvoiceCost + summary.pendingPayrollCost + summary.pendingExpenseCost);
  const budget = roundMoney(project.projectBudget);

  const actualCost: ProjectFinancialMetric = hasForeignAmounts
    ? {
        status: "partial",
        amount: actualBase,
        currency,
        foreignAmounts,
        reason: `Actual-cost sources include amounts outside ${currency}. They remain separate because Engoryx has no authoritative FX conversion model.`,
      }
    : available(actualBase, currency);

  const pendingCostExposure: ProjectFinancialMetric = hasForeignAmounts
    ? {
        status: "partial",
        amount: pendingBase,
        currency,
        foreignAmounts,
        reason: `Unconverted foreign-currency source amounts are present. Pending exposure is shown only for ${currency}.`,
      }
    : available(pendingBase, currency);

  return {
    currency,
    contractValue: Number.isFinite(Number(project.contractValue))
      ? available(Number(project.contractValue), currency)
      : unavailable("No contract value has been recorded for this project."),
    approvedCostBudget: available(budget, currency),
    actualCost,
    committedCost: unavailable(COMMITMENT_REASON),
    remainingBudget: hasForeignAmounts
      ? unavailable("Remaining budget cannot be stated as a complete aggregate while foreign-currency cost sources are unconverted.")
      : available(budget - actualBase, currency),
    billed: unavailable(RECEIVABLE_REASON),
    collected: unavailable(RECEIVABLE_REASON),
    outstandingReceivables: unavailable(RECEIVABLE_REASON),
    pendingCostExposure,
    outstandingPayables: available(summary.unpaidInvoiceCost, currency),
  };
}
