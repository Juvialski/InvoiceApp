import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("package scripts expose the Vite preview command used by CI", () => {
  const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
    scripts?: Record<string, string>;
  };

  assert.equal(packageJson.scripts?.preview, "vite preview");
});
