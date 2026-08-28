import React from "react";
import { CheckCircle2, Clock3, Map } from "lucide-react";
import { ENGORYX_FEATURE_REGISTRY } from "../features/registry.ts";
import {
  featureAvailability,
  featureAvailabilityLabel,
  featurePhaseLabel,
  type FeatureAvailability,
} from "../features/availability.ts";
import type { EngoryxFeatureDefinition } from "../features/types.ts";
import { SectionHeader, StatusBadge } from "./ui/OperationsUI";

function sortByPhaseAndName(features: readonly EngoryxFeatureDefinition[]) {
  return [...features].sort((left, right) => left.phase - right.phase || left.name.localeCompare(right.name));
}

function toneForAvailability(availability: FeatureAvailability): "success" | "warning" | "neutral" {
  if (availability === "AVAILABLE_NOW") return "success";
  if (availability === "COMING_SOON") return "warning";
  return "neutral";
}

const availableFeatures = sortByPhaseAndName(ENGORYX_FEATURE_REGISTRY.filter((feature) => feature.status === "ACTIVE"));
const upcomingFeatures = sortByPhaseAndName(ENGORYX_FEATURE_REGISTRY.filter((feature) => feature.status !== "ACTIVE"));

export const FeatureStatusOverview: React.FC = () => (
  <section aria-label="Product feature status" className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
    <div className="flex items-start gap-3">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700">
        <Map className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <SectionHeader
          title="Product feature status"
          description="Available features are implemented today. Planned work is clearly separated so unfinished roadmap items are never presented as completed functionality."
        />
      </div>
    </div>

    <div className="mt-5">
      <div className="flex items-center gap-2">
        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
        <h3 className="text-xs font-black text-slate-900">Available now</h3>
        <StatusBadge tone="success">{availableFeatures.length} features</StatusBadge>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {availableFeatures.map((feature) => (
          <div key={feature.id} className="rounded-xl border border-emerald-100 bg-emerald-50/40 p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs font-black text-slate-900">{feature.name}</p>
                <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">{featurePhaseLabel(feature)}</p>
              </div>
              <StatusBadge tone="success">Available</StatusBadge>
            </div>
          </div>
        ))}
      </div>
    </div>

    <div className="mt-6 border-t border-slate-100 pt-5">
      <div className="flex items-center gap-2">
        <Clock3 className="h-4 w-4 text-amber-600" />
        <h3 className="text-xs font-black text-slate-900">Planned development</h3>
      </div>
      <p className="mt-1 text-[11px] text-slate-500">These items are not active product features yet. Phase 2 and Phase 3 are planned next; later phases remain longer-term roadmap items.</p>

      <div className="mt-3 space-y-2">
        {upcomingFeatures.map((feature) => {
          const availability = featureAvailability(feature);
          return (
            <div key={feature.id} className="rounded-xl border border-slate-200 bg-slate-50/60 p-3 sm:p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-xs font-black text-slate-900">{feature.name}</p>
                    <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{featurePhaseLabel(feature)}</span>
                  </div>
                  <p className="mt-1.5 text-[11px] leading-5 text-slate-600">{feature.description}</p>
                </div>
                <StatusBadge tone={toneForAvailability(availability)}>{featureAvailabilityLabel(availability)}</StatusBadge>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  </section>
);
