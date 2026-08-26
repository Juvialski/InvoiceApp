/**
 * Convert provider/database/unknown failures into short user-facing text.
 * Error objects from PostgREST may contain details that are useful to a
 * developer but are not safe to expose in a browser notification.
 */
export function safeErrorMessage(error: unknown, fallback = "Something went wrong. Please try again."): string {
  const candidate = error instanceof Error
    ? error.message
    : error && typeof error === "object"
      ? ["message", "details", "hint"].map((key) => (error as Record<string, unknown>)[key]).find((value): value is string => typeof value === "string" && value.trim().length > 0)
      : typeof error === "string" ? error : undefined;
  const message = typeof candidate === "string" ? candidate.trim() : "";
  if (!message || message === "[object Object]") return fallback;
  if (/password|secret|token|service[_ -]?role|api[_ -]?key|authorization|bearer|ciphertext|stack trace|sqlstate|\bselect\b|\binsert\s+into\b|\bupdate\s+.+\bset\b|\bdelete\s+from\b/i.test(message)) return fallback;
  return message;
}

export function safeErrorWithContext(prefix: string, error: unknown, fallback: string): string {
  return `${prefix}: ${safeErrorMessage(error, fallback)}`;
}
