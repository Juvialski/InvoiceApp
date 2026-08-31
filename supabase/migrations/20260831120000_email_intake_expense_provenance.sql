-- Email Intake Phase 2: index and integrity protection for expense receipt source documents.

create index if not exists expenses_receipt_source_document_idx
  on public.expenses(company_id, receipt_source_document_id)
  where receipt_source_document_id is not null;
