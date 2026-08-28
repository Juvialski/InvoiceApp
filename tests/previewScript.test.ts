import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("package scripts expose the Vite preview command used by CI", () => {
  const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
    scripts?: Record<string, string>;
  };

  assert.equal(packageJson.scripts?.preview, "vite preview");
});

test("continuation hardening installs the QA-only Playwright dependency before running demo QA", () => {
  const workflow = readFileSync(new URL("../.github/workflows/continuation-hardening.yml", import.meta.url), "utf8");

  assert.match(workflow, /npm install --no-save --package-lock=false playwright@1\.55\.0/);
  assert.match(workflow, /npx playwright install --with-deps chromium/);
});

test("validated hardening does not stage generated workflow files for the repository-token push", () => {
  const workflow = readFileSync(new URL("../.github/workflows/continuation-hardening.yml", import.meta.url), "utf8");
  const addLine = workflow.split(/\r?\n/).find((line) => line.trimStart().startsWith("git add "));

  assert.ok(addLine, "the validated hardening commit must declare an explicit file allowlist");
  assert.doesNotMatch(addLine!, /\.github\/workflows\//);
});
