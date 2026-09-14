import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { applicationModeForPath, isPublicFunnelApplicationPath } from "../src/app/applicationMode.ts";

const publicRoot = readFileSync(new URL("../src/public/PublicFunnelRoot.tsx", import.meta.url), "utf8");
const authScreen = readFileSync(new URL("../src/components/auth/AuthScreen.tsx", import.meta.url), "utf8");
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

test("public policy surfaces explain Google data use and provide sign-in/legal navigation", () => {
  for (const phrase of [
    "Privacy Policy",
    "Terms of Service",
    "Optional Gmail integration",
    "your own Google account",
    "Google API Services User Data Policy",
    "Limited Use",
    "gmail.readonly",
    "gmail.send",
    "/privacy",
    "/terms",
  ]) assert.match(publicRoot, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), phrase);
  assert.match(authScreen, /href="\/privacy"/);
  assert.match(authScreen, /href="\/terms"/);
  assert.match(setup, /https:\/\/hydroqualisense\.com\/privacy/);
  assert.match(setup, /https:\/\/hydroqualisense\.com\/terms/);
});
