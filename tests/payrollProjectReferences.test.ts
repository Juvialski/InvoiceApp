import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parsePayrollProjectReferences } from "../src/lib/projects.ts";

test("payroll project references retain only identity and lifecycle fields", () => {
  const [reference] = parsePayrollProjectReferences([{
    id: "project-1",
    project_code: "QA-001",
    project_name: "Synthetic project",
    status: "ACTIVE",
    archived_at: null,
    project_budget: 999999,
    client_name: "Should not cross the reference boundary",
  }]);

  assert.deepEqual(reference, {
    id: "project-1",
    projectCode: "QA-001",
    projectName: "Synthetic project",
    status: "ACTIVE",
  });
  assert.equal("projectBudget" in reference, false);
  assert.equal("clientName" in reference, false);
});

test("the payroll reference loader uses the column-limited RPC instead of full project rows", () => {
  const source = readFileSync(new URL("../src/lib/projects.ts", import.meta.url), "utf8");
  const loaderStart = source.indexOf("export async function loadPayrollProjectReferencesFromSupabase");
  const loaderEnd = source.indexOf("const UUID_PATTERN", loaderStart);
  const loader = source.slice(loaderStart, loaderEnd);
  assert.match(loader, /supabase\.rpc\(PAYROLL_PROJECT_REFERENCES_RPC/);
  assert.doesNotMatch(loader, /from\(["']projects["']\)/);
});
