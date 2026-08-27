import type { InvoiceData, InvoiceProjectAllocation, PartyDetails } from "../../types.ts";
import { addDemoDays, demoTimestamp } from "./demoDates.ts";
import { DEMO_PROJECT_IDS } from "./projects.ts";

const CUSTOMER: PartyDetails = {
  name: "Meridian Engineering & Construction Corp.",
  registeredName: "Meridian Engineering & Construction Corp.",
  taxId: "009-847-215-000",
  taxRegistration: "VAT",
  address: "18 Meridian Drive, Brgy. Bagumbayan",
  city: "Quezon City",
  province: "Metro Manila",
  country: "Philippines",
};

const SUPPLIERS: Record<string, PartyDetails> = {
  metrosteel: { name: "Metrosteel Supply Corp.", taxId: "245-731-990-000", taxRegistration: "VAT", address: "Valenzuela Industrial Park", city: "Valenzuela City", country: "Philippines" },
  buildmix: { name: "BuildMix Concrete Solutions", taxId: "318-552-641-000", taxRegistration: "VAT", address: "E. Rodriguez Jr. Avenue", city: "Quezon City", country: "Philippines" },
  prime: { name: "Prime Electrical Trading", taxId: "204-881-317-000", taxRegistration: "VAT", address: "Aurora Boulevard", city: "Quezon City", country: "Philippines" },
  southline: { name: "Southline Equipment Rental", taxId: "421-705-286-000", taxRegistration: "VAT", address: "National Highway", city: "Muntinlupa City", country: "Philippines" },
  safety: { name: "Pacific Safety & Industrial Supply", taxId: "287-116-534-000", taxRegistration: "VAT", address: "Ortigas Avenue Extension", city: "Pasig City", country: "Philippines" },
  aggregates: { name: "Metro Aggregates Trading", taxId: "362-990-145-000", taxRegistration: "VAT", address: "Marikina-Infanta Highway", city: "Antipolo City", province: "Rizal", country: "Philippines" },
  plumbing: { name: "Northstar Plumbing Supply", taxId: "155-407-892-000", taxRegistration: "VAT", address: "A. Bonifacio Avenue", city: "Caloocan City", country: "Philippines" },
  fasteners: { name: "Luzon Industrial Fasteners", taxId: "497-338-610-000", taxRegistration: "VAT", address: "MacArthur Highway", city: "Meycauayan", province: "Bulacan", country: "Philippines" },
  subcontractor: { name: "Axis Structural Services Corp.", taxId: "534-218-779-000", taxRegistration: "VAT", address: "West Service Road", city: "Parañaque City", country: "Philippines" },
};

interface InvoiceSpec {
  id: string;
  number: string;
  vendor: keyof typeof SUPPLIERS;
  projectId?: string;
  daysAgo: number;
  dueInDays: number;
  gross: number;
  status: string;
  reviewStatus: "NEEDS_REVIEW" | "VERIFIED";
  description: string;
  category: string;
  paidFraction?: number;
}

const SPECS: InvoiceSpec[] = [
  { id: "01", number: "MS-260481", vendor: "metrosteel", projectId: DEMO_PROJECT_IDS.warehouse, daysAgo: 90, dueInDays: 30, gross: 1_487_360.40, status: "PAID", reviewStatus: "VERIFIED", description: "Structural steel beams, plates, and columns — warehouse expansion package", category: "Structural Steel" },
  { id: "02", number: "BM-118204", vendor: "buildmix", projectId: DEMO_PROJECT_IDS.warehouse, daysAgo: 72, dueInDays: 30, gross: 982_415.75, status: "PARTIALLY_PAID", reviewStatus: "VERIFIED", paidFraction: 0.58, description: "Ready-mix concrete, 28 MPa, loading-bay and footing pours", category: "Concrete" },
  { id: "03", number: "SER-77196", vendor: "southline", projectId: DEMO_PROJECT_IDS.warehouse, daysAgo: 55, dueInDays: 30, gross: 386_920.18, status: "APPROVED", reviewStatus: "VERIFIED", description: "Crawler crane and boom lift rental — four-week site deployment", category: "Equipment Rental" },
  { id: "04", number: "PSI-09382", vendor: "safety", projectId: DEMO_PROJECT_IDS.warehouse, daysAgo: 42, dueInDays: 21, gross: 128_745.56, status: "PAID", reviewStatus: "VERIFIED", description: "Harnesses, lifelines, welding PPE, barricades, and site safety consumables", category: "Safety" },
  { id: "05", number: "PET-68014", vendor: "prime", projectId: DEMO_PROJECT_IDS.warehouse, daysAgo: 35, dueInDays: 21, gross: 714_882.32, status: "OVERDUE", reviewStatus: "VERIFIED", description: "Panelboards, breakers, cable trays, and warehouse feeder conductors", category: "Electrical" },
  { id: "06", number: "LIF-441087", vendor: "fasteners", projectId: DEMO_PROJECT_IDS.warehouse, daysAgo: 16, dueInDays: 30, gross: 192_660.44, status: "APPROVED", reviewStatus: "VERIFIED", description: "High-tensile bolts, anchors, washers, and structural fasteners", category: "Structural Steel" },
  { id: "07", number: "ASSC-2026-219", vendor: "subcontractor", projectId: DEMO_PROJECT_IDS.warehouse, daysAgo: 8, dueInDays: 30, gross: 1_264_518.63, status: "PENDING", reviewStatus: "NEEDS_REVIEW", description: "Steel framing erection progress claim — north bay", category: "Subcontractor Services" },
  { id: "08", number: "MAT-89336", vendor: "aggregates", projectId: DEMO_PROJECT_IDS.drainage, daysAgo: 85, dueInDays: 30, gross: 682_340.20, status: "PAID", reviewStatus: "VERIFIED", description: "Washed sand, base course, and graded aggregates for drainage works", category: "Aggregates" },
  { id: "09", number: "SER-76031", vendor: "southline", projectId: DEMO_PROJECT_IDS.drainage, daysAgo: 61, dueInDays: 30, gross: 448_775.25, status: "PAID", reviewStatus: "VERIFIED", description: "Backhoe, breaker attachment, and dump truck rental", category: "Equipment Rental" },
  { id: "10", number: "BM-117092", vendor: "buildmix", projectId: DEMO_PROJECT_IDS.drainage, daysAgo: 44, dueInDays: 30, gross: 755_930.62, status: "PARTIALLY_PAID", reviewStatus: "VERIFIED", paidFraction: 0.46, description: "Ready-mix concrete for catch basins, headwalls, and reinstatement", category: "Concrete" },
  { id: "11", number: "NPS-55180", vendor: "plumbing", projectId: DEMO_PROJECT_IDS.drainage, daysAgo: 27, dueInDays: 14, gross: 624_115.38, status: "OVERDUE", reviewStatus: "VERIFIED", description: "RCP accessories, drainage fittings, couplings, and jointing materials", category: "Drainage Materials" },
  { id: "12", number: "SER-78544", vendor: "southline", projectId: DEMO_PROJECT_IDS.drainage, daysAgo: 13, dueInDays: 21, gross: 296_830.90, status: "APPROVED", reviewStatus: "VERIFIED", description: "Mini excavator and compactor rental — eastern work front", category: "Equipment Rental" },
  { id: "13", number: "MS-261122", vendor: "metrosteel", projectId: DEMO_PROJECT_IDS.solar, daysAgo: 70, dueInDays: 30, gross: 1_145_480.72, status: "PAID", reviewStatus: "VERIFIED", description: "Rebar and miscellaneous steel for inverter and control-building foundations", category: "Reinforcing Steel" },
  { id: "14", number: "MAT-90741", vendor: "aggregates", projectId: DEMO_PROJECT_IDS.solar, daysAgo: 48, dueInDays: 30, gross: 522_644.86, status: "APPROVED", reviewStatus: "VERIFIED", description: "Subbase and crushed aggregate for access-road formation", category: "Aggregates" },
  { id: "15", number: "SER-77940", vendor: "southline", projectId: DEMO_PROJECT_IDS.solar, daysAgo: 31, dueInDays: 30, gross: 618_375.44, status: "PARTIALLY_PAID", reviewStatus: "VERIFIED", paidFraction: 0.51, description: "Motor grader, vibratory roller, and water truck rental", category: "Equipment Rental" },
  { id: "16", number: "PSI-10471", vendor: "safety", projectId: DEMO_PROJECT_IDS.solar, daysAgo: 6, dueInDays: 21, gross: 162_995.16, status: "DRAFT", reviewStatus: "NEEDS_REVIEW", description: "Heat-stress PPE, reflective vests, temporary signage, and spill kits", category: "Safety" },
  { id: "17", number: "PET-69318", vendor: "prime", projectId: DEMO_PROJECT_IDS.solar, daysAgo: 3, dueInDays: 30, gross: 843_215.28, status: "PENDING", reviewStatus: "NEEDS_REVIEW", description: "Underground conduits, cable markers, grounding materials, and pull boxes", category: "Electrical" },
  { id: "18", number: "MS-258920", vendor: "metrosteel", projectId: DEMO_PROJECT_IDS.cebu, daysAgo: 160, dueInDays: 30, gross: 1_082_410.10, status: "PAID", reviewStatus: "VERIFIED", description: "Light-gauge framing, supports, and miscellaneous fit-out steel", category: "Fit-Out Materials" },
  { id: "19", number: "PET-64193", vendor: "prime", projectId: DEMO_PROJECT_IDS.cebu, daysAgo: 145, dueInDays: 30, gross: 486_730.55, status: "PAID", reviewStatus: "VERIFIED", description: "Lighting fixtures, branch wiring, devices, and distribution accessories", category: "Electrical" },
  { id: "20", number: "NPS-52911", vendor: "plumbing", projectId: DEMO_PROJECT_IDS.cebu, daysAgo: 132, dueInDays: 30, gross: 358_490.36, status: "PAID", reviewStatus: "VERIFIED", description: "Plumbing fixtures, valves, PPR piping, and sanitary accessories", category: "Plumbing" },
  { id: "21", number: "PSI-09904", vendor: "safety", daysAgo: 22, dueInDays: 30, gross: 92_847.68, status: "APPROVED", reviewStatus: "VERIFIED", description: "Company-wide PPE replenishment and first-aid supplies", category: "General Operations" },
];

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export function createDemoInvoices(anchorDate: string): { invoices: InvoiceData[]; allocations: InvoiceProjectAllocation[] } {
  const invoices: InvoiceData[] = [];
  const allocations: InvoiceProjectAllocation[] = [];

  for (const spec of SPECS) {
    const invoiceDate = addDemoDays(anchorDate, -spec.daysAgo);
    const dueDate = addDemoDays(invoiceDate, spec.dueInDays);
    const subtotal = roundMoney(spec.gross / 1.12);
    const vat = roundMoney(spec.gross - subtotal);
    const paidFraction = spec.status === "PAID" ? 1 : spec.paidFraction || 0;
    const amountPaid = roundMoney(spec.gross * paidFraction);
    const balanceDue = roundMoney(spec.gross - amountPaid);
    const id = `demo-invoice-${spec.id}`;

    invoices.push({
      id,
      fileName: `${spec.number}.pdf`,
      fileType: "application/pdf",
      documentType: "INVOICE",
      invoiceSubtype: "VAT_INVOICE",
      sourceType: "SAMPLE",
      processingStatus: "EXTRACTED",
      reviewStatus: spec.reviewStatus,
      duplicateStatus: "UNIQUE",
      invoiceNumber: spec.number,
      invoiceDate,
      dueDate,
      projectReference: spec.projectId,
      currency: "PHP",
      currencySymbol: "₱",
      paymentTerms: `Net ${spec.dueInDays}`,
      status: spec.status,
      vendor: SUPPLIERS[spec.vendor],
      customer: CUSTOMER,
      items: [{ id: `${id}-line-1`, itemNumber: 1, description: spec.description, quantity: 1, unitOfMeasure: "lot", unitPrice: subtotal, taxRate: 12, taxAmount: vat, taxTreatment: "VATABLE", total: spec.gross }],
      subtotal,
      totalTax: vat,
      taxBreakdown: [{ name: "VAT", rate: 12, amount: vat }],
      grandTotal: spec.gross,
      amountPaid,
      balanceDue,
      philippineTaxDetails: {
        invoiceKind: "VAT_INVOICE",
        sellerRegistration: "VAT",
        vatableSales: subtotal,
        vatAmount: vat,
        netAmountPayable: balanceDue,
        vatInclusive: true,
      },
      notes: `${spec.category} • demo source retained as a fictional sample document.`,
      category: spec.category,
      costCenter: spec.projectId || "General Operations",
      extractedAt: demoTimestamp(addDemoDays(invoiceDate, 1), 10, Number(spec.id) % 50),
      modelUsed: "gemini-3.5-flash-lite (demo snapshot)",
      confidenceScore: spec.reviewStatus === "VERIFIED" ? 0.96 : 0.84,
      verifiedAt: spec.reviewStatus === "VERIFIED" ? demoTimestamp(addDemoDays(invoiceDate, 2), 14, 10) : undefined,
    });

    if (spec.projectId) {
      allocations.push({
        id: `demo-invoice-allocation-${spec.id}`,
        invoiceId: id,
        projectId: spec.projectId,
        allocationType: "AMOUNT",
        allocationAmount: spec.gross,
        notes: `100% assigned to ${spec.projectId}.`,
        createdAt: demoTimestamp(addDemoDays(invoiceDate, 2), 14, 20),
        updatedAt: demoTimestamp(addDemoDays(invoiceDate, 2), 14, 20),
      });
    }
  }

  return { invoices, allocations };
}
