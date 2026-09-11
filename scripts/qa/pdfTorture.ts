import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";
import { amountInWords, buildClientInvoicePdf, buildPurchaseOrderPdf, type ClientInvoiceDocumentSnapshot, type PdfImage, type PurchaseOrderDocumentSnapshot } from "../../src/lib/documentGeneration.ts";
import { loadServerPdfLogo } from "../../src/server/documentPdfLogo.ts";

const execFile = promisify(execFileCallback);
const OUTPUT_DIR = path.resolve(process.env.LOCAL_QA_PDF_OUTPUT_DIR || "artifacts/local-qa/pdf-torture");
const image = (width: number, height: number, color: [number, number, number]): PdfImage => {
  const rgbBytes = new Uint8Array(width * height * 3);
  for (let index = 0; index < rgbBytes.length; index += 3) {
    rgbBytes[index] = color[0];
    rgbBytes[index + 1] = color[1];
    rgbBytes[index + 2] = color[2];
  }
  return { rgbBytes, width, height };
};

const longCompanyName = "HydroQualiSense Solutions Corporation - North Treatment Infrastructure and Environmental Services Division";
const longAddress = "01 Pasong Tulo, Santa Rita Bata, San Miguel, Bulacan, Philippines - Engineering and document operations office, Building 4, second floor";
const longTerms = "Payment remains subject to the authoritative project, procurement, billing, collection, and settlement records. This deliberately long synthetic clause tests wrapping, continuation pages, section spacing, and footer boundaries without changing financial authority. ".repeat(7).trim();
const longNotes = "Synthetic QA note for PDF fidelity torture testing: retain every line, keep the source snapshot immutable, and never allow the note to cross a border or disappear at a page break. ".repeat(4).trim();

function purchaseOrderSnapshot(): PurchaseOrderDocumentSnapshot {
  const lines = Array.from({ length: 34 }, (_, index) => ({
    lineNumber: index + 1,
    description: index === 4
      ? `Extremely long item description ${"with deliberately repeated specification language and field installation constraints ".repeat(8)}`
      : `Synthetic material ${index + 1}: high-density piping, fittings, testing, delivery coordination, and acceptance documentation for the long project code QA-TORTURE-${index + 1}`,
    quantity: 100 + index * 7,
    unit: index % 3 === 0 ? "m" : index % 3 === 1 ? "bags" : "pcs",
    unitPrice: 12_345.67 + index * 987.65,
    amount: (100 + index * 7) * (12_345.67 + index * 987.65),
  }));
  const totalAmount = lines.reduce((sum, line) => sum + line.amount, 0);
  return {
    documentType: "PURCHASE_ORDER",
    documentNumber: "PO-QA-TORTURE-VERY-LONG-2026-0001",
    status: "ISSUED",
    issueDate: "2026-09-11",
    currency: "PHP",
    description: longNotes,
    notes: longNotes,
    termsAndConditions: longTerms,
    company: { legalName: longCompanyName, address: longAddress, contactNumber: "+63 976 072 1144", email: "hydroqualisensesolutions@example.invalid", vatTin: "777-823-517-000" },
    supplier: { name: "A Very Long Supplier Legal Name for Industrial and Environmental Equipment Procurement Corporation", address: longAddress, attention: "Accounts Payable and Logistics Coordination Team", vatTin: "123-456-789-000" },
    project: { projectCode: "QA-TORTURE-PROJECT-CODE-2026-VERY-LONG", projectName: "North Treatment Plant Upgrade and Pipeline Rehabilitation - Long Project Name", deliverTo: `${longAddress} - delivery gate 7, receiving bay B` },
    lines,
    totalAmount,
    amountInWords: amountInWords(totalAmount, "PHP"),
    processor: { name: "QA PDF Fidelity Operator", title: "Document Control and Verification" },
    templateVersion: "QA-TORTURE-PO-FALLBACK",
  };
}

function clientInvoiceSnapshot(): ClientInvoiceDocumentSnapshot {
  const lines = Array.from({ length: 31 }, (_, index) => ({
    lineNumber: index + 1,
    description: index === 7
      ? `Long invoice description ${"covering design coordination, site verification, testing records, and completion evidence ".repeat(9)}`
      : `Synthetic progress billing item ${index + 1} for the long project name, including measurement review, delivery evidence, and client acceptance support.`,
    amount: 8_765.43 + index * 543.21,
  }));
  const subtotal = lines.reduce((sum, line) => sum + line.amount, 0);
  return {
    documentType: "CLIENT_INVOICE",
    documentNumber: "CI-QA-TORTURE-VERY-LONG-2026-0001",
    status: "ISSUED",
    invoiceDate: "2026-09-11",
    dueDate: "2026-10-11",
    paymentTerms: "Thirty calendar days after accepted invoice and supporting progress evidence",
    currency: "USD",
    taxTreatment: "VAT",
    company: { legalName: longCompanyName, address: longAddress, contactNumber: "+63 976 072 1144", email: "hydroqualisensesolutions@example.invalid", paymentInstructions: longNotes },
    project: { projectCode: "QA-TORTURE-PROJECT-CODE-2026-VERY-LONG", projectName: "North Treatment Plant Upgrade and Pipeline Rehabilitation - Long Project Name" },
    billTo: { name: "A Very Long Client Legal Name for Water Treatment and Environmental Infrastructure Holdings Corporation", contactName: "Client Accounts Payable and Commercial Review Department", email: "client.accounts@example.invalid", address: longAddress, reference: "Contract QA-TORTURE-REFERENCE-2026-0001" },
    lines,
    subtotal,
    taxAmount: subtotal * 0.12,
    taxLabel: "VAT 12%",
    totalAmount: subtotal * 1.12,
    amountInWords: amountInWords(subtotal * 1.12, "USD"),
    notes: longNotes,
    termsAndConditions: longTerms,
    processor: { name: "QA PDF Fidelity Operator", title: "Document Control and Verification" },
    templateVersion: "QA-TORTURE-INVOICE-FALLBACK",
  };
}

function minimalPurchaseOrderSnapshot(): PurchaseOrderDocumentSnapshot {
  const amount = 125_000;
  return {
    documentType: "PURCHASE_ORDER",
    documentNumber: "PO-MINIMAL-0001",
    status: "DRAFT",
    currency: "PHP",
    company: { legalName: "Short Company", address: "", contactNumber: "", email: "" },
    supplier: { name: "", address: "", email: "", phone: "", vatTin: "", attention: "" },
    project: { projectCode: "", projectName: "", deliverTo: "" },
    lines: [{ lineNumber: 1, description: "Single line item", quantity: 1, unit: "ea", unitPrice: amount, amount }],
    totalAmount: amount,
    amountInWords: amountInWords(amount, "PHP"),
    processor: { name: "QA" },
    templateVersion: "QA-MINIMAL-PO",
  };
}

function minimalClientInvoiceSnapshot(): ClientInvoiceDocumentSnapshot {
  const amount = 125_000;
  return {
    documentType: "CLIENT_INVOICE",
    documentNumber: "CI-MINIMAL-0001",
    status: "DRAFT",
    currency: "PHP",
    company: { legalName: "Short Company", address: "", contactNumber: "", email: "", paymentInstructions: "" },
    project: { projectCode: "", projectName: "" },
    billTo: { name: "", contactName: "", email: "", address: "", reference: "" },
    lines: [{ lineNumber: 1, description: "Single invoice line", amount }],
    subtotal: amount,
    totalAmount: amount,
    amountInWords: amountInWords(amount, "PHP"),
    notes: "",
    termsAndConditions: "",
    processor: { name: "QA" },
    templateVersion: "QA-MINIMAL-INVOICE",
  };
}

function edgePurchaseOrderSnapshot(): PurchaseOrderDocumentSnapshot {
  const amount = 987_654_321.99;
  return {
    documentType: "PURCHASE_ORDER",
    documentNumber: `PO-${"EXTREMELY-LONG-DOCUMENT-NUMBER-".repeat(3)}`,
    status: "DRAFT",
    currency: "EUR",
    company: { legalName: "Short Company", address: "", contactNumber: "", email: "" },
    supplier: { name: "", address: "", email: "", phone: "", vatTin: "", attention: "" },
    project: { projectCode: "", projectName: "", deliverTo: "" },
    lines: [{ lineNumber: 1, description: "Single item with a long unit label", quantity: 999999, unit: "kilowatt-hours-per-square-meter-installed", unitPrice: amount, amount }],
    totalAmount: amount,
    amountInWords: amountInWords(amount, "EUR"),
    processor: { name: "QA" },
    templateVersion: "QA-EDGE-PO",
  };
}

function edgeClientInvoiceSnapshot(): ClientInvoiceDocumentSnapshot {
  const amount = 987_654_321.99;
  return {
    documentType: "CLIENT_INVOICE",
    documentNumber: `CI-${"LONG-".repeat(20)}`,
    status: "DRAFT",
    currency: "USD",
    company: { legalName: "", address: "", contactNumber: "", email: "", paymentInstructions: "" },
    project: { projectCode: "", projectName: "" },
    billTo: { name: "", contactName: "", email: "", address: "", reference: "" },
    lines: [{ lineNumber: 1, description: "Single line with a long unit label", quantity: 123456, unit: "service-hours-per-installation-phase", amount }],
    subtotal: amount,
    totalAmount: amount,
    amountInWords: amountInWords(amount, "USD"),
    notes: "",
    termsAndConditions: "",
    processor: { name: "QA" },
    templateVersion: "QA-EDGE-INVOICE",
  };
}

async function renderPdf(name: string, bytes: Uint8Array) {
  const filePath = path.join(OUTPUT_DIR, `${name}.pdf`);
  const prefix = path.join(OUTPUT_DIR, `${name}-page`);
  await fs.writeFile(filePath, bytes);
  const existing = await fs.readdir(OUTPUT_DIR);
  for (const file of existing) {
    if (!file.startsWith(`${name}-page`) || !file.endsWith(".png")) continue;
    await fs.unlink(path.join(OUTPUT_DIR, file));
  }
  await execFile("pdftoppm", ["-png", "-r", "120", filePath, prefix], { cwd: process.cwd() });
  const info = await execFile("pdfinfo", [filePath], { cwd: process.cwd() });
  const pageCount = Number(/^Pages:\s+(\d+)/m.exec(info.stdout)?.[1] || 0);
  const files = await fs.readdir(OUTPUT_DIR);
  const renderedPages = files.filter((file) => file.startsWith(`${name}-page-`) && file.endsWith(".png")).length;
  if (!pageCount || renderedPages !== pageCount) throw new Error(`${name}: PDF page render count mismatch.`);
  return { name, filePath, pageCount, renderedPages, sha256: createHash("sha256").update(bytes).digest("hex") };
}

async function main() {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  const transparentLogo = await loadServerPdfLogo("brand/hydroqualisense-po-logo.png");
  if (!transparentLogo) throw new Error("The transparent QA logo asset could not be decoded for PDF visual certification.");
  const normalLogo = image(280, 120, [20, 70, 150]);
  const wideLogo = image(640, 120, [20, 70, 150]);
  const tallLogo = image(120, 640, [15, 150, 210]);
  const cases = [
    { name: "purchase-order-minimal-no-logo", documentType: "PURCHASE_ORDER", logo: "none", bytes: buildPurchaseOrderPdf(minimalPurchaseOrderSnapshot()) },
    { name: "purchase-order-normal-logo", documentType: "PURCHASE_ORDER", logo: "normal", bytes: buildPurchaseOrderPdf(minimalPurchaseOrderSnapshot(), normalLogo) },
    { name: "purchase-order-edge-units-and-amounts", documentType: "PURCHASE_ORDER", logo: "none", bytes: buildPurchaseOrderPdf(edgePurchaseOrderSnapshot()) },
    { name: "purchase-order-wide-logo", documentType: "PURCHASE_ORDER", logo: "wide", bytes: buildPurchaseOrderPdf(purchaseOrderSnapshot(), wideLogo) },
    { name: "purchase-order-tall-logo", documentType: "PURCHASE_ORDER", logo: "tall", bytes: buildPurchaseOrderPdf(purchaseOrderSnapshot(), tallLogo) },
    { name: "purchase-order-transparent-logo", documentType: "PURCHASE_ORDER", logo: "transparent-normalized", bytes: buildPurchaseOrderPdf(purchaseOrderSnapshot(), transparentLogo) },
    { name: "client-invoice-minimal-no-logo", documentType: "CLIENT_INVOICE", logo: "none", bytes: buildClientInvoicePdf(minimalClientInvoiceSnapshot()) },
    { name: "client-invoice-normal-logo", documentType: "CLIENT_INVOICE", logo: "normal", bytes: buildClientInvoicePdf(minimalClientInvoiceSnapshot(), normalLogo) },
    { name: "client-invoice-edge-units-and-amounts", documentType: "CLIENT_INVOICE", logo: "none", bytes: buildClientInvoicePdf(edgeClientInvoiceSnapshot()) },
    { name: "client-invoice-wide-logo", documentType: "CLIENT_INVOICE", logo: "wide", bytes: buildClientInvoicePdf(clientInvoiceSnapshot(), wideLogo) },
    { name: "client-invoice-tall-logo", documentType: "CLIENT_INVOICE", logo: "tall", bytes: buildClientInvoicePdf(clientInvoiceSnapshot(), tallLogo) },
    { name: "client-invoice-transparent-logo", documentType: "CLIENT_INVOICE", logo: "transparent-normalized", bytes: buildClientInvoicePdf(clientInvoiceSnapshot(), transparentLogo) },
  ] as const;
  const results = [
    ...await Promise.all(cases.map(async (item) => ({ ...item, ...(await renderPdf(item.name, item.bytes)) }))),
  ];
  await fs.writeFile(path.join(OUTPUT_DIR, "manifest.json"), `${JSON.stringify({ schemaVersion: 2, cases: results }, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(results.map(({ name, documentType, logo, pageCount, renderedPages, sha256 }) => ({ name, documentType, logo, pageCount, renderedPages, sha256 }))));
}

void main();
