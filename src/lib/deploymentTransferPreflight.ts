import type { DeploymentManifest, DeploymentManifestEntry } from "./deploymentManifest.ts";

export const TRANSFER_PREFLIGHT_STATUSES = ["PASS", "BLOCKED", "MANUAL CHECK REQUIRED"] as const;
export type TransferPreflightStatus = typeof TRANSFER_PREFLIGHT_STATUSES[number];

export interface TransferPreflightCheck {
  key: string;
  label: string;
  status: TransferPreflightStatus;
  detail: string;
}

export interface TransferPreflightInput {
  manifest: DeploymentManifest;
  deploymentId?: string;
  currentRepositorySha: string | null;
  latestMigrationLevel: string | null;
  knownMigrationLevels: readonly string[];
  environmentVariableNames: readonly string[];
}

export interface TransferPreflightReport {
  readOnly: true;
  deploymentId: string;
  clientName: string;
  environment: DeploymentManifestEntry["environment"];
  currentRepositorySha: string | null;
  latestMigrationLevel: string | null;
  environmentVariableNames: string[];
  checks: TransferPreflightCheck[];
  summary: {
    pass: number;
    blocked: number;
    manual: number;
    overall: TransferPreflightStatus;
  };
}

const FAILURE_BACKUP_STATUSES = new Set(["DUE", "FAILED", "NOT_CONFIGURED", "UNKNOWN"]);

function normalizeMigrationLevel(value: string | null | undefined) {
  return String(value || "").trim().replace(/\.sql$/i, "").toLowerCase();
}

function normalizeSha(value: string | null | undefined) {
  return String(value || "").trim().toLowerCase();
}

function check(key: string, label: string, status: TransferPreflightStatus, detail: string): TransferPreflightCheck {
  return { key, label, status, detail };
}

function manualCheck(key: string, label: string, detail: string) {
  return check(key, label, "MANUAL CHECK REQUIRED", detail);
}

function migrationIsKnown(entry: DeploymentManifestEntry, knownMigrationLevels: readonly string[]) {
  const expected = normalizeMigrationLevel(entry.release.expectedMigrationLevel || entry.deployed.migrationLevel);
  return Boolean(expected && knownMigrationLevels.some((level) => normalizeMigrationLevel(level) === expected));
}

function overallStatus(checks: readonly TransferPreflightCheck[]): TransferPreflightStatus {
  if (checks.some((item) => item.status === "BLOCKED")) return "BLOCKED";
  if (checks.some((item) => item.status === "MANUAL CHECK REQUIRED")) return "MANUAL CHECK REQUIRED";
  return "PASS";
}

export function buildDeploymentTransferPreflight(input: TransferPreflightInput): TransferPreflightReport {
  const entries = input.manifest.deployments;
  const entry = input.deploymentId
    ? entries.find((candidate) => candidate.deploymentId === input.deploymentId)
    : entries.length === 1
      ? entries[0]
      : undefined;
  if (!entry) {
    throw new Error(input.deploymentId
      ? `Deployment ${input.deploymentId} is not present in the inventory.`
      : "The inventory must contain exactly one deployment or the deployment id must be supplied.");
  }

  const checks: TransferPreflightCheck[] = [];
  checks.push(check(
    "deployment-identity",
    "Deployment identity",
    "PASS",
    `Recorded ${entry.deploymentId} for ${entry.clientName} (${entry.environment}).`,
  ));

  checks.push(entry.supabaseProjectRef
    ? check("supabase-project-ref", "Supabase project reference", "PASS", `Recorded project reference ${entry.supabaseProjectRef}; no Supabase API call was made.`)
    : manualCheck("supabase-project-ref", "Supabase project reference", "Record the existing Client A Supabase project reference in the private inventory and confirm it with the Supabase operator."));

  checks.push(entry.renderServiceRef
    ? check("render-service-ref", "Render service reference", "PASS", `Recorded Render service reference ${entry.renderServiceRef}; no Render API call was made.`)
    : manualCheck("render-service-ref", "Render service reference", "Record the existing Client A Render service reference in the private inventory and confirm it with the deployment operator."));

  checks.push(entry.productionUrl
    ? check("production-url", "Production URL", "PASS", `Recorded production URL ${entry.productionUrl}; reachability was not tested by this read-only preflight.`)
    : manualCheck("production-url", "Production URL", "Record the current production URL before transfer and verify it after transfer."));

  checks.push(entry.deployed.repositorySha
    ? check("deployed-repository-sha", "Deployed repository SHA", "PASS", `Client A deployed SHA ${entry.deployed.repositorySha} is recorded; live Render release state was not queried.`)
    : manualCheck("deployed-repository-sha", "Deployed repository SHA", "Record the deployed repository SHA from the Client A Render release."));

  const expectedSha = entry.release.expectedRepositorySha;
  checks.push(!expectedSha
    ? manualCheck("release-repository-sha", "Expected release SHA", "Set release.expectedRepositorySha when this preflight is being used to compare the local checkout with an approved release. A recorded deployed SHA is not silently treated as the release target.")
    : !input.currentRepositorySha
      ? manualCheck("release-repository-sha", "Expected release SHA", `The inventory expects ${expectedSha}, but the local repository HEAD could not be read.`)
      : normalizeSha(expectedSha) !== normalizeSha(input.currentRepositorySha)
        ? check("release-repository-sha", "Expected release SHA", "BLOCKED", `Local repository HEAD ${input.currentRepositorySha} does not match expected release SHA ${expectedSha}.`)
        : check("release-repository-sha", "Expected release SHA", "PASS", `Local repository HEAD matches expected release SHA ${expectedSha}.`));

  const expectedMigration = entry.release.expectedMigrationLevel || entry.deployed.migrationLevel;
  if (!expectedMigration) {
    checks.push(manualCheck("migration-level-recorded", "Migration level", "Record the migration level applied to Client A; do not infer it from the application version."));
  } else if (!migrationIsKnown(entry, input.knownMigrationLevels)) {
    checks.push(check("migration-level-recorded", "Migration level", "BLOCKED", `Recorded migration level ${expectedMigration} is not present in this repository's migration history.`));
  } else {
    checks.push(check("migration-level-recorded", "Migration level", "PASS", `Recorded migration level ${expectedMigration} is recognized locally.`));
  }

  const latestMigration = normalizeMigrationLevel(input.latestMigrationLevel);
  const expectedMigrationNormalized = normalizeMigrationLevel(expectedMigration);
  checks.push(!expectedMigration
    ? manualCheck("migration-level-live", "Live database migration level", "This read-only tool cannot query the target Supabase database; verify migration history with an authorized operator.")
    : !latestMigration
      ? manualCheck("migration-level-live", "Live database migration level", `The target is recorded at ${expectedMigration}, but the local latest migration could not be read; verify the target database manually.`)
      : latestMigration !== expectedMigrationNormalized
        ? manualCheck("migration-level-live", "Live database migration level", `The local repository latest migration is ${input.latestMigrationLevel}, while the inventory records ${expectedMigration}; confirm that the target's older/current level is intentional before transfer.`)
        : manualCheck("migration-level-live", "Live database migration level", `The repository recognizes ${expectedMigration}, but this tool does not query Supabase migration history.`));

  checks.push(entry.configuration.version
    ? check("configuration-version", "Configuration version", "PASS", `Recorded configuration version ${entry.configuration.version}; configuration values and secrets were not read.`)
    : manualCheck("configuration-version", "Configuration version", "Record the approved client configuration version, or explicitly document that no versioned client configuration exists."));

  const backupIsRecordedReady = entry.backup.status === "CURRENT"
    && Boolean(entry.backup.lastSuccessfulAt)
    && Boolean(entry.backup.lastVerifiedAt)
    && entry.release.backupPrerequisite === "READY";
  checks.push(backupIsRecordedReady
    ? check("backup-readiness", "Backup readiness state", "PASS", "The private inventory records a CURRENT backup with successful and verified timestamps and a READY release prerequisite; this is recorded state, not a provider verification.")
    : check("backup-readiness", "Backup readiness state", FAILURE_BACKUP_STATUSES.has(entry.backup.status) || entry.release.backupPrerequisite === "BLOCKED" ? "BLOCKED" : "MANUAL CHECK REQUIRED", `Backup status is ${entry.backup.status} with prerequisite ${entry.release.backupPrerequisite}; transfer must wait for current, verified recovery evidence.`));

  checks.push(manualCheck(
    "backup-evidence",
    "Database and Storage backup evidence",
    "Verify the PostgreSQL/database backup and recovery evidence with the operator. A database backup does not by itself prove that Supabase Storage object bytes are backed up or restorable.",
  ));

  const releaseReady = entry.release.configurationCompatibility === "COMPATIBLE"
    && entry.release.migrationPrerequisite === "READY"
    && entry.release.backupPrerequisite === "READY"
    && entry.release.rollbackExpectation !== "NOT_READY";
  const releaseBlocked = [entry.release.configurationCompatibility, entry.release.migrationPrerequisite, entry.release.backupPrerequisite].includes("BLOCKED")
    || entry.release.rollbackExpectation === "NOT_READY";
  checks.push(releaseReady
    ? check("release-prerequisites", "Release and rollback prerequisites", "PASS", "Configuration, migration, backup and forward-recovery expectations are explicitly recorded as ready.")
    : check("release-prerequisites", "Release and rollback prerequisites", releaseBlocked ? "BLOCKED" : "MANUAL CHECK REQUIRED", `Recorded prerequisites are configuration=${entry.release.configurationCompatibility}, migration=${entry.release.migrationPrerequisite}, backup=${entry.release.backupPrerequisite}, rollback=${entry.release.rollbackExpectation}.`));

  const variableNames = [...new Set(input.environmentVariableNames.map((name) => name.trim()).filter(Boolean))].sort();
  checks.push(variableNames.length
    ? manualCheck("environment-variable-names", "Environment variable names", `Names found in .env.example: ${variableNames.join(", ")}. Verify that the required names remain present in the isolated Render/Supabase/provider configuration; this report never reads or prints values.`)
    : manualCheck("environment-variable-names", "Environment variable names", "The repository environment template could not provide variable names; compare the isolated deployment configuration manually without exporting values."));

  checks.push(
    manualCheck("supabase-transfer-eligibility", "Supabase project-transfer eligibility", "Confirm the source organization owner, target-organization membership, absence of an active GitHub integration, absence of project-scoped roles pointing to the project, and absence of log drains. This local preflight does not call the Supabase Management API."),
    manualCheck("auth-configuration", "Supabase Auth configuration", "Confirm providers, email behavior, existing users, session/confirmation settings, and the deployment's Auth configuration in the target Supabase project."),
    manualCheck("redirect-site-urls", "Redirect and site URLs", "Confirm Supabase Auth site URL, redirect allow-list, Render URL, custom domain and any email links before and after transfer."),
    manualCheck("storage-buckets-policies", "Storage buckets and policies", "Record every Storage bucket and policy; confirm company-prefixed paths and permission behavior are unchanged."),
    manualCheck("storage-object-preservation", "Storage object preservation", "Confirm existing source/issued document object bytes, metadata and hashes remain present and accessible according to permission. Database backup status alone is insufficient."),
    manualCheck("edge-functions", "Edge Functions", "Inventory deployed Edge Functions, schedules, secrets/configuration names and consumers, or record that none are used."),
    manualCheck("database-extensions", "Database extensions", "Record enabled PostgreSQL/Supabase extensions and confirm the destination organization/project retains the required set."),
    manualCheck("integrations-provider-configuration", "Integrations and provider configuration", "Confirm Gmail/OAuth, AI, email, backup and other provider configuration and scopes through the operator secret stores; do not copy secrets into this report."),
    manualCheck("post-transfer-smoke", "Post-transfer smoke checks", "Run the non-destructive post-transfer checklist in the HydroQualiSense Deployment and Release Runbook, including authentication, RBAC/RLS/RPC, Storage reads, module loads, health metadata and the verified supplier invoice to linked Expense workflow."),
  );

  const summary = checks.reduce((counts, item) => {
    if (item.status === "PASS") counts.pass += 1;
    else if (item.status === "BLOCKED") counts.blocked += 1;
    else counts.manual += 1;
    return counts;
  }, { pass: 0, blocked: 0, manual: 0 });

  return {
    readOnly: true,
    deploymentId: entry.deploymentId,
    clientName: entry.clientName,
    environment: entry.environment,
    currentRepositorySha: input.currentRepositorySha,
    latestMigrationLevel: input.latestMigrationLevel,
    environmentVariableNames: variableNames,
    checks,
    summary: { ...summary, overall: overallStatus(checks) },
  };
}
