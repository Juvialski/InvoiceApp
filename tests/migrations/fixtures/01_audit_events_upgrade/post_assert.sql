-- Upgrade Test Assertion: Verify historical rows survived untouched and new CASH_* events are accepted.

do $$
declare
  v_company_id uuid := '11111111-1111-1111-1111-111111111111'::uuid;
  v_user_id uuid := '22222222-2222-2222-2222-222222222222'::uuid;
  v_historical_count bigint;
  v_distinct_events bigint;
  v_platform_records bigint;
  v_error_caught boolean := false;
begin
  -- 1. Verify all 15 historical rows are intact
  select count(*) into v_historical_count
  from public.company_audit_events
  where company_id = v_company_id;

  if v_historical_count <> 15 then
    raise exception 'Expected 15 historical audit rows after upgrade, found %', v_historical_count
      using errcode = 'P0001';
  end if;

  -- 2. Verify all 15 distinct event types are intact
  select count(distinct event_type) into v_distinct_events
  from public.company_audit_events
  where company_id = v_company_id;

  if v_distinct_events <> 15 then
    raise exception 'Expected 15 distinct historical audit event types, found %', v_distinct_events
      using errcode = 'P0001';
  end if;

  -- 3. Verify CASH_* events are now accepted
  insert into public.company_audit_events (company_id, actor_user_id, event_type, target_type, metadata)
  values
    (v_company_id, v_user_id, 'CASH_ACCOUNT_CREATED', 'financial', '{"display_name":"Operating Bank"}'::jsonb),
    (v_company_id, v_user_id, 'CASH_ACCOUNT_UPDATED', 'financial', '{"display_name":"Operating Bank Renamed"}'::jsonb),
    (v_company_id, v_user_id, 'CASH_ACCOUNT_DEACTIVATED', 'financial', '{"active":false}'::jsonb),
    (v_company_id, v_user_id, 'CASH_BALANCE_SNAPSHOT_RECORDED', 'financial', '{"ledger_balance":50000}'::jsonb),
    (v_company_id, v_user_id, 'CASH_STATEMENT_IMPORTED', 'financial', '{"imported_count":10}'::jsonb),
    (v_company_id, v_user_id, 'CASH_STATEMENT_REJECTED', 'financial', '{"rejected_count":1}'::jsonb),
    (v_company_id, v_user_id, 'CASH_TRANSACTION_CREATED', 'financial', '{"amount":2500}'::jsonb),
    (v_company_id, v_user_id, 'CASH_TRANSACTION_UPDATED', 'financial', '{"description":"Corrected fee"}'::jsonb),
    (v_company_id, v_user_id, 'CASH_RECONCILIATION_CONFIRMED', 'financial', '{"match_id":"33333333-3333-3333-3333-333333333333"}'::jsonb),
    (v_company_id, v_user_id, 'CASH_RECONCILIATION_REMOVED', 'financial', '{"match_id":"33333333-3333-3333-3333-333333333333"}'::jsonb),
    (v_company_id, v_user_id, 'CASH_TRANSFER_MATCHED', 'financial', '{"transfer_group_id":"44444444-4444-4444-4444-444444444444"}'::jsonb);

  -- 4. Verify total count is now 15 + 11 = 26
  select count(*) into v_historical_count
  from public.company_audit_events
  where company_id = v_company_id;

  if v_historical_count <> 26 then
    raise exception 'Expected 26 audit rows after adding cash events, found %', v_historical_count
      using errcode = 'P0001';
  end if;

  -- 5. Verify illegal event types are rejected
  begin
    insert into public.company_audit_events (company_id, actor_user_id, event_type, target_type, metadata)
    values (v_company_id, v_user_id, 'ILLEGAL_EVENT_TYPE_XYZ', 'test', '{}'::jsonb);
  exception
    when check_violation then
      v_error_caught := true;
  end;

  if not v_error_caught then
    raise exception 'Check constraint failed to reject illegal event type ILLEGAL_EVENT_TYPE_XYZ'
      using errcode = 'P0001';
  end if;

  -- The single-company closure clears inherited global operator state. The
  -- tables and explicit internal provisioning path remain available, but no
  -- platform admin or allowlist row survives a normal client deployment.
  select (select count(*) from public.platform_admins)
       + (select count(*) from public.platform_admin_allowlist)
    into v_platform_records;
  if v_platform_records <> 0 then
    raise exception 'Expected inherited platform operator state to be cleared, found % record(s)', v_platform_records
      using errcode = 'P0001';
  end if;

  -- The new reporting boundary must be present after the historical upgrade,
  -- while the fixture's pre-existing audit history remains unchanged.
  if not exists (
    select 1
    from pg_proc
    where oid = 'public.get_project_labor_cost_aggregate(uuid[])'::regprocedure
  ) then
    raise exception 'Expected project labor aggregate RPC after historical upgrade'
      using errcode = 'P0001';
  end if;

  raise notice 'UPGRADE_PATH_ASSERTIONS_PASSED: 15 historical rows preserved, 11 CASH_* events accepted, check constraint integrity verified.';
end $$;
