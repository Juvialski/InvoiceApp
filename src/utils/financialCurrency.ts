import type {
  FinancialFxSnapshot,
  FinancialFxSourceType,
} from "../types.ts";
import { formatMoney } from "../config/regional.ts";

export function normalizeFinancialCurrency(value?: string) {
  return String(value || "").trim().toUpperCase() || "UNKNOWN";
}

export function roundFinancialAmount(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.round(numeric * 100) / 100 : 0;
}

export function findFinancialFxSnapshot(
  snapshots: readonly FinancialFxSnapshot[] | undefined,
  sourceType: FinancialFxSourceType,
  sourceId: string | undefined,
) {
  if (!sourceId) return undefined;
  return snapshots?.find((snapshot) => snapshot.sourceType === sourceType && snapshot.sourceId === sourceId);
}

/**
 * Return a source amount in the requested reporting currency only when the
 * source has a matching immutable conversion snapshot. A source amount is
 * never treated as another currency merely because a report is labelled PHP.
 */
export function convertFinancialAmount(
  amount: unknown,
  sourceCurrency: string | undefined,
  targetCurrency: string | undefined,
  sourceType: FinancialFxSourceType,
  sourceId: string | undefined,
  snapshots: readonly FinancialFxSnapshot[] | undefined,
) {
  const value = roundFinancialAmount(Math.max(0, Number(amount) || 0));
  const source = normalizeFinancialCurrency(sourceCurrency);
  const target = normalizeFinancialCurrency(targetCurrency);
  if (!value || source === target) return value;

  const snapshot = findFinancialFxSnapshot(snapshots, sourceType, sourceId);
  if (!snapshot
    || normalizeFinancialCurrency(snapshot.sourceCurrency) !== source
    || normalizeFinancialCurrency(snapshot.baseCurrency) !== target
    || !Number.isFinite(Number(snapshot.rate))
    || Number(snapshot.rate) <= 0
    || !Number.isFinite(Number(snapshot.sourceAmount))
    || Number(snapshot.sourceAmount) < value - 0.01) {
    return undefined;
  }

  // Full-record reporting uses the persisted rounded snapshot. Partial
  // allocations use the same frozen rate without inventing a second rate.
  if (Math.abs(Number(snapshot.sourceAmount) - value) <= 0.01) return roundFinancialAmount(snapshot.baseAmount);
  return roundFinancialAmount(value * Number(snapshot.rate));
}

export interface FinancialConversionFallback {
  sourceCurrency: string | undefined;
  sourceType: FinancialFxSourceType;
  sourceId: string | undefined;
}

/**
 * Use the record's own immutable conversion first, then an explicitly linked
 * source record's snapshot. A missing snapshot remains unresolved; no live or
 * guessed FX rate is ever applied.
 */
export function convertFinancialAmountWithFallback(
  amount: unknown,
  sourceCurrency: string | undefined,
  targetCurrency: string | undefined,
  sourceType: FinancialFxSourceType,
  sourceId: string | undefined,
  snapshots: readonly FinancialFxSnapshot[] | undefined,
  fallback?: FinancialConversionFallback,
) {
  return convertFinancialAmount(amount, sourceCurrency, targetCurrency, sourceType, sourceId, snapshots)
    ?? (fallback ? convertFinancialAmount(amount, fallback.sourceCurrency, targetCurrency, fallback.sourceType, fallback.sourceId, snapshots) : undefined);
}

export function hasFinancialFxSnapshot(
  amount: unknown,
  sourceCurrency: string | undefined,
  targetCurrency: string | undefined,
  sourceType: FinancialFxSourceType,
  sourceId: string | undefined,
  snapshots: readonly FinancialFxSnapshot[] | undefined,
) {
  return convertFinancialAmount(amount, sourceCurrency, targetCurrency, sourceType, sourceId, snapshots) !== undefined;
}

export interface PhpDisplayAmount {
  baseAmount?: number;
  baseLabel: string;
  sourceLabel?: string;
  requiresFx: boolean;
}

/**
 * Render a source amount in PHP only when the exact immutable FX evidence is
 * available. The source label remains visible so conversion never erases the
 * original currency context.
 */
export function displayFinancialAmountInPhp(
  amount: unknown,
  sourceCurrency: string | undefined,
  sourceType: FinancialFxSourceType,
  sourceId: string | undefined,
  snapshots: readonly FinancialFxSnapshot[] | undefined,
): PhpDisplayAmount {
  const value = roundFinancialAmount(Math.max(0, Number(amount) || 0));
  const source = normalizeFinancialCurrency(sourceCurrency);
  const converted = convertFinancialAmount(value, source, "PHP", sourceType, sourceId, snapshots);
  const sourceLabel = source !== "PHP" && source !== "UNKNOWN" ? `Source ${formatMoney(value, source)}` : undefined;
  if (converted === undefined) {
    return { baseLabel: "PHP conversion required", ...(sourceLabel ? { sourceLabel } : {}), requiresFx: true };
  }
  return { baseAmount: converted, baseLabel: formatMoney(converted, "PHP"), ...(sourceLabel ? { sourceLabel } : {}), requiresFx: false };
}
