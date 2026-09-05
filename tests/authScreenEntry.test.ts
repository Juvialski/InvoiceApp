import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("unauthenticated AuthScreen exposes a real full-navigation demo entry", () => {
  const source = readFileSync(new URL("../src/components/auth/AuthScreen.tsx", import.meta.url), "utf8");
  assert.match(source, /data-demo-entry="auth"/);
  assert.match(source, /<a href="\/demo"/);
  assert.match(source, /Try the \{BRAND\.productName\} demo/);
});
