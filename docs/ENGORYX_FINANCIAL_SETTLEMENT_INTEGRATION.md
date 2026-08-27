# Engoryx Financial Settlement Integration

## Purpose

Financial Settlement Integration connects the Cash & Banking liquidity layer to supplier invoices and payroll without turning Engoryx into a general ledger. A confirmed bank, e-wallet, or cash match is authoritative settlement evidence. It answers whether an obligation was paid, how much remains outstanding, and which financial transactions provide the evidence.

This phase deliberately keeps **economic/project cost** and **cash settlement** as separate axes.

## Cash versus project cost

Engoryx project cost continues to come from the existing central costing engine:

- verified supplier invoice project allocations;
- approved/paid payroll project allocations;
- approved/paid direct expenses.

A financial settlement match is not a fourth cost source. Confirming or reversing a bank payment does not create an expense, invoice allocation, payroll allocation, work entry, attendance row, overtime row, or project-cost transaction.

A verified ₱100,000 invoice allocated to a project remains ₱100,000 of project cost before and after its cash payment is linked. Likewise, a ₱50,000 approved payroll project allocation remains ₱50,000 of labor cost even when the employee net-pay bank debit is lower.

## Settlement model

The existing `financial_transaction_matches` table remains the canonical bridge. This phase extends it rather than creating a parallel payment subsystem.

Supported confirmed-settlement relationships are:

- one transaction to one invoice;
- one transaction to multiple invoices;
- multiple transactions to one invoice;
- one transaction to one payroll run;
- multiple transactions to one payroll run;
- partial settlement;
- full settlement;
- auditable reversal.

Active confirmed allocations are bounded on both the financial-transaction side and the settlement-target side.

### Settlement lifecycle

`financial_transaction_matches.status` supports:

- `SUGGESTED` for non-authoritative candidate state;
- `CONFIRMED` for authoritative settlement evidence;
- `REJECTED` for legacy/non-authoritative rejection behavior;
- `REVERSED` for a previously confirmed settlement that has been explicitly undone.

Reversal is not deletion. The original match retains confirmation actor/time and gains reversal actor/time/reason.

## Guarded database operations

Authoritative confirmation and reversal use security-definer RPCs:

- `confirm_financial_settlement(...)`
- `confirm_financial_settlement_batch(...)`
- `reverse_financial_settlement(...)`
- `get_financial_settlement_summary(...)`

Direct authenticated insert/update/delete access to `financial_transaction_matches` is revoked for the final authoritative settlement path. SELECT remains protected by company permissions.

The RPC layer derives the actor from `auth.uid()`, uses an empty `search_path`, schema-qualifies database references, and verifies active company permissions through the existing company authorization helpers.

Confirmation revalidates:

- authenticated actor;
- `cash.reconcile`;
- company isolation;
- transaction existence;
- POSTED transaction lifecycle;
- DEBIT direction for invoice/payroll settlement;
- target existence and target lifecycle;
- target-domain permission;
- compatible currency;
- remaining transaction amount;
- remaining target obligation;
- request-id/idempotency terms.

The transaction and target rows are locked during confirmation. The batch RPC executes multiple reviewed allocations in one PostgreSQL statement and reuses the same single-settlement function; a failure rolls back the whole batch.

## RBAC

Cash settlement does not allow `cash.reconcile` to bypass another domain's mutation authority.

- Invoice confirmation/reversal requires `cash.reconcile` and `invoices.manage`.
- Payroll confirmation/reversal requires `cash.reconcile` and `payroll.approve`.
- Existing expense compatibility requires `cash.reconcile` and `expenses.manage`.

Read summaries use the target domain's read permission. Assistant tools add appropriate Cash read/reconciliation permission requirements before exposing linked transaction information.

UI visibility is convenience only; RLS/RPC checks are authoritative.

## Invoice settlement basis

Supplier invoice project cost remains based on the verified invoice allocation and is independent of settlement.

The cash obligation uses an explicit payable basis:

1. a reliable top-level `netAmountPayable`, when present;
2. a nested Philippine `philippineTaxDetails.netAmountPayable` only when an explicit positive withholding amount establishes that it is a true net-payable figure;
3. otherwise the invoice gross document total.

This guards historical/demo extraction data where a nested `netAmountPayable` may have represented a remaining balance rather than the original payable obligation.

Engoryx does not invent withholding amounts and does not assume every Philippine invoice has withholding. Gross invoice project-cost semantics do not change merely because supplier cash settlement is net of withholding.

## Document-reported versus confirmed cash payment

Invoice extraction/current data may already contain `amountPaid` or related payment evidence. That evidence is preserved and displayed separately from confirmed bank reconciliation.

The operational settlement summary therefore exposes:

- settlement basis;
- confirmed reconciled cash paid;
- document-reported payment evidence;
- effective settled amount;
- outstanding amount;
- settlement state;
- linked settlement history.

Document-reported and bank-confirmed amounts are **not blindly added** because they may describe the same payment. The canonical summary conservatively uses independently identified evidence without manufacturing an extra payment.

Invoice settlement presentation uses the existing payment-status semantics where appropriate: `UNPAID`, `PARTIALLY_PAID`, `PAID`, and overdue presentation.

## Payroll settlement basis

Payroll cash settlement is based on employee net pay:

`sum(payroll_entries.net_pay)`

It is not based on gross pay or project-allocated labor cost.

Normal settlement eligibility is an `APPROVED` payroll run. Existing historical/manual `PAID` runs remain readable and linkable without being downgraded merely because old bank evidence is absent. They can be presented as paid lifecycle history with bank reconciliation not linked.

The derived disbursement states are:

- `UNSETTLED`;
- `PARTIALLY_DISBURSED`;
- `SETTLED`.

This phase does not automatically recalculate payroll or alter attendance, leave, overtime, work entries, employee compensation, project labor allocations, or statutory remittance obligations.

## Transaction direction and currency

Supplier invoice and payroll settlement normally require a POSTED DEBIT from a BANK, EWALLET, or CASH account transaction.

An ordinary CREDIT cannot silently settle a supplier payable or employee payroll run. Internal account transfers continue to use the existing transfer RPC/workflow and are not supplier/payroll settlement.

No FX conversion is inferred. Transaction currency and target obligation currency must match. Cross-currency settlement is deferred until Engoryx has an explicit FX settlement model.

## Reconciliation UX

Cash & Banking provides a focused allocation workspace with:

- account/date/reference/description;
- transaction total;
- already allocated amount;
- remaining transaction amount;
- searchable invoice/payroll/expense candidates;
- target payable/disbursement basis;
- already settled amount;
- target outstanding amount;
- editable partial allocation;
- multi-target allocation review;
- explicit confirmation;
- explicit reversal with reason.

Suggestions are deterministic and never auto-confirmed.

Invoice and Payroll surfaces show compact settlement cards with linked account, masked identifier, transaction date/reference, amount, outstanding balance, and navigation back to Cash & Banking.

Stable navigation uses the existing Engoryx route helpers. No second routing system is introduced.

## Failure behavior and concurrency

The UI does not claim settlement before the server confirms it. Failed confirmation preserves existing confirmed history and keeps the reconciliation context available for retry.

Idempotent match identifiers make retries safe. Database row locking prevents simultaneous confirmations from over-allocating a transaction or target obligation.

A reversal recalculates transaction remaining/reconciliation state and target settlement presentation. It does not change project cost.

## Audit

The audit-event allowlist remains a strict superset and adds:

- `CASH_SETTLEMENT_CONFIRMED`;
- `CASH_SETTLEMENT_REVERSED`.

Audit metadata contains target/transaction/match/amount/provenance information but no banking credentials.

## Assistant

The Engoryx Assistant has settlement-aware read and navigation tools for:

- invoice settlement summary;
- payroll settlement summary;
- open supplier settlement obligations;
- transaction settlement history;
- exact cash transaction navigation;
- exact payroll-run navigation.

Settlement mutations always use:

`PREPARE -> HUMAN CONFIRMATION -> EXECUTE`

Prepared actions include single invoice settlement, single payroll settlement, atomic split allocation, and settlement reversal. Execution revalidates current data and calls the same database RPC boundary used by finance workflows. The action event becomes `EXECUTED` only after the database succeeds.

The Assistant cannot silently mark invoices/payroll paid, cannot bypass `cash.reconcile` or domain permissions, cannot alter payroll sources, and cannot create project cost from bank settlement.

## Demo Mode

The isolated Meridian Engineering demo includes deterministic examples of:

- fully paid supplier invoice;
- partially paid supplier invoice;
- one bank debit split across two invoices;
- fully settled payroll run;
- partially settled payroll across multiple transactions;
- unmatched debit with candidates;
- confirmed internal transfer;
- reversed settlement history.

Demo data remains fictional and browser/session local. Production Supabase and Storage persistence are not mounted in Demo Mode. Reset Demo recreates the deterministic fixture state.

## Deferred scope

This phase does not add:

- general ledger or chart of accounts;
- double-entry journals;
- full AP/AR ledgers;
- bank or GCash credentials/APIs;
- Plaid/Open Banking;
- automated payment initiation;
- employee bank-account storage;
- payroll bank files;
- SSS, PhilHealth, Pag-IBIG, or BIR remittance settlement;
- automatic FX conversion;
- procurement or purchase orders;
- a new expense subsystem.
