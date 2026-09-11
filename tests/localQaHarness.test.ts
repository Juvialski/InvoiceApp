import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { ROUTE_DEFINITIONS } from "../src/utils/routes.ts";
import { getLocalQaScenarioDefinitions, LOCAL_QA_VIEWPORTS } from "../scripts/qa/localQaScenarios.ts";

const localQaSource = readFileSync(new URL("../scripts/qa/localQa.ts", import.meta.url), "utf8");

test("authenticated Local-QA scenario catalog covers every canonical route at required viewports", () => {
  const definitions = getLocalQaScenarioDefinitions();
  const requiredRouteIds = new Set(ROUTE_DEFINITIONS.map((route) => route.id));
  const coveredRouteIds = new Set(definitions.map((scenario) => scenario.path === "/email-sms" ? "inbox" : ROUTE_DEFINITIONS.find((route) => route.path === scenario.path)?.id));
  assert.deepEqual(coveredRouteIds, requiredRouteIds);
  assert.equal(definitions.length, ROUTE_DEFINITIONS.length * LOCAL_QA_VIEWPORTS.length);
  assert.deepEqual(new Set(definitions.map((scenario) => scenario.viewport.name)), new Set(["desktop-1440", "tablet-768", "mobile-390"]));
  assert.ok(definitions.some((scenario) => scenario.id === "route-projects-mobile-390"));
  assert.ok(definitions.some((scenario) => scenario.id === "route-procurement-tablet-768"));
});

test("Local-QA runner waits for delayed authentication and does not persist the raw QA email", () => {
  assert.match(localQaSource, /waitForAuthenticationOrWorkspace/);
  assert.match(localQaSource, /userMatchesExpected/);
  assert.doesNotMatch(localQaSource, /email:\s*EXPECTED_EMAIL/);
  assert.match(localQaSource, /schemaVersion:\s*2/);
  assert.match(localQaSource, /ROUTE_DEFINITIONS\.map\(\(route\) => route\.path\)/);
  assert.match(localQaSource, /cleanUnsafeScreenshotArtifacts/);
  assert.match(localQaSource, /desktop\|tablet/);
  assert.match(localQaSource, /runLocalQaScenarios/);
});

test("Local-QA comprehensive gate refuses blocked, untested, or unavailable scenario coverage", () => {
  assert.match(localQaSource, /const coverageGaps = scenarioRun\.scenarios\.filter/);
  assert.match(localQaSource, /scenario\.status !== "PASS"/);
  assert.match(localQaSource, /item\.id\.endsWith\("-available"\)/);
  assert.match(localQaSource, /Authenticated Local-QA coverage incomplete/);
});

test("Local-QA PDF evidence captures preview screenshots and exact rendered page counts", () => {
  assert.match(localQaSource, /preview\.screenshot\(\{ path: previewScreenshotPath \}\)/);
  assert.match(localQaSource, /renderedPages !== pageCount/);
  assert.match(localQaSource, /previewScreenshotPath/);
  assert.match(localQaSource, /downloadedPdfPath/);
  assert.match(localQaSource, /evidence\.pdfChecks = await pdfEvidence\(session\.page\)/);
});

test("Local-QA scenario evidence keeps AI-unconfigured responses explicit and SMS non-mutating", () => {
  const scenarios = readFileSync(new URL("../scripts/qa/localQaScenarios.ts", import.meta.url), "utf8");
  assert.match(scenarios, /api\/deployment\/company-ai/);
  assert.match(scenarios, /ERR_ABORTED|aborted/);
  assert.match(scenarios, /interactiveOverflowCount/);
  assert.match(scenarios, /details:not\(\[open\]\)/);
  assert.match(scenarios, /No SMS provider or send action is used/);
  assert.match(scenarios, /Prepared by \/ Processed by name/);
  assert.doesNotMatch(scenarios, /sendEmailMessageByGmail|sendSms/i);
});
