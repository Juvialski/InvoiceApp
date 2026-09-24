import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { BRAND } from "../src/config/brand.ts";
import { applyWorkspacePresentationMetadata, deploymentIndexHtml, presentWorkspaceCopy, workspacePageTitle, workspacePresentationFor } from "../src/config/workspacePresentation.ts";
import { publicPolicyTextForVariant } from "../src/public/publicPolicyCopy.ts";

const appShellSource = readFileSync(new URL("../src/app/AppShell.tsx", import.meta.url), "utf8");
const bannerSource = readFileSync(new URL("../src/components/DeploymentEnvironmentBanner.tsx", import.meta.url), "utf8");

test("QA presentation is neutral while production preserves the client workspace identity", () => {
  const qa = workspacePresentationFor("qa");
  assert.equal(qa.productName, "Engineering Operations Platform");
  assert.equal(qa.workspaceLabel, "QA Workspace");
  assert.equal(qa.assistantName, "Workspace Assistant");
  assert.equal(qa.companyLogoPath, null);
  assert.equal(qa.workbookFilePrefix, "Engineering-Operations-Platform");
  assert.equal(qa.showDeploymentIdentifier, false);
  assert.equal(workspacePageTitle("Projects", qa), "Projects | Engineering Operations Platform");
  assert.doesNotMatch(JSON.stringify(qa), /Hydroqualisense/i);
  assert.equal(presentWorkspaceCopy("HydroQualiSense Assistant", qa), "Workspace Assistant");
  assert.equal(presentWorkspaceCopy("HydroQualiSense feature", qa), "Engineering Operations Platform feature");

  const production = workspacePresentationFor("production");
  assert.equal(production.productName, BRAND.productName);
  assert.equal(production.workspaceLabel, BRAND.companyName);
  assert.equal(production.companyLogoPath, BRAND.logoPath);
  assert.equal(production.workbookFilePrefix, "HydroQualiSense");
  assert.equal(production.browserTitle, BRAND.browserTitle);
  assert.equal(production.footerText, BRAND.footerText);
  assert.equal(presentWorkspaceCopy("HydroQualiSense feature", production), "HydroQualiSense feature");
  assert.equal(workspacePageTitle("Projects", production), "Projects | Hydroqualisense");
});

test("QA bootstrap metadata removes corporate labels and canonical links", () => {
  const values = new Map<string, { content: string; removed?: boolean; remove?: () => void }>([
    ['meta[name="description"]', { content: "Hydroqualisense" }],
    ['meta[name="application-name"]', { content: "Hydroqualisense" }],
    ['meta[name="robots"]', { content: "index, follow" }],
    ['meta[property="og:site_name"]', { content: "Hydroqualisense" }],
    ['meta[property="og:title"]', { content: "Hydroqualisense" }],
    ['meta[property="og:description"]', { content: "Hydroqualisense" }],
    ['meta[name="twitter:title"]', { content: "Hydroqualisense" }],
    ['meta[name="twitter:description"]', { content: "Hydroqualisense" }],
    ['meta[property="og:url"]', { content: "https://hydroqualisense.com", removed: false }],
    ['link[rel="canonical"]', { content: "https://hydroqualisense.com", removed: false }],
  ]);
  const documentRef = {
    title: "Hydroqualisense Solutions Corp.",
    head: { querySelector: (selector: string) => {
      const value = values.get(selector);
      if (!value) return null;
      value.remove = () => { value.removed = true; };
      return value;
    } },
  } as unknown as Document;

  applyWorkspacePresentationMetadata(workspacePresentationFor("qa"), documentRef);
  assert.equal(documentRef.title, "Engineering Operations Platform | QA Workspace");
  for (const [selector, value] of values) {
    if (selector.includes("og:url") || selector.includes("canonical")) assert.equal(value.removed, true);
    else assert.doesNotMatch(value.content, /Hydroqualisense/i);
  }
  assert.equal(values.get('meta[name="robots"]')?.content, "noindex, nofollow");
});

test("initial QA HTML is neutral before client JavaScript mounts and production HTML is unchanged", () => {
  const initialHtml = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const qaHtml = deploymentIndexHtml(initialHtml, workspacePresentationFor("qa"));
  const qaHead = qaHtml.match(/<head>[\s\S]*?<\/head>/i)?.[0] || "";
  assert.match(qaHead, /<title>Engineering Operations Platform \| QA Workspace<\/title>/);
  assert.match(qaHead, /name="robots" content="noindex, nofollow"/);
  assert.doesNotMatch(qaHead, /Hydroqualisense|canonical|og:url/i);
  assert.equal(deploymentIndexHtml(initialHtml, workspacePresentationFor("production")), initialHtml);
});

test("authenticated shell and QA warning are wired to deployment presentation", () => {
  assert.match(appShellSource, /workspacePresentation: requestedWorkspacePresentation/);
  assert.match(appShellSource, /const resolvedWorkspacePresentation = requestedWorkspacePresentation \|\| currentWorkspacePresentation\(\)/);
  assert.match(appShellSource, /requestedFooterText \?\? resolvedWorkspacePresentation\.footerText/);
  assert.match(appShellSource, /requestedBrandIdentity \?\? resolvedWorkspacePresentation\.headerBranding/);
  assert.match(appShellSource, /branding=\{brandIdentity\}/);
  assert.match(bannerSource, /presentation\.showDeploymentIdentifier/);
  assert.match(bannerSource, /QA ENVIRONMENT · SYNTHETIC DATA ONLY/);
});

test("QA public legal copy is neutral while company legal copy remains unchanged", () => {
  const productionCopy = "Hydroqualisense is a hosted business operations application.";
  const qaCopy = publicPolicyTextForVariant(productionCopy, "software-showcase");
  assert.equal(publicPolicyTextForVariant(productionCopy, "company"), productionCopy);
  assert.equal(qaCopy, "The QA environment is a non-production software showcase.");
  assert.doesNotMatch(qaCopy, /Hydroqualisense/i);
});
