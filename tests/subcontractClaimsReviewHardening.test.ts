import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrations = path.resolve(__dirname, "../supabase/migrations");
const compositeKeyMigration = fs.readFileSync(
  path.join(migrations, "20260903145000_projects_company_composite_reference.sql"),
  "utf8",
);
const claimsMigration = fs.readFileSync(
  path.join(migrations, "20260903150000_subcontract_progress_claims.sql"),
  "utf8",
);
const hardeningMigration = fs.readFileSync(
  path.join(migrations, "20260903151000_subcontract_progress_claims_hardening.sql"),
  "utf8",
);

test("progress-claim composite FKs have ordered tenant-safe reference keys", () => {
  assert.match(
    compositeKeyMigration,
    /add constraint projects_company_id_id_key unique \(company_id, id\)/i,
  );
  assert.match(
    compositeKeyMigration,
    /add constraint subcontract_lines_company_id_id_key unique \(company_id, id\)/i,
  );
  assert.match(
    claimsMigration,
    /foreign key \(company_id, project_id\)[\s\S]*?references public\.projects\(company_id, id\)/i,
  );
  assert.match(
    claimsMigration,
    /foreign key \(company_id, subcontract_line_id\)[\s\S]*?references public\.subcontract_lines\(company_id, id\)/i,
  );
});

test("progress-claim production mutations are RPC-owned rather than direct table DML", () => {
  assert.match(
    hardeningMigration,
    /revoke insert, update, delete on table public\.subcontract_progress_claims from authenticated/i,
  );
  assert.match(
    hardeningMigration,
    /revoke insert, update, delete on table public\.subcontract_progress_claim_lines from authenticated/i,
  );
  assert.match(hardeningMigration, /grant select on table public\.subcontract_progress_claims to authenticated/i);
  assert.match(hardeningMigration, /grant select on table public\.subcontract_progress_claim_lines to authenticated/i);
});

test("claim lifecycle separates manage authority from approval authority", () => {
  assert.match(
    hardeningMigration,
    /old\.status = 'DRAFT' and new\.status in \('SUBMITTED', 'CANCELLED'\)[\s\S]*?procurement\.manage/i,
  );
  assert.match(
    hardeningMigration,
    /old\.status = 'SUBMITTED' and new\.status in \('APPROVED', 'REJECTED'\)[\s\S]*?procurement\.approve/i,
  );
  assert.match(
    hardeningMigration,
    /old\.status = 'APPROVED' and new\.status = 'VOIDED'[\s\S]*?procurement\.approve/i,
  );
  assert.match(
    hardeningMigration,
    /new\.status in \('SUBMITTED', 'APPROVED'\)[\s\S]*?v_sc_status not in \('APPROVED', 'ACTIVE'\)/i,
  );
});

test("subcontracts cannot close or cancel while unresolved progress claims remain", () => {
  assert.match(
    hardeningMigration,
    /new\.status in \('CLOSED', 'CANCELLED'\)[\s\S]*?c\.status in \('DRAFT', 'SUBMITTED'\)/i,
  );
  assert.match(
    hardeningMigration,
    /Resolve % draft\/submitted progress claim\(s\) before closing or cancelling the subcontract/i,
  );
});
