/**
 * Authoritative runtime brand configuration for Engoryx.
 * Centralizes product naming, descriptors, and metadata across the web workspace.
 */

export interface BrandConfig {
  readonly productName: string;
  readonly shortName: string;
  readonly displayUppercase: string;
  readonly tagline: string;
  readonly description: string;
  readonly assistantName: string;
  readonly browserTitle: string;
  readonly footerText: string;
  readonly companyContextLabel: string;
}

export const BRAND: BrandConfig = Object.freeze({
  productName: "Engoryx",
  shortName: "Engoryx",
  displayUppercase: "ENGORYX",
  tagline: "Engineering Operations",
  description: "Engineering operations platform for projects, finance, workforce, documents, and field operations.",
  assistantName: "Engoryx Assistant",
  browserTitle: "Engoryx | Engineering Operations",
  footerText: "Engoryx • Engineering Operations • Original sources & audit history",
  companyContextLabel: "Engineering operations workspace",
});

/**
 * Format standard browser document title.
 * E.g., formatPageTitle("Projects") => "Projects | Engoryx"
 * E.g., formatPageTitle() => "Engoryx | Engineering Operations"
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
