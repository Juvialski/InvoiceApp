import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DEMO_QA_SCENARIOS } from "../scripts/qa/demoScenarios.ts";

async function loadFeatureSelection() {
  return import("../scripts/qa/demoFeatureSelection.ts").catch(() => undefined);
}

async function loadWorkerPool() {
  return import("../scripts/qa/workerPool.ts").catch(() => undefined);
}

test("payroll source changes select every payroll route group, including R4E cross-cutting coverage", async () => {
  const module = await loadFeatureSelection();
  assert.ok(module, "the demo feature selector module must exist");
  const selection = module.selectDemoQaScope(["src/components/payroll/PayrollPage.tsx"], {
    eventName: "pull_request",
    fileListComplete: true,
  });

  assert.equal(selection.mode, "affected");
  assert.deepEqual(selection.routeIds, ["payroll", "payroll-run"]);
  assert.deepEqual(selection.features, [
    "payroll@payroll",
    "payroll@payroll-run",
    "shared-shell-smoke@dashboard",
    "ui-r4e-payroll-hierarchy@payroll",
    "ui-r4e-route-audit@payroll-run",
    "ui-r4e-theme@payroll",
    "ui-r4e-visual-matrix@payroll",
  ]);
});

test("multiple changed domains union their routes and scenario groups", async () => {
  const module = await loadFeatureSelection();
  assert.ok(module, "the demo feature selector module must exist");
  const selection = module.selectDemoQaScope([
    "src/components/payroll/PayrollPage.tsx",
    "src/components/expenses/ExpensesPage.tsx",
  ], { eventName: "pull_request", fileListComplete: true });

  assert.equal(selection.mode, "affected");
  assert.ok(selection.routeIds.includes("payroll"));
  assert.ok(selection.routeIds.includes("payroll-run"));
  assert.ok(selection.routeIds.includes("expenses"));
  assert.ok(selection.routeIds.includes("cash"));
  assert.ok(selection.features.includes("supplier-payables@expenses"));
  assert.ok(selection.features.includes("ui-r4e-action-grammar@expenses"));
  assert.ok(selection.features.includes("shared-shell-smoke@dashboard"));
});

test("Supplier Invoice product source changes select invoice routes plus the shared smoke floor", async () => {
  const module = await loadFeatureSelection();
  assert.ok(module, "the demo feature selector module must exist");
  for (const path of ["src/components/SupplierInvoiceReview.tsx", "src/app/routes/InvoicesRoute.tsx"]) {
    const selection = module.selectDemoQaScope([path], {
      eventName: "pull_request",
      fileListComplete: true,
    });

    assert.equal(selection.mode, "affected", `${path} should not force full-catalog QA`);
    assert.ok(selection.routeIds.includes("invoices"));
    assert.ok(selection.routeIds.includes("review"));
    assert.ok(!selection.routeIds.includes("payroll"));
    assert.ok(!selection.routeIds.includes("rfis"));
    assert.ok(selection.features.includes("supplier-invoice-ux-edit-1a@review"));
    assert.ok(selection.features.includes("shared-shell-smoke@dashboard"));
  }
});

test("domain scenario action modules select only their owning route family", async () => {
  const module = await loadFeatureSelection();
  assert.ok(module, "the demo feature selector module must exist");

  const invoice = module.selectDemoQaScope(["scripts/qa/scenarios/invoices.ts"], {
    eventName: "pull_request",
    fileListComplete: true,
  });
  assert.equal(invoice.mode, "affected");
  assert.ok(invoice.routeIds.includes("invoices"));
  assert.ok(!invoice.routeIds.includes("payroll"));
  assert.ok(invoice.features.includes("shared-shell-smoke@dashboard"));

  const payroll = module.selectDemoQaScope(["scripts/qa/scenarios/payroll.ts"], {
    eventName: "pull_request",
    fileListComplete: true,
  });
  assert.equal(payroll.mode, "affected");
  assert.deepEqual(payroll.routeIds, ["payroll", "payroll-run"]);
  assert.ok(payroll.features.includes("payroll@payroll"));
  assert.ok(payroll.features.includes("shared-shell-smoke@dashboard"));
});

test("domain QA tests map by their known test-file names", async () => {
  const module = await loadFeatureSelection();
  assert.ok(module, "the demo feature selector module must exist");
  for (const [path, routeId] of [
    ["tests/demoQaInvoiceScenarios.test.ts", "invoices"],
    ["tests/demoQaPayrollScenarios.test.ts", "payroll"],
  ] as const) {
    const selection = module.selectDemoQaScope([path], { eventName: "pull_request", fileListComplete: true });
    assert.equal(selection.mode, "affected");
    assert.ok(selection.routeIds.includes(routeId), `${path} should select ${routeId}`);
    assert.ok(selection.features.includes("shared-shell-smoke@dashboard"));
  }
});

test("affected scopes retain only the small dashboard navigation smoke floor", async () => {
  const module = await loadFeatureSelection();
  assert.ok(module, "the demo feature selector module must exist");
  const selection = module.selectDemoQaScope(["scripts/qa/scenarios/payroll.ts"], {
    eventName: "pull_request",
    fileListComplete: true,
  });
  const smoke = module.filterDemoQaScenarios(DEMO_QA_SCENARIOS, ["shared-shell-smoke@dashboard"]);
  assert.equal(smoke.mode, "affected");
  assert.equal(smoke.scenarios.length, 2);
  assert.ok(smoke.scenarios.every((scenario) => scenario.route.id === "dashboard"));
  assert.deepEqual(smoke.scenarios.map((scenario) => scenario.interactionState), [
    "app shell content visible",
    "mobile navigation can open and restore focus",
  ]);
  assert.ok(selection.features.includes("shared-shell-smoke@dashboard"));
});

test("shared, browser-infrastructure, and unknown relevant changes choose the full catalog", async () => {
  const module = await loadFeatureSelection();
  assert.ok(module, "the demo feature selector module must exist");
  for (const changedFiles of [
    ["src/App.tsx"],
    ["src/navigation/WorkspaceNavigation.tsx"],
    ["src/ui/hydroqualisense.css"],
    ["src/ui/hydroqualisenseTheme.ts"],
    ["src/components/ui/OperationsUI.tsx"],
    ["src/components/help/HelpAction.tsx"],
    ["src/components/future/NewPage.tsx"],
    ["src/app/routes/UnmappedRoute.tsx"],
    ["scripts/qa/demoScenarios.ts"],
    ["scripts/qa/demoScenarioMetadata.ts"],
    ["scripts/qa/demoScenarioActions.ts"],
    ["scripts/qa/demoFeatureSelection.ts"],
    ["scripts/qa/workerPool.ts"],
    ["scripts/qa/scenarios/shared.ts"],
    ["scripts/qa/scenarios/future-domain.ts"],
    ["scripts/qa/structuredEvidence.ts"],
    ["scripts/demo-visual-qa.ts"],
    ["scripts/qa/selectDemoQaScope.ts"],
    [".github/workflows/demo-visual-qa.yml"],
    ["package-lock.json"],
  ]) {
    const selection = module.selectDemoQaScope(changedFiles, { eventName: "pull_request", fileListComplete: true });
    assert.equal(selection.mode, "full", `expected full browser coverage for ${changedFiles[0]}`);
    assert.deepEqual(selection.features, []);
  }
});

test("empty, invalid, incomplete, and non-PR scope inputs fail closed to the full catalog", async () => {
  const module = await loadFeatureSelection();
  assert.ok(module, "the demo feature selector module must exist");
  const cases: Array<{ changedFiles: unknown; options?: { eventName?: string; fileListComplete?: boolean } }> = [
    { changedFiles: [] },
    { changedFiles: null },
    { changedFiles: ["src/components/payroll/PayrollPage.tsx", null] },
    { changedFiles: ["../outside.ts"] },
    { changedFiles: ["src/components/payroll/PayrollPage.tsx"], options: { fileListComplete: false } },
    { changedFiles: [], options: { eventName: "push" } },
  ];
  for (const { changedFiles, options } of cases) {
    const selection = module.selectDemoQaScope(changedFiles, { eventName: "pull_request", fileListComplete: true, ...options });
    assert.equal(selection.mode, "full");
    assert.deepEqual(selection.features, []);
  }
  assert.equal(module.selectDemoQaScope(["src/components/payroll/PayrollPage.tsx"], { eventName: "pull_request" }).mode, "full");
});

test("documentation-only pull requests explicitly skip browser scenarios", async () => {
  const module = await loadFeatureSelection();
  assert.ok(module, "the demo feature selector module must exist");
  const selection = module.selectDemoQaScope(["docs/README.md", "README.md"], {
    eventName: "pull_request",
    fileListComplete: true,
  });
  assert.equal(selection.mode, "skip");
  assert.deepEqual(selection.features, []);
});

test("markdown outside known documentation locations is not silently skipped", async () => {
  const module = await loadFeatureSelection();
  assert.ok(module, "the demo feature selector module must exist");
  const sourceMarkdown = module.selectDemoQaScope(["src/help/runtime-guide.md"], {
    eventName: "pull_request",
    fileListComplete: true,
  });
  assert.equal(sourceMarkdown.mode, "affected");
  assert.ok(sourceMarkdown.routeIds.includes("help"));
  assert.ok(sourceMarkdown.features.length > 0);

  const unknownMarkdown = module.selectDemoQaScope(["content/runtime-guide.md"], {
    eventName: "pull_request",
    fileListComplete: true,
  });
  assert.equal(unknownMarkdown.mode, "full");
});

test("feature selection output is stable across changed-file ordering", async () => {
  const module = await loadFeatureSelection();
  assert.ok(module, "the demo feature selector module must exist");
  const paths = ["src/components/expenses/ExpensesPage.tsx", "src/components/payroll/PayrollPage.tsx"];
  const first = module.selectDemoQaScope(paths, { eventName: "pull_request", fileListComplete: true });
  const second = module.selectDemoQaScope([...paths].reverse(), { eventName: "pull_request", fileListComplete: true });
  assert.deepEqual(first, second);
  assert.deepEqual(first.features, [...first.features].sort());
  assert.deepEqual(first.routeIds, [...first.routeIds].sort());
});

test("runtime selectors preserve legacy feature filters and fail invalid selections to all scenarios", async () => {
  const module = await loadFeatureSelection();
  assert.ok(module, "the demo feature selector module must exist");
  const payroll = module.filterDemoQaScenarios(DEMO_QA_SCENARIOS, ["payroll"]);
  assert.equal(payroll.mode, "affected");
  assert.equal(payroll.scenarios.length, 6);
  assert.ok(payroll.scenarios.every((scenario) => scenario.feature === "payroll"));

  const routeMatrix = module.filterDemoQaScenarios(DEMO_QA_SCENARIOS, ["ui-r4e-visual-matrix@payroll"]);
  assert.equal(routeMatrix.mode, "affected");
  assert.equal(routeMatrix.scenarios.length, 16);
  assert.ok(routeMatrix.scenarios.every((scenario) => scenario.feature === "ui-r4e-visual-matrix" && scenario.route.id === "payroll"));

  const invalid = module.filterDemoQaScenarios(DEMO_QA_SCENARIOS, ["missing-feature@payroll"]);
  assert.equal(invalid.mode, "full");
  assert.equal(invalid.scenarios.length, DEMO_QA_SCENARIOS.length);
});

test("worker count defaults to four and accepts the bounded sequential through four-worker range", async () => {
  const module = await loadWorkerPool();
  assert.ok(module, "the ordered worker-pool module must exist");
  assert.equal(module.parseQaWorkerCount(undefined), 4);
  assert.equal(module.parseQaWorkerCount("1"), 1);
  assert.equal(module.parseQaWorkerCount("4"), 4);
  assert.equal(module.parseQaWorkerCount("0"), 4);
  assert.equal(module.parseQaWorkerCount("5"), 4);
  assert.equal(module.parseQaWorkerCount("many"), 4);
});

test("one worker preserves the sequential fallback", async () => {
  const module = await loadWorkerPool();
  assert.ok(module, "the ordered worker-pool module must exist");
  let active = 0;
  let peakActive = 0;
  const settled = await module.runWithWorkerPool(["first", "second", "third"], 1, async (value) => {
    active += 1;
    peakActive = Math.max(peakActive, active);
    await new Promise((resolve) => setTimeout(resolve, 1));
    active -= 1;
    return value;
  });

  assert.equal(peakActive, 1);
  assert.deepEqual(settled.map((result) => result.status === "fulfilled" ? result.value : null), ["first", "second", "third"]);
});

test("bounded workers retain input order and record a rejection without stopping later scenarios", async () => {
  const module = await loadWorkerPool();
  assert.ok(module, "the ordered worker-pool module must exist");
  let active = 0;
  let peakActive = 0;
  const settled = await module.runWithWorkerPool([0, 1, 2, 3, 4], 2, async (value) => {
    active += 1;
    peakActive = Math.max(peakActive, active);
    await new Promise((resolve) => setTimeout(resolve, value === 0 ? 12 : 2));
    active -= 1;
    if (value === 1) throw new Error("scenario 1 failed");
    return value * 10;
  });

  assert.ok(peakActive > 1);
  assert.ok(peakActive <= 2);
  assert.deepEqual(settled.map((result) => result.status), ["fulfilled", "rejected", "fulfilled", "fulfilled", "fulfilled"]);
  assert.deepEqual(settled.map((result) => result.status === "fulfilled" ? result.value : undefined), [0, undefined, 20, 30, 40]);
  assert.match(String(settled[1]?.status === "rejected" ? settled[1].reason : ""), /scenario 1 failed/);
});

test("browser scenario contexts close in finally and runner failures retain evidence rows", () => {
  const runner = readFileSync(new URL("../scripts/demo-visual-qa.ts", import.meta.url), "utf8").replaceAll("\r\n", "\n");
  const start = runner.indexOf("async function runScenario(");
  const end = runner.indexOf("\n}\n", start);
  assert.ok(start >= 0 && end > start, "the browser runner scenario boundary must remain present");
  const runScenario = runner.slice(start, end);
  assert.match(runScenario, /try\s*\{[\s\S]*captureScenarioWithContext\([\s\S]*finally\s*\{\s*await context\.close\(\)/);
  assert.match(runner, /scenarioRunnerFailure\(scenario, error, Date\.now\(\) - scenarioStartedAt\)/);
  assert.match(runner, /scenarioRunnerFailure\(scenario, runError \|\| "Scenario did not produce a worker result\.", 0\)/);
});
