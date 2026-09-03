import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const migrationFilePath = path.resolve(
  process.cwd(),
  "supabase/migrations/20260903160000_subcontract_variations.sql",
);

test("P2B-3 subcontract variations migration file exists and is formatted correctly", () => {
  assert.ok(fs.existsSync(migrationFilePath), "Migration file must exist");
  const content = fs.readFileSync(migrationFilePath, "utf8");
  assert.ok(content.length > 500, "Migration file must contain substantial DDL and RPC content");
});

test("subcontract variations migration creates required tables with composite tenant foreign keys", () => {
  const content = fs.readFileSync(migrationFilePath, "utf8");

  // Table creation
  assert.match(content, /CREATE TABLE IF NOT EXISTS public\.subcontract_variations/i);
  assert.match(content, /CREATE TABLE IF NOT EXISTS public\.subcontract_variation_lines/i);

  // Tenant isolation: composite FKs to company, project, and subcontract
  assert.match(
    content,
    /FOREIGN KEY \(company_id, subcontract_id\)\s+REFERENCES public\.subcontracts\(company_id, id\)/i,
  );
  assert.match(
    content,
    /FOREIGN KEY \(company_id, project_id\)\s+REFERENCES public\.projects\(company_id, id\)/i,
  );
  assert.match(
    content,
    /FOREIGN KEY \(company_id, variation_id\)\s+REFERENCES public\.subcontract_variations\(company_id, id\)/i,
  );

  // Line not zero check
  assert.match(content, /amount numeric\(18,2\) not null check \(amount <> 0\)/i);

  // Single scope constraint on claim lines
  assert.match(content, /subcontract_claim_lines_source_check/i);
  assert.match(
    content,
    /\(subcontract_line_id IS NOT NULL AND subcontract_variation_line_id IS NULL\)\s+OR\s+\(subcontract_line_id IS NULL AND subcontract_variation_line_id IS NOT NULL\)/i,
  );
});

test("subcontract variations migration enables RLS and registers in company_tenant_policy_catalog", () => {
  const content = fs.readFileSync(migrationFilePath, "utf8");

  // RLS enablement
  assert.match(content, /ALTER TABLE public\.subcontract_variations ENABLE ROW LEVEL SECURITY;/i);
  assert.match(content, /ALTER TABLE public\.subcontract_variation_lines ENABLE ROW LEVEL SECURITY;/i);

  // Tenant catalog registration
  assert.match(
    content,
    /INSERT INTO private\.company_tenant_policy_catalog[\s\S]*?'subcontract_variations'[\s\S]*?'procurement\.read'[\s\S]*?'procurement\.manage'/i,
  );
  assert.match(
    content,
    /INSERT INTO private\.company_tenant_policy_catalog[\s\S]*?'subcontract_variation_lines'[\s\S]*?'procurement\.read'[\s\S]*?'procurement\.manage'/i,
  );
});

test("guarded variation RPCs are SECURITY DEFINER with SET search_path = '' and explicit grants", () => {
  const content = fs.readFileSync(migrationFilePath, "utf8");

  const expectedRpcs = [
    "create_or_update_subcontract_variation",
    "transition_subcontract_variation",
    "delete_draft_subcontract_variation",
    "create_or_update_subcontract_claim",
    "transition_subcontract_claim",
  ];

  for (const rpcName of expectedRpcs) {
    const rpcRegex = new RegExp(
      `CREATE OR REPLACE FUNCTION public\\.${rpcName}[\\s\\S]*?SECURITY DEFINER[\\s\\S]*?SET search_path = ''`,
      "i",
    );
    assert.match(content, rpcRegex, `RPC ${rpcName} must be SECURITY DEFINER with SET search_path = ''`);

    // Must require authentication
    const authRegex = new RegExp(
      `CREATE OR REPLACE FUNCTION public\\.${rpcName}[\\s\\S]*?if v_user_id is null then[\\s\\S]*?Authentication is required`,
      "i",
    );
    assert.match(content, authRegex, `RPC ${rpcName} must verify authentication`);
  }
});

test("transition_subcontract_variation enforces negative variation over-claim protection and concurrency locks", () => {
  const content = fs.readFileSync(migrationFilePath, "utf8");

  // SELECT FOR UPDATE on parent subcontract
  assert.match(
    content,
    /select \* into v_subcontract\s+from public\.subcontracts\s+where id = v_var\.subcontract_id and company_id = v_company_id\s+for update/i,
  );

  // Over-claim check exception
  assert.match(
    content,
    /Cannot approve negative variation: revised subcontract value .* would be less than certified claims gross/i,
  );

  // Line-level over-claim check
  assert.match(
    content,
    /Cannot approve negative variation: revised scope for subcontract line .* would be less than certified amount/i,
  );
});

test("project lifecycle preflight includes subcontract variations count", () => {
  const content = fs.readFileSync(migrationFilePath, "utf8");

  assert.match(
    content,
    /CREATE OR REPLACE FUNCTION private\.project_lifecycle_preflight/i,
  );
  assert.match(
    content,
    /select count\(\*\) into v_subcontract_variations\s+from public\.subcontract_variations/i,
  );
  assert.match(
    content,
    /'subcontractVariations',\s*v_subcontract_variations/i,
  );
});
