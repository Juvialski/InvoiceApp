import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parseDeploymentManifest } from "../src/lib/deploymentManifest.ts";
import { buildDeploymentTransferPreflight } from "../src/lib/deploymentTransferPreflight.ts";

const template = parseDeploymentManifest(JSON.parse(readFileSync(new URL("../deployment/inventory.template.json", import.meta.url), "utf8")) as unknown);
const cliSource = readFileSync(new URL("../scripts/deployment/transfer-preflight.ts", import.meta.url), "utf8");

function completeManifest() {
  const sha = "abcdefabcdefabcdefabcdefabcdefabcdefabcd";
  const migration = "20260907121500_public_prospect_funnel_deployment_gate.sql";
  const manifest = parseDeploymentManifest({
    ...template,
    deployments: [{
      ...template.deployments[0]!,
      deploymentId: "client-a",
      clientName: "Client A",
      productionUrl: "https://client-a.example.com",
      renderServiceRef: "srv-client-a",
      supabaseProjectRef: "clientaref123",
      deployed: { repositorySha: sha, appVersion: "release-1", migrationLevel: migration },
      configuration: { version: "config-1", values: { locale: "en-PH" } },
      backup: { status: "CURRENT", lastSuccessfulAt: "2026-09-08T00:00:00.000Z", lastVerifiedAt: "2026-09-08T00:10:00.000Z" },
      release: {
        ...template.deployments[0]!.release,
        expectedRepositorySha: sha,
        expectedMigrationLevel: migration,
        configurationCompatibility: "COMPATIBLE",
        migrationPrerequisite: "READY",
        backupPrerequisite: "READY",
        rollbackExpectation: "DOCUMENTED_FORWARD_RECOVERY",
      },
    }],
  });
  return {
    manifest,
    sha,
    migration,
  };
}

test("transfer preflight distinguishes recorded PASS checks from unavoidable manual provider checks", () => {
  const fixture = completeManifest();
  const report = buildDeploymentTransferPreflight({
    manifest: fixture.manifest,
    currentRepositorySha: fixture.sha,
    latestMigrationLevel: fixture.migration,
    knownMigrationLevels: [fixture.migration],
    environmentVariableNames: ["VITE_SUPABASE_URL", "SUPABASE_AI_SERVER_KEY"],
  });

  assert.equal(report.readOnly, true);
  assert.equal(report.summary.blocked, 0);
  assert.equal(report.summary.overall, "MANUAL CHECK REQUIRED");
  assert.ok(report.checks.some((item) => item.key === "deployed-repository-sha" && item.status === "PASS"));
  assert.ok(report.checks.some((item) => item.key === "release-repository-sha" && item.status === "PASS"));
  assert.ok(report.checks.some((item) => item.key === "backup-evidence" && item.status === "MANUAL CHECK REQUIRED"));
  assert.ok(report.checks.some((item) => item.key === "supabase-transfer-eligibility" && item.status === "MANUAL CHECK REQUIRED"));
  assert.ok(report.checks.some((item) => item.key === "storage-object-preservation" && item.status === "MANUAL CHECK REQUIRED"));
  assert.match(report.checks.find((item) => item.key === "backup-evidence")?.detail || "", /Storage object bytes/i);
  assert.doesNotMatch(JSON.stringify(report), /MY_SUPABASE|secret-value|password-value/i);
});

test("transfer preflight blocks a local release SHA mismatch and an unrecognized migration", () => {
  const fixture = completeManifest();
  const report = buildDeploymentTransferPreflight({
    manifest: fixture.manifest,
    currentRepositorySha: "1111111111111111111111111111111111111111",
    latestMigrationLevel: "different.sql",
    knownMigrationLevels: ["different.sql"],
    environmentVariableNames: [],
  });

  assert.ok(report.checks.some((item) => item.key === "release-repository-sha" && item.status === "BLOCKED"));
  assert.ok(report.checks.some((item) => item.key === "migration-level-recorded" && item.status === "BLOCKED"));
  assert.equal(report.summary.overall, "BLOCKED");
});

test("preflight CLI is explicitly read-only and has no inventory write path", () => {
  assert.match(cliSource, /--file <private-inventory-file>/);
  assert.match(cliSource, /read-only/i);
  assert.match(cliSource, /rev-parse.*HEAD/);
  assert.match(cliSource, /supabase.*migrations/);
  assert.doesNotMatch(cliSource, /writeFileSync/);
  assert.doesNotMatch(cliSource, /fetch\(/);
});
