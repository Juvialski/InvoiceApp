import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  DEFAULT_COMPANY_DOCUMENT_PROFILE,
  companyDocumentProfileFromRow,
  mergeCompanyDocumentProfile,
  supplierInvoiceBuyerMismatch,
} from "../src/lib/companyDocumentProfile.ts";
import type { InvoiceData } from "../src/types.ts";

const migration = readFileSync(new URL("../supabase/migrations/20260908111102_qa_hardening_identity_ai_bootstrap.sql", import.meta.url), "utf8");

function invoice(customer: InvoiceData["customer"]): Pick<InvoiceData, "customer"> {
  return { customer };
}

test("fresh document profile defaults are intentionally incomplete and never product legal identity", () => {
  assert.equal(DEFAULT_COMPANY_DOCUMENT_PROFILE.legalName, "");
  assert.equal(DEFAULT_COMPANY_DOCUMENT_PROFILE.address, undefined);
  assert.equal(DEFAULT_COMPANY_DOCUMENT_PROFILE.vatTin, undefined);
  assert.doesNotMatch(JSON.stringify(DEFAULT_COMPANY_DOCUMENT_PROFILE), /HydroQualiSense Solutions|Pasong|777-823|hydroqualisensesolutions/i);
  assert.equal(companyDocumentProfileFromRow({}).legalName, "");
  assert.equal(mergeCompanyDocumentProfile(undefined).legalName, "");
});

test("buyer validation blocks unresolved source/profile identity but preserves explicit configured matching", () => {
  assert.match(
    supplierInvoiceBuyerMismatch(invoice({ name: "Unrelated Buyer" }), DEFAULT_COMPANY_DOCUMENT_PROFILE) || "",
    /profile is incomplete/i,
  );
  assert.match(
    supplierInvoiceBuyerMismatch(invoice({ name: "", taxId: "123-456-789" }), { legalName: "Known Client" }) || "",
    /profile is incomplete/i,
  );
  const profile = { legalName: "Known Client", vatTin: "123-456-789" };
  assert.equal(supplierInvoiceBuyerMismatch(invoice({ name: "Known Client", registeredName: "Known Client", taxId: "123456789" }), profile), undefined);
  assert.match(supplierInvoiceBuyerMismatch(invoice({ name: "Other Client", registeredName: "Other Client" }), profile) || "", /another company/i);
});

test("forward identity migration changes only future seed behavior and exposes server-only AI bootstrap", () => {
  assert.match(migration, /values \(\s*new\.id, btrim\(new\.name\), null, null, null, null, null\s*\)/s);
  assert.match(migration, /on conflict \(company_id\) do nothing/i);
  assert.doesNotMatch(migration, /HydroQualiSense Solutions Corp\.|Pasong Tulo|777-823-517-000|hydroqualisensesolutions@gmail\.com/i);
  assert.match(migration, /bootstrap_deployment_company_ai_credential/);
  assert.match(migration, /grant execute on function public\.bootstrap_deployment_company_ai_credential[\s\S]*to service_role/i);
  assert.match(migration, /revoke all on function public\.bootstrap_deployment_company_ai_credential[\s\S]*from public, anon, authenticated/i);
  assert.match(migration, /initial_admin_user_id/);
});
