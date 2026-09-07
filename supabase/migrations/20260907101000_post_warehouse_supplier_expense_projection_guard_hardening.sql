-- HydroQualiSense post-Warehouse supplier Expense projection guard hardening.
--
-- The allocation reconciliation path uses a transaction-local GUC only from
-- private SECURITY DEFINER code. Authenticated callers must not be able to set
-- the same GUC and bypass the Expense correction/provenance trigger.

create or replace function private.guard_expense_correction_edit()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_business_changed boolean;
begin
  if current_setting('app.supplier_expense_projection_sync', true) = 'on'
     and current_user in ('postgres', 'service_role') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if current_user not in ('postgres', 'service_role')
       and (new.status = 'VOID' or new.archived_at is not null or new.voided_at is not null or new.voided_by_user_id is not null or new.void_reason is not null) then
      raise exception 'Create an expense in an active status; use the expense correction workflow for lifecycle changes' using errcode = '42501';
    end if;
    if new.supplier_invoice_id is not null and current_user not in ('postgres', 'service_role') then
      raise exception 'Supplier-derived Expenses must be created by the guarded supplier verification workflow' using errcode = '42501';
    end if;
    return new;
  end if;

  if new.archived_at is distinct from old.archived_at
     or new.voided_at is distinct from old.voided_at
     or new.voided_by_user_id is distinct from old.voided_by_user_id
     or new.void_reason is distinct from old.void_reason
     or (new.status is distinct from old.status and (new.status = 'VOID' or old.status = 'VOID')) then
    if current_user not in ('postgres', 'service_role') then
      raise exception 'Use the Expense correction workflow for void, archive, or restore actions' using errcode = '42501';
    end if;
  end if;

  v_business_changed := new.project_id is distinct from old.project_id
    or new.project_cost_code_id is distinct from old.project_cost_code_id
    or new.expense_date is distinct from old.expense_date
    or new.category is distinct from old.category
    or new.description is distinct from old.description
    or new.payee is distinct from old.payee
    or new.amount is distinct from old.amount
    or new.currency is distinct from old.currency
    or new.payment_method is distinct from old.payment_method
    or new.reference_number is distinct from old.reference_number
    or new.receipt_source_document_id is distinct from old.receipt_source_document_id
    or new.supplier_invoice_id is distinct from old.supplier_invoice_id
    or new.vendor_id is distinct from old.vendor_id
    or new.purchase_order_id is distinct from old.purchase_order_id
    or new.notes is distinct from old.notes;

  if old.supplier_invoice_id is null and new.supplier_invoice_id is not null and current_user not in ('postgres', 'service_role') then
    raise exception 'Supplier invoice linkage is owned by the guarded verification workflow' using errcode = '42501';
  end if;

  if old.supplier_invoice_id is not null and v_business_changed then
    raise exception 'Supplier-derived Expense financial and provenance fields are immutable; void and create a deliberate correction instead' using errcode = '42501';
  end if;

  if current_user in ('postgres', 'service_role') then
    return new;
  end if;

  if old.status = 'PAID' and (new.status is distinct from old.status or v_business_changed) then
    raise exception 'Paid Expenses are immutable; use the Expense correction workflow for an auditable correction' using errcode = '42501';
  end if;

  if old.status = 'APPROVED' and (new.status not in ('APPROVED', 'PAID') or v_business_changed) then
    raise exception 'Approved Expenses must use the Expense correction workflow for an auditable correction' using errcode = '42501';
  end if;

  if old.status = 'VOID' and v_business_changed then
    raise exception 'Voided Expenses are immutable; original values and history must remain preserved' using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke execute on function private.guard_expense_correction_edit() from public, anon, authenticated;
