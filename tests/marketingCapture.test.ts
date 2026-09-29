import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertLocalMarketingCaptureUrl, buildMarketingCaptureRoutes, MARKETING_CAPTURE_DEFAULT_URL, MARKETING_CAPTURE_PROFILES } from "../scripts/marketingCaptureContract.ts";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("marketing capture only accepts a loopback preview origin", () => {
  assert.equal(assertLocalMarketingCaptureUrl(MARKETING_CAPTURE_DEFAULT_URL).hostname, "127.0.0.1");
  assert.throws(() => assertLocalMarketingCaptureUrl("https://qa.example.com"), /127\.0\.0\.1/);
  assert.throws(() => assertLocalMarketingCaptureUrl("http://127.0.0.1:4178/demo"), /preview origin/);
  assert.throws(() => assertLocalMarketingCaptureUrl("http://user:pass@127.0.0.1:4178"), /preview origin/);
  assert.throws(() => assertLocalMarketingCaptureUrl("http://localhost:4178"), /127\.0\.0\.1/);
});

test("marketing capture routes stay within the isolated demo namespace", () => {
  const routes = buildMarketingCaptureRoutes();
  assert.deepEqual(routes.map((route) => route.id), ["dashboard", "projects", "workbook", "supplier-invoice-review", "expenses", "procurement"]);
  assert.ok(routes.every((route) => route.path.startsWith("/demo/")));
  assert.ok(routes.every((route) => !route.path.includes("qa-hydroqualisense") && !route.path.includes("/api/")));
});

test("capture profiles cover a wide desktop and vertical 9:16 output", () => {
  const desktop = MARKETING_CAPTURE_PROFILES.find((profile) => profile.id === "desktop");
  const vertical = MARKETING_CAPTURE_PROFILES.find((profile) => profile.id === "vertical");
  assert.deepEqual(desktop?.viewport, { width: 1440, height: 900 });
  assert.deepEqual(vertical?.viewport, { width: 540, height: 960 });
  assert.deepEqual(vertical?.videoSize, { width: 1080, height: 1920 });
});

test("fictional source invoices stay outside the public and production asset tree", () => {
  for (const file of ["FPM-2609-184.svg", "SFS-2609-771.svg", "WPI-2609-502.svg"]) {
    assert.equal(existsSync(path.join(repoRoot, "scripts", "marketing-fixtures", "invoices", file)), true);
    assert.equal(existsSync(path.join(repoRoot, "public", "demo", "marketing-invoices", file)), false);
  }
});
