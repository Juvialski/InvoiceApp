import type { Questions } from "@typesafe-ai/sdk";
import { MAX_TYPESAFE_PAYLOAD_CHARS, isSensitiveTypeSafeTransportKey } from "./sanitize.ts";
import type { TypeSafeSystemOneRequest } from "./contracts.ts";

export type TypeSafePreflightReason = "invalid-json" | "oversized" | "invalid-question-key" | "sensitive-question-key";

export interface TypeSafePayloadEstimate {
  readonly ok: true;
  readonly serialized: string;
  readonly serializedChars: number;
}

export interface TypeSafeInvalidPayloadEstimate {
  readonly ok: false;
  readonly reason: "invalid-json";
}

export type TypeSafePayloadEstimateResult = TypeSafePayloadEstimate | TypeSafeInvalidPayloadEstimate;

export interface PreparedTypeSafeRequest {
  readonly ok: true;
  readonly request: TypeSafeSystemOneRequest;
  readonly serialized: string;
  readonly serializedChars: number;
  readonly aliases: Readonly<Record<string, string>>;
}

export interface RejectedTypeSafeRequest {
  readonly ok: false;
  readonly reason: TypeSafePreflightReason;
  readonly serializedChars?: number;
  readonly aliases: Readonly<Record<string, string>>;
}

export type TypeSafeRequestPreflight = PreparedTypeSafeRequest | RejectedTypeSafeRequest;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function estimateTypeSafePayload(value: unknown): TypeSafePayloadEstimateResult {
  try {
    const serialized = JSON.stringify(value);
    if (typeof serialized !== "string") return { ok: false, reason: "invalid-json" };
    return { ok: true, serialized, serializedChars: serialized.length };
  } catch {
    return { ok: false, reason: "invalid-json" };
  }
}

const SAFE_TRANSPORT_KEY_PATTERN = /^[A-Za-z][A-Za-z0-9_-]{0,95}$/;
const ALIASABLE_AUTHORITY_SEGMENT = /(^|[_-])(?:authority|authorization|authorisation|auth)(?=$|[_-])/gi;

function aliasAuthoritySegment(key: string): string | undefined {
  const aliased = key.replace(ALIASABLE_AUTHORITY_SEGMENT, "$1boundary");
  if (aliased === key || !SAFE_TRANSPORT_KEY_PATTERN.test(aliased) || isSensitiveTypeSafeTransportKey(aliased)) return undefined;
  return aliased;
}

function uniqueTransportKey(baseKey: string, used: ReadonlySet<string>): string | undefined {
  let candidate = baseKey;
  let suffix = 1;
  while (used.has(candidate)) {
    candidate = `${baseKey}_${suffix}`;
    suffix += 1;
    if (!SAFE_TRANSPORT_KEY_PATTERN.test(candidate) || isSensitiveTypeSafeTransportKey(candidate)) return undefined;
  }
  return candidate;
}

function transportKeyFor(key: string, used: ReadonlySet<string>): { readonly key?: string; readonly reason?: TypeSafePreflightReason } {
  if (!SAFE_TRANSPORT_KEY_PATTERN.test(key)) return { reason: "invalid-question-key" };
  if (!isSensitiveTypeSafeTransportKey(key)) {
    const unique = uniqueTransportKey(key, used);
    return unique ? { key: unique } : { reason: "invalid-question-key" };
  }
  const aliased = aliasAuthoritySegment(key);
  if (!aliased) return { reason: "sensitive-question-key" };
  const unique = uniqueTransportKey(aliased, used);
  return unique ? { key: unique } : { reason: "invalid-question-key" };
}

function prepareQuestions(questions: Questions | Record<string, unknown>):
  | { readonly ok: true; readonly questions: Record<string, unknown>; readonly aliases: Readonly<Record<string, string>> }
  | { readonly ok: false; readonly reason: TypeSafePreflightReason } {
  if (!isRecord(questions)) return { ok: false, reason: "invalid-question-key" };
  const prepared: Record<string, unknown> = {};
  const aliases: Record<string, string> = {};
  const used = new Set<string>();
  for (const [key, value] of Object.entries(questions)) {
    const result = transportKeyFor(key, used);
    if (!result.key) return { ok: false, reason: result.reason || "invalid-question-key" };
    prepared[result.key] = value;
    used.add(result.key);
    if (result.key !== key) aliases[key] = result.key;
  }
  if (Object.keys(prepared).length === 0) return { ok: false, reason: "invalid-question-key" };
  return { ok: true, questions: prepared, aliases };
}

export function prepareTypeSafeRequest(
  request: TypeSafeSystemOneRequest,
  options: { readonly maxChars?: number } = {},
): TypeSafeRequestPreflight {
  const questionResult = prepareQuestions(request.questions);
  if (questionResult.ok === false) return { ok: false, reason: questionResult.reason, aliases: {} };
  const preparedRequest: TypeSafeSystemOneRequest = {
    state: request.state,
    questions: questionResult.questions,
  };
  const estimate = estimateTypeSafePayload(preparedRequest);
  if (estimate.ok === false) return { ok: false, reason: estimate.reason, aliases: questionResult.aliases };
  const maxChars = options.maxChars === undefined ? MAX_TYPESAFE_PAYLOAD_CHARS : options.maxChars;
  if (!Number.isInteger(maxChars) || maxChars <= 0 || maxChars > MAX_TYPESAFE_PAYLOAD_CHARS) {
    return { ok: false, reason: "oversized", serializedChars: estimate.serializedChars, aliases: questionResult.aliases };
  }
  if (estimate.serializedChars > maxChars) {
    return { ok: false, reason: "oversized", serializedChars: estimate.serializedChars, aliases: questionResult.aliases };
  }
  return {
    ok: true,
    request: preparedRequest,
    serialized: estimate.serialized,
    serializedChars: estimate.serializedChars,
    aliases: questionResult.aliases,
  };
}

export function remapTypeSafeAnswers(value: unknown, aliases: Readonly<Record<string, string>>): unknown {
  if (!isRecord(value) || !isRecord(value.answers) || Object.keys(aliases).length === 0) return value;
  const reverseAliases = new Map(Object.entries(aliases).map(([original, transport]) => [transport, original]));
  const answers = Object.fromEntries(Object.entries(value.answers).map(([key, answer]) => [reverseAliases.get(key) || key, answer]));
  return { ...value, answers };
}
