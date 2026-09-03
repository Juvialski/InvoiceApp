-- ============================================================================
-- Migration: 20260903151000_subcontract_progress_claims_hardening.sql
-- Description: Harden P2B-2 mutation authority and subcontract/claim lifecycle
-- ============================================================================

-- Production mutations are RPC-owned. The application reads these tables
-- directly, but create/edit/transition/delete operations already use the guarded
-- SECURITY DEFINER RPCs introduced by P2B-2. Removing direct DML prevents an
-- authenticated client from bypassing lifecycle rules or editing database-owned
-- certified/retention totals directly.
revoke insert, update, delete on table public.subcontract_progress_claims from authenticated;
revoke insert, update, delete on table public.subcontract_progress_claim_lines from authenticated;
grant select on table public.subcontract_progress_claims to authenticated;
grant select on table public.subcontract_progress_claim_lines to authenticated;

-- Make transition authority explicit rather than treating procurement.manage and
-- procurement.approve as interchangeable. Manage owns draft submission/cancel;
-- approve owns certification/rejection/voiding.
create or replace function private.enforce_subcontract_claim_transition_permissions()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_sc_status text;
  v_has_manage boolean;
  v_has_approve boolean;
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  v_has_manage := (select public.has_company_permission(new.company_id, 'procurement.manage'));
  v_has_approve := (select public.has_company_permission(new.company_id, 'procurement.approve'));

  if old.status = 'DRAFT' and new.status in ('SUBMITTED', 'CANCELLED') then
    if not v_has_manage then
      raise exception 'Submitting or cancelling a draft progress claim requires procurement.manage permission'
        using errcode = '42501';
    end if;
  elsif old.status = 'SUBMITTED' and new.status in ('APPROVED', 'REJECTED') then
    if not v_has_approve then
      raise exception 'Approving or rejecting a progress claim requires procurement.approve permission'
        using errcode = '42501';
    end if;
  elsif old.status = 'SUBMITTED' and new.status = 'CANCELLED' then
    if not v_has_manage then
      raise exception 'Cancelling a submitted progress claim requires procurement.manage permission'
        using errcode = '42501';
    end if;
  elsif old.status = 'APPROVED' and new.status = 'VOIDED' then
    if not v_has_approve then
      raise exception 'Voiding an approved progress claim requires procurement.approve permission'
        using errcode = '42501';
    end if;
  end if;

  -- New commercial progress may only advance while the parent subcontract is an
  -- eligible live commitment. Consequential wind-down statuses remain available
  -- after closure/cancellation so history is never stranded.
  if new.status in ('SUBMITTED', 'APPROVED') then
    select sc.status
      into v_sc_status
    from public.subcontracts sc
    where sc.id = new.subcontract_id
      and sc.company_id = new.company_id
    for key share;

    if v_sc_status is null then
      raise exception 'Parent subcontract not found in company' using errcode = '23503';
    end if;
    if v_sc_status not in ('APPROVED', 'ACTIVE') then
      raise exception 'Progress claims can only be submitted or approved while the subcontract is APPROVED or ACTIVE'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_subcontract_claim_transition_permissions_trigger
  on public.subcontract_progress_claims;
create trigger enforce_subcontract_claim_transition_permissions_trigger
  before update on public.subcontract_progress_claims
  for each row execute function private.enforce_subcontract_claim_transition_permissions();

-- A subcontract cannot be closed/cancelled while unresolved claim work remains.
-- Resolve DRAFT/SUBMITTED claims first; approved/rejected/cancelled/voided history
-- is preserved and does not block the parent wind-down.
create or replace function private.guard_subcontract_unresolved_progress_claims()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_open_claims bigint;
begin
  if new.status is distinct from old.status and new.status in ('CLOSED', 'CANCELLED') then
    select count(*)
      into v_open_claims
    from public.subcontract_progress_claims c
    where c.company_id = new.company_id
      and c.subcontract_id = new.id
      and c.status in ('DRAFT', 'SUBMITTED');

    if v_open_claims > 0 then
      raise exception 'Resolve % draft/submitted progress claim(s) before closing or cancelling the subcontract', v_open_claims
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists guard_subcontract_unresolved_progress_claims_trigger on public.subcontracts;
create trigger guard_subcontract_unresolved_progress_claims_trigger
  before update on public.subcontracts
  for each row execute function private.guard_subcontract_unresolved_progress_claims();

-- Trigger/helper functions are internal execution surfaces only.
revoke execute on function private.enforce_subcontract_claim_transition_permissions() from public, anon, authenticated;
revoke execute on function private.guard_subcontract_unresolved_progress_claims() from public, anon, authenticated;
revoke execute on function private.validate_subcontract_claim_scope() from public, anon, authenticated;
revoke execute on function private.validate_subcontract_claim_line() from public, anon, authenticated;
revoke execute on function private.sync_subcontract_claim_totals() from public, anon, authenticated;
