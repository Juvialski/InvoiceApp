-- P2A-3 review hardening: direct table writes are intentionally denied by RLS
-- and grants, so guarded mutation RPCs must execute with the function owner's
-- table privileges while still enforcing auth/company/permission checks inside
-- the functions themselves.

alter function public.confirm_purchase_order_invoice_match(uuid, uuid, text, text, jsonb)
  security definer;

alter function public.unmatch_purchase_order_invoice(uuid, text)
  security definer;

-- Function EXECUTE is granted to PUBLIC by default in PostgreSQL. Keep the
-- public/anonymous surface closed and expose only to authenticated callers;
-- both functions additionally reject missing auth.uid() and re-check the
-- required invoice + procurement permissions for the target company.
revoke all on function public.confirm_purchase_order_invoice_match(uuid, uuid, text, text, jsonb)
  from public, anon;
revoke all on function public.unmatch_purchase_order_invoice(uuid, text)
  from public, anon;

grant execute on function public.confirm_purchase_order_invoice_match(uuid, uuid, text, text, jsonb)
  to authenticated;
grant execute on function public.unmatch_purchase_order_invoice(uuid, text)
  to authenticated;
