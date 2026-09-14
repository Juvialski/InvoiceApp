import assert from "node:assert/strict";
import express from "express";
import http from "node:http";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import PizZip from "pizzip";
import test from "node:test";
import { validateDocumentTemplateTypeDefinition } from "../src/lib/documentTemplateTypes.ts";
import { buildManagedTemplateRenderContext, validateManagedDocumentInputs } from "../src/server/documentTemplates/documentTemplateContext.ts";
import { createDocumentTemplateRouter } from "../src/server/documentTemplates/documentTemplateRouter.ts";
import type { StorageAuthContext } from "../src/server/storage/storageRouter.ts";
import { MemoryStorageProvider } from "../src/lib/storage/providers/memoryProvider.ts";

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

test("managed render context reauthorizes the trusted persisted source context before reading source data", async () => {
  const checkedPermissions: string[] = [];
  let privilegedSourceRead = false;
  const auth = {
    companyId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    user: { id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", email: "user@example.com", user_metadata: {} },
    supabase: {
      rpc: async (name: string, args: Record<string, unknown>) => {
        assert.equal(name, "has_company_permission");
        checkedPermissions.push(String(args.p_permission_key || ""));
        return { data: false, error: null };
      },
    },
  };
  const options = {
    serverSupabaseSupplier: () => ({
      from: () => {
        privilegedSourceRead = true;
        throw new Error("source data must not be touched before trusted authorization");
      },
    }),
  };
  await assert.rejects(
    buildManagedTemplateRenderContext(auth as any, options, definition(), "project-id", { fields: { "custom.issue_date": "2026-09-14" }, repeats: { items: [{ item: "Concrete" }] } }),
    (error: any) => error?.status === 403,
  );
  assert.deepEqual(checkedPermissions, ["projects.read"]);
  assert.equal(privilegedSourceRead, false);
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

test("managed generation uses a dynamic type, typed input, and the pinned template version", async () => {
  const companyId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const userId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  const versionId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
  const key = "companies/" + companyId + "/document-templates/template/inspection-report/version/inspection.docx";
  const zip = new PizZip();
  zip.file("[Content_Types].xml", "<Types><Override PartName=\"/word/document.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml\"/></Types>");
  zip.file("_rels/.rels", "<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\"></Relationships>");
  zip.file("word/document.xml", "<w:document xmlns:w=\"http://schemas.openxmlformats.org/wordprocessingml/2006/main\"><w:body><w:p><w:r><w:t>Issue date: {{custom.issue_date}}</w:t></w:r></w:p><w:sectPr/></w:body></w:document>");
  const bytes = new Uint8Array(zip.generate({ type: "uint8array" }));
  const hash = createHash("sha256").update(bytes).digest("hex");
  const storage = new MemoryStorageProvider();
  await storage.putObject({ companyId, bucket: "", key, bytes, contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", sha256: hash, upsert: false });
  const definition = { id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", company_id: companyId, type_key: "inspection-report", display_name: "Inspection Report", source_context: "GENERAL", custom_fields: [{ key: "custom.issue_date", label: "Issue date", type: "DATE", required: true }], repeat_sections: [], status: "ACTIVE", schema_version: "1" };
  const version = { id: versionId, template_id: "ffffffff-ffff-4fff-8fff-ffffffffffff", company_id: companyId, document_type: "inspection-report", display_name: "Inspection Report", origin: "UPLOADED", version_number: 1, source_filename: "inspection.docx", source_storage_path: key, content_storage_path: key, storage_provider: "memory", storage_bucket: "", mime_type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", content_size: bytes.byteLength, content_sha256: hash, source_sha256: hash, mapping_schema_version: "1", bindings: [{ tag: "custom.issue_date", fieldKey: "custom.issue_date", confirmed: true }], validation_state: "VALID", validation_report: {}, status: "ACTIVE" };
  const queryFor = (table: string) => {
    const rows = table === "document_template_type_definitions" ? [definition] : table === "document_template_versions" ? [version] : [];
    let filtered: any[] = rows;
    const query: any = {
      select: () => query,
      eq: (column: string, value: unknown) => { filtered = filtered.filter((row: any) => row[column] === value); return query; },
      maybeSingle: async () => ({ data: filtered[0] || null, error: null }),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve(resolve({ data: filtered[0] || null, error: null })),
    };
    return query;
  };
  const authSupabase: any = {
    from: queryFor,
    rpc: async (name: string, args: Record<string, unknown>) => {
      if (name === "has_company_permission" && args.p_permission_key === "company.settings.read") return { data: true, error: null };
      return { data: false, error: null };
    },
  };
  const app = express();
  app.use(express.json());
  app.use("/api/document-templates", createDocumentTemplateRouter({
    authorizer: async (): Promise<StorageAuthContext> => ({ accessToken: "synthetic-token", companyId, user: { id: userId } as any, supabase: authSupabase }),
    providerSupplier: () => storage,
    serverSupabaseSupplier: () => ({ from: (table: string) => table === "company_document_profiles" ? { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { legal_name: "Synthetic Company" }, error: null }) }) }) } : authSupabase.from(table) } as any),
  }));
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/document-templates/managed-generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ typeKey: "inspection-report", sourceContext: "GENERAL", templateVersionId: versionId, inputs: { fields: { "custom.issue_date": "2026-09-14" }, repeats: {} } }),
    });
    if (response.status !== 200) throw new Error(await response.text());
    const generated = new Uint8Array(await response.arrayBuffer());
    const generatedZip = new PizZip(generated);
    const generatedXml = generatedZip.file("word/document.xml")?.asText() || "";
    assert.match(generatedXml, /2026-09-14/);
    assert.doesNotMatch(generatedXml, /\{\{/);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
