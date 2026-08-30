import assert from "node:assert/strict";
import test from "node:test";
import { prepareAssistantComposerSubmission } from "../src/assistant/assistantComposerState.ts";

test("accepted Assistant submission captures the draft and clears immediately", () => {
  const submission = prepareAssistantComposerSubmission({
    draft: "  how to add employees  ",
    attachmentCount: 0,
    isLoading: false,
    canUseAssistant: true,
  });

  assert.equal(submission.accepted, true);
  assert.equal(submission.clearDraft, true);
  assert.equal(submission.message, "  how to add employees  ");
});

test("attachment-only Assistant submission is accepted while preserving the empty text snapshot", () => {
  const submission = prepareAssistantComposerSubmission({
    draft: "",
    attachmentCount: 1,
    isLoading: false,
    canUseAssistant: true,
  });

  assert.equal(submission.accepted, true);
  assert.equal(submission.clearDraft, true);
  assert.equal(submission.message, "");
});

test("composer keeps text when synchronous acceptance fails", () => {
  for (const input of [
    { draft: "question", attachmentCount: 0, isLoading: true, canUseAssistant: true },
    { draft: "question", attachmentCount: 0, isLoading: false, canUseAssistant: false },
    { draft: "   ", attachmentCount: 0, isLoading: false, canUseAssistant: true },
  ]) {
    const submission = prepareAssistantComposerSubmission(input);
    assert.equal(submission.accepted, false);
    assert.equal(submission.clearDraft, false);
    assert.equal(submission.message, input.draft);
  }
});
