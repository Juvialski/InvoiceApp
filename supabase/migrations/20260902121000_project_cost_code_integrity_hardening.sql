-- P1B review hardening: close project/company ownership gaps, prevent new
-- assignment to archived cost codes, serialize budget edits, and preserve an
-- auditable project-level history for cost-code changes.

create or replace function private.validate_project_cost_code_scope()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_company_id uuid;
  v_status text;
  v_archived_at timestamptz;
begin
  if tg_op = 'UPDATE' and new.project_id is distinct from old.project_id then
    raise exception 'Project cost codes cannot move between projects'
      using errcode = '42501';
  end if;

  -- Lock the parent project while a cost-code budget is changing. This makes
  -- concurrent budget-line mutations serialize against each other and against
  -- project-budget changes before the deferred aggregate constraint runs.
  select p.company_id, p.status, p.archived_at
    into v_company_id, v_status, v_archived_at
  from public.projects p
  where p.id = new.project_id
  for no key update;

  if v_company_id is null then
    raise exception 'Project cost code requires an existing project'
      using errcode = '23503';
  end if;

  if v_company_id is distinct from new.company_id then
    raise exception 'Project cost code project is outside the company'
      using errcode = '42501';
  end if;

  if v_status = 'ARCHIVED' or v_archived_at is not null then
    raise exception 'Archived projects cannot receive project cost-code changes'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke execute on function private.validate_project_cost_code_scope() from public, anon, authenticated;

drop trigger if exists project_cost_codes_scope_guard on public.project_cost_codes;
create trigger project_cost_codes_scope_guard
before insert or update on public.project_cost_codes
for each row execute function private.validate_project_cost_code_scope();

-- The generic archived-project activity trigger predates project_cost_codes and
-- does not resolve its project_id. Remove that no-op attachment; the scoped
-- guard above is the authoritative parent-project guard for this table.
drop trigger if exists project_cost_codes_project_activity on public.project_cost_codes;

create or replace function public.validate_invoice_project_allocation_ownership()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_cost_code_status text;
begin
  if not exists (
    select 1
    from public.invoices i
    join public.projects p on p.id = new.project_id
    where i.id = new.invoice_id
      and i.company_id = new.company_id
      and p.company_id = new.company_id
  ) then
    raise exception 'Invoice and project must belong to the same company';
  end if;

  if new.project_cost_code_id is not null then
    select cc.status
      into v_cost_code_status
    from public.project_cost_codes cc
    where cc.id = new.project_cost_code_id
      and cc.project_id = new.project_id
      and cc.company_id = new.company_id;

    if v_cost_code_status is null then
      raise exception 'Cost code does not belong to the same project and company';
    end if;

    -- Historical rows may keep their archived code while unrelated fields are
    -- corrected. New or changed assignments must target an active code.
    if v_cost_code_status <> 'ACTIVE'
       and (tg_op = 'INSERT' or old.project_cost_code_id is distinct from new.project_cost_code_id) then
      raise exception 'Archived cost codes cannot receive new invoice assignments'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.validate_payroll_project_allocation_ownership()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_cost_code_status text;
begin
  if not exists (
    select 1
    from public.payroll_entries pe
    join public.projects p on p.id = new.project_id
    where pe.id = new.payroll_entry_id
      and pe.company_id = new.company_id
      and p.company_id = new.company_id
  ) then
    raise exception 'Payroll allocation entry and project must belong to the same company';
  end if;

  if new.project_cost_code_id is not null then
    select cc.status
      into v_cost_code_status
    from public.project_cost_codes cc
    where cc.id = new.project_cost_code_id
      and cc.project_id = new.project_id
      and cc.company_id = new.company_id;

    if v_cost_code_status is null then
      raise exception 'Cost code does not belong to the same project and company';
    end if;

    if v_cost_code_status <> 'ACTIVE'
       and (tg_op = 'INSERT' or old.project_cost_code_id is distinct from new.project_cost_code_id) then
      raise exception 'Archived cost codes cannot receive new payroll assignments'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.validate_expense_project_ownership()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_cost_code_status text;
begin
  if new.project_id is not null and not exists (
    select 1 from public.projects p where p.id = new.project_id and p.company_id = new.company_id
  ) then
    raise exception 'Expense project is outside the company';
  end if;

  if new.receipt_source_document_id is not null and not exists (
    select 1 from public.source_documents d where d.id = new.receipt_source_document_id and d.company_id = new.company_id
  ) then
    raise exception 'Expense receipt source is outside the company';
  end if;

  if new.project_cost_code_id is not null then
    if new.project_id is null then
      raise exception 'Cost code requires an associated project';
    end if;

    select cc.status
      into v_cost_code_status
    from public.project_cost_codes cc
    where cc.id = new.project_cost_code_id
      and cc.project_id = new.project_id
      and cc.company_id = new.company_id;

    if v_cost_code_status is null then
      raise exception 'Cost code does not belong to the same project and company';
    end if;

    if v_cost_code_status <> 'ACTIVE'
       and (tg_op = 'INSERT' or old.project_cost_code_id is distinct from new.project_cost_code_id) then
      raise exception 'Archived cost codes cannot receive new expense assignments'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

-- Project cost-code changes are project-control events, not company-membership
-- audit events. Keep them in the existing project accounting/event history.
create or replace function private.audit_project_cost_code_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := coalesce((select auth.uid()), new.updated_by_user_id, new.created_by_user_id);
  v_event_type text;
  v_description text;
  v_before jsonb;
  v_after jsonb;
begin
  if v_actor is null then
    raise exception 'Project cost-code changes require an attributable actor'
      using errcode = '42501';
  end if;

  if tg_op = 'UPDATE'
     and new.code is not distinct from old.code
     and new.name is not distinct from old.name
     and new.description is not distinct from old.description
     and new.status is not distinct from old.status
     and new.approved_budget_amount is not distinct from old.approved_budget_amount
     and new.forecast_amount is not distinct from old.forecast_amount then
    return new;
  end if;

  v_after := jsonb_build_object(
    'code', new.code,
    'name', new.name,
    'description', new.description,
    'status', new.status,
    'approved_budget_amount', new.approved_budget_amount,
    'forecast_amount', new.forecast_amount
  );

  if tg_op = 'INSERT' then
    v_event_type := 'COST_CODE_CREATED';
    v_description := 'Project cost code created';
    v_before := null;
  else
    v_before := jsonb_build_object(
      'code', old.code,
      'name', old.name,
      'description', old.description,
      'status', old.status,
      'approved_budget_amount', old.approved_budget_amount,
      'forecast_amount', old.forecast_amount
    );

    if old.status = 'ACTIVE' and new.status = 'ARCHIVED' then
      v_event_type := 'COST_CODE_ARCHIVED';
      v_description := 'Project cost code archived';
    elsif old.status = 'ARCHIVED' and new.status = 'ACTIVE' then
      v_event_type := 'COST_CODE_REACTIVATED';
      v_description := 'Project cost code reactivated';
    else
      v_event_type := 'COST_CODE_UPDATED';
      v_description := 'Project cost code updated';
    end if;
  end if;

  insert into public.project_accounting_events (
    company_id,
    user_id,
    project_id,
    entity_type,
    entity_id,
    event_type,
    description,
    metadata
  ) values (
    new.company_id,
    v_actor,
    new.project_id,
    'PROJECT_COST_CODE',
    new.id,
    v_event_type,
    v_description,
    jsonb_build_object('before', v_before, 'after', v_after)
  );

  return new;
end;
$$;

revoke execute on function private.audit_project_cost_code_change() from public, anon, authenticated;

drop trigger if exists project_cost_codes_audit on public.project_cost_codes;
create trigger project_cost_codes_audit
after insert or update on public.project_cost_codes
for each row execute function private.audit_project_cost_code_change();
