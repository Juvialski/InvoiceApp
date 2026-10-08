import assert from 'node:assert/strict';
import test from 'node:test';
import { executeAffectedTestsCompact } from '../scripts/test-affected-agent.ts';
import type { ImpactSelectionResult } from '../scripts/test-impact.ts';

test('the compact affected runner supports TSX imports from .ts tests', () => {
  const selection: ImpactSelectionResult = {
    baseSha: '', headSha: '', changedFiles: [],
    selectedTests: ['tests/fixtures/tsxLoaderEntry.ts'], testReasons: {},
    smokeTests: [], totalAvailableTests: 1, isFallback: false, isDatabaseAffected: false,
  };
  // The fixture is an independent runner process, not a nested node:test run.
  const parentTestContext = process.env.NODE_TEST_CONTEXT;
  delete process.env.NODE_TEST_CONTEXT;
  let result;
  try {
    result = executeAffectedTestsCompact(selection);
  } finally {
    if (parentTestContext !== undefined) process.env.NODE_TEST_CONTEXT = parentTestContext;
  }
  assert.equal(result.exitCode, 0, result.output);
  assert.match(result.output, /transitive TSX component/);
});
