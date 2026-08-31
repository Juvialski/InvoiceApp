import test from "node:test";
import assert from "node:assert/strict";
import { resolveBatchVendors } from "../src/lib/entityResolution.ts";
import type { Vendor, VendorIdentityEvidence } from "../src/types.ts";

const existingVendors: Vendor[] = [
  {
    id: "v-abc",
    companyId: "comp-1",
    name: "ABC Steel Corporation",
    normalizedName: "abc steel",
    taxId: "123-456-789-000",
    email: "billing@abcsteel.ph",
  },
];

test("Same-batch vendor grouping: three spelling/casing variants with same TIN collapse to ONE group linking existing vendor", () => {
  const candidateA = {
    candidateId: "cand-1",
    evidence: {
      name: "ABC Steel Corporation",
      taxId: "123-456-789-000",
      email: "billing@abcsteel.ph",
    },
  };
  const candidateB = {
    candidateId: "cand-2",
    evidence: {
      name: "ABC Steel Corp.",
      taxId: "123456789000",
      email: "invoices@abcsteel.ph",
    },
  };
  const candidateC = {
    candidateId: "cand-3",
    evidence: {
      name: "ABC STEEL",
      taxId: "123-456-789",
      senderDomain: "abcsteel.ph",
    },
  };

  const { resolutions, groups } = resolveBatchVendors(
    [candidateA, candidateB, candidateC],
    existingVendors
  );

  // Exactly 1 group containing all 3 candidates
  const groupIds = Object.keys(groups);
  assert.equal(groupIds.length, 1);
  assert.deepEqual(groups[groupIds[0]].sort(), ["cand-1", "cand-2", "cand-3"]);

  // All 3 resolve to existing vendor
  assert.equal(resolutions["cand-1"].matchedEntityId, "v-abc");
  assert.equal(resolutions["cand-2"].matchedEntityId, "v-abc");
  assert.equal(resolutions["cand-3"].matchedEntityId, "v-abc");
  assert.equal(resolutions["cand-1"].proposedAction, "LINK_EXISTING");
});

test("Same-batch vendor grouping: unseen vendor with 3 emails produces ONE single CREATE_NEW proposal with accumulated evidence", () => {
  const candidateA = {
    candidateId: "msg-101",
    evidence: {
      name: "Summit Industrial Supply Corp",
      taxId: "777-888-999-000",
      email: "sales@summitsupply.ph",
      address: "100 Pioneer St, Mandaluyong",
    },
  };
  const candidateB = {
    candidateId: "msg-102",
    evidence: {
      name: "Summit Industrial Supply",
      taxId: "777-888-999-000",
      email: "billing@summitsupply.ph",
      phone: "02-8999-1111",
    },
  };
  const candidateC = {
    candidateId: "msg-103",
    evidence: {
      name: "Summit Industrial",
      taxId: "777888999",
      senderDomain: "summitsupply.ph",
    },
  };

  const { resolutions, groups } = resolveBatchVendors(
    [candidateA, candidateB, candidateC],
    existingVendors
  );

  // Exactly 1 group
  const groupIds = Object.keys(groups);
  assert.equal(groupIds.length, 1);
  assert.equal(groups[groupIds[0]].length, 3);

  // Proposals are CREATE_NEW
  assert.equal(resolutions["msg-101"].proposedAction, "CREATE_NEW");
  assert.equal(resolutions["msg-102"].proposedAction, "CREATE_NEW");
  assert.equal(resolutions["msg-103"].proposedAction, "CREATE_NEW");

  // Only ONE primary group entity
  const primaryCount = [
    resolutions["msg-101"].isGroupPrimary,
    resolutions["msg-102"].isGroupPrimary,
    resolutions["msg-103"].isGroupPrimary,
  ].filter(Boolean).length;
  assert.equal(primaryCount, 1);

  // Accumulated evidence preserved across group
  const primary = resolutions[groups[groupIds[0]][0]];
  assert.ok(primary.extractedEvidence.accumulatedEmails.includes("sales@summitsupply.ph"));
  assert.ok(primary.extractedEvidence.accumulatedEmails.includes("billing@summitsupply.ph"));
  assert.ok(primary.extractedEvidence.accumulatedPhones.includes("02-8999-1111"));
});

test("Same-batch vendor grouping: order independence (permutations yield identical grouping and resolutions)", () => {
  const c1 = {
    candidateId: "c1",
    evidence: { name: "Apex Builders Corp", taxId: "555-666-777-000", email: "a@apex.ph" },
  };
  const c2 = {
    candidateId: "c2",
    evidence: { name: "Apex Builders", taxId: "555-666-777-000", email: "b@apex.ph" },
  };
  const c3 = {
    candidateId: "c3",
    evidence: { name: "Delta Supplies Inc", taxId: "111-222-333-000", email: "d@delta.ph" },
  };

  const order1 = [c1, c2, c3];
  const order2 = [c3, c1, c2];
  const order3 = [c2, c3, c1];

  const res1 = resolveBatchVendors(order1, existingVendors);
  const res2 = resolveBatchVendors(order2, existingVendors);
  const res3 = resolveBatchVendors(order3, existingVendors);

  // Group structures are identical
  assert.deepEqual(Object.values(res1.groups).map((g) => g.sort()).sort(), Object.values(res2.groups).map((g) => g.sort()).sort());
  assert.deepEqual(Object.values(res1.groups).map((g) => g.sort()).sort(), Object.values(res3.groups).map((g) => g.sort()).sort());

  // Individual proposed actions and matched group IDs are identical
  assert.equal(res1.resolutions["c1"].batchGroupId, res2.resolutions["c1"].batchGroupId);
  assert.equal(res1.resolutions["c2"].batchGroupId, res3.resolutions["c2"].batchGroupId);
  assert.equal(res1.resolutions["c3"].batchGroupId, res2.resolutions["c3"].batchGroupId);
});

test("Same-batch vendor grouping: same name with conflicting TINs are NOT merged and flagged NEEDS_REVIEW", () => {
  const candidateA = {
    candidateId: "c-tin-1",
    evidence: {
      name: "Global Trade Corp",
      taxId: "111-222-333-000",
      email: "info@globaltrade.ph",
    },
  };
  const candidateB = {
    candidateId: "c-tin-2",
    evidence: {
      name: "Global Trade Corp",
      taxId: "999-888-777-000", // Conflicting TIN!
      email: "info@globaltrade.ph",
    },
  };

  const { resolutions } = resolveBatchVendors([candidateA, candidateB], existingVendors);

  // Both should be marked NEEDS_REVIEW due to conflicting TINs
  assert.equal(resolutions["c-tin-1"].proposedAction, "NEEDS_REVIEW");
  assert.equal(resolutions["c-tin-2"].proposedAction, "NEEDS_REVIEW");
  assert.equal(resolutions["c-tin-1"].conflicts.some((c) => c.field === "taxId"), true);
});

test("Same-batch vendor grouping: same generic domain (e.g. gmail.com) does NOT create unsafe grouping", () => {
  const candidateA = {
    candidateId: "g-1",
    evidence: {
      name: "Contractor Alpha",
      senderEmail: "contractor.alpha@gmail.com",
      senderDomain: "gmail.com",
    },
  };
  const candidateB = {
    candidateId: "g-2",
    evidence: {
      name: "Plumber Beta",
      senderEmail: "plumber.beta@gmail.com",
      senderDomain: "gmail.com",
    },
  };

  const { groups } = resolveBatchVendors([candidateA, candidateB], existingVendors);
  // Must NOT be grouped together into 1 group!
  assert.equal(Object.keys(groups).length, 2);
});
