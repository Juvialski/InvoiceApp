import type { FinancialSettlementSummary } from "../../lib/financialSettlement.ts";
import { addDemoDays, demoTimestamp } from "./demoDates.ts";

function payment(id: string, transactionId: string, amount: number, anchorDate: string, daysAgo: number, account: "BDO" | "BPI", referenceNumber: string) {
  return {
    id,
    transactionId,
    status: "CONFIRMED" as const,
    amount,
    confirmedAt: demoTimestamp(addDemoDays(anchorDate, -daysAgo), 14, 10),
    confirmationSource: "RECONCILIATION_UI",
    accountId: account === "BPI" ? "demo-account-bpi" : "demo-account-bdo",
    accountName: account === "BPI" ? "BPI Payroll Account" : "BDO Operating Account",
    accountType: "BANK" as const,
    maskedIdentifier: account === "BPI" ? "•••• 7734" : "•••• 4812",
    transactionDate: addDemoDays(anchorDate, -daysAgo),
    referenceNumber,
    currency: "PHP",
  };
}

export function demoSettlementSummaryForTarget(targetType: "INVOICE" | "PAYROLL", targetId: string, anchorDate = new Date().toISOString().slice(0, 10)): FinancialSettlementSummary | null {
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
    const history = [payment("demo-settlement-split-b", "demo-transaction-split-01", 120_000, anchorDate, 4, "BDO", "SPLIT-INV-01")];
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
  return null;
}
