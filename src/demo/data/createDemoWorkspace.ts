import type { DemoWorkspaceData } from "../demoTypes.ts";
import { DEMO_COMPANY_ID } from "../demoTypes.ts";
import { defaultDemoAnchorDate, demoTimestamp } from "./demoDates.ts";
import { createDemoProjects } from "./projects.ts";
import { createDemoInvoices } from "./invoices.ts";
import { createDemoExpenses, createDemoCashBanking } from "./financial.ts";
import { enrichDemoCashWithSettlements } from "./settlements.ts";
import { createDemoPayroll } from "./workforcePayroll.ts";
import { createDemoEngineeringDocuments } from "./engineeringDocuments.ts";
import { createDemoEngineeringCoordination } from "./engineeringCoordination.ts";
import { createDemoDailySiteLogs } from "./dailySiteLogs.ts";
import { createDemoEquipment, createDemoMaterials } from "./materialsEquipment.ts";
import { createDemoPurchaseOrderMatches, createDemoPurchaseOrders, createDemoPurchaseOrderReceipts, createDemoRFQs, createDemoSubcontractClaims, createDemoSubcontracts, createDemoSubcontractVariations, createDemoSupplierQuotations, createDemoVendors } from "./procurement.ts";
import { createDemoClientBillings } from "./clientBillings.ts";
import { createDemoClientCollections } from "./clientCollections.ts";
import type { FinancialFxSnapshot } from "../../types.ts";

const DEMO_OVERTIME_QUEUE_STATUSES = ["PENDING", "PENDING", "REJECTED", "CANCELLED", "PENDING"] as const;

export function createDemoWorkspace(anchorDate = defaultDemoAnchorDate()): DemoWorkspaceData {
  const projectData = createDemoProjects(anchorDate);
  const invoiceData = createDemoInvoices(anchorDate);
  const payroll = createDemoPayroll(anchorDate);
  const expenses = createDemoExpenses(anchorDate);
  const fxTimestamp = demoTimestamp(anchorDate, 11, 45);
  const financialFxSnapshots: FinancialFxSnapshot[] = [{
    id: "demo-fx-expense-19",
    companyId: DEMO_COMPANY_ID,
    sourceType: "EXPENSE",
    sourceId: "demo-expense-19",
    sourceAmount: 11.72,
    sourceCurrency: "USD",
    baseCurrency: "PHP",
    rate: 56.25,
    rateDate: anchorDate,
    rateSource: "MANUAL",
    note: "Demo-approved manual reporting rate.",
    enteredByUserId: "demo-user-finance",
    confirmedAt: fxTimestamp,
    createdAt: fxTimestamp,
    baseAmount: 659.25,
  }];

  // The public demo deliberately keeps explicit OT requests in the human-review
  // queue because the production domain does not assume a statutory multiplier.
  // Approved overtime cost is still demonstrated through approved work entries,
  // which carry an explicit overtime rate and therefore exercise the real payroll
  // calculation path without manufacturing an unsupported rule.
  payroll.overtimeRequests = (payroll.overtimeRequests || []).map((request, index) => ({
    ...request,
    status: DEMO_OVERTIME_QUEUE_STATUSES[index] || "PENDING",
    approvedMinutes: 0,
    approvedBy: undefined,
    approvedAt: undefined,
    notes: request.notes || "Demo approval queue item — overtime is not costed until explicitly approved with an applicable rate.",
  }));

  return {
    version: 1,
    anchorDate,
    company: {
      id: DEMO_COMPANY_ID,
      name: "HydroQualiSense Solutions Corp.",
      country: "Philippines",
      currency: "PHP",
      locale: "en-PH",
      timezone: "Asia/Manila",
      industry: "General Engineering / Construction",
      registrationNumber: "CS-DEMO-2019-04182",
      taxId: "777-823-517-000",
      address: "01 Pasong Tulo, Santa Rita Bata, San Miguel, Bulacan",
    },
    projects: projectData.projects,
    costCodes: projectData.costCodes,
    projectPresentation: projectData.presentation,
    invoices: invoiceData.invoices,
    invoiceAllocations: invoiceData.allocations,
    expenses,
    financialFxSnapshots,
    cash: enrichDemoCashWithSettlements(createDemoCashBanking(anchorDate), anchorDate),
    payroll,
    engineering: createDemoEngineeringDocuments(anchorDate),
    coordination: createDemoEngineeringCoordination(anchorDate),
    siteLogs: createDemoDailySiteLogs(anchorDate),
    materials: createDemoMaterials(anchorDate),
    equipment: createDemoEquipment(anchorDate),
    vendors: createDemoVendors(anchorDate),
    purchaseOrders: createDemoPurchaseOrders(anchorDate),
    purchaseOrderReceipts: createDemoPurchaseOrderReceipts(anchorDate),
    purchaseOrderMatches: createDemoPurchaseOrderMatches(anchorDate),
    rfqs: createDemoRFQs(anchorDate),
    supplierQuotations: createDemoSupplierQuotations(anchorDate),
    subcontracts: createDemoSubcontracts(anchorDate),
    subcontractClaims: createDemoSubcontractClaims(anchorDate),
    subcontractVariations: createDemoSubcontractVariations(anchorDate),
    ...createDemoClientBillings(anchorDate),
    ...createDemoClientCollections(anchorDate),
  };
}
