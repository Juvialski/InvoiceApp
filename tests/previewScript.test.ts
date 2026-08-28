import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const exactHeadCheckout = /ref: \$\{\{ github\.event_name == 'pull_request' && github\.event\.pull_request\.head\.sha \|\| github\.sha \}\}/;

test("normal PR workflows validate the exact pull-request head", () => {
  for (const workflow of ["database-tests.yml", "workflow-map-consistency.yml", "demo-visual-qa.yml"]) {
    const content = readFileSync(new URL(`../.github/workflows/${workflow}`, import.meta.url), "utf8");
    assert.match(content, exactHeadCheckout, `${workflow} must check out the PR head SHA`);
    assert.doesNotMatch(content, /git\s+(?:commit|push)|contents:\s*write/i, `${workflow} must not write source changes`);
  }
});

test("temporary continuation validation infrastructure is absent", () => {
  for (const path of [
    ".github/workflows/continuation-hardening.yml",
    "continuation-patch-error.txt",
    "continuation-test-error.txt",
    "scripts/continuation-hardening-patch.py",
    "scripts/continuation-lint-fix.py",
    "scripts/continuation-test-compat.py",
  ]) {
    assert.equal(existsSync(new URL(`../${path}`, import.meta.url)), false, `${path} must not remain in the repository`);
  }
});
