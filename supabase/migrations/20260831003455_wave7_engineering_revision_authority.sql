-- Wave 7 production-readiness closure.
--
-- This migration is forward-only. It closes authority gaps found by the
-- integrated audit without rewriting existing engineering or payroll history:
--   * revision creation is deployment-bound and cannot choose a finalized
--     lifecycle state or append to an archived/superseded document;
--   * finalized payroll source protection also covers holiday-date changes;
--   * the finalized-source invariant executes independently of caller read RLS
--     while remaining bound to the deployment company, so a custom payroll
--     writer cannot bypass history protection or use the guard as a
--     cross-company existence probe.

create or replace function public.guard_finalized_payroll_workforce_source()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_new jsonb := coalesce(to_jsonb(new), '{}'::jsonb);
  v_old jsonb := coalesce(to_jsonb(old), '{}'::jsonb);
  v_company_id uuid := nullif(coalesce(v_new ->> 'company_id', v_old ->> 'company_id'), '')::uuid;
  v_deployment_company_id uuid := (select private.deployment_company_id());
  v_new_period_id uuid := nullif(v_new ->> 'period_id', '')::uuid;
  v_old_period_id uuid := nullif(v_old ->> 'period_id', '')::uuid;
  v_start_date date := least(
    nullif(v_new ->> 'holiday_date', '')::date,
    nullif(v_new ->> 'attendance_date', '')::date,
    nullif(v_new ->> 'overtime_date', '')::date,
    nullif(v_new ->> 'start_date', '')::date,
    nullif(v_new ->> 'work_date', '')::date,
    nullif(v_old ->> 'holiday_date', '')::date,
    nullif(v_old ->> 'attendance_date', '')::date,
    nullif(v_old ->> 'overtime_date', '')::date,
    nullif(v_old ->> 'start_date', '')::date,
    nullif(v_old ->> 'work_date', '')::date
  );
  v_end_date date := greatest(
    nullif(v_new ->> 'holiday_date', '')::date,
    nullif(v_new ->> 'end_date', '')::date,
    nullif(v_new ->> 'attendance_date', '')::date,
    nullif(v_new ->> 'overtime_date', '')::date,
    nullif(v_new ->> 'work_date', '')::date,
    nullif(v_old ->> 'holiday_date', '')::date,
    nullif(v_old ->> 'end_date', '')::date,
    nullif(v_old ->> 'attendance_date', '')::date,
    nullif(v_old ->> 'overtime_date', '')::date,
    nullif(v_old ->> 'work_date', '')::date
  );
begin
  if v_company_id is null or v_company_id is distinct from v_deployment_company_id then
    raise exception 'Payroll source company boundary violation' using errcode = '42501';
  end if;

  if exists (
    select 1
    from public.payroll_periods p
    left join public.payroll_runs r
      on r.company_id = p.company_id
     and r.period_id = p.id
    where p.company_id = v_deployment_company_id
      and (
        p.status in ('APPROVED', 'PAID')
        or p.locked_at is not null
        or r.status in ('APPROVED', 'PAID')
      )
      and (
        (v_new_period_id is not null and p.id = v_new_period_id)
        or (v_old_period_id is not null and p.id = v_old_period_id)
        or (
          v_new_period_id is null
          and v_old_period_id is null
          and v_start_date is not null
          and v_end_date is not null
          and p.period_start <= v_end_date
          and p.period_end >= v_start_date
        )
      )
  ) then
    raise exception 'Finalized payroll sources are immutable; create a deliberate correction workflow'
      using errcode = '42501';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists payroll_holidays_finalized_source_guard on public.payroll_holidays;
create trigger payroll_holidays_finalized_source_guard
before insert or update or delete on public.payroll_holidays
for each row execute function public.guard_finalized_payroll_workforce_source();

revoke execute on function public.guard_finalized_payroll_workforce_source() from public, anon, authenticated;

create or replace function public.create_engineering_revision(
  p_company_id uuid,
  p_document_id uuid,
  p_revision_id uuid,
  p_revision_number text,
  p_revision_label text,
  p_file_name text,
  p_file_path text,
  p_file_size_bytes bigint,
  p_file_type text,
  p_file_fingerprint text,
  p_page_count integer,
  p_sheet_size text,
  p_scale text,
  p_change_summary text,
  p_document_status text,
  p_revision_status text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_deployment_company_id uuid := (select private.deployment_company_id());
  v_document_status text := coalesce(nullif(upper(btrim(p_document_status)), ''), 'UNDER_REVIEW');
  v_revision_status text := coalesce(nullif(upper(btrim(p_revision_status)), ''), 'PENDING_REVIEW');
  v_doc public.engineering_documents;
  v_revision public.engineering_document_revisions;
begin
  if v_user_id is null
     or p_company_id is null
     or p_company_id is distinct from v_deployment_company_id
     or not (
       (select public.has_company_permission(p_company_id, 'engineering.documents.create'))
       or (select public.has_company_permission(p_company_id, 'engineering.documents.manage'))
     ) then
    raise exception 'Engineering revision create permission is required' using errcode = '42501';
  end if;

  if v_document_status <> 'UNDER_REVIEW' then
    raise exception 'Engineering revision uploads may only move documents to UNDER_REVIEW' using errcode = '42501';
  end if;
  if v_revision_status <> 'PENDING_REVIEW' then
    raise exception 'Engineering revision uploads may only create PENDING_REVIEW revisions' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from storage.objects o
    where o.bucket_id = 'engineering-documents'
      and o.name = p_file_path
  ) then
    raise exception 'The uploaded engineering PDF object was not found in private Storage' using errcode = '22023';
  end if;

  select * into v_doc
  from public.engineering_documents d
  where d.id = p_document_id
    and d.company_id = p_company_id
  for update;

  if not found or v_doc.status in ('ARCHIVED', 'SUPERSEDED') then
    raise exception 'Archived or superseded engineering documents cannot receive new revisions' using errcode = '42501';
  end if;

  insert into public.engineering_document_revisions (
    id, company_id, document_id, revision_number, revision_label, file_name, file_path,
    file_size_bytes, file_type, file_fingerprint, page_count, sheet_size, scale,
    change_summary, status, created_by_user_id
  ) values (
    p_revision_id, p_company_id, p_document_id, btrim(p_revision_number),
    nullif(btrim(p_revision_label), ''), btrim(p_file_name), btrim(p_file_path),
    p_file_size_bytes, lower(btrim(p_file_type)), lower(btrim(p_file_fingerprint)),
    p_page_count, nullif(btrim(p_sheet_size), ''), nullif(btrim(p_scale), ''),
    nullif(btrim(p_change_summary), ''), v_revision_status, v_user_id
  );

  update public.engineering_documents
  set current_revision_id = p_revision_id,
      current_revision_number = btrim(p_revision_number),
      status = v_document_status,
      updated_at = now()
  where id = p_document_id
    and company_id = p_company_id
  returning * into v_doc;

  select * into v_revision
  from public.engineering_document_revisions
  where id = p_revision_id
    and company_id = p_company_id;

  return jsonb_build_object('document', to_jsonb(v_doc), 'revision', to_jsonb(v_revision));
end;
$$;

revoke all on function public.create_engineering_revision(uuid, uuid, uuid, text, text, text, text, bigint, text, text, integer, text, text, text, text, text) from public, anon;
grant execute on function public.create_engineering_revision(uuid, uuid, uuid, text, text, text, text, bigint, text, text, integer, text, text, text, text, text) to authenticated;
