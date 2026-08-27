import { chromium } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";

const baseUrl = process.env.DEMO_QA_BASE_URL || "http://127.0.0.1:4173";
const outputDir = process.env.DEMO_QA_OUTPUT_DIR || "artifacts/demo-visual-qa";
await fs.mkdir(outputDir, { recursive: true });

const scenarios = [
  { name: "01-landing-1440", path: "/demo", width: 1440, height: 1000 },
  { name: "02-dashboard-1440", path: "/demo/app/dashboard", width: 1440, height: 1000 },
  { name: "03-projects-1440", path: "/demo/app/projects", width: 1440, height: 1000 },
  { name: "04-project-warehouse-1440", path: "/demo/app/projects/demo-project-warehouse", width: 1440, height: 1000 },
  { name: "05-invoices-1440", path: "/demo/app/invoices", width: 1440, height: 1000 },
  { name: "06-payroll-1440", path: "/demo/app/payroll", width: 1440, height: 1000 },
  { name: "07-documents-1440", path: "/demo/app/documents", width: 1440, height: 1000 },
  { name: "08-assistant-1440", path: "/demo/app/assistant", width: 1440, height: 1000 },
  { name: "09-tour-1440", path: "/demo/app/dashboard", width: 1440, height: 1000, action: "tour" },
  { name: "10-dashboard-1366", path: "/demo/app/dashboard", width: 1366, height: 768 },
  { name: "11-dashboard-768", path: "/demo/app/dashboard", width: 768, height: 1024 },
  { name: "12-mobile-navigation-390", path: "/demo/app/dashboard", width: 390, height: 844, action: "mobile-nav" },
];

const browser = await chromium.launch({ headless: true });
const results = [];
let hasFailure = false;

for (const scenario of scenarios) {
  const context = await browser.newContext({ viewport: { width: scenario.width, height: scenario.height }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));

  const response = await page.goto(`${baseUrl}${scenario.path}`, { waitUntil: "networkidle", timeout: 60_000 });
  await page.waitForTimeout(900);

  if (scenario.action === "tour") {
    await page.getByRole("button", { name: "Demo Tour" }).first().click();
    await page.waitForTimeout(250);
  }
  if (scenario.action === "mobile-nav") {
    await page.getByRole("button", { name: "Open navigation" }).click();
    await page.waitForTimeout(250);
  }

  const metrics = await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: document.documentElement.clientWidth,
    bodyWidth: document.body.scrollWidth,
    title: document.title,
    bodyTextLength: document.body.innerText.length,
  }));
  const overflowPx = Math.max(0, metrics.documentWidth - metrics.viewportWidth, metrics.bodyWidth - metrics.viewportWidth);
  const status = response?.status() || 0;
  const failed = status >= 400 || pageErrors.length > 0 || consoleErrors.length > 0 || overflowPx > 2 || metrics.bodyTextLength < 80;
  if (failed) hasFailure = true;

  await page.screenshot({ path: path.join(outputDir, `${scenario.name}.png`), fullPage: true });
  results.push({ ...scenario, status, overflowPx, ...metrics, consoleErrors, pageErrors, failed });
  await context.close();
}

await browser.close();
await fs.writeFile(path.join(outputDir, "manifest.json"), JSON.stringify({ generatedAt: new Date().toISOString(), baseUrl, results }, null, 2));

for (const result of results) {
  console.log(`${result.failed ? "FAIL" : "PASS"} ${result.name}: HTTP ${result.status}, overflow ${result.overflowPx}px, consoleErrors=${result.consoleErrors.length}, pageErrors=${result.pageErrors.length}`);
}

if (hasFailure) process.exitCode = 1;
