/** Provider-neutral email identity helpers used by source/entity resolution. */
export const DISALLOWED_DOMAIN_RULES = new Set([
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "yahoo.com.ph",
  "hotmail.com",
  "outlook.com",
  "live.com",
  "icloud.com",
  "aol.com",
  "proton.me",
  "protonmail.com",
  "mail.com",
  "me.com",
  "msn.com",
  "com",
  "net",
  "org",
  "ph",
  "com.ph",
]);

export function normalizeEmail(email?: string | null): string {
  return String(email || "").trim().toLowerCase();
}

export function normalizeDomain(domain?: string | null): string {
  return String(domain || "")
    .trim()
    .toLowerCase()
    .replace(/^[a-z]+:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/^@+/, "")
    .replace(/^\*?@?/, "")
    .replace(/^\.+/, "");
}

export function extractEmailDomain(email: string): string {
  const clean = normalizeEmail(email);
  const at = clean.lastIndexOf("@");
  return at >= 0 ? clean.slice(at + 1) : "";
}

export function parseSenderAddress(sender: string): { name: string; email: string; domain: string } {
  const trimmed = String(sender || "").trim();
  const angleMatch = trimmed.match(/^(?:"?([^"<@]+)"?\s*)?<([^>]+)>$/);
  if (angleMatch) {
    const name = (angleMatch[1] || "").trim();
    const email = normalizeEmail(angleMatch[2]);
    return { name, email, domain: extractEmailDomain(email) };
  }
  const emailMatch = trimmed.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
  if (emailMatch) {
    const email = normalizeEmail(emailMatch[1]);
    const name = trimmed.replace(emailMatch[1], "").replace(/[<>()"]/g, "").trim();
    return { name, email, domain: extractEmailDomain(email) };
  }
  return { name: trimmed, email: "", domain: "" };
}
