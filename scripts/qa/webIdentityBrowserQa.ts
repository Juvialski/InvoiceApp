import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

type Viewport = { readonly name: string; readonly width: number; readonly height: number };
type BrowserResponse = { status(): number };
type Locator = {
  count(): Promise<number>;
  first(): Locator;
  click(): Promise<void>;
  innerText(): Promise<string>;
};
type BrowserPage = {
  on(event: "console", callback: (message: { type(): string; text(): string }) => void): void;
  on(event: "pageerror", callback: (error: unknown) => void): void;
  on(event: "requestfailed", callback: (request: { url(): string; failure(): { errorText?: string } | null }) => void): void;
  goto(url: string, options: { waitUntil: "commit"; timeout: number }): Promise<BrowserResponse | null>;
  locator(selector: string): Locator;
  evaluate<T>(callback: () => T): Promise<T>;
  screenshot(options: { path: string; fullPage: boolean }): Promise<void>;
};
type BrowserContext = { newPage(): Promise<BrowserPage>; close(): Promise<void> };
type Browser = { newContext(options: { viewport: { width: number; height: number }; deviceScaleFactor: number }): Promise<BrowserContext>; close(): Promise<void> };
type Chromium = { launch(options: { headless: boolean }): Promise<Browser> };

interface BrowserEvidence {
  readonly id: string;
  readonly deployment: "qa" | "production";
  readonly route: string;
  readonly viewport: Viewport;
  readonly responseStatus: number;
  readonly title: string;
  readonly neutralIdentity: boolean;
  readonly expectedCompanyIdentity: boolean;
  readonly noProductionCanonical: boolean;
  readonly noIndex: boolean;
  readonly primaryActions: boolean;
  readonly recoveryForm: boolean;
  readonly qaWarning: boolean;
  readonly environmentBannerText: string;
  readonly hiddenDeploymentId: boolean;
  readonly noHorizontalOverflow: boolean;
  readonly consoleErrors: readonly string[];
  readonly pageErrors: readonly string[];
  readonly screenshot: string;
}

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const browserRequire = createRequire(path.join(scriptDirectory, "browser-runtime", "package.json"));
const { chromium } = browserRequire("playwright") as { readonly chromium: Chromium };
const viteEntry = path.resolve(process.cwd(), "node_modules/vite/bin/vite.js");
const outputDirectory = path.resolve(process.env.WEB_IDENTITY_QA_OUTPUT_DIR || "artifacts/qa/web-qa-1-browser");
const desktop: Viewport = { name: "constrained-laptop-1280x800", width: 1280, height: 800 };
const phone: Viewport = { name: "phone-390x844", width: 390, height: 844 };

function delay(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function startViteServer(environment: "qa" | "production", port: number): Promise<{ readonly child: ChildProcess; readonly baseUrl: string }> {
  const child = spawn(process.execPath, [viteEntry, "--host", "127.0.0.1", "--port", String(port), "--strictPort"], {
    cwd: process.cwd(),
    stdio: "ignore",
    windowsHide: true,
    env: {
      ...process.env,
      VITE_HYDROQUALISENSE_ENVIRONMENT: environment,
      VITE_HYDROQUALISENSE_DEPLOYMENT_ID: environment === "qa" ? "qa-hydroqualisense" : "production-client",
      VITE_HYDROQUALISENSE_PUBLIC_FUNNEL_ENABLED: "true",
      VITE_ENABLE_SAMPLE_INVOICES: "false",
      VITE_SUPABASE_URL: "http://127.0.0.1:5190",
      VITE_SUPABASE_PUBLISHABLE_KEY: "web-qa-browser-test-placeholder",
    },
  });
  const baseUrl = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`${environment} Vite server exited with code ${child.exitCode}.`);
    try {
      const response = await fetch(baseUrl);
      if (response.ok) {
        console.log(`SERVER_READY environment=${environment} status=${response.status} port=${port} deploymentIdConfigured=${environment === "qa"}`);
        return { child, baseUrl };
      }
    } catch { /* Vite is still starting. */ }
    await delay(250);
  }
  child.kill();
  throw new Error(`${environment} Vite server did not become ready within 45 seconds.`);
}

async function closeServer(child: ChildProcess) {
  if (child.exitCode !== null || child.killed) return;
  child.kill();
  await Promise.race([
    new Promise<void>((resolve) => child.once("exit", () => resolve())),
    delay(5_000),
  ]);
}

async function bootstrapHead(baseUrl: string) {
  const response = await fetch(baseUrl);
  if (!response.ok) throw new Error(`Initial HTML returned HTTP ${response.status}.`);
  const html = await response.text();
  return html.match(/<head>[\s\S]*?<\/head>/i)?.[0] || "";
}

async function waitForContent(page: BrowserPage) {
  const deadline = Date.now() + 25_000;
  while (Date.now() < deadline) {
    try {
      const text = (await page.locator("#root").innerText()).trim();
      const stillLoading = /^(?:Loading\b|Checking your workspace session\b)/i.test(text);
      if (text.length >= 80 && !stillLoading) return;
    } catch { /* React has not mounted yet. */ }
    await delay(100);
  }
  throw new Error("The application root did not render content.");
}

async function capture(
  browser: Browser,
  server: { readonly baseUrl: string },
  options: { readonly id: string; readonly deployment: "qa" | "production"; readonly route: string; readonly viewport: Viewport; readonly scenario: "landing" | "auth" | "recovery" | "demo" | "public" },
): Promise<BrowserEvidence> {
  const context = await browser.newContext({ viewport: { width: options.viewport.width, height: options.viewport.height }, deviceScaleFactor: 1 });
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const failedRequests: string[] = [];
  try {
    const page = await context.newPage();
    page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
    page.on("pageerror", (error) => pageErrors.push(error instanceof Error ? error.message : String(error)));
    page.on("requestfailed", (request) => failedRequests.push(`${request.url()}: ${request.failure()?.errorText || "failed"}`));
    let response: BrowserResponse | null;
    try {
      response = await page.goto(`${server.baseUrl}${options.route}`, { waitUntil: "commit", timeout: 45_000 });
    } catch (error) {
      throw new Error(`Navigation failed for ${options.id}: ${error instanceof Error ? error.message : String(error)}; console=${consoleErrors.join(" | ")}; page=${pageErrors.join(" | ")}; requests=${failedRequests.join(" | ")}`);
    }
    if (!response) throw new Error(`No HTTP response for ${options.route}.`);
    await waitForContent(page);
    await delay(250);

    let primaryActions = true;
    let recoveryForm = true;
    if (options.scenario === "landing") {
      const actionState = await page.evaluate(() => {
        const links = [...document.querySelectorAll<HTMLAnchorElement>("a")];
        const signInLinks = links.filter((link) => link.innerText.replace(/\s+/g, " ").trim() === "Sign in to QA workspace");
        const demoLinks = links.filter((link) => link.innerText.replace(/\s+/g, " ").trim() === "Open demo");
        return {
          signInHrefs: signInLinks.map((link) => link.getAttribute("href")),
          demoHrefs: demoLinks.map((link) => link.getAttribute("href")),
        };
      });
      primaryActions = actionState.signInHrefs.length > 0
        && actionState.signInHrefs.every((href) => href === "/dashboard")
        && actionState.demoHrefs.some((href) => href === "/demo");
    } else if (options.scenario === "auth") {
      recoveryForm = await page.locator('input[type="email"]').count() === 1
        && await page.locator('input[type="password"]').count() === 1;
    } else if (options.scenario === "recovery") {
      const text = await page.locator("#root").innerText();
      recoveryForm = /Choose a new password/.test(text) && await page.locator('input[type="password"]').count() === 2;
    } else if (options.scenario === "demo") {
      const text = await page.locator("#root").innerText();
      primaryActions = /demo|synthetic/i.test(text);
    }

    if (options.id === "qa-workspace-signin-click") {
      await page.locator('a[href="/dashboard"]').first().click();
      await waitForContent(page);
      await delay(150);
      const deadline = Date.now() + 15_000;
      while (Date.now() < deadline) {
        const pathNow = await page.evaluate(() => window.location.pathname);
        if (pathNow === "/dashboard") break;
        await delay(100);
      }
      primaryActions = await page.evaluate(() => window.location.pathname === "/dashboard")
        && await page.locator('input[type="email"]').count() === 1;
    }

    const snapshot = await page.evaluate(() => {
      const metadata = [...document.querySelectorAll<HTMLMetaElement>("meta")]
        .map((meta) => [meta.name, meta.getAttribute("property"), meta.content].filter(Boolean).join(" "))
        .join("\n");
      return {
        title: document.title,
        body: document.body?.innerText || "",
        metadata,
        canonical: document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href || null,
        warning: document.querySelector<HTMLElement>("[data-deployment-environment]")?.innerText.replace(/\s+/g, " ").trim() || "",
        deploymentIdVisible: document.body?.innerText.includes("qa-hydroqualisense") || false,
        viewportWidth: document.documentElement.clientWidth,
        documentWidth: document.documentElement.scrollWidth,
        bodyWidth: document.body?.scrollWidth || 0,
      };
    });
    const visibleIdentity = `${snapshot.title}\n${snapshot.body}\n${snapshot.metadata}`;
    const neutralIdentity = options.deployment !== "qa" || !/Hydroqualisense|HydroQualiSense/i.test(visibleIdentity);
    const expectedCompanyIdentity = options.deployment !== "production"
      || (visibleIdentity.includes("Hydroqualisense Solutions Corp.") && !visibleIdentity.includes("QA Software Showcase"));
    const qaWarning = options.deployment !== "qa"
      || (options.id === "qa-demo"
        ? /synthetic demo/i.test(snapshot.body)
        : /QA ENVIRONMENT\s*·\s*SYNTHETIC DATA ONLY/.test(snapshot.body));
    const hiddenDeploymentId = options.deployment !== "qa" || !snapshot.deploymentIdVisible;
    const noProductionCanonical = options.deployment !== "qa" || snapshot.canonical === null;
    const noIndex = options.deployment !== "qa" || /noindex, nofollow/i.test(snapshot.metadata);
    const noHorizontalOverflow = snapshot.documentWidth <= snapshot.viewportWidth && snapshot.bodyWidth <= snapshot.viewportWidth;
    const screenshot = path.posix.join("screenshots", `${options.id}.png`);
    await page.screenshot({ path: path.join(outputDirectory, screenshot), fullPage: true });
    return {
      id: options.id,
      deployment: options.deployment,
      route: options.route,
      viewport: options.viewport,
      responseStatus: response.status(),
      title: snapshot.title,
      neutralIdentity,
      expectedCompanyIdentity,
      noProductionCanonical,
      noIndex,
      primaryActions,
      recoveryForm,
      qaWarning,
      environmentBannerText: snapshot.warning,
      hiddenDeploymentId,
      noHorizontalOverflow,
      consoleErrors,
      pageErrors,
      screenshot,
    };
  } finally {
    await context.close();
  }
}

async function main() {
  await fs.mkdir(path.join(outputDirectory, "screenshots"), { recursive: true });
  const qaServer = await startViteServer("qa", 5178);
  let productionServer: { readonly child: ChildProcess; readonly baseUrl: string } | null = null;
  let browser: Browser | null = null;
  try {
    const readyProductionServer = await startViteServer("production", 5179);
    productionServer = readyProductionServer;
    const qaHead = await bootstrapHead(qaServer.baseUrl);
    const productionHead = await bootstrapHead(readyProductionServer.baseUrl);
    const bootstrapMetadata = {
      qaTitleNeutral: /<title>Engineering Operations Platform \| QA Workspace<\/title>/i.test(qaHead),
      qaNoCorporateBranding: !/Hydroqualisense|HydroQualiSense/i.test(qaHead),
      qaNoCanonical: !/rel="canonical"|property="og:url"/i.test(qaHead),
      qaNoIndex: /name="robots" content="noindex, nofollow"/i.test(qaHead),
      productionTitleUnchanged: /<title>Hydroqualisense Solutions Corp\. \| Water &amp; Engineering<\/title>/i.test(productionHead),
      productionCanonicalUnchanged: /rel="canonical" href="https:\/\/hydroqualisense\.com"/i.test(productionHead),
    };
    if (Object.values(bootstrapMetadata).some((passed) => !passed)) {
      throw new Error(`Initial HTML branding failed: ${JSON.stringify(bootstrapMetadata)}.`);
    }
    browser = await chromium.launch({ headless: true });
    const scenarios = [
      { id: "qa-root-laptop", deployment: "qa", route: "/", viewport: desktop, scenario: "landing" },
      { id: "qa-root-phone", deployment: "qa", route: "/", viewport: phone, scenario: "landing" },
      { id: "qa-workspace-auth-laptop", deployment: "qa", route: "/dashboard", viewport: desktop, scenario: "auth" },
      { id: "qa-workspace-auth-phone", deployment: "qa", route: "/dashboard", viewport: phone, scenario: "auth" },
      { id: "qa-workspace-signin-click", deployment: "qa", route: "/", viewport: desktop, scenario: "landing" },
      { id: "qa-password-recovery", deployment: "qa", route: "/?auth=reset", viewport: desktop, scenario: "recovery" },
      { id: "qa-demo", deployment: "qa", route: "/demo", viewport: desktop, scenario: "demo" },
      { id: "qa-privacy", deployment: "qa", route: "/privacy", viewport: desktop, scenario: "public" },
      { id: "qa-terms", deployment: "qa", route: "/terms", viewport: desktop, scenario: "public" },
      { id: "qa-request-demo-enabled", deployment: "qa", route: "/request-demo", viewport: phone, scenario: "public" },
      { id: "production-company-public-root", deployment: "production", route: "/", viewport: desktop, scenario: "public" },
    ] as const;
    const results: BrowserEvidence[] = [];
    for (const scenario of scenarios) {
      const server = scenario.deployment === "qa" ? qaServer : readyProductionServer;
      const result = await capture(browser, server, scenario);
      results.push(result);
      const assertionsPassed = result.responseStatus >= 200 && result.responseStatus < 400
        && result.neutralIdentity && result.expectedCompanyIdentity && result.noProductionCanonical && result.noIndex && result.primaryActions
        && result.recoveryForm && result.qaWarning && result.hiddenDeploymentId
        && result.noHorizontalOverflow && result.consoleErrors.length === 0 && result.pageErrors.length === 0;
      const failures = [
        !result.neutralIdentity && "neutralIdentity",
        !result.expectedCompanyIdentity && "expectedCompanyIdentity",
        !result.noProductionCanonical && "noProductionCanonical",
        !result.noIndex && "noIndex",
        !result.primaryActions && "primaryActions",
        !result.recoveryForm && "recoveryForm",
        !result.qaWarning && "qaWarning",
        !result.hiddenDeploymentId && "hiddenDeploymentId",
        !result.noHorizontalOverflow && "horizontalOverflow",
        result.consoleErrors.length > 0 && "consoleErrors",
        result.pageErrors.length > 0 && "pageErrors",
      ].filter(Boolean);
      console.log(`${assertionsPassed ? "PASS" : "FAIL"} ${result.id} ${result.viewport.width}x${result.viewport.height} title=${result.title}${failures.length ? ` failed=${failures.join(",")}` : ""}`);
    }

    const manifest = {
      schemaVersion: 1,
      task: "WEB-QA-1",
      repository: {
        headSha: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
        workingTreeDirty: Boolean(execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }).trim()),
      },
      capturedAt: new Date().toISOString(),
      environments: {
        qa: { environment: "qa", deploymentId: "qa-hydroqualisense", authenticatedSession: false, data: "synthetic/no writes" },
        production: { environment: "production", host: "local Vite dev server", publicFunnelEnabled: true, authenticatedSession: false, canonicalHost: false },
      },
      bootstrapMetadata,
      scenarios: results,
    };
    await fs.writeFile(path.join(outputDirectory, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    const failed = results.filter((result) => result.responseStatus < 200 || result.responseStatus >= 400
      || !result.neutralIdentity || !result.expectedCompanyIdentity || !result.noProductionCanonical || !result.noIndex
      || !result.primaryActions || !result.recoveryForm
      || !result.qaWarning || !result.hiddenDeploymentId || !result.noHorizontalOverflow
      || result.consoleErrors.length > 0 || result.pageErrors.length > 0);
    if (failed.length) throw new Error(`${failed.length} WEB-QA-1 browser scenarios failed. See ${path.join(outputDirectory, "manifest.json")}.`);
    console.log(`WEB-QA-1 browser QA passed ${results.length}/${results.length} scenarios; report: ${path.join(outputDirectory, "manifest.json")}`);
  } finally {
    if (browser) await browser.close();
    await closeServer(qaServer.child);
    if (productionServer) await closeServer(productionServer.child);
  }
}

await main();
