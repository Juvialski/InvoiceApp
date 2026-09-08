-- A verified supplier invoice with an active linked Expense is already backed
-- by authoritative payable/cost truth. Keep the existing deliberate reopen
-- workflow available for legacy VERIFIED invoices that still have no Expense,
-- but prevent a caller from reopening the linked source and editing facts out
-- from under that authoritative record.

create or replace function private.guard_invoice_correction_edit()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_business_changed boolean;
begin
  if tg_op = 'INSERT' then
    if current_user not in ('postgres', 'service_role')
       and (
         new.lifecycle_status <> 'ACTIVE'
         or new.archived_at is not null
         or new.voided_at is not null
         or new.voided_by_user_id is not null
         or new.void_reason is not null
       ) then
      raise exception 'Create an invoice in the active state; use the invoice correction workflow for lifecycle changes'
        using errcode = '42501';
    end if;
    return new;
  end if;

  if current_user in ('postgres', 'service_role') then
    return new;
  end if;

  if new.lifecycle_status is distinct from old.lifecycle_status
     or new.archived_at is distinct from old.archived_at
     or new.voided_at is distinct from old.voided_at
     or new.voided_by_user_id is distinct from old.voided_by_user_id
     or new.void_reason is distinct from old.void_reason then
    raise exception 'Use the invoice correction workflow for delete, void, archive, or restore actions'
      using errcode = '42501';
  end if;

  v_business_changed := new.vendor_id is distinct from old.vendor_id
    or new.invoice_number is distinct from old.invoice_number
    or new.invoice_date is distinct from old.invoice_date
    or new.due_date is distinct from old.due_date
    or new.currency is distinct from old.currency
    or new.grand_total is distinct from old.grand_total
    or new.payment_status is distinct from old.payment_status
    or new.duplicate_status is distinct from old.duplicate_status
    or new.duplicate_of_id is distinct from old.duplicate_of_id
    or new.document_type is distinct from old.document_type
    or (coalesce(new.current_data, '{}'::jsonb) - ARRAY[
      'reviewStatus', 'verifiedAt', 'archivedAt', 'lifecycleStatus',
      'voidedAt', 'voidedByUserId', 'voidReason',
      'review_status', 'verified_at', 'archived_at', 'lifecycle_status',
      'voided_at', 'voided_by_user_id', 'void_reason'
    ]::text[]) is distinct from (coalesce(old.current_data, '{}'::jsonb) - ARRAY[
      'reviewStatus', 'verifiedAt', 'archivedAt', 'lifecycleStatus',
      'voidedAt', 'voidedByUserId', 'voidReason',
      'review_status', 'verified_at', 'archived_at', 'lifecycle_status',
      'voided_at', 'voided_by_user_id', 'void_reason'
    ]::text[]);

  if old.lifecycle_status = 'VOID'
     and (v_business_changed or new.review_status is distinct from old.review_status) then
    raise exception 'Voided invoices are immutable; original values and history must remain preserved'
      using errcode = '42501';
  end if;

  if old.review_status = 'VERIFIED'
     and new.review_status is distinct from old.review_status
     and new.review_status <> 'VERIFIED'
     and exists (
       select 1
       from public.expenses e
       where e.company_id = old.company_id
         and e.supplier_invoice_id = old.id
         and e.status <> 'VOID'
     ) then
    raise exception 'A verified invoice with an active linked Expense cannot be reopened; use the Expense correction workflow'
      using errcode = '42501';
  end if;

  if old.review_status = 'VERIFIED'
     and v_business_changed then
    raise exception 'Verified invoices must be reopened through the verification workflow before editing'
      using errcode = '42501';
  end if;

  if new.review_status is distinct from old.review_status
     and not (select private.has_company_permission(new.company_id, 'invoices.verify')) then
    raise exception 'Invoice review-state changes require invoices.verify'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke execute on function private.guard_invoice_correction_edit() from public, anon, authenticated;
