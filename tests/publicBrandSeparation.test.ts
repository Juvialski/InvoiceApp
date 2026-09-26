import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { applicationModeForPath } from "../src/app/applicationMode.ts";
import { HYDROQUALISENSE_PUBLIC_SITE, QA_SOFTWARE_SHOWCASE } from "../src/config/publicBranding.ts";
import { deploymentSearchPolicy } from "../src/lib/deploymentSearchPolicy.ts";
import { CompanyPublicSite } from "../src/public/CompanyPublicSite.tsx";
import { publicPageMetadataFor } from "../src/public/publicMetadata.ts";
import { SoftwareShowcaseLanding } from "../src/public/SoftwareShowcaseLanding.tsx";

const indexHtml = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const mainSource = readFileSync(new URL("../src/main.tsx", import.meta.url), "utf8");
const publicRoot = readFileSync(new URL("../src/public/PublicFunnelRoot.tsx", import.meta.url), "utf8");
const companySite = readFileSync(new URL("../src/public/CompanyPublicSite.tsx", import.meta.url), "utf8");
const softwareShowcase = readFileSync(new URL("../src/public/SoftwareShowcaseLanding.tsx", import.meta.url), "utf8");
const demoLanding = readFileSync(new URL("../src/demo/DemoLandingPage.tsx", import.meta.url), "utf8");
const demoWorkspace = readFileSync(new URL("../src/demo/DemoWorkspace.tsx", import.meta.url), "utf8");
const demoAssistant = readFileSync(new URL("../src/demo/DemoAssistant.tsx", import.meta.url), "utf8");
const demoTour = readFileSync(new URL("../src/demo/DemoTour.tsx", import.meta.url), "utf8");
const demoCompanyFixture = readFileSync(new URL("../src/demo/data/createDemoWorkspace.ts", import.meta.url), "utf8");
const demoInvoiceFixture = readFileSync(new URL("../src/demo/data/invoices.ts", import.meta.url), "utf8");
const publicChrome = readFileSync(new URL("../src/public/PublicSiteChrome.tsx", import.meta.url), "utf8");
const renderedCompanyLanding = renderToStaticMarkup(createElement(CompanyPublicSite));
const renderedQaLanding = renderToStaticMarkup(createElement(SoftwareShowcaseLanding));

function renderedText(markup: string) {
  return markup.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
}

function renderedHeading(markup: string) {
  const match = markup.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/);
  assert.ok(match, "landing page renders an h1");
  return renderedText(match[1]);
}

function renderedWordCount(markup: string) {
  return renderedText(markup).split(/\s+/).filter(Boolean).length;
}

test("QA deployment root opens the public software showcase when prospect intake is disabled", () => {
  assert.equal(
    applicationModeForPath("/", undefined, undefined, false, "qa-preview.example.com", "qa"),
    "public",
  );
  assert.equal(applicationModeForPath("/demo", undefined, undefined, false, "qa-preview.example.com", "qa"), "demo");
  assert.equal(applicationModeForPath("/", "?auth=reset", undefined, false, "qa-preview.example.com", "qa"), "production");
  assert.equal(applicationModeForPath("/dashboard", undefined, undefined, false, "qa-preview.example.com", "qa"), "production");
});

test("canonical document metadata describes the engineering company", () => {
  assert.match(indexHtml, /<title>Hydroqualisense Solutions Corp\. \| Water &amp; Engineering<\/title>/);
  assert.match(indexHtml, /water treatment, water management, and related engineering projects/i);
  assert.doesNotMatch(indexHtml, /business operations platform/i);
});

test("production public routing delegates company content to its own surface", () => {
  assert.match(publicRoot, /CompanyPublicSite/);
  assert.doesNotMatch(publicRoot, /Hydroqualisense is a business operations platform/i);
  assert.doesNotMatch(companySite, /demo\/data|DemoProject|demo-project/i);
  assert.doesNotMatch(companySite, /PUBLIC_PROSPECT|workforceScale|projectScale|validatePublicProspectSubmission/);
  assert.doesNotMatch(companySite, /\b\d+(?:,\d{3})*\+?\s+(?:years|clients|projects|employees|locations)\b/i);
  assert.match(companySite, /projectReferencesPending/);
  assert.match(companySite, /contactPending/);
  assert.match(publicChrome, /Client Portal/);
  assert.match(publicChrome, /href="\/dashboard"/);
});

test("company landing keeps its water-engineering heading concise", () => {
  assert.equal(renderedHeading(renderedCompanyLanding), "Water-focused engineering.");
  assert.equal((renderedCompanyLanding.match(/<h1\b/g) || []).length, 1);
  assert.match(renderedCompanyLanding, /href="\/contact"[^>]*>[\s\S]*?Discuss a project/);
});

test("QA landing uses concise neutral workflow framing", () => {
  assert.equal(renderedHeading(renderedQaLanding), "Engineering operations workflows.");
  assert.equal((renderedQaLanding.match(/<h1\b/g) || []).length, 1);
});

test("QA landing makes Open demo primary and keeps workspace sign-in distinct", () => {
  const header = renderedQaLanding.match(/<header\b[\s\S]*?<\/header>/)?.[0] || "";
  const hero = renderedQaLanding.match(/<section id="home"[\s\S]*?<\/section>/)?.[0] || "";
  const headerDemo = header.match(/<a\b(?=[^>]*href="\/demo")[^>]*>([\s\S]*?)<\/a>/);
  const headerSignIn = header.match(/<a\b(?=[^>]*href="\/dashboard")[^>]*>([\s\S]*?)<\/a>/);
  const heroDemo = hero.match(/<a\b(?=[^>]*href="\/demo")[^>]*>([\s\S]*?)<\/a>/);
  const heroSignIn = hero.match(/<a\b(?=[^>]*href="\/dashboard")[^>]*>([\s\S]*?)<\/a>/);

  assert.equal(renderedText(headerDemo?.[1] || ""), "Open demo");
  assert.equal(renderedText(headerSignIn?.[1] || ""), "Sign in to QA workspace");
  assert.equal(renderedText(heroDemo?.[1] || ""), "Open demo");
  assert.equal(renderedText(heroSignIn?.[1] || ""), "Sign in to QA workspace");
  assert.ok(hero.indexOf('href="/demo"') < hero.indexOf('href="/dashboard"'));
  assert.match(header, /<nav aria-label="Showcase navigation"[\s\S]*?Sign in to QA workspace/);
});

test("QA synthetic and non-production disclosure has its own semantic note", () => {
  const hero = renderedQaLanding.match(/<section id="home"[\s\S]*?<\/section>/)?.[0] || "";
  const note = hero.match(/<(?:div|aside)\b[^>]*role="note"[^>]*>([\s\S]*?)<\/(?:div|aside)>/);

  assert.ok(note, "QA disclosure is presented in a semantic note");
  assert.equal(renderedText(note[1]), "Synthetic QA software showcase. Not the company services website.");
});

test("company landing keeps the approved focus and pending states concise", () => {
  const companyText = renderedText(renderedCompanyLanding);

  assert.ok(companyText.includes("An engineering company focused on water treatment, water management, and related engineering projects."));
  assert.ok(companyText.includes("Public project references and photos are pending company approval."));
  assert.ok(companyText.includes("Public inquiry email and phone are pending company confirmation."));
  assert.ok(renderedWordCount(renderedCompanyLanding) <= 150, `company landing has ${renderedWordCount(renderedCompanyLanding)} visible words`);
});

test("QA landing keeps all supported capability labels in concise copy", () => {
  const qaText = renderedText(renderedQaLanding);

  for (const capability of QA_SOFTWARE_SHOWCASE.capabilities) {
    assert.ok(qaText.includes(capability.title), `QA landing includes ${capability.title}`);
  }
  assert.ok(renderedWordCount(renderedQaLanding) <= 150, `QA landing has ${renderedWordCount(renderedQaLanding)} visible words`);
});

test("public company content contains only confirmed service themes and no public project/contact claims", () => {
  assert.equal(HYDROQUALISENSE_PUBLIC_SITE.identity.companyName, "Hydroqualisense Solutions Corp.");
  assert.deepEqual(HYDROQUALISENSE_PUBLIC_SITE.services.map(({ title }) => title), [
    "Water treatment",
    "Water management",
    "Related engineering projects",
  ]);
  assert.deepEqual(HYDROQUALISENSE_PUBLIC_SITE.projectReferences, []);
  assert.deepEqual(HYDROQUALISENSE_PUBLIC_SITE.contact, { email: null, phone: null, location: null });
});

test("QA has a neutral software identity, explicit synthetic disclosure, and non-indexing metadata", () => {
  assert.equal(QA_SOFTWARE_SHOWCASE.softwareIdentity.productBrand, null);
  assert.equal(QA_SOFTWARE_SHOWCASE.softwareIdentity.creatorBrand, null);
  assert.equal(QA_SOFTWARE_SHOWCASE.disclosure, "Synthetic QA software showcase. Not the company services website.");
  assert.doesNotMatch(softwareShowcase, /Hydroqualisense Solutions Corp\.|BRAND\.companyName/);

  const metadata = publicPageMetadataFor("software-showcase", "landing", "/");
  assert.equal(metadata.canonicalUrl, null);
  assert.equal(metadata.robots, "noindex, nofollow");
  for (const page of ["landing", "contact", "request-demo", "privacy", "terms"] as const) {
    const qaPageMetadata = publicPageMetadataFor("software-showcase", page, "/", false);
    assert.doesNotMatch(JSON.stringify(qaPageMetadata), /Hydroqualisense/i);
    assert.equal(qaPageMetadata.canonicalUrl, null);
    assert.equal(qaPageMetadata.robots, "noindex, nofollow");
  }
  const companyMetadata = publicPageMetadataFor("company", "landing", "/", true);
  assert.equal(companyMetadata.title, "Hydroqualisense Solutions Corp. | Water & Engineering");
  assert.equal(companyMetadata.canonicalUrl, "https://hydroqualisense.com/");
  const localPreviewMetadata = publicPageMetadataFor("company", "landing", "/", false);
  assert.equal(localPreviewMetadata.canonicalUrl, null);
  assert.equal(localPreviewMetadata.robots, "noindex, nofollow");
  assert.equal(deploymentSearchPolicy("qa").removeCanonical, true);
  assert.equal(deploymentSearchPolicy("staging").robots, "noindex, nofollow");
  assert.equal(deploymentSearchPolicy("production", true).removeCanonical, false);
  assert.equal(deploymentSearchPolicy("production", false).robots, "noindex, nofollow");
  assert.match(mainSource, /applyDeploymentSearchPolicy\(document, deploymentIdentity\.environment, isCanonicalHydroqualisenseHost/);
  assert.match(demoLanding, /QA Software Showcase/);
  assert.match(demoLanding, /synthetic project.*finance.*workforce/i);
  assert.doesNotMatch(demoLanding, /BRAND\.companyName|Hydroqualisense Solutions Corp\./);
  assert.match(demoWorkspace, /brandIdentity=/);
  assert.match(demoWorkspace, /QA_SOFTWARE_SHOWCASE\.softwareIdentity\.neutralDescriptor/);
  assert.doesNotMatch(demoWorkspace, /BRAND\.companyName/);
  assert.doesNotMatch(demoAssistant, /BRAND\.assistantName/);
  assert.doesNotMatch(demoTour, /BRAND\.productName/);
  assert.doesNotMatch(demoCompanyFixture + demoInvoiceFixture, /Hydroqualisense Solutions Corp\./);
  assert.match(demoCompanyFixture, /Sample Engineering Company/);
});

test("QA showcase clearly separates real workspace sign-in from the isolated demo", () => {
  const { workspaceEntry } = QA_SOFTWARE_SHOWCASE;
  assert.deepEqual(workspaceEntry, {
    signInHref: "/dashboard",
    signInLabel: "Sign in to QA workspace",
    demoHref: "/demo",
    demoLabel: "Open demo",
  });
  assert.match(softwareShowcase, /workspaceEntry\.signInHref/);
  assert.match(softwareShowcase, /workspaceEntry\.signInLabel/);
  assert.match(softwareShowcase, /workspaceEntry\.demoHref/);
  assert.match(softwareShowcase, /workspaceEntry\.demoLabel/);
  assert.match(publicChrome, /workspaceEntry\.signInHref/);
  assert.equal(applicationModeForPath("/dashboard", undefined, undefined, false, "qa-preview.example.com", "qa"), "production");
  assert.equal(applicationModeForPath("/demo", undefined, undefined, false, "qa-preview.example.com", "qa"), "demo");
});
