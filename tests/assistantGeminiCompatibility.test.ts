import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { GoogleGenAI, Type } from "@google/genai";
import { AssistantMessageContent } from "../src/assistant/AssistantMessageContent.ts";
import { safeAssistantUrl } from "../src/assistant/AssistantMarkdown.ts";
import { ASSISTANT_FALLBACK_MODEL, ASSISTANT_PRIMARY_MODEL, createAssistantModelRunner } from "../src/server/assistant/assistantModels.ts";
import { runAssistantLoop } from "../src/server/assistant/assistantLoop.ts";
import { createAssistantHandler } from "../src/server/assistant/assistantHandler.ts";
import {
  AssistantToolSchemaError,
  assistantToolSchemaAudit,
  normalizeAssistantFunctionDeclaration,
} from "../src/server/assistant/assistantGeminiSchemas.ts";
import { ASSISTANT_TOOL_DEFINITIONS, assistantFunctionDeclarations } from "../src/server/assistant/toolRegistry.ts";
import { companyAiProviderError, classifyCompanyAiProviderFailure } from "../src/server/ai/companyAiRuntime.ts";
import { CompanyAiError } from "../src/server/ai/companyAiTypes.ts";

async function captureGeminiRequest(request: Parameters<GoogleGenAI["models"]["generateContent"]>[0]) {
  const originalFetch = globalThis.fetch;
  let captured: Record<string, unknown> | undefined;
  globalThis.fetch = (async (_input, init) => {
    captured = JSON.parse(String(init?.body || "{}")) as Record<string, unknown>;
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "OK" }] } }] }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  try {
    const client = new GoogleGenAI({ apiKey: "test-key" });
    await client.models.generateContent(request);
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.ok(captured, "the SDK should serialize a request");
  return captured;
}

test("assistant schemas audit every declaration and use the Gemini parameters contract", () => {
  const audit = assistantToolSchemaAudit(ASSISTANT_TOOL_DEFINITIONS);
  assert.equal(audit.declarationCount, 56);
  const declarations = assistantFunctionDeclarations();
  assert.equal(declarations.length, 56);
  assert.ok(declarations.every((declaration) => declaration.parameters));
  assert.ok(declarations.every((declaration) => !("parametersJsonSchema" in declaration)));
  assert.doesNotMatch(JSON.stringify(declarations), /additionalProperties/);

  const worker = declarations.find((declaration) => declaration.name === "prepare_create_worker")!;
  assert.deepEqual(worker.parameters?.required, ["firstName", "lastName", "defaultPayType", "defaultRate"]);
  assert.deepEqual(worker.parameters?.properties?.defaultPayType?.enum, ["MONTHLY", "DAILY", "HOURLY"]);
  assert.equal(worker.parameters?.properties?.defaultRate?.minimum, 0);
  assert.equal(worker.parameters?.properties?.defaultRate?.maximum, 1_000_000_000);

  const records = declarations.find((declaration) => declaration.name === "prepare_attendance_batch")?.parameters?.properties?.records;
  assert.equal(records?.type, Type.ARRAY);
  assert.equal(records?.minItems, "1");
  assert.equal(records?.maxItems, "50");
  assert.equal(records?.items?.type, Type.OBJECT);
  assert.deepEqual(records?.items?.required, ["workerId", "attendanceDate"]);
});

test("unsupported schema fields fail with the declaration index and path instead of being cast away", () => {
  const invalid = {
    name: "invalid_tool",
    description: "Invalid test tool",
    parametersJsonSchema: {
      type: "object",
      properties: {
        dynamic: { type: "object", additionalProperties: { type: "string" } },
      },
    },
  };
  assert.throws(
    () => normalizeAssistantFunctionDeclaration(invalid, 17),
    (error: unknown) => {
      assert.ok(error instanceof AssistantToolSchemaError);
      assert.equal(error.issue.code, "SCHEMA_ADDITIONAL_PROPERTIES_UNSUPPORTED");
      assert.equal(error.issue.declarationIndex, 17);
      assert.match(error.issue.path, /invalid_tool\.parameters\.properties\.dynamic/);
      return true;
    },
  );
  assert.throws(
    () => normalizeAssistantFunctionDeclaration({ name: "invalid_tool", description: "Invalid test tool", parametersJsonSchema: { type: "object", oneOf: [] } }, 18),
    (error: unknown) => error instanceof AssistantToolSchemaError && error.issue.code === "SCHEMA_FIELD_UNSUPPORTED",
  );
});

test("the SDK request uses typed parameters for minimal and full assistant probes", async () => {
  const noTools = await captureGeminiRequest({ model: ASSISTANT_PRIMARY_MODEL, contents: "hello", config: { maxOutputTokens: 8 } });
  assert.equal(noTools.tools, undefined);

  const minimal = await captureGeminiRequest({
    model: ASSISTANT_PRIMARY_MODEL,
    contents: "hello",
    config: {
      tools: [{ functionDeclarations: [{ name: "read_only_probe", description: "A harmless probe.", parameters: { type: Type.OBJECT, properties: { value: { type: Type.STRING } }, required: ["value"] } }] }],
      maxOutputTokens: 8,
    },
  });
  const minimalDeclaration = (minimal.tools as any[])[0].functionDeclarations[0];
  assert.deepEqual(minimalDeclaration.parameters, { type: "OBJECT", properties: { value: { type: "STRING" } }, required: ["value"] });

  const full = await captureGeminiRequest({
    model: ASSISTANT_PRIMARY_MODEL,
    contents: [{ role: "user", parts: [{ text: "Show me payroll help." }] }],
    config: { systemInstruction: "safe", tools: [{ functionDeclarations: assistantFunctionDeclarations() }], maxOutputTokens: 900 },
  });
  const declarations = (full.tools as any[])[0].functionDeclarations as Array<Record<string, unknown>>;
  assert.equal(declarations.length, 56);
  assert.ok(declarations.every((declaration) => declaration.parameters && !("parametersJsonSchema" in declaration)));
  assert.doesNotMatch(JSON.stringify(full), /additionalProperties/);
});

test("Gemini function-call history preserves thought signatures and exact response IDs", async () => {
  const calls: unknown[][] = [];
  let turn = 0;
  const toolContext = {
    auth: {
      companyId: "00000000-0000-4000-8000-000000000001",
      user: { id: "00000000-0000-4000-8000-000000000002" },
      supabase: { rpc: async () => ({ data: true, error: null }) },
      accessToken: "test",
    },
    context: { companyId: "00000000-0000-4000-8000-000000000001", generation: 4 },
    now: new Date("2026-08-27T00:00:00.000Z"),
    prepareAction: async () => ({ output: {} }),
  } as any;
  const runner = {
    fallbackUsed: false,
    async generate(input: any) {
      calls.push([...input.contents]);
      turn += 1;
      if (turn === 1) return {
        model: ASSISTANT_PRIMARY_MODEL,
        fallbackUsed: false,
        response: { candidates: [{ content: { role: "model", parts: [{ thoughtSignature: "opaque-signature", functionCall: { name: "search_help", id: "call-1", args: { query: "payroll" } } }] } }] },
      };
      return { model: ASSISTANT_PRIMARY_MODEL, fallbackUsed: false, response: { text: "Payroll help is available." } };
    },
  } as any;
  const result = await runAssistantLoop({ modelRunner: runner, systemInstruction: "safe", contents: [{ role: "user", parts: [{ text: "help" }] }], toolContext });
  assert.equal(result.message, "Payroll help is available.");
  const modelTurn = calls[1]?.[1] as any;
  const responseTurn = calls[1]?.[2] as any;
  assert.deepEqual(modelTurn.parts[0], { thoughtSignature: "opaque-signature", functionCall: { name: "search_help", id: "call-1", args: { query: "payroll" } } });
  assert.equal(responseTurn.parts[0].functionResponse.name, "search_help");
  assert.equal(responseTurn.parts[0].functionResponse.id, "call-1");
  assert.equal(result.usage.functionCalls, 1);
});

test("provider request rejection diagnostics stay classified and secret-free", () => {
  const raw = Object.assign(new Error("Invalid argument: unsupported tool schema"), { status: 400, apiKey: "secret-key" });
  assert.equal(classifyCompanyAiProviderFailure(raw), "AI_REQUEST_REJECTED");
  const normalized = companyAiProviderError(raw, {
    assumeProviderError: true,
    model: ASSISTANT_PRIMARY_MODEL,
    stage: "assistant-primary",
    diagnostics: { requestKind: "assistant", toolDeclarationCount: 56 },
  });
  assert.equal(normalized?.code, "AI_REQUEST_REJECTED");
  assert.equal(normalized?.diagnostics?.httpStatus, 400);
  assert.equal(normalized?.diagnostics?.toolDeclarationCount, 56);
  assert.doesNotMatch(normalized?.message || "", /secret-key|unsupported tool schema/i);
});

test("assistant model timeout classification and fallback behavior remain bounded", async () => {
  const models: string[] = [];
  const client = {
    models: {
      generateContent: ({ model, config }: any) => {
        models.push(model);
        return new Promise((_resolve, reject) => config.abortSignal.addEventListener("abort", () => reject(new Error("request aborted")), { once: true }));
      },
    },
  } as any;
  const runner = createAssistantModelRunner(client, { timeoutMs: 1_000 });
  await assert.rejects(() => runner.generate({ contents: "hello" as any, config: {} }), (error: any) => error.code === "AI_TIMEOUT");
  assert.deepEqual(models, [ASSISTANT_PRIMARY_MODEL, ASSISTANT_FALLBACK_MODEL]);
  assert.equal(runner.fallbackUsed, true);
});

function retrySupabase() {
  const companyId = "00000000-0000-4000-8000-000000000001";
  const userId = "00000000-0000-4000-8000-000000000002";
  const threadId = "00000000-0000-4000-8000-000000000003";
  const tables: Record<string, Array<Record<string, unknown>>> = {
    companies: [{ id: companyId, name: "Test Company", timezone: "Asia/Manila", default_currency: "PHP" }],
    assistant_threads: [],
    assistant_messages: [],
  };
  let threadSequence = 0;
  const queryFor = (table: string, inserted?: Record<string, unknown>[]) => {
    let rows = inserted || [...(tables[table] || [])];
    const query: any = {
      select: () => query,
      eq: (key: string, value: unknown) => { rows = rows.filter((row) => row[key] === value); return query; },
      order: (key: string, options?: { ascending?: boolean }) => { rows.sort((left, right) => String(left[key] || "").localeCompare(String(right[key] || "")) * (options?.ascending === false ? -1 : 1)); return query; },
      limit: (count: number) => { rows = rows.slice(0, count); return query; },
      update: (patch: Record<string, unknown>) => { rows.forEach((row) => Object.assign(row, patch)); return query; },
      maybeSingle: async () => ({ data: rows[0] || null, error: null }),
      single: async () => ({ data: rows[0] || null, error: rows[0] ? null : { message: "not found" } }),
      then: (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(resolve, reject),
    };
    return query;
  };
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: userId } }, error: null }) },
    rpc: async () => ({ data: true, error: null }),
    from: (table: string) => {
      const query: any = queryFor(table);
      query.insert = (input: Record<string, unknown> | Array<Record<string, unknown>>) => {
        const rows = Array.isArray(input) ? input : [input];
        const inserted = rows.map((row) => {
          const stored = { ...row, id: row.id || (table === "assistant_threads" ? threadId : `message-${++threadSequence}`), created_at: row.created_at || `2026-08-27T00:00:0${threadSequence}.000Z` };
          tables[table] = [...(tables[table] || []), stored];
          return stored;
        });
        return queryFor(table, inserted);
      };
      return query;
    },
  } as any;
  return { client, tables, companyId, userId, threadId };
}

test("provider retry reuses the failed thread and request without duplicating the user message", async () => {
  const fake = retrySupabase();
  const requestId = "assistant-request-retry-1";
  const calls: unknown[][] = [];
  let modelCalls = 0;
  const handler = createAssistantHandler({
    createSupabaseClient: () => fake.client,
    createModelClient: () => ({ models: { generateContent: async () => ({ text: "unused" }) } }) as any,
    createModelRunner: () => ({
      fallbackUsed: false,
      async generate(input: any) {
        calls.push([...input.contents]);
        modelCalls += 1;
        if (modelCalls === 1) throw new CompanyAiError("AI_REQUEST_REJECTED", "Gemini rejected the assistant request configuration.", 400);
        return { response: { text: "Recovered safely." }, model: ASSISTANT_PRIMARY_MODEL, fallbackUsed: false };
      },
    }) as any,
  });
  const invoke = async (body: Record<string, unknown>) => {
    const response: any = { statusCode: 200, status(code: number) { this.statusCode = code; return this; }, json(payload: unknown) { this.body = payload; return this; } };
    await handler({ headers: { authorization: "Bearer test-token", "x-company-id": fake.companyId }, body } as any, response, (() => undefined) as any);
    return response;
  };
  const first = await invoke({ requestId, message: "Show me payroll help.", context: { companyId: fake.companyId, generation: 4 } });
  assert.equal(first.statusCode, 400);
  assert.equal(first.body.threadId, fake.threadId);
  const second = await invoke({ requestId, threadId: first.body.threadId, message: "Show me payroll help.", context: { companyId: fake.companyId, generation: 4 } });
  assert.equal(second.statusCode, 200);
  assert.equal(second.body.success, true);
  assert.equal(fake.tables.assistant_threads.length, 1);
  assert.equal(fake.tables.assistant_messages.filter((row) => row.role === "user").length, 1);
  assert.equal(fake.tables.assistant_messages.filter((row) => row.role === "assistant").length, 1);
  assert.equal((calls[1]?.[0] as any).parts[0].text.includes("Show me payroll help."), true);
  assert.equal((calls[1]?.length || 0), 1, "the retried model request should not repeat the already-persisted user turn in history");
});

test("assistant Markdown renders supported syntax while keeping HTML, images, and dangerous links inert", () => {
  const markup = renderToStaticMarkup(React.createElement(AssistantMessageContent, {
    role: "assistant",
    text: "To add an employee, I need:\n\n1. **First and Last Name**\n2. **Pay Basis**\n3. **Pay Rate**\n\n- Use `HOURLY`\n- Review this [guide](https://example.com/guide).\n\n> Keep confirmation required.\n\n```ts\nconst safe = true;\n```\n\n<script>alert(1)</script> [run](javascript:alert(1)) ![remote image](https://example.com/image.png)",
  }));
  assert.match(markup, /<strong[^>]*>First and Last Name<\/strong>/);
  assert.match(markup, /<strong[^>]*>Pay Basis<\/strong>/);
  assert.match(markup, /<ol/);
  assert.match(markup, /<ul/);
  assert.match(markup, /<code[^>]*>HOURLY<\/code>/);
  assert.match(markup, /<pre/);
  assert.match(markup, /<blockquote/);
  assert.match(markup, /href="https:\/\/example\.com\/guide"/);
  assert.doesNotMatch(markup, /\*\*First and Last Name\*\*/);
  assert.doesNotMatch(markup, /<script|javascript:|<img/i);
  assert.equal(safeAssistantUrl("javascript:alert(1)"), "");
  assert.equal(safeAssistantUrl("data:text/html,alert(1)"), "");
  assert.equal(safeAssistantUrl("https://example.com/guide"), "https://example.com/guide");
});

test("user and system assistant messages remain plain text", () => {
  const userMarkup = renderToStaticMarkup(React.createElement(AssistantMessageContent, { role: "user", text: "**do not render this**" }));
  const systemMarkup = renderToStaticMarkup(React.createElement(AssistantMessageContent, { role: "system", text: "<b>controlled text</b>" }));
  assert.match(userMarkup, /\*\*do not render this\*\*/);
  assert.doesNotMatch(userMarkup, /<strong/);
  assert.match(systemMarkup, /&lt;b&gt;controlled text&lt;\/b&gt;/);
  assert.doesNotMatch(systemMarkup, /<b>/);
});
