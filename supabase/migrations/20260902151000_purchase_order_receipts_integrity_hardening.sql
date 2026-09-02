-- P2A-2 review hardening: restore the canonical project lifecycle preflight
-- and make purchase-order receipt writes RPC-only and history-safe.

-- The initial P2A-2 migration copied an outdated project preflight shape.
-- Restore the established security/function semantics and add procurement as
-- one more dependency without weakening any earlier project history checks.
create or replace function private.project_lifecycle_preflight(
  p_project_id uuid,
  p_company_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_project public.projects;
  v_invoice_allocations bigint;
  v_expenses bigint;
  v_assignments bigint;
  v_work_entries bigint;
  v_overtime_requests bigint;
  v_payroll_allocations bigint;
  v_payroll_entry_contexts bigint;
  v_import_rows bigint;
  v_worker_defaults bigint;
  v_compensation_defaults bigint;
  v_engineering_documents bigint;
  v_engineering_rfis bigint;
  v_engineering_submittals bigint;
  v_daily_site_logs bigint;
  v_accounting_events bigint;
  v_purchase_orders bigint;
  v_total bigint;
  v_can_delete boolean;
  v_can_reactivate boolean;
begin
  select p.*
    into v_project
  from public.projects p
  where p.id = p_project_id
    and p.company_id = p_company_id;

  if not found then
    raise exception 'Project does not exist in the deployment company'
      using errcode = '42501';
  end if;

  select count(*) into v_invoice_allocations
  from public.invoice_project_allocations a
  where a.company_id = p_company_id and a.project_id = p_project_id;

  select count(*) into v_expenses
  from public.expenses e
  where e.company_id = p_company_id and e.project_id = p_project_id;

  select count(*) into v_assignments
  from public.project_worker_assignments a
  where a.company_id = p_company_id and a.project_id = p_project_id;

  select count(*) into v_work_entries
  from public.work_entries e
  where e.company_id = p_company_id and e.project_id = p_project_id;

  select count(*) into v_overtime_requests
  from public.overtime_requests o
  where o.company_id = p_company_id and o.project_id = p_project_id;

  select count(*) into v_payroll_allocations
  from public.payroll_project_allocations a
  where a.company_id = p_company_id and a.project_id = p_project_id;

  -- Project labor context is a historical snapshot rather than a foreign key.
  -- Preserve both camelCase and snake_case forms used by historical payroll.
  select count(*) into v_payroll_entry_contexts
  from public.payroll_entries e
  where e.company_id = p_company_id
    and (
      e.cost_context ->> 'projectId' = p_project_id::text
      or e.cost_context ->> 'project_id' = p_project_id::text
      or e.calculation_snapshot #>> '{costContext,projectId}' = p_project_id::text
      or e.calculation_snapshot #>> '{costContext,project_id}' = p_project_id::text
      or e.calculation_snapshot::text like '%' || p_project_id::text || '%'
    );

  select count(*) into v_import_rows
  from public.payroll_import_rows r
  where r.company_id = p_company_id and r.project_id = p_project_id;

  select count(*) into v_worker_defaults
  from public.workers w
  where w.company_id = p_company_id and w.default_project_id = p_project_id;

  select count(*) into v_compensation_defaults
  from public.worker_compensation_profiles cp
  where cp.company_id = p_company_id and cp.default_project_id = p_project_id;

  select count(*) into v_engineering_documents
  from public.engineering_documents d
  where d.company_id = p_company_id and d.project_id = p_project_id;

  select count(*) into v_engineering_rfis
  from public.engineering_rfis r
  where r.company_id = p_company_id and r.project_id = p_project_id;

  select count(*) into v_engineering_submittals
  from public.engineering_submittals s
  where s.company_id = p_company_id and s.project_id = p_project_id;

  select count(*) into v_daily_site_logs
  from public.engineering_daily_site_logs l
  where l.company_id = p_company_id and l.project_id = p_project_id;

  select count(*) into v_accounting_events
  from public.project_accounting_events e
  where e.company_id = p_company_id and e.project_id = p_project_id;

  select count(*) into v_purchase_orders
  from public.purchase_orders po
  where po.company_id = p_company_id and po.project_id = p_project_id;

  v_total := v_invoice_allocations + v_expenses + v_assignments + v_work_entries
    + v_overtime_requests + v_payroll_allocations + v_payroll_entry_contexts
    + v_import_rows + v_worker_defaults + v_compensation_defaults
    + v_engineering_documents + v_engineering_rfis + v_engineering_submittals
    + v_daily_site_logs + v_accounting_events + v_purchase_orders;
  v_can_delete := v_total = 0;
  v_can_reactivate := coalesce(
    v_project.status = 'ARCHIVED'
      and v_project.archived_at is not null
      and v_project.archived_from_status in ('PLANNING', 'ACTIVE', 'ON_HOLD'),
    false
  );

  return jsonb_build_object(
    'projectId', p_project_id,
    'projectCode', v_project.project_code,
    'projectName', v_project.project_name,
    'status', v_project.status,
    'archivedAt', v_project.archived_at,
    'archivedFromStatus', v_project.archived_from_status,
    'canDelete', v_can_delete,
    'canReactivate', v_can_reactivate,
    'recommendedAction', case
      when v_can_delete then 'DELETE_UNUSED'
      when v_can_reactivate then 'REACTIVATE'
      else 'ARCHIVE'
    end,
    'blockedReason', case
      when v_can_delete then null
      when v_project.status = 'ARCHIVED' and not v_can_reactivate then 'This project is archived and its prior state is unavailable or terminal; keep it archived.'
      else 'This project has operational or financial history and cannot be permanently deleted. Archive it instead.'
    end,
    'totalDependencyCount', v_total,
    'dependencies', jsonb_build_object(
      'invoiceProjectAllocations', v_invoice_allocations,
      'expenses', v_expenses,
      'projectWorkerAssignments', v_assignments,
      'workEntries', v_work_entries,
      'overtimeRequests', v_overtime_requests,
      'payrollProjectAllocations', v_payroll_allocations,
      'payrollEntryProjectContexts', v_payroll_entry_contexts,
      'payrollImportRows', v_import_rows,
      'workerDefaultProjects', v_worker_defaults,
      'compensationProfileDefaultProjects', v_compensation_defaults,
      'engineeringDocuments', v_engineering_documents,
      'engineeringRfis', v_engineering_rfis,
      'engineeringSubmittals', v_engineering_submittals,
      'engineeringDailySiteLogs', v_daily_site_logs,
      'projectAccountingEvents', v_accounting_events,
      'purchaseOrders', v_purchase_orders
    )
  );
end;
$$;

revoke execute on function private.project_lifecycle_preflight(uuid, uuid) from public, anon, authenticated;

-- Receipt history is written only through the guarded RPCs. Keep SELECT under
-- RLS, but do not expose raw insert/update/delete grants or policies to clients.
update private.company_tenant_policy_catalog
set allow_insert = false,
    allow_update = false,
    allow_delete = false
where table_name in ('purchase_order_receipts', 'purchase_order_receipt_lines');

drop policy if exists purchase_order_receipts_company_insert on public.purchase_order_receipts;
drop policy if exists purchase_order_receipts_company_update on public.purchase_order_receipts;
drop policy if exists purchase_order_receipts_company_delete on public.purchase_order_receipts;
drop policy if exists purchase_order_receipt_lines_company_insert on public.purchase_order_receipt_lines;
drop policy if exists purchase_order_receipt_lines_company_update on public.purchase_order_receipt_lines;
drop policy if exists purchase_order_receipt_lines_company_delete on public.purchase_order_receipt_lines;

revoke insert, update, delete on table public.purchase_order_receipts from public, anon, authenticated;
revoke insert, update, delete on table public.purchase_order_receipt_lines from public, anon, authenticated;
grant select on table public.purchase_order_receipts to authenticated;
grant select on table public.purchase_order_receipt_lines to authenticated;

-- The RPCs already perform auth, company, permission, lifecycle, and quantity
-- validation. SECURITY DEFINER lets those guarded functions write while raw
-- authenticated table mutations remain unavailable.
alter function public.record_purchase_order_receipt(jsonb, jsonb) security definer;
alter function public.void_purchase_order_receipt(uuid, text) security definer;

-- Do not allow a receipt header to be silently edited after it is recorded.
-- The only valid header mutation is the audited RECEIVED -> VOIDED transition;
-- the original scope guard validates its reason and canonical actor/timestamp.
create or replace function private.prevent_purchase_order_receipt_history_rewrite()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status = 'RECEIVED' and new.status = 'VOIDED' then
    if new.id is distinct from old.id
       or new.company_id is distinct from old.company_id
       or new.purchase_order_id is distinct from old.purchase_order_id
       or new.receipt_number is distinct from old.receipt_number
       or new.receipt_date is distinct from old.receipt_date
       or new.supplier_delivery_reference is distinct from old.supplier_delivery_reference
       or new.notes is distinct from old.notes
       or new.created_by_user_id is distinct from old.created_by_user_id
       or new.created_at is distinct from old.created_at then
      raise exception 'Recorded purchase order receipt history is immutable; void the original receipt without rewriting its terms.'
        using errcode = '42501';
    end if;
    return new;
  end if;

  raise exception 'Recorded purchase order receipts are immutable; use the guarded void operation for corrections.'
    using errcode = '42501';
end;
$$;

revoke execute on function private.prevent_purchase_order_receipt_history_rewrite() from public, anon, authenticated;

drop trigger if exists purchase_order_receipts_history_guard on public.purchase_order_receipts;
create trigger purchase_order_receipts_history_guard
  before update on public.purchase_order_receipts
  for each row execute function private.prevent_purchase_order_receipt_history_rewrite();

-- Receipt lines are immutable. Corrections void the parent receipt and append a
-- replacement receipt rather than changing quantities, ordering, or notes.
create or replace function private.prevent_purchase_order_receipt_line_rewrite()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'Recorded purchase order receipt lines are immutable; void the parent receipt and record a replacement.'
    using errcode = '42501';
end;
$$;

revoke execute on function private.prevent_purchase_order_receipt_line_rewrite() from public, anon, authenticated;

drop trigger if exists purchase_order_receipt_lines_history_guard on public.purchase_order_receipt_lines;
create trigger purchase_order_receipt_lines_history_guard
  before update on public.purchase_order_receipt_lines
  for each row execute function private.prevent_purchase_order_receipt_line_rewrite();

-- Defense in depth: even privileged/internal inserts of receipt lines must see
-- an active receipt attached to a PO that is still ISSUED. Lock both rows so a
-- PO close/cancel or receipt void cannot race this lifecycle check.
create or replace function private.require_issued_purchase_order_for_receipt_line()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_receipt_status text;
  v_receipt_company_id uuid;
  v_po_status text;
  v_po_company_id uuid;
begin
  select por.status, por.company_id, po.status, po.company_id
    into v_receipt_status, v_receipt_company_id, v_po_status, v_po_company_id
  from public.purchase_order_receipts por
  join public.purchase_orders po on po.id = por.purchase_order_id
  where por.id = new.purchase_order_receipt_id
  for update of por, po;

  if not found then
    raise exception 'Receipt line requires an existing receipt and purchase order'
      using errcode = '23503';
  end if;

  if v_receipt_company_id is distinct from new.company_id
     or v_po_company_id is distinct from new.company_id then
    raise exception 'Receipt line company does not match its receipt and purchase order'
      using errcode = '42501';
  end if;

  if v_receipt_status <> 'RECEIVED' then
    raise exception 'Cannot add lines to a voided purchase order receipt'
      using errcode = '42501';
  end if;

  if v_po_status <> 'ISSUED' then
    raise exception 'Receipt lines can only be recorded while the purchase order is ISSUED (current status: %)', v_po_status
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke execute on function private.require_issued_purchase_order_for_receipt_line() from public, anon, authenticated;

drop trigger if exists purchase_order_receipt_lines_active_po_guard on public.purchase_order_receipt_lines;
create trigger purchase_order_receipt_lines_active_po_guard
  before insert on public.purchase_order_receipt_lines
  for each row execute function private.require_issued_purchase_order_for_receipt_line();
