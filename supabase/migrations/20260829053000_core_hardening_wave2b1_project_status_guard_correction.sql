-- Core Hardening Wave 2B1 follow-up.
-- Preserve the guarded ARCHIVED lifecycle without removing the existing
-- PLANNING/ACTIVE/ON_HOLD/COMPLETED/CANCELLED project status workflow.

create or replace function public.guard_project_lifecycle_edit()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'INSERT'
     and current_user not in ('postgres', 'service_role')
     and (
       new.status = 'ARCHIVED'
       or new.archived_at is not null
       or new.archived_from_status is not null
     ) then
    raise exception 'Create an archived project through the project lifecycle workflow'
      using errcode = '42501';
  end if;

  if tg_op = 'UPDATE'
     and current_user <> 'postgres'
     and (
       new.archived_at is distinct from old.archived_at
       or new.archived_from_status is distinct from old.archived_from_status
       or (
         new.status is distinct from old.status
         and (new.status = 'ARCHIVED' or old.status = 'ARCHIVED')
       )
     ) then
    raise exception 'Use the project archive or reactivate lifecycle action for archived-state changes'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists projects_lifecycle_edit_guard on public.projects;
create trigger projects_lifecycle_edit_guard
before insert or update on public.projects
for each row execute function public.guard_project_lifecycle_edit();

revoke execute on function public.guard_project_lifecycle_edit() from public, anon, authenticated;
