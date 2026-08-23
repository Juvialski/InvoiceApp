export const DEFAULT_COUNTRY = "PH" as const;
export const DEFAULT_LOCALE = "en-PH" as const;
export const DEFAULT_CURRENCY = "PHP" as const;
export const DEFAULT_TIMEZONE = "Asia/Manila" as const;

export interface RegionalSettings {
  country: string;
  locale: string;
  currency: string;
  timezone: string;
}

export const DEFAULT_REGIONAL_SETTINGS: RegionalSettings = {
  country: DEFAULT_COUNTRY,
  locale: DEFAULT_LOCALE,
  currency: DEFAULT_CURRENCY,
  timezone: DEFAULT_TIMEZONE,
};

const SETTINGS_KEY = "invoiceapp_regional_settings";

const CURRENCY_SYMBOLS: Record<string, string> = {
  PHP: "₱",
  USD: "$",
  EUR: "€",
  SGD: "S$",
  JPY: "¥",
  GBP: "£",
  AUD: "A$",
  CAD: "C$",
  HKD: "HK$",
};

function browserStorage() {
  if (typeof window === "undefined") return undefined;
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

export function loadRegionalSettings(): RegionalSettings {
  const storage = browserStorage();
  if (!storage) return { ...DEFAULT_REGIONAL_SETTINGS };
  try {
    const saved = JSON.parse(storage.getItem(SETTINGS_KEY) || "null");
    if (!saved || typeof saved !== "object") return { ...DEFAULT_REGIONAL_SETTINGS };
    return {
      country: typeof saved.country === "string" && saved.country ? saved.country : DEFAULT_COUNTRY,
      locale: typeof saved.locale === "string" && saved.locale ? saved.locale : DEFAULT_LOCALE,
      currency: typeof saved.currency === "string" && saved.currency ? saved.currency.toUpperCase() : DEFAULT_CURRENCY,
      timezone: typeof saved.timezone === "string" && saved.timezone ? saved.timezone : DEFAULT_TIMEZONE,
    };
  } catch {
    return { ...DEFAULT_REGIONAL_SETTINGS };
  }
}

let activeSettings: RegionalSettings = loadRegionalSettings();

export function getRegionalSettings() {
  return activeSettings;
}

export function setRegionalSettings(settings: Partial<RegionalSettings>) {
  activeSettings = {
    ...activeSettings,
    ...settings,
    currency: (settings.currency || activeSettings.currency || DEFAULT_CURRENCY).toUpperCase(),
  };
  const storage = browserStorage();
  if (storage) {
    try { storage.setItem(SETTINGS_KEY, JSON.stringify(activeSettings)); } catch { /* local storage may be unavailable */ }
  }
  return activeSettings;
}

function currencyCode(currency?: string) {
  return (currency || activeSettings.currency || DEFAULT_CURRENCY).trim().toUpperCase();
}

function localeForCurrency(currency: string) {
  if (currency === "PHP") return activeSettings.locale || DEFAULT_LOCALE;
  if (currency === "USD") return "en-US";
  if (currency === "EUR") return "en-IE";
  if (currency === "SGD") return "en-SG";
  if (currency === "JPY") return "ja-JP";
  if (currency === "GBP") return "en-GB";
  return activeSettings.locale || DEFAULT_LOCALE;
}

export function currencySymbolFor(currency?: string) {
  const code = currencyCode(currency);
  if (CURRENCY_SYMBOLS[code]) return CURRENCY_SYMBOLS[code];
  try {
    const parts = new Intl.NumberFormat(localeForCurrency(code), { style: "currency", currency: code, currencyDisplay: "symbol" }).formatToParts(0);
    return parts.find((part) => part.type === "currency")?.value || code;
  } catch {
    return code;
  }
}

export function formatMoney(amount: number | null | undefined, currency?: string, locale?: string) {
  const code = currencyCode(currency);
  const resolvedLocale = locale || localeForCurrency(code);
  try {
    const formatter = new Intl.NumberFormat(resolvedLocale, {
      style: "currency",
      currency: code,
      currencyDisplay: "symbol",
      minimumFractionDigits: code === "JPY" ? 0 : 2,
      maximumFractionDigits: code === "JPY" ? 0 : 2,
    });
    return formatter.formatToParts(Number(amount) || 0)
      .map((part) => part.type === "currency" ? currencySymbolFor(code) : part.value)
      .join("");
  } catch {
    return `${currencySymbolFor(code)}${(Number(amount) || 0).toLocaleString(resolvedLocale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
}

function stableDate(value: string | Date) {
  if (value instanceof Date) return value;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return new Date(`${value}T12:00:00+08:00`);
  return new Date(value);
}

export function formatDate(value?: string | Date | null, style: "short" | "medium" | "long" = "medium") {
  if (!value) return "—";
  const date = stableDate(value);
  if (Number.isNaN(date.getTime())) return String(value);
  const options: Intl.DateTimeFormatOptions = style === "short"
    ? { year: "numeric", month: "2-digit", day: "2-digit", timeZone: activeSettings.timezone }
    : { year: "numeric", month: style === "long" ? "long" : "short", day: "numeric", timeZone: activeSettings.timezone };
  return new Intl.DateTimeFormat(activeSettings.locale || DEFAULT_LOCALE, options).format(date);
}

export function formatDateTime(value?: string | Date | null) {
  if (!value) return "—";
  const date = stableDate(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat(activeSettings.locale || DEFAULT_LOCALE, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: activeSettings.timezone,
  }).format(date);
}
