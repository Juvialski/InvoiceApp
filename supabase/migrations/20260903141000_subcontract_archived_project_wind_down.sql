-- P2B-1 review hardening: an archived Project must not accept new subcontract
-- commitment activity, but existing subcontract history still needs a safe way
-- to wind down. Project archive is a history-preserving lifecycle action, so an
-- ACTIVE subcontract must remain cancellable/closable rather than becoming
-- stranded forever.

create or replace function private.validate_subcontract_scope()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_project_company_id uuid;
  v_project_status text;
  v_project_archived_at timestamptz;
  v_vendor_company_id uuid;
  v_has_manage boolean;
  v_has_approve boolean;
  v_lines_total numeric(18,2);
begin
  if v_user_id is null then
    raise exception 'Authentication is required for subcontract activity' using errcode = '42501';
  end if;

  select p.company_id, p.status, p.archived_at
    into v_project_company_id, v_project_status, v_project_archived_at
  from public.projects p
  where p.id = new.project_id
  for key share;

  if v_project_company_id is null then
    raise exception 'Subcontract requires an existing project' using errcode = '23503';
  end if;
  if v_project_company_id is distinct from new.company_id then
    raise exception 'Subcontract project is outside the company' using errcode = '42501';
  end if;

  -- Archived projects cannot receive new or expanding subcontract activity.
  -- Existing records may only wind down: any live state may CANCEL, and an
  -- ACTIVE subcontract may CLOSE. Draft deletion remains governed by the
  -- existing delete trigger/RPC and does not pass through this UPDATE trigger.
  if v_project_status = 'ARCHIVED' or v_project_archived_at is not null then
    if tg_op = 'INSERT' then
      raise exception 'Archived projects cannot receive subcontract activity' using errcode = '42501';
    end if;

    if new.status is not distinct from old.status then
      raise exception 'Archived projects cannot receive subcontract activity' using errcode = '42501';
    end if;

    if new.status <> 'CANCELLED'
       and not (old.status = 'ACTIVE' and new.status = 'CLOSED') then
      raise exception 'Archived projects only permit subcontract wind-down to CLOSED or CANCELLED' using errcode = '42501';
    end if;
  end if;

  select v.company_id into v_vendor_company_id
  from public.vendors v
  where v.id = new.vendor_id;

  if v_vendor_company_id is null then
    raise exception 'Subcontract requires an existing vendor' using errcode = '23503';
  end if;
  if v_vendor_company_id is distinct from new.company_id then
    raise exception 'Subcontract vendor is outside the company' using errcode = '42501';
  end if;

  v_has_manage := (select public.has_company_permission(new.company_id, 'procurement.manage'));
  v_has_approve := (select public.has_company_permission(new.company_id, 'procurement.approve'));

  if tg_op = 'INSERT' then
    if not v_has_manage then
      raise exception 'Unauthorized to create subcontracts' using errcode = '42501';
    end if;
    if new.status <> 'DRAFT' then
      raise exception 'Subcontracts must be created as DRAFT and transitioned through the guarded lifecycle' using errcode = '42501';
    end if;

    new.created_at := now();
    new.updated_at := now();
    new.original_amount := 0;
    new.created_by_user_id := v_user_id;
    new.updated_by_user_id := v_user_id;
    new.approved_by_user_id := null;
    new.activated_by_user_id := null;
    new.closed_by_user_id := null;
    new.cancelled_by_user_id := null;
    new.approved_at := null;
    new.activated_at := null;
    new.closed_at := null;
    new.cancelled_at := null;
    new.cancellation_reason := null;
    return new;
  end if;

  if new.company_id is distinct from old.company_id then
    raise exception 'Subcontract company is immutable' using errcode = '42501';
  end if;
  if new.created_by_user_id is distinct from old.created_by_user_id or new.created_at is distinct from old.created_at then
    raise exception 'Subcontract creation provenance is immutable' using errcode = '42501';
  end if;

  if new.status is not distinct from old.status then
    if not v_has_manage then
      raise exception 'Unauthorized to edit subcontracts' using errcode = '42501';
    end if;
    if new.original_amount is distinct from old.original_amount then
      select coalesce(sum(scl.amount), 0)
        into v_lines_total
      from public.subcontract_lines scl
      where scl.subcontract_id = old.id and scl.company_id = old.company_id;

      if new.original_amount is distinct from v_lines_total then
        raise exception 'Subcontract original amount must equal the line-item total' using errcode = '23514';
      end if;
    end if;
    if old.status <> 'DRAFT' and (
      new.subcontract_number is distinct from old.subcontract_number or
      new.vendor_id is distinct from old.vendor_id or
      new.project_id is distinct from old.project_id or
      new.currency is distinct from old.currency or
      new.title is distinct from old.title or
      new.start_date is distinct from old.start_date or
      new.target_completion_date is distinct from old.target_completion_date or
      new.notes is distinct from old.notes or
      new.original_amount is distinct from old.original_amount or
      new.cancellation_reason is distinct from old.cancellation_reason
    ) then
      raise exception 'Approved, active, closed, or cancelled subcontract terms are immutable' using errcode = '42501';
    end if;

    if new.approved_by_user_id is distinct from old.approved_by_user_id or
       new.activated_by_user_id is distinct from old.activated_by_user_id or
       new.closed_by_user_id is distinct from old.closed_by_user_id or
       new.cancelled_by_user_id is distinct from old.cancelled_by_user_id or
       new.approved_at is distinct from old.approved_at or
       new.activated_at is distinct from old.activated_at or
       new.closed_at is distinct from old.closed_at or
       new.cancelled_at is distinct from old.cancelled_at then
      raise exception 'Subcontract lifecycle audit metadata is immutable outside a lifecycle transition' using errcode = '42501';
    end if;

    new.updated_by_user_id := v_user_id;
    return new;
  end if;

  if not v_has_approve then
    raise exception 'procurement.approve permission is required for subcontract lifecycle transitions' using errcode = '42501';
  end if;

  if new.subcontract_number is distinct from old.subcontract_number or
     new.vendor_id is distinct from old.vendor_id or
     new.project_id is distinct from old.project_id or
     new.currency is distinct from old.currency or
     new.title is distinct from old.title or
     new.start_date is distinct from old.start_date or
     new.target_completion_date is distinct from old.target_completion_date or
     new.notes is distinct from old.notes or
     new.original_amount is distinct from old.original_amount then
    raise exception 'Subcontract terms cannot change during a lifecycle transition' using errcode = '42501';
  end if;

  if old.status = 'DRAFT' and new.status not in ('APPROVED', 'CANCELLED') then
    raise exception 'Draft subcontracts can only be approved or cancelled' using errcode = '42501';
  elsif old.status = 'APPROVED' and new.status not in ('ACTIVE', 'CANCELLED') then
    raise exception 'Approved subcontracts can only be activated or cancelled' using errcode = '42501';
  elsif old.status = 'ACTIVE' and new.status not in ('CLOSED', 'CANCELLED') then
    raise exception 'Active subcontracts can only be closed or cancelled' using errcode = '42501';
  elsif old.status in ('CLOSED', 'CANCELLED') then
    raise exception 'Closed or cancelled subcontracts cannot undergo further transitions' using errcode = '42501';
  end if;

  if new.status = 'APPROVED' then
    select coalesce(sum(scl.amount), 0)
      into v_lines_total
    from public.subcontract_lines scl
    where scl.subcontract_id = old.id and scl.company_id = old.company_id;

    if new.original_amount is distinct from v_lines_total then
      raise exception 'Subcontract original amount must equal the line-item total' using errcode = '23514';
    end if;
    if not exists (
      select 1 from public.subcontract_lines scl
      where scl.subcontract_id = old.id and scl.company_id = old.company_id
    ) then
      raise exception 'A subcontract requires at least one line item before approval' using errcode = '23514';
    end if;
    if coalesce(new.original_amount, 0) <= 0 then
      raise exception 'Subcontract original amount must be positive before approval' using errcode = '23514';
    end if;
  end if;

  new.approved_by_user_id := old.approved_by_user_id;
  new.activated_by_user_id := old.activated_by_user_id;
  new.closed_by_user_id := old.closed_by_user_id;
  new.cancelled_by_user_id := old.cancelled_by_user_id;
  new.approved_at := old.approved_at;
  new.activated_at := old.activated_at;
  new.closed_at := old.closed_at;
  new.cancelled_at := old.cancelled_at;

  if new.status = 'APPROVED' then
    new.approved_by_user_id := v_user_id;
    new.approved_at := now();
    new.cancellation_reason := null;
  elsif new.status = 'ACTIVE' then
    new.activated_by_user_id := v_user_id;
    new.activated_at := now();
    new.cancellation_reason := old.cancellation_reason;
  elsif new.status = 'CLOSED' then
    new.closed_by_user_id := v_user_id;
    new.closed_at := now();
    new.cancellation_reason := old.cancellation_reason;
  elsif new.status = 'CANCELLED' then
    if new.cancellation_reason is null or length(btrim(new.cancellation_reason)) = 0 then
      raise exception 'Cancellation reason is required when cancelling a subcontract' using errcode = '23514';
    end if;
    new.cancelled_by_user_id := v_user_id;
    new.cancelled_at := now();
    new.cancellation_reason := btrim(new.cancellation_reason);
  end if;

  new.updated_by_user_id := v_user_id;
  return new;
end;
$$;

revoke all on function private.validate_subcontract_scope() from public, anon, authenticated;
