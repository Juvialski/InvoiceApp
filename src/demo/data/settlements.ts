import type { CashBankingWorkspaceData, FinancialTransaction, FinancialTransactionMatch } from "../../lib/cashBanking.ts";
import type { FinancialSettlementHistoryItem, FinancialSettlementSummary, SettlementTargetType } from "../../lib/financialSettlement.ts";
import { DEMO_COMPANY_ID } from "../demoTypes.ts";
import { addDemoDays, demoTimestamp } from "./demoDates.ts";

function payment(id: string, transactionId: string, amount: number, anchorDate: string, daysAgo: number, account: "BDO" | "BPI", referenceNumber: string): FinancialSettlementHistoryItem {
  return {
    id,
    transactionId,
    status: "CONFIRMED",
    amount,
    confirmedAt: demoTimestamp(addDemoDays(anchorDate, -daysAgo), 14, 10),
    confirmationSource: "RECONCILIATION_UI",
    accountId: account === "BPI" ? "demo-account-bpi" : "demo-account-bdo",
    accountName: account === "BPI" ? "BPI Payroll Account" : "BDO Operating Account",
    accountType: "BANK",
    maskedIdentifier: account === "BPI" ? "•••• 7734" : "•••• 4812",
    transactionDate: addDemoDays(anchorDate, -daysAgo),
    referenceNumber,
    currency: "PHP",
  };
}

function reversedPayment(id: string, transactionId: string, amount: number, anchorDate: string, daysAgo: number, referenceNumber: string): FinancialSettlementHistoryItem {
  return {
    ...payment(id, transactionId, amount, anchorDate, daysAgo, "BDO", referenceNumber),
    status: "REVERSED",
    reversedAt: demoTimestamp(addDemoDays(anchorDate, -(daysAgo - 1)), 9, 15),
    reversalReason: "Incorrect supplier selected during reconciliation review.",
  };
}

function demoTransaction(id: string, accountId: string, transactionDate: string, amount: number, description: string, referenceNumber: string, reconciliationStatus: FinancialTransaction["reconciliationStatus"], transferGroupId?: string, direction: FinancialTransaction["direction"] = "DEBIT"): FinancialTransaction {
  return {
    id,
    companyId: DEMO_COMPANY_ID,
    accountId,
    transactionDate,
    postedAt: demoTimestamp(transactionDate, 11, 25),
    referenceNumber,
    description,
    direction,
    amount,
    currency: "PHP",
    status: "POSTED",
    source: "XLSX",
    sourceFingerprint: `demo:${accountId}:${referenceNumber}:${amount}`,
    reconciliationStatus,
    transferGroupId,
    createdAt: demoTimestamp(transactionDate, 13, 5),
    updatedAt: demoTimestamp(transactionDate, 13, 20),
  };
}

function match(id: string, transactionId: string, targetType: FinancialTransactionMatch["targetType"], targetId: string, matchedAmount: number, anchorDate: string, daysAgo: number, notes: string): FinancialTransactionMatch {
  return {
    id,
    companyId: DEMO_COMPANY_ID,
    transactionId,
    targetType,
    targetId,
    matchedAmount,
    status: "CONFIRMED",
    confidence: 98,
    confirmedAt: demoTimestamp(addDemoDays(anchorDate, -daysAgo), 14, 10),
    notes,
    createdAt: demoTimestamp(addDemoDays(anchorDate, -daysAgo), 14, 10),
    updatedAt: demoTimestamp(addDemoDays(anchorDate, -daysAgo), 14, 10),
  };
}

/**
 * Adds deterministic settlement examples without mounting any production
 * persistence. Reset Demo recreates this exact fixture graph.
 */
export function enrichDemoCashWithSettlements(base: CashBankingWorkspaceData, anchorDate: string): CashBankingWorkspaceData {
  const transferGroupId = "demo-transfer-payroll-funding-01";
  const split = demoTransaction("demo-transaction-split-01", "demo-account-bdo", addDemoDays(anchorDate, -4), 300_000, "Split supplier settlement — Southline equipment invoices", "SPLIT-INV-01", "MATCHED");
  const secondPayrollDebit = demoTransaction("demo-transaction-payroll-partial-02", "demo-account-bpi", addDemoDays(anchorDate, -5), 50_000, "Second partial payroll disbursement", "PAY-RUN-09-B", "MATCHED");
  const transferOut = demoTransaction("demo-transaction-transfer-out-01", "demo-account-bdo", addDemoDays(anchorDate, -17), 620_000, "Payroll funding transfer to BPI Payroll Account", "PAY-FUND-01", "MATCHED", transferGroupId);
  const collectionCredit = demoTransaction("demo-transaction-client-collection-01", "demo-account-bdo", addDemoDays(anchorDate, -8), 1_200_000, "Client receipt — SunPower Renewables Philippines", "EFT-88319", "MATCHED", undefined, "CREDIT");
  const transactions = base.transactions.map((transaction) => transaction.id === "demo-transaction-11" ? { ...transaction, transferGroupId } : transaction);
  const transferIn = transactions.find((transaction) => transaction.id === "demo-transaction-11");

  const matches: FinancialTransactionMatch[] = [
    match("demo-match-invoice-01", "demo-transaction-02", "INVOICE", "demo-invoice-01", 1_487_360.40, anchorDate, 22, "Full supplier invoice payment."),
    match("demo-match-invoice-02", "demo-transaction-07", "INVOICE", "demo-invoice-02", 570_000, anchorDate, 7, "Partial supplier invoice payment."),
    match("demo-match-split-a", split.id, "INVOICE", "demo-invoice-03", 180_000, anchorDate, 4, "First allocation from a split bank debit."),
    match("demo-match-split-b", split.id, "INVOICE", "demo-invoice-06", 120_000, anchorDate, 4, "Second allocation from the same split bank debit."),
    match("demo-match-payroll-08", "demo-transaction-12", "PAYROLL", "demo-payroll-run-8", 241_886.50, anchorDate, 14, "Employee net-pay disbursement."),
    match("demo-match-payroll-09-a", "demo-transaction-13", "PAYROLL", "demo-payroll-run-9", 150_000, anchorDate, 10, "First partial employee net-pay disbursement."),
    match("demo-match-payroll-09-b", secondPayrollDebit.id, "PAYROLL", "demo-payroll-run-9", 50_000, anchorDate, 5, "Second partial employee net-pay disbursement."),
    match("demo-match-client-collection-01", collectionCredit.id, "CLIENT_COLLECTION", "demo-client-collection-solar-01", 1_200_000, anchorDate, 8, "Client receipt linked to the recorded collection."),
  ];
  if (transferIn) {
    matches.push(
      match("demo-match-transfer-out", transferOut.id, "TRANSFER", transferIn.id, 620_000, anchorDate, 17, "Confirmed internal transfer."),
      match("demo-match-transfer-in", transferIn.id, "TRANSFER", transferOut.id, 620_000, anchorDate, 17, "Confirmed internal transfer."),
    );
  }

  return {
    ...base,
    transactions: [...transactions, split, secondPayrollDebit, transferOut, collectionCredit],
    matches: [...base.matches, ...matches],
  };
}

export function demoSettlementSummaryForTarget(targetType: SettlementTargetType, targetId: string, anchorDate = new Date().toISOString().slice(0, 10)): FinancialSettlementSummary | null {
  if (targetType === "INVOICE" && targetId === "demo-invoice-01") {
    const history = [payment("demo-settlement-inv-01", "demo-transaction-02", 1_487_360.40, anchorDate, 22, "BDO", "MS-260481")];
    return { targetType, targetId, currency: "PHP", lifecycleStatus: "VERIFIED", settlementBasis: 1_487_360.40, basisSource: "GROSS_DOCUMENT_AMOUNT", reconciledCashPaid: 1_487_360.40, documentReportedPaid: 1_487_360.40, effectiveSettled: 1_487_360.40, outstanding: 0, settlementState: "PAID", history };
  }
  if (targetType === "INVOICE" && targetId === "demo-invoice-02") {
    const history = [payment("demo-settlement-inv-02", "demo-transaction-07", 570_000, anchorDate, 7, "BDO", "BM-118204")];
    return { targetType, targetId, currency: "PHP", lifecycleStatus: "VERIFIED", settlementBasis: 982_415.75, basisSource: "GROSS_DOCUMENT_AMOUNT", reconciledCashPaid: 570_000, documentReportedPaid: 569_801.14, effectiveSettled: 570_000, outstanding: 412_415.75, settlementState: "PARTIALLY_PAID", history };
  }
  if (targetType === "INVOICE" && targetId === "demo-invoice-03") {
    const history = [payment("demo-settlement-split-a", "demo-transaction-split-01", 180_000, anchorDate, 4, "BDO", "SPLIT-INV-01")];
    return { targetType, targetId, currency: "PHP", lifecycleStatus: "VERIFIED", settlementBasis: 386_920.18, basisSource: "GROSS_DOCUMENT_AMOUNT", reconciledCashPaid: 180_000, documentReportedPaid: 0, effectiveSettled: 180_000, outstanding: 206_920.18, settlementState: "PARTIALLY_PAID", history };
  }
  if (targetType === "INVOICE" && targetId === "demo-invoice-06") {
    const history = [
      payment("demo-settlement-split-b", "demo-transaction-split-01", 120_000, anchorDate, 4, "BDO", "SPLIT-INV-01"),
      reversedPayment("demo-settlement-reversed-example", "demo-transaction-reversed-example", 72_660.44, anchorDate, 9, "REV-EXAMPLE"),
    ];
    return { targetType, targetId, currency: "PHP", lifecycleStatus: "VERIFIED", settlementBasis: 192_660.44, basisSource: "GROSS_DOCUMENT_AMOUNT", reconciledCashPaid: 120_000, documentReportedPaid: 0, effectiveSettled: 120_000, outstanding: 72_660.44, settlementState: "PARTIALLY_PAID", history };
  }
  if (targetType === "PAYROLL" && targetId === "demo-payroll-run-8") {
    const history = [payment("demo-settlement-payroll-08", "demo-transaction-12", 241_886.50, anchorDate, 14, "BPI", "PAY-RUN-08")];
    return { targetType, targetId, currency: "PHP", lifecycleStatus: "PAID", settlementBasis: 241_886.50, basisSource: "EMPLOYEE_NET_PAY", reconciledCashPaid: 241_886.50, documentReportedPaid: 0, effectiveSettled: 241_886.50, outstanding: 0, settlementState: "SETTLED", legacyPaidWithoutBankLink: false, history };
  }
  if (targetType === "PAYROLL" && targetId === "demo-payroll-run-9") {
    const history = [
      payment("demo-settlement-payroll-09-a", "demo-transaction-13", 150_000, anchorDate, 10, "BPI", "PAY-RUN-09-A"),
      payment("demo-settlement-payroll-09-b", "demo-transaction-payroll-partial-02", 50_000, anchorDate, 5, "BPI", "PAY-RUN-09-B"),
    ];
    return { targetType, targetId, currency: "PHP", lifecycleStatus: "APPROVED", settlementBasis: 248_411.75, basisSource: "EMPLOYEE_NET_PAY", reconciledCashPaid: 200_000, documentReportedPaid: 0, effectiveSettled: 200_000, outstanding: 48_411.75, settlementState: "PARTIALLY_DISBURSED", history };
  }
  if (targetType === "CLIENT_COLLECTION" && targetId === "demo-client-collection-solar-01") {
    const history = [payment("demo-settlement-collection-solar-01", "demo-transaction-client-collection-01", 1_200_000, anchorDate, 8, "BDO", "EFT-88319")];
    return { targetType, targetId, currency: "PHP", lifecycleStatus: "RECORDED", settlementBasis: 1_200_000, basisSource: "CLIENT_COLLECTION_ALLOCATIONS", reconciledCashPaid: 1_200_000, documentReportedPaid: 0, effectiveSettled: 1_200_000, outstanding: 0, settlementState: "LINKED", collectionTotal: 1_200_000, linkedAmount: 1_200_000, remainingUnlinkedAmount: 0, linkState: "LINKED", history };
  }
  return null;
}
