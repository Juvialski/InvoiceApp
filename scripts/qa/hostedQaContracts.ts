import { createHash, randomUUID } from "node:crypto";
import {
  getEngineeringDocumentStoragePath,
  isEngineeringDocumentStoragePathForRevision,
} from "../../src/lib/engineeringDocumentsPersistence.ts";
import { normalizeErrorMessage, redactSensitiveText } from "./structuredEvidence.ts";

export const HOSTED_QA_ROUTE_READINESS_TIMEOUT_MS = 30_000;
export const HOSTED_QA_ROUTE_READINESS_POLL_MS = 100;
export const HOSTED_QA_ROUTE_LOADING_MARKERS = [
  "Loading HydroQualiSense",
  "Loading company access",
  "Checking your workspace session",
  "Loading workspace",
] as const;

export const HOSTED_QA_DEPLOYMENT_READY_TIMEOUT_MS = 10 * 60_000;
export const HOSTED_QA_DEPLOYMENT_READY_POLL_MS = 15_000;

export type HostedQaRouteReadinessState = "loading" | "resolved";

/**
 * The authenticated application deliberately renders loading-only shells
 * while app bootstrap, auth, and deployment-company access are being resolved.
 * Route assertions must not interpret those shells as resolved application UI.
 */
export function hostedQaRouteReadinessState(bodyText: unknown): HostedQaRouteReadinessState {
  const text = typeof bodyText === "string" ? bodyText : "";
  if (!text.trim() || HOSTED_QA_ROUTE_LOADING_MARKERS.some((marker) => text.includes(marker))) {
    return "loading";
  }
  return "resolved";
}

export interface HostedQaReadinessPage {
  waitForFunction: (...args: any[]) => Promise<unknown>;
}

/** Wait for the application shell to leave app/auth/company initialization. */
export async function waitForHostedQaRouteReadiness(
  page: HostedQaReadinessPage,
  timeoutMs = HOSTED_QA_ROUTE_READINESS_TIMEOUT_MS,
): Promise<void> {
  const boundedTimeoutMs = Number.isFinite(timeoutMs) ? Math.max(1, Math.trunc(timeoutMs)) : HOSTED_QA_ROUTE_READINESS_TIMEOUT_MS;
  await page.waitForFunction(
    (loadingMarkers: readonly string[]) => {
      const text = document.body?.innerText || "";
      return Boolean(text.trim()) && !loadingMarkers.some((marker) => text.includes(marker));
    },
    [...HOSTED_QA_ROUTE_LOADING_MARKERS],
    { timeout: boundedTimeoutMs, polling: HOSTED_QA_ROUTE_READINESS_POLL_MS },
  );
}

export interface HostedQaHealthExpectation {
  environment: "qa";
  deploymentId: string;
  repositorySha: string;
  migrationLevel: string;
}

export interface HostedQaHealthSnapshot {
  httpStatus: number | null;
  release: Record<string, unknown> | null;
  failure?: string;
}

export function hostedQaHealthFailureReasons(
  snapshot: HostedQaHealthSnapshot,
  expected: HostedQaHealthExpectation,
): string[] {
  if (!snapshot.release || snapshot.httpStatus === null || snapshot.httpStatus < 200 || snapshot.httpStatus >= 400) {
    return ["health_unavailable"];
  }

  const reasons: string[] = [];
  if (snapshot.release.environment !== expected.environment) reasons.push("environment_not_qa");
  if (String(snapshot.release.deploymentId || "") !== expected.deploymentId) reasons.push("deployment_id_mismatch");
  if (String(snapshot.release.repositorySha || "").toLowerCase() !== expected.repositorySha.toLowerCase()) reasons.push("repository_sha_mismatch");
  if (String(snapshot.release.migrationLevel || "") !== expected.migrationLevel) reasons.push("migration_level_mismatch");
  return reasons;
}

export interface HostedQaHealthReadiness {
  status: "PASS" | "TIMEOUT" | "FAIL";
  attempts: number;
  waitedMs: number;
  snapshot: HostedQaHealthSnapshot;
  failureReasons: string[];
}

/**
 * Wait for the exact QA deployment identity instead of asserting against an
 * older Render release. Environment and deployment mismatches fail fast;
 * transient health, SHA, and migration mismatches receive a bounded poll.
 */
export async function waitForHostedQaHealth(
  read: () => Promise<HostedQaHealthSnapshot>,
  expected: HostedQaHealthExpectation,
  options: {
    timeoutMs?: number;
    pollMs?: number;
    now?: () => number;
    sleep?: (milliseconds: number) => Promise<void>;
  } = {},
): Promise<HostedQaHealthReadiness> {
  const timeoutMs = Number.isFinite(options.timeoutMs) ? Math.max(1, Math.trunc(options.timeoutMs as number)) : HOSTED_QA_DEPLOYMENT_READY_TIMEOUT_MS;
  const pollMs = Number.isFinite(options.pollMs) ? Math.max(1, Math.trunc(options.pollMs as number)) : HOSTED_QA_DEPLOYMENT_READY_POLL_MS;
  const now = options.now || Date.now;
  const sleep = options.sleep || ((milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));
  const startedAt = now();
  let attempts = 0;
  let snapshot = await read();

  while (true) {
    attempts += 1;
    const failureReasons = hostedQaHealthFailureReasons(snapshot, expected);
    if (failureReasons.length === 0) {
      return { status: "PASS", attempts, waitedMs: Math.max(0, now() - startedAt), snapshot, failureReasons: [] };
    }

    const waitedMs = Math.max(0, now() - startedAt);
    const failFast = failureReasons.includes("environment_not_qa") || failureReasons.includes("deployment_id_mismatch");
    if (failFast || waitedMs >= timeoutMs) {
      const finalReasons = [...failureReasons];
      if (!failFast && failureReasons.includes("repository_sha_mismatch")) finalReasons.push("qa_deployment_not_ready_for_expected_sha");
      return { status: failFast ? "FAIL" : "TIMEOUT", attempts, waitedMs, snapshot, failureReasons: finalReasons };
    }

    await sleep(Math.min(pollMs, timeoutMs - waitedMs));
    snapshot = await read();
  }
}

/** The hosted certification harness may only target the isolated QA host. */
export function assertHostedQaTarget(baseUrl: string, allowNonQaHost = false): void {
  const parsed = new URL(baseUrl);
  if (parsed.protocol !== "https:" && !allowNonQaHost) {
    throw new Error("Hosted QA requires an HTTPS QA target. Set QA_E2E_ALLOW_NON_QA_HOST=1 only for an explicit local harness run.");
  }
  if (/hydroqualisense\.com$/i.test(parsed.hostname) || /production/i.test(parsed.hostname)) {
    throw new Error("Hosted QA refuses the production host.");
  }
  if (!/-qa\.onrender\.com$/i.test(parsed.hostname) && !allowNonQaHost) {
    throw new Error("Hosted QA refuses an unapproved host; expected a -qa.onrender.com deployment.");
  }
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function requireUuid(value: string, label: string): string {
  const normalized = value.trim();
  if (!UUID_PATTERN.test(normalized)) throw new Error(`${label} must be a UUID for the Engineering Documents Storage contract.`);
  return normalized;
}

export interface HostedQaEngineeringStorageFixture {
  companyId: string;
  documentId: string;
  revisionId: string;
  fileName: string;
  objectPath: string;
}

/**
 * Construct the same immutable path shape used by the Engineering Documents
 * upload helper.  A fixture never creates metadata rows by itself.
 */
export function createHostedQaEngineeringStorageFixture(
  companyId: string,
  options: {
    documentId?: string;
    revisionId?: string;
    fileName?: string;
    uniqueSuffix?: string;
  } = {},
): HostedQaEngineeringStorageFixture {
  const normalizedCompanyId = requireUuid(companyId, "Company ID");
  const documentId = requireUuid(options.documentId || randomUUID(), "Engineering document ID");
  const revisionId = requireUuid(options.revisionId || randomUUID(), "Engineering revision ID");
  const suffix = (options.uniqueSuffix || `${Date.now()}-${randomUUID().slice(0, 8)}`)
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, "-");
  const requestedFileName = options.fileName?.trim() || `qa-hosted-engineering-${suffix}.pdf`;
  if (!requestedFileName.toLowerCase().endsWith(".pdf")) {
    throw new Error("Hosted QA Engineering Documents fixtures must use PDF file names.");
  }

  const objectPath = getEngineeringDocumentStoragePath(normalizedCompanyId, documentId, revisionId, requestedFileName);
  const fileName = objectPath.split("/").at(-1) || requestedFileName;
  if (!isEngineeringDocumentStoragePathForRevision(objectPath, normalizedCompanyId, documentId, revisionId)) {
    throw new Error("Hosted QA could not construct a canonical Engineering Documents Storage path.");
  }
  return { companyId: normalizedCompanyId, documentId, revisionId, fileName, objectPath };
}

export type HostedQaStorageFailureOperation = "configuration" | "session" | "company" | "upload" | "download" | "cleanup";

export interface HostedQaStorageFailure {
  operation: HostedQaStorageFailureOperation;
  classification: string;
  code: string | null;
  message: string;
}

function redactHostedQaStorageText(value: unknown, fallback: string): string {
  return redactSensitiveText(normalizeErrorMessage(value, fallback))
    .replace(/((?:access|refresh)[_-]?token|authorization|session(?:[_-]?(?:id|token))?|password|secret|(?:service[_-]?role|publishable|anon)[_-]?key|api[_-]?key)\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s,;}]+)/gi, "$1=[REDACTED]")
    .replace(/\bBearer\s+[^\s]+/gi, "Bearer [REDACTED]")
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "[REDACTED_JWT]");
}

function safeProviderCode(value: unknown): string | null {
  const raw = typeof value === "number" ? String(value) : typeof value === "string" ? value.trim() : "";
  if (!raw || raw.length > 80 || /bearer|token|secret|password|authorization|api[_-]?key|service[_-]?role|publishable|anon[_-]?key|jwt/i.test(raw)) return null;
  return /^[A-Za-z0-9][A-Za-z0-9_.:-]*$/.test(raw) ? raw : null;
}

export function createHostedQaStorageFailure(
  operation: HostedQaStorageFailureOperation,
  classification: string,
  code: string | null,
  message: unknown,
  fallback = "Hosted QA Storage probe failed.",
): HostedQaStorageFailure {
  return {
    operation,
    classification,
    code: safeProviderCode(code),
    message: redactHostedQaStorageText(message, fallback),
  };
}

/** Keep provider diagnostics useful without persisting auth/session material. */
export function sanitizeHostedQaStorageError(
  operation: HostedQaStorageFailureOperation,
  error: unknown,
  fallback = "Hosted QA Storage provider request failed.",
): HostedQaStorageFailure {
  const record = error && typeof error === "object" ? error as Record<string, unknown> : null;
  const statusValue = record?.statusCode ?? record?.status;
  const numericStatus = typeof statusValue === "number"
    ? Math.trunc(statusValue)
    : typeof statusValue === "string" && /^\d{3}$/.test(statusValue.trim())
      ? Number(statusValue.trim())
      : null;
  const code = safeProviderCode(statusValue) || safeProviderCode(record?.code) || safeProviderCode(record?.error);
  const classification = numericStatus !== null ? `http-${numericStatus}` : code ? "provider-error" : "unknown-error";
  return createHostedQaStorageFailure(operation, classification, code, record?.message ?? error, fallback);
}

export interface HostedQaStorageBucketLike {
  upload: (
    path: string,
    body: Uint8Array,
    options: { contentType: "application/pdf"; upsert: false },
  ) => Promise<{ error?: unknown | null }>;
  download: (path: string) => Promise<{ data?: { arrayBuffer: () => Promise<ArrayBuffer> } | null; error?: unknown | null }>;
  remove: (paths: string[]) => Promise<{ error?: unknown | null }>;
}

export interface HostedQaStorageObjectProbeResult {
  status: "PASS" | "FAIL";
  byteCount?: number;
  sha256: string;
  downloadedSha256?: string;
  authorizedRead?: boolean;
  cleanup: "PASS" | "FAIL" | "NOT_RUN";
  failure?: HostedQaStorageFailure;
  cleanupFailure?: HostedQaStorageFailure;
}

function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) return false;
  for (let index = 0; index < left.byteLength; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

/** Upload, read, hash-verify, and always compensate the temporary object. */
export async function probeHostedQaStorageObject(input: {
  bucket: HostedQaStorageBucketLike;
  objectPath: string;
  bytes: Uint8Array;
}): Promise<HostedQaStorageObjectProbeResult> {
  const expectedSha256 = sha256Hex(input.bytes);
  let outcome: HostedQaStorageObjectProbeResult = {
    status: "FAIL",
    sha256: expectedSha256,
    cleanup: "NOT_RUN",
  };
  let uploaded = false;
  let operation: HostedQaStorageFailureOperation = "upload";
  let cleanup: HostedQaStorageObjectProbeResult["cleanup"] = "NOT_RUN";
  let cleanupFailure: HostedQaStorageFailure | undefined;

  try {
    const uploadedResult = await input.bucket.upload(input.objectPath, input.bytes, { contentType: "application/pdf", upsert: false });
    if (uploadedResult.error) {
      outcome = {
        ...outcome,
        failure: sanitizeHostedQaStorageError("upload", uploadedResult.error, "Authorized Engineering Documents Storage upload failed."),
      };
    } else {
      uploaded = true;
      operation = "download";
      const downloadedResult = await input.bucket.download(input.objectPath);
      if (downloadedResult.error || !downloadedResult.data) {
        outcome = {
          ...outcome,
          authorizedRead: false,
          failure: downloadedResult.error
            ? sanitizeHostedQaStorageError("download", downloadedResult.error, "Authorized Engineering Documents Storage download failed.")
            : createHostedQaStorageFailure("download", "provider-error", "MISSING_RESPONSE", "Authorized Engineering Documents Storage download returned no bytes."),
        };
      } else {
        const downloadedBytes = new Uint8Array(await downloadedResult.data.arrayBuffer());
        const downloadedSha256 = sha256Hex(downloadedBytes);
        const readMatches = bytesEqual(downloadedBytes, input.bytes) && downloadedSha256 === expectedSha256;
        outcome = {
          status: readMatches ? "PASS" : "FAIL",
          byteCount: downloadedBytes.byteLength,
          sha256: expectedSha256,
          downloadedSha256,
          authorizedRead: readMatches,
          cleanup: "NOT_RUN",
          ...(readMatches ? {} : {
            failure: createHostedQaStorageFailure(
              "download",
              "integrity-error",
              "BYTE_MISMATCH",
              "Downloaded Storage bytes did not match the uploaded synthetic PDF.",
            ),
          }),
        };
      }
    }
  } catch (error) {
    outcome = {
      ...outcome,
      failure: sanitizeHostedQaStorageError(operation, error),
    };
  } finally {
    if (uploaded) {
      operation = "cleanup";
      try {
        const removedResult = await input.bucket.remove([input.objectPath]);
        if (removedResult.error) {
          cleanup = "FAIL";
          cleanupFailure = sanitizeHostedQaStorageError("cleanup", removedResult.error, "Temporary Engineering Documents Storage cleanup failed.");
        } else {
          cleanup = "PASS";
        }
      } catch (error) {
        cleanup = "FAIL";
        cleanupFailure = sanitizeHostedQaStorageError("cleanup", error, "Temporary Engineering Documents Storage cleanup failed.");
      }
    }
  }

  const result: HostedQaStorageObjectProbeResult = {
    ...outcome,
    status: cleanup === "FAIL" ? "FAIL" : outcome.status,
    cleanup,
    ...(cleanupFailure ? { cleanupFailure } : {}),
  };
  return result;
}
