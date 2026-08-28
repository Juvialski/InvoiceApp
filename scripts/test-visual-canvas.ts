import { createRequire } from "node:module";
import fs from "node:fs/promises";
import path from "node:path";

// Playwright remains an optional QA-only dependency, matching the existing demo QA lane.
// Resolve it at runtime so normal TypeScript validation does not require it to be installed.
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const BASE_URL = "http://localhost:3000";
const OUTPUT_DIR = path.resolve("artifacts/workflow-canvas-qa");

async function runVisualValidation() {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
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
  console.log("Starting WM-2 Visual Workflow Canvas Browser Validation");
  console.log("==================================================");

  let totalErrors = 0;

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

    for (const p of presetsToTest) {
      const url = `${BASE_URL}/workflow-map?preset=${p.preset}`;
      await page.goto(url, { waitUntil: "networkidle" });
      await page.waitForTimeout(600); // Allow fitView animation to complete

      // Verify canvas rendered nodes
      const nodeCount = await page.locator(".react-flow__node").count();
      console.log(`  [${vp.name}] Preset: ${p.name} -> ${nodeCount} visible nodes`);

      if (nodeCount === 0) {
        console.error(`  ❌ Error: No nodes rendered for preset ${p.id}`);
        totalErrors++;
      }

      // Take screenshot for desktop and mobile
      if (vp.name === "desktop-1440" || vp.name === "mobile-390") {
        const screenshotPath = path.join(OUTPUT_DIR, `${vp.name}-${p.id}.png`);
        await page.screenshot({ path: screenshotPath, fullPage: false });
      }
    }

    // Interactive Test on Desktop: Click a node, verify details panel opens, test search
    if (vp.name === "desktop-1440") {
      console.log("\n  [Interactive QA] Testing node selection, details panel, and search...");
      await page.goto(`${BASE_URL}/workflow-map?preset=overview`, { waitUntil: "networkidle" });
      await page.waitForTimeout(500);

      // 1. Click first visible node
      const firstNode = page.locator(".react-flow__node").first();
      await firstNode.click();
      await page.waitForTimeout(300);

      // Verify details drawer opened
      const drawerVisible = await page.locator("aside[aria-label='Node Details Panel']").isVisible();
      console.log(`  - Details drawer open after node click: ${drawerVisible ? "✅ YES" : "❌ NO"}`);
      if (!drawerVisible) totalErrors++;

      const selectedScreenshot = path.join(OUTPUT_DIR, "desktop-1440-selected-node-details.png");
      await page.screenshot({ path: selectedScreenshot });

      // 2. Test search autocomplete
      const searchInput = page.locator("input[placeholder*='Search nodes']");
      await searchInput.fill("payroll");
      await page.waitForTimeout(300);

      const matchingItems = await page.locator("div:has-text('Matching Nodes')").count();
      console.log(`  - Search autocomplete popup visible: ${matchingItems > 0 ? "✅ YES" : "❌ NO"}`);
      if (matchingItems === 0) totalErrors++;

      const searchScreenshot = path.join(OUTPUT_DIR, "desktop-1440-search-autocomplete.png");
      await page.screenshot({ path: searchScreenshot });

      // 3. Test Invariants Catalog modal
      const catalogBtn = page.locator("button:has-text('Catalog')");
      await catalogBtn.click();
      await page.waitForTimeout(300);

      const modalVisible = await page.locator("div[aria-label='High-Risk Invariants Catalog']").isVisible();
      console.log(`  - High-Risk Invariants Catalog Modal open: ${modalVisible ? "✅ YES" : "❌ NO"}`);
      if (!modalVisible) totalErrors++;

      const modalScreenshot = path.join(OUTPUT_DIR, "desktop-1440-invariants-catalog.png");
      await page.screenshot({ path: modalScreenshot });
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

  await browser.close();

  console.log("\n==================================================");
  console.log(`Visual QA Summary: ${totalErrors === 0 ? "✅ ALL CHECKS PASSED" : `❌ ${totalErrors} ERRORS FOUND`}`);
  console.log(`Screenshots saved to: ${OUTPUT_DIR}`);
  console.log("==================================================");

  if (totalErrors > 0) {
    process.exitCode = 1;
  }
}

runVisualValidation().catch((err) => {
  console.error("Visual QA failed with unhandled error:", err);
  process.exitCode = 1;
});
