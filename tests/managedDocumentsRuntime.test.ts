import assert from "node:assert/strict";
import test from "node:test";
import pg from "pg";
import { buildManagedDocumentStoragePath } from "../src/lib/storage/keys.ts";

const { Client } = pg;
const runtimeEnabled = process.env.MANAGED_DOCUMENTS_RUNTIME_DB === "1";
const dbUrl = process.env.DATABASE_URL || "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const ids = {
  userOne: "00000000-0000-4000-8000-000000000981",
  userTwo: "00000000-0000-4000-8000-000000000982",
  company: "aaaaaaaa-0000-4000-8000-000000000981",
  document: "bbbbbbbb-0000-4000-8000-000000000981",
  versionOne: "cccccccc-0000-4000-8000-000000000981",
  versionTwo: "cccccccc-0000-4000-8000-000000000982",
  artifactDocument: "bbbbbbbb-0000-4000-8000-000000000985",
  artifactVersion: "cccccccc-0000-4000-8000-000000000985",
  projectOtherCompany: "dddddddd-0000-4000-8000-000000000981",
  otherCompany: "eeeeeeee-0000-4000-8000-000000000981",
};

async function connect() {
  const client = new Client({ connectionString: dbUrl });
  await client.connect();
  return client;
}

async function asService(client: pg.Client) {
  await client.query("set role service_role");
}

async function callCreate(client: pg.Client, payload: Record<string, unknown>, actorId: string) {
  const result = await client.query("select public.server_create_managed_document_with_version($1::jsonb, $2::uuid) as result", [JSON.stringify(payload), actorId]);
  return result.rows[0].result as { document: Record<string, any>; version: Record<string, any> };
}

async function callVersion(client: pg.Client, payload: Record<string, unknown>, actorId: string) {
  const result = await client.query("select public.server_create_managed_document_version($1::jsonb, $2::uuid) as result", [JSON.stringify(payload), actorId]);
  return result.rows[0].result as { document: Record<string, any>; version: Record<string, any> };
}

test("managed Documents runtime contract enforces RLS, immutable versions, and stale concurrency", { skip: !runtimeEnabled }, async () => {
  const admin = await connect();
  const serviceOne = await connect();
  const serviceTwo = await connect();
  const userReader = await connect();
  try {
    await admin.query("insert into auth.users (id, email, encrypted_password, created_at, updated_at) values ($1, 'managed-runtime-one@test.local', 'x', now(), now()), ($2, 'managed-runtime-two@test.local', 'x', now(), now()) on conflict (id) do nothing", [ids.userOne, ids.userTwo]);
    await admin.query("insert into public.companies (id, name, company_code, status, default_currency, timezone, created_by_user_id, legacy_owner_user_id) values ($1, 'Managed Runtime Company', 'managed-runtime-company', 'ACTIVE', 'PHP', 'Asia/Manila', $2, $2), ($3, 'Other Runtime Company', 'managed-runtime-other', 'ACTIVE', 'PHP', 'Asia/Manila', $4, $4)", [ids.company, ids.userOne, ids.otherCompany, ids.userTwo]);
    await admin.query("insert into public.company_members (company_id, user_id, role_key, status) values ($1, $2, 'COMPANY_ADMIN', 'ACTIVE'), ($1, $3, 'COMPANY_ADMIN', 'ACTIVE'), ($4, $5, 'COMPANY_ADMIN', 'ACTIVE')", [ids.company, ids.userOne, ids.userTwo, ids.otherCompany, ids.userTwo]);
    await admin.query("insert into public.deployment_configuration (singleton, company_id) values (true, $1) on conflict (singleton) do update set company_id = excluded.company_id", [ids.company]);
    await admin.query("insert into public.projects (id, user_id, company_id, project_code, project_name, status, contract_value, project_budget, currency, tax_treatment) values ($1, $2, $3, 'MANAGED-OTHER', 'Other Company Project', 'ACTIVE', 100, 100, 'PHP', 'VAT')", [ids.projectOtherCompany, ids.userTwo, ids.otherCompany]);
    await asService(serviceOne);
    await asService(serviceTwo);

    const pathOne = buildManagedDocumentStoragePath(ids.company, ids.document, ids.versionOne, "warranty.pdf");
    const initial = await callCreate(serviceOne, {
      companyId: ids.company,
      documentId: ids.document,
      versionId: ids.versionOne,
      title: "Runtime Warranty",
      category: "WARRANTY_CERTIFICATE",
      description: "Runtime managed document",
      fileName: "warranty.pdf",
      mimeType: "application/pdf",
      sizeBytes: 8,
      storageProvider: "memory",
      storageBucket: "company-managed-documents",
      storagePath: pathOne,
      sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    }, ids.userOne);
    assert.equal(initial.version.version_number, 1);
    const firstUpdatedAt = String(initial.document.updated_at);

    const otherCompanyPayload = {
      companyId: ids.company,
      documentId: "bbbbbbbb-0000-4000-8000-000000000982",
      versionId: "cccccccc-0000-4000-8000-000000000983",
      title: "Cross-company project link",
      category: "GENERAL_UPLOAD",
      projectId: ids.projectOtherCompany,
      fileName: "blocked.pdf",
      mimeType: "application/pdf",
      sizeBytes: 8,
      storageProvider: "memory",
      storageBucket: "company-managed-documents",
      storagePath: buildManagedDocumentStoragePath(ids.company, "bbbbbbbb-0000-4000-8000-000000000982", "cccccccc-0000-4000-8000-000000000983", "blocked.pdf"),
      sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    };
    await assert.rejects(callCreate(serviceOne, otherCompanyPayload, ids.userOne), (error: any) => ["42501", "23503"].includes(String(error.code)));

    const versionPayload = (versionId: string) => ({
      companyId: ids.company,
      documentId: ids.document,
      versionId,
      expectedUpdatedAt: firstUpdatedAt,
      fileName: "warranty-revised.pdf",
      mimeType: "application/pdf",
      sizeBytes: 9,
      storageProvider: "memory",
      storageBucket: "company-managed-documents",
      storagePath: buildManagedDocumentStoragePath(ids.company, ids.document, versionId, "warranty-revised.pdf"),
      sha256: versionId === ids.versionTwo ? "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc" : "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
    });
    const results = await Promise.allSettled([
      callVersion(serviceOne, versionPayload(ids.versionTwo), ids.userOne),
      callVersion(serviceTwo, versionPayload("cccccccc-0000-4000-8000-000000000984"), ids.userTwo),
    ]);
    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
    const rejection = results.find((result): result is PromiseRejectedResult => result.status === "rejected");
    assert.equal((rejection?.reason as { code?: string })?.code, "40001");

    const versions = await admin.query("select version_number, id from public.managed_document_versions where company_id = $1 and document_id = $2 order by version_number", [ids.company, ids.document]);
    assert.deepEqual(versions.rows.map((row) => Number(row.version_number)), [1, 2]);
    const current = await admin.query("select current_version_id, updated_at from public.managed_documents where company_id = $1 and id = $2", [ids.company, ids.document]);
    assert.equal(String(current.rows[0].current_version_id), String(versions.rows[1].id));

    const artifactPath = buildManagedDocumentStoragePath(ids.company, ids.artifactDocument, ids.artifactVersion, "generated.docx");
    const artifact = await serviceOne.query("select public.server_register_generated_document_artifact($1::jsonb, $2::uuid) as result", [JSON.stringify({
      companyId: ids.company,
      documentId: ids.artifactDocument,
      versionId: ids.artifactVersion,
      title: "Runtime generated artifact",
      description: "Provenance-only runtime artifact",
      category: "GENERATED_DOCUMENT",
      origin: "GENERATED_DOCUMENT",
      sourceDomain: "DOCUMENT_TEMPLATE",
      sourceType: "RUNTIME_TEMPLATE",
      artifactType: "DOCX",
      fileName: "generated.docx",
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      sizeBytes: 12,
      storageProvider: "memory",
      storageBucket: "company-managed-documents",
      storagePath: artifactPath,
      sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
    }), ids.userOne]);
    assert.equal(String(artifact.rows[0].result.artifact.source_domain), "DOCUMENT_TEMPLATE");
    assert.equal(String(artifact.rows[0].result.artifact.managed_version_id), ids.artifactVersion);

    await assert.rejects(
      serviceOne.query("select public.server_archive_managed_document($1::uuid, $2::timestamptz, 'stale', $3::uuid)", [ids.document, firstUpdatedAt, ids.userOne]),
      (error: any) => String(error.code) === "40001",
    );

    await userReader.query("set role authenticated");
    await userReader.query("select set_config('request.jwt.claim.sub', $1, false)", [ids.userTwo]);
    const visible = await userReader.query("select id from public.managed_documents where company_id = $1 and id = $2", [ids.company, ids.document]);
    assert.equal(visible.rows.length, 1, "company reader can see the managed document");
    await assert.rejects(userReader.query("delete from public.managed_document_versions where company_id = $1 and document_id = $2", [ids.company, ids.document]), (error: any) => ["42501", "P0001"].includes(String(error.code)));
  } finally {
    try {
      await admin.query("begin");
      await admin.query("set local session_replication_role = 'replica'");
      await admin.query("delete from public.document_artifact_registrations where company_id = $1", [ids.company]);
      await admin.query("delete from public.managed_document_versions where company_id = $1", [ids.company]);
      await admin.query("delete from public.managed_documents where company_id = $1", [ids.company]);
      await admin.query("delete from public.projects where company_id = $1", [ids.otherCompany]);
      await admin.query("delete from public.deployment_configuration where singleton = true and company_id = $1", [ids.company]);
      await admin.query("delete from public.company_members where company_id = any($1::uuid[])", [[ids.company, ids.otherCompany]]);
      await admin.query("delete from public.companies where id = any($1::uuid[])", [[ids.company, ids.otherCompany]]);
      await admin.query("delete from auth.users where id = any($1::uuid[])", [[ids.userOne, ids.userTwo]]);
      await admin.query("commit");
    } catch {
      await admin.query("rollback").catch(() => {});
    }
    await userReader.end();
    await serviceOne.end();
    await serviceTwo.end();
    await admin.end();
  }
});
