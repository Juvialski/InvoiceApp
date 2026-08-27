import { requireActiveCompanyId } from "./companyContext.ts";
import { supabase } from "./supabase.ts";
import type { FinancialSettlementHistoryItem, FinancialSettlementSummary, SettlementTargetType } from "./financialSettlement.ts";

function numberValue(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function text(value: unknown) {
  return value === null || value === undefined || value === "" ? undefined : String(value);
}

function rowToHistory(row: Record<string, unknown>): FinancialSettlementHistoryItem {
  return {
    id: String(row.id),
    transactionId: String(row.transaction_id || row.transactionId),
    status: String(row.status) === "REVERSED" ? "REVERSED" : "CONFIRMED",
    amount: numberValue(row.matched_amount ?? row.amount),
    confirmedAt: text(row.confirmed_at ?? row.confirmedAt),
    confirmedByUserId: text(row.confirmed_by_user_id ?? row.confirmedByUserId),
    reversedAt: text(row.reversed_at ?? row.reversedAt),
    reversedByUserId: text(row.reversed_by_user_id ?? row.reversedByUserId),
    reversalReason: text(row.reversal_reason ?? row.reversalReason),
    confirmationSource: text(row.confirmation_source ?? row.confirmationSource),
    accountId: text(row.account_id ?? row.accountId),
    accountName: text(row.account_name ?? row.accountName),
    accountType: text(row.account_type ?? row.accountType) as FinancialSettlementHistoryItem["accountType"],
    maskedIdentifier: text(row.masked_identifier ?? row.maskedIdentifier),
    transactionDate: text(row.transaction_date ?? row.transactionDate),
    referenceNumber: text(row.reference_number ?? row.referenceNumber),
    description: text(row.description),
    currency: text(row.currency),
  };
}

function summaryFromRpc(value: unknown): FinancialSettlementSummary {
  const row = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const history = Array.isArray(row.history) ? row.history.map((item) => rowToHistory(item as Record<string, unknown>)) : [];
  return {
    targetType: String(row.targetType || "INVOICE") as SettlementTargetType,
    targetId: String(row.targetId || ""),
    currency: String(row.currency || "PHP"),
    lifecycleStatus: text(row.lifecycleStatus),
    settlementBasis: numberValue(row.settlementBasis),
    basisSource: String(row.basisSource || "GROSS_DOCUMENT_AMOUNT") as FinancialSettlementSummary["basisSource"],
    reconciledCashPaid: numberValue(row.reconciledCashPaid),
    documentReportedPaid: numberValue(row.documentReportedPaid),
    effectiveSettled: numberValue(row.effectiveSettled),
    outstanding: numberValue(row.outstanding),
    settlementState: String(row.settlementState || "UNPAID") as FinancialSettlementSummary["settlementState"],
    legacyPaidWithoutBankLink: Boolean(row.legacyPaidWithoutBankLink),
    history,
  };
}

export async function loadFinancialSettlementSummary(targetType: SettlementTargetType, targetId: string): Promise<FinancialSettlementSummary | null> {
  if (!supabase || !targetId) return null;
  const companyId = requireActiveCompanyId();
  const { data, error } = await supabase.rpc("get_financial_settlement_summary", {
    p_company_id: companyId,
    p_target_type: targetType,
    p_target_id: targetId,
  });
  if (error) throw error;
  return summaryFromRpc(data);
}

export interface ConfirmFinancialSettlementInput {
  transactionId: string;
  targetType: SettlementTargetType;
  targetId: string;
  amount: number;
  matchId?: string;
  confidence?: number;
  notes?: string;
  confirmationSource?: "RECONCILIATION_UI" | "ASSISTANT" | "IMPORT_REVIEW" | string;
}

export async function confirmFinancialSettlement(input: ConfirmFinancialSettlementInput) {
  if (!supabase) throw new Error("Sign in before confirming a financial settlement.");
  const companyId = requireActiveCompanyId();
  const { data, error } = await supabase.rpc("confirm_financial_settlement", {
    p_company_id: companyId,
    p_transaction_id: input.transactionId,
    p_target_type: input.targetType,
    p_target_id: input.targetId,
    p_matched_amount: input.amount,
    p_match_id: input.matchId || null,
    p_confidence: input.confidence ?? null,
    p_notes: input.notes || null,
    p_confirmation_source: input.confirmationSource || "RECONCILIATION_UI",
  });
  if (error) throw error;
  return rowToHistory((data || {}) as Record<string, unknown>);
}

export async function reverseFinancialSettlement(matchId: string, reason: string) {
  if (!supabase) throw new Error("Sign in before reversing a financial settlement.");
  const companyId = requireActiveCompanyId();
  const { data, error } = await supabase.rpc("reverse_financial_settlement", {
    p_company_id: companyId,
    p_match_id: matchId,
    p_reason: reason,
  });
  if (error) throw error;
  return rowToHistory((data || {}) as Record<string, unknown>);
}
