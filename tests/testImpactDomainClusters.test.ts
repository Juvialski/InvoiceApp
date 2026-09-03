import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SMOKE_TESTS,
  STATIC_CONTRACT_MAPPINGS,
} from '../scripts/test-impact-config.ts';
import {
  selectImpactedTests,
  type DependencyGraph,
} from '../scripts/test-impact.ts';

function createIsolatedGraph(): DependencyGraph {
  const dummyTests = Array.from({ length: 200 }, (_, index) => `tests/domainDummy${index + 1}.test.ts`);
  const allTestFiles = [
    ...SMOKE_TESTS,
    'tests/subcontractClaimsDomain.test.ts',
    'tests/subcontractsUx.test.tsx',
    'tests/assistantBackend.test.ts',
    ...dummyTests,
  ];

  return {
    forwardGraph: new Map(),
    reverseGraph: new Map(),
    importDetails: new Map(),
    fileDeclarations: new Map(),
    allTestFiles,
  };
}

test('domain cluster configuration is materialized into active source mappings', () => {
  const subcontractMappings = STATIC_CONTRACT_MAPPINGS['src/lib/subcontract*.ts'] || [];
  assert.ok(
    subcontractMappings.includes('tests/subcontractClaimsDomain.test.ts'),
    'subcontract domain mapping must include non-import-based claim coverage',
  );
  assert.ok(
    subcontractMappings.includes('tests/subcontractsUx.test.tsx'),
    'subcontract domain mapping must include UX integration coverage',
  );
});

test('subcontract source changes select same-domain safety tests without crossing into assistant tests', () => {
  const result = selectImpactedTests({
    changedFiles: ['src/lib/subcontracts.ts'],
    dependencyGraph: createIsolatedGraph(),
    skipDiskCheck: true,
  });

  assert.ok(
    result.selectedTests.includes('tests/subcontractClaimsDomain.test.ts'),
    'same-domain test must be selected even without an import-graph edge',
  );
  assert.ok(
    result.selectedTests.includes('tests/subcontractsUx.test.tsx'),
    'same-domain UX test must be selected even without an import-graph edge',
  );
  assert.ok(
    !result.selectedTests.includes('tests/assistantBackend.test.ts'),
    'unrelated assistant domain must remain isolated',
  );
});
