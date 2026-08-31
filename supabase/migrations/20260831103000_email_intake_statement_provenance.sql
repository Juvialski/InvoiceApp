-- Email Intake Phase 1: preserve the audit chain from Gmail -> source document
-- -> Cash & Banking statement import without changing the existing import RPC.

alter table public.financial_import_batches
  add column if not exists source_document_id uuid references public.source_documents(id) on delete restrict;

create index if not exists financial_import_batches_source_document_idx
  on public.financial_import_batches(company_id, source_document_id)
  where source_document_id is not null;

create or replace function private.validate_financial_import_source_document()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.source_document_id is null then
    return new;
  end if;

  if not exists (
    select 1
    from public.source_documents sd
    where sd.id = new.source_document_id
      and sd.company_id = new.company_id
  ) then
    raise exception 'Statement source document is outside the company' using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function private.validate_financial_import_source_document() from public, anon, authenticated;

drop trigger if exists financial_import_batches_source_document_guard on public.financial_import_batches;
create trigger financial_import_batches_source_document_guard
before insert or update of company_id, source_document_id on public.financial_import_batches
for each row execute function private.validate_financial_import_source_document();

create or replace function public.link_financial_import_source(
  p_company_id uuid,
  p_account_id uuid,
  p_file_fingerprint text,
  p_source_document_id uuid
)
returns public.financial_import_batches
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_batch public.financial_import_batches;
begin
  if v_user_id is null or not (select public.has_company_permission(p_company_id, 'cash.import')) then
    raise exception 'Cash statement import permission is required' using errcode = '42501';
  end if;

  if p_source_document_id is null then
    raise exception 'A preserved statement source document is required' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.source_documents sd
    where sd.id = p_source_document_id
      and sd.company_id = p_company_id
  ) then
    raise exception 'Statement source document is outside the company' using errcode = '42501';
  end if;

  select fib.* into v_batch
  from public.financial_import_batches fib
  where fib.company_id = p_company_id
    and fib.account_id = p_account_id
    and fib.file_fingerprint = p_file_fingerprint
    and fib.status = 'IMPORTED'
  order by fib.completed_at desc nulls last, fib.created_at desc
  limit 1
  for update;

  if not found then
    raise exception 'Imported statement batch was not found for source linking' using errcode = 'P0002';
  end if;

  if v_batch.source_document_id is not null and v_batch.source_document_id is distinct from p_source_document_id then
    raise exception 'Statement import is already linked to another preserved source' using errcode = '22023';
  end if;

  update public.financial_import_batches
  set source_document_id = p_source_document_id,
      updated_at = now()
  where id = v_batch.id
  returning * into v_batch;

  return v_batch;
end;
$$;

revoke all on function public.link_financial_import_source(uuid, uuid, text, uuid) from public, anon;
grant execute on function public.link_financial_import_source(uuid, uuid, text, uuid) to authenticated;
