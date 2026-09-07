import { DEPLOYMENT_MODULE_KEYS, type DeploymentModuleKey } from "../config/moduleVisibility.ts";

export const DEPLOYMENT_MANIFEST_SCHEMA_VERSION = 1 as const;
export const DEPLOYMENT_MANIFEST_MODULE_KEYS = DEPLOYMENT_MODULE_KEYS;

export type DeploymentEnvironment = "production" | "staging" | "demo";
export type DeploymentBackupStatus = "UNKNOWN" | "CURRENT" | "DUE" | "FAILED" | "NOT_CONFIGURED";
export type DeploymentPrerequisiteStatus = "UNKNOWN" | "READY" | "BLOCKED";
export type DeploymentCompatibilityStatus = "UNKNOWN" | "COMPATIBLE" | "REQUIRES_REVIEW" | "BLOCKED";
export type DeploymentRollbackExpectation = "DOCUMENTED_FORWARD_RECOVERY" | "PREVIOUS_BUILD_ONLY" | "NOT_READY";
export type DeploymentHealthVerificationStatus = "UNKNOWN" | "PASS" | "FAIL";

export type DeploymentConfigurationValue = string | number | boolean | null;

export interface DeploymentManifestEntry {
  deploymentId: string;
  clientName: string;
  environment: DeploymentEnvironment;
  productionUrl: string | null;
  renderServiceRef: string | null;
  supabaseProjectRef: string | null;
  deployed: {
    repositorySha: string | null;
    appVersion: string | null;
    migrationLevel: string | null;
  };
  enabledModules: DeploymentModuleKey[];
  configuration: {
    version: string | null;
    values: Record<string, DeploymentConfigurationValue>;
  };
  backup: {
    status: DeploymentBackupStatus;
    lastSuccessfulAt: string | null;
    lastVerifiedAt: string | null;
  };
  release: {
    expectedRepositorySha: string | null;
    expectedMigrationLevel: string | null;
    configurationCompatibility: DeploymentCompatibilityStatus;
    migrationPrerequisite: DeploymentPrerequisiteStatus;
    backupPrerequisite: DeploymentPrerequisiteStatus;
    rollbackExpectation: DeploymentRollbackExpectation;
  };
  lastHealthVerification: {
    status: DeploymentHealthVerificationStatus;
    checkedAt: string | null;
    httpStatus: number | null;
    observedRepositorySha: string | null;
    observedAppVersion: string | null;
    observedMigrationLevel: string | null;
    observedConfigurationVersion: string | null;
    notes: string[];
  };
  notes: string[];
}

export interface DeploymentManifest {
  schemaVersion: typeof DEPLOYMENT_MANIFEST_SCHEMA_VERSION;
  repository: string;
  deployments: DeploymentManifestEntry[];
}

export interface DeploymentManifestValidationSuccess {
  valid: true;
  value: DeploymentManifest;
  warnings: string[];
}

export interface DeploymentManifestValidationFailure {
  valid: false;
  errors: string[];
  warnings: string[];
}

export type DeploymentManifestValidationResult = DeploymentManifestValidationSuccess | DeploymentManifestValidationFailure;

export interface DeploymentHealthVerificationRecord {
  status: DeploymentHealthVerificationStatus;
  checkedAt: string;
  httpStatus: number | null;
  observedRepositorySha: string | null;
  observedAppVersion: string | null;
  observedMigrationLevel: string | null;
  observedConfigurationVersion: string | null;
  notes: string[];
}

const ENVIRONMENTS = new Set<string>(["production", "staging", "demo"]);
const BACKUP_STATUSES = new Set<string>(["UNKNOWN", "CURRENT", "DUE", "FAILED", "NOT_CONFIGURED"]);
const PREREQUISITE_STATUSES = new Set<string>(["UNKNOWN", "READY", "BLOCKED"]);
const COMPATIBILITY_STATUSES = new Set<string>(["UNKNOWN", "COMPATIBLE", "REQUIRES_REVIEW", "BLOCKED"]);
const ROLLBACK_EXPECTATIONS = new Set<string>(["DOCUMENTED_FORWARD_RECOVERY", "PREVIOUS_BUILD_ONLY", "NOT_READY"]);
const HEALTH_STATUSES = new Set<string>(["UNKNOWN", "PASS", "FAIL"]);
const MODULE_SET = new Set<string>(DEPLOYMENT_MANIFEST_MODULE_KEYS);
const SHA_PATTERN = /^[0-9a-f]{40}$/i;
const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const KEY_PATTERN = /^[a-z][a-z0-9_.-]{0,63}$/;
const FORBIDDEN_KEY_PATTERN = /password|secret|token|api[_-]?key|credential|private[_-]?key|access[_-]?key/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isPrimitive(value: unknown): value is DeploymentConfigurationValue {
  return value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean";
}

function checkForbiddenKeys(value: unknown, path: string, errors: string[]) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => checkForbiddenKeys(item, `${path}[${index}]`, errors));
    return;
  }
  if (!isRecord(value)) return;
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_KEY_PATTERN.test(key)) errors.push(`${path}.${key} is not allowed in a deployment inventory.`);
    checkForbiddenKeys(child, `${path}.${key}`, errors);
  }
}

function requiredString(record: Record<string, unknown>, key: string, label: string, errors: string[], maxLength = 200) {
  const value = record[key];
  if (typeof value !== "string" || !value.trim()) {
    errors.push(`${label} is required.`);
    return "";
  }
  const normalized = value.trim();
  if (normalized.length > maxLength) errors.push(`${label} exceeds ${maxLength} characters.`);
  return normalized;
}

function nullableString(record: Record<string, unknown>, key: string, label: string, errors: string[], maxLength = 200) {
  const value = record[key];
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") {
    errors.push(`${label} must be a string or null.`);
    return null;
  }
  const normalized = value.trim();
  if (normalized.length > maxLength) errors.push(`${label} exceeds ${maxLength} characters.`);
  return normalized || null;
}

function nullableSha(record: Record<string, unknown>, key: string, label: string, errors: string[]) {
  const value = nullableString(record, key, label, errors, 40);
  if (value && !SHA_PATTERN.test(value)) errors.push(`${label} must be a 40-character commit SHA or null.`);
  return value;
}

function nullableIdentifier(record: Record<string, unknown>, key: string, label: string, errors: string[]) {
  const value = nullableString(record, key, label, errors, 128);
  if (value && !IDENTIFIER_PATTERN.test(value)) errors.push(`${label} contains unsupported characters.`);
  return value;
}

function nullableDate(record: Record<string, unknown>, key: string, label: string, errors: string[]) {
  const value = nullableString(record, key, label, errors, 80);
  if (value && !Number.isFinite(Date.parse(value))) errors.push(`${label} must be an ISO date/time or null.`);
  return value;
}

function enumValue(record: Record<string, unknown>, key: string, label: string, values: ReadonlySet<string>, errors: string[]) {
  const value = record[key];
  if (typeof value !== "string" || !values.has(value)) {
    errors.push(`${label} is invalid.`);
    return "";
  }
  return value;
}

function notesValue(value: unknown, path: string, errors: string[]) {
  if (!Array.isArray(value)) {
    errors.push(`${path} must be an array.`);
    return [] as string[];
  }
  if (value.length > 20) errors.push(`${path} may contain no more than 20 notes.`);
  return value.map((item, index) => {
    if (typeof item !== "string") {
      errors.push(`${path}[${index}] must be a string.`);
      return "";
    }
    const normalized = item.trim();
    if (normalized.length > 500) errors.push(`${path}[${index}] exceeds 500 characters.`);
    return normalized;
  });
}

function validateEntry(input: unknown, index: number, errors: string[], warnings: string[]): DeploymentManifestEntry {
  const path = `deployments[${index}]`;
  const record = isRecord(input) ? input : {};
  if (!isRecord(input)) errors.push(`${path} must be an object.`);

  const deploymentId = requiredString(record, "deploymentId", `${path}.deploymentId`, errors, 128);
  if (deploymentId && !IDENTIFIER_PATTERN.test(deploymentId)) errors.push(`${path}.deploymentId contains unsupported characters.`);
  const clientName = requiredString(record, "clientName", `${path}.clientName`, errors, 200);
  const environment = enumValue(record, "environment", `${path}.environment`, ENVIRONMENTS, errors) as DeploymentEnvironment;
  const productionUrl = nullableString(record, "productionUrl", `${path}.productionUrl`, errors, 500);
  if (productionUrl) {
    try {
      const parsed = new URL(productionUrl);
      if (!/^https?:$/.test(parsed.protocol)) errors.push(`${path}.productionUrl must use http or https.`);
      if (environment === "production" && parsed.protocol !== "https:") errors.push(`${path}.productionUrl must use https in production.`);
    } catch {
      errors.push(`${path}.productionUrl is not a valid URL.`);
    }
  } else {
    warnings.push(`${path}.productionUrl is not recorded yet.`);
  }
  const renderServiceRef = nullableIdentifier(record, "renderServiceRef", `${path}.renderServiceRef`, errors);
  const supabaseProjectRef = nullableIdentifier(record, "supabaseProjectRef", `${path}.supabaseProjectRef`, errors);

  const deployedRecord = isRecord(record.deployed) ? record.deployed : {};
  if (!isRecord(record.deployed)) errors.push(`${path}.deployed must be an object.`);
  const deployed = {
    repositorySha: nullableSha(deployedRecord, "repositorySha", `${path}.deployed.repositorySha`, errors),
    appVersion: nullableString(deployedRecord, "appVersion", `${path}.deployed.appVersion`, errors, 120),
    migrationLevel: nullableString(deployedRecord, "migrationLevel", `${path}.deployed.migrationLevel`, errors, 160),
  };

  const modules = Array.isArray(record.enabledModules) ? record.enabledModules : [];
  if (!Array.isArray(record.enabledModules)) errors.push(`${path}.enabledModules must be an array.`);
  if (modules.length > DEPLOYMENT_MANIFEST_MODULE_KEYS.length) errors.push(`${path}.enabledModules contains too many entries.`);
  const enabledModules = [...new Set(modules.filter((item): item is DeploymentModuleKey => typeof item === "string" && MODULE_SET.has(item)))] as DeploymentModuleKey[];
  if (enabledModules.length !== modules.length) errors.push(`${path}.enabledModules contains an invalid or duplicate module.`);

  const configurationRecord = isRecord(record.configuration) ? record.configuration : {};
  if (!isRecord(record.configuration)) errors.push(`${path}.configuration must be an object.`);
  const configurationValues = isRecord(configurationRecord.values) ? configurationRecord.values : {};
  if (!isRecord(configurationRecord.values)) errors.push(`${path}.configuration.values must be an object.`);
  const configurationEntries = Object.entries(configurationValues);
  if (configurationEntries.length > 32) errors.push(`${path}.configuration.values may contain no more than 32 entries.`);
  const values: Record<string, DeploymentConfigurationValue> = {};
  for (const [key, value] of configurationEntries) {
    if (!KEY_PATTERN.test(key)) errors.push(`${path}.configuration.values.${key} has an invalid key.`);
    if (!isPrimitive(value)) errors.push(`${path}.configuration.values.${key} must be a scalar value or null.`);
    if (typeof value === "string" && value.length > 256) errors.push(`${path}.configuration.values.${key} exceeds 256 characters.`);
    if (isPrimitive(value)) values[key] = value;
  }
  const configuration = {
    version: nullableString(configurationRecord, "version", `${path}.configuration.version`, errors, 120),
    values,
  };

  const backupRecord = isRecord(record.backup) ? record.backup : {};
  if (!isRecord(record.backup)) errors.push(`${path}.backup must be an object.`);
  const backup = {
    status: enumValue(backupRecord, "status", `${path}.backup.status`, BACKUP_STATUSES, errors) as DeploymentBackupStatus,
    lastSuccessfulAt: nullableDate(backupRecord, "lastSuccessfulAt", `${path}.backup.lastSuccessfulAt`, errors),
    lastVerifiedAt: nullableDate(backupRecord, "lastVerifiedAt", `${path}.backup.lastVerifiedAt`, errors),
  };

  const releaseRecord = isRecord(record.release) ? record.release : {};
  if (!isRecord(record.release)) errors.push(`${path}.release must be an object.`);
  const release = {
    expectedRepositorySha: nullableSha(releaseRecord, "expectedRepositorySha", `${path}.release.expectedRepositorySha`, errors),
    expectedMigrationLevel: nullableString(releaseRecord, "expectedMigrationLevel", `${path}.release.expectedMigrationLevel`, errors, 160),
    configurationCompatibility: enumValue(releaseRecord, "configurationCompatibility", `${path}.release.configurationCompatibility`, COMPATIBILITY_STATUSES, errors) as DeploymentCompatibilityStatus,
    migrationPrerequisite: enumValue(releaseRecord, "migrationPrerequisite", `${path}.release.migrationPrerequisite`, PREREQUISITE_STATUSES, errors) as DeploymentPrerequisiteStatus,
    backupPrerequisite: enumValue(releaseRecord, "backupPrerequisite", `${path}.release.backupPrerequisite`, PREREQUISITE_STATUSES, errors) as DeploymentPrerequisiteStatus,
    rollbackExpectation: enumValue(releaseRecord, "rollbackExpectation", `${path}.release.rollbackExpectation`, ROLLBACK_EXPECTATIONS, errors) as DeploymentRollbackExpectation,
  };

  const healthRecord = isRecord(record.lastHealthVerification) ? record.lastHealthVerification : {};
  if (!isRecord(record.lastHealthVerification)) errors.push(`${path}.lastHealthVerification must be an object.`);
  const rawHttpStatus = healthRecord.httpStatus;
  const httpStatus = rawHttpStatus === null || rawHttpStatus === undefined ? null : Number(rawHttpStatus);
  if (httpStatus !== null && (!Number.isInteger(httpStatus) || httpStatus < 100 || httpStatus > 599)) errors.push(`${path}.lastHealthVerification.httpStatus is invalid.`);
  const lastHealthVerification = {
    status: enumValue(healthRecord, "status", `${path}.lastHealthVerification.status`, HEALTH_STATUSES, errors) as DeploymentHealthVerificationStatus,
    checkedAt: nullableDate(healthRecord, "checkedAt", `${path}.lastHealthVerification.checkedAt`, errors),
    httpStatus: httpStatus !== null && Number.isInteger(httpStatus) && httpStatus >= 100 && httpStatus <= 599 ? httpStatus : null,
    observedRepositorySha: nullableSha(healthRecord, "observedRepositorySha", `${path}.lastHealthVerification.observedRepositorySha`, errors),
    observedAppVersion: nullableString(healthRecord, "observedAppVersion", `${path}.lastHealthVerification.observedAppVersion`, errors, 120),
    observedMigrationLevel: nullableString(healthRecord, "observedMigrationLevel", `${path}.lastHealthVerification.observedMigrationLevel`, errors, 160),
    observedConfigurationVersion: nullableString(healthRecord, "observedConfigurationVersion", `${path}.lastHealthVerification.observedConfigurationVersion`, errors, 120),
    notes: notesValue(healthRecord.notes, `${path}.lastHealthVerification.notes`, errors),
  };

  const notes = notesValue(record.notes, `${path}.notes`, errors);
  return { deploymentId, clientName, environment, productionUrl, renderServiceRef, supabaseProjectRef, deployed, enabledModules, configuration, backup, release, lastHealthVerification, notes };
}

export function validateDeploymentManifest(input: unknown): DeploymentManifestValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  checkForbiddenKeys(input, "manifest", errors);
  const record = isRecord(input) ? input : {};
  if (!isRecord(input)) errors.push("The deployment manifest must be an object.");
  if (record.schemaVersion !== DEPLOYMENT_MANIFEST_SCHEMA_VERSION) errors.push(`schemaVersion must be ${DEPLOYMENT_MANIFEST_SCHEMA_VERSION}.`);
  const repository = requiredString(record, "repository", "repository", errors, 200);
  const rawDeployments = record.deployments;
  if (!Array.isArray(rawDeployments)) errors.push("deployments must be an array.");
  if (Array.isArray(rawDeployments) && rawDeployments.length > 200) errors.push("deployments may contain no more than 200 entries.");
  const deployments = Array.isArray(rawDeployments) ? rawDeployments.map((entry, index) => validateEntry(entry, index, errors, warnings)) : [];
  const ids = deployments.map((entry) => entry.deploymentId).filter(Boolean);
  if (new Set(ids).size !== ids.length) errors.push("deploymentId values must be unique.");

  if (errors.length > 0) return { valid: false, errors, warnings };
  return { valid: true, value: { schemaVersion: DEPLOYMENT_MANIFEST_SCHEMA_VERSION, repository, deployments }, warnings };
}

export function parseDeploymentManifest(input: unknown): DeploymentManifest {
  const result = validateDeploymentManifest(input);
  if (result.valid === false) throw new Error(result.errors.join(" "));
  return result.value;
}

function nullableHealthString(value: unknown, maxLength: number) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized && normalized.length <= maxLength ? normalized : null;
}

function healthRelease(payload: unknown): Record<string, unknown> {
  if (!isRecord(payload) || !isRecord(payload.release)) return {};
  return payload.release;
}

export function verifyDeploymentHealth(
  entry: DeploymentManifestEntry,
  payload: unknown,
  checkedAt: string,
  httpStatus: number | null,
): DeploymentHealthVerificationRecord {
  const release = healthRelease(payload);
  const observedRepositorySha = nullableHealthString(release.repositorySha, 40)?.toLowerCase() || null;
  const observedAppVersion = nullableHealthString(release.appVersion, 120);
  const observedMigrationLevel = nullableHealthString(release.migrationLevel, 160);
  const observedConfigurationVersion = nullableHealthString(release.configurationVersion, 120);
  const notes: string[] = [];
  const errors: string[] = [];
  const payloadStatus = isRecord(payload) ? payload.status : undefined;
  if (httpStatus === null || httpStatus < 200 || httpStatus >= 300 || payloadStatus !== "ok") errors.push("The deployment health endpoint did not report an HTTP/application success.");

  const expectedSha = entry.release.expectedRepositorySha || entry.deployed.repositorySha;
  if (expectedSha) {
    if (!observedRepositorySha) errors.push("The health endpoint did not report the expected repository SHA.");
    else if (observedRepositorySha !== expectedSha.toLowerCase()) errors.push("The observed repository SHA does not match the manifest expectation.");
  } else if (!observedRepositorySha) {
    notes.push("Repository SHA is unknown; record an expected or deployed SHA before calling this a release pass.");
  }

  const expectedAppVersion = entry.deployed.appVersion;
  if (expectedAppVersion) {
    if (!observedAppVersion) errors.push("The health endpoint did not report the expected application version.");
    else if (observedAppVersion !== expectedAppVersion) errors.push("The observed application version does not match the manifest expectation.");
  } else if (!observedAppVersion) {
    notes.push("Application version is unknown; record an explicit release label when available.");
  }

  const expectedMigration = entry.release.expectedMigrationLevel || entry.deployed.migrationLevel;
  if (expectedMigration) {
    if (!observedMigrationLevel) errors.push("The health endpoint did not report the expected migration level.");
    else if (observedMigrationLevel !== expectedMigration) errors.push("The observed migration level does not match the manifest expectation.");
  } else if (!observedMigrationLevel) {
    notes.push("Migration level is unknown; set HYDROQUALISENSE_MIGRATION_LEVEL after the approved migration set is applied.");
  }

  if (entry.configuration.version) {
    if (!observedConfigurationVersion) errors.push("The health endpoint did not report the expected configuration version.");
    else if (observedConfigurationVersion !== entry.configuration.version) errors.push("The observed configuration version does not match the manifest.");
  } else if (!observedConfigurationVersion) {
    notes.push("Configuration version is unknown; set a version when client-specific configuration is approved.");
  }

  const status: DeploymentHealthVerificationStatus = errors.length > 0 ? "FAIL" : notes.length > 0 ? "UNKNOWN" : "PASS";
  return { status, checkedAt, httpStatus, observedRepositorySha, observedAppVersion, observedMigrationLevel, observedConfigurationVersion, notes: [...errors, ...notes] };
}

export function recordDeploymentHealthVerification(
  manifest: DeploymentManifest,
  deploymentId: string,
  verification: DeploymentHealthVerificationRecord,
): DeploymentManifest {
  return {
    ...manifest,
    deployments: manifest.deployments.map((entry) => entry.deploymentId === deploymentId
      ? { ...entry, lastHealthVerification: verification }
      : entry),
  };
}
