export const QA_EVIDENCE_SCHEMA_VERSION = 1 as const;
export const QA_DEFAULT_OVERFLOW_TOLERANCE_PX = 2;
export const QA_MAX_ERROR_LENGTH = 600;

export type QaScenarioStatus = "PASS" | "FAIL";
export type QaRequestFailureClassification = "http-error" | "network-error";

export interface QaViewport {
  readonly name: string;
  readonly width: number;
  readonly height: number;
}

export const QA_VIEWPORTS = {
  desktop: { name: "desktop-1440", width: 1440, height: 1000 },
  laptop: { name: "laptop-1366", width: 1366, height: 768 },
  tablet: { name: "tablet-768", width: 768, height: 1024 },
  mobile: { name: "mobile-390", width: 390, height: 844 },
} as const satisfies Record<string, QaViewport>;

export interface QaRoute {
  readonly id: string;
  readonly canonicalPath: string;
}

export interface QaFailurePolicy {
  /** Regex source strings are intentionally explicit and easy to review. */
  readonly ignoredConsoleErrorPatterns: readonly string[];
  /** Regex source strings are matched against normalized request paths/errors. */
  readonly ignoredRequestPatterns: readonly string[];
}

export const DEFAULT_QA_FAILURE_POLICY: QaFailurePolicy = {
  ignoredConsoleErrorPatterns: [],
  ignoredRequestPatterns: [],
};

export interface QaAssertion {
  readonly id: string;
  readonly passed: boolean;
  readonly details?: string;
}

export interface QaBrowserLocator {
  first(): QaBrowserLocator;
  click(): Promise<void>;
  selectOption(value: string): Promise<void>;
  count(): Promise<number>;
}

export interface QaBrowserPage {
  getByRole(role: string, options?: { name?: string | RegExp; exact?: boolean }): QaBrowserLocator;
  locator(selector: string): QaBrowserLocator;
  waitForTimeout(timeoutMs: number): Promise<void>;
}

export type QaScenarioAction = (page: QaBrowserPage) => Promise<readonly QaAssertion[] | void>;

export interface QaScenarioDefinition {
  readonly id: string;
  readonly feature: string;
  readonly route: QaRoute;
  readonly path: string;
  readonly interactionState: string;
  readonly viewport: QaViewport;
  readonly expectedNoHorizontalOverflow: boolean;
  readonly failurePolicy: QaFailurePolicy;
  readonly action?: QaScenarioAction;
}

export type QaScenarioDefinitionInput = Omit<QaScenarioDefinition, "id" | "failurePolicy" | "expectedNoHorizontalOverflow"> & {
  readonly id?: string;
  readonly failurePolicy?: Partial<QaFailurePolicy>;
  readonly expectedNoHorizontalOverflow?: boolean;
};

export interface QaConsoleError {
  readonly message: string;
  readonly locationPath?: string;
  readonly ignored: boolean;
}

export interface QaPageError {
  readonly message: string;
}

export interface QaFailedRequest {
  readonly url: string;
  readonly method: string;
  readonly resourceType: string;
  readonly status: number | null;
  readonly statusText?: string;
  readonly failureText?: string;
  readonly classification: QaRequestFailureClassification;
  readonly ignored: boolean;
}

export interface QaOverflowResult {
  readonly detected: boolean;
  readonly pixels: number;
  readonly documentWidth: number;
  readonly bodyWidth: number;
  readonly viewportWidth: number;
  readonly tolerancePx: number;
}

export interface QaNavigationResult {
  readonly requestedPath: string;
  readonly finalPath: string;
  readonly status: number | null;
  readonly loaded: boolean;
  readonly error?: string;
}

export interface QaScenarioEvidence {
  readonly scenarioId: string;
  readonly feature: string;
  readonly route: QaRoute;
  readonly requestedPath: string;
  readonly interactionState: string;
  readonly viewport: QaViewport;
  readonly expectedNoHorizontalOverflow: boolean;
  readonly screenshotPath: string | null;
  readonly screenshotError?: string;
  readonly interactionError?: string;
  readonly consoleErrors: readonly QaConsoleError[];
  readonly pageErrors: readonly QaPageError[];
  readonly failedRequests: readonly QaFailedRequest[];
  readonly overflow: QaOverflowResult;
  readonly navigation: QaNavigationResult;
  readonly assertions: readonly QaAssertion[];
  readonly durationMs: number;
  readonly timestamp: string;
  readonly status: QaScenarioStatus;
  readonly failureReasons: readonly string[];
}

export interface QaRunMetadata {
  readonly commitSha: string;
  readonly branch: string;
  readonly timestamp: string;
  readonly trigger: string;
  readonly appMode: "demo";
}

export interface QaRunArtifacts {
  readonly manifestPath: string;
  readonly screenshotsDirectory: string;
  readonly logPath: string;
}

export interface QaRunSummary {
  readonly routesTested: number;
  readonly viewportsTested: number;
  readonly interactionScenarios: number;
  readonly screenshotsCaptured: number;
  readonly consoleErrors: number;
  readonly pageErrors: number;
  readonly failedRequests: number;
  readonly overflowFailures: number;
  readonly failedScenarios: number;
  readonly navigationFailures: number;
  readonly ignoredConsoleErrors: number;
  readonly ignoredFailedRequests: number;
}

export interface QaRunManifest {
  readonly schemaVersion: typeof QA_EVIDENCE_SCHEMA_VERSION;
  readonly run: QaRunMetadata;
  readonly summary: QaRunSummary;
  readonly scenarios: readonly QaScenarioEvidence[];
  readonly artifacts: QaRunArtifacts;
  readonly runError?: string;
}

export interface QaScenarioEvidenceInput {
  readonly scenario: QaScenarioDefinition;
  readonly timestamp: string;
  readonly durationMs: number;
  readonly navigation: QaNavigationResult;
  readonly consoleErrors: readonly QaConsoleError[];
  readonly pageErrors: readonly QaPageError[];
  readonly failedRequests: readonly QaFailedRequest[];
  readonly overflow: QaOverflowResult;
  readonly assertions?: readonly QaAssertion[];
  readonly actionError?: string | null;
  readonly screenshotPath?: string | null;
  readonly screenshotError?: string | null;
}

function asFiniteNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function trimString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function truncate(value: string, maxLength = QA_MAX_ERROR_LENGTH): string {
  return value.length <= maxLength ? value : `${value.slice(0, Math.max(0, maxLength - 1))}…`;
}

/** Redacts common credential-bearing fragments before browser evidence is persisted. */
export function redactSensitiveText(value: string): string {
  return value
    .replace(/\bBearer\s+[^\s]+/gi, "Bearer [REDACTED]")
    .replace(/([?&](?:access_token|api[_-]?key|apikey|password|secret|token)=)[^&\s]+/gi, "$1[REDACTED]")
    .replace(/((?:authorization|api[_-]?key|x-api-key)\s*[:=]\s*)[^\s,;]+/gi, "$1[REDACTED]");
}

/** Convert arbitrary browser failure input into one bounded, safe message. */
export function normalizeErrorMessage(value: unknown, fallback = "Unknown browser error"): string {
  let message: string | undefined;
  if (value instanceof Error) message = value.message;
  else if (typeof value === "string") message = value;
  else if (value && typeof value === "object" && "message" in value) {
    const candidate = (value as { message?: unknown }).message;
    if (typeof candidate === "string") message = candidate;
  }

  const normalized = message ? truncate(redactSensitiveText(message).replace(/\s+/g, " ").trim()) : "";
  if (normalized === "[object Object]") return fallback;
  return normalized || fallback;
}

function normalizeSafeSearch(search: string): string {
  const params = new URLSearchParams(search);
  const entries: string[] = [];
  for (const [key, value] of params.entries()) {
    const safeValue = /token|secret|password|api[_-]?key|authorization/i.test(key) ? "[REDACTED]" : truncate(redactSensitiveText(value), 160);
    entries.push(`${encodeURIComponent(key)}=${encodeURIComponent(safeValue)}`);
  }
  return entries.length ? `?${entries.join("&")}` : "";
}

/** Keep route paths useful for analysis while omitting credential-bearing query values. */
export function normalizeBrowserPath(value: unknown): string {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return "/";
  try {
    const parsed = new URL(raw, "http://engoryx-qa.invalid");
    return `${parsed.pathname || "/"}${normalizeSafeSearch(parsed.search)}`;
  } catch {
    const [pathOnly = "/", inlineSearch = ""] = raw.split("?", 2);
    return `${pathOnly.split("#", 1)[0]?.trim() || "/"}${inlineSearch ? normalizeSafeSearch(`?${inlineSearch.split("#", 1)[0]}`) : ""}`;
  }
}

/** Request evidence stores only the endpoint path, never query values. */
export function normalizeRequestPath(value: unknown): string {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return "/";
  try {
    return new URL(raw, "http://engoryx-qa.invalid").pathname || "/";
  } catch {
    return raw.split(/[?#]/, 1)[0]?.trim() || "/";
  }
}

function matchesAnyPattern(value: string, patterns: readonly string[]): boolean {
  return patterns.some((source) => {
    try {
      return new RegExp(source).test(value);
    } catch {
      return false;
    }
  });
}

export function normalizeConsoleError(input: { message: unknown; location?: unknown }, patterns: readonly string[] = []): QaConsoleError {
  const message = normalizeErrorMessage(input.message);
  const locationPath = trimString(input.location) ? normalizeRequestPath(input.location) : undefined;
  return {
    message,
    ...(locationPath ? { locationPath } : {}),
    ignored: matchesAnyPattern(message, patterns),
  };
}

export function normalizePageError(input: unknown): QaPageError {
  return { message: normalizeErrorMessage(input) };
}

export function classifyRequestFailure(status: number | null | undefined): QaRequestFailureClassification {
  return typeof status === "number" && Number.isFinite(status) && status >= 400 ? "http-error" : "network-error";
}

export interface QaFailedRequestInput {
  readonly url: unknown;
  readonly method?: unknown;
  readonly resourceType?: unknown;
  readonly status?: unknown;
  readonly statusText?: unknown;
  readonly failureText?: unknown;
}

export function normalizeFailedRequest(input: QaFailedRequestInput, patterns: readonly string[] = []): QaFailedRequest | null {
  const rawUrl = trimString(input.url);
  if (!rawUrl) return null;
  const url = normalizeRequestPath(rawUrl);
  const numericStatus = asFiniteNumber(input.status, -1);
  const status = numericStatus >= 100 ? Math.trunc(numericStatus) : null;
  const method = (trimString(input.method) || "GET").toUpperCase();
  const resourceType = trimString(input.resourceType) || "other";
  const statusText = trimString(input.statusText);
  const failureText = trimString(input.failureText);
  const matchValue = `${url} ${failureText || ""}`.trim();
  return {
    url,
    method,
    resourceType,
    status,
    ...(statusText ? { statusText: truncate(redactSensitiveText(statusText)) } : {}),
    ...(failureText ? { failureText: truncate(redactSensitiveText(normalizeErrorMessage(failureText))) } : {}),
    classification: classifyRequestFailure(status),
    ignored: matchesAnyPattern(matchValue, patterns),
  };
}

export function createOverflowResult(
  metrics: { documentWidth: unknown; bodyWidth: unknown; viewportWidth: unknown },
  tolerancePx = QA_DEFAULT_OVERFLOW_TOLERANCE_PX,
): QaOverflowResult {
  const documentWidth = Math.max(0, asFiniteNumber(metrics.documentWidth));
  const bodyWidth = Math.max(0, asFiniteNumber(metrics.bodyWidth));
  const viewportWidth = Math.max(0, asFiniteNumber(metrics.viewportWidth));
  const tolerance = Math.max(0, asFiniteNumber(tolerancePx, QA_DEFAULT_OVERFLOW_TOLERANCE_PX));
  const pixels = Math.max(0, documentWidth - viewportWidth, bodyWidth - viewportWidth);
  return {
    detected: pixels > tolerance,
    pixels: Math.round(pixels * 100) / 100,
    documentWidth,
    bodyWidth,
    viewportWidth,
    tolerancePx: tolerance,
  };
}

/** Normalize relative paths before they become durable artifact references. */
export function normalizeArtifactPath(value: string): string {
  const raw = value.trim().replaceAll("\\", "/");
  if (!raw || raw.startsWith("/") || raw.startsWith("//") || /^[A-Za-z]:\//.test(raw)) {
    throw new Error("Artifact paths must be non-empty relative paths.");
  }
  const parts: string[] = [];
  for (const part of raw.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") throw new Error("Artifact paths cannot escape the QA artifact directory.");
    parts.push(part);
  }
  if (!parts.length) throw new Error("Artifact paths must be non-empty relative paths.");
  return parts.join("/");
}

function slug(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "unknown";
}

export function scenarioIdFor(input: { feature: string; routeId: string; interactionState: string; viewportName: string }): string {
  return [input.feature, input.routeId, input.interactionState, input.viewportName].map(slug).join("--");
}

export function defineQaScenario(input: QaScenarioDefinitionInput): QaScenarioDefinition {
  const id = input.id?.trim() || scenarioIdFor({
    feature: input.feature,
    routeId: input.route.id,
    interactionState: input.interactionState,
    viewportName: input.viewport.name,
  });
  return {
    ...input,
    id,
    expectedNoHorizontalOverflow: input.expectedNoHorizontalOverflow ?? true,
    failurePolicy: {
      ...DEFAULT_QA_FAILURE_POLICY,
      ...input.failurePolicy,
      ignoredConsoleErrorPatterns: input.failurePolicy?.ignoredConsoleErrorPatterns || DEFAULT_QA_FAILURE_POLICY.ignoredConsoleErrorPatterns,
      ignoredRequestPatterns: input.failurePolicy?.ignoredRequestPatterns || DEFAULT_QA_FAILURE_POLICY.ignoredRequestPatterns,
    },
  };
}

function pushReason(reasons: string[], reason: string) {
  if (!reasons.includes(reason)) reasons.push(reason);
}

export function createScenarioEvidence(input: QaScenarioEvidenceInput): QaScenarioEvidence {
  const assertions = [...(input.assertions || [])];
  const failureReasons: string[] = [];
  if (!input.navigation.loaded) pushReason(failureReasons, "navigation_failed");
  if (input.consoleErrors.some((error) => !error.ignored)) pushReason(failureReasons, "console_errors");
  if (input.pageErrors.length > 0) pushReason(failureReasons, "page_errors");
  if (input.failedRequests.some((request) => !request.ignored)) pushReason(failureReasons, "failed_requests");
  if (input.scenario.expectedNoHorizontalOverflow && input.overflow.detected) pushReason(failureReasons, "horizontal_overflow");
  if (assertions.some((assertion) => !assertion.passed)) pushReason(failureReasons, "deterministic_assertions");
  if (input.actionError) pushReason(failureReasons, "interaction_failed");
  if (input.screenshotError) pushReason(failureReasons, "screenshot_failed");

  const screenshotPath = input.screenshotPath ? normalizeArtifactPath(input.screenshotPath) : null;
  return {
    scenarioId: input.scenario.id,
    feature: input.scenario.feature,
    route: input.scenario.route,
    requestedPath: normalizeBrowserPath(input.scenario.path),
    interactionState: input.scenario.interactionState,
    viewport: input.scenario.viewport,
    expectedNoHorizontalOverflow: input.scenario.expectedNoHorizontalOverflow,
    screenshotPath,
    ...(input.screenshotError ? { screenshotError: normalizeErrorMessage(input.screenshotError, "Screenshot capture failed.") } : {}),
    ...(input.actionError ? { interactionError: normalizeErrorMessage(input.actionError, "Scenario interaction failed.") } : {}),
    consoleErrors: input.consoleErrors,
    pageErrors: input.pageErrors,
    failedRequests: input.failedRequests,
    overflow: input.overflow,
    navigation: {
      ...input.navigation,
      requestedPath: normalizeBrowserPath(input.navigation.requestedPath),
      finalPath: normalizeBrowserPath(input.navigation.finalPath),
      ...(input.navigation.error ? { error: normalizeErrorMessage(input.navigation.error, "Navigation failed.") } : {}),
    },
    assertions,
    durationMs: Math.max(0, Math.round(asFiniteNumber(input.durationMs))),
    timestamp: input.timestamp,
    status: failureReasons.length ? "FAIL" : "PASS",
    failureReasons,
  };
}

export function aggregateQaSummary(scenarios: readonly QaScenarioEvidence[]): QaRunSummary {
  const routes = new Set(scenarios.map((scenario) => scenario.route.id));
  const viewports = new Set(scenarios.map((scenario) => `${scenario.viewport.name}:${scenario.viewport.width}x${scenario.viewport.height}`));
  return {
    routesTested: routes.size,
    viewportsTested: viewports.size,
    interactionScenarios: scenarios.filter((scenario) => scenario.interactionState !== "base route loaded").length,
    screenshotsCaptured: scenarios.filter((scenario) => Boolean(scenario.screenshotPath)).length,
    consoleErrors: scenarios.reduce((sum, scenario) => sum + scenario.consoleErrors.length, 0),
    pageErrors: scenarios.reduce((sum, scenario) => sum + scenario.pageErrors.length, 0),
    failedRequests: scenarios.reduce((sum, scenario) => sum + scenario.failedRequests.length, 0),
    overflowFailures: scenarios.filter((scenario) => scenario.expectedNoHorizontalOverflow && scenario.overflow.detected).length,
    failedScenarios: scenarios.filter((scenario) => scenario.status === "FAIL").length,
    navigationFailures: scenarios.filter((scenario) => !scenario.navigation.loaded).length,
    ignoredConsoleErrors: scenarios.reduce((sum, scenario) => sum + scenario.consoleErrors.filter((error) => error.ignored).length, 0),
    ignoredFailedRequests: scenarios.reduce((sum, scenario) => sum + scenario.failedRequests.filter((request) => request.ignored).length, 0),
  };
}

export function createQaManifest(input: {
  readonly run: QaRunMetadata;
  readonly scenarios: readonly QaScenarioEvidence[];
  readonly artifacts: QaRunArtifacts;
  readonly runError?: string | null;
}): QaRunManifest {
  return {
    schemaVersion: QA_EVIDENCE_SCHEMA_VERSION,
    run: input.run,
    summary: aggregateQaSummary(input.scenarios),
    scenarios: input.scenarios,
    artifacts: {
      manifestPath: normalizeArtifactPath(input.artifacts.manifestPath),
      screenshotsDirectory: normalizeArtifactPath(input.artifacts.screenshotsDirectory),
      logPath: normalizeArtifactPath(input.artifacts.logPath),
    },
    ...(input.runError ? { runError: normalizeErrorMessage(input.runError, "QA runner failed.") } : {}),
  };
}

export function normalizeBranchName(value: unknown, fallback = "local"): string {
  const branch = trimString(value);
  if (!branch) return fallback;
  return branch.replace(/^refs\/heads\//, "").replace(/^refs\/remotes\/[^/]+\//, "");
}

export function normalizeCommitSha(value: unknown, fallback = "unknown"): string {
  return trimString(value) || fallback;
}
