import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { hydroqualisenseTheme } from "../src/ui/hydroqualisenseTheme.ts";
import { hydroqualisenseIconRegistry } from "../src/ui/icons.ts";


test("Hydroqualisense Astryx theme: defines identity tokens and semantic colors", () => {
  assert.equal(hydroqualisenseTheme.name, "hydroqualisense");
  assert.ok(hydroqualisenseTheme.tokens, "Theme should define tokens");
  assert.ok(hydroqualisenseTheme.tokens["--color-accent"], "Accent token should be present");
  assert.ok(hydroqualisenseTheme.tokens["--color-background-body"], "Body background token should be present");
  assert.ok(hydroqualisenseTheme.tokens["--color-background-surface"], "Surface background token should be present");
  assert.ok(hydroqualisenseTheme.tokens["--color-success"], "Success color token should be present");
  assert.ok(hydroqualisenseTheme.tokens["--color-warning"], "Warning color token should be present");
  assert.ok(hydroqualisenseTheme.tokens["--color-error"], "Error color token should be present");
});

test("Hydroqualisense Astryx theme: component overrides configure buttons, cards, and badges", () => {
  assert.ok(hydroqualisenseTheme.components, "Component overrides must be defined");
  assert.ok(hydroqualisenseTheme.components.button, "Button component override must exist");
  assert.ok(hydroqualisenseTheme.components.badge, "Badge component override must exist");
  assert.ok(hydroqualisenseTheme.components.card, "Card component override must exist");
  assert.ok(hydroqualisenseTheme.components.statusdot, "StatusDot component override must exist");
});

test("Hydroqualisense Astryx icon registry: maps semantic slots to Lucide icons without version drift", () => {
  assert.ok(hydroqualisenseIconRegistry, "Icon registry must exist");
  const requiredSlots = [
    "close",
    "chevronDown",
    "chevronRight",
    "chevronLeft",
    "check",
    "success",
    "warning",
    "error",
    "info",
    "search",
    "calendar",
    "clock",
    "menu",
  ];
  for (const slot of requiredSlots) {
    const el = (hydroqualisenseIconRegistry as Record<string, unknown>)[slot];
    assert.ok(el && typeof el === "object", `Icon slot '${slot}' should be a React element`);
  }
});


test("CSS Cascade: index.css imports @astryxdesign/core/astryx.css safely", () => {
  const cssPath = path.resolve(process.cwd(), "src/index.css");
  const cssContent = fs.readFileSync(cssPath, "utf-8");
  assert.ok(
    cssContent.includes('@import "@astryxdesign/core/astryx.css"'),
    "src/index.css must import astryx.css"
  );
  assert.ok(
    cssContent.includes('@import "tailwindcss"'),
    "src/index.css must retain tailwindcss import"
  );
  assert.ok(
    cssContent.includes('@import "./ui/hydroqualisense.css"'),
    "src/index.css must import the generated Hydroqualisense theme CSS"
  );
});

test("Architecture invariant: BlueprintViewer remains strictly lazy-loaded and not in core UI bundle", () => {
  const uiIndexPath = path.resolve(process.cwd(), "src/ui/index.ts");
  const uiIndexContent = fs.readFileSync(uiIndexPath, "utf-8");
  assert.ok(
    !uiIndexContent.includes("BlueprintViewer"),
    "src/ui/index.ts must never export or import BlueprintViewer"
  );
  assert.ok(
    !uiIndexContent.includes("konva"),
    "src/ui/index.ts must never import konva"
  );
  assert.ok(
    !uiIndexContent.includes("pdfjs"),
    "src/ui/index.ts must never import pdfjs"
  );
});

test("Astryx dependency placement keeps CLI tooling out of runtime dependencies", () => {
  const packageJson = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), "package.json"), "utf-8")) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  assert.equal(packageJson.dependencies?.["@astryxdesign/cli"], undefined);
  assert.equal(packageJson.devDependencies?.["@astryxdesign/cli"], "^0.5.0");
  assert.equal(packageJson.dependencies?.["@astryxdesign/core"], "^0.5.0");
});

test("Hydroqualisense uses the CLI-built theme artifact in production paths", () => {
  const builtTheme = fs.readFileSync(path.resolve(process.cwd(), "src/ui/hydroqualisense.js"), "utf-8");
  const provider = fs.readFileSync(path.resolve(process.cwd(), "src/ui/HydroqualisenseThemeProvider.tsx"), "utf-8");
  assert.match(builtTheme, /__built:\s*true/);
  assert.match(provider, /from ["']\.\/hydroqualisense["']/);
  assert.doesNotMatch(provider, /from ["']\.\/hydroqualisenseTheme["']/);
});

test("Application root owns the only Astryx theme provider and optional routes stay lazy", () => {
  const mainContent = fs.readFileSync(path.resolve(process.cwd(), "src/main.tsx"), "utf-8");
  assert.equal((mainContent.match(/HydroqualisenseThemeProvider/g) || []).length, 4, "root provider should have one import, opening tag, closing tag, and import-path reference");
  assert.doesNotMatch(fs.readFileSync(path.resolve(process.cwd(), "src/App.tsx"), "utf-8"), /HydroqualisenseThemeProvider/);

  const routerContent = fs.readFileSync(path.resolve(process.cwd(), "src/app/routes/AppRouter.tsx"), "utf-8");
  for (const route of ["CashBankingRoute", "InvoicesRoute", "PayrollRoute", "ExpensesRoute", "ReportsRoute", "SettingsRoute"]) {
    assert.match(routerContent, new RegExp(`const ${route} = lazy\\(\\(\\) => import\\(\\"\\./${route}\\"\\)\\)`));
  }
  assert.doesNotMatch(routerContent, /PlatformCompaniesRoute|platformCompaniesProps/);
  assert.match(routerContent, /const ProjectsRoute = lazy\(\(\) => import\("\.\/ProjectsRoute"\)\.then\(\(\{ ProjectsRoute \}\) => \(\{ default: ProjectsRoute \}\)\)\)/);
});

test("User-triggered spreadsheet code is isolated from the core entry path", () => {
  const appContent = fs.readFileSync(path.resolve(process.cwd(), "src/App.tsx"), "utf-8");
  assert.doesNotMatch(appContent, /import\s+\{[^}]*exportBatchInvoicesToExcel/);
  assert.doesNotMatch(appContent, /import\s+\{[^}]*buildDraftPayrollFromImport/);

  const cashCoreContent = fs.readFileSync(path.resolve(process.cwd(), "src/lib/cashBanking.ts"), "utf-8");
  const cashImportContent = fs.readFileSync(path.resolve(process.cwd(), "src/lib/cashBankingImport.ts"), "utf-8");
  assert.doesNotMatch(cashCoreContent, /from ["']xlsx["']/);
  assert.match(cashImportContent, /from ["']xlsx["']/);
});

