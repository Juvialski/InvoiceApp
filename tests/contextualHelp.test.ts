import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function source(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

test("ContextualHelp exposes keyboard, touch, focus, and bounded popover behavior", () => {
  const primitive = source("src/components/ui/ContextualHelp.tsx");
  assert.match(primitive, /<button/);
  assert.match(primitive, /aria-expanded=\{open\}/);
  assert.match(primitive, /aria-controls=\{contentId\}/);
  assert.match(primitive, /role="dialog"/);
  assert.match(primitive, /useId\(\)/);
  assert.match(primitive, /event\.key !== "Escape"/);
  assert.match(primitive, /pointerdown/);
  assert.match(primitive, /triggerRef\.current\?\.focus\(\)/);
  assert.match(primitive, /max-h-\[min\(70vh/);
  assert.match(primitive, /calc\(100vw/);
  assert.match(primitive, /helpTopicPath\(/);
});

test("ContextualHelp is used in three safe secondary-explanation exemplars", () => {
  const email = source("src/components/EmailComposePanel.tsx");
  const documents = source("src/app/routes/DocumentsRoute.tsx");
  const settings = source("src/components/Settings.tsx");
  for (const content of [email, documents, settings]) assert.match(content, /ContextualHelp/);
  assert.match(email, /Only issued Purchase Orders and issued Client Invoices can use/);
  assert.match(documents, /Source \/ Received/);
  assert.match(settings, /presentation only/);
});
