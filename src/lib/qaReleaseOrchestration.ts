export const HYDROQUALISENSE_QA_PROJECT_REF = "vrpuznofrntyqsbugrib";
export const HYDROQUALISENSE_PRODUCTION_PROJECT_REF = "qijjshdwiylojvqojxyz";
export const HYDROQUALISENSE_QA_DEPLOYMENT_ID = "qa-hydroqualisense";
export const HYDROQUALISENSE_QA_BASE_URL = "https://hydroqualisense-qa.onrender.com";
export const QA_DATABASE_PUSH_CONFIRMATION = "QA_DATABASE_PUSH";

const MIGRATION_VERSION = /^\d{14}$/;
const DOCS_ONLY_PATH = /^(?:docs\/|README(?:\.[^/]+)?$|[^/]+\.md$|[^/]+\.txt$)/i;
const TEST_ONLY_PATH = /^(?:tests\/|supabase\/tests\/|scripts\/test[^/]*\.ts$)/i;
const RELEASE_ORCHESTRATION_PATHS = new Set([
  ".github/workflows/hosted-qa-certification.yml",
  ".github/workflows/qa-release.yml",
  "scripts/qa/classify-release.ts",
  "scripts/qa/qaReleaseContracts.ts",
  "scripts/qa/supabaseCli.ts",
  "scripts/qa/verify-migration-parity.ts",
  "scripts/qa/wait-for-qa-deployment.ts",
  "src/lib/qaReleaseOrchestration.ts",
]);
const HOSTED_QA_HARNESS_PATH = /^(?:scripts\/hosted-qa[^/]*\.ts|scripts\/qa\/hostedQaContracts\.ts)$/i;

export type QaReleaseChangeClass = "docs-only" | "tests-only" | "orchestration-only" | "runtime-only" | "migration-bearing";

export interface QaReleaseChangeClassification {
  changeClass: QaReleaseChangeClass;
  hasMigration: boolean;
  hasRuntime: boolean;
  hasHostedQaHarness: boolean;
  requiresHostedQa: boolean;
}

function normalizedPath(path: string): string {
  return path.trim().replaceAll("\\", "/");
}

function isMigrationPath(path: string): boolean {
  return /^supabase\/migrations\/\d{14}_[A-Za-z0-9][A-Za-z0-9_-]*\.sql$/i.test(path);
}

function isRuntimePath(path: string): boolean {
  if (!path || DOCS_ONLY_PATH.test(path) || TEST_ONLY_PATH.test(path)) return false;
  if (isMigrationPath(path)) return false;
  if (RELEASE_ORCHESTRATION_PATHS.has(path) || /^\.github\//i.test(path)) return false;
  if (HOSTED_QA_HARNESS_PATH.test(path)) return false;
  return true;
}

/**
 * Classify the main-branch change without treating release plumbing as an
 * application release. Migration-bearing changes always remain Hosted-QA
 * eligible because the database contract is part of the certified release.
 */
export function classifyQaReleasePaths(paths: readonly string[], manualHostedQa = false): QaReleaseChangeClassification {
  const normalized = paths.map(normalizedPath).filter(Boolean);
  const hasMigration = normalized.some(isMigrationPath);
  const hasRuntime = normalized.some(isRuntimePath);
  const hasHostedQaHarness = normalized.some((path) => HOSTED_QA_HARNESS_PATH.test(path));
  const allDocs = normalized.length > 0 && normalized.every((path) => DOCS_ONLY_PATH.test(path));
  const allTests = normalized.length > 0 && normalized.every((path) => TEST_ONLY_PATH.test(path));
  const changeClass: QaReleaseChangeClass = hasMigration
    ? "migration-bearing"
    : hasRuntime
      ? "runtime-only"
      : allDocs
        ? "docs-only"
        : allTests
          ? "tests-only"
          : "orchestration-only";

  return {
    changeClass,
    hasMigration,
    hasRuntime,
    hasHostedQaHarness,
    requiresHostedQa: manualHostedQa || hasMigration || hasRuntime || hasHostedQaHarness,
  };
}

export interface SupabaseMigrationRow {
  local: string | null;
  remote: string | null;
}

const MIGRATION_ROW_PATTERN = /^\s*(\d{14})?\s*[|│]\s*(\d{14})?\s*[|│]/;

/** Parse the stable timestamp columns from `supabase migration list`. */
export function parseSupabaseMigrationList(output: string): SupabaseMigrationRow[] {
  const jsonStart = output.indexOf('{"migrations"');
  if (jsonStart >= 0) {
    try {
      const jsonEnd = output.lastIndexOf("}");
      const parsed = JSON.parse(output.slice(jsonStart, jsonEnd >= jsonStart ? jsonEnd + 1 : undefined)) as { migrations?: unknown };
      if (Array.isArray(parsed.migrations)) {
        return parsed.migrations.flatMap((entry) => {
          if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
          const row = entry as { local?: unknown; remote?: unknown };
          const local = typeof row.local === "string" && MIGRATION_VERSION.test(row.local) ? row.local : null;
          const remote = typeof row.remote === "string" && MIGRATION_VERSION.test(row.remote) ? row.remote : null;
          return [{ local, remote }];
        });
      }
    } catch {
      // Fall through to the human-readable table parser for older CLI output.
    }
  }

  const rows: SupabaseMigrationRow[] = [];
  for (const line of output.split(/\r?\n/)) {
    const match = MIGRATION_ROW_PATTERN.exec(line);
    if (!match) continue;
    rows.push({ local: match[1] || null, remote: match[2] || null });
  }
  return rows;
}

export type MigrationParityStatus = "PASS" | "BEHIND" | "FAIL";

export interface MigrationParityResult {
  status: MigrationParityStatus;
  needsPromotion: boolean;
  expectedHead: string | null;
  observedRemoteHead: string | null;
  localLevels: string[];
  remoteLevels: string[];
  mismatches: string[];
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

/**
 * Compare the complete repository migration set with the remote history.
 * A remote prefix is safely classed as BEHIND; extra or divergent history is
 * a fail-closed contract problem rather than something the workflow repairs.
 */
export function evaluateMigrationParity(
  localLevels: readonly string[],
  rows: readonly SupabaseMigrationRow[],
): MigrationParityResult {
  const local = uniqueSorted(localLevels.filter((level) => MIGRATION_VERSION.test(level)));
  const remote = rows.map((row) => row.remote).filter((level): level is string => Boolean(level && MIGRATION_VERSION.test(level)));
  const remoteUnique = uniqueSorted(remote);
  const mismatches: string[] = [];

  if (local.length !== localLevels.length || new Set(localLevels).size !== localLevels.length) {
    mismatches.push("repository migration filenames contain missing, duplicate, or non-canonical versions");
  }
  if (remoteUnique.length !== remote.length) mismatches.push("QA migration history contains duplicate versions");
  for (const row of rows) {
    if (row.local && row.remote && row.local !== row.remote) mismatches.push(`local ${row.local} does not match remote ${row.remote}`);
    if (!row.local && row.remote) mismatches.push(`remote-only migration ${row.remote}`);
  }

  const localSet = new Set(local);
  for (const level of remoteUnique) if (!localSet.has(level)) mismatches.push(`remote-only migration ${level}`);

  const remoteSet = new Set(remoteUnique);
  const localOnly = local.filter((level) => !remoteSet.has(level));
  const expectedHead = local.at(-1) || null;
  const observedRemoteHead = remoteUnique.at(-1) || null;

  if (mismatches.length > 0) {
    return { status: "FAIL", needsPromotion: false, expectedHead, observedRemoteHead, localLevels: local, remoteLevels: remoteUnique, mismatches: [...new Set(mismatches)] };
  }
  if (localOnly.length > 0) {
    return { status: "BEHIND", needsPromotion: true, expectedHead, observedRemoteHead, localLevels: local, remoteLevels: remoteUnique, mismatches: localOnly.map((level) => `QA is missing repository migration ${level}`) };
  }
  if (local.length !== remoteUnique.length) {
    return { status: "FAIL", needsPromotion: false, expectedHead, observedRemoteHead, localLevels: local, remoteLevels: remoteUnique, mismatches: ["QA migration history does not match the repository migration set"] };
  }
  return { status: "PASS", needsPromotion: false, expectedHead, observedRemoteHead, localLevels: local, remoteLevels: remoteUnique, mismatches: [] };
}

export interface QaReleaseIdentityInput {
  environment?: unknown;
  deploymentId?: unknown;
  qaProjectRef?: unknown;
  productionProjectRef?: unknown;
  linkedProjectRef?: unknown;
  confirmation?: unknown;
}

/** Validate the complete protected workflow identity before any DB command. */
export function validateQaReleaseIdentity(input: QaReleaseIdentityInput): string[] {
  const errors: string[] = [];
  const environment = String(input.environment ?? "").trim().toLowerCase();
  const deploymentId = String(input.deploymentId ?? "").trim();
  const qaProjectRef = String(input.qaProjectRef ?? "").trim().toLowerCase();
  const productionProjectRef = String(input.productionProjectRef ?? "").trim().toLowerCase();
  const linkedProjectRef = String(input.linkedProjectRef ?? "").trim().toLowerCase();
  const confirmation = String(input.confirmation ?? "").trim();

  if (environment !== "qa") errors.push("environment_not_qa");
  if (deploymentId !== HYDROQUALISENSE_QA_DEPLOYMENT_ID) errors.push("deployment_id_mismatch");
  if (qaProjectRef !== HYDROQUALISENSE_QA_PROJECT_REF) errors.push("qa_project_ref_mismatch");
  if (productionProjectRef !== HYDROQUALISENSE_PRODUCTION_PROJECT_REF) errors.push("production_project_ref_mismatch");
  if (!qaProjectRef || qaProjectRef === productionProjectRef) errors.push("qa_target_is_production");
  if (!linkedProjectRef) errors.push("linked_project_missing");
  else if (linkedProjectRef !== qaProjectRef) errors.push("linked_project_ref_mismatch");
  if (linkedProjectRef === productionProjectRef) errors.push("linked_project_is_production");
  if (confirmation !== QA_DATABASE_PUSH_CONFIRMATION) errors.push("missing_explicit_qa_confirmation");
  return [...new Set(errors)];
}
