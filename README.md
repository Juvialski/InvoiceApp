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
Deterministic invoice math validation
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
- Immutable AI extraction snapshots in `invoice_extractions`.
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
- `GEMINI_API_KEY` from environment secrets
- `/api/*` endpoints served by the same app
- Supabase browser client uses public project URL + publishable key
- ZIP is packaged with project files directly at root
- no service-role key is required in this iteration

Gemini extraction and Gmail classification run through the Express server in `server.ts`, so `GEMINI_API_KEY` must be configured in the server/deployment runtime that serves `/api/*`. It must not be added as `VITE_GEMINI_API_KEY` or any other browser-exposed variable. Adding the same secret only to Supabase does not make it available to Express unless the deployment has explicitly moved model execution into an Edge Function.

## Required environment variables

```env
GEMINI_API_KEY=...
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

See **`SUPABASE_GMAIL_SETUP.md`** for the full Gmail + Google OAuth + migration setup.

## Database/storage migration

Apply:

```text
supabase/migrations/20260822150000_invoice_operations_foundation.sql
```

The migration creates the persistence tables, private Storage buckets, baseline RLS ownership policies, and authenticated Data API grants.

The schema includes `profiles`, `gmail_connections`, `gmail_sync_state`, `email_messages`, `source_documents`, `vendors`, `invoices`, `invoice_line_items`, `invoice_extractions`, and `invoice_review_events`. Gmail attachment rows are keyed by the source message plus stable Gmail attachment ID, and the source-document/invoice relationship is idempotent on repeat imports.

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

The primary extraction/classification model remains `gemini-3.5-flash-lite`, with `gemini-3.7-flash` retained as the existing fallback/accuracy path. PH terminology is added to the prompt without making the global document model PH-only.

## Intentionally deferred

This iteration focuses on product features rather than full enterprise hardening. The migration still includes private Storage and basic per-user RLS so invoice/email data is not intentionally public. A later phase can cover team permissions, retention, token storage/background refresh, organization roles, security audit, and automated Gmail push processing.
