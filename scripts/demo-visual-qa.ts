import { execFile as execFileCallback } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
// Playwright is intentionally installed by the QA workflow/local QA command,
// not by the application dependency set.
// @ts-ignore -- the QA-only dependency is present when this script executes.
import { chromium } from "playwright";
import {
  createOverflowResult,
  createQaManifest,
  createScenarioEvidence,
  normalizeBranchName,
  normalizeCommitSha,
  normalizeConsoleError,
  normalizeErrorMessage,
  normalizeFailedRequest,
  normalizePageError,
  type QaAssertion,
  type QaBrowserPage,
  type QaConsoleError,
  type QaFailedRequest,
  type QaNavigationResult,
  type QaPageError,
  type QaScenarioDefinition,
  type QaViewport,
} from "./qa/structuredEvidence.ts";
import { DEMO_QA_SCENARIOS } from "./qa/demoScenarios.ts";

const execFile = promisify(execFileCallback);

interface QaResponseLike {
  status(): number;
  statusText(): string;
  request(): QaRequestLike;
}

interface QaRequestLike {
  url(): string;
  method(): string;
  resourceType(): string;
  failure(): { errorText?: string } | null;
}

interface QaConsoleMessageLike {
  type(): string;
  text(): string;
  location(): { url?: string };
}

interface QaPageLike extends QaBrowserPage {
  on(event: "console", listener: (message: QaConsoleMessageLike) => void): void;
  on(event: "pageerror", listener: (error: unknown) => void): void;
  on(event: "response", listener: (response: QaResponseLike) => void): void;
  on(event: "requestfailed", listener: (request: QaRequestLike) => void): void;
  goto(url: string, options: { waitUntil: "networkidle"; timeout: number }): Promise<QaResponseLike | null>;
  evaluate<T>(pageFunction: () => T): Promise<T>;
  screenshot(options: { path: string; fullPage: boolean }): Promise<void>;
  url(): string;
}

interface QaContextLike {
  newPage(): Promise<QaPageLike>;
  close(): Promise<void>;
}

interface PageMetrics {
  readonly documentWidth: number;
  readonly viewportWidth: number;
  readonly bodyWidth: number;
  readonly title: string;
  readonly bodyTextLength: number;
}

interface QaBrowserLike {
  newContext(options: { viewport: QaViewport; deviceScaleFactor: number }): Promise<QaContextLike>;
  close(): Promise<void>;
}

const BASE_URL = (process.env.DEMO_QA_BASE_URL || "http://127.0.0.1:4173").replace(/\/+$/, "");
const OUTPUT_DIR = path.resolve(process.env.DEMO_QA_OUTPUT_DIR || "artifacts/demo-visual-qa");
const NAVIGATION_TIMEOUT_MS = 60_000;
const SETTLE_DELAY_MS = 900;
const ACTION_SETTLE_DELAY_MS = 350;

function joinUrl(baseUrl: string, routePath: string): string {
  return `${baseUrl}${routePath.startsWith("/") ? routePath : `/${routePath}`}`;
}

async function gitValue(args: readonly string[], fallback: string): Promise<string> {
  try {
    const result = await execFile("git", [...args], { cwd: process.cwd() });
    return result.stdout.trim() || fallback;
  } catch {
    return fallback;
  }
}

function pageMetricsFallback(): PageMetrics {
  return { documentWidth: 0, viewportWidth: 0, bodyWidth: 0, title: "", bodyTextLength: 0 };
}

async function runScenario(browser: QaBrowserLike, scenario: QaScenarioDefinition): Promise<ReturnType<typeof createScenarioEvidence>> {
  const startedAt = Date.now();
  const timestamp = new Date().toISOString();
  const context = await browser.newContext({ viewport: scenario.viewport, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const consoleErrors: QaConsoleError[] = [];
  const pageErrors: QaPageError[] = [];
  const requestFailures = new Map<QaRequestLike, QaFailedRequest>();
  const actionAssertions: QaAssertion[] = [];
  let actionError: string | null = null;
  let navigationError: string | null = null;
  let screenshotError: string | null = null;
  let metrics = pageMetricsFallback();
  let responseStatus: number | null = null;
  let navigationLoaded = false;

  const recordRequestFailure = (request: QaRequestLike, status: number | null, statusText?: string) => {
    const failure = request.failure();
    const normalized = normalizeFailedRequest({
      url: request.url(),
      method: request.method(),
      resourceType: request.resourceType(),
      status,
      statusText,
      failureText: failure?.errorText,
    }, scenario.failurePolicy.ignoredRequestPatterns);
    if (normalized) requestFailures.set(request, normalized);
  };

  page.on("console", (message) => {
    if (message.type() !== "error") return;
    consoleErrors.push(normalizeConsoleError({ message: message.text(), location: message.location()?.url }, scenario.failurePolicy.ignoredConsoleErrorPatterns));
  });
  page.on("pageerror", (error) => pageErrors.push(normalizePageError(error)));
  page.on("response", (response) => {
    const status = response.status();
    if (status >= 400) recordRequestFailure(response.request(), status, response.statusText());
  });
  page.on("requestfailed", (request) => recordRequestFailure(request, null));

  const navigation: QaNavigationResult = {
    requestedPath: scenario.path,
    finalPath: scenario.path,
    status: null,
    loaded: false,
  };

  try {
    const response = await page.goto(joinUrl(BASE_URL, scenario.path), { waitUntil: "networkidle", timeout: NAVIGATION_TIMEOUT_MS });
    responseStatus = response?.status() ?? null;
    navigationLoaded = Boolean(response) && responseStatus !== null && responseStatus >= 200 && responseStatus < 400;
    await page.waitForTimeout(SETTLE_DELAY_MS);
  } catch (error) {
    navigationError = normalizeErrorMessage(error, "Navigation failed.");
  }

  if (navigationLoaded && scenario.action) {
    try {
      const returnedAssertions = await scenario.action(page);
      if (returnedAssertions) actionAssertions.push(...returnedAssertions);
      await page.waitForTimeout(ACTION_SETTLE_DELAY_MS);
    } catch (error) {
      actionError = normalizeErrorMessage(error, "Scenario interaction failed.");
    }
  }

  try {
    if (navigationLoaded) {
      metrics = await page.evaluate(() => ({
        documentWidth: document.documentElement.scrollWidth,
        viewportWidth: document.documentElement.clientWidth,
        bodyWidth: document.body.scrollWidth,
        title: document.title,
        bodyTextLength: document.body.innerText.length,
      }));
    }
  } catch (error) {
    actionError = actionError || normalizeErrorMessage(error, "Page metrics could not be collected.");
  }

  const overflow = createOverflowResult(metrics);
  const assertions: QaAssertion[] = [
    { id: "navigation-response", passed: navigationLoaded, details: responseStatus === null ? "No HTTP response." : `HTTP ${responseStatus}` },
    { id: "page-has-title", passed: Boolean(metrics.title.trim()), details: metrics.title.trim() || "Document title is empty." },
    { id: "page-has-content", passed: metrics.bodyTextLength >= 80, details: `body text length: ${metrics.bodyTextLength}` },
    { id: "horizontal-overflow", passed: !scenario.expectedNoHorizontalOverflow || !overflow.detected, details: `${overflow.pixels}px beyond ${overflow.viewportWidth}px viewport` },
    ...actionAssertions,
  ];

  try {
    const screenshotAbsolutePath = path.join(OUTPUT_DIR, "screenshots", `${scenario.id}.png`);
    await page.screenshot({ path: screenshotAbsolutePath, fullPage: true });
  } catch (error) {
    screenshotError = normalizeErrorMessage(error, "Screenshot capture failed.");
  }

  let finalPath = scenario.path;
  try {
    finalPath = page.url() || scenario.path;
  } catch {
    finalPath = scenario.path;
  }
  const completedNavigation: QaNavigationResult = {
    requestedPath: navigation.requestedPath,
    finalPath,
    status: responseStatus,
    loaded: navigationLoaded,
    ...(navigationError ? { error: navigationError } : {}),
  };

  await context.close();
  const screenshotPath = screenshotError ? null : path.posix.join("screenshots", `${scenario.id}.png`);
  return createScenarioEvidence({
    scenario,
    timestamp,
    durationMs: Date.now() - startedAt,
    navigation: completedNavigation,
    consoleErrors,
    pageErrors,
    failedRequests: [...requestFailures.values()],
    overflow,
    assertions,
    actionError,
    screenshotPath,
    screenshotError,
  });
}

function logLinesFor(results: readonly ReturnType<typeof createScenarioEvidence>[], runError?: string | null): string[] {
  const lines = [
    "Engoryx QA-1 structured browser evidence",
    "",
    `schemaVersion=1 scenarios=${results.length}`,
  ];
  if (runError) lines.push(`RUNNER FAIL ${normalizeErrorMessage(runError, "QA runner failed.")}`);
  for (const result of results) {
    const blockingRequests = result.failedRequests.filter((request) => !request.ignored).length;
    lines.push(`${result.status} ${result.scenarioId} route=${result.route.id} viewport=${result.viewport.name} durationMs=${result.durationMs} consoleErrors=${result.consoleErrors.length} pageErrors=${result.pageErrors.length} failedRequests=${blockingRequests} overflowPx=${result.overflow.pixels}`);
    if (result.failureReasons.length) lines.push(`  reasons=${result.failureReasons.join(",")}`);
    const firstError = result.consoleErrors.find((error) => !error.ignored)?.message || result.pageErrors[0]?.message || result.interactionError || result.navigation.error;
    if (firstError) lines.push(`  evidence=${firstError}`);
  }
  return lines;
}

async function main(): Promise<void> {
  await fs.mkdir(path.join(OUTPUT_DIR, "screenshots"), { recursive: true });
  await fs.mkdir(path.join(OUTPUT_DIR, "logs"), { recursive: true });

  const run = {
    commitSha: normalizeCommitSha(process.env.GITHUB_SHA || await gitValue(["rev-parse", "HEAD"], "unknown")),
    branch: normalizeBranchName(process.env.GITHUB_HEAD_REF || process.env.GITHUB_REF_NAME || await gitValue(["branch", "--show-current"], "local")),
    timestamp: new Date().toISOString(),
    trigger: process.env.GITHUB_EVENT_NAME || "local",
    appMode: "demo" as const,
  };

  const results: Array<ReturnType<typeof createScenarioEvidence>> = [];
  let runError: string | null = null;
  let browser: QaBrowserLike | null = null;

  try {
    browser = await (chromium as unknown as { launch(options: { headless: boolean }): Promise<QaBrowserLike> }).launch({ headless: true });
    for (const scenario of DEMO_QA_SCENARIOS) {
      try {
        results.push(await runScenario(browser, scenario));
      } catch (error) {
        const message = normalizeErrorMessage(error, "Scenario runner failed.");
        results.push(createScenarioEvidence({
          scenario,
          timestamp: new Date().toISOString(),
          durationMs: 0,
          navigation: { requestedPath: scenario.path, finalPath: scenario.path, status: null, loaded: false, error: message },
          consoleErrors: [],
          pageErrors: [],
          failedRequests: [],
          overflow: createOverflowResult({ documentWidth: 0, bodyWidth: 0, viewportWidth: scenario.viewport.width }),
          assertions: [{ id: "scenario-runner", passed: false, details: message }],
          actionError: message,
          screenshotPath: null,
        }));
      }
    }
  } catch (error) {
    runError = normalizeErrorMessage(error, "The browser QA runner could not start.");
  } finally {
    if (browser) await browser.close();
  }

  const logPath = path.join(OUTPUT_DIR, "logs", "qa.log");
  await fs.writeFile(logPath, `${logLinesFor(results, runError).join("\n")}\n`, "utf8");
  const manifest = createQaManifest({
    run,
    scenarios: results,
    artifacts: { manifestPath: "manifest.json", screenshotsDirectory: "screenshots", logPath: "logs/qa.log" },
    runError,
  });
  await fs.writeFile(path.join(OUTPUT_DIR, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  for (const result of results) {
    console.log(`${result.status} ${result.scenarioId}: HTTP ${result.navigation.status ?? 0}, overflow ${result.overflow.pixels}px, consoleErrors=${result.consoleErrors.length}, pageErrors=${result.pageErrors.length}, failedRequests=${result.failedRequests.length}`);
  }
  if (runError) console.error(`FAIL QA runner: ${runError}`);
  if (manifest.summary.failedScenarios > 0 || runError) process.exitCode = 1;
}

await main();
