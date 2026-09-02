import type {
  RFQ,
  RFQLine,
  SupplierQuotation,
  SupplierQuotationLine,
  SupplierQuotationStatus,
} from "../types.ts";

export interface QuotedLineComparison {
  quotationId: string;
  quotationNumber: string;
  vendorId: string;
  currency: string;
  line: SupplierQuotationLine | null;
  isNoBid: boolean;
  isMissing: boolean;
  quantityMismatch: boolean;
  quotedQuantity?: number;
  quotedUnit?: string;
  quotedUnitPrice?: number;
  quotedAmount?: number;
  leadTimeDays?: number | null;
  currencyMismatch: boolean;
  isLowestPrice: boolean;
}

export interface RFQLineComparison {
  rfqLine: RFQLine;
  quotes: Record<string, QuotedLineComparison>;
  lowestUnitPrice?: number;
  lowestPriceQuotationIds: string[];
}

export interface SupplierQuotationComparisonSummary {
  quotationId: string;
  quotationNumber: string;
  vendorId: string;
  currency: string;
  totalAmount: number;
  status: SupplierQuotationStatus;
  leadTimeDays?: number | null;
  validUntil?: string | null;
  currencyMismatch: boolean;
  isExpired: boolean;
  isIncomplete: boolean;
  hasQuantityMismatch: boolean;
  quotedLineCount: number;
  noBidLineCount: number;
  missingLineCount: number;
  isLowestTotalPrice: boolean;
  deterministicExplanations: string[];
}

export interface RFQComparisonReport {
  rfqId: string;
  rfqNumber: string;
  rfqCurrency: string;
  totalRfqLines: number;
  quotationsCount: number;
  quotationSummaries: SupplierQuotationComparisonSummary[];
  lineComparisons: RFQLineComparison[];
  lowestTotalPriceQuotationId: string | null;
  minLeadTimeDays: number | null;
  maxLeadTimeDays: number | null;
  hasCurrencyMismatches: boolean;
  hasExpiredQuotes: boolean;
  hasIncompleteQuotes: boolean;
  hasQuantityMismatches: boolean;
  deterministicNotes: string[];
}

export function isQuotationExpired(validUntil: string | null | undefined, asOfDate?: string): boolean {
  if (!validUntil) return false;
  const today = asOfDate || new Date().toISOString().slice(0, 10);
  return validUntil < today;
}

export function hasCurrencyMismatch(quoteCurrency: string, rfqCurrency: string): boolean {
  return (quoteCurrency || "").trim().toUpperCase() !== (rfqCurrency || "").trim().toUpperCase();
}

export function checkQuantityMismatch(quotedQty: number, rfqQty: number): boolean {
  return Number(quotedQty) !== Number(rfqQty);
}

export function getQuotationLeadTimeRange(quotations: SupplierQuotation[]): {
  minLeadTime: number | null;
  maxLeadTime: number | null;
} {
  const times: number[] = [];
  for (const q of quotations) {
    if (q.leadTimeDays != null && q.leadTimeDays >= 0) {
      times.push(q.leadTimeDays);
    }
    for (const l of q.lines || []) {
      if (l.leadTimeDays != null && l.leadTimeDays >= 0) {
        times.push(l.leadTimeDays);
      }
    }
  }
  if (times.length === 0) {
    return { minLeadTime: null, maxLeadTime: null };
  }
  return {
    minLeadTime: Math.min(...times),
    maxLeadTime: Math.max(...times),
  };
}

export function compareRFQQuotations(
  rfq: RFQ,
  quotations: SupplierQuotation[],
  options?: { asOfDate?: string },
): RFQComparisonReport {
  const rfqCurrency = (rfq.currency || "PHP").trim().toUpperCase();
  const asOfDate = options?.asOfDate || new Date().toISOString().slice(0, 10);
  const rfqLines = (rfq.lines || []).slice().sort((a, b) => a.lineNumber - b.lineNumber);

  // 1. Line-by-line comparison
  const lineComparisons: RFQLineComparison[] = rfqLines.map((rl) => {
    const quoteMap: Record<string, QuotedLineComparison> = {};

    for (const q of quotations) {
      const quoteCurr = (q.currency || "PHP").trim().toUpperCase();
      const currMismatch = hasCurrencyMismatch(quoteCurr, rfqCurrency);

      // Match by rfqLineId, or fallback to lineNumber
      const ql = q.lines?.find(
        (l) => (l.rfqLineId && l.rfqLineId === rl.id) || (!l.rfqLineId && l.lineNumber === rl.lineNumber),
      ) || null;

      if (!ql) {
        quoteMap[q.id] = {
          quotationId: q.id,
          quotationNumber: q.quotationNumber,
          vendorId: q.vendorId,
          currency: quoteCurr,
          line: null,
          isNoBid: true,
          isMissing: true,
          quantityMismatch: false,
          currencyMismatch: currMismatch,
          isLowestPrice: false,
        };
      } else {
        const isNoBid = Boolean(ql.isNoBid);
        const quantityMismatch = !isNoBid && checkQuantityMismatch(ql.quantity, rl.quantity);

        quoteMap[q.id] = {
          quotationId: q.id,
          quotationNumber: q.quotationNumber,
          vendorId: q.vendorId,
          currency: quoteCurr,
          line: ql,
          isNoBid,
          isMissing: false,
          quantityMismatch,
          quotedQuantity: ql.quantity,
          quotedUnit: ql.unit,
          quotedUnitPrice: ql.unitPrice,
          quotedAmount: ql.amount,
          leadTimeDays: ql.leadTimeDays ?? q.leadTimeDays ?? null,
          currencyMismatch: currMismatch,
          isLowestPrice: false,
        };
      }
    }

    // Determine lowest price badge among non-no-bid lines with compatible currency
    const validCandidates = Object.values(quoteMap).filter(
      (entry) =>
        !entry.currencyMismatch &&
        !entry.isNoBid &&
        !entry.isMissing &&
        entry.quotedUnitPrice !== undefined &&
        entry.quotedUnitPrice > 0,
    );

    let lowestUnitPrice: number | undefined;
    const lowestPriceQuotationIds: string[] = [];

    if (validCandidates.length > 0) {
      const minPrice = Math.min(...validCandidates.map((c) => c.quotedUnitPrice!));
      lowestUnitPrice = minPrice;

      for (const entry of validCandidates) {
        if (entry.quotedUnitPrice === minPrice) {
          entry.isLowestPrice = true;
          lowestPriceQuotationIds.push(entry.quotationId);
        }
      }
    }

    return {
      rfqLine: rl,
      quotes: quoteMap,
      lowestUnitPrice,
      lowestPriceQuotationIds,
    };
  });

  // 2. Quotation Summaries
  let lowestTotalPriceQuotationId: string | null = null;
  let minTotalAmount = Number.POSITIVE_INFINITY;

  // Find candidate for lowest overall total price (compatible currency, not cancelled, totalAmount > 0)
  for (const q of quotations) {
    const quoteCurr = (q.currency || "PHP").trim().toUpperCase();
    if (!hasCurrencyMismatch(quoteCurr, rfqCurrency) && q.status !== "CANCELLED" && q.totalAmount > 0) {
      if (q.totalAmount < minTotalAmount) {
        minTotalAmount = q.totalAmount;
        lowestTotalPriceQuotationId = q.id;
      }
    }
  }

  const quotationSummaries: SupplierQuotationComparisonSummary[] = quotations.map((q) => {
    const quoteCurr = (q.currency || "PHP").trim().toUpperCase();
    const currMismatch = hasCurrencyMismatch(quoteCurr, rfqCurrency);
    const expired = isQuotationExpired(q.validUntil, asOfDate);

    let quotedCount = 0;
    let noBidCount = 0;
    let missingCount = 0;
    let hasQtyMismatch = false;

    for (const lc of lineComparisons) {
      const qEntry = lc.quotes[q.id];
      if (!qEntry || qEntry.isMissing) {
        missingCount++;
      } else if (qEntry.isNoBid) {
        noBidCount++;
      } else {
        quotedCount++;
        if (qEntry.quantityMismatch) {
          hasQtyMismatch = true;
        }
      }
    }

    const isIncomplete =
      rfqLines.length > 0 &&
      (missingCount > 0 || noBidCount > 0 || (q.lines?.length || 0) < rfqLines.length);

    const isLowestTotal = q.id === lowestTotalPriceQuotationId;

    const deterministicExplanations: string[] = [];
    if (currMismatch) {
      deterministicExplanations.push(`Currency mismatch: quoted in ${quoteCurr}, RFQ is in ${rfqCurrency}`);
    }
    if (expired) {
      deterministicExplanations.push(`Validity expired: valid until ${q.validUntil}, as of ${asOfDate}`);
    }
    if (isIncomplete) {
      deterministicExplanations.push(
        `Incomplete quotation: ${noBidCount} no-bid line(s), ${missingCount} unquoted line(s) of ${rfqLines.length} RFQ line(s)`,
      );
    }
    if (hasQtyMismatch) {
      deterministicExplanations.push("Quantity mismatch detected on 1 or more line items");
    }
    if (isLowestTotal) {
      deterministicExplanations.push(
        `Overall lowest total price: ${quoteCurr} ${q.totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
      );
    }

    return {
      quotationId: q.id,
      quotationNumber: q.quotationNumber,
      vendorId: q.vendorId,
      currency: quoteCurr,
      totalAmount: q.totalAmount,
      status: q.status,
      leadTimeDays: q.leadTimeDays ?? null,
      validUntil: q.validUntil ?? null,
      currencyMismatch: currMismatch,
      isExpired: expired,
      isIncomplete,
      hasQuantityMismatch: hasQtyMismatch,
      quotedLineCount: quotedCount,
      noBidLineCount: noBidCount,
      missingLineCount: missingCount,
      isLowestTotalPrice: isLowestTotal,
      deterministicExplanations,
    };
  });

  // 3. Lead Time Range
  const { minLeadTime, maxLeadTime } = getQuotationLeadTimeRange(quotations);

  // 4. Report Flags and Deterministic Notes
  const hasCurrencyMismatches = quotationSummaries.some((s) => s.currencyMismatch);
  const hasExpiredQuotes = quotationSummaries.some((s) => s.isExpired);
  const hasIncompleteQuotes = quotationSummaries.some((s) => s.isIncomplete);
  const hasQuantityMismatches = quotationSummaries.some((s) => s.hasQuantityMismatch);

  const deterministicNotes: string[] = [];
  if (hasCurrencyMismatches) {
    deterministicNotes.push(
      `One or more quotations use a different currency than the RFQ (${rfqCurrency}). Prices are not converted automatically.`,
    );
  }
  if (hasExpiredQuotes) {
    deterministicNotes.push(`One or more quotations have expired as of ${asOfDate}.`);
  }
  if (hasIncompleteQuotes) {
    deterministicNotes.push("One or more quotations are incomplete or include no-bid items.");
  }
  if (hasQuantityMismatches) {
    deterministicNotes.push("One or more quotations specify quantities that differ from the RFQ line requirements.");
  }
  if (lowestTotalPriceQuotationId) {
    const lowestQuote = quotations.find((q) => q.id === lowestTotalPriceQuotationId);
    if (lowestQuote) {
      deterministicNotes.push(
        `Lowest overall quotation: ${lowestQuote.quotationNumber} (${lowestQuote.currency} ${lowestQuote.totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })})`,
      );
    }
  }

  return {
    rfqId: rfq.id,
    rfqNumber: rfq.rfqNumber,
    rfqCurrency,
    totalRfqLines: rfqLines.length,
    quotationsCount: quotations.length,
    quotationSummaries,
    lineComparisons,
    lowestTotalPriceQuotationId,
    minLeadTimeDays: minLeadTime,
    maxLeadTimeDays: maxLeadTime,
    hasCurrencyMismatches,
    hasExpiredQuotes,
    hasIncompleteQuotes,
    hasQuantityMismatches,
    deterministicNotes,
  };
}

export interface QuotationWarning {
  severity: "warning" | "info";
  message: string;
}

export function isQuotationComplete(rfq: RFQ, quotation: SupplierQuotation): boolean {
  const rfqLines = rfq.lines || [];
  if (rfqLines.length === 0) return true;
  for (const rl of rfqLines) {
    const ql = quotation.lines?.find(
      (l) => (l.rfqLineId && l.rfqLineId === rl.id) || (!l.rfqLineId && l.lineNumber === rl.lineNumber),
    );
    if (!ql || ql.isNoBid) return false;
  }
  return true;
}

export function getLowestLinePrices(rfq: RFQ, quotations: SupplierQuotation[]): Map<string, number> {
  const map = new Map<string, number>();
  const report = compareRFQQuotations(rfq, quotations);
  for (const lc of report.lineComparisons) {
    if (lc.lowestUnitPrice !== undefined) {
      map.set(lc.rfqLine.id, lc.lowestUnitPrice);
    }
  }
  return map;
}

export function getLowestCompleteQuotation(rfq: RFQ, quotations: SupplierQuotation[]): SupplierQuotation | null {
  const rfqCurrency = (rfq.currency || "PHP").trim().toUpperCase();
  const eligible = quotations.filter(
    (q) =>
      !hasCurrencyMismatch(q.currency, rfqCurrency) &&
      q.status !== "CANCELLED" &&
      q.totalAmount > 0 &&
      isQuotationComplete(rfq, q),
  );
  if (eligible.length === 0) {
    const report = compareRFQQuotations(rfq, quotations);
    if (report.lowestTotalPriceQuotationId) {
      return quotations.find((q) => q.id === report.lowestTotalPriceQuotationId) || null;
    }
    return null;
  }
  return eligible.reduce((prev, curr) => (curr.totalAmount < prev.totalAmount ? curr : prev), eligible[0]);
}

export function getQuotationWarnings(
  rfq: RFQ,
  quotation: SupplierQuotation,
  _allQuotations: SupplierQuotation[] = [],
): QuotationWarning[] {
  const warnings: QuotationWarning[] = [];
  const rfqCurrency = (rfq.currency || "PHP").trim().toUpperCase();
  const quoteCurrency = (quotation.currency || "PHP").trim().toUpperCase();

  if (hasCurrencyMismatch(quoteCurrency, rfqCurrency)) {
    warnings.push({
      severity: "warning",
      message: `Currency mismatch: quoted in ${quoteCurrency}, RFQ is in ${rfqCurrency}`,
    });
  }

  if (isQuotationExpired(quotation.validUntil)) {
    warnings.push({
      severity: "warning",
      message: `Quotation validity expired on ${quotation.validUntil}`,
    });
  }

  const rfqLines = rfq.lines || [];
  let noBidCount = 0;
  let missingCount = 0;
  let hasQtyMismatch = false;

  for (const rl of rfqLines) {
    const ql = quotation.lines?.find(
      (l) => (l.rfqLineId && l.rfqLineId === rl.id) || (!l.rfqLineId && l.lineNumber === rl.lineNumber),
    );
    if (!ql) {
      missingCount++;
    } else if (ql.isNoBid) {
      noBidCount++;
    } else if (checkQuantityMismatch(ql.quantity, rl.quantity)) {
      hasQtyMismatch = true;
    }
  }

  if (missingCount > 0 || noBidCount > 0) {
    warnings.push({
      severity: "warning",
      message: `Incomplete tender: ${noBidCount} no-bid and ${missingCount} unquoted item(s)`,
    });
  }

  if (hasQtyMismatch) {
    warnings.push({
      severity: "warning",
      message: "Quantity mismatch on 1 or more line items compared to RFQ requirement",
    });
  }

  return warnings;
}

