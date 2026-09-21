import {
  estimateTypeSafePayload,
  type TypeSafePreflightReason,
} from "./requestPrimitives.ts";
import { MAX_TYPESAFE_PAYLOAD_CHARS } from "./sanitize.ts";

export interface TypeSafeBudgetChunk<T> {
  readonly index: number;
  readonly items: readonly T[];
  readonly serializedChars: number;
  readonly preflightRejected: boolean;
  readonly preflightReason?: TypeSafePreflightReason;
}

export interface TypeSafeBudgetChunkOptions<T> {
  readonly maxChars?: number;
  /** A secondary safety guard; serialized budget remains the primary bound. */
  readonly maxItems?: number;
  readonly buildPayload: (items: readonly T[]) => unknown;
}

function validBudget(value: number | undefined): number {
  const budget = value ?? MAX_TYPESAFE_PAYLOAD_CHARS;
  if (!Number.isInteger(budget) || budget <= 0 || budget > MAX_TYPESAFE_PAYLOAD_CHARS) {
    throw new Error(`maxChars must be a positive integer no greater than ${MAX_TYPESAFE_PAYLOAD_CHARS}.`);
  }
  return budget;
}

function validMaxItems(value: number | undefined): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isInteger(value) || value <= 0) throw new Error("maxItems must be a positive integer.");
  return value;
}

function estimateChunk<T>(items: readonly T[], buildPayload: (items: readonly T[]) => unknown): { readonly serializedChars: number; readonly reason?: TypeSafePreflightReason } {
  const estimate = estimateTypeSafePayload(buildPayload(items));
  if (estimate.ok === false) return { serializedChars: Number.MAX_SAFE_INTEGER, reason: estimate.reason };
  return { serializedChars: estimate.serializedChars };
}

/**
 * Splits an ordered sequence using the exact serialized envelope size. Items
 * are never re-ordered, duplicated, or silently discarded.
 */
export function chunkBySerializedBudget<T>(
  values: readonly T[],
  options: TypeSafeBudgetChunkOptions<T>,
): readonly TypeSafeBudgetChunk<T>[] {
  const maxChars = validBudget(options.maxChars);
  const maxItems = validMaxItems(options.maxItems);
  const chunks: TypeSafeBudgetChunk<T>[] = [];
  let current: T[] = [];

  const pushCurrent = (): void => {
    if (current.length === 0) return;
    const estimate = estimateChunk(current, options.buildPayload);
    chunks.push({
      index: chunks.length,
      items: [...current],
      serializedChars: estimate.serializedChars,
      preflightRejected: Boolean(estimate.reason) || estimate.serializedChars > maxChars,
      ...(estimate.reason ? { preflightReason: estimate.reason } : estimate.serializedChars > maxChars ? { preflightReason: "oversized" as const } : {}),
    });
    current = [];
  };

  for (const value of values) {
    const proposed = [...current, value];
    const estimate = estimateChunk(proposed, options.buildPayload);
    const exceedsItemGuard = maxItems !== undefined && proposed.length > maxItems;
    if (current.length > 0 && (estimate.reason || estimate.serializedChars > maxChars || exceedsItemGuard)) {
      pushCurrent();
      current = [value];
      const singleEstimate = estimateChunk(current, options.buildPayload);
      if (singleEstimate.reason || singleEstimate.serializedChars > maxChars) {
        chunks.push({
          index: chunks.length,
          items: [...current],
          serializedChars: singleEstimate.serializedChars,
          preflightRejected: true,
          preflightReason: singleEstimate.reason || "oversized",
        });
        current = [];
      }
      continue;
    }
    current = proposed;
  }
  pushCurrent();
  return chunks;
}
