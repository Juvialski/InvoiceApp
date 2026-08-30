import assert from "node:assert/strict";
import test from "node:test";
import { executePreparedCoreHardeningAction, executeCoreHardeningTool, validateCoreHardeningToolArguments } from "../src/server/assistant/coreHardeningAssistant.ts";
import { executePreparedAssistantOperation, validateAssistantOperationArguments } from "../src/server/assistant/assistantOperations.ts";
import { getAssistantToolDefinition } from "../src/server/assistant/toolRegistry.ts";

const COMPANY_ID = "00000000-0000-4000-8000-000000000001";
const USER_ID = "00000000-0000-4000-8000-000000000002";
const PROJECT_ID = "00000000-0000-4000-8000-000000000003";

function context(supabase: any, prepareAction: (request: any) => Promise<any> = async (request) => ({ output: { prepared: true }, preparedAction: { id: "00000000-0000-4000-8000-000000000099", toolName: request.toolName, riskTier: request.riskTier, status: "PREPARED", preview: request.preview, expiresAt: "2026-08-30T00:00:00.000Z" } })) {
  return {
    auth: { companyId: COMPANY_ID, user: { id: USER_ID }, supabase, accessToken: "test" },
    context: { companyId: COMPANY_ID, generation: 7 },
    now: new Date("2026-08-30T00:00:00.000Z"),
    prepareAction,
  } as any;
}

function readClient(rows: Record<string, unknown>[]) {
  return {
    from() {
      let current = [...rows];
      const builder: any = {
        select: () => builder,
        eq: (_key: string, _value: unknown) => builder,
        order: () => builder,
        limit: () => builder,
        maybeSingle: async () => ({ data: current[0] || null, error: null }),
        then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: current, error: null }).then(resolve),
      };
      return builder;
    },
  };
}

test("Wave 3 hardening tools are confirmation-gated and use explicit domain permissions", () => {
  for (const name of [
    "prepare_project_lifecycle", "prepare_financial_correction", "prepare_worker_update", "prepare_worker_lifecycle", "prepare_assignment_lifecycle",
    "prepare_compensation_profile_lifecycle", "prepare_recurring_component_lifecycle", "prepare_workforce_source_lifecycle", "prepare_engineering_document_lifecycle",
    "prepare_rfi_lifecycle", "prepare_submittal_lifecycle", "prepare_site_log_lifecycle", "prepare_site_log_addendum", "prepare_save_project_assignment",
    "prepare_save_compensation_profile", "prepare_save_recurring_component", "prepare_save_work_entry", "prepare_financial_account", "prepare_financial_account_lifecycle",
    "prepare_financial_transaction", "prepare_financial_transaction_correction", "prepare_financial_transaction_lifecycle", "prepare_internal_transfer", "prepare_internal_transfer_reversal",
    "prepare_update_company_profile", "prepare_authorize_company_member", "prepare_update_company_member", "prepare_update_member_permissions", "prepare_revoke_company_invitation",
  ]) {
    const definition = getAssistantToolDefinition(name);
    assert.ok(definition, name);
    assert.equal(definition?.riskTier, "PREPARE", name);
    assert.equal(definition?.requiresConfirmation, true, name);
  }
  assert.deepEqual((getAssistantToolDefinition("prepare_project_lifecycle")?.permissions as string[]), ["projects.read", "projects.manage"]);
  assert.deepEqual((getAssistantToolDefinition("prepare_worker_lifecycle")?.permissions as string[]), ["workers.read", "workers.manage"]);
});

test("lifecycle validation requires safe identifiers, action values, and reasons for destructive transitions", () => {
  assert.deepEqual(validateCoreHardeningToolArguments("prepare_project_lifecycle", { projectId: PROJECT_ID, action: "ARCHIVE", reason: "Project closed" }), { projectId: PROJECT_ID, action: "ARCHIVE", reason: "Project closed", effectiveDate: undefined });
  assert.throws(() => validateCoreHardeningToolArguments("prepare_project_lifecycle", { projectId: PROJECT_ID, action: "ARCHIVE" }), /reason is required/i);
  assert.throws(() => validateCoreHardeningToolArguments("prepare_financial_correction", { entityType: "INVOICE", entityId: PROJECT_ID, action: "VOID" }), /reason is required/i);
  assert.deepEqual(validateAssistantOperationArguments("prepare_financial_transaction_lifecycle", { transactionId: PROJECT_ID, action: "IGNORE", reason: "Not a business item" }), { transactionId: PROJECT_ID, action: "IGNORE", reason: "Not a business item" });
  assert.throws(() => validateAssistantOperationArguments("prepare_financial_transaction_lifecycle", { transactionId: PROJECT_ID, action: "IGNORE" }), /reason/i);
});

test("project lifecycle preparation reads the company row and persists no domain mutation", async () => {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const supabase = {
    ...readClient([{ id: PROJECT_ID, company_id: COMPANY_ID, project_code: "P-100", project_name: "North Tower", status: "ACTIVE" }]),
    rpc: async (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args });
      return { data: name === "preview_project_lifecycle" ? { canDelete: false, recommendedAction: "ARCHIVE", dependencies: { invoices: 2 } } : { entityType: "PROJECT", entityId: PROJECT_ID, action: "ARCHIVE", deleted: false, record: { id: PROJECT_ID, project_id: PROJECT_ID } }, error: null };
    },
  };
  let request: any;
  const result = await executeCoreHardeningTool("prepare_project_lifecycle", { projectId: PROJECT_ID, action: "ARCHIVE", reason: "Project closed" }, context(supabase, async (value) => { request = value; return { output: { prepared: true } } }));
  assert.equal(result.output.prepared, true);
  assert.equal(request.toolName, "prepare_project_lifecycle");
  assert.equal(request.preview.preflight.recommendedAction, "ARCHIVE");
  assert.deepEqual(calls.map((call) => call.name), ["preview_project_lifecycle"]);
});

test("confirmed lifecycle actions call the existing guarded RPC, not a parallel table mutation", async () => {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const supabase = {
    rpc: async (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args });
      return { data: { entityType: "WORKER", entityId: PROJECT_ID, action: "OFFBOARD", deleted: false, record: { id: PROJECT_ID } }, error: null };
    },
  };
  const result = await executePreparedCoreHardeningAction(context(supabase), "prepare_worker_lifecycle", { workerId: PROJECT_ID, action: "OFFBOARD", reason: "Employment ended" });
  assert.equal(result.operation, "worker_lifecycle_applied");
  assert.deepEqual(calls, [{ name: "apply_worker_lifecycle", args: { p_worker_id: PROJECT_ID, p_action: "OFFBOARD", p_reason: "Employment ended" } }]);
});

test("financial correction and company profile executions retain company-bound RPC arguments", async () => {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const supabase = {
    rpc: async (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args });
      return { data: name === "apply_invoice_correction" ? { entityType: "INVOICE", entityId: PROJECT_ID, action: "VOID", deleted: false } : { id: COMPANY_ID, name: "Engoryx Client" }, error: null };
    },
  };
  const correction = await executePreparedCoreHardeningAction(context(supabase), "prepare_financial_correction", { entityType: "INVOICE", entityId: PROJECT_ID, action: "VOID", reason: "Duplicate source" });
  const profile = await executePreparedAssistantOperation(context(supabase), "prepare_update_company_profile", { name: "Engoryx Client", defaultCurrency: "PHP", timezone: "Asia/Manila" });
  assert.equal(correction.operation, "financial_correction_applied");
  assert.equal(profile.operation, "company_profile_updated");
  assert.deepEqual(calls, [
    { name: "apply_invoice_correction", args: { p_invoice_id: PROJECT_ID, p_action: "VOID", p_reason: "Duplicate source" } },
    { name: "update_company", args: { p_company_id: COMPANY_ID, p_name: "Engoryx Client", p_default_currency: "PHP", p_timezone: "Asia/Manila" } },
  ]);
});
