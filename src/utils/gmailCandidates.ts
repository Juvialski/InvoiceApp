import type { GmailMessageCandidate } from "../types.ts";

/**
 * Incremental Gmail history contains only new or changed messages. Preserve
 * the visible review queue while merging by provider message id, and do not
 * reset a candidate that is already importing, imported, or failed.
 */
export function mergeGmailCandidates(
  existing: readonly GmailMessageCandidate[],
  discovered: readonly GmailMessageCandidate[],
): GmailMessageCandidate[] {
  const merged = new Map(existing.map((candidate) => [candidate.id, candidate]));
  for (const candidate of discovered) {
    const previous = merged.get(candidate.id);
    const existingStatus = previous?.importStatus;
    merged.set(candidate.id, existingStatus && existingStatus !== "READY"
      ? { ...candidate, importStatus: existingStatus }
      : candidate);
  }
  return [...merged.values()];
}
