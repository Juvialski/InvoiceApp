-- Phase 1A additive hardening: annotation history is retained by status
-- transitions, never by physical DELETE from an application client.

drop policy if exists drawing_annotations_company_delete on public.drawing_annotations;
revoke delete on table public.drawing_annotations from authenticated;

create or replace function private.prevent_engineering_annotation_delete()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception 'Engineering annotations are audit records; mark them DELETED instead'
    using errcode = '55000';
end;
$$;

drop trigger if exists drawing_annotations_append_only on public.drawing_annotations;
create trigger drawing_annotations_append_only
  before delete on public.drawing_annotations
  for each row execute function private.prevent_engineering_annotation_delete();

revoke execute on function private.prevent_engineering_annotation_delete() from public, anon, authenticated;
