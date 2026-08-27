import type { EngineeringDocument, EngineeringDocumentRevision, EngineeringDocumentsWorkspaceData } from "../../lib/engineeringDocuments.ts";
import { DEMO_COMPANY_ID } from "../demoTypes.ts";
import { addDemoDays, demoTimestamp } from "./demoDates.ts";
import { DEMO_PROJECT_IDS } from "./projects.ts";

interface DocumentSpec {
  id: string;
  projectId: string;
  number: string;
  title: string;
  discipline: EngineeringDocument["discipline"];
  type: EngineeringDocument["documentType"];
  description: string;
  rev1?: boolean;
  status?: EngineeringDocument["status"];
  daysAgo: number;
}

const DOCUMENTS: DocumentSpec[] = [
  { id: "wh-arch", projectId: DEMO_PROJECT_IDS.warehouse, number: "MEC-WHX-A-001", title: "Architectural General Plan", discipline: "ARCHITECTURAL", type: "DRAWING", description: "Warehouse expansion general arrangement, loading bays, and life-safety egress layout.", rev1: true, daysAgo: 74 },
  { id: "wh-struct", projectId: DEMO_PROJECT_IDS.warehouse, number: "MEC-WHX-S-101", title: "Structural Foundation Plan", discipline: "STRUCTURAL", type: "DRAWING", description: "Foundation and pedestal plan for the expansion frame and loading-bay canopy.", rev1: true, daysAgo: 61 },
  { id: "wh-elec", projectId: DEMO_PROJECT_IDS.warehouse, number: "MEC-WHX-E-201", title: "Electrical Single-Line Diagram", discipline: "ELECTRICAL", type: "DRAWING", description: "Main distribution, warehouse feeder, panel schedules, and protection coordination notes.", rev1: true, status: "UNDER_REVIEW", daysAgo: 28 },
  { id: "wh-shop", projectId: DEMO_PROJECT_IDS.warehouse, number: "MEC-WHX-SD-014", title: "Shop Drawing - Steel Framing", discipline: "STRUCTURAL", type: "SUBMITTAL", description: "Fabrication and erection details for north-bay structural framing.", rev1: true, daysAgo: 18 },
  { id: "wh-method", projectId: DEMO_PROJECT_IDS.warehouse, number: "MEC-WHX-MS-006", title: "Method Statement - Concrete Pour", discipline: "GENERAL_ENGINEERING", type: "REPORT", description: "Sequence, inspection points, testing, curing, and safety controls for loading-bay slab pours.", daysAgo: 12 },
  { id: "drain-site", projectId: DEMO_PROJECT_IDS.drainage, number: "MEC-DRN-C-001", title: "Site Development Plan", discipline: "CIVIL", type: "DRAWING", description: "Work limits, drainage reaches, access staging, and traffic-management interfaces.", rev1: true, daysAgo: 79 },
  { id: "drain-layout", projectId: DEMO_PROJECT_IDS.drainage, number: "MEC-DRN-C-102", title: "Drainage Rehabilitation Layout", discipline: "CIVIL", type: "DRAWING", description: "Pipe, catch-basin, invert, and reinstatement layout across the active work fronts.", rev1: true, status: "UNDER_REVIEW", daysAgo: 23 },
  { id: "solar-site", projectId: DEMO_PROJECT_IDS.solar, number: "MEC-SOL-C-001", title: "Site Development Plan", discipline: "CIVIL", type: "DRAWING", description: "Grading, internal roads, drainage swales, and equipment-pad locations for the solar facility.", rev1: true, daysAgo: 68 },
  { id: "solar-struct", projectId: DEMO_PROJECT_IDS.solar, number: "MEC-SOL-S-110", title: "Structural Foundation Plan", discipline: "STRUCTURAL", type: "DRAWING", description: "Control-building and inverter foundation plans with reinforcing notes.", status: "UNDER_REVIEW", daysAgo: 31 },
  { id: "solar-elec", projectId: DEMO_PROJECT_IDS.solar, number: "MEC-SOL-E-204", title: "Electrical Single-Line Diagram", discipline: "ELECTRICAL", type: "DRAWING", description: "Civil interface copy for underground crossings, grounding, and control-building service.", status: "UNDER_REVIEW", daysAgo: 15 },
  { id: "cebu-arch", projectId: DEMO_PROJECT_IDS.cebu, number: "MEC-CEB-A-900", title: "Architectural General Plan - As Built", discipline: "ARCHITECTURAL", type: "DRAWING", description: "Final as-built fit-out plan issued at project close-out.", rev1: true, daysAgo: 112 },
  { id: "cebu-plumb", projectId: DEMO_PROJECT_IDS.cebu, number: "MEC-CEB-P-920", title: "Plumbing Layout - As Built", discipline: "PLUMBING", type: "DRAWING", description: "Final water and sanitary layout issued with turnover documents.", rev1: true, daysAgo: 111 },
];

export function createDemoEngineeringDocuments(anchorDate: string): EngineeringDocumentsWorkspaceData {
  const documents: EngineeringDocument[] = [];
  const revisions: EngineeringDocumentRevision[] = [];

  for (const spec of DOCUMENTS) {
    const createdDate = addDemoDays(anchorDate, -spec.daysAgo);
    const documentId = `demo-document-${spec.id}`;
    const rev0Id = `demo-revision-${spec.id}-0`;
    const rev1Id = `demo-revision-${spec.id}-1`;
    const currentRevisionId = spec.rev1 ? rev1Id : rev0Id;
    const currentRevisionNumber = spec.rev1 ? "Rev 1" : "Rev 0";
    documents.push({
      id: documentId,
      companyId: DEMO_COMPANY_ID,
      projectId: spec.projectId,
      documentNumber: spec.number,
      title: spec.title,
      description: spec.description,
      discipline: spec.discipline,
      documentType: spec.type,
      status: spec.status || "APPROVED",
      currentRevisionId,
      currentRevisionNumber,
      tags: [spec.discipline.replaceAll("_", " ").toLowerCase(), spec.type.toLowerCase(), "demo"],
      metadata: { demoAsset: spec.id === "wh-struct" ? "/demo/warehouse-structural-plan.svg" : undefined, fictional: true },
      createdAt: demoTimestamp(createdDate, 9, 10),
      updatedAt: demoTimestamp(spec.rev1 ? addDemoDays(createdDate, 19) : createdDate, 15, 20),
    });
    revisions.push({
      id: rev0Id,
      companyId: DEMO_COMPANY_ID,
      documentId,
      revisionNumber: "Rev 0",
      revisionLabel: "For Review",
      fileName: `${spec.number}_Rev0.pdf`,
      filePath: spec.id === "wh-struct" ? "/demo/warehouse-structural-plan.svg" : `demo://${documentId}/rev0`,
      fileSizeBytes: 182_400 + spec.daysAgo * 97,
      fileType: spec.id === "wh-struct" ? "image/svg+xml" : "application/pdf",
      fileFingerprint: `demo:${spec.id}:rev0`,
      pageCount: 1,
      sheetSize: spec.type === "DRAWING" ? "A1" : "A4",
      scale: spec.type === "DRAWING" ? "1:100" : undefined,
      changeSummary: "Initial issue for multidisciplinary review.",
      status: spec.rev1 ? "SUPERSEDED" : spec.status === "UNDER_REVIEW" ? "PENDING_REVIEW" : "APPROVED",
      createdAt: demoTimestamp(createdDate, 9, 20),
      updatedAt: demoTimestamp(createdDate, 9, 20),
    });
    if (spec.rev1) {
      const revisionDate = addDemoDays(createdDate, 19);
      revisions.push({
        id: rev1Id,
        companyId: DEMO_COMPANY_ID,
        documentId,
        revisionNumber: "Rev 1",
        revisionLabel: spec.status === "UNDER_REVIEW" ? "For Construction Review" : "Issued for Construction",
        fileName: `${spec.number}_Rev1.pdf`,
        filePath: spec.id === "wh-struct" ? "/demo/warehouse-structural-plan.svg" : `demo://${documentId}/rev1`,
        fileSizeBytes: 196_700 + spec.daysAgo * 103,
        fileType: spec.id === "wh-struct" ? "image/svg+xml" : "application/pdf",
        fileFingerprint: `demo:${spec.id}:rev1`,
        pageCount: 1,
        sheetSize: spec.type === "DRAWING" ? "A1" : "A4",
        scale: spec.type === "DRAWING" ? "1:100" : undefined,
        changeSummary: spec.id.includes("struct") ? "Updated footing dimensions and reinforcement callouts after design coordination." : "Coordination comments incorporated; issue status advanced without replacing Rev 0.",
        status: spec.status === "UNDER_REVIEW" ? "PENDING_REVIEW" : "APPROVED",
        createdAt: demoTimestamp(revisionDate, 14, 10),
        updatedAt: demoTimestamp(revisionDate, 14, 10),
      });
    }
  }

  return { documents, revisions, annotations: [] };
}
