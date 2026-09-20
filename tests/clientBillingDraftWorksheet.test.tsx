import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ClientBillingDraftWorksheet } from "../src/components/projects/ClientBillingDraftWorksheet.tsx";
import { buildLocalClientBilling, type ClientBilling, type ClientBillingInput } from "../src/lib/clientBilling.ts";
import type { Project } from "../src/types.ts";

const panelSource = readFileSync(new URL("../src/components/projects/ClientBillingPanel.tsx", import.meta.url), "utf8");
const worksheetPath = new URL("../src/components/projects/ClientBillingDraftWorksheet.tsx", import.meta.url);
const migrationDirectory = new URL("../supabase/migrations/", import.meta.url);

const project: Project = {
  id: "project-billing-worksheet",
  projectCode: "BILL-WS-001",
  projectName: "Worksheet Billing Project",
  status: "ACTIVE",
  taxTreatment: "VAT",
  clientName: "Worksheet Client",
  clientReference: "CLIENT-WS-001",
  billingContactName: "Billing Contact",
  billingEmail: "billing@example.test",
  billingAddress: "1 Billing Street",
  currency: "PHP",
  contractValue: 100_000,
  projectBudget: 80_000,
  createdAt: "2026-09-20T00:00:00.000Z",
  updatedAt: "2026-09-20T00:00:00.000Z",
};

const existingBilling = {
  id: "billing-worksheet-1",
  companyId: "company-worksheet",
  projectId: project.id,
  billingNumber: "PB-WS-001",
  billingDate: "2026-09-20",
  currency: "PHP",
  taxTreatment: "VAT" as const,
  status: "DRAFT" as const,
  lines: [{ id: "line-1", billingId: "billing-worksheet-1", lineNumber: 1, description: "Draft work", amount: 1000 }],
  createdAt: "2026-09-20T00:00:00.000Z",
  updatedAt: "2026-09-20T01:00:00.000Z",
};

test("Client Billing draft editing is extracted to one aggregate worksheet surface", () => {
  assert.match(panelSource, /ClientBillingDraftWorksheet/);
  assert.ok(existsSync(worksheetPath), "the Client Billing draft worksheet component should exist");
  const worksheetSource = readFileSync(worksheetPath, "utf8");

  for (const label of [
    "Billing Details",
    "Invoice Number",
    "Invoice Date",
    "Due Date",
    "Payment Terms",
    "Period Start",
    "Period End",
    "Client Name Snapshot",
    "Client Reference Snapshot",
    "Billing Contact",
    "Billing Email",
    "Billing Address",
    "Notes",
    "Billing Lines",
    "Description",
    "Amount",
    "Line Notes",
    "Project",
    "Currency",
    "Tax Treatment",
    "Status",
    "Calculated Total",
    "Amount Collected",
    "Amount Remaining",
    "Save draft",
  ]) {
    assert.match(worksheetSource, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), label);
  }

  assert.equal((worksheetSource.match(/<WorksheetEditor/g) || []).length, 2);
  assert.match(worksheetSource, /data-testid="client-billing-draft-worksheet"/);
  assert.match(worksheetSource, /onAddRow/);
  assert.match(worksheetSource, /canAddRow/);
  assert.match(worksheetSource, /canRemoveRow/);
  assert.match(worksheetSource, /data-worksheet-scroll-container/);
  assert.match(worksheetSource, /Submit|Issue Client Invoice|Void issued billing|Record Collection/);
  assert.match(worksheetSource, /clientBillingLinesForPersistence/);

  const html = renderToStaticMarkup(
    <ClientBillingDraftWorksheet
      project={project}
      billing={existingBilling as ClientBilling}
      onSave={() => undefined}
      onCancel={() => undefined}
    />,
  );
  assert.equal((html.match(/data-worksheet-editor="true"/g) || []).length, 2);
  assert.match(html, /data-worksheet-add-row="true"/);
  assert.match(html, /data-worksheet-remove-row="line-1"[^>]*disabled=""/);
  assert.match(html, /data-worksheet-protected="true"/);
  assert.match(html, /Save draft/);
  assert.doesNotMatch(html, /data-testid="record-client-collection"/);
  assert.doesNotMatch(html, /Issue Client Invoice/);
});

test("Client Billing persistence strips UI-only worksheet line identities", async () => {
  const clientBillingModule = await import("../src/lib/clientBilling.ts");
  const persist = (clientBillingModule as typeof clientBillingModule & {
    clientBillingLinesForPersistence?: (rows: readonly Record<string, unknown>[]) => readonly Record<string, unknown>[];
  }).clientBillingLinesForPersistence;
  assert.equal(typeof persist, "function");
  const lines = persist?.([
    { worksheetId: "draft-line-1", description: "Work", amount: 1250, notes: "Note" },
  ]);
  assert.deepEqual(lines, [{ description: "Work", amount: 1250, notes: "Note" }]);
});

test("local Client Billing edits reject a stale expected version", () => {
  const staleInput = {
    projectId: project.id,
    billingNumber: existingBilling.billingNumber,
    billingDate: existingBilling.billingDate,
    currency: project.currency,
    expectedUpdatedAt: "2026-09-20T00:30:00.000Z",
  } as ClientBillingInput;

  assert.throws(
    () => buildLocalClientBilling(staleInput, [{ description: "Changed work", amount: 1500 }], existingBilling),
    /changed in another session|refresh/i,
  );
});

test("Client Billing draft concurrency migration defines the guarded aggregate RPC", () => {
  const migrationName = readdirSync(migrationDirectory)
    .find((name) => name.endsWith("_client_billing_draft_concurrency_and_metadata.sql"));
  assert.ok(migrationName, "the forward Client Billing concurrency migration should exist");
  const migration = readFileSync(new URL(migrationName, migrationDirectory), "utf8");
  assert.match(migration, /drop function if exists public\.create_or_update_client_billing\(jsonb, jsonb\)/i);
  assert.match(migration, /create or replace function public\.create_or_update_client_billing\(\s*p_billing jsonb,\s*p_lines jsonb default '\[\]'::jsonb,\s*p_expected_updated_at timestamptz default null/s);
  assert.match(migration, /for update/);
  assert.match(migration, /p_expected_updated_at/);
  assert.match(migration, /EXPECTED_VERSION_MISMATCH/);
  assert.match(migration, /errcode = '40001'/);
  for (const field of ["due_date", "payment_terms", "billing_contact_name", "billing_email", "billing_address"]) {
    assert.match(migration, new RegExp(field));
  }
  assert.match(migration, /grant execute on function public\.create_or_update_client_billing\(jsonb, jsonb, timestamptz\) to authenticated/);
});
