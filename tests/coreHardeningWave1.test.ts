import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { invitationRedirectUrl, InvitationDeliveryError, deliverCompanyInvitationEmail } from "../src/server/access/invitationDelivery.ts";
import { normalizeCompanyAccessPayload } from "../src/lib/companyAccess.ts";

const migration = readFileSync(new URL("../supabase/migrations/20260829003147_core_hardening_wave1_access_management.sql", import.meta.url), "utf8");
const platformMaintenanceCorrection = readFileSync(new URL("../supabase/migrations/20260829020000_core_hardening_wave1_platform_maintenance_correction.sql", import.meta.url), "utf8");
const server = readFileSync(new URL("../server.ts", import.meta.url), "utf8");
const clientSupabase = readFileSync(new URL("../src/lib/supabase.ts", import.meta.url), "utf8");
const accessManagement = readFileSync(new URL("../src/components/access/DeploymentAccessManagement.tsx", import.meta.url), "utf8");
const profile = readFileSync(new URL("../src/components/access/CompanyProfileSettings.tsx", import.meta.url), "utf8");
const settings = readFileSync(new URL("../src/components/Settings.tsx", import.meta.url), "utf8");

test("Wave 1 migration adds company-bound overrides and backend-only invitation delivery state", () => {
  assert.match(migration, /company_member_permission_overrides/);
  assert.match(migration, /company_invitation_permission_overrides/);
  assert.match(migration, /foreign key \(company_id, membership_id\)/);
  assert.match(migration, /foreign key \(company_id, invitation_id\)/);
  assert.match(migration, /member_assignable/);
  assert.match(migration, /delivery_status text not null default 'CREATED'/);
  assert.match(migration, /delivery_status in \('CREATED', 'SENT', 'FAILED'\)/);
  assert.match(migration, /ci\.delivery_status = 'SENT'/);
  assert.match(migration, /p_company_id is null or p_company_id is distinct from \(select private\.deployment_company_id\(\)\)/);
  assert.match(migration, /grant execute on function public\.platform_create_company_invitation[\s\S]*to service_role/);
  assert.match(migration, /revoke execute on function public\.platform_mark_company_invitation_delivery[\s\S]*from public, anon, authenticated/);
  assert.match(migration, /MEMBER_PERMISSIONS_UPDATED/);
  assert.match(migration, /You cannot assign a permission you do not hold/);
  assert.match(migration, /At least one active member with access-management authority must remain/);
});

test("Wave 1 correction preserves a separate explicit platform-maintenance authorization path", () => {
  assert.match(platformMaintenanceCorrection, /perform private\.require_platform_deployment_company\(p_company_id\)/);
  assert.match(platformMaintenanceCorrection, /update public\.companies c/);
  assert.doesNotMatch(platformMaintenanceCorrection, /public\.update_company\(/);
  assert.match(platformMaintenanceCorrection, /maintenance_path', true/);
});

test("Wave 1 migration preserves every existing audit event while adding delivery and permission events", () => {
  const prior = readFileSync(new URL("../supabase/migrations/20260827210000_financial_settlement_integration.sql", import.meta.url), "utf8");
  const priorBlock = prior.match(/event_type in \(([\s\S]*?)\)\);/)?.[1] || "";
  const priorEvents = [...priorBlock.matchAll(/'([A-Z][A-Z0-9_]+)'/g)].map((match) => match[1]);
  for (const event of new Set(priorEvents)) assert.match(migration, new RegExp(`'${event}'`), `audit event ${event} was dropped`);
  for (const event of ["INVITATION_SENT", "INVITATION_DELIVERY_FAILED", "MEMBER_PERMISSIONS_UPDATED"]) assert.match(migration, new RegExp(`'${event}'`));
});

test("effective access snapshots carry role baseline, custom overrides, and the database result", () => {
  const snapshot = normalizeCompanyAccessPayload({
    companies: [{ id: "company-a", name: "Acme", status: "ACTIVE" }],
    memberships: [{
      id: "membership-a",
      company_id: "company-a",
      user_id: "user-a",
      role_key: "FINANCE",
      status: "ACTIVE",
      role_permissions: ["invoices.read"],
      permission_overrides: [{ permission_key: "payroll.approve", effect: "GRANT" }],
      permissions: ["invoices.read", "payroll.approve"],
    }],
  }, { id: "user-a", email: "a@example.com" });
  assert.deepEqual(snapshot.memberships[0]?.permissions, ["invoices.read", "payroll.approve"]);
  assert.deepEqual(snapshot.memberships[0]?.rolePermissions, ["invoices.read"]);
  assert.equal(snapshot.memberships[0]?.permissionOverrides?.[0]?.effect, "GRANT");
});

test("invitation delivery requires a configured origin and uses injectable Auth clients without exposing secrets", async () => {
  assert.equal(invitationRedirectUrl({ APP_ORIGIN: "https://engoryx.example" }), "https://engoryx.example/?auth=invite");
  assert.throws(() => invitationRedirectUrl({ APP_ORIGIN: "https://engoryx.example/path?unsafe=1" }), (error) => error instanceof InvitationDeliveryError && error.code === "NOT_CONFIGURED");
  assert.throws(() => invitationRedirectUrl({}), (error) => error instanceof InvitationDeliveryError && error.code === "NOT_CONFIGURED");

  let inviteEmail = "";
  const admin = { auth: { admin: { inviteUserByEmail: async (email: string) => { inviteEmail = email; return { data: { user: { id: "user-a" } }, error: null }; } } } } as any;
  const result = await deliverCompanyInvitationEmail({ email: "a@example.com", redirectTo: "https://engoryx.example/?auth=invite" }, { SUPABASE_URL: "https://project.supabase.co", SUPABASE_INVITATION_SERVER_KEY: "server-secret" }, { admin });
  assert.equal(result.method, "invite");
  assert.equal(inviteEmail, "a@example.com");
  assert.doesNotMatch(clientSupabase, /SUPABASE_INVITATION_SERVER_KEY|SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SECRET_KEY/);
});

test("existing Auth users receive a real sign-in email while database membership remains the gate", async () => {
  const admin = { auth: { admin: { inviteUserByEmail: async () => ({ data: null, error: { message: "A user with this email address has already been registered" } }) } } } as any;
  let sentEmail = "";
  const publicClient = { auth: { signInWithOtp: async (input: any) => { sentEmail = input.email; assert.equal(input.options.shouldCreateUser, false); return { data: {}, error: null }; } } as any;
  const result = await deliverCompanyInvitationEmail({ email: "existing@example.com", redirectTo: "https://engoryx.example/?auth=invite" }, { SUPABASE_URL: "https://project.supabase.co", SUPABASE_INVITATION_SERVER_KEY: "server-secret", SUPABASE_PUBLISHABLE_KEY: "publishable-key" }, { admin, public: publicClient });
  assert.equal(result.method, "sign-in");
  assert.equal(sentEmail, "existing@example.com");
});

test("profile and access UI expose truthful states and remain isolated from the demo route", () => {
  assert.match(profile, /Company profile/);
  assert.match(profile, /Read-only/);
  assert.match(profile, /updateDeploymentCompanyProfile/);
  assert.match(profile, /companyAccess\.refreshAccess/);
  assert.match(settings, /showDeploymentAccessManagement && <CompanyProfileSettings/);
  assert.match(settings, /Production company profile controls are intentionally not mounted here/);
  assert.match(accessManagement, /Role default/);
  assert.match(accessManagement, /Custom grant/);
  assert.match(accessManagement, /Custom deny/);
  assert.match(accessManagement, /effectivePermissions/);
  assert.match(accessManagement, /Own access protected/);
  assert.match(accessManagement, /Delivery failed/);
  assert.match(accessManagement, /Resend/);
  assert.match(server, /\/api\/company\/invitations/);
  assert.match(server, /platform_create_company_invitation/);
  assert.match(server, /platform_mark_company_invitation_delivery/);
  assert.doesNotMatch(server, /SUPABASE_SERVICE_ROLE_KEY/);
});
