import type {
  InvoiceAmountBasis,
  InvoiceData,
  InvoiceMonetaryDetermination,
  InvoiceMonetarySemantics,
  InvoicePayableBasis,
  InvoiceTaxInclusion,
  LineItem,
  ValidationIssue,
} from "../types.ts";

/**
 * Currency amounts are stored and compared at cent precision. The slightly
 * wider tolerance covers a normal half-cent rounding difference without
 * accepting a meaningful five-cent-or-more source discrepancy.
 */
export const INVOICE_MONEY_TOLERANCE = 0.02;

export const EMPTY_INVOICE_MONETARY_SEMANTICS: InvoiceMonetarySemantics = Object.freeze({
  unitPriceBasis: "UNKNOWN",
  lineTotalBasis: "UNKNOWN",
  subtotalBasis: "UNKNOWN",
  taxInclusion: "UNKNOWN",
  discountIncludedInSubtotal: null,
  payableBasis: "GROSS_INVOICE",
  determination: "UNKNOWN",
});

export interface InvoiceMonetaryReconciliation {
  semantics: InvoiceMonetarySemantics;
  lineTotalSum?: number;
  calculatedSubtotal?: number;
  calculatedTax?: number;
  calculatedGrandTotal?: number;
  calculatedBalanceDue?: number;
  statuses: {
    lineItems: "PASS" | "REVIEW" | "NOT_APPLICABLE";
    subtotal: "PASS" | "REVIEW" | "NOT_APPLICABLE";
    grandTotal: "PASS" | "REVIEW" | "NOT_APPLICABLE";
    balance: "PASS" | "REVIEW" | "NOT_APPLICABLE";
    withholding: "PASS" | "REVIEW" | "NOT_APPLICABLE";
  };
  issues: ValidationIssue[];
}

export function roundInvoiceMoney(value: number) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

export function presentInvoiceNumber(value: unknown): value is number | string {
  return value !== undefined
    && value !== null
    && !(typeof value === "string" && !value.trim())
    && Number.isFinite(Number(value));
}

function numeric(value: unknown) {
  return Number(value);
}

function numberValue(value: unknown) {
  return presentInvoiceNumber(value) ? numeric(value) : undefined;
}

export function nearlyEqualInvoiceMoney(left: number, right: number, tolerance = INVOICE_MONEY_TOLERANCE) {
  return Math.abs(roundInvoiceMoney(left) - roundInvoiceMoney(right)) <= tolerance;
}

/** Normal currency rounding can accumulate across independently rounded rows. */
export function invoiceAggregateMoneyTolerance(lineCount: number) {
  return Math.min(0.04, Math.max(INVOICE_MONEY_TOLERANCE, Math.round((Math.max(1, lineCount) * 0.005 + 0.005) * 100) / 100));
}

function text(value: unknown) {
  return String(value ?? "").trim();
}

function normalized(value: unknown) {
  return text(value).toUpperCase();
}

function asAmountBasis(value: unknown): InvoiceAmountBasis {
  return value === "PRE_TAX" || value === "TAX_INCLUSIVE" ? value : "UNKNOWN";
}

function asTaxInclusion(value: unknown): InvoiceTaxInclusion {
  return value === "ADDED_TO_TOTAL" || value === "INCLUDED_IN_TOTAL" || value === "NOT_APPLICABLE" ? value : "UNKNOWN";
}

function asPayableBasis(value: unknown): InvoicePayableBasis {
  return value === "GROSS_INVOICE" || value === "NET_AFTER_WITHHOLDING" ? value : "GROSS_INVOICE";
}

function isNonVatInvoice(invoice: Partial<InvoiceData>, taxAmount?: number) {
  const subtype = normalized(invoice.invoiceSubtype);
  const phTax = invoice.philippineTaxDetails || {};
  return subtype === "NON_VAT_INVOICE"
    || normalized(phTax.invoiceKind) === "NON_VAT_INVOICE"
    || normalized(phTax.sellerRegistration) === "NON_VAT"
    || (taxAmount !== undefined && Math.abs(taxAmount) <= INVOICE_MONEY_TOLERANCE && subtype.includes("NON_VAT"));
}

/**
 * Select the explicit tax amount without treating an absent value as zero.
 * The order preserves the canonical top-level amount, Philippine VAT amount,
 * a complete tax breakdown, and finally complete per-line tax evidence.
 */
export function explicitInvoiceTaxAmount(invoice: Partial<InvoiceData>) {
  const topLevel = numberValue(invoice.totalTax);
  if (topLevel !== undefined) return roundInvoiceMoney(topLevel);
  const phVat = numberValue(invoice.philippineTaxDetails?.vatAmount);
  if (phVat !== undefined) return roundInvoiceMoney(phVat);
  const breakdown = Array.isArray(invoice.taxBreakdown) ? invoice.taxBreakdown : [];
  if (breakdown.length > 0 && breakdown.every((entry) => numberValue(entry?.amount) !== undefined)) {
    return roundInvoiceMoney(breakdown.reduce((sum, entry) => sum + (numberValue(entry.amount) || 0), 0));
  }
  const items = Array.isArray(invoice.items) ? invoice.items : [];
  if (items.length > 0 && items.every((item) => numberValue(item.taxAmount) !== undefined)) {
    return roundInvoiceMoney(items.reduce((sum, item) => sum + (numberValue(item.taxAmount) || 0), 0));
  }
  return undefined;
}

function hasExplicitTaxEvidence(invoice: Partial<InvoiceData>) {
  if (presentInvoiceNumber(invoice.totalTax) || presentInvoiceNumber(invoice.philippineTaxDetails?.vatAmount)) return true;
  const breakdown = Array.isArray(invoice.taxBreakdown) ? invoice.taxBreakdown : [];
  if (breakdown.length > 0 && breakdown.every((entry) => presentInvoiceNumber(entry?.amount))) return true;
  const items = Array.isArray(invoice.items) ? invoice.items : [];
  return items.length > 0 && items.every((item) => presentInvoiceNumber(item.taxAmount));
}

function lineTotalSum(items: readonly LineItem[]) {
  if (!items.length || !items.every((item) => numberValue(item.total) !== undefined)) return undefined;
  return roundInvoiceMoney(items.reduce((sum, item) => sum + (numberValue(item.total) || 0), 0));
}

function sourceAdjustmentVariants(invoice: Partial<InvoiceData>, discountIncludedInSubtotal: boolean | null) {
  const shipping = numberValue(invoice.shippingFee);
  const otherFees = numberValue(invoice.otherFees);
  if (shipping === undefined || otherFees === undefined) return [];
  const fees = roundInvoiceMoney(shipping + otherFees);
  if (discountIncludedInSubtotal === true) return [fees];
  const discount = numberValue(invoice.totalDiscount);
  if (discount === undefined) return [];
  const separateDiscount = roundInvoiceMoney(-discount + fees);
  if (discountIncludedInSubtotal === false || nearlyEqualInvoiceMoney(separateDiscount, fees, 0.001)) return [separateDiscount];
  return [separateDiscount, fees];
}

function inferredDetermination(current: InvoiceMonetaryDetermination, explicit: boolean) {
  if (explicit) return "EXPLICIT" as const;
  return current === "UNKNOWN" ? "INFERRED" as const : current;
}

/**
 * Resolve the source's monetary basis from explicit extraction evidence and
 * unambiguous arithmetic. This never applies a legal VAT rate and never
 * changes the source amounts themselves.
 */
export function resolveInvoiceMonetarySemantics(invoice: Partial<InvoiceData>): InvoiceMonetarySemantics {
  const raw = (invoice.financialSemantics || {}) as Partial<InvoiceMonetarySemantics>;
  const phInclusive = invoice.philippineTaxDetails?.vatInclusive;
  const taxAmount = explicitInvoiceTaxAmount(invoice);
  const subtotal = numberValue(invoice.subtotal);
  const grandTotal = numberValue(invoice.grandTotal);
  const lines = Array.isArray(invoice.items) ? invoice.items : [];
  const linesTotal = lineTotalSum(lines);
  const discount = numberValue(invoice.totalDiscount);

  let lineTotalBasis = asAmountBasis(raw.lineTotalBasis);
  let unitPriceBasis = asAmountBasis(raw.unitPriceBasis);
  let subtotalBasis = asAmountBasis(raw.subtotalBasis);
  let taxInclusion = asTaxInclusion(raw.taxInclusion);
  let discountIncludedInSubtotal = typeof raw.discountIncludedInSubtotal === "boolean" ? raw.discountIncludedInSubtotal : null;
  let payableBasis = asPayableBasis(raw.payableBasis);
  let determination: InvoiceMonetaryDetermination = raw.determination === "EXPLICIT" || raw.determination === "INFERRED" ? raw.determination : "UNKNOWN";
  const hasExplicitSemantics = asAmountBasis(raw.unitPriceBasis) !== "UNKNOWN"
    || asAmountBasis(raw.lineTotalBasis) !== "UNKNOWN"
    || asAmountBasis(raw.subtotalBasis) !== "UNKNOWN"
    || asTaxInclusion(raw.taxInclusion) !== "UNKNOWN"
    || typeof raw.discountIncludedInSubtotal === "boolean"
    || raw.payableBasis === "GROSS_INVOICE"
    || raw.payableBasis === "NET_AFTER_WITHHOLDING";

  if (typeof phInclusive === "boolean" && taxInclusion === "UNKNOWN") {
    taxInclusion = phInclusive ? "INCLUDED_IN_TOTAL" : "ADDED_TO_TOTAL";
    determination = "EXPLICIT";
  }

  if (isNonVatInvoice(invoice, taxAmount) || (taxAmount !== undefined && Math.abs(taxAmount) <= INVOICE_MONEY_TOLERANCE && hasExplicitTaxEvidence(invoice))) {
    if (taxInclusion === "UNKNOWN") taxInclusion = "NOT_APPLICABLE";
    if (unitPriceBasis === "UNKNOWN") unitPriceBasis = "PRE_TAX";
    if (lineTotalBasis === "UNKNOWN") lineTotalBasis = "PRE_TAX";
    if (subtotalBasis === "UNKNOWN") subtotalBasis = "PRE_TAX";
    determination = inferredDetermination(determination, hasExplicitSemantics);
  }

  if (discountIncludedInSubtotal === null && linesTotal !== undefined && subtotal !== undefined && discount !== undefined) {
    if (nearlyEqualInvoiceMoney(linesTotal - discount, subtotal)) discountIncludedInSubtotal = true;
    else if (nearlyEqualInvoiceMoney(linesTotal, subtotal)) discountIncludedInSubtotal = false;
  }

  const adjustmentVariants = sourceAdjustmentVariants(invoice, discountIncludedInSubtotal);
  const exclusiveTotals = subtotal !== undefined && taxAmount !== undefined
    ? adjustmentVariants.map((adjustment) => roundInvoiceMoney(subtotal + adjustment + taxAmount))
    : [];
  const inclusiveTotals = subtotal !== undefined
    ? adjustmentVariants.map((adjustment) => roundInvoiceMoney(subtotal + adjustment))
    : [];
  const exclusiveMatches = grandTotal !== undefined && exclusiveTotals.some((expected) => nearlyEqualInvoiceMoney(expected, grandTotal));
  const inclusiveMatches = grandTotal !== undefined && inclusiveTotals.some((expected) => nearlyEqualInvoiceMoney(expected, grandTotal));

  // If the document's totals unambiguously establish the tax treatment, use
  // that relationship even when a vendor omitted the words "VAT inclusive".
  if (taxAmount !== undefined && taxInclusion === "UNKNOWN") {
    if (exclusiveMatches && !inclusiveMatches) {
      taxInclusion = "ADDED_TO_TOTAL";
      determination = inferredDetermination(determination, false);
    } else if (inclusiveMatches && !exclusiveMatches) {
      taxInclusion = "INCLUDED_IN_TOTAL";
      determination = inferredDetermination(determination, false);
    }
  }

  if (taxInclusion === "UNKNOWN" && linesTotal !== undefined && grandTotal !== undefined && taxAmount !== undefined) {
    if (nearlyEqualInvoiceMoney(linesTotal + taxAmount, grandTotal) && !nearlyEqualInvoiceMoney(linesTotal, grandTotal)) {
      taxInclusion = "ADDED_TO_TOTAL";
      determination = inferredDetermination(determination, false);
    } else if (nearlyEqualInvoiceMoney(linesTotal, grandTotal) && !nearlyEqualInvoiceMoney(linesTotal + taxAmount, grandTotal)) {
      taxInclusion = "INCLUDED_IN_TOTAL";
      determination = inferredDetermination(determination, false);
    }
  }

  if (taxInclusion === "UNKNOWN" && taxAmount !== undefined) {
    const vatableSales = numberValue(invoice.philippineTaxDetails?.vatableSales);
    if (vatableSales !== undefined && grandTotal !== undefined && adjustmentVariants.some((adjustment) => nearlyEqualInvoiceMoney(vatableSales + taxAmount + adjustment, grandTotal))) {
      taxInclusion = "ADDED_TO_TOTAL";
      determination = inferredDetermination(determination, false);
    }
  }

  if (lineTotalBasis === "UNKNOWN") {
    lineTotalBasis = phInclusive === true || taxInclusion === "INCLUDED_IN_TOTAL" ? "TAX_INCLUSIVE" : taxInclusion === "ADDED_TO_TOTAL" || taxInclusion === "NOT_APPLICABLE" ? "PRE_TAX" : "UNKNOWN";
  }
  if (unitPriceBasis === "UNKNOWN" && !raw.lineTotalBasis) unitPriceBasis = lineTotalBasis;

  if (linesTotal !== undefined && subtotal !== undefined) {
    const facts: Array<{ basis: InvoiceAmountBasis; discountIncluded: boolean; expected: number }> = [];
    const addFact = (basis: InvoiceAmountBasis, discountIncluded: boolean, expected: number) => {
      if (basis === "UNKNOWN") return;
      if (!facts.some((fact) => fact.basis === basis && fact.discountIncluded === discountIncluded)) facts.push({ basis, discountIncluded, expected: roundInvoiceMoney(expected) });
    };
    const discountOptions = discountIncludedInSubtotal === true
      ? discount === undefined ? [] : [{ included: true, amount: discount }]
      : discountIncludedInSubtotal === false || discount === undefined
        ? [{ included: false, amount: 0 }]
        : [{ included: false, amount: 0 }, { included: true, amount: discount }];
    for (const option of discountOptions) {
      if (lineTotalBasis !== "UNKNOWN") addFact(lineTotalBasis, option.included, linesTotal - option.amount);
      if (taxAmount !== undefined && lineTotalBasis === "TAX_INCLUSIVE") addFact("PRE_TAX", option.included, linesTotal - taxAmount - option.amount);
      if (taxAmount !== undefined && lineTotalBasis === "PRE_TAX") addFact("TAX_INCLUSIVE", option.included, linesTotal + taxAmount - option.amount);
    }
    const matchingFacts = facts.filter((fact) => nearlyEqualInvoiceMoney(fact.expected, subtotal));
    const matchingBases = [...new Set(matchingFacts.map((fact) => fact.basis))];
    if (subtotalBasis === "UNKNOWN" && matchingBases.length === 1) subtotalBasis = matchingBases[0]!;
    const matchingDiscountTreatments = [...new Set(matchingFacts.map((fact) => fact.discountIncluded))];
    if (discountIncludedInSubtotal === null && matchingDiscountTreatments.length === 1) discountIncludedInSubtotal = matchingDiscountTreatments[0]!;
  }
  if (subtotalBasis === "UNKNOWN") {
    const vatableSales = numberValue(invoice.philippineTaxDetails?.vatableSales);
    if (vatableSales !== undefined && subtotal !== undefined && nearlyEqualInvoiceMoney(vatableSales, subtotal)) subtotalBasis = "PRE_TAX";
    else if (exclusiveMatches && !inclusiveMatches) subtotalBasis = "PRE_TAX";
    else if (inclusiveMatches && !exclusiveMatches) subtotalBasis = "TAX_INCLUSIVE";
    else subtotalBasis = taxInclusion === "INCLUDED_IN_TOTAL" ? "TAX_INCLUSIVE" : taxInclusion === "ADDED_TO_TOTAL" || taxInclusion === "NOT_APPLICABLE" ? "PRE_TAX" : "UNKNOWN";
  }

  if (payableBasis === "GROSS_INVOICE" && raw.payableBasis === "NET_AFTER_WITHHOLDING") payableBasis = "NET_AFTER_WITHHOLDING";
  if (determination === "UNKNOWN" && hasExplicitSemantics) determination = "EXPLICIT";

  return {
    unitPriceBasis,
    lineTotalBasis,
    subtotalBasis,
    taxInclusion,
    discountIncludedInSubtotal,
    payableBasis,
    determination,
  };
}

function addIssue(issues: ValidationIssue[], issue: ValidationIssue) {
  if (!issues.some((existing) => existing.id === issue.id && existing.field === issue.field)) issues.push(issue);
}

function adjustmentValues(invoice: Partial<InvoiceData>, semantics: InvoiceMonetarySemantics) {
  const shipping = numberValue(invoice.shippingFee);
  const otherFees = numberValue(invoice.otherFees);
  const discount = numberValue(invoice.totalDiscount);
  if (shipping === undefined || otherFees === undefined) return undefined;
  if (semantics.discountIncludedInSubtotal !== true && discount === undefined) return undefined;
  return { discount: discount ?? 0, fees: roundInvoiceMoney(shipping + otherFees) };
}

interface GrandTotalCandidate {
  expected: number;
  taxIncluded: boolean;
  discountSubtracted: boolean;
}

function grandTotalCandidates(invoice: Partial<InvoiceData>, semantics: InvoiceMonetarySemantics, subtotal: number | undefined, taxAmount: number | undefined): GrandTotalCandidate[] {
  const adjustments = adjustmentValues(invoice, semantics);
  if (subtotal === undefined || !adjustments) return [];
  const discountOptions = adjustments.discount === 0 || semantics.discountIncludedInSubtotal === false
    ? [true]
    : semantics.discountIncludedInSubtotal === true
      ? [false]
      : [true, false];
  const taxOptions: boolean[] = semantics.taxInclusion === "ADDED_TO_TOTAL"
    ? [true]
    : semantics.taxInclusion === "NOT_APPLICABLE"
      ? [false]
      : semantics.taxInclusion === "INCLUDED_IN_TOTAL"
        ? [semantics.subtotalBasis === "PRE_TAX"]
        : taxAmount === undefined ? [] : [true, false];
  if (taxOptions.some((includeTax) => includeTax) && taxAmount === undefined) return [];
  const candidates: GrandTotalCandidate[] = [];
  for (const subtractDiscount of discountOptions) {
    for (const includeTax of taxOptions) {
      candidates.push({
        expected: roundInvoiceMoney(subtotal - (subtractDiscount ? adjustments.discount : 0) + (includeTax ? taxAmount || 0 : 0) + adjustments.fees),
        taxIncluded: !includeTax,
        discountSubtracted: subtractDiscount,
      });
    }
  }
  return candidates;
}

function lineExpectedAmount(item: LineItem, semantics: InvoiceMonetarySemantics) {
  const quantity = numberValue(item.quantity);
  const unitPrice = numberValue(item.unitPrice);
  const discount = numberValue(item.discount);
  if (quantity === undefined || unitPrice === undefined || discount === undefined || semantics.lineTotalBasis === "UNKNOWN" || semantics.unitPriceBasis !== semantics.lineTotalBasis) return undefined;
  return roundInvoiceMoney(quantity * unitPrice - discount);
}

function subtotalCandidates(invoice: Partial<InvoiceData>, semantics: InvoiceMonetarySemantics, linesTotal: number, taxAmount: number | undefined) {
  const baseCandidates: number[] = [];
  const addBase = (value: number) => {
    if (!baseCandidates.some((existing) => nearlyEqualInvoiceMoney(existing, value, 0.001))) baseCandidates.push(roundInvoiceMoney(value));
  };
  if (semantics.lineTotalBasis !== "UNKNOWN" && semantics.lineTotalBasis === semantics.subtotalBasis) addBase(linesTotal);
  if (taxAmount !== undefined) {
    // Explicit tax permits a bounded cross-basis comparison. A direct line
    // sum remains a candidate because the two source labels may be missing.
    addBase(linesTotal);
    if (semantics.lineTotalBasis === "TAX_INCLUSIVE" && semantics.subtotalBasis === "PRE_TAX") addBase(linesTotal - taxAmount);
    if (semantics.lineTotalBasis === "PRE_TAX" && semantics.subtotalBasis === "TAX_INCLUSIVE") addBase(linesTotal + taxAmount);
    if (semantics.lineTotalBasis === "UNKNOWN" && semantics.subtotalBasis === "PRE_TAX") addBase(linesTotal - taxAmount);
    if (semantics.lineTotalBasis === "UNKNOWN" && semantics.subtotalBasis === "TAX_INCLUSIVE") addBase(linesTotal + taxAmount);
    if (semantics.lineTotalBasis === "TAX_INCLUSIVE" && semantics.subtotalBasis === "UNKNOWN") addBase(linesTotal - taxAmount);
    if (semantics.lineTotalBasis === "PRE_TAX" && semantics.subtotalBasis === "UNKNOWN") addBase(linesTotal + taxAmount);
  }
  const discount = numberValue(invoice.totalDiscount);
  const discountOptions = semantics.discountIncludedInSubtotal === true
    ? discount === undefined ? [] : [true]
    : semantics.discountIncludedInSubtotal === false || discount === undefined ? [false] : [false, true];
  return baseCandidates.flatMap((base) => discountOptions.map((included) => roundInvoiceMoney(base - (included ? discount || 0 : 0))));
}

/**
 * Reconcile all known monetary evidence while keeping source values intact.
 * A missing basis/component is represented as an informational issue; it is
 * not converted to zero and it does not create a false mismatch warning.
 */
export function reconcileInvoiceMonetarySemantics(invoice: Partial<InvoiceData>): InvoiceMonetaryReconciliation {
  const semantics = resolveInvoiceMonetarySemantics(invoice);
  const items = Array.isArray(invoice.items) ? invoice.items : [];
  const issues: ValidationIssue[] = [];
  const statuses: InvoiceMonetaryReconciliation["statuses"] = {
    lineItems: items.length ? "PASS" : "NOT_APPLICABLE",
    subtotal: "NOT_APPLICABLE",
    grandTotal: "NOT_APPLICABLE",
    balance: "NOT_APPLICABLE",
    withholding: "NOT_APPLICABLE",
  };
  const taxAmount = explicitInvoiceTaxAmount(invoice);
  const linesTotal = lineTotalSum(items);
  const sourceSubtotal = numberValue(invoice.subtotal);
  const sourceGrandTotal = numberValue(invoice.grandTotal);

  if (items.length) {
    let unresolved = false;
    for (const [index, item] of items.entries()) {
      const quantity = numberValue(item.quantity);
      const unitPrice = numberValue(item.unitPrice);
      const total = numberValue(item.total);
      if (quantity === undefined || unitPrice === undefined || total === undefined) {
        unresolved = true;
        continue;
      }
      const expected = lineExpectedAmount(item, semantics);
      if (expected !== undefined && !nearlyEqualInvoiceMoney(expected, total)) {
        statuses.lineItems = "REVIEW";
        addIssue(issues, {
          id: `item-total-${index}`,
          severity: "warning",
          field: `items.${index}.total`,
          message: `Line ${index + 1} total does not match quantity × unit price − line discount on the recorded ${semantics.lineTotalBasis === "TAX_INCLUSIVE" ? "VAT-inclusive" : "pre-tax"} basis.`,
          expected,
          actual: total,
        });
      } else if (expected === undefined && semantics.lineTotalBasis === "UNKNOWN") {
        addIssue(issues, {
          id: "line-total-basis-unresolved",
          severity: "info",
          field: `items.${index}.total`,
          message: "Line amount basis is unresolved; the source-displayed line amount was preserved without asserting quantity × unit price arithmetic.",
        });
      } else if (expected === undefined && semantics.lineTotalBasis !== "UNKNOWN" && semantics.unitPriceBasis === semantics.lineTotalBasis && numberValue(item.discount) === undefined) {
        unresolved = true;
        addIssue(issues, {
          id: "line-discount-unresolved",
          severity: "info",
          field: `items.${index}.discount`,
          message: "Line discount is unresolved; the source-displayed line amount was preserved without treating the missing discount as zero.",
        });
      }
    }
    if (unresolved) statuses.lineItems = "REVIEW";
  }

  if (items.length && linesTotal !== undefined) {
    if (sourceSubtotal === undefined) {
      statuses.subtotal = "PASS";
      addIssue(issues, {
        id: "subtotal-source-omitted",
        severity: "info",
        field: "subtotal",
        message: "Source subtotal was not supplied; the complete source-displayed line amounts provide a calculated subtotal on their recorded basis.",
        expected: linesTotal,
      });
    } else {
      statuses.subtotal = "REVIEW";
      const expectedHeaderSubtotals = subtotalCandidates(invoice, semantics, linesTotal, taxAmount);
      const matched = expectedHeaderSubtotals.find((expected) => nearlyEqualInvoiceMoney(expected, sourceSubtotal, invoiceAggregateMoneyTolerance(items.length)));
      if (matched !== undefined) {
        statuses.subtotal = "PASS";
      } else if (expectedHeaderSubtotals.length === 0) {
        addIssue(issues, {
          id: "subtotal-basis-unresolved",
          severity: "info",
          field: "subtotal",
          message: "Subtotal reconciliation was not asserted because the line and subtotal tax bases are unresolved and no explicit tax amount permits a cross-basis comparison.",
        });
      } else {
        addIssue(issues, {
          id: "subtotal-mismatch",
          severity: "warning",
          field: "subtotal",
          message: "Subtotal does not reconcile with the extracted line-item amounts under the recorded tax basis.",
          expected: expectedHeaderSubtotals[0] ?? linesTotal,
          actual: sourceSubtotal,
        });
      }
    }
  } else if (items.length && sourceSubtotal !== undefined) {
    statuses.subtotal = "REVIEW";
    addIssue(issues, {
      id: "subtotal-line-items-unresolved",
      severity: "info",
      field: "subtotal",
      message: "Subtotal reconciliation was not evaluated because one or more source line amounts are unresolved.",
    });
  }

  const effectiveSubtotal = sourceSubtotal ?? linesTotal;
  const grandCandidates = grandTotalCandidates(invoice, semantics, effectiveSubtotal, taxAmount);
  if (sourceGrandTotal !== undefined) {
    if (grandCandidates.length === 0) {
      statuses.grandTotal = "REVIEW";
      addIssue(issues, {
        id: "grand-total-arithmetic-unresolved",
        severity: "info",
        field: "grandTotal",
        message: "Grand-total arithmetic was not asserted because a source subtotal, tax basis, discount, tax, or charge component is unresolved.",
      });
    } else {
      const matched = grandCandidates.find((candidate) => nearlyEqualInvoiceMoney(candidate.expected, sourceGrandTotal));
      if (matched) statuses.grandTotal = "PASS";
      else {
        statuses.grandTotal = "REVIEW";
        addIssue(issues, {
          id: "grand-total-mismatch",
          severity: "warning",
          field: "grandTotal",
          message: "Grand total does not reconcile with subtotal, tax, discount, shipping and fees under the recorded tax basis.",
          expected: grandCandidates[0]?.expected,
          actual: sourceGrandTotal,
        });
      }
    }
  } else if (grandCandidates.length) {
    statuses.grandTotal = "PASS";
  }

  const amountPaid = numberValue(invoice.amountPaid);
  const sourceBalanceDue = numberValue(invoice.balanceDue);
  const sourceAmountDue = numberValue(invoice.amountDue);
  if (sourceGrandTotal !== undefined && amountPaid !== undefined) {
    const calculatedBalanceDue = roundInvoiceMoney(Math.max(0, sourceGrandTotal - amountPaid));
    if (sourceBalanceDue !== undefined) {
      statuses.balance = nearlyEqualInvoiceMoney(calculatedBalanceDue, sourceBalanceDue) ? "PASS" : "REVIEW";
      if (statuses.balance === "REVIEW") addIssue(issues, {
        id: "balance-mismatch",
        severity: "warning",
        field: "balanceDue",
        message: "Balance due does not reconcile with gross invoice total minus amount paid.",
        expected: calculatedBalanceDue,
        actual: sourceBalanceDue,
      });
    } else {
      statuses.balance = "PASS";
    }
  } else if (sourceBalanceDue !== undefined || sourceAmountDue !== undefined) {
    statuses.balance = "REVIEW";
    if (sourceAmountDue !== undefined && sourceBalanceDue === undefined) addIssue(issues, {
      id: "amount-due-source-preserved",
      severity: "info",
      field: "amountDue",
      message: "Source-stated amount due was preserved separately; it is not assumed to equal gross total minus payments without payment evidence.",
      actual: sourceAmountDue,
    });
  }

  const calculatedBalanceDue = sourceGrandTotal !== undefined && amountPaid !== undefined
    ? roundInvoiceMoney(Math.max(0, sourceGrandTotal - amountPaid))
    : undefined;

  const withholding = numberValue(invoice.withholdingTaxAmount ?? invoice.philippineTaxDetails?.withholdingTaxAmount);
  const netPayable = numberValue(invoice.netAmountPayable ?? invoice.philippineTaxDetails?.netAmountPayable);
  if (withholding !== undefined || netPayable !== undefined) {
    statuses.withholding = "PASS";
    if (withholding !== undefined && (withholding < 0 || (sourceGrandTotal !== undefined && withholding > sourceGrandTotal + INVOICE_MONEY_TOLERANCE))) {
      statuses.withholding = "REVIEW";
      addIssue(issues, {
        id: "withholding-exceeds-gross",
        severity: "warning",
        field: "withholdingTaxAmount",
        message: "Withholding tax cannot be negative or exceed the gross supplier invoice total.",
        actual: withholding,
      });
    }
    if (withholding !== undefined && netPayable !== undefined && sourceGrandTotal !== undefined) {
      const expectedNet = roundInvoiceMoney(sourceGrandTotal - withholding);
      if (!nearlyEqualInvoiceMoney(expectedNet, netPayable)) {
        statuses.withholding = "REVIEW";
        addIssue(issues, {
          id: "net-payable-mismatch",
          severity: "warning",
          field: "netAmountPayable",
          message: "Net amount payable does not reconcile with gross invoice total minus explicit withholding.",
          expected: expectedNet,
          actual: netPayable,
        });
      }
    }
  }

  const matchedGrand = sourceGrandTotal !== undefined ? grandCandidates.find((candidate) => nearlyEqualInvoiceMoney(candidate.expected, sourceGrandTotal)) : grandCandidates[0];
  return {
    semantics,
    lineTotalSum: linesTotal,
    calculatedSubtotal: linesTotal,
    calculatedTax: taxAmount,
    calculatedGrandTotal: matchedGrand?.expected,
    calculatedBalanceDue,
    statuses,
    issues,
  };
}

/**
 * Return the gross amount expressed on a supplier invoice in the pre-tax
 * comparison basis used by a tax-exclusive Purchase Order, when explicit tax
 * evidence permits that comparison. The source grand total remains unchanged.
 */
export function invoicePreTaxComparisonAmount(invoice: Partial<InvoiceData>) {
  const grandTotal = numberValue(invoice.grandTotal);
  if (grandTotal === undefined) return { amount: undefined, basis: "UNKNOWN" as const };
  const taxAmount = explicitInvoiceTaxAmount(invoice);
  if (taxAmount !== undefined && taxAmount > INVOICE_MONEY_TOLERANCE) {
    return { amount: roundInvoiceMoney(Math.max(0, grandTotal - taxAmount)), basis: "PRE_TAX" as const };
  }
  return { amount: grandTotal, basis: "GROSS" as const };
}

export function invoiceLinePreTaxComparisonAmount(invoice: Partial<InvoiceData>, item: Pick<LineItem, "total" | "taxAmount" | "taxRate">) {
  const total = numberValue(item.total);
  if (total === undefined) return undefined;
  const lineBasis = resolveInvoiceMonetarySemantics(invoice).lineTotalBasis;
  const lineTax = numberValue(item.taxAmount);
  if (lineBasis === "TAX_INCLUSIVE" && lineTax !== undefined) return roundInvoiceMoney(Math.max(0, total - lineTax));
  if (lineBasis === "PRE_TAX") return total;
  return undefined;
}
