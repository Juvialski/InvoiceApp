-- Keep the public prospect funnel disabled by default on every operational
-- deployment. A platform/QA deployment may enable it explicitly through a
-- privileged operator action after confirming that the deployment is intended
-- to collect prospective-client contact data.

create table if not exists private.public_prospect_funnel_configuration (
  singleton boolean primary key default true check (singleton),
  enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

insert into private.public_prospect_funnel_configuration (singleton, enabled)
values (true, false)
on conflict (singleton) do nothing;

revoke all on table private.public_prospect_funnel_configuration from public, anon, authenticated;

create or replace function private.guard_public_prospect_funnel_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not coalesce((
    select enabled
    from private.public_prospect_funnel_configuration
    where singleton = true
  ), false) then
    raise exception 'Public prospect intake is not enabled for this deployment'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function private.guard_public_prospect_funnel_insert() from public, anon, authenticated;

drop trigger if exists prospect_submissions_public_funnel_gate
  on public.prospect_submissions;

create trigger prospect_submissions_public_funnel_gate
before insert on public.prospect_submissions
for each row
execute function private.guard_public_prospect_funnel_insert();
