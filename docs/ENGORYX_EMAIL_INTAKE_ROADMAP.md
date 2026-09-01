# Engoryx Shared Email Intake Roadmap

Status: **Core finance Email Intake complete.** Phase 1 through Phase 4F are merged.

Merged sequence:

- Phase 1 — PR #49
- Phase 2 — PR #50
- Phase 3 — PR #51
- Phase 4A — PR #52
- Phase 4B — PR #53
- Phase 4C — PR #54
- Phase 4D — PR #55
- Phase 4D.1 — PR #57
- Phase 4E — PR #58
- Phase 4F — PR #59

Current scope:

- repository: `Juvialski/InvoiceApp`
- product: Engoryx Engineering Operations Platform
- one deployment serves one client company
- one connected read-only Gmail experience is shared across supported finance workflows
- supported destinations are Invoices, Cash & Banking / bank statements, and Expenses / receipts
- Engineering / Project Email Intake remains deferred
- Payroll Email Intake remains deferred and requires a separate security/privacy decision

The detailed completed hardening baseline is recorded in `docs/ENGORYX_FINANCIAL_INTAKE_HARDENING_PLAN.md`.

The next platform optimization work is documented in `docs/ENGORYX_DATABASE_STORAGE_OPTIMIZATION_PLAN.md`.

---

# Product flow

```text
Google Gmail
    -> Top-level Email Intake
    -> bounded candidate discovery
    -> saved sender/template matching
    -> deterministic classification
    -> AI classification only when ambiguity remains
    -> source preservation
    -> destination-specific extraction/parsing
    -> duplicate + existing-record + same-batch resolution
    -> shared review queue
       -> Invoice Review
       -> Cash & Banking Statement Review
       -> Expense Review
    -> explicit human confirmation
    -> destination commit
```

Email Intake is a preparation and review system. It is not an autonomous posting system.

AI may classify, extract, explain, and suggest. It does not independently verify invoices, post bank transactions, approve/pay expenses, or silently mutate authoritative master data.

---

# Delivered phases

## Phase 1 — Shared Email Intake Foundation + Cash & Banking

Status: merged in PR #49.

Delivered:

- canonical Gmail authorization contract;
- Gmail authorization separated from the Engoryx/Supabase session;
- bounded mailbox scanning;
- Invoice routing preserved;
- bank-statement routing added;
- original email/attachment preservation;
- existing Cash & Banking parser reused;
- explicit confirmation before transaction commit;
- source provenance linked to financial imports.

## Phase 2 — Expenses / Receipts

Status: merged in PR #50.

Delivered:

- expense/receipt discovery;
- supported PDF/image receipt attachments;
- advisory extracted fields;
- source preservation and integrity checks;
- duplicate warnings;
- explicit Expense review before save;
- Gmail and Expense permissions kept separate.

## Phase 3 — Top-Level Email Intake + Gmail Reliability UX

Status: merged in PR #51.

Delivered:

- top-level Email Intake navigation;
- Invoice, Bank Statement, and Expense candidates in one mailbox experience;
- legacy `/inbox` compatibility;
- healthy / reconnect-required / never-connected / unconfigured Gmail states;
- reconnect isolated from the Engoryx login session;
- bounded scan controls and reconnect UX;
- finance candidate filters/counts.

Permanent reliability rule: ordinary parsing, network, or extraction errors must not be treated as Gmail authorization loss. Only genuine Gmail authorization failures trigger reconnect-required state.

## Phase 4A — Intake Efficiency Foundation

Status: merged in PR #52.

Delivered:

- deterministic-first classification;
- company-scoped sender/domain/template profiles;
- saved rules remain advisory and permission-aware;
- bounded Gmail discovery using known finance signals;
- AI classification reserved for ambiguous candidates.

## Phase 4B — Existing-Record + Same-Batch Entity Resolution

Status: merged in PR #53.

Delivered:

- Vendor resolution;
- FinancialAccount resolution;
- same-batch grouping;
- proposed actions such as `LINK_EXISTING`, `ENRICH_EXISTING`, `CREATE_NEW`, `POSSIBLE_DUPLICATE`, and `NEEDS_REVIEW`;
- conflict reporting instead of silent overwrite.

## Phase 4C — Invoice Intake Hardening

Status: merged in PR #54.

Delivered:

- source/hash/message/attachment duplicate short-circuiting;
- Vendor matching before new-Vendor proposals;
- multiple Invoice attachments per email;
- forwarded-copy handling;
- extraction quality/retry behavior;
- source preview/recovery;
- clear candidate -> extracted draft -> verified Invoice boundaries.

## Phase 4D — Bank Statement Hardening

Status: merged in PR #55.

Delivered:

- existing FinancialAccount matching;
- deterministic statement parser profiles;
- CSV/XLS/XLSX/XLSM support;
- duplicate/import provenance protections;
- reconciliation and review boundaries;
- no autonomous transaction posting.

## Phase 4D.1 — Password-Protected PDF Bank Statements

Status: merged in PR #57.

Delivered:

- deterministic text-based PDF statement parsing;
- encrypted-statement password UX;
- passwords held only in transient runtime memory;
- scanned/image-only detection;
- pre-decryption duplicate short-circuiting;
- full human confirmation before Cash & Banking commit.

## Phase 4E — Expense / Receipt Hardening

Status: merged in PR #58.

Delivered:

- deterministic-first receipt extraction;
- AI fallback only when needed;
- no false default amount/currency confidence;
- field-level provenance;
- extraction-quality scoring;
- source/hash duplicate checks;
- strengthened Expense duplicate matching;
- Vendor resolution using extracted receipt evidence;
- responsive source + review UX.

## Phase 4F — Shared Queue Hardening

Status: merged in PR #59.

Delivered:

- first-class shared finance review queue;
- queue states for discovery, preparation, review, duplicates, failures, and completion;
- source-preservation state surfaced explicitly;
- duplicate state surfaced before unnecessary reprocessing;
- advisory Vendor/FinancialAccount match presentation;
- same-batch overlap/grouping;
- destination/status/duplicate/search filters;
- safe multi-item preparation with per-item failure isolation;
- exact duplicates excluded from batch preparation;
- no autonomous destination posting or approval.

---

# Core finance Email Intake completion state

The current finance scope is considered complete when the merged implementation continues to satisfy these invariants:

1. Obvious finance candidates can be discovered/classified without AI.
2. AI classification is used only when deterministic evidence remains ambiguous.
3. Original sources remain recoverable and auditable.
4. Existing-record and same-batch resolution occurs before proposing new entities.
5. Strong duplicate evidence short-circuits unnecessary preparation/extraction.
6. Conflicts are surfaced instead of silently overwritten.
7. Structured bank statements reuse deterministic parsers.
8. Gmail authorization does not grant Invoice, Expense, Vendor, or Cash & Banking mutation authority.
9. Final financial mutations remain permission-aware and human-confirmed.
10. Gmail remains read-only under the current product decision.
11. Raw Gmail tokens are never persisted in application records or logs.
12. One deployment serves one client company and persisted data remains company-scoped.
13. RLS, Storage isolation, lifecycle rules, and audit/provenance rules remain authoritative.
14. Browser evidence distinguishes demo/mocked proof from live Google/Supabase production proof.

---

# Later — Controlled Automation and Assistant Integration

This is optional follow-on work, not unfinished core Email Intake scope.

Possible later capabilities:

- suggestions to create sender/template profiles after repeated successful reviews;
- configurable mailbox scan schedules;
- trusted-document heuristics bounded by existing confirmation rules;
- Assistant navigation and explanation of Email Intake;
- Assistant preparation of supported actions under existing permission and confirmation contracts.

Even later automation must not permit:

- autonomous bank transaction posting;
- autonomous Expense approval/payment;
- silent Invoice verification;
- mailbox access that bypasses effective permissions;
- token/secret exposure to the Assistant model.

---

# Deferred — Engineering / Project Email Intake

Do not implement Gmail routing for drawings, RFIs, submittals, contracts, change orders, project correspondence, or other Engineering Documents until explicitly re-prioritized.

If reactivated later, reuse the existing Engineering Document/RFI/Submittal lifecycle and permission contracts instead of creating parallel storage or workflow systems.

---

# Deferred — Payroll Email Intake

Do not connect Gmail to Payroll by default.

Payroll documents contain sensitive employee and compensation data. Any future Payroll Email Intake feature requires an explicit product decision plus its own security/privacy review.

---

# Global invariants

1. One deployment serves one client company.
2. One connected mailbox integration is reused across supported financial destinations.
3. Gmail remains read-only unless an explicit future decision changes that.
4. Raw Gmail access tokens must never be logged or stored in application records.
5. Original emails and attachments remain auditable through source-preservation primitives.
6. AI classifies/extracts/suggests; destination modules decide and commit.
7. Extraction is never equivalent to creation.
8. Gmail authorization never grants destination mutation authority.
9. Existing lifecycle, RLS, permission, and confirmation contracts take precedence over convenience.
10. Existing records and same-batch candidates are considered before proposing new entities.
11. Conflicting authoritative entity data requires review.
12. Backward compatibility for `/email-intake` and legacy `/inbox` remains required.
13. Do not weaken RLS or Storage isolation.
14. Gmail authorization failure never signs the user out of Engoryx.

---

# Current handoff

For new work:

1. read `AGENTS.md`;
2. pull CURRENT latest `main`;
3. use WM-5 as the primary repository/workflow navigation layer;
4. treat Phase 1 through 4F finance Email Intake as completed baseline behavior;
5. do not reopen Email Intake phases unless a regression or explicit new product requirement requires it;
6. for the next optimization initiative, read `docs/ENGORYX_DATABASE_STORAGE_OPTIMIZATION_PLAN.md`;
7. keep the permanent maximum of 2 concurrent subagents;
8. open focused PRs and do not merge implementation PRs until exact-head required CI is clean.
