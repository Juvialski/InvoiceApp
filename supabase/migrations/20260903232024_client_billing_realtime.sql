-- Add the P2B-4 client billing workspace tables to the existing Realtime
-- publication. This is additive and does not replace publication membership,
-- RLS, grants, or any other table security contract.
do $$
declare
  table_name text;
begin
  if exists (
    select 1 from pg_publication
    where pubname = 'supabase_realtime' and not puballtables
  ) then
    foreach table_name in array array[
      'client_billings',
      'client_billing_lines',
      'client_billing_events'
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
