import dotenv from "dotenv";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { promisify } from "node:util";
import { execFile as execFileCallback } from "node:child_process";
// Playwright is intentionally installed by the explicit QA workflow, not the
// ordinary application dependency set.
// @ts-ignore -- the QA-only dependency is present when this script executes.
import { chromium } from "playwright";
import { isPortInUse, isServerReady, terminateChildServer } from "./devServerLifecycle.ts";
import { redactSensitiveText, normalizeErrorMessage } from "./structuredEvidence.ts";
import { runLocalQaScenarios, type LocalQaScenarioEvidence, type LocalQaScenarioRunResult } from "./localQaScenarios.ts";
import { assertLocalQaTarget, assertProductionTargetIsRefused, LOCAL_QA_DEPLOYMENT_ID, LOCAL_QA_PROJECT_REF, LOCAL_QA_PRODUCTION_PROJECT_REF } from "../../src/lib/localQaTarget.ts";
import { ROUTE_DEFINITIONS } from "../../src/utils/routes.ts";

const execFile = promisify(execFileCallback);
const REPOSITORY_ROOT = path.resolve(process.cwd());
const ENV_PATH = path.join(REPOSITORY_ROOT, ".env.qa.local");
dotenv.config({ path: ENV_PATH, override: true, quiet: true });
const OUTPUT_DIR = path.resolve(process.env.LOCAL_QA_OUTPUT_DIR || "artifacts/local-qa");
const STORAGE_STATE_PATH = path.resolve(process.env.LOCAL_QA_STORAGE_STATE_PATH || ".qa-e2e/local-qa-storage-state.json");
const BASE_URL = (process.env.LOCAL_QA_BASE_URL || "http://localhost:3000").replace(/\/+$/, "");
const PORT = Number(new URL(BASE_URL).port || 3000);
const EXPECTED_EMAIL = String(process.env.QA_E2E_EMAIL || "").trim().toLowerCase();
const PASSWORD = String(process.env.QA_E2E_PASSWORD || "");
const QA_TIMEOUT_MS = 30_000;

interface LocalQaEvidence {
  schemaVersion: 2;
  status: "PASS" | "FAIL";
  baseUrl: string;
  target: {
    projectRef: string;
    expectedProjectRef: string;
    productionProjectRef: string;
    deploymentId: string;
    productionRefused: boolean;
  };
  health?: {
    status: number;
    environment: string | null;
    deploymentId: string | null;
    pdfFinalization: string | null;
  };
  authentication?: {
    userMatchesExpected: boolean;
    accessTokenPresent: boolean;
    refreshTokenPresent: boolean;
    reloadPersisted: boolean;
    freshRoutePersisted: boolean;
    storageStatePath: string;
  };
  routes?: Array<{ path: string; loaded: boolean; pageLevelOverflow: boolean }>;
  networkFailures?: string[];
  networkRequests?: string[];
  syntheticWrite?: { projectCode: string; created: boolean; persistedAfterReload: boolean };
  pdfChecks?: Array<{ kind: string; source: string; pageCount: number; previewHash: string; downloadHash: string; exactMatch: boolean; renderedPages: number; previewScreenshotPath: string; downloadedPdfPath: string }>;
  scenarios?: readonly LocalQaScenarioEvidence[];
  scenarioSummary?: LocalQaScenarioRunResult["summary"];
  failure?: string;
}

function safeError(value: unknown) {
  return redactSensitiveText(normalizeErrorMessage(value, "Local QA failed."));
}

function sha256(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function writeEvidence(evidence: LocalQaEvidence) {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  await fs.writeFile(path.join(OUTPUT_DIR, "evidence.json"), `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
}

async function cleanUnsafeScreenshotArtifacts() {
  const screenshotDirectory = path.join(OUTPUT_DIR, "screenshots");
  const entries = await fs.readdir(screenshotDirectory, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (!entry.isFile() || !/desktop|tablet/i.test(entry.name) || !entry.name.endsWith(".png")) continue;
    const candidate = path.resolve(screenshotDirectory, entry.name);
    if (path.dirname(candidate) !== path.resolve(screenshotDirectory)) continue;
    await fs.unlink(candidate);
  }
}

async function readLocalEnv() {
  if (!existsSync(ENV_PATH)) throw new Error("Create .env.qa.local before running local QA.");
  const loaded = dotenv.config({ path: ENV_PATH, override: true, quiet: true });
  if (loaded.error) throw loaded.error;
  if (!EXPECTED_EMAIL || !PASSWORD) throw new Error("Local QA requires QA_E2E_EMAIL and QA_E2E_PASSWORD in .env.qa.local.");
  const browserKey = String(process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || "").trim();
  const target = assertLocalQaTarget({
    supabaseUrl: String(process.env.VITE_SUPABASE_URL || ""),
    expectedQaProjectRef: String(process.env.LOCAL_QA_EXPECTED_PROJECT_REF || process.env.HYDROQUALISENSE_QA_PROJECT_REF || ""),
    productionProjectRef: String(process.env.LOCAL_QA_PRODUCTION_PROJECT_REF || process.env.HYDROQUALISENSE_PRODUCTION_PROJECT_REF || ""),
    environment: String(process.env.VITE_HYDROQUALISENSE_ENVIRONMENT || process.env.HYDROQUALISENSE_ENVIRONMENT || ""),
    deploymentId: String(process.env.LOCAL_QA_DEPLOYMENT_ID || process.env.VITE_HYDROQUALISENSE_DEPLOYMENT_ID || ""),
    publishableKey: browserKey,
  });
  for (const [name, value] of Object.entries(process.env)) {
    if (!name.startsWith("VITE_") || !value) continue;
    if (/service[_-]?role|sb_secret_|secret/i.test(value)) throw new Error(`Refusing privileged material in browser environment variable ${name}.`);
  }
  return { target, browserKey };
}

async function startLocalServer(): Promise<ChildProcess> {
  if (await isPortInUse(PORT) || await isServerReady(BASE_URL, "/api/health")) {
    throw new Error(`Port ${PORT} is already occupied. Stop the existing local process before running QA.`);
  }
  const child = spawn(process.platform === "win32" ? "npx.cmd" : "npx", ["tsx", "server.ts"], {
    cwd: REPOSITORY_ROOT,
    env: { ...process.env, PORT: String(PORT) },
    stdio: "ignore",
    shell: process.platform === "win32",
    detached: process.platform !== "win32",
  });
  const started = Date.now();
  while (Date.now() - started < QA_TIMEOUT_MS) {
    if (await isServerReady(BASE_URL, "/api/health", 1500)) return child;
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  await terminateChildServer(child, { port: PORT, baseUrl: BASE_URL, startupPath: "/api/health" });
  throw new Error("The local QA application did not become ready within the bounded startup window.");
}

async function healthEvidence() {
  const response = await fetch(`${BASE_URL}/api/health`, { headers: { Accept: "application/json" } });
  const body = await response.json().catch(() => ({}));
  const release = body?.release && typeof body.release === "object" ? body.release : {};
  if (response.status !== 200 || release.environment !== "qa" || release.deploymentId !== LOCAL_QA_DEPLOYMENT_ID) {
    throw new Error("Local QA health did not report the exact qa/local-qa-harness identity.");
  }
  return {
    status: response.status,
    environment: typeof release.environment === "string" ? release.environment : null,
    deploymentId: typeof release.deploymentId === "string" ? release.deploymentId : null,
    pdfFinalization: typeof body?.documentPdfFinalization?.status === "string" ? body.documentPdfFinalization.status : null,
  };
}

async function sessionSnapshot(page: any) {
  return page.evaluate(() => {
    const raw = Object.entries(localStorage).find(([key]) => key.startsWith("sb-") && key.endsWith("-auth-token"))?.[1] || "";
    if (!raw) return { accessTokenPresent: false, refreshTokenPresent: false, userEmail: "" };
    try {
      const parsed = JSON.parse(raw) as { access_token?: unknown; refresh_token?: unknown; user?: { email?: unknown } };
      return {
        accessTokenPresent: typeof parsed.access_token === "string" && parsed.access_token.length > 0,
        refreshTokenPresent: typeof parsed.refresh_token === "string" && parsed.refresh_token.length > 0,
        userEmail: typeof parsed.user?.email === "string" ? parsed.user.email.trim().toLowerCase() : "",
      };
    } catch { return { accessTokenPresent: false, refreshTokenPresent: false, userEmail: "" }; }
  });
}

async function waitForApp(page: any) {
  await page.waitForFunction(() => {
    const text = document.body?.innerText || "";
    const lower = text.toLowerCase();
    return Boolean(text.trim()) && !lower.includes("loading company access") && !lower.includes("checking your workspace session") && !lower.includes("loading workspace");
  }, undefined, { timeout: QA_TIMEOUT_MS });
  await page.locator("[data-workspace-state='ready']").waitFor({ state: "attached", timeout: QA_TIMEOUT_MS });
}

async function waitForAuthenticationOrWorkspace(page: any): Promise<"authentication" | "workspace"> {
  const authForm = page.locator("#auth-email");
  const workspace = page.locator("[data-workspace-state='ready']");
  return Promise.race([
    authForm.waitFor({ state: "visible", timeout: QA_TIMEOUT_MS }).then(() => "authentication" as const),
    workspace.waitFor({ state: "attached", timeout: QA_TIMEOUT_MS }).then(() => "workspace" as const),
  ]);
}

async function authenticatedContext(browser: any) {
  let context = await browser.newContext(existsSync(STORAGE_STATE_PATH) ? { storageState: STORAGE_STATE_PATH } : {});
  let page = await context.newPage();
  const networkFailures: string[] = [];
  const networkRequests: string[] = [];
  page.on("response", (response: any) => {
    const url = new URL(response.url());
    if (!(url.pathname.includes("/rest/v1/") || url.pathname.startsWith("/api/"))) return;
    const item = `${response.request().method()} ${url.pathname} ${response.status()}`;
    networkRequests.push(item);
    if (response.status() >= 400) networkFailures.push(item);
  });
  await page.goto(`${BASE_URL}/dashboard`, { waitUntil: "domcontentloaded", timeout: QA_TIMEOUT_MS });
  const initialState = await waitForAuthenticationOrWorkspace(page);
  if (initialState === "authentication") {
    await page.evaluate(() => localStorage.clear());
    await page.locator("#auth-password").waitFor({ state: "visible", timeout: QA_TIMEOUT_MS });
    await page.locator("#auth-email").fill(EXPECTED_EMAIL);
    await page.locator("#auth-password").fill(PASSWORD);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
  }
  await page.waitForFunction(() => Object.keys(localStorage).some((key) => key.startsWith("sb-") && key.endsWith("-auth-token")), undefined, { timeout: QA_TIMEOUT_MS });
  await waitForApp(page);
  const first = await sessionSnapshot(page);
  if (!first.accessTokenPresent || !first.refreshTokenPresent || first.userEmail !== EXPECTED_EMAIL) throw new Error("Local QA authenticated as an unexpected or incomplete user session.");
  await page.reload({ waitUntil: "domcontentloaded", timeout: QA_TIMEOUT_MS });
  await waitForApp(page);
  const afterReload = await sessionSnapshot(page);
  if (!afterReload.accessTokenPresent || !afterReload.refreshTokenPresent || afterReload.userEmail !== EXPECTED_EMAIL) throw new Error("Local QA session did not persist through reload.");
  await page.goto(`${BASE_URL}/settings`, { waitUntil: "domcontentloaded", timeout: QA_TIMEOUT_MS });
  await waitForApp(page);
  const freshRoute = await sessionSnapshot(page);
  if (!freshRoute.accessTokenPresent || !freshRoute.refreshTokenPresent || freshRoute.userEmail !== EXPECTED_EMAIL) throw new Error("Local QA session did not persist through fresh protected-route navigation.");
  await fs.mkdir(path.dirname(STORAGE_STATE_PATH), { recursive: true });
  await context.storageState({ path: STORAGE_STATE_PATH });
  return { context, page, first, afterReload, freshRoute, networkFailures, networkRequests };
}

async function routeEvidence(page: any) {
  const paths = ROUTE_DEFINITIONS.map((route) => route.path);
  const evidence: Array<{ path: string; loaded: boolean; pageLevelOverflow: boolean }> = [];
  for (const route of paths) {
    await page.goto(`${BASE_URL}${route}`, { waitUntil: "domcontentloaded", timeout: QA_TIMEOUT_MS });
    await waitForApp(page);
    const result = await page.evaluate(() => ({
      text: document.body?.innerText || "",
      overflow: document.documentElement.scrollWidth > window.innerWidth,
    }));
    if (/sign in to continue|welcome back/i.test(result.text)) throw new Error(`Local QA returned to authentication on ${route}.`);
    evidence.push({ path: route, loaded: Boolean(result.text.trim()), pageLevelOverflow: result.overflow });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${BASE_URL}/documents`, { waitUntil: "domcontentloaded", timeout: QA_TIMEOUT_MS });
  await waitForApp(page);
  const mobileOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  evidence.push({ path: "/documents@390px", loaded: true, pageLevelOverflow: mobileOverflow });
  await page.setViewportSize({ width: 1440, height: 1000 });
  return evidence;
}

async function boundedProjectWrite(page: any) {
  const projectCode = "QA-LOCAL-HARNESS";
  const networkEvidence: string[] = [];
  const onResponse = (response: any) => {
    const url = new URL(response.url());
    if (url.pathname.includes("/rest/v1/") || url.pathname.startsWith("/api/")) networkEvidence.push(`${response.request().method()} ${url.pathname} ${response.status()}`);
  };
  page.on("response", onResponse);
  await page.goto(`${BASE_URL}/projects`, { waitUntil: "domcontentloaded", timeout: QA_TIMEOUT_MS });
  await waitForApp(page);
  await page.waitForFunction(() => !(document.body?.innerText || "").includes("Loading projects"), undefined, { timeout: QA_TIMEOUT_MS });
  await page.locator("[data-project-id]").first().waitFor({ state: "attached", timeout: QA_TIMEOUT_MS }).catch(() => {});
  const alreadyPresent = (await page.locator("body").innerText()).includes(projectCode);
  let created = false;
  if (!alreadyPresent) {
    await page.getByRole("button", { name: "New project", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.locator("input").nth(0).fill(projectCode);
    await dialog.locator("input").nth(2).fill("Local QA Harness Synthetic Project");
    await dialog.locator("#project-tax-treatment").selectOption("NON_VAT");
    await dialog.getByRole("button", { name: "Save project", exact: true }).click();
    await page.waitForTimeout(1500);
    if (!(await page.locator("body").innerText()).includes(projectCode)) {
      const feedback = await page.locator("[role='alert'], [role='status']").allTextContents().catch(() => [] as string[]);
      throw new Error(`The bounded synthetic project write did not complete. UI feedback: ${feedback.join(" | ").slice(0, 500) || "no feedback"}`);
    }
    created = true;
  }
  await page.reload({ waitUntil: "domcontentloaded", timeout: QA_TIMEOUT_MS });
  await waitForApp(page);
  await page.waitForFunction(() => !(document.body?.innerText || "").includes("Loading projects"), undefined, { timeout: QA_TIMEOUT_MS });
  await page.locator("[data-project-id]").first().waitFor({ state: "attached", timeout: QA_TIMEOUT_MS }).catch(() => {});
  const persistedAfterReload = (await page.locator("body").innerText()).includes(projectCode);
  page.off("response", onResponse);
  if (!persistedAfterReload) throw new Error(`The bounded synthetic project write did not persist after reload. Network: ${networkEvidence.slice(-12).join(" | ") || "none"}`);
  return { projectCode, created, persistedAfterReload };
}

async function renderPdfPages(filePath: string, prefix: string) {
  try {
    const outputDirectory = path.dirname(prefix);
    const prefixName = path.basename(prefix);
    const existing = await fs.readdir(outputDirectory);
    for (const file of existing) {
      if (!file.startsWith(prefixName) || !file.endsWith(".png")) continue;
      await fs.unlink(path.join(outputDirectory, file));
    }
    await execFile("pdftoppm", ["-png", "-r", "120", filePath, prefix], { cwd: REPOSITORY_ROOT });
    const info = await execFile("pdfinfo", [filePath], { cwd: REPOSITORY_ROOT });
    const pageCount = Number(/^Pages:\s+(\d+)/m.exec(info.stdout)?.[1] || 0);
    const files = await fs.readdir(outputDirectory);
    const renderedPages = files.filter((file) => file.startsWith(prefixName) && file.endsWith(".png")).length;
    return pageCount > 0 && renderedPages === pageCount ? renderedPages : 0;
  } catch { return 0; }
}

async function pdfEvidence(page: any) {
  const networkEvidence: string[] = [];
  const onResponse = (response: any) => {
    const url = new URL(response.url());
    if (url.pathname.includes("/rest/v1/") || url.pathname.startsWith("/api/")) networkEvidence.push(`${response.request().method()} ${url.pathname} ${response.status()}`);
  };
  page.on("response", onResponse);
  await page.goto(`${BASE_URL}/documents`, { waitUntil: "domcontentloaded", timeout: QA_TIMEOUT_MS });
  await waitForApp(page);
  await page.locator("[data-documents-workspace]").waitFor({ state: "attached", timeout: QA_TIMEOUT_MS });
  const checks: LocalQaEvidence["pdfChecks"] = [];
  for (const kind of ["PURCHASE_ORDER", "CLIENT_INVOICE"] as const) {
    const card = page.locator(`[data-document-kind="${kind}"]`).first();
    if (await card.count() === 0) continue;
    await card.getByRole("button", { name: "Preview / Download", exact: true }).click();
    const preview = page.locator("[data-pdf-preview='true']").first();
    await preview.waitFor({ state: "visible", timeout: QA_TIMEOUT_MS });
    await page.locator("[data-pdf-preview-status='ready']").waitFor({ state: "visible", timeout: QA_TIMEOUT_MS });
    const root = page.locator("#financial-document-preview");
    const previewHash = (await root.getAttribute("data-pdf-preview-hash")) || "";
    const source = (await root.getAttribute("data-pdf-preview-source")) || "";
    const pageCount = Number((await preview.getAttribute("data-pdf-preview-page-count")) || 0);
    const previewScreenshotRelative = path.join("screenshots", `pdf-${kind.toLowerCase()}-preview.png`).replaceAll("\\", "/");
    const previewScreenshotPath = path.join(OUTPUT_DIR, previewScreenshotRelative);
    await fs.mkdir(path.dirname(previewScreenshotPath), { recursive: true });
    await preview.screenshot({ path: previewScreenshotPath });
    const downloadPromise = page.waitForEvent("download", { timeout: QA_TIMEOUT_MS });
    await page.getByRole("button", { name: /Generate \/ Download PDF/ }).click();
    const download = await downloadPromise;
    const filePath = path.join(OUTPUT_DIR, `${kind.toLowerCase()}-preview.pdf`);
    await fs.mkdir(OUTPUT_DIR, { recursive: true });
    await download.saveAs(filePath);
    const downloadedBytes = new Uint8Array(await fs.readFile(filePath));
    const downloadHash = sha256(downloadedBytes);
    const renderPrefix = path.join(OUTPUT_DIR, `${kind.toLowerCase()}-page`);
    const renderedPages = await renderPdfPages(filePath, renderPrefix);
    const exactMatch = Boolean(previewHash) && previewHash === downloadHash;
    if (!exactMatch || !pageCount || !renderedPages || renderedPages !== pageCount) throw new Error(`PDF preview/download evidence failed for ${kind}.`);
    checks.push({ kind, source, pageCount, previewHash, downloadHash, exactMatch, renderedPages, previewScreenshotPath: previewScreenshotRelative, downloadedPdfPath: path.relative(REPOSITORY_ROOT, filePath).replaceAll("\\", "/") });
    await page.getByRole("button", { name: "Close document preview", exact: true }).click();
  }
  if (!checks.length) {
    const diagnostics = {
      documentCards: await page.locator("[data-document-register-entry]").count(),
      purchaseOrderCards: await page.locator("[data-document-kind='PURCHASE_ORDER']").count(),
      clientInvoiceCards: await page.locator("[data-document-kind='CLIENT_INVOICE']").count(),
      previewButtons: await page.getByRole("button", { name: "Preview / Download", exact: true }).count(),
      documentsWorkspace: await page.locator("[data-documents-workspace]").count(),
      appShell: await page.locator("[data-app-shell]").count(),
      workspaceState: await page.locator("[data-workspace-state]").first().getAttribute("data-workspace-state").catch(() => null),
      accessLoadingText: (await page.locator("body").innerText()).includes("Loading company access"),
      workspaceLoadingText: (await page.locator("body").innerText()).includes("Loading workspace"),
      emptyDocumentsState: (await page.locator("body").innerText()).includes("No documents match the current view"),
      permissionProjectionLabel: (await page.locator("body").innerText()).includes("Permission-filtered projection"),
      visibleLoadWarnings: (await page.locator("body").innerText()).split("\n").map((line: string) => line.trim()).filter((line: string) => /engineering refresh|could not load|unavailable|error/i.test(line)).slice(0, 8),
      network: networkEvidence.slice(-40),
    };
    page.off("response", onResponse);
    throw new Error(`No issued synthetic Purchase Order or Client Invoice was available for PDF fidelity evidence. DOM: ${JSON.stringify(diagnostics)}`);
  }
  return checks;
}

async function main() {
  const targetConfig = await readLocalEnv();
  await cleanUnsafeScreenshotArtifacts();
  const evidence: LocalQaEvidence = {
    schemaVersion: 2,
    status: "FAIL",
    baseUrl: BASE_URL,
    target: {
      projectRef: targetConfig.target.projectRef,
      expectedProjectRef: LOCAL_QA_PROJECT_REF,
      productionProjectRef: LOCAL_QA_PRODUCTION_PROJECT_REF,
      deploymentId: targetConfig.target.deploymentId,
      productionRefused: assertProductionTargetIsRefused({
        supabaseUrl: String(process.env.VITE_SUPABASE_URL || ""),
        expectedQaProjectRef: String(process.env.LOCAL_QA_EXPECTED_PROJECT_REF || process.env.HYDROQUALISENSE_QA_PROJECT_REF || ""),
        productionProjectRef: String(process.env.LOCAL_QA_PRODUCTION_PROJECT_REF || process.env.HYDROQUALISENSE_PRODUCTION_PROJECT_REF || ""),
        environment: String(process.env.VITE_HYDROQUALISENSE_ENVIRONMENT || process.env.HYDROQUALISENSE_ENVIRONMENT || ""),
        deploymentId: String(process.env.LOCAL_QA_DEPLOYMENT_ID || process.env.VITE_HYDROQUALISENSE_DEPLOYMENT_ID || ""),
        publishableKey: targetConfig.browserKey,
      }),
    },
  };
  let child: ChildProcess | null = null;
  let browser: any = null;
  let context: any = null;
  try {
    child = await startLocalServer();
    evidence.health = await healthEvidence();
    browser = await chromium.launch({ headless: process.env.LOCAL_QA_HEADED !== "1" });
    const session = await authenticatedContext(browser);
    context = session.context;
    evidence.authentication = {
      userMatchesExpected: session.first.userEmail === EXPECTED_EMAIL,
      accessTokenPresent: session.first.accessTokenPresent,
      refreshTokenPresent: session.first.refreshTokenPresent,
      reloadPersisted: session.afterReload.accessTokenPresent && session.afterReload.refreshTokenPresent,
      freshRoutePersisted: session.freshRoute.accessTokenPresent && session.freshRoute.refreshTokenPresent,
      storageStatePath: STORAGE_STATE_PATH,
    };
    evidence.routes = await routeEvidence(session.page);
    evidence.networkFailures = session.networkFailures;
    evidence.networkRequests = session.networkRequests.slice(-100);
    evidence.syntheticWrite = await boundedProjectWrite(session.page);
    const scenarioRun = await runLocalQaScenarios({
      page: session.page,
      baseUrl: BASE_URL,
      outputDir: OUTPUT_DIR,
      waitForApp,
      timeoutMs: QA_TIMEOUT_MS,
    });
    evidence.scenarios = scenarioRun.scenarios;
    evidence.scenarioSummary = scenarioRun.summary;
    const coverageGaps = scenarioRun.scenarios.filter((scenario) =>
      scenario.status !== "PASS" || scenario.assertions.some((item) => item.id.endsWith("-available")),
    );
    const coverageFailure = coverageGaps.length > 0
      ? `Authenticated Local-QA coverage incomplete: ${coverageGaps.map((scenario) => `${scenario.id}:${scenario.status}`).slice(0, 8).join(", ") || "unknown scenario"}.`
      : "";
    // PDF evidence is an independent Phase 2 gate. Capture it even when a
    // broader route scenario exposes an unrelated coverage gap, so the final
    // artifact distinguishes PDF evidence from the separate Local-QA blocker.
    evidence.pdfChecks = await pdfEvidence(session.page);
    if (coverageFailure) throw new Error(coverageFailure);
    evidence.status = "PASS";
  } catch (error) {
    evidence.failure = safeError(error);
  } finally {
    await writeEvidence(evidence);
    await context?.close().catch(() => {});
    await browser?.close().catch(() => {});
    if (child) await terminateChildServer(child, { port: PORT, baseUrl: BASE_URL, startupPath: "/api/health" }).catch(() => {});
  }
  if (evidence.status !== "PASS") throw new Error(evidence.failure || "Local QA failed.");
  console.log(`Local QA PASS: ${path.relative(REPOSITORY_ROOT, path.join(OUTPUT_DIR, "evidence.json"))}`);
}

void main();
