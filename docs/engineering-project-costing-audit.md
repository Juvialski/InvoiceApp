# Current invoice architecture audit

The current application is a React/Vite client with an Express extraction server. Supabase is optional at runtime. With no authenticated Supabase session, invoices use the existing `extracted_invoices` local-storage fallback; new project, expense, payroll, and allocation records now use parallel best-effort local-storage keys. With a session, the existing persistence layer loads invoices and the new domain loaders run alongside it.

## Invoice relationships

- `profiles.id` is the authenticated user id.
- `vendors` belongs to `user_id`; invoice persistence upserts a vendor and stores `vendor_id`.
- `source_documents` belongs to `user_id` and may reference an email message. Original files remain in storage and are integrity checked by SHA-256 on retry.
- `invoices` belongs to `user_id`, references an optional source document/email/vendor, and stores the editable record in `current_data`.
- `invoice_extractions` references an invoice and is append-only; each AI attempt stores the structured snapshot and validation result.
- `invoice_review_events` references an invoice and is append-only; human edits/verification are recorded without mutating the AI snapshot.
- `projectReference` remains inside the invoice data as extracted text. A project relationship is created only through a human-confirmed allocation row.

## Regression-sensitive workflows

Image/PDF upload, Gemini extraction, quality retry, manual retry, UOM, PH VAT checks, foreign-currency preservation, Gmail intake, review queue navigation, verification, source viewing, duplicate detection, Excel invoice export, source preservation, immutable extraction attempts, and review history remain on their existing paths. The project field is an additive panel in the verification workspace.

## Security checks

All new tables have `user_id`, authenticated RLS, indexes, foreign keys, and ownership validation triggers for relational children. Archived projects remain readable but cannot receive new allocation, expense, assignment, or work-entry rows. Projects and workers are archived rather than hard-deleted by the application.

