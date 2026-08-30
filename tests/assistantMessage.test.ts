import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("user Assistant messages explicitly use the semantic on-dark foreground", () => {
  const source = readFileSync(new URL("../src/assistant/AssistantMessage.tsx", import.meta.url), "utf8");
  assert.match(source, /ASSISTANT_USER_MESSAGE_TEXT_CLASS = "whitespace-pre-wrap break-words text-\[color:var\(--color-on-dark\)\]"/);
  assert.match(source, /className=\{isUser \? ASSISTANT_USER_MESSAGE_TEXT_CLASS/);
  assert.match(source, /isUser \? "text-amber-200"/);
  assert.match(source, /isUser \? "border-white\/20"/);
  assert.match(readFileSync(new URL("../src/assistant/AssistantMarkdown.ts", import.meta.url), "utf8"), /my-2 text-slate-700/);
});

test("prepared action cards do not render UUID or internal preview fields", () => {
  const source = readFileSync(new URL("../src/assistant/AssistantActionCard.tsx", import.meta.url), "utf8");
  assert.match(source, /identified record/);
  assert.match(source, /HIDDEN_PREVIEW_KEYS/);
  assert.match(source, /preparedActionLabel/);
});
