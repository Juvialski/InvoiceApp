-- Historical engineering rows remain valid after the full upgrade chain.
do $$
declare
  v_company_id uuid := 'd2c10000-0000-4000-8000-000000000001'::uuid;
  v_document_id uuid := 'd2c40000-0000-4000-8000-000000000001'::uuid;
  v_site_log_id uuid := 'd2c50000-0000-4000-8000-000000000001'::uuid;
  v_superseded_at timestamptz;
  v_lifecycle_reason text;
  v_work_summary text;
begin
  select superseded_at, lifecycle_reason into v_superseded_at, v_lifecycle_reason
  from public.engineering_documents
  where id = v_document_id and company_id = v_company_id;
  if v_superseded_at is null or v_lifecycle_reason is null then
    raise exception 'Historical SUPERSEDED document did not receive additive lifecycle metadata' using errcode = 'P0001';
  end if;

  select work_summary into v_work_summary
  from public.engineering_daily_site_logs
  where id = v_site_log_id and company_id = v_company_id and status = 'FINALIZED';
  if v_work_summary <> 'Historical finalized field observation' then
    raise exception 'Historical FINALIZED Site Log content changed during Wave 2C upgrade' using errcode = 'P0001';
  end if;

  if (select count(*) from public.engineering_daily_site_log_events where site_log_id = v_site_log_id) <> 3 then
    raise exception 'Historical Site Log lifecycle events were not preserved during Wave 2C upgrade' using errcode = 'P0001';
  end if;
  if to_regclass('public.engineering_daily_site_log_addenda') is null then
    raise exception 'Wave 2C addendum table is missing after historical upgrade' using errcode = 'P0001';
  end if;
  if not exists (select 1 from pg_proc where oid = 'public.apply_engineering_daily_site_log_lifecycle(uuid,text,text)'::regprocedure) then
    raise exception 'Wave 2C Site Log lifecycle RPC is missing after historical upgrade' using errcode = 'P0001';
  end if;
end $$;
