import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { InvoiceData, Vendor } from "../src/types.ts";
import { Vendors } from "../src/components/Vendors.tsx";
import {
  buildVendorSavePlan,
  vendorWorksheetRow,
  VendorMasterWorksheetModal,
} from "../src/components/VendorMasterWorksheet.tsx";
import { retainWorksheetDraftRowsAfterSave, saveWorksheetRowsSequentially } from "../src/components/ui/worksheetDraftState.ts";

const vendor: Vendor = {
  id: "vendor-1",
  companyId: "company-1",
  name: "Acme Supplies Inc.",
  normalizedName: "acme supplies",
  email: "billing@acme.test",
  phone: "+63 2 555 0100",
  taxId: "123-456-789-000",
  address: "1 Main Street, Manila",
  defaultCurrency: "PHP",
  defaultCategory: "Materials",
  active: true,
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-20T00:00:00.000Z",
};

const linkedInvoice = {
  id: "invoice-1",
  vendor: { name: "Extracted Acme Supplies" },
  grandTotal: 100,
  currency: "PHP",
} as InvoiceData;

test("Vendor directory stays browse-first and opens deliberate maintenance", () => {
  const html = renderToStaticMarkup(
    <Vendors
      invoices={[linkedInvoice]}
      vendors={[vendor]}
      canManage
      onSaveVendor={async () => vendor}
      onDeactivateVendor={async () => undefined}
      onReactivateVendor={async () => undefined}
    />,
  );

  assert.match(html, /Canonical Vendor directory table/);
  assert.match(html, /Manage Vendors/);
  assert.match(html, /Edit Acme Supplies Inc\./);
  assert.doesNotMatch(html, /data-worksheet-editor="true"/);
  assert.doesNotMatch(html, /Extracted Acme Supplies/);
});

test("Vendor save plans normalize safe fields and preserve canonical identity metadata", () => {
  const row = vendorWorksheetRow(vendor);
  row.name = "  Acme Supplies Corporation  ";
  row.email = "  AP@ACME.TEST  ";
  row.phone = "  +63 917 000 0000  ";
  row.taxId = "  123-456-789-000  ";
  row.address = "  2 New Street  ";
  row.defaultCurrency = " usd ";
  row.defaultCategory = "  Equipment  ";

  const plan = buildVendorSavePlan([row], new Set([row.id]));

  assert.equal(plan.valid, true);
  assert.deepEqual(plan.entries[0]?.input, {
    id: vendor.id,
    name: "Acme Supplies Corporation",
    email: "ap@acme.test",
    phone: "+63 917 000 0000",
    taxId: "123-456-789-000",
    address: "2 New Street",
    defaultCurrency: "USD",
    defaultCategory: "Equipment",
    expectedUpdatedAt: vendor.updatedAt,
  });
  assert.equal("companyId" in (plan.entries[0]?.input || {}), false);
  assert.equal("normalizedName" in (plan.entries[0]?.input || {}), false);
  assert.equal("active" in (plan.entries[0]?.input || {}), false);
  assert.equal("archivedAt" in (plan.entries[0]?.input || {}), false);
});

test("Vendor save plans validate required identity, email, currency, and exact duplicate conflicts", () => {
  const invalid = vendorWorksheetRow({ ...vendor, id: "draft-vendor-1", name: "", email: "not-an-email", defaultCurrency: "US" }, { isNew: true });
  const invalidPlan = buildVendorSavePlan([invalid], new Set([invalid.id]));

  assert.equal(invalidPlan.valid, false);
  assert.deepEqual(invalidPlan.issues[invalid.id], [
    { columnKey: "name", message: "Vendor name is required." },
    { columnKey: "email", message: "Enter a valid Vendor email or leave it blank." },
    { columnKey: "defaultCurrency", message: "Default currency must be a three-letter ISO code." },
  ]);

  const duplicate = vendorWorksheetRow({ ...vendor, id: "draft-vendor-2", name: "Acme Supplies Corporation", taxId: null }, { isNew: true });
  const duplicatePlan = buildVendorSavePlan([vendorWorksheetRow(vendor), duplicate], new Set([duplicate.id]));
  assert.equal(duplicatePlan.valid, false);
  assert.match(duplicatePlan.issues[duplicate.id]?.[0]?.message || "", /canonical Vendor/i);
});

test("Vendor worksheet exposes safe cells, protects lifecycle state, and never includes invoice evidence fields", () => {
  const html = renderToStaticMarkup(
    <VendorMasterWorksheetModal
      vendors={[vendor]}
      canManage
      initialVendorId={vendor.id}
      onClose={() => undefined}
      onSave={async () => vendor}
    />,
  );

  assert.match(html, /data-testid="vendor-master-worksheet"/);
  assert.match(html, /data-worksheet-cell="vendor-1:name"[^>]*data-worksheet-editable="true"/);
  assert.match(html, /data-worksheet-cell="vendor-1:email"[^>]*data-worksheet-editable="true"/);
  assert.match(html, /data-worksheet-cell="vendor-1:defaultCurrency"[^>]*data-worksheet-editable="true"/);
  assert.match(html, /data-worksheet-cell="vendor-1:active"[^>]*data-worksheet-protected="true"/);
  assert.doesNotMatch(html, /data-worksheet-cell="vendor-1:(invoice|expense|purchase)/i);
  assert.doesNotMatch(html, /data-worksheet-cell="vendor-1:(companyId|normalizedName|archivedAt|updatedAt)"[^>]*data-worksheet-editable="true"/);
});

test("Vendor worksheet keeps permission and draft identity boundaries explicit", () => {
  const readOnlyHtml = renderToStaticMarkup(
    <VendorMasterWorksheetModal
      vendors={[vendor]}
      canManage={false}
      onClose={() => undefined}
      onSave={async () => vendor}
    />,
  );

  assert.match(readOnlyHtml, /data-worksheet-cell="vendor-1:name"[^>]*data-worksheet-readonly="true"/);
  assert.match(readOnlyHtml, /data-worksheet-add-row="true"[^>]*disabled=""/);
  assert.doesNotMatch(readOnlyHtml, /data-worksheet-action="save"/);

  const draft = vendorWorksheetRow({ ...vendor, id: "draft-vendor-3", name: "New Vendor", updatedAt: undefined }, { isNew: true });
  const plan = buildVendorSavePlan([draft], new Set([draft.id]));
  assert.equal(plan.entries[0]?.input.id, undefined);
  assert.equal("expectedUpdatedAt" in (plan.entries[0]?.input || {}), false);
});

test("Vendor worksheet uses sequential authoritative saves and retains failed rows", async () => {
  const calls: string[] = [];
  const result = await saveWorksheetRowsSequentially(
    [
      { rowKey: "vendor-1", input: "first" },
      { rowKey: "vendor-2", input: "second" },
      { rowKey: "vendor-3", input: "third" },
    ],
    async ({ rowKey, input }) => {
      calls.push(`${rowKey}:${input}`);
      if (rowKey === "vendor-2") throw new Error("stale Vendor row");
    },
  );

  assert.deepEqual(calls, ["vendor-1:first", "vendor-2:second", "vendor-3:third"]);
  assert.deepEqual(result.savedRowKeys, ["vendor-1", "vendor-3"]);
  assert.deepEqual(result.failures, [{ rowKey: "vendor-2", message: "stale Vendor row" }]);
  assert.deepEqual(
    retainWorksheetDraftRowsAfterSave(
      [{ id: "vendor-1" }, { id: "draft-saved", isNew: true }, { id: "draft-failed", isNew: true }],
      new Set(["draft-failed"]),
    ),
    [{ id: "vendor-1" }, { id: "draft-failed", isNew: true }],
  );
});

test("Vendor worksheet delegates persistence to its parent callback instead of opening a parallel Vendor writer", () => {
  const source = readFileSync(new URL("../src/components/VendorMasterWorksheet.tsx", import.meta.url), "utf8");
  assert.match(source, /saveWorksheetRowsSequentially/);
  assert.match(source, /onSave\(entry\.input\)/);
  assert.doesNotMatch(source, /\.from\(["']vendors["']\)/);
});

test("Vendor persistence migration adds an atomic expected-version guard without changing the canonical RPC", () => {
  const migrationName = readdirSync(new URL("../supabase/migrations/", import.meta.url))
    .find((name) => name.endsWith("_vendor_worksheet_concurrency.sql"));
  assert.ok(migrationName, "the Vendor worksheet concurrency migration should exist");
  const migration = readFileSync(new URL(`../supabase/migrations/${migrationName}`, import.meta.url), "utf8");
  assert.match(migration, /create or replace function public\.create_or_update_vendor\(p_vendor jsonb\)/i);
  assert.match(migration, /expectedUpdatedAt|expected_updated_at/i);
  assert.match(migration, /EXPECTED_VERSION_MISMATCH/i);
  assert.match(migration, /using errcode = '40001'/i);
  assert.match(migration, /grant execute on function public\.create_or_update_vendor\(jsonb\) to authenticated/i);
});
