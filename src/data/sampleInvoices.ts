import type { InvoiceData, LineItem, PartyDetails, PhilippineTaxDetails } from "../types.ts";

export interface SampleInvoicePreset {
  id: string;
  name: string;
  category: string;
  description: string;
  rawText: string;
  previewData: InvoiceData;
}

const demoNow = "2026-08-23T09:00:00+08:00";

function item(id: string, itemNumber: number, description: string, quantity: number, unitPrice: number, taxTreatment = "VATABLE"): LineItem {
  return {
    id,
    itemNumber,
    description,
    quantity,
    unitPrice,
    discount: 0,
    taxRate: taxTreatment === "VATABLE" ? 12 : 0,
    taxAmount: 0,
    taxTreatment,
    total: Math.round(quantity * unitPrice * 100) / 100,
  };
}

const metroManilaVendor: PartyDetails = {
  name: "Bayanihan Digital Solutions Corporation",
  companyName: "Bayanihan Digital Solutions Corporation",
  registeredName: "Bayanihan Digital Solutions Corporation",
  tradeName: "Bayanihan Digital",
  taxId: "009-876-543-000",
  branchCode: "000",
  taxRegistration: "VAT",
  address: "18F Ayala Tower One, 6741 Ayala Avenue",
  barangay: "Bel-Air",
  city: "Makati City",
  cityMunicipality: "Makati City",
  province: "Metro Manila",
  region: "NCR",
  postalCode: "1226",
  country: "Philippines",
  email: "billing@bayanihan-digital.example",
  phone: "+63 2 8555 0188",
};

const harborlineCustomer: PartyDetails = {
  name: "Harborline Logistics Corporation",
  companyName: "Harborline Logistics Corporation",
  registeredName: "Harborline Logistics Corporation",
  taxId: "008-765-432-000",
  address: "12th Avenue corner 32nd Street",
  barangay: "Fort Bonifacio",
  city: "Taguig City",
  cityMunicipality: "Taguig City",
  province: "Metro Manila",
  region: "NCR",
  postalCode: "1634",
  country: "Philippines",
  email: "ap@harborline-logistics.example",
};

const phTax = (overrides: Partial<PhilippineTaxDetails>): PhilippineTaxDetails => ({
  invoiceKind: "VAT_INVOICE",
  sellerRegistration: "VAT",
  zeroRatedSales: 0,
  vatExemptSales: 0,
  authorityToPrintNumber: "ATP-DEMO-2026-0001",
  outboundCorrespondenceNumber: "OCN-DEMO-0001",
  birPermitDetailsRaw: "Fictional QA permit details — not a legal document.",
  ...overrides,
});

function baseInvoice(overrides: Partial<InvoiceData>): InvoiceData {
  return {
    id: "sample-base",
    documentType: "INVOICE",
    invoiceSubtype: "VAT_INVOICE",
    sourceType: "SAMPLE",
    sourceMetadata: { attachmentName: "fictional-philippine-demo.txt" },
    processingStatus: "EXTRACTED",
    reviewStatus: "NEEDS_REVIEW",
    duplicateStatus: "UNIQUE",
    invoiceNumber: "",
    invoiceDate: "2026-08-20",
    dueDate: "2026-09-19",
    currency: "PHP",
    currencySymbol: "₱",
    paymentTerms: "Net 30",
    status: "UNPAID",
    vendor: metroManilaVendor,
    customer: harborlineCustomer,
    items: [],
    subtotal: 0,
    totalDiscount: 0,
    totalTax: 0,
    shippingFee: 0,
    otherFees: 0,
    grandTotal: 0,
    amountPaid: 0,
    balanceDue: 0,
    extractedAt: demoNow,
    modelUsed: "sample-data",
    confidenceScore: 99,
    ...overrides,
  };
}

export const SAMPLE_INVOICES: SampleInvoicePreset[] = [
  {
    id: "sample-ph-vat-service",
    name: "Demo A: PH VAT Service Invoice",
    category: "IT / Professional Services",
    description: "Fictional Metro Manila VAT invoice for managed IT and cybersecurity services.",
    rawText: `FICTIONAL QA DATA — NOT A LEGAL DOCUMENT
VAT INVOICE
Registered Name: Bayanihan Digital Solutions Corporation
Business / Trade Name: Bayanihan Digital
Business Address: 18F Ayala Tower One, 6741 Ayala Avenue, Barangay Bel-Air, Makati City, Metro Manila 1226
VAT REG TIN: 009-876-543-000
Branch Code: 000
Invoice No: SI-2026-00891
Transaction Date: August 20, 2026

BUYER / CUSTOMER
Registered Name: Harborline Logistics Corporation
Address: 12th Avenue corner 32nd Street, Barangay Fort Bonifacio, Taguig City, Metro Manila 1634
TIN: 008-765-432-000

DESCRIPTION OF SERVICE
1. Managed cloud security and compliance review | Qty 1 | Unit Price ₱45,000.00 | Amount ₱45,000.00
2. Infrastructure monitoring and incident response retainer | Qty 10 hours | Unit Price ₱3,000.00 | Amount ₱30,000.00

VATABLE SALES: ₱75,000.00
VAT AMOUNT (12%): ₱9,000.00
ZERO-RATED SALES: ₱0.00
VAT-EXEMPT SALES: ₱0.00
TOTAL AMOUNT: ₱84,000.00
ATP: ATP-DEMO-2026-0001
OCN: OCN-DEMO-0001`,
    previewData: baseInvoice({
      id: "sample-ph-vat-service",
      invoiceNumber: "SI-2026-00891",
      invoiceDate: "2026-08-20",
      items: [item("a-1", 1, "Managed cloud security and compliance review", 1, 45000), item("a-2", 2, "Infrastructure monitoring and incident response retainer", 10, 3000)],
      subtotal: 75000,
      totalTax: 9000,
      grandTotal: 84000,
      balanceDue: 84000,
      philippineTaxDetails: phTax({ vatableSales: 75000, vatAmount: 9000 }),
      notes: "Fictional Metro Manila demo preset for QA. Human verification is still required.",
    }),
  },
  {
    id: "sample-ph-office-supplies",
    name: "Demo B: PH Office Supplies VAT Invoice",
    category: "Office Supplies",
    description: "Fictional Quezon City supplier with ordinary VATable goods and PHP pricing.",
    rawText: `FICTIONAL QA DATA — NOT A LEGAL DOCUMENT
VAT INVOICE
Supplier: Silangan Office Supply Hub, Inc.
VAT REG TIN: 007-654-321-000
Business Address: 45 EDSA, Barangay Socorro, Quezon City, Metro Manila 1109
Invoice No: QCS-2026-01427
Date: August 21, 2026
Customer: Northstar Creative Studio OPC
Buyer TIN: 010-222-333-000

ITEMS
Printer ink cartridge, black | 12 | ₱2,200.00 | ₱26,400.00
Long bond paper, 80gsm (ream) | 50 | ₱220.00 | ₱11,000.00
Ergonomic office chair | 8 | ₱6,500.00 | ₱52,000.00
External SSD 1TB | 6 | ₱4,200.00 | ₱25,200.00
Network switch and installation kit | 1 | ₱18,000.00 | ₱18,000.00

VATABLE SALES: ₱132,600.00
VAT AMOUNT (12%): ₱15,912.00
TOTAL: ₱148,512.00`,
    previewData: baseInvoice({
      id: "sample-ph-office-supplies",
      invoiceNumber: "QCS-2026-01427",
      invoiceDate: "2026-08-21",
      dueDate: "2026-09-05",
      vendor: {
        name: "Silangan Office Supply Hub, Inc.",
        companyName: "Silangan Office Supply Hub, Inc.",
        registeredName: "Silangan Office Supply Hub, Inc.",
        tradeName: "Silangan Office Supply Hub",
        taxId: "007-654-321-000",
        branchCode: "000",
        taxRegistration: "VAT",
        address: "45 EDSA",
        barangay: "Socorro",
        city: "Quezon City",
        cityMunicipality: "Quezon City",
        province: "Metro Manila",
        region: "NCR",
        postalCode: "1109",
        country: "Philippines",
        email: "sales@silangan-office.example",
      },
      customer: {
        name: "Northstar Creative Studio OPC",
        companyName: "Northstar Creative Studio OPC",
        registeredName: "Northstar Creative Studio OPC",
        taxId: "010-222-333-000",
        address: "7F One Corporate Centre",
        barangay: "San Antonio",
        city: "Pasig City",
        cityMunicipality: "Pasig City",
        province: "Metro Manila",
        region: "NCR",
        country: "Philippines",
      },
      items: [
        item("b-1", 1, "Printer ink cartridge, black", 12, 2200),
        item("b-2", 2, "Long bond paper, 80gsm (ream)", 50, 220),
        item("b-3", 3, "Ergonomic office chair", 8, 6500),
        item("b-4", 4, "External SSD 1TB", 6, 4200),
        item("b-5", 5, "Network switch and installation kit", 1, 18000),
      ],
      subtotal: 132600,
      totalTax: 15912,
      grandTotal: 148512,
      balanceDue: 148512,
      philippineTaxDetails: phTax({ vatableSales: 132600, vatAmount: 15912 }),
    }),
  },
  {
    id: "sample-ph-non-vat",
    name: "Demo C: PH Non-VAT Invoice",
    category: "Small Business Services",
    description: "Fictional non-VAT microbusiness invoice with no automatic 12% VAT.",
    rawText: `FICTIONAL QA DATA — NOT A LEGAL DOCUMENT
NON-VAT INVOICE
Registered Name: Mabini Repairs and Supplies
Trade Name: Mabini Repairs
TIN: 011-333-444-000
Business Address: 22 J.P. Rizal Street, Barangay San Isidro, Antipolo City, Rizal 1870
Invoice No: MR-2026-00318
Date: August 22, 2026

Replacement printer rollers | 10 | ₱850.00 | ₱8,500.00
On-site printer maintenance service | 1 | ₱10,000.00 | ₱10,000.00

SUBTOTAL: ₱18,500.00
VAT: ₱0.00
TOTAL: ₱18,500.00`,
    previewData: baseInvoice({
      id: "sample-ph-non-vat",
      invoiceNumber: "MR-2026-00318",
      invoiceDate: "2026-08-22",
      dueDate: "2026-08-22",
      invoiceSubtype: "NON_VAT_INVOICE",
      vendor: {
        name: "Mabini Repairs and Supplies",
        companyName: "Mabini Repairs and Supplies",
        registeredName: "Mabini Repairs and Supplies",
        tradeName: "Mabini Repairs",
        taxId: "011-333-444-000",
        taxRegistration: "NON_VAT",
        address: "22 J.P. Rizal Street",
        barangay: "San Isidro",
        city: "Antipolo City",
        cityMunicipality: "Antipolo City",
        province: "Rizal",
        region: "IV-A",
        postalCode: "1870",
        country: "Philippines",
      },
      items: [item("c-1", 1, "Replacement printer rollers", 10, 850, "NON_VAT"), item("c-2", 2, "On-site printer maintenance service", 1, 10000, "NON_VAT")],
      subtotal: 18500,
      totalTax: 0,
      grandTotal: 18500,
      balanceDue: 18500,
      philippineTaxDetails: { invoiceKind: "NON_VAT_INVOICE", sellerRegistration: "NON_VAT", vatAmount: 0, netAmountPayable: 18500 },
    }),
  },
  {
    id: "sample-ph-mixed-tax",
    name: "Demo D: PH Mixed Tax Treatment",
    category: "Mixed Tax Review",
    description: "Fictional invoice with VATable, zero-rated and VAT-exempt sales in one document.",
    rawText: `FICTIONAL QA DATA — NOT A LEGAL DOCUMENT
VAT INVOICE — MIXED TAX TREATMENT
Seller: Isla Enterprise Solutions Corporation
VAT REG TIN: 012-444-555-000
Address: 8F Cebu IT Park, Barangay Apas, Cebu City, Cebu 6000
Invoice No: MIX-2026-00077
Date: August 23, 2026

VATABLE SALES: ₱50,000.00
VAT AMOUNT: ₱6,000.00
ZERO-RATED SALES: ₱25,000.00
VAT-EXEMPT SALES: ₱25,000.00
TOTAL: ₱106,000.00`,
    previewData: baseInvoice({
      id: "sample-ph-mixed-tax",
      invoiceNumber: "MIX-2026-00077",
      invoiceDate: "2026-08-23",
      vendor: {
        name: "Isla Enterprise Solutions Corporation",
        companyName: "Isla Enterprise Solutions Corporation",
        registeredName: "Isla Enterprise Solutions Corporation",
        taxId: "012-444-555-000",
        branchCode: "000",
        taxRegistration: "VAT",
        address: "8F Cebu IT Park",
        barangay: "Apas",
        city: "Cebu City",
        cityMunicipality: "Cebu City",
        province: "Cebu",
        region: "VII",
        postalCode: "6000",
        country: "Philippines",
      },
      items: [
        item("d-1", 1, "Domestic managed services — VATable", 1, 50000, "VATABLE"),
        item("d-2", 2, "Export support service — zero-rated", 1, 25000, "ZERO_RATED"),
        item("d-3", 3, "Exempt training program", 1, 25000, "VAT_EXEMPT"),
      ],
      subtotal: 100000,
      totalTax: 6000,
      grandTotal: 106000,
      balanceDue: 106000,
      philippineTaxDetails: phTax({ vatableSales: 50000, vatAmount: 6000, zeroRatedSales: 25000, vatExemptSales: 25000 }),
    }),
  },
  {
    id: "sample-ph-validation-issue",
    name: "Demo E: Validation Issue",
    category: "QA / Human Review",
    description: "Intentional ₱50.00 document-total mismatch that must remain in NEEDS REVIEW.",
    rawText: `FICTIONAL QA DATA — NOT A LEGAL DOCUMENT
VAT INVOICE — DEMO: VALIDATION ISSUE
Seller: Lakbay Operations Support Corp.
VAT REG TIN: 013-555-666-000
Invoice No: QA-2026-00050
Date: August 23, 2026
VATABLE SALES: ₱20,000.00
VAT AMOUNT (12%): ₱2,400.00
DOCUMENT TOTAL: ₱22,450.00
QA NOTE: Document total does not reconcile by ₱50.00. This mismatch is intentional.`,
    previewData: baseInvoice({
      id: "sample-ph-validation-issue",
      invoiceNumber: "QA-2026-00050",
      invoiceDate: "2026-08-23",
      vendor: {
        name: "Lakbay Operations Support Corp.",
        companyName: "Lakbay Operations Support Corp.",
        registeredName: "Lakbay Operations Support Corp.",
        taxId: "013-555-666-000",
        branchCode: "000",
        taxRegistration: "VAT",
        address: "3F One Global Place",
        barangay: "Bonifacio Global City",
        city: "Taguig City",
        cityMunicipality: "Taguig City",
        province: "Metro Manila",
        region: "NCR",
        postalCode: "1634",
        country: "Philippines",
      },
      items: [item("e-1", 1, "Operations support service", 1, 10000), item("e-2", 2, "Process documentation and training", 2, 5000)],
      subtotal: 20000,
      totalTax: 2400,
      grandTotal: 22450,
      balanceDue: 22450,
      philippineTaxDetails: phTax({ vatableSales: 20000, vatAmount: 2400 }),
      notes: "Demo: Validation Issue — mismatch is intentional for QA.",
    }),
  },
];
