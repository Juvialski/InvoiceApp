export type FinancialAccountType = "BANK" | "EWALLET" | "CASH";
export type FinancialConnectionType = "MANUAL" | "STATEMENT" | "PROVIDER";
export type FinancialBalanceSource = "MANUAL" | "STATEMENT" | "PROVIDER" | "CALCULATED";
export type FinancialDirection = "CREDIT" | "DEBIT";
export type FinancialTransactionStatus = "PENDING" | "POSTED" | "REVERSED";
export type FinancialTransactionSource = "MANUAL" | "CSV" | "XLSX" | "PDF" | "PROVIDER";
export type FinancialReconciliationStatus = "UNMATCHED" | "SUGGESTED" | "PARTIAL" | "MATCHED" | "IGNORED";
export type FinancialImportStatus = "PREVIEW" | "IMPORTED" | "FAILED";
export type FinancialMatchTargetType = "EXPENSE" | "INVOICE" | "PAYROLL" | "CLIENT_COLLECTION" | "TRANSFER" | "OTHER";
export type FinancialMatchStatus = "SUGGESTED" | "CONFIRMED" | "REJECTED" | "REVERSED";

export interface FinancialAccount {
  id: string;
  companyId?: string;
  accountType: FinancialAccountType;
  institutionCode?: string;
  institutionName: string;
  displayName: string;
  maskedIdentifier?: string;
  currency: string;
  openingBalance: number;
  openingBalanceDate: string;
  connectionType: FinancialConnectionType;
  provider?: string;
  providerAccountId?: string;
  active: boolean;
  createdByUserId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface FinancialBalanceSnapshot {
  id: string;
  companyId?: string;
  accountId: string;
  capturedAt: string;
  ledgerBalance: number;
  availableBalance?: number;
  pendingBalance?: number;
  source: FinancialBalanceSource;
  importBatchId?: string;
  createdByUserId?: string;
  createdAt: string;
}

export interface FinancialTransaction {
  id: string;
  companyId?: string;
  accountId: string;
  transactionDate: string;
  postedAt?: string;
  referenceNumber?: string;
  description: string;
  direction: FinancialDirection;
  amount: number;
  currency: string;
  runningBalance?: number;
  status: FinancialTransactionStatus;
  source: FinancialTransactionSource;
  providerTransactionId?: string;
  sourceFingerprint: string;
  importBatchId?: string;
  reconciliationStatus: FinancialReconciliationStatus;
  transferGroupId?: string;
  reversedByUserId?: string;
  reversedAt?: string;
  reversalReason?: string;
  createdByUserId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface FinancialImportBatch {
  id: string;
  companyId?: string;
  accountId: string;
  sourceType: FinancialTransactionSource;
  sourceDocumentId?: string;
  fileName: string;
  fileFingerprint: string;
  statementFrom?: string;
  statementTo?: string;
  openingBalance?: number;
  closingBalance?: number;
  rowCount: number;
  importedCount: number;
  duplicateCount: number;
  rejectedCount: number;
  status: FinancialImportStatus;
  reconciliationDifference?: number;
  createdByUserId?: string;
  createdAt: string;
  completedAt?: string;
}

export interface FinancialTransactionMatch {
  id: string;
  companyId?: string;
  createdByUserId?: string;
  transactionId: string;
  targetType: FinancialMatchTargetType;
  targetId?: string;
  matchedAmount: number;
  status: FinancialMatchStatus;
  confidence?: number;
  confirmedByUserId?: string;
  confirmedAt?: string;
  reversedByUserId?: string;
  reversedAt?: string;
  reversalReason?: string;
  transferGroupId?: string;
  notes?: string;
  confirmationSource?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CashBankingWorkspaceData {
  accounts: FinancialAccount[];
  snapshots: FinancialBalanceSnapshot[];
  transactions: FinancialTransaction[];
  importBatches: FinancialImportBatch[];
  matches: FinancialTransactionMatch[];
}

export type StatementCell = string | number | boolean | Date | null | undefined;

export interface StatementColumnMapping {
  date?: number;
  reference?: number;
  description?: number;
  credit?: number;
  debit?: number;
  amount?: number;
  direction?: number;
  runningBalance?: number;
}

export interface StatementStructure {
  headerRowIndex: number;
  headers: string[];
  mapping: StatementColumnMapping;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  reasons: string[];
  appliedProfileId?: string;
  appliedProfileName?: string;
  isProfileFallback?: boolean;
  profileValidationWarning?: string;
  startingBalance?: number;
  startingBalanceRowIndex?: number;
  statementEndingBalance?: number;
  statementEndingBalanceRowIndex?: number;
}

export interface ParsedStatementDocument {
  format: "CSV" | "XLSX" | "PDF";
  fileName: string;
  fileFingerprint: string;
  sheetName: string;
  rawRows: StatementCell[][];
  structure: StatementStructure;
  extractedMetadata?: {
    institutionName?: string;
    accountNumber?: string;
    maskedIdentifier?: string;
    periodFrom?: string;
    periodTo?: string;
    currency?: string;
    startingBalance?: number;
    endingBalance?: number;
  };
}

export interface StatementRowIssue {
  sourceRow: number;
  message: string;
  severity: "warning" | "error";
}

export interface ParsedStatementTransaction {
  sourceRow: number;
  transactionDate: string;
  referenceNumber?: string;
  description: string;
  direction: FinancialDirection;
  amount: number;
  runningBalance?: number;
  sourceFingerprint: string;
  rawRow: StatementCell[];
}

export interface StatementPreview {
  accountId: string;
  sourceType: Exclude<FinancialTransactionSource, "MANUAL" | "PROVIDER" | "PDF">;
  currency: string;
  fileName: string;
  fileFingerprint: string;
  openingBalance?: number;
  statementEndingBalance?: number;
  calculatedEndingBalance?: number;
  difference?: number;
  rowsFound: number;
  credits: number;
  debits: number;
  duplicateCount: number;
  isExactDuplicate?: boolean;
  duplicateBreakdown?: {
    totalRows: number;
    newTransactions: number;
    duplicateTransactions: number;
    exactFileDuplicate: boolean;
    existingBatchId?: string;
    existingImportDate?: string;
    existingAccountId?: string;
  };
  appliedProfileId?: string;
  appliedProfileName?: string;
  isProfileFallback?: boolean;
  invalidRows: StatementRowIssue[];
  balanceIssues: StatementRowIssue[];
  transactions: ParsedStatementTransaction[];
  transactionsToImport: ParsedStatementTransaction[];
  statementFrom?: string;
  statementTo?: string;
  canCommit: boolean;
}

export interface FinancialReconciliationCandidate {
  targetType: Exclude<FinancialMatchTargetType, "TRANSFER">;
  targetId: string;
  label: string;
  amount: number;
  currency?: string;
  date?: string;
  reference?: string;
  description?: string;
  lifecycleStatus?: string;
  projectId?: string;
}

export interface FinancialMatchSuggestion {
  candidate: FinancialReconciliationCandidate;
  score: number;
  reasons: string[];
}

export interface InternalTransferSuggestion {
  left: FinancialTransaction;
  right: FinancialTransaction;
  score: number;
  reasons: string[];
}

export interface FinancialAccountBalance {
  accountId: string;
  ledgerBalance: number;
  calculatedLedgerBalance: number;
  balanceDifference?: number;
  availableBalance?: number;
  pendingBalance?: number;
  source: FinancialBalanceSource;
  capturedAt?: string;
  freshnessLabel: string;
}

export interface FinancialCashFlow {
  moneyIn: number;
  moneyOut: number;
  netCashFlow: number;
  pendingIn: number;
  pendingOut: number;
  transactionCount: number;
  needsReconciliation: number;
}

export interface CashAccountSummary extends FinancialAccountBalance {
  account: FinancialAccount;
  reconciledCount: number;
  unresolvedCount: number;
}

export interface CashDashboardPosition {
  hasAccounts: boolean;
  selectedCurrency: string;
  currencies: string[];
  totalAvailableCash: number;
  bankAccounts: number;
  ewallets: number;
  cashOnHand: number;
  moneyIn: number;
  moneyOut: number;
  netCashFlow: number;
  pendingIn: number;
  pendingOut: number;
  needsReconciliation: number;
  accounts: CashAccountSummary[];
  alerts: string[];
}

const HEADER_PATTERNS: Record<keyof StatementColumnMapping, RegExp[]> = {
  date: [/^date$/, /post.*date|posted|trans.*date|value.*date|txn.*date/],
  reference: [/reference/, /^ref$/, /check/, /transaction.*(id|no|number)/, /trace/],
  description: [/description/, /transaction/, /details?/, /particular/, /narrative/, /remarks?/],
  credit: [/^credit/, /income/, /deposit/, /money.*in/, /inflow/, /received/, /credit amount/],
  debit: [/^debit/, /expense/, /withdraw/, /money.*out/, /outflow/, /paid/, /debit amount/],
  amount: [/^amount$/, /transaction amount/, /value/],
  direction: [/direction/, /debit.*credit/, /credit.*debit/, /^type$/],
  runningBalance: [/balance/, /running/, /closing/, /net balance/],
};

const DEFAULT_NOW = () => new Date().toISOString();

export function roundMoney(value: unknown): number {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? Math.round((number + Number.EPSILON) * 100) / 100 : 0;
}

export function normalizeFinancialCurrency(value: unknown): string {
  const normalized = String(value ?? "PHP").trim().toUpperCase();
  return /^[A-Z]{3}$/.test(normalized) ? normalized : "PHP";
}

export function normalizeMaskedFinancialIdentifier(value: unknown): string | undefined {
  const raw = String(value ?? "").trim();
  if (!raw) return undefined;
  const digits = raw.replace(/\D/g, "");
  if (digits.length >= 4) return `•••• ${digits.slice(-4)}`;
  const partial = raw.replace(/[^0-9• ]/g, "").slice(0, 12).trim();
  return partial || undefined;
}

export function normalizeStatementHeader(value: unknown): string {
  return String(value ?? "").trim().toLowerCase().replace(/[\u2013\u2014]/g, "-").replace(/[^a-z0-9]+/g, " ").trim();
}

function cellText(value: StatementCell): string {
  return value === null || value === undefined ? "" : String(value).trim();
}

function isBlankRow(row: readonly StatementCell[]) {
  return row.every((cell) => cell === null || cell === undefined || cellText(cell) === "");
}

function hashText(input: string): string {
  let first = 2166136261;
  let second = 16777619;
  for (let index = 0; index < input.length; index += 1) {
    const code = input.charCodeAt(index);
    first ^= code;
    first = Math.imul(first, 16777619);
    second ^= code + index;
    second = Math.imul(second, 2166136261);
  }
  return `${(first >>> 0).toString(16).padStart(8, "0")}${(second >>> 0).toString(16).padStart(8, "0")}`;
}

export function stableFinancialFingerprint(parts: readonly unknown[]): string {
  return `cash-${hashText(parts.map((part) => String(part ?? "").trim().toLowerCase()).join("|"))}`;
}

export function financialId(prefix: string): string {
  return globalThis.crypto?.randomUUID?.() || `local-cash-${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function parseExcelDate(serial: number): string | undefined {
  if (!Number.isFinite(serial) || serial < 1 || serial > 80000) return undefined;
  const date = new Date(Date.UTC(1899, 11, 30) + Math.round(serial * 86_400_000));
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString().slice(0, 10);
}

function canonicalDate(year: number, month: number, day: number): string | undefined {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return undefined;
  return `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
}

export function normalizeFinancialDate(value: StatementCell): string | undefined {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return undefined;
    return `${value.getUTCFullYear().toString().padStart(4, "0")}-${(value.getUTCMonth() + 1).toString().padStart(2, "0")}-${value.getUTCDate().toString().padStart(2, "0")}`;
  }
  if (typeof value === "number") return parseExcelDate(value);
  const raw = cellText(value);
  if (!raw) return undefined;
  const iso = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(raw);
  if (iso) return canonicalDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  const slash = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/.exec(raw);
  if (slash) {
    const year = slash[3].length === 2 ? `20${slash[3]}` : slash[3];
    return canonicalDate(Number(year), Number(slash[1]), Number(slash[2]));
  }
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed.toISOString().slice(0, 10);
}

export function parseFinancialAmount(value: StatementCell): number | undefined {
  if (typeof value === "number") return Number.isFinite(value) ? roundMoney(value) : undefined;
  const raw = cellText(value);
  if (!raw) return undefined;
  const negative = /^\(.*\)$/.test(raw) || /^-/.test(raw);
  const cleaned = raw.replace(/[(),\s]/g, "").replace(/[₱$€£]|[A-Z]{3}/gi, "").replace(/[^0-9.]/g, "");
  if (!cleaned || !/\d/.test(cleaned)) return undefined;
  const number = Number(cleaned);
  return Number.isFinite(number) ? roundMoney(negative ? -number : number) : undefined;
}

function columnIndexFor(headers: string[], field: keyof StatementColumnMapping): number | undefined {
  const candidates = headers.map(normalizeStatementHeader);
  const index = candidates.findIndex((header) => HEADER_PATTERNS[field].some((pattern) => pattern.test(header)));
  return index < 0 ? undefined : index;
}

function findLabeledBalance(rows: readonly StatementCell[][], label: RegExp): { value?: number; rowIndex?: number } {
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex] || [];
    for (let cellIndex = 0; cellIndex < row.length; cellIndex += 1) {
      const value = cellText(row[cellIndex]);
      if (!label.test(value)) continue;
      const inline = value.replace(label, "").replace(/^\s*[:=-]?\s*/, "");
      const inlineAmount = parseFinancialAmount(inline);
      if (inlineAmount !== undefined) return { value: inlineAmount, rowIndex };
      for (let nextIndex = cellIndex + 1; nextIndex < row.length; nextIndex += 1) {
        const amount = parseFinancialAmount(row[nextIndex]);
        if (amount !== undefined) return { value: amount, rowIndex };
      }
      for (const nextRow of rows.slice(rowIndex + 1, rowIndex + 3)) {
        const amount = parseFinancialAmount(nextRow?.find((cell) => parseFinancialAmount(cell) !== undefined));
        if (amount !== undefined) return { value: amount, rowIndex: rowIndex + 1 };
      }
    }
  }
  return {};
}

function detectHeaderRow(rows: readonly StatementCell[][]): number {
  let bestIndex = 0;
  let bestScore = -1;
  rows.forEach((row, index) => {
    const headers = row.map(normalizeStatementHeader);
    const score = (Object.keys(HEADER_PATTERNS) as Array<keyof StatementColumnMapping>).reduce((total, field) => total + (headers.some((header) => HEADER_PATTERNS[field].some((pattern) => pattern.test(header))) ? (field === "date" || field === "description" ? 3 : 1) : 0), 0);
    if (score > bestScore) {
      bestIndex = index;
      bestScore = score;
    }
  });
  return bestScore > 0 ? bestIndex : 0;
}

export function detectStatementStructure(rows: readonly StatementCell[][]): StatementStructure {
  const headerRowIndex = detectHeaderRow(rows);
  const headers = (rows[headerRowIndex] || []).map(cellText);
  const mapping = (Object.keys(HEADER_PATTERNS) as Array<keyof StatementColumnMapping>).reduce<StatementColumnMapping>((result, field) => {
    const index = columnIndexFor(headers, field);
    if (index !== undefined) result[field] = index;
    return result;
  }, {});
  const reasons: string[] = [];
  if (mapping.date !== undefined) reasons.push("Date column detected.");
  if (mapping.description !== undefined) reasons.push("Description column detected.");
  if (mapping.credit !== undefined || mapping.debit !== undefined) reasons.push("Income/expense columns detected.");
  if (mapping.amount !== undefined && mapping.direction !== undefined) reasons.push("Amount and direction columns detected.");
  const starting = findLabeledBalance(rows, /(?:starting|opening)\s+balance/i);
  const ending = findLabeledBalance(rows, /(?:closing|ending)\s+balance/i);
  return {
    headerRowIndex,
    headers,
    mapping,
    confidence: mapping.date !== undefined && mapping.description !== undefined && (mapping.credit !== undefined || mapping.debit !== undefined || (mapping.amount !== undefined && mapping.direction !== undefined)) ? "HIGH" : mapping.date !== undefined ? "MEDIUM" : "LOW",
    reasons,
    ...(starting.value === undefined ? {} : { startingBalance: roundMoney(starting.value), startingBalanceRowIndex: starting.rowIndex }),
    ...(ending.value === undefined ? {} : { statementEndingBalance: roundMoney(ending.value), statementEndingBalanceRowIndex: ending.rowIndex }),
  };
}

export function statementFileFingerprint(rows: readonly StatementCell[][]): string {
  return stableFinancialFingerprint(rows.map((row) => row.map((cell) => cell instanceof Date ? cell.toISOString() : String(cell ?? "")).join("\u001f")));
}

function directionFromText(value: StatementCell): FinancialDirection | undefined {
  const normalized = normalizeStatementHeader(value);
  if (/credit|income|deposit|received|money in|inflow/.test(normalized)) return "CREDIT";
  if (/debit|expense|withdraw|paid|money out|outflow/.test(normalized)) return "DEBIT";
  return undefined;
}

function fieldValue(row: readonly StatementCell[], index: number | undefined): StatementCell {
  return index === undefined ? undefined : row[index];
}

function repeatedHeaderRow(row: readonly StatementCell[], mapping: StatementColumnMapping) {
  const date = cellText(fieldValue(row, mapping.date));
  const description = cellText(fieldValue(row, mapping.description));
  return /date|posted/i.test(date) || /description|transaction|details/i.test(description);
}

export function parseStatementRows(document: ParsedStatementDocument, mapping: StatementColumnMapping = document.structure.mapping, accountId = "preview-account", currency = "PHP"): { transactions: ParsedStatementTransaction[]; issues: StatementRowIssue[] } {
  const transactions: ParsedStatementTransaction[] = [];
  const issues: StatementRowIssue[] = [];
  const occurrences = new Map<string, number>();
  const rows = document.rawRows.slice(document.structure.headerRowIndex + 1);
  rows.forEach((row, offset) => {
    const sourceRow = document.structure.headerRowIndex + offset + 2;
    if (isBlankRow(row) || repeatedHeaderRow(row, mapping)) return;
    const transactionDate = normalizeFinancialDate(fieldValue(row, mapping.date));
    const description = cellText(fieldValue(row, mapping.description));
    const referenceNumber = cellText(fieldValue(row, mapping.reference)) || undefined;
    if (!transactionDate) {
      issues.push({ sourceRow, message: "A valid transaction date is required.", severity: "error" });
      return;
    }
    if (!description) {
      issues.push({ sourceRow, message: "A transaction description is required.", severity: "error" });
      return;
    }

    const credit = parseFinancialAmount(fieldValue(row, mapping.credit));
    const debit = parseFinancialAmount(fieldValue(row, mapping.debit));
    const amount = parseFinancialAmount(fieldValue(row, mapping.amount));
    let direction: FinancialDirection | undefined;
    let absoluteAmount: number | undefined;
    const creditCell = cellText(fieldValue(row, mapping.credit));
    const debitCell = cellText(fieldValue(row, mapping.debit));
    if (credit !== undefined && debit !== undefined && creditCell !== "" && debitCell !== "") {
      issues.push({ sourceRow, message: "Income and expense are both populated; map one direction or correct the row.", severity: "error" });
      return;
    }
    if (credit !== undefined && Math.abs(credit) > 0) {
      direction = credit < 0 ? "DEBIT" : "CREDIT";
      absoluteAmount = Math.abs(credit);
    } else if (debit !== undefined && Math.abs(debit) > 0) {
      direction = debit < 0 ? "CREDIT" : "DEBIT";
      absoluteAmount = Math.abs(debit);
    } else if (amount !== undefined && Math.abs(amount) > 0) {
      direction = directionFromText(fieldValue(row, mapping.direction));
      absoluteAmount = Math.abs(amount);
      if (!direction) {
        issues.push({ sourceRow, message: "Direction is required when using an Amount column.", severity: "error" });
        return;
      }
    }
    if (!direction || !absoluteAmount) {
      issues.push({ sourceRow, message: "The row has no usable income, expense, or amount value and was skipped.", severity: "warning" });
      return;
    }
    const runningBalanceValue = parseFinancialAmount(fieldValue(row, mapping.runningBalance));
    const base = [accountId, transactionDate, referenceNumber || "", description, direction, roundMoney(absoluteAmount), runningBalanceValue === undefined ? "" : roundMoney(runningBalanceValue)];
    const occurrenceKey = base.join("|");
    const occurrence = occurrences.get(occurrenceKey) || 0;
    occurrences.set(occurrenceKey, occurrence + 1);
    transactions.push({
      sourceRow,
      transactionDate,
      ...(referenceNumber ? { referenceNumber } : {}),
      description,
      direction,
      amount: roundMoney(absoluteAmount),
      ...(runningBalanceValue === undefined ? {} : { runningBalance: roundMoney(runningBalanceValue) }),
      sourceFingerprint: stableFinancialFingerprint([...base, occurrence]),
      rawRow: [...row],
    });
  });
  return { transactions, issues };
}

function balanceIssue(sourceRow: number, message: string): StatementRowIssue {
  return { sourceRow, message, severity: "error" };
}

export function buildStatementPreview(
  document: ParsedStatementDocument,
  mapping: StatementColumnMapping = document.structure.mapping,
  accountId = "preview-account",
  currency = "PHP",
  existingTransactions: readonly FinancialTransaction[] = [],
  existingFileFingerprints: readonly string[] = [],
  existingImportBatches: readonly FinancialImportBatch[] = [],
): StatementPreview {
  const parsed = parseStatementRows(document, mapping, accountId, currency);
  const openingBalance = document.structure.startingBalance;
  const transactions = parsed.transactions;
  const balanceTransactions = [...transactions].sort((left, right) => left.transactionDate.localeCompare(right.transactionDate) || left.sourceRow - right.sourceRow);
  const existingFingerprintSet = new Set(existingTransactions.filter((transaction) => transaction.accountId === accountId).map((transaction) => transaction.sourceFingerprint));
  
  const matchingBatch = existingImportBatches.find(
    (batch) => batch.fileFingerprint === document.fileFingerprint && batch.status === "IMPORTED",
  );
  const exactFileDuplicate = existingFileFingerprints.includes(document.fileFingerprint) || Boolean(matchingBatch);
  const transactionsToImport = transactions.filter((transaction) => !exactFileDuplicate && !existingFingerprintSet.has(transaction.sourceFingerprint));
  const duplicateCount = exactFileDuplicate ? transactions.length : transactions.length - transactionsToImport.length;
  
  let calculatedEndingBalance: number | undefined;
  let difference: number | undefined;
  const balanceIssues: StatementRowIssue[] = [];
  if (openingBalance !== undefined) {
    let balance = roundMoney(openingBalance);
    for (const transaction of balanceTransactions) {
      balance = roundMoney(balance + (transaction.direction === "CREDIT" ? transaction.amount : -transaction.amount));
      if (transaction.runningBalance !== undefined && Math.abs(balance - transaction.runningBalance) > 0.01) {
        balanceIssues.push(balanceIssue(transaction.sourceRow, `Row ${transaction.sourceRow} expected balance ${balance.toFixed(2)} but statement shows ${transaction.runningBalance.toFixed(2)}.`));
      }
    }
    calculatedEndingBalance = balance;
    const statementEndingBalance = document.structure.statementEndingBalance ?? [...balanceTransactions].reverse().find((transaction) => transaction.runningBalance !== undefined)?.runningBalance;
    if (statementEndingBalance !== undefined) {
      difference = roundMoney(calculatedEndingBalance - statementEndingBalance);
      if (Math.abs(difference) > 0.01) balanceIssues.push(balanceIssue(document.structure.statementEndingBalanceRowIndex ?? transactions.at(-1)?.sourceRow ?? document.structure.headerRowIndex + 2, `Calculated ending balance ${calculatedEndingBalance.toFixed(2)} differs from the statement ending balance ${statementEndingBalance.toFixed(2)} by ${difference.toFixed(2)}.`));
    }
  }
  const statementEndingBalance = document.structure.statementEndingBalance ?? [...balanceTransactions].reverse().find((transaction) => transaction.runningBalance !== undefined)?.runningBalance;
  const dates = transactions.map((transaction) => transaction.transactionDate).sort();
  return {
    accountId,
    sourceType: document.format as Exclude<FinancialTransactionSource, "MANUAL" | "PROVIDER" | "PDF">,
    currency: normalizeFinancialCurrency(currency),
    fileName: document.fileName,
    fileFingerprint: document.fileFingerprint,
    ...(openingBalance === undefined ? {} : { openingBalance: roundMoney(openingBalance) }),
    ...(statementEndingBalance === undefined ? {} : { statementEndingBalance: roundMoney(statementEndingBalance) }),
    ...(calculatedEndingBalance === undefined ? {} : { calculatedEndingBalance }),
    ...(difference === undefined ? {} : { difference }),
    rowsFound: transactions.length + parsed.issues.filter((issue) => issue.severity === "error").length,
    credits: roundMoney(transactions.filter((transaction) => transaction.direction === "CREDIT").reduce((sum, transaction) => sum + transaction.amount, 0)),
    debits: roundMoney(transactions.filter((transaction) => transaction.direction === "DEBIT").reduce((sum, transaction) => sum + transaction.amount, 0)),
    duplicateCount,
    isExactDuplicate: exactFileDuplicate,
    duplicateBreakdown: {
      totalRows: transactions.length,
      newTransactions: transactionsToImport.length,
      duplicateTransactions: duplicateCount,
      exactFileDuplicate,
      existingBatchId: matchingBatch?.id,
      existingImportDate: matchingBatch?.completedAt || matchingBatch?.createdAt,
      existingAccountId: matchingBatch?.accountId,
    },
    appliedProfileId: document.structure.appliedProfileId,
    appliedProfileName: document.structure.appliedProfileName,
    isProfileFallback: document.structure.isProfileFallback,
    invalidRows: parsed.issues,
    balanceIssues,
    transactions,
    transactionsToImport,
    ...(dates[0] ? { statementFrom: dates[0] } : {}),
    ...(dates.at(-1) ? { statementTo: dates.at(-1) } : {}),
    canCommit: !exactFileDuplicate && parsed.issues.every((issue) => issue.severity !== "error") && balanceIssues.length === 0 && transactionsToImport.length > 0,
  };
}

export function commitStatementPreviewToWorkspace(
  workspace: CashBankingWorkspaceData,
  preview: StatementPreview,
  account: FinancialAccount,
  now = DEFAULT_NOW(),
): CashBankingWorkspaceData {
  if (!preview.canCommit) throw new Error("The statement preview must pass validation before it can be imported.");
  const batch: FinancialImportBatch = {
    id: financialId("import"),
    companyId: account.companyId,
    accountId: account.id,
    sourceType: preview.sourceType,
    fileName: preview.fileName,
    fileFingerprint: preview.fileFingerprint,
    statementFrom: preview.statementFrom,
    statementTo: preview.statementTo,
    openingBalance: preview.openingBalance,
    closingBalance: preview.statementEndingBalance ?? preview.calculatedEndingBalance,
    rowCount: preview.rowsFound,
    importedCount: preview.transactionsToImport.length,
    duplicateCount: preview.duplicateCount,
    rejectedCount: preview.invalidRows.length + preview.balanceIssues.length,
    status: "IMPORTED",
    reconciliationDifference: preview.difference,
    createdByUserId: account.createdByUserId,
    createdAt: now,
    completedAt: now,
  };
  const transactions: FinancialTransaction[] = preview.transactionsToImport.map((row) => ({
    id: financialId("transaction"),
    companyId: account.companyId,
    accountId: account.id,
    transactionDate: row.transactionDate,
    postedAt: row.transactionDate,
    referenceNumber: row.referenceNumber,
    description: row.description,
    direction: row.direction,
    amount: row.amount,
    currency: account.currency,
    runningBalance: row.runningBalance,
    status: "POSTED",
    source: preview.sourceType,
    sourceFingerprint: row.sourceFingerprint,
    importBatchId: batch.id,
    reconciliationStatus: "UNMATCHED",
    createdByUserId: account.createdByUserId,
    createdAt: now,
    updatedAt: now,
  }));
  const snapshotBalance = preview.statementEndingBalance ?? preview.calculatedEndingBalance;
  const snapshots = snapshotBalance === undefined ? [] : [{
    id: financialId("snapshot"),
    companyId: account.companyId,
    accountId: account.id,
    capturedAt: now,
    ledgerBalance: snapshotBalance,
    source: "STATEMENT" as const,
    importBatchId: batch.id,
    createdByUserId: account.createdByUserId,
    createdAt: now,
  }];
  return {
    accounts: workspace.accounts,
    snapshots: [...workspace.snapshots, ...snapshots],
    transactions: [...workspace.transactions, ...transactions],
    importBatches: [...workspace.importBatches, batch],
    matches: workspace.matches,
  };
}

export function createFinancialAccount(input: Omit<FinancialAccount, "id" | "createdAt" | "updatedAt">, now = DEFAULT_NOW()): FinancialAccount {
  const accountType = input.accountType;
  return {
    ...input,
    id: financialId("account"),
    accountType,
    institutionName: input.institutionName.trim() || (accountType === "EWALLET" ? "GCash" : "Other institution"),
    displayName: input.displayName.trim() || input.institutionName.trim() || "Cash account",
    institutionCode: accountType === "EWALLET" ? "GCASH" : input.institutionCode?.trim() || undefined,
    maskedIdentifier: normalizeMaskedFinancialIdentifier(input.maskedIdentifier),
    currency: normalizeFinancialCurrency(input.currency),
    openingBalance: roundMoney(input.openingBalance),
    active: input.active !== false,
    createdAt: now,
    updatedAt: now,
  };
}

export function calculateLedgerBalance(account: Pick<FinancialAccount, "id" | "openingBalance" | "currency">, transactions: readonly FinancialTransaction[]): number {
  return roundMoney(transactions.filter((transaction) => transaction.accountId === account.id && normalizeFinancialCurrency(transaction.currency) === normalizeFinancialCurrency(account.currency) && transaction.status === "POSTED").reduce((balance, transaction) => balance + (transaction.direction === "CREDIT" ? transaction.amount : -transaction.amount), account.openingBalance));
}

function confirmedTransferIds(transactions: readonly FinancialTransaction[], matches: readonly FinancialTransactionMatch[]): Set<string> {
  const ids = new Set<string>();
  for (const transaction of transactions) if (transaction.transferGroupId && transaction.reconciliationStatus === "MATCHED") ids.add(transaction.id);
  for (const match of matches) if (match.status === "CONFIRMED" && match.targetType === "TRANSFER") ids.add(match.transactionId);
  return ids;
}

export function calculateCashFlow(
  transactions: readonly FinancialTransaction[],
  options: { from?: string; to?: string; accountId?: string; currency?: string; matches?: readonly FinancialTransactionMatch[] } = {},
): FinancialCashFlow {
  const transferIds = confirmedTransferIds(transactions, options.matches || []);
  const currency = options.currency ? normalizeFinancialCurrency(options.currency) : undefined;
  const inRange = (date: string) => (!options.from || date >= options.from) && (!options.to || date <= options.to);
  const selected = transactions.filter((transaction) => (!options.accountId || transaction.accountId === options.accountId) && (!currency || normalizeFinancialCurrency(transaction.currency) === currency) && inRange(transaction.transactionDate) && transaction.status !== "REVERSED");
  let moneyIn = 0;
  let moneyOut = 0;
  let pendingIn = 0;
  let pendingOut = 0;
  let needsReconciliation = 0;
  for (const transaction of selected) {
    const transfer = transferIds.has(transaction.id);
    if (transaction.reconciliationStatus !== "MATCHED" && transaction.reconciliationStatus !== "IGNORED") needsReconciliation += 1;
    if (transaction.status === "PENDING") {
      if (transaction.direction === "CREDIT") pendingIn = roundMoney(pendingIn + transaction.amount);
      else pendingOut = roundMoney(pendingOut + transaction.amount);
      continue;
    }
    if (transfer) continue;
    if (transaction.direction === "CREDIT") moneyIn = roundMoney(moneyIn + transaction.amount);
    else moneyOut = roundMoney(moneyOut + transaction.amount);
  }
  return { moneyIn, moneyOut, netCashFlow: roundMoney(moneyIn - moneyOut), pendingIn, pendingOut, transactionCount: selected.length, needsReconciliation };
}

function sourcePriority(source: FinancialBalanceSource) {
  return source === "PROVIDER" ? 3 : source === "STATEMENT" ? 2 : source === "MANUAL" ? 1 : 0;
}

function freshness(source: FinancialBalanceSource, capturedAt?: string): string {
  const dateLabel = capturedAt ? new Date(capturedAt).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" }) : "not recorded";
  if (source === "PROVIDER") return `Live provider · updated ${dateLabel}`;
  if (source === "STATEMENT") return `Statement imported ${dateLabel}`;
  if (source === "MANUAL") return `Manual balance · updated ${dateLabel}`;
  return "Calculated from opening balance and posted transactions";
}

export function resolveFinancialBalance(account: FinancialAccount, snapshots: readonly FinancialBalanceSnapshot[], transactions: readonly FinancialTransaction[]): FinancialAccountBalance {
  const candidates = snapshots.filter((snapshot) => snapshot.accountId === account.id && (snapshot.source !== "PROVIDER" || snapshot.availableBalance !== undefined)).sort((left, right) => sourcePriority(right.source) - sourcePriority(left.source) || right.capturedAt.localeCompare(left.capturedAt));
  const selected = candidates[0];
  const calculatedLedgerBalance = calculateLedgerBalance(account, transactions);
  const ledgerBalance = roundMoney(selected?.ledgerBalance ?? calculatedLedgerBalance);
  if (!selected && account.connectionType === "MANUAL") {
    const capturedAt = account.openingBalanceDate ? `${account.openingBalanceDate}T00:00:00.000Z` : undefined;
    return { accountId: account.id, ledgerBalance, calculatedLedgerBalance, source: "MANUAL", ...(capturedAt ? { capturedAt } : {}), freshnessLabel: freshness("MANUAL", capturedAt) };
  }
  if (!selected) return { accountId: account.id, ledgerBalance, calculatedLedgerBalance, source: "CALCULATED", freshnessLabel: freshness("CALCULATED") };
  return {
    accountId: account.id,
    ledgerBalance,
    calculatedLedgerBalance,
    ...(Math.abs(calculatedLedgerBalance - ledgerBalance) > 0.01 ? { balanceDifference: roundMoney(calculatedLedgerBalance - ledgerBalance) } : {}),
    ...(selected.availableBalance === undefined ? {} : { availableBalance: roundMoney(selected.availableBalance) }),
    ...(selected.pendingBalance === undefined ? {} : { pendingBalance: roundMoney(selected.pendingBalance) }),
    source: selected.source,
    capturedAt: selected.capturedAt,
    freshnessLabel: freshness(selected.source, selected.capturedAt),
  };
}

export function buildCashDashboardPosition(
  workspace: CashBankingWorkspaceData,
  selectedCurrency = "PHP",
  range: { from?: string; to?: string } = {},
): CashDashboardPosition {
  const currencies = [...new Set(workspace.accounts.map((account) => normalizeFinancialCurrency(account.currency)))].sort();
  const currency = normalizeFinancialCurrency(selectedCurrency || currencies[0] || "PHP");
  const accounts = workspace.accounts.filter((account) => account.active && normalizeFinancialCurrency(account.currency) === currency).map((account) => {
    const balance = resolveFinancialBalance(account, workspace.snapshots, workspace.transactions);
    const accountTransactions = workspace.transactions.filter((transaction) => transaction.accountId === account.id && transaction.status !== "REVERSED");
    const reconciledCount = accountTransactions.filter((transaction) => transaction.reconciliationStatus === "MATCHED" || transaction.reconciliationStatus === "IGNORED").length;
    return { ...balance, account, reconciledCount, unresolvedCount: accountTransactions.length - reconciledCount } satisfies CashAccountSummary;
  });
  const cashFlow = calculateCashFlow(workspace.transactions, { ...range, currency, matches: workspace.matches });
  const alerts: string[] = [];
  for (const summary of accounts) {
    if (summary.unresolvedCount > 0) alerts.push(`${summary.account.displayName} has ${summary.unresolvedCount} transaction${summary.unresolvedCount === 1 ? "" : "s"} to reconcile.`);
    if (summary.capturedAt && Date.now() - new Date(summary.capturedAt).getTime() > 30 * 86_400_000) alerts.push(`${summary.account.displayName} has a balance snapshot older than 30 days.`);
    if (summary.balanceDifference !== undefined) alerts.push(`${summary.account.displayName} book balance differs from its latest snapshot by ${Math.abs(summary.balanceDifference).toFixed(2)}.`);
  }
  const total = accounts.reduce((sum, summary) => sum + (summary.availableBalance ?? summary.ledgerBalance), 0);
  const bankAccounts = accounts.filter((summary) => summary.account.accountType === "BANK").reduce((sum, summary) => sum + (summary.availableBalance ?? summary.ledgerBalance), 0);
  const ewallets = accounts.filter((summary) => summary.account.accountType === "EWALLET").reduce((sum, summary) => sum + (summary.availableBalance ?? summary.ledgerBalance), 0);
  const cashOnHand = accounts.filter((summary) => summary.account.accountType === "CASH").reduce((sum, summary) => sum + (summary.availableBalance ?? summary.ledgerBalance), 0);
  return {
    hasAccounts: accounts.length > 0,
    selectedCurrency: currency,
    currencies,
    totalAvailableCash: roundMoney(total),
    bankAccounts: roundMoney(bankAccounts),
    ewallets: roundMoney(ewallets),
    cashOnHand: roundMoney(cashOnHand),
    moneyIn: cashFlow.moneyIn,
    moneyOut: cashFlow.moneyOut,
    netCashFlow: cashFlow.netCashFlow,
    pendingIn: cashFlow.pendingIn,
    pendingOut: cashFlow.pendingOut,
    needsReconciliation: accounts.reduce((sum, account) => sum + account.unresolvedCount, 0),
    accounts,
    alerts,
  };
}

function normalizeComparable(value: string | undefined) {
  return (value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function dateDistance(left?: string, right?: string) {
  if (!left || !right) return Number.POSITIVE_INFINITY;
  const a = new Date(`${left.slice(0, 10)}T00:00:00Z`).getTime();
  const b = new Date(`${right.slice(0, 10)}T00:00:00Z`).getTime();
  return Number.isFinite(a) && Number.isFinite(b) ? Math.abs(a - b) / 86_400_000 : Number.POSITIVE_INFINITY;
}

export function suggestFinancialMatches(transaction: FinancialTransaction, candidates: readonly FinancialReconciliationCandidate[], limit = 3): FinancialMatchSuggestion[] {
  const directionTargetTypes = transaction.direction === "CREDIT"
    ? new Set<FinancialReconciliationCandidate["targetType"]>(["CLIENT_COLLECTION"])
    : new Set<FinancialReconciliationCandidate["targetType"]>(["INVOICE", "PAYROLL", "EXPENSE"]);
  return candidates.filter((candidate) => directionTargetTypes.has(candidate.targetType)
    && (!candidate.currency || normalizeFinancialCurrency(candidate.currency) === normalizeFinancialCurrency(transaction.currency))
    && (candidate.targetType !== "CLIENT_COLLECTION" || !candidate.lifecycleStatus || candidate.lifecycleStatus === "RECORDED"))
    .map((candidate) => {
    const reasons: string[] = [];
    let score = 0;
    const amountDifference = Math.abs(roundMoney(transaction.amount) - roundMoney(candidate.amount));
    if (amountDifference <= 0.01) { score += 55; reasons.push("Exact amount"); }
    else if (amountDifference <= Math.max(1, transaction.amount * 0.01)) { score += 25; reasons.push("Close amount"); }
    const days = dateDistance(transaction.transactionDate, candidate.date);
    if (days <= 1) { score += 20; reasons.push("Date within one day"); }
    else if (days <= 5) { score += 10; reasons.push("Date within five days"); }
    const transactionText = `${normalizeComparable(transaction.referenceNumber)} ${normalizeComparable(transaction.description)}`;
    const candidateText = `${normalizeComparable(candidate.reference)} ${normalizeComparable(candidate.description)} ${normalizeComparable(candidate.label)}`;
    const tokens = [...new Set(transactionText.split(" ").filter((token) => token.length > 2))];
    const overlap = tokens.filter((token) => candidateText.includes(token)).length;
    if (overlap) { score += Math.min(20, overlap * 5); reasons.push("Reference or description overlap"); }
    return { candidate, score, reasons };
  }).filter((suggestion) => suggestion.score > 0).sort((left, right) => right.score - left.score || left.candidate.targetId.localeCompare(right.candidate.targetId)).slice(0, limit);
}

export function confirmedMatchedAmount(transactionId: string, matches: readonly FinancialTransactionMatch[]): number {
  return roundMoney(matches.filter((match) => match.transactionId === transactionId && match.status === "CONFIRMED").reduce((sum, match) => sum + match.matchedAmount, 0));
}

export function confirmedTargetMatchedAmount(targetType: FinancialMatchTargetType, targetId: string, matches: readonly FinancialTransactionMatch[]): number {
  return roundMoney(matches.filter((match) => match.targetType === targetType && match.targetId === targetId && match.status === "CONFIRMED").reduce((sum, match) => sum + match.matchedAmount, 0));
}

export function reconciliationStatusForTransaction(transaction: FinancialTransaction, matches: readonly FinancialTransactionMatch[]): FinancialReconciliationStatus {
  if (transaction.reconciliationStatus === "IGNORED") return "IGNORED";
  const matched = confirmedMatchedAmount(transaction.id, matches);
  if (matched <= 0) return matches.some((match) => match.transactionId === transaction.id && match.status === "SUGGESTED") ? "SUGGESTED" : "UNMATCHED";
  return matched + 0.01 >= transaction.amount ? "MATCHED" : "PARTIAL";
}

export function financialAccountHasHistory(accountId: string, workspace: Pick<CashBankingWorkspaceData, "snapshots" | "transactions" | "importBatches" | "matches">): boolean {
  return workspace.transactions.some((transaction) => transaction.accountId === accountId)
    || workspace.snapshots.some((snapshot) => snapshot.accountId === accountId)
    || workspace.importBatches.some((batch) => batch.accountId === accountId)
    || workspace.matches.some((match) => {
      const transaction = workspace.transactions.find((candidate) => candidate.id === match.transactionId);
      return transaction?.accountId === accountId;
    });
}

export function hasConfirmedFinancialEvidence(transactionId: string, matches: readonly FinancialTransactionMatch[]): boolean {
  return matches.some((match) => match.transactionId === transactionId && match.status === "CONFIRMED");
}

export function hasFinancialTransactionHistory(transactionId: string, matches: readonly FinancialTransactionMatch[]): boolean {
  return matches.some((match) => match.transactionId === transactionId && ["CONFIRMED", "REVERSED"].includes(match.status));
}

export function isManualTransactionCorrectionEligible(transaction: FinancialTransaction, matches: readonly FinancialTransactionMatch[]): boolean {
  return transaction.source === "MANUAL"
    && transaction.status !== "REVERSED"
    && !transaction.importBatchId
    && !transaction.providerTransactionId
    && !transaction.transferGroupId
    && (transaction.reconciliationStatus === "UNMATCHED" || transaction.reconciliationStatus === "SUGGESTED")
    && !hasFinancialTransactionHistory(transaction.id, matches);
}

export function findInternalTransferSuggestions(transactions: readonly FinancialTransaction[], matches: readonly FinancialTransactionMatch[] = []): InternalTransferSuggestion[] {
  const matchedTransfers = new Set(matches.filter((match) => match.status === "CONFIRMED" && match.targetType === "TRANSFER").map((match) => match.transactionId));
  const results: InternalTransferSuggestion[] = [];
  for (let leftIndex = 0; leftIndex < transactions.length; leftIndex += 1) {
    const left = transactions[leftIndex]!;
    if (left.status === "REVERSED" || matchedTransfers.has(left.id) || left.transferGroupId) continue;
    for (let rightIndex = leftIndex + 1; rightIndex < transactions.length; rightIndex += 1) {
      const right = transactions[rightIndex]!;
      if (right.status === "REVERSED" || matchedTransfers.has(right.id) || right.transferGroupId || left.accountId === right.accountId || normalizeFinancialCurrency(left.currency) !== normalizeFinancialCurrency(right.currency) || left.direction === right.direction || Math.abs(left.amount - right.amount) > 0.01) continue;
      const days = dateDistance(left.transactionDate, right.transactionDate);
      if (days > 3) continue;
      const reasons = ["Opposite directions", "Same currency and amount", "Different company accounts"];
      if (days <= 1) reasons.push("Posted within one day");
      results.push({ left, right, score: roundMoney(100 - days * 10), reasons });
    }
  }
  return results.sort((left, right) => right.score - left.score || left.left.transactionDate.localeCompare(right.left.transactionDate));
}

export function createFinancialTransaction(input: Omit<FinancialTransaction, "id" | "createdAt" | "updatedAt" | "sourceFingerprint">, now = DEFAULT_NOW()): FinancialTransaction {
  const amount = roundMoney(input.amount);
  const direction = input.direction;
  if (amount <= 0) throw new Error("Financial transaction amount must be positive.");
  if (direction !== "CREDIT" && direction !== "DEBIT") throw new Error("Financial transaction direction is invalid.");
  return {
    ...input,
    id: financialId("transaction"),
    amount,
    currency: normalizeFinancialCurrency(input.currency),
    description: input.description.trim(),
    sourceFingerprint: stableFinancialFingerprint([input.accountId, input.transactionDate, input.referenceNumber || "", input.description, direction, amount, input.runningBalance === undefined ? "" : input.runningBalance, now]),
    createdAt: now,
    updatedAt: now,
  };
}

export function createFinancialMatch(input: Omit<FinancialTransactionMatch, "id" | "createdAt" | "updatedAt">, now = DEFAULT_NOW()): FinancialTransactionMatch {
  if (roundMoney(input.matchedAmount) <= 0) throw new Error("Financial match amount must be positive.");
  return { ...input, id: financialId("match"), matchedAmount: roundMoney(input.matchedAmount), createdAt: now, updatedAt: now };
}

export const CLIENT_TEMPLATE_STATEMENT_ROWS: StatementCell[][] = [
  ["STARTING BALANCE", 2540],
  ["Date", "Reference", "Transaction Description", "Income", "Expense", "Balance"],
  ["11/05/2024", "R543-10002545", "Check (#1000545)", 600, null, 3140],
  ["11/07/2024", "#222-251-24", "ATM Withdrawal", null, 100, 3040],
  ["11/09/2024", "100-254-256", "Insurance payment (Invoice...)", null, 205, 2835],
  ["11/10/2024", "MM105", "Interest Income", 150, null, 2985],
  ["11/18/2024", "W423S", "Salary - November 2024", 4000, null, 6985],
  ["11/22/2024", "BB100", "Maintenance (Cash paid)", null, 300, 6685],
];

export function clientTemplateStatementDocument(accountId = "client-template-account"): ParsedStatementDocument {
  const rows = CLIENT_TEMPLATE_STATEMENT_ROWS.map((row) => [...row]);
  return {
    format: "CSV",
    fileName: "client-bank-ledger-template.csv",
    fileFingerprint: statementFileFingerprint(rows),
    sheetName: "Statement",
    rawRows: rows,
    structure: detectStatementStructure(rows),
  };
}

export function buildClientTemplatePreview(accountId = "client-template-account"): StatementPreview {
  return buildStatementPreview(clientTemplateStatementDocument(accountId), undefined, accountId, "PHP");
}
