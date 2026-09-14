import assert from "node:assert/strict";
import express from "express";
import http from "node:http";
import { readFileSync } from "node:fs";
import test from "node:test";
import { validateDocumentTemplateTypeDefinition } from "../src/lib/documentTemplateTypes.ts";
import { validateManagedDocumentInputs } from "../src/server/documentTemplates/documentTemplateContext.ts";
import { createDocumentTemplateRouter } from "../src/server/documentTemplates/documentTemplateRouter.ts";
import type { StorageAuthContext } from "../src/server/storage/storageRouter.ts";

const routerSource = readFileSync(new URL("../src/server/documentTemplates/documentTemplateRouter.ts", import.meta.url), "utf8");

function definition() {
  const result = validateDocumentTemplateTypeDefinition({
    key: "inspection-report",
    displayName: "Inspection Report",
    sourceContext: "PROJECT",
    customFields: [
      { key: "custom.issue_date", label: "Issue date", type: "DATE", required: true },
      { key: "custom.remarks", label: "Remarks", type: "TEXT", required: false },
    ],
    repeatSections: [{
      key: "items",
      label: "Items",
      source: "INPUT",
      fields: [{ key: "item", label: "Item", type: "TEXT", required: true, source: "INPUT" }],
    }],
    status: "ACTIVE",
  });
  if (result.ok === false) throw new Error(result.errors.join(" "));
  return result.definition;
}

test("router exposes dynamic type administration and available/generate operations", () => {
  assert.match(routerSource, /router\.get\("\/types"/);
  assert.match(routerSource, /router\.post\("\/types"/);
  assert.match(routerSource, /router\.put\("\/types\/:typeKey"/);
  assert.match(routerSource, /router\.post\("\/types\/:typeKey\/retire"/);
  assert.match(routerSource, /router\.get\("\/available"/);
  assert.match(routerSource, /router\.post\("\/managed-generate"/);
  assert.doesNotMatch(routerSource, /PROJECT_EQUIPMENT_MATERIALS_CHECKLIST/);
  assert.doesNotMatch(routerSource, /PROJECT_WARRANTY_CERTIFICATE/);
});

test("managed input validation accepts declared values and rejects guessed sensitive fields", () => {
  const result = validateManagedDocumentInputs(definition(), {
    fields: { "custom.issue_date": "2026-09-14", "custom.remarks": "Ready" },
    repeats: { items: [{ item: "Concrete" }] },
  });
  assert.equal(result.ok, true);
  const rejected = validateManagedDocumentInputs(definition(), {
    fields: { "custom.issue_date": "2026-09-14", "payroll.salary": 999999 },
    repeats: { items: [{ item: "Concrete" }] },
  });
  assert.equal(rejected.ok, false);
});

test("dynamic type lifecycle persists through the same router APIs without an enum entry", async () => {
  const companyId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const userId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  const rows: Record<string, any>[] = [];
  const queryFor = (table: string) => {
    let filtered = table === "document_template_type_definitions" ? rows : [];
    const query: any = {
      select: () => query,
      eq: (key: string, value: unknown) => { filtered = filtered.filter((row) => row[key] === value); return query; },
      order: () => query,
      maybeSingle: async () => ({ data: filtered[0] || null, error: null }),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve(resolve({ data: filtered, error: null })),
    };
    return query;
  };
  const authSupabase: any = { from: queryFor };
  const serverSupabase: any = {
    rpc: async (name: string, args: Record<string, any>) => {
      if (name === "server_create_document_template_type") {
        const payload = args.p_payload;
        const row = { id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", company_id: companyId, type_key: payload.typeKey, display_name: payload.displayName, description: payload.description, category: payload.category, source_context: payload.sourceContext, custom_fields: payload.customFields, repeat_sections: payload.repeatSections, status: "ACTIVE", schema_version: "1" };
        rows.push(row);
        return { data: row, error: null };
      }
      if (name === "server_retire_document_template_type") {
        const row = rows.find((candidate) => candidate.type_key === args.p_type_key);
        if (row) row.status = "RETIRED";
        return { data: row || null, error: row ? null : { code: "40400", message: "missing" } };
      }
      return { data: null, error: null };
    },
  };
  const authorizer = async (): Promise<StorageAuthContext> => ({ accessToken: "synthetic-token", companyId, user: { id: userId } as any, supabase: authSupabase });
  const app = express();
  app.use(express.json());
  app.use("/api/document-templates", createDocumentTemplateRouter({ authorizer, serverSupabaseSupplier: () => serverSupabase }));
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  try {
    const payload = {
      key: "inspection-report",
      displayName: "Inspection Report",
      sourceContext: "PROJECT",
      customFields: [{ key: "custom.issue_date", label: "Issue date", type: "DATE", required: true }],
      repeatSections: [],
      status: "ACTIVE",
    };
    const created = await fetch(`http://127.0.0.1:${port}/api/document-templates/types`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    assert.equal(created.status, 201);
    const listed = await fetch(`http://127.0.0.1:${port}/api/document-templates/types`);
    assert.equal(listed.status, 200);
    assert.equal((await listed.json()).data.types[0].key, "inspection-report");
    const retired = await fetch(`http://127.0.0.1:${port}/api/document-templates/types/inspection-report/retire`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    assert.equal(retired.status, 200);
    assert.equal((await retired.json()).data.status, "RETIRED");
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
