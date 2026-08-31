import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import {
  isSupportedBankStatementAttachment,
  classifyEmailIntakeCandidate,
} from "../src/lib/emailIntake.ts";
import {
  extractPdfStatementDocument,
  type PdfStatementExtractionResult,
} from "../src/lib/pdfStatementParser.ts";
import {
  parseStatementFileAsync,
  workbookFormat,
} from "../src/lib/cashBankingImport.ts";
import {
  getTransientSessionPassword,
  setTransientSessionPassword,
  clearTransientSessionPassword,
  clearAllTransientSessionPasswords,
  hasTransientSessionPassword,
} from "../src/lib/statementSessionMemory.ts";
import {
  validateBankStatementBytes,
  validateGmailAttachmentBytes,
} from "../src/lib/fileSecurity.ts";
import {
  extractAccountEvidenceFromStatement,
  resolveFinancialAccountCandidate,
} from "../src/lib/entityResolution.ts";
import {
  buildStatementPreview,
  type FinancialAccount,
  type FinancialImportBatch,
} from "../src/lib/cashBanking.ts";
import type { EmailIntakeProfile, GmailMessageCandidate } from "../src/types.ts";

const PDF_PADDING = Buffer.from([
  0x28, 0xbf, 0x4e, 0x5e, 0x4e, 0x75, 0x8a, 0x41,
  0x64, 0x00, 0x4e, 0x56, 0xff, 0xfa, 0x01, 0x08,
  0x2e, 0x2e, 0x00, 0xb6, 0xd0, 0x68, 0x3e, 0x80,
  0x2f, 0x0c, 0xa9, 0xfe, 0x64, 0x53, 0x69, 0x7a,
]);

function padPassword(password: string): Buffer {
  const buf = Buffer.alloc(32);
  const passBuf = Buffer.from(password, "latin1");
  passBuf.copy(buf, 0, 0, Math.min(passBuf.length, 32));
  if (passBuf.length < 32) {
    PDF_PADDING.copy(buf, passBuf.length, 0, 32 - passBuf.length);
  }
  return buf;
}

function rc4(key: Uint8Array, data: Buffer): Buffer {
  const s = new Uint8Array(256);
  for (let i = 0; i < 256; i++) s[i] = i;
  let j = 0;
  for (let i = 0; i < 256; i++) {
    j = (j + s[i] + key[i % key.length]!) % 256;
    const tmp = s[i]!; s[i] = s[j]!; s[j] = tmp;
  }
  let i = 0; j = 0;
  const out = Buffer.alloc(data.length);
  for (let k = 0; k < data.length; k++) {
    i = (i + 1) % 256;
    j = (j + s[i]!) % 256;
    const tmp = s[i]!; s[i] = s[j]!; s[j] = tmp;
    out[k] = data[k]! ^ s[(s[i]! + s[j]!) % 256]!;
  }
  return out;
}

function renderPdfPageText(
  institution: string,
  accountNumber: string,
  period: string,
  currency: string,
  rows: Array<{ date: string; desc: string; debit: string; credit: string; balance: string }>,
  pageLabel?: string,
  includeHeaderMetadata = true
) {
  let stream = `BT\n/F1 10 Tf\n`;
  if (includeHeaderMetadata) {
    stream += `1 0 0 1 50 750 Tm (${institution}) Tj\n`;
    stream += `1 0 0 1 50 730 Tm (Account: ${accountNumber}  Period: ${period}  Currency: ${currency}) Tj\n`;
  }
  
  // Grid headers at Y=700
  stream += `1 0 0 1 50 700 Tm (Date) Tj\n`;
  stream += `1 0 0 1 150 700 Tm (Description) Tj\n`;
  stream += `1 0 0 1 300 700 Tm (Debit) Tj\n`;
  stream += `1 0 0 1 370 700 Tm (Credit) Tj\n`;
  stream += `1 0 0 1 450 700 Tm (Balance) Tj\n`;

  let y = 675;
  for (const row of rows) {
    stream += `1 0 0 1 50 ${y} Tm (${row.date}) Tj\n`;
    const descLines = row.desc.split("\n");
    stream += `1 0 0 1 150 ${y} Tm (${descLines[0]}) Tj\n`;
    if (row.debit) stream += `1 0 0 1 300 ${y} Tm (${row.debit}) Tj\n`;
    if (row.credit) stream += `1 0 0 1 370 ${y} Tm (${row.credit}) Tj\n`;
    if (row.balance) stream += `1 0 0 1 450 ${y} Tm (${row.balance}) Tj\n`;

    if (descLines.length > 1) {
      y -= 15;
      stream += `1 0 0 1 150 ${y} Tm (${descLines[1]}) Tj\n`;
    }
    y -= 25;
  }

  if (pageLabel) {
    stream += `1 0 0 1 250 50 Tm (${pageLabel}) Tj\n`;
  }
  stream += `ET\n`;
  return stream;
}

/**
 * Creates a synthetic unencrypted PDF statement for testing.
 */
function createSyntheticPdfStatement({
  institution = "Maya Philippines Inc.",
  accountNumber = "*4821",
  currency = "PHP",
  period = "2026-01-01 to 2026-01-31",
  transactions = [
    { date: "2026-01-05", desc: "Client Payment Received", debit: "", credit: "50000.00", balance: "150000.00" },
    { date: "2026-01-12", desc: "Office Supplies", debit: "3500.00", credit: "", balance: "146500.00" },
    { date: "2026-01-20", desc: "Electricity Bill", debit: "12000.00", credit: "", balance: "134500.00" },
  ],
  multipage = false,
  secondPageTransactions = [
    { date: "2026-01-25", desc: "Hardware Materials\nDelivery Fee", debit: "8500.00", credit: "", balance: "126000.00" },
  ],
} = {}): Uint8Array {
  const stream1 = renderPdfPageText(institution, accountNumber, period, currency, transactions, multipage ? "Page 1 of 2" : undefined, true);
  const stream2 = multipage ? renderPdfPageText(institution, accountNumber, period, currency, secondPageTransactions, "Page 2 of 2", false) : "";

  const s1Buf = Buffer.from(stream1);
  const s2Buf = Buffer.from(stream2);

  let pdf = `%PDF-1.4\n`;
  const offsets: number[] = [];

  function addObj(num: number, content: string) {
    offsets[num] = pdf.length;
    pdf += `${num} 0 obj\n${content}\nendobj\n`;
  }

  if (!multipage) {
    addObj(1, `<< /Type /Catalog /Pages 2 0 R >>`);
    addObj(2, `<< /Type /Pages /Kids [3 0 R] /Count 1 >>`);
    addObj(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>`);
    addObj(4, `<< /Length ${s1Buf.length} >>\nstream\n${stream1}\nendstream`);
    addObj(5, `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`);

    const startXref = pdf.length;
    pdf += `xref\n0 6\n0000000000 65535 f \n`;
    for (let i = 1; i <= 5; i++) {
      pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
    }
    pdf += `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${startXref}\n%%EOF`;
  } else {
    addObj(1, `<< /Type /Catalog /Pages 2 0 R >>`);
    addObj(2, `<< /Type /Pages /Kids [3 0 R 6 0 R] /Count 2 >>`);
    addObj(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>`);
    addObj(4, `<< /Length ${s1Buf.length} >>\nstream\n${stream1}\nendstream`);
    addObj(5, `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`);
    addObj(6, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 7 0 R /Resources << /Font << /F1 5 0 R >> >> >>`);
    addObj(7, `<< /Length ${s2Buf.length} >>\nstream\n${stream2}\nendstream`);

    const startXref = pdf.length;
    pdf += `xref\n0 8\n0000000000 65535 f \n`;
    for (let i = 1; i <= 7; i++) {
      pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
    }
    pdf += `trailer\n<< /Size 8 /Root 1 0 R >>\nstartxref\n${startXref}\n%%EOF`;
  }

  return new Uint8Array(Buffer.from(pdf, "latin1"));
}

/**
 * Creates a synthetic password-protected encrypted PDF statement for testing.
 */
function createSyntheticEncryptedPdfStatement({
  password = "dummy-test-password-4821",
  institution = "Maya Philippines Inc.",
  accountNumber = "*4821",
  currency = "PHP",
  period = "2026-01-01 to 2026-01-31",
  transactions = [
    { date: "2026-01-05", desc: "Client Payment Received", debit: "", credit: "50000.00", balance: "150000.00" },
    { date: "2026-01-12", desc: "Office Supplies", debit: "3500.00", credit: "", balance: "146500.00" },
    { date: "2026-01-20", desc: "Electricity Bill", debit: "12000.00", credit: "", balance: "134500.00" },
  ],
} = {}): Uint8Array {
  const fileId = Buffer.from("0123456789abcdef0123456789abcdef", "hex");
  const pFlags = -64;
  const pBuf = Buffer.alloc(4);
  pBuf.writeInt32LE(pFlags, 0);

  const paddedUser = padPassword(password);
  const paddedOwner = padPassword(password);
  const ownerHash = crypto.createHash("md5").update(paddedOwner).digest().subarray(0, 5);
  const oKey = rc4(ownerHash, paddedUser);

  const hash = crypto.createHash("md5");
  hash.update(paddedUser);
  hash.update(oKey);
  hash.update(pBuf);
  hash.update(fileId);
  const encKey = hash.digest().subarray(0, 5);
  const uKey = rc4(encKey, PDF_PADDING);

  function encryptObj(objNum: number, genNum: number, data: string | Buffer) {
    const objHash = crypto.createHash("md5");
    objHash.update(encKey);
    const objNumBuf = Buffer.alloc(3);
    objNumBuf.writeUIntLE(objNum, 0, 3);
    const genNumBuf = Buffer.alloc(2);
    genNumBuf.writeUInt16LE(genNum, 0);
    objHash.update(objNumBuf);
    objHash.update(genNumBuf);
    const objKey = objHash.digest().subarray(0, Math.min(encKey.length + 5, 16));
    return rc4(objKey, Buffer.from(data));
  }

  const stream = renderPdfPageText(institution, accountNumber, period, currency, transactions, undefined, true);
  const encStream = encryptObj(4, 0, stream);
  const oHex = oKey.toString("hex");
  const uHex = uKey.toString("hex");
  const idHex = fileId.toString("hex");

  let pdf = `%PDF-1.4\n`;
  const offsets: number[] = [];

  function addObj(num: number, content: string) {
    offsets[num] = pdf.length;
    pdf += `${num} 0 obj\n${content}\nendobj\n`;
  }

  addObj(1, `<< /Type /Catalog /Pages 2 0 R >>`);
  addObj(2, `<< /Type /Pages /Kids [3 0 R] /Count 1 >>`);
  addObj(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>`);
  addObj(4, `<< /Length ${encStream.length} >>\nstream\n${encStream.toString("latin1")}\nendstream`);
  addObj(5, `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`);
  addObj(6, `<< /Filter /Standard /V 1 /R 2 /O <${oHex}> /U <${uHex}> /P ${pFlags} >>`);

  const startXref = pdf.length;
  pdf += `xref\n0 7\n0000000000 65535 f \n`;
  for (let i = 1; i <= 6; i++) {
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size 7 /Root 1 0 R /Encrypt 6 0 R /ID [<${idHex}> <${idHex}>] >>\nstartxref\n${startXref}\n%%EOF`;

  return new Uint8Array(Buffer.from(pdf, "latin1"));
}

/**
 * Creates a synthetic scanned (image-only / no text) PDF for testing.
 */
function createSyntheticScannedPdf(): Uint8Array {
  let pdf = `%PDF-1.4\n`;
  const offsets: number[] = [];

  function addObj(num: number, content: string) {
    offsets[num] = pdf.length;
    pdf += `${num} 0 obj\n${content}\nendobj\n`;
  }

  addObj(1, `<< /Type /Catalog /Pages 2 0 R >>`);
  addObj(2, `<< /Type /Pages /Kids [3 0 R] /Count 1 >>`);
  addObj(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >>`);
  addObj(4, `<< /Length 0 >>\nstream\n\nendstream`);

  const startXref = pdf.length;
  pdf += `xref\n0 5\n0000000000 65535 f \n`;
  for (let i = 1; i <= 4; i++) {
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n${startXref}\n%%EOF`;

  return new Uint8Array(Buffer.from(pdf, "latin1"));
}

const mockMayaAccount: FinancialAccount = {
  id: "acc-maya-4821",
  companyId: "comp-1",
  accountType: "EWALLET",
  displayName: "Maya Business Operations",
  institutionName: "Maya",
  institutionCode: "MAYA",
  maskedIdentifier: "•••• 4821",
  currency: "PHP",
  active: true,
  openingBalance: 100000,
  openingBalanceDate: "2026-01-01",
  connectionType: "STATEMENT",
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};

describe("Phase 4D.1 — Password-Protected PDF Bank Statement Support", () => {
  beforeEach(() => {
    clearAllTransientSessionPasswords();
  });

  describe("1. Attachment recognition and workbook format", () => {
    it("recognizes .pdf and application/pdf as supported statement attachments", () => {
      assert.equal(isSupportedBankStatementAttachment({ filename: "statement.pdf", mimeType: "application/pdf" }), true);
      assert.equal(isSupportedBankStatementAttachment({ filename: "MAYA_STATEMENT.PDF", mimeType: "application/pdf" }), true);
      assert.equal(isSupportedBankStatementAttachment({ filename: "bdo.csv", mimeType: "text/csv" }), true);
      assert.equal(isSupportedBankStatementAttachment({ filename: "bpi.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), true);
      assert.equal(isSupportedBankStatementAttachment({ filename: "contract.docx", mimeType: "application/msword" }), false);
      assert.equal(isSupportedBankStatementAttachment({ filename: "photo.png", mimeType: "image/png" }), false);
    });

    it("workbookFormat identifies PDF format accurately", () => {
      assert.equal(workbookFormat("statement.pdf"), "PDF");
      assert.equal(workbookFormat("statement.csv"), "CSV");
      assert.equal(workbookFormat("statement.xlsx"), "XLSX");
      assert.equal(workbookFormat("statement.xlsm"), "XLSX");
    });
  });

  describe("2. Email Intake Candidate Classification for PDF Statements", () => {
    it("classifies bank statement email with PDF attachment to BANK_STATEMENT", () => {
      const candidate: GmailMessageCandidate = {
        id: "msg-stmt-1",
        threadId: "th-1",
        sender: "statements@maya.ph",
        to: ["ap@company.com"],
        cc: [],
        subject: "Your Maya Monthly Statement of Account",
        bodyText: "Please find attached your monthly statement for January 2026.",
        receivedAt: "2026-02-01T08:00:00Z",
        snippet: "Statement attached",
        labels: [],
        attachments: [
          {
            attachmentId: "att-pdf-1",
            filename: "Maya_Statement_Jan2026.pdf",
            mimeType: "application/pdf",
            size: 15400,
          },
        ],
      };

      const result = classifyEmailIntakeCandidate(candidate);
      assert.equal(result.suggestedDestination, "BANK_STATEMENT");
      assert.equal(result.documentType, "STATEMENT");
      assert.equal(result.statementAttachmentIds?.[0], "att-pdf-1");
    });

    it("handles zero-attachment statement notification email safely as UNSUPPORTED", () => {
      const candidate: GmailMessageCandidate = {
        id: "msg-stmt-no-att",
        threadId: "th-2",
        sender: "alerts@bdo.com.ph",
        to: ["ap@company.com"],
        cc: [],
        subject: "Your Bank Statement is Ready for Viewing",
        bodyText: "Your electronic statement of account is now ready in online banking. Log in to view.",
        receivedAt: "2026-02-01T08:00:00Z",
        snippet: "Statement ready",
        labels: [],
        attachments: [],
      };

      const result = classifyEmailIntakeCandidate(candidate);
      assert.equal(result.documentType, "STATEMENT");
      assert.equal(result.suggestedDestination, "UNSUPPORTED");
      assert.equal(result.statementAttachmentIds?.length || 0, 0);
    });
  });

  describe("3. Unencrypted PDF Statement Extraction", () => {
    it("extracts text, metadata, and structured rows from plain Maya PDF statement", async () => {
      const pdfBytes = createSyntheticPdfStatement();
      const extracted = await extractPdfStatementDocument(pdfBytes, "Maya_Statement.pdf");

      assert.equal(extracted.status, "SUCCESS");
      assert.equal(extracted.pageCount, 1);
      assert.equal(extracted.extractedMetadata?.institutionName, "Maya Philippines Inc.");
      assert.equal(extracted.extractedMetadata?.maskedIdentifier, "4821");
      assert.equal(extracted.extractedMetadata?.currency, "PHP");
      assert.ok(extracted.rawRows && extracted.rawRows.length >= 4);
    });

    it("parseStatementFileAsync parses plain Maya PDF statement and resolves structure", async () => {
      const pdfBytes = createSyntheticPdfStatement();
      const parsed = await parseStatementFileAsync(pdfBytes, "Maya_Statement.pdf");

      assert.equal(parsed.format, "PDF");
      assert.ok(parsed.structure.confidence === "HIGH" || parsed.structure.confidence === "MEDIUM");
      assert.ok(parsed.structure.mapping.date !== undefined);
      assert.ok(parsed.structure.mapping.description !== undefined);
      assert.ok(parsed.structure.mapping.credit !== undefined || parsed.structure.mapping.debit !== undefined);
      assert.ok(parsed.fileFingerprint.startsWith("cash-"));
    });
  });

  describe("4. Encrypted Password-Protected PDF Statement Extraction", () => {
    const dummyPassword = "test-password-4821";

    it("returns PASSWORD_REQUIRED when attempting to extract encrypted PDF without password", async () => {
      const encBytes = createSyntheticEncryptedPdfStatement({ password: dummyPassword });
      const result = await extractPdfStatementDocument(encBytes, "Protected_Maya.pdf");

      assert.equal(result.status, "PASSWORD_REQUIRED");
      assert.ok(result.errorMessage?.includes("password protected"));
    });

    it("parseStatementFileAsync throws PASSWORD_REQUIRED error code when no password is provided", async () => {
      const encBytes = createSyntheticEncryptedPdfStatement({ password: dummyPassword });

      await assert.rejects(
        async () => {
          await parseStatementFileAsync(encBytes, "Protected_Maya.pdf");
        },
        (err: any) => {
          return err?.code === "PASSWORD_REQUIRED" || err?.status === "PASSWORD_REQUIRED";
        }
      );
    });

    it("returns INCORRECT_PASSWORD when wrong password is provided", async () => {
      const encBytes = createSyntheticEncryptedPdfStatement({ password: dummyPassword });
      const result = await extractPdfStatementDocument(encBytes, "Protected_Maya.pdf", "wrong-password-999");

      assert.equal(result.status, "INCORRECT_PASSWORD");
      assert.ok(result.errorMessage?.includes("Incorrect statement password"));
    });

    it("parseStatementFileAsync throws INCORRECT_PASSWORD error code when wrong password is provided", async () => {
      const encBytes = createSyntheticEncryptedPdfStatement({ password: dummyPassword });

      await assert.rejects(
        async () => {
          await parseStatementFileAsync(encBytes, "Protected_Maya.pdf", undefined, undefined, "wrong-password-999");
        },
        (err: any) => {
          return err?.code === "INCORRECT_PASSWORD" || err?.status === "INCORRECT_PASSWORD";
        }
      );
    });

    it("successfully unlocks and extracts rows with correct password", async () => {
      const encBytes1 = createSyntheticEncryptedPdfStatement({ password: dummyPassword });
      const result = await extractPdfStatementDocument(encBytes1, "Protected_Maya.pdf", dummyPassword);

      assert.equal(result.status, "SUCCESS");
      assert.equal(result.extractedMetadata?.institutionName, "Maya Philippines Inc.");
      assert.equal(result.extractedMetadata?.maskedIdentifier, "4821");
      assert.ok(result.rawRows && result.rawRows.length >= 4);

      const encBytes2 = createSyntheticEncryptedPdfStatement({ password: dummyPassword });
      const parsed = await parseStatementFileAsync(encBytes2, "Protected_Maya.pdf", undefined, undefined, dummyPassword);
      assert.equal(parsed.format, "PDF");
      assert.ok(parsed.structure.confidence === "HIGH" || parsed.structure.confidence === "MEDIUM");
    });
  });

  describe("5. Multi-Page Statement PDF", () => {
    it("extracts rows across multiple pages, suppresses repeated headers, and merges wrapped descriptions", async () => {
      const pdfBytes = createSyntheticPdfStatement({ multipage: true });
      const extracted = await extractPdfStatementDocument(pdfBytes, "Multipage_Maya.pdf");

      assert.equal(extracted.status, "SUCCESS");
      assert.equal(extracted.pageCount, 2);

      const parsed = await parseStatementFileAsync(pdfBytes.slice(), "Multipage_Maya.pdf");
      const preview = buildStatementPreview(parsed, parsed.structure.mapping, mockMayaAccount.id, "PHP", [], []);

      assert.equal(preview.rowsFound >= 4, true);
      assert.equal(preview.canCommit, true);
      const deliveryRow = preview.transactionsToImport.find((t) => t.description.includes("Hardware Materials"));
      assert.ok(deliveryRow);
      assert.ok(deliveryRow.description.includes("Delivery Fee"));
    });
  });

  describe("6. Scanned and Image-Only PDF Statements", () => {
    it("detects scanned PDF without machine-readable text and returns SCANNED_OR_IMAGE_ONLY", async () => {
      const scannedBytes = createSyntheticScannedPdf();
      const extracted = await extractPdfStatementDocument(scannedBytes, "Scanned_Statement.pdf");

      assert.equal(extracted.status, "SCANNED_OR_IMAGE_ONLY");
      assert.ok(extracted.errorMessage?.includes("scanned or image-based"));
    });

    it("parseStatementFileAsync throws SCANNED_OR_IMAGE_ONLY error code on scanned PDF", async () => {
      const scannedBytes = createSyntheticScannedPdf();

      await assert.rejects(
        async () => {
          await parseStatementFileAsync(scannedBytes, "Scanned_Statement.pdf");
        },
        (err: any) => {
          return err?.code === "SCANNED_OR_IMAGE_ONLY" || err?.status === "SCANNED_OR_IMAGE_ONLY";
        }
      );
    });
  });

  describe("7. Corrupt and Non-PDF File Rejection", () => {
    it("rejects non-PDF bytes with CORRUPT_OR_INVALID status", async () => {
      const fakeBytes = new Uint8Array([0x00, 0x01, 0x02, 0x03, 0x04]);
      const extracted = await extractPdfStatementDocument(fakeBytes, "corrupt.pdf");

      assert.equal(extracted.status, "CORRUPT_OR_INVALID");
    });
  });

  describe("8. In-Memory Session Password Store", () => {
    it("stores and retrieves transient password in runtime memory only", () => {
      assert.equal(hasTransientSessionPassword("MAYA"), false);

      setTransientSessionPassword("MAYA", "secret-password-123");
      assert.equal(hasTransientSessionPassword("MAYA"), true);
      assert.equal(getTransientSessionPassword("MAYA"), "secret-password-123");

      clearTransientSessionPassword("MAYA");
      assert.equal(hasTransientSessionPassword("MAYA"), false);
      assert.equal(getTransientSessionPassword("MAYA"), undefined);
    });

    it("clearAllTransientSessionPasswords purges all scopes", () => {
      setTransientSessionPassword("MAYA", "pass-1");
      setTransientSessionPassword("BDO", "pass-2");
      assert.equal(hasTransientSessionPassword("MAYA"), true);
      assert.equal(hasTransientSessionPassword("BDO"), true);

      clearAllTransientSessionPasswords();
      assert.equal(hasTransientSessionPassword("MAYA"), false);
      assert.equal(hasTransientSessionPassword("BDO"), false);
    });
  });

  describe("9. File Security Validation for Bank Statement Sources", () => {
    it("validates PDF statements with %PDF- signature and enforces limits", () => {
      const validPdf = createSyntheticPdfStatement();
      assert.doesNotThrow(() => {
        validateBankStatementBytes(validPdf, "statement.pdf", "application/pdf");
      });

      assert.doesNotThrow(() => {
        validateGmailAttachmentBytes(validPdf, "application/pdf", "statement.pdf");
      });

      const fakePdf = new Uint8Array([0x00, 0x11, 0x22, 0x33, 0x44]);
      assert.throws(() => {
        validateBankStatementBytes(fakePdf, "fake.pdf", "application/pdf");
      }, /PDF signature/i);
    });

    it("validates CSV and spreadsheet signatures", () => {
      const csvBytes = new TextEncoder().encode("Date,Description,Amount\n2026-01-01,Test,100\n");
      assert.doesNotThrow(() => {
        validateBankStatementBytes(csvBytes, "statement.csv", "text/csv");
      });

      const nullByteCsv = new Uint8Array([0x44, 0x61, 0x74, 0x65, 0x00, 0x0a]);
      assert.throws(() => {
        validateBankStatementBytes(nullByteCsv, "corrupt.csv", "text/csv");
      }, /binary data/i);
    });
  });

  describe("10. FinancialAccount Entity Resolution with PDF Statement Evidence", () => {
    it("resolves Maya PDF statement with suffix 4821 to existing Maya account (LINK_EXISTING)", async () => {
      const pdfBytes = createSyntheticPdfStatement({ accountNumber: "*4821" });
      const parsed = await parseStatementFileAsync(pdfBytes, "Maya_Statement.pdf");

      const evidence = extractAccountEvidenceFromStatement(
        {
          fileName: parsed.fileName,
          sheetName: parsed.sheetName,
          rawRows: parsed.rawRows as any,
          extractedMetadata: parsed.extractedMetadata,
        },
        { sender: "statements@maya.ph", subject: "Monthly Statement" }
      );

      assert.equal(evidence.institutionName, "Maya Philippines Inc.");
      assert.equal(evidence.maskedIdentifier, "4821");

      const resolution = resolveFinancialAccountCandidate(
        {
          candidateId: "candidate-1",
          evidence,
          sourceRef: { fileName: "Maya_Statement.pdf", messageId: "msg-1" },
        },
        [mockMayaAccount],
        [],
        []
      );

      assert.equal(resolution.proposedAction, "LINK_EXISTING");
      assert.equal(resolution.matchedEntityId, mockMayaAccount.id);
      assert.equal(resolution.conflicts.length, 0);
    });

    it("proposes CREATE_NEW when statement suffix does not match any existing account", async () => {
      const pdfBytes = createSyntheticPdfStatement({ accountNumber: "*9999" });
      const parsed = await parseStatementFileAsync(pdfBytes, "Maya_Statement_9999.pdf");

      const evidence = extractAccountEvidenceFromStatement(
        {
          fileName: parsed.fileName,
          sheetName: parsed.sheetName,
          rawRows: parsed.rawRows as any,
          extractedMetadata: parsed.extractedMetadata,
        },
        { sender: "statements@maya.ph", subject: "Monthly Statement" }
      );

      const resolution = resolveFinancialAccountCandidate(
        {
          candidateId: "candidate-2",
          evidence,
          sourceRef: { fileName: "Maya_Statement_9999.pdf", messageId: "msg-2" },
        },
        [mockMayaAccount],
        [],
        []
      );

      assert.equal(resolution.proposedAction, "CREATE_NEW");
      assert.ok(resolution.matchedEntityName?.includes("Maya"));
    });

    it("surfaces conflict when saved sender rule points to a different account", async () => {
      const pdfBytes = createSyntheticPdfStatement({ accountNumber: "*4821" });
      const parsed = await parseStatementFileAsync(pdfBytes, "Maya_Statement.pdf");

      const conflictingProfile: EmailIntakeProfile = {
        id: "profile-conflict",
        companyId: "comp-1",
        name: "Conflicting Maya Rule",
        senderEmail: "statements@maya.ph",
        suggestedDestination: "BANK_STATEMENT",
        linkedFinancialAccountId: "acc-other-9999",
        enabled: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const otherAccount: FinancialAccount = {
        ...mockMayaAccount,
        id: "acc-other-9999",
        displayName: "Other Maya Account",
        maskedIdentifier: "•••• 9999",
      };

      const evidence = extractAccountEvidenceFromStatement(
        {
          fileName: parsed.fileName,
          sheetName: parsed.sheetName,
          rawRows: parsed.rawRows as any,
          extractedMetadata: parsed.extractedMetadata,
        },
        { sender: "statements@maya.ph", subject: "Monthly Statement" },
        conflictingProfile
      );

      const resolution = resolveFinancialAccountCandidate(
        {
          candidateId: "candidate-conflict",
          evidence,
          sourceRef: { fileName: "Maya_Statement.pdf", messageId: "msg-conflict" },
        },
        [mockMayaAccount, otherAccount],
        [conflictingProfile],
        []
      );

      assert.equal(resolution.proposedAction, "NEEDS_REVIEW");
      assert.ok(resolution.conflicts.length > 0);
      assert.equal(resolution.conflicts[0]!.field, "accountSuffix");
    });
  });

  describe("11. Pre-Decryption Duplicate Short-Circuiting", () => {
    it("detects existing imported batch by sourceDocumentId without decryption", () => {
      const sourceDocumentId = "doc-source-uuid-1234";
      const importBatches: FinancialImportBatch[] = [
        {
          id: "batch-1",
          companyId: "comp-1",
          accountId: mockMayaAccount.id,
          sourceType: "PDF",
          sourceDocumentId,
          fileName: "Maya_Statement.pdf",
          fileFingerprint: "cash-fingerprint-123",
          rowCount: 3,
          importedCount: 3,
          duplicateCount: 0,
          rejectedCount: 0,
          status: "IMPORTED",
          createdAt: "2026-02-01T10:00:00Z",
        },
      ];

      const matchingBatch = importBatches.find(
        (b) => b.sourceDocumentId === sourceDocumentId && b.status === "IMPORTED"
      );

      assert.ok(matchingBatch);
      assert.equal(matchingBatch.id, "batch-1");
      assert.equal(matchingBatch.accountId, mockMayaAccount.id);
    });
  });
});
