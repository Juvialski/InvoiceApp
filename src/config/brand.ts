/**
 * Authoritative runtime brand configuration for HydroQualiSense.
 * Centralizes product naming, descriptors, and metadata across the web workspace.
 */

export interface BrandConfig {
  readonly productName: string;
  readonly shortName: string;
  readonly companyName: string;
  readonly displayUppercase: string;
  readonly canonicalOrigin: string;
  readonly tagline: string;
  readonly description: string;
  readonly assistantName: string;
  readonly browserTitle: string;
  readonly footerText: string;
  readonly companyContextLabel: string;
}

export const BRAND: BrandConfig = Object.freeze({
  productName: "HydroQualiSense",
  shortName: "HydroQualiSense",
  companyName: "HydroQualiSense Solutions Corp.",
  displayUppercase: "HYDROQUALISENSE",
  canonicalOrigin: "https://hydroqualisense.com",
  tagline: "Engineering Operations",
  description: "Engineering operations platform for projects, finance, workforce, documents, and field operations.",
  assistantName: "HydroQualiSense Assistant",
  browserTitle: "HydroQualiSense | Engineering Operations",
  footerText: "HydroQualiSense • Engineering Operations • Original sources & audit history",
  companyContextLabel: "Engineering operations workspace",
});

/**
 * Format standard browser document title.
 * E.g., formatPageTitle("Projects") => "Projects | HydroQualiSense"
 * E.g., formatPageTitle() => "HydroQualiSense | Engineering Operations"
 */
export function formatPageTitle(pageName?: string | null): string {
  if (!pageName || pageName.trim() === "") {
    return BRAND.browserTitle;
  }
  return `${pageName.trim()} | ${BRAND.productName}`;
}

/**
 * Format breadcrumb prefix for the application header.
 */
export function formatBreadcrumb(routeContext?: string | null): string {
  if (!routeContext || routeContext.trim() === "") {
    return BRAND.productName;
  }
  return `${BRAND.productName} / ${routeContext.trim()}`;
}
