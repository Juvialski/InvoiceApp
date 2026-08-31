import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const operationsUi = readFileSync(new URL("../src/components/ui/OperationsUI.tsx", import.meta.url), "utf8");
const shell = readFileSync(new URL("../src/app/AppShell.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../src/index.css", import.meta.url), "utf8");

test("shared operations UI exposes intentional surface, loading, error, and metric semantics", () => {
  assert.match(operationsUi, /export function Surface/);
  assert.match(operationsUi, /export function LoadingState/);
  assert.match(operationsUi, /role="status" aria-label=\{label\}/);
  assert.match(operationsUi, /export function ErrorState/);
  assert.match(operationsUi, /role="alert"/);
  assert.match(operationsUi, /aria-label=\{`\$\{label\}: \$\{loading \? "Loading" : value\}`\}/);
  assert.match(operationsUi, /<header className=/);
});

test("shell rendering failures use safe recovery copy and retain a bounded content frame", () => {
  assert.match(shell, /This workspace section needs a refresh/);
  assert.match(shell, /Your saved records were not changed/);
  assert.doesNotMatch(shell, /this\.state\.error\?\.message/);
  assert.match(shell, /max-w-\[1600px\]/);
});

test("global UI honors reduced-motion preferences", () => {
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(css, /transition-duration: 0\.01ms/);
  assert.match(css, /scroll-behavior: auto/);
});
