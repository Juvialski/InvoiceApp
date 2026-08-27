-- Engoryx Phase 1C: Daily Site Logs and Weather Tracking.
-- Additive only. Crew/headcount is an operational observation and is never a
-- payroll attendance or timesheet source.

insert into public.company_permission_catalog (permission_key, description)
values
  ('engineering.sitelogs.read', 'Read company project Daily Site Logs, field conditions, and lifecycle history.'),
  ('engineering.sitelogs.create', 'Create project Daily Site Log drafts.'),
  ('engineering.sitelogs.update', 'Edit project Daily Site Log drafts and their observational child rows.'),
  ('engineering.sitelogs.submit', 'Submit a complete Daily Site Log for formal review.'),
  ('engineering.sitelogs.manage', 'Finalize or void project Daily Site Logs.')
on conflict (permission_key) do update set description = excluded.description;

insert into public.company_role_permissions (role_key, permission_key)
select 'COMPANY_ADMIN', permission_key
from public.company_permission_catalog
where permission_key like 'engineering.sitelogs.%'
on conflict do nothing;

insert into public.company_role_permissions (role_key, permission_key)
values
  ('FINANCE', 'engineering.sitelogs.read'),
  ('PAYROLL', 'engineering.sitelogs.read'),
  ('VIEWER', 'engineering.sitelogs.read')
on conflict do nothing;

insert into private.company_tenant_policy_catalog (table_name, read_permission, write_permission, allow_insert, allow_update, allow_delete)
values
  ('engineering_daily_site_logs', 'engineering.sitelogs.read', 'engineering.sitelogs.update', true, true, false),
  ('engineering_daily_site_log_weather', 'engineering.sitelogs.read', 'engineering.sitelogs.update', true, true, true),
  ('engineering_daily_site_log_crew', 'engineering.sitelogs.read', 'engineering.sitelogs.update', true, true, true),
  ('engineering_daily_site_log_equipment', 'engineering.sitelogs.read', 'engineering.sitelogs.update', true, true, true),
  ('engineering_daily_site_log_safety', 'engineering.sitelogs.read', 'engineering.sitelogs.update', true, true, true),
  ('engineering_daily_site_log_events', 'engineering.sitelogs.read', 'engineering.sitelogs.manage', false, false, false)
on conflict (table_name) do update set
  read_permission = excluded.read_permission,
  write_permission = excluded.write_permission,
  allow_insert = excluded.allow_insert,
  allow_update = excluded.allow_update,
  allow_delete = excluded.allow_delete;

create table if not exists public.engineering_daily_site_logs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  project_id uuid not null references public.projects(id) on delete restrict,
  site_date date not null,
  report_number text not null check (length(btrim(report_number)) between 1 and 100),
  status text not null default 'DRAFT' check (status in ('DRAFT', 'SUBMITTED', 'FINALIZED', 'VOID')),
  prepared_by_user_id uuid not null references auth.users(id) on delete restrict,
  submitted_by_user_id uuid references auth.users(id) on delete restrict,
  finalized_by_user_id uuid references auth.users(id) on delete restrict,
  voided_by_user_id uuid references auth.users(id) on delete restrict,
  work_summary text not null default '' check (length(work_summary) <= 8000),
  progress_notes text check (progress_notes is null or length(progress_notes) <= 8000),
  delays_constraints text check (delays_constraints is null or length(delays_constraints) <= 8000),
  general_notes text check (general_notes is null or length(general_notes) <= 8000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  submitted_at timestamptz,
  finalized_at timestamptz,
  voided_at timestamptz,
  void_reason text check (void_reason is null or length(btrim(void_reason)) between 1 and 1000),
  unique (company_id, project_id, site_date),
  unique (company_id, project_id, report_number)
);

create table if not exists public.engineering_daily_site_log_weather (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  site_log_id uuid not null references public.engineering_daily_site_logs(id) on delete restrict,
  condition text not null check (condition in ('CLEAR', 'PARTLY_CLOUDY', 'OVERCAST', 'RAIN', 'STORM', 'WINDY', 'EXTREME_HEAT', 'OTHER', 'UNKNOWN')),
  temperature numeric(6,2) check (temperature is null or temperature between -100 and 100),
  temperature_unit text not null default 'C' check (temperature_unit in ('C', 'F')),
  precipitation_notes text check (precipitation_notes is null or length(precipitation_notes) <= 1000),
  wind_notes text check (wind_notes is null or length(wind_notes) <= 1000),
  humidity numeric(5,2) check (humidity is null or humidity between 0 and 100),
  site_condition_notes text check (site_condition_notes is null or length(site_condition_notes) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (site_log_id)
);

create table if not exists public.engineering_daily_site_log_crew (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  site_log_id uuid not null references public.engineering_daily_site_logs(id) on delete restrict,
  trade text check (trade is null or length(btrim(trade)) between 1 and 120),
  crew_label text check (crew_label is null or length(btrim(crew_label)) between 1 and 160),
  contractor_label text check (contractor_label is null or length(btrim(contractor_label)) between 1 and 160),
  headcount integer not null default 0 check (headcount between 0 and 100000),
  regular_hours numeric(5,2) check (regular_hours is null or regular_hours between 0 and 24),
  overtime_hours numeric(5,2) check (overtime_hours is null or overtime_hours between 0 and 24),
  notes text check (notes is null or length(notes) <= 1000),
  sort_order integer not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (trade is not null or crew_label is not null or contractor_label is not null)
);

create table if not exists public.engineering_daily_site_log_equipment (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  site_log_id uuid not null references public.engineering_daily_site_logs(id) on delete restrict,
  equipment_name text not null check (length(btrim(equipment_name)) between 1 and 180),
  equipment_type text check (equipment_type is null or length(btrim(equipment_type)) <= 120),
  asset_reference text check (asset_reference is null or length(btrim(asset_reference)) <= 120),
  operating_hours numeric(5,2) check (operating_hours is null or operating_hours between 0 and 24),
  idle_hours numeric(5,2) check (idle_hours is null or idle_hours between 0 and 24),
  operator_crew_note text check (operator_crew_note is null or length(operator_crew_note) <= 500),
  condition_status text check (condition_status is null or length(btrim(condition_status)) <= 120),
  notes text check (notes is null or length(notes) <= 1000),
  sort_order integer not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.engineering_daily_site_log_safety (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  site_log_id uuid not null references public.engineering_daily_site_logs(id) on delete restrict,
  category text not null check (length(btrim(category)) between 1 and 120),
  severity text not null default 'OBSERVATION' check (severity in ('OBSERVATION', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  description text not null check (length(btrim(description)) between 1 and 4000),
  action_taken text check (action_taken is null or length(action_taken) <= 2000),
  is_resolved boolean not null default true,
  notes text check (notes is null or length(notes) <= 1000),
  sort_order integer not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.engineering_daily_site_log_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  site_log_id uuid not null references public.engineering_daily_site_logs(id) on delete restrict,
  event_type text not null check (event_type in ('CREATED', 'UPDATED', 'SUBMITTED', 'FINALIZED', 'VOIDED')),
  from_status text check (from_status is null or from_status in ('DRAFT', 'SUBMITTED', 'FINALIZED', 'VOID')),
  to_status text not null check (to_status in ('DRAFT', 'SUBMITTED', 'FINALIZED', 'VOID')),
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  reason text check (reason is null or length(btrim(reason)) <= 1000),
  created_at timestamptz not null default now()
);

create index if not exists engineering_daily_site_logs_company_project_date_idx
  on public.engineering_daily_site_logs(company_id, project_id, site_date desc);
create index if not exists engineering_daily_site_logs_company_status_idx
  on public.engineering_daily_site_logs(company_id, status, site_date desc);
create index if not exists engineering_daily_site_log_weather_company_log_idx
  on public.engineering_daily_site_log_weather(company_id, site_log_id);
create index if not exists engineering_daily_site_log_crew_company_log_idx
  on public.engineering_daily_site_log_crew(company_id, site_log_id, sort_order);
create index if not exists engineering_daily_site_log_equipment_company_log_idx
  on public.engineering_daily_site_log_equipment(company_id, site_log_id, sort_order);
create index if not exists engineering_daily_site_log_safety_company_log_idx
  on public.engineering_daily_site_log_safety(company_id, site_log_id, sort_order);
create index if not exists engineering_daily_site_log_events_company_log_idx
  on public.engineering_daily_site_log_events(company_id, site_log_id, created_at);

-- Keep the audit allowlist a strict superset of every event through Phase 1B.
alter table public.company_audit_events drop constraint if exists company_audit_events_event_type_check;
alter table public.company_audit_events add constraint company_audit_events_event_type_check check (event_type in (
  'COMPANY_CREATED', 'COMPANY_UPDATED', 'COMPANY_SUSPENDED', 'COMPANY_ARCHIVED', 'COMPANY_REACTIVATED',
  'USER_INVITED', 'INVITE_REVOKED', 'INVITE_ACCEPTED',
  'MEMBER_ROLE_CHANGED', 'MEMBER_SUSPENDED', 'MEMBER_REACTIVATED', 'MEMBER_REVOKED',
  'PAYROLL_REPAIR_APPLIED', 'PAYROLL_CALENDAR_REBUILT', 'PAYROLL_UNAPPROVED_RESET',
  'COMPANY_AI_CREDENTIAL_CONFIGURED', 'COMPANY_AI_CREDENTIAL_ROTATED',
  'COMPANY_AI_CREDENTIAL_TESTED', 'COMPANY_AI_CREDENTIAL_ENABLED',
  'COMPANY_AI_CREDENTIAL_DISABLED', 'COMPANY_AI_CREDENTIAL_REMOVED',
  'PAYROLL_WORKSPACE_RESET',
  'CASH_ACCOUNT_CREATED', 'CASH_ACCOUNT_UPDATED', 'CASH_ACCOUNT_DEACTIVATED',
  'CASH_BALANCE_SNAPSHOT_RECORDED', 'CASH_STATEMENT_IMPORTED', 'CASH_STATEMENT_REJECTED',
  'CASH_TRANSACTION_CREATED', 'CASH_TRANSACTION_UPDATED',
  'CASH_RECONCILIATION_CONFIRMED', 'CASH_RECONCILIATION_REMOVED', 'CASH_TRANSFER_MATCHED',
  'ENGINEERING_DOCUMENT_CREATED', 'ENGINEERING_DOCUMENT_UPDATED', 'ENGINEERING_DOCUMENT_ARCHIVED',
  'ENGINEERING_REVISION_UPLOADED', 'ENGINEERING_ANNOTATION_SAVED', 'ENGINEERING_ANNOTATION_DELETED',
  'ENGINEERING_RFI_CREATED', 'ENGINEERING_RFI_OPENED', 'ENGINEERING_RFI_RESPONDED', 'ENGINEERING_RFI_CLOSED', 'ENGINEERING_RFI_VOIDED',
  'ENGINEERING_SUBMITTAL_CREATED', 'ENGINEERING_SUBMITTAL_SUBMITTED', 'ENGINEERING_SUBMITTAL_REVIEW_STARTED', 'ENGINEERING_SUBMITTAL_REVIEWED',
  'ENGINEERING_SUBMITTAL_RESUBMITTED', 'ENGINEERING_SUBMITTAL_CLOSED', 'ENGINEERING_SUBMITTAL_VOIDED',
  'ENGINEERING_DAILY_SITE_LOG_CREATED', 'ENGINEERING_DAILY_SITE_LOG_UPDATED', 'ENGINEERING_DAILY_SITE_LOG_SUBMITTED',
  'ENGINEERING_DAILY_SITE_LOG_FINALIZED', 'ENGINEERING_DAILY_SITE_LOG_VOIDED'
));

create or replace function private.daily_site_log_actor(p_company_id uuid, p_permission_key text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
begin
  if v_actor is null or not (select private.has_company_permission(p_company_id, p_permission_key)) then
    raise exception 'Daily Site Log permission denied' using errcode = '42501';
  end if;
  return v_actor;
end;
$$;

create or replace function private.assert_daily_site_log_project(p_company_id uuid, p_project_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.projects p
    where p.id = p_project_id and p.company_id = p_company_id and p.archived_at is null
  ) then
    raise exception 'Project is outside the selected company or unavailable' using errcode = '42501';
  end if;
end;
$$;

create or replace function private.validate_daily_site_log_reference()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_table_name = 'engineering_daily_site_logs' then
    perform private.assert_daily_site_log_project(new.company_id, new.project_id);
    if tg_op = 'INSERT' and new.prepared_by_user_id is distinct from (select auth.uid()) and (select auth.uid()) is not null then
      -- Guarded RPCs always write the authenticated actor. This also prevents
      -- a direct owner/service path from manufacturing a caller identity.
      raise exception 'Daily Site Log actor must be the authenticated user' using errcode = '42501';
    end if;
  elsif tg_table_name in (
    'engineering_daily_site_log_weather',
    'engineering_daily_site_log_crew',
    'engineering_daily_site_log_equipment',
    'engineering_daily_site_log_safety',
    'engineering_daily_site_log_events'
  ) then
    if not exists (
      select 1 from public.engineering_daily_site_logs l
      where l.id = new.site_log_id and l.company_id = new.company_id
    ) then
      raise exception 'Daily Site Log child row is outside the company' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create or replace function private.prevent_daily_site_log_history_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception 'Daily Site Log lifecycle history is append-only' using errcode = '55000';
end;
$$;

create or replace function private.prevent_daily_site_log_delete()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception 'Daily Site Logs are preserved as formal field history' using errcode = '55000';
end;
$$;

create or replace function private.guard_daily_site_log_formal_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.company_id is distinct from old.company_id
    or new.project_id is distinct from old.project_id
    or new.prepared_by_user_id is distinct from old.prepared_by_user_id
    or new.created_at is distinct from old.created_at then
    raise exception 'Daily Site Log identity is immutable' using errcode = '55000';
  end if;
  if old.status in ('FINALIZED', 'VOID') then
    raise exception 'Finalized or void Daily Site Logs are immutable' using errcode = '55000';
  end if;
  if old.status = 'SUBMITTED' and new.status = old.status and (
    new.site_date is distinct from old.site_date
    or new.report_number is distinct from old.report_number
    or new.work_summary is distinct from old.work_summary
    or new.progress_notes is distinct from old.progress_notes
    or new.delays_constraints is distinct from old.delays_constraints
    or new.general_notes is distinct from old.general_notes
  ) then
    raise exception 'Submitted Daily Site Log content is immutable' using errcode = '55000';
  end if;
  return new;
end;
$$;

create or replace function private.prevent_daily_site_log_child_formal_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.engineering_daily_site_logs l
    where l.id = coalesce(new.site_log_id, old.site_log_id)
      and l.status <> 'DRAFT'
  ) then
    raise exception 'Submitted or finalized Daily Site Log observations are immutable' using errcode = '55000';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create or replace function private.validate_daily_site_log_aggregate(p_daily_site_log_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_log public.engineering_daily_site_logs;
begin
  select * into v_log
  from public.engineering_daily_site_logs l
  where l.id = p_daily_site_log_id
  for update;
  if not found then raise exception 'Daily Site Log was not found' using errcode = 'P0002'; end if;
  if length(btrim(v_log.work_summary)) = 0 then
    raise exception 'Work summary is required before submission' using errcode = '22023';
  end if;
  if not exists (select 1 from public.engineering_daily_site_log_weather w where w.site_log_id = p_daily_site_log_id and w.company_id = v_log.company_id) then
    raise exception 'Weather condition is required before submission' using errcode = '22023';
  end if;
  if not exists (select 1 from public.engineering_daily_site_log_crew c where c.site_log_id = p_daily_site_log_id and c.company_id = v_log.company_id) then
    raise exception 'At least one crew/headcount observation is required before submission' using errcode = '22023';
  end if;
end;
$$;

create or replace function private.record_daily_site_log_event(
  p_company_id uuid,
  p_daily_site_log_id uuid,
  p_event_type text,
  p_from_status text,
  p_to_status text,
  p_actor uuid,
  p_reason text default null
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.engineering_daily_site_log_events(company_id, site_log_id, event_type, from_status, to_status, actor_user_id, reason)
  values (p_company_id, p_daily_site_log_id, p_event_type, p_from_status, p_to_status, p_actor, nullif(btrim(p_reason), ''));
$$;

create or replace function private.replace_daily_site_log_children(
  p_company_id uuid,
  p_daily_site_log_id uuid,
  p_weather jsonb,
  p_crew jsonb,
  p_equipment jsonb,
  p_safety jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item jsonb;
  v_index integer := 0;
  v_condition text;
  v_trade text;
  v_crew_label text;
  v_contractor_label text;
begin
  if p_weather is not null then
    if jsonb_typeof(p_weather) <> 'object' then raise exception 'Weather must be an object' using errcode = '22023'; end if;
    insert into public.engineering_daily_site_log_weather(
      id, company_id, site_log_id, condition, temperature, temperature_unit,
      precipitation_notes, wind_notes, humidity, site_condition_notes
    )
    values (
      coalesce(nullif(p_weather->>'id', '')::uuid, gen_random_uuid()),
      p_company_id,
      p_daily_site_log_id,
      coalesce(nullif(btrim(p_weather->>'condition'), ''), 'UNKNOWN'),
      nullif(p_weather->>'temperature', '')::numeric,
      coalesce(nullif(p_weather->>'temperature_unit', ''), 'C'),
      nullif(btrim(p_weather->>'precipitation_notes'), ''),
      nullif(btrim(p_weather->>'wind_notes'), ''),
      nullif(p_weather->>'humidity', '')::numeric,
      nullif(btrim(p_weather->>'site_condition_notes'), '')
    );
  end if;

  if p_crew is null or jsonb_typeof(p_crew) <> 'array' then raise exception 'Crew must be an array' using errcode = '22023'; end if;
  for v_item in select value from jsonb_array_elements(p_crew) loop
    if jsonb_typeof(v_item) <> 'object' then raise exception 'Crew rows must be objects' using errcode = '22023'; end if;
    v_trade := nullif(btrim(v_item->>'trade'), '');
    v_crew_label := nullif(btrim(v_item->>'crew_label'), '');
    v_contractor_label := nullif(btrim(v_item->>'contractor_label'), '');
    if v_trade is null and v_crew_label is null and v_contractor_label is null then
      raise exception 'Crew row % needs a trade, crew, or contractor label' using errcode = '22023', detail = v_index::text;
    end if;
    insert into public.engineering_daily_site_log_crew(
      id, company_id, site_log_id, trade, crew_label, contractor_label, headcount,
      regular_hours, overtime_hours, notes, sort_order
    )
    values (
      coalesce(nullif(v_item->>'id', '')::uuid, gen_random_uuid()), p_company_id, p_daily_site_log_id,
      v_trade, v_crew_label, v_contractor_label,
      coalesce(nullif(v_item->>'headcount', '')::integer, 0),
      nullif(v_item->>'regular_hours', '')::numeric,
      nullif(v_item->>'overtime_hours', '')::numeric,
      nullif(btrim(v_item->>'notes'), ''),
      coalesce(nullif(v_item->>'sort_order', '')::integer, v_index)
    );
    v_index := v_index + 1;
  end loop;

  if p_equipment is null or jsonb_typeof(p_equipment) <> 'array' then raise exception 'Equipment must be an array' using errcode = '22023'; end if;
  v_index := 0;
  for v_item in select value from jsonb_array_elements(p_equipment) loop
    if jsonb_typeof(v_item) <> 'object' then raise exception 'Equipment rows must be objects' using errcode = '22023'; end if;
    insert into public.engineering_daily_site_log_equipment(
      id, company_id, site_log_id, equipment_name, equipment_type, asset_reference,
      operating_hours, idle_hours, operator_crew_note, condition_status, notes, sort_order
    )
    values (
      coalesce(nullif(v_item->>'id', '')::uuid, gen_random_uuid()), p_company_id, p_daily_site_log_id,
      btrim(v_item->>'equipment_name'), nullif(btrim(v_item->>'equipment_type'), ''), nullif(btrim(v_item->>'asset_reference'), ''),
      nullif(v_item->>'operating_hours', '')::numeric, nullif(v_item->>'idle_hours', '')::numeric,
      nullif(btrim(v_item->>'operator_crew_note'), ''), nullif(btrim(v_item->>'condition_status'), ''),
      nullif(btrim(v_item->>'notes'), ''), coalesce(nullif(v_item->>'sort_order', '')::integer, v_index)
    );
    v_index := v_index + 1;
  end loop;

  if p_safety is null or jsonb_typeof(p_safety) <> 'array' then raise exception 'Safety must be an array' using errcode = '22023'; end if;
  v_index := 0;
  for v_item in select value from jsonb_array_elements(p_safety) loop
    if jsonb_typeof(v_item) <> 'object' then raise exception 'Safety rows must be objects' using errcode = '22023'; end if;
    insert into public.engineering_daily_site_log_safety(
      id, company_id, site_log_id, category, severity, description, action_taken, is_resolved, notes, sort_order
    )
    values (
      coalesce(nullif(v_item->>'id', '')::uuid, gen_random_uuid()), p_company_id, p_daily_site_log_id,
      btrim(v_item->>'category'), coalesce(nullif(v_item->>'severity', ''), 'OBSERVATION'), btrim(v_item->>'description'),
      nullif(btrim(v_item->>'action_taken'), ''), coalesce((v_item->>'is_resolved')::boolean, true),
      nullif(btrim(v_item->>'notes'), ''), coalesce(nullif(v_item->>'sort_order', '')::integer, v_index)
    );
    v_index := v_index + 1;
  end loop;
end;
$$;

drop trigger if exists engineering_daily_site_logs_reference on public.engineering_daily_site_logs;
create trigger engineering_daily_site_logs_reference
before insert or update on public.engineering_daily_site_logs
for each row execute function private.validate_daily_site_log_reference();

drop trigger if exists engineering_daily_site_log_weather_reference on public.engineering_daily_site_log_weather;
create trigger engineering_daily_site_log_weather_reference
before insert or update on public.engineering_daily_site_log_weather
for each row execute function private.validate_daily_site_log_reference();
drop trigger if exists engineering_daily_site_log_crew_reference on public.engineering_daily_site_log_crew;
create trigger engineering_daily_site_log_crew_reference
before insert or update on public.engineering_daily_site_log_crew
for each row execute function private.validate_daily_site_log_reference();
drop trigger if exists engineering_daily_site_log_equipment_reference on public.engineering_daily_site_log_equipment;
create trigger engineering_daily_site_log_equipment_reference
before insert or update on public.engineering_daily_site_log_equipment
for each row execute function private.validate_daily_site_log_reference();
drop trigger if exists engineering_daily_site_log_safety_reference on public.engineering_daily_site_log_safety;
create trigger engineering_daily_site_log_safety_reference
before insert or update on public.engineering_daily_site_log_safety
for each row execute function private.validate_daily_site_log_reference();
drop trigger if exists engineering_daily_site_log_events_reference on public.engineering_daily_site_log_events;
create trigger engineering_daily_site_log_events_reference
before insert on public.engineering_daily_site_log_events
for each row execute function private.validate_daily_site_log_reference();

drop trigger if exists engineering_daily_site_logs_no_delete on public.engineering_daily_site_logs;
create trigger engineering_daily_site_logs_no_delete
before delete on public.engineering_daily_site_logs
for each row execute function private.prevent_daily_site_log_delete();
drop trigger if exists engineering_daily_site_logs_formal_guard on public.engineering_daily_site_logs;
create trigger engineering_daily_site_logs_formal_guard
before update on public.engineering_daily_site_logs
for each row execute function private.guard_daily_site_log_formal_mutation();
drop trigger if exists engineering_daily_site_log_events_append_only on public.engineering_daily_site_log_events;
create trigger engineering_daily_site_log_events_append_only
before update or delete on public.engineering_daily_site_log_events
for each row execute function private.prevent_daily_site_log_history_mutation();

drop trigger if exists engineering_daily_site_log_weather_formal_guard on public.engineering_daily_site_log_weather;
create trigger engineering_daily_site_log_weather_formal_guard
before update or delete on public.engineering_daily_site_log_weather
for each row execute function private.prevent_daily_site_log_child_formal_mutation();
drop trigger if exists engineering_daily_site_log_crew_formal_guard on public.engineering_daily_site_log_crew;
create trigger engineering_daily_site_log_crew_formal_guard
before update or delete on public.engineering_daily_site_log_crew
for each row execute function private.prevent_daily_site_log_child_formal_mutation();
drop trigger if exists engineering_daily_site_log_equipment_formal_guard on public.engineering_daily_site_log_equipment;
create trigger engineering_daily_site_log_equipment_formal_guard
before update or delete on public.engineering_daily_site_log_equipment
for each row execute function private.prevent_daily_site_log_child_formal_mutation();
drop trigger if exists engineering_daily_site_log_safety_formal_guard on public.engineering_daily_site_log_safety;
create trigger engineering_daily_site_log_safety_formal_guard
before update or delete on public.engineering_daily_site_log_safety
for each row execute function private.prevent_daily_site_log_child_formal_mutation();

alter table public.engineering_daily_site_logs enable row level security;
alter table public.engineering_daily_site_log_weather enable row level security;
alter table public.engineering_daily_site_log_crew enable row level security;
alter table public.engineering_daily_site_log_equipment enable row level security;
alter table public.engineering_daily_site_log_safety enable row level security;
alter table public.engineering_daily_site_log_events enable row level security;

revoke all on public.engineering_daily_site_logs,
  public.engineering_daily_site_log_weather,
  public.engineering_daily_site_log_crew,
  public.engineering_daily_site_log_equipment,
  public.engineering_daily_site_log_safety,
  public.engineering_daily_site_log_events
from public, anon, authenticated;
grant select on public.engineering_daily_site_logs,
  public.engineering_daily_site_log_weather,
  public.engineering_daily_site_log_crew,
  public.engineering_daily_site_log_equipment,
  public.engineering_daily_site_log_safety,
  public.engineering_daily_site_log_events to authenticated;

create policy engineering_daily_site_logs_read on public.engineering_daily_site_logs
for select to authenticated
using ((select private.has_company_permission(company_id, 'engineering.sitelogs.read')));
create policy engineering_daily_site_log_weather_read on public.engineering_daily_site_log_weather
for select to authenticated
using ((select private.has_company_permission(company_id, 'engineering.sitelogs.read')));
create policy engineering_daily_site_log_crew_read on public.engineering_daily_site_log_crew
for select to authenticated
using ((select private.has_company_permission(company_id, 'engineering.sitelogs.read')));
create policy engineering_daily_site_log_equipment_read on public.engineering_daily_site_log_equipment
for select to authenticated
using ((select private.has_company_permission(company_id, 'engineering.sitelogs.read')));
create policy engineering_daily_site_log_safety_read on public.engineering_daily_site_log_safety
for select to authenticated
using ((select private.has_company_permission(company_id, 'engineering.sitelogs.read')));
create policy engineering_daily_site_log_events_read on public.engineering_daily_site_log_events
for select to authenticated
using ((select private.has_company_permission(company_id, 'engineering.sitelogs.read')));

create or replace function public.create_engineering_daily_site_log(
  p_company_id uuid,
  p_daily_site_log_id uuid,
  p_project_id uuid,
  p_site_date date,
  p_report_number text default null,
  p_work_summary text default '',
  p_progress_notes text default null,
  p_delays_constraints text default null,
  p_general_notes text default null,
  p_weather jsonb default null,
  p_crew jsonb default '[]'::jsonb,
  p_equipment jsonb default '[]'::jsonb,
  p_safety jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_row public.engineering_daily_site_logs;
  v_report_number text;
begin
  v_actor := private.daily_site_log_actor(p_company_id, 'engineering.sitelogs.create');
  perform private.assert_daily_site_log_project(p_company_id, p_project_id);
  if p_site_date is null then raise exception 'Site date is required' using errcode = '22023'; end if;
  v_report_number := coalesce(nullif(btrim(p_report_number), ''), 'DSL-' || to_char(p_site_date, 'YYYYMMDD'));

  select * into v_row from public.engineering_daily_site_logs l
  where l.id = p_daily_site_log_id and l.company_id = p_company_id
  for update;
  if found then
    if v_row.project_id <> p_project_id or v_row.site_date <> p_site_date then
      raise exception 'The requested Daily Site Log identity does not match the existing record' using errcode = '23505';
    end if;
    return to_jsonb(v_row);
  end if;

  insert into public.engineering_daily_site_logs(
    id, company_id, project_id, site_date, report_number, prepared_by_user_id,
    work_summary, progress_notes, delays_constraints, general_notes
  )
  values (
    p_daily_site_log_id, p_company_id, p_project_id, p_site_date, v_report_number, v_actor,
    coalesce(p_work_summary, ''), nullif(btrim(p_progress_notes), ''), nullif(btrim(p_delays_constraints), ''), nullif(btrim(p_general_notes), '')
  ) returning * into v_row;

  perform private.replace_daily_site_log_children(p_company_id, p_daily_site_log_id, p_weather, p_crew, p_equipment, p_safety);
  perform private.record_daily_site_log_event(p_company_id, p_daily_site_log_id, 'CREATED', null, 'DRAFT', v_actor);
  perform private.write_company_audit(p_company_id, 'ENGINEERING_DAILY_SITE_LOG_CREATED', 'engineering_daily_site_log', p_daily_site_log_id, jsonb_build_object('project_id', p_project_id, 'site_date', p_site_date, 'report_number', v_report_number));
  return to_jsonb(v_row);
end;
$$;

create or replace function public.update_engineering_daily_site_log_draft(
  p_company_id uuid,
  p_daily_site_log_id uuid,
  p_project_id uuid,
  p_site_date date,
  p_report_number text default null,
  p_work_summary text default '',
  p_progress_notes text default null,
  p_delays_constraints text default null,
  p_general_notes text default null,
  p_weather jsonb default null,
  p_crew jsonb default '[]'::jsonb,
  p_equipment jsonb default '[]'::jsonb,
  p_safety jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_row public.engineering_daily_site_logs;
  v_report_number text;
begin
  v_actor := private.daily_site_log_actor(p_company_id, 'engineering.sitelogs.update');
  perform private.assert_daily_site_log_project(p_company_id, p_project_id);
  select * into v_row from public.engineering_daily_site_logs l
  where l.id = p_daily_site_log_id and l.company_id = p_company_id
  for update;
  if not found then raise exception 'Daily Site Log was not found in this company' using errcode = 'P0002'; end if;
  if v_row.status <> 'DRAFT' then raise exception 'Submitted or finalized Site Logs are read-only' using errcode = '55000'; end if;
  if v_row.project_id <> p_project_id then raise exception 'Daily Site Log project cannot change' using errcode = '42501'; end if;
  v_report_number := coalesce(nullif(btrim(p_report_number), ''), v_row.report_number);

  delete from public.engineering_daily_site_log_weather where site_log_id = p_daily_site_log_id and company_id = p_company_id;
  delete from public.engineering_daily_site_log_crew where site_log_id = p_daily_site_log_id and company_id = p_company_id;
  delete from public.engineering_daily_site_log_equipment where site_log_id = p_daily_site_log_id and company_id = p_company_id;
  delete from public.engineering_daily_site_log_safety where site_log_id = p_daily_site_log_id and company_id = p_company_id;
  perform private.replace_daily_site_log_children(p_company_id, p_daily_site_log_id, p_weather, p_crew, p_equipment, p_safety);
  update public.engineering_daily_site_logs set
    site_date = p_site_date,
    report_number = v_report_number,
    work_summary = coalesce(p_work_summary, ''),
    progress_notes = nullif(btrim(p_progress_notes), ''),
    delays_constraints = nullif(btrim(p_delays_constraints), ''),
    general_notes = nullif(btrim(p_general_notes), ''),
    updated_at = now()
  where id = p_daily_site_log_id and company_id = p_company_id
  returning * into v_row;
  perform private.record_daily_site_log_event(p_company_id, p_daily_site_log_id, 'UPDATED', 'DRAFT', 'DRAFT', v_actor);
  perform private.write_company_audit(p_company_id, 'ENGINEERING_DAILY_SITE_LOG_UPDATED', 'engineering_daily_site_log', p_daily_site_log_id, jsonb_build_object('project_id', p_project_id, 'site_date', p_site_date, 'report_number', v_report_number));
  return to_jsonb(v_row);
end;
$$;

create or replace function public.submit_engineering_daily_site_log(p_company_id uuid, p_daily_site_log_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_row public.engineering_daily_site_logs;
begin
  v_actor := private.daily_site_log_actor(p_company_id, 'engineering.sitelogs.submit');
  select * into v_row from public.engineering_daily_site_logs l
  where l.id = p_daily_site_log_id and l.company_id = p_company_id
  for update;
  if not found then raise exception 'Daily Site Log was not found in this company' using errcode = 'P0002'; end if;
  if v_row.status <> 'DRAFT' then raise exception 'Only a draft Site Log can be submitted' using errcode = '55000'; end if;
  perform private.validate_daily_site_log_aggregate(p_daily_site_log_id);
  update public.engineering_daily_site_logs set status = 'SUBMITTED', submitted_at = now(), submitted_by_user_id = v_actor, updated_at = now()
  where id = p_daily_site_log_id and company_id = p_company_id returning * into v_row;
  perform private.record_daily_site_log_event(p_company_id, p_daily_site_log_id, 'SUBMITTED', 'DRAFT', 'SUBMITTED', v_actor);
  perform private.write_company_audit(p_company_id, 'ENGINEERING_DAILY_SITE_LOG_SUBMITTED', 'engineering_daily_site_log', p_daily_site_log_id, jsonb_build_object('project_id', v_row.project_id, 'site_date', v_row.site_date, 'report_number', v_row.report_number));
  return to_jsonb(v_row);
end;
$$;

create or replace function public.finalize_engineering_daily_site_log(p_company_id uuid, p_daily_site_log_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_row public.engineering_daily_site_logs;
begin
  v_actor := private.daily_site_log_actor(p_company_id, 'engineering.sitelogs.manage');
  select * into v_row from public.engineering_daily_site_logs l
  where l.id = p_daily_site_log_id and l.company_id = p_company_id
  for update;
  if not found then raise exception 'Daily Site Log was not found in this company' using errcode = 'P0002'; end if;
  if v_row.status <> 'SUBMITTED' then raise exception 'Only a submitted Site Log can be finalized' using errcode = '55000'; end if;
  perform private.validate_daily_site_log_aggregate(p_daily_site_log_id);
  update public.engineering_daily_site_logs set status = 'FINALIZED', finalized_at = now(), finalized_by_user_id = v_actor, updated_at = now()
  where id = p_daily_site_log_id and company_id = p_company_id returning * into v_row;
  perform private.record_daily_site_log_event(p_company_id, p_daily_site_log_id, 'FINALIZED', 'SUBMITTED', 'FINALIZED', v_actor, 'Formal daily field record finalized.');
  perform private.write_company_audit(p_company_id, 'ENGINEERING_DAILY_SITE_LOG_FINALIZED', 'engineering_daily_site_log', p_daily_site_log_id, jsonb_build_object('project_id', v_row.project_id, 'site_date', v_row.site_date, 'report_number', v_row.report_number));
  return to_jsonb(v_row);
end;
$$;

create or replace function public.void_engineering_daily_site_log(p_company_id uuid, p_daily_site_log_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_row public.engineering_daily_site_logs;
  v_from_status text;
begin
  v_actor := private.daily_site_log_actor(p_company_id, 'engineering.sitelogs.manage');
  if p_reason is null or btrim(p_reason) = '' then raise exception 'Void reason is required' using errcode = '22023'; end if;
  select * into v_row from public.engineering_daily_site_logs l
  where l.id = p_daily_site_log_id and l.company_id = p_company_id
  for update;
  if not found then raise exception 'Daily Site Log was not found in this company' using errcode = 'P0002'; end if;
  if v_row.status in ('FINALIZED', 'VOID') then raise exception 'Finalized or void Site Logs cannot be voided' using errcode = '55000'; end if;
  v_from_status := v_row.status;
  update public.engineering_daily_site_logs set status = 'VOID', voided_at = now(), voided_by_user_id = v_actor, void_reason = btrim(p_reason), updated_at = now()
  where id = p_daily_site_log_id and company_id = p_company_id returning * into v_row;
  perform private.record_daily_site_log_event(p_company_id, p_daily_site_log_id, 'VOIDED', v_from_status, 'VOID', v_actor, p_reason);
  perform private.write_company_audit(p_company_id, 'ENGINEERING_DAILY_SITE_LOG_VOIDED', 'engineering_daily_site_log', p_daily_site_log_id, jsonb_build_object('project_id', v_row.project_id, 'site_date', v_row.site_date, 'reason', btrim(p_reason)));
  return to_jsonb(v_row);
end;
$$;

revoke execute on function private.daily_site_log_actor(uuid, text) from public, anon, authenticated;
revoke execute on function private.assert_daily_site_log_project(uuid, uuid) from public, anon, authenticated;
revoke execute on function private.validate_daily_site_log_reference() from public, anon, authenticated;
revoke execute on function private.prevent_daily_site_log_history_mutation() from public, anon, authenticated;
revoke execute on function private.prevent_daily_site_log_delete() from public, anon, authenticated;
revoke execute on function private.guard_daily_site_log_formal_mutation() from public, anon, authenticated;
revoke execute on function private.prevent_daily_site_log_child_formal_mutation() from public, anon, authenticated;
revoke execute on function private.validate_daily_site_log_aggregate(uuid) from public, anon, authenticated;
revoke execute on function private.record_daily_site_log_event(uuid, uuid, text, text, text, uuid, text) from public, anon, authenticated;
revoke execute on function private.replace_daily_site_log_children(uuid, uuid, jsonb, jsonb, jsonb, jsonb) from public, anon, authenticated;
revoke execute on function public.create_engineering_daily_site_log(uuid, uuid, uuid, date, text, text, text, text, text, jsonb, jsonb, jsonb, jsonb) from public, anon;
revoke execute on function public.update_engineering_daily_site_log_draft(uuid, uuid, uuid, date, text, text, text, text, text, jsonb, jsonb, jsonb, jsonb) from public, anon;
revoke execute on function public.submit_engineering_daily_site_log(uuid, uuid) from public, anon;
revoke execute on function public.finalize_engineering_daily_site_log(uuid, uuid) from public, anon;
revoke execute on function public.void_engineering_daily_site_log(uuid, uuid, text) from public, anon;
grant execute on function public.create_engineering_daily_site_log(uuid, uuid, uuid, date, text, text, text, text, text, jsonb, jsonb, jsonb, jsonb) to authenticated;
grant execute on function public.update_engineering_daily_site_log_draft(uuid, uuid, uuid, date, text, text, text, text, text, jsonb, jsonb, jsonb, jsonb) to authenticated;
grant execute on function public.submit_engineering_daily_site_log(uuid, uuid) to authenticated;
grant execute on function public.finalize_engineering_daily_site_log(uuid, uuid) to authenticated;
grant execute on function public.void_engineering_daily_site_log(uuid, uuid, text) to authenticated;
