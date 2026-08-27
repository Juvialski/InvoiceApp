-- Engoryx Phase 1C: Daily Site Logs and Weather.
-- Additive, project-scoped field records with immutable submitted history and append-only amendments.

insert into public.company_permission_catalog (permission_key, description)
values
  ('engineering.daily_logs.read', 'Read project Daily Site Logs, weather snapshots, crews, equipment, events, amendments, and attachments.'),
  ('engineering.daily_logs.create', 'Create and edit draft Daily Site Logs.'),
  ('engineering.daily_logs.submit', 'Formally submit Daily Site Logs and freeze the recorded site-day content.'),
  ('engineering.daily_logs.review', 'Review submitted Daily Site Logs.'),
  ('engineering.daily_logs.manage', 'Append corrections or void eligible Daily Site Logs.')
on conflict (permission_key) do update set description = excluded.description;

insert into public.company_role_permissions (role_key, permission_key)
select 'COMPANY_ADMIN', permission_key
from public.company_permission_catalog
where permission_key like 'engineering.daily_logs.%'
on conflict do nothing;

insert into public.company_role_permissions (role_key, permission_key)
values
  ('FINANCE', 'engineering.daily_logs.read'),
  ('PAYROLL', 'engineering.daily_logs.read'),
  ('VIEWER', 'engineering.daily_logs.read')
on conflict do nothing;

create table if not exists public.engineering_daily_logs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  project_id uuid not null references public.projects(id) on delete restrict,
  log_date date not null,
  shift_code text not null default 'DAY' check (shift_code in ('DAY', 'NIGHT', 'SWING', 'CUSTOM')),
  shift_label text check (shift_label is null or length(btrim(shift_label)) between 1 and 80),
  sequence_no integer not null default 1 check (sequence_no >= 1),
  status text not null default 'DRAFT' check (status in ('DRAFT', 'SUBMITTED', 'REVIEWED', 'VOID')),
  work_summary text not null check (length(btrim(work_summary)) between 1 and 12000),
  delay_summary text check (delay_summary is null or length(btrim(delay_summary)) <= 8000),
  safety_summary text check (safety_summary is null or length(btrim(safety_summary)) <= 8000),
  quality_summary text check (quality_summary is null or length(btrim(quality_summary)) <= 8000),
  deliveries_visitors text check (deliveries_visitors is null or length(btrim(deliveries_visitors)) <= 8000),
  general_notes text check (general_notes is null or length(btrim(general_notes)) <= 12000),
  prepared_by_user_id uuid not null references auth.users(id) on delete restrict,
  submitted_by_user_id uuid references auth.users(id) on delete restrict,
  reviewed_by_user_id uuid references auth.users(id) on delete restrict,
  prepared_at timestamptz not null default now(),
  submitted_at timestamptz,
  reviewed_at timestamptz,
  voided_at timestamptz,
  void_reason text check (void_reason is null or length(btrim(void_reason)) between 1 and 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, project_id, log_date, shift_code, sequence_no)
);

create table if not exists public.engineering_daily_log_weather (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  daily_log_id uuid not null unique references public.engineering_daily_logs(id) on delete restrict,
  condition text not null check (length(btrim(condition)) between 1 and 160),
  temperature_c numeric(6,2),
  precipitation_mm numeric(10,2) check (precipitation_mm is null or precipitation_mm >= 0),
  wind_kph numeric(8,2) check (wind_kph is null or wind_kph >= 0),
  humidity_percent numeric(5,2) check (humidity_percent is null or humidity_percent between 0 and 100),
  work_impact text not null default 'NONE' check (work_impact in ('NONE', 'LOW', 'MODERATE', 'HIGH', 'STOPPAGE')),
  source text not null default 'MANUAL' check (source in ('MANUAL', 'PROVIDER')),
  observed_at timestamptz,
  notes text check (notes is null or length(btrim(notes)) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.engineering_daily_log_crews (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  daily_log_id uuid not null references public.engineering_daily_logs(id) on delete restrict,
  crew_label text not null check (length(btrim(crew_label)) between 1 and 160),
  trade text check (trade is null or length(btrim(trade)) <= 120),
  planned_count integer not null default 0 check (planned_count >= 0),
  actual_count integer not null default 0 check (actual_count >= 0),
  regular_hours numeric(8,2) not null default 0 check (regular_hours >= 0),
  overtime_hours numeric(8,2) not null default 0 check (overtime_hours >= 0),
  notes text check (notes is null or length(btrim(notes)) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.engineering_daily_log_equipment (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  daily_log_id uuid not null references public.engineering_daily_logs(id) on delete restrict,
  equipment_label text not null check (length(btrim(equipment_label)) between 1 and 160),
  equipment_reference text check (equipment_reference is null or length(btrim(equipment_reference)) <= 120),
  quantity integer not null default 1 check (quantity >= 1),
  operating_hours numeric(8,2) not null default 0 check (operating_hours >= 0),
  idle_hours numeric(8,2) not null default 0 check (idle_hours >= 0),
  status text not null default 'OPERATING' check (status in ('OPERATING', 'IDLE', 'DOWN', 'MAINTENANCE')),
  operator_note text check (operator_note is null or length(btrim(operator_note)) <= 2000),
  issue_note text check (issue_note is null or length(btrim(issue_note)) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.engineering_daily_log_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  daily_log_id uuid not null references public.engineering_daily_logs(id) on delete restrict,
  event_type text not null check (event_type in ('WORK', 'DELIVERY', 'VISITOR', 'DELAY', 'SAFETY', 'QUALITY')),
  occurred_at timestamptz,
  title text not null check (length(btrim(title)) between 1 and 200),
  description text not null check (length(btrim(description)) between 1 and 8000),
  severity text not null default 'INFO' check (severity in ('INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  work_stoppage boolean not null default false,
  location text check (location is null or length(btrim(location)) <= 255),
  immediate_action text check (immediate_action is null or length(btrim(immediate_action)) <= 4000),
  created_at timestamptz not null default now()
);

create table if not exists public.engineering_daily_log_amendments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  daily_log_id uuid not null references public.engineering_daily_logs(id) on delete restrict,
  amendment_text text not null check (length(btrim(amendment_text)) between 1 and 8000),
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table if not exists public.engineering_daily_log_attachments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  daily_log_id uuid not null references public.engineering_daily_logs(id) on delete restrict,
  storage_path text not null check (length(btrim(storage_path)) between 1 and 1024),
  file_name text not null check (length(btrim(file_name)) between 1 and 255),
  mime_type text check (mime_type is null or length(btrim(mime_type)) <= 160),
  file_size_bytes bigint check (file_size_bytes is null or file_size_bytes >= 0),
  caption text check (caption is null or length(btrim(caption)) <= 1000),
  captured_at timestamptz,
  uploaded_by_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (daily_log_id, storage_path)
);

create index if not exists engineering_daily_logs_company_project_date_idx on public.engineering_daily_logs(company_id, project_id, log_date desc, sequence_no desc);
create index if not exists engineering_daily_logs_company_status_idx on public.engineering_daily_logs(company_id, status, log_date desc);
create index if not exists engineering_daily_log_crews_parent_idx on public.engineering_daily_log_crews(daily_log_id);
create index if not exists engineering_daily_log_equipment_parent_idx on public.engineering_daily_log_equipment(daily_log_id);
create index if not exists engineering_daily_log_events_parent_idx on public.engineering_daily_log_events(daily_log_id, occurred_at);
create index if not exists engineering_daily_log_amendments_parent_idx on public.engineering_daily_log_amendments(daily_log_id, created_at);
create index if not exists engineering_daily_log_attachments_parent_idx on public.engineering_daily_log_attachments(daily_log_id, created_at);

-- Strict superset of all audit events through Phase 1B plus Phase 1C field-log lifecycle events.
alter table public.company_audit_events drop constraint if exists company_audit_events_event_type_check;
alter table public.company_audit_events add constraint company_audit_events_event_type_check check (event_type in (
  'COMPANY_CREATED', 'COMPANY_UPDATED', 'COMPANY_SUSPENDED', 'COMPANY_ARCHIVED', 'COMPANY_REACTIVATED',
  'USER_INVITED', 'INVITE_REVOKED', 'INVITE_ACCEPTED',
  'MEMBER_ROLE_CHANGED', 'MEMBER_SUSPENDED', 'MEMBER_REACTIVATED', 'MEMBER_REVOKED',
  'PAYROLL_REPAIR_APPLIED', 'PAYROLL_CALENDAR_REBUILT', 'PAYROLL_UNAPPROVED_RESET',
  'COMPANY_AI_CREDENTIAL_CONFIGURED', 'COMPANY_AI_CREDENTIAL_ROTATED', 'COMPANY_AI_CREDENTIAL_TESTED', 'COMPANY_AI_CREDENTIAL_ENABLED',
  'COMPANY_AI_CREDENTIAL_DISABLED', 'COMPANY_AI_CREDENTIAL_REMOVED', 'PAYROLL_WORKSPACE_RESET',
  'CASH_ACCOUNT_CREATED', 'CASH_ACCOUNT_UPDATED', 'CASH_ACCOUNT_DEACTIVATED',
  'CASH_BALANCE_SNAPSHOT_RECORDED', 'CASH_STATEMENT_IMPORTED', 'CASH_STATEMENT_REJECTED',
  'CASH_TRANSACTION_CREATED', 'CASH_TRANSACTION_UPDATED', 'CASH_RECONCILIATION_CONFIRMED', 'CASH_RECONCILIATION_REMOVED', 'CASH_TRANSFER_MATCHED',
  'ENGINEERING_DOCUMENT_CREATED', 'ENGINEERING_DOCUMENT_UPDATED', 'ENGINEERING_DOCUMENT_ARCHIVED',
  'ENGINEERING_REVISION_UPLOADED', 'ENGINEERING_ANNOTATION_SAVED', 'ENGINEERING_ANNOTATION_DELETED',
  'ENGINEERING_RFI_CREATED', 'ENGINEERING_RFI_OPENED', 'ENGINEERING_RFI_RESPONDED', 'ENGINEERING_RFI_CLOSED', 'ENGINEERING_RFI_VOIDED',
  'ENGINEERING_SUBMITTAL_CREATED', 'ENGINEERING_SUBMITTAL_SUBMITTED', 'ENGINEERING_SUBMITTAL_REVIEW_STARTED', 'ENGINEERING_SUBMITTAL_REVIEWED',
  'ENGINEERING_SUBMITTAL_RESUBMITTED', 'ENGINEERING_SUBMITTAL_CLOSED', 'ENGINEERING_SUBMITTAL_VOIDED',
  'ENGINEERING_DAILY_LOG_CREATED', 'ENGINEERING_DAILY_LOG_UPDATED', 'ENGINEERING_DAILY_LOG_SUBMITTED',
  'ENGINEERING_DAILY_LOG_REVIEWED', 'ENGINEERING_DAILY_LOG_VOIDED', 'ENGINEERING_DAILY_LOG_AMENDED'
));

create or replace function private.engineering_daily_log_actor(p_company_id uuid, p_permission_key text)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare v_actor uuid := (select auth.uid());
begin
  if v_actor is null or not (select private.has_company_permission(p_company_id, p_permission_key)) then
    raise exception 'Daily Site Log permission denied' using errcode = '42501';
  end if;
  return v_actor;
end;
$$;

create or replace function private.assert_engineering_daily_log_project(p_company_id uuid, p_project_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if not exists (select 1 from public.projects p where p.id = p_project_id and p.company_id = p_company_id and p.archived_at is null) then
    raise exception 'Project is outside the selected company or unavailable' using errcode = '42501';
  end if;
end;
$$;

create or replace function private.guard_engineering_daily_log()
returns trigger language plpgsql security invoker set search_path = ''
as $$
begin
  if old.status <> 'DRAFT' and (
    new.company_id is distinct from old.company_id or new.project_id is distinct from old.project_id or new.log_date is distinct from old.log_date or
    new.shift_code is distinct from old.shift_code or new.shift_label is distinct from old.shift_label or new.sequence_no is distinct from old.sequence_no or
    new.work_summary is distinct from old.work_summary or new.delay_summary is distinct from old.delay_summary or new.safety_summary is distinct from old.safety_summary or
    new.quality_summary is distinct from old.quality_summary or new.deliveries_visitors is distinct from old.deliveries_visitors or new.general_notes is distinct from old.general_notes or
    new.prepared_by_user_id is distinct from old.prepared_by_user_id or new.prepared_at is distinct from old.prepared_at or new.created_at is distinct from old.created_at
  ) then
    raise exception 'Submitted Daily Site Log content is immutable; append an amendment instead' using errcode = '55000';
  end if;
  if old.status = 'VOID' then raise exception 'Void Daily Site Logs are terminal' using errcode = '55000'; end if;
  if new.status is distinct from old.status and not (
    (old.status = 'DRAFT' and new.status in ('SUBMITTED', 'VOID')) or
    (old.status = 'SUBMITTED' and new.status in ('REVIEWED', 'VOID'))
  ) then raise exception 'Unsupported Daily Site Log status transition' using errcode = '55000'; end if;
  return new;
end;
$$;

create or replace function private.guard_engineering_daily_log_child()
returns trigger language plpgsql security invoker set search_path = ''
as $$
declare v_daily_log_id uuid; v_company_id uuid; v_parent_company_id uuid; v_status text;
begin
  v_daily_log_id := case when tg_op = 'DELETE' then old.daily_log_id else new.daily_log_id end;
  v_company_id := case when tg_op = 'DELETE' then old.company_id else new.company_id end;
  select company_id, status into v_parent_company_id, v_status from public.engineering_daily_logs where id = v_daily_log_id;
  if v_parent_company_id is null or v_parent_company_id <> v_company_id then raise exception 'Daily Site Log child record is outside the company' using errcode='42501'; end if;
  if tg_table_name = 'engineering_daily_log_amendments' then
    if tg_op <> 'INSERT' then raise exception 'Daily Site Log amendments are append-only' using errcode='55000'; end if;
    if v_status not in ('SUBMITTED', 'REVIEWED') then raise exception 'Amendments require a submitted Daily Site Log' using errcode='55000'; end if;
  elsif tg_table_name = 'engineering_daily_log_attachments' then
    if tg_op <> 'INSERT' then raise exception 'Daily Site Log attachment metadata is append-only' using errcode='55000'; end if;
    if v_status = 'VOID' then raise exception 'Attachments cannot be added to a void Daily Site Log' using errcode='55000'; end if;
  else
    if v_status <> 'DRAFT' then raise exception 'Submitted Daily Site Log sections are immutable' using errcode='55000'; end if;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create or replace function private.prevent_engineering_daily_log_delete()
returns trigger language plpgsql security invoker set search_path = ''
as $$ begin raise exception 'Daily Site Logs are retained for audit history' using errcode='55000'; end; $$;

drop trigger if exists engineering_daily_logs_guard on public.engineering_daily_logs;
create trigger engineering_daily_logs_guard before update on public.engineering_daily_logs for each row execute function private.guard_engineering_daily_log();
drop trigger if exists engineering_daily_logs_no_delete on public.engineering_daily_logs;
create trigger engineering_daily_logs_no_delete before delete on public.engineering_daily_logs for each row execute function private.prevent_engineering_daily_log_delete();

create trigger engineering_daily_log_weather_guard before insert or update or delete on public.engineering_daily_log_weather for each row execute function private.guard_engineering_daily_log_child();
create trigger engineering_daily_log_crews_guard before insert or update or delete on public.engineering_daily_log_crews for each row execute function private.guard_engineering_daily_log_child();
create trigger engineering_daily_log_equipment_guard before insert or update or delete on public.engineering_daily_log_equipment for each row execute function private.guard_engineering_daily_log_child();
create trigger engineering_daily_log_events_guard before insert or update or delete on public.engineering_daily_log_events for each row execute function private.guard_engineering_daily_log_child();
create trigger engineering_daily_log_amendments_guard before insert or update or delete on public.engineering_daily_log_amendments for each row execute function private.guard_engineering_daily_log_child();
create trigger engineering_daily_log_attachments_guard before insert or update or delete on public.engineering_daily_log_attachments for each row execute function private.guard_engineering_daily_log_child();

alter table public.engineering_daily_logs enable row level security;
alter table public.engineering_daily_log_weather enable row level security;
alter table public.engineering_daily_log_crews enable row level security;
alter table public.engineering_daily_log_equipment enable row level security;
alter table public.engineering_daily_log_events enable row level security;
alter table public.engineering_daily_log_amendments enable row level security;
alter table public.engineering_daily_log_attachments enable row level security;

revoke all on public.engineering_daily_logs, public.engineering_daily_log_weather, public.engineering_daily_log_crews,
  public.engineering_daily_log_equipment, public.engineering_daily_log_events, public.engineering_daily_log_amendments, public.engineering_daily_log_attachments
from public, anon, authenticated;
grant select on public.engineering_daily_logs, public.engineering_daily_log_weather, public.engineering_daily_log_crews,
  public.engineering_daily_log_equipment, public.engineering_daily_log_events, public.engineering_daily_log_amendments, public.engineering_daily_log_attachments to authenticated;

create policy engineering_daily_logs_read on public.engineering_daily_logs for select to authenticated using ((select private.has_company_permission(company_id, 'engineering.daily_logs.read')));
create policy engineering_daily_log_weather_read on public.engineering_daily_log_weather for select to authenticated using ((select private.has_company_permission(company_id, 'engineering.daily_logs.read')));
create policy engineering_daily_log_crews_read on public.engineering_daily_log_crews for select to authenticated using ((select private.has_company_permission(company_id, 'engineering.daily_logs.read')));
create policy engineering_daily_log_equipment_read on public.engineering_daily_log_equipment for select to authenticated using ((select private.has_company_permission(company_id, 'engineering.daily_logs.read')));
create policy engineering_daily_log_events_read on public.engineering_daily_log_events for select to authenticated using ((select private.has_company_permission(company_id, 'engineering.daily_logs.read')));
create policy engineering_daily_log_amendments_read on public.engineering_daily_log_amendments for select to authenticated using ((select private.has_company_permission(company_id, 'engineering.daily_logs.read')));
create policy engineering_daily_log_attachments_read on public.engineering_daily_log_attachments for select to authenticated using ((select private.has_company_permission(company_id, 'engineering.daily_logs.read')));

create or replace function public.save_engineering_daily_log_draft(
  p_company_id uuid, p_daily_log_id uuid, p_project_id uuid, p_log_date date, p_shift_code text, p_shift_label text, p_sequence_no integer,
  p_work_summary text, p_delay_summary text, p_safety_summary text, p_quality_summary text, p_deliveries_visitors text, p_general_notes text,
  p_weather jsonb, p_crews jsonb, p_equipment jsonb, p_events jsonb
) returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid; v_row public.engineering_daily_logs; v_existing boolean := false; v_item jsonb;
begin
  v_actor := private.engineering_daily_log_actor(p_company_id, 'engineering.daily_logs.create');
  perform private.assert_engineering_daily_log_project(p_company_id, p_project_id);
  if p_work_summary is null or btrim(p_work_summary) = '' then raise exception 'Work summary is required' using errcode='22023'; end if;
  if p_shift_code not in ('DAY','NIGHT','SWING','CUSTOM') then raise exception 'Unsupported Daily Site Log shift' using errcode='22023'; end if;
  if p_sequence_no is null or p_sequence_no < 1 then raise exception 'Daily Site Log sequence must be at least 1' using errcode='22023'; end if;

  select exists(select 1 from public.engineering_daily_logs where id=p_daily_log_id and company_id=p_company_id) into v_existing;
  if v_existing then
    select * into v_row from public.engineering_daily_logs where id=p_daily_log_id and company_id=p_company_id for update;
    if v_row.project_id <> p_project_id then raise exception 'Daily Site Log project cannot change' using errcode='42501'; end if;
    if v_row.status <> 'DRAFT' then raise exception 'Only a draft Daily Site Log can be edited' using errcode='55000'; end if;
    update public.engineering_daily_logs set
      log_date=p_log_date, shift_code=p_shift_code, shift_label=nullif(btrim(p_shift_label),''), sequence_no=p_sequence_no,
      work_summary=btrim(p_work_summary), delay_summary=nullif(btrim(p_delay_summary),''), safety_summary=nullif(btrim(p_safety_summary),''),
      quality_summary=nullif(btrim(p_quality_summary),''), deliveries_visitors=nullif(btrim(p_deliveries_visitors),''), general_notes=nullif(btrim(p_general_notes),''), updated_at=now()
    where id=p_daily_log_id returning * into v_row;
  else
    insert into public.engineering_daily_logs(id, company_id, project_id, log_date, shift_code, shift_label, sequence_no, work_summary, delay_summary, safety_summary, quality_summary, deliveries_visitors, general_notes, prepared_by_user_id)
    values (p_daily_log_id, p_company_id, p_project_id, p_log_date, p_shift_code, nullif(btrim(p_shift_label),''), p_sequence_no, btrim(p_work_summary), nullif(btrim(p_delay_summary),''), nullif(btrim(p_safety_summary),''), nullif(btrim(p_quality_summary),''), nullif(btrim(p_deliveries_visitors),''), nullif(btrim(p_general_notes),''), v_actor)
    returning * into v_row;
  end if;

  delete from public.engineering_daily_log_weather where daily_log_id=p_daily_log_id;
  delete from public.engineering_daily_log_crews where daily_log_id=p_daily_log_id;
  delete from public.engineering_daily_log_equipment where daily_log_id=p_daily_log_id;
  delete from public.engineering_daily_log_events where daily_log_id=p_daily_log_id;

  if p_weather is not null and p_weather <> 'null'::jsonb then
    insert into public.engineering_daily_log_weather(company_id, daily_log_id, condition, temperature_c, precipitation_mm, wind_kph, humidity_percent, work_impact, source, observed_at, notes)
    values (p_company_id, p_daily_log_id, btrim(p_weather->>'condition'), nullif(p_weather->>'temperature_c','')::numeric, nullif(p_weather->>'precipitation_mm','')::numeric,
      nullif(p_weather->>'wind_kph','')::numeric, nullif(p_weather->>'humidity_percent','')::numeric, coalesce(nullif(p_weather->>'work_impact',''),'NONE'),
      coalesce(nullif(p_weather->>'source',''),'MANUAL'), nullif(p_weather->>'observed_at','')::timestamptz, nullif(btrim(p_weather->>'notes'),''));
  end if;

  for v_item in select value from jsonb_array_elements(coalesce(p_crews, '[]'::jsonb)) loop
    insert into public.engineering_daily_log_crews(company_id, daily_log_id, crew_label, trade, planned_count, actual_count, regular_hours, overtime_hours, notes)
    values (p_company_id, p_daily_log_id, btrim(v_item->>'crew_label'), nullif(btrim(v_item->>'trade'),''), coalesce((v_item->>'planned_count')::integer,0), coalesce((v_item->>'actual_count')::integer,0), coalesce((v_item->>'regular_hours')::numeric,0), coalesce((v_item->>'overtime_hours')::numeric,0), nullif(btrim(v_item->>'notes'),''));
  end loop;
  for v_item in select value from jsonb_array_elements(coalesce(p_equipment, '[]'::jsonb)) loop
    insert into public.engineering_daily_log_equipment(company_id, daily_log_id, equipment_label, equipment_reference, quantity, operating_hours, idle_hours, status, operator_note, issue_note)
    values (p_company_id, p_daily_log_id, btrim(v_item->>'equipment_label'), nullif(btrim(v_item->>'equipment_reference'),''), coalesce((v_item->>'quantity')::integer,1), coalesce((v_item->>'operating_hours')::numeric,0), coalesce((v_item->>'idle_hours')::numeric,0), coalesce(nullif(v_item->>'status',''),'OPERATING'), nullif(btrim(v_item->>'operator_note'),''), nullif(btrim(v_item->>'issue_note'),''));
  end loop;
  for v_item in select value from jsonb_array_elements(coalesce(p_events, '[]'::jsonb)) loop
    insert into public.engineering_daily_log_events(company_id, daily_log_id, event_type, occurred_at, title, description, severity, work_stoppage, location, immediate_action)
    values (p_company_id, p_daily_log_id, v_item->>'event_type', nullif(v_item->>'occurred_at','')::timestamptz, btrim(v_item->>'title'), btrim(v_item->>'description'), coalesce(nullif(v_item->>'severity',''),'INFO'), coalesce((v_item->>'work_stoppage')::boolean,false), nullif(btrim(v_item->>'location'),''), nullif(btrim(v_item->>'immediate_action'),''));
  end loop;

  perform private.write_company_audit(p_company_id, case when v_existing then 'ENGINEERING_DAILY_LOG_UPDATED' else 'ENGINEERING_DAILY_LOG_CREATED' end,
    'engineering_daily_log', p_daily_log_id, jsonb_build_object('project_id', p_project_id, 'log_date', p_log_date, 'shift', p_shift_code, 'sequence', p_sequence_no));
  return to_jsonb(v_row);
end;
$$;

create or replace function public.submit_engineering_daily_log(p_company_id uuid, p_daily_log_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $$ declare v_actor uuid; v_row public.engineering_daily_logs; begin
  v_actor := private.engineering_daily_log_actor(p_company_id, 'engineering.daily_logs.submit');
  select * into v_row from public.engineering_daily_logs where id=p_daily_log_id and company_id=p_company_id for update;
  if not found then raise exception 'Daily Site Log not found in company' using errcode='P0002'; end if;
  if v_row.status <> 'DRAFT' then raise exception 'Only a draft Daily Site Log can be submitted' using errcode='55000'; end if;
  update public.engineering_daily_logs set status='SUBMITTED', submitted_by_user_id=v_actor, submitted_at=now(), updated_at=now() where id=p_daily_log_id returning * into v_row;
  perform private.write_company_audit(p_company_id, 'ENGINEERING_DAILY_LOG_SUBMITTED', 'engineering_daily_log', p_daily_log_id, jsonb_build_object('project_id', v_row.project_id, 'log_date', v_row.log_date));
  return to_jsonb(v_row);
end; $$;

create or replace function public.review_engineering_daily_log(p_company_id uuid, p_daily_log_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $$ declare v_actor uuid; v_row public.engineering_daily_logs; begin
  v_actor := private.engineering_daily_log_actor(p_company_id, 'engineering.daily_logs.review');
  select * into v_row from public.engineering_daily_logs where id=p_daily_log_id and company_id=p_company_id for update;
  if not found then raise exception 'Daily Site Log not found in company' using errcode='P0002'; end if;
  if v_row.status <> 'SUBMITTED' then raise exception 'Only a submitted Daily Site Log can be reviewed' using errcode='55000'; end if;
  update public.engineering_daily_logs set status='REVIEWED', reviewed_by_user_id=v_actor, reviewed_at=now(), updated_at=now() where id=p_daily_log_id returning * into v_row;
  perform private.write_company_audit(p_company_id, 'ENGINEERING_DAILY_LOG_REVIEWED', 'engineering_daily_log', p_daily_log_id, jsonb_build_object('project_id', v_row.project_id, 'log_date', v_row.log_date));
  return to_jsonb(v_row);
end; $$;

create or replace function public.void_engineering_daily_log(p_company_id uuid, p_daily_log_id uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path = ''
as $$ declare v_actor uuid; v_row public.engineering_daily_logs; begin
  v_actor := private.engineering_daily_log_actor(p_company_id, 'engineering.daily_logs.manage');
  if p_reason is null or btrim(p_reason)='' then raise exception 'Void reason is required' using errcode='22023'; end if;
  select * into v_row from public.engineering_daily_logs where id=p_daily_log_id and company_id=p_company_id for update;
  if not found then raise exception 'Daily Site Log not found in company' using errcode='P0002'; end if;
  if v_row.status not in ('DRAFT','SUBMITTED') then raise exception 'Reviewed or void Daily Site Logs cannot be voided' using errcode='55000'; end if;
  update public.engineering_daily_logs set status='VOID', voided_at=now(), void_reason=btrim(p_reason), updated_at=now() where id=p_daily_log_id returning * into v_row;
  perform private.write_company_audit(p_company_id, 'ENGINEERING_DAILY_LOG_VOIDED', 'engineering_daily_log', p_daily_log_id, jsonb_build_object('reason', v_row.void_reason));
  return to_jsonb(v_row);
end; $$;

create or replace function public.amend_engineering_daily_log(p_company_id uuid, p_daily_log_id uuid, p_amendment_id uuid, p_amendment_text text)
returns jsonb language plpgsql security definer set search_path = ''
as $$ declare v_actor uuid; v_log public.engineering_daily_logs; v_row public.engineering_daily_log_amendments; begin
  v_actor := private.engineering_daily_log_actor(p_company_id, 'engineering.daily_logs.manage');
  if p_amendment_text is null or btrim(p_amendment_text)='' then raise exception 'Amendment text is required' using errcode='22023'; end if;
  select * into v_log from public.engineering_daily_logs where id=p_daily_log_id and company_id=p_company_id for update;
  if not found then raise exception 'Daily Site Log not found in company' using errcode='P0002'; end if;
  if v_log.status not in ('SUBMITTED','REVIEWED') then raise exception 'Only submitted Daily Site Logs accept amendments' using errcode='55000'; end if;
  insert into public.engineering_daily_log_amendments(id, company_id, daily_log_id, amendment_text, created_by_user_id)
  values (p_amendment_id, p_company_id, p_daily_log_id, btrim(p_amendment_text), v_actor) returning * into v_row;
  perform private.write_company_audit(p_company_id, 'ENGINEERING_DAILY_LOG_AMENDED', 'engineering_daily_log', p_daily_log_id, jsonb_build_object('amendment_id', p_amendment_id));
  return to_jsonb(v_row);
end; $$;

revoke all on function public.save_engineering_daily_log_draft(uuid,uuid,uuid,date,text,text,integer,text,text,text,text,text,text,jsonb,jsonb,jsonb,jsonb) from public, anon;
revoke all on function public.submit_engineering_daily_log(uuid,uuid) from public, anon;
revoke all on function public.review_engineering_daily_log(uuid,uuid) from public, anon;
revoke all on function public.void_engineering_daily_log(uuid,uuid,text) from public, anon;
revoke all on function public.amend_engineering_daily_log(uuid,uuid,uuid,text) from public, anon;
grant execute on function public.save_engineering_daily_log_draft(uuid,uuid,uuid,date,text,text,integer,text,text,text,text,text,text,jsonb,jsonb,jsonb,jsonb) to authenticated;
grant execute on function public.submit_engineering_daily_log(uuid,uuid) to authenticated;
grant execute on function public.review_engineering_daily_log(uuid,uuid) to authenticated;
grant execute on function public.void_engineering_daily_log(uuid,uuid,text) to authenticated;
grant execute on function public.amend_engineering_daily_log(uuid,uuid,uuid,text) to authenticated;
