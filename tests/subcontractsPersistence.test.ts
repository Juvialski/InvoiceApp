import test from "node:test";
import assert from "node:assert/strict";
import type { Subcontract, SubcontractLine } from "../src/types.ts";
import {
  readSubcontractsFromLocal,
  writeSubcontractsToLocal,
  saveSubcontract,
  transitionSubcontract,
  deleteDraftSubcontract,
  clearSubcontractMemoryStore,
  fetchSubcontracts,
  applySubcontractTransition,
  subcontractFromRow,
  subcontractLineFromRow,
} from "../src/lib/subcontracts.ts";
import { clearCompanyContext, setActiveCompanyId } from "../src/lib/companyContext.ts";

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

test("subcontracts local storage reads and writes correctly", () => {
  const storage = createMockStorage();
  const initial = readSubcontractsFromLocal(storage);
  assert.deepEqual(initial, []);

  const sc: Subcontract = {
    id: "sc-test-01",
    subcontractNumber: "SC-2026-001",
    vendorId: "vendor-1",
    projectId: "project-1",
    title: "Structural Glazing Package",
    currency: "PHP",
    status: "DRAFT",
    originalAmount: 500_000,
    lines: [],
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };

  writeSubcontractsToLocal([sc], storage);
  const loaded = readSubcontractsFromLocal(storage);
  assert.equal(loaded.length, 1);
  assert.equal(loaded[0].subcontractNumber, "SC-2026-001");
  assert.equal(loaded[0].title, "Structural Glazing Package");
});

test("subcontract row mappers handle database rows with line items accurately", () => {
  const lineRow = {
    id: "scl-1",
    company_id: "comp-1",
    subcontract_id: "sc-1",
    line_number: 1,
    description: "HVAC Chiller Piping Installation",
    amount: "750000.50",
    quantity: "1",
    unit: "lot",
    unit_rate: "750000.50",
    project_cost_code_id: "cc-101",
    notes: "Includes test fittings",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };

  const line = subcontractLineFromRow(lineRow);
  assert.equal(line.id, "scl-1");
  assert.equal(line.amount, 750000.5);
  assert.equal(line.projectCostCodeId, "cc-101");

  const scRow = {
    id: "sc-1",
    company_id: "comp-1",
    subcontract_number: "sc-2026-001",
    vendor_id: "v-1",
    project_id: "p-1",
    title: "Mechanical Works",
    currency: "php",
    status: "active",
    original_amount: "750000.50",
  };

  const sc = subcontractFromRow(scRow, [lineRow]);
  assert.equal(sc.subcontractNumber, "SC-2026-001");
  assert.equal(sc.status, "ACTIVE");
  assert.equal(sc.originalAmount, 750000.5);
  assert.equal(sc.lines?.length, 1);
});

test("saveSubcontract validates required fields and computes total from lines", async () => {
  clearSubcontractMemoryStore();

  // Test missing number
  await assert.rejects(
    async () => {
      await saveSubcontract(
        { subcontractNumber: "", vendorId: "v-1", projectId: "p-1", title: "Test" },
        [{ description: "Line 1", amount: 100 }],
      );
    },
    { message: /Subcontract number is required/ },
  );

  // Test missing vendor
  await assert.rejects(
    async () => {
      await saveSubcontract(
        { subcontractNumber: "SC-001", vendorId: "", projectId: "p-1", title: "Test" },
        [{ description: "Line 1", amount: 100 }],
      );
    },
    { message: /Vendor is required/ },
  );

  // Test missing lines
  await assert.rejects(
    async () => {
      await saveSubcontract(
        { subcontractNumber: "SC-001", vendorId: "v-1", projectId: "p-1", title: "Test" },
        [],
      );
    },
    { message: /At least one scope line item is required/ },
  );

  // Valid draft save
  const created = await saveSubcontract(
    {
      subcontractNumber: "sc-2026-010",
      vendorId: "vendor-apex",
      projectId: "proj-wh",
      title: "HVAC Installation Package",
      currency: "PHP",
    },
    [
      { description: "Primary Chilled Water Loop", amount: 500_000, quantity: 1, unit: "lot", unitRate: 500_000 },
      { description: "Ductwork Fabrication", amount: 350_000, quantity: 1, unit: "lot", unitRate: 350_000 },
    ],
  );

  assert.ok(created.id);
  assert.equal(created.subcontractNumber, "SC-2026-010");
  assert.equal(created.status, "DRAFT");
  assert.equal(created.originalAmount, 850_000);
  assert.equal(created.lines?.length, 2);
});

test("saveSubcontract updates existing draft but rejects modifying non-draft subcontract", async () => {
  clearSubcontractMemoryStore();

  const sc = await saveSubcontract(
    {
      subcontractNumber: "SC-2026-020",
      vendorId: "vendor-1",
      projectId: "proj-1",
      title: "Electrical Package",
    },
    [{ description: "Cable Tray Installation", amount: 200_000 }],
  );

  // Update draft
  const updated = await saveSubcontract(
    {
      id: sc.id,
      subcontractNumber: "SC-2026-020",
      vendorId: "vendor-1",
      projectId: "proj-1",
      title: "Electrical & Instrumentation Package",
    },
    [
      { description: "Cable Tray Installation", amount: 200_000 },
      { description: "Transformer Hookup", amount: 150_000 },
    ],
  );

  assert.equal(updated.id, sc.id);
  assert.equal(updated.title, "Electrical & Instrumentation Package");
  assert.equal(updated.originalAmount, 350_000);
  assert.equal(updated.lines?.length, 2);

  // Transition to APPROVED
  await transitionSubcontract(sc.id, "APPROVED");

  // Attempting to modify approved subcontract should throw
  await assert.rejects(
    async () => {
      await saveSubcontract(
        {
          id: sc.id,
          subcontractNumber: "SC-2026-020",
          vendorId: "vendor-1",
          projectId: "proj-1",
          title: "Illegal Modification",
        },
        [{ description: "Another item", amount: 50_000 }],
      );
    },
    { message: /Only draft subcontracts can be modified/ },
  );
});

test("transitionSubcontract lifecycle flows and guards work deterministically", async () => {
  clearSubcontractMemoryStore();

  const sc = await saveSubcontract(
    {
      subcontractNumber: "SC-2026-030",
      vendorId: "vendor-2",
      projectId: "proj-2",
      title: "Fire Protection Package",
    },
    [{ description: "Sprinkler Pipe Erection", amount: 450_000 }],
  );

  // Transition: DRAFT -> APPROVED
  const approved = await transitionSubcontract(sc.id, "APPROVED");
  assert.equal(approved.status, "APPROVED");
  assert.ok(approved.approvedAt);

  // Transition: APPROVED -> ACTIVE
  const active = await transitionSubcontract(sc.id, "ACTIVE");
  assert.equal(active.status, "ACTIVE");
  assert.ok(active.activatedAt);

  // Transition: ACTIVE -> CLOSED
  const closed = await transitionSubcontract(sc.id, "CLOSED");
  assert.equal(closed.status, "CLOSED");
  assert.ok(closed.closedAt);

  // Transition from CLOSED must throw
  await assert.rejects(
    async () => {
      await transitionSubcontract(sc.id, "ACTIVE");
    },
    { message: /Closed or cancelled subcontracts cannot undergo further transitions/ },
  );

  // Test Cancellation on a second subcontract
  const sc2 = await saveSubcontract(
    {
      subcontractNumber: "SC-2026-031",
      vendorId: "vendor-2",
      projectId: "proj-2",
      title: "Plumbing Package",
    },
    [{ description: "Sanitary lines", amount: 120_000 }],
  );

  // Cancellation requires a non-empty reason
  await assert.rejects(
    async () => {
      await transitionSubcontract(sc2.id, "CANCELLED", "");
    },
    { message: /Cancellation reason is required/ },
  );

  const cancelled = await transitionSubcontract(sc2.id, "CANCELLED", "Subcontractor defaulted on bond requirements");
  assert.equal(cancelled.status, "CANCELLED");
  assert.ok(cancelled.cancelledAt);
  assert.equal(cancelled.cancellationReason, "Subcontractor defaulted on bond requirements");

  // Transition from CANCELLED must throw
  await assert.rejects(
    async () => {
      await transitionSubcontract(sc2.id, "DRAFT");
    },
    { message: /Closed or cancelled subcontracts cannot undergo further transitions/ },
  );
});

test("deleteDraftSubcontract deletes draft but throws on non-draft subcontract", async () => {
  clearSubcontractMemoryStore();

  const sc = await saveSubcontract(
    {
      subcontractNumber: "SC-2026-040",
      vendorId: "vendor-3",
      projectId: "proj-3",
      title: "Temporary Power",
    },
    [{ description: "Generator setup", amount: 80_000 }],
  );

  // Delete draft subcontract
  await deleteDraftSubcontract(sc.id);
  const remaining = readSubcontractsFromLocal();
  assert.equal(remaining.some((s) => s.id === sc.id), false);

  // Create and approve another
  const sc2 = await saveSubcontract(
    {
      subcontractNumber: "SC-2026-041",
      vendorId: "vendor-3",
      projectId: "proj-3",
      title: "Permanent Substation",
    },
    [{ description: "Switchgear installation", amount: 900_000 }],
  );
  await transitionSubcontract(sc2.id, "APPROVED");

  // Attempting to delete approved subcontract must throw
  await assert.rejects(
    async () => {
      await deleteDraftSubcontract(sc2.id);
    },
    { message: /Only draft subcontracts may be deleted/ },
  );
});

test("local subcontract persistence rejects injected status, invalid transitions, and duplicate references", async () => {
  clearSubcontractMemoryStore();

  await assert.rejects(
    () => saveSubcontract(
      { subcontractNumber: "SC-DATE-001", vendorId: "vendor-1", projectId: "project-1", title: "Invalid dates", startDate: "2026-03-10", targetCompletionDate: "2026-03-09" },
      [{ description: "Scope", amount: 100 }],
    ),
    { message: /Target completion date cannot be before the start date/ },
  );

  await assert.rejects(
    () => saveSubcontract(
      { subcontractNumber: "SC-STATUS-001", vendorId: "vendor-1", projectId: "project-1", title: "Injected approval", status: "APPROVED" },
      [{ description: "Scope", amount: 100 }],
    ),
    { message: /saved as DRAFT/ },
  );

  const draft = await saveSubcontract(
    { subcontractNumber: "SC-STATUS-001", vendorId: "vendor-1", projectId: "project-1", title: "Guarded scope" },
    [{ description: "Scope", amount: 100 }],
  );

  await assert.rejects(
    () => saveSubcontract(
      { subcontractNumber: "sc-status-001", vendorId: "vendor-2", projectId: "project-2", title: "Duplicate reference" },
      [{ description: "Scope", amount: 50 }],
    ),
    { message: /already exists in company/ },
  );

  await assert.rejects(
    () => transitionSubcontract(draft.id, "ACTIVE"),
    { message: /Draft subcontracts can only be approved or cancelled/ },
  );

  const emptyDraft = await saveSubcontract(
    { subcontractNumber: "SC-STATUS-002", vendorId: "vendor-1", projectId: "project-1", title: "Zero scope" },
    [{ description: "Zero value scope", amount: 0 }],
  );
  await assert.rejects(
    () => transitionSubcontract(emptyDraft.id, "APPROVED"),
    { message: /original amount must be positive/ },
  );
});

test("local fallback is deployment-company scoped and preserves other company records", async () => {
  clearSubcontractMemoryStore();
  clearCompanyContext();
  setActiveCompanyId("company-a");
  const companyA = await saveSubcontract(
    { subcontractNumber: "SC-COMPANY-A", vendorId: "vendor-a", projectId: "project-a", title: "Company A scope" },
    [{ description: "A scope", amount: 10 }],
  );

  clearCompanyContext();
  setActiveCompanyId("company-b");
  const companyB = await saveSubcontract(
    { subcontractNumber: "SC-COMPANY-B", vendorId: "vendor-b", projectId: "project-b", title: "Company B scope" },
    [{ description: "B scope", amount: 20 }],
  );

  assert.deepEqual((await fetchSubcontracts()).map((item) => item.id), [companyB.id]);
  await assert.rejects(
    () => transitionSubcontract(companyA.id, "APPROVED"),
    { message: /Subcontract not found/ },
  );

  clearCompanyContext();
  assert.deepEqual((await fetchSubcontracts()).map((item) => item.id), [companyB.id, companyA.id]);
  clearSubcontractMemoryStore();
});

test("shared local transition helper enforces approval and cancellation guards", () => {
  const base: Subcontract = {
    id: "sc-helper",
    subcontractNumber: "SC-HELPER",
    vendorId: "vendor-1",
    projectId: "project-1",
    title: "Helper scope",
    currency: "PHP",
    status: "DRAFT",
    originalAmount: 100,
    lines: [{ id: "line-1", subcontractId: "sc-helper", lineNumber: 1, description: "Scope", amount: 100 }],
  };
  assert.equal(applySubcontractTransition(base, "APPROVED", undefined, "2026-01-01T00:00:00Z").status, "APPROVED");
  assert.throws(() => applySubcontractTransition(base, "CANCELLED"), /Cancellation reason is required/);
});
