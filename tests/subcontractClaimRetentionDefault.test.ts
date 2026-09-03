import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const editor = fs.readFileSync(
  path.resolve(__dirname, "../src/components/procurement/SubcontractClaimEditorModal.tsx"),
  "utf8",
);

test("new progress claims do not assume a contractual retention percentage", () => {
  assert.match(editor, /claim \? String\(roundMoney\(\(claim\.retentionRate \?\? 0\) \* 100\)\) : "0"/);
  assert.match(editor, /setRetentionPercent\("0"\)/);
  assert.doesNotMatch(editor, /retentionRate \?\? 0\.1/);
  assert.doesNotMatch(editor, /setRetentionPercent\("10"\)/);
});
