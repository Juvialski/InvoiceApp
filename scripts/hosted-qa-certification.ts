import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
// Playwright is intentionally installed by the explicit hosted-QA command or
// manual workflow, not by the ordinary application dependency set.
// @ts-ignore -- the QA-only dependency is present when this script executes.
import { chromium } from "playwright";
import { normalizeErrorMessage, normalizeFailedRequest, normalizeRequestPath, redactSensitiveText } from "./qa/structuredEvidence.ts";

const BASE_URL = (process.env.QA_E2E_BASE_URL || "https://hydroqualisense-qa.onrender.com").replace(/\/+$/, "");
const EXPECTED_DEPLOYMENT_ID = (process.env.QA_E2E_EXPECTED_DEPLOYMENT_ID || "qa-hydroqualisense").trim();
const EXPECTED_MIGRATION_LEVEL = (process.env.QA_E2E_EXPECTED_MIGRATION_LEVEL || "").trim();
const EXPECTED_REPOSITORY_SHA = (process.env.QA_E2E_EXPECTED_REPOSITORY_SHA || "").trim().toLowerCase();
const OUTPUT_DIR = path.resolve(process.env.QA_E2E_OUTPUT_DIR || "artifacts/hosted-qa");
const STORAGE_STATE_PATH = path.resolve(process.env.QA_E2E_STORAGE_STATE_PATH || ".qa-e2e/qa-storage-state.json");
const ROUTES = ["/dashboard", "/projects", "/expenses", "/procurement", "/warehouse", "/payroll", "/settings"] as const;
const NAVIGATION_TIMEOUT_MS = 60_000;
const SETTLE_DELAY_MS = 1_500;

interface HostedRouteEvidence {
  route: string;
  requestedUrl: string;
  finalPath: string;
  httpStatus: number | null;
  authenticated: boolean;
  qaBanner: boolean;
  deploymentCompany: boolean;
  crashText: boolean;
  bodyErrorSignal: boolean;
  consoleErrors: string[];
  pageErrors: string[];
  failedRequests: NonNullable<ReturnType<typeof normalizeFailedRequest>>[];
  screenshotPath: string | null;
  status: "PASS" | "FAIL";
  failureReasons: string[];
}

interface HostedQaManifest {
  schemaVersion: 1;
  run: {
    appMode: "hosted-qa";
    baseUrl: string;
    timestamp: string;
    authMode: "storage-state" | "email-password";
    storageStatePath: string;
  };
  health: {
    status: "PASS" | "FAIL";
    httpStatus: number | null;
    release: Record<string, unknown> | null;
    failureReasons: string[];
  };
  identity: {
    visibleAuthenticatedUser: boolean;
    visibleQaBanner: boolean;
    visibleDeploymentCompany: boolean;
    expectedDeploymentId: string;
  };
  routes: HostedRouteEvidence[];
  storage: {
    status: "PASS" | "NOT_RUN" | "FAIL";
    bucket?: string;
    companyPath?: string;
    byteCount?: number;
    sha256?: string;
    authorizedRead?: boolean;
    cleanup?: "PASS" | "FAIL" | "NOT_RUN";
    wrongCompanyProbe: "NOT_RUN";
    failure?: string;
  };
  summary: {
    routesPassed: number;
    routesFailed: number;
    consoleErrors: number;
    pageErrors: number;
    failedRequests: number;
  };
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

async function readHealth() {
  const reasons: string[] = [];
  let status: number | null = null;
  let release: Record<string, unknown> | null = null;
  try {
    const response = await fetch(`${BASE_URL}/api/health`, { headers: { Accept: "application/json" } });
    status = response.status;
    const body = await response.json() as { release?: Record<string, unknown> };
    release = body.release || null;
    if (!response.ok || body.release === undefined) reasons.push("health_unavailable");
    if (release?.environment !== "qa") reasons.push("environment_not_qa");
    if (EXPECTED_DEPLOYMENT_ID && release?.deploymentId !== EXPECTED_DEPLOYMENT_ID) reasons.push("deployment_id_mismatch");
    if (EXPECTED_MIGRATION_LEVEL && release?.migrationLevel !== EXPECTED_MIGRATION_LEVEL) reasons.push("migration_level_mismatch");
    if (EXPECTED_REPOSITORY_SHA && String(release?.repositorySha || "").toLowerCase() !== EXPECTED_REPOSITORY_SHA) reasons.push("repository_sha_mismatch");
  } catch (error) {
    reasons.push(`health_request_failed:${safeDetails(error)}`);
  }
  return { status: reasons.length ? "FAIL" as const : "PASS" as const, httpStatus: status, release, failureReasons: reasons };
}

async function createAuthenticatedContext(browser: any) {
  const email = (process.env.QA_E2E_EMAIL || "").trim();
  const password = process.env.QA_E2E_PASSWORD || "";
  const hasState = existsSync(STORAGE_STATE_PATH);
  if (!hasState && Boolean(email) !== Boolean(password)) throw new Error("Set both QA_E2E_EMAIL and QA_E2E_PASSWORD, or provide QA_E2E_STORAGE_STATE_PATH.");
  if (!hasState && !email) throw new Error("Hosted QA requires QA_E2E_STORAGE_STATE_PATH or the explicit QA_E2E_EMAIL/QA_E2E_PASSWORD secret pair.");

  const context = hasState
    ? await browser.newContext({ storageState: STORAGE_STATE_PATH })
    : await browser.newContext();
  const authMode = hasState ? "storage-state" as const : "email-password" as const;
  if (!hasState) {
    const page = await context.newPage();
    await page.goto(`${BASE_URL}/dashboard`, { waitUntil: "domcontentloaded", timeout: NAVIGATION_TIMEOUT_MS });
    await page.waitForTimeout(500);
    const emailInput = page.locator("#auth-email");
    if (await emailInput.count()) {
      await emailInput.fill(email);
      await page.locator("#auth-password").fill(password);
      await page.getByRole("button", { name: "Sign in", exact: true }).click();
      await page.waitForTimeout(2_000);
    }
    const body = await page.locator("body").innerText();
    if (body.includes("Welcome back") || body.includes("Sign in to continue")) throw new Error("Hosted QA Auth sign-in did not establish an authenticated session.");
    await fs.mkdir(path.dirname(STORAGE_STATE_PATH), { recursive: true });
    await context.storageState({ path: STORAGE_STATE_PATH });
    await page.close();
  }
  return { context, authMode };
}

async function runRoute(context: any, route: string, expectedEmail: string) : Promise<HostedRouteEvidence> {
  const page = await context.newPage();
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const failedRequests: NonNullable<ReturnType<typeof normalizeFailedRequest>>[] = [];
  page.on("console", (message: any) => {
    if (message.type() === "error") consoleErrors.push(safeDetails(message.text()));
  });
  page.on("pageerror", (error: unknown) => pageErrors.push(safeDetails(error)));
  page.on("response", (response: any) => {
    if (response.status() >= 400) {
      const request = response.request();
      const failure = normalizeFailedRequest({ url: request.url(), method: request.method(), resourceType: request.resourceType(), status: response.status(), statusText: response.statusText() });
      if (failure) failedRequests.push(failure);
    }
  });
  page.on("requestfailed", (request: any) => {
    const failure = normalizeFailedRequest({ url: request.url(), method: request.method(), resourceType: request.resourceType(), failureText: request.failure()?.errorText });
    if (failure) failedRequests.push(failure);
  });

  let httpStatus: number | null = null;
  let navigationError: string | null = null;
  try {
    const response = await page.goto(`${BASE_URL}${route}`, { waitUntil: "domcontentloaded", timeout: NAVIGATION_TIMEOUT_MS });
    httpStatus = response?.status() ?? null;
    await page.waitForTimeout(SETTLE_DELAY_MS);
  } catch (error) {
    navigationError = safeDetails(error);
  }
  const body = await page.locator("body").innerText().catch(() => "");
  const authenticated = !body.includes("Welcome back") && !body.includes("Sign in to continue") && (expectedEmail ? body.includes(expectedEmail) : /@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(body));
  const qaBanner = body.includes("QA ENVIRONMENT · SYNTHETIC DATA ONLY");
  const deploymentCompany = body.includes("HydroQualiSense QA Synthetic");
  const crashText = body.includes("Cannot read properties of undefined") || body.includes("Application error");
  const bodyErrorSignal = /\b(error|failed|unavailable|could not)\b/i.test(body);
  const failureReasons: string[] = [];
  if (navigationError || httpStatus === null || httpStatus < 200 || httpStatus >= 400) failureReasons.push("navigation_failed");
  if (!authenticated) failureReasons.push("authenticated_identity_not_visible");
  if (!qaBanner) failureReasons.push("qa_banner_missing");
  if (!deploymentCompany) failureReasons.push("deployment_company_not_visible");
  if (crashText) failureReasons.push("application_crash_text");
  if (bodyErrorSignal) failureReasons.push("body_error_signal");
  if (consoleErrors.length) failureReasons.push("console_errors");
  if (pageErrors.length) failureReasons.push("page_errors");
  if (failedRequests.some((request) => !request.ignored)) failureReasons.push("failed_requests");
  const screenshotPath = path.join(OUTPUT_DIR, "screenshots", `${route.replace(/\W+/g, "-").replace(/^-|-$/g, "") || "root"}.png`);
  try {
    await fs.mkdir(path.dirname(screenshotPath), { recursive: true });
    await page.screenshot({ path: screenshotPath, fullPage: true });
  } catch (error) {
    failureReasons.push("screenshot_failed");
  }
  const finalPath = new URL(page.url()).pathname;
  await page.close();
  return {
    route,
    requestedUrl: `${BASE_URL}${route}`,
    finalPath: normalizeRequestPath(finalPath),
    httpStatus,
    authenticated,
    qaBanner,
    deploymentCompany,
    crashText,
    bodyErrorSignal,
    consoleErrors,
    pageErrors,
    failedRequests,
    screenshotPath: existsSync(screenshotPath) ? path.relative(OUTPUT_DIR, screenshotPath).replaceAll("\\", "/") : null,
    status: failureReasons.length ? "FAIL" : "PASS",
    failureReasons,
  };
}

async function runStorageProbe(context: any) : Promise<HostedQaManifest["storage"]> {
  if (process.env.QA_E2E_STORAGE_PROBE !== "1") return { status: "NOT_RUN", wrongCompanyProbe: "NOT_RUN", cleanup: "NOT_RUN" };
  const supabaseUrl = (process.env.QA_E2E_SUPABASE_URL || "").trim();
  const publishableKey = (process.env.QA_E2E_SUPABASE_PUBLISHABLE_KEY || "").trim();
  const bucket = (process.env.QA_E2E_STORAGE_BUCKET || "engineering-documents").trim();
  if (!supabaseUrl || !publishableKey || /service[_-]?role|secret/i.test(publishableKey)) return { status: "FAIL", wrongCompanyProbe: "NOT_RUN", cleanup: "NOT_RUN", failure: "Storage probe requires a non-service-role Supabase URL and publishable key." };
  const page = await context.newPage();
  try {
    await page.goto(`${BASE_URL}/dashboard`, { waitUntil: "domcontentloaded", timeout: NAVIGATION_TIMEOUT_MS });
    await page.waitForTimeout(1_000);
    const authJson = await page.evaluate(() => Object.entries(localStorage).find(([key]) => key.startsWith("sb-") && key.endsWith("-auth-token"))?.[1] || "");
    if (!authJson) return { status: "FAIL", wrongCompanyProbe: "NOT_RUN", cleanup: "NOT_RUN", failure: "Authenticated browser session storage was not available for the Storage probe." };
    const auth = JSON.parse(authJson) as { access_token?: string; refresh_token?: string };
    if (!auth.access_token || !auth.refresh_token) return { status: "FAIL", wrongCompanyProbe: "NOT_RUN", cleanup: "NOT_RUN", failure: "Authenticated browser session storage was incomplete." };
    const client = createClient(supabaseUrl, publishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
    await client.auth.setSession({ access_token: auth.access_token, refresh_token: auth.refresh_token });
    const company = await client.from("companies").select("id").limit(1).maybeSingle();
    if (company.error || !company.data?.id) return { status: "FAIL", wrongCompanyProbe: "NOT_RUN", cleanup: "NOT_RUN", failure: "The authenticated company could not be resolved for the Storage probe." };
    const bytes = Buffer.from(`QA-E2E-STORAGE-${new Date().toISOString()}\nsynthetic-only\n`, "utf8");
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const objectPath = `companies/${company.data.id}/qa-e2e/${Date.now()}-${sha256.slice(0, 12)}.txt`;
    const uploaded = await client.storage.from(bucket).upload(objectPath, bytes, { contentType: "text/plain", upsert: false });
    if (uploaded.error) return { status: "FAIL", bucket, companyPath: objectPath, wrongCompanyProbe: "NOT_RUN", cleanup: "NOT_RUN", failure: "Authorized Storage upload failed." };
    const downloaded = await client.storage.from(bucket).download(objectPath);
    if (downloaded.error || !downloaded.data) return { status: "FAIL", bucket, companyPath: objectPath, byteCount: bytes.length, sha256, authorizedRead: false, wrongCompanyProbe: "NOT_RUN", cleanup: "NOT_RUN", failure: "Authorized Storage download failed." };
    const downloadedBytes = Buffer.from(await downloaded.data.arrayBuffer());
    const readMatches = downloadedBytes.equals(bytes);
    const removed = await client.storage.from(bucket).remove([objectPath]);
    return { status: readMatches ? "PASS" : "FAIL", bucket, companyPath: objectPath, byteCount: downloadedBytes.length, sha256, authorizedRead: readMatches, cleanup: removed.error ? "FAIL" : "PASS", wrongCompanyProbe: "NOT_RUN", ...(readMatches ? {} : { failure: "Downloaded Storage bytes did not match the uploaded synthetic bytes." }) };
  } catch (error) {
    return { status: "FAIL", wrongCompanyProbe: "NOT_RUN", cleanup: "NOT_RUN", failure: safeDetails(error) };
  } finally {
    await page.close();
  }
}

async function main() {
  assertQaTarget();
  await fs.mkdir(path.join(OUTPUT_DIR, "screenshots"), { recursive: true });
  const health = await readHealth();
  const browser = await chromium.launch({ headless: process.env.QA_E2E_HEADED !== "1" });
  let context: any = null;
  try {
    const auth = await createAuthenticatedContext(browser);
    context = auth.context;
    const expectedEmail = (process.env.QA_E2E_EMAIL || "").trim();
    const routes: HostedRouteEvidence[] = [];
    for (const route of ROUTES) routes.push(await runRoute(context, route, expectedEmail));
    const storage = await runStorageProbe(context);
    const identity = {
      visibleAuthenticatedUser: routes.every((route) => route.authenticated),
      visibleQaBanner: routes.every((route) => route.qaBanner),
      visibleDeploymentCompany: routes.every((route) => route.deploymentCompany),
      expectedDeploymentId: EXPECTED_DEPLOYMENT_ID,
    };
    const manifest: HostedQaManifest = {
      schemaVersion: 1,
      run: { appMode: "hosted-qa", baseUrl: BASE_URL, timestamp: new Date().toISOString(), authMode: auth.authMode, storageStatePath: path.relative(process.cwd(), STORAGE_STATE_PATH).replaceAll("\\", "/") },
      health,
      identity,
      routes,
      storage,
      summary: {
        routesPassed: routes.filter((route) => route.status === "PASS").length,
        routesFailed: routes.filter((route) => route.status === "FAIL").length,
        consoleErrors: routes.reduce((sum, route) => sum + route.consoleErrors.length, 0),
        pageErrors: routes.reduce((sum, route) => sum + route.pageErrors.length, 0),
        failedRequests: routes.reduce((sum, route) => sum + route.failedRequests.length, 0),
      },
    };
    await fs.writeFile(path.join(OUTPUT_DIR, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    console.log(`Hosted QA health=${health.status} routes=${manifest.summary.routesPassed}/${ROUTES.length} storage=${storage.status}`);
    if (health.status === "FAIL" || manifest.summary.routesFailed > 0 || storage.status === "FAIL") process.exitCode = 1;
  } finally {
    if (context) await context.close();
    await browser.close();
  }
}

await main();
