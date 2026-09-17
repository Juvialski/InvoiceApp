import { useCallback, useRef, useState } from "react";
import {
  commitStatementPreviewToWorkspace,
  createFinancialMatch,
  financialId,
  isManualTransactionCorrectionEligible,
  reconciliationStatusForTransaction,
  type CashBankingWorkspaceData,
  type FinancialAccount,
  type FinancialBalanceSnapshot,
  type FinancialTransaction,
  type FinancialTransactionMatch,
  type StatementPreview,
} from "../../lib/cashBanking.ts";
import {
  confirmFinancialTransferToSupabase,
  confirmFinancialSettlementBatchToSupabase,
  commitFinancialImportToSupabase,
  correctFinancialTransactionInSupabase,
  deactivateFinancialAccountInSupabase,
  emptyCashBankingWorkspaceData,
  loadCashBankingWorkspaceFromSupabase,
  readCashBankingWorkspaceFromLocal,
  saveFinancialAccountToSupabase,
  saveFinancialBalanceSnapshotToSupabase,
  saveFinancialTransactionMatchToSupabase,
  saveFinancialTransactionToSupabase,
  ignoreFinancialTransactionInSupabase,
  reactivateFinancialAccountInSupabase,
  restoreFinancialTransactionToReviewInSupabase,
  reverseFinancialTransactionInSupabase,
  reverseFinancialTransferInSupabase,
  writeCashBankingWorkspaceToLocal,
} from "../../lib/cashBankingPersistence.ts";
import { reverseFinancialSettlement } from "../../lib/financialSettlementPersistence.ts";

export interface CashBankingControllerOptions {
  authenticated: boolean;
  remoteWorkspaceConfigured: boolean;
  onRemoteRefresh: (reason: string) => Promise<void>;
}
export interface CashBankingController {
  data: CashBankingWorkspaceData;
  applyWorkspaceData: (data: CashBankingWorkspaceData) => void;
  loadGuestWorkspace: () => void;
  reset: () => void;
  saveFinancialAccount: (account: FinancialAccount) => Promise<FinancialAccount>;
  deactivateFinancialAccount: (account: FinancialAccount, reason: string) => Promise<void>;
  reactivateFinancialAccount: (account: FinancialAccount, reason: string) => Promise<void>;
  saveFinancialSnapshot: (snapshot: FinancialBalanceSnapshot) => Promise<void>;
  saveFinancialTransaction: (transaction: FinancialTransaction) => Promise<void>;
  commitFinancialImport: (preview: StatementPreview, account: FinancialAccount) => Promise<void>;
  saveFinancialMatch: (match: FinancialTransactionMatch, transaction: FinancialTransaction) => Promise<void>;
  saveFinancialMatchBatch: (matches: FinancialTransactionMatch[], transaction: FinancialTransaction) => Promise<void>;
  reverseFinancialMatch: (matchId: string, reason: string) => Promise<void>;
  correctFinancialTransaction: (
    transaction: FinancialTransaction,
    input: { transactionDate: string; referenceNumber?: string; description: string; direction: FinancialTransaction["direction"]; amount: number },
    reason: string,
  ) => Promise<void>;
  reverseFinancialTransaction: (transaction: FinancialTransaction, reason: string) => Promise<void>;
  ignoreFinancialTransaction: (transaction: FinancialTransaction, reason: string) => Promise<void>;
  restoreFinancialTransactionToReview: (transaction: FinancialTransaction, reason: string) => Promise<void>;
  confirmFinancialTransfer: (left: FinancialTransaction, right: FinancialTransaction) => Promise<void>;
  reverseFinancialTransfer: (left: FinancialTransaction, right: FinancialTransaction, reason: string) => Promise<void>;
}

export function useCashBankingController({
  authenticated,
  remoteWorkspaceConfigured,
  onRemoteRefresh,
}: CashBankingControllerOptions): CashBankingController {
  const [data, setData] = useState<CashBankingWorkspaceData>(() => remoteWorkspaceConfigured ? emptyCashBankingWorkspaceData() : readCashBankingWorkspaceFromLocal());
  const dataRef = useRef(data);
  dataRef.current = data;

  const applyWorkspaceData = useCallback((next: CashBankingWorkspaceData) => {
    dataRef.current = next;
    setData(next);
  }, []);

  const loadGuestWorkspace = useCallback(() => {
    const next = readCashBankingWorkspaceFromLocal();
    dataRef.current = next;
    setData(next);
  }, []);

  const reset = useCallback(() => {
    const next = emptyCashBankingWorkspaceData();
    dataRef.current = next;
    setData(next);
  }, []);

  const saveFinancialAccount = useCallback(async (account: FinancialAccount) => {
    if (authenticated) {
      const saved = await saveFinancialAccountToSupabase(account);
      applyWorkspaceData({ ...dataRef.current, accounts: [...dataRef.current.accounts.filter((item) => item.id !== account.id && item.id !== saved.id), saved] });
      return saved;
    }
    applyWorkspaceData({ ...dataRef.current, accounts: [...dataRef.current.accounts.filter((item) => item.id !== account.id), account] });
    return account;
  }, [applyWorkspaceData, authenticated]);

  const deactivateFinancialAccount = useCallback(async (account: FinancialAccount, reason: string) => {
    if (authenticated) {
      const saved = await deactivateFinancialAccountInSupabase(account.id, reason);
      applyWorkspaceData({ ...dataRef.current, accounts: dataRef.current.accounts.map((item) => item.id === saved.id ? saved : item) });
      return;
    }
    applyWorkspaceData({ ...dataRef.current, accounts: dataRef.current.accounts.map((item) => item.id === account.id ? { ...item, active: false, updatedAt: new Date().toISOString() } : item) });
  }, [applyWorkspaceData, authenticated]);

  const reactivateFinancialAccount = useCallback(async (account: FinancialAccount, reason: string) => {
    if (authenticated) {
      const saved = await reactivateFinancialAccountInSupabase(account.id, reason);
      applyWorkspaceData({ ...dataRef.current, accounts: dataRef.current.accounts.map((item) => item.id === saved.id ? saved : item) });
      return;
    }
    applyWorkspaceData({ ...dataRef.current, accounts: dataRef.current.accounts.map((item) => item.id === account.id ? { ...item, active: true, updatedAt: new Date().toISOString() } : item) });
  }, [applyWorkspaceData, authenticated]);

  const saveFinancialSnapshot = useCallback(async (snapshot: FinancialBalanceSnapshot) => {
    if (authenticated) {
      const saved = await saveFinancialBalanceSnapshotToSupabase(snapshot);
      applyWorkspaceData({ ...dataRef.current, snapshots: [saved, ...dataRef.current.snapshots.filter((item) => item.id !== saved.id)] });
      return;
    }
    applyWorkspaceData({ ...dataRef.current, snapshots: [snapshot, ...dataRef.current.snapshots.filter((item) => item.id !== snapshot.id)] });
  }, [applyWorkspaceData, authenticated]);

  const saveFinancialTransaction = useCallback(async (transaction: FinancialTransaction) => {
    if (authenticated) {
      const saved = await saveFinancialTransactionToSupabase(transaction);
      applyWorkspaceData({ ...dataRef.current, transactions: [saved, ...dataRef.current.transactions.filter((item) => item.id !== transaction.id && item.id !== saved.id)] });
      return;
    }
    applyWorkspaceData({ ...dataRef.current, transactions: [transaction, ...dataRef.current.transactions.filter((item) => item.id !== transaction.id)] });
  }, [applyWorkspaceData, authenticated]);

  const commitFinancialImport = useCallback(async (preview: StatementPreview, account: FinancialAccount) => {
    if (authenticated) {
      await commitFinancialImportToSupabase(preview, account);
      await onRemoteRefresh("cash-import");
      return;
    }
    applyWorkspaceData(commitStatementPreviewToWorkspace(dataRef.current, preview, account));
  }, [applyWorkspaceData, authenticated, onRemoteRefresh]);

  const saveFinancialMatch = useCallback(async (match: FinancialTransactionMatch, transaction: FinancialTransaction) => {
    if (authenticated) {
      await saveFinancialTransactionMatchToSupabase(match);
      await onRemoteRefresh("cash-settlement-confirmed");
      return;
    }
    const nextMatches = [...dataRef.current.matches.filter((item) => item.id !== match.id), match];
    applyWorkspaceData({ ...dataRef.current, matches: nextMatches, transactions: dataRef.current.transactions.map((item) => item.id === transaction.id ? transaction : item) });
  }, [applyWorkspaceData, authenticated, onRemoteRefresh]);

  const saveFinancialMatchBatch = useCallback(async (matches: FinancialTransactionMatch[], transaction: FinancialTransaction) => {
    if (authenticated) {
      await confirmFinancialSettlementBatchToSupabase(transaction.id, matches.map((match) => ({
        targetType: match.targetType,
        targetId: match.targetId || "",
        amount: match.matchedAmount,
        matchId: match.id,
        confidence: match.confidence,
        notes: match.notes,
      })));
      await onRemoteRefresh("cash-settlement-batch-confirmed");
      return;
    }
    const nextMatches = [...dataRef.current.matches.filter((item) => !matches.some((match) => match.id === item.id)), ...matches];
    applyWorkspaceData({ ...dataRef.current, matches: nextMatches, transactions: dataRef.current.transactions.map((item) => item.id === transaction.id ? transaction : item) });
  }, [applyWorkspaceData, authenticated, onRemoteRefresh]);

  const reverseFinancialMatch = useCallback(async (matchId: string, reason: string) => {
    if (authenticated) {
      await reverseFinancialSettlement(matchId, reason);
      await onRemoteRefresh("cash-match-reversed");
      return;
    }
    const targetMatch = dataRef.current.matches.find((match) => match.id === matchId);
    if (!targetMatch) return;
    const updatedAt = new Date().toISOString();
    const updatedMatch: FinancialTransactionMatch = { ...targetMatch, status: "REVERSED", reversedAt: updatedAt, reversalReason: reason, updatedAt };
    const nextMatches = dataRef.current.matches.map((match) => match.id === matchId ? updatedMatch : match);
    const affectedTransaction = dataRef.current.transactions.find((transaction) => transaction.id === targetMatch.transactionId);
    const nextTransactions = affectedTransaction
      ? dataRef.current.transactions.map((transaction) => transaction.id === affectedTransaction.id ? { ...transaction, reconciliationStatus: reconciliationStatusForTransaction(transaction, nextMatches), updatedAt } : transaction)
      : dataRef.current.transactions;
    applyWorkspaceData({ ...dataRef.current, matches: nextMatches, transactions: nextTransactions });
  }, [applyWorkspaceData, authenticated, onRemoteRefresh]);

  const correctFinancialTransaction = useCallback(async (
    transaction: FinancialTransaction,
    input: { transactionDate: string; referenceNumber?: string; description: string; direction: FinancialTransaction["direction"]; amount: number },
    reason: string,
  ) => {
    if (!isManualTransactionCorrectionEligible(transaction, dataRef.current.matches)) throw new Error("Only an unreconciled manual transaction without financial history can be edited.");
    if (authenticated) {
      const saved = await correctFinancialTransactionInSupabase(transaction.id, input, reason);
      applyWorkspaceData({ ...dataRef.current, transactions: dataRef.current.transactions.map((item) => item.id === saved.id ? saved : item) });
      return;
    }
    const updatedAt = new Date().toISOString();
    applyWorkspaceData({
      ...dataRef.current,
      transactions: dataRef.current.transactions.map((item) => item.id === transaction.id ? { ...item, ...input, referenceNumber: input.referenceNumber || undefined, postedAt: item.postedAt ? `${input.transactionDate}T00:00:00.000Z` : undefined, updatedAt } : item),
    });
  }, [applyWorkspaceData, authenticated]);

  const reverseFinancialTransaction = useCallback(async (transaction: FinancialTransaction, reason: string) => {
    if (authenticated) {
      const saved = await reverseFinancialTransactionInSupabase(transaction.id, reason);
      applyWorkspaceData({ ...dataRef.current, transactions: dataRef.current.transactions.map((item) => item.id === saved.id ? saved : item) });
      return;
    }
    const updatedAt = new Date().toISOString();
    applyWorkspaceData({ ...dataRef.current, transactions: dataRef.current.transactions.map((item) => item.id === transaction.id ? { ...item, status: "REVERSED", reconciliationStatus: "UNMATCHED", reversedAt: updatedAt, reversalReason: reason, updatedAt } : item) });
  }, [applyWorkspaceData, authenticated]);

  const ignoreFinancialTransaction = useCallback(async (transaction: FinancialTransaction, reason: string) => {
    if (authenticated) {
      const saved = await ignoreFinancialTransactionInSupabase(transaction.id, reason);
      applyWorkspaceData({ ...dataRef.current, transactions: dataRef.current.transactions.map((item) => item.id === saved.id ? saved : item) });
      return;
    }
    applyWorkspaceData({ ...dataRef.current, transactions: dataRef.current.transactions.map((item) => item.id === transaction.id ? { ...item, reconciliationStatus: "IGNORED", updatedAt: new Date().toISOString() } : item) });
  }, [applyWorkspaceData, authenticated]);

  const restoreFinancialTransactionToReview = useCallback(async (transaction: FinancialTransaction, reason: string) => {
    if (authenticated) {
      const saved = await restoreFinancialTransactionToReviewInSupabase(transaction.id, reason);
      applyWorkspaceData({ ...dataRef.current, transactions: dataRef.current.transactions.map((item) => item.id === saved.id ? saved : item) });
      return;
    }
    applyWorkspaceData({ ...dataRef.current, transactions: dataRef.current.transactions.map((item) => item.id === transaction.id ? { ...item, reconciliationStatus: "UNMATCHED", updatedAt: new Date().toISOString() } : item) });
  }, [applyWorkspaceData, authenticated]);

  const confirmFinancialTransfer = useCallback(async (left: FinancialTransaction, right: FinancialTransaction) => {
    if (authenticated) {
      await confirmFinancialTransferToSupabase(left.id, right.id, Math.min(left.amount, right.amount));
      await onRemoteRefresh("cash-transfer-confirmed");
      return;
    }
    const transferGroupId = financialId("transfer");
    const leftNext = { ...left, transferGroupId, reconciliationStatus: "MATCHED" as const, updatedAt: new Date().toISOString() };
    const rightNext = { ...right, transferGroupId, reconciliationStatus: "MATCHED" as const, updatedAt: new Date().toISOString() };
    const amount = Math.min(left.amount, right.amount);
    const leftMatch = createFinancialMatch({ companyId: left.companyId, transactionId: left.id, targetType: "TRANSFER", targetId: right.id, matchedAmount: amount, status: "CONFIRMED", confirmedAt: new Date().toISOString(), notes: "Confirmed internal transfer", transferGroupId });
    const rightMatch = createFinancialMatch({ companyId: right.companyId, transactionId: right.id, targetType: "TRANSFER", targetId: left.id, matchedAmount: amount, status: "CONFIRMED", confirmedAt: new Date().toISOString(), notes: "Confirmed internal transfer", transferGroupId });
    applyWorkspaceData({ ...dataRef.current, transactions: dataRef.current.transactions.map((item) => item.id === left.id ? leftNext : item.id === right.id ? rightNext : item), matches: [...dataRef.current.matches, leftMatch, rightMatch] });
  }, [applyWorkspaceData, authenticated, onRemoteRefresh]);

  const reverseFinancialTransfer = useCallback(async (left: FinancialTransaction, right: FinancialTransaction, reason: string) => {
    if (!left.transferGroupId || left.transferGroupId !== right.transferGroupId) throw new Error("The exact confirmed transfer pair is no longer available.");
    if (authenticated) {
      await reverseFinancialTransferInSupabase(left.id, right.id, left.transferGroupId, reason);
      await onRemoteRefresh("cash-transfer-reversed");
      return;
    }
    const updatedAt = new Date().toISOString();
    const nextMatches = dataRef.current.matches.map((match) => match.status === "CONFIRMED"
      && match.targetType === "TRANSFER"
      && ((match.transactionId === left.id && match.targetId === right.id) || (match.transactionId === right.id && match.targetId === left.id))
      ? { ...match, status: "REVERSED" as const, reversedAt: updatedAt, reversalReason: reason, updatedAt }
      : match);
    const nextTransactions = dataRef.current.transactions.map((transaction) => {
      if (transaction.id !== left.id && transaction.id !== right.id) return transaction;
      return { ...transaction, transferGroupId: undefined, reconciliationStatus: reconciliationStatusForTransaction({ ...transaction, transferGroupId: undefined, reconciliationStatus: "UNMATCHED" }, nextMatches), updatedAt };
    });
    applyWorkspaceData({ ...dataRef.current, matches: nextMatches, transactions: nextTransactions });
  }, [applyWorkspaceData, authenticated, onRemoteRefresh]);

  return {
    data,
    applyWorkspaceData,
    loadGuestWorkspace,
    reset,
    saveFinancialAccount,
    deactivateFinancialAccount,
    reactivateFinancialAccount,
    saveFinancialSnapshot,
    saveFinancialTransaction,
    commitFinancialImport,
    saveFinancialMatch,
    saveFinancialMatchBatch,
    reverseFinancialMatch,
    correctFinancialTransaction,
    reverseFinancialTransaction,
    ignoreFinancialTransaction,
    restoreFinancialTransactionToReview,
    confirmFinancialTransfer,
    reverseFinancialTransfer,
  };
}
