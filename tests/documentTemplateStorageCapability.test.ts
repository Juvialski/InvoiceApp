import assert from "node:assert/strict";
import express from "express";
import http from "node:http";
import { readFileSync } from "node:fs";
import test from "node:test";
import { MemoryStorageProvider } from "../src/lib/storage/providers/memoryProvider.ts";
import { buildStarterDocxTemplate, DOCX_MIME_TYPE } from "../src/server/documentTemplates/documentTemplateEngine.ts";
import {
  getStorageServerAuthorityStatus,
} from "../src/server/storage/storageCompensation.ts";
import { StorageError, type StorageEnvironment } from "../src/lib/storage/types.ts";
import type { StorageAuthContext } from "../src/server/storage/storageRouter.ts";
import { createDocumentTemplateRouter } from "../src/server/documentTemplates/documentTemplateRouter.ts";

const COMPANY_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

function emptyQuery() {
  const query: any = {
    select: () => query,
    eq: () => query,
    order: () => query,
    maybeSingle: async () => ({ data: null, error: null }),
  };
  return query;
}

async function startTemplateServer(options: { capability?: () => ReturnType<typeof getStorageServerAuthorityStatus> } = {}) {
  const storage = new MemoryStorageProvider();
  const authSupabase: any = { from: () => emptyQuery() };
  const authorizer = async (): Promise<StorageAuthContext> => ({
    accessToken: "synthetic-token",
    companyId: COMPANY_ID,
    user: { id: USER_ID } as any,
    supabase: authSupabase,
  });
  const app = express();
  app.use(express.json({ limit: "1mb" }));
  app.use("/api/document-templates", createDocumentTemplateRouter({
    authorizer,
    primaryProviderSupplier: () => storage,
    providerSupplier: () => storage,
    pdfCapabilitySupplier: () => ({ status: "UNAVAILABLE", message: "PDF converter is unavailable in this synthetic test." }),
    ...(options.capability ? { storageCapabilitySupplier: options.capability } : {}),
    serverSupabaseSupplier: () => {
      throw new StorageError(
        "Privileged Supabase storage client is not configured.",
        "SERVER_CLEANUP_UNAVAILABLE",
        503,
      );
    },
  }));
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as { port: number };
  return { server, storage, url: "http://127.0.0.1:" + address.port };
}

async function closeServer(server: http.Server) {
  await new Promise<void>((resolve) => server.close(() => resolve()));
}

test("server Storage authority capability distinguishes missing and safe server-only keys", () => {
  const base: StorageEnvironment = { SUPABASE_URL: "https://qa.example.supabase.co" };
  const missing = getStorageServerAuthorityStatus(base);
  assert.equal(missing.status, "UNAVAILABLE");
  assert.equal(missing.code, "TEMPLATE_STORAGE_UNAVAILABLE");
  assert.match(missing.message, /server-side Storage authority/i);

  const publicKey = getStorageServerAuthorityStatus({
    ...base,
    SUPABASE_STORAGE_SERVER_KEY: "sb_publishable_not-private",
  });
  assert.equal(publicKey.status, "UNAVAILABLE");
  assert.equal(publicKey.code, "TEMPLATE_STORAGE_UNAVAILABLE");
  assert.doesNotMatch(publicKey.message, /sb_publishable_not-private/);

  const available = getStorageServerAuthorityStatus({
    ...base,
    SUPABASE_STORAGE_SERVER_KEY: "sb_secret_synthetic_only",
  });
  assert.equal(available.status, "AVAILABLE");
  assert.equal(available.code, undefined);
  assert.doesNotMatch(available.message, /sb_secret_synthetic_only/);
});

test("document-template capability keeps Storage persistence separate from PDF conversion", async () => {
  const fixture = await startTemplateServer({
    capability: () => getStorageServerAuthorityStatus({ SUPABASE_URL: "https://qa.example.supabase.co" }),
  });
  try {
    const response = await fetch(fixture.url + "/api/document-templates/capability", {
      headers: { Authorization: "Bearer synthetic-token" },
    });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.data.status, "UNAVAILABLE");
    assert.equal(body.data.templateStorage.status, "UNAVAILABLE");
    assert.equal(body.data.templateStorage.code, "TEMPLATE_STORAGE_UNAVAILABLE");
    assert.match(body.data.templateStorage.message, /server-side Storage authority/i);
  } finally {
    await closeServer(fixture.server);
  }
});

test("starter persistence returns a structured storage prerequisite error and compensates the object", async () => {
  const fixture = await startTemplateServer();
  try {
    const response = await fetch(fixture.url + "/api/document-templates/starter", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer synthetic-token" },
      body: JSON.stringify({ documentType: "PURCHASE_ORDER" }),
    });
    const body = await response.json();
    assert.equal(response.status, 503);
    assert.equal(body.code, "TEMPLATE_STORAGE_UNAVAILABLE");
    assert.match(body.error, /server-side Storage authority/i);
    assert.equal(fixture.storage.size(), 0);
  } finally {
    await closeServer(fixture.server);
  }
});

test("safe DOCX upload uses the same structured storage prerequisite boundary", async () => {
  const fixture = await startTemplateServer();
  try {
    const built = await buildStarterDocxTemplate("CLIENT_INVOICE");
    const response = await fetch(fixture.url + "/api/document-templates/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer synthetic-token" },
      body: JSON.stringify({
        documentType: "CLIENT_INVOICE",
        fileName: "safe-template.docx",
        fileData: Buffer.from(built.bytes).toString("base64"),
      }),
    });
    const body = await response.json();
    assert.equal(response.status, 503);
    assert.equal(body.code, "TEMPLATE_STORAGE_UNAVAILABLE");
    assert.match(body.error, /server-side Storage authority/i);
    assert.equal(fixture.storage.size(), 0);
    assert.equal(DOCX_MIME_TYPE, "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  } finally {
    await closeServer(fixture.server);
  }
});

test("template settings gates persistence separately from PDF conversion", () => {
  const settings = readFileSync(new URL("../src/components/access/CompanyDocumentTemplatesSettings.tsx", import.meta.url), "utf8");
  assert.match(settings, /templateStorage/);
  assert.match(settings, /TEMPLATE_STORAGE_UNAVAILABLE|server-side Storage authority/i);
  assert.match(settings, /loadDeploymentAiConfig/);
  assert.match(settings, /lastTestStatus === "SUCCESS"/);
  assert.match(settings, /data-document-pdf-capability/);
});
