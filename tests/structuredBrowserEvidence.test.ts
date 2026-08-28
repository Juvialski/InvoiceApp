import test from "node:test";
import assert from "node:assert/strict";
import { DEMO_QA_SCENARIOS } from "../scripts/qa/demoScenarios.ts";
import {
  QA_EVIDENCE_SCHEMA_VERSION,
  QA_VIEWPORTS,
  aggregateQaSummary,
  createOverflowResult,
  createQaManifest,
  createScenarioEvidence,
  defineQaScenario,
  normalizeArtifactPath,
  normalizeBrowserPath,
  normalizeConsoleError,
  normalizeErrorMessage,
  normalizeFailedRequest,
  normalizeRequestPath,
  scenarioIdFor,
  type QaScenarioEvidence,
} from "../scripts/qa/structuredEvidence.ts";

const baseScenario = defineQaScenario({
  feature: "cash-banking",
  route: { id: "cash", canonicalPath: "/cash" },
  path: "/demo/app/cash",
  interactionState: "base route loaded",
  viewport: QA_VIEWPORTS.desktop,
});

function navigation(loaded = true) {
  return { requestedPath: "/demo/app/cash", finalPath: "/demo/app/cash", status: loaded ? 200 : null, loaded };
}

function evidence(overrides: Partial<Parameters<typeof createScenarioEvidence>[0]> = {}): QaScenarioEvidence {
  return createScenarioEvidence({
    scenario: baseScenario,
    timestamp: "2026-08-28T00:00:00.000Z",
    durationMs: 42,
    navigation: navigation(),
    consoleErrors: [],
    pageErrors: [],
    failedRequests: [],
    overflow: createOverflowResult({ documentWidth: 1440, bodyWidth: 1440, viewportWidth: 1440 }),
    assertions: [{ id: "page-has-content", passed: true }],
    screenshotPath: "screenshots/cash.png",
    ...overrides,
  });
}

test("scenario IDs are stable and change when scenario identity changes", () => {
  const input = { feature: "Project Workspace", routeId: "project-documents", interactionState: "document viewer opened", viewportName: "desktop-1440" };
  assert.equal(scenarioIdFor(input), scenarioIdFor({ ...input }));
  assert.notEqual(scenarioIdFor(input), scenarioIdFor({ ...input, interactionState: "base route loaded" }));
  assert.equal(baseScenario.id, "cash-banking--cash--base-route-loaded--desktop-1440");
});

test("shared viewport definitions retain useful responsive metadata", () => {
  assert.deepEqual(QA_VIEWPORTS.mobile, { name: "mobile-390", width: 390, height: 844 });
  assert.deepEqual(QA_VIEWPORTS.tablet, { name: "tablet-768", width: 768, height: 1024 });
  assert.equal(QA_VIEWPORTS.desktop.width, 1440);
  assert.equal(QA_VIEWPORTS.laptop.height, 768);
});

test("demo scenario catalog is unique and covers the required product surfaces", () => {
  const ids = DEMO_QA_SCENARIOS.map((scenario) => scenario.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const feature of ["dashboard", "projects", "project-workspace", "engineering-documents", "rfis", "submittals", "site-logs", "cash-banking", "invoices", "payroll", "expenses", "reports", "assistant"]) {
    assert.ok(DEMO_QA_SCENARIOS.some((scenario) => scenario.feature === feature), `missing ${feature} coverage`);
  }
  assert.deepEqual(new Set(DEMO_QA_SCENARIOS.map((scenario) => scenario.viewport.name)), new Set(["desktop-1440", "laptop-1366", "tablet-768", "mobile-390"]));
  assert.ok(DEMO_QA_SCENARIOS.some((scenario) => scenario.interactionState === "cash settlement workspace opened"));
  assert.ok(DEMO_QA_SCENARIOS.some((scenario) => scenario.interactionState === "demo drawing preview opened"));
});

test("normalizes browser errors, redacts credential fragments, and keeps object leakage out", () => {
  assert.equal(normalizeErrorMessage(new Error("  request failed  with Bearer super-secret-token ")), "request failed with Bearer [REDACTED]");
  assert.equal(normalizeErrorMessage({ message: "failed?access_token=private-value" }), "failed?access_token=[REDACTED]");
  assert.equal(normalizeErrorMessage({ details: "internal object" }, "safe fallback"), "safe fallback");
  assert.doesNotMatch(normalizeErrorMessage({ message: "[object Object]" }), /\[object Object\]/);
});

test("captures explicit allowlisted browser noise without hiding other errors", () => {
  const ignoredConsole = normalizeConsoleError({ message: "ResizeObserver loop completed with undelivered notifications" }, ["^ResizeObserver"]);
  const blockingConsole = normalizeConsoleError({ message: "Unexpected render failure" }, ["^ResizeObserver"]);
  assert.equal(ignoredConsole.ignored, true);
  assert.equal(blockingConsole.ignored, false);

  const ignoredRequest = normalizeFailedRequest({ url: "http://localhost:4173/assets/optional-map.js", status: 404 }, ["optional-map"]);
  const blockingRequest = normalizeFailedRequest({ url: "http://localhost:4173/api/private?token=secret", status: 500 }, ["optional-map"]);
  assert.equal(ignoredRequest?.ignored, true);
  assert.equal(blockingRequest?.ignored, false);
  assert.equal(blockingRequest?.classification, "http-error");
  assert.equal(blockingRequest?.url, "/api/private");
});

test("classifies network failures and normalizes request paths without query data", () => {
  const failure = normalizeFailedRequest({ url: "/assets/app.js?cache=123", method: "get", resourceType: "script", failureText: "net::ERR_FAILED" });
  assert.equal(failure?.classification, "network-error");
  assert.equal(failure?.method, "GET");
  assert.equal(failure?.url, "/assets/app.js");
  assert.equal(normalizeRequestPath("/api/failed?access_token=secret"), "/api/failed");
});

test("represents horizontal overflow with a tolerance and deterministic dimensions", () => {
  const overflow = createOverflowResult({ documentWidth: 812, bodyWidth: 805, viewportWidth: 768 });
  assert.equal(overflow.detected, true);
  assert.equal(overflow.pixels, 44);
  assert.equal(overflow.viewportWidth, 768);
  assert.equal(createOverflowResult({ documentWidth: 770, bodyWidth: 769, viewportWidth: 768 }, 2).detected, false);
});

test("normalizes artifact paths and rejects traversal or absolute destinations", () => {
  assert.equal(normalizeArtifactPath(".\\screenshots\\dashboard.png"), "screenshots/dashboard.png");
  assert.throws(() => normalizeArtifactPath("../outside.png"), /escape/);
  assert.throws(() => normalizeArtifactPath("C:/outside.png"), /relative/);
  assert.throws(() => normalizeArtifactPath("/outside.png"), /relative/);
});

test("preserves safe route query context while redacting sensitive query values", () => {
  assert.equal(normalizeBrowserPath("http://localhost:4173/demo/app/payroll?runId=demo-run&token=secret"), "/demo/app/payroll?runId=demo-run&token=%5BREDACTED%5D");
});

test("aggregates route, viewport, error, screenshot, and overflow summary fields", () => {
  const failed = evidence({
    scenario: defineQaScenario({
      feature: "cash-banking",
      route: { id: "cash-settlement", canonicalPath: "/cash?transactionId=:transactionId" },
      path: "/demo/app/cash?transactionId=demo-transaction-split-01",
      interactionState: "cash settlement workspace opened",
      viewport: QA_VIEWPORTS.desktop,
    }),
    navigation: navigation(false),
    pageErrors: [{ message: "uncaught" }],
    failedRequests: [{ url: "/api/failure", method: "GET", resourceType: "xhr", status: 503, classification: "http-error", ignored: false }],
    overflow: createOverflowResult({ documentWidth: 1490, bodyWidth: 1490, viewportWidth: 1440 }),
    assertions: [{ id: "navigation-response", passed: false }],
    screenshotPath: null,
  });
  const passed = evidence();
  const summary = aggregateQaSummary([passed, failed]);
  assert.equal(summary.routesTested, 2);
  assert.equal(summary.viewportsTested, 1);
  assert.equal(summary.interactionScenarios, 1);
  assert.equal(summary.screenshotsCaptured, 1);
  assert.equal(summary.pageErrors, 1);
  assert.equal(summary.failedRequests, 1);
  assert.equal(summary.overflowFailures, 1);
  assert.equal(summary.failedScenarios, 1);
  assert.equal(summary.navigationFailures, 1);
});

test("manifest contract is versioned and does not expose sensitive browser payload fields", () => {
  const manifest = createQaManifest({
    run: { commitSha: "abc123", branch: "main", timestamp: "2026-08-28T00:00:00.000Z", trigger: "local", appMode: "demo" },
    scenarios: [evidence()],
    artifacts: { manifestPath: "manifest.json", screenshotsDirectory: "screenshots", logPath: "logs/qa.log" },
  });
  assert.equal(manifest.schemaVersion, QA_EVIDENCE_SCHEMA_VERSION);
  assert.deepEqual(manifest.artifacts, { manifestPath: "manifest.json", screenshotsDirectory: "screenshots", logPath: "logs/qa.log" });
  for (const forbiddenKey of ["requestBody", "requestHeaders", "cookies", "accessToken", "apiKey", "password", "secret"]) {
    assert.doesNotMatch(JSON.stringify(manifest), new RegExp(`"${forbiddenKey}"`, "i"));
  }
});
