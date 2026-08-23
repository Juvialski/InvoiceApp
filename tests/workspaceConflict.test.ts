import test from "node:test";
import assert from "node:assert/strict";
import {
  canApplyWorkspaceLoad,
  shouldPersistGuestWorkspace,
  decideRemoteInvoiceRefresh,
  resolveEntityById,
  type InvoiceSaveState,
} from "../src/utils/remoteConflict.ts";

test("selected invoice drafts are protected from remote replacement", () => {
  const states: InvoiceSaveState[] = ["unsaved", "saving", "error"];

  for (const saveState of states) {
    const decision = decideRemoteInvoiceRefresh({
      invoiceId: "invoice-1",
      selectedInvoiceId: "invoice-1",
      saveState,
      remoteExists: true,
    });

    assert.equal(decision.action, "defer");
    assert.equal(decision.shouldMarkRemotePending, true);
    assert.equal(decision.remoteExists, true);
  }
});

test("a clean selected invoice can accept a remote refresh or removal", () => {
  assert.deepEqual(decideRemoteInvoiceRefresh({
    invoiceId: "invoice-1",
    selectedInvoiceId: "invoice-1",
    saveState: "saved",
    remoteExists: true,
  }), {
    action: "apply",
    reason: "selected-clean",
    shouldMarkRemotePending: false,
    remoteExists: true,
  });

  assert.deepEqual(decideRemoteInvoiceRefresh({
    invoiceId: "invoice-1",
    selectedInvoiceId: "invoice-1",
    saveState: "saved",
    remoteExists: false,
  }), {
    action: "apply",
    reason: "selected-removed",
    shouldMarkRemotePending: false,
    remoteExists: false,
  });
});

test("a refresh for another invoice is safe even while the selected invoice saves", () => {
  const decision = decideRemoteInvoiceRefresh({
    invoiceId: "invoice-2",
    selectedInvoiceId: "invoice-1",
    saveState: "saving",
    remoteExists: true,
  });

  assert.equal(decision.action, "apply");
  assert.equal(decision.reason, "not-selected");
  assert.equal(decision.shouldMarkRemotePending, false);
});

test("authenticated loader results cannot cross a session or request generation", () => {
  const firstRequest = { generation: 1, userId: "user-a" };

  assert.equal(canApplyWorkspaceLoad(firstRequest, { generation: 1, userId: "user-a" }), true);
  assert.equal(canApplyWorkspaceLoad(firstRequest, { generation: 2, userId: "user-a" }), false);
  assert.equal(canApplyWorkspaceLoad(firstRequest, { generation: 2, userId: "user-b" }), false);
  assert.equal(canApplyWorkspaceLoad(firstRequest, undefined), false);
});

test("guest operational storage is isolated until auth resolves to guest mode", () => {
  assert.equal(shouldPersistGuestWorkspace(false, null), false);
  assert.equal(shouldPersistGuestWorkspace(true, "user-a"), false);
  assert.equal(shouldPersistGuestWorkspace(true, null), true);
  assert.equal(shouldPersistGuestWorkspace(true, undefined), true);
});

test("refreshed route records replace by stable ID and missing records resolve to null", () => {
  const oldProject = { id: "project-1", projectName: "Old name" };
  const refreshedProject = { id: "project-1", projectName: "Remote name" };
  const otherProject = { id: "project-2", projectName: "Other" };

  assert.deepEqual(resolveEntityById([otherProject, refreshedProject], "project-1"), refreshedProject);
  assert.equal(resolveEntityById([refreshedProject], "project-missing"), null);
  assert.equal(resolveEntityById([oldProject], null), null);
});
