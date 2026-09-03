/**
 * Test Impact Selector Invariant & Verification Suite
 * Verifies change detection, dependency graph traversal, symbol granularity,
 * static contract mappings, smoke suite inclusion, domain isolation, and safe fallback.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SMOKE_TESTS,
  STATIC_CONTRACT_MAPPINGS,
  FALLBACK_FILE_PATTERNS,
  FALLBACK_RATIO_THRESHOLD,
  DATABASE_AFFECTED_PATTERNS,
  matchesPattern,
  isDatabaseAffectedFile,
  isFallbackPatternFile
} from '../scripts/test-impact-config.ts';
import {
  selectImpactedTests,
  buildDependencyGraph,
  extractChangedSymbolsFromDiff,
  detectGitRange,
  extractTopLevelDeclarations,
  type DependencyGraph
} from '../scripts/test-impact.ts';
import ts from 'typescript';

function createMockGraph(overrides: Partial<DependencyGraph> = {}): DependencyGraph {
  const dummyTests = Array.from({ length: 40 }, (_, i) => `tests/dummy${i + 1}.test.ts`);
  const migrationTests = STATIC_CONTRACT_MAPPINGS['supabase/migrations/**'] || [];

  return {
    forwardGraph: new Map([
      ['src/lib/moduleA.ts', new Set()],
      ['src/lib/moduleB.ts', new Set(['src/lib/moduleA.ts'])],
      ['src/components/MyButton.tsx', new Set()],
      ['tests/moduleA.test.ts', new Set(['src/lib/moduleA.ts'])],
      ['tests/moduleB.test.ts', new Set(['src/lib/moduleB.ts'])],
      ['tests/myButton.test.tsx', new Set(['src/components/MyButton.tsx'])],
      ['tests/unrelated.test.ts', new Set()],
      ...SMOKE_TESTS.map(t => [t, new Set<string>()] as [string, Set<string>]),
      ...migrationTests.map(t => [t, new Set<string>()] as [string, Set<string>]),
      ...dummyTests.map(t => [t, new Set<string>()] as [string, Set<string>])
    ]),
    reverseGraph: new Map([
      ['src/lib/moduleA.ts', new Set(['src/lib/moduleB.ts', 'tests/moduleA.test.ts'])],
      ['src/lib/moduleB.ts', new Set(['tests/moduleB.test.ts'])],
      ['src/components/MyButton.tsx', new Set(['tests/myButton.test.tsx'])],
      ['tests/moduleA.test.ts', new Set()],
      ['tests/moduleB.test.ts', new Set()],
      ['tests/myButton.test.tsx', new Set()],
      ['tests/unrelated.test.ts', new Set()],
      ...SMOKE_TESTS.map(t => [t, new Set<string>()] as [string, Set<string>]),
      ...migrationTests.map(t => [t, new Set<string>()] as [string, Set<string>]),
      ...dummyTests.map(t => [t, new Set<string>()] as [string, Set<string>])
    ]),
    importDetails: new Map([
      ['src/lib/moduleB.ts', new Map([['src/lib/moduleA.ts', new Set(['*'])]])],
      ['tests/moduleA.test.ts', new Map([['src/lib/moduleA.ts', new Set(['*'])]])],
      ['tests/moduleB.test.ts', new Map([['src/lib/moduleB.ts', new Set(['*'])]])],
      ['tests/myButton.test.tsx', new Map([['src/components/MyButton.tsx', new Set(['*'])]])],
      ...SMOKE_TESTS.map(t => [t, new Map()] as [string, Map<string, Set<string>>])
    ]),
    fileDeclarations: new Map(),
    allTestFiles: [
      ...SMOKE_TESTS,
      ...migrationTests,
      'tests/moduleA.test.ts',
      'tests/moduleB.test.ts',
      'tests/myButton.test.tsx',
      'tests/unrelated.test.ts',
      ...dummyTests
    ],
    ...overrides
  };
}

test('1. New test added is automatically selected', () => {
  const graph = createMockGraph();
  const result = selectImpactedTests({
    changedFiles: ['tests/newFeature.test.ts'],
    dependencyGraph: graph,
    skipDiskCheck: true
  });

  assert.ok(result.selectedTests.includes('tests/newFeature.test.ts'), 'Newly added test file must be selected');
  for (const smoke of SMOKE_TESTS) {
    assert.ok(result.selectedTests.includes(smoke), `Smoke test ${smoke} must be retained`);
  }
});

test('2. Direct dependency selection: module A changed -> tests importing A selected', () => {
  const graph = createMockGraph();
  const result = selectImpactedTests({
    changedFiles: ['src/lib/moduleA.ts'],
    dependencyGraph: graph,
    skipDiskCheck: true
  });

  assert.ok(result.selectedTests.includes('tests/moduleA.test.ts'), 'Direct test importing module A must be selected');
  assert.ok(result.selectedTests.includes('tests/moduleB.test.ts'), 'Transitive test importing module B must also be selected');
  assert.ok(!result.selectedTests.includes('tests/unrelated.test.ts'), 'Unrelated test must not be selected');
});

test('3. Transitive dependency selection: module A changed -> B imports A -> test imports B -> test selected', () => {
  const graph = createMockGraph();
  const result = selectImpactedTests({
    changedFiles: ['src/lib/moduleA.ts'],
    dependencyGraph: graph,
    skipDiskCheck: true
  });

  assert.ok(
    result.selectedTests.includes('tests/moduleB.test.ts'),
    'Transitive consumer test must be selected when upstream module A changes'
  );
  assert.ok(!result.selectedTests.includes('tests/myButton.test.tsx'), 'Unrelated component test must not be selected');
});

test('4. Unrelated domain isolation: subcontract changes do NOT select assistant, payroll, or storage tests', () => {
  const customGraph = createMockGraph({
    forwardGraph: new Map([
      ['src/lib/subcontracts.ts', new Set()],
      ['tests/subcontractsUx.test.tsx', new Set(['src/lib/subcontracts.ts'])],
      ['src/lib/assistant.ts', new Set()],
      ['tests/assistantChat.test.ts', new Set(['src/lib/assistant.ts'])],
      ['src/lib/payroll.ts', new Set()],
      ['tests/payrollProcessing.test.ts', new Set(['src/lib/payroll.ts'])],
      ['src/lib/storage.ts', new Set()],
      ['tests/storageDedup.test.ts', new Set(['src/lib/storage.ts'])],
      ...SMOKE_TESTS.map(t => [t, new Set<string>()] as [string, Set<string>])
    ]),
    reverseGraph: new Map([
      ['src/lib/subcontracts.ts', new Set(['tests/subcontractsUx.test.tsx'])],
      ['tests/subcontractsUx.test.tsx', new Set()],
      ['src/lib/assistant.ts', new Set(['tests/assistantChat.test.ts'])],
      ['tests/assistantChat.test.ts', new Set()],
      ['src/lib/payroll.ts', new Set(['tests/payrollProcessing.test.ts'])],
      ['tests/payrollProcessing.test.ts', new Set()],
      ['src/lib/storage.ts', new Set(['tests/storageDedup.test.ts'])],
      ['tests/storageDedup.test.ts', new Set()],
      ...SMOKE_TESTS.map(t => [t, new Set<string>()] as [string, Set<string>])
    ]),
    allTestFiles: [
      ...SMOKE_TESTS,
      'tests/subcontractsUx.test.tsx',
      'tests/assistantChat.test.ts',
      'tests/payrollProcessing.test.ts',
      'tests/storageDedup.test.ts',
      'tests/other1.test.ts',
      'tests/other2.test.ts',
      'tests/other3.test.ts',
      'tests/other4.test.ts',
      'tests/other5.test.ts',
      'tests/other6.test.ts',
      'tests/other7.test.ts',
      'tests/other8.test.ts',
      'tests/other9.test.ts',
      'tests/other10.test.ts',
      'tests/other11.test.ts',
      'tests/other12.test.ts'
    ]
  });

  const result = selectImpactedTests({
    changedFiles: ['src/lib/subcontracts.ts'],
    dependencyGraph: customGraph,
    skipDiskCheck: true
  });

  assert.ok(result.selectedTests.includes('tests/subcontractsUx.test.tsx'), 'Subcontracts test should be selected');
  assert.ok(!result.selectedTests.includes('tests/assistantChat.test.ts'), 'Assistant tests must remain isolated');
  assert.ok(!result.selectedTests.includes('tests/payrollProcessing.test.ts'), 'Payroll tests must remain isolated');
  assert.ok(!result.selectedTests.includes('tests/storageDedup.test.ts'), 'Storage tests must remain isolated');
});

test('5. Static source inspection: migration changes select migrationInvariants.test.ts and mapped tests', () => {
  const graph = createMockGraph();
  const result = selectImpactedTests({
    changedFiles: ['supabase/migrations/20260903_test_feature.sql'],
    dependencyGraph: graph,
    skipDiskCheck: true
  });

  assert.ok(
    result.selectedTests.includes('tests/migrationInvariants.test.ts'),
    'migrationInvariants.test.ts must be selected on migration change'
  );
  assert.ok(
    result.selectedTests.includes('tests/companyTenancyMigration.test.ts'),
    'companyTenancyMigration.test.ts must be selected on migration change'
  );
  assert.ok(
    result.selectedTests.includes('tests/databaseBackupMigration.test.ts'),
    'databaseBackupMigration.test.ts must be selected on migration change'
  );
  assert.equal(result.isDatabaseAffected, true, 'isDatabaseAffected must be true for migration changes');
});

test('6. Test-only change: changing one test selects only that test (+ smoke suite)', () => {
  const graph = createMockGraph();
  const result = selectImpactedTests({
    changedFiles: ['tests/unrelated.test.ts'],
    dependencyGraph: graph,
    skipDiskCheck: true
  });

  assert.ok(result.selectedTests.includes('tests/unrelated.test.ts'), 'The changed test itself must be selected');
  assert.ok(!result.selectedTests.includes('tests/moduleA.test.ts'), 'Unchanged app tests must NOT be selected');
  assert.ok(!result.selectedTests.includes('tests/moduleB.test.ts'), 'Unchanged app tests must NOT be selected');

  // Verify smoke tests are included
  for (const smoke of SMOKE_TESTS) {
    assert.ok(result.selectedTests.includes(smoke), `Smoke test ${smoke} must be present`);
  }
  assert.equal(result.selectedTests.length, SMOKE_TESTS.length + 1, 'Only changed test + smoke tests should be selected');
});

test('7. UI-only change: selects UI tests + smoke; marks DB migrations as NOT affected', () => {
  const graph = createMockGraph();
  const result = selectImpactedTests({
    changedFiles: ['src/components/MyButton.tsx'],
    dependencyGraph: graph,
    skipDiskCheck: true
  });

  assert.ok(result.selectedTests.includes('tests/myButton.test.tsx'), 'UI component test must be selected');
  assert.equal(result.isDatabaseAffected, false, 'isDatabaseAffected must be false for pure UI changes');
});

test('8. Migration-only change: marks DB migrations as affected; does not select unrelated app tests', () => {
  const graph = createMockGraph();
  const result = selectImpactedTests({
    changedFiles: ['supabase/migrations/20260903_add_column.sql'],
    dependencyGraph: graph,
    skipDiskCheck: true
  });

  assert.equal(result.isDatabaseAffected, true, 'isDatabaseAffected must be true');
  assert.ok(!result.selectedTests.includes('tests/moduleA.test.ts'), 'Unrelated app test A must not be selected');
  assert.ok(!result.selectedTests.includes('tests/myButton.test.tsx'), 'Unrelated UI test must not be selected');
  assert.ok(result.selectedTests.includes('tests/migrationInvariants.test.ts'), 'Migration invariant test must be selected');
});

test('9. Mixed change: both app tests and DB migration flags are active', () => {
  const graph = createMockGraph();
  const result = selectImpactedTests({
    changedFiles: [
      'src/lib/moduleA.ts',
      'supabase/migrations/20260903_schema_update.sql'
    ],
    dependencyGraph: graph,
    skipDiskCheck: true
  });

  assert.equal(result.isDatabaseAffected, true, 'isDatabaseAffected must be true');
  assert.ok(result.selectedTests.includes('tests/moduleA.test.ts'), 'Direct app test must be selected');
  assert.ok(result.selectedTests.includes('tests/migrationInvariants.test.ts'), 'Migration test must be selected');
  assert.ok(result.selectedTests.includes('tests/auth.test.ts'), 'Smoke test must be selected');
});

test('10. Config / high-risk change: tsconfig.json change triggers full fallback', () => {
  const graph = createMockGraph();
  const result = selectImpactedTests({
    changedFiles: ['tsconfig.json'],
    dependencyGraph: graph,
    skipDiskCheck: true
  });

  assert.equal(result.isFallback, true, 'isFallback must be true when tsconfig.json changes');
  assert.equal(result.selectedTests.length, graph.allTestFiles.length, 'All tests must be selected on fallback');
  assert.match(result.fallbackReason || '', /tsconfig\.json/, 'Fallback reason should reference tsconfig.json');
});

test('11. High-risk script changes trigger safe fallback', () => {
  const graph = createMockGraph();
  for (const scriptFile of ['scripts/test-impact.ts', 'scripts/test-impact-config.ts']) {
    const result = selectImpactedTests({
      changedFiles: [scriptFile],
      dependencyGraph: graph,
      skipDiskCheck: true
    });
    assert.equal(result.isFallback, true, `Changing ${scriptFile} must trigger fallback`);
    assert.equal(result.selectedTests.length, graph.allTestFiles.length, 'All tests selected on script fallback');
  }
});

test('12. package.json dependency modifications trigger safe fallback', () => {
  const graph = createMockGraph();
  const result = selectImpactedTests({
    changedFiles: ['package.json'],
    packageJsonChangedDepsOrScripts: true,
    dependencyGraph: graph,
    skipDiskCheck: true
  });

  assert.equal(result.isFallback, true, 'package.json dependencies change must trigger fallback');
  assert.equal(result.selectedTests.length, graph.allTestFiles.length);
});

test('13. Ratio threshold fallback triggers if > 60% of test suite is affected', () => {
  const allTests = [
    ...SMOKE_TESTS,
    'tests/t1.test.ts',
    'tests/t2.test.ts',
    'tests/t3.test.ts',
    'tests/t4.test.ts',
    'tests/t5.test.ts',
    'tests/t6.test.ts'
  ]; // total 14 tests. 8 smoke tests = 8/14 = 57.1% (<= 60%)
  // If we also select t1, selected is 9/14 = 64.3% (> 60% threshold!)

  const graph = createMockGraph({
    allTestFiles: allTests,
    reverseGraph: new Map([
      ['src/wide.ts', new Set(['tests/t1.test.ts'])],
      ...allTests.map(t => [t, new Set<string>()] as [string, Set<string>])
    ]),
    importDetails: new Map([
      ['tests/t1.test.ts', new Map([['src/wide.ts', new Set(['*'])]])]
    ])
  });

  const result = selectImpactedTests({
    changedFiles: ['src/wide.ts'],
    dependencyGraph: graph,
    skipDiskCheck: true
  });

  assert.equal(result.isFallback, true, 'Ratio threshold > 60% must trigger fallback');
  assert.equal(result.selectedTests.length, allTests.length, 'All tests must be selected when ratio threshold is exceeded');
  assert.match(result.fallbackReason || '', /threshold 60.0%/);
});

test('14. Missing base / invalid git state fails safe', () => {
  const invalidRange = detectGitRange('invalid_base_sha_999999999');
  assert.ok(invalidRange.error, 'Should return error for invalid base SHA');

  const graph = createMockGraph();
  const result = selectImpactedTests({
    changedFiles: [],
    isFallback: true,
    fallbackReason: 'Git diff failed safe',
    dependencyGraph: graph,
    skipDiskCheck: true
  });

  assert.equal(result.isFallback, true);
  assert.equal(result.selectedTests.length, graph.allTestFiles.length);
});

test('15. File rename/delete handled safely without throwing or selecting deleted tests', () => {
  const graph = createMockGraph();
  // Simulate deleted test file that does not exist on disk
  const result = selectImpactedTests({
    changedFiles: ['tests/deletedModule.test.ts'],
    dependencyGraph: graph,
    skipDiskCheck: false // Will check actual disk
  });

  assert.ok(!result.selectedTests.includes('tests/deletedModule.test.ts'), 'Non-existent deleted test must be omitted');
  assert.equal(result.selectedTests.length, SMOKE_TESTS.length, 'Only existing smoke tests retained');
});

test('16. Symbol-level granularity in src/types.ts isolates unaffected consumers', () => {
  const sourceCode = `
export interface Subcontract {
  id: string;
  name: string;
}

export interface UnrelatedPayrollItem {
  id: string;
  amount: number;
}
  `.trim();

  // Diff only modifying Subcontract lines
  const diffHunk = `
@@ -1,4 +1,5 @@
 export interface Subcontract {
   id: string;
+  retentionRate?: number;
   name: string;
 }
  `.trim();

  const changedSymbols = extractChangedSymbolsFromDiff(diffHunk, sourceCode);
  assert.ok(changedSymbols.has('Subcontract'), 'Subcontract symbol should be marked changed');
  assert.ok(!changedSymbols.has('UnrelatedPayrollItem'), 'UnrelatedPayrollItem should NOT be marked changed');

  const graph = createMockGraph({
    allTestFiles: [
      ...SMOKE_TESTS,
      'tests/subcontract.test.ts',
      'tests/payrollItem.test.ts',
      'tests/wildcard.test.ts',
      'tests/pad1.test.ts',
      'tests/pad2.test.ts',
      'tests/pad3.test.ts',
      'tests/pad4.test.ts',
      'tests/pad5.test.ts',
      'tests/pad6.test.ts',
      'tests/pad7.test.ts',
      'tests/pad8.test.ts',
      'tests/pad9.test.ts',
      'tests/pad10.test.ts'
    ],
    reverseGraph: new Map([
      ['src/types.ts', new Set(['tests/subcontract.test.ts', 'tests/payrollItem.test.ts', 'tests/wildcard.test.ts'])],
      ['tests/subcontract.test.ts', new Set()],
      ['tests/payrollItem.test.ts', new Set()],
      ['tests/wildcard.test.ts', new Set()],
      ...SMOKE_TESTS.map(t => [t, new Set<string>()] as [string, Set<string>])
    ]),
    importDetails: new Map([
      ['tests/subcontract.test.ts', new Map([['src/types.ts', new Set(['Subcontract'])]])],
      ['tests/payrollItem.test.ts', new Map([['src/types.ts', new Set(['UnrelatedPayrollItem'])]])],
      ['tests/wildcard.test.ts', new Map([['src/types.ts', new Set(['*'])]])]
    ])
  });

  const result = selectImpactedTests({
    changedFiles: ['src/types.ts'],
    changedSymbolsMap: new Map([['src/types.ts', changedSymbols]]),
    dependencyGraph: graph,
    skipDiskCheck: true
  });

  assert.ok(result.selectedTests.includes('tests/subcontract.test.ts'), 'Consumer importing Subcontract must be selected');
  assert.ok(result.selectedTests.includes('tests/wildcard.test.ts'), 'Wildcard consumer must be selected');
  assert.ok(!result.selectedTests.includes('tests/payrollItem.test.ts'), 'Consumer of UnrelatedPayrollItem must NOT be selected');
});

test('17. Real codebase dependency graph builds cleanly and indexes all smoke tests', () => {
  const realGraph = buildDependencyGraph();
  assert.ok(realGraph.allTestFiles.length >= 200, `Expected at least 200 tests, found ${realGraph.allTestFiles.length}`);

  for (const smoke of SMOKE_TESTS) {
    assert.ok(
      realGraph.allTestFiles.includes(smoke),
      `Real test files must include permanent smoke test ${smoke}`
    );
  }
});
