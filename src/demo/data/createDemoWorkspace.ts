import type { DemoWorkspaceData } from "../demoTypes.ts";
import { DEMO_COMPANY_ID } from "../demoTypes.ts";
import { defaultDemoAnchorDate } from "./demoDates.ts";
import { createDemoProjects } from "./projects.ts";
import { createDemoInvoices } from "./invoices.ts";
import { createDemoExpenses, createDemoCashBanking } from "./financial.ts";
import { createDemoPayroll } from "./workforcePayroll.ts";
import { createDemoEngineeringDocuments } from "./engineeringDocuments.ts";

export function createDemoWorkspace(anchorDate = defaultDemoAnchorDate()): DemoWorkspaceData {
  const projectData = createDemoProjects(anchorDate);
  const invoiceData = createDemoInvoices(anchorDate);
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
    payroll: createDemoPayroll(anchorDate),
    engineering: createDemoEngineeringDocuments(anchorDate),
  };
}
