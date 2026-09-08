import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const server = readFileSync(new URL("../server.ts", import.meta.url), "utf8");
const assistant = readFileSync(new URL("../src/server/assistant/assistantHandler.ts", import.meta.url), "utf8");

function between(source: string, start: string, end: string) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.ok(startIndex >= 0, `missing start marker: ${start}`);
  assert.ok(endIndex > startIndex, `missing end marker: ${end}`);
  return source.slice(startIndex, endIndex);
}

test("provider budget claims follow company AI preflight for every production endpoint", () => {
  for (const [start, end] of [
    ['app.post("/api/classify-email"', 'app.post("/api/classify-email-batch"'],
    ['app.post("/api/classify-email-batch"', 'function compactParty'],
    ['app.post("/api/extract-invoice"', 'const expenseSchema'],
    ['app.post("/api/extract-expense"', 'function getGoogleAccessToken'],
  ] as const) {
    const route = between(server, start, end);
    assert.ok(route.indexOf("resolveCompanyAiRuntime") < route.indexOf("claimAiRequest"), `${start} must preflight before claiming budget`);
  }
  const handler = between(assistant, "async function handleAssistantRequest", "async function loadActionEvent");
  assert.ok(handler.indexOf("resolveCompanyAiRuntime") < handler.indexOf("claimAiRequest"), "Assistant must preflight before claiming budget");
});

test("budget release remains limited to active reservation cleanup", () => {
  const budget = readFileSync(new URL("../src/server/ai/aiRequestBudget.ts", import.meta.url), "utf8");
  assert.match(budget, /release_company_ai_request/);
  assert.doesNotMatch(budget, /request_count\s*=/i);
});
