import React from "react";
import { AlertTriangle, WalletCards } from "lucide-react";
import { Card } from "@astryxdesign/core/Card";
import type { Project, ProjectCostSummary } from "../../types.ts";
import {
  buildProjectFinancialTruth,
  type ProjectFinancialMetric,
} from "../../utils/projectFinancialSummary.ts";
import { calculateClientBillingSummary, type ClientBilling } from "../../lib/clientBilling.ts";
import { calculateClientCollectionSummary, type ClientCollection } from "../../lib/clientCollections.ts";

function money(value: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-PH", { style: "currency", currency, maximumFractionDigits: 2 }).format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
}

function metricValue(metric: ProjectFinancialMetric, fallbackCurrency: string) {
  if (metric.status === "unavailable" || metric.amount === undefined) return "Unavailable";
  return money(metric.amount, metric.currency || fallbackCurrency);
}

function MetricCard({ label, metric, currency }: { label: string; metric: ProjectFinancialMetric; currency: string }) {
  const foreign = Object.entries(metric.foreignAmounts || {});
  return (
    <Card className="min-w-0 p-4 shadow-sm" elevation="low">
      <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
        <WalletCards className="h-4 w-4" aria-hidden="true" />
      </div>
      <p className="mt-3 break-words text-sm font-black tabular-nums text-slate-950">{metricValue(metric, currency)}</p>
      <p className="mt-1 text-[10px] font-semibold text-slate-500">{label}</p>
      {metric.status === "partial" && <p className="mt-2 text-[10px] font-bold text-amber-700">Partial aggregate</p>}
      {foreign.length > 0 && <p className="mt-1 text-[10px] leading-4 text-slate-500">Also separate: {foreign.map(([code, amount]) => `${code} ${Number(amount).toFixed(2)}`).join(" • ")}</p>}
      {metric.reason && <p className="mt-2 text-[10px] leading-4 text-slate-500">{metric.reason}</p>}
    </Card>
  );
}

export function ProjectFinancialSummaryPanel({
  project,
  summary,
  clientBillings,
  clientCollections,
}: {
  project: Pick<Project, "id" | "projectBudget" | "contractValue" | "currency">;
  summary: ProjectCostSummary;
  clientBillings?: readonly ClientBilling[];
  clientCollections?: readonly ClientCollection[];
}) {
  const billingSummary = clientBillings === undefined
    ? undefined
    : calculateClientBillingSummary(project, clientBillings);
  const collectionSummary = clientBillings === undefined || clientCollections === undefined
    ? undefined
    : calculateClientCollectionSummary(project, clientBillings, clientCollections);
  const truth = buildProjectFinancialTruth(project, summary, billingSummary, collectionSummary);
  const primary: Array<[string, ProjectFinancialMetric]> = [
    ["Contract Value", truth.contractValue],
    ["Approved Cost Budget", truth.approvedCostBudget],
    ["Actual Cost", truth.actualCost],
    ["Committed Cost", truth.committedCost],
    ["Remaining Budget", truth.remainingBudget],
    ["Billed to Date", truth.billed],
    ["Remaining to Bill", truth.remainingToBill],
    ["Collected to Date", truth.collected],
    ["Outstanding Billed Amount", truth.outstandingReceivables],
  ];

  return (
    <section aria-labelledby="project-financial-summary-heading" className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 id="project-financial-summary-heading" className="text-sm font-black text-slate-950">Project financial summary</h3>
          <p className="mt-1 text-[10px] leading-4 text-slate-500">Authoritative values are kept semantically separate. Unsupported or mixed-currency aggregates are withheld rather than estimated.</p>
        </div>
        {truth.actualCost.status === "partial" && <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-bold text-amber-800"><AlertTriangle className="h-3 w-3" aria-hidden="true" />Mixed currencies</span>}
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {primary.map(([label, metric]) => <MetricCard key={label} label={label} metric={metric} currency={truth.currency} />)}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <MetricCard label="Pending / Unconfirmed Cost Exposure" metric={truth.pendingCostExposure} currency={truth.currency} />
        <MetricCard label="Outstanding Supplier Payables" metric={truth.outstandingPayables} currency={truth.currency} />
      </div>
    </section>
  );
}
