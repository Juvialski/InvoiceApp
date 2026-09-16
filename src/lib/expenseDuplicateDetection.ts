import type { Expense } from "../types.ts";

export interface ExpenseDuplicateCandidate {
  readonly expense: Expense;
  readonly reason: string;
  readonly matchType: "SOURCE_DOCUMENT" | "SOURCE_SHA" | "REFERENCE_NUMBER" | "EXACT_PAYEE_AMOUNT_DATE" | "PROBABLE_MATCH";
}

export function findPossibleExpenseDuplicates(
  candidate: {
    payee?: string;
    amount?: number;
    currency?: string;
    expenseDate?: string;
    referenceNumber?: string;
    sourceDocumentId?: string;
    sourceSha256?: string;
  },
  existingExpenses: Expense[],
  matchingSourceShaExpenseIds?: string[],
): ExpenseDuplicateCandidate[] {
  const matches: ExpenseDuplicateCandidate[] = [];
  const candidateDate = candidate.expenseDate?.slice(0, 10);
  const candidateRef = candidate.referenceNumber?.trim().toLowerCase();
  const candidatePayee = candidate.payee?.trim().toLowerCase();
  const candidateAmount = candidate.amount ? Number(candidate.amount) : 0;
  const candidateCurrency = candidate.currency?.trim().toUpperCase();

  for (const expense of existingExpenses) {
    if (expense.status === "VOID") continue;

    if (candidate.sourceDocumentId && expense.receiptSourceDocumentId === candidate.sourceDocumentId) {
      matches.push({
        expense,
        matchType: "SOURCE_DOCUMENT",
        reason: `Expense #${expense.id.slice(0, 8)} is already linked to this preserved source document.`,
      });
      continue;
    }

    if (matchingSourceShaExpenseIds?.includes(expense.id)) {
      matches.push({
        expense,
        matchType: "SOURCE_SHA",
        reason: `Expense #${expense.id.slice(0, 8)} was created from the exact same receipt file (matching SHA-256).`,
      });
      continue;
    }

    if (candidateRef && expense.referenceNumber && expense.referenceNumber.trim().toLowerCase() === candidateRef) {
      matches.push({
        expense,
        matchType: "REFERENCE_NUMBER",
        reason: `Expense #${expense.id.slice(0, 8)} has the same receipt/reference number (${expense.referenceNumber}).`,
      });
      continue;
    }

    if (
      candidatePayee
      && expense.payee
      && expense.payee.trim().toLowerCase() === candidatePayee
      && candidateAmount > 0
      && Math.abs(expense.amount - candidateAmount) < 0.001
      && candidateDate
      && expense.expenseDate.slice(0, 10) === candidateDate
      && (!candidateCurrency || !expense.currency || expense.currency.toUpperCase() === candidateCurrency)
    ) {
      matches.push({
        expense,
        matchType: "EXACT_PAYEE_AMOUNT_DATE",
        reason: `Expense #${expense.id.slice(0, 8)} has matching payee (${expense.payee}), amount (${expense.amount} ${expense.currency}), and date (${expense.expenseDate}).`,
      });
    }
  }

  return matches;
}
