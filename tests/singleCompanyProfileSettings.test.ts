import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { updateDeploymentCompanyProfile } from "../src/lib/companyProfile.ts";

test("single-company profile save uses the membership-authorized update_company RPC", async () => {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const client = {
    rpc: async (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args });
      return {
        data: {
          id: "company-a",
          name: "HYDROQUALISENSE SOLUTIONS CORP",
          company_code: "legacy-company",
          default_currency: "PHP",
          timezone: "Asia/Manila",
          updated_at: "2026-08-29T09:30:00Z",
        },
        error: null,
      };
    },
  };

  const result = await updateDeploymentCompanyProfile("company-a", {
    name: " HYDROQUALISENSE SOLUTIONS CORP ",
    defaultCurrency: "php",
    timezone: " Asia/Manila ",
  }, client);

  assert.equal(result.id, "company-a");
  assert.equal(result.name, "HYDROQUALISENSE SOLUTIONS CORP");
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.name, "update_company");
  assert.deepEqual(calls[0]?.args, {
    p_company_id: "company-a",
    p_name: "HYDROQUALISENSE SOLUTIONS CORP",
    p_default_currency: "PHP",
    p_timezone: "Asia/Manila",
  });
  assert.equal("p_company_code" in (calls[0]?.args || {}), false);
  assert.equal("p_status" in (calls[0]?.args || {}), false);
});

test("single-company profile client rejects a response for another company", async () => {
  const client = {
    rpc: async () => ({
      data: { id: "company-b", name: "Other Company", default_currency: "PHP", timezone: "Asia/Manila" },
      error: null,
    }),
  };

  await assert.rejects(
    () => updateDeploymentCompanyProfile("company-a", {
      name: "Company A",
      defaultCurrency: "PHP",
      timezone: "Asia/Manila",
    }, client),
    /different deployment company/i,
  );
});

test("single-company settings and deployment badge do not expose the legacy company code", () => {
  const settings = readFileSync(new URL("../src/components/access/CompanyProfileSettings.tsx", import.meta.url), "utf8");
  const accessStates = readFileSync(new URL("../src/components/access/AccessStates.tsx", import.meta.url), "utf8");
  const migration = readFileSync(new URL("../supabase/migrations/20260829003147_core_hardening_wave1_access_management.sql", import.meta.url), "utf8");

  assert.doesNotMatch(settings, /Company code|companyCode/);
  assert.doesNotMatch(accessStates, /company\.companyCode/);
  assert.match(migration, /create or replace function public\.update_company/);
  assert.match(migration, /private\.has_company_permission\(p_company_id, 'company\.settings\.manage'\)/);
});
