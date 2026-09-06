begin;
select no_plan();

select isnt_empty(
  $$select 1 from pg_policies where schemaname = 'public' and tablename = 'document_send_intents' and policyname = 'document_send_intents_select' and qual ilike '%documents.send%'$$,
  'send intent visibility still requires documents.send'
);
select isnt_empty(
  $$select 1 from pg_policies where schemaname = 'public' and tablename = 'document_send_intents' and policyname = 'document_send_intents_select' and qual ilike '%procurement.read%'$$,
  'Purchase Order send intent visibility also requires procurement.read'
);
select isnt_empty(
  $$select 1 from pg_policies where schemaname = 'public' and tablename = 'document_send_intents' and policyname = 'document_send_intents_select' and qual ilike '%projects.read%'$$,
  'Client Invoice send intent visibility also requires projects.read'
);
select isnt_empty(
  $$select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'validate_document_send_intent_scope' and pg_get_functiondef(p.oid) ilike '%procurement.read%' and pg_get_functiondef(p.oid) ilike '%projects.read%'$$,
  'send intent trigger enforces document-specific read permission at the database boundary'
);

select * from finish();
rollback;
