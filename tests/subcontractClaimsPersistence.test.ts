import test from "node:test";
import assert from "node:assert/strict";
import type { Subcontract, SubcontractProgressClaim } from "../src/types.ts";
import {
  readSubcontractClaimsFromLocal,
  writeSubcontractClaimsToLocal,
  saveSubcontractClaim,
  transitionSubcontractClaim,
  deleteDraftSubcontractClaim,
  clearSubcontractClaimMemoryStore,
  subcontractClaimFromRow,
  subcontractClaimLineFromRow,
} from "../src/lib/subcontractClaims.ts";
import { PROJECT_LIFECYCLE_DEPENDENCY_KEYS } from "../src/lib/projects.ts";
import { demoProjectLifecyclePreview } from "../src/demo/demoState.ts";
import { createDemoWorkspace } from "../src/demo/data/createDemoWorkspace.ts";
import { defaultDemoAnchorDate } from "../src/demo/data/demoDates.ts";

function createMockStorage(): Storage {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, String(value)),
    removeItem: (key: string) => store.delete(key),
    clear: () => store.clear(),
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    get length() { return store.size; },
  };
}

const mockSubcontract: Subcontract = {
  id: "sc-persist-1",
  subcontractNumber: "SC-2026-PERSIST",
  vendorId: "vendor-1",
  projectId: "proj-1",
  title: "Glazing & Facade Installation",
  currency: "PHP",
  status: "ACTIVE",
  originalAmount: 1_000_000,
  lines: [
    {
      id: "scl-p1",
      subcontractId: "sc-persist-1",
      lineNumber: 1,
      description: "Curtain wall framing",
      amount: 600_000,
      quantity: 1,
      unit: "lot",
      unitRate: 600_000,
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    },
    {
      id: "scl-p2",
      subcontractId: "sc-persist-1",
      lineNumber: 2,
      description: "Double glazed panels",
      amount: 400_000,
      quantity: 1,
      unit: "lot",
      unitRate: 400_000,
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    },
  ],
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};

test("subcontract claims local storage reads and writes correctly", () => {
  const storage = createMockStorage();
  const initial = readSubcontractClaimsFromLocal(storage);
  assert.deepEqual(initial, []);

  const claim: SubcontractProgressClaim = {
    id: "pc-test-1",
    claimNumber: "PC-001",
    subcontractId: "sc-persist-1",
    projectId: "proj-1",
    valuationDate: "2026-02-28",
    status: "DRAFT",
    retentionRate: 0.1,
    claimedGrossAmount: 300_000,
    approvedGrossAmount: 0,
    retentionAmount: 0,
    netCertifiedAmount: 0,
    currency: "PHP",
    lines: [],
    createdAt: "2026-02-28T00:00:00Z",
    updatedAt: "2026-02-28T00:00:00Z",
  };

  writeSubcontractClaimsToLocal([claim], storage);
  const loaded = readSubcontractClaimsFromLocal(storage);
  assert.equal(loaded.length, 1);
  assert.equal(loaded[0].claimNumber, "PC-001");
  assert.equal(loaded[0].claimedGrossAmount, 300_000);
});

test("subcontract claim row mappers accurately handle database row transformations", () => {
  const claimRow = {
    id: "pc-row-1",
    company_id: "comp-1",
    subcontract_id: "sc-persist-1",
    project_id: "proj-1",
    claim_number: "PC-2026-001",
    valuation_date: "2026-03-01",
    period_start: "2026-02-01",
    period_end: "2026-02-28",
    status: "APPROVED",
    retention_rate: 0.1,
    claimed_gross_amount: 500000,
    approved_gross_amount: 500000,
    retention_amount: 50000,
    net_certified_amount: 450000,
    currency: "PHP",
    notes: "Monthly progress certificate",
    reason: null,
    created_at: "2026-03-01T10:00:00Z",
    updated_at: "2026-03-01T12:00:00Z",
  };

  const lineRow = {
    id: "pcl-row-1",
    company_id: "comp-1",
    claim_id: "pc-row-1",
    subcontract_line_id: "scl-p1",
    claimed_amount: 500000,
    approved_amount: 500000,
    retention_amount: 50000,
    net_amount: 450000,
    notes: "Wall erection",
    created_at: "2026-03-01T10:00:00Z",
    updated_at: "2026-03-01T12:00:00Z",
  };

  const claim = subcontractClaimFromRow(claimRow, [lineRow]);
  assert.equal(claim.id, "pc-row-1");
  assert.equal(claim.subcontractId, "sc-persist-1");
  assert.equal(claim.claimNumber, "PC-2026-001");
  assert.equal(claim.status, "APPROVED");
  assert.equal(claim.retentionRate, 0.1);
  assert.equal(claim.claimedGrossAmount, 500_000);
  assert.equal(claim.approvedGrossAmount, 500_000);
  assert.equal(claim.retentionAmount, 50_000);
  assert.equal(claim.netCertifiedAmount, 450_000);
  assert.equal(claim.lines?.length, 1);

  const mappedLine = subcontractClaimLineFromRow(lineRow);
  assert.equal(mappedLine.id, "pcl-row-1");
  assert.equal(mappedLine.subcontractLineId, "scl-p1");
  assert.equal(mappedLine.claimedAmount, 500_000);
  assert.equal(mappedLine.approvedAmount, 500_000);
  assert.equal(mappedLine.notes, "Wall erection");
});

test("saveSubcontractClaim and transitionSubcontractClaim operate on in-memory store in local fallback mode", async () => {
  clearSubcontractClaimMemoryStore();

  // 1. Create a draft claim
  const draft = await saveSubcontractClaim(
    {
      subcontractId: "sc-persist-1",
      projectId: "proj-1",
      claimNumber: "PC-001",
      valuationDate: "2026-03-01",
      retentionRate: 0.1,
      notes: "First progress valuation",
    },
    [
      { subcontractLineId: "scl-p1", claimedAmount: 400_000, notes: "Framing phase 1" },
      { subcontractLineId: "scl-p2", claimedAmount: 150_000, notes: "Panel deliveries" },
    ],
  );

  assert.equal(draft.status, "DRAFT");
  assert.equal(draft.claimedGrossAmount, 550_000);
  assert.equal(draft.approvedGrossAmount, 0);
  assert.equal(draft.lines?.length, 2);

  // 2. Transition to SUBMITTED
  const submitted = await transitionSubcontractClaim(draft.id, "SUBMITTED", undefined, undefined, mockSubcontract);
  assert.equal(submitted.status, "SUBMITTED");

  // 3. Transition to APPROVED with line adjustments
  const approved = await transitionSubcontractClaim(
    draft.id,
    "APPROVED",
    undefined,
    [
      { claimLineId: submitted.lines![0].id, approvedAmount: 350_000 },
      { claimLineId: submitted.lines![1].id, approvedAmount: 150_000 },
    ],
    mockSubcontract,
  );

  assert.equal(approved.status, "APPROVED");
  assert.equal(approved.approvedGrossAmount, 500_000);
  assert.equal(approved.retentionAmount, 50_000); // 10%
  assert.equal(approved.netCertifiedAmount, 450_000); // 500k - 50k

  // 4. Attempting to delete an APPROVED claim must throw
  await assert.rejects(
    () => deleteDraftSubcontractClaim(approved.id),
    /Only draft progress claims may be deleted/,
  );
});

test("deleteDraftSubcontractClaim deletes draft claim but rejects submitted or approved claims", async () => {
  clearSubcontractClaimMemoryStore();

  const draft = await saveSubcontractClaim(
    {
      subcontractId: "sc-persist-1",
      projectId: "proj-1",
      claimNumber: "PC-DRAFT-DEL",
      valuationDate: "2026-03-05",
    },
    [{ subcontractLineId: "scl-p1", claimedAmount: 100_000 }],
  );

  // Deleting draft succeeds
  await deleteDraftSubcontractClaim(draft.id);

  // Re-saving as submitted
  const draft2 = await saveSubcontractClaim(
    {
      subcontractId: "sc-persist-1",
      projectId: "proj-1",
      claimNumber: "PC-SUBMITTED-DEL",
      valuationDate: "2026-03-05",
    },
    [{ subcontractLineId: "scl-p1", claimedAmount: 100_000 }],
  );
  const submitted2 = await transitionSubcontractClaim(draft2.id, "SUBMITTED", undefined, undefined, mockSubcontract);

  // Deleting submitted claim must fail
  await assert.rejects(
    () => deleteDraftSubcontractClaim(submitted2.id),
    /Only draft progress claims may be deleted/,
  );
});

test("project lifecycle dependency contracts include subcontract progress claims", () => {
  assert.ok(
    PROJECT_LIFECYCLE_DEPENDENCY_KEYS.includes("subcontractProgressClaims"),
    "PROJECT_LIFECYCLE_DEPENDENCY_KEYS must include subcontractProgressClaims",
  );

  const anchor = defaultDemoAnchorDate();
  const demoData = createDemoWorkspace(anchor);
  const project = demoData.projects.find((p) => p.id === "demo-project-warehouse")!;
  const preview = demoProjectLifecyclePreview(demoData, project);

  assert.ok(
    preview.dependencies.subcontractProgressClaims > 0,
    "demo-project-warehouse must have subcontract progress claims blocking accidental deletion",
  );
  assert.equal(preview.canDelete, false, "Project with subcontract claims cannot be permanently deleted");
});
