import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";

const MIGRATIONS_DIR = new URL("../supabase/migrations", import.meta.url);

test("migration naming and ordering safety: timestamps are valid, unique, and strictly monotonically increasing", () => {
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql"));
  assert.ok(files.length >= 30, `Expected at least 30 migration files, found ${files.length}`);

  const migrationRegex = /^(\d{14})_([a-z0-9_]+)\.sql$/;
  const timestamps: string[] = [];

  for (const file of files) {
    const match = file.match(migrationRegex);
    assert.ok(
      match,
      `Migration file "${file}" violates naming convention: must be YYYYMMDDHHMMSS_<description>.sql`
    );

    const [, timestamp] = match;
    timestamps.push(timestamp);
  }

  const uniqueTimestamps = new Set(timestamps);
  assert.equal(
    uniqueTimestamps.size,
    timestamps.length,
    `Found duplicate migration timestamps among migration files!`
  );

  const sortedFiles = [...files].sort();
  for (let i = 0; i < files.length; i++) {
    assert.equal(
      files[i],
      sortedFiles[i],
      `Migration file order mismatch at index ${i}: "${files[i]}" vs expected "${sortedFiles[i]}"`
    );
  }

  for (let i = 1; i < timestamps.length; i++) {
    assert.ok(
      timestamps[i] > timestamps[i - 1],
      `Migration timestamps must be strictly monotonically increasing: ${timestamps[i]} is not > ${timestamps[i - 1]} (${files[i]})`
    );
  }
});

test("migration invariant: company_audit_events allowlist only ever grows across the entire chain", () => {
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort();

  let previousAllowlist: string[] = [];
  let previousMigration = "";
  let migrationsWithConstraintCount = 0;

  for (const file of files) {
    const content = readFileSync(new URL(`../supabase/migrations/${file}`, MIGRATIONS_DIR), "utf8");
    const match = content.match(
      /company_audit_events[\s\S]*?(?:check \(event_type in|add constraint company_audit_events_event_type_check check \(event_type in)\s*\(([\s\S]*?)\)\)/i
    );
    if (!match) continue;

    migrationsWithConstraintCount++;
    const currentAllowlist = [...match[1].matchAll(/'([A-Z_]+)'/g)].map((m) => m[1]);
    const currentSet = new Set(currentAllowlist);

    if (previousAllowlist.length > 0) {
      for (const event of previousAllowlist) {
        assert.ok(
          currentSet.has(event),
          `Migration ${file} dropped previously supported audit event '${event}' established by ${previousMigration}`
        );
      }
    }

    previousAllowlist = currentAllowlist;
    previousMigration = file;
  }

  assert.ok(
    migrationsWithConstraintCount >= 5,
    `Expected at least 5 migrations defining or extending company_audit_events check constraint, found ${migrationsWithConstraintCount}`
  );
});

test("migration invariant: latest migration contains the authoritative superset of all Wave 1 audit event types", () => {
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort();
  let latestConstraintMigration = "";
  let latestAllowlist: string[] = [];

  for (const file of files) {
    const content = readFileSync(new URL(`../supabase/migrations/${file}`, MIGRATIONS_DIR), "utf8");
    const match = content.match(
      /company_audit_events[\s\S]*?(?:check \(event_type in|add constraint company_audit_events_event_type_check check \(event_type in)\s*\(([\s\S]*?)\)\)/i
    );
    if (match) {
      latestConstraintMigration = file;
      latestAllowlist = [...match[1].matchAll(/'([A-Z_]+)'/g)].map((m) => m[1]);
    }
  }

  const latestSet = new Set(latestAllowlist);

  const expectedCategories: Record<string, string[]> = {
    "Company Tenancy & Member Access": [
      "COMPANY_CREATED", "COMPANY_UPDATED", "COMPANY_SUSPENDED", "COMPANY_ARCHIVED", "COMPANY_REACTIVATED",
      "USER_INVITED", "INVITE_REVOKED", "INVITE_ACCEPTED", "INVITATION_SENT", "INVITATION_DELIVERY_FAILED",
      "MEMBER_ROLE_CHANGED", "MEMBER_SUSPENDED", "MEMBER_REACTIVATED", "MEMBER_REVOKED", "MEMBER_PERMISSIONS_UPDATED"
    ],
    "Payroll Maintenance & Factory Reset": [
      "PAYROLL_REPAIR_APPLIED", "PAYROLL_CALENDAR_REBUILT", "PAYROLL_UNAPPROVED_RESET", "PAYROLL_WORKSPACE_RESET"
    ],
    "Company AI Credentials & Hardening": [
      "COMPANY_AI_CREDENTIAL_CONFIGURED", "COMPANY_AI_CREDENTIAL_ROTATED",
      "COMPANY_AI_CREDENTIAL_TESTED", "COMPANY_AI_CREDENTIAL_ENABLED",
      "COMPANY_AI_CREDENTIAL_DISABLED", "COMPANY_AI_CREDENTIAL_REMOVED"
    ],
    "Cash & Banking Operations": [
      "CASH_ACCOUNT_CREATED", "CASH_ACCOUNT_UPDATED", "CASH_ACCOUNT_DEACTIVATED", "CASH_ACCOUNT_REACTIVATED",
      "CASH_BALANCE_SNAPSHOT_RECORDED", "CASH_STATEMENT_IMPORTED", "CASH_STATEMENT_REJECTED",
      "CASH_TRANSACTION_CREATED", "CASH_TRANSACTION_UPDATED", "CASH_TRANSACTION_CORRECTED",
      "CASH_TRANSACTION_REVERSED", "CASH_TRANSACTION_IGNORED", "CASH_TRANSACTION_REVIEW_RESTORED",
      "CASH_RECONCILIATION_CONFIRMED", "CASH_RECONCILIATION_REMOVED", "CASH_TRANSFER_MATCHED", "CASH_TRANSFER_REVERSED",
      "CASH_SETTLEMENT_CONFIRMED", "CASH_SETTLEMENT_REVERSED"
    ],
    "Engineering Documents": [
      "ENGINEERING_DOCUMENT_CREATED", "ENGINEERING_DOCUMENT_UPDATED", "ENGINEERING_DOCUMENT_ARCHIVED",
      "ENGINEERING_REVISION_UPLOADED", "ENGINEERING_ANNOTATION_SAVED", "ENGINEERING_ANNOTATION_DELETED",
      "ENGINEERING_DOCUMENT_DELETED_UNUSED", "ENGINEERING_DOCUMENT_SUPERSEDED"
    ],
    "Engineering Coordination (Phase 1B)": [
      "ENGINEERING_RFI_CREATED", "ENGINEERING_RFI_OPENED", "ENGINEERING_RFI_RESPONDED", "ENGINEERING_RFI_CLOSED", "ENGINEERING_RFI_VOIDED",
      "ENGINEERING_RFI_DELETED_UNUSED",
      "ENGINEERING_SUBMITTAL_CREATED", "ENGINEERING_SUBMITTAL_SUBMITTED", "ENGINEERING_SUBMITTAL_REVIEW_STARTED", "ENGINEERING_SUBMITTAL_REVIEWED",
      "ENGINEERING_SUBMITTAL_RESUBMITTED", "ENGINEERING_SUBMITTAL_CLOSED", "ENGINEERING_SUBMITTAL_VOIDED", "ENGINEERING_SUBMITTAL_DELETED_UNUSED"
    ],
    "Daily Site Logs (Phase 1C)": [
      "ENGINEERING_DAILY_SITE_LOG_CREATED", "ENGINEERING_DAILY_SITE_LOG_UPDATED",
      "ENGINEERING_DAILY_SITE_LOG_SUBMITTED", "ENGINEERING_DAILY_SITE_LOG_FINALIZED", "ENGINEERING_DAILY_SITE_LOG_VOIDED",
      "ENGINEERING_DAILY_SITE_LOG_DELETED_UNUSED", "ENGINEERING_DAILY_SITE_LOG_ADDENDUM"
    ],
    "Workforce and Payroll Correction Lifecycles (Wave 2A)": [
      "WORKER_OFFBOARDED", "WORKER_REACTIVATED", "WORKER_DELETED_UNUSED",
      "PROJECT_ASSIGNMENT_ENDED", "PROJECT_ASSIGNMENT_DELETED_UNUSED",
      "COMPENSATION_PROFILE_ENDED", "COMPENSATION_PROFILE_SUPERSEDED", "COMPENSATION_PROFILE_DELETED_UNUSED",
      "PAYROLL_COMPONENT_DEACTIVATED", "PAYROLL_COMPONENT_DELETED_UNUSED",
      "WORK_ENTRY_VOIDED", "WORK_ENTRY_DELETED_UNUSED",
      "ATTENDANCE_VOIDED", "ATTENDANCE_DELETED_UNUSED",
      "LEAVE_CANCELLED", "LEAVE_DELETED_UNUSED",
      "OVERTIME_CANCELLED", "OVERTIME_DELETED_UNUSED"
    ],
    "Project Correction Lifecycle (Wave 2B1)": [
      "PROJECT_DELETED_UNUSED", "PROJECT_ARCHIVED", "PROJECT_REACTIVATED"
    ],
    "Invoice and Expense Correction Lifecycle (Wave 2B2)": [
      "INVOICE_DELETED_UNUSED", "INVOICE_VOIDED", "INVOICE_ARCHIVED", "INVOICE_RESTORED",
      "EXPENSE_DELETED_UNUSED", "EXPENSE_VOIDED", "EXPENSE_ARCHIVED", "EXPENSE_RESTORED"
    ],
    "Email Access Preauthorization": [
      "ACCESS_AUTHORIZATION_CREATED", "ACCESS_AUTHORIZATION_PERMISSIONS_UPDATED",
      "ACCESS_AUTHORIZATION_REVOKED", "ACCESS_AUTHORIZATION_ACCEPTED",
      "MEMBERSHIP_CREATED", "PERMISSION_OVERRIDES_TRANSFERRED"
    ],
    "Client Progress Billing (P2B-4)": [
      "CLIENT_BILLING_CREATED", "CLIENT_BILLING_UPDATED", "CLIENT_BILLING_SUBMITTED",
      "CLIENT_BILLING_RETURNED_TO_DRAFT", "CLIENT_BILLING_ISSUED", "CLIENT_BILLING_CANCELLED",
      "CLIENT_BILLING_VOIDED"
    ]
  };

  let totalExpected = 0;
  for (const [category, events] of Object.entries(expectedCategories)) {
    for (const event of events) {
      totalExpected++;
      assert.ok(
        latestSet.has(event),
        `Latest constraint in ${latestConstraintMigration} is missing ${category} event: '${event}'`
      );
    }
  }

  assert.equal(totalExpected, 115, "Authoritative set must comprise exactly 115 events through P2B-4 client progress billing lifecycles");
  assert.equal(latestSet.size, 115, `Latest allowlist has ${latestSet.size} unique events, expected 115`);
});
