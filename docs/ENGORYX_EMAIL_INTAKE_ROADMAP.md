# Engoryx Shared Email Intake Roadmap

Status: Phase 1 merged (PR #49), Phase 2 merged (PR #50), Phase 3 implemented, Phase 4 next

Current direction:

- repository: `Juvialski/InvoiceApp`
- product: Engoryx Engineering Operations Platform
- one deployment serves one client company
- Email Intake is a shared finance intake capability, not an Invoice-only feature
- current priorities are Invoices, Cash & Banking, bank accounts/statements, and Expenses
- Engineering Documents and Payroll email intake are deferred

This document is the durable plan for evolving the connected Gmail mailbox into a shared, auditable financial intake layer.

## Product direction

Engoryx should have one connected mailbox experience for supported finance workflows.

Target architecture:

```text
Google Gmail
    |
    v
Top-level Email Intake
    |
    v
Email + attachment preservation
    |
    v
Financial document classification
    |
    +----------------------+----------------------+
    |                      |                      |
    v                      v                      v
Invoice Review       Cash & Banking         Expense Review
                     Statement Preview
```

The shared intake layer owns mailbox connection state, source preservation, classification, provenance, duplicate safety, and routing suggestions. Destination modules retain their own permissions, review rules, lifecycle rules, and commit boundaries.

AI classification/extraction is advisory. It must never directly commit financial records.

---

# Phase 1 — Shared Email Intake Foundation + Cash & Banking

Status: merged in PR #49.

## Delivered direction

- canonical Gmail Bearer-token contract;
- Gmail authorization separated from Engoryx/Supabase authentication;
- Gmail failure does not sign the user out of Engoryx;
- bounded mailbox scanning;
- invoice routing preserved;
- supported bank-statement routing added;
- original email/attachment source preservation;
- existing Cash & Banking parser and `StatementPreview` reused;
- explicit confirmation required before financial transaction commit;
- statement import provenance linked to preserved source documents.

## Permanent boundaries

- Gmail remains read-only;
- no raw Gmail token is stored in application records;
- Gmail access never grants Cash & Banking authority;
- ambiguous FinancialAccount matches require explicit user selection;
- statement classification alone never creates transactions.

---

# Phase 2 — Email Intake → Expenses / Receipts

Status: merged in PR #50.

## Delivered direction

- receipt/expense candidate discovery;
- PDF/image expense attachment support;
- advisory extraction of payee, date, amount, currency, category, payment method, reference, and project hint;
- original source preservation and integrity validation;
- duplicate warnings using source/reference/payee+amount+date signals;
- explicit Expense review before save;
- Expense permissions kept separate from Gmail permissions;
- project hints remain suggestions and are not silently committed;
- invoice classification retains precedence over ambiguous receipt/invoice mail.

## Permanent boundaries

- no automatic approved/paid Expense creation;
- no silent project allocation;
- no Gmail-only mutation authority;
- preserved source must remain recoverable from the review workflow.

---

# Phase 3 — Top-Level Email Intake + Gmail Reliability UX

Status: implemented.

## Goal

Finish the product-level transition from an Invoice-specific Gmail page to a true shared financial Email Intake surface.

The current route/navigation still presents Email Intake under `Invoices / Gmail`, which no longer matches the architecture. Phase 3 should make Email Intake a first-class top-level operational surface while preserving backward-compatible deep links.

## Navigation and information architecture

Add a top-level navigation entry such as:

`Email Intake`

It should not live only under the Invoice submenu.

The shared page should be the single mailbox surface for:

- Invoice candidates;
- bank-statement candidates;
- Expense/receipt candidates.

Do not create separate Gmail pages for each destination.

Existing Invoice/Gmail deep links may redirect or resolve to the same shared Email Intake state.

## Gmail connection/reconnect UX

The UI must clearly distinguish:

1. Engoryx authentication state;
2. Google/Gmail authorization state;
3. mailbox scan state.

The app must not simultaneously present a healthy green `Connected mailbox` state while also reporting that Gmail authorization is expired/revoked.

When Gmail authorization expires or is revoked:

- keep the Engoryx session active;
- mark Gmail as requiring reconnection;
- show a clear `Reconnect Gmail` action in the connection card;
- do not require the user to hunt elsewhere for reconnection;
- prevent or redirect scan actions until Gmail authorization is restored;
- retain the previously known mailbox address only as informational metadata, not as proof of an active token;
- show concise recovery guidance rather than a dead-end error banner.

A successful reconnect should return the user to the same shared Email Intake page.

## Shared intake page structure

Recommended structure:

```text
Email Intake

Connected mailbox / reconnect state
Scan window + Scan button
Destination filters / candidate counts

Candidate queue
    - Invoice
    - Bank Statement
    - Expense / Receipt

Explicit Review action per destination
```

The page should expose:

- connected mailbox address;
- read-only Gmail scope;
- reconnect state/action;
- last successful sync;
- scan window;
- candidate type;
- confidence/reason;
- attachment/source details;
- destination;
- explicit review action;
- duplicate/suspected-duplicate state where available.

## Manual intake cleanup

The existing `Manual invoice email fallback` may remain for forwarded/unsupported Invoice cases, but it should not dominate the shared Email Intake page.

It should be visually secondary and clearly Invoice-specific.

Do not add manual bank-statement or Expense forms to the Email Intake page when those destination modules already have upload/create workflows.

## Phase 3 completion gate

Before merge:

- Email Intake is reachable from top-level navigation;
- Invoice/Gmail compatibility route still works;
- shared page serves Invoice, Bank Statement, and Expense candidates;
- expired Gmail authorization produces a clear reconnect state and action;
- Engoryx authentication remains unaffected by Gmail failure;
- stale `connected` UI cannot coexist with an expired-token state;
- scan is blocked or redirected appropriately when Gmail authorization is unavailable;
- reconnect returns to Email Intake cleanly;
- mobile/tablet/desktop layout passes browser QA;
- existing Invoice, Cash & Banking, and Expense workflows remain unchanged at their commit boundaries;
- full tests/lint/build and repository CI gates pass.

---

# Phase 4 — Financial Intake Hardening

## Goal

Deepen the three finance destinations before adding unrelated document domains or broad automation.

Priority order:

1. Invoice intake reliability and review quality;
2. Bank account / statement routing and reconciliation quality;
3. Expense/receipt intake quality;
4. shared queue/duplicate/provenance UX.

## 4A — Invoice intake hardening

Review and improve:

- duplicate detection across Gmail/source/invoice identifiers;
- invoice-vs-receipt classification ambiguity;
- source preview/recovery from Invoice Review;
- multi-attachment Invoice emails;
- extraction failure/retry UX;
- clear distinction between candidate, extracted draft, verified invoice, and posted financial state.

Do not bypass the existing Invoice Review Queue or verification requirements.

## 4B — Bank accounts and statement intake hardening

Improve the Gmail → Cash & Banking path without creating a second transaction engine.

Focus on:

- better FinancialAccount suggestion using safe evidence from sender/statement metadata;
- explicit account selection when ambiguous;
- account mismatch warnings;
- statement date/range hints;
- duplicate-file and duplicate-transaction visibility;
- preserved source access from financial import/reconciliation surfaces;
- clear import batch status and provenance;
- safe retry after parser/import failure;
- account balances and reconciliation remaining authoritative in Cash & Banking.

No autonomous transaction posting.

## 4C — Expense/receipt intake hardening

Improve:

- amount/date/payee/reference extraction quality;
- category suggestions;
- merchant normalization;
- duplicate warnings;
- multi-receipt email handling;
- source preview;
- explicit project suggestion without automatic project assignment;
- clear Draft versus Approved semantics.

Do not automatically approve or pay expenses.

## 4D — Shared queue UX

After the three destination workflows are stable, add useful shared intake controls such as:

- filters by destination;
- filters by review status;
- suspected duplicate filter;
- failed/preparation-error filter;
- candidate counts;
- source-preserved/reviewed status;
- last sync timestamp;
- safe batch selection for preparation only where destination confirmation rules remain intact.

Batch preparation must not become batch autonomous posting.

## Phase 4 completion gate

- finance routing is reliable across Invoice, Bank Statement, and Expense cases;
- source/provenance is recoverable from destination workflows;
- duplicate handling is visible and safe;
- FinancialAccount selection remains explicit where needed;
- no destination bypasses existing permissions or human confirmation;
- full CI/browser/security validation passes.

---

# Deferred — Engineering / Project Email Intake

Engineering/project documents are not a current priority.

Do not implement Gmail routing for:

- drawings;
- RFIs;
- submittals;
- contracts;
- change orders;
- project correspondence;
- other Engineering Documents

until a future explicit product decision reactivates this scope.

If reactivated later, it should reuse existing Engineering Document/RFI/Submittal lifecycle and permission contracts rather than inventing parallel storage.

---

# Deferred — Payroll Email Intake

Do not connect Gmail to Payroll by default.

Payroll documents involve more sensitive employee and compensation data. Any future payroll-email feature requires its own security/privacy review and explicit product decision.

---

# Later — Controlled Automation and Assistant Integration

Only after the finance intake workflows above are stable should Engoryx consider:

- saved sender/domain routing rules;
- trusted-document heuristics;
- configurable scan schedules;
- duplicate/suspected-duplicate queues;
- Assistant navigation/explanation of Email Intake;
- Assistant preparation of supported actions under existing confirmation contracts.

Even later automation must not permit:

- autonomous bank transaction posting;
- autonomous Expense approval/payment;
- mailbox access that bypasses permissions;
- token/secret exposure to the Assistant model.

---

# Global invariants

1. One deployment serves one client company; persisted data remains company-scoped.
2. One connected mailbox integration is reused across supported financial destinations.
3. Gmail remains read-only unless a future explicit product decision changes that.
4. Raw Gmail access tokens must never be logged or stored in application records.
5. Original emails and attachments remain auditable through existing source-preservation primitives.
6. AI classifies/extracts/suggests; destination modules decide and commit.
7. Gmail authorization never grants destination mutation authority.
8. Existing lifecycle, RLS, permission, and confirmation contracts take precedence over convenience.
9. Reuse existing parsers/domain models instead of building duplicate subsystems.
10. Preserve backward compatibility as shared Email Intake evolves.
11. Do not weaken RLS or Storage isolation.
12. Browser evidence must distinguish mocked/demo evidence from live Google/Supabase production proof.
13. Project/account suggestions remain advisory until explicitly selected where destination rules require selection.
14. Gmail authorization failure never signs the user out of Engoryx.

---

# Implementation sequencing

Implement and merge one focused phase at a time.

Current order:

1. **Phase 1:** Gmail reliability + shared intake foundation + Cash & Banking statements — merged.
2. **Phase 2:** receipts/bills → Expense review — merged.
3. **Phase 3:** top-level Email Intake + Gmail reconnect/state UX — next.
4. **Phase 4:** finance intake hardening across Invoices, Bank Accounts/Statements, and Expenses.
5. **Controlled automation/Assistant integration:** later.
6. **Engineering/Project Email Intake:** deferred until explicitly re-prioritized.
7. **Payroll Email Intake:** separate future security-reviewed decision.

Do not collapse these into one oversized PR.

For substantial phases with at least two independent workstreams, follow `AGENTS.md`: maximum 2 concurrent subagents, use non-overlapping ownership, and let the lead agent own shared contracts, conflict-heavy integration, security interpretation, final validation, push, and PR creation.

---

# Fresh-chat handoff

A new implementation chat should begin by:

1. reading `AGENTS.md`;
2. reading this roadmap;
3. pulling CURRENT latest `main` rather than trusting an old SHA;
4. checking whether the previous phase has already been implemented/merged;
5. implementing only the next incomplete phase;
6. opening a PR and not merging it during implementation unless explicitly asked later.

At the current roadmap state, **Phase 3 — Top-Level Email Intake + Gmail Reliability UX is the next implementation phase**.
