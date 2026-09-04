-- ============================================================================
-- P2B-5 follow-up guards
--
-- Preserve two lifecycle invariants that must remain true under concurrent
-- finalization/correction calls:
--   1. a finalized collection can transition only RECORDED -> REVERSED once;
--   2. an ISSUED billing with active RECORDED collections cannot be VOIDED
--      until those collections are reversed.
-- ============================================================================

create or replace function private.guard_client_collection_finalized_update()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if old.status = 'DRAFT' then
    if new.status not in ('DRAFT', 'RECORDED') then
      raise exception 'Draft client collections can only remain draft or be recorded through the guarded lifecycle'
        using errcode = '42501';
    end if;
    return new;
  end if;

  if old.status = 'RECORDED' then
    if new.status <> 'REVERSED' then
      raise exception 'Recorded client collections are immutable and can only be reversed once through the guarded lifecycle'
        using errcode = '42501';
    end if;
    return new;
  end if;

  if old.status = 'REVERSED' then
    raise exception 'Reversed client collections are terminal and immutable'
      using errcode = '42501';
  end if;

  raise exception 'Unsupported client collection lifecycle state: %', old.status
    using errcode = '42501';
end;
$$;

drop trigger if exists client_collections_finalized_state_guard on public.client_collections;
create trigger client_collections_finalized_state_guard
  before update on public.client_collections
  for each row execute function private.guard_client_collection_finalized_update();

create or replace function private.prevent_client_billing_void_with_recorded_collections()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if old.status = 'ISSUED' and new.status = 'VOIDED' and exists (
    select 1
    from public.client_collection_allocations a
    join public.client_collections c
      on c.company_id = a.company_id
     and c.id = a.collection_id
    where a.company_id = old.company_id
      and a.billing_id = old.id
      and c.status = 'RECORDED'
  ) then
    raise exception 'Issued client billing cannot be voided while recorded client collections are allocated to it; reverse those collections first'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists client_billings_collection_void_guard on public.client_billings;
create trigger client_billings_collection_void_guard
  before update on public.client_billings
  for each row execute function private.prevent_client_billing_void_with_recorded_collections();

revoke execute on function private.guard_client_collection_finalized_update() from public, anon, authenticated;
revoke execute on function private.prevent_client_billing_void_with_recorded_collections() from public, anon, authenticated;
