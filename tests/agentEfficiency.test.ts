import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractFailureContext,
  extractWarnings,
  parseNodeTestSummary,
} from '../scripts/ci-failure-context.ts';
import {
  DEFAULT_AGENT_CONTEXT_BUDGET,
  formatAgentContextPacket,
  parseAgentContextCliArguments,
} from '../scripts/agent-context.ts';
import {
  formatAgentSelectionSummary,
  formatCompactExecutionResult,
  type CompactTestExecutionResult,
} from '../scripts/test-affected-agent.ts';
import type { ImpactSelectionResult } from '../scripts/test-impact.ts';
import type { WorkflowContextPacket } from '../scripts/workflow-map/context.ts';
import type { RepositoryMetadata } from '../scripts/workflow-map/repositoryContext.ts';

function mockImpact(overrides: Partial<ImpactSelectionResult> = {}): ImpactSelectionResult {
  return {
    baseSha: 'a'.repeat(40),
    headSha: 'b'.repeat(40),
    changedFiles: ['src/lib/project.ts'],
    selectedTests: ['tests/projectLifecycle.test.ts', 'tests/appRouting.test.ts'],
    testReasons: {
      'tests/projectLifecycle.test.ts': ['Transitive dependency'],
      'tests/appRouting.test.ts': ['Permanent smoke suite test'],
    },
    smokeTests: ['tests/appRouting.test.ts'],
    totalAvailableTests: 200,
    isFallback: false,
    isDatabaseAffected: false,
    ...overrides,
  };
}

function mockRepository(): RepositoryMetadata {
  return {
    headSha: 'b'.repeat(40),
    branch: 'feature/project-controls',
    dirty: true,
    changedFilePaths: ['src/lib/project.ts'],
  };
}

function mockWorkflow(): WorkflowContextPacket {
  return {
    packetType: 'engoryx-agent-context',
    schemaVersion: 1,
    repository: {
      headSha: 'b'.repeat(40),
      branch: 'feature/project-controls',
      dirty: true,
      changedFilePaths: ['src/lib/project.ts'],
      graphSchemaVersion: 1,
      graphVersion: 'test',
    },
    requestedScope: {
      query: 'project lifecycle',
      filePaths: [],
      useChangedFiles: true,
      changedFilePaths: ['src/lib/project.ts'],
      hops: 1,
      characterBudget: 7_500,
    },
    selection: {
      seedNodeIds: ['projects.project-detail'],
      seedMatches: [],
      candidateNodeCount: 1,
      omittedCandidateNodeCount: 0,
      queryMatchMode: 'all-terms',
      matchedInvariantIds: ['project-financial-truth'],
    },
    workflow: {
      hops: 1,
      nodes: [{
        nodeId: 'projects.project-detail',
        label: 'Project Detail',
        domain: 'projects',
        type: 'screen',
        sourceClassification: 'code-derived',
        distance: 0,
        seed: true,
      }],
      edges: [{
        edgeId: 'projects.project-detail-to-costs',
        source: 'projects.project-detail',
        target: 'projects.project-costs',
        type: 'reads',
        kind: 'read-flow',
        label: 'shows project costs',
      }],
      lifecycleTransitions: [],
    },
    protectedBoundaries: {
      invariants: [{
        invariantId: 'project-financial-truth',
        label: 'Project financial truth',
        sourceClassification: 'code-derived',
        sourceFiles: ['src/lib/project.ts'],
        tests: ['tests/projectLifecycle.test.ts'],
      }],
      guards: [{
        guardId: 'project-view',
        source: 'node',
        sourceId: 'projects.project-detail',
        label: 'Project permission gate',
        kind: 'permission',
        permissionKeys: ['projects.view'],
        invariantIds: [],
      }],
      permissions: ['projects.view'],
      confirmations: [],
    },
    routes: [],
    inspectFiles: ['src/lib/project.ts', 'src/components/projects/ProjectDetail.tsx'],
    relevantTests: ['tests/projectLifecycle.test.ts'],
    qaScenarioIds: [],
    changedFileMapping: {
      matched: [{
        path: 'src/lib/project.ts',
        nodeIds: ['projects.project-detail'],
        invariantIds: ['project-financial-truth'],
        matchKinds: ['node-file'],
      }],
      unmatched: [],
    },
    requiredVerification: [
      'Inspect the current source implementation referenced by this packet.',
      'Inspect current GitHub/CI state before relying on this orientation.',
      'Treat this packet as advisory context, not authoritative implementation truth.',
    ],
    truncation: {
      truncated: false,
      characterBudget: 7_500,
      detailLevel: 'full',
      omitted: {
        candidateSeeds: 0,
        nodes: 0,
        edges: 0,
        invariants: 0,
        routes: 0,
        inspectFiles: 0,
        relevantTests: 0,
        qaScenarioIds: 0,
        changedFiles: 0,
      },
    },
  } as WorkflowContextPacket;
}

test('node:test summary parser extracts compact pass/fail counts', () => {
  const output = ['TAP version 13', '# tests 42', '# suites 0', '# pass 40', '# fail 1', '# skipped 1', '# duration_ms 1234.56'].join('\n');
  assert.deepEqual(parseNodeTestSummary(output), {
    tests: 42,
    suites: 0,
    pass: 40,
    fail: 1,
    cancelled: undefined,
    skipped: 1,
    todo: undefined,
    durationMs: 1234.56,
  });
});

test('node:test summary parser accepts the current info-marked summary and keeps the final counts', () => {
  const output = [
    '# tests 2',
    '# pass 2',
    'ℹ tests 1408',
    'ℹ suites 13',
    'ℹ pass 1407',
    'ℹ fail 0',
    'ℹ skipped 1',
    'ℹ duration_ms 84950.25',
  ].join('\n');
  assert.deepEqual(parseNodeTestSummary(output), {
    tests: 1408,
    suites: 13,
    pass: 1407,
    fail: 0,
    cancelled: undefined,
    skipped: 1,
    todo: undefined,
    durationMs: 84950.25,
  });
});

test('failure extractor keeps the useful failure neighborhood and final summary only', () => {
  const noise = Array.from({ length: 150 }, (_, index) => `successful diagnostic line ${index}`);
  const log = [
    ...noise,
    'not ok 17 - project totals remain balanced',
    '  error: expected 100 to equal 90',
    '  code: ERR_ASSERTION',
    ...Array.from({ length: 100 }, (_, index) => `post-failure noise ${index}`),
    '# tests 42',
    '# pass 41',
    '# fail 1',
    '# skipped 0',
    '# duration_ms 2000',
  ].join('\n');
  const excerpt = extractFailureContext(log, { maxLines: 40, maxChars: 2_000, contextLines: 3 });
  assert.match(excerpt, /not ok 17/);
  assert.match(excerpt, /ERR_ASSERTION/);
  assert.match(excerpt, /# fail 1/);
  assert.ok(excerpt.length <= 2_000);
  assert.doesNotMatch(excerpt, /successful diagnostic line 0\n/);
});

test('warning extraction is bounded and de-duplicates repeated warnings', () => {
  const log = ['Warning: alpha', 'Warning: alpha', 'npm warn beta', 'normal output'].join('\n');
  assert.deepEqual(extractWarnings(log), ['Warning: alpha', 'npm warn beta']);
});

test('compact success output reports counts without replaying verbose TAP output', () => {
  const execution: CompactTestExecutionResult = {
    exitCode: 0,
    command: 'node --test tests/projectLifecycle.test.ts',
    elapsedMs: 1_500,
    output: ['verbose successful assertion output', '# tests 12', '# pass 12', '# fail 0', '# skipped 0', '# duration_ms 1400'].join('\n'),
  };
  const output = formatCompactExecutionResult(mockImpact(), execution);
  assert.match(output, /^PASS affected application tests/m);
  assert.match(output, /tests=12 pass=12 fail=0/);
  assert.doesNotMatch(output, /verbose successful assertion output/);
});

test('compact failure output retains bounded failure evidence', () => {
  const execution: CompactTestExecutionResult = {
    exitCode: 1,
    command: 'node --test tests/projectLifecycle.test.ts',
    elapsedMs: 2_000,
    output: ['TAP version 13', 'not ok 1 - project lifecycle', 'error: mismatch', 'code: ERR_ASSERTION', '# tests 1', '# pass 0', '# fail 1', '# skipped 0'].join('\n'),
  };
  const output = formatCompactExecutionResult(mockImpact(), execution);
  assert.match(output, /^FAIL affected application tests/m);
  assert.match(output, /failure_context:/);
  assert.match(output, /ERR_ASSERTION/);
  assert.ok(output.length < 13_000);
});

test('agent selection summary stays compact and exposes fallback/database state', () => {
  const output = formatAgentSelectionSummary(mockImpact({ isDatabaseAffected: true }));
  assert.match(output, /selected_files=2\/200/);
  assert.match(output, /database=affected fallback=no/);
  assert.doesNotMatch(output, /tests\/projectLifecycle\.test\.ts/);
});

test('agent context CLI treats task as the default workflow query', () => {
  const parsed = parseAgentContextCliArguments(['--task', 'project lifecycle correction', '--changed', '--hops', '1', '--budget', '8000']);
  assert.equal(parsed.task, 'project lifecycle correction');
  assert.equal(parsed.selection.query, 'project lifecycle correction');
  assert.equal(parsed.selection.hops, 1);
  assert.equal(parsed.includeDetectedChanges, true);
  assert.equal(parsed.characterBudget, 8_000);
});

test('agent context packet is bounded and contains working-set, safety, and validation evidence', () => {
  const output = formatAgentContextPacket({
    task: 'Update project controls',
    repository: mockRepository(),
    impact: mockImpact(),
    workflow: mockWorkflow(),
  }, DEFAULT_AGENT_CONTEXT_BUDGET);
  assert.ok(output.length <= DEFAULT_AGENT_CONTEXT_BUDGET);
  assert.match(output, /## Working set/);
  assert.match(output, /project-financial-truth/);
  assert.match(output, /projects\.view/);
  assert.match(output, /test:affected:agent/);
  assert.match(output, /Database: unaffected/);
});
