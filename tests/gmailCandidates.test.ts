import assert from "node:assert/strict";
import test from "node:test";
import { mergeGmailCandidates } from "../src/utils/gmailCandidates.ts";
import type { GmailMessageCandidate } from "../src/types.ts";

function candidate(id: string, importStatus?: GmailMessageCandidate["importStatus"]): GmailMessageCandidate {
  return {
    id,
    threadId: `thread-${id}`,
    sender: "qa@example.invalid",
    to: ["finance@example.invalid"],
    cc: [],
    labels: ["INBOX"],
    subject: `HydroQualiSense QA ${id}`,
    receivedAt: "2026-09-11T00:00:00Z",
    snippet: "Synthetic QA message",
    bodyText: "Synthetic QA message",
    attachments: [],
    importStatus,
  };
}

test("incremental Gmail results preserve the queue and deduplicate provider message ids", () => {
  const existing = [candidate("kept", "IMPORTED"), candidate("changed", "FAILED")];
  const discovered = [candidate("changed", "READY"), candidate("new", "READY")];
  const merged = mergeGmailCandidates(existing, discovered);

  assert.deepEqual(merged.map((item) => item.id), ["kept", "changed", "new"]);
  assert.equal(merged.find((item) => item.id === "changed")?.importStatus, "FAILED");
});

test("an up-to-date Gmail sync leaves the existing uncommitted queue intact", () => {
  const existing = [candidate("pending", "READY")];
  assert.deepEqual(mergeGmailCandidates(existing, []), existing);
});
