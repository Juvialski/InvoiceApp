import type { ClientBilling } from "./clientBilling.ts";
import type { CompanyDocumentProfile } from "./companyDocumentProfile.ts";
import type { Project, PurchaseOrder, Vendor } from "../types.ts";
import { projectTaxTreatmentLabel } from "../utils/projectTaxTreatment.ts";

export interface DocumentCompanySnapshot {
  legalName: string;
  address?: string;
  contactNumber?: string;
  email?: string;
  vatTin?: string;
  logoPath?: string;
  paymentInstructions?: string;
}

export interface DocumentLineSnapshot {
  lineNumber: number;
  description: string;
  quantity?: number;
  unit?: string;
  unitPrice?: number;
  amount: number;
  notes?: string;
  projectCostCodeId?: string | null;
}

export interface ProcessorSnapshot {
  name: string;
  title?: string;
}

export type DocumentLifecycleStatus = "DRAFT" | "ISSUED" | "CANCELLED" | "VOIDED";

export interface PurchaseOrderDocumentSnapshot {
  snapshotId?: string;
  documentId?: string;
  documentType: "PURCHASE_ORDER";
  documentNumber: string;
  status: DocumentLifecycleStatus;
  issueDate?: string | null;
  currency: string;
  description?: string | null;
  notes?: string | null;
  termsAndConditions?: string | null;
  company: DocumentCompanySnapshot;
  supplier: {
    name: string;
    address?: string | null;
    email?: string | null;
    phone?: string | null;
    vatTin?: string | null;
    attention?: string | null;
  };
  project: {
    id?: string;
    projectCode?: string | null;
    projectName?: string | null;
    deliverTo?: string | null;
  };
  lines: DocumentLineSnapshot[];
  totalAmount: number;
  amountInWords?: string;
  processor: ProcessorSnapshot;
  templateVersion: string;
  templateVersionId?: string;
  templateContentSha256?: string;
  generatedAt?: string;
}

export interface ClientInvoiceDocumentSnapshot {
  snapshotId?: string;
  documentId?: string;
  documentType: "CLIENT_INVOICE";
  documentNumber: string;
  status: DocumentLifecycleStatus;
  invoiceDate?: string | null;
  dueDate?: string | null;
  paymentTerms?: string | null;
  currency: string;
  taxTreatment?: string;
  company: DocumentCompanySnapshot;
  project: {
    id?: string;
    projectCode?: string | null;
    projectName?: string | null;
  };
  billTo: {
    name?: string | null;
    contactName?: string | null;
    email?: string | null;
    address?: string | null;
    reference?: string | null;
  };
  lines: DocumentLineSnapshot[];
  subtotal: number;
  taxAmount?: number;
  taxLabel?: string;
  totalAmount: number;
  amountInWords?: string;
  notes?: string | null;
  termsAndConditions?: string | null;
  processor: ProcessorSnapshot;
  templateVersion: string;
  templateVersionId?: string;
  templateContentSha256?: string;
  generatedAt?: string;
}

export type FinancialDocumentSnapshot = PurchaseOrderDocumentSnapshot | ClientInvoiceDocumentSnapshot;

function text(value: unknown) {
  return value === null || value === undefined || value === "" ? undefined : String(value);
}

function money(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(Math.max(0, parsed) * 100) / 100 : 0;
}

function currency(value: unknown) {
  return String(value || "PHP").trim().toUpperCase() || "PHP";
}

function companySnapshot(profile: CompanyDocumentProfile): DocumentCompanySnapshot {
  return {
    legalName: profile.legalName,
    address: profile.address,
    contactNumber: profile.contactNumber,
    email: profile.email,
    vatTin: profile.vatTin,
    logoPath: profile.logoPath,
    paymentInstructions: profile.paymentInstructions,
  };
}

function processorSnapshot(processor?: { name?: string; title?: string }): ProcessorSnapshot {
  return {
    name: text(processor?.name) || "Authorized User",
    title: text(processor?.title),
  };
}

export function amountInWords(value: number, code = "PHP") {
  const ones = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
  const tens = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
  const belowThousand = (number: number): string => {
    if (number < 20) return ones[number];
    if (number < 100) return `${tens[Math.floor(number / 10)]}${number % 10 ? `-${ones[number % 10]}` : ""}`;
    return `${ones[Math.floor(number / 100)]} hundred${number % 100 ? ` ${belowThousand(number % 100)}` : ""}`;
  };
  const wholeWords = (number: number): string => {
    if (number < 1000) return belowThousand(number);
    const groups: Array<[number, string]> = [[1_000_000_000, "billion"], [1_000_000, "million"], [1000, "thousand"]];
    for (const [unit, label] of groups) {
      if (number >= unit) return `${belowThousand(Math.floor(number / unit))} ${label}${number % unit ? ` ${wholeWords(number % unit)}` : ""}`;
    }
    return belowThousand(number);
  };
  const total = money(value);
  const whole = Math.floor(total);
  const cents = Math.round((total - whole) * 100);
  return `${wholeWords(whole)} ${currency(code)}${cents ? ` and ${wholeWords(cents)} centavos` : ""} only`;
}

export function buildPurchaseOrderDocumentSnapshot(
  purchaseOrder: PurchaseOrder,
  vendor: Vendor | undefined,
  project: Project | undefined,
  profile: CompanyDocumentProfile,
  processor?: { name?: string; title?: string },
): PurchaseOrderDocumentSnapshot {
  const lines = (purchaseOrder.lines || []).map((line, index) => ({
    lineNumber: Number(line.lineNumber) || index + 1,
    description: line.description || "",
    quantity: money(line.quantity),
    unit: line.unit || undefined,
    unitPrice: money(line.unitPrice),
    amount: money(line.amount || Number(line.quantity || 0) * Number(line.unitPrice || 0)),
    projectCostCodeId: line.projectCostCodeId,
  }));
  const totalAmount = money(lines.reduce((sum, line) => sum + line.amount, 0) || purchaseOrder.totalAmount);
  return {
    documentType: "PURCHASE_ORDER",
    documentId: purchaseOrder.id,
    documentNumber: purchaseOrder.poNumber,
    status: purchaseOrder.status === "ISSUED" || purchaseOrder.status === "CLOSED"
      ? "ISSUED"
      : purchaseOrder.status === "CANCELLED" ? "CANCELLED" : "DRAFT",
    issueDate: purchaseOrder.issueDate,
    currency: currency(purchaseOrder.currency),
    description: purchaseOrder.description,
    notes: purchaseOrder.notes,
    termsAndConditions: profile.defaultTerms,
    company: companySnapshot(profile),
    supplier: {
      name: vendor?.name || "Supplier not resolved",
      address: vendor?.address,
      email: vendor?.email,
      phone: vendor?.phone,
      vatTin: vendor?.taxId,
    },
    project: {
      id: project?.id,
      projectCode: project?.projectCode,
      projectName: project?.projectName,
      deliverTo: project?.siteAddress || project?.location,
    },
    lines,
    totalAmount,
    amountInWords: amountInWords(totalAmount, currency(purchaseOrder.currency)),
    processor: processorSnapshot(processor),
    templateVersion: "HSC-PO-v1",
  };
}

export function buildClientInvoiceDocumentSnapshot(
  billing: ClientBilling,
  project: Project | undefined,
  profile: CompanyDocumentProfile,
  processor?: { name?: string; title?: string },
): ClientInvoiceDocumentSnapshot {
  const lines = (billing.lines || []).map((line, index) => ({
    lineNumber: Number(line.lineNumber) || index + 1,
    description: line.description || "",
    amount: money(line.amount),
    notes: line.notes,
  }));
  const subtotal = money(lines.reduce((sum, line) => sum + line.amount, 0));
  return {
    documentType: "CLIENT_INVOICE",
    documentId: billing.id,
    documentNumber: billing.billingNumber,
    status: billing.status === "ISSUED" ? "ISSUED" : billing.status === "VOIDED" ? "VOIDED" : billing.status === "CANCELLED" ? "CANCELLED" : "DRAFT",
    invoiceDate: billing.billingDate,
    dueDate: billing.dueDate,
    paymentTerms: billing.paymentTerms,
    currency: currency(billing.currency),
    taxTreatment: projectTaxTreatmentLabel(billing.taxTreatment || project?.taxTreatment),
    company: companySnapshot(profile),
    project: {
      id: project?.id,
      projectCode: project?.projectCode,
      projectName: project?.projectName,
    },
    billTo: {
      name: billing.clientNameSnapshot || project?.clientName,
      contactName: billing.billingContactName || project?.billingContactName,
      email: billing.billingEmail || project?.billingEmail,
      address: billing.billingAddress || project?.billingAddress || project?.siteAddress,
      reference: billing.clientReferenceSnapshot || project?.clientReference,
    },
    lines,
    subtotal,
    totalAmount: subtotal,
    amountInWords: amountInWords(subtotal, currency(billing.currency)),
    notes: billing.notes,
    termsAndConditions: profile.defaultTerms,
    processor: processorSnapshot(processor),
    templateVersion: "HSC-CLIENT-INVOICE-v1",
  };
}

function ascii(value: unknown) {
  return String(value ?? "").replace(/[^\x20-\x7E]/g, "?");
}

function pdfEscape(value: unknown) {
  return ascii(value).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

const HELVETICA_WIDTHS: Readonly<Record<string, number>> = Object.freeze({
  " ": 278, "!": 278, '"': 355, "#": 556, $: 556, "%": 889, "&": 667, "'": 191,
  "(": 333, ")": 333, "*": 389, "+": 584, ",": 278, "-": 333, ".": 278, "/": 278,
  ":": 278, ";": 278, "<": 584, "=": 584, ">": 584, "?": 556, "@": 1015,
  A: 667, B: 667, C: 722, D: 722, E: 667, F: 611, G: 778, H: 722, I: 278, J: 500,
  K: 667, L: 556, M: 833, N: 722, O: 778, P: 667, Q: 778, R: 722, S: 667, T: 611,
  U: 722, V: 667, W: 944, X: 667, Y: 667, Z: 611,
  a: 556, b: 556, c: 500, d: 556, e: 556, f: 278, g: 556, h: 556, i: 222, j: 222,
  k: 500, l: 222, m: 833, n: 556, o: 556, p: 556, q: 556, r: 333, s: 500, t: 278,
  u: 556, v: 500, w: 722, x: 500, y: 500, z: 500,
});

function helveticaTextWidth(value: unknown, size: number) {
  return [...ascii(value)].reduce((total, character) => total + (HELVETICA_WIDTHS[character] || 500), 0) * size / 1000;
}

function wrapToWidth(value: unknown, maxWidth: number, size: number, maxLines?: number) {
  const source = ascii(value).trim();
  if (!source) return [""];
  const words = source.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  const pushWord = (word: string) => {
    if (!word) return;
    if (helveticaTextWidth(word, size) <= maxWidth) {
      if (!current) current = word;
      else if (helveticaTextWidth(`${current} ${word}`, size) <= maxWidth) current += ` ${word}`;
      else { lines.push(current); current = word; }
      return;
    }
    if (current) { lines.push(current); current = ""; }
    let fragment = "";
    for (const character of [...word]) {
      const candidate = `${fragment}${character}`;
      if (fragment && helveticaTextWidth(candidate, size) > maxWidth) {
        lines.push(fragment);
        fragment = character;
      } else fragment = candidate;
    }
    current = fragment;
  };
  words.forEach(pushWord);
  if (current) lines.push(current);
  if (!maxLines || lines.length <= maxLines) return lines.length ? lines : [""];
  const bounded = lines.slice(0, maxLines);
  let last = bounded[maxLines - 1] || "";
  while (last && helveticaTextWidth(`${last}...`, size) > maxWidth) last = last.slice(0, -1).trimEnd();
  bounded[maxLines - 1] = `${last}...`;
  return bounded;
}

function fittedFontSize(value: unknown, size: number, maxWidth: number, minimum = 5.5) {
  let fitted = size;
  while (fitted > minimum && helveticaTextWidth(value, fitted) > maxWidth) {
    fitted = Math.max(minimum, fitted - 0.25);
  }
  return fitted;
}

function centeredFittedText(page: PdfPage, value: unknown, center: number, top: number, maxWidth: number, size = 8, bold = false, color = "0 0 0") {
  const fitted = fittedFontSize(value, size, maxWidth);
  const width = helveticaTextWidth(value, fitted);
  page.text(value, Math.max(center - maxWidth / 2, center - width / 2), top, fitted, bold, color);
}

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const NAVY = "0.05 0.18 0.42";
const BLUE = "0.04 0.62 0.88";
const GRAY = "0.55 0.58 0.62";

class PdfPage {
  readonly commands: string[] = [];
  line(x1: number, top1: number, x2: number, top2: number, color = "0 0 0", width = 0.6) {
    this.commands.push(`${color} RG ${width} w ${x1.toFixed(2)} ${(PAGE_HEIGHT - top1).toFixed(2)} m ${x2.toFixed(2)} ${(PAGE_HEIGHT - top2).toFixed(2)} l S`);
  }
  rect(x: number, top: number, width: number, height: number, stroke = "0 0 0", lineWidth = 0.6) {
    this.commands.push(`${stroke} RG ${lineWidth} w ${x.toFixed(2)} ${(PAGE_HEIGHT - top - height).toFixed(2)} ${width.toFixed(2)} ${height.toFixed(2)} re S`);
  }
  text(value: unknown, x: number, top: number, size = 9, bold = false, color = "0 0 0") {
    const font = bold ? "/F2" : "/F1";
    this.commands.push(`${color} rg BT ${font} ${size} Tf 1 0 0 1 ${x.toFixed(2)} ${(PAGE_HEIGHT - top - size).toFixed(2)} Tm (${pdfEscape(value)}) Tj ET`);
  }
  centered(value: unknown, top: number, size = 9, bold = false, color = "0 0 0", approximateWidth?: number) {
    const width = approximateWidth ?? helveticaTextWidth(value, size);
    this.text(value, (PAGE_WIDTH - width) / 2, top, size, bold, color);
  }
  filledRect(x: number, top: number, width: number, height: number, color: string) {
    this.commands.push(`${color} rg ${x.toFixed(2)} ${(PAGE_HEIGHT - top - height).toFixed(2)} ${width.toFixed(2)} ${height.toFixed(2)} re f`);
  }
  image(image: PdfImage, x: number, top: number, width: number, height: number) {
    this.commands.push(`q ${width.toFixed(2)} 0 0 ${height.toFixed(2)} ${x.toFixed(2)} ${(PAGE_HEIGHT - top - height).toFixed(2)} cm /Im1 Do Q`);
  }
  toString() { return this.commands.join("\n") + "\n"; }
}

export interface PdfImage {
  rgbBytes: Uint8Array;
  width: number;
  height: number;
}

function formatDate(value?: string | null) {
  if (!value) return "";
  const match = String(value).slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[2]}.${match[3]}.${match[1]}` : String(value);
}

function formatAmount(value: number, code: string) {
  // Keep the PDF stream ASCII/Helvetica-safe. The currency code is explicit;
  // no implicit symbol or FX conversion is introduced.
  return `${code} ${money(value).toFixed(2)}`;
}

function drawLetterhead(page: PdfPage, company: DocumentCompanySnapshot, compact = false, image?: PdfImage) {
  if (image) {
    const boxWidth = compact ? 78 : 92;
    const boxHeight = compact ? 48 : 58;
    const scale = Math.min(boxWidth / image.width, boxHeight / image.height);
    const imageWidth = Math.max(1, image.width * scale);
    const imageHeight = Math.max(1, image.height * scale);
    page.image(image, 72, (compact ? 24 : 26) + (boxHeight - imageHeight) / 2, imageWidth, imageHeight);
  }
  const companySize = compact ? 13 : 15;
  // Keep the legal name centered on the page while reserving the left header
  // band for a logo. A full-width centered line can otherwise cross a wide or
  // tall logo even though both elements individually fit their boxes.
  const companyWidth = image ? (compact ? 248 : 250) : 360;
  const companyLines = wrapToWidth(company.legalName.toUpperCase(), companyWidth, companySize);
  companyLines.forEach((line, index) => page.centered(line, (compact ? 28 : 34) + index * (companySize + 2), companySize, true, NAVY));
  let cursor = (compact ? 28 : 35) + companyLines.length * (companySize + 2) + 3;
  if (!compact) {
    const details = [
      { value: company.address || "", bold: true, size: 9 },
      { value: company.contactNumber ? `Cel No.: ${company.contactNumber}` : "", bold: false, size: 9 },
      { value: company.email ? `Email: ${company.email}` : "", bold: false, size: 9 },
    ];
    for (const detail of details) {
      const lines = wrapToWidth(detail.value, 410, detail.size);
      lines.forEach((line, index) => page.centered(line, cursor + index * 11, detail.size, detail.bold, NAVY));
      cursor += Math.max(11, lines.length * 11);
    }
    const separatorTop = Math.max(126, cursor + 4);
    page.line(72, separatorTop, 523, separatorTop, BLUE, 1.1);
    page.line(72, separatorTop + 5, 523, separatorTop + 5, GRAY, 3.2);
    return separatorTop + 5;
  } else {
    page.line(72, 86, 523, 86, BLUE, 1.0);
    page.line(72, 91, 523, 91, GRAY, 2.5);
    return 91;
  }
}

function drawTableGrid(page: PdfPage, x: number, top: number, widths: number[], rowHeights: number[], headerHeight: number) {
  const totalWidth = widths.reduce((sum, width) => sum + width, 0);
  const totalHeight = headerHeight + rowHeights.reduce((sum, height) => sum + height, 0);
  page.rect(x, top, totalWidth, totalHeight, "0.25 0.25 0.25", 0.6);
  let cursor = x;
  for (const width of widths.slice(0, -1)) {
    cursor += width;
    page.line(cursor, top, cursor, top + totalHeight, "0.45 0.45 0.45", 0.45);
  }
  let y = top + headerHeight;
  page.line(x, y, x + totalWidth, y, "0.45 0.45 0.45", 0.45);
  for (const height of rowHeights) {
    y += height;
    page.line(x, y, x + totalWidth, y, "0.65 0.65 0.65", 0.4);
  }
}

interface PdfLineSegment {
  readonly source: DocumentLineSnapshot;
  readonly descriptionLines: readonly string[];
  readonly detailLines: readonly string[];
  readonly rowHeight: number;
  readonly continuation: boolean;
}

function splitPdfLine(
  row: DocumentLineSnapshot,
  descriptionWidth: number,
  fontSize: number,
  linesPerSegment: number,
  detailLines: readonly string[] = [""],
): PdfLineSegment[] {
  const lines = wrapToWidth(row.description, descriptionWidth, fontSize);
  const segments: PdfLineSegment[] = [];
  for (let index = 0; index < lines.length; index += linesPerSegment) {
    const descriptionLines = lines.slice(index, index + linesPerSegment);
    const continuation = index > 0;
    const detailHeight = continuation ? 24 : detailLines.length * 10 + 10;
    segments.push({
      source: row,
      descriptionLines,
      detailLines: continuation ? [] : detailLines,
      rowHeight: Math.max(24, descriptionLines.length * 10 + 10, detailHeight),
      continuation,
    });
  }
  return segments.length
    ? segments
    : [{ source: row, descriptionLines: [""], detailLines, rowHeight: Math.max(24, detailLines.length * 10 + 10), continuation: false }];
}

function splitPdfLines(
  rows: readonly DocumentLineSnapshot[],
  descriptionWidth: number,
  fontSize: number,
  linesPerSegment: number,
  detailLinesForRow?: (row: DocumentLineSnapshot) => readonly string[],
) {
  return rows.flatMap((row) => splitPdfLine(row, descriptionWidth, fontSize, linesPerSegment, detailLinesForRow?.(row)));
}

function takePdfSegments(segments: readonly PdfLineSegment[], start: number, maxBottom: number, tableTop: number) {
  let end = start;
  let bottom = tableTop + 25;
  while (end < segments.length) {
    const nextHeight = segments[end].rowHeight;
    if (end > start && bottom + nextHeight > maxBottom) break;
    bottom += nextHeight;
    end += 1;
  }
  return Math.max(end, start + 1);
}

const TABLE_CONTENT_BOTTOM = 620;
const PO_UNIT_FONT_SIZE = 7.2;
const INVOICE_QUANTITY_FONT_SIZE = 7.5;

function drawDocumentHeading(page: PdfPage, title: string, documentNumber: string, top: number, size: number) {
  page.centered(title, top, size, true);
  const numberLines = wrapToWidth(`No:  ${documentNumber}`, 88, 7.5);
  const boxHeight = Math.max(25, numberLines.length * 9 + 8);
  page.rect(422, top - 2, 101, boxHeight, "0 0 0", 0.7);
  numberLines.forEach((line, index) => page.text(line, 428, top + 5 + index * 9, 7.5, false));
  return Math.max(top + size + 2, top - 2 + boxHeight);
}

function drawPoFooterPages(firstPage: PdfPage, snapshot: PurchaseOrderDocumentSnapshot, image: PdfImage | undefined, top: number) {
  const x = 72;
  const width = 451;
  const pages = [firstPage];
  let page = firstPage;
  let cursor = top;
  const nextPage = () => {
    page = new PdfPage();
    drawLetterhead(page, snapshot.company, true, image);
    page.centered("PURCHASE ORDER", 116, 12, true);
    pages.push(page);
    cursor = 150;
  };
  const drawBox = (label: string, value: string, labelWidth: number, valueWidth: number) => {
    const lines = wrapToWidth(value || "", valueWidth, 8.2);
    let lineIndex = 0;
    while (lineIndex < lines.length) {
      const availableLines = Math.max(1, Math.floor((790 - cursor - 12) / 10));
      const chunk = lines.slice(lineIndex, lineIndex + availableLines);
      const height = Math.max(20, chunk.length * 10 + 12);
      if (cursor + height > 790 && cursor > 150) { nextPage(); continue; }
      page.rect(x, cursor, width, height, "0.15 0.15 0.15", 0.75);
      const continuedLabel = lineIndex && label === "Terms and Conditions:" ? "Terms (continued):" : lineIndex ? `${label} (continued):` : label;
      page.text(continuedLabel, x + 8, cursor + 7, 8.5, false);
      chunk.forEach((line, index) => page.text(line, x + labelWidth, cursor + 7 + index * 10, 8.2, false));
      cursor += height + 6;
      lineIndex += chunk.length;
    }
  };
  drawBox("Deliver to:", snapshot.project.deliverTo || "", 72, 360);
  drawBox("Remarks:", snapshot.notes || snapshot.description || "", 72, 360);
  drawBox("Terms and Conditions:", snapshot.termsAndConditions || "Not specified", 118, 314);
  if (cursor + 42 > 790) nextPage();
  const signatureTop = cursor + 16;
  page.text("Processed by:", x, signatureTop, 9, true);
  page.text(snapshot.processor.name, x + 108, signatureTop, fittedFontSize(snapshot.processor.name, 9, 107), true);
  page.line(x + 108, signatureTop + 12, x + 215, signatureTop + 12, "0 0 0", 0.6);
  if (snapshot.processor.title) page.text(snapshot.processor.title, x + 108, signatureTop + 16, fittedFontSize(snapshot.processor.title, 8, 107), false);
  page.text("Conforme :", x + 270, signatureTop, 9, true);
  page.line(x + 334, signatureTop + 11, x + 445, signatureTop + 11, "0 0 0", 0.6);
  page.text("Supplier's Authorized Representative", x + 330, signatureTop + 16, 7.5, false);
  return pages;
}

function drawPoTotalRow(page: PdfPage, tableX: number, tableBottom: number, widths: number[], snapshot: PurchaseOrderDocumentSnapshot) {
  const totalWidth = widths.reduce((sum, width) => sum + width, 0);
  const firstFourWidth = widths.slice(0, 4).reduce((sum, width) => sum + width, 0);
  const firstFiveWidth = widths.slice(0, 5).reduce((sum, width) => sum + width, 0);
  const amountWords = wrapToWidth(snapshot.amountInWords || amountInWords(snapshot.totalAmount, snapshot.currency), firstFourWidth - 16, 8);
  const height = Math.max(28, amountWords.length * 9 + 12);
  page.rect(tableX, tableBottom, totalWidth, height, "0.25 0.25 0.25", 0.6);
  page.line(tableX + firstFourWidth, tableBottom, tableX + firstFourWidth, tableBottom + height, "0.45 0.45 0.45", 0.45);
  page.line(tableX + firstFiveWidth, tableBottom, tableX + firstFiveWidth, tableBottom + height, "0.45 0.45 0.45", 0.45);
  amountWords.forEach((line, index) => page.text(line, tableX + 8, tableBottom + 6 + index * 9, 8, false));
  page.text(`Total (${snapshot.currency})`, tableX + firstFourWidth + 5, tableBottom + 6, fittedFontSize(`Total (${snapshot.currency})`, 8.2, widths[4] - 8), true);
  centeredFittedText(page, formatAmount(snapshot.totalAmount, snapshot.currency), tableX + firstFiveWidth + widths[5] / 2, tableBottom + 7, widths[5] - 10, 7.8, true);
  return tableBottom + height;
}

function drawClientFooterPages(firstPage: PdfPage, snapshot: ClientInvoiceDocumentSnapshot, image: PdfImage | undefined, top: number) {
  const pages = [firstPage];
  let page = firstPage;
  let cursor = top;
  const nextPage = () => {
    page = new PdfPage();
    drawLetterhead(page, snapshot.company, true, image);
    page.centered("INVOICE", 116, 12, true);
    pages.push(page);
    cursor = 150;
  };
  const entries: Array<[string, string]> = [
    ["Payment instructions", snapshot.company.paymentInstructions || ""],
    ["Notes", snapshot.notes || ""],
    ["Terms", snapshot.termsAndConditions || ""],
  ];
  for (const [label, value] of entries) {
    if (!value.trim()) continue;
    const lines = wrapToWidth(value, 330, 8);
    let lineIndex = 0;
    while (lineIndex < lines.length) {
      const availableLines = Math.max(1, Math.floor((790 - cursor - 12) / 10));
      const chunk = lines.slice(lineIndex, lineIndex + availableLines);
      if (cursor + Math.max(16, chunk.length * 10 + 6) > 790 && cursor > 150) { nextPage(); continue; }
      page.text(`${label}${lineIndex ? " (continued)" : ""}:`, 72, cursor, 8, true);
      chunk.forEach((line, index) => page.text(line, 185, cursor + index * 10, 8, false));
      cursor += Math.max(16, chunk.length * 10 + 6);
      lineIndex += chunk.length;
    }
  }
  if (cursor + 42 > 790) nextPage();
  const preparedTop = Math.max(150, cursor + 8);
  page.text("Prepared by:", 72, preparedTop, 9, true);
  page.text(snapshot.processor.name, 140, preparedTop, fittedFontSize(snapshot.processor.name, 9, 380), true);
  if (snapshot.processor.title) page.text(snapshot.processor.title, 140, preparedTop + 16, fittedFontSize(snapshot.processor.title, 8, 380), false);
  return pages;
}

function drawPoPage(snapshot: PurchaseOrderDocumentSnapshot, rows: readonly PdfLineSegment[], image?: PdfImage, continuation = false) {
  const page = new PdfPage();
  const letterheadBottom = drawLetterhead(page, snapshot.company, continuation, image);
  const contentTop = continuation ? 116 : Math.max(154, letterheadBottom + 23);
  const headingBottom = drawDocumentHeading(page, "PURCHASE ORDER", snapshot.documentNumber, contentTop, 14);
  const detailStart = Math.max(218, headingBottom + 18);
  let detailBottom = Math.max(290, detailStart);
  if (!continuation) {
    page.text(`VAT TIN: ${snapshot.company.vatTin || ""}`, 72, 190, 10, true);
    const detailRows = [
      ["Supplier", snapshot.supplier.name],
      ["Address", snapshot.supplier.address || ""],
      ["Attention", snapshot.supplier.attention || ""],
      ["VAT TIN", snapshot.supplier.vatTin || ""],
    ] as const;
    let detailTop = detailStart;
    for (const [label, value] of detailRows) {
      const valueLines = wrapToWidth(value, 245, 9.5);
      const rowHeight = Math.max(18, valueLines.length * 10 + 8);
      page.text(label, 72, detailTop, 10, true);
      page.text(":", 165, detailTop, 10, true);
      valueLines.forEach((line, index) => page.text(line, 178, detailTop + index * 10, 9.5, true));
      detailTop += rowHeight;
    }
    detailBottom = detailTop;
    page.text(formatDate(snapshot.issueDate), 435, detailStart, 10, true);
    page.text("Date", 448, detailStart + 18, 10, true);
  } else {
    wrapToWidth(`Supplier: ${snapshot.supplier.name}`, 330, 9).forEach((line, index) => page.text(line, 72, 190 + index * 10, 9, true));
    page.text(`Date: ${formatDate(snapshot.issueDate)}`, 430, 190, 9, true);
  }

  const tableX = 72;
  const tableTop = continuation ? 222 : Math.max(300, detailBottom + 10);
  const widths = [52, 34, 38, 178, 75, 74];
  const headers = ["Item No.", "Qty", "Unit", "Description", "Unit Price", "Amount"];
  const rowHeights = rows.map((row) => row.rowHeight);
  const headerHeight = 25;
  page.filledRect(tableX, tableTop, widths.reduce((sum, width) => sum + width, 0), headerHeight, "0.92 0.94 0.97");
  drawTableGrid(page, tableX, tableTop, widths, rowHeights, headerHeight);
  let cursor = tableX;
  headers.forEach((header, index) => {
    const estimate = header.length * 5.0;
    page.text(header, cursor + Math.max(3, (widths[index] - estimate) / 2), tableTop + 7, 8.2, true);
    cursor += widths[index];
  });
  let y = tableTop + headerHeight;
  rows.forEach((segment, index) => {
    const row = segment.source;
    if (!segment.continuation) {
      page.text(String(row.lineNumber || index + 1), tableX + 20, y + 7, 8.5, false);
      centeredFittedText(page, row.quantity === undefined ? "" : String(row.quantity), tableX + widths[0] + widths[1] / 2, y + 7, widths[1] - 10, 8.5);
      segment.detailLines.forEach((line, lineIndex) => centeredFittedText(page, line, tableX + widths[0] + widths[1] + widths[2] / 2, y + 6 + lineIndex * 10, widths[2] - 6, PO_UNIT_FONT_SIZE));
      centeredFittedText(page, row.unitPrice === undefined ? "" : formatAmount(row.unitPrice, snapshot.currency), tableX + widths.slice(0, 4).reduce((sum, width) => sum + width, 0) + widths[4] / 2, y + 7, widths[4] - 10, 7.8);
      centeredFittedText(page, formatAmount(row.amount, snapshot.currency), tableX + widths.slice(0, 5).reduce((sum, width) => sum + width, 0) + widths[5] / 2, y + 7, widths[5] - 10, 7.8);
    }
    segment.descriptionLines.forEach((line, lineIndex) => page.text(line, tableX + widths[0] + widths[1] + widths[2] + 6, y + 6 + lineIndex * 10, 8.2, false));
    y += rowHeights[index];
  });
  return { page, tableTop, tableBottom: y, tableX, widths };
}

export function buildPurchaseOrderPdf(snapshot: PurchaseOrderDocumentSnapshot, image?: PdfImage) {
  const lines = snapshot.lines.length ? snapshot.lines : [{ lineNumber: 1, description: "", amount: 0 }];
  const segments = splitPdfLines(lines, 166, 8.2, 2, (row) => wrapToWidth(row.unit || "", 30, PO_UNIT_FONT_SIZE));
  const pages: PdfPage[] = [];
  let rowIndex = 0;
  let continuation = false;
  while (rowIndex < segments.length) {
    const firstCandidate = drawPoPage(snapshot, [segments[rowIndex]], image, continuation);
    let nextIndex = takePdfSegments(segments, rowIndex, TABLE_CONTENT_BOTTOM, firstCandidate.tableTop);
    let result = drawPoPage(snapshot, segments.slice(rowIndex, nextIndex), image, continuation);
    while (result.tableBottom > TABLE_CONTENT_BOTTOM && nextIndex > rowIndex + 1) {
      nextIndex -= 1;
      result = drawPoPage(snapshot, segments.slice(rowIndex, nextIndex), image, continuation);
    }
    if (nextIndex < segments.length) {
      pages.push(result.page);
      rowIndex = nextIndex;
      continuation = true;
      continue;
    }
    const totalRowBottom = drawPoTotalRow(result.page, result.tableX, result.tableBottom, result.widths, snapshot);
    pages.push(...drawPoFooterPages(result.page, snapshot, image, totalRowBottom + 8).slice(0));
    rowIndex = nextIndex;
  }
  return buildPdfBytes(pages, image);
}

function drawClientPage(snapshot: ClientInvoiceDocumentSnapshot, rows: readonly PdfLineSegment[], image?: PdfImage, continuation = false) {
  const page = new PdfPage();
  const letterheadBottom = drawLetterhead(page, snapshot.company, continuation, image);
  const titleTop = continuation ? 116 : Math.max(154, letterheadBottom + 23);
  const headingBottom = drawDocumentHeading(page, "INVOICE", snapshot.documentNumber, titleTop, 15);
  let tableTop = continuation ? 222 : 330;
  if (!continuation) {
    const metadataTop = Math.max(194, headingBottom + 16);
    page.text(`Invoice date: ${formatDate(snapshot.invoiceDate)}`, 72, metadataTop, 9, true);
    page.text(`Due date: ${formatDate(snapshot.dueDate)}`, 72, metadataTop + 18, 9, false);
    const projectTop = metadataTop + 36;
    const projectLines = wrapToWidth(`Project: ${snapshot.project.projectCode || ""} ${snapshot.project.projectName || ""} - Tax: ${snapshot.taxTreatment || "Unclassified"}`, 451, 8.5);
    projectLines.forEach((line, index) => page.text(line, 72, projectTop + index * 10, 8.5, false));
    const billTop = projectTop + Math.max(1, projectLines.length) * 10 + 8;
    page.text("Bill To", 72, billTop, 10, true);
    const leftLines = [
      ...wrapToWidth(snapshot.billTo.name || "", 210, 9),
      ...wrapToWidth(snapshot.billTo.contactName || "", 210, 8.5),
    ];
    const rightLines = [
      ...wrapToWidth(snapshot.billTo.email || "", 210, 8.5),
      ...wrapToWidth(snapshot.billTo.address || "", 210, 8.5),
      ...wrapToWidth(snapshot.billTo.reference ? `Reference: ${snapshot.billTo.reference}` : "", 210, 8.5),
    ];
    leftLines.forEach((line, index) => page.text(line, 72, billTop + 17 + index * 10, 8.5, index === 0));
    rightLines.forEach((line, index) => page.text(line, 310, billTop + 17 + index * 10, 8.5, false));
    tableTop = Math.max(330, billTop + 17 + Math.max(leftLines.length, rightLines.length) * 10 + 8);
  } else {
    const continuationTop = Math.max(190, headingBottom + 16);
    wrapToWidth(`Bill To: ${snapshot.billTo.name || ""}`, 285, 8.5).forEach((line, index) => page.text(line, 72, continuationTop + index * 10, 8.5, true));
    page.text(`Date: ${formatDate(snapshot.invoiceDate)}`, 430, continuationTop, 9, true);
    tableTop = Math.max(222, continuationTop + 18 + wrapToWidth(`Bill To: ${snapshot.billTo.name || ""}`, 285, 8.5).length * 10);
  }
  const tableX = 72;
  const widths = [35, 268, 58, 90];
  const headers = ["#", "Description", "Qty / Unit", "Amount"];
  const rowHeights = rows.map((row) => row.rowHeight);
  const headerHeight = 25;
  page.filledRect(tableX, tableTop, widths.reduce((sum, width) => sum + width, 0), headerHeight, "0.92 0.94 0.97");
  drawTableGrid(page, tableX, tableTop, widths, rowHeights, headerHeight);
  let cursor = tableX;
  headers.forEach((header, index) => {
    page.text(header, cursor + 6, tableTop + 7, 8.2, true);
    cursor += widths[index];
  });
  let y = tableTop + headerHeight;
  rows.forEach((segment, index) => {
    const row = segment.source;
    if (!segment.continuation) {
      page.text(String(row.lineNumber || index + 1), tableX + 14, y + 7, 8.5, false);
      segment.detailLines.forEach((line, lineIndex) => centeredFittedText(page, line, tableX + widths[0] + widths[1] + widths[2] / 2, y + 6 + lineIndex * 10, widths[2] - 8, INVOICE_QUANTITY_FONT_SIZE));
      centeredFittedText(page, formatAmount(row.amount, snapshot.currency), tableX + widths.slice(0, 3).reduce((sum, width) => sum + width, 0) + widths[3] / 2, y + 7, widths[3] - 12, 8);
    }
    segment.descriptionLines.forEach((line, lineIndex) => page.text(line, tableX + widths[0] + 6, y + 6 + lineIndex * 10, 8.2, false));
    y += rowHeights[index];
  });
  return { page, tableTop, tableBottom: y };
}

export function buildClientInvoicePdf(snapshot: ClientInvoiceDocumentSnapshot, image?: PdfImage) {
  const lines = snapshot.lines.length ? snapshot.lines : [{ lineNumber: 1, description: "", amount: 0 }];
  const segments = splitPdfLines(lines, 256, 8.2, 3, (row) => {
    const quantity = row.quantity === undefined ? "" : `${row.quantity}${row.unit ? ` ${row.unit}` : ""}`;
    return wrapToWidth(quantity, 46, INVOICE_QUANTITY_FONT_SIZE);
  });
  const pages: PdfPage[] = [];
  let rowIndex = 0;
  let continuation = false;
  while (rowIndex < segments.length) {
    const firstCandidate = drawClientPage(snapshot, [segments[rowIndex]], image, continuation);
    let nextIndex = takePdfSegments(segments, rowIndex, TABLE_CONTENT_BOTTOM, firstCandidate.tableTop);
    let result = drawClientPage(snapshot, segments.slice(rowIndex, nextIndex), image, continuation);
    while (result.tableBottom > TABLE_CONTENT_BOTTOM && nextIndex > rowIndex + 1) {
      nextIndex -= 1;
      result = drawClientPage(snapshot, segments.slice(rowIndex, nextIndex), image, continuation);
    }
    const hasMore = nextIndex < segments.length;
    if (hasMore) {
      pages.push(result.page);
      rowIndex = nextIndex;
      continuation = true;
      continue;
    }
    let y = result.tableBottom + 30;
    result.page.text("Subtotal", 390, y, 8.5, true);
    centeredFittedText(result.page, formatAmount(snapshot.subtotal, snapshot.currency), 478, y, 90, 8);
    if (snapshot.taxAmount !== undefined && money(snapshot.taxAmount) > 0) { result.page.text(snapshot.taxLabel || "Tax", 390, y + 18, 8.5, false); centeredFittedText(result.page, formatAmount(snapshot.taxAmount, snapshot.currency), 478, y + 18, 90, 8); y += 18; }
    result.page.text(`Total (${snapshot.currency})`, 390, y + 36, 9, true);
    centeredFittedText(result.page, formatAmount(snapshot.totalAmount, snapshot.currency), 478, y + 36, 90, 9, true);
    const amountWords = wrapToWidth(snapshot.amountInWords || amountInWords(snapshot.totalAmount, snapshot.currency), 443, 8);
    amountWords.forEach((line, index) => result.page.text(line, 80, y + 72 + index * 10, 8, false));
    pages.push(...drawClientFooterPages(result.page, snapshot, image, y + 72 + amountWords.length * 10 + 15));
    rowIndex = nextIndex;
  }
  return buildPdfBytes(pages, image);
}

function concatBytes(parts: Uint8Array[]) {
  const total = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const output = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) { output.set(part, offset); offset += part.byteLength; }
  return output;
}

function buildPdfBytes(pages: PdfPage[], image?: PdfImage) {
  const encoder = new TextEncoder();
  const objects: Uint8Array[] = [];
  const setObject = (index: number, value: Uint8Array) => { objects[index - 1] = value; };
  const object = (value: string) => encoder.encode(`${value}\n`);
  const stream = (content: string) => {
    const bytes = encoder.encode(content);
    return concatBytes([encoder.encode(`<< /Length ${bytes.byteLength} >>\nstream\n`), bytes, encoder.encode("\nendstream\n")]);
  };
  const catalogId = 1;
  const pagesId = 2;
  const regularFontId = 3;
  const boldFontId = 4;
  const imageId = image ? 5 : 0;
  const contentStart = image ? 6 : 5;
  const contentIds = pages.map((_, index) => contentStart + index);
  const pageStart = contentStart + pages.length;
  const pageIds = pages.map((_, index) => pageStart + index);
  setObject(catalogId, object(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`));
  setObject(pagesId, object(`<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`));
  setObject(regularFontId, object("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"));
  setObject(boldFontId, object("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>"));
  if (image) {
    setObject(imageId, concatBytes([encoder.encode(`<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Length ${image.rgbBytes.byteLength} >>\nstream\n`), image.rgbBytes, encoder.encode("\nendstream\n")]));
  }
  pages.forEach((page, index) => setObject(contentIds[index], stream(page.toString())));
  pages.forEach((_, index) => setObject(pageIds[index], object(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 ${regularFontId} 0 R /F2 ${boldFontId} 0 R >>${image ? ` /XObject << /Im1 ${imageId} 0 R >>` : ""} >> /Contents ${contentIds[index]} 0 R >>`)));

  const header = encoder.encode("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");
  const chunks: Uint8Array[] = [header];
  const offsets: number[] = [0];
  let offset = header.byteLength;
  objects.forEach((value, index) => {
    const prefix = encoder.encode(`${index + 1} 0 obj\n`);
    const suffix = encoder.encode("endobj\n");
    offsets[index + 1] = offset;
    chunks.push(prefix, value, suffix);
    offset += prefix.byteLength + value.byteLength + suffix.byteLength;
  });
  const xrefOffset = offset;
  const xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((item) => `${String(item).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  chunks.push(encoder.encode(xref));
  return concatBytes(chunks);
}

export async function loadPdfLogo(path?: string | null): Promise<PdfImage | undefined> {
  if (!path || typeof window === "undefined" || typeof document === "undefined") return undefined;
  try {
    const response = await fetch(path);
    if (!response.ok) return undefined;
    const blob = await response.blob();
    const bitmap = typeof createImageBitmap === "function" ? await createImageBitmap(blob) : await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = URL.createObjectURL(blob);
    });
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return undefined;
    context.save();
    context.globalCompositeOperation = "destination-over";
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.restore();
    context.drawImage(bitmap as CanvasImageSource, 0, 0);
    const rgba = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const bytes = new Uint8Array(canvas.width * canvas.height * 3);
    for (let sourceIndex = 0, targetIndex = 0; sourceIndex < rgba.length; sourceIndex += 4) {
      bytes[targetIndex++] = rgba[sourceIndex];
      bytes[targetIndex++] = rgba[sourceIndex + 1];
      bytes[targetIndex++] = rgba[sourceIndex + 2];
    }
    if ("close" in bitmap && typeof (bitmap as ImageBitmap).close === "function") (bitmap as ImageBitmap).close();
    return { rgbBytes: bytes, width: canvas.width, height: canvas.height };
  } catch {
    return undefined;
  }
}

export async function generateFinancialDocumentPdf(snapshot: FinancialDocumentSnapshot) {
  const image = await loadPdfLogo(snapshot.company.logoPath);
  return snapshot.documentType === "PURCHASE_ORDER"
    ? buildPurchaseOrderPdf(snapshot, image)
    : buildClientInvoicePdf(snapshot, image);
}

export function downloadPdfBytes(bytes: Uint8Array, fileName: string) {
  if (typeof window === "undefined" || typeof document === "undefined") throw new Error("PDF download is only available in a browser.");
  const blob = new Blob([bytes], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function documentFileName(snapshot: FinancialDocumentSnapshot) {
  const prefix = snapshot.documentType === "PURCHASE_ORDER" ? "Purchase_Order" : "Client_Invoice";
  return `${prefix}_${String(snapshot.documentNumber || "document").replace(/[^A-Za-z0-9._-]+/g, "_")}.pdf`;
}
