import { execFile as execFileCallback } from "node:child_process";
import fs from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import {
  createOverflowResult,
  createQaManifest,
  createScenarioEvidence,
  formatFailedQaAssertions,
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
import { filterDemoQaScenarios } from "./qa/demoFeatureSelection.ts";
import { parseQaWorkerCount, runWithWorkerPool } from "./qa/workerPool.ts";

const execFile = promisify(execFileCallback);
const qaRuntimeRequire = createRequire(path.join(path.dirname(fileURLToPath(import.meta.url)), "qa", "browser-runtime", "package.json"));
const { chromium } = qaRuntimeRequire("playwright") as { readonly chromium: unknown };

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
const FEATURE_FILTER = [...new Set((process.env.DEMO_QA_FEATURES || "").split(",").map((value) => value.trim()).filter(Boolean))];
const SCENARIO_FILTER = filterDemoQaScenarios(DEMO_QA_SCENARIOS, FEATURE_FILTER);
const SCENARIOS_TO_RUN = SCENARIO_FILTER.scenarios;
const QA_WORKER_COUNT = parseQaWorkerCount(process.env.DEMO_QA_WORKERS);
const NAVIGATION_TIMEOUT_MS = 60_000;
const READY_TIMEOUT_MS = 30_000;
const DEMO_LOADING_MARKERS = [
  "Loading HydroQualiSense",
  "Loading company access",
  "Checking your workspace session",
  "Loading workspace",
] as const;

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

async function waitForDemoReady(page: QaBrowserPage) {
  await page.locator("body").first().waitFor({ state: "visible", timeout: READY_TIMEOUT_MS });
  await page.waitForFunction(
    (loadingMarkers: readonly string[]) => {
      const text = document.body?.innerText || "";
      return text.length >= 80 && !loadingMarkers.some((marker) => text.includes(marker));
    },
    [...DEMO_LOADING_MARKERS],
    { timeout: READY_TIMEOUT_MS, polling: 100 },
  );
}

async function runScenario(browser: QaBrowserLike, scenario: QaScenarioDefinition): Promise<ReturnType<typeof createScenarioEvidence>> {
  const startedAt = Date.now();
  const timestamp = new Date().toISOString();
  const context = await browser.newContext({ viewport: scenario.viewport, deviceScaleFactor: 1 });
  try {
    return await captureScenarioWithContext(context, scenario, startedAt, timestamp);
  } finally {
    await context.close();
  }
}

async function captureScenarioWithContext(
  context: QaContextLike,
  scenario: QaScenarioDefinition,
  startedAt: number,
  timestamp: string,
): Promise<ReturnType<typeof createScenarioEvidence>> {
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
    if (navigationLoaded) await waitForDemoReady(page);
  } catch (error) {
    navigationError = normalizeErrorMessage(error, "Navigation failed.");
  }

  if (navigationLoaded && scenario.action) {
    try {
      const returnedAssertions = await scenario.action(page);
      if (returnedAssertions) actionAssertions.push(...returnedAssertions);
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

function scenarioRunnerFailure(
  scenario: QaScenarioDefinition,
  error: unknown,
  durationMs: number,
): ReturnType<typeof createScenarioEvidence> {
  const message = normalizeErrorMessage(error, "Scenario runner failed.");
  return createScenarioEvidence({
    scenario,
    timestamp: new Date().toISOString(),
    durationMs,
    navigation: { requestedPath: scenario.path, finalPath: scenario.path, status: null, loaded: false, error: message },
    consoleErrors: [],
    pageErrors: [],
    failedRequests: [],
    overflow: createOverflowResult({ documentWidth: 0, bodyWidth: 0, viewportWidth: scenario.viewport.width }),
    assertions: [{ id: "scenario-runner", passed: false, details: message }],
    actionError: message,
    screenshotPath: null,
  });
}

function logLinesFor(
  results: readonly ReturnType<typeof createScenarioEvidence>[],
  runError: string | null,
  capture: { readonly durationMs: number; readonly workerCount: number; readonly scope: string; readonly features: readonly string[] },
): string[] {
  const lines = [
    "Engoryx QA-1 structured browser evidence",
    "",
    `schemaVersion=1 scenarios=${results.length}`,
    `scope=${capture.scope} workerCount=${capture.workerCount} captureDurationMs=${capture.durationMs} featureSelectors=${capture.features.length ? capture.features.join(",") : "full-catalog"}`,
  ];
  if (runError) lines.push(`RUNNER FAIL ${normalizeErrorMessage(runError, "QA runner failed.")}`);
  for (const result of results) {
    const blockingRequests = result.failedRequests.filter((request) => !request.ignored).length;
    lines.push(`${result.status} ${result.scenarioId} route=${result.route.id} viewport=${result.viewport.name} durationMs=${result.durationMs} consoleErrors=${result.consoleErrors.length} pageErrors=${result.pageErrors.length} failedRequests=${blockingRequests} overflowPx=${result.overflow.pixels}`);
    if (result.failureReasons.length) lines.push(`  reasons=${result.failureReasons.join(",")}`);
    for (const assertionLine of formatFailedQaAssertions(result.assertions)) lines.push(`  ${assertionLine}`);
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
  let captureDurationMs = 0;

  console.log(`Demo QA scope=${SCENARIO_FILTER.mode} scenarios=${SCENARIOS_TO_RUN.length} workerCount=${QA_WORKER_COUNT}`);
  if (FEATURE_FILTER.length && SCENARIO_FILTER.mode === "full") {
    console.warn(`DEMO_QA_FEATURES did not resolve completely (${SCENARIO_FILTER.reason}); running the full scenario catalog.`);
  }

  try {
    if (SCENARIOS_TO_RUN.length === 0) {
      runError = "The browser scenario catalog is empty.";
    } else {
      const launchedBrowser = await (chromium as unknown as { launch(options: { headless: boolean }): Promise<QaBrowserLike> }).launch({ headless: true });
      browser = launchedBrowser;
      const captureStartedAt = Date.now();
      const attempts = await runWithWorkerPool(SCENARIOS_TO_RUN, QA_WORKER_COUNT, async (scenario) => {
        const scenarioStartedAt = Date.now();
        try {
          return await runScenario(launchedBrowser, scenario);
        } catch (error) {
          return scenarioRunnerFailure(scenario, error, Date.now() - scenarioStartedAt);
        }
      });
      captureDurationMs = Date.now() - captureStartedAt;
      for (const [index, attempt] of attempts.entries()) {
        const scenario = SCENARIOS_TO_RUN[index]!;
        results.push(attempt.status === "fulfilled"
          ? attempt.value
          : scenarioRunnerFailure(scenario, attempt.reason, 0));
      }
    }
  } catch (error) {
    runError = normalizeErrorMessage(error, "The browser QA runner could not start.");
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch (error) {
        runError = runError || normalizeErrorMessage(error, "The browser could not close cleanly.");
      }
    }
  }

  const evidenceByScenarioId = new Map(results.map((result) => [result.scenarioId, result]));
  results.length = 0;
  for (const scenario of SCENARIOS_TO_RUN) {
    results.push(evidenceByScenarioId.get(scenario.id)
      || scenarioRunnerFailure(scenario, runError || "Scenario did not produce a worker result.", 0));
  }

  const logPath = path.join(OUTPUT_DIR, "logs", "qa.log");
  await fs.writeFile(logPath, `${logLinesFor(results, runError, {
    durationMs: captureDurationMs,
    workerCount: QA_WORKER_COUNT,
    scope: SCENARIO_FILTER.mode,
    features: FEATURE_FILTER,
  }).join("\n")}\n`, "utf8");
  const manifest = createQaManifest({
    run,
    scenarios: results,
    artifacts: { manifestPath: "manifest.json", screenshotsDirectory: "screenshots", logPath: "logs/qa.log" },
    runError,
  });
  await fs.writeFile(path.join(OUTPUT_DIR, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  for (const result of results) {
    console.log(`${result.status} ${result.scenarioId}: HTTP ${result.navigation.status ?? 0}, overflow ${result.overflow.pixels}px, consoleErrors=${result.consoleErrors.length}, pageErrors=${result.pageErrors.length}, failedRequests=${result.failedRequests.length}`);
    if (result.status === "FAIL") {
      if (result.failureReasons.length) console.error(`  reasons=${result.failureReasons.join(",")}`);
      for (const assertionLine of formatFailedQaAssertions(result.assertions)) console.error(`  ${assertionLine}`);
    }
  }
  if (runError) console.error(`FAIL QA runner: ${runError}`);
  if (manifest.summary.failedScenarios > 0 || runError) process.exitCode = 1;
}

await main();
