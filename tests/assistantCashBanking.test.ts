import test from "node:test";
import assert from "node:assert/strict";
import { ASSISTANT_NAVIGATION_ROUTE_IDS, isAssistantRouteId } from "../src/assistant/assistantNavigation.ts";
import { routePermission } from "../src/server/assistant/toolAuthorization.ts";
import { getAssistantToolDefinition } from "../src/server/assistant/toolRegistry.ts";
import { executeRegisteredTool } from "../src/server/assistant/assistantToolExecutors.ts";
import { searchHelpCatalog, unknownHelpResponse } from "../src/assistant/helpCatalog.ts";
import { getAssistantTour, validateTourRegistry } from "../src/assistant/tourRegistry.ts";
import type { AssistantToolContext } from "../src/server/assistant/assistantBackendTypes.ts";

function createMockSupabase(initialData: {
  financial_accounts?: any[];
  financial_balance_snapshots?: any[];
  financial_transactions?: any[];
  financial_transaction_matches?: any[];
} = {}) {
  const data = {
    financial_accounts: initialData.financial_accounts || [],
    financial_balance_snapshots: initialData.financial_balance_snapshots || [],
    financial_transactions: initialData.financial_transactions || [],
    financial_transaction_matches: initialData.financial_transaction_matches || [],
  };

  return {
    from(table: string) {
      const rows = data[table as keyof typeof data] || [];
      let filtered = [...rows];

      const builder: any = {
        select(fields: string, opts?: any) {
          return builder;
        },
        eq(col: string, val: any) {
          filtered = filtered.filter((r) => r[col] === val);
          return builder;
        },
        in(col: string, vals: any[]) {
          filtered = filtered.filter((r) => vals.includes(r[col]));
          return builder;
        },
        order(col: string, opts?: any) {
          return builder;
        },
        limit(count: number) {
          filtered = filtered.slice(0, count);
          return builder;
        },
        maybeSingle() {
          return Promise.resolve({ data: filtered[0] || null, error: null });
        },
        single() {
          return Promise.resolve({ data: filtered[0] || null, error: null });
        },
        then(resolve: (res: any) => any) {
          return Promise.resolve({ data: filtered, error: null }).then(resolve);
        },
      };
      return builder;
    },
  };
}

function mockContext(supabase: any, companyId = "cmp-100"): AssistantToolContext {
  return {
    auth: {
      supabase,
      user: { id: "usr-1" } as any,
      companyId,
      accessToken: "test-token",
    },
    context: { companyId, generation: 1 },
    now: new Date("2026-08-26T12:00:00Z"),
    prepareAction: async (payload) => {
      const preparedAction = {
        id: "act-1",
        toolName: payload.toolName,
        riskTier: payload.riskTier,
        status: "PREPARED" as const,
        preview: payload.preview || {},
        expiresAt: new Date(Date.now() + 900000).toISOString(),
      };
      return {
        output: { ok: true, prepared: true, confirmationRequired: true, preview: payload.preview, action: preparedAction },
        preparedAction,
      };
    },
  };
}

test("Cash & Banking route is allowlisted and mapped to cash.summary.read permission", () => {
  assert.equal(isAssistantRouteId("cash"), true);
  assert.equal(ASSISTANT_NAVIGATION_ROUTE_IDS.includes("cash" as any), true);
  assert.equal(routePermission("cash"), "cash.summary.read");
});

test("Cash & Banking tools are registered with correct permissions and schemas", () => {
  const summaryDef = getAssistantToolDefinition("get_cash_summary");
  assert.ok(summaryDef);
  assert.equal(summaryDef.riskTier, "READ");
  assert.deepEqual(summaryDef.permissions, ["cash.summary.read"]);

  const accountsDef = getAssistantToolDefinition("list_financial_accounts");
  assert.ok(accountsDef);
  assert.equal(accountsDef.riskTier, "READ");
  assert.deepEqual(accountsDef.permissions, ["cash.summary.read"]);

  const accountDef = getAssistantToolDefinition("get_financial_account");
  assert.ok(accountDef);
  assert.equal(accountDef.riskTier, "READ");
  assert.deepEqual(accountDef.permissions, ["cash.summary.read"]);

  const transactionsDef = getAssistantToolDefinition("list_financial_transactions");
  assert.ok(transactionsDef);
  assert.equal(transactionsDef.riskTier, "READ");
  assert.deepEqual(transactionsDef.permissions, ["cash.transactions.read"]);

  const reconDef = getAssistantToolDefinition("get_cash_reconciliation_summary");
  assert.ok(reconDef);
  assert.equal(reconDef.riskTier, "READ");
  assert.deepEqual(reconDef.permissions, ["cash.summary.read", "cash.transactions.read"]);
});

test("get_cash_summary groups accounts strictly by currency and isolates PHP and USD", async () => {
  const accounts = [
    { id: "acc-php-1", company_id: "cmp-100", account_type: "BANK", institution_name: "BDO", display_name: "BDO Checking", masked_identifier: "••••1234", currency: "PHP", opening_balance: 50000, active: true },
    { id: "acc-php-2", company_id: "cmp-100", account_type: "EWALLET", institution_name: "GCash", display_name: "GCash Operations", masked_identifier: "••••5678", currency: "PHP", opening_balance: 10000, active: true },
    { id: "acc-usd-1", company_id: "cmp-100", account_type: "BANK", institution_name: "Wells Fargo", display_name: "USD Operating", masked_identifier: "••••9999", currency: "USD", opening_balance: 2500, active: true },
  ];
  const snapshots = [
    { id: "snp-1", account_id: "acc-php-1", company_id: "cmp-100", ledger_balance: 75000, available_balance: 70000, source: "STATEMENT", captured_at: "2026-08-25T10:00:00Z" },
    { id: "snp-2", account_id: "acc-usd-1", company_id: "cmp-100", ledger_balance: 3200, available_balance: 3200, source: "MANUAL", captured_at: "2026-08-25T11:00:00Z" },
  ];
  const transactions = [
    { id: "tx-1", account_id: "acc-php-1", company_id: "cmp-100", transaction_date: "2026-08-25", description: "Client payment", direction: "CREDIT", amount: 25000, currency: "PHP", reconciliation_status: "UNMATCHED" },
    { id: "tx-2", account_id: "acc-usd-1", company_id: "cmp-100", transaction_date: "2026-08-25", description: "US Client invoice", direction: "CREDIT", amount: 700, currency: "USD", reconciliation_status: "MATCHED" },
  ];

  const supabase = createMockSupabase({ financial_accounts: accounts, financial_balance_snapshots: snapshots, financial_transactions: transactions });
  const context = mockContext(supabase);

  const result = await executeRegisteredTool("get_cash_summary", {}, context);
  const out = result.output as any;
  assert.equal(out.reconciliationSummary.totalTransactions, 2);
  assert.equal(out.reconciliationSummary.unmatchedCount, 1);
  assert.equal(out.reconciliationSummary.matchedCount, 1);

  const positions = out.positionsByCurrency;
  assert.equal(positions.length, 2);

  const phpPos = positions.find((p: any) => p.currency === "PHP");
  assert.ok(phpPos);
  assert.equal(phpPos.accountCount, 2);
  // acc-php-1 snapshot is 75000, acc-php-2 has opening balance 10000 -> 85000 total PHP
  assert.equal(phpPos.totalLedgerBalance, 85000);

  const usdPos = positions.find((p: any) => p.currency === "USD");
  assert.ok(usdPos);
  assert.equal(usdPos.accountCount, 1);
  assert.equal(usdPos.totalLedgerBalance, 3200);

  // Semantics rule verification: never summed across currencies
  assert.ok(out.semantics.includes("never summed across currencies"));
});

test("Help catalog and tour registry support Cash & Banking", () => {
  const searchResults = searchHelpCatalog("cash");
  assert.ok(searchResults.length > 0);
  assert.equal(searchResults[0].id, "cash-banking");
  assert.equal(searchResults[0].routeId, "cash");

  const unknown = unknownHelpResponse("quantum computing");
  assert.ok(unknown.includes("Cash & Banking"));

  const cashTour = getAssistantTour("cash-banking");
  assert.ok(cashTour);
  assert.equal(cashTour.id, "cash-banking");
  assert.equal(cashTour.steps.length, 2);

  const validation = validateTourRegistry();
  assert.equal(validation.valid, true, `Tour registry errors: ${validation.errors.join(", ")}`);
});