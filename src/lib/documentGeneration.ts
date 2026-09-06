import type { ClientBilling } from "./clientBilling.ts";
import type { CompanyDocumentProfile } from "./companyDocumentProfile.ts";
import type { Project, PurchaseOrder, Vendor } from "../types.ts";

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

function wrap(value: unknown, maxChars: number) {
  const source = ascii(value).trim();
  if (!source) return [""];
  const words = source.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if (word.length > maxChars) {
      if (current) lines.push(current);
      for (let index = 0; index < word.length; index += maxChars) lines.push(word.slice(index, index + maxChars));
      current = "";
    } else if (!current) current = word;
    else if (`${current} ${word}`.length <= maxChars) current += ` ${word}`;
    else { lines.push(current); current = word; }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

function boundedWrap(value: unknown, maxChars: number, maxLines: number) {
  const lines = wrap(value, maxChars);
  if (lines.length <= maxLines) return lines;
  const bounded = lines.slice(0, maxLines);
  const last = bounded[maxLines - 1] || "";
  bounded[maxLines - 1] = `${last.slice(0, Math.max(0, maxChars - 3)).trimEnd()}...`;
  return bounded;
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
    const chars = ascii(value).length;
    const width = approximateWidth ?? chars * size * 0.52;
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
  jpegBytes: Uint8Array;
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
  if (image) page.image(image, 72, compact ? 24 : 26, 102, 68);
  page.centered(company.legalName.toUpperCase(), compact ? 28 : 35, compact ? 13 : 16, true, NAVY);
  if (!compact) {
    page.centered(company.address || "", 56, 10, true, NAVY);
    page.centered(company.contactNumber ? `Cel No.: ${company.contactNumber}` : "", 73, 10, false, NAVY);
    page.centered(company.email ? `Email: ${company.email}` : "", 90, 10, false, NAVY);
    page.line(72, 126, 523, 126, BLUE, 1.1);
    page.line(72, 131, 523, 131, GRAY, 3.2);
  } else {
    page.line(72, 86, 523, 86, BLUE, 1.0);
    page.line(72, 91, 523, 91, GRAY, 2.5);
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

function drawPoFooter(page: PdfPage, snapshot: PurchaseOrderDocumentSnapshot, top: number) {
  const x = 72;
  const width = 451;
  const deliveryLines = boundedWrap(snapshot.project.deliverTo || "", 56, 2);
  const remarkLines = boundedWrap(snapshot.notes || snapshot.description || "", 56, 2);
  const deliveryRowHeight = Math.max(18, deliveryLines.length * 10 + 8);
  const remarksRowHeight = Math.max(18, remarkLines.length * 10 + 8);
  const deliveryHeight = deliveryRowHeight + remarksRowHeight;
  page.rect(x, top, width, deliveryHeight, "0.15 0.15 0.15", 0.75);
  page.line(x, top + deliveryRowHeight, x + width, top + deliveryRowHeight, "0.15 0.15 0.15", 0.55);
  page.text("Deliver to:", x + 8, top + 6, 9, false);
  deliveryLines.forEach((line, index) => page.text(line, x + 72, top + 6 + index * 10, 8.5, false));
  page.text("Remarks:", x + 8, top + deliveryRowHeight + 6, 9, false);
  remarkLines.forEach((line, index) => page.text(line, x + 72, top + deliveryRowHeight + 6 + index * 10, 8, false));
  const termsTop = top + deliveryHeight + 6;
  const termsLines = boundedWrap(snapshot.termsAndConditions || "", 42, 4);
  const termsHeight = Math.max(28, termsLines.length * 10 + 12);
  page.rect(x, termsTop, width, termsHeight, "0.15 0.15 0.15", 0.75);
  page.text("Terms and Conditions:", x + 8, termsTop + 8, 9, false);
  termsLines.forEach((line, index) => page.text(line, x + 118, termsTop + 8 + index * 10, 8, false));
  const signatureTop = termsTop + termsHeight + 32;
  page.text("Processed by:", x, signatureTop, 9, true);
  page.text(snapshot.processor.name, x + 108, signatureTop, 9, true);
  page.line(x + 108, signatureTop + 12, x + 215, signatureTop + 12, "0 0 0", 0.6);
  if (snapshot.processor.title) page.text(snapshot.processor.title, x + 108, signatureTop + 16, 8, false);
  page.text("Conforme :", x + 270, signatureTop, 9, true);
  page.line(x + 334, signatureTop + 11, x + 445, signatureTop + 11, "0 0 0", 0.6);
  page.text("Supplier's Authorized Representative", x + 330, signatureTop + 16, 7.5, false);
  return signatureTop;
}

function drawPoTotalRow(page: PdfPage, tableX: number, tableBottom: number, widths: number[], snapshot: PurchaseOrderDocumentSnapshot) {
  const height = 28;
  const totalWidth = widths.reduce((sum, width) => sum + width, 0);
  const firstFourWidth = widths.slice(0, 4).reduce((sum, width) => sum + width, 0);
  const firstFiveWidth = widths.slice(0, 5).reduce((sum, width) => sum + width, 0);
  page.rect(tableX, tableBottom, totalWidth, height, "0.25 0.25 0.25", 0.6);
  page.line(tableX + firstFourWidth, tableBottom, tableX + firstFourWidth, tableBottom + height, "0.45 0.45 0.45", 0.45);
  page.line(tableX + firstFiveWidth, tableBottom, tableX + firstFiveWidth, tableBottom + height, "0.45 0.45 0.45", 0.45);
  boundedWrap(snapshot.amountInWords || amountInWords(snapshot.totalAmount, snapshot.currency), 46, 2)
    .forEach((line, index) => page.text(line, tableX + 8, tableBottom + 6 + index * 9, 8, false));
  page.text(`Total (${snapshot.currency})`, tableX + firstFourWidth + 5, tableBottom + 6, 8.2, true);
  page.text(formatAmount(snapshot.totalAmount, snapshot.currency), tableX + firstFiveWidth + 5, tableBottom + 7, 7.8, true);
  return tableBottom + height;
}

function drawClientFooter(page: PdfPage, snapshot: ClientInvoiceDocumentSnapshot, top: number) {
  let cursor = top;
  const entries: Array<[string, string]> = [
    ["Payment instructions", snapshot.company.paymentInstructions || ""],
    ["Notes", snapshot.notes || ""],
    ["Terms", snapshot.termsAndConditions || ""],
  ];
  for (const [label, value] of entries) {
    if (!value.trim()) continue;
    const lines = boundedWrap(value, 70, 3);
    page.text(`${label}:`, 80, cursor, 8, true);
    lines.forEach((line, index) => page.text(line, 155, cursor + index * 10, 8, false));
    cursor += Math.max(16, lines.length * 10 + 6);
  }
  const preparedTop = Math.max(top + 45, cursor + 8);
  page.text("Prepared by:", 72, preparedTop, 9, true);
  page.text(snapshot.processor.name, 140, preparedTop, 9, true);
  if (snapshot.processor.title) page.text(snapshot.processor.title, 140, preparedTop + 16, 8, false);
}

function drawPoPage(snapshot: PurchaseOrderDocumentSnapshot, rows: DocumentLineSnapshot[], image?: PdfImage, continuation = false, rowStart = 0) {
  const page = new PdfPage();
  drawLetterhead(page, snapshot.company, continuation, image);
  const contentTop = continuation ? 116 : 154;
  page.centered("PURCHASE ORDER", contentTop, 14, true);
  page.rect(422, contentTop - 2, 101, 25, "0 0 0", 0.7);
  page.text(`No:  ${snapshot.documentNumber}`, 430, contentTop + 6, 9, false);
  let detailBottom = 290;
  if (!continuation) {
    page.text(`VAT TIN: ${snapshot.company.vatTin || ""}`, 72, 190, 10, true);
    const detailRows = [
      ["Supplier", snapshot.supplier.name],
      ["Address", snapshot.supplier.address || ""],
      ["Attention", snapshot.supplier.attention || ""],
      ["VAT TIN", snapshot.supplier.vatTin || ""],
    ] as const;
    let detailTop = 218;
    for (const [label, value] of detailRows) {
      const valueLines = boundedWrap(value, 42, 2);
      const rowHeight = Math.max(18, valueLines.length * 10 + 8);
      page.text(label, 72, detailTop, 10, true);
      page.text(":", 165, detailTop, 10, true);
      valueLines.forEach((line, index) => page.text(line, 178, detailTop + index * 10, 10, true));
      detailTop += rowHeight;
    }
    detailBottom = detailTop;
    page.text(formatDate(snapshot.issueDate), 435, 218, 10, true);
    page.text("Date", 448, 236, 10, true);
  } else {
    boundedWrap(`Supplier: ${snapshot.supplier.name}`, 55, 2).forEach((line, index) => page.text(line, 72, 190 + index * 10, 9, true));
    page.text(`Date: ${formatDate(snapshot.issueDate)}`, 430, 190, 9, true);
  }

  const tableX = 72;
  const tableTop = continuation ? 222 : Math.max(300, detailBottom + 10);
  const widths = [52, 34, 38, 178, 75, 74];
  const headers = ["Item No.", "Qty", "Unit", "Description", "Unit Price", "Amount"];
  const rowHeights = rows.map((row) => Math.max(24, wrap(row.description, 32).length * 10 + 10));
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
  rows.forEach((row, index) => {
    const descLines = wrap(row.description, 32);
    page.text(String(row.lineNumber || rowStart + index + 1), tableX + 20, y + 7, 8.5, false);
    page.text(row.quantity === undefined ? "" : String(row.quantity), tableX + widths[0] + 8, y + 7, 8.5, false);
    page.text(row.unit || "", tableX + widths[0] + widths[1] + 8, y + 7, 8.5, false);
    descLines.slice(0, 3).forEach((line, lineIndex) => page.text(line, tableX + widths[0] + widths[1] + widths[2] + 6, y + 6 + lineIndex * 10, 8.2, false));
    page.text(row.unitPrice === undefined ? "" : formatAmount(row.unitPrice, snapshot.currency), tableX + widths[0] + widths[1] + widths[2] + widths[3] + 5, y + 7, 7.8, false);
    page.text(formatAmount(row.amount, snapshot.currency), tableX + widths.slice(0, 5).reduce((sum, width) => sum + width, 0) + 5, y + 7, 7.8, false);
    y += rowHeights[index];
  });
  return { page, tableBottom: y, tableX, widths };
}

export function buildPurchaseOrderPdf(snapshot: PurchaseOrderDocumentSnapshot, image?: PdfImage) {
  const lines = snapshot.lines.length ? snapshot.lines : [{ lineNumber: 1, description: "", amount: 0 }];
  const pages: PdfPage[] = [];
  let rowIndex = 0;
  let continuation = false;
  while (rowIndex < lines.length) {
    const maxRows = continuation ? 18 : 10;
    const chunk = lines.slice(rowIndex, rowIndex + maxRows);
    const result = drawPoPage(snapshot, chunk, image, continuation, rowIndex);
    if (rowIndex + chunk.length < lines.length) {
      pages.push(result.page);
      rowIndex += chunk.length;
      continuation = true;
      continue;
    }
    const totalHeight = result.tableBottom + 25;
    if (totalHeight > 505) {
      pages.push(result.page);
      const finalPage = drawPoPage(snapshot, [], image, true, rowIndex);
      const totalRowBottom = drawPoTotalRow(finalPage.page, finalPage.tableX, finalPage.tableBottom, finalPage.widths, snapshot);
      drawPoFooter(finalPage.page, snapshot, totalRowBottom + 8);
      pages.push(finalPage.page);
    } else {
      const totalRowBottom = drawPoTotalRow(result.page, result.tableX, result.tableBottom, result.widths, snapshot);
      drawPoFooter(result.page, snapshot, totalRowBottom + 8);
      pages.push(result.page);
    }
    rowIndex += chunk.length;
  }
  return buildPdfBytes(pages, image);
}

function drawClientPage(snapshot: ClientInvoiceDocumentSnapshot, rows: DocumentLineSnapshot[], image?: PdfImage, continuation = false, rowStart = 0) {
  const page = new PdfPage();
  drawLetterhead(page, snapshot.company, continuation, image);
  const titleTop = continuation ? 116 : 154;
  page.centered("INVOICE", titleTop, 15, true);
  page.rect(422, titleTop - 2, 101, 25, "0 0 0", 0.7);
  page.text(`No:  ${snapshot.documentNumber}`, 430, titleTop + 6, 9, false);
  if (!continuation) {
    page.text(`Invoice date: ${formatDate(snapshot.invoiceDate)}`, 72, 194, 9, true);
    page.text(`Due date: ${formatDate(snapshot.dueDate)}`, 72, 212, 9, false);
    page.text(`Project: ${snapshot.project.projectCode || ""} ${snapshot.project.projectName || ""}`, 72, 230, 9, false);
    page.text("Bill To", 72, 258, 10, true);
    page.text(snapshot.billTo.name || "", 72, 275, 9, true);
    page.text(snapshot.billTo.contactName || "", 72, 291, 8.5, false);
    page.text(snapshot.billTo.email || "", 310, 275, 8.5, false);
    page.text(snapshot.billTo.address || "", 310, 291, 8.5, false);
    page.text(snapshot.billTo.reference ? `Reference: ${snapshot.billTo.reference}` : "", 310, 307, 8.5, false);
  } else {
    page.text(`Bill To: ${snapshot.billTo.name || ""}`, 72, 190, 9, true);
    page.text(`Date: ${formatDate(snapshot.invoiceDate)}`, 430, 190, 9, true);
  }
  const tableX = 72;
  const tableTop = continuation ? 222 : 330;
  const widths = [35, 268, 58, 90];
  const headers = ["#", "Description", "Qty / Unit", "Amount"];
  const rowHeights = rows.map((row) => Math.max(24, wrap(row.description, 45).length * 10 + 10));
  const headerHeight = 25;
  page.filledRect(tableX, tableTop, widths.reduce((sum, width) => sum + width, 0), headerHeight, "0.92 0.94 0.97");
  drawTableGrid(page, tableX, tableTop, widths, rowHeights, headerHeight);
  let cursor = tableX;
  headers.forEach((header, index) => {
    page.text(header, cursor + 6, tableTop + 7, 8.2, true);
    cursor += widths[index];
  });
  let y = tableTop + headerHeight;
  rows.forEach((row, index) => {
    page.text(String(row.lineNumber || rowStart + index + 1), tableX + 14, y + 7, 8.5, false);
    wrap(row.description, 45).slice(0, 3).forEach((line, lineIndex) => page.text(line, tableX + widths[0] + 6, y + 6 + lineIndex * 10, 8.2, false));
    const qty = row.quantity === undefined ? "" : `${row.quantity}${row.unit ? ` ${row.unit}` : ""}`;
    page.text(qty, tableX + widths[0] + widths[1] + 6, y + 7, 8, false);
    page.text(formatAmount(row.amount, snapshot.currency), tableX + widths.slice(0, 3).reduce((sum, width) => sum + width, 0) + 6, y + 7, 8, false);
    y += rowHeights[index];
  });
  return { page, tableBottom: y };
}

export function buildClientInvoicePdf(snapshot: ClientInvoiceDocumentSnapshot, image?: PdfImage) {
  const lines = snapshot.lines.length ? snapshot.lines : [{ lineNumber: 1, description: "", amount: 0 }];
  const pages: PdfPage[] = [];
  let rowIndex = 0;
  let continuation = false;
  while (rowIndex < lines.length) {
    const chunk = lines.slice(rowIndex, rowIndex + (continuation ? 19 : 9));
    const result = drawClientPage(snapshot, chunk, image, continuation, rowIndex);
    const hasMore = rowIndex + chunk.length < lines.length;
    if (hasMore) {
      pages.push(result.page);
      rowIndex += chunk.length;
      continuation = true;
      continue;
    }
    let y = result.tableBottom + 30;
    if (y > 600) {
      pages.push(result.page);
      const next = drawClientPage(snapshot, [], image, true, rowIndex);
      y = 270;
      next.page.text(`Subtotal`, 390, y, 8.5, true);
      next.page.text(formatAmount(snapshot.subtotal, snapshot.currency), 490, y, 8, false);
      if (snapshot.taxAmount !== undefined && money(snapshot.taxAmount) > 0) { next.page.text(snapshot.taxLabel || "Tax", 390, y + 18, 8.5, false); next.page.text(formatAmount(snapshot.taxAmount, snapshot.currency), 490, y + 18, 8, false); y += 18; }
      next.page.text(`Total (${snapshot.currency})`, 390, y + 36, 9, true);
      next.page.text(formatAmount(snapshot.totalAmount, snapshot.currency), 490, y + 36, 9, true);
      next.page.text(snapshot.amountInWords || amountInWords(snapshot.totalAmount, snapshot.currency), 80, y + 72, 8, false);
      drawClientFooter(next.page, snapshot, y + 105);
      pages.push(next.page);
    } else {
      result.page.text("Subtotal", 390, y, 8.5, true);
      result.page.text(formatAmount(snapshot.subtotal, snapshot.currency), 490, y, 8, false);
      if (snapshot.taxAmount !== undefined && money(snapshot.taxAmount) > 0) { result.page.text(snapshot.taxLabel || "Tax", 390, y + 18, 8.5, false); result.page.text(formatAmount(snapshot.taxAmount, snapshot.currency), 490, y + 18, 8, false); y += 18; }
      result.page.text(`Total (${snapshot.currency})`, 390, y + 36, 9, true);
      result.page.text(formatAmount(snapshot.totalAmount, snapshot.currency), 490, y + 36, 9, true);
      result.page.text(snapshot.amountInWords || amountInWords(snapshot.totalAmount, snapshot.currency), 80, y + 72, 8, false);
      drawClientFooter(result.page, snapshot, y + 105);
      pages.push(result.page);
    }
    rowIndex += chunk.length;
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
    setObject(imageId, concatBytes([encoder.encode(`<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.jpegBytes.byteLength} >>\nstream\n`), image.jpegBytes, encoder.encode("\nendstream\n")]));
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
    const context = canvas.getContext("2d");
    if (!context) return undefined;
    context.drawImage(bitmap as CanvasImageSource, 0, 0);
    const base64 = canvas.toDataURL("image/jpeg", 0.9).split(",")[1] || "";
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    if ("close" in bitmap && typeof (bitmap as ImageBitmap).close === "function") (bitmap as ImageBitmap).close();
    return { jpegBytes: bytes, width: canvas.width, height: canvas.height };
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
