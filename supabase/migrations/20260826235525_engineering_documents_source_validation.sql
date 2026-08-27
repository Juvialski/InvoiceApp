-- Phase 1A additive hardening: keep the browser validation contract true for
-- direct authenticated RPC callers as well. Existing historical revisions
-- are left unchanged because this trigger only runs on new inserts.

create or replace function private.validate_engineering_revision_source()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if lower(btrim(new.file_type)) <> 'application/pdf'
     or lower(btrim(new.file_name)) !~ '\.pdf$' then
    raise exception 'Engineering revision sources must be PDF files' using errcode = '22023';
  end if;

  if new.file_size_bytes <= 0 or new.file_size_bytes > 52428800 then
    raise exception 'Engineering revision source size is outside the permitted range' using errcode = '22023';
  end if;

  if new.file_fingerprint !~ '^sha256:[0-9a-f]{64}$' then
    raise exception 'Engineering revision source fingerprint must be sha256:<64 lowercase hex characters>'
      using errcode = '22023';
  end if;

  if new.file_path !~ format(
    '^companies/%s/documents/%s/revisions/%s/[^/]+$',
    new.company_id,
    new.document_id,
    new.id
  )
  or split_part(new.file_path, '/', 7) <> btrim(new.file_name) then
    raise exception 'Engineering revision source path is not bound to its company, document, revision, and file name'
      using errcode = '22023';
  end if;

  return new;
end;
$$;

drop trigger if exists engineering_document_revisions_source on public.engineering_document_revisions;
create trigger engineering_document_revisions_source
  before insert on public.engineering_document_revisions
  for each row execute function private.validate_engineering_revision_source();

revoke execute on function private.validate_engineering_revision_source() from public, anon, authenticated;
