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
    'tests/purchaseOrdersCommittedCost.test.ts',
    'tests/purchaseOrdersDomain.test.ts',
    'tests/rfqFinancialInvariants.test.ts',
    'tests/subcontractClaimsDomain.test.ts',
    'tests/subcontractVariationsFinancialInvariants.test.ts',
    'tests/subcontractVariationsUx.test.tsx',
    'tests/subcontractsUx.test.tsx',
    'tests/projectCostingHardening.test.ts',
    'tests/assistantBackend.test.ts',
    'tests/workflowMap.test.ts',
    'tests/workflowMapConsistency.test.ts',
    'tests/workflowMapEvidence.test.ts',
    'tests/workflowMapContext.test.ts',
    'tests/p2WorkflowContextCoverage.test.ts',
    'tests/workflowCanvas.test.ts',
    'tests/agentEfficiency.test.ts',
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

test('workflow tooling changes retain graph, context, and canvas contract tests', () => {
  const workflowMappings = STATIC_CONTRACT_MAPPINGS['scripts/workflow-map/**'] || [];
  assert.ok(workflowMappings.includes('tests/workflowMap.test.ts'));
  assert.ok(workflowMappings.includes('tests/workflowMapContext.test.ts'));
  assert.ok(workflowMappings.includes('tests/p2WorkflowContextCoverage.test.ts'));
  assert.ok(workflowMappings.includes('tests/workflowCanvas.test.ts'));
  assert.ok((STATIC_CONTRACT_MAPPINGS['scripts/agent-context.ts'] || []).includes('tests/agentEfficiency.test.ts'));
});

test('workflow tooling changes select their contract tests without unrelated fallback', () => {
  const result = selectImpactedTests({
    changedFiles: ['scripts/workflow-map/graph.ts', 'scripts/agent-context.ts'],
    dependencyGraph: createIsolatedGraph(),
    skipDiskCheck: true,
  });
  assert.equal(result.isFallback, false);
  for (const testFile of [
    'tests/workflowMap.test.ts',
    'tests/workflowMapContext.test.ts',
    'tests/p2WorkflowContextCoverage.test.ts',
    'tests/workflowCanvas.test.ts',
    'tests/agentEfficiency.test.ts',
  ]) assert.ok(result.selectedTests.includes(testFile), `${testFile} must be selected for workflow tooling changes`);
  assert.ok(!result.selectedTests.includes('tests/assistantBackend.test.ts'));
});

test('shared project costing changes retain procurement and commercial safety coverage', () => {
  const result = selectImpactedTests({
    changedFiles: ['src/utils/projectCosting.ts'],
    dependencyGraph: createIsolatedGraph(),
    skipDiskCheck: true,
  });

  for (const testFile of [
    'tests/purchaseOrdersCommittedCost.test.ts',
    'tests/rfqFinancialInvariants.test.ts',
    'tests/subcontractClaimsDomain.test.ts',
    'tests/subcontractVariationsFinancialInvariants.test.ts',
  ]) {
    assert.ok(result.selectedTests.includes(testFile), `${testFile} must be selected for shared cost aggregation changes`);
  }
  assert.ok(!result.selectedTests.includes('tests/assistantBackend.test.ts'), 'unrelated assistant domain must remain isolated');
});

test('shared ProcurementPage changes retain commercial UI coverage', () => {
  const result = selectImpactedTests({
    changedFiles: ['src/components/procurement/ProcurementPage.tsx'],
    dependencyGraph: createIsolatedGraph(),
    skipDiskCheck: true,
  });

  assert.ok(result.selectedTests.includes('tests/subcontractsUx.test.tsx'));
  assert.ok(result.selectedTests.includes('tests/subcontractVariationsUx.test.tsx'));
  assert.ok(!result.selectedTests.includes('tests/assistantBackend.test.ts'), 'unrelated assistant domain must remain isolated');
});
