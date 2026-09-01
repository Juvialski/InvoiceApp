/**
 * Canonical target object-key builder and parser preserving company scoping.
 * Provides path traversal prevention, filename sanitization, and legacy path recognition.
 */

const SAFE_SEGMENT_REGEX = /^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const WINDOWS_RESERVED_NAMES = new Set([
  "con", "prn", "aux", "nul",
  "com1", "com2", "com3", "com4", "com5", "com6", "com7", "com8", "com9",
  "lpt1", "lpt2", "lpt3", "lpt4", "lpt5", "lpt6", "lpt7", "lpt8", "lpt9",
]);

export type StorageKeyKind =
  | "TARGET_CANONICAL"
  | "LEGACY_INVOICE_MANUAL"
  | "LEGACY_INVOICE_EMAIL"
  | "LEGACY_EMAIL_EML"
  | "LEGACY_PAYROLL_IMPORT"
  | "LEGACY_ENGINEERING_REVISION"
  | "LEGACY_USER_SCOPED"
  | "UNKNOWN_COMPANY_SCOPED"
  | "INVALID";

export interface ParsedStorageKey {
  kind: StorageKeyKind;
  isValid: boolean;
  rawPath: string;
  companyId?: string;
  legacyUserId?: string;
  documentId?: string;
  versionOrHash?: string;
  fileName?: string;
  subdomain?: string;
  segments: string[];
}

/**
 * Sanitize a filename to prevent path traversal, hidden files, Windows device names,
 * and dangerous characters while preserving a clean base name and valid extension.
 */
export function sanitizeStorageFileName(rawName: string, fallback = "document.bin"): string {
  if (!rawName || typeof rawName !== "string") return fallback;

  // Decode URI components if encoded to catch %2e%2e%2f tricks
  let decoded = rawName;
  try {
    decoded = decodeURIComponent(rawName);
  } catch {
    decoded = rawName;
  }

  // Strip null bytes and control characters
  let cleaned = decoded
    .replace(/\0/g, "")
    .replace(/[\u0001-\u001f\u007f-\u009f]/g, "")
    .trim();

  // Extract basename by splitting on all path separators (/ and \)
  const parts = cleaned.split(/[\\/]/).filter(Boolean);
  const baseName = parts.pop() || "";

  // Strip leading dots to prevent hidden files (.env, .htaccess, ..)
  let nameWithoutLeadingDots = baseName.replace(/^\.+/, "").trim();
  if (!nameWithoutLeadingDots) return fallback;

  // Replace disallowed characters with underscore
  let normalized = nameWithoutLeadingDots.replace(/[^a-zA-Z0-9._-]/g, "_");

  // Collapse multiple underscores or dashes
  normalized = normalized.replace(/_+/g, "_").replace(/-+/g, "-");

  // Check Windows reserved names
  const extIndex = normalized.lastIndexOf(".");
  const stem = (extIndex >= 0 ? normalized.slice(0, extIndex) : normalized).toLowerCase();
  if (WINDOWS_RESERVED_NAMES.has(stem)) {
    normalized = `file_${normalized}`;
  }

  // Truncate to safe length (max 180 chars) preserving extension
  if (normalized.length > 180) {
    if (extIndex > 0) {
      const ext = normalized.slice(extIndex);
      const safeStem = normalized.slice(0, Math.max(1, 180 - ext.length));
      normalized = `${safeStem}${ext}`;
    } else {
      normalized = normalized.slice(0, 180);
    }
  }

  return normalized || fallback;
}

/**
 * Validate and normalize a single path segment (e.g. companyId, documentId).
 * Throws if the segment contains path traversal characters or invalid patterns.
 */
export function assertSafeStorageSegment(value: string, label = "Storage path segment"): string {
  const normalized = String(value || "").trim();
  if (!normalized) throw new Error(`${label} must not be empty.`);
  if (normalized === "." || normalized === ".." || normalized.includes("/") || normalized.includes("\\")) {
    throw new Error(`${label} contains path traversal characters.`);
  }
  if (!SAFE_SEGMENT_REGEX.test(normalized)) {
    throw new Error(`${label} contains unsafe path characters.`);
  }
  return normalized;
}

/**
 * Build a canonical target object key scoped to a company:
 * `companies/<companyId>/objects/<documentId>/<versionOrHash>/<safeFileName>`
 */
export function buildCanonicalTargetKey(options: {
  companyId: string;
  documentId: string;
  versionOrHash: string;
  fileName?: string;
}): string {
  const companyId = assertSafeStorageSegment(options.companyId, "Company ID");
  const documentId = assertSafeStorageSegment(options.documentId, "Document ID");
  const versionOrHash = assertSafeStorageSegment(options.versionOrHash, "Version or hash");
  const safeName = options.fileName ? sanitizeStorageFileName(options.fileName) : undefined;

  const parts = ["companies", companyId, "objects", documentId, versionOrHash];
  if (safeName) parts.push(safeName);
  return parts.join("/");
}

/**
 * Parse any storage path across the Engoryx codebase into a structured record.
 */
export function parseStorageKey(rawPath: string): ParsedStorageKey {
  const normalized = String(rawPath || "").trim();
  if (!normalized) {
    return {
      kind: "INVALID",
      isValid: false,
      rawPath: normalized,
      segments: [],
    };
  }

  // Decode URI components if encoded to catch %2e%2e%2f and %2f tricks
  let decoded = normalized;
  try {
    decoded = decodeURIComponent(normalized);
  } catch {
    decoded = normalized;
  }

  // Check for path traversal attempts in raw and decoded forms
  const checkPaths = [normalized, decoded];
  for (const p of checkPaths) {
    if (
      p.includes("/../") ||
      p.startsWith("../") ||
      p.endsWith("/..") ||
      p.includes("\\..\\") ||
      p.startsWith("..\\") ||
      p.endsWith("\\..") ||
      p.includes("..") ||
      p.includes("\0")
    ) {
      return {
        kind: "INVALID",
        isValid: false,
        rawPath: normalized,
        segments: [],
      };
    }
  }

  const segments = decoded.split(/[\\/]/).filter(Boolean);
  if (segments.length === 0) {
    return {
      kind: "INVALID",
      isValid: false,
      rawPath: normalized,
      segments: [],
    };
  }

  // 1. Company-scoped standard paths: companies/<companyId>/...
  if (segments[0] === "companies" && segments.length >= 2) {
    const companyId = segments[1];

    // Canonical target key: companies/<companyId>/objects/<documentId>/<versionOrHash>[/<fileName>]
    if (segments[2] === "objects" && segments.length >= 5) {
      return {
        kind: "TARGET_CANONICAL",
        isValid: true,
        rawPath: normalized,
        companyId,
        documentId: segments[3],
        versionOrHash: segments[4],
        fileName: segments[5] || undefined,
        segments,
      };
    }

    // Engineering document revision: companies/<companyId>/documents/<documentId>/revisions/<revisionId>/<fileName>
    if (segments[2] === "documents" && segments[4] === "revisions" && segments.length >= 7) {
      return {
        kind: "LEGACY_ENGINEERING_REVISION",
        isValid: true,
        rawPath: normalized,
        companyId,
        documentId: segments[3],
        versionOrHash: segments[5],
        fileName: segments[6],
        subdomain: "documents",
        segments,
      };
    }

    // Payroll import source: companies/<companyId>/payroll-imports/<batchId>/<fileName>
    if (segments[2] === "payroll-imports" && segments.length >= 4) {
      return {
        kind: "LEGACY_PAYROLL_IMPORT",
        isValid: true,
        rawPath: normalized,
        companyId,
        documentId: segments[3],
        fileName: segments[4] || segments[3],
        subdomain: "payroll-imports",
        segments,
      };
    }

    // Manual invoice: companies/<companyId>/invoices/manual/<year>/<month>/<fileName>
    if (segments[2] === "invoices" && segments[3] === "manual" && segments.length >= 6) {
      return {
        kind: "LEGACY_INVOICE_MANUAL",
        isValid: true,
        rawPath: normalized,
        companyId,
        fileName: segments[segments.length - 1],
        subdomain: "invoices",
        segments,
      };
    }

    // Email invoice attachment: companies/<companyId>/invoices/<year>/<month>/<messageToken>/<fileName>
    if (segments[2] === "invoices" && segments.length >= 6) {
      return {
        kind: "LEGACY_INVOICE_EMAIL",
        isValid: true,
        rawPath: normalized,
        companyId,
        fileName: segments[segments.length - 1],
        subdomain: "invoices",
        segments,
      };
    }

    // Raw email message: companies/<companyId>/emails/<year>/<month>/<messageToken>/message.eml
    if (segments[2] === "emails" && segments.length >= 6) {
      return {
        kind: "LEGACY_EMAIL_EML",
        isValid: true,
        rawPath: normalized,
        companyId,
        fileName: segments[segments.length - 1],
        subdomain: "emails",
        segments,
      };
    }

    // Other company-scoped path
    return {
      kind: "UNKNOWN_COMPANY_SCOPED",
      isValid: true,
      rawPath: normalized,
      companyId,
      subdomain: segments[2] || undefined,
      fileName: segments[segments.length - 1],
      segments,
    };
  }

  // 2. Legacy user-scoped paths: <userId>/...
  if (UUID_REGEX.test(segments[0])) {
    return {
      kind: "LEGACY_USER_SCOPED",
      isValid: true,
      rawPath: normalized,
      legacyUserId: segments[0],
      fileName: segments[segments.length - 1],
      segments,
    };
  }

  return {
    kind: "INVALID",
    isValid: false,
    rawPath: normalized,
    segments,
  };
}

/**
 * Check whether a given path is correctly scoped to an expected company.
 */
export function isCompanyScopedPath(path: string, expectedCompanyId?: string): boolean {
  const parsed = parseStorageKey(path);
  if (!parsed.isValid || !parsed.companyId) return false;
  if (expectedCompanyId) {
    return parsed.companyId.toLowerCase() === expectedCompanyId.toLowerCase();
  }
  return true;
}
