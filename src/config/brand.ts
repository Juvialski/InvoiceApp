/**
 * Authoritative runtime brand configuration for Hydroqualisense.
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
  productName: "Hydroqualisense",
  shortName: "Hydroqualisense",
  companyName: "Hydroqualisense",
  logoPath: "/brand/hydroqualisense-logo.png",
  displayUppercase: "Hydroqualisense",
  canonicalOrigin: "https://hydroqualisense.com",
  tagline: "Hydroqualisense",
  description: "Hydroqualisense workspace for projects, finance, workforce, documents, and field operations.",
  assistantName: "Hydroqualisense Assistant",
  browserTitle: "Hydroqualisense | Hydroqualisense",
  footerText: "Hydroqualisense • Original sources & audit history",
  companyContextLabel: "Hydroqualisense workspace",
});

/**
 * Format standard browser document title.
 * E.g., formatPageTitle("Projects") => "Projects | Hydroqualisense"
 * E.g., formatPageTitle() => "Hydroqualisense | Hydroqualisense"
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
