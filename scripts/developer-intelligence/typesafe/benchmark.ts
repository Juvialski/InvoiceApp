import { noul } from "@typesafe-ai/sdk";
import { invokeTypeSafe, type TypeSafeGateway } from "./client.ts";
import type { TypeSafeDiagnostic } from "./contracts.ts";
import type { ContextCandidate } from "./contextReranker.ts";

export interface TypesafeBenchmarkFixture {
  readonly id: string;
  readonly task: string;
  readonly candidates: readonly ContextCandidate[];
  readonly expectedRelevantIds: readonly string[];
  readonly mustKeepIds: readonly string[];
}

export interface TypesafeBenchmarkFixtureResult {
  readonly id: string;
  readonly baselineCandidateCount: number;
  readonly selectedCandidateCount: number;
  readonly expectedRelevantRetained: number;
  readonly expectedRelevantTotal: number;
  readonly mustKeepRetained: number;
  readonly mustKeepTotal: number;
  readonly contextCharsBefore: number;
  readonly contextCharsAfter: number;
  readonly estimatedTokensBefore: number;
  readonly estimatedTokensAfter: number;
  readonly contextReductionPercent: number;
  readonly fallback: boolean;
}

export interface TypesafeBenchmarkResult {
  readonly mode: "mock" | "live";
  readonly liveEvidence: boolean;
  readonly requestCount: number;
  readonly latencyMs: number;
  readonly fallbackCount: number;
  readonly summary: {
    readonly candidatesBefore: number;
    readonly candidatesAfter: number;
    readonly contextCharsBefore: number;
    readonly contextCharsAfter: number;
    readonly estimatedTokensBefore: number;
    readonly estimatedTokensAfter: number;
    readonly contextReductionPercent: number;
    readonly relevantRetention: number;
    readonly mustKeepRetention: number;
    readonly requestCount: number;
    readonly fallbackCount: number;
  };
  readonly fixtures: readonly TypesafeBenchmarkFixtureResult[];
  readonly diagnostic: TypeSafeDiagnostic;
}

function candidate(path: string, summary: string, mustKeep = false): ContextCandidate {
  return { id: path, path, summary, kind: "benchmark", ...(mustKeep ? { mustKeep: true } : {}) };
}

function makeFixture(id: string, task: string, candidates: readonly ContextCandidate[], expectedRelevantIds: readonly string[]): TypesafeBenchmarkFixture {
  return { id, task, candidates, expectedRelevantIds, mustKeepIds: candidates.filter((item) => item.mustKeep).map((item) => item.id) };
}

export function getTypesafeBenchmarkFixtures(): readonly TypesafeBenchmarkFixture[] {
  return [
    makeFixture("ui-worksheet", "Adjust worksheet spacing while preserving protected cells", [candidate("src/components/ui/WorksheetEditor.tsx", "worksheet editing and protected cells", true), candidate("tests/worksheetEditor.test.tsx", "worksheet keyboard and protection tests"), candidate("src/server.ts", "unrelated server startup"), candidate("docs/HYDROQUALISENSE_MESSAGING_DOCUMENTS_WAVE4D.md", "unrelated messaging contract")], ["src/components/ui/WorksheetEditor.tsx", "tests/worksheetEditor.test.tsx"]),
    makeFixture("project-hierarchy", "Move project cards before secondary portfolio analysis", [candidate("src/components/projects/ProjectsPage.tsx", "project card-first hierarchy", true), candidate("tests/projectsPage.test.tsx", "project presentation tests"), candidate("src/components/finance/CashBankingPage.tsx", "cash settlement surface"), candidate("supabase/migrations/20260920000000_finance.sql", "unrelated migration")], ["src/components/projects/ProjectsPage.tsx", "tests/projectsPage.test.tsx"]),
    makeFixture("migration-rls", "Add a guarded migration and preserve company isolation", [candidate("supabase/migrations/20260921000000_guard.sql", "forward migration and RLS", true), candidate("tests/migrations.test.ts", "migration replay tests"), candidate("src/components/ProjectsPage.tsx", "unrelated project UI"), candidate("docs/HYDROQUALISENSE_UI_UX_ROUND2_SIMPLIFICATION.md", "unrelated UX record")], ["supabase/migrations/20260921000000_guard.sql", "tests/migrations.test.ts"]),
    makeFixture("finance-domain", "Correct a finance summary without changing settlement authority", [candidate("src/lib/financialLifecycle.ts", "authoritative financial lifecycle", true), candidate("tests/financialLifecycle.test.ts", "financial lifecycle tests"), candidate("src/components/InventoryPage.tsx", "unrelated inventory UI"), candidate("scripts/qa/demoScenarios.ts", "unrelated demo scenarios")], ["src/lib/financialLifecycle.ts", "tests/financialLifecycle.test.ts"]),
    makeFixture("documentation-only", "Clarify developer execution guidance", [candidate("docs/AGENT_EXECUTION_EFFICIENCY.md", "developer execution policy", true), candidate("docs/README.md", "documentation map"), candidate("src/App.tsx", "unrelated application composition"), candidate("tests/appRouting.test.ts", "unrelated routing tests")], ["docs/AGENT_EXECUTION_EFFICIENCY.md", "docs/README.md"]),
    makeFixture("ci-lint", "Triage an ESLint failure", [candidate("eslint.config.mjs", "lint configuration", true), candidate("scripts/ci-failure-context.ts", "bounded failure excerpt helper"), candidate("scripts/qa/demoVisualQa.ts", "unrelated browser QA"), candidate("supabase/migrations/20260921000000_guard.sql", "unrelated migration")], ["eslint.config.mjs", "scripts/ci-failure-context.ts"]),
    makeFixture("ci-browser", "Triage a browser locator failure", [candidate("scripts/demo-visual-qa.ts", "browser QA runner", true), candidate("tests/demoVisualQa.test.ts", "browser QA assertions"), candidate("src/lib/persistence.ts", "unrelated persistence"), candidate("docs/HYDROQUALISENSE_CLIENT_SECURITY_ASSURANCE.md", "unrelated security evidence")], ["scripts/demo-visual-qa.ts", "tests/demoVisualQa.test.ts"]),
    makeFixture("supplier-invoice-ui", "Quiet ordinary provenance in supplier invoice review", [candidate("src/components/invoices/SupplierInvoiceWorksheet.tsx", "supplier invoice extracted worksheet", true), candidate("tests/supplierInvoiceWorksheetUx.test.tsx", "supplier invoice visual behavior tests"), candidate("src/components/EmailSmsWorkspace.tsx", "unrelated communications workspace"), candidate("supabase/migrations/20260919000000_supplier.sql", "unrelated supplier migration")], ["src/components/invoices/SupplierInvoiceWorksheet.tsx", "tests/supplierInvoiceWorksheetUx.test.tsx"]),
    makeFixture("procurement", "Keep RFQ draft lines editable while approval remains explicit", [candidate("src/components/procurement/RfqRegisterSection.tsx", "RFQ draft presentation", true), candidate("tests/rfqProcurementUx.test.tsx", "RFQ workflow tests"), candidate("src/components/PayrollPage.tsx", "unrelated payroll surface"), candidate("docs/HYDROQUALISENSE_SUPPLIER_INVOICE_MONETARY_MODEL.md", "unrelated monetary model")], ["src/components/procurement/RfqRegisterSection.tsx", "tests/rfqProcurementUx.test.tsx"]),
    makeFixture("repository-intelligence", "Improve bounded repository context filtering", [candidate("scripts/repository-intelligence/contextEngine.ts", "RI-3 bounded context engine", true), candidate("scripts/test-impact.ts", "deterministic affected-test selector"), candidate("src/App.tsx", "unrelated application composition"), candidate("supabase/migrations/20260921000000_guard.sql", "unrelated migration")], ["scripts/repository-intelligence/contextEngine.ts", "scripts/test-impact.ts"]),
  ];
}

function serializedCandidates(candidates: readonly ContextCandidate[]): string {
  return JSON.stringify(candidates.map(({ id, path, summary, kind, mustKeep }) => ({ id, path, summary, kind, mustKeep })));
}

function selectFromScores(fixture: TypesafeBenchmarkFixture, scores: ReadonlyMap<string, number>): readonly ContextCandidate[] {
  const mustKeep = fixture.candidates.filter((item) => item.mustKeep);
  const optional = fixture.candidates
    .filter((item) => !item.mustKeep && (scores.get(item.id) || 0) >= 0.5)
    .sort((left, right) => (scores.get(right.id) || 0) - (scores.get(left.id) || 0) || left.id.localeCompare(right.id))
    .slice(0, Math.max(0, 2 - mustKeep.length));
  const selected = new Set([...mustKeep, ...optional].map((item) => item.id));
  return fixture.candidates.filter((item) => selected.has(item.id));
}

function mockGateway(fixtures: readonly TypesafeBenchmarkFixture[]): TypeSafeGateway {
  const relevant = new Map(fixtures.flatMap((fixture) => fixture.expectedRelevantIds.map((id) => [id, true] as const)));
  return {
    systemOne: async (request) => {
      const state = request.state as { readonly fixtures?: readonly { readonly candidates?: readonly { readonly id: string; readonly questionId: string }[] }[] };
      const answers: Record<string, { readonly noul: number }> = {};
      for (const fixture of state.fixtures || []) {
        for (const item of fixture.candidates || []) answers[item.questionId] = { noul: relevant.has(item.id) ? 0.95 : 0.05 };
      }
      return { answers, model: "mock", usage: { input_tokens: 0, output_tokens: 0 } };
    },
  };
}

export async function runTypesafeBenchmark(options: {
  readonly mode: "mock" | "live";
  readonly gateway?: TypeSafeGateway;
  readonly env?: NodeJS.ProcessEnv;
  readonly timeoutMs?: number;
}): Promise<TypesafeBenchmarkResult> {
  const fixtures = getTypesafeBenchmarkFixtures();
  const questions: Record<string, unknown> = {};
  const stateFixtures = fixtures.map((fixture, fixtureIndex) => ({
    id: fixture.id,
    task: fixture.task,
    candidates: fixture.candidates.map((item, candidateIndex) => {
      const questionId = `f${fixtureIndex}c${candidateIndex}`;
      questions[questionId] = noul(
        `For the task in \`fixtures[${fixtureIndex}].task\`, should \`fixtures[${fixtureIndex}].candidates[${candidateIndex}]\` be retained because it is likely needed to understand, implement, validate, or safely review that task?`,
        {
          true: "Retain it: it directly contributes implementation context, validation/tests, a required contract or invariant, or a dependency needed for safe review.",
          false: "Omit it: it is unrelated or only loosely topical and can be removed without losing task-critical implementation, validation, contract, or review context.",
        },
      );
      return { questionId, id: item.id, path: item.path, summary: item.summary, ...(item.mustKeep ? { mustKeep: true } : {}) };
    }),
  }));
  const startedAt = Date.now();
  const response = await invokeTypeSafe<{ readonly answers?: Record<string, unknown> }>(
    { state: { fixtures: stateFixtures }, questions },
    {
      live: true,
      gateway: options.gateway || (options.mode === "mock" ? mockGateway(fixtures) : undefined),
      env: options.env,
      timeoutMs: options.timeoutMs,
      candidateCount: stateFixtures.reduce((count, fixture) => count + fixture.candidates.length, 0),
    },
  );
  const fixtureResults: TypesafeBenchmarkFixtureResult[] = [];
  let fallbackCount = 0;
  for (const [fixtureIndex, fixture] of fixtures.entries()) {
    const scores = new Map<string, number>();
    let fixtureFallback = !response.ok;
    for (const [candidateIndex, item] of fixture.candidates.entries()) {
      const answer = response.ok && response.value.answers && response.value.answers[`f${fixtureIndex}c${candidateIndex}`];
      const scoreValue = typeof answer === "object" && answer !== null && !Array.isArray(answer) && typeof (answer as { noul?: unknown }).noul === "number"
        ? (answer as { noul: number }).noul
        : Number.NaN;
      if (!Number.isFinite(scoreValue) || scoreValue < 0 || scoreValue > 1) fixtureFallback = true;
      else scores.set(item.id, scoreValue);
    }
    const selected = fixtureFallback ? fixture.candidates : selectFromScores(fixture, scores);
    if (fixtureFallback) fallbackCount += 1;
    const beforeChars = serializedCandidates(fixture.candidates).length;
    const afterChars = serializedCandidates(selected).length;
    const expectedRelevantRetained = fixture.expectedRelevantIds.filter((id) => selected.some((item) => item.id === id)).length;
    const mustKeepRetained = fixture.mustKeepIds.filter((id) => selected.some((item) => item.id === id)).length;
    fixtureResults.push({
      id: fixture.id,
      baselineCandidateCount: fixture.candidates.length,
      selectedCandidateCount: selected.length,
      expectedRelevantRetained,
      expectedRelevantTotal: fixture.expectedRelevantIds.length,
      mustKeepRetained,
      mustKeepTotal: fixture.mustKeepIds.length,
      contextCharsBefore: beforeChars,
      contextCharsAfter: afterChars,
      estimatedTokensBefore: Math.ceil(beforeChars / 4),
      estimatedTokensAfter: Math.ceil(afterChars / 4),
      contextReductionPercent: beforeChars > 0 ? Number(((1 - afterChars / beforeChars) * 100).toFixed(2)) : 0,
      fallback: fixtureFallback,
    });
  }
  const sum = <K extends keyof TypesafeBenchmarkFixtureResult>(key: K): number => fixtureResults.reduce((total, item) => total + Number(item[key]), 0);
  const contextCharsBefore = sum("contextCharsBefore");
  const contextCharsAfter = sum("contextCharsAfter");
  const expectedRelevantTotal = sum("expectedRelevantTotal");
  const expectedRelevantRetained = sum("expectedRelevantRetained");
  const mustKeepTotal = sum("mustKeepTotal");
  const mustKeepRetained = sum("mustKeepRetained");
  const diagnostic = response.ok
    ? { ...response.diagnostic, candidateCount: sum("baselineCandidateCount"), selectedCount: sum("selectedCandidateCount") }
    : { ...response.diagnostic, candidateCount: sum("baselineCandidateCount"), selectedCount: sum("selectedCandidateCount") };
  return {
    mode: options.mode,
    liveEvidence: options.mode === "live" && response.ok && fallbackCount === 0,
    requestCount: 1,
    latencyMs: Date.now() - startedAt,
    fallbackCount,
    summary: {
      candidatesBefore: sum("baselineCandidateCount"),
      candidatesAfter: sum("selectedCandidateCount"),
      contextCharsBefore,
      contextCharsAfter,
      estimatedTokensBefore: sum("estimatedTokensBefore"),
      estimatedTokensAfter: sum("estimatedTokensAfter"),
      contextReductionPercent: contextCharsBefore > 0 ? Number(((1 - contextCharsAfter / contextCharsBefore) * 100).toFixed(2)) : 0,
      relevantRetention: expectedRelevantTotal > 0 ? Number((expectedRelevantRetained / expectedRelevantTotal).toFixed(4)) : 1,
      mustKeepRetention: mustKeepTotal > 0 ? Number((mustKeepRetained / mustKeepTotal).toFixed(4)) : 1,
      requestCount: 1,
      fallbackCount,
    },
    fixtures: fixtureResults,
    diagnostic,
  };
}
