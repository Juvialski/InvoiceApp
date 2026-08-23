# Invoice Operations — AI Studio + Supabase + Gmail

A feature-first sales invoice workspace that preserves original invoice sources, extracts structured data with Gemini, and keeps the result open for human verification before it is treated as verified.

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

- Fresh Supabase project support.
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

## Intentionally deferred

This iteration focuses on product features rather than full enterprise hardening. The migration still includes private Storage and basic per-user RLS so invoice/email data is not intentionally public. A later phase can cover team permissions, retention, token storage/background refresh, organization roles, security audit, and automated Gmail push processing.
