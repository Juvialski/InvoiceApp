import * as pdfjsLib from "pdfjs-dist";
import type { StatementCell } from "./cashBanking.ts";
import { normalizeStatementHeader } from "./cashBanking.ts";

// Setup PDF.js worker in browser environments
if (typeof window !== "undefined") {
  try {
    if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
      pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
        "pdfjs-dist/build/pdf.worker.min.mjs",
        import.meta.url
      ).toString();
    }
  } catch {
    // Non-blocking fallback
  }
}

export type PdfUnlockStatus =
  | "SUCCESS"
  | "PASSWORD_REQUIRED"
  | "INCORRECT_PASSWORD"
  | "CORRUPT_OR_INVALID"
  | "SCANNED_OR_IMAGE_ONLY";

export interface ExtractedStatementMetadata {
  institutionName?: string;
  accountNumber?: string;
  maskedIdentifier?: string;
  periodFrom?: string;
  periodTo?: string;
  currency?: string;
  startingBalance?: number;
  endingBalance?: number;
}

export interface PdfStatementExtractionResult {
  status: PdfUnlockStatus;
  errorMessage?: string;
  fileName?: string;
  pageCount?: number;
  rawRows?: StatementCell[][];
  textLines?: string[];
  extractedMetadata?: ExtractedStatementMetadata;
}

interface TextItemWithPosition {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
  page: number;
}

const KNOWN_INSTITUTIONS = [
  { code: "MAYA", name: "Maya Philippines Inc.", pattern: /\bmaya\b|paymaya/i },
  { code: "GCASH", name: "GCash (G-Xchange, Inc.)", pattern: /\bgcash\b/i },
  { code: "BDO", name: "BDO Unibank", pattern: /\bbdo\b|bdo unibank|banco de oro/i },
  { code: "BPI", name: "Bank of the Philippine Islands", pattern: /\bbpi\b|bank of the philippine islands|bpi express/i },
  { code: "METROBANK", name: "Metrobank", pattern: /\bmetrobank\b|metropolitan bank/i },
  { code: "UNIONBANK", name: "UnionBank of the Philippines", pattern: /\bunionbank\b|union bank/i },
  { code: "SECURITY_BANK", name: "Security Bank", pattern: /\bsecurity\s*bank\b|sbc/i },
  { code: "RCBC", name: "Rizal Commercial Banking Corporation", pattern: /\brcbc\b/i },
];

function isDateLike(str: string): boolean {
  const clean = str.trim();
  if (/^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}$/.test(clean)) return true;
  if (/^\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}$/.test(clean)) return true;
  if (/^[A-Za-z]{3,9}\s+\d{1,2},?\s+\d{4}$/i.test(clean)) return true;
  if (/^\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4}$/i.test(clean)) return true;
  return false;
}

function parseAmountString(str: string): number | undefined {
  const clean = str.replace(/[(),₱$€£\s]/g, "").replace(/,/g, "");
  if (!clean || !/\d/.test(clean)) return undefined;
  const val = parseFloat(clean);
  if (!Number.isFinite(val)) return undefined;
  return str.includes("(") || str.startsWith("-") ? -Math.abs(val) : Math.abs(val);
}

/**
 * Extracts and reconstructs text rows from a PDF statement document.
 */
export async function extractPdfStatementDocument(
  input: ArrayBuffer | Uint8Array,
  fileName = "statement.pdf",
  password?: string
): Promise<PdfStatementExtractionResult> {
  const data = new Uint8Array(input instanceof Uint8Array ? input.slice() : new Uint8Array(input).slice());

  // Validate PDF signature
  if (data.byteLength < 5 || data[0] !== 0x25 || data[1] !== 0x50 || data[2] !== 0x44 || data[3] !== 0x46 || data[4] !== 0x2d) {
    return {
      status: "CORRUPT_OR_INVALID",
      errorMessage: "The file is not a valid PDF document (missing %PDF signature).",
      fileName,
    };
  }

  let pdfDoc: pdfjsLib.PDFDocumentProxy;

  try {
    const loadingTask = pdfjsLib.getDocument({
      data,
      password: password || undefined,
      isEvalSupported: false,
      useSystemFonts: true,
    });

    let detectedPasswordReason: number | null = null;
    loadingTask.onPassword = (_callback, reason) => {
      detectedPasswordReason = reason;
      // Do not hang; reject loading task with password exception
      _callback(new Error(reason === 2 ? "INCORRECT_PASSWORD" : "PASSWORD_REQUIRED"));
    };

    pdfDoc = await loadingTask.promise;
  } catch (err: any) {
    const errName = String(err?.name || "");
    const errMsg = String(err?.message || "");

    if (errName === "PasswordException" || errMsg.includes("PASSWORD") || errMsg.includes("password") || errMsg.includes("Password")) {
      if (errMsg.includes("INCORRECT_PASSWORD") || errMsg.includes("Incorrect") || (password && password.length > 0)) {
        return {
          status: "INCORRECT_PASSWORD",
          errorMessage: "Incorrect statement password. Try again.",
          fileName,
        };
      }
      return {
        status: "PASSWORD_REQUIRED",
        errorMessage: "This PDF is password protected. Enter the statement password to continue.",
        fileName,
      };
    }

    if (errName === "InvalidPDFException" || errMsg.includes("Invalid PDF") || errMsg.includes("corrupt") || errMsg.includes("damaged")) {
      return {
        status: "CORRUPT_OR_INVALID",
        errorMessage: "The statement PDF is damaged or corrupted and cannot be opened.",
        fileName,
      };
    }

    return {
      status: "CORRUPT_OR_INVALID",
      errorMessage: `Could not open PDF statement: ${errMsg || "Unknown error"}`,
      fileName,
    };
  }

  // PDF opened successfully. Extract pages
  const pageCount = pdfDoc.numPages;
  const allItems: TextItemWithPosition[] = [];
  let totalTextLength = 0;

  for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
    const page = await pdfDoc.getPage(pageNum);
    const textContent = await page.getTextContent();

    for (const item of textContent.items as any[]) {
      const str = String(item.str || "").trim();
      if (!str) continue;
      totalTextLength += str.length;

      const transform = item.transform || [1, 0, 0, 1, 0, 0];
      const x = transform[4] || 0;
      const y = transform[5] || 0;
      const width = item.width || 0;
      const height = item.height || 12;

      allItems.push({ str, x, y, width, height, page: pageNum });
    }
  }

  // Scanned / image-only check
  if (totalTextLength < 20 || allItems.length < 3) {
    return {
      status: "SCANNED_OR_IMAGE_ONLY",
      errorMessage: "This statement appears to be scanned or image-based and cannot yet be parsed reliably.",
      fileName,
      pageCount,
    };
  }

  // Extract Metadata from full text
  const fullText = allItems.map((i) => i.str).join(" ");
  const metadata: ExtractedStatementMetadata = {};

  for (const inst of KNOWN_INSTITUTIONS) {
    if (inst.pattern.test(fullText) || inst.pattern.test(fileName)) {
      metadata.institutionName = inst.name;
      break;
    }
  }

  // Account suffix extraction
  const suffixMatch = fullText.match(/(?:account|acct|mobile|wallet|card|maya|gcash|no\.?|#)\s*[:=]?\s*([0-9*•xX\-]{4,20})/i)
    || fullText.match(/\b(?:\*{3,}|•{3,}|x{3,}|[0-9]{4,})([0-9]{4})\b/i);
  if (suffixMatch) {
    const rawSuffix = suffixMatch[1] || suffixMatch[0];
    const digits = rawSuffix.replace(/\D/g, "");
    if (digits.length >= 4) {
      metadata.maskedIdentifier = digits.slice(-4);
      metadata.accountNumber = `•••• ${digits.slice(-4)}`;
    } else {
      metadata.accountNumber = rawSuffix.trim();
    }
  }

  // Period extraction
  const periodMatch = fullText.match(/(?:period|statement period|date range|from)\s*[:=]?\s*([A-Za-z0-9,/-]+)\s*(?:to|-|through)\s*([A-Za-z0-9,/-]+)/i);
  if (periodMatch) {
    metadata.periodFrom = periodMatch[1].trim();
    metadata.periodTo = periodMatch[2].trim();
  }

  // Currency extraction
  if (/\bPHP\b|₱|Philippine Peso/i.test(fullText)) metadata.currency = "PHP";
  else if (/\bUSD\b|\$|US Dollar/i.test(fullText)) metadata.currency = "USD";
  else if (/\bEUR\b|€/i.test(fullText)) metadata.currency = "EUR";
  else if (/\bSGD\b/i.test(fullText)) metadata.currency = "SGD";

  // Group by page first, then by Y coordinate
  const allLineGroups: Array<{ page: number; items: TextItemWithPosition[]; y: number }> = [];

  for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
    const pageItems = allItems.filter((i) => i.page === pageNum);

    const lineGroups: TextItemWithPosition[][] = [];
    const sortedByY = [...pageItems].sort((a, b) => b.y - a.y);

    for (const item of sortedByY) {
      let group = lineGroups.find((g) => Math.abs(g[0]!.y - item.y) <= 4);
      if (!group) {
        group = [];
        lineGroups.push(group);
      }
      group.push(item);
    }

    for (const group of lineGroups) {
      group.sort((a, b) => a.x - b.x);
      const lineY = group[0]!.y;
      allLineGroups.push({ page: pageNum, items: group, y: lineY });
    }
  }

  // Find the primary table header columns across lines
  let tableHeaderCols: Array<{ str: string; x: number }> | null = null;
  let descColIndex = 1;

  for (const line of allLineGroups) {
    const lineStr = line.items.map((i) => i.str).join(" ").trim();
    const normalized = normalizeStatementHeader(lineStr);
    const isHeader = (/date|trans|post/.test(normalized) && /desc|particular|detail|activity/.test(normalized))
      || (/date/.test(normalized) && /amount|debit|credit|balance/.test(normalized));

    if (isHeader && line.items.length >= 3) {
      tableHeaderCols = line.items.map((i) => ({ str: i.str, x: i.x }));
      const foundDescIdx = tableHeaderCols.findIndex((c) => /desc|particular|detail|activity/i.test(c.str));
      if (foundDescIdx >= 0) descColIndex = foundDescIdx;
      break;
    }
  }

  const processedRows: StatementCell[][] = [];
  const textLines: string[] = [];
  let headerEmitted = false;

  for (const line of allLineGroups) {
    const lineStr = line.items.map((i) => i.str).join(" ").trim();
    if (!lineStr) continue;

    // Filter footer / page numbering noise
    if (/^page\s+\d+\s+of\s+\d+$/i.test(lineStr) || /^(confidential|generated by|powered by|all rights reserved)/i.test(lineStr)) {
      continue;
    }

    textLines.push(lineStr);

    const normalized = normalizeStatementHeader(lineStr);
    const isHeader = (/date|trans|post/.test(normalized) && /desc|particular|detail|activity/.test(normalized))
      || (/date/.test(normalized) && /amount|debit|credit|balance/.test(normalized));

    if (isHeader) {
      if (headerEmitted) {
        // Skip repeated header on subsequent pages
        continue;
      }
      headerEmitted = true;
      if (tableHeaderCols) {
        processedRows.push(tableHeaderCols.map((c) => c.str));
      } else {
        processedRows.push(line.items.map((i) => i.str));
      }
      continue;
    }

    if (!headerEmitted) {
      // Pre-header line
      processedRows.push(line.items.map((i) => i.str));
      continue;
    }

    // Post-header table rows:
    // If we have tableHeaderCols, map each item into its column slot
    if (tableHeaderCols && tableHeaderCols.length > 0) {
      const firstItem = line.items[0]!;
      const startsWithDate = isDateLike(firstItem.str);

      if (startsWithDate || line.items.length >= 3) {
        const rowCells: StatementCell[] = Array(tableHeaderCols.length).fill(null);
        for (const item of line.items) {
          // Find closest column
          let closestIdx = 0;
          let minDiff = Infinity;
          for (let c = 0; c < tableHeaderCols.length; c++) {
            const diff = Math.abs(tableHeaderCols[c]!.x - item.x);
            if (diff < minDiff) {
              minDiff = diff;
              closestIdx = c;
            }
          }
          if (rowCells[closestIdx] === null) {
            rowCells[closestIdx] = item.str;
          } else {
            rowCells[closestIdx] = `${rowCells[closestIdx]} ${item.str}`;
          }
        }
        processedRows.push(rowCells);
      } else {
        // Continuation line without a date
        const isSummaryLine = /^(total|ending balance|beginning balance|opening balance|summary)/i.test(lineStr);
        if (isSummaryLine) {
          processedRows.push(line.items.map((i) => i.str));
        } else if (processedRows.length > 0) {
          // Merge continuation text into the last row's description column
          const lastRow = processedRows[processedRows.length - 1]!;
          if (lastRow.length > descColIndex) {
            lastRow[descColIndex] = `${lastRow[descColIndex] || ""} ${lineStr}`.trim();
          } else {
            processedRows.push(line.items.map((i) => i.str));
          }
        }
      }
    } else {
      processedRows.push(line.items.map((i) => i.str));
    }
  }

  return {
    status: "SUCCESS",
    fileName,
    pageCount,
    rawRows: processedRows,
    textLines,
    extractedMetadata: metadata,
  };
}
