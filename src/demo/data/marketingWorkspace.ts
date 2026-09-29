import type { Expense, InvoiceData, InvoiceProjectAllocation, Project, ProjectCostCode, PurchaseOrder, RFQ, SupplierQuotation, Vendor } from "../../types.ts";
import { DEMO_COMPANY_ID, type DemoWorkspaceData } from "../demoTypes.ts";
import { createDemoWorkspace } from "./createDemoWorkspace.ts";
import { addDemoDays, demoTimestamp } from "./demoDates.ts";

export const MARKETING_DEMO_ANCHOR_DATE = "2026-09-29" as const;

export const MARKETING_PROJECT_IDS = {
  clark: "marketing-project-clark",
  laguna: "marketing-project-laguna",
  sanFernando: "marketing-project-san-fernando",
  bacolod: "marketing-project-bacolod",
  meycauayan: "marketing-project-meycauayan",
} as const;

export const MARKETING_INVOICE_IDS = {
  boosterPump: "marketing-invoice-booster-pump",
  roMembranes: "marketing-invoice-ro-membranes",
  flowMeter: "marketing-invoice-flow-meter",
} as const;

export const MARKETING_PROCUREMENT_IDS = {
  boosterRfq: "marketing-rfq-booster-package",
  membranesRfq: "marketing-rfq-ro-package",
  analyzerRfq: "marketing-rfq-water-quality-analyzers",
  pipingRfq: "marketing-rfq-treatment-room-piping",
  boosterQuote: "marketing-quote-booster-flowcrest",
  boosterAlternateQuote: "marketing-quote-booster-ridgepoint",
  membranesQuote: "marketing-quote-membranes-streamwell",
  membranesAlternateQuote: "marketing-quote-membranes-ridgepoint",
  analyzerQuote: "marketing-quote-analyzers-wellspring",
  analyzerAlternateQuote: "marketing-quote-analyzers-calibre",
  boosterPo: "marketing-po-booster-package",
  membranesPo: "marketing-po-ro-package",
  analyzerPo: "marketing-po-water-quality-analyzers",
} as const;

function emptyWorkspaceCollections<T>(value: T): T {
  if (Array.isArray(value)) return [] as T;
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, emptyWorkspaceCollections(entry)])) as T;
}

function projectRecords(anchorDate: string): { projects: Project[]; presentation: DemoWorkspaceData["projectPresentation"] } {
  const updatedAt = demoTimestamp(anchorDate, 9, 0);
  const projects: Project[] = [
    {
      id: MARKETING_PROJECT_IDS.clark,
      projectCode: "WTR-26-014",
      projectName: "Clark Industrial Water Treatment Upgrade",
      description: "Upgrade raw-water pre-treatment, pressure boosting, filtration and controls at an operating industrial facility.",
      clientName: "Northmark Cold Chain Services, Inc.",
      clientReference: "NCC-WTR-014",
      location: "Clark Freeport Zone, Pampanga",
      siteAddress: "Clark Freeport Zone, Pampanga, Philippines",
      projectManager: "Elena Villanueva",
      status: "ACTIVE",
      startDate: addDemoDays(anchorDate, -108),
      targetEndDate: addDemoDays(anchorDate, 74),
      contractValue: 13_480_000,
      projectBudget: 10_850_000,
      currency: "PHP",
      taxTreatment: "UNCLASSIFIED",
      notes: "Mechanical installation and controls tie-in are in progress.",
      createdAt: demoTimestamp(addDemoDays(anchorDate, -115)),
      updatedAt,
    },
    {
      id: MARKETING_PROJECT_IDS.laguna,
      projectCode: "WTR-26-018",
      projectName: "Laguna Food Plant RO Expansion",
      description: "Expand the reverse-osmosis train and connect new membrane housings, pretreatment and process-water instrumentation.",
      clientName: "Beryl Creek Food Products Corporation",
      clientReference: "BCF-RO-026",
      location: "Calamba, Laguna",
      siteAddress: "Calamba, Laguna, Philippines",
      projectManager: "Marco Dela Cruz",
      status: "ACTIVE",
      startDate: addDemoDays(anchorDate, -82),
      targetEndDate: addDemoDays(anchorDate, 93),
      contractValue: 9_360_000,
      projectBudget: 7_120_000,
      currency: "PHP",
      taxTreatment: "UNCLASSIFIED",
      notes: "Membrane package procurement is complete; field tie-ins are planned around the production schedule.",
      createdAt: demoTimestamp(addDemoDays(anchorDate, -90)),
      updatedAt,
    },
    {
      id: MARKETING_PROJECT_IDS.sanFernando,
      projectCode: "WTR-26-021",
      projectName: "San Fernando Commercial Center Water System Rehabilitation",
      description: "Rehabilitate booster pumps, storage controls and distribution piping serving a multi-building commercial site.",
      clientName: "Pinecross Commercial Properties, Inc.",
      clientReference: "PCP-SF-021",
      location: "San Fernando, Pampanga",
      siteAddress: "San Fernando, Pampanga, Philippines",
      projectManager: "Rafael Mendoza",
      status: "ACTIVE",
      startDate: addDemoDays(anchorDate, -61),
      targetEndDate: addDemoDays(anchorDate, 88),
      contractValue: 6_780_000,
      projectBudget: 5_210_000,
      currency: "PHP",
      taxTreatment: "UNCLASSIFIED",
      notes: "Booster replacement and plinth repairs are sequenced to keep the existing system available.",
      createdAt: demoTimestamp(addDemoDays(anchorDate, -69)),
      updatedAt,
    },
    {
      id: MARKETING_PROJECT_IDS.bacolod,
      projectCode: "WTR-26-008",
      projectName: "Bacolod Wastewater Treatment Recovery",
      description: "Recover aeration and clarification performance with targeted equipment renewal and civil repairs.",
      clientName: "Talewood Agro-Processing Corporation",
      clientReference: "TAP-BAC-008",
      location: "Bacolod City, Negros Occidental",
      siteAddress: "Bacolod City, Negros Occidental, Philippines",
      projectManager: "Sofia Ramos",
      status: "COMPLETED",
      startDate: addDemoDays(anchorDate, -238),
      targetEndDate: addDemoDays(anchorDate, -23),
      actualEndDate: addDemoDays(anchorDate, -17),
      contractValue: 8_940_000,
      projectBudget: 8_350_000,
      currency: "PHP",
      taxTreatment: "UNCLASSIFIED",
      notes: "Commissioning and handover records are retained with the project close-out.",
      createdAt: demoTimestamp(addDemoDays(anchorDate, -247)),
      updatedAt: demoTimestamp(addDemoDays(anchorDate, -17)),
    },
    {
      id: MARKETING_PROJECT_IDS.meycauayan,
      projectCode: "WTR-26-023",
      projectName: "Meycauayan Process Water Reuse Assessment",
      description: "Assess process-water recovery options and prepare a scoped reuse-system proposal for an industrial site.",
      clientName: "Arboridge Industrial Estates, Inc.",
      clientReference: "AIE-MEY-023",
      location: "Meycauayan, Bulacan",
      siteAddress: "Meycauayan, Bulacan, Philippines",
      projectManager: "Daniel Flores",
      status: "PLANNING",
      startDate: addDemoDays(anchorDate, -15),
      targetEndDate: addDemoDays(anchorDate, 58),
      contractValue: undefined,
      projectBudget: 1_250_000,
      currency: "PHP",
      taxTreatment: "UNCLASSIFIED",
      notes: "Pre-award planning record; no contract value has been recorded.",
      createdAt: demoTimestamp(addDemoDays(anchorDate, -19)),
      updatedAt,
    },
  ];

  return {
    projects,
    presentation: {
      [MARKETING_PROJECT_IDS.clark]: { progressPercent: 58, presentationNote: "Mechanical installation and controls tie-in are in progress." },
      [MARKETING_PROJECT_IDS.laguna]: { progressPercent: 41, presentationNote: "The RO train expansion is moving into planned field tie-ins." },
      [MARKETING_PROJECT_IDS.sanFernando]: { progressPercent: 67, presentationNote: "Booster replacement is coordinated with the live site schedule." },
      [MARKETING_PROJECT_IDS.bacolod]: { progressPercent: 100, presentationNote: "Completed project retained for close-out reference." },
      [MARKETING_PROJECT_IDS.meycauayan]: { progressPercent: 12, presentationNote: "Assessment scope is in planning; contract value is not recorded." },
    },
  };
}

function costCodeRecords(anchorDate: string): ProjectCostCode[] {
  const createdAt = demoTimestamp(addDemoDays(anchorDate, -90), 8, 0);
  const specs: Array<[string, string, string, number, number, ProjectCostCode["status"]]> = [
    [MARKETING_PROJECT_IDS.clark, "01-100", "Mobilization & Site Preparation", 350_000, 318_000, "ACTIVE"],
    [MARKETING_PROJECT_IDS.clark, "21-100", "Mechanical Equipment", 3_400_000, 3_180_000, "ACTIVE"],
    [MARKETING_PROJECT_IDS.clark, "22-100", "Piping & Fittings", 2_100_000, 1_940_000, "ACTIVE"],
    [MARKETING_PROJECT_IDS.clark, "26-100", "Electrical & Controls", 1_500_000, 1_420_000, "ACTIVE"],
    [MARKETING_PROJECT_IDS.clark, "40-100", "Testing & Commissioning", 700_000, 665_000, "ACTIVE"],
    [MARKETING_PROJECT_IDS.laguna, "21-180", "RO Plant & Membranes", 3_250_000, 3_080_000, "ACTIVE"],
    [MARKETING_PROJECT_IDS.laguna, "22-180", "Process Piping & Valves", 1_150_000, 1_060_000, "ACTIVE"],
    [MARKETING_PROJECT_IDS.laguna, "26-180", "Instrumentation & Controls", 860_000, 815_000, "ACTIVE"],
    [MARKETING_PROJECT_IDS.sanFernando, "21-210", "Booster & Dosing Equipment", 1_620_000, 1_540_000, "ACTIVE"],
    [MARKETING_PROJECT_IDS.sanFernando, "32-210", "Civil Works & Plinth Repairs", 780_000, 735_000, "ACTIVE"],
    [MARKETING_PROJECT_IDS.sanFernando, "40-210", "Testing & Commissioning", 520_000, 495_000, "ACTIVE"],
    [MARKETING_PROJECT_IDS.bacolod, "31-080", "Wastewater Process Equipment", 3_250_000, 3_105_000, "ARCHIVED"],
    [MARKETING_PROJECT_IDS.bacolod, "32-080", "Civil Works & Structural Repairs", 1_850_000, 1_790_000, "ARCHIVED"],
    [MARKETING_PROJECT_IDS.meycauayan, "20-230", "Process Water Assessment", 750_000, 620_000, "ACTIVE"],
  ];

  return specs.map(([projectId, code, name, approvedBudgetAmount, forecastAmount, status], index) => ({
    id: `marketing-cost-code-${String(index + 1).padStart(2, "0")}`,
    companyId: DEMO_COMPANY_ID,
    projectId,
    code,
    name,
    status,
    approvedBudgetAmount,
    forecastAmount,
    createdAt,
    updatedAt: demoTimestamp(anchorDate, 8, index),
  }));
}

function vendorRecords(anchorDate: string): Vendor[] {
  const createdAt = demoTimestamp(addDemoDays(anchorDate, -260));
  const updatedAt = demoTimestamp(anchorDate, 8, 30);
  const specs = [
    ["flowcrest", "Flowcrest Pump & Motor Supply", "Pumps & Motors", "Angeles City, Pampanga"],
    ["ridgepoint", "Ridgepoint Industrial Equipment Trading", "Mechanical Equipment", "Quezon City, Metro Manila"],
    ["streamwell", "Streamwell Filtration Supply", "Filtration Equipment", "Valenzuela City, Metro Manila"],
    ["polymark", "Polymark Pipe & Valve Supply", "Piping & Fittings", "San Fernando, Pampanga"],
    ["asteron", "Asteron Control Panel Works", "Electrical & Controls", "Pasig City, Metro Manila"],
    ["wellspring", "Wellspring Process Instrumentation", "Instrumentation", "Muntinlupa City, Metro Manila"],
    ["bluegate", "Bluegate Water Treatment Chemicals", "Water Treatment Chemicals", "Calamba, Laguna"],
    ["calibre", "Calibre Field Calibration Services", "Calibration & Service", "Mandaluyong City, Metro Manila"],
  ] as const;

  return specs.map(([key, name, defaultCategory, address]) => ({
    id: `marketing-vendor-${key}`,
    companyId: DEMO_COMPANY_ID,
    name,
    normalizedName: name.toLowerCase(),
    address,
    defaultCurrency: "PHP",
    defaultCategory,
    active: true,
    createdAt,
    updatedAt,
  }));
}

function expenseRecords(anchorDate: string): Expense[] {
  const specs: Array<{
    id: string; projectId: string; costCodeId: string; daysAgo: number; category: string; description: string;
    payee: string; vendorId?: string; supplierInvoiceId?: string; amount: number; status: Expense["status"]; paymentMethod?: string; referenceNumber: string;
  }> = [
    { id: "marketing-expense-clark-mobilization", projectId: MARKETING_PROJECT_IDS.clark, costCodeId: "marketing-cost-code-01", daysAgo: 21, category: "Mobilization", description: "Site mobilization and equipment hauling", payee: "Project Site Team", amount: 148_000, status: "PAID", paymentMethod: "Bank Transfer", referenceNumber: "SITE-2609-041" },
    { id: "marketing-expense-clark-piping", projectId: MARKETING_PROJECT_IDS.clark, costCodeId: "marketing-cost-code-03", daysAgo: 13, category: "Piping & Fittings", description: "UPVC Sch. 80 piping and fittings — treatment room", payee: "Polymark Pipe & Valve Supply", vendorId: "marketing-vendor-polymark", amount: 386_400, status: "APPROVED", referenceNumber: "PPV-2609-118" },
    { id: "marketing-expense-clark-electrical", projectId: MARKETING_PROJECT_IDS.clark, costCodeId: "marketing-cost-code-04", daysAgo: 5, category: "Electrical & Controls", description: "Cable trays and field control wiring", payee: "Asteron Control Panel Works", vendorId: "marketing-vendor-asteron", amount: 276_800, status: "DRAFT", referenceNumber: "ACP-2609-052" },
    { id: "marketing-expense-clark-flow-meter", projectId: MARKETING_PROJECT_IDS.clark, costCodeId: "marketing-cost-code-04", daysAgo: 5, category: "Water Treatment Equipment", description: "Magnetic flow meter and remote transmitter", payee: "Wellspring Process Instrumentation", vendorId: "marketing-vendor-wellspring", amount: 286_500, status: "APPROVED", referenceNumber: "WPI-2609-502", supplierInvoiceId: MARKETING_INVOICE_IDS.flowMeter },
    { id: "marketing-expense-laguna-media", projectId: MARKETING_PROJECT_IDS.laguna, costCodeId: "marketing-cost-code-06", daysAgo: 17, category: "Water Treatment Media", description: "Activated carbon replacement media for pretreatment train", payee: "Bluegate Water Treatment Chemicals", vendorId: "marketing-vendor-bluegate", amount: 124_500, status: "APPROVED", referenceNumber: "BWC-2609-033" },
    { id: "marketing-expense-laguna-sampling", projectId: MARKETING_PROJECT_IDS.laguna, costCodeId: "marketing-cost-code-08", daysAgo: 3, category: "Testing & Commissioning", description: "Process-water sampling and bench analysis", payee: "Calibre Field Calibration Services", vendorId: "marketing-vendor-calibre", amount: 92_400, status: "DRAFT", referenceNumber: "CFC-2609-077" },
    { id: "marketing-expense-sanfernando-civil", projectId: MARKETING_PROJECT_IDS.sanFernando, costCodeId: "marketing-cost-code-10", daysAgo: 12, category: "Civil Works", description: "Booster-pump plinth repairs and grout replacement", payee: "Project Site Team", amount: 218_500, status: "APPROVED", referenceNumber: "SITE-2609-028" },
    { id: "marketing-expense-bacolod-electrical", projectId: MARKETING_PROJECT_IDS.bacolod, costCodeId: "marketing-cost-code-12", daysAgo: 35, category: "Mechanical Equipment", description: "Aeration blower motor and drive overhaul", payee: "Asteron Control Panel Works", vendorId: "marketing-vendor-asteron", amount: 266_500, status: "PAID", paymentMethod: "Bank Transfer", referenceNumber: "ACP-2608-194" },
  ];

  return specs.map((spec) => {
    const expenseDate = addDemoDays(anchorDate, -spec.daysAgo);
    const timestamp = demoTimestamp(expenseDate, 10, 15);
    return {
      id: spec.id,
      projectId: spec.projectId,
      projectCostCodeId: spec.costCodeId,
      expenseDate,
      category: spec.category,
      description: spec.description,
      payee: spec.payee,
      ...(spec.vendorId ? { vendorId: spec.vendorId } : {}),
      ...(spec.supplierInvoiceId ? { supplierInvoiceId: spec.supplierInvoiceId } : {}),
      amount: spec.amount,
      currency: "PHP",
      ...(spec.paymentMethod ? { paymentMethod: spec.paymentMethod } : {}),
      referenceNumber: spec.referenceNumber,
      status: spec.status,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
  });
}

const VENDOR_IDS = {
  flowcrest: "marketing-vendor-flowcrest",
  ridgepoint: "marketing-vendor-ridgepoint",
  streamwell: "marketing-vendor-streamwell",
  polymark: "marketing-vendor-polymark",
  asteron: "marketing-vendor-asteron",
  wellspring: "marketing-vendor-wellspring",
  bluegate: "marketing-vendor-bluegate",
  calibre: "marketing-vendor-calibre",
} as const;

function rfqRecords(anchorDate: string): RFQ[] {
  const invitation = (rfqId: string, vendorId: string, daysAgo: number) => ({
    id: `${rfqId}-invite-${vendorId}`,
    companyId: DEMO_COMPANY_ID,
    rfqId,
    vendorId,
    invitedAt: demoTimestamp(addDemoDays(anchorDate, -daysAgo)),
    createdAt: demoTimestamp(addDemoDays(anchorDate, -daysAgo)),
  });

  const boosterId = MARKETING_PROCUREMENT_IDS.boosterRfq;
  const membranesId = MARKETING_PROCUREMENT_IDS.membranesRfq;
  const analyzerId = MARKETING_PROCUREMENT_IDS.analyzerRfq;
  const pipingId = MARKETING_PROCUREMENT_IDS.pipingRfq;
  return [
    {
      id: boosterId,
      companyId: DEMO_COMPANY_ID,
      rfqNumber: "RFQ-WTR-26-008",
      title: "San Fernando booster pump package",
      description: "Supply of vertical multistage booster pumps and pressure gauge assemblies.",
      projectId: MARKETING_PROJECT_IDS.sanFernando,
      currency: "PHP",
      status: "CLOSED",
      issueDate: addDemoDays(anchorDate, -29),
      dueDate: addDemoDays(anchorDate, -20),
      selectedQuotationId: MARKETING_PROCUREMENT_IDS.boosterQuote,
      lines: [{ id: `${boosterId}-line-1`, companyId: DEMO_COMPANY_ID, rfqId: boosterId, lineNumber: 1, description: "Two booster pumps with pressure gauge and isolation valve assemblies", quantity: 1, unit: "package", projectCostCodeId: "marketing-cost-code-09", requestedDeliveryDate: addDemoDays(anchorDate, 14) }],
      invitedVendorIds: [VENDOR_IDS.flowcrest, VENDOR_IDS.ridgepoint],
      invitedVendors: [invitation(boosterId, VENDOR_IDS.flowcrest, 29), invitation(boosterId, VENDOR_IDS.ridgepoint, 29)],
      issuedAt: demoTimestamp(addDemoDays(anchorDate, -29)),
      closedAt: demoTimestamp(addDemoDays(anchorDate, -19)),
      createdAt: demoTimestamp(addDemoDays(anchorDate, -31)),
      updatedAt: demoTimestamp(addDemoDays(anchorDate, -19)),
    },
    {
      id: membranesId,
      companyId: DEMO_COMPANY_ID,
      rfqNumber: "RFQ-WTR-26-011",
      title: "Laguna RO membrane and housing package",
      description: "Membrane elements and pressure housings for the second reverse-osmosis train.",
      projectId: MARKETING_PROJECT_IDS.laguna,
      currency: "PHP",
      status: "CLOSED",
      issueDate: addDemoDays(anchorDate, -21),
      dueDate: addDemoDays(anchorDate, -13),
      selectedQuotationId: MARKETING_PROCUREMENT_IDS.membranesQuote,
      lines: [{ id: `${membranesId}-line-1`, companyId: DEMO_COMPANY_ID, rfqId: membranesId, lineNumber: 1, description: "RO membrane elements and 8-inch pressure housing assemblies", quantity: 1, unit: "package", projectCostCodeId: "marketing-cost-code-06", requestedDeliveryDate: addDemoDays(anchorDate, 24) }],
      invitedVendorIds: [VENDOR_IDS.streamwell, VENDOR_IDS.ridgepoint],
      invitedVendors: [invitation(membranesId, VENDOR_IDS.streamwell, 21), invitation(membranesId, VENDOR_IDS.ridgepoint, 21)],
      issuedAt: demoTimestamp(addDemoDays(anchorDate, -21)),
      closedAt: demoTimestamp(addDemoDays(anchorDate, -12)),
      createdAt: demoTimestamp(addDemoDays(anchorDate, -23)),
      updatedAt: demoTimestamp(addDemoDays(anchorDate, -12)),
    },
    {
      id: analyzerId,
      companyId: DEMO_COMPANY_ID,
      rfqNumber: "RFQ-WTR-26-014",
      title: "Process water quality analyzer package",
      description: "Inline pH and conductivity analyzers with installation accessories.",
      projectId: MARKETING_PROJECT_IDS.clark,
      currency: "PHP",
      status: "CLOSED",
      issueDate: addDemoDays(anchorDate, -11),
      dueDate: addDemoDays(anchorDate, -5),
      selectedQuotationId: MARKETING_PROCUREMENT_IDS.analyzerQuote,
      lines: [{ id: `${analyzerId}-line-1`, companyId: DEMO_COMPANY_ID, rfqId: analyzerId, lineNumber: 1, description: "Inline pH and conductivity analyzer set", quantity: 2, unit: "set", projectCostCodeId: "marketing-cost-code-04", requestedDeliveryDate: addDemoDays(anchorDate, 31) }],
      invitedVendorIds: [VENDOR_IDS.wellspring, VENDOR_IDS.calibre],
      invitedVendors: [invitation(analyzerId, VENDOR_IDS.wellspring, 11), invitation(analyzerId, VENDOR_IDS.calibre, 11)],
      issuedAt: demoTimestamp(addDemoDays(anchorDate, -11)),
      closedAt: demoTimestamp(addDemoDays(anchorDate, -4)),
      createdAt: demoTimestamp(addDemoDays(anchorDate, -13)),
      updatedAt: demoTimestamp(addDemoDays(anchorDate, -4)),
    },
    {
      id: pipingId,
      companyId: DEMO_COMPANY_ID,
      rfqNumber: "RFQ-WTR-26-016",
      title: "Clark treatment-room piping package",
      description: "Schedule 80 UPVC piping, fittings and isolation valves for the treatment-room tie-in.",
      projectId: MARKETING_PROJECT_IDS.clark,
      currency: "PHP",
      status: "ISSUED",
      issueDate: addDemoDays(anchorDate, -3),
      dueDate: addDemoDays(anchorDate, 8),
      lines: [{ id: `${pipingId}-line-1`, companyId: DEMO_COMPANY_ID, rfqId: pipingId, lineNumber: 1, description: "UPVC Sch. 80 piping and fittings", quantity: 1, unit: "lot", projectCostCodeId: "marketing-cost-code-03", requestedDeliveryDate: addDemoDays(anchorDate, 28) }],
      invitedVendorIds: [VENDOR_IDS.polymark, VENDOR_IDS.ridgepoint],
      invitedVendors: [invitation(pipingId, VENDOR_IDS.polymark, 3), invitation(pipingId, VENDOR_IDS.ridgepoint, 3)],
      issuedAt: demoTimestamp(addDemoDays(anchorDate, -3)),
      createdAt: demoTimestamp(addDemoDays(anchorDate, -5)),
      updatedAt: demoTimestamp(addDemoDays(anchorDate, -3)),
    },
  ];
}

function quotationRecords(anchorDate: string): SupplierQuotation[] {
  const boosterRfq = MARKETING_PROCUREMENT_IDS.boosterRfq;
  const membranesRfq = MARKETING_PROCUREMENT_IDS.membranesRfq;
  const analyzerRfq = MARKETING_PROCUREMENT_IDS.analyzerRfq;
  const quotation = (input: {
    id: string; rfqId: string; vendorId: string; number: string; daysAgo: number; total: number;
    status: SupplierQuotation["status"]; description: string; quantity: number; unit: string; unitPrice: number;
    selected?: boolean;
  }): SupplierQuotation => {
    const quotationDate = addDemoDays(anchorDate, -input.daysAgo);
    const lineId = `${input.id}-line-1`;
    const line = {
      id: lineId,
      companyId: DEMO_COMPANY_ID,
      quotationId: input.id,
      rfqLineId: `${input.rfqId}-line-1`,
      lineNumber: 1,
      description: input.description,
      quantity: input.quantity,
      unit: input.unit,
      unitPrice: input.unitPrice,
      amount: input.total,
      createdAt: demoTimestamp(quotationDate),
      updatedAt: demoTimestamp(quotationDate),
    };
    return {
      id: input.id,
      companyId: DEMO_COMPANY_ID,
      rfqId: input.rfqId,
      vendorId: input.vendorId,
      quotationNumber: input.number,
      quotationDate,
      validUntil: addDemoDays(anchorDate, 18),
      currency: "PHP",
      paymentTerms: "Net 30",
      deliveryTerms: "Delivery to project site",
      leadTimeDays: 14,
      totalAmount: input.total,
      status: input.status,
      ...(input.selected ? {
        selectedAt: demoTimestamp(addDemoDays(anchorDate, -(input.daysAgo - 1))),
        selectedByUserId: "demo-user-procurement",
        selectionReason: "Selected following scope and commercial review.",
      } : {}),
      lines: [line],
      createdByUserId: "demo-user-procurement",
      createdAt: demoTimestamp(quotationDate),
      updatedAt: demoTimestamp(addDemoDays(anchorDate, input.selected ? -(input.daysAgo - 1) : -10)),
    };
  };

  return [
    quotation({ id: MARKETING_PROCUREMENT_IDS.boosterQuote, rfqId: boosterRfq, vendorId: VENDOR_IDS.flowcrest, number: "FPM-Q-2608-214", daysAgo: 23, total: 448_000, status: "SELECTED", description: "3 HP booster pump package", quantity: 1, unit: "package", unitPrice: 448_000, selected: true }),
    quotation({ id: MARKETING_PROCUREMENT_IDS.boosterAlternateQuote, rfqId: boosterRfq, vendorId: VENDOR_IDS.ridgepoint, number: "RIE-Q-2608-091", daysAgo: 22, total: 463_500, status: "REJECTED", description: "3 HP booster pump package", quantity: 1, unit: "package", unitPrice: 463_500 }),
    quotation({ id: MARKETING_PROCUREMENT_IDS.membranesQuote, rfqId: membranesRfq, vendorId: VENDOR_IDS.streamwell, number: "SFS-Q-2609-063", daysAgo: 15, total: 1_216_000, status: "SELECTED", description: "RO membrane elements and pressure housings", quantity: 1, unit: "package", unitPrice: 1_216_000, selected: true }),
    quotation({ id: MARKETING_PROCUREMENT_IDS.membranesAlternateQuote, rfqId: membranesRfq, vendorId: VENDOR_IDS.ridgepoint, number: "RIE-Q-2609-044", daysAgo: 14, total: 1_254_000, status: "REJECTED", description: "RO membrane elements and pressure housings", quantity: 1, unit: "package", unitPrice: 1_254_000 }),
    quotation({ id: MARKETING_PROCUREMENT_IDS.analyzerQuote, rfqId: analyzerRfq, vendorId: VENDOR_IDS.wellspring, number: "WPI-Q-2609-118", daysAgo: 6, total: 517_500, status: "SELECTED", description: "Inline pH and conductivity analyzer set", quantity: 2, unit: "set", unitPrice: 258_750, selected: true }),
    quotation({ id: MARKETING_PROCUREMENT_IDS.analyzerAlternateQuote, rfqId: analyzerRfq, vendorId: VENDOR_IDS.calibre, number: "CFC-Q-2609-083", daysAgo: 5, total: 529_000, status: "REJECTED", description: "Inline pH and conductivity analyzer set", quantity: 2, unit: "set", unitPrice: 264_500 }),
  ];
}

function purchaseOrderRecords(anchorDate: string): PurchaseOrder[] {
  const createdAt = (daysAgo: number) => demoTimestamp(addDemoDays(anchorDate, -daysAgo));
  const boosterId = MARKETING_PROCUREMENT_IDS.boosterPo;
  const membranesId = MARKETING_PROCUREMENT_IDS.membranesPo;
  const analyzerId = MARKETING_PROCUREMENT_IDS.analyzerPo;
  const lines = (poId: string, input: Array<{ id: string; number: number; description: string; quantity: number; unit: string; unitPrice: number; costCodeId: string }>, daysAgo: number) => input.map((line) => ({
    id: line.id,
    companyId: DEMO_COMPANY_ID,
    purchaseOrderId: poId,
    lineNumber: line.number,
    description: line.description,
    quantity: line.quantity,
    unit: line.unit,
    unitPrice: line.unitPrice,
    amount: Math.round(line.quantity * line.unitPrice * 100) / 100,
    projectCostCodeId: line.costCodeId,
    createdAt: createdAt(daysAgo),
    updatedAt: createdAt(daysAgo),
  }));

  return [
    {
      id: boosterId,
      companyId: DEMO_COMPANY_ID,
      poNumber: "PO-WTR-26-006",
      vendorId: VENDOR_IDS.flowcrest,
      projectId: MARKETING_PROJECT_IDS.sanFernando,
      currency: "PHP",
      status: "ISSUED",
      issueDate: addDemoDays(anchorDate, -15),
      description: "3 HP vertical multistage booster pump package",
      notes: "Issued against the selected quotation for the San Fernando rehabilitation.",
      totalAmount: 448_000,
      rfqId: MARKETING_PROCUREMENT_IDS.boosterRfq,
      supplierQuotationId: MARKETING_PROCUREMENT_IDS.boosterQuote,
      lines: lines(boosterId, [
        { id: `${boosterId}-line-1`, number: 1, description: "3 HP vertical multistage booster pump with stainless-steel wetted parts", quantity: 2, unit: "set", unitPrice: 174_000, costCodeId: "marketing-cost-code-09" },
        { id: `${boosterId}-line-2`, number: 2, description: "Pressure gauge and isolation valve assembly", quantity: 2, unit: "set", unitPrice: 50_000, costCodeId: "marketing-cost-code-09" },
      ], 16),
      createdByUserId: "demo-user-procurement",
      updatedByUserId: "demo-user-procurement",
      approvedByUserId: "demo-user-procurement",
      issuedByUserId: "demo-user-procurement",
      createdAt: createdAt(18),
      updatedAt: createdAt(15),
      approvedAt: createdAt(16),
      issuedAt: createdAt(15),
    },
    {
      id: membranesId,
      companyId: DEMO_COMPANY_ID,
      poNumber: "PO-WTR-26-009",
      vendorId: VENDOR_IDS.streamwell,
      projectId: MARKETING_PROJECT_IDS.laguna,
      currency: "PHP",
      status: "ISSUED",
      issueDate: addDemoDays(anchorDate, -9),
      description: "RO membrane elements and pressure housing assemblies",
      notes: "Issued against the selected quotation for the Laguna RO expansion.",
      totalAmount: 1_216_000,
      rfqId: MARKETING_PROCUREMENT_IDS.membranesRfq,
      supplierQuotationId: MARKETING_PROCUREMENT_IDS.membranesQuote,
      lines: lines(membranesId, [
        { id: `${membranesId}-line-1`, number: 1, description: "8-inch spiral-wound RO membrane element", quantity: 4, unit: "pc", unitPrice: 86_500, costCodeId: "marketing-cost-code-06" },
        { id: `${membranesId}-line-2`, number: 2, description: "8-inch membrane pressure housing assembly", quantity: 2, unit: "set", unitPrice: 435_000, costCodeId: "marketing-cost-code-06" },
      ], 10),
      createdByUserId: "demo-user-procurement",
      updatedByUserId: "demo-user-procurement",
      approvedByUserId: "demo-user-procurement",
      issuedByUserId: "demo-user-procurement",
      createdAt: createdAt(12),
      updatedAt: createdAt(9),
      approvedAt: createdAt(10),
      issuedAt: createdAt(9),
    },
    {
      id: analyzerId,
      companyId: DEMO_COMPANY_ID,
      poNumber: "PO-WTR-26-012",
      vendorId: VENDOR_IDS.wellspring,
      projectId: MARKETING_PROJECT_IDS.clark,
      currency: "PHP",
      status: "DRAFT",
      issueDate: null,
      description: "Inline pH and conductivity analyzer package",
      notes: "Draft prepared from the selected quotation; approval and issue remain pending.",
      totalAmount: 517_500,
      rfqId: MARKETING_PROCUREMENT_IDS.analyzerRfq,
      supplierQuotationId: MARKETING_PROCUREMENT_IDS.analyzerQuote,
      lines: lines(analyzerId, [
        { id: `${analyzerId}-line-1`, number: 1, description: "Inline pH and conductivity analyzer set", quantity: 2, unit: "set", unitPrice: 258_750, costCodeId: "marketing-cost-code-04" },
      ], 2),
      createdByUserId: "demo-user-procurement",
      updatedByUserId: "demo-user-procurement",
      createdAt: createdAt(2),
      updatedAt: createdAt(1),
    },
  ];
}

function invoiceRecord(input: {
  id: string; number: string; vendorId: string; vendorName: string; vendorAddress: string; projectCode: string;
  projectName: string; daysAgo: number; total: number; description: string; lines: Array<{ description: string; quantity: number; unit: string; unitPrice: number }>;
  purchaseOrderNumber?: string; previewUrl: string; anchorDate: string;
}): InvoiceData {
  const invoiceDate = addDemoDays(input.anchorDate, -input.daysAgo);
  const items = input.lines.map((line, index) => ({
    id: `${input.id}-line-${index + 1}`,
    itemNumber: index + 1,
    description: line.description,
    quantity: line.quantity,
    unitOfMeasure: line.unit,
    unitPrice: line.unitPrice,
    total: Math.round(line.quantity * line.unitPrice * 100) / 100,
    taxTreatment: "UNKNOWN" as const,
    taxRate: null,
    taxAmount: null,
  }));
  const extractedAt = demoTimestamp(addDemoDays(invoiceDate, 1), 10, 20);
  return {
    id: input.id,
    fileName: `${input.number}.svg`,
    fileType: "image/svg+xml",
    previewUrl: input.previewUrl,
    documentType: "INVOICE",
    invoiceSubtype: "UNKNOWN",
    sourceType: "SAMPLE",
    processingStatus: "EXTRACTED",
    reviewStatus: "NEEDS_REVIEW",
    duplicateStatus: "UNIQUE",
    invoiceNumber: input.number,
    invoiceDate,
    dueDate: addDemoDays(invoiceDate, 30),
    ...(input.purchaseOrderNumber ? { purchaseOrderNumber: input.purchaseOrderNumber } : {}),
    projectReference: input.projectCode,
    currency: "PHP",
    currencySymbol: "₱",
    paymentTerms: "Net 30",
    status: "UNPAID",
    vendor: {
      name: input.vendorName,
      vendorId: input.vendorId,
      address: input.vendorAddress,
      city: input.vendorAddress.split(",")[0],
      province: input.vendorAddress.split(",").slice(1).join(",").trim(),
      country: "Philippines",
      taxRegistration: "UNKNOWN",
    },
    customer: {
      name: "Silverfern Water Systems Corporation",
      registeredName: "Silverfern Water Systems Corporation",
      address: "Pasig City, Metro Manila, Philippines",
      city: "Pasig City",
      province: "Metro Manila",
      country: "Philippines",
    },
    items,
    subtotal: null,
    totalTax: null,
    grandTotal: input.total,
    amountPaid: 0,
    amountDue: input.total,
    balanceDue: input.total,
    description: input.description,
    notes: `Project: ${input.projectName}`,
    category: "Water Treatment Equipment",
    costCenter: input.projectName,
    extractedAt,
    modelUsed: "Prepared source review data",
    financialSemantics: {
      unitPriceBasis: "UNKNOWN",
      lineTotalBasis: "UNKNOWN",
      subtotalBasis: "UNKNOWN",
      taxInclusion: "UNKNOWN",
      discountIncludedInSubtotal: null,
      payableBasis: "GROSS_INVOICE",
      determination: "EXPLICIT",
    },
    financialFieldStatus: {
      grandTotal: "KNOWN",
      amountDue: "KNOWN",
      totalTax: "UNKNOWN",
      subtotal: "UNKNOWN",
    },
    lifecycleStatus: "ACTIVE",
    updatedAt: extractedAt,
  };
}

function invoiceRecords(anchorDate: string): { invoices: InvoiceData[]; allocations: InvoiceProjectAllocation[] } {
  const invoices = [
    invoiceRecord({
      id: MARKETING_INVOICE_IDS.boosterPump,
      number: "FPM-2609-184",
      vendorId: VENDOR_IDS.flowcrest,
      vendorName: "Flowcrest Pump & Motor Supply",
      vendorAddress: "Angeles City, Pampanga",
      projectCode: "WTR-26-021",
      projectName: "San Fernando Commercial Center Water System Rehabilitation",
      daysAgo: 11,
      total: 448_000,
      description: "3 HP vertical multistage booster pump package",
      purchaseOrderNumber: "PO-WTR-26-006",
      previewUrl: "/demo/marketing-invoices/FPM-2609-184.svg",
      anchorDate,
      lines: [
        { description: "3 HP multistage booster pump set", quantity: 2, unit: "set", unitPrice: 174_000 },
        { description: "Pressure gauge and isolation valve assembly", quantity: 2, unit: "set", unitPrice: 50_000 },
      ],
    }),
    invoiceRecord({
      id: MARKETING_INVOICE_IDS.roMembranes,
      number: "SFS-2609-771",
      vendorId: VENDOR_IDS.streamwell,
      vendorName: "Streamwell Filtration Supply",
      vendorAddress: "Valenzuela City, Metro Manila",
      projectCode: "WTR-26-018",
      projectName: "Laguna Food Plant RO Expansion",
      daysAgo: 8,
      total: 1_216_000,
      description: "RO membrane elements and pressure housing assemblies",
      purchaseOrderNumber: "PO-WTR-26-009",
      previewUrl: "/demo/marketing-invoices/SFS-2609-771.svg",
      anchorDate,
      lines: [
        { description: "8-inch spiral-wound RO membrane element", quantity: 4, unit: "pc", unitPrice: 86_500 },
        { description: "8-inch membrane pressure housing assembly", quantity: 2, unit: "set", unitPrice: 435_000 },
      ],
    }),
    invoiceRecord({
      id: MARKETING_INVOICE_IDS.flowMeter,
      number: "WPI-2609-502",
      vendorId: VENDOR_IDS.wellspring,
      vendorName: "Wellspring Process Instrumentation",
      vendorAddress: "Muntinlupa City, Metro Manila",
      projectCode: "WTR-26-014",
      projectName: "Clark Industrial Water Treatment Upgrade",
      daysAgo: 5,
      total: 286_500,
      description: "Magnetic flow meter and remote transmitter",
      previewUrl: "/demo/marketing-invoices/WPI-2609-502.svg",
      anchorDate,
      lines: [{ description: "Magnetic flow meter with remote transmitter", quantity: 1, unit: "set", unitPrice: 286_500 }],
    }),
  ];
  const flowMeterInvoice = invoices.find((invoice) => invoice.id === MARKETING_INVOICE_IDS.flowMeter);
  if (flowMeterInvoice) {
    flowMeterInvoice.reviewStatus = "VERIFIED";
    flowMeterInvoice.linkedExpenseId = "marketing-expense-clark-flow-meter";
    flowMeterInvoice.verifiedAt = demoTimestamp(addDemoDays(flowMeterInvoice.invoiceDate, 2), 14, 30);
  }
  const allocations: InvoiceProjectAllocation[] = [{
    id: "marketing-invoice-allocation-flow-meter",
    invoiceId: MARKETING_INVOICE_IDS.flowMeter,
    projectId: MARKETING_PROJECT_IDS.clark,
    projectCostCodeId: "marketing-cost-code-04",
    allocationType: "AMOUNT",
    allocationAmount: 286_500,
    notes: "Confirmed to project WTR-26-014 during source review.",
    createdAt: demoTimestamp(addDemoDays(anchorDate, -3), 14, 30),
    updatedAt: demoTimestamp(addDemoDays(anchorDate, -3), 14, 30),
  }];
  return { invoices, allocations };
}

export function createMarketingDemoWorkspace(anchorDate = MARKETING_DEMO_ANCHOR_DATE): DemoWorkspaceData {
  const base = createDemoWorkspace(anchorDate);
  const projectData = projectRecords(anchorDate);
  const invoiceData = invoiceRecords(anchorDate);
  const projects = projectData.projects;
  const costCodes = costCodeRecords(anchorDate);
  const vendors = vendorRecords(anchorDate);

  return {
    ...base,
    company: {
      ...base.company,
      name: "Silverfern Water Systems Corporation",
      industry: "Water Treatment & Process Engineering",
      address: "Pasig City, Metro Manila, Philippines",
      registrationNumber: "",
      taxId: "",
    },
    projects,
    costCodes,
    projectPresentation: projectData.presentation,
    payroll: emptyWorkspaceCollections(base.payroll),
    engineering: emptyWorkspaceCollections(base.engineering),
    coordination: emptyWorkspaceCollections(base.coordination),
    siteLogs: emptyWorkspaceCollections(base.siteLogs),
    materials: [],
    equipment: [],
    inventoryItems: [],
    inventoryMovements: [],
    invoices: invoiceData.invoices,
    invoiceAllocations: invoiceData.allocations,
    expenses: expenseRecords(anchorDate),
    cash: { accounts: [], snapshots: [], transactions: [], importBatches: [], matches: [] },
    vendors,
    purchaseOrders: purchaseOrderRecords(anchorDate),
    purchaseOrderReceipts: [],
    purchaseOrderMatches: [],
    rfqs: rfqRecords(anchorDate),
    supplierQuotations: quotationRecords(anchorDate),
    subcontracts: [],
    subcontractClaims: [],
    subcontractVariations: [],
    clientBillings: [],
    clientBillingEvents: [],
    clientCollections: [],
    clientCollectionEvents: [],
  };
}
