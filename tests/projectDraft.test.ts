import assert from "node:assert/strict";
import test from "node:test";
import { createProjectDraft } from "../src/utils/projectDraft.ts";

test("project drafts have a valid identity before authenticated persistence", () => {
  const draft = createProjectDraft("2026-09-11T00:00:00.000Z");
  assert.match(draft.id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  assert.equal(draft.projectCode, "");
  assert.equal(draft.createdAt, "2026-09-11T00:00:00.000Z");
  assert.equal(draft.updatedAt, "2026-09-11T00:00:00.000Z");
});
