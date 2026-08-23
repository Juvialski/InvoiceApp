import type { InvoiceData, ReviewStatus } from "../types.ts";

export type InvoiceWorkspaceMode = "review" | "verified";

export function getInvoiceWorkspaceMode(invoice: Pick<InvoiceData, "reviewStatus"> | { reviewStatus?: ReviewStatus }): InvoiceWorkspaceMode {
  return invoice.reviewStatus === "VERIFIED" ? "verified" : "review";
}
