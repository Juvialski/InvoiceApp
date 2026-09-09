import { repositoryMigrationLevel } from "./repositoryMigrationLevel.ts";

export interface ReleaseMetadata {
  appVersion: string | null;
  repositorySha: string | null;
  migrationLevel: string | null;
  deploymentId: string | null;
  configurationVersion: string | null;
  environment: ReleaseEnvironment | null;
}

export type ReleaseEnvironment = "production" | "qa" | "staging" | "demo";

const SHA_PATTERN = /^[0-9a-f]{40}$/i;
const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const ENVIRONMENTS = new Set<ReleaseEnvironment>(["production", "qa", "staging", "demo"]);

function firstValue(env: Readonly<Record<string, string | undefined>>, keys: readonly string[], maxLength: number) {
  for (const key of keys) {
    const value = String(env[key] || "").trim();
    if (value && value.length <= maxLength) return value;
  }
  return null;
}

function nullableSha(env: Readonly<Record<string, string | undefined>>) {
  const value = firstValue(env, ["RENDER_GIT_COMMIT", "RELEASE_SHA", "GIT_COMMIT_SHA", "COMMIT_SHA"], 40);
  return value && SHA_PATTERN.test(value) ? value.toLowerCase() : null;
}

function nullableIdentifier(env: Readonly<Record<string, string | undefined>>, keys: readonly string[]) {
  const value = firstValue(env, keys, 128);
  return value && IDENTIFIER_PATTERN.test(value) ? value : null;
}

function nullableEnvironment(env: Readonly<Record<string, string | undefined>>) {
  const value = firstValue(env, ["HYDROQUALISENSE_ENVIRONMENT"], 32)?.toLowerCase();
  return value && ENVIRONMENTS.has(value as ReleaseEnvironment) ? value as ReleaseEnvironment : null;
}

/**
 * Reads non-secret deployment metadata and derives the expected database
 * migration level from the exact checked-out repository. Legacy migration
 * environment variables are intentionally ignored so stale operator metadata
 * cannot override repository truth.
 */
export function releaseMetadataFromEnv(
  env: Readonly<Record<string, string | undefined>>,
  expectedMigrationLevel: string | null = repositoryMigrationLevel(),
): ReleaseMetadata {
  return {
    appVersion: firstValue(env, ["HYDROQUALISENSE_APP_VERSION", "APP_VERSION"], 120),
    repositorySha: nullableSha(env),
    migrationLevel: expectedMigrationLevel,
    deploymentId: nullableIdentifier(env, ["HYDROQUALISENSE_DEPLOYMENT_ID"]),
    configurationVersion: firstValue(env, ["HYDROQUALISENSE_CONFIGURATION_VERSION"], 120),
    environment: nullableEnvironment(env),
  };
}
