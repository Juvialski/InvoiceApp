export type HistoricalFixtureCategory =
  | "finance-database"
  | "ui-shared"
  | "provider-auth"
  | "security-rls"
  | "provider-migration"
  | "repository-intelligence"
  | "workbook-finance"
  | "shared-worksheet"
  | "browser-visual"
  | "inventory-equipment";

export interface HistoricalFixture {
  readonly id: string;
  readonly commitSha: string;
  readonly category: HistoricalFixtureCategory;
  readonly task: string;
  readonly actualChangedFileCount: number;
  readonly actualTestFileCount: number;
  readonly candidatePaths: readonly string[];
  readonly expectedRelevantPaths: readonly string[];
  readonly mustKeepPaths: readonly string[];
  readonly requiredEvidence: readonly string[];
  readonly knownCorrection: string;
}

export interface HistoricalReplayResult {
  readonly fixtureCount: number;
  readonly relevantRecall: number;
  readonly mustKeepRetention: number;
  readonly reductionPercent: number;
  readonly falseNegativeCount: number;
  readonly authorityBoundaryMissCount: number;
}

const NOISE = [
  "src/components/Dashboard.tsx",
  "tests/appRouting.test.ts",
  "docs/README.md",
  "scripts/ci-failure-context.ts",
] as const;

function fixture(input: Omit<HistoricalFixture, "candidatePaths"> & { readonly expectedRelevantPaths: readonly string[] }): HistoricalFixture {
  return { ...input, candidatePaths: [...input.expectedRelevantPaths, ...NOISE] };
}

export function getHistoricalFixtures(): readonly HistoricalFixture[] {
  return [
    fixture({
      id: "pr-158-settlement-truth",
      commitSha: "e4ee4eb",
      category: "finance-database",
      task: "Correct supplier payable settlement truth without double-counting financial history.",
      actualChangedFileCount: 59,
      actualTestFileCount: 6,
      expectedRelevantPaths: ["src/lib/supplierInvoiceSettlement.ts", "supabase/migrations/20260912082656_supplier_payables_settlement_consistency.sql", "supabase/tests/database/39_supplier_payables_settlement_consistency.test.sql", "tests/supplierPayablesSettlementConsistency.test.ts"],
      mustKeepPaths: ["src/lib/supplierInvoiceSettlement.ts", "supabase/migrations/20260912082656_supplier_payables_settlement_consistency.sql"],
      requiredEvidence: ["implementation", "tests", "database", "documentation"],
      knownCorrection: "Settlement reversal, linked Expense authority, and protected history required explicit correction paths.",
    }),
    fixture({
      id: "pr-161-ui-round-two",
      commitSha: "7289b63",
      category: "ui-shared",
      task: "Simplify authenticated workspaces while preserving routes, permissions, and source ownership.",
      actualChangedFileCount: 43,
      actualTestFileCount: 11,
      expectedRelevantPaths: ["src/components/ui/OperationsUI.tsx", "src/components/projects/ProjectsPage.tsx", "scripts/qa/localQaFunctionalSweep.ts", "tests/uiUxResponsive.test.ts"],
      mustKeepPaths: ["src/components/ui/OperationsUI.tsx", "scripts/qa/localQaFunctionalSweep.ts"],
      requiredEvidence: ["implementation", "tests", "browser", "documentation"],
      knownCorrection: "Workflow-first hierarchy and responsive evidence were required; UX simplification could not weaken authorization.",
    }),
    fixture({
      id: "pr-167-email-gmail-oauth",
      commitSha: "7b7715c",
      category: "provider-auth",
      task: "Harden Email/SMS reliability, Gmail authorization recovery, and public OAuth policy surfaces.",
      actualChangedFileCount: 41,
      actualTestFileCount: 9,
      expectedRelevantPaths: ["server.ts", "src/server/gmail/gmailAccess.ts", "supabase/migrations/20260914044619_gmail_provider_credentials.sql", "tests/gmailAuthorization.test.ts"],
      mustKeepPaths: ["src/server/gmail/gmailAccess.ts", "supabase/migrations/20260914044619_gmail_provider_credentials.sql"],
      requiredEvidence: ["implementation", "tests", "database", "provider", "documentation"],
      knownCorrection: "Server-held credentials, one safe refresh retry, and truthful provider-unverified states were protected boundaries.",
    }),
    fixture({
      id: "pr-171-security-custom-roles",
      commitSha: "ddbd9d6",
      category: "security-rls",
      task: "Add company-scoped custom roles while preserving permission and RLS boundaries.",
      actualChangedFileCount: 22,
      actualTestFileCount: 3,
      expectedRelevantPaths: ["src/lib/companyAccess.ts", "src/components/access/CompanyRoleManagement.tsx", "supabase/migrations/20260915024105_client_security_custom_roles.sql", "tests/clientSecurityCustomRoles.test.ts"],
      mustKeepPaths: ["src/lib/companyAccess.ts", "supabase/migrations/20260915024105_client_security_custom_roles.sql"],
      requiredEvidence: ["implementation", "tests", "database", "documentation"],
      knownCorrection: "Company isolation, permission resolution, migration invariants, and security evidence were non-negotiable.",
    }),
    fixture({
      id: "pr-173-google-brevo",
      commitSha: "573e154",
      category: "provider-migration",
      task: "Replace Gmail mailbox/API capability with Google identity-only sign-in and Brevo delivery.",
      actualChangedFileCount: 147,
      actualTestFileCount: 53,
      expectedRelevantPaths: ["src/server/messaging/brevoEmailProvider.ts", "supabase/migrations/20260915135236_brevo_email_delivery.sql", "server.ts", "tests/brevoEmailDelivery.test.ts"],
      mustKeepPaths: ["src/server/messaging/brevoEmailProvider.ts", "supabase/migrations/20260915135236_brevo_email_delivery.sql"],
      requiredEvidence: ["implementation", "tests", "database", "provider", "documentation"],
      knownCorrection: "Historical Gmail records remained intact while active outbound capability moved to Brevo with human confirmation.",
    }),
    fixture({
      id: "pr-199-ri-context",
      commitSha: "c98c50c",
      category: "repository-intelligence",
      task: "Add provenance-aware graph and bounded Repository Intelligence context behind existing interfaces.",
      actualChangedFileCount: 37,
      actualTestFileCount: 10,
      expectedRelevantPaths: ["scripts/repository-intelligence/contextEngine.ts", "scripts/repository-intelligence/graph.ts", "scripts/agent-context.ts", "tests/repositoryIntelligenceContext.test.ts"],
      mustKeepPaths: ["scripts/repository-intelligence/contextEngine.ts", "scripts/repository-intelligence/graph.ts"],
      requiredEvidence: ["implementation", "tests", "documentation"],
      knownCorrection: "Curated Workflow Map authority, stale-index fallback, and bounded packets had to remain explicit.",
    }),
    fixture({
      id: "pr-202-expenses-workbook",
      commitSha: "a6425bd",
      category: "workbook-finance",
      task: "Add proposal-only Expenses and supplier-payables workbook review without replacing authority.",
      actualChangedFileCount: 17,
      actualTestFileCount: 5,
      expectedRelevantPaths: ["src/lib/expensesWorkbook.ts", "src/components/expenses/ExpensesWorkbookPanel.tsx", "tests/expensesWorkbook.test.ts", "tests/expensesWorkbookUx.test.tsx"],
      mustKeepPaths: ["src/lib/expensesWorkbook.ts", "tests/expensesWorkbook.test.ts"],
      requiredEvidence: ["implementation", "tests", "browser", "documentation"],
      knownCorrection: "Import remained proposal-only; Apply reused authoritative callbacks and stale-workbook protection.",
    }),
    fixture({
      id: "pr-204-worksheet-foundation",
      commitSha: "f106510",
      category: "shared-worksheet",
      task: "Create the shared worksheet editor with parent-owned persistence and protected-cell semantics.",
      actualChangedFileCount: 7,
      actualTestFileCount: 1,
      expectedRelevantPaths: ["src/components/ui/WorksheetEditor.tsx", "src/components/ui/worksheetEditorModel.ts", "tests/worksheetEditor.test.tsx"],
      mustKeepPaths: ["src/components/ui/WorksheetEditor.tsx", "src/components/ui/worksheetEditorModel.ts"],
      requiredEvidence: ["implementation", "tests"],
      knownCorrection: "The child editor could not take ownership of domain state, permissions, save semantics, or consequential actions.",
    }),
    fixture({
      id: "pr-216-visual-consistency",
      commitSha: "9290f0c",
      category: "browser-visual",
      task: "Close shared visual consistency and professional-finish issues with inspected screenshot evidence.",
      actualChangedFileCount: 20,
      actualTestFileCount: 2,
      expectedRelevantPaths: ["src/components/ui/OperationsUI.tsx", "src/components/documentPreviewPresentation.ts", "scripts/qa/demoScenarios.ts", "tests/uxW45eVisualConsistency.test.ts"],
      mustKeepPaths: ["src/components/ui/OperationsUI.tsx", "scripts/qa/demoScenarios.ts"],
      requiredEvidence: ["implementation", "tests", "browser", "documentation"],
      knownCorrection: "Automated no-overflow was not visual-quality proof; the lead inspected promoted screenshot evidence and recorded partial gaps.",
    }),
    fixture({
      id: "pr-219-inventory-equipment",
      commitSha: "1707384",
      category: "inventory-equipment",
      task: "Add Warehouse Item and canonical Equipment master worksheets without exposing movement or lifecycle authority.",
      actualChangedFileCount: 11,
      actualTestFileCount: 1,
      expectedRelevantPaths: ["src/components/inventory/WarehouseItemWorksheet.tsx", "src/components/equipment/CanonicalEquipmentWorksheet.tsx", "src/components/ui/worksheetDraftState.ts", "tests/warehouseEquipmentWorksheet.test.tsx"],
      mustKeepPaths: ["src/components/inventory/WarehouseItemWorksheet.tsx", "src/components/equipment/CanonicalEquipmentWorksheet.tsx"],
      requiredEvidence: ["implementation", "tests", "browser", "documentation"],
      knownCorrection: "Stock movement, assignment, lifecycle, history, and protected identity stayed outside ordinary worksheet cells.",
    }),
  ];
}

export function evaluateHistoricalFixtures(
  fixtures: readonly HistoricalFixture[],
  select: (fixture: HistoricalFixture) => readonly string[],
): HistoricalReplayResult {
  let expectedRelevant = 0;
  let retainedRelevant = 0;
  let totalMustKeep = 0;
  let retainedMustKeep = 0;
  let totalCandidates = 0;
  let totalSelected = 0;
  let falseNegativeCount = 0;
  for (const fixture of fixtures) {
    const allowed = new Set(fixture.candidatePaths);
    const selected = new Set(select(fixture).filter((path) => allowed.has(path)));
    expectedRelevant += fixture.expectedRelevantPaths.length;
    retainedRelevant += fixture.expectedRelevantPaths.filter((path) => selected.has(path)).length;
    totalMustKeep += fixture.mustKeepPaths.length;
    retainedMustKeep += fixture.mustKeepPaths.filter((path) => selected.has(path)).length;
    totalCandidates += fixture.candidatePaths.length;
    totalSelected += selected.size;
    falseNegativeCount += fixture.expectedRelevantPaths.filter((path) => !selected.has(path)).length;
  }
  return {
    fixtureCount: fixtures.length,
    relevantRecall: expectedRelevant > 0 ? retainedRelevant / expectedRelevant : 1,
    mustKeepRetention: totalMustKeep > 0 ? retainedMustKeep / totalMustKeep : 1,
    reductionPercent: totalCandidates > 0 ? ((totalCandidates - totalSelected) / totalCandidates) * 100 : 0,
    falseNegativeCount,
    authorityBoundaryMissCount: fixtures.reduce((count, fixture) => count + fixture.mustKeepPaths.filter((path) => !new Set(select(fixture)).has(path)).length, 0),
  };
}
