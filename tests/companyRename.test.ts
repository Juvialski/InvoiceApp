import test from "node:test";
import assert from "node:assert/strict";
import { updateCompany } from "../src/lib/companyAccess.ts";

test("company rename sends the stable company ID and named update fields", async () => {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const client = {
    rpc: async (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args });
      return {
        data: {
          id: "company-a",
          name: "HYDROQUALISENSE SOLUTIONS CORP",
          company_code: "legacy-company",
          status: "ACTIVE",
          default_currency: "PHP",
          timezone: "Asia/Manila",
        },
        error: null,
      };
    },
  } as any;
  const renamed = await updateCompany("company-a", { name: " HYDROQUALISENSE SOLUTIONS CORP " }, client);
  assert.equal(renamed.id, "company-a");
  assert.equal(renamed.name, "HYDROQUALISENSE SOLUTIONS CORP");
  assert.equal(calls[0]?.name, "platform_update_company");
  assert.deepEqual(calls[0]?.args, {
    p_company_id: "company-a",
    p_name: "HYDROQUALISENSE SOLUTIONS CORP",
    p_company_code: undefined,
    p_status: undefined,
    p_default_currency: undefined,
    p_timezone: undefined,
  });
});
