export type ThemePreference = "system" | "light" | "dark";

export const THEME_PREFERENCE_STORAGE_KEY = "hydroqualisense_theme_preference";

type ReadableStorage = Pick<Storage, "getItem">;
type WritableStorage = Pick<Storage, "setItem">;
type ThemeRoot = Pick<HTMLElement, "setAttribute" | "removeAttribute">;

function browserStorage(): Storage | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

export function normalizeThemePreference(value: unknown): ThemePreference {
  return value === "light" || value === "dark" || value === "system" ? value : "system";
}

export function readThemePreference(storage: ReadableStorage | undefined = browserStorage()): ThemePreference {
  try {
    return normalizeThemePreference(storage?.getItem(THEME_PREFERENCE_STORAGE_KEY));
  } catch {
    return "system";
  }
}

export function writeThemePreference(
  preference: ThemePreference,
  storage: WritableStorage | undefined = browserStorage(),
): void {
  try {
    storage?.setItem(THEME_PREFERENCE_STORAGE_KEY, normalizeThemePreference(preference));
  } catch {
    // Browser presentation preferences are best effort when storage is blocked.
  }
}

export function applyThemePreference(
  preference: ThemePreference,
  root: ThemeRoot | undefined = typeof document === "undefined" ? undefined : document.documentElement,
): void {
  if (!root) return;
  const normalized = normalizeThemePreference(preference);
  if (normalized === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", normalized);
}
