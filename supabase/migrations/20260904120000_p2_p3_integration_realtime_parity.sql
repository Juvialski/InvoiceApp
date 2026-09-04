-- Add the existing P2 commercial/procurement source tables to the current
-- Supabase Realtime publication. This is a forward-only, idempotent
-- publication update: it creates no tables, policies, grants, or alternate
-- source of truth. Missing tables are skipped so upgrade ordering remains
-- safe for partially provisioned environments.
do $$
declare
  table_name text;
begin
  if exists (
    select 1
      from pg_publication
     where pubname = 'supabase_realtime'
       and not puballtables
  ) then
    foreach table_name in array array[
      'client_collections',
      'client_collection_allocations',
      'client_collection_events',
      'vendors',
      'purchase_orders',
      'purchase_order_lines',
      'purchase_order_receipts',
      'purchase_order_receipt_lines',
      'purchase_order_invoice_matches',
      'purchase_order_invoice_match_lines',
      'rfqs',
      'rfq_lines',
      'rfq_invited_vendors',
      'supplier_quotations',
      'supplier_quotation_lines',
      'subcontracts',
      'subcontract_lines',
      'subcontract_progress_claims',
      'subcontract_progress_claim_lines',
      'subcontract_variations',
      'subcontract_variation_lines'
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
