import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { authorizeCompanyMemberEmail, loadCompanyAccess, loadCompanyInvitations } from "../src/lib/companyAccess.ts";

const migration = readFileSync(new URL("../supabase/migrations/20260829132712_email_access_preauthorization.sql", import.meta.url), "utf8");
const accessManagement = readFileSync(new URL("../src/components/access/DeploymentAccessManagement.tsx", import.meta.url), "utf8");
const accessApi = readFileSync(new URL("../src/lib/companyAccess.ts", import.meta.url), "utf8");
const accessContext = readFileSync(new URL("../src/context/CompanyAccessContext.tsx", import.meta.url), "utf8");
const accessStates = readFileSync(new URL("../src/components/access/AccessStates.tsx", import.meta.url), "utf8");
const authScreen = readFileSync(new URL("../src/components/auth/AuthScreen.tsx", import.meta.url), "utf8");
const workflowGraph = readFileSync(new URL("../scripts/workflow-map/graph.ts", import.meta.url), "utf8");
const envExample = readFileSync(new URL("../.env.example", import.meta.url), "utf8");

function functionBody(source: string, signature: string) {
  const start = source.indexOf(signature);
  assert.notEqual(start, -1, `missing function signature: ${signature}`);
  return source.slice(start);
}

test("preauthorization migration exposes an authenticated guarded create/update/list contract", () => {
  assert.match(migration, /create or replace function public\.authorize_company_member_email\(/);
  assert.match(migration, /create or replace function public\.update_company_invitation_permissions\(/);
  assert.match(migration, /create or replace function public\.platform_list_company_invitations_with_overrides\(/);
  assert.match(migration, /grant execute on function public\.authorize_company_member_email\(uuid, text, text, jsonb, timestamptz\) to authenticated/);
  assert.match(migration, /grant execute on function public\.update_company_invitation_permissions\(uuid, uuid, jsonb\) to authenticated/);
  assert.match(migration, /grant execute on function public\.platform_list_company_invitations_with_overrides\(uuid\) to authenticated/);
  assert.match(migration, /revoke execute on function public\.authorize_company_member_email[\s\S]*from public, anon/);
  assert.match(migration, /private\.has_company_permission\(p_company_id, 'company\.members\.manage'\)/);
  assert.match(migration, /private\.deployment_company_id\(\)/);
  assert.match(migration, /private\.create_company_invitation\(/);
  assert.match(migration, /member_assignable/);
  assert.match(migration, /You cannot assign a permission you do not hold/);
});

test("claim uses verified email and deployment/expiry/status locks without delivery authorization", () => {
  const claim = functionBody(migration, "create or replace function public.claim_company_invitations()");
  assert.match(claim, /private\.current_verified_email\(\)/);
  assert.match(claim, /ci\.company_id = v_company_id/);
  assert.match(claim, /ci\.status = 'PENDING'/);
  assert.match(claim, /ci\.expires_at > now\(\)/);
  assert.match(claim, /c\.status = 'ACTIVE'/);
  assert.match(claim, /for update of ci/);
  assert.doesNotMatch(claim, /delivery_status\s*=\s*'SENT'/);
  assert.match(claim, /MEMBERSHIP_CREATED/);
  assert.match(claim, /PERMISSION_OVERRIDES_TRANSFERRED/);
  assert.match(claim, /ACCESS_AUTHORIZATION_ACCEPTED/);
  assert.match(claim, /authorization_mode', 'EMAIL_PREAUTHORIZATION'/);
});

test("browser access management is SMTP-independent and keeps legacy delivery state out of the primary UI", () => {
  assert.match(accessManagement, /Add user access/);
  assert.match(accessManagement, /Authorize an email to access this \{BRAND\.productName\} deployment/);
  assert.match(accessManagement, /No invitation email is sent/);
  assert.match(accessManagement, /Awaiting signup/);
  assert.match(accessManagement, /companyAccess\.authorizeCompanyMemberEmail/);
  assert.match(accessManagement, /companyAccess\.updateCompanyInvitationPermissions/);
  assert.match(accessManagement, /Permissions/);
  assert.match(accessManagement, /Revoke/);
  assert.doesNotMatch(accessManagement, /Invitation email sent|Delivery failed|Resend/);
  assert.doesNotMatch(accessContext, /companyApiRequest\("\/api\/company\/invitations/);
  assert.match(accessApi, /AUTHORIZE_COMPANY_MEMBER_EMAIL_RPC/);
  assert.match(accessApi, /PLATFORM_LIST_INVITATIONS_WITH_OVERRIDES_RPC/);
  assert.match(accessApi, /UPDATE_COMPANY_INVITATION_PERMISSIONS_RPC/);
  assert.doesNotMatch(accessApi, /companyApiRequest\("\/api\/company\/invitations/);
  assert.match(accessStates, /This email has not been authorized for this \{BRAND\.productName\} deployment/);
  assert.match(authScreen, /exact work email authorized by your company administrator/);
  assert.doesNotMatch(envExample, /SUPABASE_INVITATION_SERVER_KEY/);
});

test("browser access API normalizes the email and calls only the authenticated authorization RPC", async () => {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const client = {
    rpc: async (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args });
      return { data: { id: "authorization-1" }, error: null };
    },
  } as any;
  const result = await authorizeCompanyMemberEmail({
    companyId: "company-1",
    email: "  Employee@Company.Test ",
    roleKey: "VIEWER",
    permissionOverrides: [{ permissionKey: "projects.manage" as any, effect: "GRANT" }],
  }, client);
  assert.equal((result as { id?: string }).id, "authorization-1");
  assert.deepEqual(calls, [{
    name: "authorize_company_member_email",
    args: {
      p_company_id: "company-1",
      p_email: "employee@company.test",
      p_role_key: "VIEWER",
      p_permission_overrides: [{ permission_key: "projects.manage", effect: "GRANT" }],
      p_expires_at: null,
    },
  }]);
});

test("browser access API preserves pending permission overrides returned by the guarded list RPC", async () => {
  const client = {
    rpc: async (name: string) => {
      assert.equal(name, "platform_list_company_invitations_with_overrides");
      return {
        data: [{
          id: "authorization-1",
          company_id: "company-1",
          normalized_email: "employee@company.test",
          role_key: "VIEWER",
          status: "PENDING",
          permission_overrides: [{ permission_key: "projects.manage", effect: "GRANT" }],
        }],
        error: null,
      };
    },
  } as any;
  const [authorization] = await loadCompanyInvitations("company-1", client);
  assert.equal(authorization?.email, "employee@company.test");
  assert.deepEqual(authorization?.permissionOverrides.map(({ permissionKey, effect }) => ({ permissionKey, effect })), [{ permissionKey: "projects.manage", effect: "GRANT" }]);
});

test("authenticated access loading claims verified pending access before exposing the company snapshot", async () => {
  const calls: string[] = [];
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: "user-1", email: "employee@company.test" } }, error: null }) },
    rpc: async (name: string) => {
      calls.push(name);
      if (name === "claim_company_invitations") return { data: [], error: null };
      return { data: { companies: [], memberships: [] }, error: null };
    },
  } as any;
  const snapshot = await loadCompanyAccess(client);
  assert.deepEqual(calls, ["claim_company_invitations", "get_my_company_access"]);
  assert.equal(snapshot.status, "no-company");
});

test("workflow map describes verified-email authorization rather than sent-email claiming", () => {
  assert.match(workflowGraph, /label: "Email access preauthorization"/);
  assert.match(workflowGraph, /verified-email claim/);
  assert.match(workflowGraph, /guarded email authorization/);
  assert.doesNotMatch(workflowGraph, /only allows SENT invitations to be claimed/);
});
