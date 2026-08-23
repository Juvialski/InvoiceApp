-- Replace an invoice's project allocations as one authenticated transaction.
--
-- This function deliberately does not inspect or mutate invoice review status.
-- Project allocation is an independent cost-assignment concern; verification
-- remains on invoice_review_events and invoices.current_data.
create or replace function public.replace_invoice_project_allocations(
  p_invoice_id uuid,
  p_allocations jsonb default '[]'::jsonb
)
returns setof public.invoice_project_allocations
language plpgsql
set search_path = public
as $function$
declare
  v_user_id uuid;
  v_invoice_total numeric;
  v_payload jsonb := coalesce(p_allocations, '[]'::jsonb);
  v_row jsonb;
  v_item jsonb;
  v_project_id uuid;
  v_allocation_id uuid;
  v_allocation_type text;
  v_allocation_percentage numeric;
  v_allocation_amount numeric;
  v_total numeric := 0;
  v_percentage_total numeric := 0;
  v_seen_project_ids uuid[] := array[]::uuid[];
  v_new_allocations jsonb := '[]'::jsonb;
  v_previous_allocations jsonb;
  v_archived_at timestamptz;
  v_project_status text;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Authentication is required to replace invoice project allocations'
      using errcode = '42501';
  end if;

  if p_invoice_id is null then
    raise exception 'Invoice id is required'
      using errcode = '22023';
  end if;

  if jsonb_typeof(v_payload) <> 'array' then
    raise exception 'Invoice project allocations must be a JSON array'
      using errcode = '22023';
  end if;

  -- Lock only the invoice row to serialize concurrent replacement requests.
  -- No invoice verification field is read or changed by this function.
  select i.grand_total
    into v_invoice_total
    from public.invoices i
   where i.id = p_invoice_id
     and i.user_id = v_user_id
   for update;

  if not found then
    raise exception 'Invoice does not exist in the current workspace'
      using errcode = '42501';
  end if;

  for v_row in
    select value
      from jsonb_array_elements(v_payload)
  loop
    if jsonb_typeof(v_row) <> 'object' then
      raise exception 'Each invoice project allocation must be an object'
        using errcode = '22023';
    end if;

    if exists (
      select 1
        from jsonb_object_keys(v_row) as field_name
       where field_name not in ('id', 'project_id', 'allocation_type', 'allocation_percentage', 'allocation_amount', 'notes')
    ) then
      raise exception 'Invoice project allocation contains an unsupported field'
        using errcode = '22023';
    end if;

    if not (v_row ? 'project_id') or jsonb_typeof(v_row->'project_id') <> 'string' or nullif(btrim(v_row->>'project_id'), '') is null then
      raise exception 'Every invoice project allocation requires a project id'
        using errcode = '22023';
    end if;

    begin
      v_project_id := (v_row->>'project_id')::uuid;
    exception when invalid_text_representation then
      raise exception 'Invoice project allocation project id must be a UUID'
        using errcode = '22P02';
    end;

    if v_project_id = any(v_seen_project_ids) then
      raise exception 'A project may appear only once in an invoice allocation replacement'
        using errcode = '23505';
    end if;
    v_seen_project_ids := array_append(v_seen_project_ids, v_project_id);

    select p.archived_at, p.status
      into v_archived_at, v_project_status
      from public.projects p
     where p.id = v_project_id
       and p.user_id = v_user_id;

    if not found then
      raise exception 'Project does not exist in the current workspace'
        using errcode = '42501';
    end if;
    if v_archived_at is not null or v_project_status = 'ARCHIVED' then
      raise exception 'Archived projects cannot receive invoice allocations'
        using errcode = '42501';
    end if;

    if not (v_row ? 'allocation_type') or jsonb_typeof(v_row->'allocation_type') <> 'string' then
      raise exception 'Every invoice project allocation requires an allocation type'
        using errcode = '22023';
    end if;
    v_allocation_type := v_row->>'allocation_type';
    if v_allocation_type not in ('AMOUNT', 'PERCENTAGE') then
      raise exception 'Invoice project allocation type must be AMOUNT or PERCENTAGE'
        using errcode = '22023';
    end if;

    v_allocation_id := null;
    if v_row ? 'id' and jsonb_typeof(v_row->'id') not in ('null', 'string') then
      raise exception 'Invoice project allocation id must be a UUID string'
        using errcode = '22023';
    end if;
    if nullif(btrim(v_row->>'id'), '') is not null then
      begin
        v_allocation_id := (v_row->>'id')::uuid;
      exception when invalid_text_representation then
        raise exception 'Invoice project allocation id must be a UUID'
          using errcode = '22P02';
      end;
    end if;

    v_allocation_percentage := null;
    v_allocation_amount := null;
    if v_allocation_type = 'PERCENTAGE' then
      if not (v_row ? 'allocation_percentage') or jsonb_typeof(v_row->'allocation_percentage') <> 'number' then
        raise exception 'Percentage allocations require a numeric allocation_percentage'
          using errcode = '22023';
      end if;
      if v_row ? 'allocation_amount' and jsonb_typeof(v_row->'allocation_amount') <> 'null' then
        raise exception 'Percentage allocations must not provide allocation_amount'
          using errcode = '22023';
      end if;
      v_allocation_percentage := (v_row->>'allocation_percentage')::numeric;
      if v_allocation_percentage < 0 or v_allocation_percentage > 100 or v_allocation_percentage <> round(v_allocation_percentage, 4) then
        raise exception 'Allocation percentage must be between 0 and 100 with at most four decimal places'
          using errcode = '22023';
      end if;
      v_percentage_total := v_percentage_total + v_allocation_percentage;
      if v_percentage_total > 100 then
        raise exception 'Invoice project allocation percentages cannot exceed 100%% in total'
          using errcode = '22003';
      end if;
      v_allocation_amount := round(v_invoice_total * v_allocation_percentage / 100, 2);
    else
      if not (v_row ? 'allocation_amount') or jsonb_typeof(v_row->'allocation_amount') <> 'number' then
        raise exception 'Amount allocations require a numeric allocation_amount'
          using errcode = '22023';
      end if;
      if v_row ? 'allocation_percentage' and jsonb_typeof(v_row->'allocation_percentage') <> 'null' then
        raise exception 'Amount allocations must not provide allocation_percentage'
          using errcode = '22023';
      end if;
      v_allocation_amount := (v_row->>'allocation_amount')::numeric;
      if v_allocation_amount < 0 or v_allocation_amount <> round(v_allocation_amount, 2) then
        raise exception 'Allocation amount must be non-negative with at most two decimal places'
          using errcode = '22023';
      end if;
    end if;

    if v_allocation_amount > 9999999999999999.99 then
      raise exception 'Allocation amount exceeds the supported precision'
        using errcode = '22003';
    end if;
    v_total := round(v_total + v_allocation_amount, 2);
    v_new_allocations := v_new_allocations || jsonb_build_array(jsonb_build_object(
      'id', v_allocation_id,
      'project_id', v_project_id,
      'allocation_type', v_allocation_type,
      'allocation_percentage', v_allocation_percentage,
      'allocation_amount', v_allocation_amount,
      'notes', case when v_row ? 'notes' and jsonb_typeof(v_row->'notes') <> 'null' then v_row->>'notes' else null end
    ));
  end loop;

  if v_total > v_invoice_total + 0.01 then
    raise exception 'Invoice project allocation exceeds invoice total by %', round(v_total - v_invoice_total, 2)
      using errcode = '22003';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', a.id,
    'project_id', a.project_id,
    'allocation_type', a.allocation_type,
    'allocation_percentage', a.allocation_percentage,
    'allocation_amount', a.allocation_amount,
    'notes', a.notes
  ) order by a.project_id), '[]'::jsonb)
    into v_previous_allocations
    from public.invoice_project_allocations a
   where a.invoice_id = p_invoice_id
     and a.user_id = v_user_id;

  -- Remove only projects omitted from the replacement. Existing rows that
  -- remain are updated in place, avoiding a client-side delete/insert window.
  delete from public.invoice_project_allocations a
   where a.invoice_id = p_invoice_id
     and a.user_id = v_user_id
     and not exists (
       select 1
         from jsonb_array_elements(v_new_allocations) as item
        where (item->>'project_id')::uuid = a.project_id
     );

  for v_item in
    select value
      from jsonb_array_elements(v_new_allocations)
  loop
    insert into public.invoice_project_allocations (
      id,
      user_id,
      invoice_id,
      project_id,
      allocation_type,
      allocation_percentage,
      allocation_amount,
      currency,
      notes
    ) values (
      coalesce(nullif(v_item->>'id', '')::uuid, gen_random_uuid()),
      v_user_id,
      p_invoice_id,
      (v_item->>'project_id')::uuid,
      v_item->>'allocation_type',
      nullif(v_item->>'allocation_percentage', '')::numeric,
      nullif(v_item->>'allocation_amount', '')::numeric,
      null,
      nullif(v_item->>'notes', '')
    )
    on conflict (invoice_id, project_id) do update set
      allocation_type = excluded.allocation_type,
      allocation_percentage = excluded.allocation_percentage,
      allocation_amount = excluded.allocation_amount,
      currency = excluded.currency,
      notes = excluded.notes,
      updated_at = now();
  end loop;

  insert into public.project_accounting_events (
    user_id,
    project_id,
    entity_type,
    entity_id,
    event_type,
    description,
    metadata
  ) values (
    v_user_id,
    null,
    'INVOICE',
    p_invoice_id,
    'PROJECT_ALLOCATIONS_REPLACED',
    'Invoice project allocations replaced',
    jsonb_build_object(
      'invoice_id', p_invoice_id,
      'invoice_total', v_invoice_total,
      'previous_allocations', v_previous_allocations,
      'new_allocations', v_new_allocations,
      'allocated_total', v_total,
      'remaining_amount', round(v_invoice_total - v_total, 2)
    )
  );

  return query
    select a.*
      from public.invoice_project_allocations a
     where a.invoice_id = p_invoice_id
       and a.user_id = v_user_id
     order by a.project_id, a.id;
end;
$function$;

revoke execute on function public.replace_invoice_project_allocations(uuid, jsonb) from public, anon;
grant execute on function public.replace_invoice_project_allocations(uuid, jsonb) to authenticated;
