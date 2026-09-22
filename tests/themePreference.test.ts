import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  THEME_PREFERENCE_STORAGE_KEY,
  applyThemePreference,
  normalizeThemePreference,
  readThemePreference,
  writeThemePreference,
} from "../src/ui/themePreference.ts";

function memoryStorage(initial: Record<string, string>): Storage {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
    removeItem: (key) => { values.delete(key); },
    clear: () => { values.clear(); },
    key: (index) => [...values.keys()][index] ?? null,
    get length() { return values.size; },
  };
}

function rootSpy(): Pick<HTMLElement, "setAttribute" | "removeAttribute"> & { theme?: string } {
  return {
    theme: undefined,
    setAttribute(name, value) {
      if (name === "data-theme") this.theme = value;
    },
    removeAttribute(name) {
      if (name === "data-theme") this.theme = undefined;
    },
  };
}

test("theme preference normalization allows only System, Light, and Dark", () => {
  assert.equal(normalizeThemePreference("system"), "system");
  assert.equal(normalizeThemePreference("light"), "light");
  assert.equal(normalizeThemePreference("dark"), "dark");
  assert.equal(normalizeThemePreference("unexpected"), "system");
  assert.equal(normalizeThemePreference(null), "system");
});

test("theme preference storage defaults safely and persists the selected value", () => {
  const storage = memoryStorage({});
  assert.equal(readThemePreference(storage), "system");
  assert.equal(readThemePreference(memoryStorage({ [THEME_PREFERENCE_STORAGE_KEY]: "dark" })), "dark");

  writeThemePreference("light", storage);
  assert.equal(storage.getItem(THEME_PREFERENCE_STORAGE_KEY), "light");
  assert.equal(readThemePreference(storage), "light");
  writeThemePreference("system", storage);
  assert.equal(storage.getItem(THEME_PREFERENCE_STORAGE_KEY), "system");
});

test("theme preference applies explicit HTML state and clears it for System", () => {
  const root = rootSpy();
  applyThemePreference("light", root);
  assert.equal(root.theme, "light");
  applyThemePreference("dark", root);
  assert.equal(root.theme, "dark");
  applyThemePreference("system", root);
  assert.equal(root.theme, undefined);
});

test("entry HTML bootstraps the stored preference before the React module", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  assert.match(html, /hydroqualisense_theme_preference/);
  assert.match(html, /data-theme/);
  assert.ok(html.indexOf("hydroqualisense_theme_preference") < html.indexOf('/src/main.tsx'));
});
