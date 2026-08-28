import test from "node:test";
import assert from "node:assert/strict";
import { canManageCompany, canOpenCompanyWorkspace, companyIsSelectable, normalizeCompanyAccessPayload, permissionsForCompany } from "../src/lib/companyAccess.ts";

const ACTIVE = "00000000-0000-4000-8000-000000000001";
const SUSPENDED = "00000000-0000-4000-8000-000000000002";
const ARCHIVED = "00000000-0000-4000-8000-000000000003";

function snapshot(isPlatformOwner: boolean, permissions: string[] = []) {
  return {
    isPlatformOwner,
    companies: [
      { id: ACTIVE, name: "Active", status: "ACTIVE" as const },
      { id: SUSPENDED, name: "Suspended", status: "SUSPENDED" as const },
      { id: ARCHIVED, name: "Archived", status: "ARCHIVED" as const },
    ],
    memberships: [{ companyId: ACTIVE, status: "ACTIVE" as const, permissions }],
  };
}

test("management and workspace-opening permissions require deployment membership, not a platform flag", () => {
  const owner = snapshot(true, ["company.members.manage"]);
  assert.equal(canManageCompany(owner, ACTIVE), true);
  assert.equal(canManageCompany(owner, SUSPENDED), false);
  assert.equal(canOpenCompanyWorkspace(owner, ACTIVE), true);
  assert.equal(canOpenCompanyWorkspace(owner, SUSPENDED), false);
  assert.equal(canOpenCompanyWorkspace(owner, ARCHIVED), false);

  const member = snapshot(false);
  assert.equal(canManageCompany(member, ACTIVE), false);
  assert.equal(canOpenCompanyWorkspace(member, ACTIVE), true);
  assert.equal(canOpenCompanyWorkspace(member, SUSPENDED), false);
  assert.equal(canOpenCompanyWorkspace(member, ARCHIVED), false);
  assert.equal(companyIsSelectable(member, SUSPENDED), false);
});

test("legacy platform-owner payloads cannot grant client access without deployment membership", () => {
  const legacy = snapshot(true);
  legacy.memberships = [];
  assert.deepEqual(permissionsForCompany(legacy, ACTIVE), []);
  assert.equal(canOpenCompanyWorkspace(legacy, ACTIVE), false);

  const normalized = normalizeCompanyAccessPayload({
    is_platform_owner: true,
    companies: [{ id: ACTIVE, name: "Active", status: "ACTIVE" }],
    memberships: [],
  });
  assert.equal(normalized.isPlatformOwner, false);
  assert.equal(normalized.status, "no-company");
  assert.deepEqual(normalized.permissions, []);
});
