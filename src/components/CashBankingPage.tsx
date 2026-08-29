import React, { useEffect, useMemo, useState } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Ban,
  Check,
  ChevronRight,
  CircleAlert,
  FileSpreadsheet,
  Landmark,
  Plus,
  RefreshCw,
  ShieldCheck,
  Upload,
  WalletCards,
  X,
} from "lucide-react";
import {
  buildCashDashboardPosition,
  buildStatementPreview,
  createFinancialAccount,
  createFinancialMatch,
  createFinancialTransaction,
  financialId,
  findInternalTransferSuggestions,
  parseFinancialAmount,
  reconciliationStatusForTransaction,
  suggestFinancialMatches,
  normalizeMaskedFinancialIdentifier,
  type CashBankingWorkspaceData,
  type FinancialAccount,
  type FinancialAccountType,
  type FinancialBalanceSnapshot,
  type FinancialDirection,
  type FinancialReconciliationCandidate,
  type FinancialTransaction,
  type FinancialTransactionMatch,
  type ParsedStatementDocument,
  type StatementColumnMapping,
  type StatementPreview,
} from "../lib/cashBanking.ts";
import { parseStatementFile } from "../lib/cashBankingImport.ts";
import { EmptyState, MetricCard, Notice, PageHeader, SectionHeader, StatusBadge } from "./ui/OperationsUI.tsx";
import { safeErrorMessage } from "../utils/errorNormalization.ts";

export interface CashBankingPageProps {
  data: CashBankingWorkspaceData;
  selectedCurrency?: string;
  onCurrencyChange?: (currency: string) => void;
  onSaveAccount: (account: FinancialAccount) => Promise<FinancialAccount | void> | FinancialAccount | void;
  onDeactivateAccount?: (account: FinancialAccount) => Promise<void> | void;
  onSaveSnapshot?: (snapshot: FinancialBalanceSnapshot) => Promise<void> | void;
  onSaveTransaction: (transaction: FinancialTransaction) => Promise<void> | void;
  onCommitImport?: (preview: StatementPreview, account: FinancialAccount) => Promise<void> | void;
  onSaveMatch?: (match: FinancialTransactionMatch, transaction: FinancialTransaction) => Promise<void> | void;
  onReverseMatch?: (matchId: string, reason: string) => Promise<void> | void;
  onIgnoreTransaction?: (transaction: FinancialTransaction) => Promise<void> | void;
  onConfirmTransfer?: (left: FinancialTransaction, right: FinancialTransaction) => Promise<void> | void;
  reconciliationCandidates?: readonly FinancialReconciliationCandidate[];
  canManageAccounts?: boolean;
  canManageTransactions?: boolean;
  canImport?: boolean;
  canReconcile?: boolean;
  onOpenDashboard?: () => void;
}

type Modal = "account" | "balance" | "transaction" | "import" | null;

function today() { return new Date().toISOString().slice(0, 10); }

function monthRange(reference = today()) {
  const [year, month] = reference.slice(0, 7).split("-").map(Number);
  const from = `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-01`;
  const end = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
  return { from, to: end };
}

function money(value: number | undefined, currency: string) {
  try { return new Intl.NumberFormat("en-PH", { style: "currency", currency: currency || "PHP", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value) || 0); }
  catch { return `${currency || "PHP"} ${(Number(value) || 0).toFixed(2)}`; }
}

function dateLabel(value?: string) {
  if (!value) return "Not recorded";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
}

function cashError(error: unknown, fallback: string) { return safeErrorMessage(error, fallback); }

function accountTypeLabel(type: FinancialAccountType) {
  return type === "BANK" ? "Bank account" : type === "EWALLET" ? "GCash / e-wallet" : "Cash on hand";
}

function maskedIdentifier(value: string) {
  return normalizeMaskedFinancialIdentifier(value) || "";
}

function sourceLabel(transaction: FinancialTransaction) {
  return transaction.source === "MANUAL" ? "Manual" : transaction.source === "PROVIDER" ? "Provider" : "Imported";
}

function statusTone(status: FinancialTransaction["status"] | FinancialTransaction["reconciliationStatus"]): "neutral" | "info" | "success" | "warning" | "danger" {
  if (status === "POSTED" || status === "MATCHED") return "success";
  if (status === "PENDING" || status === "SUGGESTED" || status === "PARTIAL") return "warning";
  if (status === "REVERSED") return "danger";
  return "neutral";
}

function defaultAccountForm(): Omit<FinancialAccount, "id" | "createdAt" | "updatedAt"> {
  return { accountType: "BANK", institutionCode: "", institutionName: "", displayName: "", maskedIdentifier: "", currency: "PHP", openingBalance: 0, openingBalanceDate: today(), connectionType: "MANUAL", active: true };
}

function defaultTransactionForm(): { transactionDate: string; referenceNumber: string; description: string; direction: FinancialDirection; amount: string } {
  return { transactionDate: today(), referenceNumber: "", description: "", direction: "DEBIT", amount: "" };
}

export const CashBankingPage: React.FC<CashBankingPageProps> = ({
  data,
  selectedCurrency: controlledCurrency,
  onCurrencyChange,
  onSaveAccount,
  onDeactivateAccount,
  onSaveSnapshot,
  onSaveTransaction,
  onCommitImport,
  onSaveMatch,
  onIgnoreTransaction,
  onConfirmTransfer,
  reconciliationCandidates = [],
  canManageAccounts = true,
  canManageTransactions = true,
  canImport = true,
  canReconcile = true,
  onOpenDashboard,
}) => {
  const currencies = useMemo(() => [...new Set(data.accounts.map((account) => account.currency.toUpperCase()))].sort(), [data.accounts]);
  const [localCurrency, setLocalCurrency] = useState(controlledCurrency || currencies[0] || "PHP");
  const currency = controlledCurrency || localCurrency;
  useEffect(() => {
    if (!controlledCurrency && currencies.length && !currencies.includes(localCurrency)) setLocalCurrency(currencies[0]!);
  }, [controlledCurrency, currencies, localCurrency]);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(data.accounts.find((account) => account.active)?.id || data.accounts[0]?.id || null);
  const [modal, setModal] = useState<Modal>(null);
  const [accountForm, setAccountForm] = useState(defaultAccountForm);
  const [balanceAccountId, setBalanceAccountId] = useState("");
  const [balanceValue, setBalanceValue] = useState("");
  const [pendingValue, setPendingValue] = useState("");
  const [transactionForm, setTransactionForm] = useState(defaultTransactionForm);
  const [statementDocument, setStatementDocument] = useState<ParsedStatementDocument | null>(null);
  const [mapping, setMapping] = useState<StatementColumnMapping>({});
  const [importAccountId, setImportAccountId] = useState("");
  const [preview, setPreview] = useState<StatementPreview | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: "success" | "warning" | "danger"; text: string } | null>(null);
  const [importError, setImportError] = useState("");

  const position = useMemo(() => buildCashDashboardPosition(data, currency, monthRange()), [data, currency]);
  const selectedAccount = data.accounts.find((account) => account.id === selectedAccountId && account.active && account.currency.toUpperCase() === currency.toUpperCase()) || position.accounts[0]?.account || data.accounts.find((account) => account.active);
  const accountTransactions = useMemo(() => selectedAccount ? data.transactions.filter((transaction) => transaction.accountId === selectedAccount.id).sort((left, right) => right.transactionDate.localeCompare(left.transactionDate) || right.createdAt.localeCompare(left.createdAt)) : [], [data.transactions, selectedAccount]);
  const transferSuggestions = useMemo(() => findInternalTransferSuggestions(data.transactions, data.matches).filter((suggestion) => !selectedAccount || suggestion.left.accountId === selectedAccount.id || suggestion.right.accountId === selectedAccount.id).slice(0, 5), [data.transactions, data.matches, selectedAccount]);
  const unresolved = accountTransactions.filter((transaction) => transaction.status !== "REVERSED" && transaction.reconciliationStatus !== "MATCHED" && transaction.reconciliationStatus !== "IGNORED");
  const inactiveAccounts = data.accounts.filter((account) => !account.active);

  const setCurrency = (next: string) => {
    setLocalCurrency(next);
    onCurrencyChange?.(next);
  };

  const openAccountForm = () => {
    setAccountForm({ ...defaultAccountForm(), currency });
    setNotice(null);
    setModal("account");
  };

  const saveAccount = async () => {
    if (!accountForm.displayName.trim() || !accountForm.institutionName.trim()) {
      setNotice({ tone: "danger", text: "Account name and institution are required." });
      return;
    }
    const normalizedIdentifier = maskedIdentifier(accountForm.maskedIdentifier || "");
    if (accountForm.maskedIdentifier?.trim() && !/^••••\s\d{4}$/.test(normalizedIdentifier)) {
      setNotice({ tone: "danger", text: "Use only a masked identifier such as •••• 7281, or leave it blank." });
      return;
    }
    setBusy("account");
    try {
      const account = createFinancialAccount({ ...accountForm, maskedIdentifier: normalizedIdentifier });
      const savedAccount = await onSaveAccount(account);
      setSelectedAccountId(savedAccount ? savedAccount.id : account.id);
      setModal(null);
      setNotice({ tone: "success", text: `${account.displayName} was added. Its balance source is Manual until a statement is imported.` });
    } catch (error) {
      setNotice({ tone: "danger", text: cashError(error, "The account could not be saved.") });
    } finally { setBusy(null); }
  };

  const openBalanceForm = (account: FinancialAccount) => {
    setBalanceAccountId(account.id);
    setBalanceValue("");
    setPendingValue("");
    setNotice(null);
    setModal("balance");
  };

  const saveBalance = async () => {
    const account = data.accounts.find((item) => item.id === balanceAccountId);
    const available = parseFinancialAmount(balanceValue);
    if (!account || available === undefined) {
      setNotice({ tone: "danger", text: "Enter a valid available balance." });
      return;
    }
    if (!onSaveSnapshot) return;
    setBusy("balance");
    try {
      await onSaveSnapshot({ id: financialId("snapshot"), companyId: account.companyId, accountId: account.id, capturedAt: new Date().toISOString(), ledgerBalance: available, availableBalance: available, ...(parseFinancialAmount(pendingValue) === undefined ? {} : { pendingBalance: parseFinancialAmount(pendingValue) }), source: "MANUAL", createdByUserId: account.createdByUserId, createdAt: new Date().toISOString() });
      setModal(null);
      setNotice({ tone: "success", text: "Manual balance recorded. It is visibly marked as Manual until a newer statement or provider snapshot exists." });
    } catch (error) { setNotice({ tone: "danger", text: cashError(error, "The balance could not be recorded.") }); }
    finally { setBusy(null); }
  };

  const saveTransaction = async () => {
    if (!selectedAccount || !transactionForm.description.trim()) {
      setNotice({ tone: "danger", text: "Choose an account and enter a description." });
      return;
    }
    const amount = parseFinancialAmount(transactionForm.amount);
    if (amount === undefined || amount <= 0) {
      setNotice({ tone: "danger", text: "Enter a positive transaction amount." });
      return;
    }
    setBusy("transaction");
    try {
      await onSaveTransaction(createFinancialTransaction({ accountId: selectedAccount.id, companyId: selectedAccount.companyId, transactionDate: transactionForm.transactionDate, postedAt: transactionForm.transactionDate, referenceNumber: transactionForm.referenceNumber.trim() || undefined, description: transactionForm.description.trim(), direction: transactionForm.direction, amount, currency: selectedAccount.currency, status: "POSTED", source: "MANUAL", reconciliationStatus: "UNMATCHED", createdByUserId: selectedAccount.createdByUserId }));
      setTransactionForm(defaultTransactionForm());
      setModal(null);
      setNotice({ tone: "success", text: "Manual transaction recorded and left unreconciled for review." });
    } catch (error) { setNotice({ tone: "danger", text: cashError(error, "The transaction could not be saved.") }); }
    finally { setBusy(null); }
  };

  const readImportFile = async (file: File) => {
    setImportError("");
    setPreview(null);
    try {
      if (!/\.(csv|xlsx|xls|xlsm)$/i.test(file.name)) throw new Error("Cash statement import supports CSV and XLSX files.");
      const parsed = parseStatementFile(await file.arrayBuffer(), file.name);
      setStatementDocument(parsed);
      setMapping(parsed.structure.mapping);
      setImportAccountId(selectedAccount?.id || data.accounts.find((account) => account.active)?.id || "");
    } catch (error) { setImportError(cashError(error, "The statement could not be read.")); }
  };

  const buildPreview = () => {
    if (!statementDocument || !importAccountId) {
      setImportError("Choose an account and statement file first.");
      return;
    }
    const account = data.accounts.find((item) => item.id === importAccountId);
    if (!account) return;
    setPreview(buildStatementPreview(statementDocument, mapping, account.id, account.currency, data.transactions, data.importBatches.filter((batch) => batch.accountId === account.id).map((batch) => batch.fileFingerprint)));
    setImportError("");
  };

  const commitImport = async () => {
    const account = data.accounts.find((item) => item.id === importAccountId);
    if (!preview || !account || !onCommitImport) return;
    setBusy("import");
    try {
      await onCommitImport(preview, account);
      setSelectedAccountId(account.id);
      setModal(null);
      setStatementDocument(null);
      setPreview(null);
      setNotice({ tone: "success", text: `Statement imported: ${preview.transactionsToImport.length} new transaction${preview.transactionsToImport.length === 1 ? "" : "s"}; ${preview.duplicateCount} duplicate${preview.duplicateCount === 1 ? "" : "s"} skipped.` });
    } catch (error) { setImportError(cashError(error, "The statement could not be committed.")); }
    finally { setBusy(null); }
  };

  const confirmSuggestion = async (transaction: FinancialTransaction, suggestion: ReturnType<typeof suggestFinancialMatches>[number]) => {
    if (!onSaveMatch) return;
    const remaining = Math.max(0, transaction.amount - data.matches.filter((match) => match.transactionId === transaction.id && match.status === "CONFIRMED").reduce((sum, match) => sum + match.matchedAmount, 0));
    const matchedAmount = Math.min(remaining, suggestion.candidate.amount);
    if (matchedAmount <= 0) return;
    setBusy(`match:${transaction.id}`);
    try {
      const match = createFinancialMatch({ companyId: transaction.companyId, transactionId: transaction.id, targetType: suggestion.candidate.targetType, targetId: suggestion.candidate.targetId, matchedAmount, status: "CONFIRMED", confidence: suggestion.score, confirmedAt: new Date().toISOString(), confirmedByUserId: transaction.createdByUserId, notes: "Confirmed by finance user from a deterministic suggestion." });
      const nextMatches = [...data.matches, match];
      await onSaveMatch(match, { ...transaction, reconciliationStatus: reconciliationStatusForTransaction(transaction, nextMatches) });
      setNotice({ tone: "success", text: `${suggestion.candidate.label} was confirmed as a ${money(matchedAmount, transaction.currency)} match. The source record was not changed.` });
    } catch (error) { setNotice({ tone: "danger", text: cashError(error, "The reconciliation could not be saved.") }); }
    finally { setBusy(null); }
  };

  const ignoreTransaction = async (transaction: FinancialTransaction) => {
    if (!onIgnoreTransaction) return;
    setBusy(`ignore:${transaction.id}`);
    try { await onIgnoreTransaction({ ...transaction, reconciliationStatus: "IGNORED" }); setNotice({ tone: "success", text: "Transaction marked ignored. It remains in the ledger." }); }
    catch (error) { setNotice({ tone: "danger", text: cashError(error, "The transaction could not be updated.") }); }
    finally { setBusy(null); }
  };

  const confirmTransfer = async (left: FinancialTransaction, right: FinancialTransaction) => {
    if (!onConfirmTransfer) return;
    setBusy(`transfer:${left.id}`);
    try { await onConfirmTransfer(left, right); setNotice({ tone: "success", text: "Internal transfer confirmed. Both ledger entries remain, and principal movement is excluded from operating cash flow." }); }
    catch (error) { setNotice({ tone: "danger", text: cashError(error, "The transfer could not be confirmed.") }); }
    finally { setBusy(null); }
  };

  const deactivateAccount = async (account: FinancialAccount) => {
    if (!onDeactivateAccount || (typeof window !== "undefined" && !window.confirm(`Deactivate ${account.displayName}? Its ledger and history will remain available.`))) return;
    setBusy(`deactivate:${account.id}`);
    try { await onDeactivateAccount(account); setNotice({ tone: "success", text: `${account.displayName} was deactivated. Its financial history remains preserved.` }); }
    catch (error) { setNotice({ tone: "danger", text: cashError(error, "The account could not be deactivated.") }); }
    finally { setBusy(null); }
  };


  return <div className="space-y-5">
    <PageHeader eyebrow="Financial operations" title="Cash & Banking" description="Company-scoped liquidity, statement-ledger imports, and confirmation-based reconciliation. Manual and statement balances are never presented as a live bank connection." actions={<div className="flex flex-wrap gap-2">{onOpenDashboard && <button type="button" onClick={onOpenDashboard} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[10px] font-black text-slate-700 hover:bg-slate-50">Executive Dashboard</button>}{canImport && data.accounts.length > 0 && <button type="button" onClick={() => { setImportError(""); setStatementDocument(null); setPreview(null); setModal("import"); }} className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-[10px] font-black text-indigo-800 hover:bg-indigo-100"><Upload className="h-3.5 w-3.5" /> Import statement</button>}{canManageAccounts && <button type="button" onClick={openAccountForm} className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-[10px] font-black text-white shadow-sm hover:bg-indigo-700"><Plus className="h-3.5 w-3.5" /> Add account</button>}</div>} />
    {notice && <Notice tone={notice.tone}>{notice.text}<button type="button" aria-label="Dismiss cash notice" className="ml-3 rounded p-0.5" onClick={() => setNotice(null)}><X className="h-3.5 w-3.5" /></button></Notice>}
    <section className="flex flex-col justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-end" aria-label="Cash controls"><div><SectionHeader title="Position controls" description="Totals are selected-currency only; no implicit FX conversion is applied." icon={WalletCards} /></div><label className="min-w-[10rem] space-y-1"><span className="field-label">Currency</span><select className="field-input" value={currency} onChange={(event) => setCurrency(event.target.value)}>{(currencies.length ? currencies : [currency]).map((item) => <option key={item} value={item}>{item}</option>)}</select></label></section>
    {!position.hasAccounts ? <EmptyState title={data.accounts.length ? "No active cash accounts" : "No cash accounts yet"} description="Add a bank or GCash account to see your company’s cash position. The first release uses manual balances and statement imports; it does not pretend to be a live bank connection." icon={Landmark} action={canManageAccounts && <button type="button" onClick={openAccountForm} className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-black text-white hover:bg-indigo-700"><Plus className="h-3.5 w-3.5" /> Add account</button>} /> : <>
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-7" aria-label="Cash summary"><MetricCard label="Total available cash" value={money(position.totalAvailableCash, currency)} detail="Selected currency" icon={WalletCards} tone="success" emphasis /><MetricCard label="Bank accounts" value={money(position.bankAccounts, currency)} detail="Available / ledger" icon={Landmark} tone="info" /><MetricCard label="GCash / e-wallets" value={money(position.ewallets, currency)} detail="First-class account type" icon={WalletCards} tone="info" /><MetricCard label="Money in" value={money(position.moneyIn, currency)} detail="Posted, excluding transfers" icon={ArrowDownLeft} tone="success" /><MetricCard label="Money out" value={money(position.moneyOut, currency)} detail="Posted, excluding transfers" icon={ArrowUpRight} tone="warning" /><MetricCard label="Net cash flow" value={`${position.netCashFlow >= 0 ? "+" : "−"}${money(Math.abs(position.netCashFlow), currency)}`} detail="Selected month" icon={RefreshCw} tone={position.netCashFlow >= 0 ? "success" : "danger"} /><MetricCard label="Needs reconciliation" value={position.needsReconciliation} detail="Unmatched / suggested" icon={CircleAlert} tone={position.needsReconciliation ? "warning" : "success"} /></section>
      {(position.pendingIn > 0 || position.pendingOut > 0) && <Notice tone="warning">Pending activity is shown separately: {position.pendingIn > 0 && `${money(position.pendingIn, currency)} in`}{position.pendingIn > 0 && position.pendingOut > 0 ? " · " : ""}{position.pendingOut > 0 && `${money(position.pendingOut, currency)} out`}. It is not mixed into posted cash flow.</Notice>}
      <section aria-label="Cash accounts"><SectionHeader title="Accounts" description="Balance source and freshness remain visible on every account." icon={Landmark} action={<span className="text-[10px] font-semibold text-slate-500">{position.accounts.length} active in {currency}</span>} /><div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{position.accounts.map((summary) => <button type="button" key={summary.account.id} onClick={() => setSelectedAccountId(summary.account.id)} className={`rounded-xl border p-4 text-left transition ${selectedAccount?.id === summary.account.id ? "border-indigo-300 bg-indigo-50/40 shadow-sm" : "border-slate-200 bg-white hover:border-indigo-200"}`}><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-black text-slate-950">{summary.account.displayName}</p><p className="mt-1 truncate text-[10px] text-slate-500">{summary.account.institutionName} · {accountTypeLabel(summary.account.accountType)}</p><p className="mt-0.5 text-[10px] font-semibold tracking-wide text-slate-500">{summary.account.maskedIdentifier || "Identifier not recorded"}</p></div><StatusBadge tone={summary.source === "PROVIDER" ? "success" : summary.source === "STATEMENT" ? "info" : summary.source === "MANUAL" ? "warning" : "neutral"}>{summary.source}</StatusBadge></div><p className="mt-4 break-words text-xl font-black tabular-nums text-slate-950">{money(summary.availableBalance ?? summary.ledgerBalance, currency)}</p>{summary.pendingBalance !== undefined && summary.pendingBalance > 0 && <p className="mt-1 text-[10px] font-semibold text-amber-700">{money(summary.pendingBalance, currency)} pending</p>}<p className="mt-3 break-words text-[10px] text-slate-500">{summary.freshnessLabel}</p><div className="mt-2 flex items-center justify-between gap-2 text-[10px] font-semibold text-slate-600"><span>{summary.unresolvedCount ? `${summary.unresolvedCount} need review` : "Fully reconciled"}</span><ChevronRight className="h-3.5 w-3.5 text-indigo-500" /></div></button>)}</div></section>
      {selectedAccount && <section className="rounded-xl border border-slate-200 bg-white shadow-sm" aria-label="Account ledger"><div className="flex flex-col justify-between gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-start sm:p-5"><div className="min-w-0"><p className="text-[10px] font-black uppercase tracking-[0.16em] text-indigo-600">Account ledger</p><h2 className="mt-1 truncate text-lg font-black text-slate-950">{selectedAccount.displayName}</h2><p className="mt-1 break-words text-xs text-slate-500">{selectedAccount.institutionName} · {selectedAccount.maskedIdentifier || "Masked identifier not recorded"} · {selectedAccount.currency}</p></div><div className="flex flex-wrap gap-2">{canManageAccounts && <button type="button" onClick={() => openBalanceForm(selectedAccount)} className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[10px] font-black text-amber-900">Record manual balance</button>}{canManageTransactions && <button type="button" onClick={() => { setTransactionForm(defaultTransactionForm()); setModal("transaction"); }} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[10px] font-black text-slate-700">Add transaction</button>}{canImport && <button type="button" onClick={() => { setImportAccountId(selectedAccount.id); setImportError(""); setModal("import"); }} className="rounded-lg bg-indigo-600 px-3 py-2 text-[10px] font-black text-white">Import</button>}</div></div><div className="grid gap-3 border-b border-slate-100 p-4 sm:grid-cols-2 lg:grid-cols-4"><Summary label="Available / ledger" value={money(position.accounts.find((item) => item.account.id === selectedAccount.id)?.availableBalance ?? position.accounts.find((item) => item.account.id === selectedAccount.id)?.ledgerBalance, selectedAccount.currency)} /><Summary label="Opening balance" value={money(selectedAccount.openingBalance, selectedAccount.currency)} /><Summary label="Opening date" value={dateLabel(selectedAccount.openingBalanceDate)} /><Summary label="Reconciliation" value={`${accountTransactions.filter((item) => item.reconciliationStatus === "MATCHED" || item.reconciliationStatus === "IGNORED").length} / ${accountTransactions.length} resolved`} /></div><div className="overflow-x-auto"><table className="min-w-[900px] w-full text-left text-xs"><thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Date</th><th className="px-4 py-3">Reference</th><th className="px-4 py-3">Description</th><th className="px-4 py-3 text-right">Money in</th><th className="px-4 py-3 text-right">Money out</th><th className="px-4 py-3 text-right">Running balance</th><th className="px-4 py-3">Source / status</th><th className="px-4 py-3">Match</th></tr></thead><tbody className="divide-y divide-slate-100">{accountTransactions.map((transaction) => <tr key={transaction.id} className="align-top hover:bg-slate-50"><td className="whitespace-nowrap px-4 py-3 font-semibold text-slate-700">{transaction.transactionDate}</td><td className="max-w-[140px] truncate px-4 py-3 text-slate-500">{transaction.referenceNumber || "—"}</td><td className="max-w-[260px] px-4 py-3"><p className="break-words font-semibold text-slate-800">{transaction.description}</p><p className="mt-1 text-[10px] text-slate-400">{sourceLabel(transaction)}</p></td><td className="px-4 py-3 text-right font-black tabular-nums text-emerald-700">{transaction.direction === "CREDIT" ? money(transaction.amount, selectedAccount.currency) : "—"}</td><td className="px-4 py-3 text-right font-black tabular-nums text-rose-700">{transaction.direction === "DEBIT" ? money(transaction.amount, selectedAccount.currency) : "—"}</td><td className="px-4 py-3 text-right font-black tabular-nums text-slate-800">{transaction.runningBalance === undefined ? "—" : money(transaction.runningBalance, selectedAccount.currency)}</td><td className="px-4 py-3"><div className="flex flex-wrap gap-1"><StatusBadge tone={statusTone(transaction.status)}>{transaction.status}</StatusBadge><StatusBadge tone={statusTone(transaction.reconciliationStatus)}>{transaction.reconciliationStatus}</StatusBadge></div></td><td className="px-4 py-3">{transaction.reconciliationStatus === "UNMATCHED" && canReconcile ? <button type="button" onClick={() => document.getElementById(`cash-reconcile-${transaction.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" })} className="whitespace-nowrap text-[10px] font-black text-indigo-700 hover:underline">Review below</button> : transaction.reconciliationStatus === "IGNORED" ? <span className="text-[10px] text-slate-500">Ignored</span> : <span className="text-[10px] font-semibold text-emerald-700">Resolved</span>}</td></tr>)}</tbody></table>{!accountTransactions.length && <div className="p-10 text-center text-xs text-slate-500">No transactions recorded for this account yet. Import a statement or add a manual transaction.</div>}</div></section>}
      {canReconcile && selectedAccount && <section id="cash-reconcile" className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]"><section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"><SectionHeader title="Reconciliation queue" description="Suggestions use amount, date, reference, and description. Confirmation is always explicit and never mutates the source record." icon={ShieldCheck} /><div className="mt-4 space-y-3">{unresolved.length ? unresolved.slice(0, 8).map((transaction) => { const suggestions = suggestFinancialMatches(transaction, reconciliationCandidates); return <div key={transaction.id} id={`cash-reconcile-${transaction.id}`} className="rounded-xl border border-amber-200 bg-amber-50/40 p-3"><div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-start"><div className="min-w-0"><p className="break-words text-xs font-black text-slate-900">{transaction.description}</p><p className="mt-1 text-[10px] text-slate-500">{transaction.transactionDate} · {transaction.direction} · {money(transaction.amount, transaction.currency)}</p></div><StatusBadge tone="warning">Needs review</StatusBadge></div>{suggestions.length ? <div className="mt-3 space-y-2">{suggestions.map((suggestion) => <div key={`${transaction.id}-${suggestion.candidate.targetType}-${suggestion.candidate.targetId}`} className="flex flex-col justify-between gap-2 rounded-lg border border-white bg-white p-2.5 sm:flex-row sm:items-center"><div className="min-w-0"><p className="truncate text-[10px] font-black text-slate-800">Suggested match · {suggestion.candidate.label}</p><p className="mt-0.5 text-[10px] text-slate-500">{suggestion.candidate.targetType} · {suggestion.reasons.join(" · ")} · {suggestion.score}% confidence</p></div><button type="button" disabled={busy === `match:${transaction.id}`} onClick={() => void confirmSuggestion(transaction, suggestion)} className="shrink-0 rounded-lg bg-indigo-600 px-2.5 py-1.5 text-[10px] font-black text-white disabled:opacity-50">{busy === `match:${transaction.id}` ? "Saving…" : "Confirm match"}</button></div>)}</div> : <p className="mt-3 text-[10px] text-slate-600">No deterministic suggestion yet. Review the ledger and keep the transaction unmatched until a finance user can identify it.</p>}<button type="button" disabled={busy === `ignore:${transaction.id}`} onClick={() => void ignoreTransaction(transaction)} className="mt-3 inline-flex items-center gap-1 text-[10px] font-bold text-slate-600 hover:text-slate-900 disabled:opacity-50"><Ban className="h-3 w-3" /> Mark ignored</button></div>; }) : <div className="rounded-xl border border-dashed border-emerald-200 bg-emerald-50 p-4 text-xs font-semibold text-emerald-800">No unresolved transactions for this account.</div>}</div></section><section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"><SectionHeader title="Internal transfer suggestions" description="Opposite same-currency movements across company accounts remain in both ledgers but do not double-count cash flow after confirmation." icon={RefreshCw} /><div className="mt-4 space-y-2">{transferSuggestions.length ? transferSuggestions.map((suggestion) => <div key={`${suggestion.left.id}-${suggestion.right.id}`} className="rounded-xl border border-sky-200 bg-sky-50/60 p-3"><p className="text-xs font-black text-slate-900">Possible internal transfer</p><p className="mt-1 break-words text-[10px] text-slate-600">{suggestion.left.description} ↔ {suggestion.right.description}</p><p className="mt-1 text-[10px] font-semibold text-slate-700">{money(suggestion.left.amount, suggestion.left.currency)} · {suggestion.reasons.join(" · ")}</p><button type="button" disabled={busy === `transfer:${suggestion.left.id}`} onClick={() => void confirmTransfer(suggestion.left, suggestion.right)} className="mt-3 rounded-lg bg-sky-700 px-2.5 py-1.5 text-[10px] font-black text-white disabled:opacity-50">{busy === `transfer:${suggestion.left.id}` ? "Saving…" : "Confirm transfer"}</button></div>) : <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-xs text-slate-500">No transfer suggestions across the current account set.</div>}</div></section></section>}
      {canManageAccounts && onDeactivateAccount && selectedAccount && <div className="flex justify-end"><button type="button" disabled={busy === `deactivate:${selectedAccount.id}`} onClick={() => void deactivateAccount(selectedAccount)} className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[10px] font-black text-rose-800 disabled:opacity-50">{busy === `deactivate:${selectedAccount.id}` ? "Deactivating…" : "Deactivate selected account"}</button></div>}
      {inactiveAccounts.length > 0 && <section className="rounded-xl border border-slate-200 bg-slate-50 p-4"><SectionHeader title="Inactive accounts" description="Deactivation preserves the account, transactions, imports, and reconciliation history." icon={Ban} /><div className="mt-3 flex flex-wrap gap-2">{inactiveAccounts.map((account) => <span key={account.id} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[10px] font-semibold text-slate-600">{account.displayName} · {account.currency} · inactive</span>)}</div></section>}
      {selectedAccount && position.accounts.find((item) => item.account.id === selectedAccount.id)?.balanceDifference !== undefined && <Notice tone="warning">The latest {position.accounts.find((item) => item.account.id === selectedAccount.id)?.source.toLowerCase()} snapshot differs from the calculated book balance by {money(Math.abs(position.accounts.find((item) => item.account.id === selectedAccount.id)?.balanceDifference || 0), selectedAccount.currency)}. Review the statement or record a newer balance before relying on available cash.</Notice>}
    </>}

    {modal === "account" && <ModalShell title="Add cash account" onClose={() => setModal(null)}><div className="grid gap-3 sm:grid-cols-2"><label className="space-y-1"><span className="field-label">Account type</span><select className="field-input" value={accountForm.accountType} onChange={(event) => setAccountForm((current) => ({ ...current, accountType: event.target.value as FinancialAccountType, institutionName: event.target.value === "EWALLET" ? "GCash" : current.institutionName, institutionCode: event.target.value === "EWALLET" ? "GCASH" : current.institutionCode }))}><option value="BANK">Bank</option><option value="EWALLET">GCash / e-wallet</option><option value="CASH">Cash on hand</option></select></label><label className="space-y-1"><span className="field-label">Currency</span><input className="field-input" maxLength={3} value={accountForm.currency} onChange={(event) => setAccountForm((current) => ({ ...current, currency: event.target.value.toUpperCase() }))} /></label><label className="space-y-1"><span className="field-label">Institution</span><input className="field-input" value={accountForm.institutionName} onChange={(event) => setAccountForm((current) => ({ ...current, institutionName: event.target.value }))} placeholder="BDO, BPI, GCash" /></label><label className="space-y-1"><span className="field-label">Display name</span><input className="field-input" value={accountForm.displayName} onChange={(event) => setAccountForm((current) => ({ ...current, displayName: event.target.value }))} placeholder="BDO Operating" /></label><label className="space-y-1"><span className="field-label">Masked identifier / last 4</span><input className="field-input" value={accountForm.maskedIdentifier || ""} onChange={(event) => setAccountForm((current) => ({ ...current, maskedIdentifier: event.target.value }))} placeholder="•••• 7281" /><span className="text-[10px] text-slate-500">Never enter a password, PIN, OTP, or full account number.</span></label><label className="space-y-1"><span className="field-label">Opening balance</span><input className="field-input" type="number" step="0.01" value={accountForm.openingBalance} onChange={(event) => setAccountForm((current) => ({ ...current, openingBalance: Number(event.target.value) || 0 }))} /></label><label className="space-y-1"><span className="field-label">Opening balance date</span><input className="field-input" type="date" value={accountForm.openingBalanceDate} onChange={(event) => setAccountForm((current) => ({ ...current, openingBalanceDate: event.target.value }))} /></label><label className="space-y-1"><span className="field-label">Balance source</span><select className="field-input" value={accountForm.connectionType} onChange={(event) => setAccountForm((current) => ({ ...current, connectionType: event.target.value as FinancialAccount["connectionType"] }))}><option value="MANUAL">Manual</option><option value="STATEMENT">Statement</option></select></label></div><div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setModal(null)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700">Cancel</button><button type="button" disabled={busy === "account"} onClick={() => void saveAccount()} className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-black text-white disabled:opacity-50">{busy === "account" ? "Saving…" : "Add account"}</button></div></ModalShell>}
    {modal === "balance" && <ModalShell title="Record manual balance" onClose={() => setModal(null)}><p className="text-xs leading-5 text-slate-600">This creates a dated Manual balance snapshot. It will not be shown as a live provider connection.</p><div className="mt-4 grid gap-3 sm:grid-cols-2"><label className="space-y-1 sm:col-span-2"><span className="field-label">Account</span><select className="field-input" value={balanceAccountId} onChange={(event) => setBalanceAccountId(event.target.value)}>{data.accounts.map((account) => <option key={account.id} value={account.id}>{account.displayName} · {account.currency}</option>)}</select></label><label className="space-y-1"><span className="field-label">Available balance</span><input autoFocus className="field-input" type="number" step="0.01" value={balanceValue} onChange={(event) => setBalanceValue(event.target.value)} placeholder="625000.00" /></label><label className="space-y-1"><span className="field-label">Pending balance (optional)</span><input className="field-input" type="number" step="0.01" value={pendingValue} onChange={(event) => setPendingValue(event.target.value)} placeholder="0.00" /></label></div><div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setModal(null)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700">Cancel</button><button type="button" disabled={busy === "balance"} onClick={() => void saveBalance()} className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-black text-white disabled:opacity-50">{busy === "balance" ? "Saving…" : "Record manual balance"}</button></div></ModalShell>}
    {modal === "transaction" && <ModalShell title="Add manual transaction" onClose={() => setModal(null)}><p className="text-xs leading-5 text-slate-600">Amount is always positive internally; direction determines whether it is Money in or Money out. This entry stays marked Manual.</p><div className="mt-4 grid gap-3 sm:grid-cols-2"><label className="space-y-1"><span className="field-label">Date</span><input className="field-input" type="date" value={transactionForm.transactionDate} onChange={(event) => setTransactionForm((current) => ({ ...current, transactionDate: event.target.value }))} /></label><label className="space-y-1"><span className="field-label">Direction</span><select className="field-input" value={transactionForm.direction} onChange={(event) => setTransactionForm((current) => ({ ...current, direction: event.target.value as FinancialDirection }))}><option value="CREDIT">Credit / Money in</option><option value="DEBIT">Debit / Money out</option></select></label><label className="space-y-1"><span className="field-label">Reference</span><input className="field-input" value={transactionForm.referenceNumber} onChange={(event) => setTransactionForm((current) => ({ ...current, referenceNumber: event.target.value }))} placeholder="Reference" /></label><label className="space-y-1"><span className="field-label">Amount</span><input className="field-input" type="number" step="0.01" value={transactionForm.amount} onChange={(event) => setTransactionForm((current) => ({ ...current, amount: event.target.value }))} placeholder="1000.00" /></label><label className="space-y-1 sm:col-span-2"><span className="field-label">Description</span><textarea className="field-input min-h-20" value={transactionForm.description} onChange={(event) => setTransactionForm((current) => ({ ...current, description: event.target.value }))} placeholder="Transaction description" /></label></div><div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setModal(null)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700">Cancel</button><button type="button" disabled={busy === "transaction"} onClick={() => void saveTransaction()} className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-black text-white disabled:opacity-50">{busy === "transaction" ? "Saving…" : "Add manual transaction"}</button></div></ModalShell>}
    {modal === "import" && <ModalShell title="Import statement" onClose={() => setModal(null)} wide><div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(11rem,0.55fr)]"><label className="space-y-1"><span className="field-label">Account</span><select className="field-input" value={importAccountId} onChange={(event) => { setImportAccountId(event.target.value); setPreview(null); }}>{data.accounts.filter((account) => account.active).map((account) => <option key={account.id} value={account.id}>{account.displayName} · {account.currency}</option>)}</select></label><label className="space-y-1"><span className="field-label">Statement file</span><input className="field-input" type="file" accept=".csv,.xlsx,.xls,.xlsm" onChange={(event) => { const file = event.target.files?.[0]; if (file) void readImportFile(file); }} /></label></div>{importError && <div role="alert" className="mt-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-900">{importError}</div>}{statementDocument && <><div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-3"><div className="flex items-start gap-2"><FileSpreadsheet className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /><div className="min-w-0"><p className="text-xs font-black text-slate-900">{statementDocument.fileName} · {statementDocument.sheetName || "Statement"}</p><p className="mt-1 text-[10px] leading-4 text-slate-500">Detected {statementDocument.structure.confidence} confidence. {statementDocument.structure.reasons.join(" ") || "Map the statement columns below."}</p></div></div></div><div className="mt-4"><SectionHeader title="Map statement columns" description="Required: date, description, and either Income/Expense or Amount + Direction. Running balance is optional but validated when supplied." icon={FileSpreadsheet} /><div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{(["date", "reference", "description", "credit", "debit", "amount", "direction", "runningBalance"] as Array<keyof StatementColumnMapping>).map((field) => <label key={field} className="space-y-1"><span className="field-label">{field === "credit" ? "Income / Credit" : field === "debit" ? "Expense / Debit" : field === "runningBalance" ? "Running balance" : field[0]!.toUpperCase() + field.slice(1)}</span><select className="field-input" value={mapping[field] === undefined ? "" : String(mapping[field])} onChange={(event) => setMapping((current) => ({ ...current, [field]: event.target.value === "" ? undefined : Number(event.target.value) }))}><option value="">Not mapped</option>{statementDocument.structure.headers.map((header, index) => <option key={`${field}-${index}`} value={index}>{header || `Column ${index + 1}`}</option>)}</select></label>)}</div><button type="button" onClick={buildPreview} className="mt-4 rounded-lg bg-indigo-600 px-3 py-2 text-[10px] font-black text-white">Build preview</button></div></>}{preview && <div className="mt-5 space-y-4"><section className="grid grid-cols-2 gap-2 sm:grid-cols-4"><Summary label="Starting balance" value={preview.openingBalance === undefined ? "Not found" : money(preview.openingBalance, preview.currency)} /><Summary label="Rows found" value={String(preview.rowsFound)} /><Summary label="Money in" value={money(preview.credits, preview.currency)} /><Summary label="Money out" value={money(preview.debits, preview.currency)} /><Summary label="Calculated ending" value={preview.calculatedEndingBalance === undefined ? "Not available" : money(preview.calculatedEndingBalance, preview.currency)} /><Summary label="Statement ending" value={preview.statementEndingBalance === undefined ? "Not found" : money(preview.statementEndingBalance, preview.currency)} /><Summary label="Difference" value={preview.difference === undefined ? "Not available" : money(preview.difference, preview.currency)} /><Summary label="Duplicates" value={String(preview.duplicateCount)} /></section>{preview.balanceIssues.length > 0 && <Notice tone="danger"><p className="font-black">Statement does not reconcile.</p><ul className="mt-1 list-disc pl-4">{preview.balanceIssues.slice(0, 5).map((issue) => <li key={`${issue.sourceRow}-${issue.message}`}>{issue.message}</li>)}</ul></Notice>}{preview.invalidRows.length > 0 && <Notice tone="warning"><p className="font-black">Rows requiring review</p><ul className="mt-1 list-disc pl-4">{preview.invalidRows.slice(0, 5).map((issue) => <li key={`${issue.sourceRow}-${issue.message}`}>Row {issue.sourceRow}: {issue.message}</li>)}</ul></Notice>}<div className="flex flex-col justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:flex-row sm:items-center"><div><p className="text-xs font-black text-slate-900">{preview.transactionsToImport.length} transaction{preview.transactionsToImport.length === 1 ? "" : "s"} ready to import</p><p className="mt-1 text-[10px] text-slate-500">Preview is non-mutating. Imported rows retain source fingerprints and batch provenance.</p></div><button type="button" disabled={!preview.canCommit || busy === "import"} onClick={() => void commitImport()} className="rounded-lg bg-indigo-600 px-3 py-2 text-[10px] font-black text-white disabled:cursor-not-allowed disabled:opacity-40">{busy === "import" ? "Importing…" : preview.canCommit ? "Commit import" : "Resolve preview issues"}</button></div></div>}</ModalShell>}
  </div>;
};

function Summary({ label, value }: { label: string; value: string }) { return <div className="rounded-lg bg-slate-50 p-2.5"><p className="text-[9px] uppercase tracking-wide text-slate-500">{label}</p><p className="mt-1 break-words text-xs font-black tabular-nums text-slate-900">{value}</p></div>; }

function ModalShell({ title, children, onClose, wide = false }: { title: string; children: React.ReactNode; onClose: () => void; wide?: boolean }) { return <div className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-950/45 p-3 sm:items-center sm:p-6" role="presentation"><section role="dialog" aria-modal="true" aria-label={title} className={`max-h-[min(92vh,54rem)] w-full overflow-y-auto rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl sm:p-6 ${wide ? "max-w-5xl" : "max-w-2xl"}`}><div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-4"><div className="min-w-0"><p className="text-[10px] font-black uppercase tracking-[0.16em] text-indigo-600">Cash &amp; Banking</p><h2 className="mt-1 text-lg font-black text-slate-950">{title}</h2></div><button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-800" aria-label="Close dialog"><X className="h-4 w-4" /></button></div><div className="pt-4">{children}</div></section></div>; }
