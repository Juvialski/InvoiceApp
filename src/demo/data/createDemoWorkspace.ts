import type { DemoWorkspaceData } from "../demoTypes.ts";
import { DEMO_COMPANY_ID } from "../demoTypes.ts";
import { defaultDemoAnchorDate } from "./demoDates.ts";
import { createDemoProjects } from "./projects.ts";
import { createDemoInvoices } from "./invoices.ts";
import { createDemoExpenses, createDemoCashBanking } from "./financial.ts";
import { createDemoPayroll } from "./workforcePayroll.ts";
import { createDemoEngineeringDocuments } from "./engineeringDocuments.ts";

const DEMO_OVERTIME_QUEUE_STATUSES = ["PENDING", "PENDING", "REJECTED", "CANCELLED", "PENDING"] as const;

export function createDemoWorkspace(anchorDate = defaultDemoAnchorDate()): DemoWorkspaceData {
  const projectData = createDemoProjects(anchorDate);
  const invoiceData = createDemoInvoices(anchorDate);
  const payroll = createDemoPayroll(anchorDate);

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
      name: "Meridian Engineering & Construction Corp.",
      country: "Philippines",
      currency: "PHP",
      locale: "en-PH",
      timezone: "Asia/Manila",
      industry: "General Engineering / Construction",
      registrationNumber: "CS-DEMO-2019-04182",
      taxId: "009-847-215-000",
      address: "18 Meridian Drive, Brgy. Bagumbayan, Quezon City, Metro Manila",
    },
    projects: projectData.projects,
    projectPresentation: projectData.presentation,
    invoices: invoiceData.invoices,
    invoiceAllocations: invoiceData.allocations,
    expenses: createDemoExpenses(anchorDate),
    cash: createDemoCashBanking(anchorDate),
    payroll,
    engineering: createDemoEngineeringDocuments(anchorDate),
  };
}
