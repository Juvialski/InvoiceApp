import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const MIGRATIONS_DIR = path.join(ROOT, "supabase", "migrations");
const BOOTSTRAP_SQL = path.join(HERE, "db", "integrationBootstrap.sql");
const FUNCTIONAL_SQL = path.join(HERE, "db", "payrollResetIntegration.sql");

/**
 * Database-backed integration test for the payroll workspace factory reset
 * migration chain. This is the executable counterpart of the source-contract
 * tests in payrollWorkspaceReset.test.ts: it applies every migration to a real
 * PostgreSQL server and exercises the destructive RPC end-to-end, including
 * authorization, rollback, two-company isolation, preview parity, and audit.
 *
 * Opt-in by pointing PAYROLL_RESET_DB_URL at a THROWAWAY Supabase-compatible
 * PostgreSQL database (anon/authenticated/service_role roles present, e.g. a
 * local `supabase/postgres` container). The public schema of that database is
 * dropped and recreated. As a safety rail, the database name must contain
 * "invoiceapp_test". Without the variable the whole suite skips.
 */

const DB_URL = process.env.PAYROLL_RESET_DB_URL;

function psqlAvailable(): boolean {
  const result = spawnSync("psql", ["--version"], { shell: process.platform === "win32", encoding: "utf8" });
  return result.status === 0;
}

function skipReason(): string | false {
  if (!DB_URL) {
    return "PAYROLL_RESET_DB_URL is not set; point it at a throwaway Supabase-compatible PostgreSQL database to run the live-migration suite";
  }
  let dbName = "";
  try {
    dbName = decodeURIComponent(new URL(DB_URL).pathname.replace(/^\//, ""));
  } catch {
    dbName = "";
  }
  if (!/invoiceapp_test/i.test(dbName)) {
    return `refusing to run against database "${dbName || "(unparsable)"}": the name must contain "invoiceapp_test" so production databases can never be hit`;
  }
  if (!psqlAvailable()) return "the psql client is not available on PATH";
  return false;
}

function psql(sqlInput: string, label: string, options: { singleTransaction?: boolean; quiet?: boolean } = {}): string {
  // Keep argv free of "=" tokens: Windows shell resolution splits them, so
  // settings travel through psql meta-commands in the stdin script instead.
  const dbnameArg = process.platform === "win32" ? `"--dbname=${DB_URL}"` : `--dbname=${DB_URL}`;
  const args = [dbnameArg];
  if (options.quiet !== false) args.push("-q");
  let script = "\\set ON_ERROR_STOP on\n";
  if (options.singleTransaction) script += "begin;\n";
  script += sqlInput;
  if (!script.endsWith("\n")) script += "\n";
  if (options.singleTransaction) script += "commit;\n";
  const result = spawnSync("psql", args, {
    input: script,
    encoding: "utf8",
    shell: process.platform === "win32",
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, PGAPPNAME: "invoiceapp-payroll-reset-integration-test" },
  });
  if (result.status !== 0 || /ALL_MIGRATIONS_FAILED/.test(String(result.stdout))) {
    throw new Error(`${label} failed with exit code ${result.status}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  }
  return String(result.stdout);
}

const SKIP_REASON = skipReason();

test("payroll workspace reset: full migration chain + destructive RPC behave correctly on real PostgreSQL", { timeout: 900_000, skip: SKIP_REASON || undefined }, () => {

  // 1. Wipe the throwaway database's public AND private schemas. Migrations
  //    own both; clearing both makes repeated runs immune to leftover state.
  psql(`
    drop schema if exists public cascade;
    drop schema if exists private cascade;
    create schema public;
    create schema private;
    do $$
    declare role_name text;
    begin
      foreach role_name in array array['anon', 'authenticated', 'service_role'] loop
        if exists (select 1 from pg_roles where rolname = role_name) then
          execute format('grant usage on schema public, private to %I', role_name);
        end if;
      end loop;
    end $$;
  `, "public schema reset");

  // 2. Storage/auth prerequisites (idempotent stubs).
  psql(readFileSync(BOOTSTRAP_SQL, "utf8"), "integration bootstrap");

  // 3. Apply every migration exactly like `supabase db push`: filename order,
  //    one transaction per migration, stop on first error.
  const migrations = readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith(".sql"))
    .sort();
  assert.ok(migrations.length >= 25, `expected the full migration chain, found ${migrations.length} files`);
  migrations.forEach((name, index) => {
    try {
      psql(readFileSync(path.join(MIGRATIONS_DIR, name), "utf8"), `migration ${name}`, { singleTransaction: true });
    } catch (error) {
      throw new Error(`clean-install failed at ${index + 1}/${migrations.length}: ${(error as Error).message}`);
    }
  });

  // 4. Clean-install invariants: grow-only audit allowlist ends complete, and
  //    every lifecycle guard the reset toggles exists and is enabled.
  const invariantOutput = psql(`
    select 'ALLOWLIST_OK' where exists (
      select 1 from pg_constraint
      where conrelid = 'public.company_audit_events'::regclass
        and conname = 'company_audit_events_event_type_check'
        and pg_get_constraintdef(oid) like '%PAYROLL_WORKSPACE_RESET%'
        and pg_get_constraintdef(oid) like '%COMPANY_AI_CREDENTIAL_ENABLED%'
    );
    select 'GUARDS_OK' where (
      select count(*) from pg_trigger
      where not tgisinternal and tgenabled = 'O' and tgname in (
        'scheduled_payroll_period_mutation_guard', 'payroll_periods_workforce_source_guard',
        'payroll_runs_transition_guard', 'payroll_entries_mutation_guard',
        'payroll_project_allocations_mutation_guard', 'payroll_adjustments_mutation_guard',
        'work_entries_finalized_source_guard', 'attendance_records_finalized_source_guard',
        'leave_requests_finalized_source_guard', 'overtime_requests_finalized_source_guard')
    ) = 10;
  `, "clean-install invariants", { quiet: false });
  assert.match(invariantOutput, /ALLOWLIST_OK/, "audit-event allowlist lost required events on clean install");
  assert.match(invariantOutput, /GUARDS_OK/, "lifecycle guards missing or disabled after clean install");

  // 5. Functional suite: seed legacy data (including AI credential audit rows),
  //    then verify authorization, confirmation, rollback, isolation, parity.
  const output = psql(readFileSync(FUNCTIONAL_SQL, "utf8"), "functional reset suite", { quiet: false });
  for (const marker of [
    "T1_PASS_anon_blocked",
    "T2_PASS_unauthenticated_blocked",
    "T3_PASS_outsider_blocked",
    "T4_PASS_confirmation_enforced",
    "T5_PASS_preview_matches_reality",
    "T6_PASS_rollback_atomic_and_guards_restored",
    "T7_PASS_apply_isolated_parity_audited_guards_on",
    "T8_PASS_repeat_reset_safe",
    "ALL_FUNCTIONAL_TESTS_PASSED",
  ]) {
    assert.ok(output.includes(marker), `functional suite did not report ${marker}\noutput:\n${output}`);
  }
});
