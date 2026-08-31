import {
  commitStatementPreviewToWorkspace,
  financialId,
  type CashBankingWorkspaceData,
  type FinancialAccount,
  type FinancialBalanceSnapshot,
  type FinancialImportBatch,
  type FinancialTransaction,
  type FinancialTransactionMatch,
  type StatementPreview,
} from "./cashBanking.ts";
import { companyScopedRow, requireActiveCompanyId } from "./companyContext.ts";
import { supabase } from "./supabase.ts";

const CASH_WORKSPACE_STORAGE_KEY = "invoice_cash_banking_workspace_v1";
type Row = Record<string, unknown>;

function text(value: unknown): string | undefined {
  return value === null || value === undefined || value === "" ? undefined : String(value);
}

function numberValue(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function bool(value: unknown, fallback = true) {
  return value === undefined || value === null ? fallback : value === true || value === 1 || value === "true";
}

function isUuid(value: string | undefined) {
  return Boolean(value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value));
}

function persistedId(value: string | undefined, prefix: string) {
  return isUuid(value) ? value! : financialId(prefix);
}

function accountFromRow(row: Row): FinancialAccount {
  return {
    id: String(row.id),
    companyId: text(row.company_id),
    accountType: String(row.account_type || "BANK") as FinancialAccount["accountType"],
    institutionCode: text(row.institution_code),
    institutionName: String(row.institution_name || "Other institution"),
    displayName: String(row.display_name || row.institution_name || "Cash account"),
    maskedIdentifier: text(row.masked_identifier),
    currency: String(row.currency || "PHP").toUpperCase(),
    openingBalance: numberValue(row.opening_balance),
    openingBalanceDate: String(row.opening_balance_date || new Date().toISOString().slice(0, 10)),
    connectionType: String(row.connection_type || "MANUAL") as FinancialAccount["connectionType"],
    provider: text(row.provider),
    providerAccountId: text(row.provider_account_id),
    active: bool(row.active),
    createdByUserId: text(row.created_by_user_id),
    createdAt: String(row.created_at || new Date().toISOString()),
    updatedAt: String(row.updated_at || new Date().toISOString()),
  };
}

function snapshotFromRow(row: Row): FinancialBalanceSnapshot {
  return {
    id: String(row.id),
    companyId: text(row.company_id),
    accountId: String(row.account_id),
    capturedAt: String(row.captured_at || row.created_at || new Date().toISOString()),
    ledgerBalance: numberValue(row.ledger_balance),
    ...(row.available_balance === null || row.available_balance === undefined ? {} : { availableBalance: numberValue(row.available_balance) }),
    ...(row.pending_balance === null || row.pending_balance === undefined ? {} : { pendingBalance: numberValue(row.pending_balance) }),
    source: String(row.source || "MANUAL") as FinancialBalanceSnapshot["source"],
    importBatchId: text(row.import_batch_id),
    createdByUserId: text(row.created_by_user_id),
    createdAt: String(row.created_at || new Date().toISOString()),
  };
}

function transactionFromRow(row: Row): FinancialTransaction {
  return {
    id: String(row.id),
    companyId: text(row.company_id),
    accountId: String(row.account_id),
    transactionDate: String(row.transaction_date || ""),
    postedAt: text(row.posted_at),
    referenceNumber: text(row.reference_number),
    description: String(row.description || ""),
    direction: String(row.direction || "DEBIT") as FinancialTransaction["direction"],
    amount: numberValue(row.amount),
    currency: String(row.currency || "PHP").toUpperCase(),
    ...(row.running_balance === null || row.running_balance === undefined ? {} : { runningBalance: numberValue(row.running_balance) }),
    status: String(row.status || "POSTED") as FinancialTransaction["status"],
    source: String(row.source || "MANUAL") as FinancialTransaction["source"],
    providerTransactionId: text(row.provider_transaction_id),
    sourceFingerprint: String(row.source_fingerprint || ""),
    importBatchId: text(row.import_batch_id),
    reconciliationStatus: String(row.reconciliation_status || "UNMATCHED") as FinancialTransaction["reconciliationStatus"],
    transferGroupId: text(row.transfer_group_id),
    reversedByUserId: text(row.reversed_by_user_id),
    reversedAt: text(row.reversed_at),
    reversalReason: text(row.reversal_reason),
    createdByUserId: text(row.created_by_user_id),
    createdAt: String(row.created_at || new Date().toISOString()),
    updatedAt: String(row.updated_at || new Date().toISOString()),
  };
}

function importBatchFromRow(row: Row): FinancialImportBatch {
  return {
    id: String(row.id),
    companyId: text(row.company_id),
    accountId: String(row.account_id),
    sourceType: String(row.source_type || "CSV") as FinancialImportBatch["sourceType"],
    fileName: String(row.file_name || "statement"),
    fileFingerprint: String(row.file_fingerprint || ""),
    statementFrom: text(row.statement_from),
    statementTo: text(row.statement_to),
    openingBalance: row.opening_balance === null || row.opening_balance === undefined ? undefined : numberValue(row.opening_balance),
    closingBalance: row.closing_balance === null || row.closing_balance === undefined ? undefined : numberValue(row.closing_balance),
    rowCount: numberValue(row.row_count),
    importedCount: numberValue(row.imported_count),
    duplicateCount: numberValue(row.duplicate_count),
    rejectedCount: numberValue(row.rejected_count),
    status: String(row.status || "IMPORTED") as FinancialImportBatch["status"],
    reconciliationDifference: row.reconciliation_difference === null || row.reconciliation_difference === undefined ? undefined : numberValue(row.reconciliation_difference),
    createdByUserId: text(row.created_by_user_id),
    createdAt: String(row.created_at || new Date().toISOString()),
    completedAt: text(row.completed_at),
  };
}

function matchFromRow(row: Row): FinancialTransactionMatch {
  return {
    id: String(row.id),
    companyId: text(row.company_id),
    createdByUserId: text(row.created_by_user_id),
    transactionId: String(row.transaction_id),
    targetType: String(row.target_type || "OTHER") as FinancialTransactionMatch["targetType"],
    targetId: text(row.target_id),
    matchedAmount: numberValue(row.matched_amount),
    status: String(row.status || "SUGGESTED") as FinancialTransactionMatch["status"],
    confidence: row.confidence === null || row.confidence === undefined ? undefined : numberValue(row.confidence),
    confirmedByUserId: text(row.confirmed_by_user_id),
    confirmedAt: text(row.confirmed_at),
    reversedByUserId: text(row.reversed_by_user_id),
    reversedAt: text(row.reversed_at),
    reversalReason: text(row.reversal_reason),
    transferGroupId: text(row.transfer_group_id),
    notes: text(row.notes),
    createdAt: String(row.created_at || new Date().toISOString()),
    updatedAt: String(row.updated_at || new Date().toISOString()),
  };
}

function readJson(storage: Storage | undefined): CashBankingWorkspaceData {
  if (!storage) return emptyCashBankingWorkspaceData();
  try {
    const parsed = JSON.parse(storage.getItem(CASH_WORKSPACE_STORAGE_KEY) || "{}");
    return {
      accounts: Array.isArray(parsed.accounts) ? parsed.accounts : [],
      snapshots: Array.isArray(parsed.snapshots) ? parsed.snapshots : [],
      transactions: Array.isArray(parsed.transactions) ? parsed.transactions : [],
      importBatches: Array.isArray(parsed.importBatches) ? parsed.importBatches : [],
      matches: Array.isArray(parsed.matches) ? parsed.matches : [],
    };
  } catch {
    return emptyCashBankingWorkspaceData();
  }
}

export function emptyCashBankingWorkspaceData(): CashBankingWorkspaceData {
  return { accounts: [], snapshots: [], transactions: [], importBatches: [], matches: [] };
}

export function readCashBankingWorkspaceFromLocal(storage: Storage | undefined = typeof localStorage === "undefined" ? undefined : localStorage): CashBankingWorkspaceData {
  return readJson(storage);
}

export function writeCashBankingWorkspaceToLocal(data: CashBankingWorkspaceData, storage: Storage | undefined = typeof localStorage === "undefined" ? undefined : localStorage) {
  try { storage?.setItem(CASH_WORKSPACE_STORAGE_KEY, JSON.stringify(data)); } catch { /* Guest storage is best effort. */ }
}

async function currentUserId() {
  if (!supabase) return null;
  const { data } = await supabase.auth.getUser();
  return data.user?.id || null;
}

function requireRemoteUser(userId: string | null): string {
  if (!supabase || !userId) throw new Error("Sign in before using Cash & Banking.");
  return userId;
}

function accountRow(account: FinancialAccount, userId: string, companyId: string) {
  return companyScopedRow({
    id: persistedId(account.id, "account"),
    company_id: companyId,
    created_by_user_id: account.createdByUserId || userId,
    account_type: account.accountType,
    institution_code: account.institutionCode || null,
    institution_name: account.institutionName.trim(),
    display_name: account.displayName.trim(),
    masked_identifier: account.maskedIdentifier || null,
    currency: account.currency.toUpperCase(),
    opening_balance: account.openingBalance,
    opening_balance_date: account.openingBalanceDate,
    connection_type: account.connectionType,
    provider: account.provider || null,
    provider_account_id: account.providerAccountId || null,
    active: account.active,
    updated_at: new Date().toISOString(),
  });
}

export async function listFinancialAccounts(): Promise<FinancialAccount[]> {
  const userId = await currentUserId();
  if (!supabase || !userId) return [];
  const companyId = requireActiveCompanyId();
  const { data, error } = await supabase
    .from("financial_accounts")
    .select("*")
    .eq("company_id", companyId)
    .order("active", { ascending: false })
    .order("display_name");
  if (error) throw error;
  return (data || []).map((row) => accountFromRow(row as Row));
}

export async function loadCashBankingWorkspaceFromSupabase(): Promise<CashBankingWorkspaceData> {
  const userId = await currentUserId();
  if (!supabase || !userId) return emptyCashBankingWorkspaceData();
  const companyId = requireActiveCompanyId();
  const [accounts, snapshots, transactions, imports, matches] = await Promise.all([
    supabase.from("financial_accounts").select("*").eq("company_id", companyId).order("active", { ascending: false }).order("display_name"),
    supabase.from("financial_balance_snapshots").select("*").eq("company_id", companyId).order("captured_at", { ascending: false }),
    supabase.from("financial_transactions").select("*").eq("company_id", companyId).order("transaction_date", { ascending: false }),
    supabase.from("financial_import_batches").select("*").eq("company_id", companyId).order("created_at", { ascending: false }),
    supabase.from("financial_transaction_matches").select("*").eq("company_id", companyId).order("created_at", { ascending: false }),
  ]);
  for (const result of [accounts, snapshots, transactions, imports, matches]) if (result.error) throw result.error;
  return {
    accounts: (accounts.data || []).map((row) => accountFromRow(row as Row)),
    snapshots: (snapshots.data || []).map((row) => snapshotFromRow(row as Row)),
    transactions: (transactions.data || []).map((row) => transactionFromRow(row as Row)),
    importBatches: (imports.data || []).map((row) => importBatchFromRow(row as Row)),
    matches: (matches.data || []).map((row) => matchFromRow(row as Row)),
  };
}

export async function saveFinancialAccountToSupabase(account: FinancialAccount): Promise<FinancialAccount> {
  const userId = requireRemoteUser(await currentUserId());
  const companyId = requireActiveCompanyId();
  const row = accountRow(account, userId, companyId);
  const { data, error } = await supabase!.rpc("save_financial_account", {
    p_company_id: companyId,
    p_account_id: row.id,
    p_account_type: row.account_type,
    p_institution_code: row.institution_code,
    p_institution_name: row.institution_name,
    p_display_name: row.display_name,
    p_masked_identifier: row.masked_identifier,
    p_currency: row.currency,
    p_opening_balance: row.opening_balance,
    p_opening_balance_date: row.opening_balance_date,
    p_connection_type: row.connection_type,
    p_provider: row.provider,
    p_provider_account_id: row.provider_account_id,
  });
  if (error) throw error;
  void userId;
  return accountFromRow(data as Row);
}

export async function deactivateFinancialAccountInSupabase(accountId: string, reason: string): Promise<FinancialAccount> {
  requireRemoteUser(await currentUserId());
  const companyId = requireActiveCompanyId();
  const { data, error } = await supabase!.rpc("deactivate_financial_account", {
    p_account_id: accountId,
    p_reason: reason,
  });
  if (error) throw error;
  return accountFromRow(data as Row);
}

export async function reactivateFinancialAccountInSupabase(accountId: string, reason: string): Promise<FinancialAccount> {
  requireRemoteUser(await currentUserId());
  const { data, error } = await supabase!.rpc("reactivate_financial_account", {
    p_account_id: accountId,
    p_reason: reason,
  });
  if (error) throw error;
  return accountFromRow(data as Row);
}

export async function saveFinancialBalanceSnapshotToSupabase(snapshot: FinancialBalanceSnapshot): Promise<FinancialBalanceSnapshot> {
  const userId = requireRemoteUser(await currentUserId());
  const companyId = requireActiveCompanyId();
  const { data, error } = await supabase!.from("financial_balance_snapshots").insert(companyScopedRow({
    id: persistedId(snapshot.id, "snapshot"),
    company_id: companyId,
    account_id: snapshot.accountId,
    captured_at: snapshot.capturedAt,
    ledger_balance: snapshot.ledgerBalance,
    available_balance: snapshot.availableBalance ?? null,
    pending_balance: snapshot.pendingBalance ?? null,
    source: snapshot.source,
    import_batch_id: snapshot.importBatchId || null,
    created_by_user_id: userId,
  })).select("*").single();
  if (error) throw error;
  return snapshotFromRow(data as Row);
}

export async function saveFinancialTransactionToSupabase(transaction: FinancialTransaction): Promise<FinancialTransaction> {
  const userId = requireRemoteUser(await currentUserId());
  const companyId = requireActiveCompanyId();
  const { data, error } = await supabase!.rpc("create_financial_transaction", {
    p_company_id: companyId,
    p_transaction_id: persistedId(transaction.id, "transaction"),
    p_account_id: transaction.accountId,
    p_transaction_date: transaction.transactionDate,
    p_posted_at: transaction.postedAt || null,
    p_reference_number: transaction.referenceNumber || null,
    p_description: transaction.description.trim(),
    p_direction: transaction.direction,
    p_amount: transaction.amount,
    p_currency: transaction.currency.toUpperCase(),
    p_source_fingerprint: transaction.sourceFingerprint,
  });
  if (error) throw error;
  void userId;
  return transactionFromRow(data as Row);
}

export async function saveFinancialTransactionMatchToSupabase(match: FinancialTransactionMatch): Promise<FinancialTransactionMatch> {
  requireRemoteUser(await currentUserId());
  const companyId = requireActiveCompanyId();
  if (match.status !== "CONFIRMED") {
    throw new Error("Only confirmed settlements are persisted. Suggestions remain non-authoritative until a finance user confirms them.");
  }
  if (!match.targetId || !["INVOICE", "PAYROLL", "EXPENSE"].includes(match.targetType)) {
    throw new Error("Invoice, payroll, and expense settlement confirmations must use the guarded settlement operation. Transfers use their dedicated operation.");
  }
  const { data, error } = await supabase!.rpc("confirm_financial_settlement", {
    p_company_id: companyId,
    p_transaction_id: match.transactionId,
    p_target_type: match.targetType,
    p_target_id: match.targetId,
    p_matched_amount: match.matchedAmount,
    p_match_id: persistedId(match.id, "match"),
    p_confidence: match.confidence ?? null,
    p_notes: match.notes || null,
    p_confirmation_source: "RECONCILIATION_UI",
  });
  if (error) throw error;
  return matchFromRow((data || {}) as Row);
}

export interface FinancialImportCommitResult {
  batchId?: string;
  importedCount: number;
  duplicateCount: number;
  rejectedCount: number;
}

export async function commitFinancialImportToSupabase(preview: StatementPreview, account: FinancialAccount): Promise<FinancialImportCommitResult> {
  const userId = requireRemoteUser(await currentUserId());
  const companyId = requireActiveCompanyId();
  if (!preview.canCommit) throw new Error("The statement preview must pass validation before it can be imported.");
  const { data, error } = await supabase!.rpc("commit_financial_import", {
    p_company_id: companyId,
    p_account_id: account.id,
    p_source_type: preview.sourceType,
    p_file_name: preview.fileName,
    p_file_fingerprint: preview.fileFingerprint,
    p_statement_from: preview.statementFrom || null,
    p_statement_to: preview.statementTo || null,
    p_opening_balance: preview.openingBalance ?? null,
    p_closing_balance: preview.statementEndingBalance ?? preview.calculatedEndingBalance ?? null,
    p_row_count: preview.rowsFound,
    p_duplicate_count: preview.duplicateCount,
    p_rejected_count: preview.invalidRows.length + preview.balanceIssues.length,
    p_rows: preview.transactionsToImport.map((transaction) => ({
      transaction_date: transaction.transactionDate,
      posted_at: transaction.transactionDate,
      reference_number: transaction.referenceNumber || null,
      description: transaction.description,
      direction: transaction.direction,
      amount: transaction.amount,
      currency: account.currency,
      running_balance: transaction.runningBalance ?? null,
      source_fingerprint: transaction.sourceFingerprint,
    })),
  });
  if (error) throw error;
  const result = data && typeof data === "object" ? data as Row : {};
  void userId;
  return {
    batchId: text(result.batch_id),
    importedCount: numberValue(result.imported_count, preview.transactionsToImport.length),
    duplicateCount: numberValue(result.duplicate_count, preview.duplicateCount),
    rejectedCount: numberValue(result.rejected_count, preview.invalidRows.length + preview.balanceIssues.length),
  };
}

export async function confirmFinancialTransferToSupabase(leftId: string, rightId: string, matchedAmount: number, transferGroupId = financialId("transfer")) {
  const userId = requireRemoteUser(await currentUserId());
  const companyId = requireActiveCompanyId();
  const { data, error } = await supabase!.rpc("confirm_financial_transfer", {
    p_company_id: companyId,
    p_left_transaction_id: leftId,
    p_right_transaction_id: rightId,
    p_matched_amount: matchedAmount,
    p_transfer_group_id: transferGroupId,
  });
  if (error) throw error;
  void userId;
  return data;
}

export interface FinancialTransactionCorrectionInput {
  transactionDate: string;
  referenceNumber?: string;
  description: string;
  direction: FinancialTransaction["direction"];
  amount: number;
}

export async function correctFinancialTransactionInSupabase(transactionId: string, input: FinancialTransactionCorrectionInput, reason: string): Promise<FinancialTransaction> {
  requireRemoteUser(await currentUserId());
  const companyId = requireActiveCompanyId();
  const { data, error } = await supabase!.rpc("correct_financial_transaction", {
    p_company_id: companyId,
    p_transaction_id: transactionId,
    p_transaction_date: input.transactionDate,
    p_reference_number: input.referenceNumber || null,
    p_description: input.description,
    p_direction: input.direction,
    p_amount: input.amount,
    p_reason: reason,
  });
  if (error) throw error;
  return transactionFromRow(data as Row);
}

export async function reverseFinancialTransactionInSupabase(transactionId: string, reason: string): Promise<FinancialTransaction> {
  requireRemoteUser(await currentUserId());
  const companyId = requireActiveCompanyId();
  const { data, error } = await supabase!.rpc("reverse_financial_transaction", {
    p_company_id: companyId,
    p_transaction_id: transactionId,
    p_reason: reason,
  });
  if (error) throw error;
  return transactionFromRow(data as Row);
}

export async function ignoreFinancialTransactionInSupabase(transactionId: string, reason: string): Promise<FinancialTransaction> {
  requireRemoteUser(await currentUserId());
  const companyId = requireActiveCompanyId();
  const { data, error } = await supabase!.rpc("ignore_financial_transaction", {
    p_company_id: companyId,
    p_transaction_id: transactionId,
    p_reason: reason,
  });
  if (error) throw error;
  return transactionFromRow(data as Row);
}

export async function restoreFinancialTransactionToReviewInSupabase(transactionId: string, reason: string): Promise<FinancialTransaction> {
  requireRemoteUser(await currentUserId());
  const companyId = requireActiveCompanyId();
  const { data, error } = await supabase!.rpc("restore_financial_transaction_to_review", {
    p_company_id: companyId,
    p_transaction_id: transactionId,
    p_reason: reason,
  });
  if (error) throw error;
  return transactionFromRow(data as Row);
}

export async function reverseFinancialTransferInSupabase(leftId: string, rightId: string, transferGroupId: string, reason: string) {
  requireRemoteUser(await currentUserId());
  const companyId = requireActiveCompanyId();
  const { data, error } = await supabase!.rpc("reverse_financial_transfer", {
    p_company_id: companyId,
    p_transfer_group_id: transferGroupId,
    p_left_transaction_id: leftId,
    p_right_transaction_id: rightId,
    p_reason: reason,
  });
  if (error) throw error;
  return data;
}

export interface FinancialSettlementBatchAllocation {
  targetType: string;
  targetId: string;
  amount: number;
  matchId?: string;
  confidence?: number;
  notes?: string;
}

export async function confirmFinancialSettlementBatchToSupabase(transactionId: string, allocations: readonly FinancialSettlementBatchAllocation[]) {
  requireRemoteUser(await currentUserId());
  const companyId = requireActiveCompanyId();
  const { data, error } = await supabase!.rpc("confirm_financial_settlement_batch", {
    p_company_id: companyId,
    p_transaction_id: transactionId,
    p_allocations: allocations.map((allocation) => ({
      target_type: allocation.targetType,
      target_id: allocation.targetId,
      matched_amount: allocation.amount,
      match_id: allocation.matchId || financialId("settlement"),
      confidence: allocation.confidence ?? null,
      notes: allocation.notes || null,
    })),
    p_confirmation_source: "RECONCILIATION_UI",
  });
  if (error) throw error;
  return data;
}

export { commitStatementPreviewToWorkspace };
