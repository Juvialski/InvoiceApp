# Engoryx Financial Intake Hardening Plan

Status: Phase 4A merged (PR #52); Phase 4B merged (PR #53); Phase 4C implemented in feature branch `feat/email-intake-phase-4c-invoice-hardening`.

This document defines the next finance-focused Email Intake hardening work. It covers Invoices, Cash & Banking / bank statements, and Expenses / receipts only. Engineering Documents and Payroll email intake remain deferred.

## Product objective

Engoryx should not treat every discovered email as a separate AI extraction job, and extraction must never imply creation of a new business entity or financial record.

The target flow is a staged funnel:

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
  -> proposed actions
       - link existing
       - enrich/update existing
       - create new
       - possible duplicate
       - needs review
  -> human confirmation
  -> destination commit
```

AI remains advisory. No classifier, extractor, sender rule, or entity matcher may directly post financial transactions, approve expenses, verify invoices, or silently create/replace authoritative master data.

---

# 1. Candidate discovery should be cheap

The first mailbox stage should normally use zero AI calls.

Use Gmail search/history plus deterministic metadata filters to identify likely finance messages. Keep searches bounded by date/history and current Gmail read-only scope.

Candidate signals may include:

- sender address/domain;
- subject terms;
- filename and MIME type;
- known Invoice / Statement / Receipt keywords;
- previously saved company sender profiles.

Initial connection may use a bounded date-window search. Later synchronization should continue using Gmail history IDs so Engoryx evaluates new/changed messages rather than repeatedly rescanning the same mailbox window.

Do not indiscriminately send mailbox contents to Gemini.

---

# 2. Saved sender and template profiles

Add company-scoped finance intake profiles for recurring banks, suppliers, partners, utilities, and other trusted senders.

A profile may contain advisory matching information such as:

- sender email;
- sender domain;
- optional subject pattern;
- optional attachment filename/MIME pattern;
- suggested destination: Invoice, Bank Statement, or Expense;
- linked existing Vendor where appropriate;
- linked existing FinancialAccount where strong bank/account identity is known;
- expected bank/statement format identifier where a deterministic parser profile exists;
- default category suggestion for recurring Expense senders;
- enabled/disabled state.

Example conceptually:

```text
Known bank statement sender
  sender/domain + statement subject + XLSX/CSV
  -> suggest BANK_STATEMENT
  -> suggest existing BDO Operating Account
  -> use known statement parser profile when safe
```

```text
Known supplier sender
  billing@known-supplier.example
  -> suggest INVOICE
  -> suggest existing Vendor record
```

Saved rules improve candidate discovery and matching confidence. They do not bypass destination permissions or review.

Do not hardcode a bank's sender address as globally authoritative. Sender/template profiles are deployment/company data and must be editable because real sender addresses and formats can change.

Future UX may suggest creating a sender profile after repeated successful reviews, but the user must explicitly accept the rule before it becomes active.

---

# 3. Classification confidence ladder

Prefer deterministic logic before AI.

```text
Level 1 - known sender/template profile
Level 2 - generic deterministic finance classifier
Level 3 - AI metadata/text classification for ambiguous candidates only
Level 4 - unsupported / manual review when ambiguity remains
```

The AI classification stage should use lightweight metadata/text whenever possible:

- message ID/reference;
- sender;
- subject;
- bounded snippet/body text;
- attachment names/MIME types.

Do not upload every PDF/image merely to decide whether an email might be an Invoice, Statement, or Receipt.

If multiple ambiguous candidates need AI classification, a bounded structured batch request may be used when the provider contract and error handling remain reliable. Each returned result must preserve the source message ID so responses cannot be associated with the wrong email.

---

# 4. Destination-specific extraction

Actual document extraction/parsing occurs only after routing/preparation and remains destination-specific.

## Invoices

Invoices may require one extraction job per actual invoice document because layouts differ substantially.

Reuse the existing Invoice extraction, extraction-quality evaluation, retry/fallback logic, source preservation, duplicate checks, and Invoice Review Queue.

Avoid an AI retry when deterministic quality checks say the first extraction is sufficient.

Multiple attachments must be treated as separate source documents where they represent separate invoices. Do not assume one email equals one invoice.

## Bank statements

Supported CSV/XLS/XLSX/XLSM statements should prefer the existing deterministic Cash & Banking parser.

A known bank/template profile may select or strongly suggest a parser mapping, but must not create a second transaction engine.

AI should not be required merely to parse a structured spreadsheet when deterministic parsing is available.

FinancialAccount matching occurs before commit and must reuse existing accounts when identity is sufficiently strong.

## Expenses / receipts

Use deterministic email/template/regex extraction first for structured electronic receipts where practical.

Use AI extraction only when important values are missing/ambiguous or the source is an unstructured image/PDF that needs document understanding.

Expense review remains explicit and cannot automatically approve or pay the Expense.

---

# 5. Extraction is not creation

Every extracted candidate must pass through normalization and entity/record resolution before Engoryx proposes mutations.

The system should produce a proposed action, not immediately create records.

Possible actions:

```text
LINK_EXISTING
ENRICH_EXISTING
CREATE_NEW
POSSIBLE_DUPLICATE
NEEDS_REVIEW
```

A strong existing match should normally prefer `LINK_EXISTING` rather than creating a duplicate.

`ENRICH_EXISTING` means proposing safe additional data. It must not silently replace conflicting authoritative values.

Example:

```text
Existing Vendor
  ABC Steel Corporation
  TIN: 123...
  billing email: blank

New source
  same TIN
  billing@abcsteel.example

Proposal
  link existing Vendor
  optionally add billing email after review
```

If the new document conflicts with an existing authoritative value, show the conflict and require review. Never use last-write-wins behavior for extracted business identity data.

---

# 6. Batch-aware entity resolution

When several emails/documents are prepared together, Engoryx must compare each candidate against:

1. existing company records; and
2. the other candidates in the same intake batch.

This prevents five emails from the same previously unknown supplier from proposing five new Vendors simply because the records do not exist yet.

The batch resolver should accumulate evidence and create a shared proposed entity when appropriate.

Conceptual resolution result:

```text
entityType
matchedEntityId?
matchConfidence
matchReasons[]
conflictingFields[]
suggestedUpdates[]
proposedAction
batchGroupId?
```

More source documents may increase confidence, but contradictory evidence must lower confidence or require review.

No candidate should silently overwrite another candidate's extracted values merely because it was processed later.

---

# 7. Vendor / supplier resolution

For Invoice and recurring Expense sources, compare extracted supplier identity with existing Vendors before proposing a new Vendor.

Strong evidence may include:

- exact normalized tax/TIN identifier;
- exact known sender address;
- saved sender profile linked to Vendor;
- exact/verified company email domain;
- registered name;
- address/phone evidence;
- normalized legal/trade-name similarity.

TIN/tax identity should outweigh fuzzy display-name similarity when reliable evidence is available.

Do not auto-merge Vendors based only on similar names.

When multiple same-batch documents resolve to one Vendor, surface them as one entity relationship rather than multiple proposed Vendor creations.

---

# 8. FinancialAccount resolution

Bank statement intake must be strongly existing-record-aware.

Before proposing a new FinancialAccount, compare available evidence such as:

- bank/institution;
- account number or safely stored/masked account identity;
- account suffix;
- currency;
- account name;
- known bank sender/template profile;
- existing statement-import history.

A high-confidence existing match should reuse the existing account.

Example:

```text
Statement
  Bank: BDO
  account ending: 4821
  currency: PHP

Existing account
  BDO Operating Account
  ending: 4821
  PHP

Proposal
  LINK_EXISTING -> BDO Operating Account
```

If multiple accounts could match, require explicit account selection.

Never create a second bank account solely because a newly imported statement uses a different display name or filename.

Never automatically merge accounts on ambiguous masked identifiers.

---

# 9. Record duplicate resolution

Entity resolution and transaction/document duplicate detection are separate concerns.

Preserve and strengthen destination-specific duplicate evidence.

## Invoice duplicate evidence

Use available authoritative signals such as:

- preserved source document/hash;
- Gmail message + attachment identity;
- Vendor identity;
- invoice number;
- date/amount where appropriate;
- existing Invoice duplicate engine.

## Expense duplicate evidence

Use:

- source document;
- receipt/reference number;
- resolved payee/vendor;
- date + amount;
- existing Expense lifecycle status.

## Statement/import duplicate evidence

Keep the existing Cash & Banking file-fingerprint/import-batch/transaction duplicate protections authoritative.

A known sender/profile must never bypass duplicate checks.

---

# 10. Same-email and cross-email overlap

The intake layer must handle overlap at several levels:

- multiple attachments in one email;
- the same attachment forwarded in another email;
- repeated statement delivery;
- duplicate invoices sent by supplier and forwarded internally;
- receipt and invoice evidence referring to the same business event;
- multiple emails from one new supplier in the same scan.

Source identity/hash should be checked before expensive extraction when possible.

When an already-preserved source or strong duplicate is detected, show the existing record/link rather than re-running expensive extraction unless an explicit retry/reprocess action is justified.

---

# 11. AI usage and cost discipline

The default strategy is:

```text
candidate discovery       -> no AI
known sender matching     -> no AI
generic classification    -> no AI
ambiguous classification  -> cheap AI only when needed
bank spreadsheet parsing  -> no AI when deterministic parser applies
invoice document extract  -> AI per required document
structured receipt parse  -> no AI when deterministic extraction is sufficient
unstructured receipt      -> AI when required
```

The system should avoid an AI call merely because a candidate exists.

Do not sacrifice correctness to reduce calls. AI fallback remains appropriate for genuinely ambiguous or unstructured sources.

---

# 12. Review UX

The review experience should explain why Engoryx is proposing an action.

Examples:

```text
Matched existing Vendor - high confidence
- same TIN
- sender domain matches saved profile
- registered name matches

No new Vendor will be created.
```

```text
Possible FinancialAccount match
- BDO
- ending 4821
- PHP

[Use BDO Operating Account]
[Choose another account]
```

```text
Potential duplicate
This source appears to match Invoice INV-2048.

[Open existing]
[Review anyway]
```

Conflicts should be visible, not silently resolved.

---

# 13. Permission and audit boundaries

Saved sender profiles, entity resolution, and matching confidence do not grant mutation authority.

Continue separating:

- `gmail.read`;
- `gmail.manage`;
- Invoice permissions;
- Cash & Banking permissions;
- Expense permissions;
- Vendor/account management permissions where authoritative master-data changes are proposed.

Source preservation, proposed links/updates, final user decisions, and committed destination records should remain auditable and company-scoped.

---

# 14. Recommended implementation waves

Implement Phase 4 in focused PR-sized waves rather than one oversized change.

Recommended order:

1. **4A - Intake efficiency foundation**
   - consolidate classification paths;
   - deterministic-first classification;
   - known sender/template profile contract;
   - bounded Gmail query expansion using saved sender profiles;
   - AI classification only for ambiguous candidates.

2. **4B - Entity resolution foundation**
   - Vendor matching;
   - FinancialAccount matching;
   - same-batch grouping;
   - proposed `link / enrich / create / duplicate / review` actions;
   - conflict reporting.

3. **4C - Invoice hardening**
   - multi-attachment handling;
   - duplicate/source short-circuiting;
   - extraction retry quality;
   - Vendor linkage.

4. **4D - Bank statement hardening**
   - bank/template profiles;
   - existing-account matching;
   - deterministic parser profiles;
   - duplicate/import provenance and reconciliation UX.

5. **4E - Expense hardening**
   - deterministic receipt extraction where possible;
   - AI fallback for unstructured sources;
   - merchant/payee normalization;
   - duplicate and entity linkage.

6. **4F - Shared queue hardening**
   - review status;
   - suspected duplicates;
   - failed preparation;
   - source status;
   - safe batch preparation without autonomous posting.

Each wave must follow the permanent maximum of 2 concurrent subagents in `AGENTS.md`.

---

# Completion principles

Phase 4 hardening is successful when:

- obvious finance candidates can be discovered/classified without an AI call;
- recurring senders/templates improve routing without becoming authoritative mutation rules;
- ambiguous classification uses AI only when needed;
- structured bank statements reuse deterministic parsers;
- extraction results are compared with existing Engoryx data before create/update proposals;
- same-batch candidates cannot independently create obvious duplicate Vendors/accounts;
- FinancialAccount matches reuse existing accounts when evidence is strong;
- conflicting entity data is surfaced rather than silently overwritten;
- duplicate source/document/import protections remain authoritative;
- final financial mutations remain permission-aware and human-confirmed;
- source and decision provenance remain auditable.
