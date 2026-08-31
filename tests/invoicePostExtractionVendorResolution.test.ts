import test from "node:test";
import assert from "node:assert/strict";
import {
  extractVendorEvidenceFromInvoice,
  resolveVendorCandidate,
  resolveBatchVendors,
} from "../src/lib/entityResolution.ts";
import type {
  EmailIntakeProfile,
  EntityResolutionResult,
  InvoiceData,
  Vendor,
} from "../src/types.ts";

const existingVendors: Vendor[] = [
  {
    id: "v-apex",
    companyId: "comp-1",
    name: "Apex Construction Corp",
    normalizedName: "apex construction corp",
    taxId: "123-456-789-000",
    email: "billing@apexbuilders.ph",
    phone: "02-8888-1234",
    address: "789 Ortigas Ave, Pasig City",
  },
  {
    id: "v-alpha",
    companyId: "comp-1",
    name: "Alpha Transport Services",
    normalizedName: "alpha transport services",
    taxId: "234-567-890-000",
    email: "billing@alphatransport.ph",
  },
  {
    id: "v-metro",
    companyId: "comp-1",
    name: "Metro Hardware Supplies Inc.",
    normalizedName: "metro hardware supplies inc",
    taxId: "345-678-901-000",
    email: "sales@metrohardware.ph",
  },
];

test("Invoice resolution: TIN normalization passes extracted raw TIN to resolver and matches existing vendor", () => {
  const invoice: Partial<InvoiceData> = {
    id: "inv-101",
    invoiceNumber: "INV-2026-001",
    vendor: {
      name: "Apex Construction",
      taxId: "TIN: 123 456 789 000",
      email: "invoices@apexbuilders.ph",
    },
  };

  const evidence = extractVendorEvidenceFromInvoice(
    invoice as InvoiceData,
    { sender: "billing@apexbuilders.ph", attachmentName: "Apex_Invoice_001.pdf" }
  );

  // Evidence retains raw/joined TIN while resolver normalizes it
  assert.equal(evidence.taxId, "TIN: 123 456 789 000");

  const resolution = resolveVendorCandidate(
    { candidateId: "inv-101", evidence },
    existingVendors
  );

  assert.equal(resolution.proposedAction, "LINK_EXISTING");
  assert.equal(resolution.matchedEntityId, "v-apex");
  assert.equal(resolution.matchedEntityName, "Apex Construction Corp");
  assert.equal(resolution.confidence, "HIGH");
  assert.ok((resolution.confidenceScore ?? 0) >= 90);
  assert.ok(resolution.matchReasons.some((r) => r.toLowerCase().includes("tax id") || r.toLowerCase().includes("tin")));
});

test("Invoice resolution: matches on registered name even when trade name differs", () => {
  const invoice: Partial<InvoiceData> = {
    id: "inv-102",
    invoiceNumber: "INV-2026-002",
    vendor: {
      name: "Apex Builders",
      registeredName: "Apex Construction Corp",
    },
  };

  const evidence = extractVendorEvidenceFromInvoice(
    invoice as InvoiceData,
    { sender: "billing@apexbuilders.ph" }
  );

  const resolution = resolveVendorCandidate(
    { candidateId: "inv-102", evidence },
    existingVendors
  );

  assert.equal(resolution.proposedAction, "LINK_EXISTING");
  assert.equal(resolution.matchedEntityId, "v-apex");
  assert.equal(resolution.confidence, "HIGH");
  assert.ok((resolution.confidenceScore ?? 0) >= 80);
});

test("Invoice resolution: profile vendor conflict causes NEEDS_REVIEW and reports identity conflict", () => {
  const invoice: Partial<InvoiceData> = {
    id: "inv-103",
    invoiceNumber: "INV-2026-003",
    vendor: {
      name: "Apex Construction Corp",
      taxId: "123-456-789-000", // Matches Apex (v-apex)
    },
  };

  const profile: EmailIntakeProfile = {
    id: "prof-1",
    companyId: "comp-1",
    name: "Alpha Transport Rule",
    enabled: true,
    suggestedDestination: "INVOICE",
    linkedVendorId: "v-alpha", // Rule points to Alpha Transport (v-alpha)
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
  };

  const evidence = extractVendorEvidenceFromInvoice(
    invoice as InvoiceData,
    { sender: "billing@apexbuilders.ph" },
    profile
  );

  const resolution = resolveVendorCandidate(
    { candidateId: "inv-103", evidence },
    existingVendors,
    [profile]
  );

  assert.equal(resolution.proposedAction, "NEEDS_REVIEW");
  assert.ok(resolution.conflicts && resolution.conflicts.length > 0);
  assert.equal(resolution.conflicts[0].field, "taxId");
  assert.ok(resolution.conflicts[0].reason.includes("Alpha Transport"));
});

test("Invoice resolution: same-batch grouping groups unseen TINs into one single CREATE_NEW proposal with accumulated evidence", () => {
  const invoice1: Partial<InvoiceData> = {
    id: "inv-batch-1",
    vendor: {
      name: "Zeta Steel Corp",
      taxId: "888-777-666-000",
      email: "orders@zetasteel.ph",
      phone: "02-8999-1111",
    },
  };
  const invoice2: Partial<InvoiceData> = {
    id: "inv-batch-2",
    vendor: {
      name: "Zeta Steel Corporation",
      taxId: "888777666000",
      email: "accounts@zetasteel.ph",
      address: "Industrial Zone, Laguna",
    },
  };

  const cand1 = {
    candidateId: "inv-batch-1",
    evidence: extractVendorEvidenceFromInvoice(
      invoice1 as InvoiceData,
      { sender: "billing@zetasteel.ph" }
    ),
  };
  const cand2 = {
    candidateId: "inv-batch-2",
    evidence: extractVendorEvidenceFromInvoice(
      invoice2 as InvoiceData,
      { sender: "invoices@zetasteel.ph" }
    ),
  };

  const { resolutions, groups } = resolveBatchVendors([cand1, cand2], existingVendors);

  const groupIds = Object.keys(groups);
  assert.equal(groupIds.length, 1);
  assert.equal(groups[groupIds[0]].length, 2);

  const res1 = resolutions["inv-batch-1"];
  const res2 = resolutions["inv-batch-2"];

  assert.equal(res1.proposedAction, "CREATE_NEW");
  assert.equal(res2.proposedAction, "CREATE_NEW");
  assert.equal(res1.batchGroupId, res2.batchGroupId);
  assert.equal(res1.groupMemberCount, 2);

  // Accumulated details present in extractedEvidence
  const evidence1 = res1.extractedEvidence as any;
  assert.ok(evidence1.accumulatedEmails?.includes("orders@zetasteel.ph"));
  assert.ok(evidence1.accumulatedEmails?.includes("accounts@zetasteel.ph"));
  assert.ok(evidence1.accumulatedPhones?.includes("02-8999-1111"));
  assert.ok(evidence1.accumulatedAddresses?.includes("Industrial Zone, Laguna"));
});

test("Invoice resolution: confirmed existing vendor link selection updates invoice draft cleanly", () => {
  const initialResolution: EntityResolutionResult = {
    entityType: "VENDOR",
    candidateId: "inv-manual-1",
    proposedAction: "LINK_EXISTING",
    confidence: "HIGH",
    confidenceScore: 98,
    matchReasons: ["Exact tax ID match"],
    conflicts: [],
    proposedEnrichments: [],
    extractedEvidence: {},
    normalizedEvidence: {},
    matchedEntityId: "v-apex",
    matchedEntityName: "Apex Construction Corp",
  };

  const rawInvoice: InvoiceData = {
    id: "inv-manual-1",
    invoiceNumber: "INV-2026-999",
    invoiceDate: "2026-08-01",
    currency: "PHP",
    subtotal: 10000,
    totalTax: 1200,
    grandTotal: 11200,
    items: [],
    status: "CONFIRMED",
    lifecycleStatus: "ACTIVE",
    customer: { name: "Our Company" },
    extractedAt: "2026-08-01T00:00:00Z",
    modelUsed: "test",
    vendor: {
      name: "Apex (Typo)",
      taxId: "123-456-789-000",
    },
    entityResolution: initialResolution,
  };

  // Simulate user confirming / updating vendor to matched existing vendor
  const matchedVendor = existingVendors.find((v) => v.id === "v-apex")!;
  const updatedInvoice: InvoiceData = {
    ...rawInvoice,
    vendor: {
      ...rawInvoice.vendor,
      name: matchedVendor.name,
      registeredName: (matchedVendor as any).registeredName || matchedVendor.name,
      taxId: matchedVendor.taxId || rawInvoice.vendor?.taxId,
      email: matchedVendor.email || undefined,
      phone: matchedVendor.phone || undefined,
      address: matchedVendor.address || undefined,
    },
    entityResolution: {
      ...rawInvoice.entityResolution!,
      proposedAction: "LINK_EXISTING",
      matchedEntityId: matchedVendor.id,
      matchedEntityName: matchedVendor.name,
    },
  };

  assert.equal(updatedInvoice.vendor.name, "Apex Construction Corp");
  assert.equal(updatedInvoice.vendor.email, "billing@apexbuilders.ph");
  assert.equal(updatedInvoice.vendor.phone, "02-8888-1234");
  assert.equal(updatedInvoice.entityResolution?.matchedEntityId, "v-apex");
});

test("Invoice resolution: multi-attachment email preserves separate source identities without cross-contamination", () => {
  const att1Evidence = extractVendorEvidenceFromInvoice(
    {
      id: "inv-att-1",
      vendor: { name: "Apex Construction", taxId: "123-456-789-000" },
    } as InvoiceData,
    {
      sender: "inbox@clientcompany.ph",
      attachmentName: "Apex_Invoice.pdf",
    }
  );

  const att2Evidence = extractVendorEvidenceFromInvoice(
    {
      id: "inv-att-2",
      vendor: { name: "Alpha Transport", taxId: "234-567-890-000" },
    } as InvoiceData,
    {
      sender: "inbox@clientcompany.ph",
      attachmentName: "Alpha_Waybill.pdf",
    }
  );

  const res1 = resolveVendorCandidate({ candidateId: "inv-att-1", evidence: att1Evidence }, existingVendors);
  const res2 = resolveVendorCandidate({ candidateId: "inv-att-2", evidence: att2Evidence }, existingVendors);

  assert.equal(res1.matchedEntityId, "v-apex");
  assert.equal(res2.matchedEntityId, "v-alpha");
  assert.notEqual(res1.matchedEntityId, res2.matchedEntityId);
});

test("Invoice resolution: master data immutability boundary is strictly preserved", () => {
  const masterVendorsCopy = JSON.parse(JSON.stringify(existingVendors));
  Object.freeze(existingVendors);

  const invoice: Partial<InvoiceData> = {
    id: "inv-immutable",
    vendor: {
      name: "New Unseen Vendor Corp",
      taxId: "555-444-333-000",
    },
  };

  const evidence = extractVendorEvidenceFromInvoice(invoice as InvoiceData, { sender: "new@vendor.ph" });
  const res = resolveVendorCandidate({ candidateId: "inv-immutable", evidence }, existingVendors);

  assert.equal(res.proposedAction, "CREATE_NEW");
  // Verify master vendor list did not change or gain any records
  assert.equal(existingVendors.length, masterVendorsCopy.length);
  assert.deepEqual(existingVendors, masterVendorsCopy);
});
