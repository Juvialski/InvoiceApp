import type { AssistantClientAction, AssistantReference } from "../../assistant/assistantTypes.ts";
import type { ToolExecutionResult } from "./assistantBackendTypes.ts";

export const MAX_TOOL_RESULT_BYTES = 18_000;
export const MAX_TOOL_RESULT_ITEMS = 60;
export const MAX_TOOL_STRING_LENGTH = 4_000;

function safeString(value: string) {
  return value.length > MAX_TOOL_STRING_LENGTH ? `${value.slice(0, MAX_TOOL_STRING_LENGTH)}…` : value;
}

function safeValue(value: unknown, depth = 0): unknown {
  if (depth > 5) return "[depth limit]";
  if (typeof value === "string") return safeString(value);
  if (typeof value === "number" || typeof value === "boolean" || value === null) return value;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.slice(0, MAX_TOOL_RESULT_ITEMS).map((item) => safeValue(item, depth + 1));
  if (value && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(value).slice(0, MAX_TOOL_RESULT_ITEMS)) {
      if (key === "__proto__" || key === "prototype" || key === "constructor") continue;
      result[key] = safeValue((value as Record<string, unknown>)[key], depth + 1);
    }
    return result;
  }
  return String(value);
}

export function boundToolValue<T>(value: T): T {
  const bounded = safeValue(value) as T;
  try {
    if (JSON.stringify(bounded).length <= MAX_TOOL_RESULT_BYTES) return bounded;
    if (Array.isArray(bounded)) {
      const compact = bounded.slice(0, 12);
      while (compact.length && JSON.stringify(compact).length > MAX_TOOL_RESULT_BYTES) compact.pop();
      return compact as T;
    }
    if (bounded && typeof bounded === "object") {
      const compact: Record<string, unknown> = {};
      for (const [key, item] of Object.entries(bounded as Record<string, unknown>)) {
        compact[key] = item;
        if (JSON.stringify(compact).length > MAX_TOOL_RESULT_BYTES) {
          delete compact[key];
          break;
        }
      }
      return compact as T;
    }
  } catch {
    return { error: { code: "RESULT_SERIALIZATION_FAILED", message: "The tool returned data that could not be serialized." } } as T;
  }
  return bounded;
}

export function boundToolResult(result: ToolExecutionResult): ToolExecutionResult {
  return {
    ...result,
    output: boundToolValue(result.output),
    references: boundToolValue((result.references || []).slice(0, MAX_TOOL_RESULT_ITEMS)) as AssistantReference[],
    clientActions: boundToolValue((result.clientActions || []).slice(0, MAX_TOOL_RESULT_ITEMS)) as AssistantClientAction[],
    preparedAction: result.preparedAction ? boundToolValue(result.preparedAction) : undefined,
  };
}

export function toolError(code: string, message: string): ToolExecutionResult {
  return {
    error: { code, message },
    output: { ok: false, error: { code, message } },
  };
}

export function toolOk(output: Record<string, unknown>, extras: Omit<ToolExecutionResult, "output"> = {}): ToolExecutionResult {
  return boundToolResult({ output: { ok: true, ...output }, ...extras });
}
