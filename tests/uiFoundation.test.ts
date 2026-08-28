import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { engoryxTheme } from "../src/ui/engoryxTheme.ts";
import { engoryxIconRegistry } from "../src/ui/icons.ts";


test("Engoryx Astryx theme: defines identity tokens and semantic colors", () => {
  assert.equal(engoryxTheme.name, "engoryx");
  assert.ok(engoryxTheme.tokens, "Theme should define tokens");
  assert.ok(engoryxTheme.tokens["--color-accent"], "Accent token should be present");
  assert.ok(engoryxTheme.tokens["--color-background-body"], "Body background token should be present");
  assert.ok(engoryxTheme.tokens["--color-background-surface"], "Surface background token should be present");
  assert.ok(engoryxTheme.tokens["--color-success"], "Success color token should be present");
  assert.ok(engoryxTheme.tokens["--color-warning"], "Warning color token should be present");
  assert.ok(engoryxTheme.tokens["--color-error"], "Error color token should be present");
});

test("Engoryx Astryx theme: component overrides configure buttons, cards, and badges", () => {
  assert.ok(engoryxTheme.components, "Component overrides must be defined");
  assert.ok(engoryxTheme.components.button, "Button component override must exist");
  assert.ok(engoryxTheme.components.badge, "Badge component override must exist");
  assert.ok(engoryxTheme.components.card, "Card component override must exist");
  assert.ok(engoryxTheme.components.statusdot, "StatusDot component override must exist");
});

test("Engoryx Astryx icon registry: maps semantic slots to Lucide icons without version drift", () => {
  assert.ok(engoryxIconRegistry, "Icon registry must exist");
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
    const el = (engoryxIconRegistry as Record<string, unknown>)[slot];
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
    cssContent.includes('@import "./ui/engoryx.css"'),
    "src/index.css must import the generated Engoryx theme CSS"
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

test("Engoryx uses the CLI-built theme artifact in production paths", () => {
  const builtTheme = fs.readFileSync(path.resolve(process.cwd(), "src/ui/engoryx.js"), "utf-8");
  const provider = fs.readFileSync(path.resolve(process.cwd(), "src/ui/EngoryxThemeProvider.tsx"), "utf-8");
  assert.match(builtTheme, /__built:\s*true/);
  assert.match(provider, /from ["']\.\/engoryx["']/);
  assert.doesNotMatch(provider, /from ["']\.\/engoryxTheme["']/);
});

test("Application root owns the only Astryx theme provider and optional routes stay lazy", () => {
  const mainContent = fs.readFileSync(path.resolve(process.cwd(), "src/main.tsx"), "utf-8");
  assert.equal((mainContent.match(/EngoryxThemeProvider/g) || []).length, 4, "root provider should have one import, opening tag, closing tag, and import-path reference");
  assert.doesNotMatch(fs.readFileSync(path.resolve(process.cwd(), "src/App.tsx"), "utf-8"), /EngoryxThemeProvider/);

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

