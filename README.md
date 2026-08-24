# Invoice Operations — AI Studio + Supabase + Gmail

A feature-first sales invoice workspace that preserves original invoice sources, extracts structured data with Gemini, and keeps the result open for human verification before it is treated as verified.

The product is Philippines-first, not Philippines-only. New/manual presentation defaults to country `PH`, locale `en-PH`, currency `PHP` (`₱`), and timezone `Asia/Manila`. Imported foreign invoices keep their explicit USD, EUR, SGD, JPY, or other source currency; the app does not silently convert or combine currencies.

## Current workflow

```text
Gmail / Upload
      ↓
Preserve original email + PDF/image in Supabase
      ↓
Gemini 3.5 Flash-Lite classification/extraction
      ↓
Deterministic extraction-quality scoring + invoice math validation
      ↓
Bounded Enhanced retry when the result is objectively incomplete
      ↓
Review Queue
      ↓
Human edit / compare AI vs current values
      ↓
Verified invoice + review history
```

## Major features in this build

- Backward-compatible Supabase persistence for the existing invoice/Gmail foundation.
- Supabase Postgres persistence instead of browser-only storage when connected.
- Private Storage buckets for original invoice files and raw emails.
- Google OAuth through Supabase with Gmail `readonly` access.
- Direct Gmail date-window scans.
- Gmail candidate classification with Gemini before import.
- Incremental Gmail synchronization using history IDs.
- Original raw Gmail message preservation (`.eml`-style source).
- All imported email attachments preserved in Supabase Storage.
- Manual email import remains available as a fallback.
- PDF/image batch upload remains available.
- Gemini 3.5 Flash-Lite extraction with Gemini 3.7 Flash fallback.
- Deterministic extraction-quality scoring that separates API success from usable extraction success.
- Bounded Standard → Enhanced retry using the original source when critical fields, line items, currency, totals, or reconciliation are incomplete.
- Immutable AI extraction snapshots in `invoice_extractions`.
- Manual re-extraction appends a new immutable extraction attempt to the same invoice and preserves the original source and prior AI baseline.
- Separate editable/canonical invoice state in `invoices`.
- Deterministic subtotal, grand-total, line-item and balance validation.
- Duplicate invoice warnings.
- Dedicated **Review Queue**.
- Invoice verification workspace with:
  - Original Document
  - Source Email
  - AI vs Human comparison
  - Review History
- Editable line items and financial fields.
- Vendor directory.
- Searchable invoice directory.
- Dashboard and reports.
- Per-currency totals rather than combining unrelated currencies.
- Philippines-first invoice workflow with VAT / Non-VAT, TIN, branch, barangay, province, region, ATP/OCN, withholding, and mixed-tax fields.
- Deterministic 12% VAT checks only when a VATable Philippine transaction provides enough source data; zero-rated, VAT-exempt, Non-VAT, VAT-inclusive, and unclear cases are not blindly charged or rejected.
- PH invoice completeness review aid with `COMPLETE`, `REVIEW`, `MISSING_INFORMATION`, and `NOT_APPLICABLE` statuses.
- Excel/CSV exports with review/validation metadata.
- Local/demo fallback when Supabase is not configured.

## AI Studio compatibility

The project keeps the original AI Studio-friendly architecture:

- React 19 + TypeScript + Vite
- Express server in `server.ts`
- `@google/genai` only on the server
- per-company Gemini credentials encrypted by the Express server
- `/api/*` endpoints served by the same app
- Supabase browser client uses public project URL + publishable key
- ZIP is packaged with project files directly at root
- the company AI envelope resolver uses a dedicated backend-only Supabase key

Gemini extraction, Gmail classification, and Invoice Operations AI run through the Express server. Platform owners configure a separate Gemini key for each company under Manage Companies → AI Configuration. The server encrypts the key with `AI_CREDENTIALS_MASTER_KEY`; only safe metadata such as `Configured ••••ABCD` returns to the browser. The master key and Gemini keys must never be `VITE_` variables, stored in local/session storage, logged, or returned by an API.

## Required environment variables

```env
AI_CREDENTIALS_MASTER_KEY=BASE64_OF_32_RANDOM_BYTES
SUPABASE_AI_SERVER_KEY=SUPABASE_SECRET_KEY_FOR_COMPANY_AI_ONLY
ALLOW_GLOBAL_GEMINI_FALLBACK=false
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

Generate the server master key from 32 cryptographically random bytes, then base64-encode it. Store it as a deployment secret (for example in Render) and keep the value stable unless a planned credential re-encryption rotation is performed. `SUPABASE_AI_SERVER_KEY` is a separate backend-only Supabase secret/service-role-compatible key used only by the Express company AI envelope resolver; the browser and general persistence modules must never receive it. `GEMINI_API_KEY` is retained only as an explicitly enabled local/demo transition: leave `ALLOW_GLOBAL_GEMINI_FALLBACK=false` in production so a company without a configured key fails with `AI_NOT_CONFIGURED_FOR_COMPANY` instead of consuming another company’s quota.

See **`SUPABASE_GMAIL_SETUP.md`** for the full Gmail + Google OAuth + migration setup.

## Database/storage migration

Apply:

```text
supabase/migrations/20260822150000_invoice_operations_foundation.sql
```

The migration creates the persistence tables, private Storage buckets, baseline RLS ownership policies, and authenticated Data API grants.

The schema includes `profiles`, `gmail_connections`, `gmail_sync_state`, `email_messages`, `source_documents`, `vendors`, `invoices`, `invoice_line_items`, `invoice_extractions`, and `invoice_review_events`. Gmail attachment rows are keyed by the source message plus stable Gmail attachment ID, and the source-document/invoice relationship is idempotent on repeat imports.

For the current payroll/workforce foundation, apply the migrations in timestamp order through supabase/migrations/20260824110000_payroll_workforce_operations.sql. That additive migration creates company-scoped attendance, leave, overtime, and holiday sources; makes work-entry project linkage conditional on labor context; adds source-revision guards; and extends maintenance protection. Run Supabase security/performance advisors after deployment. The migration must be applied before authenticated users write the new workforce tables.

The payroll safety hardening migration `20260824120000_payroll_safety_hardening.sql` adds authoritative leave transition/overlap guards and invalidates affected open payroll periods when a referenced project changes payroll-relevant status. The assistant persistence migration `20260824121000_invoice_operations_assistant.sql` adds private company-scoped threads, messages, prepared-action audit events, and attachment metadata with explicit authenticated grants and RLS. The additive `20260824122000_company_ai_credentials.sql` migration adds safe AI metadata, encrypted credential envelopes, platform-owner RPCs, RLS, and audited credential lifecycle events.

## Data model principle

The original source and the AI result are deliberately separate:

```text
Original Gmail message / attachment     immutable source
Gemini extraction                       immutable snapshot
Current invoice                         editable working record
Verified invoice                        current record + verified timestamp
Review events                           edit / verification history
```

Human edits never rewrite `invoice_extractions` or the original stored files.

New extractions always enter `NEEDS_REVIEW`; arithmetic checks do not count as human verification. Reviewers can edit the working copy, compare it with the immutable AI snapshot, revert to the AI values, verify, or reopen an invoice. Extraction snapshots and review history are append-only for the authenticated client.

Removing an invoice from the directory archives the working record instead of deleting its source, extraction snapshot, or review history.

## Philippines-first behavior

- VAT invoices may expose VATable Sales, VAT Amount, Zero-Rated Sales, VAT-Exempt Sales, ATP/OCN or permit text, and mixed tax treatment.
- Non-VAT invoices do not receive an automatic 12% VAT amount.
- Withholding tax remains separate from `Invoice Total`; `Net Payable` is shown only when deterministically available.
- Official Receipt, Billing Statement, and Statement of Account are treated conservatively as receipt/supplementary candidates unless the source clearly establishes an invoice.
- Human verification remains required. The PH completeness checklist is a review aid and is not a legal certification of BIR compliance.

**InvoiceApp helps extract and review invoice information. Its completeness checks are not a legal certification of BIR compliance.**

The PH extraction vocabulary follows current official BIR/EOPT invoicing guidance, especially [BIR Revenue Regulations No. 7-2024](https://bir-cdn.bir.gov.ph/BIR/pdf/RR%20No.%207-%202024.pdf) and [BIR Revenue Memorandum Circular No. 77-2024](https://bir-cdn.bir.gov.ph/BIR/pdf/RMC%20No.%2077-2024.pdf). This app does not provide tax or legal advice.

## Run locally

```bash
npm install
npm run dev
```

Build:

```bash
npm run build
```

## Model behavior

Default:

```text
gemini-3.5-flash-lite
```

Accuracy/fallback:

```text
gemini-3.7-flash
```

The extraction prompt does not allow Gemini to invent missing financial values. The server may fill only mathematically deterministic values; otherwise fields remain empty and are routed to human review.

Every structured response is evaluated deterministically after parsing. A valid but empty or internally inconsistent JSON response is marked `NEEDS_REVIEW`; Standard automatically receives one bounded Enhanced retry with the original document and targeted table/totals instructions. Human verification remains explicit.

The primary extraction/classification model remains `gemini-3.5-flash-lite`, with `gemini-3.7-flash` retained as the existing fallback/accuracy path. PH terminology is added to the prompt without making the global document model PH-only.

## Intentionally deferred

This iteration focuses on product features rather than full enterprise hardening. The migration still includes private Storage and basic per-user RLS so invoice/email data is not intentionally public. A later phase can cover team permissions, retention, token storage/background refresh, organization roles, security audit, and automated Gmail push processing.

## Payroll and workforce operations

Payroll now keeps two related but separate sources:

- **Attendance** records whether a worker was expected, present, absent, on leave, resting, on a holiday, or on official business. It stores schedule snapshots, clock times, regular minutes, lateness, undertime, and payable day fractions.
- **Time / Labor** records where labor was allocated: a project, admin/office, general overhead, or unallocated review. A project is required only for project labor.
- **Overtime** is requested and approved separately. Approved explicit overtime takes precedence over legacy work-entry overtime for the same worker/date; conflicts are surfaced rather than paid twice.
- **Leave** is operational data. Approved leave appears in the attendance roster, but paid leave is never assumed unless explicitly entered.

The Attendance workspace supports date navigation, roster review, inline corrections, bulk “mark scheduled workers present,” leave requests, overtime approval, and company-defined holiday context. Bulk actions are deterministic, previewable domain operations so future automation can call the same actions without writing rows directly.

Calculated payroll runs capture a source revision and deterministic source fingerprint. Attendance, leave, overtime, work-entry, compensation, and schedule changes require recalculation before a run can be approved. Existing finalized payroll history remains read-only.

Company tenancy and RBAC apply to the new payroll sources. Local/demo mode stores the same domains locally when Supabase is not configured. This remains an operational payroll foundation and is **not** a legally complete Philippine payroll engine; statutory premium, contribution, entitlement, and absence-deduction rules require explicit configured policy and are intentionally not invented.

## Invoice Operations AI

Invoice Operations AI is a global, company-scoped assistant drawer for answering product/workspace questions, opening supported pages, preparing controlled workforce/payroll operations, and helping route supported documents. It uses the existing Express server and `@google/genai`; it is not a freeform database chatbot.

The assistant can search invoices, projects, expenses, vendors, workers, attendance, payroll periods/runs, readiness, and reports; navigate to allowlisted routes; use the current FAQ/help catalog; and start registered tours. Supported attachments are PDF, JPG/JPEG, PNG, WEBP, XLSX, CSV, and TXT. Files are treated as untrusted data. Spreadsheet/PDF/image text cannot grant permissions, create tools, run SQL, or override the assistant rules.

Read and navigation tools run automatically. Prepare/preview tools return a structured preview; when that preview represents a write, the application still requires an explicit Confirm action before execution. Normal and bulk changes use the same application-enforced confirmation. Payroll approval and payment use the strongest confirmation tier and re-check the current permission, company, entity state, expiry, source revision, and idempotency before executing. Repeating a confirmation does not repeat the operation.

Financial calculations remain deterministic in InvoiceApp. Gemini never computes authoritative invoice totals, project actual cost, payroll, overtime pay, allocations, or expense totals, and it cannot access Supabase directly, choose tables/columns, issue arbitrary HTTP/SQL, run shell commands, or use service-role credentials. Human review remains required wherever the existing invoice or payroll workflow requires it.

Apply the assistant and AI migrations in timestamp order, including `20260824121000_invoice_operations_assistant.sql` and `20260824122000_company_ai_credentials.sql`. Company AI requests require an active company credential in production; the primary `gemini-3.5-flash-lite` call and `gemini-3.7-flash` fallback always use the same company key. Assistant conversations and action audit records are private to their creator and selected company; binary attachment content is not stored in assistant message JSON.

The first release intentionally does not expose payroll history deletion/reset/rebuild, destructive company administration, member/role management, service-role operations, arbitrary SQL/API requests, shell commands, or browser automation. If the model or service is unavailable, the app reports the limitation rather than claiming a workspace action succeeded.
