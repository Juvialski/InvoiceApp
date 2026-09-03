import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migration = fs.readFileSync(
  path.resolve(__dirname, "../supabase/migrations/20260903152000_subcontract_claim_project_lifecycle_preflight_fix.sql"),
  "utf8",
);

test("P2B-2 project preflight preserves canonical company-scoped payroll relationships", () => {
  assert.match(
    migration,
    /from public\.payroll_project_allocations a\s+where a\.company_id = p_company_id and a\.project_id = p_project_id/i,
  );
  assert.doesNotMatch(migration, /ppa\.payroll_run_id/i);
});

test("P2B-2 project preflight adds progress claim history without dropping prior dependencies", () => {
  assert.match(
    migration,
    /from public\.subcontract_progress_claims c\s+where c\.company_id = p_company_id and c\.project_id = p_project_id/i,
  );
  assert.match(migration, /\+ v_subcontract_claims;/i);
  assert.match(migration, /'subcontractProgressClaims', v_subcontract_claims/i);
  assert.match(migration, /'subcontracts', v_subcontracts/i);
  assert.match(migration, /'purchaseOrders', v_purchase_orders/i);
});
