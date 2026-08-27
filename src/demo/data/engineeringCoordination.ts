import type { EngineeringCoordinationWorkspaceData } from "../../lib/engineeringCoordination.ts";
import { DEMO_COMPANY_ID } from "../demoTypes.ts";
import { addDemoDays, demoTimestamp } from "./demoDates.ts";
import { DEMO_PROJECT_IDS } from "./projects.ts";

const DOC = {
  warehouseArch: "demo-document-wh-arch",
  warehouseStruct: "demo-document-wh-struct",
  warehouseElec: "demo-document-wh-elec",
  warehouseShop: "demo-document-wh-shop",
  drainageLayout: "demo-document-drain-layout",
  solarSite: "demo-document-solar-site",
  solarStruct: "demo-document-solar-struct",
} as const;

const REV = {
  warehouseArch1: "demo-revision-wh-arch-1",
  warehouseStruct1: "demo-revision-wh-struct-1",
  warehouseElec1: "demo-revision-wh-elec-1",
  warehouseShop1: "demo-revision-wh-shop-1",
  drainageLayout1: "demo-revision-drain-layout-1",
  solarSite1: "demo-revision-solar-site-1",
  solarStruct0: "demo-revision-solar-struct-0",
} as const;

export function createDemoEngineeringCoordination(anchorDate: string): EngineeringCoordinationWorkspaceData {
  const rfis = [
    {
      id: "demo-rfi-wh-001", companyId: DEMO_COMPANY_ID, projectId: DEMO_PROJECT_IDS.warehouse, rfiNumber: "RFI-001",
      subject: "North-bay footing reinforcement clarification", question: "Confirm whether the revised footing reinforcement at grid N4/N5 follows Rev 1 of the structural foundation plan and whether the pedestal starter bars remain unchanged.",
      discipline: "STRUCTURAL" as const, priority: "HIGH" as const, status: "OPEN" as const, dateRaised: addDemoDays(anchorDate, -9), dueDate: addDemoDays(anchorDate, -2),
      createdAt: demoTimestamp(addDemoDays(anchorDate, -9), 8, 40), updatedAt: demoTimestamp(addDemoDays(anchorDate, -9), 9, 5), openedAt: demoTimestamp(addDemoDays(anchorDate, -9), 9, 5),
    },
    {
      id: "demo-rfi-dr-004", companyId: DEMO_COMPANY_ID, projectId: DEMO_PROJECT_IDS.drainage, rfiNumber: "RFI-004",
      subject: "Existing utility conflict at catch basin CB-17", question: "The exposed telecom duct bank conflicts with the proposed CB-17 excavation. Confirm the approved horizontal offset and any required invert adjustment.",
      discipline: "CIVIL" as const, priority: "URGENT" as const, status: "ANSWERED" as const, dateRaised: addDemoDays(anchorDate, -15), dueDate: addDemoDays(anchorDate, -8),
      createdAt: demoTimestamp(addDemoDays(anchorDate, -15), 10, 20), updatedAt: demoTimestamp(addDemoDays(anchorDate, -7), 15, 20), openedAt: demoTimestamp(addDemoDays(anchorDate, -15), 10, 35), answeredAt: demoTimestamp(addDemoDays(anchorDate, -7), 15, 20),
    },
    {
      id: "demo-rfi-wh-006", companyId: DEMO_COMPANY_ID, projectId: DEMO_PROJECT_IDS.warehouse, rfiNumber: "RFI-006",
      subject: "Cable tray routing above loading-bay office", question: "Confirm the preferred cable tray route where the architectural ceiling bulkhead conflicts with the electrical path shown on the current single-line coordination set.",
      discipline: "ELECTRICAL" as const, priority: "NORMAL" as const, status: "CLOSED" as const, dateRaised: addDemoDays(anchorDate, -21), dueDate: addDemoDays(anchorDate, -14),
      createdAt: demoTimestamp(addDemoDays(anchorDate, -21), 9, 10), updatedAt: demoTimestamp(addDemoDays(anchorDate, -11), 13, 45), openedAt: demoTimestamp(addDemoDays(anchorDate, -21), 9, 20), answeredAt: demoTimestamp(addDemoDays(anchorDate, -12), 16, 10), closedAt: demoTimestamp(addDemoDays(anchorDate, -11), 13, 45), closeVoidReason: "Routing incorporated into the coordinated electrical installation sketch.",
    },
    {
      id: "demo-rfi-sol-002", companyId: DEMO_COMPANY_ID, projectId: DEMO_PROJECT_IDS.solar, rfiNumber: "RFI-002",
      subject: "Inverter pad finished elevation", question: "Confirm the finished concrete elevation for inverter pad IP-03 relative to the adjacent drainage swale after the latest grading adjustment.",
      discipline: "CIVIL" as const, priority: "HIGH" as const, status: "OPEN" as const, dateRaised: addDemoDays(anchorDate, -4), dueDate: addDemoDays(anchorDate, 3),
      createdAt: demoTimestamp(addDemoDays(anchorDate, -4), 14, 20), updatedAt: demoTimestamp(addDemoDays(anchorDate, -4), 14, 35), openedAt: demoTimestamp(addDemoDays(anchorDate, -4), 14, 35),
    },
    {
      id: "demo-rfi-wh-008", companyId: DEMO_COMPANY_ID, projectId: DEMO_PROJECT_IDS.warehouse, rfiNumber: "RFI-008",
      subject: "Loading-bay canopy fascia coordination", question: "Confirm the architectural fascia depth at the new canopy so the steel edge member and gutter bracket elevations can be finalized.",
      discipline: "ARCHITECTURAL" as const, priority: "NORMAL" as const, status: "ANSWERED" as const, dateRaised: addDemoDays(anchorDate, -7), dueDate: addDemoDays(anchorDate, 0),
      createdAt: demoTimestamp(addDemoDays(anchorDate, -7), 11, 0), updatedAt: demoTimestamp(addDemoDays(anchorDate, -1), 10, 30), openedAt: demoTimestamp(addDemoDays(anchorDate, -7), 11, 10), answeredAt: demoTimestamp(addDemoDays(anchorDate, -1), 10, 30),
    },
    {
      id: "demo-rfi-dr-007", companyId: DEMO_COMPANY_ID, projectId: DEMO_PROJECT_IDS.drainage, rfiNumber: "RFI-007",
      subject: "Temporary flow bypass at downstream reach", question: "Confirm whether the temporary bypass may discharge through the existing eastern catch basin while the downstream pipe section is replaced.",
      discipline: "CIVIL" as const, priority: "HIGH" as const, status: "CLOSED" as const, dateRaised: addDemoDays(anchorDate, -26), dueDate: addDemoDays(anchorDate, -20),
      createdAt: demoTimestamp(addDemoDays(anchorDate, -26), 7, 50), updatedAt: demoTimestamp(addDemoDays(anchorDate, -18), 17, 5), openedAt: demoTimestamp(addDemoDays(anchorDate, -26), 8, 5), answeredAt: demoTimestamp(addDemoDays(anchorDate, -19), 14, 25), closedAt: demoTimestamp(addDemoDays(anchorDate, -18), 17, 5), closeVoidReason: "Temporary bypass arrangement accepted and reflected in the site sequence.",
    },
  ];

  const rfiResponses = [
    { id: "demo-rfi-response-dr-004", companyId: DEMO_COMPANY_ID, rfiId: "demo-rfi-dr-004", responseText: "Maintain a 600 mm horizontal clearance from the telecom duct bank. Shift CB-17 east and lower the connecting invert by 40 mm while maintaining the design slope.", responseType: "RESPONSE" as const, isFinalAnswer: true, createdAt: demoTimestamp(addDemoDays(anchorDate, -7), 15, 20) },
    { id: "demo-rfi-response-wh-006", companyId: DEMO_COMPANY_ID, rfiId: "demo-rfi-wh-006", responseText: "Route the tray along the north wall beam line and drop after the office bulkhead. Maintain the required clearance from sprinkler mains.", responseType: "RESPONSE" as const, isFinalAnswer: true, createdAt: demoTimestamp(addDemoDays(anchorDate, -12), 16, 10) },
    { id: "demo-rfi-response-wh-008", companyId: DEMO_COMPANY_ID, rfiId: "demo-rfi-wh-008", responseText: "Use a 450 mm fascia depth measured from the canopy top datum. The structural edge member may remain at the coordinated Rev 1 elevation.", responseType: "RESPONSE" as const, isFinalAnswer: true, createdAt: demoTimestamp(addDemoDays(anchorDate, -1), 10, 30) },
    { id: "demo-rfi-response-dr-007", companyId: DEMO_COMPANY_ID, rfiId: "demo-rfi-dr-007", responseText: "Temporary discharge through the eastern catch basin is acceptable provided a screened sump and daily sediment inspection are maintained.", responseType: "RESPONSE" as const, isFinalAnswer: true, createdAt: demoTimestamp(addDemoDays(anchorDate, -19), 14, 25) },
  ];

  const rfiDocumentLinks = [
    { id: "demo-rfi-link-wh-001", companyId: DEMO_COMPANY_ID, rfiId: "demo-rfi-wh-001", documentId: DOC.warehouseStruct, revisionId: REV.warehouseStruct1, createdAt: demoTimestamp(addDemoDays(anchorDate, -9), 8, 45) },
    { id: "demo-rfi-link-dr-004", companyId: DEMO_COMPANY_ID, rfiId: "demo-rfi-dr-004", documentId: DOC.drainageLayout, revisionId: REV.drainageLayout1, createdAt: demoTimestamp(addDemoDays(anchorDate, -15), 10, 25) },
    { id: "demo-rfi-link-dr-004-response", companyId: DEMO_COMPANY_ID, rfiId: "demo-rfi-dr-004", responseId: "demo-rfi-response-dr-004", documentId: DOC.drainageLayout, revisionId: REV.drainageLayout1, createdAt: demoTimestamp(addDemoDays(anchorDate, -7), 15, 20) },
    { id: "demo-rfi-link-wh-006", companyId: DEMO_COMPANY_ID, rfiId: "demo-rfi-wh-006", documentId: DOC.warehouseElec, revisionId: REV.warehouseElec1, createdAt: demoTimestamp(addDemoDays(anchorDate, -21), 9, 12) },
    { id: "demo-rfi-link-sol-002", companyId: DEMO_COMPANY_ID, rfiId: "demo-rfi-sol-002", documentId: DOC.solarSite, revisionId: REV.solarSite1, createdAt: demoTimestamp(addDemoDays(anchorDate, -4), 14, 25) },
    { id: "demo-rfi-link-wh-008", companyId: DEMO_COMPANY_ID, rfiId: "demo-rfi-wh-008", documentId: DOC.warehouseArch, revisionId: REV.warehouseArch1, createdAt: demoTimestamp(addDemoDays(anchorDate, -7), 11, 5) },
  ];

  const submittals = [
    { id: "demo-sub-wh-003", companyId: DEMO_COMPANY_ID, projectId: DEMO_PROJECT_IDS.warehouse, submittalNumber: "SUB-003", title: "Concrete mix design - loading bay slab", discipline: "STRUCTURAL" as const, category: "Material / Mix Design", specificationReference: "03 30 00", dueReviewDate: addDemoDays(anchorDate, -30), currentRound: 1, status: "APPROVED" as const, createdAt: demoTimestamp(addDemoDays(anchorDate, -48), 9, 0), updatedAt: demoTimestamp(addDemoDays(anchorDate, -35), 16, 20), submittedAt: demoTimestamp(addDemoDays(anchorDate, -46), 9, 30) },
    { id: "demo-sub-wh-014", companyId: DEMO_COMPANY_ID, projectId: DEMO_PROJECT_IDS.warehouse, submittalNumber: "SUB-014", title: "Structural steel shop drawings - north bay", discipline: "STRUCTURAL" as const, category: "Shop Drawing", specificationReference: "05 12 00", dueReviewDate: addDemoDays(anchorDate, -1), currentRound: 2, status: "APPROVED_AS_NOTED" as const, createdAt: demoTimestamp(addDemoDays(anchorDate, -31), 8, 10), updatedAt: demoTimestamp(addDemoDays(anchorDate, -1), 15, 40), submittedAt: demoTimestamp(addDemoDays(anchorDate, -27), 10, 0) },
    { id: "demo-sub-dr-005", companyId: DEMO_COMPANY_ID, projectId: DEMO_PROJECT_IDS.drainage, submittalNumber: "SUB-005", title: "Waterproofing and joint sealant product data", discipline: "CIVIL" as const, category: "Product Data", specificationReference: "07 92 00", dueReviewDate: addDemoDays(anchorDate, 2), currentRound: 1, status: "SUBMITTED" as const, createdAt: demoTimestamp(addDemoDays(anchorDate, -6), 13, 0), updatedAt: demoTimestamp(addDemoDays(anchorDate, -5), 9, 20), submittedAt: demoTimestamp(addDemoDays(anchorDate, -5), 9, 20) },
    { id: "demo-sub-wh-018", companyId: DEMO_COMPANY_ID, projectId: DEMO_PROJECT_IDS.warehouse, submittalNumber: "SUB-018", title: "Cable tray and support product data", discipline: "ELECTRICAL" as const, category: "Product Data", specificationReference: "26 05 36", dueReviewDate: addDemoDays(anchorDate, 1), currentRound: 1, status: "UNDER_REVIEW" as const, createdAt: demoTimestamp(addDemoDays(anchorDate, -8), 10, 0), updatedAt: demoTimestamp(addDemoDays(anchorDate, -3), 8, 30), submittedAt: demoTimestamp(addDemoDays(anchorDate, -7), 14, 10) },
    { id: "demo-sub-sol-009", companyId: DEMO_COMPANY_ID, projectId: DEMO_PROJECT_IDS.solar, submittalNumber: "SUB-009", title: "Equipment foundation shop drawing", discipline: "STRUCTURAL" as const, category: "Shop Drawing", specificationReference: "03 31 00", dueReviewDate: addDemoDays(anchorDate, 4), currentRound: 1, status: "REVISE_AND_RESUBMIT" as const, createdAt: demoTimestamp(addDemoDays(anchorDate, -12), 8, 50), updatedAt: demoTimestamp(addDemoDays(anchorDate, -2), 16, 0), submittedAt: demoTimestamp(addDemoDays(anchorDate, -10), 9, 10) },
    { id: "demo-sub-sol-012", companyId: DEMO_COMPANY_ID, projectId: DEMO_PROJECT_IDS.solar, submittalNumber: "SUB-012", title: "Site drainage geotextile product data", discipline: "CIVIL" as const, category: "Product Data", specificationReference: "31 05 19", dueReviewDate: addDemoDays(anchorDate, 6), currentRound: 1, status: "UNDER_REVIEW" as const, createdAt: demoTimestamp(addDemoDays(anchorDate, -5), 9, 25), updatedAt: demoTimestamp(addDemoDays(anchorDate, -1), 8, 0), submittedAt: demoTimestamp(addDemoDays(anchorDate, -4), 13, 40) },
  ];

  const submittalRounds = [
    { id: "demo-round-wh-003-1", companyId: DEMO_COMPANY_ID, submittalId: "demo-sub-wh-003", roundNumber: 1, status: "APPROVED" as const, dueReviewDate: addDemoDays(anchorDate, -30), submittedAt: demoTimestamp(addDemoDays(anchorDate, -46), 9, 30), completedAt: demoTimestamp(addDemoDays(anchorDate, -35), 16, 20), createdAt: demoTimestamp(addDemoDays(anchorDate, -48), 9, 0), updatedAt: demoTimestamp(addDemoDays(anchorDate, -35), 16, 20) },
    { id: "demo-round-wh-014-1", companyId: DEMO_COMPANY_ID, submittalId: "demo-sub-wh-014", roundNumber: 1, status: "REVISE_AND_RESUBMIT" as const, dueReviewDate: addDemoDays(anchorDate, -18), submittedAt: demoTimestamp(addDemoDays(anchorDate, -27), 10, 0), completedAt: demoTimestamp(addDemoDays(anchorDate, -20), 14, 30), createdAt: demoTimestamp(addDemoDays(anchorDate, -31), 8, 10), updatedAt: demoTimestamp(addDemoDays(anchorDate, -20), 14, 30) },
    { id: "demo-round-wh-014-2", companyId: DEMO_COMPANY_ID, submittalId: "demo-sub-wh-014", roundNumber: 2, status: "APPROVED_AS_NOTED" as const, dueReviewDate: addDemoDays(anchorDate, -1), submittedAt: demoTimestamp(addDemoDays(anchorDate, -8), 10, 20), completedAt: demoTimestamp(addDemoDays(anchorDate, -1), 15, 40), createdAt: demoTimestamp(addDemoDays(anchorDate, -9), 16, 5), updatedAt: demoTimestamp(addDemoDays(anchorDate, -1), 15, 40) },
    { id: "demo-round-dr-005-1", companyId: DEMO_COMPANY_ID, submittalId: "demo-sub-dr-005", roundNumber: 1, status: "SUBMITTED" as const, dueReviewDate: addDemoDays(anchorDate, 2), submittedAt: demoTimestamp(addDemoDays(anchorDate, -5), 9, 20), createdAt: demoTimestamp(addDemoDays(anchorDate, -6), 13, 0), updatedAt: demoTimestamp(addDemoDays(anchorDate, -5), 9, 20) },
    { id: "demo-round-wh-018-1", companyId: DEMO_COMPANY_ID, submittalId: "demo-sub-wh-018", roundNumber: 1, status: "UNDER_REVIEW" as const, dueReviewDate: addDemoDays(anchorDate, 1), submittedAt: demoTimestamp(addDemoDays(anchorDate, -7), 14, 10), createdAt: demoTimestamp(addDemoDays(anchorDate, -8), 10, 0), updatedAt: demoTimestamp(addDemoDays(anchorDate, -3), 8, 30) },
    { id: "demo-round-sol-009-1", companyId: DEMO_COMPANY_ID, submittalId: "demo-sub-sol-009", roundNumber: 1, status: "REVISE_AND_RESUBMIT" as const, dueReviewDate: addDemoDays(anchorDate, -1), submittedAt: demoTimestamp(addDemoDays(anchorDate, -10), 9, 10), completedAt: demoTimestamp(addDemoDays(anchorDate, -2), 16, 0), createdAt: demoTimestamp(addDemoDays(anchorDate, -12), 8, 50), updatedAt: demoTimestamp(addDemoDays(anchorDate, -2), 16, 0) },
    { id: "demo-round-sol-012-1", companyId: DEMO_COMPANY_ID, submittalId: "demo-sub-sol-012", roundNumber: 1, status: "UNDER_REVIEW" as const, dueReviewDate: addDemoDays(anchorDate, 6), submittedAt: demoTimestamp(addDemoDays(anchorDate, -4), 13, 40), createdAt: demoTimestamp(addDemoDays(anchorDate, -5), 9, 25), updatedAt: demoTimestamp(addDemoDays(anchorDate, -1), 8, 0) },
  ];

  const submittalReviews = [
    { id: "demo-review-wh-003-1", companyId: DEMO_COMPANY_ID, submittalId: "demo-sub-wh-003", roundId: "demo-round-wh-003-1", roundNumber: 1, decision: "APPROVED" as const, reviewComments: "Mix proportions and submitted test data are accepted for the loading-bay slab. Maintain the specified water-cement ratio during placement.", reviewedAt: demoTimestamp(addDemoDays(anchorDate, -35), 16, 20) },
    { id: "demo-review-wh-014-1", companyId: DEMO_COMPANY_ID, submittalId: "demo-sub-wh-014", roundId: "demo-round-wh-014-1", roundNumber: 1, decision: "REVISE_AND_RESUBMIT" as const, reviewComments: "Revise the north-bay connection plates at grids N4-N6 and coordinate the canopy edge member before fabrication.", reviewedAt: demoTimestamp(addDemoDays(anchorDate, -20), 14, 30) },
    { id: "demo-review-wh-014-2", companyId: DEMO_COMPANY_ID, submittalId: "demo-sub-wh-014", roundId: "demo-round-wh-014-2", roundNumber: 2, decision: "APPROVED_AS_NOTED" as const, reviewComments: "Connection revisions are accepted. Verify field dimensions at the existing column line before final bolt-hole drilling.", reviewedAt: demoTimestamp(addDemoDays(anchorDate, -1), 15, 40) },
    { id: "demo-review-sol-009-1", companyId: DEMO_COMPANY_ID, submittalId: "demo-sub-sol-009", roundId: "demo-round-sol-009-1", roundNumber: 1, decision: "REVISE_AND_RESUBMIT" as const, reviewComments: "Coordinate anchor-bolt projection and finished pad elevation with the latest equipment vendor setting plan, then submit a new round.", reviewedAt: demoTimestamp(addDemoDays(anchorDate, -2), 16, 0) },
  ];

  const submittalDocumentLinks = [
    { id: "demo-sub-link-wh-003", companyId: DEMO_COMPANY_ID, submittalId: "demo-sub-wh-003", roundId: "demo-round-wh-003-1", documentId: DOC.warehouseStruct, revisionId: REV.warehouseStruct1, createdAt: demoTimestamp(addDemoDays(anchorDate, -46), 9, 30) },
    { id: "demo-sub-link-wh-014-1", companyId: DEMO_COMPANY_ID, submittalId: "demo-sub-wh-014", roundId: "demo-round-wh-014-1", documentId: DOC.warehouseShop, revisionId: REV.warehouseShop1, createdAt: demoTimestamp(addDemoDays(anchorDate, -27), 10, 0) },
    { id: "demo-sub-link-wh-014-2", companyId: DEMO_COMPANY_ID, submittalId: "demo-sub-wh-014", roundId: "demo-round-wh-014-2", documentId: DOC.warehouseStruct, revisionId: REV.warehouseStruct1, createdAt: demoTimestamp(addDemoDays(anchorDate, -8), 10, 20) },
    { id: "demo-sub-link-dr-005", companyId: DEMO_COMPANY_ID, submittalId: "demo-sub-dr-005", roundId: "demo-round-dr-005-1", documentId: DOC.drainageLayout, revisionId: REV.drainageLayout1, createdAt: demoTimestamp(addDemoDays(anchorDate, -5), 9, 20) },
    { id: "demo-sub-link-wh-018", companyId: DEMO_COMPANY_ID, submittalId: "demo-sub-wh-018", roundId: "demo-round-wh-018-1", documentId: DOC.warehouseElec, revisionId: REV.warehouseElec1, createdAt: demoTimestamp(addDemoDays(anchorDate, -7), 14, 10) },
    { id: "demo-sub-link-sol-009", companyId: DEMO_COMPANY_ID, submittalId: "demo-sub-sol-009", roundId: "demo-round-sol-009-1", documentId: DOC.solarStruct, revisionId: REV.solarStruct0, createdAt: demoTimestamp(addDemoDays(anchorDate, -10), 9, 10) },
    { id: "demo-sub-link-sol-012", companyId: DEMO_COMPANY_ID, submittalId: "demo-sub-sol-012", roundId: "demo-round-sol-012-1", documentId: DOC.solarSite, revisionId: REV.solarSite1, createdAt: demoTimestamp(addDemoDays(anchorDate, -4), 13, 40) },
  ];

  return { rfis, rfiResponses, rfiDocumentLinks, submittals, submittalRounds, submittalReviews, submittalDocumentLinks };
}
