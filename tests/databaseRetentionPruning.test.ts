import test from "node:test";
import assert from "node:assert/strict";
import {
  RetentionService,
  RetentionServiceError,
  DEFAULT_PRUNE_LIMIT,
  MAX_PRUNE_LIMIT,
  MIN_PRUNE_LIMIT,
} from "../src/server/database/retentionService.ts";
import type { SupabaseClient } from "@supabase/supabase-js";

interface MockTableState {
  assistant_action_events: Array<Record<string, any>>;
  payroll_import_batches: Array<Record<string, any>>;
  payroll_import_rows: Array<Record<string, any>>;
  payroll_runs: Array<Record<string, any>>;
  source_documents: Array<Record<string, any>>;
  invoices: Array<Record<string, any>>;
  expenses: Array<Record<string, any>>;
  financial_import_batches: Array<Record<string, any>>;
  company_audit_events: Array<Record<string, any>>;
}

function createMockSupabase(initialState?: Partial<MockTableState>): { client: SupabaseClient; state: MockTableState } {
  const state: MockTableState = {
    assistant_action_events: [],
    payroll_import_batches: [],
    payroll_import_rows: [],
    payroll_runs: [],
    source_documents: [],
    invoices: [],
    expenses: [],
    financial_import_batches: [],
    company_audit_events: [],
    ...initialState,
  };

  function filterRows(rows: Array<Record<string, any>>, filters: Array<(row: Record<string, any>) => boolean>) {
    return rows.filter((r) => filters.every((f) => f(r)));
  }

  const createQueryBuilder = (tableName: keyof MockTableState) => {
    const filters: Array<(row: Record<string, any>) => boolean> = [];
    let limitCount: number | null = null;
    let selectedCols: string[] | null = null;

    const builder: any = {
      select: (cols = "*") => {
        selectedCols = cols === "*" ? null : cols.split(",").map((c: string) => c.trim());
        return builder;
      },
      eq: (col: string, val: any) => {
        filters.push((row) => row[col] === val);
        return builder;
      },
      neq: (col: string, val: any) => {
        filters.push((row) => row[col] !== val);
        return builder;
      },
      in: (col: string, vals: any[]) => {
        filters.push((row) => vals.includes(row[col]));
        return builder;
      },
      lt: (col: string, val: any) => {
        filters.push((row) => {
          if (!row[col]) return false;
          return new Date(row[col]).getTime() < new Date(val).getTime();
        });
        return builder;
      },
      gt: (col: string, val: any) => {
        filters.push((row) => {
          if (!row[col]) return false;
          return new Date(row[col]).getTime() > new Date(val).getTime();
        });
        return builder;
      },
      or: (clause: string) => {
        // e.g. "committed_work_entry_id.not.is.null,committed_payroll_entry_id.not.is.null"
        const parts = clause.split(",");
        filters.push((row) => {
          return parts.some((p) => {
            if (p.includes(".not.is.null")) {
              const col = p.replace(".not.is.null", "").trim();
              return row[col] !== null && row[col] !== undefined;
            }
            return true;
          });
        });
        return builder;
      },
      limit: (n: number) => {
        limitCount = n;
        return builder;
      },
      maybeSingle: async () => {
        const rows = filterRows(state[tableName], filters);
        const item = rows[0] || null;
        return { data: item ? { ...item } : null, error: null };
      },
      single: async () => {
        const rows = filterRows(state[tableName], filters);
        if (rows.length === 0) return { data: null, error: { message: "Row not found" } };
        return { data: { ...rows[0] }, error: null };
      },
      then: (resolve: any, reject: any) => {
        let rows = filterRows(state[tableName], filters);
        if (limitCount !== null) {
          rows = rows.slice(0, limitCount);
        }
        return Promise.resolve({ data: rows.map((r) => ({ ...r })), error: null }).then(resolve, reject);
      },
      delete: () => {
        return {
          eq: (col: string, val: any) => {
            filters.push((row) => row[col] === val);
            return {
              in: async (inCol: string, inVals: any[]) => {
                filters.push((row) => inVals.includes(row[inCol]));
                const remaining = state[tableName].filter((r) => !filters.every((f) => f(r)));
                const deletedCount = state[tableName].length - remaining.length;
                state[tableName] = remaining;
                return { data: null, error: null, count: deletedCount };
              },
            };
          },
        };
      },
      insert: async (data: any) => {
        const items = Array.isArray(data) ? data : [data];
        for (const item of items) {
          state[tableName].push({ id: item.id || `gen-${Math.random()}`, ...item });
        }
        return { data: items, error: null };
      },
    };

    return builder;
  };

  const client: any = {
    from: (table: keyof MockTableState) => createQueryBuilder(table),
  };

  return { client, state };
}

const COMPANY_A = "11111111-1111-4111-8111-111111111111";
const COMPANY_B = "22222222-2222-4222-8222-222222222222";

test("Database Retention: Rejects invalid or missing company ID", async () => {
  const { client } = createMockSupabase();
  const service = new RetentionService(client);

  await assert.rejects(
    () => service.pruneRetention({ companyId: "" }),
    (err: any) => {
      assert.ok(err instanceof RetentionServiceError);
      assert.equal(err.code, "INVALID_COMPANY_ID");
      return true;
    },
  );

  await assert.rejects(
    () => service.pruneRetention({ companyId: "invalid-uuid" }),
    (err: any) => {
      assert.ok(err instanceof RetentionServiceError);
      assert.equal(err.code, "INVALID_COMPANY_ID");
      return true;
    },
  );
});

test("Database Retention: Dry-run mode by default evaluates candidates without deleting rows", async () => {
  const now = new Date("2026-09-01T12:00:00Z");
  const fortyDaysAgo = new Date(now.getTime() - 40 * 24 * 60 * 60 * 1000).toISOString();
  const twentyDaysAgo = new Date(now.getTime() - 20 * 24 * 60 * 60 * 1000).toISOString();

  const { client, state } = createMockSupabase({
    assistant_action_events: [
      { id: "act-expired", company_id: COMPANY_A, status: "EXPIRED", created_at: twentyDaysAgo },
      { id: "act-cancelled", company_id: COMPANY_A, status: "CANCELLED", created_at: twentyDaysAgo },
      { id: "act-old-prepared", company_id: COMPANY_A, status: "PREPARED", expires_at: fortyDaysAgo, created_at: fortyDaysAgo },
      { id: "act-live-confirmed", company_id: COMPANY_A, status: "CONFIRMED", created_at: fortyDaysAgo },
    ],
    payroll_import_batches: [
      { id: "batch-failed", company_id: COMPANY_A, status: "FAILED", created_at: fortyDaysAgo },
      { id: "batch-voided", company_id: COMPANY_A, status: "VOIDED", created_at: fortyDaysAgo },
      { id: "batch-committed", company_id: COMPANY_A, status: "COMMITTED", created_at: fortyDaysAgo },
    ],
    source_documents: [
      { id: "doc-temp", company_id: COMPANY_A, source_type: "TEMP", created_at: twentyDaysAgo },
      { id: "doc-old-unlinked", company_id: COMPANY_A, source_type: "UPLOAD", created_at: twentyDaysAgo },
    ],
  });

  const service = new RetentionService(client);
  const result = await service.pruneRetention({ companyId: COMPANY_A, now });

  assert.equal(result.dryRun, true);
  assert.equal(result.candidatesCount, 7); // 3 actions + 2 batches + 2 docs
  assert.equal(result.prunedCount, 0);
  assert.equal(result.categories.assistantActions.candidatesCount, 3);
  assert.equal(result.categories.assistantActions.prunedCount, 0);
  assert.equal(result.categories.payrollBatches.candidatesCount, 2);
  assert.equal(result.categories.payrollBatches.prunedCount, 0);
  assert.equal(result.categories.sourceDocuments.candidatesCount, 2);
  assert.equal(result.categories.sourceDocuments.prunedCount, 0);
  assert.equal(result.errors.length, 0);

  // Assert nothing was actually deleted in dry run
  assert.equal(state.assistant_action_events.length, 4);
  assert.equal(state.payroll_import_batches.length, 3);
  assert.equal(state.source_documents.length, 2);
  assert.equal(state.company_audit_events.length, 0);
});

test("Database Retention: Execute mode prunes eligible records and records audit event", async () => {
  const now = new Date("2026-09-01T12:00:00Z");
  const fortyDaysAgo = new Date(now.getTime() - 40 * 24 * 60 * 60 * 1000).toISOString();
  const twentyDaysAgo = new Date(now.getTime() - 20 * 24 * 60 * 60 * 1000).toISOString();

  const { client, state } = createMockSupabase({
    assistant_action_events: [
      { id: "act-expired", company_id: COMPANY_A, status: "EXPIRED", created_at: twentyDaysAgo },
      { id: "act-live-executed", company_id: COMPANY_A, status: "EXECUTED", created_at: fortyDaysAgo },
    ],
    payroll_import_batches: [
      { id: "batch-failed", company_id: COMPANY_A, status: "FAILED", created_at: fortyDaysAgo },
    ],
    payroll_import_rows: [
      { id: "row-1", company_id: COMPANY_A, batch_id: "batch-failed" },
    ],
    source_documents: [
      { id: "doc-temp", company_id: COMPANY_A, source_type: "TEMP", created_at: twentyDaysAgo },
    ],
  });

  const service = new RetentionService(client);
  const result = await service.pruneRetention({ companyId: COMPANY_A, dryRun: false, now });

  assert.equal(result.dryRun, false);
  assert.equal(result.candidatesCount, 3);
  assert.equal(result.prunedCount, 3);
  assert.equal(result.categories.assistantActions.prunedCount, 1);
  assert.equal(result.categories.payrollBatches.prunedCount, 1);
  assert.equal(result.categories.sourceDocuments.prunedCount, 1);

  // Assert execution proof and audit trail
  assert.ok(result.executionProof);
  assert.equal(result.executionProof.prunedTotal, 3);
  assert.equal(result.executionProof.auditEventLogged, true);
  assert.equal(state.company_audit_events.length, 1);
  assert.equal(state.company_audit_events[0].company_id, COMPANY_A);
  assert.equal(state.company_audit_events[0].event_type, "COMPANY_UPDATED");

  // Verify DB state after pruning
  assert.equal(state.assistant_action_events.length, 1);
  assert.equal(state.assistant_action_events[0].id, "act-live-executed");
  assert.equal(state.payroll_import_batches.length, 0);
  assert.equal(state.payroll_import_rows.length, 0);
  assert.equal(state.source_documents.length, 0);
});

test("Database Retention: Multi-company isolation strictly protects other companies' data", async () => {
  const now = new Date("2026-09-01T12:00:00Z");
  const fortyDaysAgo = new Date(now.getTime() - 40 * 24 * 60 * 60 * 1000).toISOString();

  const { client, state } = createMockSupabase({
    assistant_action_events: [
      { id: "act-comp-a", company_id: COMPANY_A, status: "EXPIRED", created_at: fortyDaysAgo },
      { id: "act-comp-b", company_id: COMPANY_B, status: "EXPIRED", created_at: fortyDaysAgo },
    ],
    payroll_import_batches: [
      { id: "batch-comp-a", company_id: COMPANY_A, status: "FAILED", created_at: fortyDaysAgo },
      { id: "batch-comp-b", company_id: COMPANY_B, status: "FAILED", created_at: fortyDaysAgo },
    ],
    source_documents: [
      { id: "doc-comp-a", company_id: COMPANY_A, source_type: "TEMP", created_at: fortyDaysAgo },
      { id: "doc-comp-b", company_id: COMPANY_B, source_type: "TEMP", created_at: fortyDaysAgo },
    ],
  });

  const service = new RetentionService(client);
  const result = await service.pruneRetention({ companyId: COMPANY_A, dryRun: false, now });

  assert.equal(result.candidatesCount, 3);
  assert.equal(result.prunedCount, 3);
  assert.deepEqual(result.candidateIds.sort(), ["act-comp-a", "batch-comp-a", "doc-comp-a"].sort());

  // Company B records must remain untouched
  assert.equal(state.assistant_action_events.length, 1);
  assert.equal(state.assistant_action_events[0].id, "act-comp-b");
  assert.equal(state.payroll_import_batches.length, 1);
  assert.equal(state.payroll_import_batches[0].id, "batch-comp-b");
  assert.equal(state.source_documents.length, 1);
  assert.equal(state.source_documents[0].id, "doc-comp-b");
});

test("Database Retention: Protects active and recent prepared assistant actions", async () => {
  const now = new Date("2026-09-01T12:00:00Z");
  const tenDaysAgo = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString();
  const future = new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000).toISOString();

  const { client } = createMockSupabase({
    assistant_action_events: [
      { id: "act-active-prep", company_id: COMPANY_A, status: "PREPARED", expires_at: future, created_at: tenDaysAgo },
      { id: "act-recent-prep", company_id: COMPANY_A, status: "PREPARED", expires_at: tenDaysAgo, created_at: tenDaysAgo },
      { id: "act-confirmed", company_id: COMPANY_A, status: "CONFIRMED", expires_at: tenDaysAgo, created_at: tenDaysAgo },
      { id: "act-executed", company_id: COMPANY_A, status: "EXECUTED", expires_at: tenDaysAgo, created_at: tenDaysAgo },
    ],
  });

  const service = new RetentionService(client);
  const candidates = await service.discoverCandidateAssistantActions(COMPANY_A, 50, now);
  assert.equal(candidates.length, 0, "No active, recent, confirmed, or executed actions should be prunable");
});

test("Database Retention: Protects payroll batches referenced by payroll_runs, rows, or dupes", async () => {
  const now = new Date("2026-09-01T12:00:00Z");
  const fiftyDaysAgo = new Date(now.getTime() - 50 * 24 * 60 * 60 * 1000).toISOString();

  const { client } = createMockSupabase({
    payroll_import_batches: [
      { id: "batch-linked-to-run", company_id: COMPANY_A, status: "FAILED", created_at: fiftyDaysAgo },
      { id: "batch-with-committed-rows", company_id: COMPANY_A, status: "VOIDED", created_at: fiftyDaysAgo },
      { id: "batch-referenced-as-duplicate", company_id: COMPANY_A, status: "FAILED", created_at: fiftyDaysAgo },
      { id: "batch-clean-failed", company_id: COMPANY_A, status: "FAILED", created_at: fiftyDaysAgo },
      { id: "other-batch", company_id: COMPANY_A, status: "COMMITTED", duplicate_of_batch_id: "batch-referenced-as-duplicate", created_at: fiftyDaysAgo },
    ],
    payroll_runs: [
      { id: "run-1", company_id: COMPANY_A, import_batch_id: "batch-linked-to-run", status: "COMMITTED" },
    ],
    payroll_import_rows: [
      { id: "row-1", company_id: COMPANY_A, batch_id: "batch-with-committed-rows", committed_work_entry_id: "work-1" },
    ],
  });

  const service = new RetentionService(client);

  const isEligibleRun = await service.verifyPayrollBatchEligible(COMPANY_A, "batch-linked-to-run");
  assert.equal(isEligibleRun, false, "Batch referenced by payroll_run must not be eligible");

  const isEligibleRows = await service.verifyPayrollBatchEligible(COMPANY_A, "batch-with-committed-rows");
  assert.equal(isEligibleRows, false, "Batch with committed import rows must not be eligible");

  const isEligibleDupe = await service.verifyPayrollBatchEligible(COMPANY_A, "batch-referenced-as-duplicate");
  assert.equal(isEligibleDupe, false, "Batch referenced as duplicate by another batch must not be eligible");

  const isCleanEligible = await service.verifyPayrollBatchEligible(COMPANY_A, "batch-clean-failed");
  assert.equal(isCleanEligible, true, "Clean unreferenced failed batch older than 30 days must be eligible");

  const candidates = await service.discoverCandidatePayrollBatches(COMPANY_A, 50, now);
  assert.deepEqual(candidates, ["batch-clean-failed"]);
});

test("Database Retention: Protects committed and recent payroll import batches", async () => {
  const now = new Date("2026-09-01T12:00:00Z");
  const tenDaysAgo = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString();
  const fiftyDaysAgo = new Date(now.getTime() - 50 * 24 * 60 * 60 * 1000).toISOString();

  const { client } = createMockSupabase({
    payroll_import_batches: [
      { id: "batch-committed", company_id: COMPANY_A, status: "COMMITTED", created_at: fiftyDaysAgo },
      { id: "batch-recent-failed", company_id: COMPANY_A, status: "FAILED", created_at: tenDaysAgo },
    ],
  });

  const service = new RetentionService(client);
  const candidates = await service.discoverCandidatePayrollBatches(COMPANY_A, 50, now);
  assert.equal(candidates.length, 0, "Committed batches and batches within 30-day retention must not be discovered");
});

test("Database Retention: Protects source documents referenced by invoices, expenses, or financial import batches", async () => {
  const now = new Date("2026-09-01T12:00:00Z");
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const { client } = createMockSupabase({
    source_documents: [
      { id: "doc-invoice", company_id: COMPANY_A, source_type: "TEMP", created_at: thirtyDaysAgo },
      { id: "doc-expense", company_id: COMPANY_A, source_type: "TEMP", created_at: thirtyDaysAgo },
      { id: "doc-fin-import", company_id: COMPANY_A, source_type: "TEMP", created_at: thirtyDaysAgo },
      { id: "doc-free", company_id: COMPANY_A, source_type: "TEMP", created_at: thirtyDaysAgo },
    ],
    invoices: [
      { id: "inv-1", company_id: COMPANY_A, source_document_id: "doc-invoice" },
    ],
    expenses: [
      { id: "exp-1", company_id: COMPANY_A, receipt_source_document_id: "doc-expense" },
    ],
    financial_import_batches: [
      { id: "fib-1", company_id: COMPANY_A, source_document_id: "doc-fin-import" },
    ],
  });

  const service = new RetentionService(client);

  assert.equal(await service.verifySourceDocumentEligible(COMPANY_A, "doc-invoice"), false);
  assert.equal(await service.verifySourceDocumentEligible(COMPANY_A, "doc-expense"), false);
  assert.equal(await service.verifySourceDocumentEligible(COMPANY_A, "doc-fin-import"), false);
  assert.equal(await service.verifySourceDocumentEligible(COMPANY_A, "doc-free"), true);

  const candidates = await service.discoverCandidateSourceDocuments(COMPANY_A, 50, now);
  assert.deepEqual(candidates, ["doc-free"]);
});

test("Database Retention: Protects non-temp source documents created within 14 days", async () => {
  const now = new Date("2026-09-01T12:00:00Z");
  const fiveDaysAgo = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString();

  const { client } = createMockSupabase({
    source_documents: [
      { id: "doc-recent-upload", company_id: COMPANY_A, source_type: "UPLOAD", created_at: fiveDaysAgo },
    ],
  });

  const service = new RetentionService(client);
  const candidates = await service.discoverCandidateSourceDocuments(COMPANY_A, 50, now);
  assert.equal(candidates.length, 0, "Recent non-temp source documents must not be pruned");
});

test("Database Retention: Enforces batch limit clamping and category filtering", async () => {
  const now = new Date("2026-09-01T12:00:00Z");
  const fortyDaysAgo = new Date(now.getTime() - 40 * 24 * 60 * 60 * 1000).toISOString();

  const mockActions = Array.from({ length: 15 }, (_, i) => ({
    id: `act-${i}`,
    company_id: COMPANY_A,
    status: "EXPIRED",
    created_at: fortyDaysAgo,
  }));

  const mockBatches = Array.from({ length: 10 }, (_, i) => ({
    id: `batch-${i}`,
    company_id: COMPANY_A,
    status: "FAILED",
    created_at: fortyDaysAgo,
  }));

  const { client } = createMockSupabase({
    assistant_action_events: mockActions,
    payroll_import_batches: mockBatches,
  });

  const service = new RetentionService(client);

  // Limit 5 across all categories
  const resLimit5 = await service.pruneRetention({ companyId: COMPANY_A, limit: 5, now });
  assert.equal(resLimit5.candidatesCount, 5);

  // Category filter: only payrollBatches
  const resPayrollOnly = await service.pruneRetention({
    companyId: COMPANY_A,
    categories: ["payrollBatches"],
    limit: 6,
    now,
  });
  assert.equal(resPayrollOnly.candidatesCount, 6);
  assert.equal(resPayrollOnly.categories.assistantActions.candidatesCount, 0);
  assert.equal(resPayrollOnly.categories.payrollBatches.candidatesCount, 6);
});
