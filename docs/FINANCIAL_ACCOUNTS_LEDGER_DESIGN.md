# Financial Accounts Ledger and Reconciliation Design

Status: **Design proposal only — not implementation authorization**

This document records the proposed future HydroQualiSense model for company bank accounts, cash accounts, e-wallets, internal transfers, account registers, and reconciliation. It is intentionally isolated from the current implementation phase and does not change runtime behavior.

The current live `AGENTS.md`, active roadmap, current handoff, database contracts, and financial source-of-truth rules remain authoritative. Future implementation must re-read those sources before work begins.

## 1. Motivation

HydroQualiSense should let a company represent the real places where company money is held and moved, for example:

- BDO operating account
- BPI payroll account
- company GCash or Maya account
- petty cash
- cash on hand
- other company-controlled bank or e-wallet accounts

The useful product pattern is similar to an internal wallet/account register: each financial account has its own history and balance, while business transactions such as supplier payments, client collections, payroll funding, refunds, and transfers feed that history.

HydroQualiSense must adapt this pattern to business accounting and its existing financial authority model. It must **not** introduce an independent consumer-style wallet subsystem that competes with existing Expenses, invoices, payments, bank-statement intake, reconciliation, or accounting source-of-truth rules.

## 2. Core product shape

The intended navigation is:

`Cash & Banking -> Financial Accounts -> Account Register -> Transfers -> Reconciliation`

A financial account represents a company-owned location of funds. The account register represents posted money movements affecting that account.

Examples:

- Paying a supplier Expense from `BDO Operating` decreases that account.
- Collecting a client Invoice into `BPI Collections` increases that account.
- Moving money from `BDO Operating` to `BPI Payroll` decreases the first account and increases the second by the same principal amount.
- A bank transfer fee is recorded separately as an Expense or equivalent authoritative fee transaction; it is not hidden inside the transfer principal.

## 3. Existing HydroQualiSense alignment

HydroQualiSense already contains Cash & Banking, bank-statement, reconciliation, and financial-account concepts. Future work should extend and normalize the existing implementation rather than create parallel financial records.

Existing financial lifecycle rules remain controlling, including the principle that source business documents and authoritative financial records must not be silently duplicated or reclassified merely to produce an account balance.

Bank-statement imports remain evidence to reconcile against authoritative application records. Importing a line from a bank statement must not, by itself, create duplicate income, expense, invoice, or payment authority when the real transaction already exists elsewhere in HydroQualiSense.

## 4. Financial account model

A future `FinancialAccount` should support at least these asset account categories:

- bank
- cash
- e-wallet
- other company-controlled liquid account

Useful account identity fields include:

- company ownership
- display name / account label
- institution or provider name
- account type
- masked account identifier where useful
- currency
- opening balance and opening-balance date, if applicable
- active / archived status
- reconciliation eligibility
- timestamps and audit actor

Do not store unnecessary sensitive banking information.

### Credit cards and similar liabilities

Credit cards must not be modeled as ordinary cash wallets. If HydroQualiSense later supports credit-card registers, they should use explicit liability-account semantics and corresponding payment/reconciliation rules.

## 5. Balance semantics

The displayed account balance must be derived from an auditable opening position plus valid posted movements. Users must not be able to overwrite the current balance as an arbitrary editable number once financial history exists.

Conceptually:

`current balance = opening balance + posted inflows - posted outflows`

The implementation may use safe cached or materialized values for performance, but those values must remain derivable from authoritative records and protected against drift.

Required rules:

1. A posted outgoing payment reduces exactly one funding account unless the transaction explicitly supports a split.
2. A posted incoming collection increases the receiving account.
3. An internal transfer creates balanced source and destination effects.
4. Internal-transfer principal is **not income and not expense**.
5. Transfer fees, bank charges, and similar costs remain separately classifiable expenses.
6. Reversals produce auditable reversing movements; they must not silently rewrite settled history.
7. Voiding or correcting a source transaction must follow the source domain's lifecycle rules and propagate safely to the related account movement.
8. The same business event must not be counted twice because it appears both in an application record and a bank-statement import.

## 6. Account register

Each account should have a chronological register with a running balance and links back to source records.

Useful register fields include:

- effective date/time
- posted date/time
- movement type
- description
- amount in / amount out
- running balance
- source domain
- source record/reference
- supplier or client where applicable
- project where applicable
- transfer counterpart account where applicable
- bank-statement match/reconciliation status
- actor/audit information

A register entry is an accounting/audit consequence of an authoritative business event. It should normally link to that event rather than become a second editable copy of it.

Examples of source domains may include:

- supplier Expense payment
- supplier invoice / payable lifecycle
- client invoice collection / receivable lifecycle
- payroll disbursement
- refund
- internal transfer
- opening balance
- approved adjustment
- bank fee

The exact domains must follow whatever is live when implementation begins.

## 7. Internal transfers

A transfer between two company-owned financial accounts is a movement of existing company funds, not a revenue or expense event.

A safe transfer should have one authoritative transfer identity and paired effects:

- source account: outflow of principal
- destination account: inflow of the same principal

Required invariants:

- source and destination belong to the same company deployment/domain
- source and destination cannot be the same account
- principal is positive
- both sides use the same authoritative transfer identity
- the transfer cannot leave only one side posted
- reversal reverses both sides consistently
- transfer principal cannot affect P&L classification

If a bank charges a fee, the fee must be represented separately and linked to the transfer where useful.

## 8. Expense and supplier-payment integration

When an Expense or supplier payable becomes paid through a HydroQualiSense financial workflow, the user should be able to select or confirm the funding account, for example:

`Paid from: BDO Operating`

The resulting account effect should remain linked to the authoritative Expense/payment lifecycle. HydroQualiSense must not create a second unrelated expense merely to make the bank-account balance decrease.

Existing supplier Invoice -> authoritative Expense/payment rules remain in force.

## 9. Client invoice and collection integration

When a client payment is recorded, the user should be able to select the receiving financial account, for example:

`Received into: BPI Collections`

The collection should increase that account while remaining linked to the authoritative client invoice/receipt/collection record. A collection is not a second invoice and must not be duplicated because a later bank-statement line is imported.

## 10. Payroll integration

Payroll account integration is a future capability, not part of this design-only documentation change.

When implemented, payroll disbursement should use the same account-ledger principles:

- one authoritative payroll/payment event
- explicit funding account
- auditable account movement
- no duplicate payroll expense caused by account-register posting
- safe reversal/correction behavior

Payroll-specific authority and privacy rules must remain controlling.

## 11. Bank-statement import and reconciliation

HydroQualiSense already has bank-statement and reconciliation concepts. Financial Accounts should become the natural destination/context for those workflows.

A future flow may be:

1. Select or identify a Financial Account.
2. Import a CSV/XLSX/PDF-supported statement through the existing approved intake path.
3. Normalize and deduplicate statement lines.
4. Suggest matches against existing authoritative transactions.
5. Let authorized users confirm/reject matches.
6. Show unmatched lines for investigation or controlled creation workflows.
7. Preserve provenance from statement -> candidate -> confirmed match/action.

Important rule: **an imported bank statement is evidence, not automatic accounting authority**.

Reconciliation should favor matching existing records before proposing creation of a new financial event.

## 12. Account lifecycle

Accounts with financial history should normally be archived rather than deleted.

Recommended behavior:

- New unused account: deletion may be permitted if safe.
- Account with posted history: archive/deactivate only.
- Archived account: historical register remains readable according to permissions.
- Archived account: cannot be selected for new transactions unless deliberately reactivated.
- Renaming an account must not rewrite historical monetary facts.

## 13. Adjustments, corrections, and reversals

Direct balance editing should not be the normal correction mechanism.

If an account requires a legitimate correction, use an explicit authorized adjustment with:

- reason
- amount/direction
- effective date
- actor
- immutable audit trail
- optional supporting evidence

For source-linked payments or collections, correction should normally occur in the authoritative source workflow and generate the appropriate ledger consequence.

Settled/history-bearing records must not be silently mutated in a way that destroys prior financial meaning.

## 14. Security and financial authority

The financial-account domain must preserve all existing HydroQualiSense security boundaries.

Minimum requirements for future implementation:

- company-bound integrity on every account, transfer, movement, and reconciliation relation
- strict RLS and grants
- authorization checks for financial reads and writes
- server/database enforcement for critical invariants
- no client-controlled ownership fields that can cross company boundaries
- immutable/auditable posted history where required
- explicit idempotency for posting/reconciliation operations
- protection against duplicate posting and replay
- safe concurrency for balance-affecting actions

### Bank credentials

HydroQualiSense must **never** ask users to save online-banking passwords, PINs, OTPs, recovery codes, or equivalent secrets in application records.

If direct bank synchronization is introduced later, it requires a separate approved architecture using a legitimate bank/open-finance/API provider with tokenized authorization, scoped permissions, revocation, secure secret handling, provider-specific compliance review, and explicit threat modeling.

Direct bank synchronization is **out of scope** for the initial Financial Accounts ledger.

## 15. Important financial invariants

Future implementation and tests should prove at least the following:

1. Account balances reconcile to opening position plus valid posted movements.
2. Internal transfer principal conserves company funds across the paired accounts.
3. Internal transfers do not create income or expense.
4. Transfer fees are separate authoritative expenses when applicable.
5. A single source payment/collection cannot post twice through retry/replay.
6. Reversals remain linked to the original movement and restore the appropriate balance effect.
7. Cross-company account, transfer, source-link, or reconciliation relationships are impossible.
8. Bank-statement imports cannot silently double-count an existing financial event.
9. Archived accounts retain history and cannot receive new postings unless reactivated through an authorized path.
10. Source-domain financial lifecycle guards remain stronger than UI convenience.
11. Concurrent posting cannot create a partial transfer or inconsistent balance state.
12. Historical financial records remain auditable after account renaming or archival.

Database-related implementation must use real local Supabase validation when applicable, including migration replay, pgTAP, upgrade-path coverage, RLS/RPC behavior, and concurrency tests as required by live repository policy.

## 16. UX direction

A future Cash & Banking surface should make these actions easy without exposing accounting complexity unnecessarily.

### Financial Accounts overview

Show:

- account name/provider
- type
- current reconciled/ledger balance as appropriate
- latest activity
- reconciliation status
- active/archived state

Primary actions may include:

- View register
- Record/complete transfer
- Reconcile statement
- Edit account identity
- Archive account

### Account register

The register should support filters for date, project, transaction/source type, reconciliation status, and counterparty where relevant. Source links should take the user directly to the authoritative Expense, invoice, payment, payroll, transfer, or reconciliation record.

### Transfers

A transfer form should clearly separate:

- From account
- To account
- Principal amount
- Transfer date/reference
- Optional bank fee
- Optional memo/supporting evidence

The UI must explain that the principal is not income or expense.

## 17. Proposed rollout order

This is a future roadmap candidate only. When the active roadmap authorizes it, implementation should be divided into bounded phases rather than one broad rewrite.

Suggested order:

### Phase A — Domain normalization and invariants

Inspect existing Financial Account/bank-statement implementation and establish the authoritative account, movement, transfer, and source-link model without duplicating existing financial domains.

### Phase B — Manual Financial Accounts and account register

Support company cash/bank/e-wallet accounts, opening positions, archive lifecycle, register display, and safe derived balances.

### Phase C — Internal transfers

Add paired transfers, fee handling, reversals, permissions, and concurrency-safe database enforcement.

### Phase D — Source transaction integration

Integrate supplier payments, Expenses, client collections, payroll where authorized, refunds, and other live financial domains with account movements.

### Phase E — Reconciliation strengthening

Connect the account register tightly to existing statement intake/matching/reconciliation with idempotency and provenance.

### Phase F — Optional external bank feeds

Only if justified later: investigate provider/API-based bank synchronization. This is separate from the core ledger and requires its own security/compliance decision.

## 18. Explicit non-goals

This proposal does not authorize:

- storing bank passwords, PINs, or OTPs
- screen-scraping online banking
- weakening Expense/invoice/payment authority rules
- turning imported statement lines into automatic accounting truth
- treating internal transfers as income or expense
- modeling credit cards as cash assets
- replacing existing financial domains with a generic wallet table
- modifying production data
- starting implementation during unrelated certification work

## 19. Current-phase isolation

This document is intentionally separate from the current **Deep PDF/export visual certification** work. Adding this design document must not change the active phase, current handoff, roadmap priority, application code, migrations, tests, CI behavior, or production/QA state.

When the active Codex run and current certification phase are complete, the roadmap/handoff may be updated in a separate reviewed documentation change if this Financial Accounts work is approved as a future phase.
