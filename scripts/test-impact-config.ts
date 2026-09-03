/**
 * Test Impact Selector Configuration for Engoryx
 * Defines smoke suite, static contract mappings, domain clusters,
 * fallback rules, and database-affected triggers.
 */

export const SMOKE_TESTS = [
  'tests/appRouting.test.ts',
  'tests/auth.test.ts',
  'tests/singleCompanyDeployment.test.ts',
  'tests/companyAccess.test.ts',
  'tests/crudRbacAudit.test.ts',
  'tests/projectFinancialSummary.test.ts',
  'tests/projectLifecycle.test.ts',
  'tests/workspaceLifecycle.test.ts'
] as const;

export type SmokeTest = (typeof SMOKE_TESTS)[number];

export const STATIC_CONTRACT_MAPPINGS: Record<string, string[]> = {
  'supabase/migrations/**': [
    'tests/migrationInvariants.test.ts',
    'tests/companyTenancyMigration.test.ts',
    'tests/cashBankingMigration.test.ts',
    'tests/coreHardeningWave2B2.test.ts',
    'tests/coreHardeningWave2C.test.ts',
    'tests/dailySiteLogsMigration.test.ts',
    'tests/engineeringDocumentsMigration.test.ts',
    'tests/payrollWorkforceMigration.test.ts',
    'tests/databaseBackupMigration.test.ts',
    'tests/subcontractClaimsReviewHardening.test.ts',
    'tests/subcontractClaimProjectPreflightRegression.test.ts'
  ],
  'src/App.tsx': [
    'tests/appRouting.test.ts',
    'tests/uiFoundation.test.ts'
  ],
  'src/config/branding.ts': [
    'tests/brandConfig.test.ts'
  ],
  'src/workflow-map/**': [
    'tests/workflowMap.test.ts',
    'tests/workflowMapConsistency.test.ts',
    'tests/workflowMapEvidence.test.ts',
    'tests/workflowMapContext.test.ts'
  ],
  'docs/architecture/workflow-map.json': [
    'tests/workflowMap.test.ts',
    'tests/workflowMapConsistency.test.ts',
    'tests/workflowMapEvidence.test.ts',
    'tests/workflowMapContext.test.ts'
  ]
};

export const DOMAIN_TEST_PATTERNS: Record<string, string[]> = {
  subcontracts: [
    'tests/subcontracts*.test.ts',
    'tests/subcontract*.test.ts',
    'tests/subcontract*.test.tsx'
  ],
  procurement: [
    'tests/purchaseOrder*.test.ts',
    'tests/purchaseOrder*.test.tsx',
    'tests/rfq*.test.ts',
    'tests/rfq*.test.tsx'
  ],
  projectCosting: [
    'tests/project*.test.ts',
    'tests/engineeringProjectCosting.test.ts'
  ],
  payroll: [
    'tests/payroll*.test.ts',
    'tests/attendanceImport.test.ts'
  ],
  assistant: [
    'tests/assistant*.test.ts'
  ],
  storage: [
    'tests/storage*.test.ts',
    'tests/databaseBackup*.test.ts',
    'tests/databaseRestore*.test.ts',
    'tests/databaseRetention*.test.ts',
    'tests/documentStorage*.test.ts'
  ],
  emailIntake: [
    'tests/emailIntake*.test.ts'
  ],
  engineering: [
    'tests/engineering*.test.ts',
    'tests/dailySiteLogs*.test.ts'
  ]
};

export const FALLBACK_FILE_PATTERNS: readonly string[] = [
  'tsconfig.json',
  'scripts/test-impact.ts',
  'scripts/test-impact-config.ts',
  '.github/workflows/full-regression.yml'
];

export const FALLBACK_RATIO_THRESHOLD = 0.60;

export const DATABASE_AFFECTED_PATTERNS: readonly string[] = [
  'supabase/**',
  'tests/migration*',
  'scripts/test-migration*',
  'scripts/test-migrations.ts'
];

/**
 * Normalizes file paths to use forward slashes and strips leading './'
 */
export function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, '/').replace(/^\.\//, '');
}

/**
 * Converts glob patterns containing '**' and '*' into equivalent regular expressions.
 */
export function globToRegExp(pattern: string): RegExp {
  const normalized = normalizePath(pattern);
  let regexStr = '^';
  let i = 0;
  while (i < normalized.length) {
    const char = normalized[i];
    if (char === '*' && normalized[i + 1] === '*') {
      if (normalized[i + 2] === '/') {
        regexStr += '(?:.*/)?';
        i += 3;
      } else {
        regexStr += '.*';
        i += 2;
      }
    } else if (char === '*') {
      regexStr += '[^/]*';
      i += 1;
    } else if (char === '?') {
      regexStr += '[^/]';
      i += 1;
    } else if ('[].+^${}()|\\'.indexOf(char) !== -1) {
      regexStr += '\\' + char;
      i += 1;
    } else {
      regexStr += char;
      i += 1;
    }
  }
  regexStr += '$';
  return new RegExp(regexStr);
}

/**
 * Tests whether a relative file path matches a glob pattern.
 */
export function matchesPattern(filePath: string, pattern: string): boolean {
  const normalized = normalizePath(filePath);
  return globToRegExp(pattern).test(normalized);
}

/**
 * Checks if a file modification affects the database/migrations layer.
 */
export function isDatabaseAffectedFile(filePath: string): boolean {
  const normalized = normalizePath(filePath);
  return DATABASE_AFFECTED_PATTERNS.some(pattern => matchesPattern(normalized, pattern));
}

/**
 * Checks if a file modification triggers an automatic fallback to full test suite.
 */
export function isFallbackPatternFile(filePath: string): boolean {
  const normalized = normalizePath(filePath);
  return FALLBACK_FILE_PATTERNS.some(pattern => matchesPattern(normalized, pattern));
}
