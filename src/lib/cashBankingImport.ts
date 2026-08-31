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

function workbookFormat(fileName: string): "CSV" | "XLSX" | "PDF" {
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

export function parseStatementFile(
  input: ArrayBuffer | Uint8Array | string,
  fileName = "statement.csv",
  profileHint?: string | StatementParserProfile,
  institutionHint?: string,
): ParsedStatementDocument {
  const format = workbookFormat(fileName);
  if (format === "PDF") throw new Error("PDF statement import is not enabled until a reliable institution-specific extractor is available.");
  const workbook = readStatementRows(input, format);
  
  const requestedProfileId = typeof profileHint === "string" ? profileHint : profileHint?.id;
  const matchResult = matchStatementParserProfile(workbook.rows, requestedProfileId, institutionHint);
  
  let structure: StatementStructure;
  if (matchResult.profile && matchResult.validation?.valid) {
    const fallbackStructure = detectStatementStructure(workbook.rows);
    structure = {
      headerRowIndex: matchResult.validation.headerRowIndex,
      headers: (workbook.rows[matchResult.validation.headerRowIndex] || []).map(cellText),
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
    structure = detectStatementStructure(workbook.rows);
    if (matchResult.isFallback && requestedProfileId) {
      structure.isProfileFallback = true;
      structure.profileValidationWarning = matchResult.reason;
      if (matchResult.reason) structure.reasons.push(matchResult.reason);
    }
  }

  return {
    format,
    fileName,
    fileFingerprint: statementFileFingerprint(workbook.rows),
    sheetName: workbook.sheetName,
    rawRows: workbook.rows,
    structure,
  };
}
