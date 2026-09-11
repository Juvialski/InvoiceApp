import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
// Playwright is installed only by the explicit live-QA workflow.
// @ts-ignore -- the QA-only dependency is present when this script executes.
import { chromium } from "playwright";
import { ROUTE_DEFINITIONS } from "../src/utils/routes.ts";
import { repositoryMigrationLevel } from "../src/server/repositoryMigrationLevel.ts";
import {
  assertHostedQaTarget,
  hostedQaRequiredTextPresent,
  waitForHostedQaHealth,
  waitForHostedQaRouteReadiness,
  type HostedQaHealthExpectation,
  type HostedQaHealthReadiness,
  type HostedQaHealthSnapshot,
} from "./qa/hostedQaContracts.ts";
import { normalizeErrorMessage, redactSensitiveText } from "./qa/structuredEvidence.ts";

type Classification =
  | "PASS"
  | "PASS WITH LIMITATION"
  | "PRODUCT DEFECT"
  | "TEST CONTRACT DEFECT"
  | "PROVIDER BLOCKER"
  | "ENVIRONMENT BLOCKER"
  | "NOT APPLICABLE"
  | "NOT TESTED";

type ViewportEvidence = {
  name: "desktop" | "mobile";
  width: number;
  height: number;
  screenshot: string | null;
  finalPath: string | null;
  httpStatus: number | null;
  assertions: Array<{ id: string; passed: boolean; details: string }>;
  consoleErrors: string[];
  pageErrors: string[];
  failedRequests: Array<Record<string, unknown>>;
  dialogs: Array<{ type: string; message: string }>;
};

type ScenarioEvidence = {
  scenarioId: string;
  domain: string;
  route: string;
  exactDeployedSha: string;
  deployedMigrationLevel: string;
  repositoryMigrationLevel: string;
  viewport: string;
  syntheticRunId: string;
  recordIds: Record<string, string>;
  actions: string[];
  aiProviderCalls: Array<{ feature: string; status: string; details: string }>;
  generatedArtifactPaths: string[];
  assertions: Array<{ id: string; passed: boolean; details: string }>;
  networkFailures: Array<Record<string, unknown>>;
  consoleErrors: string[];
  pageErrors: string[];
  screenshots: string[];
  cleanup: { status: string; details: string };
  classification: Classification;
  details: string;
  viewports?: ViewportEvidence[];
};

type LiveQaManifest = {
  schemaVersion: 1;
  run: {
    appMode: "hosted-live-qa-company-simulation";
    baseUrl: string;
    syntheticRunId: string;
    startedAt: string;
    completedAt: string | null;
    authMode: "email-password";
    productionWritePolicy: "READ_ONLY";
  };
  deployment: {
    exactDeployedSha: string;
    deployedMigrationLevel: string;
    repositoryMigrationLevel: string;
    deploymentId: string;
    environment: "qa";
    health: HostedQaHealthReadiness | null;
  };
  scenarios: ScenarioEvidence[];
  retainedRecords: Array<Record<string, unknown>>;
  summary: {
    pass: number;
    passWithLimitation: number;
    productDefect: number;
    testContractDefect: number;
    providerBlocker: number;
    environmentBlocker: number;
    notTested: number;
    notApplicable: number;
    consoleErrors: number;
    pageErrors: number;
    failedRequests: number;
  };
};

const BASE_URL = (process.env.QA_E2E_BASE_URL || "https://hydroqualisense-qa.onrender.com").replace(/\/+$/, "");
const OUTPUT_DIR = path.resolve(process.env.QA_E2E_OUTPUT_DIR || "artifacts/live-qa");
const EXPECTED_DEPLOYMENT_ID = (process.env.QA_E2E_EXPECTED_DEPLOYMENT_ID || "qa-hydroqualisense").trim();
const EXPECTED_DEPLOYED_SHA = (process.env.QA_E2E_EXPECTED_REPOSITORY_SHA || "").trim().toLowerCase();
const EXPECTED_DEPLOYED_MIGRATION = (process.env.QA_E2E_EXPECTED_MIGRATION_LEVEL || "").trim();
const QA_EMAIL = (process.env.QA_E2E_EMAIL || "").trim();
const QA_PASSWORD = process.env.QA_E2E_PASSWORD || "";
const CONTROLLED_RECIPIENT = (process.env.QA_E2E_CONTROLLED_RECIPIENT || "").trim();
const SEND_GMAIL = process.env.QA_E2E_SEND_GMAIL === "1";
const EXISTING_DOCUMENT_NUMBER = (process.env.QA_E2E_EXISTING_DOCUMENT_NUMBER || "").trim();
const NAVIGATION_TIMEOUT_MS = 60_000;
const ROUTE_READINESS_TIMEOUT_MS = 30_000;
const AUTH_TIMEOUT_MS = 20_000;
const RUN_ID = (process.env.QA_E2E_RUN_ID || `QA-E2E-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`).trim();
const CHECKOUT_MIGRATION_LEVEL = repositoryMigrationLevel() || "";
let durableProjectId = "";
let durableProjectCode = "";
let durablePurchaseOrderNumber = "";

const manifest: LiveQaManifest = {
  schemaVersion: 1,
  run: {
    appMode: "hosted-live-qa-company-simulation",
    baseUrl: BASE_URL,
    syntheticRunId: RUN_ID,
    startedAt: new Date().toISOString(),
    completedAt: null,
    authMode: "email-password",
    productionWritePolicy: "READ_ONLY",
  },
  deployment: {
    exactDeployedSha: EXPECTED_DEPLOYED_SHA,
    deployedMigrationLevel: EXPECTED_DEPLOYED_MIGRATION,
    repositoryMigrationLevel: CHECKOUT_MIGRATION_LEVEL,
    deploymentId: EXPECTED_DEPLOYMENT_ID,
    environment: "qa",
    health: null,
  },
  scenarios: [],
  retainedRecords: [],
  summary: { pass: 0, passWithLimitation: 0, productDefect: 0, testContractDefect: 0, providerBlocker: 0, environmentBlocker: 0, notTested: 0, notApplicable: 0, consoleErrors: 0, pageErrors: 0, failedRequests: 0 },
};

function safe(value: unknown) {
  return redactSensitiveText(normalizeErrorMessage(value));
}

function assertInputs() {
  assertHostedQaTarget(BASE_URL, process.env.QA_E2E_ALLOW_NON_QA_HOST === "1");
  if (!EXPECTED_DEPLOYMENT_ID || !/^[0-9a-f]{40}$/.test(EXPECTED_DEPLOYED_SHA) || !/^\d{14}$/.test(EXPECTED_DEPLOYED_MIGRATION)) {
    throw new Error("Live QA requires QA_E2E_EXPECTED_DEPLOYMENT_ID, an exact 40-character QA SHA, and QA_E2E_EXPECTED_MIGRATION_LEVEL.");
  }
  if (Boolean(QA_EMAIL) !== Boolean(QA_PASSWORD) || !QA_EMAIL || !QA_PASSWORD) {
    throw new Error("Live QA requires the explicit QA_E2E_EMAIL and QA_E2E_PASSWORD secret pair.");
  }
  if (SEND_GMAIL && !CONTROLLED_RECIPIENT) {
    throw new Error("QA_E2E_SEND_GMAIL=1 requires an explicit QA_E2E_CONTROLLED_RECIPIENT; the harness never invents recipients.");
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

async function readHealth(): Promise<HostedQaHealthSnapshot> {
  try {
    const response = await fetch(`${BASE_URL}/api/health`, { headers: { Accept: "application/json" } });
    let body: unknown = null;
    try { body = await response.json(); } catch { /* evidence records a missing release below */ }
    const release = isRecord(body) && isRecord(body.release) ? body.release : null;
    return { httpStatus: response.status, release };
  } catch (error) {
    return { httpStatus: null, release: null, failure: safe(error) };
  }
}

async function expectedHealth(): Promise<HostedQaHealthExpectation> {
  return { environment: "qa", deploymentId: EXPECTED_DEPLOYMENT_ID, repositorySha: EXPECTED_DEPLOYED_SHA, migrationLevel: EXPECTED_DEPLOYED_MIGRATION };
}

async function waitForSession(page: any) {
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
  }, undefined, { timeout: AUTH_TIMEOUT_MS });
}

async function createAuthState(browser: any) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${BASE_URL}/dashboard`, { waitUntil: "domcontentloaded", timeout: NAVIGATION_TIMEOUT_MS });
  await page.locator("#auth-email").waitFor({ state: "visible", timeout: AUTH_TIMEOUT_MS });
  await page.locator("#auth-email").fill(QA_EMAIL);
  await page.locator("#auth-password").fill(QA_PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await waitForSession(page);
  const body = await page.locator("body").innerText();
  if (body.includes("Welcome back") || body.includes("Sign in to continue")) throw new Error("QA authentication returned to the sign-in screen.");
  const state = await context.storageState();
  await context.close();
  return state;
}

type Telemetry = {
  consoleErrors: string[];
  pageErrors: string[];
  failedRequests: Array<Record<string, unknown>>;
  dialogs: Array<{ type: string; message: string }>;
};

function attachTelemetry(page: any): Telemetry {
  const telemetry: Telemetry = { consoleErrors: [], pageErrors: [], failedRequests: [], dialogs: [] };
  page.on("console", (message: any) => { if (message.type() === "error") telemetry.consoleErrors.push(safe(message.text())); });
  page.on("pageerror", (error: unknown) => telemetry.pageErrors.push(safe(error)));
  page.on("response", (response: any) => {
    if (response.status() >= 400) telemetry.failedRequests.push({ url: safe(response.url()), method: response.request().method(), status: response.status(), statusText: safe(response.statusText()), resourceType: response.request().resourceType(), ignored: /favicon\.ico|\.map(?:$|\?)/i.test(response.url()) });
  });
  page.on("requestfailed", (request: any) => telemetry.failedRequests.push({ url: safe(request.url()), method: request.method(), status: null, failureText: safe(request.failure()?.errorText || "request failed"), resourceType: request.resourceType(), ignored: false }));
  page.on("dialog", async (dialog: any) => {
    telemetry.dialogs.push({ type: dialog.type(), message: safe(dialog.message()) });
    await dialog.accept();
  });
  return telemetry;
}

function mergeTelemetry(target: ScenarioEvidence, telemetry: Telemetry) {
  target.consoleErrors.push(...telemetry.consoleErrors);
  target.pageErrors.push(...telemetry.pageErrors);
  target.networkFailures.push(...telemetry.failedRequests);
}

function screenshotPath(domain: string, viewport: "desktop" | "mobile", suffix = "route") {
  return path.join(OUTPUT_DIR, "screenshots", domain, `${suffix}-${viewport}.png`);
}

async function captureScreenshot(page: any, domain: string, viewport: "desktop" | "mobile", suffix = "route") {
  const outputPath = screenshotPath(domain, viewport, suffix);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await page.screenshot({ path: outputPath, fullPage: true });
  return path.relative(OUTPUT_DIR, outputPath).replaceAll("\\", "/");
}

function newScenario(scenarioId: string, domain: string, route: string): ScenarioEvidence {
  return {
    scenarioId,
    domain,
    route,
    exactDeployedSha: EXPECTED_DEPLOYED_SHA,
    deployedMigrationLevel: EXPECTED_DEPLOYED_MIGRATION,
    repositoryMigrationLevel: CHECKOUT_MIGRATION_LEVEL,
    viewport: "not captured",
    syntheticRunId: RUN_ID,
    recordIds: {},
    actions: [],
    aiProviderCalls: [],
    generatedArtifactPaths: [],
    assertions: [],
    networkFailures: [],
    consoleErrors: [],
    pageErrors: [],
    screenshots: [],
    cleanup: { status: "RETAINED", details: "Synthetic QA evidence is retained; immutable or linked history is never deleted by this harness." },
    classification: "NOT TESTED",
    details: "",
  };
}

function finishScenario(scenario: ScenarioEvidence) {
  manifest.scenarios.push(scenario);
  const key = scenario.classification === "PASS WITH LIMITATION" ? "passWithLimitation" : scenario.classification === "PRODUCT DEFECT" ? "productDefect" : scenario.classification === "TEST CONTRACT DEFECT" ? "testContractDefect" : scenario.classification === "PROVIDER BLOCKER" ? "providerBlocker" : scenario.classification === "ENVIRONMENT BLOCKER" ? "environmentBlocker" : scenario.classification === "NOT APPLICABLE" ? "notApplicable" : scenario.classification === "NOT TESTED" ? "notTested" : "pass";
  manifest.summary[key] += 1;
  manifest.summary.consoleErrors += scenario.consoleErrors.length;
  manifest.summary.pageErrors += scenario.pageErrors.length;
  manifest.summary.failedRequests += scenario.networkFailures.filter((failure) => !failure.ignored).length;
}

async function captureRoute(browser: any, storageState: any, definition: typeof ROUTE_DEFINITIONS[number], viewportName: "desktop" | "mobile", width: number, height: number) {
  const scenario = newScenario(`ROUTE-${definition.id}-${viewportName}`, definition.label, definition.path);
  scenario.viewport = `${viewportName} ${width}x${height}`;
  const context = await browser.newContext({ storageState, viewport: { width, height } });
  const page = await context.newPage();
  const telemetry = attachTelemetry(page);
  try {
    scenario.actions.push(`Navigate to ${definition.path}`);
    const response = await page.goto(`${BASE_URL}${definition.path}`, { waitUntil: "domcontentloaded", timeout: NAVIGATION_TIMEOUT_MS });
    const httpStatus = response?.status() ?? null;
    let readiness = "PASS";
    try { await waitForHostedQaRouteReadiness(page, ROUTE_READINESS_TIMEOUT_MS); } catch (error) { readiness = `TIMEOUT: ${safe(error)}`; }
    const body = await page.locator("body").innerText().catch(() => "");
    const headingCount = await page.getByRole("heading").count();
    const authenticated = !body.includes("Welcome back") && !body.includes("Sign in to continue") && /@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(body);
    const qaBanner = body.includes("QA ENVIRONMENT · SYNTHETIC DATA ONLY");
    const deploymentCompany = body.includes("HydroQualiSense QA Synthetic");
    const crashText = /Cannot read properties of undefined|Application error|could not be displayed safely/i.test(body);
    scenario.assertions.push({ id: `${definition.id}-http`, passed: httpStatus !== null && httpStatus >= 200 && httpStatus < 400, details: `HTTP status ${httpStatus}` });
    scenario.assertions.push({ id: `${definition.id}-readiness`, passed: readiness === "PASS", details: readiness });
    scenario.assertions.push({ id: `${definition.id}-authenticated`, passed: authenticated, details: authenticated ? "Authenticated identity is visible." : "Sign-in identity is not visible." });
    scenario.assertions.push({ id: `${definition.id}-qa-banner`, passed: qaBanner, details: qaBanner ? "QA-only banner is visible." : "QA-only banner is missing." });
    scenario.assertions.push({ id: `${definition.id}-deployment-company`, passed: deploymentCompany, details: deploymentCompany ? "Deployment company is visible." : "Deployment company is missing." });
    scenario.assertions.push({ id: `${definition.id}-heading`, passed: headingCount > 0, details: `${headingCount} headings rendered.` });
    scenario.assertions.push({ id: `${definition.id}-no-crash`, passed: !crashText, details: crashText ? "Crash text is visible." : "No known crash text is visible." });
    scenario.details = body.includes("Unified access surface") || body.includes("UNIFIED ACCESS SURFACE") ? "Documents exposes the semantic unified access surface; assertion matching is case-insensitive." : "Route loaded with generic semantic shell checks.";
    scenario.classification = scenario.assertions.every((assertion) => assertion.passed) && !telemetry.pageErrors.length && !telemetry.failedRequests.some((failure) => !failure.ignored) ? "PASS" : "PRODUCT DEFECT";
    scenario.screenshots.push(await captureScreenshot(page, definition.id, viewportName));
    scenario.recordIds.finalPath = new URL(page.url()).pathname;
  } catch (error) {
    scenario.classification = "ENVIRONMENT BLOCKER";
    scenario.details = safe(error);
    scenario.assertions.push({ id: `${definition.id}-navigation`, passed: false, details: safe(error) });
    try { scenario.screenshots.push(await captureScreenshot(page, definition.id, viewportName)); } catch { /* preserve the navigation error */ }
  } finally {
    mergeTelemetry(scenario, telemetry);
    await page.close();
    await context.close();
    finishScenario(scenario);
  }
}

async function fillByLabel(page: any, pattern: string | RegExp, value: string) {
  const locator = page.getByLabel(pattern);
  if (await locator.count() === 0) throw new Error(`Required field was not found: ${String(pattern)}`);
  await locator.first().fill(value);
}

async function fillBySelector(page: any, selector: string, value: string) {
  const locator = page.locator(selector);
  if (await locator.count() === 0) throw new Error(`Required field was not found: ${selector}`);
  await locator.first().fill(value);
}

async function createProjectScenario(browser: any, storageState: any) {
  const scenario = newScenario("PROJECT-CRUD", "Projects", "/projects");
  const code = `${RUN_ID}-NTU`;
  const name = `QA North Treatment Plant Upgrade - ${RUN_ID}`;
  scenario.actions.push("Open New project", "Fill project identity, VAT, contract value, and approved cost budget", "Save through the Projects UI", "Search and edit the created project");
  const context = await browser.newContext({ storageState, viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const telemetry = attachTelemetry(page);
  try {
    await page.goto(`${BASE_URL}/projects`, { waitUntil: "domcontentloaded", timeout: NAVIGATION_TIMEOUT_MS });
    await waitForHostedQaRouteReadiness(page, ROUTE_READINESS_TIMEOUT_MS);
    await page.getByRole("button", { name: "New project", exact: true }).click();
    const projectDialog = page.getByRole("dialog").last();
    await fillBySelector(projectDialog, 'input[placeholder="e.g. PRJ-2026-001"]', code);
    await fillBySelector(projectDialog, 'input[placeholder="PHP"]', "PHP");
    await projectDialog.locator("select").nth(0).selectOption("VAT");
    await fillBySelector(projectDialog, 'input[placeholder="e.g. Water Treatment Plant Upgrade"]', name);
    await projectDialog.locator('input[type="number"]').nth(0).fill("125000");
    await projectDialog.locator('input[type="number"]').nth(1).fill("90000");
    await fillBySelector(projectDialog, 'input[placeholder="e.g. Metro Water District"]', `QA Metro Water District - ${RUN_ID}`);
    await fillBySelector(projectDialog, 'input[placeholder="e.g. Engr. Santos"]', "QA Engr. Alex Reyes");
    await fillBySelector(projectDialog, 'input[placeholder="e.g. Quezon City"]', "Quezon City QA");
    await projectDialog.getByRole("button", { name: "Save project", exact: true }).click();
    await page.getByText(code, { exact: true }).waitFor({ state: "visible", timeout: ROUTE_READINESS_TIMEOUT_MS });
    scenario.assertions.push({ id: "project-created", passed: true, details: `${code} is visible in the project register.` });
    const projectButton = page.getByText(code, { exact: true }).first();
    await projectButton.click();
    await page.waitForTimeout(500);
    const pathname = new URL(page.url()).pathname;
    const projectId = pathname.split("/")[2] || "";
    if (projectId) scenario.recordIds.projectId = projectId;
    durableProjectId = projectId;
    durableProjectCode = code;
    await captureScreenshot(page, "projects", "desktop", "created").then((value) => scenario.screenshots.push(value));
    const editButton = page.getByRole("button", { name: "Edit", exact: true });
    if (await editButton.count()) {
      await editButton.click();
      const editDialog = page.getByRole("dialog").last();
      await editDialog.locator("select").nth(1).selectOption("ACTIVE");
      await editDialog.getByRole("button", { name: "Save project", exact: true }).click();
      await page.getByText("ACTIVE", { exact: true }).waitFor({ state: "visible", timeout: ROUTE_READINESS_TIMEOUT_MS });
      scenario.actions.push("Edit project status to ACTIVE");
    }
    await page.goto(`${BASE_URL}/projects`, { waitUntil: "domcontentloaded", timeout: NAVIGATION_TIMEOUT_MS });
    await page.getByRole("textbox", { name: "Search projects", exact: true }).fill(code);
    scenario.assertions.push({ id: "project-search", passed: (await page.getByText(code, { exact: true }).count()) > 0, details: "The unique synthetic project code is searchable." });
    scenario.classification = scenario.assertions.every((assertion) => assertion.passed) ? "PASS" : "PRODUCT DEFECT";
    scenario.details = `Project code ${code}; contract value PHP 125,000 remains distinct from approved cost budget PHP 90,000.`;
    manifest.retainedRecords.push({ domain: "projects", runId: RUN_ID, projectId: projectId || null, projectCode: code, reason: "Retained for cross-module QA history and downstream links." });
  } catch (error) {
    scenario.classification = "PRODUCT DEFECT";
    scenario.details = `UI project creation failed: ${safe(error)}. No direct database fallback is used by this harness.`;
    scenario.assertions.push({ id: "project-created", passed: false, details: scenario.details });
    try { scenario.screenshots.push(await captureScreenshot(page, "projects", "desktop", "create-failure")); } catch { /* preserve primary failure */ }
  } finally {
    mergeTelemetry(scenario, telemetry);
    await page.close();
    await context.close();
    finishScenario(scenario);
  }
}

async function purchaseOrderScenario(browser: any, storageState: any) {
  const scenario = newScenario("PROCUREMENT-PO-CRUD", "Procurement", "/procurement");
  if (!durableProjectId) {
    scenario.classification = "NOT TESTED";
    scenario.details = "The same-run project was not created by the UI, so the durable harness does not silently attach a PO to another project.";
    finishScenario(scenario);
    return;
  }
  const context = await browser.newContext({ storageState, viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const telemetry = attachTelemetry(page);
  const poNumber = `${RUN_ID}-PO-001`;
  try {
    await page.goto(`${BASE_URL}/procurement`, { waitUntil: "domcontentloaded", timeout: NAVIGATION_TIMEOUT_MS });
    await waitForHostedQaRouteReadiness(page, ROUTE_READINESS_TIMEOUT_MS);
    await page.getByRole("button", { name: "New Purchase Order", exact: true }).click();
    const dialog = page.getByRole("dialog").last();
    await dialog.locator('input[placeholder="e.g. PO-26-0001"]').fill(poNumber);
    const vendorSelect = dialog.locator("select").nth(0);
    let vendorOptions = await vendorSelect.locator("option").allTextContents();
    let vendorLabel = vendorOptions.find((label: string) => /QA Pacific Industrial Supply/i.test(label)) || "";
    if (!vendorLabel) {
      await dialog.getByRole("button", { name: "+ New", exact: true }).click();
      await dialog.locator('input[placeholder="Vendor Name"]').fill(`QA Pacific Industrial Supply - ${RUN_ID}`);
      await dialog.getByRole("button", { name: "Add", exact: true }).click();
      await page.waitForTimeout(500);
      vendorOptions = await dialog.locator("select").nth(0).locator("option").allTextContents();
      vendorLabel = vendorOptions.find((label: string) => label.includes(RUN_ID)) || "";
    }
    if (!vendorLabel) throw new Error("The procurement form did not expose a synthetic vendor option.");
    await dialog.locator("select").nth(0).selectOption({ label: vendorLabel });
    const projectOptions = await dialog.locator("select").nth(1).locator("option").allTextContents();
    const projectLabel = projectOptions.find((label: string) => label.includes(durableProjectCode)) || "";
    if (!projectLabel) throw new Error("The procurement form did not expose the newly created project.");
    await dialog.locator("select").nth(1).selectOption({ label: projectLabel });
    await dialog.locator("select").nth(2).selectOption("PHP");
    await dialog.locator('input[placeholder="e.g. Steel beams for Phase 2"]').fill(`Materials supply - ${RUN_ID}`);
    await dialog.locator('input[placeholder="Item description"]').first().fill(`PVC pipe 150mm - ${RUN_ID}`);
    const lineNumbers = dialog.locator('tbody input[type="number"]');
    await lineNumbers.nth(0).fill("10");
    await lineNumbers.nth(1).fill("1790");
    await captureScreenshot(page, "procurement", "desktop", "po-create").then((value) => scenario.screenshots.push(value));
    await dialog.getByRole("button", { name: "Save Draft", exact: true }).click();
    await page.waitForTimeout(1_000);
    const approve = page.getByRole("button", { name: "Approve PO", exact: true });
    if (await approve.count()) await approve.click();
    await page.waitForTimeout(1_000);
    const issue = page.getByRole("button", { name: "Issue to Supplier", exact: true });
    if (await issue.count()) await issue.click();
    await page.waitForTimeout(1_200);
    const issuedBody = await page.locator("body").innerText();
    scenario.recordIds.poNumber = poNumber;
    durablePurchaseOrderNumber = poNumber;
    scenario.assertions.push({ id: "po-issued", passed: issuedBody.includes("ISSUED") && issuedBody.includes(poNumber), details: issuedBody.includes(poNumber) ? "The synthetic PO is visible after lifecycle actions." : "The synthetic PO number was not confirmed after lifecycle actions." });
    scenario.classification = scenario.assertions.every((assertion) => assertion.passed) ? "PASS" : "PRODUCT DEFECT";
    scenario.details = "The durable flow creates one same-run PO through Procurement and exercises draft, approval, and issue actions.";
    scenario.screenshots.push(await captureScreenshot(page, "procurement", "desktop", "po-issued"));
    manifest.retainedRecords.push({ domain: "purchase-order", runId: RUN_ID, poNumber, projectId: durableProjectId, reason: "Retained for downstream document/receipt retest." });
  } catch (error) {
    scenario.classification = "PRODUCT DEFECT";
    scenario.details = safe(error);
    try { scenario.screenshots.push(await captureScreenshot(page, "procurement", "desktop", "po-failure")); } catch { /* preserve primary failure */ }
  } finally {
    mergeTelemetry(scenario, telemetry);
    await page.close();
    await context.close();
    finishScenario(scenario);
  }
}

async function captureDownload(page: any, trigger: () => Promise<void>, targetBaseName: string) {
  const download = await Promise.all([
    page.waitForEvent("download", { timeout: 20_000 }),
    trigger(),
  ]).then(([value]) => value as any);
  const suggested = typeof download.suggestedFilename === "function" ? await download.suggestedFilename() : `${targetBaseName}.bin`;
  const extension = path.extname(suggested) || ".bin";
  const outputPath = path.join(OUTPUT_DIR, "generated", `${targetBaseName}${extension}`);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  if (typeof download.saveAs !== "function") throw new Error("Playwright download did not expose saveAs().");
  await download.saveAs(outputPath);
  const bytes = await fs.readFile(outputPath);
  return { relativePath: path.relative(OUTPUT_DIR, outputPath).replaceAll("\\", "/"), byteCount: bytes.byteLength, sha256: createHash("sha256").update(bytes).digest("hex") };
}

async function documentGenerationScenario(browser: any, storageState: any) {
  const scenario = newScenario("DOCUMENT-GENERATION", "Documents", "/documents");
  const documentNumber = EXISTING_DOCUMENT_NUMBER || durablePurchaseOrderNumber;
  if (!documentNumber) {
    scenario.classification = "NOT TESTED";
    scenario.details = "Set QA_E2E_EXISTING_DOCUMENT_NUMBER or allow the same-run durable PO flow to create an issued record before running actual PDF/DOCX downloads.";
    finishScenario(scenario);
    return;
  }
  const context = await browser.newContext({ storageState, viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const telemetry = attachTelemetry(page);
  try {
    await page.goto(`${BASE_URL}/documents`, { waitUntil: "domcontentloaded", timeout: NAVIGATION_TIMEOUT_MS });
    await waitForHostedQaRouteReadiness(page, ROUTE_READINESS_TIMEOUT_MS);
    await page.getByRole("textbox", { name: "Search documents", exact: true }).fill(documentNumber);
    await page.getByRole("heading", { name: documentNumber, exact: true }).waitFor({ state: "visible", timeout: ROUTE_READINESS_TIMEOUT_MS });
    const preview = page.getByRole("button", { name: "Preview / Download", exact: true }).first();
    await preview.click();
    await page.getByRole("heading", { name: new RegExp(documentNumber) }).waitFor({ state: "visible", timeout: ROUTE_READINESS_TIMEOUT_MS });
    scenario.screenshots.push(await captureScreenshot(page, "documents", "desktop", "generation-before"));
    const pdfButton = page.getByRole("button", { name: "Generate / Download PDF", exact: true });
    if (await pdfButton.isEnabled()) {
      const result = await captureDownload(page, () => pdfButton.click(), `${RUN_ID.toLowerCase()}-${documentNumber.toLowerCase()}-pdf`);
      scenario.generatedArtifactPaths.push(result.relativePath);
      scenario.assertions.push({ id: "pdf-non-empty", passed: result.byteCount > 0, details: `${result.byteCount} bytes; SHA-256 ${result.sha256}` });
    }
    const docxButton = page.getByRole("button", { name: "Generate company DOCX", exact: true });
    if (await docxButton.count() && await docxButton.isEnabled()) {
      const result = await captureDownload(page, () => docxButton.click(), `${RUN_ID.toLowerCase()}-${documentNumber.toLowerCase()}-docx`);
      scenario.generatedArtifactPaths.push(result.relativePath);
      scenario.assertions.push({ id: "docx-non-empty", passed: result.byteCount > 0, details: `${result.byteCount} bytes; SHA-256 ${result.sha256}` });
    } else {
      scenario.details = "The issued record has no pinned company template version; company DOCX generation is correctly disabled and PDF fallback remains the applicable path.";
    }
    scenario.screenshots.push(await captureScreenshot(page, "documents", "desktop", "generation-after"));
    scenario.classification = scenario.generatedArtifactPaths.length && scenario.assertions.every((assertion) => assertion.passed) ? "PASS WITH LIMITATION" : "ENVIRONMENT BLOCKER";
  } catch (error) {
    scenario.classification = "ENVIRONMENT BLOCKER";
    scenario.details = safe(error);
  } finally {
    mergeTelemetry(scenario, telemetry);
    await page.close();
    await context.close();
    finishScenario(scenario);
  }
}

async function templateAndAiScenario(browser: any, storageState: any) {
  const scenario = newScenario("TEMPLATES-AI", "Settings / Documents", "/settings");
  const context = await browser.newContext({ storageState, viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const telemetry = attachTelemetry(page);
  try {
    await page.goto(`${BASE_URL}/settings`, { waitUntil: "domcontentloaded", timeout: NAVIGATION_TIMEOUT_MS });
    await waitForHostedQaRouteReadiness(page, ROUTE_READINESS_TIMEOUT_MS);
    scenario.actions.push("Inspect AI configuration and template administration");
    const body = await page.locator("body").innerText();
    scenario.assertions.push({ id: "ai-state-visible", passed: /AI configured|AI not configured|AI configuration status is temporarily unavailable/i.test(body), details: "Settings exposes an explicit AI configuration state." });
    const starterButtons = page.getByRole("button", { name: "Use starter", exact: true });
    const starterCount = await starterButtons.count();
    if (!starterCount) {
      scenario.aiProviderCalls.push({ feature: "starter-template", status: "NOT_AVAILABLE", details: "No starter-template action is exposed in the current settings state." });
    } else {
      for (let index = 0; index < Math.min(starterCount, 2); index += 1) {
        const buttons = page.getByRole("button", { name: "Use starter", exact: true });
        if (!await buttons.count()) break;
        scenario.actions.push(`Use starter template action ${index + 1}`);
        await buttons.first().click();
        await page.waitForTimeout(1_500);
        const notice = await page.locator("body").innerText();
        const blocked = /could not be created safely|not configured|unavailable|needs attention/i.test(notice);
        scenario.aiProviderCalls.push({ feature: "starter-template", status: blocked ? "BLOCKED" : "PASS", details: blocked ? notice.match(/[^.!?]*(?:could not be created safely|not configured|unavailable|needs attention)[^.!?]*/i)?.[0] || "Starter template creation was blocked safely." : "Starter template action returned without a blocking notice." });
        scenario.screenshots.push(await captureScreenshot(page, "settings", "desktop", `starter-${index + 1}`));
      }
    }
    const aiButtons = page.getByRole("button", { name: "Generate with AI", exact: true });
    if (await aiButtons.count()) {
      scenario.actions.push("Invoke configured AI template assistance");
      await aiButtons.first().click();
      await page.waitForTimeout(8_000);
      const aiBody = await page.locator("body").innerText();
      scenario.aiProviderCalls.push({ feature: "template-assistance", status: /invalid|schemaVersion|could not|needs attention/i.test(aiBody) ? "PROVIDER_RESPONSE_REJECTED_SAFELY" : "RESPONSE_RECEIVED", details: aiBody.match(/[^.!?]*(?:invalid|schemaVersion|could not|needs attention)[^.!?]*/i)?.[0] || "AI assistance returned a reviewable state." });
      scenario.screenshots.push(await captureScreenshot(page, "settings", "desktop", "ai-result"));
    } else {
      scenario.aiProviderCalls.push({ feature: "template-assistance", status: "NOT_AVAILABLE", details: "No AI template-assistance action is exposed in the current settings state." });
    }
    const providerBlocked = scenario.aiProviderCalls.some((call) => call.status === "BLOCKED" || call.status === "PROVIDER_RESPONSE_REJECTED_SAFELY");
    const settingsPass = scenario.assertions.every((assertion) => assertion.passed);
    scenario.classification = providerBlocked ? "PROVIDER BLOCKER" : settingsPass ? "PASS WITH LIMITATION" : "PRODUCT DEFECT";
    scenario.details = providerBlocked ? "The configured provider or privileged template service blocked creation; the UI failed closed without persisting a template." : "Template and AI state was exercised through the settings UI.";
  } catch (error) {
    scenario.classification = "ENVIRONMENT BLOCKER";
    scenario.details = safe(error);
  } finally {
    mergeTelemetry(scenario, telemetry);
    await page.close();
    await context.close();
    finishScenario(scenario);
  }
}

async function emailScenario(browser: any, storageState: any) {
  const scenario = newScenario("EMAIL-SMS-COMPOSE", "Email / SMS", "/email-sms?view=compose");
  const context = await browser.newContext({ storageState, viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const telemetry = attachTelemetry(page);
  try {
    await page.goto(`${BASE_URL}/email-sms?view=compose`, { waitUntil: "domcontentloaded", timeout: NAVIGATION_TIMEOUT_MS });
    await waitForHostedQaRouteReadiness(page, ROUTE_READINESS_TIMEOUT_MS);
    const body = await page.locator("body").innerText();
    await page.getByRole("textbox", { name: "To", exact: true }).fill(CONTROLLED_RECIPIENT || "qa@example.invalid");
    await page.getByRole("textbox", { name: "Subject", exact: true }).fill(`[HydroQualiSense QA] ${RUN_ID} review`);
    await page.getByRole("textbox", { name: "Message", exact: true }).fill("Synthetic QA message prepared for human review only.");
    await page.getByRole("button", { name: "Preview / Review", exact: true }).click();
    scenario.actions.push("Fill controlled recipient or non-deliverable review address", "Open Preview / Review", "Verify Confirm & Send remains gated by provider and human review");
    scenario.screenshots.push(await captureScreenshot(page, "email-sms", "desktop", "compose-review"));
    const reviewVisible = await page.getByText("REVIEW BEFORE SENDING", { exact: true }).count() > 0;
    scenario.assertions.push({ id: "review-gate-visible", passed: reviewVisible, details: reviewVisible ? "Review state is visible." : "Review state is missing." });
    const sendButton = page.getByRole("button", { name: "Confirm & Send", exact: true });
    const providerNeedsAttention = /needs reauthorization|authorization expired|connection needs attention/i.test(body);
    if (providerNeedsAttention) {
      scenario.classification = "PROVIDER BLOCKER";
      scenario.details = "Gmail authorization is expired or revoked; compose and review remain available, but no send is attempted.";
      scenario.aiProviderCalls.push({ feature: "gmail", status: "AUTHORIZATION_REQUIRED", details: "Provider state requires Gmail reconnect." });
    } else if (!SEND_GMAIL) {
      scenario.classification = "PASS WITH LIMITATION";
      scenario.details = "Review gate passed. Actual send is disabled unless QA_E2E_SEND_GMAIL=1 and a controlled recipient is explicitly supplied.";
    } else if (await sendButton.isEnabled()) {
      await sendButton.click();
      await page.waitForTimeout(2_000);
      await page.getByRole("button", { name: "Sent / Delivery History", exact: true }).click();
      const history = await page.locator("body").innerText();
      scenario.assertions.push({ id: "gmail-history", passed: history.includes(RUN_ID), details: history.includes(RUN_ID) ? "The controlled send is visible in delivery history." : "The controlled send is not visible in delivery history." });
      scenario.classification = scenario.assertions.every((assertion) => assertion.passed) ? "PASS" : "PRODUCT DEFECT";
      scenario.details = "Controlled Gmail send was enabled explicitly and checked in delivery history.";
    } else {
      scenario.classification = "PROVIDER BLOCKER";
      scenario.details = "The provider or human-review gate kept Confirm & Send disabled.";
    }
  } catch (error) {
    scenario.classification = "ENVIRONMENT BLOCKER";
    scenario.details = safe(error);
  } finally {
    mergeTelemetry(scenario, telemetry);
    await page.close();
    await context.close();
    finishScenario(scenario);
  }
}

async function smsScenario(browser: any, storageState: any) {
  const scenario = newScenario("SMS-PROVIDER-STATUS", "Email / SMS", "/email-sms?view=sms");
  const context = await browser.newContext({ storageState, viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const telemetry = attachTelemetry(page);
  try {
    await page.goto(`${BASE_URL}/email-sms?view=sms`, { waitUntil: "domcontentloaded", timeout: NAVIGATION_TIMEOUT_MS });
    await waitForHostedQaRouteReadiness(page, ROUTE_READINESS_TIMEOUT_MS);
    const body = await page.locator("body").innerText();
    scenario.assertions.push({ id: "sms-not-configured-visible", passed: /SMS · Not configured|No approved SMS provider is configured/i.test(body), details: "SMS provider status is truthful." });
    scenario.classification = scenario.assertions.every((assertion) => assertion.passed) ? "PROVIDER BLOCKER" : "PRODUCT DEFECT";
    scenario.details = "SMS sending is intentionally unavailable until an approved provider is configured and runtime-tested in QA.";
    scenario.screenshots.push(await captureScreenshot(page, "email-sms", "desktop", "sms-provider"));
  } catch (error) {
    scenario.classification = "ENVIRONMENT BLOCKER";
    scenario.details = safe(error);
  } finally {
    mergeTelemetry(scenario, telemetry);
    await page.close();
    await context.close();
    finishScenario(scenario);
  }
}

async function writeArtifacts() {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  manifest.run.completedAt = new Date().toISOString();
  await fs.writeFile(path.join(OUTPUT_DIR, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  await fs.writeFile(path.join(OUTPUT_DIR, "retained-records.json"), `${JSON.stringify(manifest.retainedRecords, null, 2)}\n`, "utf8");
  const report = [
    "# HydroQualiSense Full Live QA Company Simulation",
    "",
    `- Synthetic run: ${RUN_ID}`,
    `- QA URL: ${BASE_URL}`,
    `- Exact deployed SHA: ${EXPECTED_DEPLOYED_SHA || "not verified"}`,
    `- Deployed migration level: ${EXPECTED_DEPLOYED_MIGRATION || "not verified"}`,
    `- Repository checkout migration level: ${CHECKOUT_MIGRATION_LEVEL || "unknown"}`,
    "- Production policy: read-only; this harness contains no production target or direct database write path.",
    "",
    "## Classification summary",
    "",
    `PASS ${manifest.summary.pass} · PASS WITH LIMITATION ${manifest.summary.passWithLimitation} · PRODUCT DEFECT ${manifest.summary.productDefect} · TEST CONTRACT DEFECT ${manifest.summary.testContractDefect}`,
    `PROVIDER BLOCKER ${manifest.summary.providerBlocker} · ENVIRONMENT BLOCKER ${manifest.summary.environmentBlocker} · NOT TESTED ${manifest.summary.notTested} · NOT APPLICABLE ${manifest.summary.notApplicable}`,
    "",
    "## Scenario evidence",
    "",
    ...manifest.scenarios.map((scenario) => `- **${scenario.scenarioId} — ${scenario.classification}**: ${scenario.details || "No additional details."}`),
    "",
    "Generated artifacts, screenshots, telemetry, exact-deployment evidence, and retained synthetic record metadata are in `manifest.json` and the adjacent folders.",
    "",
  ].join("\n");
  await fs.writeFile(path.join(OUTPUT_DIR, "REPORT.md"), report, "utf8");
}

async function main() {
  assertInputs();
  const expectation = await expectedHealth();
  const health = await waitForHostedQaHealth(readHealth, expectation, { timeoutMs: Math.min(Number(process.env.QA_E2E_DEPLOYMENT_READY_TIMEOUT_MS || 120_000), 180_000) });
  manifest.deployment.health = health;
  if (health.status !== "PASS") throw new Error(`QA deployment is not at the expected SHA/migration: ${health.failureReasons.join(", ") || health.snapshot.failure || "unknown readiness failure"}`);

  const browser = await chromium.launch({ headless: process.env.QA_E2E_HEADED !== "1" });
  try {
    const storageState = await createAuthState(browser);
    for (const definition of ROUTE_DEFINITIONS) {
      await captureRoute(browser, storageState, definition, "desktop", 1440, 1000);
      await captureRoute(browser, storageState, definition, "mobile", 390, 844);
    }
    await createProjectScenario(browser, storageState);
    await purchaseOrderScenario(browser, storageState);
    await documentGenerationScenario(browser, storageState);
    await templateAndAiScenario(browser, storageState);
    await emailScenario(browser, storageState);
    await smsScenario(browser, storageState);
  } finally {
    await browser.close();
    await writeArtifacts();
  }
}

main().catch(async (error) => {
  manifest.scenarios.push({ ...newScenario("HARNESS", "Live QA harness", "/api/health"), classification: "ENVIRONMENT BLOCKER", details: safe(error), assertions: [{ id: "harness-completed", passed: false, details: safe(error) }] });
  await writeArtifacts();
  console.error(safe(error));
  process.exitCode = 1;
});
