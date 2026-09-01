# Engoryx Shared Email Intake Roadmap

Status: Phase 1 merged (PR #49), Phase 2 merged (PR #50), Phase 3 merged (PR #51), Phase 4A merged (PR #52), Phase 4B merged (PR #53), Phase 4C merged (PR #54), Phase 4D merged (PR #55), Phase 4D.1 merged (PR #57), Phase 4E merged (PR #58), Phase 4F implemented in `feat/email-intake-phase-4f-shared-queue-hardening` (Shared Queue Hardening).

Current direction:

- repository: `Juvialski/InvoiceApp`
- product: Engoryx Engineering Operations Platform
- one deployment serves one client company
- Email Intake is a shared finance capability, not an Invoice-only feature
- active priorities are Invoices, Cash & Banking / bank accounts / bank statements, and Expenses / receipts
- Engineering Documents email intake is deferred
- Payroll email intake is deferred

This roadmap is the durable high-level sequence. The detailed next-phase design is in `docs/ENGORYX_FINANCIAL_INTAKE_HARDENING_PLAN.md`.

## Product direction

Engoryx should have one connected read-only Gmail experience for supported finance workflows.

```text
Google Gmail
    -> Top-level Email Intake
    -> bounded candidate discovery
    -> source preservation
    -> financial classification
       -> Invoice Review
       -> Cash & Banking Statement Preview
       -> Expense Review
```

The shared intake layer owns mailbox connection state, source preservation, classification, provenance, duplicate safety, and routing suggestions. Destination modules retain their own permissions, lifecycle rules, review rules, and commit boundaries.

AI classification/extraction is advisory. Extraction never implies automatic record creation or financial posting.

---

# Phase 1 — Shared Email Intake Foundation + Cash & Banking

Status: merged in PR #49.

Delivered direction:

- canonical Gmail Bearer-token contract;
- Gmail authorization separated from Engoryx/Supabase authentication;
- Gmail failure does not sign the user out of Engoryx;
- bounded mailbox scanning;
- Invoice routing preserved;
- supported bank-statement routing added;
- original email/attachment preservation;
- existing Cash & Banking parser and `StatementPreview` reused;
- explicit confirmation required before financial transaction commit;
- statement import provenance linked to preserved source documents.

Permanent boundaries:

- Gmail remains read-only;
- raw Gmail tokens are never stored in application records;
- Gmail access never grants Cash & Banking mutation authority;
- ambiguous FinancialAccount matches require explicit user selection;
- statement classification alone never creates transactions.

---

# Phase 2 — Email Intake → Expenses / Receipts

Status: merged in PR #50.

Delivered direction:

- receipt/expense candidate discovery;
- supported PDF/image receipt attachments;
- advisory payee/date/amount/currency/category/payment/reference/project suggestions;
- original source preservation and integrity validation;
- duplicate warnings using source/reference/payee+amount+date evidence;
- explicit Expense review before save;
- Gmail and Expense permissions remain separate;
- project hints remain advisory and are not silently committed;
- Invoice classification retains precedence over ambiguous Invoice/receipt mail.

Permanent boundaries:

- no automatic approved/paid Expense creation;
- no silent project allocation;
- no Gmail-only Expense authority;
- preserved source remains recoverable from the review workflow.

---

# Phase 3 — Top-Level Email Intake + Gmail Reliability UX

Status: merged in PR #51.

Goal:

Complete the product-level transition from an Invoice-specific Gmail surface to a first-class shared financial Email Intake experience.

Implemented direction:

- canonical top-level Email Intake navigation;
- shared page for Invoice, Bank Statement, and Expense candidates;
- compatibility for the legacy `/inbox` route;
- removal of the redundant visible Gmail child under Invoices;
- explicit Gmail connection states: healthy, reconnect required, never connected, unconfigured;
- Gmail reconnect remains separate from the Engoryx session;
- scan controls are gated when Gmail authorization is unavailable;
- reconnect returns to the Email Intake route;
- candidate destination filters/counts;
- Manual Invoice Email Fallback made secondary rather than dominating the shared page.

Important state rule:

A known mailbox address or previous sync record is metadata only. It must never cause the UI to show a healthy `Connected mailbox` state without currently usable Gmail authorization.

Likewise, ordinary scan/validation/network errors must not be misclassified as expired Gmail authorization. Only actual Gmail authorization failures should move the UI into reconnect-required state.

Phase 3 completion gate:

- Email Intake is reachable from top-level navigation;
- old Invoice/Gmail compatibility route still resolves correctly;
- Invoice, Bank Statement, and Expense handoffs still work;
- stale `Connected` UI cannot coexist with expired/revoked Gmail authorization;
- ordinary non-auth scan errors do not force Gmail reconnect state;
- Gmail failure does not sign the user out of Engoryx;
- scan gating and reconnect UX are clear;
- mobile/tablet/desktop browser QA passes;
- tests/lint/build/workflow-map/required CI gates pass.

---

# Phase 4 — Financial Intake Hardening

Status: next after Phase 3 is merged.

Detailed implementation design:

`docs/ENGORYX_FINANCIAL_INTAKE_HARDENING_PLAN.md`

## Core architectural change

Phase 4 should make Email Intake efficient and existing-record-aware.

Target funnel:

```text
Gmail
  -> bounded candidate discovery
  -> saved sender/template matching
  -> deterministic classification
  -> AI classification only for ambiguous candidates
  -> source preservation
  -> destination-specific extraction/parsing
  -> normalization
  -> existing-record + same-batch resolution
  -> proposed link/update/create/duplicate/review action
  -> human confirmation
  -> destination commit
```

The first stages should normally require zero AI calls.

Do not send every discovered email or attachment to Gemini just to decide whether it is financial.

## 4A — Intake efficiency foundation

Status: implemented in feature branch `feat/email-intake-phase-4a-efficiency-rules`.

Priorities:

- consolidate any overlapping classification paths so the shared deterministic classifier is authoritative for obvious cases;
- use Gmail search/history and deterministic metadata first;
- add company-scoped saved sender/domain/template profiles for recurring banks, suppliers, partners, utilities, and similar finance senders;
- allow profiles to suggest destination, existing Vendor, existing FinancialAccount, expected attachment pattern, parser/template profile, or Expense category where appropriate;
- saved profiles remain advisory and permission-aware;
- use AI metadata/text classification only for genuinely ambiguous candidates;
- when safe, batch multiple ambiguous metadata-only candidates into a bounded structured classifier request rather than one AI call per email;
- preserve source message identity in every classifier result.

Do not hardcode bank sender addresses as globally authoritative. Real sender addresses/templates change and must be company-editable data.

## 4B — Existing-record and same-batch entity resolution

Extraction must never equal creation.

Before proposing new Vendors, FinancialAccounts, or destination records, compare the extracted candidate with:

1. existing company records; and
2. other candidates in the current intake batch.

Possible proposal states:

```text
LINK_EXISTING
ENRICH_EXISTING
CREATE_NEW
POSSIBLE_DUPLICATE
NEEDS_REVIEW
```

A strong existing match should normally link to the existing entity rather than create a duplicate.

`ENRICH_EXISTING` means a reviewed proposal to add safe information. It must never silently replace conflicting authoritative values.

Multiple emails from the same previously unknown supplier should be able to resolve to one proposed new Vendor instead of independently proposing several duplicate Vendors.

## 4C — Invoice intake hardening

Status: merged in PR #54.

Delivered direction:

- source/hash/message/attachment duplicate short-circuiting before expensive extraction;
- Vendor matching before proposing new Vendor data;
- multiple Invoice attachments in one email;
- forwarded copies of the same Invoice;
- extraction quality/retry behavior;
- source preview/recovery;
- clear candidate → extracted draft → verified Invoice boundaries.

## 4D — FinancialAccount and statement hardening

Status: merged in PR #55.

Bank statement intake must prefer existing FinancialAccounts when identity evidence is strong.

Useful evidence may include:

- bank/institution;
- account number or safely stored/masked account identity;
- account suffix;
- currency;
- account name;
- saved bank sender/template profile;
- previous statement-import relationship.

Example:

```text
BDO statement + account ending 4821 + PHP
    -> existing BDO Operating Account ending 4821
    -> suggest LINK_EXISTING
```

If several accounts plausibly match, explicit account selection remains required.

Supported spreadsheet statements (CSV, XLSX, XLS, XLSM) continue using the deterministic Cash & Banking parser with verified column mappings.

No autonomous transaction posting.

## 4D.1 — Password-Protected PDF Bank Statement Support

Status: merged in PR #57.

Scope & Implementation:

- **PDF Statement Parsing Engine**: Deterministic extraction of machine-readable text and layout coordinates from text-based PDFs using `pdfjs-dist` (`^4.10.38`) with standard text-position matrix reconstruction, line grouping, and column alignment.
- **Password Protection UX**: Clean password prompts for encrypted statements (`PASSWORD_REQUIRED`, `INCORRECT_PASSWORD`, `UNLOCKING`) with show/hide password toggle.
- **Transient Memory Security**: Zero persistent storage of statement passwords. Passwords are never saved in Supabase, `localStorage`, `sessionStorage`, IndexedDB, profiles, or log streams. Stored strictly in transient runtime memory (`statementSessionMemory.ts`) with automatic purging on sign-out or session end. Optional in-memory reuse within the active session.
- **Scanned / Image-Only Statement Detection**: Safely detects scanned or non-text PDFs and surfaces clear guidance (`SCANNED_OR_IMAGE_ONLY`) without crashing or calling AI.
- **Pre-Decryption Duplicate Short-Circuiting**: Automatically detects existing imported batches via source document / file provenance before prompting for password.
- **Institution & Maya Statement Profile**: Deterministic statement parser profile for Maya and standard banking PDF statements with structural validation before applying column mappings.
- **Human Confirmation Gate**: Full preview and verification before committing import to Cash & Banking.

## 4E — Expense / receipt intake hardening

Status: implemented in feature branch `feat/email-intake-phase-4e-expense-receipt-hardening`.

Scope & Implementation:

- deterministic-first extraction for machine-readable PDF receipts (`pdfjs-dist`) and email-body receipts with zero AI calls when fields are clear;
- strict absence of false confidence (missing amounts do not collapse to 0, unknown currency is not falsely coerced to PHP);
- field-level provenance tracking (`DETECTED`, `SUGGESTED`, `AI_EXTRACTED`, `NOT_DETECTED`, `HINT`);
- deterministic quality scoring (`GOOD`, `NEEDS_REVIEW`, `FAILED`);
- pre-extraction duplicate short-circuiting using file SHA-256 and source document ID across company records;
- strengthened expense duplicate engine with reasons and real-time recalculation in review UX (ignoring `VOID` expenses);
- multi-receipt handling per attachment;
- vendor resolution using Phase 4B contracts with receipt evidence outranking stale profile assumptions;
- dual-pane desktop / stacked mobile review UX with embedded live document preview (`<img>`, PDF embed, email snippet) and text inspector.

## 4F — Shared batch and queue UX

Status: implemented in feature branch `feat/email-intake-phase-4f-shared-queue-hardening`.

Scope & Implementation:

- first-class shared review queue unifying candidates across Invoices, Bank Statements, Expenses/Receipts, and Unsupported items;
- deterministic multi-status queue state derivation (`DISCOVERED`, `PREPARING`, `READY_FOR_REVIEW`, `NEEDS_REVIEW`, `SUSPECTED_DUPLICATE`, `FAILED`, `COMPLETED`);
- source preservation status tracking (`PRESERVED`, `PENDING`, `FAILED`) without falsely reporting metadata as preserved;
- duplicate short-circuiting and evidence surfacing across Invoices and Expenses (exact duplicate vs suspected duplicate);
- advisory entity resolution match presentation (Vendor and FinancialAccount linkage, enrichment, proposed creation, conflicts);
- same-batch overlap and grouping across same entity or sender domain;
- real-time operations summary metrics and multi-criteria queue filters (destination, status, duplicateOnly, search);
- safe batch candidate preparation with per-item error isolation, skipping exact duplicates, and zero autonomous posting/commit.

## Phase 4 completion gate

- obvious finance candidates can be discovered/classified without an AI call;
- recurring sender/template profiles improve routing without becoming mutation authority;
- AI classification is reserved for ambiguous cases;
- structured bank statements reuse deterministic parsers;
- extracted entities are compared with existing Engoryx records before create/update proposals;
- same-batch candidates cannot independently create obvious duplicate Vendors/accounts;
- strong FinancialAccount matches reuse existing accounts;
- conflicts are surfaced instead of silently overwritten;
- duplicate source/document/import protections remain authoritative;
- source/provenance remains recoverable;
- final financial mutations remain permission-aware and human-confirmed;
- full CI/browser/security validation passes.

---

# Later — Controlled Automation and Assistant Integration

Only after finance intake hardening is stable should Engoryx consider broader automation such as:

- suggestions to create sender/template profiles after repeated successful reviews;
- configurable scan schedules;
- trusted-document heuristics that remain bounded by destination confirmation rules;
- Assistant navigation/explanation of Email Intake;
- Assistant preparation of supported actions under existing confirmation contracts.

Even later automation must not permit:

- autonomous bank transaction posting;
- autonomous Expense approval/payment;
- silent Invoice verification;
- mailbox access that bypasses effective permissions;
- token/secret exposure to the Assistant model.

---

# Deferred — Engineering / Project Email Intake

Engineering/project documents are not a current priority.

Do not implement Gmail routing for drawings, RFIs, submittals, contracts, change orders, project correspondence, or other Engineering Documents until a future explicit product decision reactivates this scope.

If reactivated later, reuse existing Engineering Document/RFI/Submittal lifecycle and permission contracts rather than inventing parallel storage.

---

# Deferred — Payroll Email Intake

Do not connect Gmail to Payroll by default.

Payroll documents contain more sensitive employee and compensation data. Any future payroll-email feature requires its own security/privacy review and explicit product decision.

---

# Global invariants

1. One deployment serves one client company; persisted data remains company-scoped.
2. One connected mailbox integration is reused across supported financial destinations.
3. Gmail remains read-only unless a future explicit product decision changes that.
4. Raw Gmail access tokens must never be logged or stored in application records.
5. Original emails and attachments remain auditable through existing source-preservation primitives.
6. AI classifies/extracts/suggests; destination modules decide and commit.
7. Extraction is never equivalent to creation.
8. Gmail authorization never grants destination mutation authority.
9. Existing lifecycle, RLS, permission, and confirmation contracts take precedence over convenience.
10. Reuse existing parsers/domain models instead of building duplicate subsystems.
11. Existing records and same-batch candidates must be considered before proposing new entities.
12. Conflicting authoritative entity data must be reviewed rather than silently overwritten.
13. Preserve backward compatibility as shared Email Intake evolves.
14. Do not weaken RLS or Storage isolation.
15. Project/account/entity suggestions remain advisory until destination rules authorize an explicit decision.
16. Gmail authorization failure never signs the user out of Engoryx.
17. Browser evidence must distinguish mocked/demo evidence from live Google/Supabase production proof.

---

# Implementation sequencing

Implement and merge one focused phase/wave at a time.

Current order:

1. **Phase 1:** Gmail reliability + shared intake foundation + Cash & Banking statements — merged.
2. **Phase 2:** receipts/bills → Expense review — merged.
3. **Phase 3:** top-level Email Intake + Gmail reconnect/state UX — merged in PR #51.
4. **Phase 4A:** intake efficiency + saved sender/template profiles + deterministic-first classification — merged in PR #52.
5. **Phase 4B:** existing-record + same-batch Vendor/FinancialAccount resolution — merged in PR #53.
6. **Phase 4C:** Vendor / supplier resolution hardening — merged in PR #54.
7. **Phase 4D:** Bank statement hardening — implemented in `feat/email-intake-phase-4d-bank-statement-hardening` (deterministic parser profiles, CSV/XLS/XLSX/XLSM support, PDF rejection, FinancialAccount resolution with profile conflict handling, exact duplicate short-circuiting, overlapping statement breakdown, full provenance linking).
8. **Phase 4E–4G:** Expense hardening, shared queue hardening, and controlled automation in focused PR-sized waves.
9. **Controlled automation/Assistant integration:** later.
10. **Engineering/Project Email Intake:** deferred until explicitly re-prioritized.
11. **Payroll Email Intake:** separate future security-reviewed decision.

Do not collapse Phase 4 into one oversized PR.

For substantial work with at least two independent workstreams, follow `AGENTS.md`: maximum 2 concurrent subagents, use non-overlapping ownership, and let the lead own shared contracts, conflict-heavy integration, security interpretation, final validation, push, and PR creation.

---

# Fresh-chat handoff

A new implementation chat should begin by:

1. reading `AGENTS.md`;
2. reading this roadmap;
3. reading `docs/ENGORYX_FINANCIAL_INTAKE_HARDENING_PLAN.md` for Phase 4 work;
4. pulling CURRENT latest `main` instead of trusting an old SHA;
5. checking whether PR #51 / Phase 3 has merged;
6. implementing only the next incomplete finance-focused wave;
7. using WM-5 as the primary navigation layer;
8. opening a PR and not merging during implementation unless explicitly asked later.

If PR #51 is merged and no newer finance-intake work supersedes this roadmap, the next implementation wave is **Phase 4A — Intake Efficiency Foundation**.
