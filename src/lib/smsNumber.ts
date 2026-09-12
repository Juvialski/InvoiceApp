export const SMS_MAX_MESSAGE_LENGTH = 1600;

export class PhilippineMobileNumberError extends Error {
  constructor(message = "Enter a valid Philippine mobile number.") {
    super(message);
    this.name = "PhilippineMobileNumberError";
  }
}

/**
 * Convert the supported Philippine mobile input forms to one E.164 value.
 * Punctuation is accepted only as presentation formatting; letters, extra
 * country prefixes, landlines, and non-Philippine destinations fail closed.
 */
export function normalizePhilippineMobileNumber(value: unknown): string {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) throw new PhilippineMobileNumberError("A Philippine mobile recipient is required.");

  const compact = raw.replace(/[\s()-]/g, "");
  if (!/^\+?\d+$/.test(compact)) {
    throw new PhilippineMobileNumberError("The recipient must contain only a Philippine mobile number.");
  }

  const digits = compact.startsWith("+") ? compact.slice(1) : compact;
  if (/^09\d{9}$/.test(digits)) return `+63${digits.slice(1)}`;
  if (/^639\d{9}$/.test(digits)) return `+${digits}`;
  throw new PhilippineMobileNumberError("Only Philippine mobile numbers in 09…, 639…, or +639… format are supported.");
}

export function isPhilippineMobileNumber(value: unknown): value is string {
  try {
    normalizePhilippineMobileNumber(value);
    return true;
  } catch {
    return false;
  }
}
