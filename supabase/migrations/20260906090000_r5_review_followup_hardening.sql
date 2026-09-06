-- R5 review follow-up: keep durable issued-document send state aligned with
-- the same document visibility boundary enforced by the server endpoint.

create or replace function public.validate_document_send_intent_scope()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication is required for document send intents' using errcode = '42501';
  end if;

  if new.document_type = 'PURCHASE_ORDER' then
    if not (select public.has_company_permission(new.company_id, 'procurement.read')) then
      raise exception 'Purchase Order read permission is required for this send intent' using errcode = '42501';
    end if;
    if not exists (
      select 1 from public.purchase_orders po
      where po.id = new.document_id and po.company_id = new.company_id
    ) then
      raise exception 'Purchase Order send intent is outside the company' using errcode = '42501';
    end if;
  elsif new.document_type = 'CLIENT_INVOICE' then
    if not (select public.has_company_permission(new.company_id, 'projects.read')) then
      raise exception 'Project read permission is required for this Client Invoice send intent' using errcode = '42501';
    end if;
    if not exists (
      select 1 from public.client_billings b
      where b.id = new.document_id and b.company_id = new.company_id
    ) then
      raise exception 'Client Invoice send intent is outside the company' using errcode = '42501';
    end if;
  else
    raise exception 'Unsupported issued document type' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.issued_document_snapshots s
    where s.id = new.snapshot_id and s.company_id = new.company_id
      and s.document_type = new.document_type and s.document_id = new.document_id
  ) then
    raise exception 'Send intent must reference the same company-scoped immutable snapshot' using errcode = '42501';
  end if;

  return new;
end;
$$;

drop policy if exists document_send_intents_select on public.document_send_intents;
create policy document_send_intents_select on public.document_send_intents
for select to authenticated
using (
  (select public.has_company_permission(company_id, 'documents.send'))
  and (
    (document_type = 'PURCHASE_ORDER' and (select public.has_company_permission(company_id, 'procurement.read')))
    or
    (document_type = 'CLIENT_INVOICE' and (select public.has_company_permission(company_id, 'projects.read')))
  )
);
