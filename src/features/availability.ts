import type { EngoryxFeatureDefinition, FeatureStatus } from "./types.ts";

export type FeatureAvailability = "AVAILABLE_NOW" | "COMING_SOON" | "FUTURE_ROADMAP";

export function featureAvailabilityForStatus(status: FeatureStatus): FeatureAvailability {
  if (status === "ACTIVE") return "AVAILABLE_NOW";
  if (status === "PLANNED") return "COMING_SOON";
  return "FUTURE_ROADMAP";
}

export function featureAvailability(feature: Pick<EngoryxFeatureDefinition, "status">): FeatureAvailability {
  return featureAvailabilityForStatus(feature.status);
}

export function featureAvailabilityLabel(availability: FeatureAvailability): string {
  if (availability === "AVAILABLE_NOW") return "Available now";
  if (availability === "COMING_SOON") return "Coming soon";
  return "Future roadmap";
}

export function featurePhaseLabel(feature: Pick<EngoryxFeatureDefinition, "phase">): string {
  return feature.phase === 0 ? "Core" : `Phase ${feature.phase}`;
}
