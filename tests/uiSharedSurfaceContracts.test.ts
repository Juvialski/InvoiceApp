import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { hydroqualisenseTheme } from "../src/ui/hydroqualisenseTheme.ts";

function source(path: string): string {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function pairedHexToken(token: string, modeIndex: 0 | 1): string {
  const tokens = hydroqualisenseTheme.tokens as unknown as Record<string, unknown>;
  const value = String(tokens[token] || "");
  const match = /^light-dark\((#[0-9a-f]{6}),\s*(#[0-9a-f]{6})\)$/i.exec(value);
  assert.ok(match, `${token} should have paired Light and Dark colors`);
  return match[modeIndex + 1]!;
}

function contrastRatio(foreground: string, background: string): number {
  const luminance = (color: string) => {
    const channels = [1, 3, 5].map((index) => parseInt(color.slice(index, index + 2), 16) / 255)
      .map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
    return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
  };
  const a = luminance(foreground);
  const b = luminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

test("shared visual foundation defines semantic Astryx-backed surface classes", () => {
  const css = source("src/index.css");
  assert.doesNotMatch(css, /color-scheme:\s*light;/);
  for (const className of [
    "hqs-app-canvas",
    "hqs-surface",
    "hqs-surface-raised",
    "hqs-surface-muted",
    "hqs-popover",
    "hqs-control",
    "hqs-primary-text",
    "hqs-secondary-text",
    "hqs-border",
    "hqs-focus-ring",
    "hqs-search-control",
    "hqs-muted-fill",
    "hqs-success-text",
    "hqs-warning-text",
    "hqs-danger-text",
  ]) {
    assert.match(css, new RegExp(`\\.${className}\\b`), className);
  }
  assert.match(css, /var\(--color-background-body/);
  assert.match(css, /var\(--color-background-surface/);
  assert.match(css, /var\(--color-text-primary/);
  assert.match(css, /\.hqs-success-text\s*\{\s*color:\s*var\(--color-text-green/);
  assert.match(css, /\.hqs-warning-text\s*\{\s*color:\s*var\(--color-text-yellow/);
  assert.match(css, /\.hqs-danger-text\s*\{\s*color:\s*var\(--color-text-red/);
  assert.match(css, /\.hqs-attention-warning\s*\{[^}]*color:\s*var\(--color-text-yellow/);
  assert.match(css, /\.hqs-attention-danger\s*\{[^}]*color:\s*var\(--color-text-red/);
});

test("R4 semantic foreground tokens meet AA contrast on paired primary and muted surfaces", () => {
  const foregroundTokens = [
    "--color-text-primary",
    "--color-text-secondary",
    "--color-text-accent",
    "--color-text-green",
    "--color-text-yellow",
    "--color-text-red",
  ];
  const backgroundTokens = ["--color-background-surface", "--color-background-muted"];

  for (const modeIndex of [0, 1] as const) {
    for (const foregroundToken of foregroundTokens) {
      for (const backgroundToken of backgroundTokens) {
        const ratio = contrastRatio(pairedHexToken(foregroundToken, modeIndex), pairedHexToken(backgroundToken, modeIndex));
        assert.ok(ratio >= 4.5, `${foregroundToken} on ${backgroundToken} in ${modeIndex === 0 ? "Light" : "Dark"} is ${ratio.toFixed(2)}:1`);
      }
    }
  }
});

test("shared roots and Settings expose the R4B theme/control architecture", () => {
  const shell = source("src/app/AppShell.tsx");
  const provider = source("src/ui/HydroqualisenseThemeProvider.tsx");
  const settings = source("src/components/Settings.tsx");
  const operationsGrid = source("src/components/ui/OperationsGrid.tsx");
  const worksheet = source("src/components/ui/WorksheetEditor.tsx");
  const contextualHelp = source("src/components/ui/ContextualHelp.tsx");
  const operationsUi = source("src/components/ui/OperationsUI.tsx");
  const projects = source("src/components/projects/ProjectPortfolioRegisterSection.tsx");

  assert.match(shell, /hqs-app-canvas/);
  assert.match(provider, /export function useThemePreference/);
  assert.match(settings, /ThemePreferenceSettings/);
  for (const label of ["System", "Light", "Dark"]) assert.match(source("src/components/ui/ThemePreferenceSettings.tsx"), new RegExp(label));
  assert.doesNotMatch(operationsGrid, /rounded-xl border border-slate-200 bg-white/);
  assert.doesNotMatch(worksheet, /data-worksheet-editor="true"[^>]*bg-white/);
  assert.doesNotMatch(contextualHelp, /rounded-xl border border-slate-200 bg-white/);
  assert.match(operationsUi, /export function ActionButton/);
  assert.match(operationsUi, /variant\?: ButtonVariant/);
  assert.match(operationsUi, /hqs-search-control/);
  assert.doesNotMatch(settings, /text-slate-(?:500|600|900)|border-slate-(?:100|200)|bg-white/);
  assert.doesNotMatch(operationsUi, /bg-slate-200|text-slate-700|text-rose-900/);
  assert.doesNotMatch(projects, /bg-white|text-slate-(?:400|500|600|700|800|900|950)/);
});

test("shared UI owns compact action bar and advanced disclosure primitives", () => {
  const operationsUi = source("src/components/ui/OperationsUI.tsx");
  assert.match(operationsUi, /export function AdvancedFilterDisclosure/);
  assert.match(operationsUi, /export function CompactActionBar/);
  assert.match(operationsUi, /export interface FilterChip/);
});
