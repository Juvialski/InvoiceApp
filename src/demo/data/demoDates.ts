const DAY_MS = 86_400_000;

export function isoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function parseIsoDate(value: string): Date {
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) throw new Error(`Invalid demo anchor date: ${value}`);
  return parsed;
}

export function addDemoDays(value: string, days: number): string {
  return isoDate(new Date(parseIsoDate(value).getTime() + days * DAY_MS));
}

export function defaultDemoAnchorDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${byType.year}-${byType.month}-${byType.day}`;
}

export function startOfDemoWeek(anchorDate: string): string {
  const date = parseIsoDate(anchorDate);
  const weekday = date.getUTCDay();
  return addDemoDays(anchorDate, -weekday);
}

export function endOfDemoWeek(anchorDate: string): string {
  return addDemoDays(startOfDemoWeek(anchorDate), 6);
}

export function demoTimestamp(date: string, hour = 8, minute = 0): string {
  return `${date}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00+08:00`;
}
