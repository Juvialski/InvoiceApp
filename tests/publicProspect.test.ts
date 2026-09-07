import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  parseDeploymentManifest,
  validateDeploymentManifest,
  verifyDeploymentHealth,
} from "../src/lib/deploymentManifest.ts";
import { applicationModeForPath, isPasswordRecoveryPath, isPublicFunnelApplicationPath } from "../src/app/applicationMode.ts";
import { validatePublicProspectSubmission } from "../src/lib/publicProspect.ts";
import { releaseMetadataFromEnv } from "../src/server/releaseMetadata.ts";

const migration = readFileSync(new URL("../supabase/migrations/20260907024119_public_prospect_funnel.sql", import.meta.url), "utf8");
const deploymentGateMigration = readFileSync(new URL("../supabase/migrations/20260907121500_public_prospect_funnel_deployment_gate.sql", import.meta.url), "utf8");
const server = readFileSync(new URL("../server.ts", import.meta.url), "utf8");
const appSource = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const publicRoot = readFileSync(new URL("../src/public/PublicFunnelRoot.tsx", import.meta.url), "utf8");
const manifestSource = readFileSync(new URL("../src/lib/deploymentManifest.ts", import.meta.url), "utf8");
const template = JSON.parse(readFileSync(new URL("../deployment/inventory.template.json", import.meta.url), "utf8")) as Record<string, any>;

function validProspect() {
  return {
    companyName: "Harbor Works Construction",
    contactName: "Ari Santos",
    contactEmail: "ARI.SANTOS@EXAMPLE.COM",
    contactPhone: "+63 917 555 0123",
    modules: ["projects", "procurement", "warehouse"],
    workforceScale: "26-100",
    projectScale: "6-20",
    painPoints: "Project and receipt information is split across several places.",
    integrationNeeds: "High-level accounting and email workflow discussion.",
    desiredTimeline: "within-3-months",
    requestType: "DEMO_AND_REQUIREMENTS",
    consentConfirmed: true,
  };
}

test("public prospect validation normalizes bounded business intake without accepting sensitive-file fields", () => {
  const result = validatePublicProspectSubmission(validProspect());
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.contactEmail, "ari.santos@example.com");
    assert.deepEqual(result.value.modules, ["projects", "procurement", "warehouse"]);
    assert.equal(result.value.contactPhone, "+63 917 555 0123");
  }

  const invalid = validatePublicProspectSubmission({
    ...validProspect(),
    contactEmail: "not-an-email",
    modules: ["projects", "finance", "procurement", "warehouse", "equipment", "workforce", "engineering-documents", "field-operations", "integrations"],
    consentConfirmed: false,
    fileData: "sensitive-document-bytes",
  });
  assert.equal(invalid.ok, false);
  if (!invalid.ok) {
    assert.ok(invalid.fields.contactEmail);
    assert.ok(invalid.fields.modules);
    assert.ok(invalid.fields.consentConfirmed);
  }
});

test("public routes are deployment-opt-in while password recovery remains production auth", () => {
  assert.equal(isPublicFunnelApplicationPath("/"), true);
  assert.equal(isPublicFunnelApplicationPath("/request-demo"), true);
  assert.equal(isPublicFunnelApplicationPath("/contact"), true);
  assert.equal(isPublicFunnelApplicationPath("/", "?auth=reset"), false);
  assert.equal(isPasswordRecoveryPath("/", "", "#access_token=redacted&type=recovery"), true);

  // Operational client deployments stay on the authenticated application by
  // default. A platform/QA build must explicitly opt into the public funnel.
  assert.equal(applicationModeForPath("/"), "production");
  assert.equal(applicationModeForPath("/request-demo"), "production");
  assert.equal(applicationModeForPath("/", undefined, undefined, true), "public");
  assert.equal(applicationModeForPath("/request-demo", undefined, undefined, true), "public");
  assert.equal(applicationModeForPath("/", "?type=recovery", undefined, true), "production");
  assert.equal(applicationModeForPath("/", "", "#access_token=redacted&type=recovery", true), "production");
  assert.equal(applicationModeForPath("/dashboard", undefined, undefined, true), "production");
  assert.match(appSource, /window\.location\.pathname === "\/" && !isPasswordRecoveryPath/);
  assert.match(publicRoot, /credentials: "omit"/);
  assert.match(publicRoot, /\/api\/public\/prospects/);
  assert.doesNotMatch(publicRoot, /CompanyAccessProvider|useCompanyAccess|fileData/i);
});

test("server public intake uses a bounded parser, rate limit, anonymous RPC, and no provisioning side effect", () => {
  assert.match(server, /app\.post\("\/api\/public\/prospects"/);
  assert.match(server, /express\.json\(\{ limit: "32kb", strict: true \}\)/);
  assert.match(server, /PUBLIC_PROSPECT_RATE_LIMIT = 5/);
  assert.match(server, /publicSupabaseClient\(\)\.rpc\("submit_public_prospect"/);
  assert.match(server, /No deployment or account was created/);
  assert.match(server, /honeypot/i);
  assert.match(server, /req\.body\?\.website/);
  assert.doesNotMatch(server, /SUPABASE_SERVICE_ROLE_KEY/);
});

test("release metadata exposes only explicit non-secret values and preserves unknown state", () => {
  const unknown = releaseMetadataFromEnv({});
  assert.deepEqual(unknown, { appVersion: null, repositorySha: null, migrationLevel: null, deploymentId: null, configurationVersion: null });
  const known = releaseMetadataFromEnv({
    RENDER_GIT_COMMIT: "ABCDEFABCDEFABCDEFABCDEFABCDEFABCDEFABCD",
    HYDROQUALISENSE_APP_VERSION: "release-2026.09.07",
    HYDROQUALISENSE_MIGRATION_LEVEL: "20260907024119_public_prospect_funnel.sql",
    HYDROQUALISENSE_DEPLOYMENT_ID: "client-alpha",
    HYDROQUALISENSE_CONFIGURATION_VERSION: "config-3",
  });
  assert.equal(known.repositorySha, "abcdefabcdefabcdefabcdefabcdefabcdefabcd");
  assert.equal(known.migrationLevel, "20260907024119_public_prospect_funnel.sql");
  assert.equal(releaseMetadataFromEnv({ RELEASE_SHA: "not-a-sha" }).repositorySha, null);
  assert.match(server, /releaseMetadataFromEnv\(process\.env\)/);
});

test("deployment inventory is bounded, secret-free, and can distinguish pass from unknown release health", () => {
  const parsed = validateDeploymentManifest(template);
  assert.equal(parsed.valid, true);
  if (!parsed.valid) return;
  assert.equal(parsed.value.deployments.length, 1);
  assert.ok(parsed.warnings.some((warning) => warning.includes("productionUrl")));

  const sha = "abcdefabcdefabcdefabcdefabcdefabcdefabcd";
  const entry = {
    ...parsed.value.deployments[0],
    deployed: { repositorySha: sha, appVersion: "release-1", migrationLevel: "migration-1" },
    configuration: { version: "config-1", values: { locale: "en-PH" } },
    release: {
      ...parsed.value.deployments[0].release,
      expectedRepositorySha: sha,
      expectedMigrationLevel: "migration-1",
    },
  };
  const pass = verifyDeploymentHealth(entry, {
    status: "ok",
    release: { repositorySha: sha.toUpperCase(), appVersion: "release-1", migrationLevel: "migration-1", configurationVersion: "config-1" },
  }, "2026-09-07T00:00:00.000Z", 200);
  assert.equal(pass.status, "PASS");

  const unknown = verifyDeploymentHealth({ ...entry, release: { ...entry.release, expectedRepositorySha: null, expectedMigrationLevel: null }, deployed: { ...entry.deployed, repositorySha: null, appVersion: null, migrationLevel: null }, configuration: { version: null, values: {} } }, { status: "ok", release: {} }, "2026-09-07T00:00:00.000Z", 200);
  assert.equal(unknown.status, "UNKNOWN");

  const secretField = JSON.parse(JSON.stringify(template)) as Record<string, any>;
  secretField.deployments[0].configuration.values.apiKey = "should-never-be-here";
  const rejected = validateDeploymentManifest(secretField);
  assert.equal(rejected.valid, false);
  if (!rejected.valid) assert.ok(rejected.errors.some((error) => /not allowed/i.test(error)));
  assert.match(manifestSource, /FORBIDDEN_KEY_PATTERN/);
});

test("public prospect migrations fail closed and require explicit deployment enablement", () => {
  assert.match(migration, /create table if not exists public\.prospect_submissions/i);
  assert.match(migration, /alter table public\.prospect_submissions enable row level security/i);
  assert.match(migration, /revoke all on table public\.prospect_submissions from public, anon, authenticated/i);
  assert.match(migration, /security definer\s+set search_path = ''/i);
  assert.match(migration, /if auth\.uid\(\) is not null/i);
  assert.match(migration, /grant execute on function public\.submit_public_prospect\([\s\S]*\) to anon/i);
  assert.match(migration, /revoke all on function public\.submit_public_prospect\([\s\S]*\) from public, authenticated/i);
  assert.doesNotMatch(migration, /company_id uuid|references public\.(companies|company_members)/i);

  assert.match(deploymentGateMigration, /private\.public_prospect_funnel_configuration/i);
  assert.match(deploymentGateMigration, /enabled boolean not null default false/i);
  assert.match(deploymentGateMigration, /revoke all on table private\.public_prospect_funnel_configuration from public, anon, authenticated/i);
  assert.match(deploymentGateMigration, /before insert on public\.prospect_submissions/i);
  assert.match(deploymentGateMigration, /Public prospect intake is not enabled for this deployment/i);
});
