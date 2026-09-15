import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(new URL("../supabase/migrations/20260915024105_client_security_custom_roles.sql", import.meta.url), "utf8");
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
