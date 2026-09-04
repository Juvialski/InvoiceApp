begin;
select no_plan();

-- Schema, permissions, and lifecycle surfaces are present and exposed only to
-- authenticated company members through the existing project permissions.
select has_table('public', 'client_billings', 'client_billings exists');
select has_table('public', 'client_billing_lines', 'client_billing_lines exists');
select has_table('public', 'client_billing_events', 'client_billing_events exists');
select has_column('public', 'client_billings', 'project_id', 'client_billings.project_id exists');
select has_column('public', 'client_billing_lines', 'amount', 'client_billing_lines.amount exists');
select has_function('public', 'create_or_update_client_billing', 'client billing draft RPC exists');
select has_function('public', 'transition_client_billing', 'client billing lifecycle RPC exists');
select isnt_empty(
  $$select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname in ('client_billings', 'client_billing_lines', 'client_billing_events')
      and c.relrowsecurity$$,
  'all client billing tables have RLS enabled'
);
select is_empty(
  $$select 1 from information_schema.role_table_grants
    where table_schema = 'public' and table_name = 'client_billings'
      and grantee = 'authenticated' and privilege_type = 'DELETE'$$,
  'authenticated cannot directly delete client billing headers'
);
select is_empty(
  $$select 1 from information_schema.routine_privileges
    where routine_schema = 'public'
      and routine_name in ('create_or_update_client_billing', 'transition_client_billing')
      and lower(grantee) in ('public', 'anon') and privilege_type = 'EXECUTE'$$,
  'anonymous and public roles cannot execute client billing RPCs'
);
select isnt_empty(
  $$select 1 from pg_proc where oid = 'public.transition_client_billing(uuid,text,text)'::regprocedure
    and prosecdef and coalesce(array_to_string(proconfig, ','), '') like '%search_path=""%'$$,
  'client billing transition RPC is SECURITY DEFINER with an empty search_path'
);

create temp table client_billing_ids as
select
  '00000000-0000-4000-8000-000000000302'::uuid as admin_user,
  '00000000-0000-4000-8000-000000000303'::uuid as viewer_user,
  '00000000-0000-4000-8000-000000000304'::uuid as outsider_user,
  'aaaaaaaa-0000-4000-8000-000000000302'::uuid as company_a,
  'bbbbbbbb-0000-4000-8000-000000000303'::uuid as company_b,
  '10000000-0000-4000-8000-000000000302'::uuid as project_a,
  '20000000-0000-4000-8000-000000000303'::uuid as project_b;
grant select on client_billing_ids to authenticated, service_role;
create temp table client_billing_created_ids (slot text primary key, billing_id uuid not null);
grant insert, select on client_billing_created_ids to authenticated;

insert into auth.users (id, email, encrypted_password, created_at, updated_at)
select id, email, 'x', now(), now()
from (values
  ((select admin_user from client_billing_ids), 'client-billing-admin@test.local'),
  ((select viewer_user from client_billing_ids), 'client-billing-viewer@test.local'),
  ((select outsider_user from client_billing_ids), 'client-billing-outsider@test.local')
) users(id, email)
on conflict (id) do nothing;

insert into public.companies (id, name, company_code, status, default_currency, timezone, created_by_user_id, legacy_owner_user_id)
values
  ((select company_a from client_billing_ids), 'Client Billing Company A', 'client-billing-a', 'ACTIVE', 'PHP', 'Asia/Manila', (select admin_user from client_billing_ids), (select admin_user from client_billing_ids)),
  ((select company_b from client_billing_ids), 'Client Billing Company B', 'client-billing-b', 'ACTIVE', 'USD', 'UTC', (select outsider_user from client_billing_ids), (select outsider_user from client_billing_ids));

insert into public.company_members (company_id, user_id, role_key, status)
values
  ((select company_a from client_billing_ids), (select admin_user from client_billing_ids), 'COMPANY_ADMIN', 'ACTIVE'),
  ((select company_a from client_billing_ids), (select viewer_user from client_billing_ids), 'VIEWER', 'ACTIVE'),
  ((select company_b from client_billing_ids), (select outsider_user from client_billing_ids), 'COMPANY_ADMIN', 'ACTIVE');

insert into public.deployment_configuration (singleton, company_id)
values (true, (select company_a from client_billing_ids));

insert into public.projects (id, user_id, company_id, project_code, project_name, client_name, client_reference, status, contract_value, project_budget, currency)
values
  ((select project_a from client_billing_ids), (select admin_user from client_billing_ids), (select company_a from client_billing_ids), 'CB-A', 'Client Billing Project', 'Client A', 'CLIENT-A-001', 'ACTIVE', 1000, 700, 'PHP'),
  ((select project_b from client_billing_ids), (select outsider_user from client_billing_ids), (select company_b from client_billing_ids), 'CB-B', 'Other Company Project', 'Client B', 'CLIENT-B-001', 'ACTIVE', 1000, 700, 'USD');

set local role authenticated;
select set_config('request.jwt.claim.sub', (select admin_user::text from client_billing_ids), true);

-- Draft save derives the returned total from line values and snapshots the
-- project context. Drafts are intentionally absent from billed-to-date.
with saved as (
  select public.create_or_update_client_billing(
    jsonb_build_object('companyId', (select company_a from client_billing_ids), 'projectId', (select project_a from client_billing_ids), 'billingNumber', 'CB-PB-001', 'billingDate', '2026-09-04', 'currency', 'PHP'),
    jsonb_build_array(jsonb_build_object('description', 'Mobilization', 'amount', 600), jsonb_build_object('description', 'Site progress', 'amount', 0))
  ) as response
)
insert into client_billing_created_ids(slot, billing_id)
select 'one', (response->'billing'->>'id')::uuid from saved;
select is((select sum(amount) from public.client_billing_lines where billing_id = (select billing_id from client_billing_created_ids where slot = 'one')), 600::numeric, 'draft RPC total is the sum of billing lines');
select is((select status from public.client_billings where id = (select billing_id from client_billing_created_ids where slot = 'one')), 'DRAFT', 'new client billing is created as DRAFT');
select is((select client_name_snapshot from public.client_billings where id = (select billing_id from client_billing_created_ids where slot = 'one')), 'Client A', 'project client name is snapshotted');
select is((public.preview_project_lifecycle((select project_a from client_billing_ids))->'dependencies'->>'clientBillings')::bigint, 1::bigint, 'project preflight counts client billing history');
select is((public.preview_project_lifecycle((select project_a from client_billing_ids))->>'canDelete')::boolean, false, 'client billing history blocks unused project deletion');

select lives_ok($$select public.transition_client_billing((select billing_id from client_billing_created_ids where slot = 'one'), 'SUBMITTED', null)$$, 'draft billing can be submitted');
select lives_ok($$select public.transition_client_billing((select billing_id from client_billing_created_ids where slot = 'one'), 'ISSUED', null)$$, 'submitted billing can be issued');
select is((select status from public.client_billings where id = (select billing_id from client_billing_created_ids where slot = 'one')), 'ISSUED', 'issued lifecycle state is persisted');
select is((select sum(amount) from public.client_billing_lines where billing_id = (select billing_id from client_billing_created_ids where slot = 'one')), 600::numeric, 'issued billing retains line amount');
select is((select count(*) from public.client_billing_events where billing_id = (select billing_id from client_billing_created_ids where slot = 'one') and event_type in ('CREATED', 'SUBMITTED', 'ISSUED')), 3::bigint, 'billing lifecycle history is append-only and complete');
select is((select count(*) from public.company_audit_events where target_id = (select billing_id from client_billing_created_ids where slot = 'one') and event_type = 'CLIENT_BILLING_ISSUED'), 1::bigint, 'issued billing writes company audit history');

-- A second submitted billing cannot cross the locked project contract ceiling.
with saved as (
  select public.create_or_update_client_billing(
    jsonb_build_object('companyId', (select company_a from client_billing_ids), 'projectId', (select project_a from client_billing_ids), 'billingNumber', 'CB-PB-002', 'currency', 'PHP'),
    jsonb_build_array(jsonb_build_object('description', 'Final progress', 'amount', 500))
  ) as response
)
insert into client_billing_created_ids(slot, billing_id)
select 'two', (response->'billing'->>'id')::uuid from saved;
select is((select count(*) from public.client_billings where id = (select billing_id from client_billing_created_ids where slot = 'two') and status = 'DRAFT'), 1::bigint, 'second billing draft can be prepared');
select lives_ok($$select public.transition_client_billing((select billing_id from client_billing_created_ids where slot = 'two'), 'SUBMITTED', null)$$, 'second billing can be submitted before issuance');
select throws_ok(
  $$select public.transition_client_billing((select billing_id from client_billing_created_ids where slot = 'two'), 'ISSUED', null)$$,
  '23514', null,
  'concurrent-safe issuance check rejects cumulative over-billing'
);
select is((select status from public.client_billings where id = (select billing_id from client_billing_created_ids where slot = 'two')), 'SUBMITTED', 'failed issuance leaves the second billing submitted');

-- Finalized terms and direct lifecycle writes are not mutable; voiding is the
-- explicit reason-gated correction path and removes the row from billed truth.
select throws_ok(
  $$update public.client_billings set status = 'ISSUED' where id = (select billing_id from client_billing_created_ids where slot = 'two')$$,
  '42501', null,
  'direct status update cannot bypass the lifecycle RPC'
);
select throws_ok(
  $$update public.client_billing_lines set amount = 601 where billing_id = (select billing_id from client_billing_created_ids where slot = 'one')$$,
  '42501', null,
  'issued billing lines are immutable'
);
select throws_ok(
  $$delete from public.client_billings where id = (select billing_id from client_billing_created_ids where slot = 'one')$$,
  '42501', null,
  'client billing header history cannot be silently deleted'
);
select throws_ok(
  $$select public.transition_client_billing((select billing_id from client_billing_created_ids where slot = 'one'), 'VOIDED', null)$$,
  '22023', null,
  'voiding requires an explicit reason'
);
select lives_ok($$select public.transition_client_billing((select billing_id from client_billing_created_ids where slot = 'one'), 'VOIDED', 'Duplicate client billing')$$, 'issued billing can be voided with a reason');
select is((select status from public.client_billings where id = (select billing_id from client_billing_created_ids where slot = 'one')), 'VOIDED', 'voided lifecycle state is persisted');
select is((select count(*) from public.client_billing_events where billing_id = (select billing_id from client_billing_created_ids where slot = 'one') and event_type = 'VOIDED'), 1::bigint, 'voiding appends billing lifecycle history');

-- Currency and company/project boundaries are database enforced.
select throws_ok(
  $$select public.create_or_update_client_billing(
    jsonb_build_object('companyId', (select company_a from client_billing_ids), 'projectId', (select project_a from client_billing_ids), 'billingNumber', 'CB-USD', 'currency', 'USD'),
    jsonb_build_array(jsonb_build_object('description', 'Wrong currency', 'amount', 1))
  )$$,
  '22023', null,
  'billing currency must match project currency'
);
select throws_ok(
  $$select public.create_or_update_client_billing(
    jsonb_build_object('companyId', (select company_b from client_billing_ids), 'projectId', (select project_b from client_billing_ids), 'billingNumber', 'CB-B-001', 'currency', 'USD'),
    jsonb_build_array(jsonb_build_object('description', 'Wrong deployment', 'amount', 1))
  )$$,
  '42501', null,
  'billing RPC cannot target another deployment company'
);

-- A viewer can read project billing but cannot create or transition it.
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', (select viewer_user::text from client_billing_ids), true);
select is((select count(*) from public.client_billings where company_id = (select company_a from client_billing_ids)), 2::bigint, 'project reader can see company billing headers');
select throws_ok(
  $$select public.create_or_update_client_billing(
    jsonb_build_object('companyId', (select company_a from client_billing_ids), 'projectId', (select project_a from client_billing_ids), 'billingNumber', 'CB-VIEWER', 'currency', 'PHP'),
    jsonb_build_array(jsonb_build_object('description', 'Viewer write', 'amount', 1))
  )$$,
  '42501', null,
  'viewer cannot create client billing'
);

-- Restore admin context for the final project archive check.
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', (select admin_user::text from client_billing_ids), true);
select lives_ok($$select public.apply_project_lifecycle((select project_a from client_billing_ids), 'ARCHIVE', 'Retain client billing history')$$, 'project with billing history can be archived');
select is((select count(*) from public.client_billings where project_id = (select project_a from client_billing_ids)), 2::bigint, 'project archive preserves client billing history');
select throws_ok(
  $$select public.create_or_update_client_billing(
    jsonb_build_object('companyId', (select company_a from client_billing_ids), 'projectId', (select project_a from client_billing_ids), 'billingNumber', 'CB-AFTER-ARCHIVE', 'currency', 'PHP'),
    jsonb_build_array(jsonb_build_object('description', 'Archived project write', 'amount', 1))
  )$$,
  '42501', null,
  'archived project rejects new client billing'
);

reset role;
select * from finish();
rollback;
