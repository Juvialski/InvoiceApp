import * as XLSX from "xlsx";
import {
  detectStatementStructure,
  statementFileFingerprint,
  type ParsedStatementDocument,
  type StatementCell,
  type StatementStructure,
} from "./cashBanking.ts";
import {
  matchStatementParserProfile,
  type StatementParserProfile,
} from "./statementParserProfiles.ts";
import {
  extractPdfStatementDocument,
  type ExtractedStatementMetadata,
  type PdfStatementExtractionResult,
} from "./pdfStatementParser.ts";

export function workbookFormat(fileName: string): "CSV" | "XLSX" | "PDF" {
  if (/\.pdf$/i.test(fileName)) return "PDF";
  if (/\.csv$/i.test(fileName)) return "CSV";
  if (/\.(xlsx|xls|xlsm)$/i.test(fileName)) return "XLSX";
  return /\.csv$/i.test(fileName) ? "CSV" : "XLSX";
}

function cellText(value: StatementCell): string {
  return value === null || value === undefined ? "" : String(value).trim();
}

function parseCsvText(input: string): StatementCell[][] {
  const rows: StatementCell[][] = [];
  const source = input.replace(/^\uFEFF/, "");
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index]!;
    const next = source[index + 1];
    if (character === '"') {
      if (quoted && next === '"') { cell += '"'; index += 1; }
      else quoted = !quoted;
    } else if (character === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && next === "\n") index += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += character;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

function readStatementRows(input: ArrayBuffer | Uint8Array | string, format: "CSV" | "XLSX"): { sheetName: string; rows: StatementCell[][] } {
  if (format === "CSV") {
    const csv = typeof input === "string" ? input : new TextDecoder().decode(input instanceof Uint8Array ? input : new Uint8Array(input));
    return { sheetName: "CSV", rows: parseCsvText(csv) };
  }
  const data = typeof input === "string"
    ? input
    : input instanceof Uint8Array
      ? input
      : new Uint8Array(input);
  const workbook = typeof data === "string"
    ? XLSX.read(data, { type: "string", cellDates: false, cellFormula: false, cellText: true })
    : XLSX.read(data, { type: "array", cellDates: false, cellFormula: false, cellText: true });
  const candidates = workbook.SheetNames.map((sheetName) => ({ sheetName, rows: XLSX.utils.sheet_to_json<StatementCell[]>(workbook.Sheets[sheetName]!, { header: 1, raw: true, defval: null, blankrows: true }) }));
  const selected = candidates.find((candidate) => candidate.rows.some((row) => row.some((cell) => /date|description|income|expense|credit|debit|amount/i.test(cellText(cell))))) || candidates[0];
  if (!selected) return { sheetName: "", rows: [] };
  return { sheetName: selected.sheetName, rows: selected.rows.map((row) => [...row]) };
}

function buildStructuredDocument(
  rows: StatementCell[][],
  format: "CSV" | "XLSX" | "PDF",
  fileName: string,
  sheetName: string,
  profileHint?: string | StatementParserProfile,
  institutionHint?: string,
  extractedMetadata?: ExtractedStatementMetadata,
): ParsedStatementDocument {
  const requestedProfileId = typeof profileHint === "string" ? profileHint : profileHint?.id;
  const matchResult = matchStatementParserProfile(rows, requestedProfileId, institutionHint);
  
  let structure: StatementStructure;
  if (matchResult.profile && matchResult.validation?.valid) {
    const fallbackStructure = detectStatementStructure(rows);
    structure = {
      headerRowIndex: matchResult.validation.headerRowIndex,
      headers: (rows[matchResult.validation.headerRowIndex] || []).map(cellText),
      mapping: matchResult.validation.mapping,
      confidence: matchResult.validation.confidence,
      reasons: matchResult.validation.reasons,
      appliedProfileId: matchResult.profile.id,
      appliedProfileName: matchResult.profile.name,
      isProfileFallback: false,
      startingBalance: fallbackStructure.startingBalance,
      startingBalanceRowIndex: fallbackStructure.startingBalanceRowIndex,
      statementEndingBalance: fallbackStructure.statementEndingBalance,
      statementEndingBalanceRowIndex: fallbackStructure.statementEndingBalanceRowIndex,
    };
  } else {
    structure = detectStatementStructure(rows);
    if (matchResult.isFallback && requestedProfileId) {
      structure.isProfileFallback = true;
      structure.profileValidationWarning = matchResult.reason;
      if (matchResult.reason) structure.reasons.push(matchResult.reason);
    }
  }

  return {
    format,
    fileName,
    fileFingerprint: statementFileFingerprint(rows),
    sheetName,
    rawRows: rows,
    structure,
    extractedMetadata,
  };
}

export function parseStatementFile(
  input: ArrayBuffer | Uint8Array | string,
  fileName = "statement.csv",
  profileHint?: string | StatementParserProfile,
  institutionHint?: string,
): ParsedStatementDocument {
  const format = workbookFormat(fileName);
  if (format === "PDF") {
    throw new Error("PDF statements require asynchronous parsing via parseStatementFileAsync. PDF statement import is not enabled until a reliable institution-specific extractor is available synchronously.");
  }
  const workbook = readStatementRows(input, format);
  return buildStructuredDocument(workbook.rows, format, fileName, workbook.sheetName, profileHint, institutionHint);
}

export async function parseStatementFileAsync(
  input: ArrayBuffer | Uint8Array | string,
  fileName = "statement.csv",
  profileHint?: string | StatementParserProfile,
  institutionHint?: string,
  password?: string,
): Promise<ParsedStatementDocument> {
  const format = workbookFormat(fileName);
  if (format !== "PDF") {
    return parseStatementFile(input, fileName, profileHint, institutionHint);
  }

  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input instanceof Uint8Array ? input : new Uint8Array(input);
  const extraction: PdfStatementExtractionResult = await extractPdfStatementDocument(bytes, fileName, password);

  if (extraction.status === "PASSWORD_REQUIRED") {
    const err = new Error(extraction.errorMessage || "This PDF is password protected. Enter the statement password to continue.");
    (err as any).code = "PASSWORD_REQUIRED";
    (err as any).status = "PASSWORD_REQUIRED";
    throw err;
  }

  if (extraction.status === "INCORRECT_PASSWORD") {
    const err = new Error(extraction.errorMessage || "Incorrect statement password. Try again.");
    (err as any).code = "INCORRECT_PASSWORD";
    (err as any).status = "INCORRECT_PASSWORD";
    throw err;
  }

  if (extraction.status === "SCANNED_OR_IMAGE_ONLY") {
    const err = new Error(extraction.errorMessage || "This statement appears to be scanned or image-based and cannot yet be parsed reliably.");
    (err as any).code = "SCANNED_OR_IMAGE_ONLY";
    (err as any).status = "SCANNED_OR_IMAGE_ONLY";
    throw err;
  }

  if (extraction.status !== "SUCCESS" || !extraction.rawRows) {
    throw new Error(extraction.errorMessage || "The statement PDF could not be read.");
  }

  const instHint = institutionHint || extraction.extractedMetadata?.institutionName;
  return buildStructuredDocument(
    extraction.rawRows,
    "PDF",
    fileName,
    "PDF Statement",
    profileHint,
    instHint,
    extraction.extractedMetadata,
  );
}
