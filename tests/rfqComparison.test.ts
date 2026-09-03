import test from "node:test";
import assert from "node:assert/strict";
import type { RFQ, SupplierQuotation } from "../src/types.ts";
import {
  compareRFQQuotations,
  isQuotationExpired,
  hasCurrencyMismatch,
  checkQuantityMismatch,
  getQuotationLeadTimeRange,
} from "../src/utils/rfqComparison.ts";

function createSampleRFQ(): RFQ {
  return {
    id: "rfq-comp-1",
    rfqNumber: "RFQ-2026-COMP",
    title: "Commercial Aircon Units & Ducting",
    currency: "PHP",
    status: "ISSUED",
    lines: [
      {
        id: "rfq-line-1",
        rfqId: "rfq-comp-1",
        lineNumber: 1,
        description: "5HP Inverter Split Type AC",
        quantity: 10,
        unit: "units",
      },
      {
        id: "rfq-line-2",
        rfqId: "rfq-comp-1",
        lineNumber: 2,
        description: "Galvanized Sheet Ducting 24 Gauge",
        quantity: 50,
        unit: "sheets",
      },
      {
        id: "rfq-line-3",
        rfqId: "rfq-comp-1",
        lineNumber: 3,
        description: "Flexible Duct Connector 10-inch",
        quantity: 20,
        unit: "rolls",
      },
    ],
  };
}

test("rfqComparison: helper functions correctly evaluate expiration, currency, and quantity mismatch", () => {
  // Expiration
  assert.equal(isQuotationExpired("2026-08-01", "2026-09-01"), true);
  assert.equal(isQuotationExpired("2026-09-15", "2026-09-01"), false);
  assert.equal(isQuotationExpired(null, "2026-09-01"), false);

  // Currency mismatch
  assert.equal(hasCurrencyMismatch("PHP", "PHP"), false);
  assert.equal(hasCurrencyMismatch("usd", "PHP"), true);
  assert.equal(hasCurrencyMismatch("PHP", "usd"), true);

  // Quantity mismatch
  assert.equal(checkQuantityMismatch(10, 10), false);
  assert.equal(checkQuantityMismatch(8, 10), true);
  assert.equal(checkQuantityMismatch(15, 10), true);
});

test("rfqComparison: detects lowest price badge per line accurately across multiple quotes", () => {
  const rfq = createSampleRFQ();

  const quotes: SupplierQuotation[] = [
    {
      id: "quote-a",
      rfqId: rfq.id,
      vendorId: "vendor-a",
      quotationNumber: "QUO-A",
      quotationDate: "2026-09-01",
      currency: "PHP",
      totalAmount: 550_000,
      status: "SUBMITTED",
      lines: [
        // Line 1: 50,000 unit price
        {
          id: "qa-1",
          quotationId: "quote-a",
          rfqLineId: "rfq-line-1",
          lineNumber: 1,
          description: "5HP Inverter Split Type AC",
          quantity: 10,
          unit: "units",
          unitPrice: 50_000,
          amount: 500_000,
        },
        // Line 2: 1,000 unit price
        {
          id: "qa-2",
          quotationId: "quote-a",
          rfqLineId: "rfq-line-2",
          lineNumber: 2,
          description: "Galvanized Sheet Ducting 24 Gauge",
          quantity: 50,
          unit: "sheets",
          unitPrice: 1_000,
          amount: 50_000,
        },
      ],
    },
    {
      id: "quote-b",
      rfqId: rfq.id,
      vendorId: "vendor-b",
      quotationNumber: "QUO-B",
      quotationDate: "2026-09-01",
      currency: "PHP",
      totalAmount: 480_000,
      status: "SUBMITTED",
      lines: [
        // Line 1: 45,000 unit price (LOWEST)
        {
          id: "qb-1",
          quotationId: "quote-b",
          rfqLineId: "rfq-line-1",
          lineNumber: 1,
          description: "5HP Inverter Split Type AC",
          quantity: 10,
          unit: "units",
          unitPrice: 45_000,
          amount: 450_000,
        },
        // Line 2: 1,200 unit price
        {
          id: "qb-2",
          quotationId: "quote-b",
          rfqLineId: "rfq-line-2",
          lineNumber: 2,
          description: "Galvanized Sheet Ducting 24 Gauge",
          quantity: 50,
          unit: "sheets",
          unitPrice: 1_200,
          amount: 60_000,
        },
      ],
    },
  ];

  const report = compareRFQQuotations(rfq, quotes);

  // Line 1: quote-b has lowest price (45,000 vs 50,000)
  const line1Comp = report.lineComparisons.find((l) => l.rfqLine.id === "rfq-line-1")!;
  assert.equal(line1Comp.lowestUnitPrice, 45_000);
  assert.deepEqual(line1Comp.lowestPriceQuotationIds, ["quote-b"]);
  assert.equal(line1Comp.quotes["quote-b"].isLowestPrice, true);
  assert.equal(line1Comp.quotes["quote-a"].isLowestPrice, false);

  // Line 2: quote-a has lowest price (1,000 vs 1,200)
  const line2Comp = report.lineComparisons.find((l) => l.rfqLine.id === "rfq-line-2")!;
  assert.equal(line2Comp.lowestUnitPrice, 1_000);
  assert.deepEqual(line2Comp.lowestPriceQuotationIds, ["quote-a"]);
  assert.equal(line2Comp.quotes["quote-a"].isLowestPrice, true);
  assert.equal(line2Comp.quotes["quote-b"].isLowestPrice, false);
});

test("rfqComparison: excludes no-bid lines and foreign currencies from lowest price badge", () => {
  const rfq = createSampleRFQ();

  const quotes: SupplierQuotation[] = [
    {
      id: "quote-usd",
      rfqId: rfq.id,
      vendorId: "vendor-foreign",
      quotationNumber: "QUO-USD",
      quotationDate: "2026-09-01",
      currency: "USD", // Incompatible currency!
      totalAmount: 1_000,
      status: "SUBMITTED",
      lines: [
        {
          id: "qu-1",
          quotationId: "quote-usd",
          rfqLineId: "rfq-line-1",
          lineNumber: 1,
          description: "5HP Inverter Split Type AC",
          quantity: 10,
          unit: "units",
          unitPrice: 100, // 100 is nominally smaller than 50,000 PHP, but USD!
          amount: 1_000,
        },
      ],
    },
    {
      id: "quote-nobid",
      rfqId: rfq.id,
      vendorId: "vendor-nobid",
      quotationNumber: "QUO-NOBID",
      quotationDate: "2026-09-01",
      currency: "PHP",
      totalAmount: 0,
      status: "SUBMITTED",
      lines: [
        {
          id: "qn-1",
          quotationId: "quote-nobid",
          rfqLineId: "rfq-line-1",
          lineNumber: 1,
          description: "5HP Inverter Split Type AC",
          quantity: 10,
          unit: "units",
          unitPrice: 0,
          amount: 0,
          isNoBid: true,
        },
      ],
    },
    {
      id: "quote-valid",
      rfqId: rfq.id,
      vendorId: "vendor-valid",
      quotationNumber: "QUO-VALID",
      quotationDate: "2026-09-01",
      currency: "PHP",
      totalAmount: 500_000,
      status: "SUBMITTED",
      lines: [
        {
          id: "qv-1",
          quotationId: "quote-valid",
          rfqLineId: "rfq-line-1",
          lineNumber: 1,
          description: "5HP Inverter Split Type AC",
          quantity: 10,
          unit: "units",
          unitPrice: 50_000,
          amount: 500_000,
        },
      ],
    },
  ];

  const report = compareRFQQuotations(rfq, quotes);
  const line1Comp = report.lineComparisons.find((l) => l.rfqLine.id === "rfq-line-1")!;

  // The lowest price must be from quote-valid (50,000 PHP), NOT 100 USD and NOT no-bid
  assert.equal(line1Comp.lowestUnitPrice, 50_000);
  assert.deepEqual(line1Comp.lowestPriceQuotationIds, ["quote-valid"]);
  assert.equal(line1Comp.quotes["quote-usd"].currencyMismatch, true);
  assert.equal(line1Comp.quotes["quote-usd"].isLowestPrice, false);
  assert.equal(line1Comp.quotes["quote-nobid"].isNoBid, true);
  assert.equal(line1Comp.quotes["quote-nobid"].isLowestPrice, false);
  assert.equal(line1Comp.quotes["quote-valid"].isLowestPrice, true);
});

test("rfqComparison: identifies incomplete quotations due to missing lines or no-bid lines", () => {
  const rfq = createSampleRFQ(); // 3 RFQ lines

  const quotes: SupplierQuotation[] = [
    {
      // Missing line 3 completely
      id: "quote-missing",
      rfqId: rfq.id,
      vendorId: "v-missing",
      quotationNumber: "QUO-MISSING",
      quotationDate: "2026-09-01",
      currency: "PHP",
      totalAmount: 100_000,
      status: "SUBMITTED",
      lines: [
        { id: "qm-1", quotationId: "quote-missing", rfqLineId: "rfq-line-1", lineNumber: 1, description: "AC", quantity: 10, unit: "units", unitPrice: 5_000, amount: 50_000 },
        { id: "qm-2", quotationId: "quote-missing", rfqLineId: "rfq-line-2", lineNumber: 2, description: "Duct", quantity: 50, unit: "sheets", unitPrice: 1_000, amount: 50_000 },
      ],
    },
    {
      // Line 2 is explicitly NO-BID
      id: "quote-nobid",
      rfqId: rfq.id,
      vendorId: "v-nobid",
      quotationNumber: "QUO-NOBID",
      quotationDate: "2026-09-01",
      currency: "PHP",
      totalAmount: 60_000,
      status: "SUBMITTED",
      lines: [
        { id: "qnb-1", quotationId: "quote-nobid", rfqLineId: "rfq-line-1", lineNumber: 1, description: "AC", quantity: 10, unit: "units", unitPrice: 5_000, amount: 50_000 },
        { id: "qnb-2", quotationId: "quote-nobid", rfqLineId: "rfq-line-2", lineNumber: 2, description: "Duct", quantity: 50, unit: "sheets", unitPrice: 0, amount: 0, isNoBid: true },
        { id: "qnb-3", quotationId: "quote-nobid", rfqLineId: "rfq-line-3", lineNumber: 3, description: "Connector", quantity: 20, unit: "rolls", unitPrice: 500, amount: 10_000 },
      ],
    },
    {
      // Complete quote covering all 3 lines
      id: "quote-complete",
      rfqId: rfq.id,
      vendorId: "v-complete",
      quotationNumber: "QUO-COMPLETE",
      quotationDate: "2026-09-01",
      currency: "PHP",
      totalAmount: 120_000,
      status: "SUBMITTED",
      lines: [
        { id: "qc-1", quotationId: "quote-complete", rfqLineId: "rfq-line-1", lineNumber: 1, description: "AC", quantity: 10, unit: "units", unitPrice: 5_000, amount: 50_000 },
        { id: "qc-2", quotationId: "quote-complete", rfqLineId: "rfq-line-2", lineNumber: 2, description: "Duct", quantity: 50, unit: "sheets", unitPrice: 1_000, amount: 50_000 },
        { id: "qc-3", quotationId: "quote-complete", rfqLineId: "rfq-line-3", lineNumber: 3, description: "Connector", quantity: 20, unit: "rolls", unitPrice: 1_000, amount: 20_000 },
      ],
    },
  ];

  const report = compareRFQQuotations(rfq, quotes);
  assert.equal(report.hasIncompleteQuotes, true);

  const missingSummary = report.quotationSummaries.find((s) => s.quotationId === "quote-missing")!;
  assert.equal(missingSummary.isIncomplete, true);
  assert.equal(missingSummary.missingLineCount, 1);
  assert.equal(missingSummary.quotedLineCount, 2);

  const noBidSummary = report.quotationSummaries.find((s) => s.quotationId === "quote-nobid")!;
  assert.equal(noBidSummary.isIncomplete, true);
  assert.equal(noBidSummary.noBidLineCount, 1);
  assert.equal(noBidSummary.quotedLineCount, 2);

  const completeSummary = report.quotationSummaries.find((s) => s.quotationId === "quote-complete")!;
  assert.equal(completeSummary.isIncomplete, false);
  assert.equal(completeSummary.quotedLineCount, 3);
  assert.equal(completeSummary.noBidLineCount, 0);
  assert.equal(completeSummary.missingLineCount, 0);
});

test("rfqComparison: detects quantity mismatch between RFQ line and supplier quoted quantity", () => {
  const rfq = createSampleRFQ(); // Line 1 qty = 10, Line 2 qty = 50

  const quotes: SupplierQuotation[] = [
    {
      id: "quote-qty-mismatch",
      rfqId: rfq.id,
      vendorId: "vendor-x",
      quotationNumber: "QUO-X",
      quotationDate: "2026-09-01",
      currency: "PHP",
      totalAmount: 400_000,
      status: "SUBMITTED",
      lines: [
        // Quoted 8 units instead of RFQ required 10
        {
          id: "qx-1",
          quotationId: "quote-qty-mismatch",
          rfqLineId: "rfq-line-1",
          lineNumber: 1,
          description: "5HP Inverter Split Type AC",
          quantity: 8,
          unit: "units",
          unitPrice: 50_000,
          amount: 400_000,
        },
      ],
    },
  ];

  const report = compareRFQQuotations(rfq, quotes);
  assert.equal(report.hasQuantityMismatches, true);

  const line1Comp = report.lineComparisons.find((l) => l.rfqLine.id === "rfq-line-1")!;
  assert.equal(line1Comp.quotes["quote-qty-mismatch"].quantityMismatch, true);
  assert.equal(line1Comp.quotes["quote-qty-mismatch"].quotedQuantity, 8);

  const summary = report.quotationSummaries[0];
  assert.equal(summary.hasQuantityMismatch, true);
  assert.ok(summary.deterministicExplanations.some((e) => e.includes("Quantity mismatch")));
});

test("rfqComparison: raises validity warnings for expired quotes and currency mismatch warnings", () => {
  const rfq = createSampleRFQ();

  const quotes: SupplierQuotation[] = [
    {
      id: "quote-expired",
      rfqId: rfq.id,
      vendorId: "vendor-exp",
      quotationNumber: "QUO-EXP",
      quotationDate: "2026-07-01",
      validUntil: "2026-08-01", // Expired
      currency: "PHP",
      totalAmount: 100_000,
      status: "SUBMITTED",
      lines: [],
    },
    {
      id: "quote-curr-mismatch",
      rfqId: rfq.id,
      vendorId: "vendor-curr",
      quotationNumber: "QUO-CURR",
      quotationDate: "2026-09-01",
      validUntil: "2026-10-01", // Valid
      currency: "USD", // Mismatched
      totalAmount: 2_000,
      status: "SUBMITTED",
      lines: [],
    },
  ];

  const report = compareRFQQuotations(rfq, quotes, { asOfDate: "2026-09-03" });
  assert.equal(report.hasExpiredQuotes, true);
  assert.equal(report.hasCurrencyMismatches, true);

  const expSummary = report.quotationSummaries.find((s) => s.quotationId === "quote-expired")!;
  assert.equal(expSummary.isExpired, true);
  assert.ok(expSummary.deterministicExplanations.some((e) => e.includes("Validity expired")));

  const currSummary = report.quotationSummaries.find((s) => s.quotationId === "quote-curr-mismatch")!;
  assert.equal(currSummary.currencyMismatch, true);
  assert.ok(currSummary.deterministicExplanations.some((e) => e.includes("Currency mismatch")));
});

test("rfqComparison: accurately calculates lead time min/max days across quotes", () => {
  const rfq = createSampleRFQ();

  const quotes: SupplierQuotation[] = [
    {
      id: "q-fast",
      rfqId: rfq.id,
      vendorId: "v-fast",
      quotationNumber: "QUO-FAST",
      quotationDate: "2026-09-01",
      currency: "PHP",
      totalAmount: 100_000,
      leadTimeDays: 7, // 7 days header
      status: "SUBMITTED",
      lines: [],
    },
    {
      id: "q-slow",
      rfqId: rfq.id,
      vendorId: "v-slow",
      quotationNumber: "QUO-SLOW",
      quotationDate: "2026-09-01",
      currency: "PHP",
      totalAmount: 90_000,
      leadTimeDays: 30, // 30 days header
      status: "SUBMITTED",
      lines: [
        {
          id: "qs-1",
          quotationId: "q-slow",
          lineNumber: 1,
          description: "Long lead item",
          quantity: 1,
          unit: "pcs",
          unitPrice: 90_000,
          amount: 90_000,
          leadTimeDays: 45, // 45 days line override
        },
      ],
    },
  ];

  const { minLeadTime, maxLeadTime } = getQuotationLeadTimeRange(quotes);
  assert.equal(minLeadTime, 7);
  assert.equal(maxLeadTime, 45);

  const report = compareRFQQuotations(rfq, quotes);
  assert.equal(report.minLeadTimeDays, 7);
  assert.equal(report.maxLeadTimeDays, 45);
});
