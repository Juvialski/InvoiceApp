import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";
import { amountInWords, buildClientInvoicePdf, buildPurchaseOrderPdf, type ClientInvoiceDocumentSnapshot, type PdfImage, type PurchaseOrderDocumentSnapshot } from "../../src/lib/documentGeneration.ts";

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

async function renderPdf(name: string, bytes: Uint8Array) {
  const filePath = path.join(OUTPUT_DIR, `${name}.pdf`);
  const prefix = path.join(OUTPUT_DIR, `${name}-page`);
  await fs.writeFile(filePath, bytes);
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
  const results = [
    await renderPdf("purchase-order-torture", buildPurchaseOrderPdf(purchaseOrderSnapshot(), image(640, 120, [20, 70, 150]))),
    await renderPdf("client-invoice-torture", buildClientInvoicePdf(clientInvoiceSnapshot(), image(120, 640, [15, 150, 210]))),
  ];
  await fs.writeFile(path.join(OUTPUT_DIR, "manifest.json"), `${JSON.stringify({ schemaVersion: 1, cases: results }, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(results.map(({ name, pageCount, renderedPages, sha256 }) => ({ name, pageCount, renderedPages, sha256 }))));
}

void main();
