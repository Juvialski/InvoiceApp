import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(new URL("../supabase/migrations/20260915024105_client_security_custom_roles.sql", import.meta.url), "utf8");
const payrollReferenceMigration = readFileSync(new URL("../supabase/migrations/20260915095911_payroll_project_reference_boundary.sql", import.meta.url), "utf8");
const access = readFileSync(new URL("../src/components/access/DeploymentAccessManagement.tsx", import.meta.url), "utf8");
const roles = readFileSync(new URL("../src/components/access/CompanyRoleManagement.tsx", import.meta.url), "utf8");

test("custom-role migration defines company-scoped role lifecycle and guarded RPCs", () => {
  assert.match(migration, /company_id uuid/i);
  assert.match(migration, /archived_at/i);
  assert.match(migration, /create (?:or replace )?function public\.create_company_role/i);
  assert.match(migration, /create (?:or replace )?function public\.update_company_role/i);
  assert.match(migration, /create (?:or replace )?function public\.archive_company_role/i);
  assert.match(migration, /company\.members\.manage/i);
  assert.match(migration, /platform\./i);
  assert.match(migration, /MEMBER_ROLE_CHANGED/i);
});

test("access management exposes dynamic role records instead of a fixed role enum", () => {
  assert.match(access, /loadCompanyRoles/);
  assert.match(roles, /New custom role/);
  assert.match(roles, /Duplicate role/);
  assert.match(roles, /Archive role/);
  assert.doesNotMatch(access, /const ASSIGNABLE_ROLES = \["COMPANY_ADMIN", "FINANCE", "PAYROLL", "VIEWER"\]/);
});

test("Payroll keeps only a narrow project-reference permission outside its workspace", () => {
  assert.match(payrollReferenceMigration, /payroll\.project_reference\.read/);
  for (const permission of [
    "dashboard\.read",
    "projects\.read",
    "engineering\.documents\.read",
    "engineering\.rfis\.read",
    "engineering\.submittals\.read",
    "engineering\.sitelogs\.read",
  ]) {
    assert.match(payrollReferenceMigration, new RegExp(permission));
  }
  assert.match(payrollReferenceMigration, /delete from public\.company_role_permissions[\s\S]*PAYROLL/i);
  assert.match(payrollReferenceMigration, /create function public\.list_payroll_project_references\(p_company_id uuid\)/i);
  assert.match(payrollReferenceMigration, /auth\.uid\(\)/i);
  assert.match(payrollReferenceMigration, /private\.deployment_company_id\(\)/i);
  assert.match(payrollReferenceMigration, /private\.has_company_permission\(p_company_id, 'payroll\.project_reference\.read'\)/i);
  assert.match(payrollReferenceMigration, /returns table\([\s\S]*id uuid[\s\S]*project_code text[\s\S]*project_name text[\s\S]*status text[\s\S]*archived_at timestamptz/i);
  assert.match(payrollReferenceMigration, /revoke all on function public\.list_payroll_project_references\(uuid\) from public, anon/i);
  assert.match(payrollReferenceMigration, /grant execute on function public\.list_payroll_project_references\(uuid\) to authenticated/i);
});
