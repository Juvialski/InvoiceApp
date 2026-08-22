import { InvoiceData } from "../types";

export interface SampleInvoicePreset {
  id: string;
  name: string;
  category: string;
  description: string;
  rawText: string;
  previewData: InvoiceData;
}

export const SAMPLE_INVOICES: SampleInvoicePreset[] = [
  {
    id: "sample-tech-services",
    name: "CloudTech Consulting Invoice",
    category: "Professional Services",
    description: "IT architecture consulting, cloud migration and monthly SLA support.",
    rawText: `INVOICE #INV-2026-8894
Date: 2026-08-15
Due Date: 2026-09-15
PO Number: PO-99321
Payment Terms: Net 30
Status: UNPAID

FROM:
CloudTech Solutions Inc.
VAT/Tax ID: US-948372610
100 Innovation Way, Suite 400
San Francisco, CA 94105, United States
Email: billing@cloudtechsolutions.io
Phone: +1 (415) 555-0199
Website: https://cloudtechsolutions.io

BILL TO:
Acme Global Logistics Corp.
Tax ID: US-112233445
742 Industrial Parkway
Chicago, IL 60607, United States
Attn: Finance & Accounts Payable
Email: invoices@acmelogistics.com
Phone: +1 (312) 555-4890

ITEMS & SERVICES:
1. [SKU: SRV-ARCH] Multi-Cloud Architecture & Security Audit | Qty: 40 hrs | Unit Price: $185.00 | Total: $7,400.00
2. [SKU: SRV-MIGRATE] Kubernetes Cluster Migration & Workload Transition | Qty: 1 | Unit Price: $4,500.00 | Total: $4,500.00
3. [SKU: SLA-PREM] Enterprise 24/7 Managed Infrastructure Support (August 2026) | Qty: 1 | Unit Price: $2,200.00 | Total: $2,200.00
4. [SKU: LIC-BACKUP] Automated Backup & Disaster Recovery Licensing (10 Nodes) | Qty: 10 | Unit Price: $45.00 | Total: $450.00

FINANCIAL SUMMARY:
Subtotal: $14,550.00
Volume Discount (5% on consulting services): -$595.00
Sales Tax (8.25% on taxable items): $1,151.29
Total Amount Due: $15,106.29
Amount Paid: $0.00
Balance Due: $15,106.29

PAYMENT INSTRUCTIONS:
Wire / ACH Transfer:
Bank: Silicon Valley Commerce Bank
Account Name: CloudTech Solutions Inc.
Routing / ABA: 121000358
Account Number: 9876543210
SWIFT/BIC: SVCBUS33

Notes: Thank you for your business. Please include Invoice #INV-2026-8894 in the wire transfer memo.`,
    previewData: {
      id: "sample-1",
      invoiceNumber: "INV-2026-8894",
      invoiceDate: "2026-08-15",
      dueDate: "2026-09-15",
      purchaseOrderNumber: "PO-99321",
      currency: "USD",
      currencySymbol: "$",
      paymentTerms: "Net 30",
      status: "UNPAID",
      vendor: {
        name: "CloudTech Solutions Inc.",
        companyName: "CloudTech Solutions Inc.",
        taxId: "US-948372610",
        address: "100 Innovation Way, Suite 400",
        city: "San Francisco",
        state: "CA",
        postalCode: "94105",
        country: "United States",
        email: "billing@cloudtechsolutions.io",
        phone: "+1 (415) 555-0199",
        website: "https://cloudtechsolutions.io",
      },
      customer: {
        name: "Acme Global Logistics Corp.",
        companyName: "Acme Global Logistics Corp.",
        taxId: "US-112233445",
        address: "742 Industrial Parkway",
        city: "Chicago",
        state: "IL",
        postalCode: "60607",
        country: "United States",
        email: "invoices@acmelogistics.com",
        phone: "+1 (312) 555-4890",
      },
      items: [
        {
          id: "item-1",
          itemNumber: 1,
          sku: "SRV-ARCH",
          description: "Multi-Cloud Architecture & Security Audit",
          quantity: 40,
          unitPrice: 185.0,
          discount: 0,
          taxRate: 8.25,
          taxAmount: 610.5,
          total: 7400.0,
        },
        {
          id: "item-2",
          itemNumber: 2,
          sku: "SRV-MIGRATE",
          description: "Kubernetes Cluster Migration & Workload Transition",
          quantity: 1,
          unitPrice: 4500.0,
          discount: 0,
          taxRate: 8.25,
          taxAmount: 371.25,
          total: 4500.0,
        },
        {
          id: "item-3",
          itemNumber: 3,
          sku: "SLA-PREM",
          description: "Enterprise 24/7 Managed Infrastructure Support (August 2026)",
          quantity: 1,
          unitPrice: 2200.0,
          discount: 0,
          taxRate: 0,
          taxAmount: 0,
          total: 2200.0,
        },
        {
          id: "item-4",
          itemNumber: 4,
          sku: "LIC-BACKUP",
          description: "Automated Backup & Disaster Recovery Licensing (10 Nodes)",
          quantity: 10,
          unitPrice: 45.0,
          discount: 0,
          taxRate: 8.25,
          taxAmount: 37.13,
          total: 450.0,
        },
      ],
      subtotal: 14550.0,
      totalDiscount: 595.0,
      taxBreakdown: [{ name: "Sales Tax (8.25%)", rate: 8.25, amount: 1151.29 }],
      totalTax: 1151.29,
      shippingFee: 0,
      otherFees: 0,
      grandTotal: 15106.29,
      amountPaid: 0,
      balanceDue: 15106.29,
      notes: "Thank you for your business. Please include Invoice #INV-2026-8894 in the wire transfer memo.",
      termsAndConditions: "Payment due within 30 days of invoice date. 1.5% monthly interest on late payments.",
      extractedAt: new Date().toISOString(),
      modelUsed: "gemini-3.5-flash-lite",
      confidenceScore: 98,
    },
  },
  {
    id: "sample-hardware-supplies",
    name: "Apex Office & Hardware Supplies",
    category: "Wholesale & Physical Goods",
    description: "Monitors, ergonomic desks, and network gear with shipping & GST.",
    rawText: `TAX INVOICE
Invoice No: APX-90241
Date of Issue: 2026-08-20
Payment Due: 2026-08-30
Reference / PO: PO-TECH-4402
Status: PENDING

SUPPLIER / VENDOR:
Apex Wholesale Distributors Ltd.
GSTIN / Tax ID: 27AABCA1234F1Z8
Building 14, Metro Commerce Park
Seattle, WA 98101, United States
Email: accounts@apexsupplies.com
Phone: +1 (206) 555-8321

CUSTOMER:
Nexus Software Studios
Tax ID: US-884920192
Suite 800, 500 Pine Street
Austin, TX 78701, United States
Contact: procurement@nexusstudios.dev

ORDERED ITEMS:
1. [SKU: MON-4K-27] UltraSharp 27" 4K IPS USB-C Monitor | Qty: 8 | Unit: $420.00 | Total: $3,360.00
2. [SKU: DSK-ERGO-PRO] Dual-Motor Electric Standing Desk (140x70cm) | Qty: 4 | Unit: $580.00 | Total: $2,320.00
3. [SKU: CHR-AERO] Ergonomic Mesh High-Back Task Chair | Qty: 4 | Unit: $340.00 | Total: $1,360.00
4. [SKU: NET-CAT6A] Cat6A 10Gbps Shielded Ethernet Cable (100m spool) | Qty: 2 | Unit: $115.00 | Total: $230.00

SUMMARY:
Items Subtotal: $7,270.00
Freight & Pallet Shipping: $180.00
Discount Applied: -$200.00
State Sales Tax (8.5%): $616.25
TOTAL AMOUNT: $7,866.25
Paid Deposit: $2,000.00
Remaining Balance: $5,866.25

Bank Account: Apex Wholesale, Chase Commercial #4829103948`,
    previewData: {
      id: "sample-2",
      invoiceNumber: "APX-90241",
      invoiceDate: "2026-08-20",
      dueDate: "2026-08-30",
      purchaseOrderNumber: "PO-TECH-4402",
      currency: "USD",
      currencySymbol: "$",
      paymentTerms: "Net 10",
      status: "PENDING",
      vendor: {
        name: "Apex Wholesale Distributors Ltd.",
        companyName: "Apex Wholesale Distributors Ltd.",
        taxId: "27AABCA1234F1Z8",
        address: "Building 14, Metro Commerce Park",
        city: "Seattle",
        state: "WA",
        postalCode: "98101",
        country: "United States",
        email: "accounts@apexsupplies.com",
        phone: "+1 (206) 555-8321",
      },
      customer: {
        name: "Nexus Software Studios",
        companyName: "Nexus Software Studios",
        taxId: "US-884920192",
        address: "Suite 800, 500 Pine Street",
        city: "Austin",
        state: "TX",
        postalCode: "78701",
        country: "United States",
        email: "procurement@nexusstudios.dev",
      },
      items: [
        {
          id: "item-1",
          itemNumber: 1,
          sku: "MON-4K-27",
          description: 'UltraSharp 27" 4K IPS USB-C Monitor',
          quantity: 8,
          unitPrice: 420.0,
          total: 3360.0,
        },
        {
          id: "item-2",
          itemNumber: 2,
          sku: "DSK-ERGO-PRO",
          description: "Dual-Motor Electric Standing Desk (140x70cm)",
          quantity: 4,
          unitPrice: 580.0,
          total: 2320.0,
        },
        {
          id: "item-3",
          itemNumber: 3,
          sku: "CHR-AERO",
          description: "Ergonomic Mesh High-Back Task Chair",
          quantity: 4,
          unitPrice: 340.0,
          total: 1360.0,
        },
        {
          id: "item-4",
          itemNumber: 4,
          sku: "NET-CAT6A",
          description: "Cat6A 10Gbps Shielded Ethernet Cable (100m spool)",
          quantity: 2,
          unitPrice: 115.0,
          total: 230.0,
        },
      ],
      subtotal: 7270.0,
      totalDiscount: 200.0,
      taxBreakdown: [{ name: "State Sales Tax (8.5%)", rate: 8.5, amount: 616.25 }],
      totalTax: 616.25,
      shippingFee: 180.0,
      otherFees: 0,
      grandTotal: 7866.25,
      amountPaid: 2000.0,
      balanceDue: 5866.25,
      notes: "Freight delivery scheduled for dock delivery.",
      extractedAt: new Date().toISOString(),
      modelUsed: "gemini-3.5-flash-lite",
      confidenceScore: 97,
    },
  },
];
