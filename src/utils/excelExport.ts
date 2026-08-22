import * as XLSX from "xlsx";
import { InvoiceData } from "../types";

/**
 * Calculates optimal column widths based on cell content lengths
 */
function getColumnWidths(data: (string | number | undefined)[][]) {
  const colWidths: { wch: number }[] = [];
  data.forEach((row) => {
    row.forEach((cell, colIndex) => {
      const cellLength = cell ? String(cell).length : 0;
      if (!colWidths[colIndex]) {
        colWidths[colIndex] = { wch: Math.max(cellLength + 3, 12) };
      } else {
        colWidths[colIndex].wch = Math.max(colWidths[colIndex].wch, cellLength + 3, 12);
      }
    });
  });
  return colWidths;
}

/**
 * Exports a single detailed invoice to a beautifully structured Excel file (.xlsx)
 */
export function exportSingleInvoiceToExcel(invoice: InvoiceData) {
  const wb = XLSX.utils.book_new();

  // Build 2D array for the invoice worksheet
  const rows: (string | number | undefined)[][] = [];

  // Title header
  rows.push(["SALES INVOICE DETAILS", "", "", "", "", "", ""]);
  rows.push(["Extracted with Gemini AI", "", "", "", "", "", ""]);
  rows.push(["Source:", invoice.sourceType || "UPLOAD", "", "", "Review Status:", invoice.reviewStatus || "NEEDS_REVIEW"]);
  rows.push(["Model:", invoice.modelUsed || "", "", "", "Category:", invoice.category || "Uncategorized"]);
  rows.push([]);

  // Invoice Metadata
  rows.push(["INVOICE INFORMATION", "", "", "", "FINANCIAL SUMMARY", ""]);
  rows.push(["Invoice Number:", invoice.invoiceNumber, "", "", "Subtotal:", `${invoice.currencySymbol || ""}${invoice.subtotal.toFixed(2)} ${invoice.currency}`]);
  rows.push(["Invoice Date:", invoice.invoiceDate, "", "", "Total Discount:", `${invoice.currencySymbol || ""}${(invoice.totalDiscount || 0).toFixed(2)}`]);
  rows.push(["Due Date:", invoice.dueDate || "N/A", "", "", "Total Tax / VAT:", `${invoice.currencySymbol || ""}${invoice.totalTax.toFixed(2)}`]);
  rows.push(["PO Number:", invoice.purchaseOrderNumber || "N/A", "", "", "Shipping / Fees:", `${invoice.currencySymbol || ""}${((invoice.shippingFee || 0) + (invoice.otherFees || 0)).toFixed(2)}`]);
  rows.push(["Currency:", invoice.currency, "", "", "GRAND TOTAL:", `${invoice.currencySymbol || ""}${invoice.grandTotal.toFixed(2)} ${invoice.currency}`]);
  rows.push(["Payment Terms:", invoice.paymentTerms || "N/A", "", "", "Amount Paid:", `${invoice.currencySymbol || ""}${(invoice.amountPaid || 0).toFixed(2)}`]);
  rows.push(["Status:", invoice.status || "UNPAID", "", "", "BALANCE DUE:", `${invoice.currencySymbol || ""}${(invoice.balanceDue ?? invoice.grandTotal).toFixed(2)} ${invoice.currency}`]);
  rows.push([]);

  // Parties Information
  rows.push(["VENDOR / SELLER DETAILS", "", "", "", "CUSTOMER / BUYER DETAILS", ""]);
  rows.push(["Business Name:", invoice.vendor?.companyName || invoice.vendor?.name || "N/A", "", "", "Client Name:", invoice.customer?.companyName || invoice.customer?.name || "N/A"]);
  rows.push(["Tax ID / VAT:", invoice.vendor?.taxId || "N/A", "", "", "Customer Tax ID:", invoice.customer?.taxId || "N/A"]);
  rows.push(["Street Address:", invoice.vendor?.address || "N/A", "", "", "Billing Address:", invoice.customer?.address || "N/A"]);
  rows.push(["City / State / Postal:", `${invoice.vendor?.city || ""} ${invoice.vendor?.state || ""} ${invoice.vendor?.postalCode || ""}`.trim() || "N/A", "", "", "City / State / Postal:", `${invoice.customer?.city || ""} ${invoice.customer?.state || ""} ${invoice.customer?.postalCode || ""}`.trim() || "N/A"]);
  rows.push(["Country:", invoice.vendor?.country || "N/A", "", "", "Country:", invoice.customer?.country || "N/A"]);
  rows.push(["Email:", invoice.vendor?.email || "N/A", "", "", "Email:", invoice.customer?.email || "N/A"]);
  rows.push(["Phone:", invoice.vendor?.phone || "N/A", "", "", "Phone:", invoice.customer?.phone || "N/A"]);
  rows.push(["Website:", invoice.vendor?.website || "N/A", "", "", "", ""]);
  rows.push([]);

  // Line Items Section
  rows.push(["LINE ITEMS BREAKDOWN", "", "", "", "", "", "", ""]);
  rows.push([
    "Item #",
    "SKU / Code",
    "Description",
    "Quantity",
    `Unit Price (${invoice.currency})`,
    "Discount",
    "Tax Rate (%)",
    `Total Amount (${invoice.currency})`,
  ]);

  invoice.items.forEach((item, index) => {
    rows.push([
      item.itemNumber || index + 1,
      item.sku || "-",
      item.description,
      item.quantity,
      item.unitPrice,
      item.discount || 0,
      item.taxRate ? `${item.taxRate}%` : "0%",
      item.total,
    ]);
  });

  rows.push([]);
  rows.push(["", "", "", "", "", "", "Subtotal:", invoice.subtotal]);
  if (invoice.totalDiscount) {
    rows.push(["", "", "", "", "", "", "Discount:", -invoice.totalDiscount]);
  }
  rows.push(["", "", "", "", "", "", "Total Tax:", invoice.totalTax]);
  if (invoice.shippingFee) {
    rows.push(["", "", "", "", "", "", "Shipping Fee:", invoice.shippingFee]);
  }
  rows.push(["", "", "", "", "", "", "GRAND TOTAL:", invoice.grandTotal]);
  rows.push([]);

  // Notes & Payment Terms
  if (invoice.notes || invoice.termsAndConditions) {
    rows.push(["ADDITIONAL NOTES & TERMS", ""]);
    if (invoice.notes) rows.push(["Notes:", invoice.notes]);
    if (invoice.termsAndConditions) rows.push(["Terms & Conditions:", invoice.termsAndConditions]);
    rows.push([]);
  }

  // Create sheet
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = getColumnWidths(rows);

  XLSX.utils.book_append_sheet(wb, ws, "Invoice Details");

  // Also append a pure Line Items Raw Data sheet for easy pivot/formulas
  const rawItemsData = invoice.items.map((item, idx) => ({
    "Invoice #": invoice.invoiceNumber,
    "Invoice Date": invoice.invoiceDate,
    "Item #": item.itemNumber || idx + 1,
    "SKU": item.sku || "",
    "Description": item.description,
    "Quantity": item.quantity,
    "Unit Price": item.unitPrice,
    "Discount": item.discount || 0,
    "Tax Rate %": item.taxRate || 0,
    "Tax Amount": item.taxAmount || 0,
    "Total": item.total,
    "Currency": invoice.currency,
  }));
  const wsItems = XLSX.utils.json_to_sheet(rawItemsData);
  XLSX.utils.book_append_sheet(wb, wsItems, "Line Items Table");

  // Trigger download
  const cleanInvNum = (invoice.invoiceNumber || "Invoice").replace(/[^a-zA-Z0-9-_]/g, "_");
  const fileName = `${cleanInvNum}_${invoice.invoiceDate || new Date().toISOString().slice(0, 10)}.xlsx`;
  XLSX.writeFile(wb, fileName);
}

/**
 * Exports multiple invoices into a single comprehensive Excel Workbook
 */
export function exportBatchInvoicesToExcel(invoices: InvoiceData[], customFileName?: string) {
  if (!invoices || invoices.length === 0) return;

  const wb = XLSX.utils.book_new();

  // Sheet 1: Invoices Master Summary
  const summaryData = invoices.map((inv) => ({
    "Invoice #": inv.invoiceNumber,
    "Invoice Date": inv.invoiceDate,
    "Due Date": inv.dueDate || "",
    "PO Number": inv.purchaseOrderNumber || "",
    "Status": inv.status || "UNPAID",
    "Vendor Name": inv.vendor?.companyName || inv.vendor?.name || "",
    "Vendor Tax ID": inv.vendor?.taxId || "",
    "Customer Name": inv.customer?.companyName || inv.customer?.name || "",
    "Customer Tax ID": inv.customer?.taxId || "",
    "Currency": inv.currency,
    "Subtotal": inv.subtotal,
    "Discount": inv.totalDiscount || 0,
    "Tax / VAT": inv.totalTax,
    "Shipping / Other": (inv.shippingFee || 0) + (inv.otherFees || 0),
    "Grand Total": inv.grandTotal,
    "Amount Paid": inv.amountPaid || 0,
    "Balance Due": inv.balanceDue ?? inv.grandTotal,
    "Payment Terms": inv.paymentTerms || "",
    "Items Count": inv.items?.length || 0,
    "Notes": inv.notes || "",
    "Document Type": inv.documentType || "INVOICE",
    "Source": inv.sourceType || "UPLOAD",
    "Source Email Sender": inv.sourceMetadata?.sender || "",
    "Source Email Subject": inv.sourceMetadata?.subject || "",
    "Review Status": inv.reviewStatus || "NEEDS_REVIEW",
    "Duplicate Status": inv.duplicateStatus || "UNIQUE",
    "Category": inv.category || "Uncategorized",
    "AI Confidence %": inv.confidenceScore ?? "",
    "Validation Flags": inv.validation?.issues?.length || 0,
    "Model Used": inv.modelUsed || "",
  }));

  const wsSummary = XLSX.utils.json_to_sheet(summaryData);
  XLSX.utils.book_append_sheet(wb, wsSummary, "Invoices Summary");

  // Sheet 2: Consolidated Line Items from all invoices
  const allItemsData: any[] = [];
  invoices.forEach((inv) => {
    (inv.items || []).forEach((item, idx) => {
      allItemsData.push({
        "Invoice #": inv.invoiceNumber,
        "Invoice Date": inv.invoiceDate,
        "Vendor": inv.vendor?.companyName || inv.vendor?.name || "",
        "Customer": inv.customer?.companyName || inv.customer?.name || "",
        "Item #": item.itemNumber || idx + 1,
        "SKU / Code": item.sku || "",
        "Item Description": item.description,
        "Quantity": item.quantity,
        "Unit Price": item.unitPrice,
        "Discount": item.discount || 0,
        "Tax Rate %": item.taxRate || 0,
        "Tax Amount": item.taxAmount || 0,
        "Line Total": item.total,
        "Currency": inv.currency,
      });
    });
  });

  const wsItems = XLSX.utils.json_to_sheet(allItemsData);
  XLSX.utils.book_append_sheet(wb, wsItems, "All Line Items");

  // Sheet 3: Vendors Directory
  const vendorMap = new Map<string, any>();
  invoices.forEach((inv) => {
    const vName = inv.vendor?.name || inv.vendor?.companyName;
    if (vName && !vendorMap.has(vName)) {
      vendorMap.set(vName, {
        "Vendor Name": vName,
        "Tax ID": inv.vendor?.taxId || "",
        "Address": inv.vendor?.address || "",
        "City": inv.vendor?.city || "",
        "State/Postal": `${inv.vendor?.state || ""} ${inv.vendor?.postalCode || ""}`.trim(),
        "Country": inv.vendor?.country || "",
        "Email": inv.vendor?.email || "",
        "Phone": inv.vendor?.phone || "",
        "Website": inv.vendor?.website || "",
      });
    }
  });
  if (vendorMap.size > 0) {
    const wsVendors = XLSX.utils.json_to_sheet(Array.from(vendorMap.values()));
    XLSX.utils.book_append_sheet(wb, wsVendors, "Vendors List");
  }

  // Sheet 4: Review & validation queue
  const reviewData = invoices.map((inv) => ({
    "Invoice #": inv.invoiceNumber,
    "Vendor": inv.vendor?.companyName || inv.vendor?.name || "",
    "Review Status": inv.reviewStatus || "NEEDS_REVIEW",
    "Duplicate Status": inv.duplicateStatus || "UNIQUE",
    "Confidence %": inv.confidenceScore ?? "",
    "Validation Status": inv.validation?.status || "",
    "Validation Flag Count": inv.validation?.issues?.length || 0,
    "Validation Messages": (inv.validation?.issues || []).map((issue) => issue.message).join(" | "),
    "Source": inv.sourceType || "UPLOAD",
    "Source Email": inv.sourceMetadata?.sender || "",
    "Source Subject": inv.sourceMetadata?.subject || "",
    "Model Used": inv.modelUsed || "",
  }));
  const wsReview = XLSX.utils.json_to_sheet(reviewData);
  XLSX.utils.book_append_sheet(wb, wsReview, "Review & Validation");

  const dateStr = new Date().toISOString().slice(0, 10);
  const fileName = customFileName || `Sales_Invoices_Export_${invoices.length}_invoices_${dateStr}.xlsx`;
  XLSX.writeFile(wb, fileName);
}

/**
 * Exports single invoice line items as CSV format
 */
export function exportInvoiceLineItemsToCSV(invoice: InvoiceData) {
  const data = invoice.items.map((item, idx) => ({
    "Invoice Number": invoice.invoiceNumber,
    "Invoice Date": invoice.invoiceDate,
    "Item Number": item.itemNumber || idx + 1,
    "SKU": item.sku || "",
    "Description": `"${(item.description || "").replace(/"/g, '""')}"`,
    "Quantity": item.quantity,
    "Unit Price": item.unitPrice,
    "Discount": item.discount || 0,
    "Tax Rate": item.taxRate || 0,
    "Line Total": item.total,
    "Currency": invoice.currency,
  }));

  const headers = Object.keys(data[0] || {}).join(",");
  const csvRows = data.map((row) => Object.values(row).join(","));
  const csvContent = "data:text/csv;charset=utf-8," + [headers, ...csvRows].join("\n");
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", `Line_Items_${invoice.invoiceNumber || "Invoice"}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
