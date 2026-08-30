import assert from "node:assert/strict";
import test from "node:test";
import { executePreparedCoreHardeningAction, executeCoreHardeningTool, validateCoreHardeningToolArguments } from "../src/server/assistant/coreHardeningAssistant.ts";
import { executePreparedAssistantOperation, validateAssistantOperationArguments } from "../src/server/assistant/assistantOperations.ts";
import { executeAssistantTool, getAssistantToolDefinition } from "../src/server/assistant/toolRegistry.ts";
import { scrubAssistantMessage } from "../src/server/assistant/assistantHandler.ts";

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

function mutableClient(seed: Record<string, Record<string, unknown>>, calls: Array<Record<string, unknown>>) {
  return {
    from(table: string) {
      let response: { data: unknown; error: unknown } = { data: seed[table] || null, error: null };
      const builder: any = {
        select: () => builder,
        eq: () => builder,
        neq: () => builder,
        update: (patch: Record<string, unknown>) => { calls.push({ table, operation: "update", patch }); response = { data: { ...(seed[table] || {}), ...patch }, error: null }; return builder; },
        insert: (row: Record<string, unknown>) => { calls.push({ table, operation: "insert", row }); response = { data: { ...row }, error: null }; return builder; },
        maybeSingle: async () => response,
        single: async () => response,
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
    "prepare_update_project", "prepare_update_attendance", "prepare_save_compensation_profile", "prepare_save_recurring_component", "prepare_save_work_entry", "prepare_financial_account", "prepare_financial_account_lifecycle", "prepare_financial_snapshot",
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
  assert.deepEqual(validateCoreHardeningToolArguments("prepare_project_lifecycle", { projectId: PROJECT_ID, action: "ARCHIVE", reason: "Project closed" }), { projectId: PROJECT_ID, action: "ARCHIVE", reason: "Project closed" });
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

test("project, attendance, and manual-balance adapters validate deterministic inputs", () => {
  assert.deepEqual(validateAssistantOperationArguments("prepare_update_project", { projectId: PROJECT_ID, projectName: "North Tower", projectBudget: 250000 }), { projectId: PROJECT_ID, projectName: "North Tower", projectBudget: 250000 });
  assert.throws(() => validateAssistantOperationArguments("prepare_update_project", { projectId: PROJECT_ID }), /at least one project field/i);
  assert.deepEqual(validateAssistantOperationArguments("prepare_update_attendance", { attendanceId: PROJECT_ID, attendanceStatus: "ABSENT" }), { attendanceId: PROJECT_ID, attendanceStatus: "ABSENT" });
  const snapshot = validateAssistantOperationArguments("prepare_financial_snapshot", { accountId: PROJECT_ID, availableBalance: -125.5 });
  const snapshotRetry = validateAssistantOperationArguments("prepare_financial_snapshot", { accountId: PROJECT_ID, availableBalance: -125.5 });
  assert.equal(snapshot.availableBalance, -125.5);
  assert.equal(snapshot.pendingBalance, undefined);
  assert.equal(snapshot.snapshotId, snapshotRetry.snapshotId);
});

test("project and attendance corrections recheck the prepared row and write only through company-scoped updates", async () => {
  const projectCalls: Array<Record<string, unknown>> = [];
  const project = await executePreparedAssistantOperation(context(mutableClient({ projects: { id: PROJECT_ID, company_id: COMPANY_ID, project_code: "P-1", project_name: "Old name", status: "ACTIVE", updated_at: "2026-08-29T00:00:00.000Z" } }, projectCalls) as any), "prepare_update_project", { projectId: PROJECT_ID, projectName: "New name", expectedUpdatedAt: "2026-08-29T00:00:00.000Z" });
  assert.equal(project.operation, "project_updated");
  assert.deepEqual((projectCalls[0]?.patch as Record<string, unknown>)?.project_name, "New name");

  const attendanceId = "00000000-0000-4000-8000-000000000004";
  const attendanceCalls: Array<Record<string, unknown>> = [];
  const attendance = await executePreparedAssistantOperation(context(mutableClient({
    attendance_records: { id: attendanceId, company_id: COMPANY_ID, worker_id: PROJECT_ID, period_id: "00000000-0000-4000-8000-000000000005", attendance_date: "2026-08-29", scheduled_start: "09:00", scheduled_end: "18:00", scheduled_minutes: 480, break_minutes: 60, actual_time_in: "09:00", actual_time_out: "18:00", regular_minutes: 480, late_minutes: 0, undertime_minutes: 0, overtime_minutes: 0, paid_day_fraction: 1, attendance_status: "PRESENT", record_status: "CONFIRMED", source: "MANUAL", updated_at: "2026-08-29T00:00:00.000Z" },
    payroll_periods: { id: "00000000-0000-4000-8000-000000000005", company_id: COMPANY_ID, status: "OPEN", locked_at: null },
  }, attendanceCalls) as any), "prepare_update_attendance", { attendanceId, attendanceStatus: "ABSENT", expectedUpdatedAt: "2026-08-29T00:00:00.000Z" });
  assert.equal(attendance.operation, "attendance_corrected");
  const attendancePatch = attendanceCalls[0]?.patch as Record<string, unknown>;
  assert.equal(attendancePatch.actual_time_in, null);
  assert.equal(attendancePatch.regular_minutes, 0);
  assert.equal(attendancePatch.record_status, "CONFIRMED");
});

test("cash statement import normalizes deterministic fingerprints and executes only through the atomic import RPC", async () => {
  const source = {
    accountId: "00000000-0000-4000-8000-000000000004",
    sourceType: "CSV",
    fileName: "august-bank.csv",
    rows: [{ transactionDate: "2026-08-29", description: "Supplier payment", direction: "DEBIT", amount: 1250, currency: "php" }],
  };
  const first = validateAssistantOperationArguments("prepare_import_cash_statement", source);
  const second = validateAssistantOperationArguments("prepare_import_cash_statement", source);
  assert.equal(first.fileFingerprint, second.fileFingerprint);
  assert.equal(getAssistantToolDefinition("prepare_import_cash_statement")?.riskTier, "BULK_MUTATION");

  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const supabase = {
    from() {
      const builder: any = {
        select: () => builder,
        eq: () => builder,
        maybeSingle: async () => ({ data: { id: source.accountId, company_id: COMPANY_ID, display_name: "Operating account", currency: "PHP", active: true }, error: null }),
      };
      return builder;
    },
    rpc: async (name: string, args: Record<string, unknown>) => { calls.push({ name, args }); return { data: { batch_id: "00000000-0000-4000-8000-000000000005", imported_count: 1 }, error: null }; },
  };
  const prepared: any = await (await import("../src/server/assistant/assistantOperations.ts")).executeAssistantOperationTool("prepare_import_cash_statement", first, context(supabase, async (request) => ({ output: { prepared: true }, preparedAction: { id: "action", toolName: request.toolName, riskTier: request.riskTier, status: "PREPARED", preview: request.preview, expiresAt: "2026-08-30T00:00:00.000Z" } })));
  assert.equal(prepared.preparedAction.riskTier, "BULK_MUTATION");
  const executed = await (await import("../src/server/assistant/assistantOperations.ts")).executePreparedAssistantOperation(context(supabase), "prepare_import_cash_statement", first);
  assert.equal(executed.operation, "cash_statement_imported");
  assert.equal(calls[0]?.name, "commit_financial_import");
  assert.equal((calls[0]?.args.p_rows as Array<Record<string, unknown>>)[0]?.transaction_date, "2026-08-29");
});

test("Assistant normal prose scrubs UUIDs while structured references remain available to the client", () => {
  assert.equal(scrubAssistantMessage("The invoice 00000000-0000-4000-8000-000000000003 is ready."), "The invoice the referenced record is ready.");
  assert.equal(scrubAssistantMessage("No identifiers were present."), "No identifiers were present.");
});

test("an effective permission denial blocks new Assistant mutations before entity reads or preparation", async () => {
  let reads = 0;
  let prepared = 0;
  const supabase = {
    rpc: async () => { reads += 1; return { data: false, error: null }; },
    from: () => { throw new Error("entity read must not run after permission denial"); },
  };
  const result: any = await executeAssistantTool("prepare_project_lifecycle", { projectId: PROJECT_ID, action: "ARCHIVE", reason: "Project closed" }, context(supabase, async () => { prepared += 1; return { output: {} }; }));
  assert.equal(result.error.code, "FORBIDDEN");
  assert.equal(prepared, 0);
  assert.equal(reads, 1);
});
