import assert from "node:assert/strict";
import test from "node:test";
import { encryptCompanyGeminiCredential } from "../src/server/ai/companyAiEncryption.ts";
import { ASSISTANT_TOOL_DEFINITIONS } from "../src/server/assistant/toolRegistry.ts";
import {
  classifyCompanyAiProviderError,
  classifyCompanyAiProviderFailure,
  companyAiProviderError,
  clearCompanyAiRuntimeCache,
  invalidateCompanyAiRuntime,
  isCompanyAiFallbackEligible,
  isCompanyAiAuthenticationError,
  resolveCompanyAiRuntime,
  testCompanyAiRuntime,
  withCompanyAiRuntime,
} from "../src/server/ai/companyAiRuntime.ts";

const COMPANY_A = "00000000-0000-4000-8000-000000000001";
const COMPANY_B = "00000000-0000-4000-8000-000000000002";
const MASTER = Buffer.alloc(32, 7);
const ENVIRONMENT = {
  AI_CREDENTIALS_MASTER_KEY: MASTER.toString("base64"),
  ALLOW_GLOBAL_GEMINI_FALLBACK: "false",
} as any;

function activeCredential(companyId: string, apiKey: string, version = 1) {
  return {
    ...encryptCompanyGeminiCredential(apiKey, companyId, MASTER),
    company_id: companyId,
    provider: "GEMINI",
    enabled: true,
    status: "ACTIVE",
    credential_version: version,
  };
}

function fakeSupabase(rows: Map<string, unknown>) {
  let calls = 0;
  return {
    client: {
      rpc: async (_name: string, args: Record<string, unknown>) => {
        calls += 1;
        return { data: rows.get(String(args.p_company_id)) ?? null, error: null };
      },
    } as any,
    calls: () => calls,
  };
}

test("runtime credentials remain company-bound and cache invalidation follows versions", async () => {
  clearCompanyAiRuntimeCache();
  const rows = new Map<string, unknown>([
    [COMPANY_A, activeCredential(COMPANY_A, "Key-A-secret-value", 1)],
    [COMPANY_B, activeCredential(COMPANY_B, "Key-B-secret-value", 1)],
  ]);
  const fake = fakeSupabase(rows);

  const firstA = await resolveCompanyAiRuntime({ supabase: fake.client, credentialSupabase: fake.client, companyId: COMPANY_A, now: 100, environment: ENVIRONMENT });
  const cachedA = await resolveCompanyAiRuntime({ supabase: fake.client, credentialSupabase: fake.client, companyId: COMPANY_A, now: 101, environment: ENVIRONMENT });
  const firstB = await resolveCompanyAiRuntime({ supabase: fake.client, credentialSupabase: fake.client, companyId: COMPANY_B, now: 101, environment: ENVIRONMENT });
  assert.strictEqual(firstA, cachedA);
  assert.notStrictEqual(firstA, firstB);
  assert.equal(firstA.companyId, COMPANY_A);
  assert.equal(firstB.companyId, COMPANY_B);
  assert.equal(firstA.credentialVersion, 1);
  assert.equal(fake.calls(), 2, "a fresh runtime is reused only for the same company");

  rows.set(COMPANY_A, activeCredential(COMPANY_A, "Key-A-rotated", 2));
  const rotatedA = await resolveCompanyAiRuntime({ supabase: fake.client, credentialSupabase: fake.client, companyId: COMPANY_A, now: 102, forceRefresh: true, environment: ENVIRONMENT });
  assert.notStrictEqual(rotatedA, firstA);
  assert.equal(rotatedA.credentialVersion, 2);
  invalidateCompanyAiRuntime(COMPANY_A);
  rows.set(COMPANY_A, activeCredential(COMPANY_A, "Key-A-new", 3));
  const invalidatedA = await resolveCompanyAiRuntime({ supabase: fake.client, credentialSupabase: fake.client, companyId: COMPANY_A, now: 103, environment: ENVIRONMENT });
  assert.equal(invalidatedA.credentialVersion, 3);
  assert.equal(invalidatedA.companyId, COMPANY_A);
  const cachedB = await resolveCompanyAiRuntime({ supabase: fake.client, credentialSupabase: fake.client, companyId: COMPANY_B, now: 103, environment: ENVIRONMENT });
  assert.strictEqual(cachedB, firstB, "company A invalidation must not evict company B");
});

test("a mismatched resolver row fails closed instead of being relabeled to the requested company", async () => {
  clearCompanyAiRuntimeCache();
  const fake = fakeSupabase(new Map([[COMPANY_A, activeCredential(COMPANY_B, "Key-B-secret-value", 1)]]));
  await assert.rejects(
    () => resolveCompanyAiRuntime({ supabase: fake.client, credentialSupabase: fake.client, companyId: COMPANY_A, environment: ENVIRONMENT }),
    (error: any) => {
      assert.equal(error.code, "AI_CONFIG_UNAVAILABLE");
      assert.doesNotMatch(error.message, /Key-B|ciphertext|company-b/i);
      return true;
    },
  );
});

test("missing or disabled company credentials do not consume the global fallback", async () => {
  clearCompanyAiRuntimeCache();
  const noSettings = fakeSupabase(new Map());
  const localEnvironment = { ...ENVIRONMENT, ALLOW_GLOBAL_GEMINI_FALLBACK: "true", GEMINI_API_KEY: "local-demo-key" } as any;
  const fallback = await resolveCompanyAiRuntime({ supabase: noSettings.client, credentialSupabase: noSettings.client, companyId: COMPANY_A, environment: localEnvironment });
  assert.equal(fallback.companyId, COMPANY_A);
  assert.equal(fallback.credentialVersion, 0);

  for (const [companyId, status] of [[COMPANY_A, "NOT_CONFIGURED"], [COMPANY_B, "DISABLED"]] as const) {
    clearCompanyAiRuntimeCache();
    const rows = new Map<string, unknown>([[companyId, { company_id: companyId, provider: "GEMINI", enabled: false, status, credential_version: 4 }]]);
    const fake = fakeSupabase(rows);
    await assert.rejects(
      () => resolveCompanyAiRuntime({ supabase: fake.client, credentialSupabase: fake.client, companyId, environment: localEnvironment }),
      (error: any) => {
        assert.equal(error.code, status === "DISABLED" ? "AI_DISABLED_FOR_COMPANY" : "AI_NOT_CONFIGURED_FOR_COMPANY");
        assert.doesNotMatch(error.message, /local-demo-key|Key-|ciphertext|plaintext/i);
        return true;
      },
    );
  }
});

test("authentication retry re-resolves the same company runtime", async () => {
  clearCompanyAiRuntimeCache();
  const fake = fakeSupabase(new Map([[COMPANY_A, activeCredential(COMPANY_A, "Key-A-secret-value", 1)]]));
  const seenCompanies: string[] = [];
  let calls = 0;
  const result = await withCompanyAiRuntime({ supabase: fake.client, credentialSupabase: fake.client, companyId: COMPANY_A, environment: ENVIRONMENT }, async (runtime) => {
    seenCompanies.push(runtime.companyId);
    calls += 1;
    if (calls === 1) throw Object.assign(new Error("provider authentication failed"), { status: 401 });
    return runtime.companyId;
  });
  assert.equal(result, COMPANY_A);
  assert.deepEqual(seenCompanies, [COMPANY_A, COMPANY_A]);
  assert.equal(fake.calls(), 2, "authentication retry refreshes the same company scope");
});

test("provider classification invalidates only genuine credential authentication failures", () => {
  assert.equal(classifyCompanyAiProviderError(Object.assign(new Error("unauthorized"), { status: 401 })), "INVALID_CREDENTIAL");
  assert.equal(classifyCompanyAiProviderError(Object.assign(new Error("API key not valid. Please pass a valid API key."), { status: 403 })), "INVALID_CREDENTIAL");
  assert.equal(classifyCompanyAiProviderError(Object.assign(new Error("permission denied for this project"), { status: 403 })), "PROVIDER_ACCESS_DENIED");
  assert.equal(isCompanyAiAuthenticationError(Object.assign(new Error("permission denied for this project"), { status: 403 })), false);
  assert.equal(classifyCompanyAiProviderError(Object.assign(new Error("model access is not enabled for this project"), { status: 403 })), "PROVIDER_ACCESS_DENIED");
  assert.equal(classifyCompanyAiProviderError(Object.assign(new Error("resource exhausted"), { status: 429 })), "QUOTA_LIMITED");
  assert.equal(classifyCompanyAiProviderError(Object.assign(new Error("model not found"), { status: 404 })), "MODEL_UNAVAILABLE");
  assert.equal(classifyCompanyAiProviderError(new Error("fetch failed")), "PROVIDER_UNAVAILABLE");
});

test("provider failures become distinct safe user-facing company AI errors", () => {
  const invalid = companyAiProviderError(Object.assign(new Error("API key not valid"), { status: 403 }));
  const quota = companyAiProviderError(Object.assign(new Error("resource exhausted"), { status: 429 }));
  const outage = companyAiProviderError(new Error("fetch failed"));
  assert.equal(invalid?.code, "AI_CREDENTIAL_INVALID");
  assert.equal(invalid?.message, "The configured Gemini API key is invalid.");
  assert.equal(quota?.code, "AI_QUOTA_LIMITED");
  assert.equal(quota?.message, "Gemini quota or rate limit reached.");
  assert.equal(outage?.code, "AI_NETWORK_ERROR");
  assert.match(outage?.correlationRef || "", /^AI-[A-Z0-9-]+$/);
  assert.equal(outage?.message, "The server could not reach Gemini.");
  assert.equal(companyAiProviderError(new Error("The assistant action could not be recorded.")), null);
});

test("provider classifications expose safe codes and fallback eligibility without raw provider details", () => {
  const cases: Array<[unknown, string, boolean]> = [
    [Object.assign(new Error("API key not valid"), { status: 401 }), "AI_CREDENTIAL_INVALID", false],
    [Object.assign(new Error("resource exhausted"), { status: 429 }), "AI_QUOTA_LIMITED", false],
    [Object.assign(new Error("permission denied"), { status: 403 }), "AI_PROVIDER_ACCESS_DENIED", false],
    [Object.assign(new Error("model not found"), { status: 404 }), "AI_MODEL_UNAVAILABLE", true],
    [new Error("provider returned 503"), "AI_PROVIDER_UNAVAILABLE", true],
    [Object.assign(new Error("invalid function declaration"), { status: 400 }), "AI_REQUEST_REJECTED", false],
    [Object.assign(new Error("request timed out"), { status: 408 }), "AI_TIMEOUT", true],
    [new Error("ECONNRESET while reaching Gemini"), "AI_NETWORK_ERROR", true],
  ];
  for (const [error, code, fallback] of cases) {
    assert.equal(classifyCompanyAiProviderFailure(error), code);
    const normalized = companyAiProviderError(error, { assumeProviderError: true });
    assert.equal(normalized?.code, code);
    assert.equal(isCompanyAiFallbackEligible(normalized), fallback);
    assert.doesNotMatch(normalized?.message || "", /secret-value|ciphertext|Bearer|stack/i);
  }
});

test("connection health uses the company runtime primary model for an assistant-compatible request", async () => {
  const calls: any[] = [];
  const runtime = {
    companyId: COMPANY_A,
    provider: "GEMINI",
    primaryModel: "gemini-3.5-flash-lite",
    fallbackModel: "gemini-3.7-flash",
    credentialVersion: 7,
    geminiClient: { models: { generateContent: async (parameters: any) => { calls.push(parameters); return { text: "OK" }; } } },
  } as any;
  assert.equal(await testCompanyAiRuntime(runtime, { timeoutMs: 2_000 }), "SUCCESS");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].model, "gemini-3.5-flash-lite");
  assert.equal(calls[0].contents[0].parts[0].text, "Reply with the single word OK.");
  assert.equal(calls[0].config.maxOutputTokens, 8);
  assert.equal(calls[0].config.toolConfig.functionCallingConfig.mode, "NONE");
  assert.equal(ASSISTANT_TOOL_DEFINITIONS.length, 132);
  assert.equal(calls[0].config.tools[0].functionDeclarations.length, ASSISTANT_TOOL_DEFINITIONS.length);
  assert.ok(calls[0].config.tools[0].functionDeclarations.every((declaration: any) => declaration.parameters && !declaration.parametersJsonSchema));
  assert.doesNotMatch(JSON.stringify(calls[0].config.tools), /additionalProperties/);
});

test("a disabled company rejects AI until enabled without changing its credential", async () => {
  clearCompanyAiRuntimeCache();
  const rows = new Map<string, unknown>([[COMPANY_A, { ...activeCredential(COMPANY_A, "Key-A-secret-value", 4), enabled: false, status: "DISABLED" }]]);
  const fake = fakeSupabase(rows);
  await assert.rejects(
    () => resolveCompanyAiRuntime({ supabase: fake.client, credentialSupabase: fake.client, companyId: COMPANY_A, environment: ENVIRONMENT }),
    (error: any) => error.code === "AI_DISABLED_FOR_COMPANY",
  );
  rows.set(COMPANY_A, activeCredential(COMPANY_A, "Key-A-secret-value", 4));
  const enabled = await resolveCompanyAiRuntime({ supabase: fake.client, credentialSupabase: fake.client, companyId: COMPANY_A, environment: ENVIRONMENT });
  assert.equal(enabled.companyId, COMPANY_A);
  assert.equal(enabled.credentialVersion, 4);
});

test("runtime cache evicts old company entries at its hard bound", async () => {
  clearCompanyAiRuntimeCache();
  const rows = new Map<string, unknown>();
  const companyIds: string[] = [];
  for (let index = 0; index < 130; index += 1) {
    const companyId = `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`;
    companyIds.push(companyId);
    rows.set(companyId, activeCredential(companyId, `Key-${index}-secret`, 1));
  }
  const fake = fakeSupabase(rows);
  for (const companyId of companyIds) await resolveCompanyAiRuntime({ supabase: fake.client, credentialSupabase: fake.client, companyId, now: 500, environment: ENVIRONMENT });
  const callsAfterFill = fake.calls();
  await resolveCompanyAiRuntime({ supabase: fake.client, credentialSupabase: fake.client, companyId: companyIds[0]!, now: 501, environment: ENVIRONMENT });
  assert.equal(callsAfterFill, 130);
  assert.equal(fake.calls(), 131, "the oldest company runtime is evicted instead of growing without bound");
});
