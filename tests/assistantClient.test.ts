import test from "node:test";
import assert from "node:assert/strict";
import { parseAssistantResponse } from "../src/assistant/assistantClient.ts";

test("assistant client parser keeps structured data and drops arbitrary actions", () => {
  const response = parseAssistantResponse({
    success: true,
    data: {
      threadId: "thread-1",
      message: "I found the review queue.",
      contextGeneration: 12,
      references: [
        { type: "help", id: "invoice-review", label: "Invoice review" },
        { type: "unknown", label: "Do not trust this" },
      ],
      clientActions: [
        { type: "NAVIGATE", routeId: "review", label: "Open review" },
        { type: "NAVIGATE", routeId: "https://evil.example" },
        { type: "START_TOUR", tourId: "not-registered" },
      ],
      preparedActions: [{ id: "action-1", toolName: "prepare_invoice", riskTier: "PREPARE", status: "PREPARED", preview: { count: 1 }, expiresAt: "2026-08-25T00:00:00Z" }],
      attachments: [{ id: "attachment-1", fileName: "invoice.pdf", mimeType: "application/pdf", size: 42, kind: "PDF" }],
    },
  });

  assert.equal(response.threadId, "thread-1");
  assert.equal(response.contextGeneration, 12);
  assert.equal(response.references.length, 1);
  assert.deepEqual(response.clientActions, [{ type: "NAVIGATE", routeId: "review", label: "Open review" }]);
  assert.equal(response.preparedActions[0]?.preview.count, 1);
  assert.equal(response.attachments[0]?.kind, "PDF");
});
