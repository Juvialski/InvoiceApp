import assert from "node:assert/strict";
import test from "node:test";
import { Client } from "pg";

const DB_URL = process.env.PAYROLL_PERIOD_PERSISTENCE_DB_URL;
const LOCAL_DB_PATTERN = /^(?:postgres(?:ql)?:\/\/[^/]*127\.0\.0\.1:54322\/|postgres(?:ql)?:\/\/[^/]*localhost:54322\/)/i;

const COMPANY_ID = "00000000-0000-4000-8000-000000000101";
const OWNER_ID = "00000000-0000-4000-8000-000000000001";
const RECONCILER_ID = "00000000-0000-4000-8000-000000000002";
const SCHEDULE_ID = "00000000-0000-4000-8000-000000000301";
const VERSION_ID = "00000000-0000-4000-8000-000000000401";
const SECOND_SCHEDULE_ID = "00000000-0000-4000-8000-000000000302";
const SECOND_VERSION_ID = "00000000-0000-4000-8000-000000000402";
const PERIOD_ID = "00000000-0000-4000-8000-000000000201";
const NEW_PERIOD_ID = "00000000-0000-4000-8000-000000000202";
const MISMATCHED_PERIOD_ID = "00000000-0000-4000-8000-000000000203";
const VOID_PERIOD_ID = "00000000-0000-4000-8000-000000000204";

function skipReason() {
  if (!DB_URL) return "PAYROLL_PERIOD_PERSISTENCE_DB_URL is not set; live payroll period persistence checks are opt-in";
  if (!LOCAL_DB_PATTERN.test(DB_URL) && !/invoiceapp_test/i.test(DB_URL)) {
    return "refusing to run outside the local 54322 database or a database named invoiceapp_test";
  }
  return undefined;
}

async function asActor<T>(client: Client, userId: string, action: () => Promise<T>): Promise<T> {
  await client.query("begin");
  try {
    await client.query("set local role authenticated");
    await client.query("select set_config('request.jwt.claim.sub', $1, true)", [userId]);
    const result = await action();
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback");
    throw error;
  }
}

async function insertPeriod(client: Client, values: {
  id: string;
  userId: string;
  scheduleId: string;
  scheduleVersionId: string;
  status?: string;
  notes?: string;
  periodStart?: string;
  periodEnd?: string;
  payDate?: string;
}) {
  await client.query(
    `insert into public.payroll_periods
      (id, user_id, company_id, period_start, period_end, pay_date, schedule_id, schedule_version_id, auto_generated, status, notes)
     values ($1, $2, $3, $4, $5, $6, $7, $8, true, $9, $10)`,
    [values.id, values.userId, COMPANY_ID, values.periodStart || "2026-09-21", values.periodEnd || "2026-09-27", values.payDate || "2026-09-30", values.scheduleId, values.scheduleVersionId, values.status || "DRAFT", values.notes || "generated"],
  );
}

async function updatePeriodPreservingOwnership(client: Client, id: string, notes: string) {
  const result = await client.query(
    `update public.payroll_periods
        set period_start = '2026-09-21', period_end = '2026-09-27', pay_date = '2026-09-30',
            schedule_id = $1, schedule_version_id = $2, auto_generated = true,
            locked_at = null, source_revision = 0, source_revision_updated_at = null,
            status = 'DRAFT', notes = $3, updated_at = now()
      where id = $4 and company_id = $5
      returning id, user_id, company_id, notes`,
    [SCHEDULE_ID, VERSION_ID, notes, id, COMPANY_ID],
  );
  return result.rows[0] as { id: string; user_id: string; company_id: string; notes: string } | undefined;
}

const SKIP_REASON = skipReason();

test("payroll period ownership, company, schedule, lifecycle, and idempotent reconciliation hold on real local Postgres", { skip: SKIP_REASON, timeout: 120_000 }, async () => {
  const client = new Client({ connectionString: DB_URL });
  await client.connect();
  try {
    await client.query("begin");
    await client.query("delete from public.payroll_periods where id in ($1, $2, $3, $4, $5)", [PERIOD_ID, NEW_PERIOD_ID, MISMATCHED_PERIOD_ID, VOID_PERIOD_ID, "00000000-0000-4000-8000-000000000205"]);
    await client.query("delete from public.payroll_schedule_versions where id in ($1, $2)", [SECOND_VERSION_ID, VERSION_ID]);
    await client.query("delete from public.payroll_schedules where id in ($1, $2)", [SECOND_SCHEDULE_ID, SCHEDULE_ID]);
    await client.query(
      `insert into auth.users (id, email, email_confirmed_at, created_at, updated_at)
       values ($1, 'payroll-owner@example.test', now(), now(), now()),
              ($2, 'payroll-reconciler@example.test', now(), now(), now())
       on conflict (id) do nothing`,
      [OWNER_ID, RECONCILER_ID],
    );
    await client.query(
      `insert into public.companies (id, name, company_code, status, default_currency, timezone, created_by_user_id, legacy_owner_user_id)
       select $1, 'Payroll Test Company', 'payroll-test-company', 'ACTIVE', 'PHP', 'Asia/Manila', $2, $2
       where not exists (select 1 from public.companies where id = $1)`,
      [COMPANY_ID, OWNER_ID],
    );
    await client.query(
      `insert into public.deployment_configuration (singleton, company_id)
       values (true, $1)
       on conflict (singleton) do update set company_id = excluded.company_id`,
      [COMPANY_ID],
    );
    await client.query(
      `insert into public.company_members (company_id, user_id, role_key, status, invited_by_user_id)
       values ($1, $2, 'PAYROLL', 'ACTIVE', $2), ($1, $3, 'PAYROLL', 'ACTIVE', $2)
       on conflict (company_id, user_id) do update set role_key = excluded.role_key, status = excluded.status`,
      [COMPANY_ID, OWNER_ID, RECONCILER_ID],
    );
    await client.query("commit");

    await asActor(client, OWNER_ID, async () => {
      await client.query(
        `insert into public.payroll_schedules
          (id, user_id, company_id, name, frequency, effective_from, configuration, pay_date_rule, auto_generate_periods, auto_calculate, active)
         values ($1, $2, $3, 'Weekly payroll', 'WEEKLY', '2026-01-01', '{}', '{}', true, false, true)
         on conflict (id) do update set active = true, company_id = excluded.company_id`,
        [SCHEDULE_ID, OWNER_ID, COMPANY_ID],
      );
      await client.query(
        `insert into public.payroll_schedule_versions
          (id, schedule_id, company_id, version, effective_from, frequency, configuration, pay_date_rule, auto_generate_periods, auto_calculate, active)
         values ($1, $2, $3, 1, '2026-01-01', 'WEEKLY', '{}', '{}', true, false, true)
         on conflict (id) do update set schedule_id = excluded.schedule_id, company_id = excluded.company_id, active = true`,
        [VERSION_ID, SCHEDULE_ID, COMPANY_ID],
      );
      await client.query(
        `insert into public.payroll_schedules
          (id, user_id, company_id, name, frequency, effective_from, configuration, pay_date_rule, auto_generate_periods, auto_calculate, active)
         values ($1, $2, $3, 'Secondary payroll', 'WEEKLY', '2026-01-01', '{}', '{}', true, false, false)
         on conflict (id) do update set active = false, company_id = excluded.company_id`,
        [SECOND_SCHEDULE_ID, OWNER_ID, COMPANY_ID],
      );
      await client.query(
        `insert into public.payroll_schedule_versions
          (id, schedule_id, company_id, version, effective_from, frequency, configuration, pay_date_rule, auto_generate_periods, auto_calculate, active)
         values ($1, $2, $3, 1, '2026-01-01', 'WEEKLY', '{}', '{}', true, false, true)
         on conflict (id) do update set schedule_id = excluded.schedule_id, company_id = excluded.company_id, active = true`,
        [SECOND_VERSION_ID, SECOND_SCHEDULE_ID, COMPANY_ID],
      );
      await insertPeriod(client, { id: PERIOD_ID, userId: OWNER_ID, scheduleId: SCHEDULE_ID, scheduleVersionId: VERSION_ID });
    });

    await assert.rejects(
      () => asActor(client, RECONCILER_ID, async () => {
        await client.query(
          `insert into public.payroll_periods
            (id, user_id, company_id, period_start, period_end, pay_date, schedule_id, schedule_version_id, auto_generated, status, notes)
           values ($1, $2, $3, '2026-09-21', '2026-09-27', '2026-09-30', $4, $5, true, 'DRAFT', 'legacy upsert')
           on conflict (id) do update set user_id = excluded.user_id, company_id = excluded.company_id, notes = excluded.notes`,
          [PERIOD_ID, RECONCILER_ID, COMPANY_ID, SCHEDULE_ID, VERSION_ID],
        );
      }),
      /Payroll period ownership and company are immutable/,
    );

    const firstReconciliation = await asActor(client, RECONCILER_ID, () => updatePeriodPreservingOwnership(client, PERIOD_ID, "reconciled by second actor"));
    assert.deepEqual(firstReconciliation, { id: PERIOD_ID, user_id: OWNER_ID, company_id: COMPANY_ID, notes: "reconciled by second actor" });
    const secondReconciliation = await asActor(client, RECONCILER_ID, () => updatePeriodPreservingOwnership(client, PERIOD_ID, "reconciled again"));
    assert.deepEqual(secondReconciliation, { id: PERIOD_ID, user_id: OWNER_ID, company_id: COMPANY_ID, notes: "reconciled again" });

    const newPeriod = await asActor(client, RECONCILER_ID, async () => {
      await insertPeriod(client, { id: NEW_PERIOD_ID, userId: RECONCILER_ID, scheduleId: SCHEDULE_ID, scheduleVersionId: VERSION_ID, periodStart: "2026-09-28", periodEnd: "2026-10-04", payDate: "2026-10-07", notes: "new generated period" });
      return client.query("select id, user_id, company_id from public.payroll_periods where id = $1", [NEW_PERIOD_ID]);
    });
    assert.deepEqual(newPeriod.rows[0], { id: NEW_PERIOD_ID, user_id: RECONCILER_ID, company_id: COMPANY_ID });

    await assert.rejects(
      () => asActor(client, RECONCILER_ID, async () => {
        await client.query("update public.payroll_periods set company_id = $1 where id = $2 and company_id = $3", ["00000000-0000-4000-8000-000000000102", PERIOD_ID, COMPANY_ID]);
      }),
      /Payroll period ownership and company are immutable/,
    );

    await assert.rejects(
      () => asActor(client, RECONCILER_ID, () => insertPeriod(client, { id: MISMATCHED_PERIOD_ID, userId: RECONCILER_ID, scheduleId: SCHEDULE_ID, scheduleVersionId: SECOND_VERSION_ID, periodStart: "2026-10-05", periodEnd: "2026-10-11", payDate: "2026-10-14" })),
      /Payroll period schedule and version do not match/,
    );

    await client.query(
      `insert into public.payroll_periods
        (id, user_id, company_id, period_start, period_end, schedule_id, schedule_version_id, auto_generated, status, notes)
       values ($1, $2, $3, '2026-10-12', '2026-10-18', $4, $5, true, 'VOID', 'terminal history')
       on conflict (id) do update set user_id = excluded.user_id, company_id = excluded.company_id, status = excluded.status, notes = excluded.notes`,
      [VOID_PERIOD_ID, OWNER_ID, COMPANY_ID, SCHEDULE_ID, VERSION_ID],
    );
    await assert.rejects(
      () => asActor(client, RECONCILER_ID, async () => {
        await client.query("update public.payroll_periods set notes = $1 where id = $2 and company_id = $3", ["must remain immutable", VOID_PERIOD_ID, COMPANY_ID]);
      }),
      /Finalized or void payroll periods are immutable/,
    );

    const counts = await client.query("select id, count(*)::integer as count from public.payroll_periods where id in ($1, $2) group by id order by id", [PERIOD_ID, NEW_PERIOD_ID]);
    assert.deepEqual(counts.rows, [
      { id: PERIOD_ID, count: 1 },
      { id: NEW_PERIOD_ID, count: 1 },
    ]);
  } finally {
    await client.end();
  }
});
