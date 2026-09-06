import type { ProjectTaxTreatment } from "../types.ts";

export const PROJECT_TAX_TREATMENTS: readonly Exclude<ProjectTaxTreatment, "UNCLASSIFIED">[] = ["VAT", "NON_VAT"];

export function normalizeProjectTaxTreatment(value: unknown): ProjectTaxTreatment {
  const normalized = String(value || "").trim().toUpperCase();
  return normalized === "VAT" || normalized === "NON_VAT" ? normalized : "UNCLASSIFIED";
}

export function isClassifiedProjectTaxTreatment(value: unknown): value is Exclude<ProjectTaxTreatment, "UNCLASSIFIED"> {
  const normalized = normalizeProjectTaxTreatment(value);
  return normalized === "VAT" || normalized === "NON_VAT";
}

export function projectTaxTreatmentLabel(value: unknown) {
  const normalized = normalizeProjectTaxTreatment(value);
  return normalized === "VAT" ? "VAT" : normalized === "NON_VAT" ? "Non-VAT" : "Unclassified";
}
