import type { DemoProjectPresentation } from "../demoTypes.ts";
import type { Project, ProjectCostCode } from "../../types.ts";
import { addDemoDays, demoTimestamp } from "./demoDates.ts";

export const DEMO_PROJECT_IDS = {
  warehouse: "demo-project-warehouse",
  drainage: "demo-project-drainage",
  solar: "demo-project-solar",
  cebu: "demo-project-cebu",
} as const;

export function createDemoProjects(anchorDate: string): {
  projects: Project[];
  presentation: Record<string, DemoProjectPresentation>;
  costCodes: ProjectCostCode[];
} {
  const updatedAt = demoTimestamp(anchorDate, 9, 15);
  const projects: Project[] = [
    {
      id: DEMO_PROJECT_IDS.warehouse,
      projectCode: "MEC-24-017",
      projectName: "Quezon City Warehouse Expansion",
      description: "Structural expansion, loading-bay improvements, electrical upgrades, and site civil works for an operating logistics facility.",
      clientName: "Northgate Logistics Properties, Inc.",
      clientReference: "NGL-WHX-2024-03",
      location: "Quezon City, Metro Manila",
      siteAddress: "Novaliches, Quezon City, Metro Manila",
      projectManager: "Miguel Reyes",
      status: "ACTIVE",
      startDate: addDemoDays(anchorDate, -244),
      targetEndDate: addDemoDays(anchorDate, 118),
      contractValue: 18_437_650,
      projectBudget: 15_320_000,
      currency: "PHP",
      notes: "Site progress is approximately 64%. Current focus: steel framing close-out, warehouse electrical rough-in, and loading-bay slab works.",
      createdAt: demoTimestamp(addDemoDays(anchorDate, -260)),
      updatedAt,
    },
    {
      id: DEMO_PROJECT_IDS.drainage,
      projectCode: "MEC-25-006",
      projectName: "Pasig Drainage Rehabilitation",
      description: "Rehabilitation of roadside drainage, catch basins, culvert sections, and localized pavement restoration.",
      clientName: "Riverside Commercial Estates Corp.",
      clientReference: "RCE-DRN-25-11",
      location: "Pasig City, Metro Manila",
      siteAddress: "Ortigas East service corridor, Pasig City",
      projectManager: "Angela Cruz",
      status: "ACTIVE",
      startDate: addDemoDays(anchorDate, -154),
      targetEndDate: addDemoDays(anchorDate, 101),
      contractValue: 7_842_980,
      projectBudget: 6_640_000,
      currency: "PHP",
      notes: "Site progress is approximately 42%. Priority work is catch-basin reconstruction and the downstream pipe replacement package.",
      createdAt: demoTimestamp(addDemoDays(anchorDate, -170)),
      updatedAt,
    },
    {
      id: DEMO_PROJECT_IDS.solar,
      projectCode: "MEC-25-012",
      projectName: "Laguna Solar Facility Civil Works",
      description: "Civil package for a utility-scale solar facility including grading, equipment pads, drainage, access roads, and control-building foundations.",
      clientName: "Suncrest Renewables Philippines, Inc.",
      clientReference: "SRP-LAG-CIV-025",
      location: "Calamba, Laguna",
      siteAddress: "Brgy. Makiling, Calamba, Laguna",
      projectManager: "Carlo Mendoza",
      status: "ACTIVE",
      startDate: addDemoDays(anchorDate, -92),
      targetEndDate: addDemoDays(anchorDate, 184),
      contractValue: 12_618_420,
      projectBudget: 10_910_000,
      currency: "PHP",
      notes: "Site progress is approximately 28%. Earthworks are active; inverter-pad foundations and underground electrical crossings are next.",
      createdAt: demoTimestamp(addDemoDays(anchorDate, -105)),
      updatedAt,
    },
    {
      id: DEMO_PROJECT_IDS.cebu,
      projectCode: "MEC-24-009",
      projectName: "Cebu Office Fit-Out",
      description: "Completed architectural, MEP, and minor structural fit-out for a regional engineering office.",
      clientName: "Harborpoint Technical Services, Inc.",
      clientReference: "HTS-CEB-FITOUT-09",
      location: "Cebu City, Cebu",
      siteAddress: "Cebu Business Park, Cebu City",
      projectManager: "Patricia Santos",
      status: "COMPLETED",
      startDate: addDemoDays(anchorDate, -226),
      targetEndDate: addDemoDays(anchorDate, -112),
      actualEndDate: addDemoDays(anchorDate, -109),
      contractValue: 4_214_780,
      projectBudget: 3_550_000,
      currency: "PHP",
      notes: "Project completed and handed over. Final as-built documents and cost close-out are retained for reference.",
      createdAt: demoTimestamp(addDemoDays(anchorDate, -240)),
      updatedAt: demoTimestamp(addDemoDays(anchorDate, -108)),
    },
  ];
  const costCodeTimestamp = demoTimestamp(addDemoDays(anchorDate, -220), 8, 0);
  const costCodes: ProjectCostCode[] = [
    { id: "demo-cc-wh-02", projectId: DEMO_PROJECT_IDS.warehouse, code: "02-100", name: "Structural Steel Works", approvedBudgetAmount: 3_000_000, forecastAmount: 2_950_000, status: "ACTIVE", createdAt: costCodeTimestamp, updatedAt: costCodeTimestamp },
    { id: "demo-cc-wh-04", projectId: DEMO_PROJECT_IDS.warehouse, code: "04-100", name: "Mechanical & HVAC Systems", approvedBudgetAmount: 2_500_000, forecastAmount: 2_450_000, status: "ACTIVE", createdAt: costCodeTimestamp, updatedAt: costCodeTimestamp },
    { id: "demo-cc-dr-03", projectId: DEMO_PROJECT_IDS.drainage, code: "03-100", name: "Concrete & Drainage Structures", approvedBudgetAmount: 1_800_000, forecastAmount: 1_750_000, status: "ACTIVE", createdAt: costCodeTimestamp, updatedAt: costCodeTimestamp },
    { id: "demo-cc-sol-31", projectId: DEMO_PROJECT_IDS.solar, code: "31-100", name: "Earthworks & Site Civil", approvedBudgetAmount: 3_400_000, forecastAmount: 3_250_000, status: "ACTIVE", createdAt: costCodeTimestamp, updatedAt: costCodeTimestamp },
  ];

  return {
    projects,
    costCodes,
    presentation: {
      [DEMO_PROJECT_IDS.warehouse]: { progressPercent: 64, presentationNote: "Steel framing and electrical rough-in are the current cost-control focus." },
      [DEMO_PROJECT_IDS.drainage]: { progressPercent: 42, presentationNote: "Drainage reconstruction is active across two work fronts." },
      [DEMO_PROJECT_IDS.solar]: { progressPercent: 28, presentationNote: "Earthworks and equipment-pad foundations are ramping up." },
      [DEMO_PROJECT_IDS.cebu]: { progressPercent: 100, presentationNote: "Completed project retained as a close-out reference." },
    },
  };
}
