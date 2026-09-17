import { Type } from "@google/genai";

export const partySchema = {
  type: Type.OBJECT,
  properties: {
    name: { type: Type.STRING, nullable: true },
    companyName: { type: Type.STRING, nullable: true },
    registeredName: { type: Type.STRING, nullable: true, description: "Registered business name when visible" },
    tradeName: { type: Type.STRING, nullable: true, description: "Business or trade name when visible" },
    taxId: { type: Type.STRING, nullable: true },
    branchCode: { type: Type.STRING, nullable: true },
    taxRegistration: { type: Type.STRING, nullable: true, description: "VAT, NON_VAT, or UNKNOWN when explicitly stated" },
    address: { type: Type.STRING, nullable: true },
    city: { type: Type.STRING, nullable: true },
    cityMunicipality: { type: Type.STRING, nullable: true },
    state: { type: Type.STRING, nullable: true },
    province: { type: Type.STRING, nullable: true },
    barangay: { type: Type.STRING, nullable: true },
    region: { type: Type.STRING, nullable: true },
    postalCode: { type: Type.STRING, nullable: true },
    country: { type: Type.STRING, nullable: true },
    email: { type: Type.STRING, nullable: true },
    phone: { type: Type.STRING, nullable: true },
    website: { type: Type.STRING, nullable: true },
  },
  required: ["name", "companyName", "registeredName", "tradeName", "taxId", "branchCode", "taxRegistration", "address", "city", "cityMunicipality", "state", "province", "barangay", "region", "postalCode", "country", "email", "phone", "website"],
};

export const invoiceSchema = {
  type: Type.OBJECT,
  properties: {
    documentType: { type: Type.STRING, nullable: true, description: "INVOICE, CREDIT_NOTE, RECEIPT, STATEMENT, PURCHASE_ORDER, or OTHER" },
    invoiceSubtype: { type: Type.STRING, nullable: true, description: "VAT_INVOICE, NON_VAT_INVOICE, SERVICE_INVOICE, SALES_INVOICE, COMMERCIAL_INVOICE, CASH_INVOICE, CHARGE_INVOICE, CREDIT_INVOICE, or UNKNOWN when visible" },
    invoiceNumber: { type: Type.STRING, nullable: true },
    invoiceDate: { type: Type.STRING, nullable: true, description: "YYYY-MM-DD when visible" },
    dueDate: { type: Type.STRING, nullable: true, description: "YYYY-MM-DD when visible" },
    purchaseOrderNumber: { type: Type.STRING, nullable: true },
    projectReference: { type: Type.STRING, nullable: true, description: "Explicit Project, Reference, Job, Contract, or Work Order text when printed" },
    currency: { type: Type.STRING, nullable: true, description: "ISO currency code; leave null when not explicit" },
    currencySymbol: { type: Type.STRING, nullable: true },
    paymentTerms: { type: Type.STRING, nullable: true },
    vendor: partySchema,
    // Buyer/customer is optional source evidence for supplier invoices. The
    // deployment company is fixed and is not an extracted posting identity.
    customer: { ...partySchema, nullable: true },
    shippingAddress: { ...partySchema, nullable: true },
    items: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          sku: { type: Type.STRING, nullable: true },
          description: { type: Type.STRING, nullable: true },
          quantity: { type: Type.NUMBER, nullable: true },
          unitOfMeasure: { type: Type.STRING, nullable: true, description: "Unit of measure such as bags, pcs, kg, m, sq.m., cu.m., liters, hours, days, sets, or lots" },
          unitPrice: { type: Type.NUMBER, nullable: true },
          discount: { type: Type.NUMBER, nullable: true },
          taxRate: { type: Type.NUMBER, nullable: true },
          taxAmount: { type: Type.NUMBER, nullable: true },
          taxTreatment: { type: Type.STRING, nullable: true },
          total: { type: Type.NUMBER, nullable: true },
        },
        required: ["sku", "description", "quantity", "unitOfMeasure", "unitPrice", "discount", "taxRate", "taxAmount", "taxTreatment", "total"],
      },
    },
    subtotal: { type: Type.NUMBER, nullable: true },
    totalDiscount: { type: Type.NUMBER, nullable: true },
    taxBreakdown: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING, nullable: true },
          rate: { type: Type.NUMBER, nullable: true },
          amount: { type: Type.NUMBER, nullable: true },
        },
        required: ["name", "rate", "amount"],
      },
    },
    totalTax: { type: Type.NUMBER, nullable: true },
    shippingFee: { type: Type.NUMBER, nullable: true },
    otherFees: { type: Type.NUMBER, nullable: true },
    grandTotal: { type: Type.NUMBER, nullable: true },
    amountPaid: { type: Type.NUMBER, nullable: true },
    amountDue: { type: Type.NUMBER, nullable: true, description: "Source-stated amount due; preserve separately from gross invoice total" },
    balanceDue: { type: Type.NUMBER, nullable: true },
    withholdingTaxRate: { type: Type.NUMBER, nullable: true, description: "Only when explicitly shown; do not infer a rate" },
    withholdingTaxAmount: { type: Type.NUMBER, nullable: true, description: "EWT/CWT/withholding amount when explicitly shown" },
    netAmountPayable: { type: Type.NUMBER, nullable: true, description: "Only when the source deterministically states or calculates it" },
    philippineTaxDetails: {
      type: Type.OBJECT,
      properties: {
        invoiceKind: { type: Type.STRING, nullable: true, description: "VAT_INVOICE, NON_VAT_INVOICE, or UNKNOWN" },
        sellerRegistration: { type: Type.STRING, nullable: true, description: "VAT, NON_VAT, or UNKNOWN" },
        vatableSales: { type: Type.NUMBER, nullable: true },
        vatAmount: { type: Type.NUMBER, nullable: true },
        zeroRatedSales: { type: Type.NUMBER, nullable: true },
        vatExemptSales: { type: Type.NUMBER, nullable: true },
        salesSubjectToPercentageTax: { type: Type.NUMBER, nullable: true },
        authorityToPrintNumber: { type: Type.STRING, nullable: true, description: "ATP when visible" },
        outboundCorrespondenceNumber: { type: Type.STRING, nullable: true, description: "OCN when visible" },
        permitToUseNumber: { type: Type.STRING, nullable: true },
        approvedSerialFrom: { type: Type.STRING, nullable: true },
        approvedSerialTo: { type: Type.STRING, nullable: true },
        birPermitDetailsRaw: { type: Type.STRING, nullable: true },
        withholdingTaxRate: { type: Type.NUMBER, nullable: true },
        withholdingTaxAmount: { type: Type.NUMBER, nullable: true },
        netAmountPayable: { type: Type.NUMBER, nullable: true },
        vatInclusive: { type: Type.BOOLEAN, nullable: true, description: "True only when the source clearly states prices/total are VAT-inclusive" },
      },
      required: ["invoiceKind", "sellerRegistration", "vatableSales", "vatAmount", "zeroRatedSales", "vatExemptSales", "salesSubjectToPercentageTax", "authorityToPrintNumber", "outboundCorrespondenceNumber", "permitToUseNumber", "approvedSerialFrom", "approvedSerialTo", "birPermitDetailsRaw", "withholdingTaxRate", "withholdingTaxAmount", "netAmountPayable", "vatInclusive"],
      nullable: true,
    },
    monetarySemantics: {
      type: Type.OBJECT,
      properties: {
        unitPriceBasis: { type: Type.STRING, nullable: true, description: "PRE_TAX, TAX_INCLUSIVE, or UNKNOWN for the source-displayed unit price" },
        lineTotalBasis: { type: Type.STRING, nullable: true, description: "PRE_TAX, TAX_INCLUSIVE, or UNKNOWN for source-displayed line amounts" },
        subtotalBasis: { type: Type.STRING, nullable: true, description: "PRE_TAX, TAX_INCLUSIVE, or UNKNOWN for the source subtotal" },
        taxInclusion: { type: Type.STRING, nullable: true, description: "ADDED_TO_TOTAL, INCLUDED_IN_TOTAL, NOT_APPLICABLE, or UNKNOWN" },
        discountIncludedInSubtotal: { type: Type.BOOLEAN, nullable: true, description: "True only when the source clearly includes the invoice discount in subtotal" },
        payableBasis: { type: Type.STRING, nullable: true, description: "GROSS_INVOICE unless the source explicitly identifies a net-after-withholding payable" },
        determination: { type: Type.STRING, nullable: true, description: "EXPLICIT, INFERRED, or UNKNOWN" },
      },
      required: ["unitPriceBasis", "lineTotalBasis", "subtotalBasis", "taxInclusion", "discountIncludedInSubtotal", "payableBasis", "determination"],
      nullable: true,
    },
    notes: { type: Type.STRING, nullable: true },
    termsAndConditions: { type: Type.STRING, nullable: true },
    category: { type: Type.STRING, nullable: true, description: "Short business/accounting category suggestion" },
    confidenceScore: { type: Type.NUMBER, nullable: true, description: "Overall extraction confidence from 0 to 100. Do not invent a high score." },
    fieldConfidence: {
      type: Type.OBJECT,
      properties: {
        invoiceNumber: { type: Type.NUMBER, nullable: true },
        invoiceDate: { type: Type.NUMBER, nullable: true },
        dueDate: { type: Type.NUMBER, nullable: true },
        vendorName: { type: Type.NUMBER, nullable: true },
        vendorTin: { type: Type.NUMBER, nullable: true },
        currency: { type: Type.NUMBER, nullable: true },
        lineItems: { type: Type.NUMBER, nullable: true },
        subtotal: { type: Type.NUMBER, nullable: true },
        vatAmount: { type: Type.NUMBER, nullable: true },
        grandTotal: { type: Type.NUMBER, nullable: true },
        amountDue: { type: Type.NUMBER, nullable: true },
      },
      required: ["invoiceNumber", "invoiceDate", "dueDate", "vendorName", "vendorTin", "currency", "lineItems", "subtotal", "vatAmount", "grandTotal", "amountDue"],
      nullable: true,
    },
  },
  required: ["documentType", "invoiceSubtype", "invoiceNumber", "invoiceDate", "dueDate", "purchaseOrderNumber", "projectReference", "currency", "currencySymbol", "paymentTerms", "vendor", "shippingAddress", "items", "subtotal", "totalDiscount", "taxBreakdown", "totalTax", "shippingFee", "otherFees", "grandTotal", "amountPaid", "amountDue", "balanceDue", "withholdingTaxRate", "withholdingTaxAmount", "netAmountPayable", "philippineTaxDetails", "monetarySemantics", "notes", "termsAndConditions", "category", "confidenceScore", "fieldConfidence"],
};

export const emailClassificationSchema = {
  type: Type.OBJECT,
  properties: {
    isInvoiceLike: { type: Type.BOOLEAN },
    documentType: { type: Type.STRING },
    invoiceSubtype: { type: Type.STRING },
    confidence: { type: Type.NUMBER },
    reason: { type: Type.STRING },
    suggestedVendor: { type: Type.STRING },
    invoiceNumberHint: { type: Type.STRING },
  },
  required: ["isInvoiceLike", "documentType", "confidence", "reason"],
};

export const emailBatchClassificationSchema = {
  type: Type.OBJECT,
  properties: {
    classifications: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          messageId: { type: Type.STRING },
          suggestedDestination: { type: Type.STRING },
          confidence: { type: Type.NUMBER },
          reason: { type: Type.STRING },
        },
        required: ["messageId", "suggestedDestination", "confidence", "reason"],
      },
    },
  },
  required: ["classifications"],
};



export const expenseSchema = {
  type: "object",
  properties: {
    expenseDate: { type: "string", description: "Expense or receipt date in YYYY-MM-DD format" },
    category: {
      type: "string",
      description: "Category matching one of: Fuel, Transportation, Meals, Materials, Equipment Rental, Equipment, Utilities, Communication, Office / Site Supplies, Permits, Professional Fees, Subcontractor, Miscellaneous",
    },
    description: { type: "string", description: "Brief description of the expense or purchased items" },
    payee: { type: "string", description: "Merchant, store, supplier, or payee name" },
    amount: { type: "number", description: "Total expense amount paid or due as a positive number" },
    currency: { type: "string", description: "ISO currency code such as PHP, USD, EUR, SGD" },
    paymentMethod: { type: "string", description: "Payment method such as Cash, GCash, Maya, Credit Card, Debit Card, Bank Transfer, Check" },
    referenceNumber: { type: "string", description: "Official receipt number, transaction ID, reference number, or invoice number" },
    projectReference: { type: "string", description: "Project code hint (e.g. PRJ-0017) if explicitly visible" },
    merchantIdentity: {
      type: "object",
      properties: {
        taxId: { type: "string", description: "Merchant Tax ID / TIN if present" },
        address: { type: "string", description: "Merchant address if present" },
        email: { type: "string", description: "Merchant contact email if present" },
        phone: { type: "string", description: "Merchant phone number if present" },
      },
    },
    confidenceScore: { type: "number", description: "Extraction confidence from 0 to 100" },
  },
  required: ["category", "description"],
};
