# Engoryx Shared Email Intake Roadmap

Status: Phase 1 merged (PR #49), Phase 2 completed (PR pending), Phases 3-4 planned

Current baseline:

- repository: `Juvialski/InvoiceApp`
- product: Engoryx Engineering Operations Platform
- PR #48 (`feat(ui): comprehensive operations UI hardening`) is merged
- PR #49 (`Email Intake Phase 1: Gmail auth and bank statement routing`) is merged
- Phase 2 (`Email Intake Phase 2: Expenses / Receipts`) implemented
- the PR #48 UI foundation is reused rather than redesigned again

This document is the durable plan for evolving the existing Gmail invoice connector into a shared, auditable intake layer for multiple Engoryx workflows.

## Product direction

Engoryx should have one connected mailbox experience, not a separate Gmail integration for every module.

Target architecture:

```text
Google Gmail
    |
    v
Shared Email Intake
    |
    v
Email + attachment preservation
    |
    v
Document classification
    |
    +----------------------+----------------------+----------------------+
    |                      |                      |                      |
    v                      v                      v                      v
Invoice Review       Cash & Banking         Expenses            Project / Engineering
                     Statement Preview      Draft Review         Document Review
```

The shared intake layer owns mailbox connection, source preservation, classification, provenance, duplicate safety, and routing suggestions. Destination modules retain their own permissions, review rules, and commit boundaries.

AI classification is advisory. It must never directly commit financial, payroll, or project records.

---

# Phase 1 — Shared Email Intake Foundation + Cash & Banking

## Goal

Fix the current Gmail production reliability issue, generalize Gmail from invoice-only intake into shared Email Intake, and add a safe Gmail bank-statement path that reuses the existing Cash & Banking statement parser and confirmation flow.

## Known Gmail bug to fix first

The existing client/server Gmail credential contract is inconsistent.

Current client behavior effectively sends:

```text
X-Gmail-Access-Token: <raw-google-access-token>
```

Current server parsing expects:

```text
X-Gmail-Access-Token: Bearer <google-access-token>
```

This can produce:

```text
Gmail authorization is missing or expired.
```

after OAuth otherwise appears successful.

Fix the contract with one canonical Bearer format. Do not weaken the server to arbitrary token formats. Never log or persist raw Gmail access tokens.

## Gmail connection reliability

Preserve read-only Gmail scope:

```text
https://www.googleapis.com/auth/gmail.readonly
```

Do not request Gmail modify/send/compose scopes.

Improve:

- pending state during connection;
- visible OAuth/linking errors;
- reconnect behavior for expired/revoked Google authorization;
- separation between Engoryx authentication and Gmail authorization;
- preservation of the Engoryx session when Gmail authorization fails.

Do not introduce insecure refresh-token persistence or browser-exposed Google client secrets.

## Shared classifier

Refactor the current invoice-centric `EmailClassification` concept into an extensible shared financial-document classification contract.

Actionable destinations in this phase:

- `INVOICE`
- `BANK_STATEMENT`
- `OTHER` / `UNSUPPORTED`

The contract should remain extensible for later phases without advertising unsupported destinations yet.

Suggested classification output should include:

- document/category type;
- suggested destination;
- confidence;
- concise reason;
- optional destination-specific hints.

## Gmail candidate search

Preserve existing invoice candidate discovery while adding bounded bank-statement discovery.

Support likely statement signals such as:

- statement;
- account statement;
- bank statement;
- transaction statement;
- e-statement;
- monthly statement.

Prefer attachments already supported by Cash & Banking, such as CSV, XLSX, and PDF where the current parser actually supports them.

Do not indiscriminately scan or import the whole mailbox.

## Source preservation

Reuse the existing `email_messages` and `source_documents` architecture.

Preserve the audit chain:

```text
Gmail message
    -> source document
    -> destination review/import record
```

For bank statements, extend the financial import provenance only if the existing schema cannot durably link the statement import to its source document/email. Use the smallest additive migration necessary.

## Cash & Banking flow

Reuse the current statement pipeline. Do not build a second parser for Gmail.

Required flow:

```text
Gmail candidate
    -> classify BANK_STATEMENT
    -> user chooses Review statement
    -> preserve message + selected attachment
    -> select/suggest FinancialAccount
    -> existing statement parser
    -> existing StatementPreview
    -> user reviews transactions / duplicates / balances
    -> explicit confirmation
    -> existing commit workflow
```

No financial transaction may be persisted merely because an email was classified as a statement.

Ambiguous account matches require explicit user selection.

## Permissions

Mailbox access and financial authority remain separate.

Conceptually:

- Gmail read permission permits scanning/viewing supported candidates;
- existing Gmail import/manage permission governs preservation/import where applicable;
- invoice permissions govern invoice extraction/review;
- Cash & Banking permissions govern statement preview/commit.

A Gmail connection alone must never grant Cash & Banking mutation authority.

## Backward compatibility

Existing Gmail invoice intake must remain functional, including:

- invoice classification;
- source preservation;
- extraction;
- Invoice Review Queue behavior;
- duplicate detection;
- source metadata;
- audit trail.

## UI direction

Move the product concept from invoice-specific `Gmail inbox` toward a shared `Email Intake` / `Connected Mailbox` experience while preserving backward-compatible routes/deep links where needed.

The page should expose:

- mailbox connection/read-only state;
- connected address;
- reconnect state;
- scan window;
- candidate type;
- confidence;
- suggested destination;
- source/attachment details;
- explicit destination action.

Do not create duplicate mailbox pages with independent connection state.

## Phase 1 completion gate

Before merge:

- Gmail bearer-header regression test passes;
- expired/revoked authorization is handled clearly;
- Gmail failure does not sign the user out of Engoryx;
- invoice Gmail flow still works;
- bank statement candidates reach the existing statement preview path;
- explicit user confirmation remains required before bank transaction commit;
- provenance is auditable;
- permission boundaries are enforced;
- full tests/lint/build pass;
- workflow-map validation passes;
- Demo Visual QA passes;
- migration reset/upgrade/pgTAP pass if database files changed.

---

# Phase 2 — Email Intake → Expenses / Receipts

## Goal

Route supported emailed receipts and bills into a reviewable Expense draft workflow while preserving the same shared mailbox and source-document architecture established in Phase 1.

## Intended flow

```text
Email candidate
    -> classify RECEIPT / EXPENSE_DOCUMENT
    -> preserve source
    -> extract suggested expense fields
    -> create or prepare DRAFT expense
    -> human verification
    -> explicit approve/save action
```

## Expected extracted suggestions

Where supported by evidence:

- merchant/payee;
- receipt/invoice date;
- amount;
- currency;
- category suggestion;
- payment/reference details;
- optional project/cost-code suggestion.

AI-generated values remain suggestions until reviewed.

## Important boundaries

- do not create approved/paid expenses automatically;
- preserve original email/attachment provenance;
- retain duplicate protection;
- use existing Expense lifecycle/status semantics;
- project allocation remains optional and must not be guessed as authoritative;
- expense mutation requires Expense permissions independent of Gmail access.

## Phase 2 completion gate

- receipt/bill classification works without breaking Phase 1 routes;
- draft expense creation is auditable;
- source document is recoverable from the expense review flow;
- duplicates are safely surfaced;
- project/account suggestions do not silently commit;
- full CI/browser/security validation passes.

---

# Phase 3 — Email Intake → Project / Engineering Documents

## Goal

Extend Shared Email Intake to engineering/project correspondence and attachments while reusing existing Engineering Documents, RFI, submittal, and project-context contracts rather than inventing parallel storage.

## Candidate document types

Examples may include:

- purchase orders;
- delivery receipts;
- quotations;
- project billing correspondence;
- change-order attachments;
- contracts;
- drawings/technical documents;
- RFI/submittal-related attachments.

The exact actionable set should be selected from the current repository capabilities when this phase begins.

## Intended flow

```text
Email candidate
    -> classify engineering/project document
    -> preserve email + attachment
    -> suggest project / document type
    -> user reviews target project and metadata
    -> explicit save/import
    -> existing Engineering Documents / project workflow
```

## Important boundaries

- never silently assign a project when evidence is ambiguous;
- do not create new parallel engineering-document tables if current domain models can be reused;
- preserve revisions/source identity;
- maintain project/company authorization;
- Gmail access alone grants no project mutation authority.

## Phase 3 completion gate

- selected engineering document types route safely;
- project selection is explicit when ambiguous;
- revision/source provenance is preserved;
- existing RFI/submittal/document lifecycle behavior remains intact;
- full CI/browser/security validation passes.

---

# Phase 4 — Shared Intake Automation, Rules, and Assistant Integration

## Goal

After the destination workflows are stable, add controlled automation that reduces repetitive review work without weakening confirmation or permission boundaries.

Potential scope:

- saved sender/domain routing rules;
- trusted-document heuristics;
- configurable scan schedules;
- inbox filters by destination/status;
- duplicate/suspected-duplicate queues;
- batch preparation of candidates;
- Assistant navigation and explanation of Email Intake;
- Assistant preparation of supported actions under existing prepared-action/confirmation contracts.

## Explicitly not allowed

Even in this phase, do not permit:

- autonomous bank transaction posting;
- autonomous expense approval/payment;
- autonomous project mutation without the applicable confirmation model;
- mailbox access that bypasses effective permissions;
- token/secret exposure to the Assistant model.

## Phase 4 completion gate

Automation must remain deterministic, auditable, permission-aware, reversible where appropriate, and bounded by the same confirmation rules as direct UI actions.

---

# Deferred — Payroll Email Intake

Do not connect Gmail to Payroll as part of Phases 1–4 by default.

Payroll documents involve more sensitive employee and compensation data. Any future payroll-email feature should receive its own security/privacy review and explicit product decision before implementation.

---

# Global invariants for every phase

1. One deployment serves one client company; all persisted data remains company-scoped.
2. One connected mailbox integration should be reusable across supported destinations.
3. Gmail remains read-only unless a future explicit product decision changes that.
4. Raw Gmail access tokens must never be logged or stored in application records.
5. Original emails and attachments should remain auditable through existing source-preservation primitives.
6. AI classifies/suggests; destination modules decide and commit.
7. Gmail authorization never grants destination mutation authority.
8. Existing lifecycle, RLS, permission, and confirmation contracts take precedence over convenience.
9. Reuse existing parsers/domain models instead of building duplicate subsystems.
10. Preserve backward compatibility as each new destination is introduced.
11. Do not weaken RLS or Storage isolation.
12. Browser evidence must distinguish mocked/demo evidence from live Google/Supabase production proof.

---

# Implementation sequencing

Implement and merge one phase at a time.

Recommended order:

1. **Phase 1:** Gmail reliability + shared intake + Cash & Banking statements.
2. **Phase 2:** receipts/bills -> Expense draft review.
3. **Phase 3:** project/engineering document routing.
4. **Phase 4:** controlled rules/automation/Assistant integration.
5. **Payroll email intake:** separate future security-reviewed decision.

Do not collapse these into one oversized PR.

For substantial phases with at least two independent workstreams, follow `AGENTS.md`: maximum 2 concurrent subagents, use both slots early, give them non-overlapping implementation ownership, and let the lead own shared contracts, conflict-heavy integration, security interpretation, final validation, push, and PR creation.

---

# Fresh-chat handoff

A new implementation chat should begin by:

1. reading `AGENTS.md`;
2. reading this roadmap;
3. pulling CURRENT latest `main` rather than trusting the SHA recorded above;
4. checking whether the previous phase has already been implemented/merged;
5. implementing only the next incomplete phase;
6. opening a PR and not merging it during the implementation task unless explicitly asked later.

At roadmap creation time, **Phase 1 is the next planned implementation phase**.
