import dotenv from "dotenv";
import fs from "node:fs/promises";
import path from "node:path";
// Playwright is intentionally installed by the explicit QA workflow.
// @ts-ignore -- the QA-only dependency is present when this script executes.
import { chromium } from "playwright";
import { assertLocalQaTarget } from "../../src/lib/localQaTarget.ts";
import { assertHostedQaTarget, waitForHostedQaRouteReadiness } from "../qa/hostedQaContracts.ts";
import { normalizeErrorMessage, redactSensitiveText } from "../qa/structuredEvidence.ts";

const environmentFile = String(process.env.CLIENT_SECURITY_QA_ENV_FILE || "").trim();
if (environmentFile) dotenv.config({ path: path.resolve(environmentFile), override: false, quiet: true });

type RoleKey = "COMPANY_ADMIN" | "FINANCE" | "PAYROLL" | "VIEWER" | "CUSTOM";

type RoleCapture = {
  role: RoleKey;
  label: string;
  emailEnv: string;
  passwordEnv: string;
  screenshotName: string;
  expectedModules: readonly string[];
  forbiddenModules: readonly string[];
  forbiddenPaths: readonly string[];
};

type CaptureResult = {
  role: RoleKey;
  label: string;
  screenshotPath: string | null;
  requestedPath: string;
  finalPath: string | null;
  expectedModules: readonly string[];
  observedModules: readonly string[];
  forbiddenModules: readonly string[];
  deepLinks: Array<{ requestedPath: string; finalPath: string | null; denied: boolean }>;
  assertions: Array<{ id: string; passed: boolean; details: string }>;
  telemetry: { consoleErrors: string[]; pageErrors: string[]; failedRequests: string[] };
  status: "PASS" | "BLOCKED" | "FAIL";
  details: string;
};

const BASE_URL = String(process.env.CLIENT_SECURITY_QA_BASE_URL || process.env.QA_E2E_BASE_URL || "").trim().replace(/\/+$/, "");
const EXPECTED_SHA = String(process.env.CLIENT_SECURITY_QA_EXPECTED_SHA || "").trim().toLowerCase();
const EXPECTED_MIGRATION = String(process.env.CLIENT_SECURITY_QA_EXPECTED_MIGRATION || "").trim();
const EXPECTED_DEPLOYMENT_ID = String(process.env.CLIENT_SECURITY_QA_DEPLOYMENT_ID || "").trim();
const OUTPUT_DIR = path.resolve(process.env.CLIENT_SECURITY_QA_OUTPUT_DIR || "artifacts/client-security");
const SCREENSHOT_DIR = path.join(OUTPUT_DIR, "screenshots");
const MANIFEST_PATH = path.join(OUTPUT_DIR, "role-screenshot-manifest.json");
const ALLOW_LOCAL = process.env.CLIENT_SECURITY_QA_ALLOW_LOCAL === "1";
const VIEWPORT = { width: 1440, height: 1000 } as const;
const MODULE_LABELS = [
  "Dashboard",
  "Cash & Banking",
  "Email / SMS",
  "Documents",
  "Projects",
  "Procurement",
  "Warehouse Inventory",
  "Equipment Registry",
  "Supplier Invoices",
  "Expenses",
  "Payroll",
  "Reports",
] as const;

const ROLE_CAPTURES: readonly RoleCapture[] = [
  {
    role: "COMPANY_ADMIN",
    label: "Company Admin",
    emailEnv: "CLIENT_SECURITY_QA_COMPANY_ADMIN_EMAIL",
    passwordEnv: "CLIENT_SECURITY_QA_COMPANY_ADMIN_PASSWORD",
    screenshotName: "company-admin-navigation-desktop.png",
    expectedModules: MODULE_LABELS,
    forbiddenModules: [],
    forbiddenPaths: [],
  },
  {
    role: "FINANCE",
    label: "Finance",
    emailEnv: "CLIENT_SECURITY_QA_FINANCE_EMAIL",
    passwordEnv: "CLIENT_SECURITY_QA_FINANCE_PASSWORD",
    screenshotName: "finance-navigation-desktop.png",
    expectedModules: ["Dashboard", "Cash & Banking", "Email / SMS", "Documents", "Projects", "Procurement", "Warehouse Inventory", "Equipment Registry", "Supplier Invoices", "Expenses", "Reports"],
    forbiddenModules: ["Payroll"],
    forbiddenPaths: ["/payroll", "/settings"],
  },
  {
    role: "PAYROLL",
    label: "Payroll",
    emailEnv: "CLIENT_SECURITY_QA_PAYROLL_EMAIL",
    passwordEnv: "CLIENT_SECURITY_QA_PAYROLL_PASSWORD",
    screenshotName: "payroll-navigation-desktop.png",
    expectedModules: ["Payroll", "Reports"],
    forbiddenModules: ["Dashboard", "Cash & Banking", "Email / SMS", "Documents", "Projects", "Procurement", "Warehouse Inventory", "Equipment Registry", "Supplier Invoices", "Expenses"],
    forbiddenPaths: ["/dashboard", "/projects", "/documents", "/settings"],
  },
  {
    role: "VIEWER",
    label: "Viewer",
    emailEnv: "CLIENT_SECURITY_QA_VIEWER_EMAIL",
    passwordEnv: "CLIENT_SECURITY_QA_VIEWER_PASSWORD",
    screenshotName: "viewer-navigation-desktop.png",
    expectedModules: ["Dashboard", "Documents", "Projects", "Procurement", "Warehouse Inventory", "Equipment Registry", "Supplier Invoices", "Expenses", "Reports"],
    forbiddenModules: ["Cash & Banking", "Email / SMS", "Payroll"],
    forbiddenPaths: ["/cash", "/email-sms", "/payroll", "/settings"],
  },
  {
    role: "CUSTOM",
    label: "Custom restricted role",
    emailEnv: "CLIENT_SECURITY_QA_CUSTOM_EMAIL",
    passwordEnv: "CLIENT_SECURITY_QA_CUSTOM_PASSWORD",
    screenshotName: "custom-restricted-navigation-desktop.png",
    expectedModules: ["Warehouse Inventory"],
    forbiddenModules: ["Dashboard", "Cash & Banking", "Email / SMS", "Documents", "Projects", "Procurement", "Equipment Registry", "Supplier Invoices", "Expenses", "Payroll", "Reports"],
    forbiddenPaths: ["/dashboard", "/projects", "/settings"],
  },
] as const;

function safe(value: unknown) {
  return redactSensitiveText(normalizeErrorMessage(value, "Role screenshot capture failed."));
}

function requiredEnvironment(name: string) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`Missing required synthetic QA credential: ${name}.`);
  return value;
}

function assertConfiguration() {
  if (!BASE_URL) throw new Error("CLIENT_SECURITY_QA_BASE_URL or QA_E2E_BASE_URL is required.");
  const parsed = new URL(BASE_URL);
  const localTarget = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
  assertHostedQaTarget(BASE_URL, localTarget && ALLOW_LOCAL);
  if (localTarget && !ALLOW_LOCAL) throw new Error("Local role capture requires CLIENT_SECURITY_QA_ALLOW_LOCAL=1.");
  if (!/^[0-9a-f]{40}$/.test(EXPECTED_SHA)) throw new Error("CLIENT_SECURITY_QA_EXPECTED_SHA must be an exact 40-character release SHA.");
  if (!/^\d{14}$/.test(EXPECTED_MIGRATION)) throw new Error("CLIENT_SECURITY_QA_EXPECTED_MIGRATION must be an exact migration timestamp.");
  if (!EXPECTED_DEPLOYMENT_ID) throw new Error("CLIENT_SECURITY_QA_DEPLOYMENT_ID is required.");
  if (localTarget) {
    assertLocalQaTarget({
      supabaseUrl: String(process.env.VITE_SUPABASE_URL || ""),
      expectedQaProjectRef: String(process.env.LOCAL_QA_EXPECTED_PROJECT_REF || process.env.HYDROQUALISENSE_QA_PROJECT_REF || ""),
      productionProjectRef: String(process.env.LOCAL_QA_PRODUCTION_PROJECT_REF || process.env.HYDROQUALISENSE_PRODUCTION_PROJECT_REF || ""),
      environment: String(process.env.VITE_HYDROQUALISENSE_ENVIRONMENT || process.env.HYDROQUALISENSE_ENVIRONMENT || ""),
      deploymentId: String(process.env.LOCAL_QA_DEPLOYMENT_ID || process.env.VITE_HYDROQUALISENSE_DEPLOYMENT_ID || ""),
      publishableKey: String(process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || ""),
    });
  }
  for (const capture of ROLE_CAPTURES) {
    requiredEnvironment(capture.emailEnv);
    requiredEnvironment(capture.passwordEnv);
  }
}

async function readHealth() {
  const response = await fetch(`${BASE_URL}/api/health`, { headers: { Accept: "application/json" } });
  const body = await response.json().catch(() => ({}));
  const release = body && typeof body === "object" && body.release && typeof body.release === "object" ? body.release as Record<string, unknown> : {};
  const identity = {
    httpStatus: response.status,
    environment: typeof release.environment === "string" ? release.environment : null,
    deploymentId: typeof release.deploymentId === "string" ? release.deploymentId : null,
    repositorySha: typeof release.repositorySha === "string" ? release.repositorySha.toLowerCase() : null,
    migrationLevel: typeof release.migrationLevel === "string" ? release.migrationLevel : null,
  };
  if (identity.httpStatus !== 200 || identity.environment !== "qa" || identity.deploymentId !== EXPECTED_DEPLOYMENT_ID || identity.repositorySha !== EXPECTED_SHA || identity.migrationLevel !== EXPECTED_MIGRATION) {
    throw new Error("QA health did not match the exact expected environment, deployment, release SHA, and migration level.");
  }
  return identity;
}

function telemetryFor(page: any) {
  const telemetry = { consoleErrors: [] as string[], pageErrors: [] as string[], failedRequests: [] as string[] };
  page.on("console", (message: any) => { if (message.type() === "error") telemetry.consoleErrors.push(safe(message.text())); });
  page.on("pageerror", (error: unknown) => telemetry.pageErrors.push(safe(error)));
  page.on("response", (response: any) => { if (response.status() >= 400 && !/favicon\.ico|\.map(?:$|\?)/i.test(response.url())) telemetry.failedRequests.push(`${response.request().method()} ${safe(new URL(response.url()).pathname)} ${response.status()}`); });
  return telemetry;
}

async function waitForWorkspace(page: any) {
  await waitForHostedQaRouteReadiness(page, 30_000);
  await page.locator("[data-workspace-state='ready']").waitFor({ state: "attached", timeout: 30_000 });
}

async function signIn(page: any, capture: RoleCapture) {
  await page.goto(`${BASE_URL}/dashboard`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  const authEmail = page.locator("#auth-email");
  if (await authEmail.count()) {
    await authEmail.fill(requiredEnvironment(capture.emailEnv));
    await page.locator("#auth-password").fill(requiredEnvironment(capture.passwordEnv));
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
  }
  await waitForWorkspace(page);
  const body = await page.locator("body").innerText();
  if (/welcome back|sign in to continue/i.test(body)) throw new Error(`${capture.label} authentication did not reach the workspace.`);
  if (!body.includes("QA ENVIRONMENT · SYNTHETIC DATA ONLY")) throw new Error(`${capture.label} capture is missing the QA synthetic-data banner.`);
  if (!body.includes("HydroQualiSense QA Synthetic")) throw new Error(`${capture.label} capture is missing the synthetic deployment company.`);
}

async function observedModules(page: any) {
  const sidebar = page.locator('aside[aria-label="Workspace navigation"]');
  await sidebar.waitFor({ state: "visible", timeout: 30_000 });
  const labels = await sidebar.locator('nav[aria-label="Primary navigation"] button').evaluateAll((buttons: Element[]) => buttons.map((button) => button.getAttribute("aria-label") || "")) as string[];
  return [...new Set(labels.filter((label) => MODULE_LABELS.some((module) => label === module || label.startsWith(`${module},`))))];
}

function assertion(id: string, passed: boolean, details: string) {
  return { id, passed, details };
}

async function captureRole(browser: any, capture: RoleCapture): Promise<CaptureResult> {
  const context = await browser.newContext({ viewport: VIEWPORT });
  const page = await context.newPage();
  const telemetry = telemetryFor(page);
  const result: CaptureResult = {
    role: capture.role,
    label: capture.label,
    screenshotPath: null,
    requestedPath: "/dashboard",
    finalPath: null,
    expectedModules: capture.expectedModules,
    observedModules: [],
    forbiddenModules: capture.forbiddenModules,
    deepLinks: [],
    assertions: [],
    telemetry,
    status: "FAIL",
    details: "",
  };
  try {
    await signIn(page, capture);
    result.observedModules = await observedModules(page);
    result.finalPath = new URL(page.url()).pathname;
    const missing = capture.expectedModules.filter((module) => !result.observedModules.includes(module));
    const unexpected = result.observedModules.filter((module) => capture.forbiddenModules.includes(module));
    result.assertions.push(assertion("expected-modules", missing.length === 0, missing.length ? `Missing visible modules: ${missing.join(", ")}.` : "Every expected module is visible."));
    result.assertions.push(assertion("forbidden-modules", unexpected.length === 0, unexpected.length ? `Forbidden modules are visible: ${unexpected.join(", ")}.` : "No forbidden module is visible."));
    result.assertions.push(assertion("authenticated-release", true, `Authenticated ${capture.label} capture reached ${result.finalPath}.`));
    await fs.mkdir(SCREENSHOT_DIR, { recursive: true });
    const outputPath = path.join(SCREENSHOT_DIR, capture.screenshotName);
    await page.screenshot({ path: outputPath, fullPage: true });
    result.screenshotPath = path.relative(OUTPUT_DIR, outputPath).replaceAll("\\", "/");

    for (const forbiddenPath of capture.forbiddenPaths) {
      await page.goto(`${BASE_URL}${forbiddenPath}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
      await waitForWorkspace(page);
      const finalPath = new URL(page.url()).pathname;
      const denied = finalPath !== forbiddenPath && !new RegExp(`(^|/)${forbiddenPath.slice(1).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:/|$)`).test(finalPath);
      result.deepLinks.push({ requestedPath: forbiddenPath, finalPath, denied });
    }
    result.assertions.push(assertion("restricted-deep-links", result.deepLinks.every((link) => link.denied), result.deepLinks.every((link) => link.denied) ? "Representative forbidden URLs did not open the requested restricted route." : "At least one forbidden URL remained on the restricted route."));
    result.status = result.assertions.every((item) => item.passed) && !telemetry.consoleErrors.length && !telemetry.pageErrors.length && !telemetry.failedRequests.length ? "PASS" : "FAIL";
    result.details = result.status === "PASS" ? "Current authenticated synthetic-QA navigation matched the expected permission profile." : "The captured role did not satisfy the expected navigation or telemetry contract.";
  } catch (error) {
    result.status = "BLOCKED";
    result.details = safe(error);
    result.assertions.push(assertion("capture-completed", false, result.details));
  } finally {
    await page.close();
    await context.close();
  }
  return result;
}

async function captureCompanyAccessEditor(browser: any) {
  const capture = ROLE_CAPTURES[0];
  const context = await browser.newContext({ viewport: VIEWPORT });
  const page = await context.newPage();
  try {
    await signIn(page, capture);
    await page.goto(`${BASE_URL}/settings`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await waitForWorkspace(page);
    for (const text of ["Company access", "Roles", "New custom role"]) {
      await page.getByText(text, { exact: true }).first().waitFor({ state: "visible", timeout: 30_000 });
    }
    await fs.mkdir(SCREENSHOT_DIR, { recursive: true });
    const outputPath = path.join(SCREENSHOT_DIR, "company-access-custom-role-editor-desktop.png");
    await page.screenshot({ path: outputPath, fullPage: true });
    return { status: "PASS" as const, screenshotPath: path.relative(OUTPUT_DIR, outputPath).replaceAll("\\", "/"), details: "Company Access and custom-role editor captured from the authenticated Company Admin workspace." };
  } catch (error) {
    return { status: "BLOCKED" as const, screenshotPath: null, details: safe(error) };
  } finally {
    await page.close();
    await context.close();
  }
}

async function writeManifest(value: Record<string, unknown>) {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  await fs.writeFile(MANIFEST_PATH, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function main() {
  assertConfiguration();
  const health = await readHealth();
  const browser = await chromium.launch({ headless: process.env.CLIENT_SECURITY_QA_HEADED !== "1" });
  const startedAt = new Date().toISOString();
  const roles: CaptureResult[] = [];
  let editor: { status: "PASS" | "BLOCKED"; screenshotPath: string | null; details: string } = { status: "BLOCKED", screenshotPath: null, details: "Not attempted." };
  try {
    for (const capture of ROLE_CAPTURES) roles.push(await captureRole(browser, capture));
    editor = await captureCompanyAccessEditor(browser);
  } finally {
    await browser.close();
  }
  const status = roles.every((role) => role.status === "PASS") && editor.status === "PASS" ? "PASS" : roles.some((role) => role.status === "FAIL") ? "FAIL" : "BLOCKED";
  await writeManifest({
    schemaVersion: 1,
    status,
    startedAt,
    completedAt: new Date().toISOString(),
    target: { baseUrl: new URL(BASE_URL).origin, environment: health.environment, deploymentId: health.deploymentId, repositorySha: health.repositorySha, migrationLevel: health.migrationLevel, viewport: VIEWPORT },
    roles,
    companyAccessEditor: editor,
    productionPolicy: "READ_ONLY",
  });
  if (status !== "PASS") throw new Error(`Role screenshot capture completed with status ${status}.`);
  console.log(JSON.stringify({ status, manifest: path.relative(process.cwd(), MANIFEST_PATH).replaceAll("\\", "/"), screenshots: roles.length + 1 }));
}

main().catch(async (error) => {
  const details = safe(error);
  await writeManifest({ schemaVersion: 1, status: "BLOCKED", completedAt: new Date().toISOString(), target: BASE_URL ? { baseUrl: new URL(BASE_URL).origin, environment: "qa" } : null, roles: [], companyAccessEditor: { status: "BLOCKED", screenshotPath: null, details }, productionPolicy: "READ_ONLY" });
  console.error(details);
  process.exitCode = 1;
});
