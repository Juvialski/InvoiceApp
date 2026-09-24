import { HYDROQUALISENSE_PUBLIC_SITE, QA_SOFTWARE_SHOWCASE, type PublicSiteVariant } from "../config/publicBranding.ts";

export type PublicPageKind = "landing" | "contact" | "request-demo" | "privacy" | "terms";

export interface PublicPageMetadata {
  title: string;
  description: string;
  siteName: string;
  canonicalUrl: string | null;
  robots: string;
}

function normalizedPublicPath(pathname: string) {
  const normalized = pathname.replace(/\/{2,}/g, "/").replace(/\/+$/, "");
  return normalized || "/";
}

export function publicPageKindForPath(pathname: string): PublicPageKind {
  const path = normalizedPublicPath(pathname);
  if (path === "/contact") return "contact";
  if (path === "/request-demo") return "request-demo";
  if (path === "/privacy") return "privacy";
  if (path === "/terms") return "terms";
  return "landing";
}

export function publicPageMetadataFor(
  variant: PublicSiteVariant,
  page: PublicPageKind,
  pathname = "/",
  canonicalCompanyHost = true,
): PublicPageMetadata {
  if (variant === "software-showcase") {
    const title = page === "request-demo" || page === "contact"
      ? `Software Showcase Inquiry | ${QA_SOFTWARE_SHOWCASE.softwareIdentity.neutralDescriptor}`
      : page === "privacy"
        ? `Privacy Policy | ${QA_SOFTWARE_SHOWCASE.softwareIdentity.label}`
        : page === "terms"
          ? `Terms of Service | ${QA_SOFTWARE_SHOWCASE.softwareIdentity.label}`
          : QA_SOFTWARE_SHOWCASE.metadata.title;
    return {
      title,
      description: QA_SOFTWARE_SHOWCASE.metadata.description,
      siteName: `${QA_SOFTWARE_SHOWCASE.softwareIdentity.neutralDescriptor} · ${QA_SOFTWARE_SHOWCASE.softwareIdentity.label}`,
      canonicalUrl: null,
      robots: "noindex, nofollow",
    };
  }

  const pageTitle = page === "contact"
    ? "Project Inquiry"
    : page === "request-demo"
      ? "Project Inquiry"
      : page === "privacy"
        ? "Privacy Policy"
        : page === "terms"
          ? "Terms of Service"
          : null;
  const path = normalizedPublicPath(pathname);
  const canonicalUrl = new URL(path === "/" ? "/" : path, HYDROQUALISENSE_PUBLIC_SITE.identity.canonicalOrigin).toString();

  return {
    title: pageTitle ? `${pageTitle} | Hydroqualisense Solutions Corp.` : HYDROQUALISENSE_PUBLIC_SITE.metadata.title,
    description: HYDROQUALISENSE_PUBLIC_SITE.metadata.description,
    siteName: HYDROQUALISENSE_PUBLIC_SITE.identity.companyName,
    canonicalUrl: canonicalCompanyHost ? canonicalUrl : null,
    robots: canonicalCompanyHost ? "index, follow" : "noindex, nofollow",
  };
}

function updateMeta(documentRef: Document, key: "name" | "property", value: string, content: string | null) {
  const selector = `meta[${key}="${value}"]`;
  const current = documentRef.head.querySelector<HTMLMetaElement>(selector);
  if (content === null) {
    current?.remove();
    return;
  }
  const meta = current || documentRef.createElement("meta");
  meta.setAttribute(key, value);
  meta.content = content;
  if (!current) documentRef.head.append(meta);
}

export function applyPublicPageMetadata(metadata: PublicPageMetadata, documentRef: Document = document) {
  documentRef.title = metadata.title;
  updateMeta(documentRef, "name", "description", metadata.description);
  updateMeta(documentRef, "name", "application-name", metadata.siteName);
  updateMeta(documentRef, "name", "robots", metadata.robots);
  updateMeta(documentRef, "property", "og:site_name", metadata.siteName);
  updateMeta(documentRef, "property", "og:title", metadata.title);
  updateMeta(documentRef, "property", "og:description", metadata.description);
  updateMeta(documentRef, "property", "og:url", metadata.canonicalUrl);
  updateMeta(documentRef, "name", "twitter:title", metadata.title);
  updateMeta(documentRef, "name", "twitter:description", metadata.description);

  const canonical = documentRef.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (metadata.canonicalUrl) {
    const link = canonical || documentRef.createElement("link");
    link.rel = "canonical";
    link.href = metadata.canonicalUrl;
    if (!canonical) documentRef.head.append(link);
  } else {
    canonical?.remove();
  }
}
