import type { InvoiceData } from "../types";

function reviewable(invoice: InvoiceData) {
  return invoice.reviewStatus === "NEEDS_REVIEW" && !invoice.archivedAt && invoice.lifecycleStatus !== "VOID";
}

/**
 * Keeps review navigation deterministic. The workspace stores the ids that
 * were present when the reviewer started, so a verified row disappearing from
 * the live queue cannot change the meaning of Next or Previous.
 */
export function orderedReviewQueue(invoices: InvoiceData[], sessionIds?: string[]) {
  if (!sessionIds) return invoices.filter(reviewable);
  return sessionIds
    .map((id) => invoices.find((invoice) => invoice.id === id))
    .filter((invoice): invoice is InvoiceData => Boolean(invoice && reviewable(invoice)));
}

export function nextReviewInvoiceId(
  sessionIds: string[],
  invoices: InvoiceData[],
  currentId: string,
  direction: "next" | "previous",
) {
  const currentIndex = sessionIds.indexOf(currentId);
  if (currentIndex < 0) return undefined;
  const step = direction === "next" ? 1 : -1;

  for (let index = currentIndex + step; index >= 0 && index < sessionIds.length; index += step) {
    const candidate = invoices.find((invoice) => invoice.id === sessionIds[index]);
    if (candidate) return candidate.id;
  }

  return undefined;
}

export function nextPendingReviewInvoiceId(sessionIds: string[], invoices: InvoiceData[], currentId: string) {
  const currentIndex = sessionIds.indexOf(currentId);
  if (currentIndex < 0) return undefined;

  for (let index = currentIndex + 1; index < sessionIds.length; index += 1) {
    const candidate = invoices.find((invoice) => invoice.id === sessionIds[index]);
    if (candidate && reviewable(candidate)) return candidate.id;
  }

  // A reviewer may have used Next to skip an earlier item. Once the current
  // tail item is verified, continue at the first pending item rather than
  // showing a false completion state.
  for (let index = 0; index < currentIndex; index += 1) {
    const candidate = invoices.find((invoice) => invoice.id === sessionIds[index]);
    if (candidate && reviewable(candidate)) return candidate.id;
  }

  return undefined;
}
