import type { ClientBilling, ClientBillingEvent } from "../../lib/clientBilling.ts";
import { addDemoDays, demoTimestamp } from "./demoDates.ts";
import { DEMO_COMPANY_ID } from "../demoTypes.ts";
import { DEMO_PROJECT_IDS } from "./projects.ts";

interface DemoBillingSpec {
  id: string;
  number: string;
  projectId: string;
  daysAgo: number;
  status: ClientBilling["status"];
  title: string;
  amount: number;
  reference?: string;
}
const SPECS: readonly DemoBillingSpec[] = [
  { id: "warehouse-01", number: "PB-MEC-24-017-001", projectId: DEMO_PROJECT_IDS.warehouse, daysAgo: 70, status: "ISSUED", title: "Mobilization and approved structural steel progress", amount: 4_860_000, reference: "NGL-PB-01" },
  { id: "warehouse-02", number: "PB-MEC-24-017-002", projectId: DEMO_PROJECT_IDS.warehouse, daysAgo: 25, status: "ISSUED", title: "Loading bay and electrical rough-in progress", amount: 2_740_000, reference: "NGL-PB-02" },
  { id: "warehouse-03", number: "PB-MEC-24-017-003", projectId: DEMO_PROJECT_IDS.warehouse, daysAgo: 4, status: "SUBMITTED", title: "Steel framing close-out valuation", amount: 1_315_000, reference: "NGL-PB-03" },
  { id: "drainage-01", number: "PB-MEC-25-006-001", projectId: DEMO_PROJECT_IDS.drainage, daysAgo: 48, status: "ISSUED", title: "Catch-basin reconstruction progress", amount: 2_180_000, reference: "RCE-PB-01" },
  { id: "drainage-02", number: "PB-MEC-25-006-002", projectId: DEMO_PROJECT_IDS.drainage, daysAgo: 8, status: "DRAFT", title: "Downstream pipe replacement valuation", amount: 1_040_000, reference: "RCE-PB-02" },
  { id: "solar-01", number: "PB-MEC-25-012-001", projectId: DEMO_PROJECT_IDS.solar, daysAgo: 22, status: "ISSUED", title: "Earthworks and access-road progress", amount: 2_460_000, reference: "SRP-PB-01" },
  { id: "cebu-01", number: "PB-MEC-24-009-001", projectId: DEMO_PROJECT_IDS.cebu, daysAgo: 130, status: "ISSUED", title: "Final fit-out and handover valuation", amount: 3_680_000, reference: "HTS-PB-FINAL" },
];

function billingFromSpec(spec: DemoBillingSpec, anchorDate: string): ClientBilling {
  const billingDate = addDemoDays(anchorDate, -spec.daysAgo);
  const timestamp = demoTimestamp(billingDate, 10, Number(spec.id.length));
  return {
    id: `demo-client-billing-${spec.id}`,
    companyId: DEMO_COMPANY_ID,
    projectId: spec.projectId,
    billingNumber: spec.number,
    billingDate,
    periodStart: addDemoDays(billingDate, -28),
    periodEnd: billingDate,
    clientNameSnapshot: undefined,
    clientReferenceSnapshot: spec.reference,
    currency: "PHP",
    status: spec.status,
    notes: "Demo billing record — revenue-side client progress billing only; no collection or settlement is implied.",
    lines: [{
      id: `demo-client-billing-line-${spec.id}`,
      billingId: `demo-client-billing-${spec.id}`,
      lineNumber: 1,
      description: spec.title,
      amount: spec.amount,
      createdAt: timestamp,
      updatedAt: timestamp,
    }],
    submittedByUserId: spec.status === "DRAFT" ? undefined : "demo-user-finance",
    submittedAt: spec.status === "DRAFT" ? undefined : demoTimestamp(addDemoDays(billingDate, -2), 14, 0),
    issuedByUserId: spec.status === "ISSUED" ? "demo-user-finance" : undefined,
    issuedAt: spec.status === "ISSUED" ? timestamp : undefined,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function createDemoClientBillings(anchorDate: string): {
  clientBillings: ClientBilling[];
  clientBillingEvents: ClientBillingEvent[];
} {
  const clientBillings = SPECS.map((spec) => billingFromSpec(spec, anchorDate));
  const clientBillingEvents = clientBillings.flatMap((billing) => {
    const createdAt = billing.createdAt;
    const events: ClientBillingEvent[] = [{
      id: `${billing.id}-created`,
      companyId: DEMO_COMPANY_ID,
      billingId: billing.id,
      eventType: "CREATED",
      toStatus: "DRAFT",
      actorUserId: "demo-user-finance",
      createdAt,
    }];
    if (billing.status !== "DRAFT") events.push({
      id: `${billing.id}-submitted`,
      companyId: DEMO_COMPANY_ID,
      billingId: billing.id,
      eventType: "SUBMITTED",
      fromStatus: "DRAFT",
      toStatus: "SUBMITTED",
      actorUserId: "demo-user-finance",
      createdAt: billing.submittedAt || createdAt,
    });
    if (billing.status === "ISSUED") events.push({
      id: `${billing.id}-issued`,
      companyId: DEMO_COMPANY_ID,
      billingId: billing.id,
      eventType: "ISSUED",
      fromStatus: "SUBMITTED",
      toStatus: "ISSUED",
      actorUserId: "demo-user-finance",
      createdAt: billing.issuedAt || createdAt,
    });
    return events;
  }).sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  return { clientBillings, clientBillingEvents };
}
