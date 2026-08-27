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

