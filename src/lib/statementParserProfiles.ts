import type { StatementCell, StatementColumnMapping, StatementStructure } from "./cashBanking.ts";
import { normalizeStatementHeader } from "./cashBanking.ts";

export interface StatementParserProfile {
  id: string;
  name: string;
  institutionCode?: string;
  institutionName?: string;
  description?: string;
  fileFormat?: "CSV" | "XLSX" | "ALL";
  /** Required regex patterns that must all match headers in the candidate header row */
  headerSignature: RegExp[];
  /** Optional explicit header row index if the format has a fixed layout */
  fixedHeaderRowIndex?: number;
  /** Explicit column mapping if columns are fixed, or header-matching patterns */
  columnMapping?: StatementColumnMapping;
  /** Optional date format hint (e.g. "YYYY-MM-DD", "MM/DD/YYYY", "DD/MM/YYYY") */
  dateFormatHint?: string;
  /** Expected currency if fixed for this format */
  expectedCurrency?: string;
  /** Regex pattern to extract account suffix from pre-header or sheet */
  accountSuffixPattern?: RegExp;
}

export interface StatementParserProfileValidation {
  valid: boolean;
  headerRowIndex: number;
  mapping: StatementColumnMapping;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  reasons: string[];
  warnings: string[];
}

export const BUILT_IN_STATEMENT_PARSER_PROFILES: StatementParserProfile[] = [
  {
    id: "bdo-standard-csv",
    name: "BDO Unibank Standard CSV",
    institutionCode: "BDO",
    institutionName: "BDO Unibank",
    description: "Standard BDO online banking transaction export in CSV format",
    fileFormat: "ALL",
    headerSignature: [/posting.*date|trans.*date|date/i, /details|description|particulars/i, /debit/i, /credit/i],
    columnMapping: {
      date: undefined, // Discovered via header match
      description: undefined,
      debit: undefined,
      credit: undefined,
      runningBalance: undefined,
    },
    accountSuffixPattern: /(?:account|acct).*?(?:no\.?|#)?.*?([0-9*•xX\-]{4,20})/i,
  },
  {
    id: "bpi-statement-csv",
    name: "BPI Express Online CSV",
    institutionCode: "BPI",
    institutionName: "Bank of the Philippine Islands",
    description: "BPI online transaction history export with Date, Description, Amount, and Balance",
    fileFormat: "ALL",
    headerSignature: [/date/i, /description|details/i, /amount/i],
    accountSuffixPattern: /(?:bpi|account).*?([0-9*•xX\-]{4,20})/i,
  },
  {
    id: "metrobank-statement-csv",
    name: "Metrobank Direct CSV/XLSX",
    institutionCode: "METROBANK",
    institutionName: "Metrobank",
    description: "Metropolitan Bank & Trust transaction record export",
    fileFormat: "ALL",
    headerSignature: [/post.*date|trans.*date/i, /description|narrative/i, /debit/i, /credit/i],
    accountSuffixPattern: /(?:account|acct|mbtc).*?([0-9*•xX\-]{4,20})/i,
  },
  {
    id: "unionbank-statement-csv",
    name: "UnionBank Online CSV",
    institutionCode: "UNIONBANK",
    institutionName: "UnionBank of the Philippines",
    description: "UnionBank statement export format",
    fileFormat: "ALL",
    headerSignature: [/trans.*date|date/i, /description|remarks/i, /debit|outflow/i, /credit|inflow/i],
    accountSuffixPattern: /(?:unionbank|ubp|acct).*?([0-9*•xX\-]{4,20})/i,
  },
  {
    id: "securitybank-statement-csv",
    name: "Security Bank Digibanker CSV",
    institutionCode: "SECURITY_BANK",
    institutionName: "Security Bank",
    description: "Security Bank online statement format",
    fileFormat: "ALL",
    headerSignature: [/date/i, /description/i, /debit/i, /credit/i],
    accountSuffixPattern: /(?:security\s*bank|sbc).*?([0-9*•xX\-]{4,20})/i,
  },
  {
    id: "gcash-statement-csv",
    name: "GCash Statement CSV",
    institutionCode: "GCASH",
    institutionName: "GCash",
    description: "GCash transaction history export with Reference, Date, Description, Amount, and Direction",
    fileFormat: "ALL",
    headerSignature: [/date/i, /details|description|type/i, /amount/i],
    expectedCurrency: "PHP",
    accountSuffixPattern: /(?:gcash|mobile).*?(\d{4})/i,
  },
  {
    id: "maya-statement-pdf",
    name: "Maya Statement PDF",
    institutionCode: "MAYA",
    institutionName: "Maya Philippines Inc.",
    description: "Maya business and wallet statement PDF export",
    fileFormat: "ALL",
    headerSignature: [/date/i, /description|activity|details/i, /debit|credit|amount/i],
    expectedCurrency: "PHP",
    accountSuffixPattern: /(?:account|acct|mobile|wallet|maya).*?(\d{4}|\*\d{4})/i,
  },
  {
    id: "maya-statement-csv",
    name: "Maya Statement CSV",
    institutionCode: "MAYA",
    institutionName: "Maya",
    description: "Maya business/personal statement export",
    fileFormat: "ALL",
    headerSignature: [/date/i, /description|activity/i, /amount/i],
    expectedCurrency: "PHP",
    accountSuffixPattern: /(?:maya|account).*?(\d{4})/i,
  },
  {
    id: "generic-debit-credit",
    name: "Standard Debit/Credit Spreadsheet",
    description: "Universal statement with Date, Description, Debit, Credit, and Balance columns",
    fileFormat: "ALL",
    headerSignature: [/date/i, /desc/i, /debit/i, /credit/i],
  },
  {
    id: "generic-amount-direction",
    name: "Standard Amount & Direction Spreadsheet",
    description: "Universal statement with Date, Description, Amount, and Direction columns",
    fileFormat: "ALL",
    headerSignature: [/date/i, /desc/i, /amount/i],
  },
];

export function getBuiltInStatementParserProfiles(): StatementParserProfile[] {
  return [...BUILT_IN_STATEMENT_PARSER_PROFILES];
}

export function findStatementParserProfile(idOrCode?: string): StatementParserProfile | undefined {
  if (!idOrCode) return undefined;
  const normalized = idOrCode.trim().toLowerCase();
  return BUILT_IN_STATEMENT_PARSER_PROFILES.find((p) => {
    const pid = p.id.toLowerCase();
    if (pid === normalized) return true;
    if (p.institutionCode?.toLowerCase() === normalized) return true;
    if (pid.replace(/-statement|-standard/, "") === normalized) return true;
    if (pid.replace(/-standard-csv|-statement-csv|-statement-pdf/, "") === normalized) return true;
    if (pid.replace(/-csv|-pdf/, "") === normalized) return true;
    return false;
  });
}

export const getStatementParserProfile = findStatementParserProfile;

function cellText(value: StatementCell): string {
  return value === null || value === undefined ? "" : String(value).trim();
}

const HEADER_PATTERNS = {
  date: [/^date$/, /post.*date|posted|trans.*date|value.*date|txn.*date/],
  reference: [/reference/, /^ref$/, /check/, /transaction.*(id|no|number)/, /trace/],
  description: [/description/, /transaction/, /details?/, /particular/, /narrative/, /remarks?/],
  credit: [/^credit/, /income/, /deposit/, /money.*in/, /inflow/, /received/, /credit amount/],
  debit: [/^debit/, /expense/, /withdraw/, /money.*out/, /outflow/, /paid/, /debit amount/],
  amount: [/^amount$/, /transaction amount/, /value/],
  direction: [/direction/, /debit.*credit/, /credit.*debit/, /^type$/],
  runningBalance: [/balance/, /running/, /closing/, /net balance/],
};

function columnIndexForHeaders(headers: string[], field: keyof typeof HEADER_PATTERNS): number | undefined {
  const candidates = headers.map(normalizeStatementHeader);
  const index = candidates.findIndex((header) =>
    HEADER_PATTERNS[field].some((pattern) => pattern.test(header)),
  );
  return index < 0 ? undefined : index;
}

/**
 * Validates a StatementParserProfile against sheet rows.
 * Checks that the expected header signature matches a candidate row and that
 * essential columns (date, description, amount or debit/credit) are resolved.
 */
export function validateParserProfileAgainstSheet(
  profile: StatementParserProfile,
  rows: readonly StatementCell[][],
): StatementParserProfileValidation {
  const reasons: string[] = [];
  const warnings: string[] = [];

  if (!rows.length) {
    return {
      valid: false,
      headerRowIndex: 0,
      mapping: {},
      confidence: "LOW",
      reasons: ["The sheet contains no data rows."],
      warnings: ["Empty sheet."],
    };
  }

  // Find candidate header row
  let candidateHeaderIndex = -1;
  if (profile.fixedHeaderRowIndex !== undefined && profile.fixedHeaderRowIndex < rows.length) {
    candidateHeaderIndex = profile.fixedHeaderRowIndex;
  } else {
    // Search rows for one matching all headerSignature patterns
    for (let r = 0; r < Math.min(rows.length, 25); r++) {
      const rowHeaders = (rows[r] || []).map(cellText).map(normalizeStatementHeader);
      const allMatched = profile.headerSignature.every((sig) =>
        rowHeaders.some((header) => sig.test(header)),
      );
      if (allMatched) {
        candidateHeaderIndex = r;
        break;
      }
    }
  }

  if (candidateHeaderIndex < 0) {
    return {
      valid: false,
      headerRowIndex: 0,
      mapping: {},
      confidence: "LOW",
      reasons: [`Header signature for profile "${profile.name}" was not found in sheet rows.`],
      warnings: [`Expected header patterns: ${profile.headerSignature.map((s) => s.source).join(", ")}`],
    };
  }

  const headerRow = (rows[candidateHeaderIndex] || []).map(cellText);
  const mapping: StatementColumnMapping = { ...profile.columnMapping };

  // Resolve unmapped columns by header inspection
  (Object.keys(HEADER_PATTERNS) as Array<keyof typeof HEADER_PATTERNS>).forEach((field) => {
    if (mapping[field] === undefined) {
      const idx = columnIndexForHeaders(headerRow, field);
      if (idx !== undefined) mapping[field] = idx;
    }
  });

  // Verify essentials: must have date, description, and (credit or debit or amount)
  const hasDate = mapping.date !== undefined && mapping.date < headerRow.length;
  const hasDesc = mapping.description !== undefined && mapping.description < headerRow.length;
  const hasAmount =
    (mapping.credit !== undefined && mapping.credit < headerRow.length) ||
    (mapping.debit !== undefined && mapping.debit < headerRow.length) ||
    (mapping.amount !== undefined && mapping.amount < headerRow.length);

  if (!hasDate || !hasDesc || !hasAmount) {
    const missing: string[] = [];
    if (!hasDate) missing.push("date");
    if (!hasDesc) missing.push("description");
    if (!hasAmount) missing.push("amount / debit / credit");
    return {
      valid: false,
      headerRowIndex: candidateHeaderIndex,
      mapping,
      confidence: "LOW",
      reasons: [`Profile "${profile.name}" matched header row ${candidateHeaderIndex + 1} but required columns (${missing.join(", ")}) could not be resolved.`],
      warnings: [`Missing columns: ${missing.join(", ")}`],
    };
  }

  reasons.push(`Validated against parser profile: ${profile.name} (header row ${candidateHeaderIndex + 1}).`);
  if (mapping.date !== undefined) reasons.push(`Date column at index ${mapping.date}.`);
  if (mapping.description !== undefined) reasons.push(`Description column at index ${mapping.description}.`);
  if (mapping.credit !== undefined || mapping.debit !== undefined) reasons.push(`Debit/credit columns mapped.`);
  if (mapping.amount !== undefined) reasons.push(`Amount column at index ${mapping.amount}.`);

  return {
    valid: true,
    headerRowIndex: candidateHeaderIndex,
    mapping,
    confidence: "HIGH",
    reasons,
    warnings,
  };
}

/**
 * Attempts to match a parser profile for a statement sheet.
 * If a requested profile ID is provided, validates that profile first.
 * If valid, applies it. If invalid, falls back to automatic structure detection.
 */
export function matchStatementParserProfile(
  rows: readonly StatementCell[][],
  requestedProfileId?: string,
  institutionHint?: string,
): {
  profile?: StatementParserProfile;
  validation?: StatementParserProfileValidation;
  isFallback: boolean;
  reason?: string;
} {
  // 1. If explicit profile requested, test validation
  if (requestedProfileId) {
    const requested = findStatementParserProfile(requestedProfileId);
    if (requested) {
      const validation = validateParserProfileAgainstSheet(requested, rows);
      if (validation.valid) {
        return {
          profile: requested,
          validation,
          isFallback: false,
          reason: `Applied requested parser profile: ${requested.name}.`,
        };
      }
      // Incompatible: report reason and proceed to fallback
      return {
        profile: undefined,
        validation,
        isFallback: true,
        reason: `Requested parser profile "${requested.name}" is incompatible with this sheet (${validation.reasons[0] || "structural mismatch"}). Falling back to automatic structure detection.`,
      };
    }
  }

  // 2. If institution hint exists, try matching institution profile
  if (institutionHint) {
    const instProfile = findStatementParserProfile(institutionHint);
    if (instProfile) {
      const validation = validateParserProfileAgainstSheet(instProfile, rows);
      if (validation.valid) {
        return {
          profile: instProfile,
          validation,
          isFallback: false,
          reason: `Matched institution parser profile: ${instProfile.name}.`,
        };
      }
    }
  }

  // 3. Try standard profiles in order
  for (const candidate of BUILT_IN_STATEMENT_PARSER_PROFILES) {
    const validation = validateParserProfileAgainstSheet(candidate, rows);
    if (validation.valid) {
      return {
        profile: candidate,
        validation,
        isFallback: false,
        reason: `Auto-matched statement parser profile: ${candidate.name}.`,
      };
    }
  }

  // 4. Pure fallback to heuristic structure detection
  return {
    profile: undefined,
    validation: undefined,
    isFallback: true,
    reason: "No pre-configured parser profile matched. Using heuristic structure detection.",
  };
}
