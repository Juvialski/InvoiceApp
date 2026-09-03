-- P2A-4 review hardening: once a selected quotation has produced a live PO,
-- supplier selection cannot be silently changed underneath that PO. RFQ
-- cancellation likewise requires selection/PO cleanup to be explicit first.

create or replace function public.select_supplier_quotation(
  p_quotation_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_quote record;
  v_rfq record;
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if length(v_reason) < 3 then
    raise exception 'Selection reason is required (at least 3 characters)' using errcode = '22023';
  end if;

  select q.* into v_quote
  from public.supplier_quotations q
  where q.id = p_quotation_id;
  if not found then
    raise exception 'Quotation not found' using errcode = 'P0002';
  end if;
  if not public.has_company_permission(v_quote.company_id, 'procurement.manage') then
    raise exception 'Insufficient permissions to select preferred quotation' using errcode = '42501';
  end if;

  select r.* into v_rfq
  from public.rfqs r
  where r.id = v_quote.rfq_id and r.company_id = v_quote.company_id
  for update;
  if not found then
    raise exception 'Associated RFQ not found' using errcode = 'P0002';
  end if;

  select q.* into v_quote
  from public.supplier_quotations q
  where q.id = p_quotation_id and q.rfq_id = v_rfq.id and q.company_id = v_rfq.company_id
  for update;
  if not found then
    raise exception 'Quotation no longer belongs to the RFQ' using errcode = '42501';
  end if;

  if v_rfq.status <> 'ISSUED' then
    raise exception 'Quotation selection is only allowed while the RFQ is ISSUED' using errcode = '42501';
  end if;
  if v_quote.status <> 'SUBMITTED' then
    raise exception 'Only SUBMITTED quotations may be selected' using errcode = '42501';
  end if;

  if v_rfq.selected_quotation_id is not null
     and v_rfq.selected_quotation_id is distinct from p_quotation_id
     and exists (
       select 1
       from public.purchase_orders po
       where po.supplier_quotation_id = v_rfq.selected_quotation_id
         and po.company_id = v_rfq.company_id
         and po.status <> 'CANCELLED'
     ) then
    raise exception 'Current supplier selection has a non-cancelled Purchase Order; delete/cancel that PO before selecting another quotation' using errcode = '42501';
  end if;

  update public.supplier_quotations
  set status = 'SUBMITTED',
      deselected_at = now(),
      deselected_by_user_id = v_user_id,
      deselection_reason = 'Replaced by selection of quotation ' || v_quote.quotation_number,
      updated_at = now()
  where rfq_id = v_rfq.id
    and company_id = v_rfq.company_id
    and status = 'SELECTED'
    and id <> p_quotation_id;

  update public.supplier_quotations
  set status = 'SELECTED',
      selected_at = now(),
      selected_by_user_id = v_user_id,
      selection_reason = v_reason,
      updated_at = now()
  where id = p_quotation_id and company_id = v_rfq.company_id;

  update public.rfqs
  set selected_quotation_id = p_quotation_id,
      updated_by_user_id = v_user_id,
      updated_at = now()
  where id = v_rfq.id and company_id = v_rfq.company_id;

  return (select to_jsonb(q.*) from public.supplier_quotations q where q.id = p_quotation_id);
end;
$$;

create or replace function public.revert_supplier_quotation_selection(
  p_rfq_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_rfq record;
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if length(v_reason) < 3 then
    raise exception 'Deselection reason is required (at least 3 characters)' using errcode = '22023';
  end if;

  select r.* into v_rfq
  from public.rfqs r
  where r.id = p_rfq_id
  for update;
  if not found then
    raise exception 'RFQ not found' using errcode = 'P0002';
  end if;
  if not public.has_company_permission(v_rfq.company_id, 'procurement.manage') then
    raise exception 'Insufficient permissions to revert selection' using errcode = '42501';
  end if;
  if v_rfq.status <> 'ISSUED' then
    raise exception 'Quotation selection may only be reverted while the RFQ is ISSUED' using errcode = '42501';
  end if;
  if v_rfq.selected_quotation_id is null then
    raise exception 'RFQ has no selected quotation to revert' using errcode = '22023';
  end if;
  if exists (
    select 1
    from public.purchase_orders po
    where po.supplier_quotation_id = v_rfq.selected_quotation_id
      and po.company_id = v_rfq.company_id
      and po.status <> 'CANCELLED'
  ) then
    raise exception 'Selected quotation has a non-cancelled Purchase Order; delete/cancel that PO before reverting supplier selection' using errcode = '42501';
  end if;

  update public.supplier_quotations
  set status = 'SUBMITTED',
      deselected_at = now(),
      deselected_by_user_id = v_user_id,
      deselection_reason = v_reason,
      updated_at = now()
  where id = v_rfq.selected_quotation_id
    and rfq_id = v_rfq.id
    and company_id = v_rfq.company_id
    and status = 'SELECTED';

  if not found then
    raise exception 'RFQ selected quotation pointer is inconsistent' using errcode = '23514';
  end if;

  update public.rfqs
  set selected_quotation_id = null,
      updated_by_user_id = v_user_id,
      updated_at = now()
  where id = v_rfq.id and company_id = v_rfq.company_id;

  return (select to_jsonb(r.*) from public.rfqs r where r.id = v_rfq.id);
end;
$$;

create or replace function public.transition_rfq_status(
  p_rfq_id uuid,
  p_target_status text,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_rfq record;
  v_target_status text := upper(btrim(coalesce(p_target_status, '')));
  v_lines_count integer;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select r.* into v_rfq
  from public.rfqs r
  where r.id = p_rfq_id
  for update;
  if not found then
    raise exception 'RFQ not found' using errcode = 'P0002';
  end if;
  if not public.has_company_permission(v_rfq.company_id, 'procurement.manage') then
    raise exception 'Insufficient permissions to transition RFQ status' using errcode = '42501';
  end if;
  if v_rfq.status in ('CLOSED', 'CANCELLED') then
    raise exception 'Closed or cancelled RFQs cannot undergo further transitions' using errcode = '42501';
  end if;

  if v_target_status = 'ISSUED' then
    if v_rfq.status <> 'DRAFT' then
      raise exception 'Only draft RFQs may be issued' using errcode = '42501';
    end if;
    select count(*) into v_lines_count
    from public.rfq_lines l
    where l.rfq_id = p_rfq_id and l.company_id = v_rfq.company_id;
    if v_lines_count < 1 then
      raise exception 'Cannot issue an RFQ without line items' using errcode = '23514';
    end if;

    update public.rfqs
    set status = 'ISSUED',
        issued_by_user_id = v_user_id,
        issued_at = now(),
        issue_date = coalesce(issue_date, current_date),
        updated_by_user_id = v_user_id,
        updated_at = now()
    where id = p_rfq_id and company_id = v_rfq.company_id;

  elsif v_target_status = 'CLOSED' then
    if v_rfq.status <> 'ISSUED' then
      raise exception 'Only issued RFQs may be closed' using errcode = '42501';
    end if;

    update public.rfqs
    set status = 'CLOSED',
        closed_by_user_id = v_user_id,
        closed_at = now(),
        updated_by_user_id = v_user_id,
        updated_at = now()
    where id = p_rfq_id and company_id = v_rfq.company_id;

  elsif v_target_status = 'CANCELLED' then
    if length(btrim(coalesce(p_reason, ''))) < 3 then
      raise exception 'Cancellation reason is required (at least 3 characters)' using errcode = '22023';
    end if;
    if v_rfq.selected_quotation_id is not null then
      raise exception 'Revert the selected quotation before cancelling the RFQ' using errcode = '42501';
    end if;
    if exists (
      select 1 from public.purchase_orders po
      where po.rfq_id = v_rfq.id
        and po.company_id = v_rfq.company_id
        and po.status <> 'CANCELLED'
    ) then
      raise exception 'RFQ has a non-cancelled Purchase Order and cannot be cancelled' using errcode = '42501';
    end if;

    update public.rfqs
    set status = 'CANCELLED',
        cancellation_reason = btrim(p_reason),
        cancelled_by_user_id = v_user_id,
        cancelled_at = now(),
        updated_by_user_id = v_user_id,
        updated_at = now()
    where id = p_rfq_id and company_id = v_rfq.company_id;
  else
    raise exception 'Invalid target status for RFQ: %', v_target_status using errcode = '22023';
  end if;

  return (select to_jsonb(r.*) from public.rfqs r where r.id = p_rfq_id);
end;
$$;

revoke all on function public.select_supplier_quotation(uuid, text) from public, anon;
revoke all on function public.revert_supplier_quotation_selection(uuid, text) from public, anon;
revoke all on function public.transition_rfq_status(uuid, text, text) from public, anon;

grant execute on function public.select_supplier_quotation(uuid, text) to authenticated;
grant execute on function public.revert_supplier_quotation_selection(uuid, text) to authenticated;
grant execute on function public.transition_rfq_status(uuid, text, text) to authenticated;
