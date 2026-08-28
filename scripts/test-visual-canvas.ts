import { createRequire } from "node:module";
import type { ChildProcess } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { DEMO_QA_SCENARIOS } from "./qa/demoScenarios.ts";
import {
  createOverflowResult,
  createQaManifest,
  createScenarioEvidence,
} from "./qa/structuredEvidence.ts";
import {
  startDevServer,
  terminateChildServer,
} from "./qa/devServerLifecycle.ts";

const require = createRequire(import.meta.url);

const BASE_URL = "http://localhost:3000";
const OUTPUT_DIR = path.resolve("artifacts/workflow-canvas-qa");
const FIXTURES_DIR = path.resolve("artifacts/workflow-canvas-qa/fixtures");

async function prepareFixtures() {
  await fs.mkdir(FIXTURES_DIR, { recursive: true });

  // 1. All-pass fixture
  const allPassScenarios = DEMO_QA_SCENARIOS.map((s) =>
    createScenarioEvidence({
      scenario: s,
      timestamp: "2026-08-28T04:00:00.000Z",
      durationMs: 45,
      navigation: { requestedPath: s.path, finalPath: s.path, status: 200, loaded: true },
      consoleErrors: [],
      pageErrors: [],
      failedRequests: [],
      overflow: createOverflowResult({ documentWidth: s.viewport.width, bodyWidth: s.viewport.width, viewportWidth: s.viewport.width }),
      assertions: [{ id: "page-has-content", passed: true, details: "body text >= 80" }],
      screenshotPath: `screenshots/${s.id}.png`,
    })
  );
  const allPassManifest = createQaManifest({
    run: {
      commitSha: "6a1c8d20e0d846d04f9bb760189f4a22f23c527b",
      branch: "feat/workflow-map-browser-evidence-overlay",
      timestamp: "2026-08-28T04:00:00.000Z",
      trigger: "workflow_dispatch",
      appMode: "demo",
    },
    scenarios: allPassScenarios,
    artifacts: { manifestPath: "manifest.json", screenshotsDirectory: "screenshots", logPath: "logs/qa.log" },
  });
  await fs.writeFile(path.join(FIXTURES_DIR, "all-pass-manifest.json"), JSON.stringify(allPassManifest, null, 2), "utf8");

  // 2. Failure fixture (dashboard and projects failures)
  const failureScenarios = DEMO_QA_SCENARIOS.map((s) => {
    if (s.id === "dashboard--dashboard--base-route-loaded--desktop-1440" || s.id === "projects--projects--base-route-loaded--desktop-1440") {
      return createScenarioEvidence({
        scenario: s,
        timestamp: "2026-08-28T04:05:00.000Z",
        durationMs: 62,
        navigation: { requestedPath: s.path, finalPath: s.path, status: 200, loaded: true },
        consoleErrors: [{ message: `Uncaught TypeError: Cannot read properties of undefined (reading 'render_${s.feature}')`, ignored: false }],
        pageErrors: [{ message: `Page crashed during ${s.feature} hydration` }],
        failedRequests: [{ url: `/api/${s.feature}-summary`, method: "GET", resourceType: "xhr", status: 500, classification: "http-error", ignored: false }],
        overflow: createOverflowResult({ documentWidth: 1440, bodyWidth: 1440, viewportWidth: 1440 }),
        assertions: [{ id: `${s.feature}-stats-rendered`, passed: false, details: "Widget missing" }],
        screenshotPath: `screenshots/${s.id}.png`,
      });
    }
    return createScenarioEvidence({
      scenario: s,
      timestamp: "2026-08-28T04:05:00.000Z",
      durationMs: 40,
      navigation: { requestedPath: s.path, finalPath: s.path, status: 200, loaded: true },
      consoleErrors: [],
      pageErrors: [],
      failedRequests: [],
      overflow: createOverflowResult({ documentWidth: s.viewport.width, bodyWidth: s.viewport.width, viewportWidth: s.viewport.width }),
      assertions: [{ id: "page-has-content", passed: true }],
      screenshotPath: `screenshots/${s.id}.png`,
    });
  });
  const failureManifest = createQaManifest({
    run: {
      commitSha: "6a1c8d20e0d846d04f9bb760189f4a22f23c527b",
      branch: "feat/workflow-map-browser-evidence-overlay",
      timestamp: "2026-08-28T04:05:00.000Z",
      trigger: "workflow_dispatch",
      appMode: "demo",
    },
    scenarios: failureScenarios,
    artifacts: { manifestPath: "manifest.json", screenshotsDirectory: "screenshots", logPath: "logs/qa.log" },
  });
  await fs.writeFile(path.join(FIXTURES_DIR, "failure-manifest.json"), JSON.stringify(failureManifest, null, 2), "utf8");

  // 3. Partial fixture (includes 1 scenario for project-workspace and omits the other)
  const partialIncludedIds = new Set([
    "projects--projects--base-route-loaded--desktop-1440",
    "project-workspace--project-overview--project-selected--desktop-1440", // present for project-workspace (leaving documents scenario missing -> PARTIAL)
    "demo--landing--base-route-loaded--desktop-1440",
    "dashboard--dashboard--base-route-loaded--desktop-1440",
  ]);
  const partialScenarios = allPassScenarios.filter((s) => partialIncludedIds.has(s.scenarioId));
  const partialManifest = createQaManifest({
    run: {
      commitSha: "6a1c8d20e0d846d04f9bb760189f4a22f23c527b",
      branch: "feat/workflow-map-browser-evidence-overlay",
      timestamp: "2026-08-28T04:10:00.000Z",
      trigger: "local",
      appMode: "demo",
    },
    scenarios: partialScenarios,
    artifacts: { manifestPath: "manifest.json", screenshotsDirectory: "screenshots", logPath: "logs/qa.log" },
  });
  await fs.writeFile(path.join(FIXTURES_DIR, "partial-manifest.json"), JSON.stringify(partialManifest, null, 2), "utf8");
}

async function runVisualValidation() {
  await prepareFixtures();

  let serverProcess: ChildProcess | null = null;
  let browser: any = null;
  let totalErrors = 0;

  // Interruption handlers for SIGINT / SIGTERM
  const handleSignal = async (signal: string) => {
    console.log(`\nReceived ${signal}. Cleaning up before exit...`);
    if (browser) await browser.close().catch(() => {});
    if (serverProcess) await terminateChildServer(serverProcess);
    process.exit(1);
  };
  process.on("SIGINT", () => handleSignal("SIGINT"));
  process.on("SIGTERM", () => handleSignal("SIGTERM"));

  try {
    serverProcess = await startDevServer({ port: 3000, baseUrl: BASE_URL, startupPath: "/workflow-map" });

    // Controlled failure mode support for automated cleanup proof
    if (process.argv.includes("--test-controlled-failure")) {
      console.log("[Proof Mode] Triggering controlled failure after starting dev server...");
      throw new Error("Controlled test-only failure triggered for cleanup proof");
    }

    // Playwright is resolved dynamically only when browser testing executes
    const { chromium } = require("playwright");

    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();

    const presetsToTest = [
      { id: "overview", name: "Whole-platform overview", preset: "overview" },
      { id: "projects-engineering", name: "Projects and Engineering flow", preset: "projects-engineering" },
      { id: "invoice-cash-settlement", name: "Invoice and Cash Settlement flow", preset: "invoice-cash-settlement" },
      { id: "workforce-payroll", name: "Workforce and Payroll flow", preset: "workforce-payroll" },
      { id: "assistant-guarded-mutations", name: "Assistant guarded mutation flow", preset: "assistant-guarded-mutations" },
    ];

    const viewports = [
      { name: "desktop-1440", width: 1440, height: 900 },
      { name: "tablet-1024", width: 1024, height: 768 },
      { name: "mobile-390", width: 390, height: 844 },
    ];

    console.log("==================================================");
    console.log("Starting WM-4 Visual Workflow Canvas Browser Validation");
    console.log("==================================================");

    for (const vp of viewports) {
      console.log(`\nTesting Viewport: ${vp.name} (${vp.width}x${vp.height})`);
      const page = await context.newPage();
      await page.setViewportSize({ width: vp.width, height: vp.height });

      const consoleErrors: string[] = [];
      const pageErrors: string[] = [];
      page.on("console", (msg: { type(): string; text(): string }) => {
        if (msg.type() === "error") consoleErrors.push(msg.text());
      });
      page.on("pageerror", (err: unknown) => {
        pageErrors.push(String(err));
      });

      // A. NO EVIDENCE - Test presets rendering
      for (const p of presetsToTest) {
        const url = `${BASE_URL}/workflow-map?preset=${p.preset}`;
        await page.goto(url, { waitUntil: "networkidle" });
        await page.waitForTimeout(600);

        const nodeCount = await page.locator(".react-flow__node").count();
        console.log(`  [${vp.name}] Preset: ${p.name} -> ${nodeCount} visible nodes`);

        if (nodeCount === 0) {
          console.error(`  ❌ Error: No nodes rendered for preset ${p.id}`);
          totalErrors++;
        }

        if (vp.name === "desktop-1440" || vp.name === "mobile-390") {
          const screenshotPath = path.join(OUTPUT_DIR, `${vp.name}-${p.id}.png`);
          await page.screenshot({ path: screenshotPath, fullPage: false });
        }
      }

      // B. ALL-PASS MANIFEST VALIDATION (Desktop, Tablet, Mobile)
      console.log(`\n  [${vp.name}] Testing ALL-PASS QA Evidence Overlay loading...`);
      await page.goto(`${BASE_URL}/workflow-map?preset=overview`, { waitUntil: "networkidle" });
      await page.waitForTimeout(500);

      // Upload all-pass fixture via file input
      const fileInput = page.locator("input[type='file'][accept*='json']");
      await fileInput.setInputFiles(path.join(FIXTURES_DIR, "all-pass-manifest.json"));
      await page.waitForTimeout(600);

      // Check evidence status bar & badges
      const statusBarText = await page.locator("footer").innerText();
      const hasEvidenceInStatus = statusBarText.includes("QA Evidence:") && statusBarText.includes("PASS");
      console.log(`  - Status bar shows QA evidence summary: ${hasEvidenceInStatus ? "✅ YES" : "❌ NO"}`);
      if (!hasEvidenceInStatus) totalErrors++;

      const passBadges = await page.locator("text=QA Passed").count();
      console.log(`  - Visible 'QA Passed' badges on canvas: ${passBadges > 0 ? `✅ YES (${passBadges} visible)` : "❌ NO"}`);
      if (passBadges === 0) totalErrors++;

      // Open details drawer for a mapped node
      const firstMappedNode = page.locator(".react-flow__node:has-text('QA Passed')").first();
      await firstMappedNode.click();
      await page.waitForTimeout(400);

      const evidenceSectionVisible = await page.locator("aside").getByText("Browser QA Evidence (QA-1)").isVisible();
      console.log(`  - Details drawer shows Browser QA Evidence section: ${evidenceSectionVisible ? "✅ YES" : "❌ NO"}`);
      if (!evidenceSectionVisible) totalErrors++;

      if (vp.name === "desktop-1440") {
        await page.screenshot({ path: path.join(OUTPUT_DIR, "desktop-1440-evidence-all-pass.png") });
      } else if (vp.name === "mobile-390") {
        await page.screenshot({ path: path.join(OUTPUT_DIR, "mobile-390-evidence-details.png") });
      }

      // Close details drawer
      const closeBtn = page.locator("aside button[title='Close details drawer']");
      if (await closeBtn.isVisible()) {
        await closeBtn.click();
        await page.waitForTimeout(200);
      }

      // C. FAILURE MANIFEST & FOCUS FAILURES (Desktop)
      if (vp.name === "desktop-1440") {
        console.log("\n  [Desktop] Testing FAILURE Evidence Manifest & Focus Failures...");
        await fileInput.setInputFiles(path.join(FIXTURES_DIR, "failure-manifest.json"));
        await page.waitForTimeout(600);

        const failBadges = await page.locator("text=QA Failed").count();
        console.log(`  - Visible 'QA Failed' badges: ${failBadges > 0 ? `✅ YES (${failBadges})` : "❌ NO"}`);
        if (failBadges === 0) totalErrors++;

        const focusFailuresBtn = page.locator("button:has-text('Focus Failures')");
        const focusBtnVisible = await focusFailuresBtn.isVisible();
        console.log(`  - 'Focus Failures' button visible: ${focusBtnVisible ? "✅ YES" : "❌ NO"}`);
        if (!focusBtnVisible) totalErrors++;

        // Click Focus Failures
        await focusFailuresBtn.click();
        await page.waitForTimeout(500);

        const failureDrawerVisible = await page.locator("aside").getByText("Failure Reasons").isVisible();
        console.log(`  - Focus Failures opened failing node details drawer: ${failureDrawerVisible ? "✅ YES" : "❌ NO"}`);
        if (!failureDrawerVisible) totalErrors++;

        await page.screenshot({ path: path.join(OUTPUT_DIR, "desktop-1440-evidence-failure-focus.png") });

        // Close details drawer before next step
        if (await closeBtn.isVisible()) {
          await closeBtn.click();
          await page.waitForTimeout(200);
        }

        // D. REPLACE EVIDENCE ACTION (Upload Partial Manifest via Replace Evidence)
        console.log("\n  [Desktop] Testing Replace Evidence action...");
        const evidenceDropdownBtn = page.locator("header button:has-text('6a1c8d2'), header button:has-text('Evidence')").first();
        await evidenceDropdownBtn.click();
        await page.waitForTimeout(300);

        const replaceBtn = page.locator("button:has-text('Replace Evidence JSON')");
        const replaceVisible = await replaceBtn.isVisible();
        console.log(`  - 'Replace Evidence JSON' button visible in popover: ${replaceVisible ? "✅ YES" : "❌ NO"}`);
        if (!replaceVisible) totalErrors++;

        // Upload partial-manifest.json to replace current evidence
        await fileInput.setInputFiles(path.join(FIXTURES_DIR, "partial-manifest.json"));
        await page.waitForTimeout(600);

        const partialBadges = await page.locator("text=Partial QA").count();
        console.log(`  - Replaced evidence with Partial manifest, 'Partial QA' badges: ${partialBadges > 0 ? `✅ YES (${partialBadges})` : "❌ NO"}`);
        if (partialBadges === 0) totalErrors++;

        await page.screenshot({ path: path.join(OUTPUT_DIR, "desktop-1440-evidence-partial.png") });

        // E. CLEAR EVIDENCE
        console.log("\n  [Desktop] Testing Clear Evidence action...");
        const clearBtn = page.locator("button:has-text('Clear Evidence')");
        if (!(await clearBtn.isVisible())) {
          const evidenceDropdownBtn2 = page.locator("header button:has-text('6a1c8d2'), header button:has-text('Evidence')").first();
          await evidenceDropdownBtn2.click();
          await page.waitForTimeout(300);
        }

        await clearBtn.click();
        await page.waitForTimeout(400);

        const loadEvidenceBtnVisible = await page.locator("button:has-text('Load QA Evidence')").isVisible();
        console.log(`  - Cleared evidence, 'Load QA Evidence' restored: ${loadEvidenceBtnVisible ? "✅ YES" : "❌ NO"}`);
        if (!loadEvidenceBtnVisible) totalErrors++;

        await page.screenshot({ path: path.join(OUTPUT_DIR, "desktop-1440-evidence-cleared.png") });
      }

      if (consoleErrors.length > 0) {
        console.error(`  ❌ Console errors logged for ${vp.name}:`, consoleErrors);
        totalErrors += consoleErrors.length;
      }
      if (pageErrors.length > 0) {
        console.error(`  ❌ Page errors logged for ${vp.name}:`, pageErrors);
        totalErrors += pageErrors.length;
      }

      await page.close();
    }
  } catch (err: any) {
    if (!process.argv.includes("--test-controlled-failure")) {
      console.error("Visual QA failed with unhandled error:", err);
    }
    totalErrors++;
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
    if (serverProcess) {
      await terminateChildServer(serverProcess, { port: 3000, baseUrl: BASE_URL, startupPath: "/workflow-map" });
    }
  }

  if (!process.argv.includes("--test-controlled-failure")) {
    console.log("\n==================================================");
    console.log(`Visual QA Summary: ${totalErrors === 0 ? "✅ ALL CHECKS PASSED" : `❌ ${totalErrors} ERRORS FOUND`}`);
    console.log(`Screenshots saved to: ${OUTPUT_DIR}`);
    console.log("==================================================");
  }

  if (totalErrors > 0) {
    process.exitCode = 1;
  }
}

runVisualValidation().catch((err) => {
  if (!process.argv.includes("--test-controlled-failure")) {
    console.error("Fatal error:", err);
  }
  process.exitCode = 1;
});
