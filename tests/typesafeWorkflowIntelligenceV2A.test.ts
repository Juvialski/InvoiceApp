import assert from "node:assert/strict";
import test from "node:test";
import {
  rerankContextCandidates,
} from "../scripts/developer-intelligence/typesafe/contextReranker.ts";
import {
  triageAffectedTests,
} from "../scripts/developer-intelligence/typesafe/testTriage.ts";
import {
  sanitizeTypeSafePayload,
} from "../scripts/developer-intelligence/typesafe/sanitize.ts";
import {
  buildSyntheticAffectedTestSelection,
  buildSyntheticContextCandidates,
  measureCandidateRetention,
} from "../scripts/developer-intelligence/typesafe/v2a/fixtures.ts";
import {
  buildMultiAxisFileQuestions,
  chunkForV2a,
} from "../scripts/developer-intelligence/typesafe/v2a/experimentShapes.ts";
import {
  evaluateHistoricalFixtures,
  getHistoricalFixtures,
} from "../scripts/developer-intelligence/typesafe/v2a/historicalFixtures.ts";

test("synthetic context fixture reports full must-keep retention without Jev", () => {
  const fixture = buildSyntheticContextCandidates({ count: 6, mustKeepCount: 2, relevantCount: 3 });
  const selected = fixture.candidates.filter((candidate) => candidate.mustKeep);
  const metrics = measureCandidateRetention(fixture.candidates, selected, fixture.expectedRelevantIds);

  assert.equal(metrics.baselineCount, 6);
  assert.equal(metrics.selectedCount, 2);
  assert.equal(metrics.mustKeepRetention, 1);
  assert.equal(metrics.relevantRetention, 2 / 3);
  assert.ok(metrics.reductionPercent > 60);
});

test("context reranker chunks candidate sets beyond the former 64-candidate guard", async () => {
  const fixture = buildSyntheticContextCandidates({ count: 65, mustKeepCount: 3, relevantCount: 5 });
  const result = await rerankContextCandidates({
    task: fixture.task,
    candidates: fixture.candidates,
    live: true,
    env: { TYPESAFE_API_KEY: "synthetic-test-key" },
  });

  assert.equal(result.fallback, true);
  assert.equal(result.diagnostic.fallbackReason, "missing-api-key");
  assert.deepEqual(result.selectedCandidates, fixture.candidates);
  assert.equal(result.diagnostic.candidateCount, 65);
  assert.equal(result.diagnostic.selectedCount, 65);
  assert.ok((result.diagnostic.chunkCount || 0) > 1);
});

test("sanitizer rejects an oversized synthetic test-triage payload", () => {
  const selection = buildSyntheticAffectedTestSelection(75, 400);
  const payload = sanitizeTypeSafePayload({
    task: "synthetic broad affected test triage",
    tests: selection.selectedTests.map((path) => ({ path, reasons: selection.testReasons[path] })),
  });

  assert.equal(payload.ok, false);
  assert.equal(payload.ok ? undefined : payload.reason, "oversized");
});

test("test triage retains every required test when Jev is unavailable", async () => {
  const selection = buildSyntheticAffectedTestSelection(75, 8);
  const result = await triageAffectedTests({
    task: "synthetic broad affected test triage",
    selection,
    live: true,
    env: {},
  });

  assert.equal(result.fallback, true);
  assert.equal(result.diagnostic.fallbackReason, "missing-api-key");
  assert.deepEqual(result.requiredTests, selection.selectedTests);
  assert.deepEqual(result.recommendedTests, selection.selectedTests);
  assert.equal(result.diagnostic.candidateCount, 75);
  assert.equal(result.diagnostic.selectedCount, 75);
});

test("deterministic experiment chunks preserve every candidate exactly once", () => {
  const fixture = buildSyntheticContextCandidates({ count: 75, mustKeepCount: 4, relevantCount: 8 });
  const chunks = chunkForV2a(fixture.candidates, 25);
  const flattened = chunks.flat().map((candidate) => candidate.id);

  assert.deepEqual(chunks.map((chunk) => chunk.length), [25, 25, 25]);
  assert.deepEqual(flattened, fixture.candidates.map((candidate) => candidate.id));
  assert.equal(new Set(flattened).size, 75);
  assert.equal(chunks.flat().filter((candidate) => candidate.mustKeep).length, 4);
});

test("multi-axis file questions remain independent over one shared candidate state", () => {
  const fixture = buildSyntheticContextCandidates({ count: 2, mustKeepCount: 1, relevantCount: 1 });
  const questions = buildMultiAxisFileQuestions(fixture.candidates);

  assert.deepEqual(Object.keys(questions), [
    "c0_relevance",
    "c0_boundary",
    "c0_validation",
    "c0_reviewRisk",
    "c1_relevance",
    "c1_boundary",
    "c1_validation",
    "c1_reviewRisk",
  ]);
  assert.equal(questions.c0_relevance.type, "noul");
  assert.equal(questions.c0_boundary.type, "noul");
  assert.equal(questions.c0_validation.type, "score");
  assert.equal(questions.c0_reviewRisk.type, "score");
});

test("historical fixtures preserve labels and report recall separately from reduction", () => {
  const fixtures = getHistoricalFixtures();
  assert.equal(fixtures.length, 10);
  assert.equal(new Set(fixtures.map((fixture) => fixture.category)).size, 10);
  assert.ok(fixtures.every((fixture) => fixture.actualChangedFileCount > 0 && fixture.actualTestFileCount >= 0));
  assert.ok(fixtures.every((fixture) => fixture.expectedRelevantPaths.every((path) => fixture.candidatePaths.includes(path))));

  const result = evaluateHistoricalFixtures(fixtures, (fixture) => fixture.mustKeepPaths);
  assert.equal(result.fixtureCount, 10);
  assert.equal(result.mustKeepRetention, 1);
  assert.ok(result.relevantRecall < 1);
  assert.ok(result.reductionPercent > 0);
});
