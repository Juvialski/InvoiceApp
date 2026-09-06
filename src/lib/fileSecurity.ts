export const MAX_INVOICE_SOURCE_BYTES = 10 * 1024 * 1024;
export const MAX_GMAIL_RAW_BYTES = 10 * 1024 * 1024;
export const MAX_GMAIL_ATTACHMENT_COUNT = 20;
export const MAX_GMAIL_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const MAX_GMAIL_ATTACHMENT_TOTAL_BYTES = 25 * 1024 * 1024;
export const MAX_PAYROLL_IMPORT_BYTES = 15 * 1024 * 1024;
export const MAX_EXTRACTION_TEXT_CHARS = 200_000;

const SAFE_STORAGE_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/;
const PDF = [0x25, 0x50, 0x44, 0x46, 0x2d];
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG = [0xff, 0xd8, 0xff];
const ZIP = [0x50, 0x4b, 0x03, 0x04];
const OLE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];

function startsWithBytes(bytes: Uint8Array, signature: readonly number[]) {
  return bytes.byteLength >= signature.length && signature.every((value, index) => bytes[index] === value);
}

function isWebp(bytes: Uint8Array) {
  return bytes.byteLength >= 12
    && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF"
    && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
}

function normalizedMime(value: string | undefined) {
  return String(value || "").split(";", 1)[0].trim().toLowerCase();
}

function extension(fileName: string | undefined) {
  const match = /\.([A-Za-z0-9]+)$/.exec(String(fileName || "").trim());
  return match?.[1]?.toLowerCase() || "";
}

function assertNonEmptyWithinLimit(bytes: Uint8Array, maxBytes: number, label: string) {
  if (!bytes.byteLength) throw new Error(`${label} must not be empty.`);
  if (bytes.byteLength > maxBytes) throw new Error(`${label} exceeds the ${Math.round(maxBytes / (1024 * 1024))} MB limit.`);
}

/** Decode a caller-provided base64 payload without Buffer's permissive parsing. */
export function decodeBase64Payload(value: string, maxBytes: number, label = "Binary payload"): Uint8Array {
  const normalized = String(value || "").replace(/\s+/g, "");
  if (!normalized || normalized.length % 4 === 1 || !/^[A-Za-z0-9+/_-]*={0,2}$/.test(normalized)) {
    throw new Error(`${label} is not valid base64.`);
  }
  if (estimateBase64DecodedBytes(normalized) > maxBytes) {
    throw new Error(`${label} exceeds the ${Math.round(maxBytes / (1024 * 1024))} MB limit.`);
  }
  try {
    const standard = normalized.replace(/-/g, "+").replace(/_/g, "/");
    const binary = atob(standard);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    assertNonEmptyWithinLimit(bytes, maxBytes, label);
    return bytes;
  } catch {
    throw new Error(`${label} is not valid base64.`);
  }
}

export function safeStorageSegment(value: string, label = "Storage path segment") {
  const normalized = String(value || "").trim();
  if (!SAFE_STORAGE_SEGMENT.test(normalized) || normalized === "." || normalized === "..") {
    throw new Error(`${label} contains unsafe path characters.`);
  }
  return normalized;
}

export function estimateBase64DecodedBytes(value: string) {
  const normalized = String(value || "").replace(/\s+/g, "");
  if (!normalized) return 0;
  const padding = normalized.endsWith("==") ? 2 : normalized.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((normalized.length * 3) / 4) - padding);
}

export function validateInvoiceDocumentBytes(bytes: Uint8Array, mimeType: string | undefined, fileName: string | undefined) {
  assertNonEmptyWithinLimit(bytes, MAX_INVOICE_SOURCE_BYTES, "Invoice source");
  const mime = normalizedMime(mimeType);
  const ext = extension(fileName);
  const leadingText = new TextDecoder("utf-8", { fatal: false }).decode(bytes.slice(0, Math.min(bytes.byteLength, 512))).trimStart().toLowerCase();
  if (/^(?:<!doctype\s+html|<html(?:\s|>)|<svg(?:\s|>)|<\?xml|<script(?:\s|>))/.test(leadingText)) {
    throw new Error("Active HTML, SVG, or XML content is not accepted as an invoice source.");
  }
  const signature = startsWithBytes(bytes, PDF) ? "pdf"
    : startsWithBytes(bytes, JPEG) ? "jpeg"
      : startsWithBytes(bytes, PNG) ? "png"
        : isWebp(bytes) ? "webp"
          : "unknown";
  const expected = mime === "application/pdf" ? "pdf"
    : mime === "image/jpeg" || mime === "image/jpg" ? "jpeg"
      : mime === "image/png" ? "png"
        : mime === "image/webp" ? "webp"
          : undefined;
  if (!expected || signature !== expected) throw new Error("Invoice sources must be valid PDF, JPEG, PNG, or WebP files matching their declared MIME type.");
  if ((expected === "pdf" && ext && ext !== "pdf")
    || (expected === "jpeg" && ext && !["jpg", "jpeg"].includes(ext))
    || (expected === "png" && ext && ext !== "png")
    || (expected === "webp" && ext && ext !== "webp")) {
    throw new Error("Invoice source filename extension does not match its declared file type.");
  }
}

export function validateGmailRawMessage(bytes: Uint8Array) {
  assertNonEmptyWithinLimit(bytes, MAX_GMAIL_RAW_BYTES, "Gmail raw message");
  const sample = new TextDecoder("utf-8", { fatal: false }).decode(bytes.slice(0, Math.min(bytes.byteLength, 64 * 1024)));
  if (sample.includes("\u0000") || !/^(?:[!-9;-~]+):\s*.*$/m.test(sample)) {
    throw new Error("Gmail raw message does not contain a valid RFC-style message header.");
  }
}

export function validateBankStatementBytes(bytes: Uint8Array, fileName: string, mimeType?: string) {
  assertNonEmptyWithinLimit(bytes, MAX_GMAIL_ATTACHMENT_BYTES, "Bank statement source");
  const ext = extension(fileName);
  const mime = normalizedMime(mimeType);

  if (ext === "pdf" || mime === "application/pdf") {
    if (!startsWithBytes(bytes, PDF)) {
      throw new Error("Bank statement PDF signature does not match a valid PDF file.");
    }
    return;
  }

  if (["xlsx", "xlsm"].includes(ext)) {
    if (!startsWithBytes(bytes, ZIP)) throw new Error("Bank statement workbook signature does not match an XLSX/XLSM file.");
    return;
  }

  if (ext === "xls") {
    if (!startsWithBytes(bytes, OLE)) throw new Error("Bank statement workbook signature does not match an XLS file.");
    return;
  }

  if (ext === "csv") {
    const sample = new TextDecoder("utf-8", { fatal: false }).decode(bytes.slice(0, Math.min(bytes.byteLength, 64 * 1024)));
    if (sample.includes("\u0000")) throw new Error("Bank statement CSV contains binary data.");
    if (mime && !["text/csv", "text/plain", "application/csv", "application/vnd.ms-excel"].includes(mime)) {
      throw new Error("Bank statement CSV MIME type is not supported.");
    }
    return;
  }

  throw new Error("Bank statement files must be PDF, CSV, XLS, XLSX, or XLSM files.");
}

export function validateGmailAttachmentBytes(bytes: Uint8Array, mimeType: string | undefined, fileName: string | undefined) {
  assertNonEmptyWithinLimit(bytes, MAX_GMAIL_ATTACHMENT_BYTES, "Gmail attachment");
  const ext = extension(fileName);
  const mime = normalizedMime(mimeType);

  if (["csv", "xlsx", "xls", "xlsm"].includes(ext) || ["text/csv", "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/vnd.ms-excel.sheet.macroenabled.12"].includes(mime)) {
    validateBankStatementBytes(bytes, fileName || "statement.csv", mimeType);
    return;
  }

  validateInvoiceDocumentBytes(bytes, mimeType, fileName);
}

export function validateGmailAttachmentEnvelope(attachments: readonly { dataBase64?: string }[]) {
  if (attachments.length > MAX_GMAIL_ATTACHMENT_COUNT) throw new Error(`Gmail messages may import at most ${MAX_GMAIL_ATTACHMENT_COUNT} attachments.`);
  const estimatedTotal = attachments.reduce((sum, attachment) => sum + estimateBase64DecodedBytes(attachment.dataBase64 || ""), 0);
  if (estimatedTotal > MAX_GMAIL_ATTACHMENT_TOTAL_BYTES) throw new Error("Gmail attachment payload exceeds the 25 MB aggregate limit.");
}

export function validatePayrollImportBytes(bytes: Uint8Array, fileName: string, mimeType?: string) {
  assertNonEmptyWithinLimit(bytes, MAX_PAYROLL_IMPORT_BYTES, "Payroll import");
  const ext = extension(fileName);
  const mime = normalizedMime(mimeType);
  if (["xlsx", "xlsm"].includes(ext)) {
    if (!startsWithBytes(bytes, ZIP)) throw new Error("Payroll workbook signature does not match an XLSX/XLSM file.");
    return;
  }
  if (ext === "xls") {
    if (!startsWithBytes(bytes, OLE)) throw new Error("Payroll workbook signature does not match an XLS file.");
    return;
  }
  if (ext === "csv") {
    const sample = new TextDecoder("utf-8", { fatal: false }).decode(bytes.slice(0, Math.min(bytes.byteLength, 64 * 1024)));
    if (sample.includes("\u0000")) throw new Error("Payroll CSV contains binary data.");
    if (mime && !["text/csv", "text/plain", "application/csv", "application/vnd.ms-excel"].includes(mime)) throw new Error("Payroll CSV MIME type is not supported.");
    return;
  }
  throw new Error("Payroll imports must be CSV, XLS, XLSX, or XLSM files.");
}
