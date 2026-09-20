import { classifyTrackedPath } from "../../repository-intelligence/classification.ts";

export const MAX_TYPESAFE_PAYLOAD_CHARS = 20_000;

export interface SanitizedTypeSafePayload {
  readonly ok: true;
  readonly value: unknown;
  readonly serialized: string;
}

export interface RejectedTypeSafePayload {
  readonly ok: false;
  readonly reason: "invalid-json" | "oversized" | "sensitive-path" | "sensitive-pattern";
}

export type TypeSafePayloadSanitization = SanitizedTypeSafePayload | RejectedTypeSafePayload;

const SENSITIVE_KEY_PATTERN = /(?:api[-_]?key|access[-_]?token|auth(?:orization)?|credential|connection(?:[-_]?string)?|password|private[-_]?key|secret|service[-_]?role|token)/i;
const SENSITIVE_PATH_PATTERN = /(?:^|\/)(?:artifacts?|credentials?|customer(?:-data)?|downloads?|invoices?|logs?|payroll|personnel|private[-_]?keys?|production|qa|receipts?|secrets?|sessions?|uploads?)(?:\/|$)/i;
const SENSITIVE_VALUE_PATTERNS: readonly RegExp[] = [
  /-----BEGIN [^-]*PRIVATE KEY-----/i,
  /\b(?:TYPESAFE_API_KEY|SUPABASE_SERVICE_ROLE_KEY|DATABASE_URL|CONNECTION_STRING)\s*[:=]/i,
  /\b(?:authorization|bearer)\s+[A-Za-z0-9._~+/=-]{8,}/i,
  /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?):\/\/[^\s]+/i,
  /\b(?:sk_live|ghp_|xox[baprs]-|sbp_)[A-Za-z0-9_-]{8,}/i,
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sensitivePath(value: string): boolean {
  const normalized = value.replaceAll("\\", "/").trim();
  if (!normalized) return false;
  if (SENSITIVE_PATH_PATTERN.test(normalized)) return true;
  const classification = classifyTrackedPath(normalized);
  return !classification.eligible && classification.exclusionReason !== "binary artifact";
}

function sensitiveValue(value: string): boolean {
  return SENSITIVE_VALUE_PATTERNS.some((pattern) => pattern.test(value));
}

function containsSensitiveValue(value: unknown, key?: string): boolean {
  if (typeof value === "string") {
    if (key && SENSITIVE_KEY_PATTERN.test(key)) return true;
    return sensitiveValue(value);
  }
  if (Array.isArray(value)) return value.some((item) => containsSensitiveValue(item));
  if (!isRecord(value)) return false;
  for (const [entryKey, entryValue] of Object.entries(value)) {
    if (SENSITIVE_KEY_PATTERN.test(entryKey)) return true;
    if (["path", "sourcePath", "filePath", "logPath"].includes(entryKey) && typeof entryValue === "string" && sensitivePath(entryValue)) return true;
    if (containsSensitiveValue(entryValue, entryKey)) return true;
  }
  return false;
}

export function hasTypeSafeApiKey(env: NodeJS.ProcessEnv = process.env): boolean {
  return typeof env.TYPESAFE_API_KEY === "string" && env.TYPESAFE_API_KEY.trim().length > 0;
}

export function sanitizeTypeSafePayload(value: unknown, maxChars = MAX_TYPESAFE_PAYLOAD_CHARS): TypeSafePayloadSanitization {
  if (containsSensitiveValue(value)) return { ok: false, reason: "sensitive-pattern" };
  let serialized: string;
  try {
    serialized = JSON.stringify(value);
  } catch {
    return { ok: false, reason: "invalid-json" };
  }
  if (typeof serialized !== "string") return { ok: false, reason: "invalid-json" };
  if (serialized.length > maxChars) return { ok: false, reason: "oversized" };
  if (sensitiveValue(serialized)) return { ok: false, reason: "sensitive-pattern" };
  return { ok: true, value, serialized };
}
