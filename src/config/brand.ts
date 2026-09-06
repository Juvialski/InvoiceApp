/**
 * Authoritative runtime brand configuration for HydroQualiSense.
 * Centralizes product naming, descriptors, and metadata across the web workspace.
 */

export interface BrandConfig {
  readonly productName: string;
  readonly shortName: string;
  readonly companyName: string;
  readonly logoPath: string;
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
  logoPath: "/brand/hydroqualisense-logo.png",
  displayUppercase: "HYDROQUALISENSE",
  canonicalOrigin: "https://hydroqualisense.com",
  tagline: "HydroQualiSense Solutions Corp.",
  description: "HydroQualiSense company operations platform for projects, finance, workforce, documents, and field operations.",
  assistantName: "HydroQualiSense Assistant",
  browserTitle: "HydroQualiSense | Company Operations Platform",
  footerText: "HydroQualiSense • Company Operations • Original sources & audit history",
  companyContextLabel: "HydroQualiSense workspace",
});

/**
 * Format standard browser document title.
 * E.g., formatPageTitle("Projects") => "Projects | HydroQualiSense"
 * E.g., formatPageTitle() => "HydroQualiSense | Company Operations Platform"
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
