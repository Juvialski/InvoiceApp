import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";
import { createClient } from "@supabase/supabase-js";
import { prepareEngineeringPdf } from "../src/lib/engineeringDocumentsPersistence.ts";
// Playwright is intentionally installed by the explicit hosted-QA command or
// manual workflow, not by the ordinary application dependency set.
// @ts-ignore -- the QA-only dependency is present when this script executes.
import { chromium } from "playwright";
import { normalizeErrorMessage, normalizeFailedRequest, normalizeRequestPath, redactSensitiveText } from "./qa/structuredEvidence.ts";
import {
  assertHostedQaTarget,
  HOSTED_QA_DEPLOYMENT_READY_TIMEOUT_MS,
  createHostedQaEngineeringStorageFixture,
  createHostedQaStorageFailure,
  HOSTED_QA_ROUTE_READINESS_TIMEOUT_MS,
  hostedQaRequiredTextPresent,
  probeHostedQaStorageObject,
  sanitizeHostedQaStorageError,
  waitForHostedQaHealth,
  waitForHostedQaRouteReadiness,
  type HostedQaHealthExpectation,
  type HostedQaHealthReadiness,
  type HostedQaHealthSnapshot,
  type HostedQaStorageFailure,
} from "./qa/hostedQaContracts.ts";
import { repositoryMigrationLevel } from "../src/server/repositoryMigrationLevel.ts";

const execFile = promisify(execFileCallback);

const BASE_URL = (process.env.QA_E2E_BASE_URL || "https://hydroqualisense-qa.onrender.com").replace(/\/+$/, "");
const EXPECTED_DEPLOYMENT_ID = (process.env.QA_E2E_EXPECTED_DEPLOYMENT_ID || "qa-hydroqualisense").trim();
const EXPECTED_MIGRATION_LEVEL = (process.env.QA_E2E_EXPECTED_MIGRATION_LEVEL || "").trim();
const EXPECTED_REPOSITORY_SHA = (process.env.QA_E2E_EXPECTED_REPOSITORY_SHA || process.env.GITHUB_SHA || "").trim().toLowerCase();
const OUTPUT_DIR = path.resolve(process.env.QA_E2E_OUTPUT_DIR || "artifacts/hosted-qa");
const STORAGE_STATE_PATH = path.resolve(process.env.QA_E2E_STORAGE_STATE_PATH || ".qa-e2e/qa-storage-state.json");
const NAVIGATION_TIMEOUT_MS = 60_000;
const AUTH_FORM_TIMEOUT_MS = 20_000;
const AUTH_SESSION_TIMEOUT_MS = 15_000;

interface HostedRouteContract {
  route: string;
  heading: string | RegExp;
  requiredText: readonly string[];
}

const ROUTE_CONTRACTS: readonly HostedRouteContract[] = [
  { route: "/dashboard", heading: "Executive Dashboard", requiredText: ["Supplier document operations"] },
  { route: "/projects", heading: "Portfolio Management", requiredText: ["Portfolio snapshot"] },
  { route: "/expenses", heading: "Expenses", requiredText: ["Supplier invoices remain preserved evidence"] },
  { route: "/procurement", heading: "Procurement & Purchase Orders", requiredText: ["Purchase Orders"] },
  { route: "/warehouse", heading: "Warehouse Inventory", requiredText: ["Movement-derived stock truth"] },
  { route: "/payroll", heading: "Payroll & labor", requiredText: ["Active workers"] },
  { route: "/settings", heading: "Operational settings", requiredText: ["Regional display preferences", "AI configuration"] },
  { route: "/email-sms", heading: "Email / SMS", requiredText: ["Inbox / Intake", "Read-only Gmail intake"] },
  { route: "/documents", heading: "Documents", requiredText: ["Unified access surface", "Procurement"] },
];

interface HostedRouteEvidence {
  route: string;
  requestedUrl: string;
  finalPath: string;
  httpStatus: number | null;
  readiness: "PASS" | "TIMEOUT" | "NOT_RUN";
  readinessFailure: string | null;
  authenticated: boolean;
  qaBanner: boolean;
  deploymentCompany: boolean;
  crashText: boolean;
  bodyErrorSignal: boolean;
  consoleErrors: string[];
  pageErrors: string[];
  failedRequests: NonNullable<ReturnType<typeof normalizeFailedRequest>>[];
  assertions: Array<{ id: string; passed: boolean; details: string }>;
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
    readiness: HostedQaHealthReadiness["status"];
    readinessAttempts: number;
    readinessWaitedMs: number;
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
    documentId?: string;
    revisionId?: string;
    metadataRowsCreated?: number;
    byteCount?: number;
    sha256?: string;
    downloadedSha256?: string;
    authorizedRead?: boolean;
    cleanup?: "PASS" | "FAIL" | "NOT_RUN";
    wrongCompanyProbe: "NOT_RUN";
    failure?: HostedQaStorageFailure;
    cleanupFailure?: HostedQaStorageFailure;
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
  assertHostedQaTarget(BASE_URL, process.env.QA_E2E_ALLOW_NON_QA_HOST === "1");
}

function safeDetails(value: unknown) {
  return redactSensitiveText(normalizeErrorMessage(value));
}

async function readHealth() {
  try {
    const response = await fetch(`${BASE_URL}/api/health`, { headers: { Accept: "application/json" } });
    let body: unknown = null;
    try { body = await response.json(); } catch { /* normalize below */ }
    const release = body && typeof body === "object" && !Array.isArray(body) && "release" in body
      && (body as { release?: unknown }).release && typeof (body as { release?: unknown }).release === "object"
      ? (body as { release: Record<string, unknown> }).release
      : null;
    return { httpStatus: response.status, release } satisfies HostedQaHealthSnapshot;
  } catch (error) {
    return { httpStatus: null, release: null, failure: safeDetails(error) } satisfies HostedQaHealthSnapshot;
  }
}

async function localRepositorySha() {
  try {
    const result = await execFile("git", ["rev-parse", "HEAD"], { cwd: process.cwd() });
    return result.stdout.trim().toLowerCase();
  } catch {
    return "";
  }
}

async function expectedHealth(): Promise<HostedQaHealthExpectation> {
  const repositorySha = EXPECTED_REPOSITORY_SHA || await localRepositorySha();
  const migrationLevel = EXPECTED_MIGRATION_LEVEL || repositoryMigrationLevel() || "";
  if (!EXPECTED_DEPLOYMENT_ID || !repositorySha || !migrationLevel) {
    throw new Error("Hosted QA exact-deployment checks require a deployment ID, repository SHA, and canonical migration level.");
  }
  return { environment: "qa", deploymentId: EXPECTED_DEPLOYMENT_ID, repositorySha, migrationLevel };
}

async function waitForExactQaDeployment(expectation: HostedQaHealthExpectation) {
  const configuredTimeout = Number(process.env.QA_E2E_DEPLOYMENT_READY_TIMEOUT_MS || "");
  const timeoutMs = Number.isFinite(configuredTimeout) && configuredTimeout > 0
    ? Math.min(Math.trunc(configuredTimeout), HOSTED_QA_DEPLOYMENT_READY_TIMEOUT_MS)
    : HOSTED_QA_DEPLOYMENT_READY_TIMEOUT_MS;
  return waitForHostedQaHealth(readHealth, expectation, { timeoutMs });
}

async function waitForSignInForm(page: any) {
  const emailInput = page.locator("#auth-email");
  await emailInput.waitFor({ state: "visible", timeout: AUTH_FORM_TIMEOUT_MS });
  return emailInput;
}

async function waitForPersistedSession(page: any, timeoutMs = AUTH_SESSION_TIMEOUT_MS) {
  await page.waitForFunction(() => {
    const raw = Object.entries(localStorage).find(([key]) => key.startsWith("sb-") && key.endsWith("-auth-token"))?.[1] || "";
    if (!raw) return false;
    try {
      const parsed = JSON.parse(raw) as { access_token?: unknown; refresh_token?: unknown };
      return typeof parsed.access_token === "string" && parsed.access_token.length > 0
        && typeof parsed.refresh_token === "string" && parsed.refresh_token.length > 0;
    } catch {
      return false;
    }
  }, undefined, { timeout: timeoutMs });
}

async function assertNotAuthScreen(page: any) {
  const body = await page.locator("body").innerText().catch(() => "");
  if (body.includes("Welcome back") || body.includes("Sign in to continue")) {
    throw new Error("Hosted QA authenticated session returned to the sign-in screen.");
  }
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
    const emailInput = await waitForSignInForm(page);
    await emailInput.fill(email);
    await page.locator("#auth-password").fill(password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    try {
      await waitForPersistedSession(page);
    } catch {
      throw new Error("Hosted QA Auth sign-in did not establish a persisted Supabase session.");
    }
    await assertNotAuthScreen(page);
    await fs.mkdir(path.dirname(STORAGE_STATE_PATH), { recursive: true });
    await context.storageState({ path: STORAGE_STATE_PATH });
    await page.close();
  }
  return { context, authMode };
}

async function runRoute(context: any, contract: HostedRouteContract, expectedEmail: string) : Promise<HostedRouteEvidence> {
  const route = contract.route;
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
  let readiness: HostedRouteEvidence["readiness"] = "NOT_RUN";
  let readinessFailure: string | null = null;
  try {
    const response = await page.goto(`${BASE_URL}${route}`, { waitUntil: "domcontentloaded", timeout: NAVIGATION_TIMEOUT_MS });
    httpStatus = response?.status() ?? null;
    try {
      await waitForHostedQaRouteReadiness(page, HOSTED_QA_ROUTE_READINESS_TIMEOUT_MS);
      readiness = "PASS";
    } catch (error) {
      readiness = "TIMEOUT";
      readinessFailure = safeDetails(error);
    }
  } catch (error) {
    navigationError = safeDetails(error);
  }
  let body = await page.locator("body").innerText().catch(() => "");
  const authenticated = !body.includes("Welcome back") && !body.includes("Sign in to continue") && (expectedEmail ? body.includes(expectedEmail) : /@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(body));
  const qaBanner = body.includes("QA ENVIRONMENT · SYNTHETIC DATA ONLY");
  const deploymentCompany = body.includes("HydroQualiSense QA Synthetic");
  const crashText = /Cannot read properties of undefined|Application error|This workspace section could not be displayed/i.test(body);
  const bodyErrorSignal = /Page not found|Navigation error|could not be loaded safely|could not be displayed/i.test(body);
  const assertions: Array<{ id: string; passed: boolean; details: string }> = [];
  const failureReasons: string[] = [];
  if (navigationError || httpStatus === null || httpStatus < 200 || httpStatus >= 400) failureReasons.push("navigation_failed");
  if (readiness === "TIMEOUT") failureReasons.push("company_access_readiness_timeout");
  if (readiness === "PASS") {
    if (!authenticated) failureReasons.push("authenticated_identity_not_visible");
    if (!qaBanner) failureReasons.push("qa_banner_missing");
    if (!deploymentCompany) failureReasons.push("deployment_company_not_visible");
    const headingCount = await page.getByRole("heading", { name: contract.heading }).count();
    assertions.push({ id: `${route}-heading-visible`, passed: headingCount > 0, details: `matching route headings: ${headingCount}` });
    for (const requiredText of contract.requiredText) {
      const present = hostedQaRequiredTextPresent(body, requiredText);
      assertions.push({ id: `${route}-${requiredText.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}-visible`, passed: present, details: present ? `Found: ${requiredText}` : `Missing: ${requiredText}` });
    }
    if (route === "/settings") {
      const aiState = page.locator('[data-ai-config-state="loaded"], [data-ai-config-state="error"]');
      try {
        await aiState.first().waitFor({ state: "visible", timeout: HOSTED_QA_ROUTE_READINESS_TIMEOUT_MS });
        body = await page.locator("body").innerText().catch(() => body);
      } catch {
        // The route assertion below records the missing settings state.
      }
      const aiStatusVisible = /AI configured|AI not configured|AI configuration status is temporarily unavailable/i.test(body);
      assertions.push({ id: "settings-ai-status-visible", passed: aiStatusVisible, details: aiStatusVisible ? "AI configuration status is visible." : "AI configuration status is missing." });
      const credentialInputCount = await page.locator('input[type="password"]').count();
      const configuredHealthy = /AI configured/i.test(body) && !/needs attention/i.test(body);
      assertions.push({ id: "settings-configured-ai-hides-credential-input", passed: !configuredHealthy || credentialInputCount === 0, details: configuredHealthy ? `credential inputs: ${credentialInputCount}` : "Credential input is not required for the current AI state." });
    }
  }
  if (assertions.some((assertion) => !assertion.passed)) failureReasons.push("route_contract_assertion_failed");
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
    readiness,
    readinessFailure,
    authenticated,
    qaBanner,
    deploymentCompany,
    crashText,
    bodyErrorSignal,
    consoleErrors,
    pageErrors,
    failedRequests,
    assertions,
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
  if (!supabaseUrl || !publishableKey || /service[_-]?role|secret/i.test(publishableKey)) {
    return {
      status: "FAIL",
      wrongCompanyProbe: "NOT_RUN",
      cleanup: "NOT_RUN",
      failure: createHostedQaStorageFailure(
        "configuration",
        "configuration-error",
        "MISSING_OR_UNSAFE_CONFIG",
        "Storage probe requires a non-service-role Supabase URL and publishable key.",
      ),
    };
  }
  const page = await context.newPage();
  try {
    await page.goto(`${BASE_URL}/dashboard`, { waitUntil: "domcontentloaded", timeout: NAVIGATION_TIMEOUT_MS });
    try {
      await waitForHostedQaRouteReadiness(page, HOSTED_QA_ROUTE_READINESS_TIMEOUT_MS);
    } catch (error) {
      return {
        status: "FAIL",
        bucket,
        wrongCompanyProbe: "NOT_RUN",
        cleanup: "NOT_RUN",
        failure: createHostedQaStorageFailure("session", "readiness-timeout", "READINESS_TIMEOUT", error, "Storage probe page readiness did not resolve."),
      };
    }
    const authJson = await page.evaluate(() => Object.entries(localStorage).find(([key]) => key.startsWith("sb-") && key.endsWith("-auth-token"))?.[1] || "");
    if (!authJson) {
      return {
        status: "FAIL",
        bucket,
        wrongCompanyProbe: "NOT_RUN",
        cleanup: "NOT_RUN",
        failure: createHostedQaStorageFailure("session", "auth-session-error", "SESSION_NOT_FOUND", "Authenticated browser session storage was not available for the Storage probe."),
      };
    }
    const auth = JSON.parse(authJson) as { access_token?: string; refresh_token?: string };
    if (!auth.access_token || !auth.refresh_token) {
      return {
        status: "FAIL",
        bucket,
        wrongCompanyProbe: "NOT_RUN",
        cleanup: "NOT_RUN",
        failure: createHostedQaStorageFailure("session", "auth-session-error", "SESSION_INCOMPLETE", "Authenticated browser session storage was incomplete."),
      };
    }
    const client = createClient(supabaseUrl, publishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const session = await client.auth.setSession({ access_token: auth.access_token, refresh_token: auth.refresh_token });
    if (session.error) {
      return {
        status: "FAIL",
        bucket,
        wrongCompanyProbe: "NOT_RUN",
        cleanup: "NOT_RUN",
        failure: sanitizeHostedQaStorageError("session", session.error, "The Storage probe could not establish the authenticated Supabase session."),
      };
    }
    const company = await client.from("companies").select("id").limit(1).maybeSingle();
    if (company.error || !company.data?.id) {
      return {
        status: "FAIL",
        bucket,
        wrongCompanyProbe: "NOT_RUN",
        cleanup: "NOT_RUN",
        failure: company.error
          ? sanitizeHostedQaStorageError("company", company.error, "The authenticated company could not be resolved for the Storage probe.")
          : createHostedQaStorageFailure("company", "auth-session-error", "COMPANY_NOT_FOUND", "The authenticated company could not be resolved for the Storage probe."),
      };
    }

    // This is the same supported upload contract used by the Engineering
    // Documents controller: a real PDF, the immutable UUID-bound revision
    // path, application/pdf, and upsert=false.  The metadata RPC is not
    // called here because revisions are append-only and authenticated clients
    // have no cleanup path; the probe deliberately creates zero metadata rows.
    const bytes = new TextEncoder().encode(`%PDF-1.4\n% HydroQualiSense synthetic hosted QA document\n${new Date().toISOString()}\n`);
    const fixture = createHostedQaEngineeringStorageFixture(String(company.data.id), { uniqueSuffix: `${Date.now()}` });
    const prepared = await prepareEngineeringPdf(bytes, { fileName: fixture.fileName, contentType: "application/pdf" });
    const storageBucket = client.storage.from(bucket);
    const probe = await probeHostedQaStorageObject({
      objectPath: fixture.objectPath,
      bytes: prepared.bytes,
      bucket: {
        upload: (objectPath, body, options) => storageBucket.upload(objectPath, body, options),
        download: (objectPath) => storageBucket.download(objectPath),
        remove: (objectPaths) => storageBucket.remove(objectPaths),
      },
    });
    return {
      status: probe.status,
      bucket,
      companyPath: fixture.objectPath,
      documentId: fixture.documentId,
      revisionId: fixture.revisionId,
      metadataRowsCreated: 0,
      byteCount: probe.byteCount,
      sha256: probe.sha256,
      downloadedSha256: probe.downloadedSha256,
      authorizedRead: probe.authorizedRead,
      cleanup: probe.cleanup,
      wrongCompanyProbe: "NOT_RUN",
      ...(probe.failure ? { failure: probe.failure } : {}),
      ...(probe.cleanupFailure ? { cleanupFailure: probe.cleanupFailure } : {}),
    };
  } catch (error) {
    return {
      status: "FAIL",
      bucket,
      wrongCompanyProbe: "NOT_RUN",
      cleanup: "NOT_RUN",
      failure: sanitizeHostedQaStorageError("session", error),
    };
  } finally {
    await page.close().catch(() => undefined);
  }
}

async function main() {
  assertQaTarget();
  await fs.mkdir(path.join(OUTPUT_DIR, "screenshots"), { recursive: true });
  const expectation = await expectedHealth();
  const readiness = await waitForExactQaDeployment(expectation);
  const health: HostedQaManifest["health"] = {
    status: readiness.status === "PASS" ? "PASS" : "FAIL",
    httpStatus: readiness.snapshot.httpStatus,
    release: readiness.snapshot.release,
    failureReasons: readiness.failureReasons,
    readiness: readiness.status,
    readinessAttempts: readiness.attempts,
    readinessWaitedMs: readiness.waitedMs,
  };
  if (health.status !== "PASS") {
    const authMode = existsSync(STORAGE_STATE_PATH) ? "storage-state" as const : "email-password" as const;
    const manifest: HostedQaManifest = {
      schemaVersion: 1,
      run: { appMode: "hosted-qa", baseUrl: BASE_URL, timestamp: new Date().toISOString(), authMode, storageStatePath: path.relative(process.cwd(), STORAGE_STATE_PATH).replaceAll("\\", "/") },
      health,
      identity: { visibleAuthenticatedUser: false, visibleQaBanner: false, visibleDeploymentCompany: false, expectedDeploymentId: expectation.deploymentId },
      routes: [],
      storage: { status: "NOT_RUN", wrongCompanyProbe: "NOT_RUN", cleanup: "NOT_RUN" },
      summary: { routesPassed: 0, routesFailed: 0, consoleErrors: 0, pageErrors: 0, failedRequests: 0 },
    };
    await fs.writeFile(path.join(OUTPUT_DIR, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    const detail = health.failureReasons.join(", ") || readiness.snapshot.failure || "unknown readiness failure";
    console.error(`Hosted QA health=FAIL reason=QA deployment not ready for expected SHA ${expectation.repositorySha}: ${detail}`);
    process.exitCode = 1;
    return;
  }
  const browser = await chromium.launch({ headless: process.env.QA_E2E_HEADED !== "1" });
  let context: any = null;
  try {
    const auth = await createAuthenticatedContext(browser);
    context = auth.context;
    const expectedEmail = (process.env.QA_E2E_EMAIL || "").trim();
    const routes: HostedRouteEvidence[] = [];
    for (const contract of ROUTE_CONTRACTS) routes.push(await runRoute(context, contract, expectedEmail));
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
    console.log(`Hosted QA health=${health.status} routes=${manifest.summary.routesPassed}/${ROUTE_CONTRACTS.length} storage=${storage.status} contractFailures=${routes.reduce((sum, route) => sum + route.assertions.filter((assertion) => !assertion.passed).length, 0)}`);
    if (manifest.summary.routesFailed > 0 || storage.status === "FAIL") process.exitCode = 1;
  } finally {
    if (context) await context.close();
    await browser.close();
  }
}

await main();
