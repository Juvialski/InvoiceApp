import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { VerificationWorkspace } from "../src/components/VerificationWorkspace.tsx";
import { createDemoInvoices } from "../src/demo/data/invoices.ts";

test("supplier invoice queue keeps the verify action in the sticky queue footer", () => {
  const invoice = createDemoInvoices("2026-09-20").invoices.find((candidate) => candidate.id === "demo-invoice-07");
  assert.ok(invoice, "expected the deterministic review invoice fixture");

  const markup = renderToStaticMarkup(
    <VerificationWorkspace
      invoice={invoice}
      queue={[invoice]}
      queueIndex={0}
      saveState="saved"
      completion={null}
      isRetrying={false}
      onRetryExtraction={async () => null}
      onUpdateInvoice={() => undefined}
      onBack={() => undefined}
      onPrevious={async () => false}
      onNext={async () => false}
      onSave={async () => true}
      onVerifyAndNext={async () => true}
      canVerify
      onReturnToDashboard={() => undefined}
      onViewVerified={() => undefined}
    />,
  );

  const stickyFooterStart = markup.indexOf('class="sticky bottom-2');
  assert.ok(stickyFooterStart > 0, "expected the queue action footer");
  assert.doesNotMatch(markup.slice(0, stickyFooterStart), /Verify &amp; Create Expense/);
  assert.match(markup.slice(stickyFooterStart), /Verify &amp; Create Expense &amp; Next/);
});
