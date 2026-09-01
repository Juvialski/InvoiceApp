# Engoryx Financial Intake Hardening Plan

Status: **COMPLETE for the current finance Email Intake scope.**

Merged waves:

- Phase 4A — PR #52
- Phase 4B — PR #53
- Phase 4C — PR #54
- Phase 4D — PR #55
- Phase 4D.1 — PR #57
- Phase 4E — PR #58
- Phase 4F — PR #59

This document is now the durable completed architecture baseline for finance Email Intake. It covers Invoices, Cash & Banking / bank statements, and Expenses / receipts. Engineering Documents and Payroll Email Intake remain outside the current scope.

The next platform optimization initiative is defined in `docs/ENGORYX_DATABASE_STORAGE_OPTIMIZATION_PLAN.md`.

---

# Product objective

Engoryx must not treat every discovered email as a separate AI job, and extraction must never imply creation of a business entity or financial record.

The completed finance intake funnel is:

```text
Gmail
  -> bounded candidate discovery
  -> known sender/template rules
  -> deterministic classification
  -> AI classification only for ambiguous candidates
  -> preserve selected source
  -> destination-specific extraction/parsing
  -> normalization
  -> existing-record + same-batch resolution
  -> duplicate evaluation
  -> shared review queue
  -> proposed action
       - link existing
       - enrich existing
       - create new
       - possible duplicate
       - needs review
  -> human confirmation
  -> destination commit
```

AI remains advisory. No classifier, extractor, sender rule, queue action, or entity matcher may directly post bank transactions, approve/pay Expenses, verify Invoices, or silently create/replace authoritative master data.

---

# Completed architectural baseline

## 1. Cheap candidate discovery

The first mailbox stage normally requires zero AI calls.

Use bounded Gmail search/history and deterministic metadata signals such as:

- sender address/domain;
- subject terms;
- attachment filename and MIME type;
- Invoice / Statement / Receipt keywords;
- saved company sender/template profiles.

Do not indiscriminately send mailbox contents or attachments to Gemini.

## 2. Saved sender/template profiles

Profiles are company-scoped advisory data. They may suggest:

- destination;
- existing Vendor;
- existing FinancialAccount;
- expected attachment pattern;
- parser/template profile;
- Expense category.

They never bypass destination permissions, duplicate checks, entity resolution, or human review.

Do not hardcode bank or supplier sender addresses as globally authoritative.

## 3. Deterministic-first classification

Classification preference:

```text
Level 1 - known sender/template profile
Level 2 - generic deterministic classifier
Level 3 - AI metadata/text classification only for ambiguity
Level 4 - unsupported / manual review
```

AI classification should use bounded metadata/text where possible rather than uploading every attachment merely to decide its destination.

## 4. Destination-specific extraction

### Invoices

Reuse the established Invoice extraction, quality evaluation, retry/fallback, source preservation, duplicate detection, Vendor resolution, and review workflow.

Multiple attachments may represent separate Invoices. One email must not be assumed to equal one Invoice.

### Bank statements

Structured CSV/XLS/XLSX/XLSM statements use deterministic Cash & Banking parsing where supported.

Text-based PDFs use the deterministic statement parsing path where supported, including password-protected PDFs through transient password handling.

FinancialAccount matching occurs before commit.

No autonomous transaction posting.

### Expenses / receipts

Use deterministic extraction for structured receipts where practical and AI only when required for unstructured/ambiguous sources.

Expense review remains explicit. Email Intake does not automatically approve or pay Expenses.

## 5. Extraction is not creation

All extracted candidates pass through normalization and entity/record resolution before mutation proposals.

Possible resolution actions include:

```text
LINK_EXISTING
ENRICH_EXISTING
CREATE_NEW
POSSIBLE_DUPLICATE
NEEDS_REVIEW
```

A strong existing match should prefer linking to the existing entity.

`ENRICH_EXISTING` is a proposal for reviewed safe additions. It must never silently replace conflicting authoritative data.

## 6. Batch-aware entity resolution

Candidate resolution considers:

1. existing company records; and
2. other candidates in the current intake batch.

This prevents several documents from the same new supplier/account from independently proposing duplicate entities.

Contradictory evidence lowers confidence or requires review. Processing order must never silently overwrite another candidate's extracted identity evidence.

## 7. Vendor resolution

Strong evidence may include:

- tax/TIN identity;
- exact known sender address;
- saved Vendor-linked profile;
- verified company email/domain;
- registered/trade name;
- address/phone evidence.

Reliable TIN/tax identity outweighs fuzzy display-name similarity.

Never auto-merge Vendors based only on similar names.

## 8. FinancialAccount resolution

Useful evidence may include:

- institution;
- account number or safely masked identifier;
- suffix;
- currency;
- account name;
- bank sender/template profile;
- prior statement-import relationships.

Strong existing matches reuse existing accounts. Ambiguous masked identities require explicit review.

## 9. Duplicate resolution

Entity resolution and record/document duplicate detection remain separate concerns.

### Invoice evidence

- preserved source/hash;
- Gmail message/attachment identity;
- Vendor identity;
- invoice number;
- date/amount where appropriate.

### Expense evidence

- source document/hash;
- receipt/reference number;
- resolved payee/vendor;
- date + amount;
- lifecycle status.

### Statement/import evidence

Cash & Banking file-fingerprint, source/import-batch, and transaction protections remain authoritative.

Known senders never bypass duplicate checks.

## 10. Same-email and cross-email overlap

The intake layer handles:

- multiple attachments in one email;
- forwarded copies;
- repeated statement delivery;
- duplicate supplier/internal forwards;
- multiple emails from one new supplier in one scan.

Check strong source identity/hash evidence before expensive extraction where possible.

## 11. AI cost discipline

Default strategy:

```text
candidate discovery       -> no AI
known sender matching     -> no AI
generic classification    -> no AI
ambiguous classification  -> AI only when needed
structured bank parsing   -> no AI when deterministic parser applies
invoice extraction        -> AI when document extraction requires it
structured receipt parse  -> no AI when deterministic extraction is sufficient
unstructured receipt      -> AI when required
```

Do not sacrifice correctness merely to reduce calls.

## 12. Shared review queue

Phase 4F adds the shared operations layer across finance candidates.

The queue surfaces:

- destination;
- preparation/review status;
- source preservation status;
- duplicate evidence;
- Vendor/FinancialAccount hints;
- same-batch grouping;
- item errors;
- received/discovered time;
- primary review action;
- safe batch preparation eligibility.

Safe batch preparation is preparation only. It must not become batch posting.

Exact duplicates are not eligible for normal batch preparation.

One item failure does not have to abort unrelated eligible candidates.

## 13. Permission and audit boundaries

Keep authorization concerns separate:

- Gmail authorization;
- Gmail management capability;
- Invoice permissions;
- Cash & Banking permissions;
- Expense permissions;
- Vendor/account master-data authority.

Mailbox access never grants destination mutation permission.

Source preservation, proposed links/updates, user decisions, and committed financial records remain auditable and company-scoped.

---

# Completion criteria

The current Phase 4 finance intake hardening is complete because the merged implementation is designed and tested around these criteria:

- obvious finance candidates can be discovered/classified without AI;
- recurring sender/template profiles improve routing without becoming mutation authority;
- ambiguous classification uses AI only when needed;
- structured bank statements reuse deterministic parsers;
- encrypted text-based PDF statements have a bounded transient-password path;
- extracted entities are compared with existing records before create/update proposals;
- same-batch candidates are considered before proposing new entities;
- strong FinancialAccount matches reuse existing accounts;
- conflicts are surfaced rather than silently overwritten;
- duplicate source/document/import protections remain authoritative;
- source/provenance remains recoverable;
- shared queue status is explicit;
- batch preparation remains non-posting and permission-aware;
- final financial mutations remain human-confirmed;
- required tests, migration checks, build, workflow-map validation, and browser QA pass on merged Phase 4F.

---

# Frozen invariants for future work

Future platform optimization, Assistant features, or automation must preserve these rules:

1. Gmail remains read-only under the current product decision.
2. Raw Gmail access tokens are never persisted in business records or logs.
3. Gmail authorization failure does not sign the user out of Engoryx.
4. Ordinary parser/extraction/network failures are not Gmail reconnect events.
5. Source preservation is not implied by Gmail metadata alone.
6. Extraction is not creation.
7. Duplicate checks remain authoritative before unnecessary expensive processing.
8. Existing-record and same-batch entity resolution precede new-entity proposals.
9. Conflicting authoritative values require review.
10. No autonomous bank posting, Expense approval/payment, or Invoice verification.
11. One deployment serves one client company.
12. Persisted data remains company-scoped and existing RLS/Storage isolation must not be weakened.

---

# Deferred / optional follow-on work

## Controlled automation and Assistant integration

Optional later work may include scheduled scans, profile suggestions, Assistant navigation/explanation, or Assistant preparation of supported actions.

Those features must use the existing permission and confirmation boundaries and must not create a second Email Intake architecture.

## Engineering / Project Email Intake

Deferred until explicitly re-prioritized.

## Payroll Email Intake

Deferred and requires a separate security/privacy review before implementation.

---

# Current engineering handoff

Phase 4 finance Email Intake is no longer the next implementation target.

For the next platform optimization initiative:

1. pull CURRENT latest `main`;
2. read `AGENTS.md`;
3. use WM-5 to inspect current storage/data workflows;
4. read `docs/ENGORYX_DATABASE_STORAGE_OPTIMIZATION_PLAN.md`;
5. treat this document as a compatibility baseline that storage/database changes must preserve;
6. use at most 2 concurrent subagents;
7. implement optimization in focused PR-sized waves;
8. do not merge implementation PRs until exact-head required CI is clean.
