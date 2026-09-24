import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { applicationModeForPath, isCanonicalHydroqualisenseHost, isPublicFunnelApplicationPath } from "../src/app/applicationMode.ts";

const publicRoot = readFileSync(new URL("../src/public/PublicFunnelRoot.tsx", import.meta.url), "utf8");
const publicChrome = readFileSync(new URL("../src/public/PublicSiteChrome.tsx", import.meta.url), "utf8");
const softwareShowcase = readFileSync(new URL("../src/public/SoftwareShowcaseLanding.tsx", import.meta.url), "utf8");
const publicBranding = readFileSync(new URL("../src/config/publicBranding.ts", import.meta.url), "utf8");
const authScreen = readFileSync(new URL("../src/components/auth/AuthScreen.tsx", import.meta.url), "utf8");
const appShell = readFileSync(new URL("../src/app/AppShell.tsx", import.meta.url), "utf8");
const mainSource = readFileSync(new URL("../src/main.tsx", import.meta.url), "utf8");
const setup = readFileSync(new URL("../docs/GOOGLE_SIGNIN_BREVO_SETUP.md", import.meta.url), "utf8");

test("privacy and terms are public routes while recovery links remain authenticated", () => {
  assert.equal(isPublicFunnelApplicationPath("/privacy"), true);
  assert.equal(isPublicFunnelApplicationPath("/terms"), true);
  assert.equal(applicationModeForPath("/privacy"), "public");
  assert.equal(applicationModeForPath("/terms"), "public");
  assert.equal(applicationModeForPath("/privacy/"), "public");
  assert.equal(applicationModeForPath("/privacy", undefined, undefined, true), "public");
  assert.equal(applicationModeForPath("/terms", undefined, undefined, true), "public");
  assert.equal(applicationModeForPath("/privacy", "?auth=reset", undefined, true), "public");
});

test("canonical company and QA showcase roots are public while client production roots stay authenticated", () => {
  assert.equal(isCanonicalHydroqualisenseHost("hydroqualisense.com"), true);
  assert.equal(isCanonicalHydroqualisenseHost("HYDROQUALISENSE.COM."), true);
  assert.equal(isCanonicalHydroqualisenseHost("www.hydroqualisense.com"), false);
  assert.equal(isCanonicalHydroqualisenseHost("client.example.com"), false);
  assert.equal(applicationModeForPath("/", undefined, undefined, false, "hydroqualisense.com"), "public");
  assert.equal(applicationModeForPath("/request-demo", undefined, undefined, false, "hydroqualisense.com"), "public");
  assert.equal(applicationModeForPath("/contact", undefined, undefined, false, "hydroqualisense.com"), "public");
  assert.equal(applicationModeForPath("/", undefined, undefined, false, "client.example.com"), "production");
  assert.equal(applicationModeForPath("/", undefined, undefined, true, "client.example.com"), "production");
  assert.equal(applicationModeForPath("/request-demo", undefined, undefined, true, "client.example.com"), "production");
  assert.equal(applicationModeForPath("/", undefined, undefined, true, "localhost"), "public");
  assert.equal(applicationModeForPath("/dashboard", undefined, undefined, false, "hydroqualisense.com"), "production");
  assert.equal(applicationModeForPath("/", "?type=recovery", undefined, false, "hydroqualisense.com"), "production");
  assert.equal(applicationModeForPath("/", "", "#access_token=redacted&type=recovery", false, "hydroqualisense.com"), "production");
});

test("public policy surfaces explain identity-only Google use and provide sign-in/legal navigation", () => {
  const publicMarketingSource = `${publicRoot}\n${softwareShowcase}\n${publicBranding}`;
  for (const phrase of [
    "Hydroqualisense",
    "Projects",
    "Procurement",
    "Supplier invoices",
    "Finance",
    "Documents",
    "Payroll",
    "Inventory",
    "Equipment",
    "Business communications",
    "Privacy Policy",
    "Terms of Service",
    "Google Sign-In",
    "identity only",
    "openid, email, and profile",
    "does not read, scan, import from, or send through a Gmail mailbox",
    "server-side Brevo configuration",
    "provider acceptance from confirmed delivery",
    "Google account identity information is not sold",
    "used for advertising",
    "transferred to data brokers",
    "revoke Google Sign-In authorization",
    "Revoking identity authorization",
    "Google API Services User Data Policy",
    "https://developers.google.com/terms/api-services-user-data-policy",
    "/privacy",
    "/terms",
  ]) assert.match(publicMarketingSource, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"), phrase);
  assert.match(publicChrome, /const privacyHref = "\/privacy"/);
  assert.match(publicChrome, /const termsHref = "\/terms"/);
  assert.doesNotMatch(publicRoot, /Draft product policy|draft product terms/i);
  assert.match(authScreen, /href="\/privacy"/);
  assert.match(authScreen, /href="\/terms"/);
  assert.match(appShell, /href="\/privacy"/);
  assert.match(appShell, /href="\/terms"/);
  assert.match(mainSource, /applicationModeForPath\(window\.location\.pathname, window\.location\.search, window\.location\.hash, undefined, window\.location\.hostname\)/);
  assert.match(setup, /https:\/\/hydroqualisense\.com\/privacy/);
  assert.match(setup, /https:\/\/hydroqualisense\.com\/terms/);
  assert.match(setup, /gmail\.readonly/);
  assert.match(setup, /gmail\.send/);
  assert.match(setup, /BREVO_API_KEY/);
  assert.doesNotMatch(setup, /Gmail setup|Connect Google \+ Gmail|Gmail Inbox/);
});
