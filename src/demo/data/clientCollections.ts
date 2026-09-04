import type { ClientCollection, ClientCollectionEvent } from "../../lib/clientCollections.ts";
import { addDemoDays, demoTimestamp } from "./demoDates.ts";
import { DEMO_COMPANY_ID } from "../demoTypes.ts";
import { DEMO_PROJECT_IDS } from "./projects.ts";

interface DemoCollectionSpec {
  id: string;
  number: string;
  projectId: string;
  daysAgo: number;
  status: ClientCollection["status"];
  externalReference?: string;
  payerSnapshot: string;
  notes: string;
  reversalReason?: string;
  allocations: Array<{
    billingId: string;
    amount: number;
    notes?: string;
  }>;
}

const SPECS: readonly DemoCollectionSpec[] = [
  {
    id: "warehouse-01",
    number: "COL-MEC-24-017-001",
    projectId: DEMO_PROJECT_IDS.warehouse,
    daysAgo: 50,
    status: "RECORDED",
    externalReference: "CHK-789012",
    payerSnapshot: "Northern Goods Logistics Corp.",
    notes: "Progress collection #1: Full settlement of initial mobilization billing",
    allocations: [
      {
        billingId: "demo-client-billing-warehouse-01",
        amount: 4_860_000,
        notes: "Full collection against PB-MEC-24-017-001",
      },
    ],
  },
  {
    id: "warehouse-02",
    number: "COL-MEC-24-017-002",
    projectId: DEMO_PROJECT_IDS.warehouse,
    daysAgo: 10,
    status: "RECORDED",
    externalReference: "WIRE-2026-0814",
    payerSnapshot: "Northern Goods Logistics Corp.",
    notes: "Progress collection #2: Partial collection on loading bay progress",
    allocations: [
      {
        billingId: "demo-client-billing-warehouse-02",
        amount: 1_500_000,
        notes: "Partial collection against PB-MEC-24-017-002",
      },
    ],
  },
  {
    id: "solar-01",
    number: "COL-MEC-25-012-001",
    projectId: DEMO_PROJECT_IDS.solar,
    daysAgo: 15,
    status: "RECORDED",
    externalReference: "EFT-88319",
    payerSnapshot: "SunPower Renewables Philippines",
    notes: "Initial earthworks progress collection",
    allocations: [
      {
        billingId: "demo-client-billing-solar-01",
        amount: 1_200_000,
        notes: "Partial collection against PB-MEC-25-012-001",
      },
    ],
  },
  {
    id: "cebu-01",
    number: "COL-MEC-24-009-001",
    projectId: DEMO_PROJECT_IDS.cebu,
    daysAgo: 110,
    status: "RECORDED",
    externalReference: "CHK-550211",
    payerSnapshot: "Harbor Tower Solutions",
    notes: "Full collection of final handover valuation",
    allocations: [
      {
        billingId: "demo-client-billing-cebu-01",
        amount: 3_680_000,
        notes: "Full collection against PB-MEC-24-009-001",
      },
    ],
  },
  {
    id: "drainage-01",
    number: "COL-MEC-25-006-001",
    projectId: DEMO_PROJECT_IDS.drainage,
    daysAgo: 3,
    status: "DRAFT",
    externalReference: "CHK-PENDING",
    payerSnapshot: "Riverside Commercial Estates",
    notes: "Draft collection for catch-basin reconstruction",
    allocations: [
      {
        billingId: "demo-client-billing-drainage-01",
        amount: 1_000_000,
        notes: "Proposed partial collection against PB-MEC-25-006-001",
      },
    ],
  },
  {
    id: "warehouse-rev",
    number: "COL-MEC-24-017-REV",
    projectId: DEMO_PROJECT_IDS.warehouse,
    daysAgo: 18,
    status: "REVERSED",
    externalReference: "CHK-BOUNCED-09",
    payerSnapshot: "Northern Goods Logistics Corp.",
    notes: "Cheque returned due to bank signature discrepancy; reversed with audit trace",
    reversalReason: "Cheque returned unpaid by drawee bank due to signature irregularity",
    allocations: [
      {
        billingId: "demo-client-billing-warehouse-02",
        amount: 500_000,
        notes: "Reversed collection against PB-MEC-24-017-002",
      },
    ],
  },
];

function collectionFromSpec(spec: DemoCollectionSpec, anchorDate: string): ClientCollection {
  const collectionDate = addDemoDays(anchorDate, -spec.daysAgo);
  const timestamp = demoTimestamp(collectionDate, 11, Number(spec.id.length));
  const collectionId = `demo-client-collection-${spec.id}`;

  return {
    id: collectionId,
    companyId: DEMO_COMPANY_ID,
    projectId: spec.projectId,
    collectionNumber: spec.number,
    collectionDate,
    externalReference: spec.externalReference,
    payerSnapshot: spec.payerSnapshot,
    currency: "PHP",
    status: spec.status,
    notes: spec.notes,
    allocations: spec.allocations.map((alloc, idx) => ({
      id: `demo-client-collection-alloc-${spec.id}-${idx + 1}`,
      companyId: DEMO_COMPANY_ID,
      collectionId,
      billingId: alloc.billingId,
      amount: alloc.amount,
      notes: alloc.notes,
      createdAt: timestamp,
      updatedAt: timestamp,
    })),
    createdByUserId: "demo-user-finance",
    updatedByUserId: "demo-user-finance",
    recordedByUserId: spec.status !== "DRAFT" ? "demo-user-finance" : undefined,
    recordedAt: spec.status !== "DRAFT" ? timestamp : undefined,
    reversedByUserId: spec.status === "REVERSED" ? "demo-user-finance" : undefined,
    reversedAt: spec.status === "REVERSED" ? demoTimestamp(addDemoDays(collectionDate, 2), 16, 0) : undefined,
    reversalReason: spec.reversalReason,
    createdAt: timestamp,
    updatedAt: spec.status === "REVERSED" ? demoTimestamp(addDemoDays(collectionDate, 2), 16, 0) : timestamp,
  };
}

export function createDemoClientCollections(anchorDate: string): {
  clientCollections: ClientCollection[];
  clientCollectionEvents: ClientCollectionEvent[];
} {
  const clientCollections = SPECS.map((spec) => collectionFromSpec(spec, anchorDate));

  const clientCollectionEvents = clientCollections.flatMap((collection) => {
    const createdAt = collection.createdAt;
    const events: ClientCollectionEvent[] = [
      {
        id: `${collection.id}-created`,
        companyId: DEMO_COMPANY_ID,
        collectionId: collection.id,
        eventType: "CREATED",
        toStatus: "DRAFT",
        actorUserId: "demo-user-finance",
        createdAt,
      },
    ];

    if (collection.status === "RECORDED" || collection.status === "REVERSED") {
      events.push({
        id: `${collection.id}-recorded`,
        companyId: DEMO_COMPANY_ID,
        collectionId: collection.id,
        eventType: "RECORDED",
        fromStatus: "DRAFT",
        toStatus: "RECORDED",
        actorUserId: "demo-user-finance",
        createdAt: collection.recordedAt || createdAt,
      });
    }

    if (collection.status === "REVERSED") {
      events.push({
        id: `${collection.id}-reversed`,
        companyId: DEMO_COMPANY_ID,
        collectionId: collection.id,
        eventType: "REVERSED",
        fromStatus: "RECORDED",
        toStatus: "REVERSED",
        reason: collection.reversalReason,
        actorUserId: "demo-user-finance",
        createdAt: collection.reversedAt || createdAt,
      });
    }

    return events;
  }).sort((left, right) => right.createdAt.localeCompare(left.createdAt));

  return { clientCollections, clientCollectionEvents };
}
