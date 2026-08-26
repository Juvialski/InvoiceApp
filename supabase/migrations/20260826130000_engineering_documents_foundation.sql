-- Engineering Documents foundation: company-scoped documents, revisions, and drawing annotations.
-- This migration is additive, data-preserving, and keeps revision file lineage immutable.

insert into public.company_permission_catalog (permission_key, description)
values
  ('engineering.documents.read', 'Read company engineering documents, revisions, and drawing annotations.'),
  ('engineering.documents.create', 'Create company engineering documents and upload revisions.'),
  ('engineering.documents.update', 'Update company engineering document metadata and save drawing annotations.'),
  ('engineering.documents.manage', 'Full management of company engineering documents, revisions, and annotations.')
on conflict (permission_key) do update set description = excluded.description;

insert into public.company_role_permissions (role_key, permission_key)
select 'COMPANY_ADMIN', permission_key
from public.company_permission_catalog
where permission_key like 'engineering.documents.%'
on conflict do nothing;

insert into public.company_role_permissions (role_key, permission_key)
values
  ('FINANCE', 'engineering.documents.read'),
  ('FINANCE', 'engineering.documents.create'),
  ('FINANCE', 'engineering.documents.update'),
  ('PAYROLL', 'engineering.documents.read'),
  ('VIEWER', 'engineering.documents.read')
on conflict do nothing;

insert into private.company_tenant_policy_catalog (table_name, read_permission, write_permission, allow_insert, allow_update, allow_delete)
values
  ('engineering_documents', 'engineering.documents.read', 'engineering.documents.update', true, true, false),
  ('engineering_document_revisions', 'engineering.documents.read', 'engineering.documents.create', true, false, false),
  ('drawing_annotations', 'engineering.documents.read', 'engineering.documents.update', true, true, true)
on conflict (table_name) do update set
  read_permission = excluded.read_permission,
  write_permission = excluded.write_permission,
  allow_insert = excluded.allow_insert,
  allow_update = excluded.allow_update,
  allow_delete = excluded.allow_delete;

create table if not exists public.engineering_documents (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  project_id uuid references public.projects(id) on delete restrict,
  document_number text not null check (length(btrim(document_number)) between 1 and 100),
  title text not null check (length(btrim(title)) between 1 and 255),
  description text,
  discipline text not null check (discipline in (
    'ARCHITECTURAL', 'STRUCTURAL', 'CIVIL', 'MECHANICAL', 'ELECTRICAL',
    'PLUMBING', 'FIRE_PROTECTION', 'GEOTECHNICAL', 'GENERAL_ENGINEERING', 'OTHER'
  )),
  document_type text not null check (document_type in (
    'DRAWING', 'CALCULATION', 'SPECIFICATION', 'REPORT', 'ESTIMATE',
    'SUBMITTAL', 'PERMIT', 'OTHER'
  )),
  status text not null default 'DRAFT' check (status in (
    'DRAFT', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'SUPERSEDED', 'ARCHIVED'
  )),
  current_revision_id uuid,
  current_revision_number text not null default '0' check (length(btrim(current_revision_number)) between 1 and 30),
  tags text[] not null default '{}'::text[],
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (company_id, document_number)
);

create table if not exists public.engineering_document_revisions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  document_id uuid not null references public.engineering_documents(id) on delete restrict,
  revision_number text not null check (length(btrim(revision_number)) between 1 and 30),
  revision_label text,
  file_name text not null check (length(btrim(file_name)) between 1 and 255),
  file_path text not null check (length(btrim(file_path)) between 1 and 1000),
  file_size_bytes bigint not null check (file_size_bytes >= 0),
  file_type text not null check (length(btrim(file_type)) between 1 and 100),
  file_fingerprint text not null check (length(btrim(file_fingerprint)) between 8 and 256),
  page_count integer check (page_count is null or page_count > 0),
  sheet_size text,
  scale text,
  change_summary text,
  status text not null default 'PENDING_REVIEW' check (status in (
    'PENDING_REVIEW', 'APPROVED', 'REJECTED', 'SUPERSEDED'
  )),
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (document_id, revision_number)
);

create table if not exists public.drawing_annotations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  document_id uuid not null references public.engineering_documents(id) on delete restrict,
  revision_id uuid not null references public.engineering_document_revisions(id) on delete restrict,
  page_number integer not null default 1 check (page_number >= 1),
  annotation_type text not null check (annotation_type in (
    'RECTANGLE', 'CIRCLE', 'CLOUD', 'ARROW', 'LINE', 'TEXT',
    'FREEHAND', 'HIGHLIGHT', 'CALLOUT', 'MEASUREMENT', 'STAMP'
  )),
  geometry jsonb not null check (jsonb_typeof(geometry) = 'object'),
  style jsonb not null default '{}'::jsonb check (jsonb_typeof(style) = 'object'),
  content text,
  measurement_value numeric(18,4),
  measurement_unit text,
  status text not null default 'OPEN' check (status in (
    'OPEN', 'RESOLVED', 'CLOSED', 'DELETED'
  )),
  resolved_by_user_id uuid references auth.users(id) on delete set null,
  resolved_at timestamptz,
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.engineering_documents drop constraint if exists engineering_documents_current_revision_id_fkey;
alter table public.engineering_documents add constraint engineering_documents_current_revision_id_fkey
  foreign key (current_revision_id) references public.engineering_document_revisions(id) on delete set null;

create index if not exists engineering_documents_company_project_idx
  on public.engineering_documents(company_id, project_id, status);
create index if not exists engineering_documents_company_discipline_idx
  on public.engineering_documents(company_id, discipline, document_type);
create index if not exists engineering_documents_company_number_idx
  on public.engineering_documents(company_id, document_number);
create index if not exists engineering_document_revisions_doc_created_idx
  on public.engineering_document_revisions(document_id, created_at desc);
create index if not exists engineering_document_revisions_company_fingerprint_idx
  on public.engineering_document_revisions(company_id, file_fingerprint);
create index if not exists drawing_annotations_revision_page_idx
  on public.drawing_annotations(revision_id, page_number, status);
create index if not exists drawing_annotations_company_doc_idx
  on public.drawing_annotations(company_id, document_id);

-- The company audit catalog is append-only. Extend its allowlist without
-- changing any previously recorded history.
-- The audit-event allowlist must only ever GROW: this list is the complete
-- superset of all 33 prior events plus the 6 new ENGINEERING_* events (39 total).
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
  'ENGINEERING_REVISION_UPLOADED', 'ENGINEERING_ANNOTATION_SAVED', 'ENGINEERING_ANNOTATION_DELETED'
));

create or replace function private.validate_engineering_document_reference()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_doc public.engineering_documents;
  v_rev public.engineering_document_revisions;
begin
  if tg_table_name = 'engineering_documents' then
    if new.project_id is not null and not exists (
      select 1 from public.projects p
      where p.id = new.project_id and p.company_id = new.company_id
    ) then
      raise exception 'Referenced project is outside the company' using errcode = '42501';
    end if;
  elsif tg_table_name = 'engineering_document_revisions' then
    select * into v_doc
    from public.engineering_documents d
    where d.id = new.document_id and d.company_id = new.company_id;
    if not found then
      raise exception 'Parent engineering document is outside the company' using errcode = '42501';
    end if;
  elsif tg_table_name = 'drawing_annotations' then
    select * into v_doc
    from public.engineering_documents d
    where d.id = new.document_id and d.company_id = new.company_id;
    if not found then
      raise exception 'Annotated document is outside the company' using errcode = '42501';
    end if;

    select * into v_rev
    from public.engineering_document_revisions r
    where r.id = new.revision_id and r.company_id = new.company_id;
    if not found then
      raise exception 'Annotated revision is outside the company' using errcode = '42501';
    end if;

    if v_rev.document_id <> new.document_id then
      raise exception 'Annotation revision does not match the parent document' using errcode = '22023';
    end if;
  end if;
  return new;
end;
$$;

create or replace function private.validate_engineering_actor()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Engineering actor must be the authenticated user' using errcode = '42501';
  end if;
  if tg_op = 'INSERT' and new.created_by_user_id is distinct from (select auth.uid()) then
    raise exception 'Engineering actor must be the authenticated user' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and new.created_by_user_id is distinct from old.created_by_user_id then
    raise exception 'Engineering creation actor is immutable' using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace function private.audit_engineering_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event text;
  v_target_id uuid;
  v_metadata jsonb := '{}'::jsonb;
begin
  if tg_table_name = 'engineering_documents' then
    if tg_op = 'INSERT' then
      v_event := 'ENGINEERING_DOCUMENT_CREATED';
    elsif new.status = 'ARCHIVED' and old.status is distinct from 'ARCHIVED' then
      v_event := 'ENGINEERING_DOCUMENT_ARCHIVED';
    elsif new.archived_at is not null and old.archived_at is null then
      v_event := 'ENGINEERING_DOCUMENT_ARCHIVED';
    else
      v_event := 'ENGINEERING_DOCUMENT_UPDATED';
    end if;
    v_target_id := new.id;
    v_metadata := jsonb_build_object(
      'document_number', new.document_number,
      'title', new.title,
      'discipline', new.discipline,
      'document_type', new.document_type,
      'status', new.status,
      'project_id', new.project_id
    );
  elsif tg_table_name = 'engineering_document_revisions' then
    v_event := 'ENGINEERING_REVISION_UPLOADED';
    v_target_id := new.id;
    v_metadata := jsonb_build_object(
      'document_id', new.document_id,
      'revision_number', new.revision_number,
      'file_name', new.file_name,
      'file_size_bytes', new.file_size_bytes,
      'file_type', new.file_type
    );
  elsif tg_table_name = 'drawing_annotations' then
    if tg_op = 'DELETE' or (tg_op = 'UPDATE' and new.status = 'DELETED' and old.status is distinct from 'DELETED') then
      v_event := 'ENGINEERING_ANNOTATION_DELETED';
      v_target_id := coalesce(new.id, old.id);
      v_metadata := jsonb_build_object(
        'document_id', coalesce(new.document_id, old.document_id),
        'revision_id', coalesce(new.revision_id, old.revision_id),
        'annotation_type', coalesce(new.annotation_type, old.annotation_type),
        'page_number', coalesce(new.page_number, old.page_number)
      );
      perform private.write_company_audit(coalesce(new.company_id, old.company_id), v_event, 'engineering', v_target_id, v_metadata);
      return coalesce(new, old);
    else
      v_event := 'ENGINEERING_ANNOTATION_SAVED';
      v_target_id := new.id;
      v_metadata := jsonb_build_object(
        'document_id', new.document_id,
        'revision_id', new.revision_id,
        'annotation_type', new.annotation_type,
        'page_number', new.page_number,
        'status', new.status
      );
    end if;
  else
    return new;
  end if;

  perform private.write_company_audit(new.company_id, v_event, 'engineering', v_target_id, v_metadata);
  return new;
end;
$$;

drop trigger if exists engineering_documents_company_boundary on public.engineering_documents;
create trigger engineering_documents_company_boundary
  before insert or update on public.engineering_documents
  for each row execute function private.enforce_company_row_boundary();

drop trigger if exists engineering_document_revisions_company_boundary on public.engineering_document_revisions;
create trigger engineering_document_revisions_company_boundary
  before insert or update on public.engineering_document_revisions
  for each row execute function private.enforce_company_row_boundary();

drop trigger if exists drawing_annotations_company_boundary on public.drawing_annotations;
create trigger drawing_annotations_company_boundary
  before insert or update on public.drawing_annotations
  for each row execute function private.enforce_company_row_boundary();

drop trigger if exists engineering_documents_reference on public.engineering_documents;
create trigger engineering_documents_reference
  before insert or update on public.engineering_documents
  for each row execute function private.validate_engineering_document_reference();

drop trigger if exists engineering_document_revisions_reference on public.engineering_document_revisions;
create trigger engineering_document_revisions_reference
  before insert or update on public.engineering_document_revisions
  for each row execute function private.validate_engineering_document_reference();

drop trigger if exists drawing_annotations_reference on public.drawing_annotations;
create trigger drawing_annotations_reference
  before insert or update on public.drawing_annotations
  for each row execute function private.validate_engineering_document_reference();

drop trigger if exists engineering_documents_actor on public.engineering_documents;
create trigger engineering_documents_actor
  before insert or update on public.engineering_documents
  for each row execute function private.validate_engineering_actor();

drop trigger if exists engineering_document_revisions_actor on public.engineering_document_revisions;
create trigger engineering_document_revisions_actor
  before insert or update on public.engineering_document_revisions
  for each row execute function private.validate_engineering_actor();

drop trigger if exists drawing_annotations_actor on public.drawing_annotations;
create trigger drawing_annotations_actor
  before insert or update on public.drawing_annotations
  for each row execute function private.validate_engineering_actor();

drop trigger if exists engineering_documents_updated_at on public.engineering_documents;
create trigger engineering_documents_updated_at
  before update on public.engineering_documents
  for each row execute function private.set_company_updated_at();

drop trigger if exists engineering_document_revisions_updated_at on public.engineering_document_revisions;
create trigger engineering_document_revisions_updated_at
  before update on public.engineering_document_revisions
  for each row execute function private.set_company_updated_at();

drop trigger if exists drawing_annotations_updated_at on public.drawing_annotations;
create trigger drawing_annotations_updated_at
  before update on public.drawing_annotations
  for each row execute function private.set_company_updated_at();

drop trigger if exists engineering_documents_audit on public.engineering_documents;
create trigger engineering_documents_audit
  after insert or update on public.engineering_documents
  for each row execute function private.audit_engineering_event();

drop trigger if exists engineering_document_revisions_audit on public.engineering_document_revisions;
create trigger engineering_document_revisions_audit
  after insert on public.engineering_document_revisions
  for each row execute function private.audit_engineering_event();

drop trigger if exists drawing_annotations_audit on public.drawing_annotations;
create trigger drawing_annotations_audit
  after insert or update or delete on public.drawing_annotations
  for each row execute function private.audit_engineering_event();

alter table public.engineering_documents enable row level security;
alter table public.engineering_document_revisions enable row level security;
alter table public.drawing_annotations enable row level security;

drop policy if exists engineering_documents_company_select on public.engineering_documents;
create policy engineering_documents_company_select on public.engineering_documents
  for select to authenticated
  using ((select public.has_company_permission(company_id, 'engineering.documents.read')));

drop policy if exists engineering_documents_company_insert on public.engineering_documents;
create policy engineering_documents_company_insert on public.engineering_documents
  for insert to authenticated
  with check (
    (select public.has_company_permission(company_id, 'engineering.documents.create'))
    or (select public.has_company_permission(company_id, 'engineering.documents.manage'))
  );

drop policy if exists engineering_documents_company_update on public.engineering_documents;
create policy engineering_documents_company_update on public.engineering_documents
  for update to authenticated
  using (
    (select public.has_company_permission(company_id, 'engineering.documents.update'))
    or (select public.has_company_permission(company_id, 'engineering.documents.manage'))
  )
  with check (
    (select public.has_company_permission(company_id, 'engineering.documents.update'))
    or (select public.has_company_permission(company_id, 'engineering.documents.manage'))
  );

drop policy if exists engineering_document_revisions_company_select on public.engineering_document_revisions;
create policy engineering_document_revisions_company_select on public.engineering_document_revisions
  for select to authenticated
  using ((select public.has_company_permission(company_id, 'engineering.documents.read')));

drop policy if exists engineering_document_revisions_company_insert on public.engineering_document_revisions;
create policy engineering_document_revisions_company_insert on public.engineering_document_revisions
  for insert to authenticated
  with check (
    (select public.has_company_permission(company_id, 'engineering.documents.create'))
    or (select public.has_company_permission(company_id, 'engineering.documents.manage'))
  );

drop policy if exists drawing_annotations_company_select on public.drawing_annotations;
create policy drawing_annotations_company_select on public.drawing_annotations
  for select to authenticated
  using ((select public.has_company_permission(company_id, 'engineering.documents.read')));

drop policy if exists drawing_annotations_company_insert on public.drawing_annotations;
create policy drawing_annotations_company_insert on public.drawing_annotations
  for insert to authenticated
  with check (
    (select public.has_company_permission(company_id, 'engineering.documents.update'))
    or (select public.has_company_permission(company_id, 'engineering.documents.manage'))
  );

drop policy if exists drawing_annotations_company_update on public.drawing_annotations;
create policy drawing_annotations_company_update on public.drawing_annotations
  for update to authenticated
  using (
    (select public.has_company_permission(company_id, 'engineering.documents.update'))
    or (select public.has_company_permission(company_id, 'engineering.documents.manage'))
  )
  with check (
    (select public.has_company_permission(company_id, 'engineering.documents.update'))
    or (select public.has_company_permission(company_id, 'engineering.documents.manage'))
  );

drop policy if exists drawing_annotations_company_delete on public.drawing_annotations;
create policy drawing_annotations_company_delete on public.drawing_annotations
  for delete to authenticated
  using (
    (select public.has_company_permission(company_id, 'engineering.documents.update'))
    or (select public.has_company_permission(company_id, 'engineering.documents.manage'))
  );

revoke all on table public.engineering_documents, public.engineering_document_revisions, public.drawing_annotations
  from public, anon, authenticated;
grant select, insert, update on table public.engineering_documents to authenticated;
grant select, insert on table public.engineering_document_revisions to authenticated;
grant select, insert, update, delete on table public.drawing_annotations to authenticated;
revoke delete on table public.engineering_documents, public.engineering_document_revisions from authenticated;

-- Storage Bucket and RLS policies for Engineering Documents
insert into storage.buckets (id, name, public)
values ('engineering-documents', 'engineering-documents', false)
on conflict (id) do update set public = false;

drop policy if exists "company engineering documents read" on storage.objects;
drop policy if exists "company engineering documents insert" on storage.objects;
drop policy if exists "company engineering documents update" on storage.objects;
drop policy if exists "company engineering documents delete" on storage.objects;

create policy "company engineering documents read" on storage.objects
for select to authenticated
using (
  bucket_id = 'engineering-documents'
  and private.storage_company_id(name) is not null
  and (select public.has_company_permission(private.storage_company_id(name), 'engineering.documents.read'))
);

create policy "company engineering documents insert" on storage.objects
for insert to authenticated
with check (
  bucket_id = 'engineering-documents'
  and private.storage_company_id(name) is not null
  and (
    (select public.has_company_permission(private.storage_company_id(name), 'engineering.documents.create'))
    or (select public.has_company_permission(private.storage_company_id(name), 'engineering.documents.manage'))
  )
);

create policy "company engineering documents update" on storage.objects
for update to authenticated
using (
  bucket_id = 'engineering-documents'
  and private.storage_company_id(name) is not null
  and (
    (select public.has_company_permission(private.storage_company_id(name), 'engineering.documents.update'))
    or (select public.has_company_permission(private.storage_company_id(name), 'engineering.documents.manage'))
  )
)
with check (
  bucket_id = 'engineering-documents'
  and private.storage_company_id(name) is not null
  and (
    (select public.has_company_permission(private.storage_company_id(name), 'engineering.documents.update'))
    or (select public.has_company_permission(private.storage_company_id(name), 'engineering.documents.manage'))
  )
);

create policy "company engineering documents delete" on storage.objects
for delete to authenticated
using (
  bucket_id = 'engineering-documents'
  and private.storage_company_id(name) is not null
  and (select public.has_company_permission(private.storage_company_id(name), 'engineering.documents.manage'))
);

revoke execute on function private.validate_engineering_document_reference() from public, anon, authenticated;
revoke execute on function private.validate_engineering_actor() from public, anon, authenticated;
revoke execute on function private.audit_engineering_event() from public, anon, authenticated;

-- Realtime publication coverage for Engineering Documents tables
do $$
declare
  table_name text;
begin
  if exists (
    select 1 from pg_publication
    where pubname = 'supabase_realtime' and not puballtables
  ) then
    foreach table_name in array array[
      'engineering_documents',
      'engineering_document_revisions',
      'drawing_annotations'
    ] loop
      if to_regclass(format('public.%I', table_name)) is not null
         and not exists (
           select 1
           from pg_publication p
           join pg_publication_rel pr on pr.prpubid = p.oid
           join pg_class c on c.oid = pr.prrelid
           join pg_namespace n on n.oid = c.relnamespace
           where p.pubname = 'supabase_realtime'
             and n.nspname = 'public'
             and c.relname = table_name
         ) then
        execute format('alter publication supabase_realtime add table public.%I', table_name);
      end if;
    end loop;
  end if;
end $$;
