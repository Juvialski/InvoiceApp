import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function source(path: string): string {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
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
