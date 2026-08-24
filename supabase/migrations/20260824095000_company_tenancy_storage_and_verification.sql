-- Company-scoped Storage policies, realtime publication coverage, and a
-- post-deployment integrity report. Existing legacy objects are read through
-- legacy_owner_user_id; no Storage object is moved or rewritten here.

alter table public.company_invitations
  add column if not exists updated_at timestamptz not null default now();

insert into storage.buckets (id, name, public)
values
  ('invoice-originals', 'invoice-originals', false),
  ('email-originals', 'email-originals', false),
  ('payroll-import-sources', 'payroll-import-sources', false)
on conflict (id) do update set public = false;

drop policy if exists "invoice originals read own" on storage.objects;
drop policy if exists "invoice originals insert own" on storage.objects;
drop policy if exists "invoice originals update own" on storage.objects;
drop policy if exists "invoice originals delete own" on storage.objects;
drop policy if exists "email originals read own" on storage.objects;
drop policy if exists "email originals insert own" on storage.objects;
drop policy if exists "email originals update own" on storage.objects;
drop policy if exists "email originals delete own" on storage.objects;
drop policy if exists "payroll import sources read own" on storage.objects;
drop policy if exists "payroll import sources insert own" on storage.objects;
drop policy if exists "payroll import sources update own" on storage.objects;
drop policy if exists "payroll import sources delete own" on storage.objects;

create policy "company invoice originals read" on storage.objects
for select to authenticated
using (
  bucket_id = 'invoice-originals'
  and (
    (private.storage_company_id(name) is not null and (select public.has_company_permission(private.storage_company_id(name), 'invoices.read')))
    or (private.legacy_storage_company_id(name) is not null and (select public.has_company_permission(private.legacy_storage_company_id(name), 'invoices.read')))
  )
);

create policy "company invoice originals insert" on storage.objects
for insert to authenticated
with check (
  bucket_id = 'invoice-originals'
  and private.storage_company_id(name) is not null
  and (select public.has_company_permission(private.storage_company_id(name), 'invoices.manage'))
);

create policy "company invoice originals update" on storage.objects
for update to authenticated
using (
  bucket_id = 'invoice-originals'
  and private.storage_company_id(name) is not null
  and (select public.has_company_permission(private.storage_company_id(name), 'invoices.manage'))
)
with check (
  bucket_id = 'invoice-originals'
  and private.storage_company_id(name) is not null
  and (select public.has_company_permission(private.storage_company_id(name), 'invoices.manage'))
);

create policy "company email originals read" on storage.objects
for select to authenticated
using (
  bucket_id = 'email-originals'
  and (
    (private.storage_company_id(name) is not null and (select public.has_company_permission(private.storage_company_id(name), 'gmail.read')))
    or (private.legacy_storage_company_id(name) is not null and (select public.has_company_permission(private.legacy_storage_company_id(name), 'gmail.read')))
  )
);

create policy "company email originals insert" on storage.objects
for insert to authenticated
with check (
  bucket_id = 'email-originals'
  and private.storage_company_id(name) is not null
  and (select public.has_company_permission(private.storage_company_id(name), 'gmail.manage'))
);

create policy "company email originals update" on storage.objects
for update to authenticated
using (
  bucket_id = 'email-originals'
  and private.storage_company_id(name) is not null
  and (select public.has_company_permission(private.storage_company_id(name), 'gmail.manage'))
)
with check (
  bucket_id = 'email-originals'
  and private.storage_company_id(name) is not null
  and (select public.has_company_permission(private.storage_company_id(name), 'gmail.manage'))
);

create policy "company payroll import sources read" on storage.objects
for select to authenticated
using (
  bucket_id = 'payroll-import-sources'
  and (
    (private.storage_company_id(name) is not null and (select public.has_company_permission(private.storage_company_id(name), 'payroll.import')))
    or (private.legacy_storage_company_id(name) is not null and (select public.has_company_permission(private.legacy_storage_company_id(name), 'payroll.import')))
  )
);

create policy "company payroll import sources insert" on storage.objects
for insert to authenticated
with check (
  bucket_id = 'payroll-import-sources'
  and private.storage_company_id(name) is not null
  and (select public.has_company_permission(private.storage_company_id(name), 'payroll.import'))
);

create policy "company payroll import sources update" on storage.objects
for update to authenticated
using (
  bucket_id = 'payroll-import-sources'
  and private.storage_company_id(name) is not null
  and (select public.has_company_permission(private.storage_company_id(name), 'payroll.import'))
)
with check (
  bucket_id = 'payroll-import-sources'
  and private.storage_company_id(name) is not null
  and (select public.has_company_permission(private.storage_company_id(name), 'payroll.import'))
);

create policy "company payroll import sources delete" on storage.objects
for delete to authenticated
using (
  bucket_id = 'payroll-import-sources'
  and private.storage_company_id(name) is not null
  and (select public.has_company_permission(private.storage_company_id(name), 'payroll.import'))
);

revoke all on table storage.objects from anon, authenticated;
grant select, insert, update, delete on table storage.objects to authenticated;

-- Keep company context available to the existing Realtime publication. RLS is
-- still the authority; consumers must filter by company_id and unsubscribe on
-- company switch.
do $$
declare
  table_name text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime' and not puballtables) then
    foreach table_name in array array[
      'companies', 'company_members', 'company_invitations', 'company_audit_events',
      'gmail_connections', 'gmail_sync_state', 'email_messages', 'source_documents', 'vendors', 'invoices', 'invoice_line_items', 'invoice_extractions', 'invoice_review_events',
      'projects', 'invoice_project_allocations', 'expenses', 'workers', 'project_worker_assignments', 'departments',
      'worker_compensation_profiles', 'recurring_payroll_components', 'payroll_schedules', 'payroll_schedule_versions', 'payroll_periods', 'work_entries', 'payroll_runs', 'payroll_entries', 'payroll_project_allocations', 'payroll_adjustments', 'project_accounting_events',
      'labor_cost_centers', 'payroll_import_batches', 'payroll_import_rows', 'payroll_import_templates'
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

create or replace function public.verify_company_tenancy()
returns table(
  check_name text,
  passed boolean,
  expected numeric,
  actual numeric,
  details text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_actual numeric;
  v_expected numeric;
begin
  if not (select private.is_platform_admin()) then
    raise exception 'Platform administrator access is required' using errcode = '42501';
  end if;

  for r in select table_name from private.company_tenant_policy_catalog loop
    execute format('select count(*)::numeric from public.%I where company_id is null', r.table_name) into v_actual;
    check_name := 'company_id_not_null:' || r.table_name;
    passed := v_actual = 0;
    expected := 0;
    actual := v_actual;
    details := 'All persisted tenant rows must have a company_id';
    return next;
  end loop;

  select count(*)::numeric into v_actual
  from public.company_members cm
  left join public.companies c on c.id = cm.company_id
  where c.id is null;
  check_name := 'company_members_company_reference'; passed := v_actual = 0; expected := 0; actual := v_actual; details := 'Membership company references are valid'; return next;

  for r in
    select * from (values
      ('cross.invoice_source_document', (select count(*)::numeric from public.invoices i join public.source_documents d on d.id = i.source_document_id where i.source_document_id is not null and i.company_id is distinct from d.company_id)),
      ('cross.invoice_source_email', (select count(*)::numeric from public.invoices i join public.email_messages e on e.id = i.source_email_id where i.source_email_id is not null and i.company_id is distinct from e.company_id)),
      ('cross.invoice_vendor', (select count(*)::numeric from public.invoices i join public.vendors v on v.id = i.vendor_id where i.vendor_id is not null and i.company_id is distinct from v.company_id)),
      ('cross.invoice_child', (select count(*)::numeric from (select l.company_id, i.company_id from public.invoice_line_items l join public.invoices i on i.id = l.invoice_id where l.company_id is distinct from i.company_id union all select e.company_id, i.company_id from public.invoice_extractions e join public.invoices i on i.id = e.invoice_id where e.company_id is distinct from i.company_id union all select re.company_id, i.company_id from public.invoice_review_events re join public.invoices i on i.id = re.invoice_id where re.company_id is distinct from i.company_id) mismatches)),
      ('cross.invoice_project_allocation', (select count(*)::numeric from public.invoice_project_allocations a join public.invoices i on i.id = a.invoice_id join public.projects p on p.id = a.project_id where a.company_id is distinct from i.company_id or a.company_id is distinct from p.company_id)),
      ('cross.expense_project_receipt', (select count(*)::numeric from public.expenses e left join public.projects p on p.id = e.project_id left join public.source_documents d on d.id = e.receipt_source_document_id where (e.project_id is not null and e.company_id is distinct from p.company_id) or (e.receipt_source_document_id is not null and e.company_id is distinct from d.company_id))),
      ('cross.worker_assignment', (select count(*)::numeric from public.project_worker_assignments a join public.workers w on w.id = a.worker_id join public.projects p on p.id = a.project_id where a.company_id is distinct from w.company_id or a.company_id is distinct from p.company_id)),
      ('cross.work_entry', (select count(*)::numeric from public.work_entries e join public.workers w on w.id = e.worker_id join public.projects p on p.id = e.project_id left join public.payroll_periods pp on pp.id = e.period_id where e.company_id is distinct from w.company_id or e.company_id is distinct from p.company_id or (e.period_id is not null and e.company_id is distinct from pp.company_id))),
      ('cross.schedule_version', (select count(*)::numeric from public.payroll_schedule_versions v join public.payroll_schedules s on s.id = v.schedule_id where v.company_id is distinct from s.company_id)),
      ('cross.payroll_period', (select count(*)::numeric from public.payroll_periods p left join public.payroll_schedules s on s.id = p.schedule_id left join public.payroll_schedule_versions v on v.id = p.schedule_version_id where (p.schedule_id is not null and p.company_id is distinct from s.company_id) or (p.schedule_version_id is not null and p.company_id is distinct from v.company_id) or (p.schedule_id is not null and p.schedule_version_id is not null and v.schedule_id is distinct from p.schedule_id))),
      ('cross.payroll_run', (select count(*)::numeric from public.payroll_runs r join public.payroll_periods p on p.id = r.period_id left join public.payroll_import_batches b on b.id = r.import_batch_id where r.company_id is distinct from p.company_id or (r.import_batch_id is not null and r.company_id is distinct from b.company_id))),
      ('cross.payroll_entry', (select count(*)::numeric from public.payroll_entries e join public.payroll_runs r on r.id = e.payroll_run_id join public.workers w on w.id = e.worker_id left join public.payroll_import_rows ir on ir.id = e.import_row_id where e.company_id is distinct from r.company_id or e.company_id is distinct from w.company_id or (e.import_row_id is not null and e.company_id is distinct from ir.company_id))),
      ('cross.payroll_project_allocation', (select count(*)::numeric from public.payroll_project_allocations a join public.payroll_entries e on e.id = a.payroll_entry_id join public.projects p on p.id = a.project_id where a.company_id is distinct from e.company_id or a.company_id is distinct from p.company_id)),
      ('cross.payroll_adjustment', (select count(*)::numeric from public.payroll_adjustments a join public.payroll_entries e on e.id = a.payroll_entry_id where a.company_id is distinct from e.company_id)),
      ('cross.department_worker', (select count(*)::numeric from public.departments d join public.workers w on w.id = d.manager_worker_id where d.manager_worker_id is not null and d.company_id is distinct from w.company_id)),
      ('cross.worker_metadata', (select count(*)::numeric from public.workers w left join public.departments d on d.id = w.department_id left join public.workers manager on manager.id = w.manager_worker_id where (w.department_id is not null and w.company_id is distinct from d.company_id) or (w.manager_worker_id is not null and w.company_id is distinct from manager.company_id))),
      ('cross.worker_compensation', (select count(*)::numeric from public.worker_compensation_profiles cp join public.workers w on w.id = cp.worker_id left join public.projects p on p.id = cp.default_project_id where cp.company_id is distinct from w.company_id or (cp.default_project_id is not null and cp.company_id is distinct from p.company_id))),
      ('cross.recurring_component', (select count(*)::numeric from public.recurring_payroll_components rc join public.workers w on w.id = rc.worker_id where rc.company_id is distinct from w.company_id)),
      ('cross.import_batch', (select count(*)::numeric from public.payroll_import_batches b left join public.payroll_import_templates t on t.id = b.detected_template_id left join public.payroll_periods p on p.id = b.committed_payroll_period_id left join public.payroll_runs r on r.id = b.committed_payroll_run_id where (b.detected_template_id is not null and b.company_id is distinct from t.company_id) or (b.committed_payroll_period_id is not null and b.company_id is distinct from p.company_id) or (b.committed_payroll_run_id is not null and b.company_id is distinct from r.company_id))),
      ('cross.import_row', (select count(*)::numeric from public.payroll_import_rows ir join public.payroll_import_batches b on b.id = ir.batch_id left join public.workers w on w.id = ir.worker_id left join public.projects p on p.id = ir.project_id left join public.labor_cost_centers c on c.id = ir.cost_center_id left join public.work_entries we on we.id = ir.committed_work_entry_id left join public.payroll_entries pe on pe.id = ir.committed_payroll_entry_id where ir.company_id is distinct from b.company_id or (ir.worker_id is not null and ir.company_id is distinct from w.company_id) or (ir.project_id is not null and ir.company_id is distinct from p.company_id) or (ir.cost_center_id is not null and ir.company_id is distinct from c.company_id) or (ir.committed_work_entry_id is not null and ir.company_id is distinct from we.company_id) or (ir.committed_payroll_entry_id is not null and ir.company_id is distinct from pe.company_id))),
      ('cross.project_accounting_event', (select count(*)::numeric from public.project_accounting_events e join public.projects p on p.id = e.project_id where e.project_id is not null and e.company_id is distinct from p.company_id)),
      ('source_documents_storage_path', (select count(*)::numeric from public.source_documents where nullif(btrim(storage_path), '') is null))
    ) as checks(check_name, actual)
  loop
    check_name := r.check_name;
    passed := r.actual = 0;
    expected := 0;
    actual := r.actual;
    details := 'Cross-company references and original-file references must remain valid';
    return next;
  end loop;

  for r in
    select * from (values
      ('invoices.count', (select count(*)::numeric from public.invoices)),
      ('invoices.grand_total', (select coalesce(sum(grand_total), 0)::numeric from public.invoices)),
      ('expenses.count', (select count(*)::numeric from public.expenses)),
      ('expenses.amount', (select coalesce(sum(amount), 0)::numeric from public.expenses)),
      ('projects.count', (select count(*)::numeric from public.projects)),
      ('projects.project_budget', (select coalesce(sum(project_budget), 0)::numeric from public.projects)),
      ('invoice_extractions.count', (select count(*)::numeric from public.invoice_extractions)),
      ('invoice_review_events.count', (select count(*)::numeric from public.invoice_review_events)),
      ('source_documents.count', (select count(*)::numeric from public.source_documents)),
      ('payroll_runs.finalized_count', (select count(*)::numeric from public.payroll_runs where status in ('APPROVED', 'PAID'))),
      ('payroll_entries.finalized_count', (select count(*)::numeric from public.payroll_entries pe join public.payroll_runs pr on pr.id = pe.payroll_run_id where pr.status in ('APPROVED', 'PAID'))),
      ('payroll_entries.finalized_gross_pay', (select coalesce(sum(pe.gross_pay), 0)::numeric from public.payroll_entries pe join public.payroll_runs pr on pr.id = pe.payroll_run_id where pr.status in ('APPROVED', 'PAID'))),
      ('payroll_entries.finalized_net_pay', (select coalesce(sum(pe.net_pay), 0)::numeric from public.payroll_entries pe join public.payroll_runs pr on pr.id = pe.payroll_run_id where pr.status in ('APPROVED', 'PAID'))),
      ('payroll_project_allocations.finalized_amount', (select coalesce(sum(ppa.allocation_amount), 0)::numeric from public.payroll_project_allocations ppa join public.payroll_entries pe on pe.id = ppa.payroll_entry_id join public.payroll_runs pr on pr.id = pe.payroll_run_id where pr.status in ('APPROVED', 'PAID'))),
      ('payroll_import_rows.count', (select count(*)::numeric from public.payroll_import_rows))
    ) as checks(metric_key, actual)
  loop
    select b.metric_value into v_expected from private.company_tenancy_baseline b where b.metric_key = r.metric_key;
    check_name := 'baseline:' || r.metric_key;
    passed := v_expected is not null and r.actual = v_expected;
    expected := coalesce(v_expected, 0);
    actual := r.actual;
    details := 'Ownership migration must preserve the baseline metric';
    return next;
  end loop;
end;
$$;

revoke execute on function public.verify_company_tenancy() from public, anon;
grant execute on function public.verify_company_tenancy() to authenticated;
