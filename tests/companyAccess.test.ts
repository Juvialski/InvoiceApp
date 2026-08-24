import test from "node:test";
import assert from "node:assert/strict";
import { canManageCompany, canOpenCompanyWorkspace, companyIsSelectable } from "../src/lib/companyAccess.ts";

const ACTIVE = "00000000-0000-4000-8000-000000000001";
const SUSPENDED = "00000000-0000-4000-8000-000000000002";
const ARCHIVED = "00000000-0000-4000-8000-000000000003";

function snapshot(isPlatformOwner: boolean) {
  return {
    isPlatformOwner,
    companies: [
      { id: ACTIVE, name: "Active", status: "ACTIVE" as const },
      { id: SUSPENDED, name: "Suspended", status: "SUSPENDED" as const },
      { id: ARCHIVED, name: "Archived", status: "ARCHIVED" as const },
    ],
    memberships: [{ companyId: ACTIVE, status: "ACTIVE" as const, permissions: [] }],
  };
}

test("management and workspace-opening permissions are separate", () => {
  const owner = snapshot(true);
  assert.equal(canManageCompany(owner, SUSPENDED), true);
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
