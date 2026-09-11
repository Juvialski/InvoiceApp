import assert from "node:assert/strict";
import test from "node:test";
import { amountInWords, buildClientInvoicePdf, buildPurchaseOrderPdf, type ClientInvoiceDocumentSnapshot, type PdfImage, type PurchaseOrderDocumentSnapshot } from "../src/lib/documentGeneration.ts";

const image: PdfImage = { width: 640, height: 120, rgbBytes: new Uint8Array(640 * 120 * 3).fill(32) };

function purchaseOrder(): PurchaseOrderDocumentSnapshot {
  const lines = Array.from({ length: 30 }, (_, index) => ({
    lineNumber: index + 1,
    description: `Long synthetic item ${index + 1} ${"with repeated installation and inspection requirements ".repeat(5)}`,
    quantity: index + 1,
    unit: index % 2 ? "bags" : "m",
    unitPrice: 10_000 + index,
    amount: (index + 1) * (10_000 + index),
  }));
  const totalAmount = lines.reduce((sum, line) => sum + line.amount, 0);
  return {
    documentType: "PURCHASE_ORDER", documentNumber: "PO-FIDELITY-LONG-0001", status: "ISSUED", issueDate: "2026-09-11", currency: "PHP",
    company: { legalName: "A Very Long Company Legal Name for Header Centering and Logo Separation", address: "A long address that must wrap safely without escaping the page", email: "qa@example.invalid" },
    supplier: { name: "A Long Supplier Name", address: "A long supplier address", attention: "Procurement and logistics team" },
    project: { projectCode: "QA-LONG-PROJECT", projectName: "Long project name", deliverTo: "Long delivery address" },
    lines, totalAmount, amountInWords: amountInWords(totalAmount, "PHP"), notes: "Long notes", termsAndConditions: "Long terms", processor: { name: "QA" }, templateVersion: "test",
  };
}

function clientInvoice(): ClientInvoiceDocumentSnapshot {
  const lines = Array.from({ length: 28 }, (_, index) => ({ lineNumber: index + 1, description: `Long invoice item ${index + 1} ${"progress billing description ".repeat(8)}`, amount: 2_000 + index * 10 }));
  const subtotal = lines.reduce((sum, line) => sum + line.amount, 0);
  return {
    documentType: "CLIENT_INVOICE", documentNumber: "CI-FIDELITY-LONG-0001", status: "ISSUED", invoiceDate: "2026-09-11", dueDate: "2026-10-11", currency: "USD",
    company: { legalName: "A Very Long Company Legal Name for Header Centering and Logo Separation", address: "A long address that must wrap safely without escaping the page", email: "qa@example.invalid" },
    project: { projectCode: "QA-LONG-PROJECT", projectName: "Long project name" }, billTo: { name: "A Long Client Name", email: "client@example.invalid", address: "A long billing address" },
    lines, subtotal, taxAmount: subtotal * 0.12, totalAmount: subtotal * 1.12, amountInWords: amountInWords(subtotal * 1.12, "USD"), notes: "Long notes", termsAndConditions: "Long terms", processor: { name: "QA" }, templateVersion: "test",
  };
}

function pageCount(bytes: Uint8Array) {
  return (new TextDecoder().decode(bytes).match(/\/Type \/Page \/Parent/g) || []).length;
}

function textCoordinates(bytes: Uint8Array) {
  const source = new TextDecoder().decode(bytes);
  return [...source.matchAll(/1 0 0 1 (-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?) Tm/g)].map((match) => ({
    x: Number(match[1]),
    y: Number(match[2]),
  }));
}

test("programmatic PDF torture cases paginate long PO/invoice content without invalid output", () => {
  const po = buildPurchaseOrderPdf(purchaseOrder(), image);
  const invoice = buildClientInvoicePdf(clientInvoice(), image);
  assert.match(new TextDecoder().decode(po), /^%PDF-1\.4/);
  assert.match(new TextDecoder().decode(invoice), /^%PDF-1\.4/);
  assert.ok(pageCount(po) >= 3);
  assert.ok(pageCount(invoice) >= 3);
  assert.match(new TextDecoder().decode(po), /\/Subtype \/Image/);
  assert.doesNotMatch(new TextDecoder().decode(po), /\/Filter \/DCTDecode/);
});

test("PDF title and document-number geometry use the shared renderer contract", () => {
  const source = new TextDecoder().decode(buildPurchaseOrderPdf(purchaseOrder()));
  assert.match(source, /PURCHASE ORDER/);
  assert.match(source, /PO-FIDELITY-LONG-0001/);
  assert.match(source, /\/MediaBox \[0 0 595 842\]/);
});

test("edge-case PO and invoice content remains inside the PDF media box", () => {
  const poLines = [{
    lineNumber: 1,
    description: "A single item with a long description and a deliberately long unit label.",
    quantity: 999999,
    unit: "kilowatt-hours-per-square-meter-installed",
    unitPrice: 987654321.99,
    amount: 987654321.99,
  }];
  const poAmount = poLines[0].amount;
  const po = buildPurchaseOrderPdf({
    documentType: "PURCHASE_ORDER",
    documentNumber: `PO-${"EXTREMELY-LONG-DOCUMENT-NUMBER-".repeat(5)}`,
    status: "DRAFT",
    currency: "EUR",
    company: { legalName: "Short Company", address: "", contactNumber: "", email: "" },
    supplier: { name: "", address: "", email: "", phone: "", vatTin: "", attention: "" },
    project: { projectCode: "", projectName: "", deliverTo: "" },
    lines: poLines,
    totalAmount: poAmount,
    amountInWords: amountInWords(poAmount, "EUR"),
    processor: { name: "QA" },
    templateVersion: "edge-case",
  });

  const invoiceLines = [{
    lineNumber: 1,
    description: "One invoice line with a supported non-PHP currency and a large amount.",
    quantity: 123456,
    unit: "service-hours-per-installation-phase",
    amount: 987654321.99,
  }];
  const invoice = buildClientInvoicePdf({
    documentType: "CLIENT_INVOICE",
    documentNumber: `CI-${"LONG-".repeat(28)}`,
    status: "DRAFT",
    currency: "USD",
    company: { legalName: "", address: "", contactNumber: "", email: "", paymentInstructions: "" },
    project: { projectCode: "", projectName: "" },
    billTo: { name: "", contactName: "", email: "", address: "", reference: "" },
    lines: invoiceLines,
    subtotal: invoiceLines[0].amount,
    totalAmount: invoiceLines[0].amount,
    amountInWords: amountInWords(invoiceLines[0].amount, "USD"),
    notes: "",
    termsAndConditions: "",
    processor: { name: "QA" },
    templateVersion: "edge-case",
  });

  for (const bytes of [po, invoice]) {
    assert.match(new TextDecoder().decode(bytes), /^%PDF-1\.4/);
    assert.ok(pageCount(bytes) >= 1);
    for (const coordinate of textCoordinates(bytes)) {
      assert.ok(coordinate.x >= -0.01 && coordinate.x <= 595.01, `text x-coordinate escaped media box: ${coordinate.x}`);
      assert.ok(coordinate.y >= -0.01 && coordinate.y <= 842.01, `text y-coordinate escaped media box: ${coordinate.y}`);
    }
  }
  const poSource = new TextDecoder().decode(po);
  const invoiceSource = new TextDecoder().decode(invoice);
  assert.match(poSource, /kilowatt/);
  assert.match(poSource, /meter-in/);
  assert.match(poSource, /EUR 987654321\.99/);
  assert.match(invoiceSource, /service/);
  assert.match(invoiceSource, /installa/);
  assert.match(invoiceSource, /USD 987654321\.99/);
});
