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

  const layoutIndex = markup.indexOf('data-testid="supplier-invoice-side-by-side-review"');
  const sourcePaneIndex = markup.indexOf('data-testid="supplier-invoice-source-pane"');
  const extractedPaneIndex = markup.indexOf('data-testid="supplier-invoice-extracted-pane"');
  assert.ok(layoutIndex >= 0, "expected the responsive source/extracted review region");
  assert.ok(sourcePaneIndex > layoutIndex, "the preserved source should render in the review region");
  assert.ok(extractedPaneIndex > sourcePaneIndex, "the extracted worksheet should render beside the source");
  assert.match(markup, /data-testid="supplier-invoice-source-document" data-source-state="available"/);
  assert.match(markup, /data-testid="supplier-invoice-extracted-worksheet"/);
  assert.doesNotMatch(markup, /data-testid="supplier-invoice-extraction-status"/);
  assert.doesNotMatch(markup, /data-testid="supplier-invoice-blocking-review"/);
  assert.match(markup, /data-testid="supplier-invoice-secondary-actions"/);
  assert.equal((markup.match(/Retry extraction/g) || []).length, 1);
  assert.ok(markup.indexOf("Retry extraction") > markup.indexOf('data-testid="supplier-invoice-review-bar"'));

  const stickyFooterStart = markup.indexOf('class="sticky bottom-2');
  assert.ok(stickyFooterStart > 0, "expected the queue action footer");
  assert.doesNotMatch(markup.slice(0, stickyFooterStart), /Verify &amp; Create Expense/);
  assert.match(markup.slice(stickyFooterStart), /Verify &amp; Create Expense &amp; Next/);
  assert.equal((markup.slice(stickyFooterStart).match(/Verify &amp; Create Expense &amp; Next/g) || []).length, 1);
});
