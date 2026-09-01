-- Wave S2: Provider Abstraction & Private External Storage Pilot
-- Extends source_documents with storage provider metadata and bucket attribution
-- while preserving default compatibility for all existing Supabase storage records.

alter table public.source_documents
  add column if not exists storage_provider text not null default 'supabase',
  add column if not exists storage_bucket text not null default 'invoice-originals';

-- Add check constraint for valid durable storage provider identifiers in Wave S2
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'source_documents_storage_provider_check'
  ) then
    alter table public.source_documents
      add constraint source_documents_storage_provider_check
      check (storage_provider in ('supabase', 's3'));
  end if;
end $$;

-- Company-scoped index on storage provider for provider queries and migrations
create index if not exists source_documents_company_provider_idx
  on public.source_documents(company_id, storage_provider);
