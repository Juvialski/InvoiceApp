/**
 * Provider-neutral SHA-256 hashing and document deduplication contracts.
 * Enforces company boundary isolation and distinguishes binary deduplication
 * from logical business provenance.
 */

const SHA256_HEX_REGEX = /^[0-9a-f]{64}$/i;
const SHA256_PREFIX_REGEX = /^sha256:([0-9a-f]{64})$/i;

/**
 * Calculate the SHA-256 hex digest of a byte array using standard Web Crypto API.
 */
export async function calculateSha256Hex(bytes: Uint8Array): Promise<string> {
  if (typeof globalThis.crypto?.subtle !== "undefined") {
    // Note: slice buffer safely to avoid detached or sub-array issues
    const input = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    const digest = await globalThis.crypto.subtle.digest("SHA-256", input);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  // Fallback for Node.js environments without global webcrypto if applicable
  try {
    // Dynamic import to avoid bundling issues in pure browser builds
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const nodeCrypto = await import("node:crypto");
    return nodeCrypto.createHash("sha256").update(bytes).digest("hex");
  } catch {
    throw new Error("SHA-256 calculation is not supported in this runtime environment.");
  }
}

/**
 * Normalize any SHA-256 hash string (e.g. `sha256:<hex>` or `<hex>`) to a lowercase 64-character hex string.
 * Throws if the input is not a valid SHA-256 hash.
 */
export function normalizeSha256(hash: string): string {
  const trimmed = String(hash || "").trim().toLowerCase();
  const match = SHA256_PREFIX_REGEX.exec(trimmed);
  if (match) return match[1];
  if (SHA256_HEX_REGEX.test(trimmed)) return trimmed;
  throw new Error(`Invalid SHA-256 hash format: "${hash}"`);
}

/**
 * Format a SHA-256 hex hash into the standard fingerprint prefix format: `sha256:<hex64>`.
 */
export function formatSha256Fingerprint(hash: string): string {
  const normalized = normalizeSha256(hash);
  return `sha256:${normalized}`;
}

/**
 * Categorization of deduplication actions.
 */
export type DedupAction =
  /** Identical file already exists within the company's document store; logical record can reference existing source. */
  | "REUSE_EXISTING_RECORD"
  /** Binary hash matches, but a distinct logical provenance record must be created (e.g. separate email message or expense). */
  | "CREATE_PROVENANCE_RECORD"
  /** Completely new file: store binary and create new database record. */
  | "STORE_NEW_OBJECT";

export interface DedupContext {
  companyId: string;
  sha256: string;
  entityType: "INVOICE" | "EXPENSE" | "BANK_STATEMENT" | "PAYROLL_IMPORT" | "ENGINEERING_REVISION" | "EMAIL_INTAKE";
  existingRecordId?: string;
  sourceContext?: {
    emailMessageId?: string;
    gmailAttachmentId?: string;
    workerId?: string;
    documentId?: string;
    revisionId?: string;
  };
}

export interface DedupDecision {
  action: DedupAction;
  sha256: string;
  reason: string;
  allowBinarySharing: boolean;
  requiresDistinctProvenance: boolean;
}

/**
 * Evaluate deduplication strategy based on company isolation and domain provenance rules.
 */
export function evaluateDedupStrategy(context: DedupContext): DedupDecision {
  const normalizedHash = normalizeSha256(context.sha256);

  // Invariant 1: Company ID is strictly required
  if (!context.companyId || typeof context.companyId !== "string") {
    throw new Error("Deduplication evaluation requires a valid company ID.");
  }

  // Domain-specific provenance invariants:
  switch (context.entityType) {
    case "ENGINEERING_REVISION":
      // Every revision upload must produce a distinct revision record even if the file fingerprint matches
      // an older revision or draft, because annotations and revision history attach to the specific revision ID.
      // Engineering revisions never reuse existing records.
      return {
        action: "CREATE_PROVENANCE_RECORD",
        sha256: normalizedHash,
        reason: "Engineering document revisions maintain immutable per-revision provenance.",
        allowBinarySharing: false,
        requiresDistinctProvenance: true,
      };

    case "PAYROLL_IMPORT":
      // Payroll batches check for duplicate imports to warn the operator, but each batch has separate staging rows.
      return {
        action: "CREATE_PROVENANCE_RECORD",
        sha256: normalizedHash,
        reason: "Payroll import batches preserve isolated staged import lifecycle.",
        allowBinarySharing: false,
        requiresDistinctProvenance: true,
      };

    case "EMAIL_INTAKE":
    case "BANK_STATEMENT":
    case "EXPENSE":
      // If the exact same document ID was already recorded for this company, it can be linked/reused.
      // If it's a new email message or expense submission, it must retain its provenance record.
      if (context.existingRecordId) {
        return {
          action: "REUSE_EXISTING_RECORD",
          sha256: normalizedHash,
          reason: "Existing company source document found with matching hash.",
          allowBinarySharing: true,
          requiresDistinctProvenance: false,
        };
      }
      return {
        action: "CREATE_PROVENANCE_RECORD",
        sha256: normalizedHash,
        reason: "New business event requires distinct source document provenance record.",
        allowBinarySharing: true,
        requiresDistinctProvenance: true,
      };

    case "INVOICE":
    default:
      if (context.existingRecordId) {
        return {
          action: "REUSE_EXISTING_RECORD",
          sha256: normalizedHash,
          reason: "Existing manual invoice source document found with identical hash.",
          allowBinarySharing: true,
          requiresDistinctProvenance: false,
        };
      }
      return {
        action: "STORE_NEW_OBJECT",
        sha256: normalizedHash,
        reason: "New invoice source document.",
        allowBinarySharing: true,
        requiresDistinctProvenance: true,
      };
  }
}
