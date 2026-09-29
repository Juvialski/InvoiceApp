import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { DEMO_STORAGE_KEY } from "../src/demo/demoTypes.ts";
import { createMarketingDemoWorkspace, MARKETING_DEMO_ANCHOR_DATE } from "../src/demo/data/marketingWorkspace.ts";
import { MARKETING_CAPTURE_DEFAULT_URL, MARKETING_CAPTURE_FIXED_TIME, MARKETING_CAPTURE_PROFILES, assertLocalMarketingCaptureUrl, buildMarketingCaptureRoutes, type MarketingCaptureProfile, type MarketingCaptureRoute } from "./marketingCaptureContract.ts";
import { isPortInUse, isServerReady, terminateChildServer } from "./qa/devServerLifecycle.ts";

interface BrowserResponseLike {
  status(): number;
}

interface LocatorLike {
  click(options?: { timeout?: number }): Promise<void>;
  count(): Promise<number>;
  fill(value: string, options?: { timeout?: number }): Promise<void>;
  first(): LocatorLike;
  inputValue(): Promise<string>;
  evaluate<T>(pageFunction: (element: HTMLElement) => T): Promise<T>;
  scrollIntoViewIfNeeded(options?: { timeout?: number }): Promise<void>;
  textContent(options?: { timeout?: number }): Promise<string | null>;
  waitFor(options: { state: "attached" | "detached" | "visible" | "hidden"; timeout?: number }): Promise<void>;
}

interface BrowserVideoLike {
  saveAs(file: string): Promise<void>;
}

interface BrowserRequestLike {
  url(): string;
}

interface BrowserRouteLike {
  request(): BrowserRequestLike;
  abort(): Promise<void>;
  fulfill(options: { status: number; contentType: string; body: Buffer }): Promise<void>;
}

interface BrowserPageLike {
  goto(url: string, options: { waitUntil: "networkidle"; timeout: number }): Promise<BrowserResponseLike | null>;
  locator(selector: string): LocatorLike;
  getByRole(role: string, options?: { name?: string | RegExp; exact?: boolean }): LocatorLike;
  waitForTimeout(timeout: number): Promise<void>;
  evaluate<T>(pageFunction: () => T): Promise<T>;
  screenshot(options: { path: string; fullPage: boolean }): Promise<void>;
  video(): BrowserVideoLike | null;
}

interface BrowserContextLike {
  clock: { setFixedTime(time: Date): Promise<void> };
  addInitScript<T>(script: (arg: T) => void, arg: T): Promise<void>;
  route(url: RegExp, handler: (route: BrowserRouteLike) => Promise<void>): Promise<void>;
  newPage(): Promise<BrowserPageLike>;
  close(): Promise<void>;
}

interface BrowserLike {
  newContext(options: {
    viewport: { width: number; height: number };
    deviceScaleFactor: number;
    locale: string;
    timezoneId: string;
    recordVideo: { dir: string; size: { width: number; height: number } };
  }): Promise<BrowserContextLike>;
  close(): Promise<void>;
}

interface ChromiumLike {
  launch(options: { headless: true }): Promise<BrowserLike>;
}

interface CaptureArtifact {
  readonly profile: MarketingCaptureProfile["id"];
  readonly file: string;
  readonly surface: string;
  readonly width: number;
  readonly height: number;
}

const SOURCE_DIR = path.dirname(fileURLToPath(import.meta.url));
const browserRuntimeRequire = createRequire(path.join(SOURCE_DIR, "qa", "browser-runtime", "package.json"));
const OUTPUT_DIR = path.resolve(process.cwd(), "artifacts", "marketing-capture", "mkt-v1a-final-deliverable");
const INVOICE_ASSET_DIR = path.join(SOURCE_DIR, "marketing-fixtures", "invoices");
const INVOICE_ASSETS = new Map([
  ["FPM-2609-184.svg", path.join(INVOICE_ASSET_DIR, "FPM-2609-184.svg")],
  ["SFS-2609-771.svg", path.join(INVOICE_ASSET_DIR, "SFS-2609-771.svg")],
  ["WPI-2609-502.svg", path.join(INVOICE_ASSET_DIR, "WPI-2609-502.svg")],
]);
const NAVIGATION_TIMEOUT_MS = 45_000;
const ELEMENT_TIMEOUT_MS = 20_000;
const LOADING_MARKERS = ["Loading HydroQualiSense", "Loading workspace", "Checking your workspace session"] as const;
const CAPTURE_ROUTES = buildMarketingCaptureRoutes();
const ROUTES_BY_ID = new Map(CAPTURE_ROUTES.map((route) => [route.id, route]));

function captureRoute(id: string): MarketingCaptureRoute {
  const route = ROUTES_BY_ID.get(id);
  if (!route) throw new Error(`Marketing capture route is missing: ${id}`);
  return route;
}

function toBaseUrl(): { readonly baseUrl: string; readonly port: number } {
  const rawUrl = process.env.MARKETING_CAPTURE_BASE_URL || MARKETING_CAPTURE_DEFAULT_URL;
  const url = assertLocalMarketingCaptureUrl(rawUrl);
  const port = Number(url.port || "80");
  if (!Number.isInteger(port) || port <= 0 || port > 65_535) throw new Error("Marketing capture preview port is invalid.");
  return { baseUrl: url.origin, port };
}

async function startLocalPreview(baseUrl: string, port: number): Promise<ChildProcess> {
  if (!existsSync(path.join(process.cwd(), "dist", "index.html"))) {
    throw new Error("Built app is missing. Run `npm.cmd run build` before marketing capture.");
  }
  const viteCli = path.join(process.cwd(), "node_modules", "vite", "bin", "vite.js");
  if (!existsSync(viteCli)) throw new Error("Local Vite preview runtime is unavailable.");
  if (await isPortInUse(port)) throw new Error(`Marketing capture port ${port} is already in use; stop that process or choose a different local port.`);

  const child = spawn(process.execPath, [viteCli, "preview", "--host", "127.0.0.1", "--port", String(port), "--strictPort"], {
    cwd: process.cwd(),
    stdio: "ignore",
    env: { ...process.env },
  });
  const startedAt = Date.now();
  while (Date.now() - startedAt < 45_000) {
    if (child.exitCode !== null) throw new Error("Local marketing preview exited before it became ready.");
    if (await isServerReady(baseUrl, "/demo/app/dashboard", 1_200)) return child;
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  await terminateChildServer(child, { port, baseUrl, startupPath: "/demo/app/dashboard", timeoutMs: 5_000 });
  throw new Error("Timed out waiting for the local marketing preview.");
}

function routeUrl(baseUrl: string, route: MarketingCaptureRoute): string {
  return `${baseUrl}${route.path}`;
}

async function waitForReady(page: BrowserPageLike): Promise<void> {
  const body = page.locator("body");
  await body.waitFor({ state: "visible", timeout: ELEMENT_TIMEOUT_MS });
  const startedAt = Date.now();
  let ready = false;
  while (Date.now() - startedAt < ELEMENT_TIMEOUT_MS) {
    const text = await body.textContent({ timeout: ELEMENT_TIMEOUT_MS }) || "";
    if (text.length >= 80 && !LOADING_MARKERS.some((marker) => text.includes(marker))) {
      ready = true;
      break;
    }
    await page.waitForTimeout(120);
  }
  if (!ready) throw new Error("The local demo surface did not reach a stable ready state.");
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  });
  await page.waitForTimeout(220);
}

async function navigate(page: BrowserPageLike, baseUrl: string, route: MarketingCaptureRoute): Promise<void> {
  const response = await page.goto(routeUrl(baseUrl, route), { waitUntil: "networkidle", timeout: NAVIGATION_TIMEOUT_MS });
  if (response?.status() !== 200) throw new Error(`Marketing capture route ${route.id} returned ${response?.status() ?? "no response"}.`);
  await waitForReady(page);
}

function profileScreenshotPath(profile: MarketingCaptureProfile, fileName: string): string {
  return path.join(OUTPUT_DIR, profile.id, fileName);
}

async function captureFrame(page: BrowserPageLike, profile: MarketingCaptureProfile, fileName: string): Promise<CaptureArtifact> {
  const file = profileScreenshotPath(profile, fileName);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await page.screenshot({ path: file, fullPage: false });
  return {
    profile: profile.id,
    file: path.relative(OUTPUT_DIR, file).replaceAll("\\", "/"),
    surface: fileName.replace(/^\d+-/, "").replace(/\.png$/, "").replaceAll("-", " "),
    width: profile.videoSize.width,
    height: profile.videoSize.height,
  };
}

async function selectWorkbookSheet(page: BrowserPageLike, label: string | RegExp, sheetId: string): Promise<void> {
  await page.getByRole("tab", { name: label }).click({ timeout: ELEMENT_TIMEOUT_MS });
  await page.locator(`[data-operations-workbook="true"][data-workbook-sheet="${sheetId}"]`).waitFor({ state: "visible", timeout: ELEMENT_TIMEOUT_MS });
  await page.waitForTimeout(180);
}

async function scrollWorkbookToField(page: BrowserPageLike, fieldId: string): Promise<void> {
  const target = page.locator(`[data-worksheet-cell$=":${fieldId}"]:visible`).first();
  await target.waitFor({ state: "visible", timeout: ELEMENT_TIMEOUT_MS });
  await target.scrollIntoViewIfNeeded({ timeout: ELEMENT_TIMEOUT_MS });
  await page.waitForTimeout(180);
}

async function captureWorkbook(page: BrowserPageLike, profile: MarketingCaptureProfile, baseUrl: string): Promise<CaptureArtifact[]> {
  const artifacts: CaptureArtifact[] = [];
  const route = captureRoute("workbook");
  await navigate(page, baseUrl, route);
  let desktopSidebarCollapsed = false;
  if (profile.id === "desktop") {
    const collapseSidebar = page.getByRole("button", { name: "Collapse sidebar", exact: true });
    if (await collapseSidebar.count() === 1) {
      await collapseSidebar.click({ timeout: ELEMENT_TIMEOUT_MS });
      desktopSidebarCollapsed = true;
      await page.waitForTimeout(220);
    }
  }
  await page.locator('[data-operations-workbook="true"][data-workbook-sheet="projects"]').waitFor({ state: "visible", timeout: ELEMENT_TIMEOUT_MS });
  artifacts.push(await captureFrame(page, profile, "03-workbook-projects.png"));

  if (profile.id === "desktop") {
    const projectNameCell = page.locator('[data-worksheet-cell$=":projectName"][data-worksheet-editable="true"]:visible').first();
    await projectNameCell.waitFor({ state: "visible", timeout: ELEMENT_TIMEOUT_MS });
    await projectNameCell.click({ timeout: ELEMENT_TIMEOUT_MS });
    const editor = page.locator('[data-worksheet-cell$=":projectName"]:visible input').first();
    await editor.waitFor({ state: "visible", timeout: ELEMENT_TIMEOUT_MS });
    const originalName = await editor.inputValue();
    if (!originalName.includes("Clark Industrial Water Treatment Upgrade")) {
      throw new Error("The first marketing project row did not match the expected editable Clark record.");
    }
    await editor.fill(`${originalName} — Controls`);
    artifacts.push(await captureFrame(page, profile, "04-workbook-projects-editing.png"));
    await page.getByRole("button", { name: "Save demo edits", exact: true }).click({ timeout: ELEMENT_TIMEOUT_MS });
    await page.waitForTimeout(300);
    artifacts.push(await captureFrame(page, profile, "05-workbook-projects-saved.png"));

    const editedNameCell = page.locator('[data-worksheet-cell$=":projectName"][data-worksheet-editable="true"]:visible').first();
    await editedNameCell.click({ timeout: ELEMENT_TIMEOUT_MS });
    const restoreEditor = page.locator('[data-worksheet-cell$=":projectName"]:visible input').first();
    await restoreEditor.waitFor({ state: "visible", timeout: ELEMENT_TIMEOUT_MS });
    await restoreEditor.fill(originalName);
    await page.getByRole("button", { name: "Save demo edits", exact: true }).click({ timeout: ELEMENT_TIMEOUT_MS });
    await page.waitForTimeout(250);
  }

  await selectWorkbookSheet(page, /Cost codes/i, "cost-codes");
  artifacts.push(await captureFrame(page, profile, "06-workbook-cost-codes.png"));
  await selectWorkbookSheet(page, "Expenses", "expenses");
  artifacts.push(await captureFrame(page, profile, "07-workbook-expenses.png"));
  if (profile.id === "desktop") {
    await scrollWorkbookToField(page, "description");
    artifacts.push(await captureFrame(page, profile, "08-workbook-expense-descriptions.png"));
    await scrollWorkbookToField(page, "amount");
    artifacts.push(await captureFrame(page, profile, "09-workbook-expense-values.png"));
  }
  await selectWorkbookSheet(page, "RFQs", "rfqs");
  artifacts.push(await captureFrame(page, profile, "10-workbook-rfqs.png"));
  await selectWorkbookSheet(page, /Purchase orders/i, "purchase-orders");
  artifacts.push(await captureFrame(page, profile, "11-workbook-purchase-orders.png"));
  if (profile.id === "desktop") {
    const transferDisclosure = page.locator("[data-workbook-transfer-disclosure] > summary");
    await transferDisclosure.click({ timeout: ELEMENT_TIMEOUT_MS });
    const downloadButton = page.getByRole("button", { name: "Download workbook", exact: true });
    await downloadButton.waitFor({ state: "visible", timeout: ELEMENT_TIMEOUT_MS });
    await downloadButton.scrollIntoViewIfNeeded({ timeout: ELEMENT_TIMEOUT_MS });
    await page.waitForTimeout(180);
    artifacts.push(await captureFrame(page, profile, "12-workbook-import-export.png"));
    await transferDisclosure.click({ timeout: ELEMENT_TIMEOUT_MS });
  }
  if (desktopSidebarCollapsed) {
    await page.getByRole("button", { name: "Expand sidebar", exact: true }).click({ timeout: ELEMENT_TIMEOUT_MS });
    await page.waitForTimeout(220);
  }
  return artifacts;
}

async function captureInvoiceReview(page: BrowserPageLike, profile: MarketingCaptureProfile, baseUrl: string): Promise<CaptureArtifact[]> {
  const route = captureRoute("supplier-invoice-review");
  await navigate(page, baseUrl, route);
  const review = page.locator('[data-testid="supplier-invoice-side-by-side-review"]');
  const sourcePane = page.locator('[data-testid="supplier-invoice-source-pane"]');
  const extractedPane = page.locator('[data-testid="supplier-invoice-extracted-pane"]');
  await review.waitFor({ state: "visible", timeout: ELEMENT_TIMEOUT_MS });
    await page.locator('[data-testid="supplier-invoice-source-document"][data-source-state="available"] img').waitFor({ state: "visible", timeout: ELEMENT_TIMEOUT_MS });

  const correction = page.locator('[data-testid="supplier-invoice-line-items-worksheet"] [data-worksheet-cell$=":description"][data-worksheet-editable="true"]:visible').first();
  await correction.waitFor({ state: "visible", timeout: ELEMENT_TIMEOUT_MS });
  await correction.click({ timeout: ELEMENT_TIMEOUT_MS });
  const editor = page.locator('[data-testid="supplier-invoice-line-items-worksheet"] [data-worksheet-cell$=":description"]:visible input').first();
  await editor.waitFor({ state: "visible", timeout: ELEMENT_TIMEOUT_MS });
  await editor.fill("3 HP vertical multistage booster pump with stainless-steel wetted parts");
  await page.getByRole("button", { name: "Save worksheet edits", exact: true }).click({ timeout: ELEMENT_TIMEOUT_MS });
  await page.waitForTimeout(320);

  const artifacts: CaptureArtifact[] = [];
  await sourcePane.scrollIntoViewIfNeeded({ timeout: ELEMENT_TIMEOUT_MS });
  await page.waitForTimeout(180);
  artifacts.push(await captureFrame(page, profile, "15-supplier-invoice-source-review.png"));
  if (profile.id === "vertical") {
    await extractedPane.scrollIntoViewIfNeeded({ timeout: ELEMENT_TIMEOUT_MS });
    await page.waitForTimeout(180);
    artifacts.push(await captureFrame(page, profile, "16-supplier-invoice-extracted-details.png"));
  }
  return artifacts;
}

async function captureProcurement(page: BrowserPageLike, profile: MarketingCaptureProfile, baseUrl: string): Promise<CaptureArtifact[]> {
  const route = captureRoute("procurement");
  await navigate(page, baseUrl, route);
  await page.getByRole("button", { name: /^Requests for Quotation \(RFQs\)/ }).click({ timeout: ELEMENT_TIMEOUT_MS });
  await page.waitForTimeout(220);
  const artifacts = [await captureFrame(page, profile, "17-procurement-rfqs.png")];
  await page.getByRole("button", { name: /^Purchase Orders/ }).click({ timeout: ELEMENT_TIMEOUT_MS });
  await page.waitForTimeout(220);
  artifacts.push(await captureFrame(page, profile, "18-procurement-purchase-orders.png"));
  return artifacts;
}

async function installInvoiceAssetRoutes(context: BrowserContextLike): Promise<void> {
  await context.route(/\/demo\/marketing-invoices\/[^/?#]+\.svg(?:[?#].*)?$/, async (route) => {
    const fileName = path.basename(new URL(route.request().url()).pathname);
    const assetPath = INVOICE_ASSETS.get(fileName);
    if (!assetPath) {
      await route.abort();
      return;
    }
    await route.fulfill({ status: 200, contentType: "image/svg+xml; charset=utf-8", body: await fs.readFile(assetPath) });
  });
}

async function removeTemporaryVideoDirectory(target: string): Promise<void> {
  const videoRoot = path.resolve(OUTPUT_DIR, "videos");
  const resolvedTarget = path.resolve(target);
  const relative = path.relative(videoRoot, resolvedTarget);
  if (!relative.startsWith(".capture-tmp-") || path.isAbsolute(relative) || relative.includes("..")) {
    throw new Error("Refusing to clean a video path outside the dedicated marketing capture temporary directory.");
  }
  await fs.rm(resolvedTarget, { recursive: true, force: true });
}

async function runCaptureProfile(browser: BrowserLike, profile: MarketingCaptureProfile, baseUrl: string): Promise<CaptureArtifact[]> {
  const outputVideoDir = path.join(OUTPUT_DIR, "videos");
  await fs.mkdir(outputVideoDir, { recursive: true });
  await fs.mkdir(path.join(OUTPUT_DIR, profile.id), { recursive: true });
  const temporaryVideoDir = path.join(outputVideoDir, `.capture-tmp-${profile.id}-${randomUUID()}`);
  await fs.mkdir(temporaryVideoDir, { recursive: true });
  const context = await browser.newContext({
    viewport: { ...profile.viewport },
    deviceScaleFactor: profile.deviceScaleFactor,
    locale: "en-PH",
    timezoneId: "Asia/Manila",
    recordVideo: { dir: temporaryVideoDir, size: { ...profile.videoSize } },
  });
  let page: BrowserPageLike | null = null;
  let artifacts: CaptureArtifact[] = [];
  try {
    await context.clock.setFixedTime(new Date(MARKETING_CAPTURE_FIXED_TIME));
    await installInvoiceAssetRoutes(context);
    const seed = { storageKey: DEMO_STORAGE_KEY, payload: JSON.stringify(createMarketingDemoWorkspace(MARKETING_DEMO_ANCHOR_DATE)) };
    await context.addInitScript((input) => {
      window.sessionStorage.setItem(input.storageKey, input.payload);
    }, seed);
    page = await context.newPage();

    const dashboard = captureRoute("dashboard");
    await navigate(page, baseUrl, dashboard);
    artifacts.push(await captureFrame(page, profile, "01-dashboard.png"));

    const projects = captureRoute("projects");
    await navigate(page, baseUrl, projects);
    artifacts.push(await captureFrame(page, profile, "02-projects.png"));

    artifacts.push(...await captureWorkbook(page, profile, baseUrl));

    const expenses = captureRoute("expenses");
    await navigate(page, baseUrl, expenses);
    artifacts.push(await captureFrame(page, profile, "13-expenses.png"));
    if (profile.id === "desktop") {
      const linkedExpense = page.locator('text="Magnetic flow meter and remote transmitter"').first();
      await linkedExpense.waitFor({ state: "visible", timeout: ELEMENT_TIMEOUT_MS });
      await linkedExpense.evaluate((element) => element.scrollIntoView({ block: "center" }));
      await page.waitForTimeout(180);
      artifacts.push(await captureFrame(page, profile, "14-expenses-supplier-invoice-link.png"));
    }

    artifacts.push(...await captureInvoiceReview(page, profile, baseUrl));
    artifacts.push(...await captureProcurement(page, profile, baseUrl));
  } finally {
    const video = page?.video() || null;
    try {
      await context.close();
      if (video) await video.saveAs(path.join(outputVideoDir, `${profile.id}-session.webm`));
    } finally {
      await removeTemporaryVideoDirectory(temporaryVideoDir);
    }
  }
  return artifacts;
}

async function gitHead(): Promise<string | null> {
  return new Promise((resolve) => {
    const isWindows = process.platform === "win32";
    const child = spawn(isWindows ? "git.exe" : "git", ["rev-parse", "HEAD"], { cwd: process.cwd(), stdio: ["ignore", "pipe", "ignore"], shell: false });
    let stdout = "";
    child.stdout?.on("data", (chunk: Buffer | string) => { stdout += chunk.toString(); });
    child.on("close", (code) => resolve(code === 0 ? stdout.trim() : null));
    child.on("error", () => resolve(null));
  });
}

async function gitWorkingTreeClean(): Promise<boolean | null> {
  return new Promise((resolve) => {
    const isWindows = process.platform === "win32";
    const child = spawn(isWindows ? "git.exe" : "git", ["status", "--porcelain"], { cwd: process.cwd(), stdio: ["ignore", "pipe", "ignore"], shell: false });
    let stdout = "";
    child.stdout?.on("data", (chunk: Buffer | string) => { stdout += chunk.toString(); });
    child.on("close", (code) => resolve(code === 0 ? stdout.trim().length === 0 : null));
    child.on("error", () => resolve(null));
  });
}

async function runMarketingCapture(): Promise<void> {
  const { baseUrl, port } = toBaseUrl();
  const localPreview = await startLocalPreview(baseUrl, port);
  let browser: BrowserLike | null = null;
  try {
    const chromium = (browserRuntimeRequire("playwright") as { chromium: ChromiumLike }).chromium;
    browser = await chromium.launch({ headless: true });
    const startedAt = new Date().toISOString();
    const artifacts: CaptureArtifact[] = [];
    for (const profile of MARKETING_CAPTURE_PROFILES) artifacts.push(...await runCaptureProfile(browser, profile, baseUrl));
    const manifest = {
      campaignDataset: "MKT-V1A",
      sourceSha: await gitHead(),
      workingTreeClean: await gitWorkingTreeClean(),
      capturedAt: startedAt,
      environment: "local built application at the isolated /demo route",
      authentication: "not required for the public demo route",
      persistence: "sessionStorage in separate Playwright browser contexts; no QA or production database writes",
      fixtureAnchorDate: MARKETING_DEMO_ANCHOR_DATE,
      profiles: MARKETING_CAPTURE_PROFILES.map((profile) => ({
        id: profile.id,
        viewport: profile.viewport,
        deviceScaleFactor: profile.deviceScaleFactor,
        videoSize: profile.videoSize,
      })),
      frames: artifacts,
      videos: ["videos/desktop-session.webm", "videos/vertical-session.webm"],
    };
    await fs.writeFile(path.join(OUTPUT_DIR, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    process.stdout.write(`Marketing capture complete: ${artifacts.length} frames and ${manifest.videos.length} browser videos in ${OUTPUT_DIR}\n`);
  } finally {
    if (browser) await browser.close();
    await terminateChildServer(localPreview, { port, baseUrl, startupPath: "/demo/app/dashboard", timeoutMs: 5_000 });
  }
}

if (pathToFileURL(path.resolve(process.argv[1] || "")).href === import.meta.url) {
  runMarketingCapture().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Marketing capture failed.";
    process.stderr.write(`Marketing capture failed: ${message}\n`);
    process.exitCode = 1;
  });
}
