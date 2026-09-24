import type { RuntimeDeploymentEnvironment } from "./deploymentIdentity.ts";
import { QA_SOFTWARE_SHOWCASE } from "../config/publicBranding.ts";

export interface DeploymentSearchPolicy {
  robots: string | null;
  removeCanonical: boolean;
  pageTitle: string | null;
  siteName: string | null;
  description: string | null;
}

function updateMeta(documentRef: Document, attribute: "name" | "property", value: string, content: string) {
  let meta = documentRef.head.querySelector<HTMLMetaElement>(`meta[${attribute}="${value}"]`);
  if (!meta) {
    meta = documentRef.createElement("meta");
    meta.setAttribute(attribute, value);
    documentRef.head.append(meta);
  }
  meta.content = content;
}

export function deploymentSearchPolicy(environment: RuntimeDeploymentEnvironment, canonicalCompanyHost = false): DeploymentSearchPolicy {
  if (environment === "production" && canonicalCompanyHost) return { robots: null, removeCanonical: false, pageTitle: null, siteName: null, description: null };
  if (environment === "qa") {
    return {
      robots: "noindex, nofollow",
      removeCanonical: true,
      pageTitle: QA_SOFTWARE_SHOWCASE.metadata.title,
      siteName: `${QA_SOFTWARE_SHOWCASE.softwareIdentity.neutralDescriptor} · ${QA_SOFTWARE_SHOWCASE.softwareIdentity.label}`,
      description: QA_SOFTWARE_SHOWCASE.metadata.description,
    };
  }
  if (environment === "production") {
    return {
      robots: "noindex, nofollow",
      removeCanonical: true,
      pageTitle: "Client Workspace",
      siteName: "Client Workspace",
      description: "Private client workspace.",
    };
  }
  return {
    robots: "noindex, nofollow",
    removeCanonical: true,
    pageTitle: "Hydroqualisense · Non-production environment",
    siteName: "Non-production workspace",
    description: "Non-production Hydroqualisense workspace.",
  };
}

export function applyDeploymentSearchPolicy(documentRef: Document, environment: RuntimeDeploymentEnvironment, canonicalCompanyHost = false) {
  const policy = deploymentSearchPolicy(environment, canonicalCompanyHost);
  if (policy.robots) {
    let robots = documentRef.head.querySelector<HTMLMetaElement>('meta[name="robots"]');
    if (!robots) {
      robots = documentRef.createElement("meta");
      robots.name = "robots";
      documentRef.head.append(robots);
    }
    robots.content = policy.robots;
  }

  if (policy.removeCanonical) {
    documentRef.head.querySelector('link[rel="canonical"]')?.remove();
    documentRef.head.querySelector('meta[property="og:url"]')?.remove();
  }

  if (policy.pageTitle) {
    documentRef.title = policy.pageTitle;
    updateMeta(documentRef, "property", "og:title", policy.pageTitle);
    updateMeta(documentRef, "name", "twitter:title", policy.pageTitle);
  }
  if (policy.siteName) {
    updateMeta(documentRef, "name", "application-name", policy.siteName);
    updateMeta(documentRef, "property", "og:site_name", policy.siteName);
  }
  if (policy.description) {
    updateMeta(documentRef, "name", "description", policy.description);
    updateMeta(documentRef, "property", "og:description", policy.description);
    updateMeta(documentRef, "name", "twitter:description", policy.description);
  }

  return policy;
}
