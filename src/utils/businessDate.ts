const DEFAULT_BUSINESS_TIME_ZONE = "Asia/Manila";

export function businessDateForTimeZone(now: Date = new Date(), timeZone = DEFAULT_BUSINESS_TIME_ZONE) {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timeZone || DEFAULT_BUSINESS_TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(now);
    const values = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
    if (values.year && values.month && values.day) return `${values.year}-${values.month}-${values.day}`;
  } catch {
    // A malformed company timezone must not make a financial read disappear.
  }
  return now.toISOString().slice(0, 10);
}

export function isDateOnly(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
}

export function isPastDueDate(remainingAmount: number, dueDate: unknown, businessDate = businessDateForTimeZone()) {
  return remainingAmount > 0.005 && isDateOnly(dueDate) && isDateOnly(businessDate) && dueDate < businessDate;
}
