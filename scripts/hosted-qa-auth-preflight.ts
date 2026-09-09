import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
// Playwright is intentionally installed only by the explicit hosted-QA command
// or manual workflow, not by the ordinary application dependency set.
// @ts-ignore -- the QA-only dependency is present when this script executes.
import { chromium } from "playwright";
import { normalizeErrorMessage, redactSensitiveText } from "./qa/structuredEvidence.ts";

const BASE_URL = (process.env.QA_E2E_BASE_URL || "https://hydroqualisense-qa.onrender.com").replace(/\/+$/, "");
const OUTPUT_DIR = path.resolve(process.env.QA_E2E_OUTPUT_DIR || "artifacts/hosted-qa");
const STORAGE_STATE_PATH = path.resolve(process.env.QA_E2E_STORAGE_STATE_PATH || ".qa-e2e/qa-storage-state.json");
const NAVIGATION_TIMEOUT_MS = 60_000;
const AUTH_FORM_TIMEOUT_MS = 20_000;
const AUTH_SESSION_TIMEOUT_MS = 15_000;

interface BrowserSessionSnapshot {
  accessTokenPresent: boolean;
  refreshTokenPresent: boolean;
  userEmail: string;
}

interface AuthEvidence {
  schemaVersion: 1;
  status: "PASS" | "FAIL";
  baseUrl: string;
  timestamp: string;
  authMode?: "email-password" | "storage-state";
  session?: {
    accessTokenPresent: boolean;
    refreshTokenPresent: boolean;
    userEmailMatchesExpected: boolean | null;
  };
  reloadPersisted?: boolean | null;
  freshNavigationPersisted?: boolean;
  failure?: string;
}

function assertQaTarget() {
  const parsed = new URL(BASE_URL);
  if (parsed.protocol !== "https:" && process.env.QA_E2E_ALLOW_NON_QA_HOST !== "1") {
    throw new Error("Hosted QA requires an HTTPS QA target. Set QA_E2E_ALLOW_NON_QA_HOST=1 only for an explicit local harness run.");
  }
  if (/hydroqualisense\.com$/i.test(parsed.hostname) || /production/i.test(parsed.hostname)) {
    throw new Error("Hosted QA refuses the production host.");
  }
  if (!/-qa\.onrender\.com$/i.test(parsed.hostname) && process.env.QA_E2E_ALLOW_NON_QA_HOST !== "1") {
    throw new Error("Hosted QA refuses an unapproved host; expected a -qa.onrender.com deployment.");
  }
}

function safeDetails(value: unknown) {
  return redactSensitiveText(normalizeErrorMessage(value));
}

async function writeEvidence(evidence: AuthEvidence) {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  await fs.writeFile(path.join(OUTPUT_DIR, "authentication.json"), `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
}

async function browserSessionSnapshot(page: any): Promise<BrowserSessionSnapshot> {
  return page.evaluate(() => {
    const raw = Object.entries(localStorage).find(([key]) => key.startsWith("sb-") && key.endsWith("-auth-token"))?.[1] || "";
    if (!raw) return { accessTokenPresent: false, refreshTokenPresent: false, userEmail: "" };
    try {
      const parsed = JSON.parse(raw) as { access_token?: unknown; refresh_token?: unknown; user?: { email?: unknown } };
      return {
        accessTokenPresent: typeof parsed.access_token === "string" && parsed.access_token.length > 0,
        refreshTokenPresent: typeof parsed.refresh_token === "string" && parsed.refresh_token.length > 0,
        userEmail: typeof parsed.user?.email === "string" ? parsed.user.email : "",
      };
    } catch {
      return { accessTokenPresent: false, refreshTokenPresent: false, userEmail: "" };
    }
  });
}

async function waitForPersistedSession(page: any, timeoutMs = AUTH_SESSION_TIMEOUT_MS): Promise<BrowserSessionSnapshot> {
  await page.waitForFunction(() => {
    const raw = Object.entries(localStorage).find(([key]) => key.startsWith("sb-") && key.endsWith("-auth-token"))?.[1] || "";
    if (!raw) return false;
    try {
      const parsed = JSON.parse(raw) as { access_token?: unknown; refresh_token?: unknown };
      return typeof parsed.access_token === "string"
        && parsed.access_token.length > 0
        && typeof parsed.refresh_token === "string"
        && parsed.refresh_token.length > 0;
    } catch {
      return false;
    }
  }, undefined, { timeout: timeoutMs });
  return browserSessionSnapshot(page);
}

async function waitForSignInForm(page: any) {
  const emailInput = page.locator("#auth-email");
  try {
    await emailInput.waitFor({ state: "visible", timeout: AUTH_FORM_TIMEOUT_MS });
  } catch {
    const currentUrl = safeDetails(page.url());
    throw new Error(`Hosted QA sign-in form did not become ready within ${AUTH_FORM_TIMEOUT_MS}ms after protected-page navigation. Current URL: ${currentUrl}`);
  }
  return emailInput;
}

async function assertNotAuthScreen(page: any) {
  const body = await page.locator("body").innerText().catch(() => "");
  if (body.includes("Welcome back") || body.includes("Sign in to continue")) {
    throw new Error("Hosted QA authenticated session returned to the sign-in screen.");
  }
}

function emailMatches(snapshot: BrowserSessionSnapshot, expectedEmail: string) {
  if (!expectedEmail || !snapshot.userEmail) return true;
  return snapshot.userEmail.trim().toLowerCase() === expectedEmail.trim().toLowerCase();
}

async function main() {
  assertQaTarget();
  const email = (process.env.QA_E2E_EMAIL || "").trim();
  const password = process.env.QA_E2E_PASSWORD || "";
  const hasCredentials = Boolean(email && password);
  const hasState = existsSync(STORAGE_STATE_PATH);

  if (Boolean(email) !== Boolean(password)) {
    throw new Error("Set both QA_E2E_EMAIL and QA_E2E_PASSWORD, or provide QA_E2E_STORAGE_STATE_PATH.");
  }
  if (!hasCredentials && !hasState) {
    throw new Error("Hosted QA requires QA_E2E_STORAGE_STATE_PATH or the explicit QA_E2E_EMAIL/QA_E2E_PASSWORD secret pair.");
  }

  const authMode = hasCredentials ? "email-password" as const : "storage-state" as const;
  const browser = await chromium.launch({ headless: process.env.QA_E2E_HEADED !== "1" });
  let context: any = null;
  let reloadPersisted: boolean | null = null;
  let freshNavigationPersisted = false;
  let lastSnapshot: BrowserSessionSnapshot = { accessTokenPresent: false, refreshTokenPresent: false, userEmail: "" };

  try {
    context = hasCredentials
      ? await browser.newContext()
      : await browser.newContext({ storageState: STORAGE_STATE_PATH });

    if (hasCredentials) {
      const page = await context.newPage();
      await page.goto(`${BASE_URL}/dashboard`, { waitUntil: "domcontentloaded", timeout: NAVIGATION_TIMEOUT_MS });
      const emailInput = await waitForSignInForm(page);
      await emailInput.fill(email);
      await page.locator("#auth-password").fill(password);
      await page.getByRole("button", { name: "Sign in", exact: true }).click();

      try {
        lastSnapshot = await waitForPersistedSession(page);
      } catch {
        const alertText = await page.getByRole("alert").innerText().catch(() => "");
        const providerHint = alertText ? ` Provider response: ${safeDetails(alertText)}` : "";
        throw new Error(`Hosted QA authentication failed: no persisted Supabase session was established.${providerHint} Re-enter the QA_E2E_EMAIL and QA_E2E_PASSWORD secrets and verify they belong to this QA project.`);
      }
      if (!emailMatches(lastSnapshot, email)) {
        throw new Error("Hosted QA authentication established a session for a different user than QA_E2E_EMAIL.");
      }

      await page.reload({ waitUntil: "domcontentloaded", timeout: NAVIGATION_TIMEOUT_MS });
      try {
        lastSnapshot = await waitForPersistedSession(page, 8_000);
      } catch {
        throw new Error("Hosted QA authentication succeeded but the Supabase session did not survive a page reload.");
      }
      await assertNotAuthScreen(page);
      reloadPersisted = true;
      await page.close();
    }

    const freshPage = await context.newPage();
    await freshPage.goto(`${BASE_URL}/dashboard`, { waitUntil: "domcontentloaded", timeout: NAVIGATION_TIMEOUT_MS });
    try {
      lastSnapshot = await waitForPersistedSession(freshPage, 8_000);
    } catch {
      throw new Error("Hosted QA authenticated session did not survive a fresh protected-page navigation.");
    }
    await assertNotAuthScreen(freshPage);
    if (!emailMatches(lastSnapshot, email)) {
      throw new Error("Hosted QA fresh navigation restored a session for a different user than QA_E2E_EMAIL.");
    }
    freshNavigationPersisted = true;

    await fs.mkdir(path.dirname(STORAGE_STATE_PATH), { recursive: true });
    await context.storageState({ path: STORAGE_STATE_PATH });
    await freshPage.close();

    await writeEvidence({
      schemaVersion: 1,
      status: "PASS",
      baseUrl: BASE_URL,
      timestamp: new Date().toISOString(),
      authMode,
      session: {
        accessTokenPresent: lastSnapshot.accessTokenPresent,
        refreshTokenPresent: lastSnapshot.refreshTokenPresent,
        userEmailMatchesExpected: email ? emailMatches(lastSnapshot, email) : null,
      },
      reloadPersisted,
      freshNavigationPersisted,
    });
    console.log(`Hosted QA authentication=PASS mode=${authMode} reload=${reloadPersisted === null ? "NOT_RUN" : "PASS"} fresh-navigation=PASS`);
  } finally {
    if (context) await context.close();
    await browser.close();
  }
}

try {
  await main();
} catch (error) {
  const failure = safeDetails(error);
  await writeEvidence({
    schemaVersion: 1,
    status: "FAIL",
    baseUrl: BASE_URL,
    timestamp: new Date().toISOString(),
    failure,
  });
  console.error(`Hosted QA authentication=FAIL reason=${failure}`);
  process.exitCode = 1;
}
