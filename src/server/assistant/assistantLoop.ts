import type { AssistantClientAction, AssistantPreparedAction, AssistantReference } from "../../assistant/assistantTypes.ts";
import { createAssistantModelRunner, type AssistantModelClient, type AssistantModelRunner } from "./assistantModels.ts";
import type { AssistantToolContext } from "./assistantBackendTypes.ts";
import { executeAssistantTool, assistantFunctionDeclarations } from "./toolRegistry.ts";
import { boundToolValue, toolError } from "./toolResults.ts";

export const ASSISTANT_MAX_ITERATIONS = 8;
export const ASSISTANT_MAX_FUNCTION_CALLS = 24;
export const ASSISTANT_MAX_FUNCTION_CALLS_PER_ITERATION = 4;
export const ASSISTANT_MAX_FUNCTION_CALLS_IN_MODEL_RESPONSE = 8;
export const ASSISTANT_MAX_FINAL_MESSAGE_CHARS = 4_000;

export interface AssistantLoopInput {
  modelClient?: AssistantModelClient;
  modelRunner?: AssistantModelRunner;
  systemInstruction: string;
  contents: unknown[];
  toolContext: AssistantToolContext;
}

export interface AssistantLoopResult {
  message: string;
  references: AssistantReference[];
  clientActions: AssistantClientAction[];
  preparedActions: AssistantPreparedAction[];
  usage: {
    model?: string;
    fallbackUsed: boolean;
    iterations: number;
    functionCalls: number;
  };
}

interface NormalizedFunctionCall {
  name: string;
  id: string;
  args: unknown;
  thoughtSignature?: string;
}

interface RawFunctionCallPart {
  call: unknown;
  thoughtSignature?: string;
}

function responseFunctionCalls(response: unknown): RawFunctionCallPart[] {
  const candidate = response as { functionCalls?: unknown; candidates?: Array<{ content?: { parts?: unknown[] } }> };
  const parts = candidate?.candidates?.[0]?.content?.parts;
  if (Array.isArray(parts)) {
    const calls = parts.flatMap((part) => {
      if (!part || typeof part !== "object") return [];
      const source = part as Record<string, unknown>;
      const call = source.functionCall;
      if (!call || typeof call !== "object") return [];
      // Gemini 3 validates this opaque value positionally. Preserve it byte
      // for byte as returned; trimming or normalizing it breaks the next turn.
      const thoughtSignature = typeof source.thoughtSignature === "string" && source.thoughtSignature.length > 0 ? source.thoughtSignature : undefined;
      return [{ call, ...(thoughtSignature ? { thoughtSignature } : {}) }];
    });
    if (calls.length) return calls;
  }
  if (Array.isArray(candidate?.functionCalls)) return candidate.functionCalls.map((call) => ({ call }));
  return [];
}

function normalizeFunctionCall(value: RawFunctionCallPart, iteration: number, index: number): NormalizedFunctionCall {
  const call = value.call && typeof value.call === "object" && !Array.isArray(value.call) ? value.call as Record<string, unknown> : {};
  const name = typeof call.name === "string" ? call.name : "";
  const id = typeof call.id === "string" && call.id.length > 0 ? call.id : `assistant-${iteration}-${index}`;
  const args = call.args === undefined ? {} : call.args;
  return { name, id, args, ...(value.thoughtSignature ? { thoughtSignature: value.thoughtSignature } : {}) };
}

function modelFunctionCallContent(calls: NormalizedFunctionCall[]) {
  return {
    role: "model",
    parts: calls.map((call) => ({
      ...(call.thoughtSignature ? { thoughtSignature: call.thoughtSignature } : {}),
      functionCall: { name: call.name || "unknown_tool", id: call.id, args: call.args && typeof call.args === "object" && !Array.isArray(call.args) ? call.args : {} },
    })),
  };
}

function functionResponseContent(calls: NormalizedFunctionCall[], results: Array<ReturnType<typeof toolError>>) {
  return {
    role: "user",
    parts: calls.map((call, index) => ({ functionResponse: { name: call.name || "unknown_tool", id: call.id, response: boundToolValue(results[index]?.error ? { error: results[index].error } : { output: results[index]?.output || {} }) } })),
  };
}

function finalMessage(response: unknown) {
  const value = response && typeof response === "object" && typeof (response as { text?: unknown }).text === "string" ? String((response as { text: string }).text).trim() : "";
  if (!value) return "I could not complete that request with the available workspace tools.";
  return value.length > ASSISTANT_MAX_FINAL_MESSAGE_CHARS ? `${value.slice(0, ASSISTANT_MAX_FINAL_MESSAGE_CHARS)}…` : value;
}

export async function runAssistantLoop(input: AssistantLoopInput): Promise<AssistantLoopResult> {
  const runner = input.modelRunner || createAssistantModelRunner(input.modelClient!);
  const contents = [...input.contents];
  const references: AssistantReference[] = [];
  const clientActions: AssistantClientAction[] = [];
  const preparedActions: AssistantPreparedAction[] = [];
  let iterations = 0;
  let functionCalls = 0;
  let model: string | undefined;
  const toolDeclarations = assistantFunctionDeclarations();

  while (iterations < ASSISTANT_MAX_ITERATIONS) {
    iterations += 1;
    const result = await runner.generate({
      contents: contents as any,
      config: {
        systemInstruction: input.systemInstruction,
        tools: [{ functionDeclarations: toolDeclarations }],
        maxOutputTokens: 900,
      },
    });
    model = result.model;
    const rawCalls = responseFunctionCalls(result.response);
    if (!rawCalls.length) {
      return { message: finalMessage(result.response), references: references.slice(0, 60), clientActions: clientActions.slice(0, 20), preparedActions: preparedActions.slice(0, 20), usage: { model, fallbackUsed: runner.fallbackUsed, iterations, functionCalls } };
    }
    const allCalls = rawCalls.slice(0, ASSISTANT_MAX_FUNCTION_CALLS_IN_MODEL_RESPONSE).map((call, index) => normalizeFunctionCall(call, iterations, index));
    const calls = allCalls.slice(0, ASSISTANT_MAX_FUNCTION_CALLS_PER_ITERATION);
    // Gemini requires one function response with the same name and id for
    // every function call in the model content, including calls we decline
    // because the per-turn batch bound was reached.
    contents.push(modelFunctionCallContent(allCalls));
    const results: Array<ReturnType<typeof toolError>> = [];
    for (const [index, call] of allCalls.entries()) {
      if (index >= ASSISTANT_MAX_FUNCTION_CALLS_PER_ITERATION) {
        results.push(toolError("TOOL_BATCH_LIMIT", "Only a bounded number of tools can run in one assistant turn."));
        continue;
      }
      if (functionCalls >= ASSISTANT_MAX_FUNCTION_CALLS) {
        results.push(toolError("TOOL_CALL_LIMIT", "The assistant reached its safe tool-call limit. Summarize the available results."));
        continue;
      }
      functionCalls += 1;
      const toolResult = call.name ? await executeAssistantTool(call.name, call.args, input.toolContext) : toolError("MALFORMED_TOOL_CALL", "The model returned a function call without a tool name.");
      results.push(toolResult);
      references.push(...(toolResult.references || []));
      clientActions.push(...(toolResult.clientActions || []));
      if (toolResult.preparedAction) preparedActions.push(toolResult.preparedAction);
    }
    contents.push(functionResponseContent(allCalls, results));
    if (functionCalls >= ASSISTANT_MAX_FUNCTION_CALLS && iterations < ASSISTANT_MAX_ITERATIONS) {
      return { message: "I reached the safe limit for workspace lookups. Please narrow the request and try again.", references: references.slice(0, 60), clientActions: clientActions.slice(0, 20), preparedActions: preparedActions.slice(0, 20), usage: { model, fallbackUsed: runner.fallbackUsed, iterations, functionCalls } };
    }
  }

  return { message: "I could not complete that request within the safe assistant limit. Please narrow the request.", references: references.slice(0, 60), clientActions: clientActions.slice(0, 20), preparedActions: preparedActions.slice(0, 20), usage: { model, fallbackUsed: runner.fallbackUsed, iterations, functionCalls } };
}
