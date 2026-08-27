-- Engoryx Phase 1B: RFIs and Technical Submittals.
-- Additive only. Formal history is append-only and all lifecycle mutations are guarded RPCs.

insert into public.company_permission_catalog (permission_key, description)
values
  ('engineering.rfis.read', 'Read project RFIs, responses, and immutable engineering revision references.'),
  ('engineering.rfis.create', 'Create and formally open project RFIs.'),
  ('engineering.rfis.respond', 'Append RFI responses and final answers.'),
  ('engineering.rfis.manage', 'Close or void formal RFIs.'),
  ('engineering.submittals.read', 'Read project technical submittals, rounds, reviews, and revision references.'),
  ('engineering.submittals.create', 'Create, submit, and resubmit technical submittals.'),
  ('engineering.submittals.review', 'Start review and append formal technical submittal decisions.'),
  ('engineering.submittals.manage', 'Close or void technical submittals.')
on conflict (permission_key) do update set description = excluded.description;

insert into public.company_role_permissions (role_key, permission_key)
select 'COMPANY_ADMIN', permission_key
from public.company_permission_catalog
where permission_key like 'engineering.rfis.%' or permission_key like 'engineering.submittals.%'
on conflict do nothing;

-- Project visibility already permits these roles to see Phase 1A engineering records.
-- Keep Phase 1B write/review capabilities admin-only by default.
insert into public.company_role_permissions (role_key, permission_key)
values
  ('FINANCE', 'engineering.rfis.read'),
  ('FINANCE', 'engineering.submittals.read'),
  ('PAYROLL', 'engineering.rfis.read'),
  ('PAYROLL', 'engineering.submittals.read'),
  ('VIEWER', 'engineering.rfis.read'),
  ('VIEWER', 'engineering.submittals.read')
on conflict do nothing;

create table if not exists public.engineering_rfis (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  project_id uuid not null references public.projects(id) on delete restrict,
  rfi_number text not null check (length(btrim(rfi_number)) between 1 and 100),
  subject text not null check (length(btrim(subject)) between 1 and 255),
  question text not null check (length(btrim(question)) between 1 and 8000),
  discipline text not null check (discipline in (
    'ARCHITECTURAL', 'STRUCTURAL', 'CIVIL', 'MECHANICAL', 'ELECTRICAL',
    'PLUMBING', 'FIRE_PROTECTION', 'GEOTECHNICAL', 'GENERAL_ENGINEERING', 'OTHER'
  )),
  priority text not null default 'NORMAL' check (priority in ('LOW', 'NORMAL', 'HIGH', 'URGENT')),
  status text not null default 'DRAFT' check (status in ('DRAFT', 'OPEN', 'ANSWERED', 'CLOSED', 'VOID')),
  date_raised date not null default current_date,
  due_date date check (due_date is null or due_date >= date_raised),
  assigned_user_id uuid references auth.users(id) on delete set null,
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  opened_at timestamptz,
  answered_at timestamptz,
  closed_at timestamptz,
  voided_at timestamptz,
  close_void_reason text check (close_void_reason is null or length(btrim(close_void_reason)) between 1 and 1000),
  unique (company_id, project_id, rfi_number)
);

create table if not exists public.engineering_rfi_responses (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  rfi_id uuid not null references public.engineering_rfis(id) on delete restrict,
  response_text text not null check (length(btrim(response_text)) between 1 and 8000),
  response_type text not null default 'RESPONSE' check (response_type in ('RESPONSE', 'CORRECTION', 'NOTE')),
  is_final_answer boolean not null default false,
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table if not exists public.engineering_rfi_document_links (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  rfi_id uuid not null references public.engineering_rfis(id) on delete restrict,
  response_id uuid references public.engineering_rfi_responses(id) on delete restrict,
  document_id uuid not null references public.engineering_documents(id) on delete restrict,
  revision_id uuid not null references public.engineering_document_revisions(id) on delete restrict,
  linked_by_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);
create unique index if not exists engineering_rfi_document_links_parent_unique
  on public.engineering_rfi_document_links(rfi_id, document_id, revision_id)
  where response_id is null;
create unique index if not exists engineering_rfi_document_links_response_unique
  on public.engineering_rfi_document_links(response_id, document_id, revision_id)
  where response_id is not null;

create table if not exists public.engineering_submittals (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  project_id uuid not null references public.projects(id) on delete restrict,
  submittal_number text not null check (length(btrim(submittal_number)) between 1 and 100),
  title text not null check (length(btrim(title)) between 1 and 255),
  discipline text not null check (discipline in (
    'ARCHITECTURAL', 'STRUCTURAL', 'CIVIL', 'MECHANICAL', 'ELECTRICAL',
    'PLUMBING', 'FIRE_PROTECTION', 'GEOTECHNICAL', 'GENERAL_ENGINEERING', 'OTHER'
  )),
  category text not null check (length(btrim(category)) between 1 and 160),
  specification_reference text check (specification_reference is null or length(btrim(specification_reference)) <= 255),
  due_review_date date,
  current_round integer not null default 1 check (current_round >= 1),
  status text not null default 'DRAFT' check (status in (
    'DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'APPROVED_AS_NOTED',
    'REVISE_AND_RESUBMIT', 'REJECTED', 'CLOSED', 'VOID'
  )),
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  submitted_at timestamptz,
  closed_at timestamptz,
  voided_at timestamptz,
  close_void_reason text check (close_void_reason is null or length(btrim(close_void_reason)) between 1 and 1000),
  unique (company_id, project_id, submittal_number)
);

create table if not exists public.engineering_submittal_rounds (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  submittal_id uuid not null references public.engineering_submittals(id) on delete restrict,
  round_number integer not null check (round_number >= 1),
  status text not null default 'DRAFT' check (status in (
    'DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'APPROVED_AS_NOTED',
    'REVISE_AND_RESUBMIT', 'REJECTED', 'VOID'
  )),
  due_review_date date,
  submitted_at timestamptz,
  completed_at timestamptz,
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (submittal_id, round_number)
);

create table if not exists public.engineering_submittal_reviews (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  submittal_id uuid not null references public.engineering_submittals(id) on delete restrict,
  round_id uuid not null references public.engineering_submittal_rounds(id) on delete restrict,
  round_number integer not null check (round_number >= 1),
  decision text not null check (decision in ('APPROVED', 'APPROVED_AS_NOTED', 'REVISE_AND_RESUBMIT', 'REJECTED')),
  review_comments text not null check (length(btrim(review_comments)) between 1 and 8000),
  reviewed_by_user_id uuid not null references auth.users(id) on delete restrict,
  reviewed_at timestamptz not null default now()
);

create table if not exists public.engineering_submittal_document_links (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  submittal_id uuid not null references public.engineering_submittals(id) on delete restrict,
  round_id uuid not null references public.engineering_submittal_rounds(id) on delete restrict,
  document_id uuid not null references public.engineering_documents(id) on delete restrict,
  revision_id uuid not null references public.engineering_document_revisions(id) on delete restrict,
  linked_by_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (round_id, document_id, revision_id)
);

create index if not exists engineering_rfis_company_project_status_idx on public.engineering_rfis(company_id, project_id, status);
create index if not exists engineering_rfis_company_project_due_idx on public.engineering_rfis(company_id, project_id, due_date) where status = 'OPEN';
create index if not exists engineering_rfi_responses_rfi_created_idx on public.engineering_rfi_responses(rfi_id, created_at);
create index if not exists engineering_rfi_links_rfi_idx on public.engineering_rfi_document_links(rfi_id, created_at);
create index if not exists engineering_submittals_company_project_status_idx on public.engineering_submittals(company_id, project_id, status);
create index if not exists engineering_submittals_company_project_due_idx on public.engineering_submittals(company_id, project_id, due_review_date);
create index if not exists engineering_submittal_rounds_submittal_idx on public.engineering_submittal_rounds(submittal_id, round_number);
create index if not exists engineering_submittal_reviews_round_idx on public.engineering_submittal_reviews(round_id, reviewed_at);
create index if not exists engineering_submittal_links_round_idx on public.engineering_submittal_document_links(round_id, created_at);

-- Extend the audit allowlist as a strict superset of every event present through Phase 1A.
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
  'ENGINEERING_SUBMITTAL_RESUBMITTED', 'ENGINEERING_SUBMITTAL_CLOSED', 'ENGINEERING_SUBMITTAL_VOIDED'
));

create or replace function private.engineering_coordination_actor(p_company_id uuid, p_permission_key text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
begin
  if v_actor is null or not (select private.has_company_permission(p_company_id, p_permission_key)) then
    raise exception 'Engineering coordination permission denied' using errcode = '42501';
  end if;
  return v_actor;
end;
$$;

create or replace function private.assert_engineering_coordination_project(p_company_id uuid, p_project_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.projects p where p.id = p_project_id and p.company_id = p_company_id and p.archived_at is null) then
    raise exception 'Project is outside the selected company or unavailable' using errcode = '42501';
  end if;
end;
$$;

create or replace function private.assert_engineering_coordination_revisions(p_company_id uuid, p_project_id uuid, p_revision_ids uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_requested integer;
  v_found integer;
begin
  select count(distinct value)::integer into v_requested from unnest(coalesce(p_revision_ids, '{}'::uuid[])) value;
  if v_requested = 0 then return; end if;
  select count(distinct r.id)::integer into v_found
  from public.engineering_document_revisions r
  join public.engineering_documents d on d.id = r.document_id and d.company_id = r.company_id
  where r.id = any(p_revision_ids)
    and r.company_id = p_company_id
    and d.company_id = p_company_id
    and d.project_id = p_project_id;
  if v_found <> v_requested then
    raise exception 'One or more engineering revision references are outside the company/project or invalid' using errcode = '42501';
  end if;
end;
$$;

create or replace function private.prevent_coordination_history_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception 'Formal engineering coordination history is append-only' using errcode = '55000';
end;
$$;

create or replace function private.guard_engineering_rfi_identity()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if old.opened_at is not null and (
    new.company_id is distinct from old.company_id or new.project_id is distinct from old.project_id or
    new.rfi_number is distinct from old.rfi_number or new.question is distinct from old.question or
    new.subject is distinct from old.subject or new.discipline is distinct from old.discipline or
    new.created_by_user_id is distinct from old.created_by_user_id or new.created_at is distinct from old.created_at
  ) then
    raise exception 'Formal RFI identity and question are immutable after opening' using errcode = '55000';
  end if;
  return new;
end;
$$;

create or replace function private.guard_engineering_submittal_identity()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if old.submitted_at is not null and (
    new.company_id is distinct from old.company_id or new.project_id is distinct from old.project_id or
    new.submittal_number is distinct from old.submittal_number or new.title is distinct from old.title or
    new.discipline is distinct from old.discipline or new.category is distinct from old.category or
    new.specification_reference is distinct from old.specification_reference or
    new.created_by_user_id is distinct from old.created_by_user_id or new.created_at is distinct from old.created_at
  ) then
    raise exception 'Formal submittal identity is immutable after submission' using errcode = '55000';
  end if;
  return new;
end;
$$;

create or replace function private.guard_engineering_submittal_round()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if old.submitted_at is not null and (
    new.company_id is distinct from old.company_id or new.submittal_id is distinct from old.submittal_id or
    new.round_number is distinct from old.round_number or new.due_review_date is distinct from old.due_review_date or
    new.created_by_user_id is distinct from old.created_by_user_id or new.created_at is distinct from old.created_at
  ) then
    raise exception 'Submitted submittal round identity is immutable' using errcode = '55000';
  end if;
  return new;
end;
$$;

create or replace function private.validate_engineering_coordination_reference()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_project_id uuid;
  v_document_project_id uuid;
  v_parent_company_id uuid;
  v_parent_id uuid;
  v_round_number integer;
begin
  if tg_table_name = 'engineering_rfis' then
    perform private.assert_engineering_coordination_project(new.company_id, new.project_id);
    if new.assigned_user_id is not null and not exists (
      select 1 from public.company_members cm where cm.company_id = new.company_id and cm.user_id = new.assigned_user_id and cm.status = 'ACTIVE'
    ) then raise exception 'Assigned RFI user is not an active company member' using errcode = '42501'; end if;
  elsif tg_table_name = 'engineering_rfi_responses' then
    select r.company_id into v_parent_company_id from public.engineering_rfis r where r.id = new.rfi_id;
    if v_parent_company_id is null or v_parent_company_id <> new.company_id then raise exception 'RFI response is outside the company' using errcode = '42501'; end if;
  elsif tg_table_name = 'engineering_rfi_document_links' then
    select r.company_id, r.project_id into v_parent_company_id, v_project_id from public.engineering_rfis r where r.id = new.rfi_id;
    if v_parent_company_id is null or v_parent_company_id <> new.company_id then raise exception 'RFI link is outside the company' using errcode = '42501'; end if;
    if new.response_id is not null and not exists (select 1 from public.engineering_rfi_responses x where x.id = new.response_id and x.rfi_id = new.rfi_id and x.company_id = new.company_id) then raise exception 'RFI response link does not match the parent RFI' using errcode = '22023'; end if;
    select d.project_id into v_document_project_id from public.engineering_document_revisions rev join public.engineering_documents d on d.id = rev.document_id and d.company_id = rev.company_id where rev.id = new.revision_id and rev.document_id = new.document_id and rev.company_id = new.company_id;
    if v_document_project_id is null or v_document_project_id <> v_project_id then raise exception 'RFI revision reference is outside the company/project' using errcode = '42501'; end if;
  elsif tg_table_name = 'engineering_submittals' then
    perform private.assert_engineering_coordination_project(new.company_id, new.project_id);
  elsif tg_table_name = 'engineering_submittal_rounds' then
    select s.company_id into v_parent_company_id from public.engineering_submittals s where s.id = new.submittal_id;
    if v_parent_company_id is null or v_parent_company_id <> new.company_id then raise exception 'Submittal round is outside the company' using errcode = '42501'; end if;
  elsif tg_table_name = 'engineering_submittal_reviews' then
    select s.company_id into v_parent_company_id from public.engineering_submittals s where s.id = new.submittal_id;
    select sr.submittal_id, sr.round_number into v_parent_id, v_round_number from public.engineering_submittal_rounds sr where sr.id = new.round_id and sr.company_id = new.company_id;
    if v_parent_company_id is null or v_parent_company_id <> new.company_id or v_parent_id <> new.submittal_id or v_round_number <> new.round_number then raise exception 'Submittal review does not match the company/round' using errcode = '42501'; end if;
  elsif tg_table_name = 'engineering_submittal_document_links' then
    select s.company_id, s.project_id into v_parent_company_id, v_project_id from public.engineering_submittals s where s.id = new.submittal_id;
    if v_parent_company_id is null or v_parent_company_id <> new.company_id then raise exception 'Submittal link is outside the company' using errcode = '42501'; end if;
    if not exists (select 1 from public.engineering_submittal_rounds sr where sr.id = new.round_id and sr.submittal_id = new.submittal_id and sr.company_id = new.company_id) then raise exception 'Submittal link round does not match the parent' using errcode = '22023'; end if;
    select d.project_id into v_document_project_id from public.engineering_document_revisions rev join public.engineering_documents d on d.id = rev.document_id and d.company_id = rev.company_id where rev.id = new.revision_id and rev.document_id = new.document_id and rev.company_id = new.company_id;
    if v_document_project_id is null or v_document_project_id <> v_project_id then raise exception 'Submittal revision reference is outside the company/project' using errcode = '42501'; end if;
  end if;
  return new;
end;
$$;

-- Reference validation is defense-in-depth beneath the guarded RPCs.
drop trigger if exists engineering_rfis_reference on public.engineering_rfis;
create trigger engineering_rfis_reference before insert or update on public.engineering_rfis for each row execute function private.validate_engineering_coordination_reference();
drop trigger if exists engineering_rfi_responses_reference on public.engineering_rfi_responses;
create trigger engineering_rfi_responses_reference before insert on public.engineering_rfi_responses for each row execute function private.validate_engineering_coordination_reference();
drop trigger if exists engineering_rfi_links_reference on public.engineering_rfi_document_links;
create trigger engineering_rfi_links_reference before insert on public.engineering_rfi_document_links for each row execute function private.validate_engineering_coordination_reference();
drop trigger if exists engineering_submittals_reference on public.engineering_submittals;
create trigger engineering_submittals_reference before insert or update on public.engineering_submittals for each row execute function private.validate_engineering_coordination_reference();
drop trigger if exists engineering_submittal_rounds_reference on public.engineering_submittal_rounds;
create trigger engineering_submittal_rounds_reference before insert on public.engineering_submittal_rounds for each row execute function private.validate_engineering_coordination_reference();
drop trigger if exists engineering_submittal_reviews_reference on public.engineering_submittal_reviews;
create trigger engineering_submittal_reviews_reference before insert on public.engineering_submittal_reviews for each row execute function private.validate_engineering_coordination_reference();
drop trigger if exists engineering_submittal_links_reference on public.engineering_submittal_document_links;
create trigger engineering_submittal_links_reference before insert on public.engineering_submittal_document_links for each row execute function private.validate_engineering_coordination_reference();

drop trigger if exists engineering_rfis_identity_guard on public.engineering_rfis;
create trigger engineering_rfis_identity_guard before update on public.engineering_rfis for each row execute function private.guard_engineering_rfi_identity();
drop trigger if exists engineering_submittals_identity_guard on public.engineering_submittals;
create trigger engineering_submittals_identity_guard before update on public.engineering_submittals for each row execute function private.guard_engineering_submittal_identity();
drop trigger if exists engineering_submittal_rounds_identity_guard on public.engineering_submittal_rounds;
create trigger engineering_submittal_rounds_identity_guard before update on public.engineering_submittal_rounds for each row execute function private.guard_engineering_submittal_round();

drop trigger if exists engineering_rfi_responses_append_only on public.engineering_rfi_responses;
create trigger engineering_rfi_responses_append_only before update or delete on public.engineering_rfi_responses for each row execute function private.prevent_coordination_history_mutation();
drop trigger if exists engineering_rfi_links_append_only on public.engineering_rfi_document_links;
create trigger engineering_rfi_links_append_only before update or delete on public.engineering_rfi_document_links for each row execute function private.prevent_coordination_history_mutation();
drop trigger if exists engineering_submittal_reviews_append_only on public.engineering_submittal_reviews;
create trigger engineering_submittal_reviews_append_only before update or delete on public.engineering_submittal_reviews for each row execute function private.prevent_coordination_history_mutation();
drop trigger if exists engineering_submittal_links_append_only on public.engineering_submittal_document_links;
create trigger engineering_submittal_links_append_only before update or delete on public.engineering_submittal_document_links for each row execute function private.prevent_coordination_history_mutation();
drop trigger if exists engineering_submittal_rounds_no_delete on public.engineering_submittal_rounds;
create trigger engineering_submittal_rounds_no_delete before delete on public.engineering_submittal_rounds for each row execute function private.prevent_coordination_history_mutation();

alter table public.engineering_rfis enable row level security;
alter table public.engineering_rfi_responses enable row level security;
alter table public.engineering_rfi_document_links enable row level security;
alter table public.engineering_submittals enable row level security;
alter table public.engineering_submittal_rounds enable row level security;
alter table public.engineering_submittal_reviews enable row level security;
alter table public.engineering_submittal_document_links enable row level security;

revoke all on public.engineering_rfis, public.engineering_rfi_responses, public.engineering_rfi_document_links,
  public.engineering_submittals, public.engineering_submittal_rounds, public.engineering_submittal_reviews, public.engineering_submittal_document_links
from public, anon, authenticated;
grant select on public.engineering_rfis, public.engineering_rfi_responses, public.engineering_rfi_document_links to authenticated;
grant select on public.engineering_submittals, public.engineering_submittal_rounds, public.engineering_submittal_reviews, public.engineering_submittal_document_links to authenticated;

create policy engineering_rfis_read on public.engineering_rfis for select to authenticated using ((select private.has_company_permission(company_id, 'engineering.rfis.read')));
create policy engineering_rfi_responses_read on public.engineering_rfi_responses for select to authenticated using ((select private.has_company_permission(company_id, 'engineering.rfis.read')));
create policy engineering_rfi_links_read on public.engineering_rfi_document_links for select to authenticated using ((select private.has_company_permission(company_id, 'engineering.rfis.read')));
create policy engineering_submittals_read on public.engineering_submittals for select to authenticated using ((select private.has_company_permission(company_id, 'engineering.submittals.read')));
create policy engineering_submittal_rounds_read on public.engineering_submittal_rounds for select to authenticated using ((select private.has_company_permission(company_id, 'engineering.submittals.read')));
create policy engineering_submittal_reviews_read on public.engineering_submittal_reviews for select to authenticated using ((select private.has_company_permission(company_id, 'engineering.submittals.read')));
create policy engineering_submittal_links_read on public.engineering_submittal_document_links for select to authenticated using ((select private.has_company_permission(company_id, 'engineering.submittals.read')));

create or replace function public.create_engineering_rfi(
  p_company_id uuid, p_rfi_id uuid, p_project_id uuid, p_rfi_number text, p_subject text, p_question text,
  p_discipline text, p_priority text default 'NORMAL', p_date_raised date default current_date, p_due_date date default null,
  p_assigned_user_id uuid default null, p_revision_ids uuid[] default '{}'::uuid[]
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_actor uuid; v_row public.engineering_rfis;
begin
  v_actor := private.engineering_coordination_actor(p_company_id, 'engineering.rfis.create');
  perform private.assert_engineering_coordination_project(p_company_id, p_project_id);
  perform private.assert_engineering_coordination_revisions(p_company_id, p_project_id, p_revision_ids);
  insert into public.engineering_rfis(id, company_id, project_id, rfi_number, subject, question, discipline, priority, date_raised, due_date, assigned_user_id, created_by_user_id)
  values (p_rfi_id, p_company_id, p_project_id, upper(btrim(p_rfi_number)), btrim(p_subject), btrim(p_question), p_discipline, p_priority, p_date_raised, p_due_date, p_assigned_user_id, v_actor)
  returning * into v_row;
  insert into public.engineering_rfi_document_links(company_id, rfi_id, document_id, revision_id, linked_by_user_id)
  select p_company_id, p_rfi_id, d.id, r.id, v_actor
  from (select distinct unnest(coalesce(p_revision_ids, '{}'::uuid[])) as id) requested
  join public.engineering_document_revisions r on r.id = requested.id and r.company_id = p_company_id
  join public.engineering_documents d on d.id = r.document_id and d.company_id = p_company_id and d.project_id = p_project_id;
  perform private.write_company_audit(p_company_id, 'ENGINEERING_RFI_CREATED', 'engineering_rfi', p_rfi_id, jsonb_build_object('project_id', p_project_id, 'rfi_number', v_row.rfi_number, 'status', v_row.status));
  return to_jsonb(v_row);
end;
$$;

create or replace function public.open_engineering_rfi(p_company_id uuid, p_rfi_id uuid) returns jsonb
language plpgsql security definer set search_path = ''
as $$ declare v_actor uuid; v_row public.engineering_rfis; begin
  v_actor := private.engineering_coordination_actor(p_company_id, 'engineering.rfis.create');
  select * into v_row from public.engineering_rfis where id = p_rfi_id and company_id = p_company_id for update;
  if not found then raise exception 'RFI not found in company' using errcode='P0002'; end if;
  if v_row.status <> 'DRAFT' then raise exception 'Only a draft RFI can be opened' using errcode='55000'; end if;
  update public.engineering_rfis set status='OPEN', opened_at=now(), updated_at=now() where id=p_rfi_id returning * into v_row;
  perform private.write_company_audit(p_company_id, 'ENGINEERING_RFI_OPENED', 'engineering_rfi', p_rfi_id, jsonb_build_object('project_id', v_row.project_id, 'rfi_number', v_row.rfi_number));
  return to_jsonb(v_row);
end; $$;

create or replace function public.respond_engineering_rfi(
  p_company_id uuid, p_rfi_id uuid, p_response_id uuid, p_response_text text, p_response_type text default 'RESPONSE',
  p_is_final_answer boolean default false, p_revision_ids uuid[] default '{}'::uuid[]
) returns jsonb
language plpgsql security definer set search_path = ''
as $$ declare v_actor uuid; v_rfi public.engineering_rfis; v_response public.engineering_rfi_responses; begin
  v_actor := private.engineering_coordination_actor(p_company_id, 'engineering.rfis.respond');
  select * into v_rfi from public.engineering_rfis where id=p_rfi_id and company_id=p_company_id for update;
  if not found then raise exception 'RFI not found in company' using errcode='P0002'; end if;
  if v_rfi.status not in ('OPEN','ANSWERED') then raise exception 'RFI is not open for a response' using errcode='55000'; end if;
  if p_is_final_answer and v_rfi.status <> 'OPEN' then raise exception 'Only an open RFI may receive its final answer' using errcode='55000'; end if;
  perform private.assert_engineering_coordination_revisions(p_company_id, v_rfi.project_id, p_revision_ids);
  insert into public.engineering_rfi_responses(id, company_id, rfi_id, response_text, response_type, is_final_answer, created_by_user_id)
  values (p_response_id, p_company_id, p_rfi_id, btrim(p_response_text), p_response_type, p_is_final_answer, v_actor) returning * into v_response;
  insert into public.engineering_rfi_document_links(company_id, rfi_id, response_id, document_id, revision_id, linked_by_user_id)
  select p_company_id, p_rfi_id, p_response_id, d.id, r.id, v_actor
  from (select distinct unnest(coalesce(p_revision_ids, '{}'::uuid[])) as id) requested
  join public.engineering_document_revisions r on r.id=requested.id and r.company_id=p_company_id
  join public.engineering_documents d on d.id=r.document_id and d.company_id=p_company_id and d.project_id=v_rfi.project_id;
  if p_is_final_answer then update public.engineering_rfis set status='ANSWERED', answered_at=now(), updated_at=now() where id=p_rfi_id; else update public.engineering_rfis set updated_at=now() where id=p_rfi_id; end if;
  perform private.write_company_audit(p_company_id, 'ENGINEERING_RFI_RESPONDED', 'engineering_rfi', p_rfi_id, jsonb_build_object('response_id', p_response_id, 'response_type', p_response_type, 'final_answer', p_is_final_answer));
  return to_jsonb(v_response);
end; $$;

create or replace function public.close_engineering_rfi(p_company_id uuid, p_rfi_id uuid, p_reason text default null) returns jsonb
language plpgsql security definer set search_path = ''
as $$ declare v_actor uuid; v_row public.engineering_rfis; begin
  v_actor := private.engineering_coordination_actor(p_company_id, 'engineering.rfis.manage');
  select * into v_row from public.engineering_rfis where id=p_rfi_id and company_id=p_company_id for update;
  if not found then raise exception 'RFI not found in company' using errcode='P0002'; end if;
  if v_row.status <> 'ANSWERED' then raise exception 'Only an answered RFI can be closed' using errcode='55000'; end if;
  update public.engineering_rfis set status='CLOSED', closed_at=now(), close_void_reason=nullif(btrim(p_reason),''), updated_at=now() where id=p_rfi_id returning * into v_row;
  perform private.write_company_audit(p_company_id, 'ENGINEERING_RFI_CLOSED', 'engineering_rfi', p_rfi_id, jsonb_build_object('reason', v_row.close_void_reason));
  return to_jsonb(v_row);
end; $$;

create or replace function public.void_engineering_rfi(p_company_id uuid, p_rfi_id uuid, p_reason text) returns jsonb
language plpgsql security definer set search_path = ''
as $$ declare v_actor uuid; v_row public.engineering_rfis; begin
  v_actor := private.engineering_coordination_actor(p_company_id, 'engineering.rfis.manage');
  if p_reason is null or btrim(p_reason)='' then raise exception 'Void reason is required' using errcode='22023'; end if;
  select * into v_row from public.engineering_rfis where id=p_rfi_id and company_id=p_company_id for update;
  if not found then raise exception 'RFI not found in company' using errcode='P0002'; end if;
  if v_row.status in ('CLOSED','VOID') then raise exception 'Closed or void RFI cannot be voided' using errcode='55000'; end if;
  update public.engineering_rfis set status='VOID', voided_at=now(), close_void_reason=btrim(p_reason), updated_at=now() where id=p_rfi_id returning * into v_row;
  perform private.write_company_audit(p_company_id, 'ENGINEERING_RFI_VOIDED', 'engineering_rfi', p_rfi_id, jsonb_build_object('reason', v_row.close_void_reason));
  return to_jsonb(v_row);
end; $$;

create or replace function public.create_engineering_submittal(
  p_company_id uuid, p_submittal_id uuid, p_round_id uuid, p_project_id uuid, p_submittal_number text, p_title text,
  p_discipline text, p_category text, p_specification_reference text default null, p_due_review_date date default null,
  p_revision_ids uuid[] default '{}'::uuid[]
) returns jsonb
language plpgsql security definer set search_path = ''
as $$ declare v_actor uuid; v_row public.engineering_submittals; begin
  v_actor := private.engineering_coordination_actor(p_company_id, 'engineering.submittals.create');
  perform private.assert_engineering_coordination_project(p_company_id, p_project_id);
  perform private.assert_engineering_coordination_revisions(p_company_id, p_project_id, p_revision_ids);
  insert into public.engineering_submittals(id, company_id, project_id, submittal_number, title, discipline, category, specification_reference, due_review_date, created_by_user_id)
  values (p_submittal_id, p_company_id, p_project_id, upper(btrim(p_submittal_number)), btrim(p_title), p_discipline, btrim(p_category), nullif(btrim(p_specification_reference),''), p_due_review_date, v_actor) returning * into v_row;
  insert into public.engineering_submittal_rounds(id, company_id, submittal_id, round_number, status, due_review_date, created_by_user_id)
  values (p_round_id, p_company_id, p_submittal_id, 1, 'DRAFT', p_due_review_date, v_actor);
  insert into public.engineering_submittal_document_links(company_id, submittal_id, round_id, document_id, revision_id, linked_by_user_id)
  select p_company_id, p_submittal_id, p_round_id, d.id, r.id, v_actor
  from (select distinct unnest(coalesce(p_revision_ids, '{}'::uuid[])) as id) requested
  join public.engineering_document_revisions r on r.id=requested.id and r.company_id=p_company_id
  join public.engineering_documents d on d.id=r.document_id and d.company_id=p_company_id and d.project_id=p_project_id;
  perform private.write_company_audit(p_company_id, 'ENGINEERING_SUBMITTAL_CREATED', 'engineering_submittal', p_submittal_id, jsonb_build_object('project_id', p_project_id, 'submittal_number', v_row.submittal_number, 'round', 1));
  return to_jsonb(v_row);
end; $$;

create or replace function public.submit_engineering_submittal(p_company_id uuid, p_submittal_id uuid) returns jsonb
language plpgsql security definer set search_path = ''
as $$ declare v_actor uuid; v_row public.engineering_submittals; v_round public.engineering_submittal_rounds; begin
  v_actor := private.engineering_coordination_actor(p_company_id, 'engineering.submittals.create');
  select * into v_row from public.engineering_submittals where id=p_submittal_id and company_id=p_company_id for update;
  if not found then raise exception 'Submittal not found in company' using errcode='P0002'; end if;
  if v_row.status <> 'DRAFT' then raise exception 'Only a draft submittal can be submitted' using errcode='55000'; end if;
  select * into v_round from public.engineering_submittal_rounds where submittal_id=p_submittal_id and round_number=v_row.current_round and company_id=p_company_id for update;
  if not found or v_round.status <> 'DRAFT' then raise exception 'Current draft submittal round is unavailable' using errcode='55000'; end if;
  update public.engineering_submittal_rounds set status='SUBMITTED', submitted_at=now(), updated_at=now() where id=v_round.id;
  update public.engineering_submittals set status='SUBMITTED', submitted_at=now(), updated_at=now() where id=p_submittal_id returning * into v_row;
  perform private.write_company_audit(p_company_id, 'ENGINEERING_SUBMITTAL_SUBMITTED', 'engineering_submittal', p_submittal_id, jsonb_build_object('round', v_row.current_round));
  return to_jsonb(v_row);
end; $$;

create or replace function public.start_engineering_submittal_review(p_company_id uuid, p_submittal_id uuid) returns jsonb
language plpgsql security definer set search_path = ''
as $$ declare v_actor uuid; v_row public.engineering_submittals; v_round_id uuid; begin
  v_actor := private.engineering_coordination_actor(p_company_id, 'engineering.submittals.review');
  select * into v_row from public.engineering_submittals where id=p_submittal_id and company_id=p_company_id for update;
  if not found then raise exception 'Submittal not found in company' using errcode='P0002'; end if;
  if v_row.status <> 'SUBMITTED' then raise exception 'Only a submitted submittal can enter review' using errcode='55000'; end if;
  select id into v_round_id from public.engineering_submittal_rounds where submittal_id=p_submittal_id and round_number=v_row.current_round and status='SUBMITTED' and company_id=p_company_id for update;
  if v_round_id is null then raise exception 'Current submitted round is unavailable' using errcode='55000'; end if;
  update public.engineering_submittal_rounds set status='UNDER_REVIEW', updated_at=now() where id=v_round_id;
  update public.engineering_submittals set status='UNDER_REVIEW', updated_at=now() where id=p_submittal_id returning * into v_row;
  perform private.write_company_audit(p_company_id, 'ENGINEERING_SUBMITTAL_REVIEW_STARTED', 'engineering_submittal', p_submittal_id, jsonb_build_object('round', v_row.current_round));
  return to_jsonb(v_row);
end; $$;

create or replace function public.review_engineering_submittal(p_company_id uuid, p_submittal_id uuid, p_review_id uuid, p_decision text, p_review_comments text) returns jsonb
language plpgsql security definer set search_path = ''
as $$ declare v_actor uuid; v_row public.engineering_submittals; v_round public.engineering_submittal_rounds; v_review public.engineering_submittal_reviews; begin
  v_actor := private.engineering_coordination_actor(p_company_id, 'engineering.submittals.review');
  if p_decision not in ('APPROVED','APPROVED_AS_NOTED','REVISE_AND_RESUBMIT','REJECTED') then raise exception 'Unsupported submittal decision' using errcode='22023'; end if;
  if p_review_comments is null or btrim(p_review_comments)='' then raise exception 'Review comments are required' using errcode='22023'; end if;
  select * into v_row from public.engineering_submittals where id=p_submittal_id and company_id=p_company_id for update;
  if not found then raise exception 'Submittal not found in company' using errcode='P0002'; end if;
  if v_row.status not in ('SUBMITTED','UNDER_REVIEW') then raise exception 'Submittal is not available for review' using errcode='55000'; end if;
  select * into v_round from public.engineering_submittal_rounds where submittal_id=p_submittal_id and round_number=v_row.current_round and company_id=p_company_id for update;
  if not found or v_round.status not in ('SUBMITTED','UNDER_REVIEW') then raise exception 'Current submittal round is not available for review' using errcode='55000'; end if;
  insert into public.engineering_submittal_reviews(id, company_id, submittal_id, round_id, round_number, decision, review_comments, reviewed_by_user_id)
  values (p_review_id, p_company_id, p_submittal_id, v_round.id, v_round.round_number, p_decision, btrim(p_review_comments), v_actor) returning * into v_review;
  update public.engineering_submittal_rounds set status=p_decision, completed_at=now(), updated_at=now() where id=v_round.id;
  update public.engineering_submittals set status=p_decision, updated_at=now() where id=p_submittal_id;
  perform private.write_company_audit(p_company_id, 'ENGINEERING_SUBMITTAL_REVIEWED', 'engineering_submittal', p_submittal_id, jsonb_build_object('round', v_round.round_number, 'decision', p_decision, 'review_id', p_review_id));
  return to_jsonb(v_review);
end; $$;

create or replace function public.resubmit_engineering_submittal(p_company_id uuid, p_submittal_id uuid, p_round_id uuid, p_due_review_date date default null, p_revision_ids uuid[] default '{}'::uuid[]) returns jsonb
language plpgsql security definer set search_path = ''
as $$ declare v_actor uuid; v_row public.engineering_submittals; v_previous public.engineering_submittal_rounds; v_next integer; begin
  v_actor := private.engineering_coordination_actor(p_company_id, 'engineering.submittals.create');
  select * into v_row from public.engineering_submittals where id=p_submittal_id and company_id=p_company_id for update;
  if not found then raise exception 'Submittal not found in company' using errcode='P0002'; end if;
  if v_row.status <> 'REVISE_AND_RESUBMIT' then raise exception 'Submittal does not require resubmission' using errcode='55000'; end if;
  select * into v_previous from public.engineering_submittal_rounds where submittal_id=p_submittal_id and round_number=v_row.current_round and company_id=p_company_id for update;
  if not found or v_previous.status <> 'REVISE_AND_RESUBMIT' then raise exception 'Previous formal round does not require resubmission' using errcode='55000'; end if;
  perform private.assert_engineering_coordination_revisions(p_company_id, v_row.project_id, p_revision_ids);
  v_next := v_row.current_round + 1;
  insert into public.engineering_submittal_rounds(id, company_id, submittal_id, round_number, status, due_review_date, submitted_at, created_by_user_id)
  values (p_round_id, p_company_id, p_submittal_id, v_next, 'SUBMITTED', coalesce(p_due_review_date, v_row.due_review_date), now(), v_actor);
  insert into public.engineering_submittal_document_links(company_id, submittal_id, round_id, document_id, revision_id, linked_by_user_id)
  select p_company_id, p_submittal_id, p_round_id, d.id, r.id, v_actor
  from (select distinct unnest(coalesce(p_revision_ids, '{}'::uuid[])) as id) requested
  join public.engineering_document_revisions r on r.id=requested.id and r.company_id=p_company_id
  join public.engineering_documents d on d.id=r.document_id and d.company_id=p_company_id and d.project_id=v_row.project_id;
  update public.engineering_submittals set current_round=v_next, status='SUBMITTED', submitted_at=now(), due_review_date=coalesce(p_due_review_date, due_review_date), updated_at=now() where id=p_submittal_id returning * into v_row;
  perform private.write_company_audit(p_company_id, 'ENGINEERING_SUBMITTAL_RESUBMITTED', 'engineering_submittal', p_submittal_id, jsonb_build_object('round', v_next, 'previous_round', v_previous.round_number));
  return to_jsonb(v_row);
end; $$;

create or replace function public.close_engineering_submittal(p_company_id uuid, p_submittal_id uuid, p_reason text default null) returns jsonb
language plpgsql security definer set search_path = ''
as $$ declare v_actor uuid; v_row public.engineering_submittals; begin
  v_actor := private.engineering_coordination_actor(p_company_id, 'engineering.submittals.manage');
  select * into v_row from public.engineering_submittals where id=p_submittal_id and company_id=p_company_id for update;
  if not found then raise exception 'Submittal not found in company' using errcode='P0002'; end if;
  if v_row.status not in ('APPROVED','APPROVED_AS_NOTED','REJECTED') then raise exception 'Only a completed decision can be closed' using errcode='55000'; end if;
  update public.engineering_submittals set status='CLOSED', closed_at=now(), close_void_reason=nullif(btrim(p_reason),''), updated_at=now() where id=p_submittal_id returning * into v_row;
  perform private.write_company_audit(p_company_id, 'ENGINEERING_SUBMITTAL_CLOSED', 'engineering_submittal', p_submittal_id, jsonb_build_object('round', v_row.current_round, 'reason', v_row.close_void_reason));
  return to_jsonb(v_row);
end; $$;

create or replace function public.void_engineering_submittal(p_company_id uuid, p_submittal_id uuid, p_reason text) returns jsonb
language plpgsql security definer set search_path = ''
as $$ declare v_actor uuid; v_row public.engineering_submittals; begin
  v_actor := private.engineering_coordination_actor(p_company_id, 'engineering.submittals.manage');
  if p_reason is null or btrim(p_reason)='' then raise exception 'Void reason is required' using errcode='22023'; end if;
  select * into v_row from public.engineering_submittals where id=p_submittal_id and company_id=p_company_id for update;
  if not found then raise exception 'Submittal not found in company' using errcode='P0002'; end if;
  if v_row.status in ('CLOSED','VOID') then raise exception 'Closed or void submittal cannot be voided' using errcode='55000'; end if;
  update public.engineering_submittals set status='VOID', voided_at=now(), close_void_reason=btrim(p_reason), updated_at=now() where id=p_submittal_id returning * into v_row;
  update public.engineering_submittal_rounds set status='VOID', completed_at=coalesce(completed_at, now()), updated_at=now() where submittal_id=p_submittal_id and round_number=v_row.current_round and status in ('DRAFT','SUBMITTED','UNDER_REVIEW');
  perform private.write_company_audit(p_company_id, 'ENGINEERING_SUBMITTAL_VOIDED', 'engineering_submittal', p_submittal_id, jsonb_build_object('round', v_row.current_round, 'reason', v_row.close_void_reason));
  return to_jsonb(v_row);
end; $$;

-- Authenticated-only execution. Anonymous/public callers have no lifecycle surface.
revoke execute on function private.engineering_coordination_actor(uuid,text) from public, anon;
revoke execute on function private.assert_engineering_coordination_project(uuid,uuid) from public, anon;
revoke execute on function private.assert_engineering_coordination_revisions(uuid,uuid,uuid[]) from public, anon;
revoke execute on function public.create_engineering_rfi(uuid,uuid,uuid,text,text,text,text,text,date,date,uuid,uuid[]) from public, anon;
revoke execute on function public.open_engineering_rfi(uuid,uuid) from public, anon;
revoke execute on function public.respond_engineering_rfi(uuid,uuid,uuid,text,text,boolean,uuid[]) from public, anon;
revoke execute on function public.close_engineering_rfi(uuid,uuid,text) from public, anon;
revoke execute on function public.void_engineering_rfi(uuid,uuid,text) from public, anon;
revoke execute on function public.create_engineering_submittal(uuid,uuid,uuid,uuid,text,text,text,text,text,date,uuid[]) from public, anon;
revoke execute on function public.submit_engineering_submittal(uuid,uuid) from public, anon;
revoke execute on function public.start_engineering_submittal_review(uuid,uuid) from public, anon;
revoke execute on function public.review_engineering_submittal(uuid,uuid,uuid,text,text) from public, anon;
revoke execute on function public.resubmit_engineering_submittal(uuid,uuid,uuid,date,uuid[]) from public, anon;
revoke execute on function public.close_engineering_submittal(uuid,uuid,text) from public, anon;
revoke execute on function public.void_engineering_submittal(uuid,uuid,text) from public, anon;

grant execute on function public.create_engineering_rfi(uuid,uuid,uuid,text,text,text,text,text,date,date,uuid,uuid[]) to authenticated;
grant execute on function public.open_engineering_rfi(uuid,uuid) to authenticated;
grant execute on function public.respond_engineering_rfi(uuid,uuid,uuid,text,text,boolean,uuid[]) to authenticated;
grant execute on function public.close_engineering_rfi(uuid,uuid,text) to authenticated;
grant execute on function public.void_engineering_rfi(uuid,uuid,text) to authenticated;
grant execute on function public.create_engineering_submittal(uuid,uuid,uuid,uuid,text,text,text,text,text,date,uuid[]) to authenticated;
grant execute on function public.submit_engineering_submittal(uuid,uuid) to authenticated;
grant execute on function public.start_engineering_submittal_review(uuid,uuid) to authenticated;
grant execute on function public.review_engineering_submittal(uuid,uuid,uuid,text,text) to authenticated;
grant execute on function public.resubmit_engineering_submittal(uuid,uuid,uuid,date,uuid[]) to authenticated;
grant execute on function public.close_engineering_submittal(uuid,uuid,text) to authenticated;
grant execute on function public.void_engineering_submittal(uuid,uuid,text) to authenticated;
