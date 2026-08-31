import test from "node:test";
import assert from "node:assert/strict";
import {
  resolveVendorCandidate,
  resolveBatchVendors,
} from "../src/lib/entityResolution.ts";
import type { Vendor, EmailIntakeProfile, InvoiceData } from "../src/types.ts";

const sampleMasterVendors: Vendor[] = [
  {
    id: "v-ph-concrete",
    companyId: "company-main",
    name: "Philippine Concrete & Aggregate Corp",
    normalizedName: "philippine concrete aggregate corp",
    taxId: "123-456-789-000",
    email: "billing@phconcrete.com.ph",
  },
  {
    id: "v-manila-steel",
    companyId: "company-main",
    name: "Manila Steel Fabricators Inc",
    normalizedName: "manila steel fabricators inc",
    taxId: "987-654-321-000",
    email: "invoicing@manilasteel.ph",
  },
];

test("Phase 4C Vendor Resolution: Authoritative post-extraction resolution with matching TIN links cleanly to existing vendor", () => {
  const extractedInvoice: Partial<InvoiceData> = {
    id: "cand-inv-1",
    fileName: "PH_Concrete_Inv_1001.pdf",
    vendor: {
      name: "Philippine Concrete & Aggregate Corp.",
      taxId: "123-456-789-000",
    },
  };

  const candidateItem = {
    candidateId: "cand-inv-1",
    evidence: {
      name: extractedInvoice.vendor?.name,
      taxId: extractedInvoice.vendor?.taxId,
      senderEmail: "billing@phconcrete.com.ph",
    },
    sourceRef: {
      fileName: "PH_Concrete_Inv_1001.pdf",
      sender: "billing@phconcrete.com.ph",
    },
  };

  const resolution = resolveVendorCandidate(candidateItem, sampleMasterVendors, []);

  assert.equal(resolution.proposedAction, "LINK_EXISTING");
  assert.equal(resolution.matchedEntityId, "v-ph-concrete");
  assert.equal(resolution.conflicts.length, 0);
});

test("Phase 4C Vendor Resolution: Preliminary mailbox hint contradicted by extracted TIN flags conflict and requires human review", () => {
  const profileWithVendorHint: EmailIntakeProfile = {
    id: "prof-vendor-hint",
    companyId: "company-main",
    name: "Concrete Vendor Mailbox Hint",
    enabled: true,
    senderEmail: "shared-broker@forwarder.ph",
    suggestedDestination: "INVOICE",
    linkedVendorId: "v-ph-concrete", // Preliminary hint points to Concrete
    createdAt: "2026-08-01T00:00:00Z",
    updatedAt: "2026-08-01T00:00:00Z",
  };

  // However, the extracted invoice has Manila Steel's TIN and name
  const candidateWithContradiction = {
    candidateId: "cand-contradiction",
    evidence: {
      name: "Manila Steel Fabricators Inc",
      taxId: "987-654-321-000", // Manila Steel TIN
      senderEmail: "shared-broker@forwarder.ph",
      matchedProfileId: "prof-vendor-hint",
      linkedProfileVendorId: "v-ph-concrete", // Contradicts Manila Steel
    },
    sourceRef: {
      fileName: "Steel_Invoice.pdf",
      sender: "shared-broker@forwarder.ph",
    },
  };

  const resolution = resolveVendorCandidate(
    candidateWithContradiction,
    sampleMasterVendors,
    [profileWithVendorHint]
  );

  // Authoritative extracted evidence contradicts profile rule: flags conflict and NEEDS_REVIEW
  assert.equal(resolution.proposedAction, "NEEDS_REVIEW");
  assert.ok(resolution.conflicts.length > 0);
  assert.ok(
    resolution.conflicts.some((c) =>
      c.reason.toLowerCase().includes("rule") || c.reason.toLowerCase().includes("conflict")
    )
  );
});

test("Phase 4C Vendor Master Data Protection: Extraction never mutates master vendor database or auto-creates vendors", () => {
  const initialMasterVendorCount = sampleMasterVendors.length;

  const candidateUnknownVendor = {
    candidateId: "cand-unknown",
    evidence: {
      name: "Brand New Unregistered Supplier Corp",
      taxId: "555-666-777-000",
      senderEmail: "sales@brandnewsupplier.ph",
    },
    sourceRef: {
      fileName: "BrandNew_Inv.pdf",
      sender: "sales@brandnewsupplier.ph",
    },
  };

  const resolution = resolveVendorCandidate(
    candidateUnknownVendor,
    sampleMasterVendors,
    []
  );

  assert.equal(resolution.proposedAction, "CREATE_NEW");
  // Proposes CREATE_NEW for user review, but does NOT mutate master vendors array
  assert.equal(sampleMasterVendors.length, initialMasterVendorCount);
});
