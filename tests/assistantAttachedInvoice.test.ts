import test from "node:test";
import assert from "node:assert/strict";
import { getAssistantToolDefinition } from "../src/server/assistant/toolRegistry.ts";
import { executePreparedAction, executeRegisteredTool } from "../src/server/assistant/assistantToolExecutors.ts";
import type { AssistantToolContext } from "../src/server/assistant/assistantBackendTypes.ts";

function createMockSupabase(initialInvoices: any[] = [], initialAttachments: any[] = []) {
  const invoices = [...initialInvoices];
  const attachments = [...initialAttachments];

  return {
    from(table: string) {
      if (table === "assistant_attachment_refs") {
        let rows = [...attachments];
        const builder: any = {
          select() { return builder; },
          eq(col: string, val: any) { rows = rows.filter((r) => r[col] === val); return builder; },
          in(col: string, vals: any[]) { rows = rows.filter((r) => vals.includes(r[col])); return builder; },
          order() { return builder; },
          limit(count: number) { rows = rows.slice(0, count); return builder; },
          then(resolve: (res: any) => any) { return Promise.resolve({ data: rows, error: null }).then(resolve); },
        };
        return builder;
      }

      if (table === "invoices") {
        let rows = [...invoices];
        const builder: any = {
          select() { return builder; },
          eq(col: string, val: any) { rows = rows.filter((r) => r[col] === val); return builder; },
          maybeSingle() { return Promise.resolve({ data: rows[0] || null, error: null }); },
          single() { return Promise.resolve({ data: rows[0] || null, error: null }); },
          insert(row: any) {
            invoices.push(row);
            return {
              select() {
                return {
                  single() { return Promise.resolve({ data: row, error: null }); },
                };
              },
            };
          },
          then(resolve: (res: any) => any) { return Promise.resolve({ data: rows, error: null }).then(resolve); },
        };
        return builder;
      }

      return {
        select() { return this; },
        eq() { return this; },
        maybeSingle() { return Promise.resolve({ data: null, error: null }); },
        single() { return Promise.resolve({ data: null, error: null }); },
      };
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

test("prepare_process_attached_invoice definition enforces PREPARE risk tier and invoice permissions", () => {
  const def = getAssistantToolDefinition("prepare_process_attached_invoice");
  assert.ok(def);
  assert.equal(def.riskTier, "PREPARE");
  assert.equal(def.requiresConfirmation, true);
  assert.deepEqual(def.permissions, ["invoices.extract", "invoices.read"]);
});

test("prepare_process_attached_invoice prepares action with preview and attachment metadata", async () => {
  const attachments = [
    { id: "att-1", company_id: "cmp-100", file_name: "acme-supplier-invoice.pdf", kind: "PDF", mime_type: "application/pdf", byte_size: 50000, sha256: "abc123sha" },
  ];
  const supabase = createMockSupabase([], attachments);
  const context = mockContext(supabase);

  const result = await executeRegisteredTool("prepare_process_attached_invoice", { fileName: "acme-supplier-invoice.pdf" }, context);
  assert.ok(result.preparedAction);
  assert.equal(result.preparedAction.toolName, "prepare_process_attached_invoice");
  assert.equal(result.preparedAction.riskTier, "PREPARE");
  assert.equal((result.preparedAction.preview as any).fileName, "acme-supplier-invoice.pdf");
  assert.equal((result.preparedAction.preview as any).reviewStatusAfterConfirmation, "NEEDS_REVIEW");
});

test("executePreparedAction for attached invoice inserts unverified draft into review queue and is idempotent", async () => {
  const supabase = createMockSupabase([], []);
  const context = mockContext(supabase);

  const result1: any = await executePreparedAction(context, "prepare_process_attached_invoice", {
    fileName: "acme-supplier-invoice.pdf",
    sha256: "unique-sha-999",
  }, "act-inv-100");

  assert.equal(result1.operation, "invoice_extracted_and_queued");
  assert.equal(result1.invoiceId, "act-inv-100");
  assert.equal(result1.invoice.reviewStatus, "NEEDS_REVIEW");
  assert.equal(result1.invoice.paymentStatus, "UNPAID");

  // Re-executing with same actionId / sha256 is idempotent
  const result2: any = await executePreparedAction(context, "prepare_process_attached_invoice", {
    fileName: "acme-supplier-invoice.pdf",
    sha256: "unique-sha-999",
  }, "act-inv-100");

  assert.equal(result2.operation, "invoice_already_processed");
  assert.equal(result2.invoiceId, "act-inv-100");
});
