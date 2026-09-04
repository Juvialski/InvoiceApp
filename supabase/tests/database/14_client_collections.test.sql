begin;
select no_plan();

-- Schema, permissions, and lifecycle surfaces are present and exposed only to
-- authenticated company members through the existing project permissions.
select has_table('public', 'client_collections', 'client_collections exists');
select has_table('public', 'client_collection_allocations', 'client_collection_allocations exists');
select has_table('public', 'client_collection_events', 'client_collection_events exists');
select has_column('public', 'client_collections', 'project_id', 'client_collections.project_id exists');
select has_column('public', 'client_collection_allocations', 'amount', 'client_collection_allocations.amount exists');
select has_function('public', 'create_or_update_client_collection', 'client collection draft RPC exists');
select has_function('public', 'record_client_collection', 'client collection record RPC exists');
select has_function('public', 'reverse_client_collection', 'client collection reverse RPC exists');

select isnt_empty(
  $$select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname in ('client_collections', 'client_collection_allocations', 'client_collection_events')
      and c.relrowsecurity$$,
  'all client collection tables have RLS enabled'
);

select is_empty(
  $$select 1 from information_schema.role_table_grants
    where table_schema = 'public' and table_name = 'client_collections'
      and grantee = 'authenticated' and privilege_type = 'DELETE'$$,
  'authenticated cannot directly delete client collection headers'
);

select is_empty(
  $$select 1 from information_schema.routine_privileges
    where routine_schema = 'public'
      and routine_name in ('create_or_update_client_collection', 'record_client_collection', 'reverse_client_collection')
      and lower(grantee) in ('public', 'anon') and privilege_type = 'EXECUTE'$$,
  'anonymous and public roles cannot execute client collection RPCs'
);

select isnt_empty(
  $$select 1 from pg_proc where oid = 'public.record_client_collection(uuid)'::regprocedure
    and prosecdef and coalesce(array_to_string(proconfig, ','), '') like '%search_path=""%' $$,
  'client collection record RPC is SECURITY DEFINER with an empty search_path'
);

select isnt_empty(
  $$select 1 from pg_proc where oid = 'public.reverse_client_collection(uuid,text)'::regprocedure
    and prosecdef and coalesce(array_to_string(proconfig, ','), '') like '%search_path=""%' $$,
  'client collection reverse RPC is SECURITY DEFINER with an empty search_path'
);

create temp table client_collection_ids as
select
  '00000000-0000-4000-8000-000000000402'::uuid as admin_user,
  '00000000-0000-4000-8000-000000000403'::uuid as viewer_user,
  '00000000-0000-4000-8000-000000000404'::uuid as outsider_user,
  'aaaaaaaa-0000-4000-8000-000000000402'::uuid as company_a,
  'bbbbbbbb-0000-4000-8000-000000000403'::uuid as company_b,
  '10000000-0000-4000-8000-000000000402'::uuid as project_a,
  '20000000-0000-4000-8000-000000000403'::uuid as project_b,
  '30000000-0000-4000-8000-000000000402'::uuid as billing_a1,
  '30000000-0000-4000-8000-000000000403'::uuid as billing_a2;
grant select on client_collection_ids to authenticated, service_role;

create temp table client_collection_created_ids (slot text primary key, collection_id uuid not null);
grant insert, select on client_collection_created_ids to authenticated;

insert into auth.users (id, email, encrypted_password, created_at, updated_at)
select id, email, 'x', now(), now()
from (values
  ((select admin_user from client_collection_ids), 'client-collection-admin@test.local'),
  ((select viewer_user from client_collection_ids), 'client-collection-viewer@test.local'),
  ((select outsider_user from client_collection_ids), 'client-collection-outsider@test.local')
) users(id, email)
on conflict (id) do nothing;

insert into public.companies (id, name, company_code, status, default_currency, timezone, created_by_user_id, legacy_owner_user_id)
values
  ((select company_a from client_collection_ids), 'Client Collection Company A', 'client-collection-a', 'ACTIVE', 'PHP', 'Asia/Manila', (select admin_user from client_collection_ids), (select admin_user from client_collection_ids)),
  ((select company_b from client_collection_ids), 'Client Collection Company B', 'client-collection-b', 'ACTIVE', 'USD', 'UTC', (select outsider_user from client_collection_ids), (select outsider_user from client_collection_ids));

insert into public.company_members (company_id, user_id, role_key, status)
values
  ((select company_a from client_collection_ids), (select admin_user from client_collection_ids), 'COMPANY_ADMIN', 'ACTIVE'),
  ((select company_a from client_collection_ids), (select viewer_user from client_collection_ids), 'VIEWER', 'ACTIVE'),
  ((select company_b from client_collection_ids), (select outsider_user from client_collection_ids), 'COMPANY_ADMIN', 'ACTIVE');

insert into public.deployment_configuration (singleton, company_id)
values (true, (select company_a from client_collection_ids))
on conflict (singleton) do update set company_id = (select company_a from client_collection_ids);

insert into public.projects (id, user_id, company_id, project_code, project_name, client_name, client_reference, status, contract_value, project_budget, currency)
values
  ((select project_a from client_collection_ids), (select admin_user from client_collection_ids), (select company_a from client_collection_ids), 'CC-A', 'Client Collection Project', 'Client Alpha', 'CLIENT-ALPHA-001', 'ACTIVE', 10000, 7000, 'PHP'),
  ((select project_b from client_collection_ids), (select outsider_user from client_collection_ids), (select company_b from client_collection_ids), 'CC-B', 'Other Company Project', 'Client Beta', 'CLIENT-BETA-001', 'ACTIVE', 10000, 7000, 'USD');

-- Create issued test billings for project A:
-- Billing A1: 3000 PHP (ISSUED)
-- Billing A2: 2000 PHP (DRAFT)
insert into public.client_billings (id, user_id, company_id, project_id, billing_number, billing_date, currency, status, client_name_snapshot, client_reference_snapshot)
values
  ((select billing_a1 from client_collection_ids), (select admin_user from client_collection_ids), (select company_a from client_collection_ids), (select project_a from client_collection_ids), 'PB-CC-001', '2026-09-04', 'PHP', 'ISSUED', 'Client Alpha', 'CLIENT-ALPHA-001'),
  ((select billing_a2 from client_collection_ids), (select admin_user from client_collection_ids), (select company_a from client_collection_ids), (select project_a from client_collection_ids), 'PB-CC-002', '2026-09-04', 'PHP', 'DRAFT', 'Client Alpha', 'CLIENT-ALPHA-001');

insert into public.client_billing_lines (company_id, billing_id, line_number, description, amount)
values
  ((select company_a from client_collection_ids), (select billing_a1 from client_collection_ids), 1, 'Phase 1 Works', 3000),
  ((select company_a from client_collection_ids), (select billing_a2 from client_collection_ids), 1, 'Phase 2 Works', 2000);

set local role authenticated;
select set_config('request.jwt.claim.sub', (select admin_user::text from client_collection_ids), true);

-- Draft save derives the returned total from allocation values.
with saved as (
  select public.create_or_update_client_collection(
    jsonb_build_object(
      'companyId', (select company_a from client_collection_ids),
      'projectId', (select project_a from client_collection_ids),
      'collectionNumber', 'CR-001',
      'collectionDate', '2026-09-04',
      'currency', 'PHP',
      'notes', 'Bank transfer'
    ),
    jsonb_build_array(
      jsonb_build_object('billingId', (select billing_a1 from client_collection_ids), 'amount', 1800, 'notes', 'Partial payment')
    )
  ) as response
)
insert into client_collection_created_ids(slot, collection_id)
select 'one', (response->'collection'->>'id')::uuid from saved;

select is((select sum(amount) from public.client_collection_allocations where collection_id = (select collection_id from client_collection_created_ids where slot = 'one')), 1800::numeric, 'draft RPC total is the sum of allocations');
select is((select status from public.client_collections where id = (select collection_id from client_collection_created_ids where slot = 'one')), 'DRAFT', 'new client collection is created as DRAFT');
select is((select payer_snapshot from public.client_collections where id = (select collection_id from client_collection_created_ids where slot = 'one')), 'Client Alpha', 'project client name is snapshotted to payer');

select is((public.preview_project_lifecycle((select project_a from client_collection_ids))->'dependencies'->>'clientCollections')::bigint, 1::bigint, 'project preflight counts client collection history');
select is((public.preview_project_lifecycle((select project_a from client_collection_ids))->>'canDelete')::boolean, false, 'client collection history blocks unused project deletion');

-- Cannot record allocation against non-ISSUED billing
with saved_inv as (
  select public.create_or_update_client_collection(
    jsonb_build_object(
      'companyId', (select company_a from client_collection_ids),
      'projectId', (select project_a from client_collection_ids),
      'collectionNumber', 'CR-INV',
      'currency', 'PHP'
    ),
    jsonb_build_array(
      jsonb_build_object('billingId', (select billing_a2 from client_collection_ids), 'amount', 500)
    )
  ) as response
)
insert into client_collection_created_ids(slot, collection_id)
select 'inv', (response->'collection'->>'id')::uuid from saved_inv;

select throws_ok(
  $$select public.record_client_collection((select collection_id from client_collection_created_ids where slot = 'inv'))$$,
  '42501', null,
  'cannot record collection targeting non-ISSUED billing'
);

-- Record valid draft collection 'one'
select lives_ok(
  $$select public.record_client_collection((select collection_id from client_collection_created_ids where slot = 'one'))$$,
  'draft collection can be recorded'
);
select is((select status from public.client_collections where id = (select collection_id from client_collection_created_ids where slot = 'one')), 'RECORDED', 'recorded lifecycle state is persisted');
select is((select count(*) from public.client_collection_events where collection_id = (select collection_id from client_collection_created_ids where slot = 'one') and event_type = 'RECORDED'), 1::bigint, 'collection record writes audit event');
select is((select count(*) from public.company_audit_events where target_id = (select collection_id from client_collection_created_ids where slot = 'one') and event_type = 'CLIENT_COLLECTION_RECORDED'), 1::bigint, 'recorded collection writes company audit event');

-- Second collection cannot over-collect billing A1 (3000 total, 1800 already collected, remaining is 1200)
with saved_over as (
  select public.create_or_update_client_collection(
    jsonb_build_object(
      'companyId', (select company_a from client_collection_ids),
      'projectId', (select project_a from client_collection_ids),
      'collectionNumber', 'CR-OVER',
      'currency', 'PHP'
    ),
    jsonb_build_array(
      jsonb_build_object('billingId', (select billing_a1 from client_collection_ids), 'amount', 1500)
    )
  ) as response
)
insert into client_collection_created_ids(slot, collection_id)
select 'over', (response->'collection'->>'id')::uuid from saved_over;

select throws_ok(
  $$select public.record_client_collection((select collection_id from client_collection_created_ids where slot = 'over'))$$,
  '23514', null,
  'concurrent-safe recording check rejects over-collection beyond billing remaining balance'
);

-- Direct update and delete bypasses are blocked
select throws_ok(
  $$update public.client_collections set status = 'RECORDED' where id = (select collection_id from client_collection_created_ids where slot = 'over')$$,
  '42501', null,
  'direct status update cannot bypass the lifecycle RPC'
);
select throws_ok(
  $$delete from public.client_collections where id = (select collection_id from client_collection_created_ids where slot = 'one')$$,
  '42501', null,
  'client collection header history cannot be silently deleted'
);

-- Reversal requires reason >= 3 chars
select throws_ok(
  $$select public.reverse_client_collection((select collection_id from client_collection_created_ids where slot = 'one'), 'no')$$,
  '22023', null,
  'reversal requires reason of at least 3 characters'
);

-- Valid reversal
select lives_ok(
  $$select public.reverse_client_collection((select collection_id from client_collection_created_ids where slot = 'one'), 'Payment recalled by client bank')$$,
  'recorded collection can be reversed with valid reason'
);
select is((select status from public.client_collections where id = (select collection_id from client_collection_created_ids where slot = 'one')), 'REVERSED', 'reversed lifecycle state is persisted');
select is((select count(*) from public.client_collection_events where collection_id = (select collection_id from client_collection_created_ids where slot = 'one') and event_type = 'REVERSED'), 1::bigint, 'reversal appends audit event');
select is((select count(*) from public.company_audit_events where target_id = (select collection_id from client_collection_created_ids where slot = 'one') and event_type = 'CLIENT_COLLECTION_REVERSED'), 1::bigint, 'reversal writes company audit event');

-- After reversal, outstanding balance is restored so CR-OVER (1500) can now be recorded
select lives_ok(
  $$select public.record_client_collection((select collection_id from client_collection_created_ids where slot = 'over'))$$,
  'collection can be recorded after prior collection is reversed'
);

-- Currency mismatch is blocked
select throws_ok(
  $$select public.create_or_update_client_collection(
    jsonb_build_object(
      'companyId', (select company_a from client_collection_ids),
      'projectId', (select project_a from client_collection_ids),
      'collectionNumber', 'CR-USD',
      'currency', 'USD'
    ),
    jsonb_build_array(
      jsonb_build_object('billingId', (select billing_a1 from client_collection_ids), 'amount', 100)
    )
  )$$,
  '22023', null,
  'collection currency must match project currency'
);

-- Cross-company isolation
select throws_ok(
  $$select public.create_or_update_client_collection(
    jsonb_build_object(
      'companyId', (select company_b from client_collection_ids),
      'projectId', (select project_b from client_collection_ids),
      'collectionNumber', 'CR-B-001',
      'currency', 'USD'
    ),
    jsonb_build_array()
  )$$,
  '42501', null,
  'collection RPC cannot target another deployment company'
);

-- Viewer permissions
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', (select viewer_user::text from client_collection_ids), true);
select is((select count(*) from public.client_collections where company_id = (select company_a from client_collection_ids)), 3::bigint, 'project reader can see company collection headers');
select throws_ok(
  $$select public.create_or_update_client_collection(
    jsonb_build_object(
      'companyId', (select company_a from client_collection_ids),
      'projectId', (select project_a from client_collection_ids),
      'collectionNumber', 'CR-VIEWER',
      'currency', 'PHP'
    ),
    jsonb_build_array()
  )$$,
  '42501', null,
  'viewer cannot create client collection'
);

-- Archived project check
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', (select admin_user::text from client_collection_ids), true);
select lives_ok($$select public.apply_project_lifecycle((select project_a from client_collection_ids), 'ARCHIVE', 'Retain client collection history')$$, 'project with collection history can be archived');
select throws_ok(
  $$select public.create_or_update_client_collection(
    jsonb_build_object(
      'companyId', (select company_a from client_collection_ids),
      'projectId', (select project_a from client_collection_ids),
      'collectionNumber', 'CR-AFTER-ARCHIVE',
      'currency', 'PHP'
    ),
    jsonb_build_array()
  )$$,
  '42501', null,
  'archived project rejects new client collection'
);

reset role;
select * from finish();
rollback;
