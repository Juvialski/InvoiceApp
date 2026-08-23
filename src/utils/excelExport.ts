import * as XLSX from "xlsx";
import { Expense, InvoiceData, InvoiceProjectAllocation, PayrollEntry, PayrollPeriod, PayrollProjectAllocation, PayrollRun, Project, ProjectWorkerAssignment, Worker } from "../types";
import { buildExpenseReport, buildPayrollReport, buildProjectCostReport, buildProjectInvoiceReport } from "./projectReports";
import { CostPayrollRecord } from "./projectCosting";

function getColumnWidths(rows: unknown[][]) {
  const widths: { wch: number }[] = [];
  rows.forEach((row) => row.forEach((cell, index) => {
    const length = String(cell ?? "").length;
    widths[index] = { wch: Math.min(42, Math.max(widths[index]?.wch || 12, length + 3)) };
  }));
  return widths;
}

function vendorName(invoice: InvoiceData) {
  return invoice.vendor?.registeredName || invoice.vendor?.companyName || invoice.vendor?.name || "";
}

function taxRegistration(invoice: InvoiceData) {
  return invoice.vendor?.taxRegistration || invoice.philippineTaxDetails?.sellerRegistration || "UNKNOWN";
}

function invoiceRegisterRow(invoice: InvoiceData) {
  const tax = invoice.philippineTaxDetails || {};
  return {
    "Invoice Date": invoice.invoiceDate || "",
    "Invoice Number": invoice.invoiceNumber || "",
    "Invoice Type": invoice.invoiceSubtype || invoice.documentType || "INVOICE",
    "Vendor Registered Name": vendorName(invoice),
    "Vendor TIN": invoice.vendor?.taxId || "",
    "Project / Reference": invoice.projectReference || "",
    "VAT / Non-VAT": taxRegistration(invoice),
    Currency: invoice.currency || "",
    "VATable Sales": tax.vatableSales ?? "",
    "VAT Amount": tax.vatAmount ?? invoice.totalTax ?? "",
    "Zero-Rated Sales": tax.zeroRatedSales ?? "",
    "VAT-Exempt Sales": tax.vatExemptSales ?? "",
    Subtotal: invoice.subtotal,
    Discount: invoice.totalDiscount || 0,
    "Invoice Total": invoice.grandTotal,
    "Withholding Tax": invoice.withholdingTaxAmount ?? tax.withholdingTaxAmount ?? "",
    "Net Payable": invoice.netAmountPayable ?? tax.netAmountPayable ?? "",
    "Payment Status": invoice.status || "UNPAID",
    "Review Status": invoice.reviewStatus || "NEEDS_REVIEW",
    Source: invoice.sourceType || "UPLOAD",
    "Email Sender": invoice.sourceMetadata?.sender || "",
    "Email Subject": invoice.sourceMetadata?.subject || "",
    Confidence: invoice.confidenceScore ?? "",
  };
}

function lineItemRows(invoices: InvoiceData[]) {
  const rows: Record<string, string | number>[] = [];
  invoices.forEach((invoice) => (invoice.items || []).forEach((item, index) => rows.push({
    "Invoice Number": invoice.invoiceNumber || "",
    "Invoice Date": invoice.invoiceDate || "",
    "Vendor Registered Name": vendorName(invoice),
    "Vendor TIN": invoice.vendor?.taxId || "",
    "Item Number": item.itemNumber || index + 1,
    SKU: item.sku || "",
    Description: item.description || "",
    Quantity: item.quantity,
    "Unit / UOM": item.unitOfMeasure || "",
    "Unit Price": item.unitPrice,
    Discount: item.discount || 0,
    "Tax Rate %": item.taxRate || 0,
    "Tax Treatment": item.taxTreatment || "",
    "Tax Amount": item.taxAmount || 0,
    Amount: item.total,
    Currency: invoice.currency || "",
  })));
  return rows;
}

function vatRows(invoices: InvoiceData[]) {
  return invoices.map((invoice) => {
    const tax = invoice.philippineTaxDetails || {};
    return {
      "Invoice Number": invoice.invoiceNumber || "",
      "Invoice Date": invoice.invoiceDate || "",
      Vendor: vendorName(invoice),
      TIN: invoice.vendor?.taxId || "",
      Currency: invoice.currency || "",
      "VAT / Non-VAT": taxRegistration(invoice),
      "VATable Sales": tax.vatableSales ?? "",
      "VAT Amount": tax.vatAmount ?? invoice.totalTax ?? "",
      "Zero-Rated Sales": tax.zeroRatedSales ?? "",
      "VAT-Exempt Sales": tax.vatExemptSales ?? "",
      "Completeness Status": invoice.philippineInvoiceCompleteness?.status || "NOT_APPLICABLE",
      "Validation Status": invoice.validation?.status || "",
    };
  });
}

function vendorRows(invoices: InvoiceData[]) {
  const map = new Map<string, { "Vendor": string; "TIN": string; "VAT / Non-VAT": string; Location: string; "Invoice Count": number; "Total PHP Spend": number; "Latest Invoice": string; "Review Issues": number }>();
  invoices.forEach((invoice) => {
    const name = vendorName(invoice);
    const tin = invoice.vendor?.taxId || "";
    const key = tin ? `tin:${tin}` : `name:${name.toLowerCase()}`;
    const row = map.get(key) || {
      Vendor: name,
      TIN: tin,
      "VAT / Non-VAT": taxRegistration(invoice),
      Location: [invoice.vendor?.cityMunicipality || invoice.vendor?.city, invoice.vendor?.province || invoice.vendor?.state, invoice.vendor?.country].filter(Boolean).join(", "),
      "Invoice Count": 0,
      "Total PHP Spend": 0,
      "Latest Invoice": invoice.invoiceDate || "",
      "Review Issues": 0,
    };
    row["Invoice Count"] += 1;
    if (invoice.currency === "PHP") row["Total PHP Spend"] += Number(invoice.grandTotal) || 0;
    row["Review Issues"] += invoice.validation?.issues?.length || 0;
    if ((invoice.invoiceDate || "") > row["Latest Invoice"]) row["Latest Invoice"] = invoice.invoiceDate || "";
    map.set(key, row);
  });
  return Array.from(map.values());
}

function reviewRows(invoices: InvoiceData[]) {
  return invoices.map((invoice) => ({
    "Invoice Number": invoice.invoiceNumber || "",
    Vendor: vendorName(invoice),
    "Review Status": invoice.reviewStatus || "NEEDS_REVIEW",
    "Duplicate Status": invoice.duplicateStatus || "UNIQUE",
    "Confidence %": invoice.confidenceScore ?? "",
    "Validation Status": invoice.validation?.status || "",
    "Validation Flag Count": invoice.validation?.issues?.length || 0,
    "Validation Messages": (invoice.validation?.issues || []).map((issue) => issue.message).join(" | "),
    "PH Completeness": invoice.philippineInvoiceCompleteness?.status || "NOT_APPLICABLE",
    Source: invoice.sourceType || "UPLOAD",
    "Source Email": invoice.sourceMetadata?.sender || "",
    "Source Subject": invoice.sourceMetadata?.subject || "",
  }));
}

function appendJsonSheet(wb: XLSX.WorkBook, rows: Record<string, unknown>[], name: string) {
  const sheet = XLSX.utils.json_to_sheet(rows);
  sheet["!cols"] = getColumnWidths(XLSX.utils.sheet_to_json(sheet, { header: 1 }) as unknown[][]);
  XLSX.utils.book_append_sheet(wb, sheet, name);
}

function appendInvoiceDetails(wb: XLSX.WorkBook, invoice: InvoiceData) {
  const tax = invoice.philippineTaxDetails || {};
  const rows: unknown[][] = [
    ["INVOICE DETAILS", "", "", ""],
    ["Invoice Number", invoice.invoiceNumber, "Invoice Date", invoice.invoiceDate],
    ["Invoice Type", invoice.invoiceSubtype || invoice.documentType || "INVOICE", "Currency", invoice.currency || ""],
    ["Project / Reference", invoice.projectReference || "", "PO Number", invoice.purchaseOrderNumber || ""],
    ["Vendor Registered Name", vendorName(invoice), "Vendor TIN", invoice.vendor?.taxId || ""],
    ["VAT / Non-VAT", taxRegistration(invoice), "Review Status", invoice.reviewStatus || "NEEDS_REVIEW"],
    ["Subtotal", invoice.subtotal, "Invoice Total", invoice.grandTotal],
    ["VATable Sales", tax.vatableSales ?? "", "VAT Amount", tax.vatAmount ?? invoice.totalTax ?? ""],
    ["Zero-Rated Sales", tax.zeroRatedSales ?? "", "VAT-Exempt Sales", tax.vatExemptSales ?? ""],
    ["Discount", invoice.totalDiscount || 0, "Withholding Tax", invoice.withholdingTaxAmount ?? tax.withholdingTaxAmount ?? ""],
    ["Net Payable", invoice.netAmountPayable ?? tax.netAmountPayable ?? "", "Payment Status", invoice.status || "UNPAID"],
    ["TIN / branch", [invoice.vendor?.taxId, invoice.vendor?.branchCode].filter(Boolean).join(" / "), "ATP / OCN", [tax.authorityToPrintNumber, tax.outboundCorrespondenceNumber].filter(Boolean).join(" / ")],
  ];
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  sheet["!cols"] = getColumnWidths(rows);
  XLSX.utils.book_append_sheet(wb, sheet, "Invoice Details");
}

export function exportSingleInvoiceToExcel(invoice: InvoiceData) {
  const wb = XLSX.utils.book_new();
  appendInvoiceDetails(wb, invoice);
  appendJsonSheet(wb, lineItemRows([invoice]), "Line Items");
  appendJsonSheet(wb, vatRows([invoice]), "VAT Summary");
  appendJsonSheet(wb, vendorRows([invoice]), "Vendors");
  appendJsonSheet(wb, reviewRows([invoice]), "Review & Validation");
  const cleanInvNum = (invoice.invoiceNumber || "Invoice").replace(/[^a-zA-Z0-9-_]/g, "_");
  XLSX.writeFile(wb, `${cleanInvNum}_${invoice.invoiceDate || new Date().toISOString().slice(0, 10)}.xlsx`);
}

export function exportBatchInvoicesToExcel(invoices: InvoiceData[], customFileName?: string) {
  if (!invoices?.length) return;
  const wb = XLSX.utils.book_new();
  appendJsonSheet(wb, invoices.map(invoiceRegisterRow), "Invoice Register");
  appendJsonSheet(wb, lineItemRows(invoices), "Line Items");
  appendJsonSheet(wb, vatRows(invoices), "VAT Summary");
  appendJsonSheet(wb, vendorRows(invoices), "Vendors");
  appendJsonSheet(wb, reviewRows(invoices), "Review & Validation");
  const dateStr = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, customFileName || `Invoice_Register_${invoices.length}_${dateStr}.xlsx`);
}

function csvValue(value: unknown) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function downloadCsv(rows: Record<string, unknown>[], fileName: string) {
  const headers = Object.keys(rows[0] || {});
  const csv = [headers, ...rows.map((row) => headers.map((header) => row[header]))].map((row) => row.map(csvValue).join(",")).join("\n");
  const link = document.createElement("a");
  link.href = `data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export function exportInvoiceLineItemsToCSV(invoice: InvoiceData) {
  const tax = invoice.philippineTaxDetails || {};
  const rows = (invoice.items || []).map((item, index) => ({
    "Invoice Number": invoice.invoiceNumber || "",
    "Invoice Date": invoice.invoiceDate || "",
    "Invoice Type": invoice.invoiceSubtype || invoice.documentType || "INVOICE",
    "Vendor Registered Name": vendorName(invoice),
    "Vendor TIN": invoice.vendor?.taxId || "",
    "VAT / Non-VAT": taxRegistration(invoice),
    Currency: invoice.currency || "",
    "VATable Sales": tax.vatableSales ?? "",
    "VAT Amount": tax.vatAmount ?? invoice.totalTax ?? "",
    "Zero-Rated Sales": tax.zeroRatedSales ?? "",
    "VAT-Exempt Sales": tax.vatExemptSales ?? "",
    "Item Number": item.itemNumber || index + 1,
    SKU: item.sku || "",
    Description: item.description || "",
    Quantity: item.quantity,
    "Unit / UOM": item.unitOfMeasure || "",
    "Unit Price": item.unitPrice,
    Discount: item.discount || 0,
    "Tax Treatment": item.taxTreatment || "",
    Amount: item.total,
    "Invoice Total": invoice.grandTotal,
    "Withholding Tax": invoice.withholdingTaxAmount ?? tax.withholdingTaxAmount ?? "",
    "Net Payable": invoice.netAmountPayable ?? tax.netAmountPayable ?? "",
    "Payment Status": invoice.status || "UNPAID",
    "Review Status": invoice.reviewStatus || "NEEDS_REVIEW",
    Source: invoice.sourceType || "UPLOAD",
    "Email Sender": invoice.sourceMetadata?.sender || "",
    "Email Subject": invoice.sourceMetadata?.subject || "",
    Confidence: invoice.confidenceScore ?? "",
  }));
  downloadCsv(rows.length ? rows : [invoiceRegisterRow(invoice)], `Invoice_${invoice.invoiceNumber || "export"}.csv`);
}

export function exportInvoiceRegisterToCSV(invoices: InvoiceData[]) {
  if (!invoices?.length) return;
  downloadCsv(invoices.map(invoiceRegisterRow), `Invoice_Register_${new Date().toISOString().slice(0, 10)}.csv`);
}

export interface EngineeringWorkbookInput {
  projects: Project[];
  invoices: InvoiceData[];
  invoiceAllocations: InvoiceProjectAllocation[];
  expenses: Expense[];
  workers: Worker[];
  assignments: ProjectWorkerAssignment[];
  periods: PayrollPeriod[];
  runs: PayrollRun[];
  entries: PayrollEntry[];
  payrollAllocations: PayrollProjectAllocation[];
}

/** Keeps the existing invoice workbook intact while adding a separate project-cost workbook. */
export function exportEngineeringProjectWorkbookToExcel(input: EngineeringWorkbookInput, customFileName?: string) {
  const payroll: CostPayrollRecord[] = input.runs.map((run) => ({ id: run.id, status: run.status, allocations: input.payrollAllocations.filter((allocation) => input.entries.some((entry) => entry.id === allocation.payrollEntryId && entry.payrollRunId === run.id)) }));
  const workbook = XLSX.utils.book_new();
  appendJsonSheet(workbook, input.projects.map((project) => ({ "Project Code": project.projectCode, "Project Name": project.projectName, Client: project.clientName || "", Location: project.location || "", Status: project.status, Budget: project.projectBudget, Currency: project.currency })), "Projects");
  appendJsonSheet(workbook, buildProjectInvoiceReport(input.projects, input.invoices, input.invoiceAllocations), "Invoice Allocations");
  appendJsonSheet(workbook, buildPayrollReport(input.projects, input.workers, input.periods, input.runs, input.entries, input.payrollAllocations), "Payroll Allocations");
  appendJsonSheet(workbook, buildExpenseReport(input.projects, input.expenses), "Expenses");
  appendJsonSheet(workbook, buildProjectCostReport(input.projects, input.invoices, input.invoiceAllocations, payroll, input.expenses).map((row) => ({ ...row })), "Project Cost Summary");
  appendJsonSheet(workbook, input.workers.map((worker) => ({ "Employee Code": worker.employeeCode, Name: worker.displayName, Role: worker.jobTitle || "", "Employment Type": worker.employmentType, "Pay Type": worker.defaultPayType, "Default Rate": worker.defaultRate, Active: worker.active })), "Workers");
  const dateStr = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(workbook, customFileName || `Engineering_Project_Costs_${dateStr}.xlsx`);
}
