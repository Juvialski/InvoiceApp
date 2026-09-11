import assert from "node:assert/strict";
import test from "node:test";
import { invoiceView } from "../src/server/assistant/assistantToolExecutors.ts";
import { supplierInvoiceDuplicateTotalsMatch } from "../src/utils/invoiceDuplicateDetection.ts";

test("supplier invoice duplicate totals keep unknown values unknown while accepting real zero", () => {
  assert.equal(supplierInvoiceDuplicateTotalsMatch(null, null), false);
  assert.equal(supplierInvoiceDuplicateTotalsMatch(undefined, 0), false);
  assert.equal(supplierInvoiceDuplicateTotalsMatch("", 0), false);
  assert.equal(supplierInvoiceDuplicateTotalsMatch(0, 0), true);
  assert.equal(supplierInvoiceDuplicateTotalsMatch("0", 0), true);
});

test("Assistant invoice reads preserve unknown money as null and genuine zero as zero", () => {
  const unknown = invoiceView({
    id: "invoice-unknown",
    grand_total: null,
    current_data: {
      subtotal: null,
      totalDiscount: undefined,
      totalTax: null,
      amountPaid: undefined,
      amountDue: null,
      balanceDue: null,
      withholdingTaxAmount: undefined,
      netAmountPayable: null,
    },
  } as any);

  assert.equal(unknown.grandTotal, null);
  assert.equal(unknown.subtotal, null);
  assert.equal(unknown.totalDiscount, null);
  assert.equal(unknown.totalTax, null);
  assert.equal(unknown.amountPaid, null);
  assert.equal(unknown.amountDue, null);
  assert.equal(unknown.balanceDue, null);
  assert.equal(unknown.withholdingTaxAmount, null);
  assert.equal(unknown.netAmountPayable, null);

  const zero = invoiceView({
    id: "invoice-zero",
    grand_total: 0,
    current_data: {
      subtotal: 0,
      totalDiscount: 0,
      totalTax: 0,
      amountPaid: 0,
      amountDue: 0,
      balanceDue: 0,
      withholdingTaxAmount: 0,
      netAmountPayable: 0,
    },
  } as any);

  assert.equal(zero.grandTotal, 0);
  assert.equal(zero.subtotal, 0);
  assert.equal(zero.totalDiscount, 0);
  assert.equal(zero.totalTax, 0);
  assert.equal(zero.amountPaid, 0);
  assert.equal(zero.amountDue, 0);
  assert.equal(zero.balanceDue, 0);
  assert.equal(zero.withholdingTaxAmount, 0);
  assert.equal(zero.netAmountPayable, 0);
});
