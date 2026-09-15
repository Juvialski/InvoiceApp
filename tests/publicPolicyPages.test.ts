import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { applicationModeForPath, isCanonicalHydroqualisenseHost, isPublicFunnelApplicationPath } from "../src/app/applicationMode.ts";

const publicRoot = readFileSync(new URL("../src/public/PublicFunnelRoot.tsx", import.meta.url), "utf8");
const authScreen = readFileSync(new URL("../src/components/auth/AuthScreen.tsx", import.meta.url), "utf8");
const appShell = readFileSync(new URL("../src/app/AppShell.tsx", import.meta.url), "utf8");
const mainSource = readFileSync(new URL("../src/main.tsx", import.meta.url), "utf8");
const setup = readFileSync(new URL("../SUPABASE_GMAIL_SETUP.md", import.meta.url), "utf8");

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

test("the canonical product host exposes the public funnel without changing operational roots", () => {
  assert.equal(isCanonicalHydroqualisenseHost("hydroqualisense.com"), true);
  assert.equal(isCanonicalHydroqualisenseHost("HYDROQUALISENSE.COM."), true);
  assert.equal(isCanonicalHydroqualisenseHost("www.hydroqualisense.com"), false);
  assert.equal(isCanonicalHydroqualisenseHost("client.example.com"), false);
  assert.equal(applicationModeForPath("/", undefined, undefined, false, "hydroqualisense.com"), "public");
  assert.equal(applicationModeForPath("/request-demo", undefined, undefined, false, "hydroqualisense.com"), "public");
  assert.equal(applicationModeForPath("/contact", undefined, undefined, false, "hydroqualisense.com"), "public");
  assert.equal(applicationModeForPath("/", undefined, undefined, false, "client.example.com"), "production");
  assert.equal(applicationModeForPath("/", undefined, undefined, true, "client.example.com"), "public");
  assert.equal(applicationModeForPath("/dashboard", undefined, undefined, false, "hydroqualisense.com"), "production");
  assert.equal(applicationModeForPath("/", "?type=recovery", undefined, false, "hydroqualisense.com"), "production");
  assert.equal(applicationModeForPath("/", "", "#access_token=redacted&type=recovery", false, "hydroqualisense.com"), "production");
});

test("public policy surfaces explain Google data use and provide sign-in/legal navigation", () => {
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
    "Optional Gmail integration",
    "your own Google account",
    "Gmail message metadata",
    "email sender, recipient, subject, and date",
    "message content",
    "selected attachments",
    "gmail.readonly",
    "gmail.send",
    "Google user data is not sold",
    "not used for advertising",
    "not transferred to data brokers",
    "does not use Google Workspace data to train generalized",
    "support, security, abuse prevention, or legal requirements",
    "revoke Google authorization",
    "revoking Gmail access prevents future API access",
    "does not necessarily erase legitimate company records",
    "Google API Services User Data Policy",
    "Limited Use",
    "https://developers.google.com/terms/api-services-user-data-policy",
    "/privacy",
    "/terms",
  ]) assert.match(publicRoot, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"), phrase);
  assert.match(publicRoot, /href=\{[^}]*canonical[^}]*privacy|BRAND\.canonicalOrigin[^\n]*\/privacy/);
  assert.doesNotMatch(publicRoot, /Draft product policy|draft product terms/i);
  assert.match(authScreen, /href="\/privacy"/);
  assert.match(authScreen, /href="\/terms"/);
  assert.match(appShell, /href="\/privacy"/);
  assert.match(appShell, /href="\/terms"/);
  assert.match(mainSource, /applicationModeForPath\(window\.location\.pathname, window\.location\.search, window\.location\.hash, undefined, window\.location\.hostname\)/);
  assert.match(setup, /https:\/\/hydroqualisense\.com\/privacy/);
  assert.match(setup, /https:\/\/hydroqualisense\.com\/terms/);
});
