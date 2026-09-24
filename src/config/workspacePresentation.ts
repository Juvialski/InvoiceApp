import { BRAND } from "./brand.ts";
import { QA_SOFTWARE_SHOWCASE } from "./publicBranding.ts";
import { currentDeploymentIdentity, type RuntimeDeploymentEnvironment } from "../lib/deploymentIdentity.ts";

export interface WorkspacePresentation {
  readonly environment: RuntimeDeploymentEnvironment;
  readonly isQa: boolean;
  readonly productName: string;
  readonly displayName: string;
  readonly workspaceLabel: string;
  readonly assistantName: string;
  readonly browserTitle: string;
  readonly footerText: string;
  readonly siteName: string;
  readonly metadataDescription: string;
  readonly companyLogoPath: string | null;
  readonly workbookFilePrefix: string;
  readonly showDeploymentIdentifier: boolean;
  readonly headerBranding?: { readonly name: string; readonly subtitle: string };
}

/**
 * Resolves only user-facing workspace presentation. It does not select a company,
 * grant access, or change the deployment's data/authorization identity.
 */
export function workspacePresentationFor(environment: RuntimeDeploymentEnvironment): WorkspacePresentation {
  if (environment === "qa") {
    const productName = QA_SOFTWARE_SHOWCASE.softwareIdentity.neutralDescriptor;
    const workspaceLabel = "QA Workspace";
    return Object.freeze({
      environment,
      isQa: true,
      productName,
      displayName: productName,
      workspaceLabel,
      assistantName: "Workspace Assistant",
      browserTitle: `${productName} | ${workspaceLabel}`,
      footerText: `${productName} · ${workspaceLabel} · Synthetic data only`,
      siteName: `${productName} · ${workspaceLabel}`,
      metadataDescription: QA_SOFTWARE_SHOWCASE.metadata.description,
      companyLogoPath: null,
      workbookFilePrefix: "Engineering-Operations-Platform",
      showDeploymentIdentifier: false,
      headerBranding: Object.freeze({ name: productName, subtitle: workspaceLabel }),
    });
  }

  return Object.freeze({
    environment,
    isQa: false,
    productName: BRAND.productName,
    displayName: BRAND.displayUppercase,
    workspaceLabel: BRAND.companyName,
    assistantName: BRAND.assistantName,
    browserTitle: BRAND.browserTitle,
    footerText: BRAND.footerText,
    siteName: BRAND.companyName,
    metadataDescription: BRAND.description,
    companyLogoPath: BRAND.logoPath,
    workbookFilePrefix: "HydroQualiSense",
    showDeploymentIdentifier: true,
  });
}

export function currentWorkspacePresentation(): WorkspacePresentation {
  return workspacePresentationFor(currentDeploymentIdentity().environment);
}

export function workspacePageTitle(pageName?: string | null, presentation = currentWorkspacePresentation()): string {
  if (!pageName || pageName.trim() === "") return presentation.browserTitle;
  return `${pageName.trim()} | ${presentation.productName}`;
}

/** Replace legacy product/company labels in shared UI copy for the QA deployment only. */
export function presentWorkspaceCopy(copy: string, presentation = currentWorkspacePresentation()): string {
  if (!presentation.isQa) return copy;
  return copy
    .replace(/Hydroqualisense Assistant/gi, presentation.assistantName)
    .replace(/Hydroqualisense(?: Solutions Corp\.)?/gi, presentation.productName);
}

function escapeHtmlAttribute(value: string) {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

/** Keep the first QA HTML response neutral before client JavaScript mounts. */
export function deploymentIndexHtml(html: string, presentation: WorkspacePresentation): string {
  if (!presentation.isQa) return html;
  const metadata = [
    [/\s*<title>[\s\S]*?<\/title>/i, `<title>${escapeHtmlAttribute(presentation.browserTitle)}</title>`],
    [/\s*<meta name="description" content="[^"]*"\s*\/>/i, `<meta name="description" content="${escapeHtmlAttribute(presentation.metadataDescription)}" />`],
    [/\s*<meta name="application-name" content="[^"]*"\s*\/>/i, `<meta name="application-name" content="${escapeHtmlAttribute(presentation.siteName)}" />`],
    [/\s*<meta name="robots" content="[^"]*"\s*\/>/i, '<meta name="robots" content="noindex, nofollow" />'],
    [/\s*<meta property="og:site_name" content="[^"]*"\s*\/>/i, `<meta property="og:site_name" content="${escapeHtmlAttribute(presentation.siteName)}" />`],
    [/\s*<meta property="og:title" content="[^"]*"\s*\/>/i, `<meta property="og:title" content="${escapeHtmlAttribute(presentation.browserTitle)}" />`],
    [/\s*<meta property="og:description" content="[^"]*"\s*\/>/i, `<meta property="og:description" content="${escapeHtmlAttribute(presentation.metadataDescription)}" />`],
    [/\s*<meta name="twitter:title" content="[^"]*"\s*\/>/i, `<meta name="twitter:title" content="${escapeHtmlAttribute(presentation.browserTitle)}" />`],
    [/\s*<meta name="twitter:description" content="[^"]*"\s*\/>/i, `<meta name="twitter:description" content="${escapeHtmlAttribute(presentation.metadataDescription)}" />`],
  ] as const;
  let result = html;
  for (const [pattern, replacement] of metadata) result = result.replace(pattern, replacement);
  return result
    .replace(/\s*<meta property="og:url" content="[^"]*"\s*\/>/i, "")
    .replace(/\s*<link rel="canonical" href="[^"]*"\s*\/>/i, "");
}

function setMeta(documentRef: Document, selector: string, content: string) {
  const meta = documentRef.head.querySelector<HTMLMetaElement>(selector);
  if (meta) meta.content = content;
}

/** Apply neutral bootstrap metadata before React mounts in the QA deployment. */
export function applyWorkspacePresentationMetadata(
  presentation: WorkspacePresentation,
  documentRef: Document = document,
) {
  documentRef.title = presentation.browserTitle;
  setMeta(documentRef, 'meta[name="description"]', presentation.metadataDescription);
  setMeta(documentRef, 'meta[name="application-name"]', presentation.siteName);
  setMeta(documentRef, 'meta[name="robots"]', "noindex, nofollow");
  setMeta(documentRef, 'meta[property="og:site_name"]', presentation.siteName);
  setMeta(documentRef, 'meta[property="og:title"]', presentation.browserTitle);
  setMeta(documentRef, 'meta[property="og:description"]', presentation.metadataDescription);
  setMeta(documentRef, 'meta[name="twitter:title"]', presentation.browserTitle);
  setMeta(documentRef, 'meta[name="twitter:description"]', presentation.metadataDescription);
  documentRef.head.querySelector('meta[property="og:url"]')?.remove();
  documentRef.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.remove();
}
