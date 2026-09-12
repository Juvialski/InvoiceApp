# HydroQualiSense Supplier Invoice Monetary Model

Status: **ACTIVE — source-evidence and reconciliation contract**

This document defines the monetary meaning used by Supplier Invoice extraction,
review, PO matching, and verification. It does not establish a Philippine tax
rate or a company-wide tax policy.

## Authority

- The supplier invoice is preserved source evidence.
- `grandTotal` is the source-stated gross supplier invoice total and is the
  amount carried into the single authoritative linked Expense.
- A linked Expense owns payable/project-cost truth after verification. The
  invoice does not become a second payable.
- A source-displayed line `total` is preserved as extracted. It is not replaced
  by `quantity × unitPrice` when a source amount is present.
- `UNKNOWN` is not numeric zero. Missing source amounts remain unresolved.
- A document/OCR `amountPaid` value is retained as source evidence only. It does
  not reduce the operational payable or produce a paid state without confirmed
  Cash & Banking settlement evidence.
- Verification may create the authoritative linked Expense in `DRAFT`. That
  supplier-derived DRAFT is a deliberate payable state and remains distinct
  from a generic direct DRAFT Expense.

## Explicit basis fields

`InvoiceData.financialSemantics` records:

- `lineTotalBasis`: `PRE_TAX`, `TAX_INCLUSIVE`, or `UNKNOWN`;
- `unitPriceBasis`: the independently stated unit-price basis when it differs
  from the line amount basis;
- `subtotalBasis`: `PRE_TAX`, `TAX_INCLUSIVE`, or `UNKNOWN`;
- `taxInclusion`: `ADDED_TO_TOTAL`, `INCLUDED_IN_TOTAL`,
  `NOT_APPLICABLE`, or `UNKNOWN`;
- `discountIncludedInSubtotal`: whether the invoice-level discount is already
  included in the source subtotal;
- `payableBasis`: normally `GROSS_INVOICE`, with net-after-withholding kept
  separately when explicitly evidenced; and
- `determination`: whether the basis was explicit, inferred from unambiguous
  source arithmetic, or remains unknown.

The existing `philippineTaxDetails.vatInclusive` is retained as explicit
source evidence. It describes the displayed tax-inclusive pricing context; it
does not cause VAT to be added again.

## Reconciliation

- For a VAT-exclusive invoice, a pre-tax subtotal plus explicit tax and fees,
  less an applicable invoice discount, reconciles to the gross total.
- For a VAT-inclusive invoice, tax is already represented in the gross amount.
  A tax-inclusive line sum can therefore reconcile to a pre-tax source
  subtotal plus the explicitly disclosed tax, or directly to an inclusive
  subtotal/total as the source labels establish.
- Line-level discounts are checked only when the source provides the discount
  and the recorded line basis is known. Explicit source line totals win over a
  calculated extension.
- Complete line sums may provide a calculated subtotal when the source omits
  one. The calculated value is labeled as calculated and never overwrites the
  original extraction snapshot.
- `financialFieldStatus` is the explicit provenance label for current values;
  the immutable AI/extraction snapshot omits deterministic fallback values so
  a calculated subtotal, tax, total, balance, or line amount cannot be read as
  source evidence.
- Currency comparison allows normal centavo rounding but still reports a
  meaningful known mismatch. If a basis or component is missing, the result is
  an informational review advisory rather than a false mismatch claim.
- `amountDue` is a source-stated due amount. `balanceDue` is the normalized
  gross balance after explicit payment evidence. They are not silently merged
  when withholding or payment context is ambiguous.
- Withholding is separate from VAT and does not reduce `grandTotal` or the
  authoritative Expense. An explicit `netAmountPayable` may be retained for
  settlement/reporting where the source supports it.

## Supplier identity boundary

Supplier invoices uploaded to a deployment are for that deployment company.
The external identity that must be resolved before posting is the Vendor.
Buyer/customer fields may remain as optional historical/source evidence, but
they are not extracted, matched, edited, or required as a Supplier Invoice
posting identity. Company isolation, active membership, permissions, and the
deployment-bound verification RPC remain mandatory.

## PO matching

Purchase Order amounts are compared on their stored commercial basis. When an
invoice has explicit tax, the matching projection may compare `grandTotal`
less that explicit tax to a tax-exclusive PO amount. The source gross total and
the linked Expense remain unchanged. If the invoice tax basis cannot be
resolved, amount comparison is bounded rather than presented as a definitive
tax-basis mismatch.

## History and correction

Every extraction attempt remains append-only. Manual corrections update the
current invoice snapshot and review event while preserving the original AI
snapshot and source document. A verified invoice with an active linked Expense
cannot be reopened by generic editing; corrections use the existing guarded
Expense/invoice correction boundary.
