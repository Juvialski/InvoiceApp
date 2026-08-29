begin;
select no_plan();

select is_empty(
  $$select 1
    from information_schema.routine_privileges
   where routine_schema = 'private'
     and routine_name in ('project_lifecycle_preflight', 'project_lifecycle_preflight_authorized')
     and lower(grantee) in ('public', 'anon', 'authenticated')
     and privilege_type = 'EXECUTE'$$,
  'project lifecycle internal preflight helpers are not directly executable by client roles'
);

create temp table wave2b1_status_ids as
select
  '00000000-0000-4000-8000-000000000301'::uuid as admin_user,
  'aaaaaaaa-0000-4000-8000-000000000301'::uuid as company_id,
  '10000000-0000-4000-8000-000000000301'::uuid as project_id;

grant select on wave2b1_status_ids to authenticated;

insert into auth.users (id, email, encrypted_password, created_at, updated_at)
values ((select admin_user from wave2b1_status_ids), 'wave2b1-status-admin@test.local', 'x', now(), now())
on conflict (id) do nothing;

insert into public.companies (
  id, name, company_code, status, default_currency, timezone,
  created_by_user_id, legacy_owner_user_id
)
values (
  (select company_id from wave2b1_status_ids),
  'Wave 2B1 Status Guard Company',
  'wave2b1-status',
  'ACTIVE',
  'PHP',
  'Asia/Manila',
  (select admin_user from wave2b1_status_ids),
  (select admin_user from wave2b1_status_ids)
);

insert into public.company_members (company_id, user_id, role_key, status)
values (
  (select company_id from wave2b1_status_ids),
  (select admin_user from wave2b1_status_ids),
  'COMPANY_ADMIN',
  'ACTIVE'
);

insert into public.deployment_configuration (singleton, company_id)
values (true, (select company_id from wave2b1_status_ids));

set local role authenticated;
select set_config('request.jwt.claim.sub', (select admin_user::text from wave2b1_status_ids), true);

select lives_ok(
  $$insert into public.projects (
      id, user_id, company_id, project_code, project_name, status, project_budget, currency
    ) values (
      (select project_id from wave2b1_status_ids),
      (select admin_user from wave2b1_status_ids),
      (select company_id from wave2b1_status_ids),
      'W2B1-STATUS',
      'Wave 2B1 Status Project',
      'PLANNING',
      0,
      'PHP'
    )$$,
  'normal project creation remains available'
);

select throws_ok(
  $$insert into public.projects (
      id, user_id, company_id, project_code, project_name, status, project_budget, currency
    ) values (
      gen_random_uuid(),
      (select admin_user from wave2b1_status_ids),
      (select company_id from wave2b1_status_ids),
      'W2B1-ARCHIVED-BYPASS',
      'Direct Archived Project',
      'ARCHIVED',
      0,
      'PHP'
    )$$,
  '42501', null,
  'authenticated insert cannot create an archived project directly'
);

select lives_ok(
  $$update public.projects
      set status = 'ACTIVE'
    where id = (select project_id from wave2b1_status_ids)$$,
  'normal PLANNING to ACTIVE transition remains available'
);

select lives_ok(
  $$update public.projects
      set status = 'ON_HOLD'
    where id = (select project_id from wave2b1_status_ids)$$,
  'normal ACTIVE to ON_HOLD transition remains available'
);

select lives_ok(
  $$update public.projects
      set status = 'COMPLETED'
    where id = (select project_id from wave2b1_status_ids)$$,
  'normal non-archived terminal transition remains available'
);

select throws_ok(
  $$update public.projects
      set status = 'ARCHIVED'
    where id = (select project_id from wave2b1_status_ids)$$,
  '42501', null,
  'generic update cannot enter ARCHIVED state directly'
);

reset role;
update public.projects
set status = 'ARCHIVED',
    archived_at = now(),
    archived_from_status = 'ACTIVE'
where id = (select project_id from wave2b1_status_ids);

set local role authenticated;
select set_config('request.jwt.claim.sub', (select admin_user::text from wave2b1_status_ids), true);

select throws_ok(
  $$update public.projects
      set status = 'ACTIVE', archived_at = null, archived_from_status = null
    where id = (select project_id from wave2b1_status_ids)$$,
  '42501', null,
  'generic update cannot reactivate an archived project directly'
);

select lives_ok(
  $$update public.projects
      set project_name = 'Archived metadata correction'
    where id = (select project_id from wave2b1_status_ids)$$,
  'metadata edits remain available without changing archived lifecycle fields'
);

select lives_ok(
  $$insert into public.projects (
      id, user_id, company_id, project_code, project_name, status,
      project_budget, currency, archived_at, archived_from_status
    )
    select
      p.id, p.user_id, p.company_id, p.project_code,
      'Archived metadata upsert correction', p.status,
      p.project_budget, p.currency, p.archived_at, p.archived_from_status
    from public.projects p
    where p.id = (select project_id from wave2b1_status_ids)
    on conflict (id) do update
    set project_name = excluded.project_name,
        status = excluded.status,
        archived_at = excluded.archived_at,
        archived_from_status = excluded.archived_from_status$$,
  'archived metadata upsert preserves lifecycle fields and remains editable'
);

select is(
  (select project_name from public.projects where id = (select project_id from wave2b1_status_ids)),
  'Archived metadata upsert correction',
  'archived metadata upsert applied the non-lifecycle correction'
);

reset role;
select * from finish();
rollback;
