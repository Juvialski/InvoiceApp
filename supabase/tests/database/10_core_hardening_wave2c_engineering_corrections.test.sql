begin;
select no_plan();

select has_function('public', 'preview_engineering_document_lifecycle', 'engineering document lifecycle preview exists');
select has_function('public', 'apply_engineering_document_lifecycle', 'engineering document lifecycle mutation exists');
select has_function('public', 'preview_engineering_rfi_lifecycle', 'RFI lifecycle preview exists');
select has_function('public', 'apply_engineering_rfi_lifecycle', 'RFI lifecycle mutation exists');
select has_function('public', 'preview_engineering_submittal_lifecycle', 'submittal lifecycle preview exists');
select has_function('public', 'apply_engineering_submittal_lifecycle', 'submittal lifecycle mutation exists');
select has_function('public', 'preview_engineering_daily_site_log_lifecycle', 'Daily Site Log lifecycle preview exists');
select has_function('public', 'apply_engineering_daily_site_log_lifecycle', 'Daily Site Log lifecycle mutation exists');
select has_function('public', 'create_engineering_daily_site_log_addendum', 'Daily Site Log addendum mutation exists');
select is_empty(
  $$select 1 from information_schema.role_table_grants
    where table_schema = 'public'
      and table_name in (
        'engineering_documents', 'engineering_rfis', 'engineering_submittals',
        'engineering_daily_site_logs', 'engineering_daily_site_log_addenda'
      )
      and grantee = 'authenticated'
      and privilege_type = 'DELETE'$$,
  'authenticated cannot bypass engineering lifecycle RPCs with direct DELETE'
);
select is_empty(
  $$select 1 from information_schema.routine_privileges
    where routine_schema = 'public'
      and routine_name in (
        'preview_engineering_document_lifecycle', 'apply_engineering_document_lifecycle',
        'preview_engineering_rfi_lifecycle', 'apply_engineering_rfi_lifecycle',
        'preview_engineering_submittal_lifecycle', 'apply_engineering_submittal_lifecycle',
        'preview_engineering_daily_site_log_lifecycle', 'apply_engineering_daily_site_log_lifecycle',
        'create_engineering_daily_site_log_addendum'
      )
      and lower(grantee) in ('anon', 'public')
      and privilege_type = 'EXECUTE'$$,
  'anonymous and PUBLIC roles cannot execute Wave 2C lifecycle RPCs'
);
select is_empty(
  $$select 1 from information_schema.routine_privileges
    where routine_schema = 'private'
      and routine_name in (
        'engineering_lifecycle_actor', 'engineering_lifecycle_project_available',
        'engineering_document_lifecycle_preflight', 'engineering_rfi_lifecycle_preflight',
        'engineering_submittal_lifecycle_preflight', 'engineering_daily_site_log_lifecycle_preflight'
      )
      and lower(grantee) in ('anon', 'authenticated', 'public')
      and privilege_type = 'EXECUTE'$$,
  'internal Wave 2C helpers remain closed to client roles'
);

create temp table wave2c_ids as
select
  'c2c20000-0000-4000-8000-000000000001'::uuid as admin_user,
  'c2c20000-0000-4000-8000-000000000002'::uuid as finance_user,
  'c2c20000-0000-4000-8000-000000000003'::uuid as denied_user,
  'c2c20000-0000-4000-8000-000000000004'::uuid as suspended_user,
  'c2c20000-0000-4000-8000-000000000005'::uuid as nonmember_user,
  'c2c20000-0000-4000-8000-000000000006'::uuid as outsider_user,
  'c2c10000-0000-4000-8000-000000000001'::uuid as company_a,
  'c2c10000-0000-4000-8000-000000000002'::uuid as company_b,
  'c2c30000-0000-4000-8000-000000000001'::uuid as project_a,
  'c2c30000-0000-4000-8000-000000000002'::uuid as project_b,
  'c2c40000-0000-4000-8000-000000000001'::uuid as document_unused,
  'c2c40000-0000-4000-8000-000000000002'::uuid as document_archive,
  'c2c40000-0000-4000-8000-000000000003'::uuid as document_supersede,
  'c2c40000-0000-4000-8000-000000000004'::uuid as document_linked,
  'c2c50000-0000-4000-8000-000000000001'::uuid as revision_archive,
  'c2c50000-0000-4000-8000-000000000002'::uuid as revision_linked,
  'c2c60000-0000-4000-8000-000000000001'::uuid as rfi_draft,
  'c2c60000-0000-4000-8000-000000000002'::uuid as rfi_linked,
  'c2c60000-0000-4000-8000-000000000003'::uuid as rfi_history,
  'c2c60000-0000-4000-8000-000000000004'::uuid as rfi_closed,
  'c2c70000-0000-4000-8000-000000000001'::uuid as submittal_draft,
  'c2c70000-0000-4000-8000-000000000002'::uuid as submittal_reviewed,
  'c2c80000-0000-4000-8000-000000000001'::uuid as round_draft,
  'c2c80000-0000-4000-8000-000000000002'::uuid as round_reviewed,
  'c2c90000-0000-4000-8000-000000000001'::uuid as review_reviewed,
  'c2ca0000-0000-4000-8000-000000000001'::uuid as site_log_draft,
  'c2ca0000-0000-4000-8000-000000000002'::uuid as site_log_submitted,
  'c2ca0000-0000-4000-8000-000000000003'::uuid as site_log_finalized,
  'c2cb0000-0000-4000-8000-000000000001'::uuid as weather_draft,
  'c2cb0000-0000-4000-8000-000000000002'::uuid as crew_draft,
  'c2cb0000-0000-4000-8000-000000000003'::uuid as weather_finalized,
  'c2cb0000-0000-4000-8000-000000000004'::uuid as crew_finalized;

grant select on wave2c_ids to authenticated, service_role;

insert into auth.users (id, email, encrypted_password, created_at, updated_at)
select id, email, 'x', now(), now()
from (values
  ((select admin_user from wave2c_ids), 'wave2c-admin@test.local'),
  ((select finance_user from wave2c_ids), 'wave2c-finance@test.local'),
  ((select denied_user from wave2c_ids), 'wave2c-denied@test.local'),
  ((select suspended_user from wave2c_ids), 'wave2c-suspended@test.local'),
  ((select nonmember_user from wave2c_ids), 'wave2c-nonmember@test.local'),
  ((select outsider_user from wave2c_ids), 'wave2c-outsider@test.local')
) users(id, email)
on conflict (id) do nothing;

insert into public.companies (id, name, company_code, status, default_currency, timezone, created_by_user_id, legacy_owner_user_id)
values
  ((select company_a from wave2c_ids), 'Wave 2C Engineering Company', 'wave2c-a', 'ACTIVE', 'PHP', 'Asia/Manila', (select admin_user from wave2c_ids), (select admin_user from wave2c_ids)),
  ((select company_b from wave2c_ids), 'Wave 2C Other Company', 'wave2c-b', 'ACTIVE', 'USD', 'UTC', (select outsider_user from wave2c_ids), (select outsider_user from wave2c_ids));

insert into public.company_members (company_id, user_id, role_key, status)
values
  ((select company_a from wave2c_ids), (select admin_user from wave2c_ids), 'COMPANY_ADMIN', 'ACTIVE'),
  ((select company_a from wave2c_ids), (select finance_user from wave2c_ids), 'FINANCE', 'ACTIVE'),
  ((select company_a from wave2c_ids), (select denied_user from wave2c_ids), 'FINANCE', 'ACTIVE'),
  ((select company_a from wave2c_ids), (select suspended_user from wave2c_ids), 'FINANCE', 'SUSPENDED'),
  ((select company_b from wave2c_ids), (select outsider_user from wave2c_ids), 'COMPANY_ADMIN', 'ACTIVE');

insert into public.deployment_configuration (singleton, company_id)
values (true, (select company_a from wave2c_ids));

insert into public.company_member_permission_overrides (company_id, membership_id, permission_key, effect, created_by_user_id)
select cm.company_id, cm.id, permission_key, 'DENY', (select admin_user from wave2c_ids)
from public.company_members cm
cross join (values
  ('engineering.documents.manage'), ('engineering.rfis.manage'),
  ('engineering.submittals.manage'), ('engineering.sitelogs.manage')
) denied(permission_key)
where cm.company_id = (select company_a from wave2c_ids)
  and cm.user_id = (select denied_user from wave2c_ids);

insert into public.projects (id, user_id, company_id, project_code, project_name, status, project_budget, currency)
values
  ((select project_a from wave2c_ids), (select admin_user from wave2c_ids), (select company_a from wave2c_ids), 'W2C-A', 'Wave 2C Engineering Project', 'ACTIVE', 100000, 'PHP'),
  ((select project_b from wave2c_ids), (select outsider_user from wave2c_ids), (select company_b from wave2c_ids), 'W2C-B', 'Wave 2C Foreign Project', 'ACTIVE', 100000, 'USD');

select set_config('request.jwt.claim.sub', (select admin_user::text from wave2c_ids), true);

insert into storage.objects (id, bucket_id, name, metadata)
values
  (gen_random_uuid(), 'engineering-documents', format('companies/%s/documents/%s/revisions/%s/archive.pdf', (select company_a from wave2c_ids), (select document_archive from wave2c_ids), (select revision_archive from wave2c_ids)), '{}'::jsonb),
  (gen_random_uuid(), 'engineering-documents', format('companies/%s/documents/%s/revisions/%s/linked.pdf', (select company_a from wave2c_ids), (select document_linked from wave2c_ids), (select revision_linked from wave2c_ids)), '{}'::jsonb);

insert into public.engineering_documents (id, company_id, project_id, document_number, title, discipline, document_type, status, current_revision_number, created_by_user_id)
values
  ((select document_unused from wave2c_ids), (select company_a from wave2c_ids), (select project_a from wave2c_ids), 'W2C-DOC-UNUSED', 'Unused document shell', 'GENERAL_ENGINEERING', 'OTHER', 'DRAFT', '0', (select admin_user from wave2c_ids)),
  ((select document_archive from wave2c_ids), (select company_a from wave2c_ids), (select project_a from wave2c_ids), 'W2C-DOC-ARCHIVE', 'Document with immutable source', 'STRUCTURAL', 'DRAWING', 'DRAFT', '1', (select admin_user from wave2c_ids)),
  ((select document_supersede from wave2c_ids), (select company_a from wave2c_ids), (select project_a from wave2c_ids), 'W2C-DOC-SUPERSEDE', 'Document to supersede', 'CIVIL', 'REPORT', 'DRAFT', '0', (select admin_user from wave2c_ids)),
  ((select document_linked from wave2c_ids), (select company_a from wave2c_ids), (select project_a from wave2c_ids), 'W2C-DOC-LINKED', 'Document with coordination links', 'MECHANICAL', 'DRAWING', 'DRAFT', '1', (select admin_user from wave2c_ids));

insert into public.engineering_document_revisions (id, company_id, document_id, revision_number, file_name, file_path, file_size_bytes, file_type, file_fingerprint, status, created_by_user_id)
values
  ((select revision_archive from wave2c_ids), (select company_a from wave2c_ids), (select document_archive from wave2c_ids), '1', 'archive.pdf', format('companies/%s/documents/%s/revisions/%s/archive.pdf', (select company_a from wave2c_ids), (select document_archive from wave2c_ids), (select revision_archive from wave2c_ids)), 100, 'application/pdf', 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'APPROVED', (select admin_user from wave2c_ids)),
  ((select revision_linked from wave2c_ids), (select company_a from wave2c_ids), (select document_linked from wave2c_ids), '1', 'linked.pdf', format('companies/%s/documents/%s/revisions/%s/linked.pdf', (select company_a from wave2c_ids), (select document_linked from wave2c_ids), (select revision_linked from wave2c_ids)), 100, 'application/pdf', 'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', 'APPROVED', (select admin_user from wave2c_ids));

update public.engineering_documents
set current_revision_id = (select revision_archive from wave2c_ids)
where id = (select document_archive from wave2c_ids);
update public.engineering_documents
set current_revision_id = (select revision_linked from wave2c_ids)
where id = (select document_linked from wave2c_ids);

insert into public.engineering_rfis (id, company_id, project_id, rfi_number, subject, question, discipline, status, date_raised, created_by_user_id, opened_at, closed_at)
values
  ((select rfi_draft from wave2c_ids), (select company_a from wave2c_ids), (select project_a from wave2c_ids), 'W2C-RFI-DRAFT', 'Unused RFI draft', 'Draft question', 'CIVIL', 'DRAFT', date '2026-08-29', (select admin_user from wave2c_ids), null, null),
  ((select rfi_linked from wave2c_ids), (select company_a from wave2c_ids), (select project_a from wave2c_ids), 'W2C-RFI-LINKED', 'Linked RFI', 'Linked question', 'STRUCTURAL', 'OPEN', date '2026-08-29', (select admin_user from wave2c_ids), now(), null),
  ((select rfi_history from wave2c_ids), (select company_a from wave2c_ids), (select project_a from wave2c_ids), 'W2C-RFI-HISTORY', 'RFI with response history', 'Formal question', 'MECHANICAL', 'OPEN', date '2026-08-29', (select admin_user from wave2c_ids), now(), null),
  ((select rfi_closed from wave2c_ids), (select company_a from wave2c_ids), (select project_a from wave2c_ids), 'W2C-RFI-CLOSED', 'Closed RFI', 'Closed question', 'ELECTRICAL', 'CLOSED', date '2026-08-29', (select admin_user from wave2c_ids), now(), now());

insert into public.engineering_rfi_document_links (company_id, rfi_id, document_id, revision_id, linked_by_user_id)
values ((select company_a from wave2c_ids), (select rfi_linked from wave2c_ids), (select document_linked from wave2c_ids), (select revision_linked from wave2c_ids), (select admin_user from wave2c_ids));

insert into public.engineering_submittals (id, company_id, project_id, submittal_number, title, discipline, category, current_round, status, created_by_user_id, submitted_at)
values
  ((select submittal_draft from wave2c_ids), (select company_a from wave2c_ids), (select project_a from wave2c_ids), 'W2C-SUB-DRAFT', 'Unused submittal draft', 'CIVIL', 'PRODUCT_DATA', 1, 'DRAFT', (select admin_user from wave2c_ids), null),
  ((select submittal_reviewed from wave2c_ids), (select company_a from wave2c_ids), (select project_a from wave2c_ids), 'W2C-SUB-REVIEWED', 'Reviewed submittal', 'STRUCTURAL', 'SHOP_DRAWING', 1, 'APPROVED', (select admin_user from wave2c_ids), now());

insert into public.engineering_submittal_rounds (id, company_id, submittal_id, round_number, status, submitted_at, completed_at, created_by_user_id)
values
  ((select round_draft from wave2c_ids), (select company_a from wave2c_ids), (select submittal_draft from wave2c_ids), 1, 'DRAFT', null, null, (select admin_user from wave2c_ids)),
  ((select round_reviewed from wave2c_ids), (select company_a from wave2c_ids), (select submittal_reviewed from wave2c_ids), 1, 'APPROVED', now(), now(), (select admin_user from wave2c_ids));

insert into public.engineering_submittal_reviews (id, company_id, submittal_id, round_id, round_number, decision, review_comments, reviewed_by_user_id)
values ((select review_reviewed from wave2c_ids), (select company_a from wave2c_ids), (select submittal_reviewed from wave2c_ids), (select round_reviewed from wave2c_ids), 1, 'APPROVED', 'Accepted with the coordinated revision.', (select admin_user from wave2c_ids));

insert into public.engineering_submittal_document_links (company_id, submittal_id, round_id, document_id, revision_id, linked_by_user_id)
values ((select company_a from wave2c_ids), (select submittal_reviewed from wave2c_ids), (select round_reviewed from wave2c_ids), (select document_linked from wave2c_ids), (select revision_linked from wave2c_ids), (select admin_user from wave2c_ids));

insert into public.engineering_daily_site_logs (id, company_id, project_id, site_date, report_number, status, prepared_by_user_id, work_summary, created_at, updated_at, submitted_at, submitted_by_user_id, finalized_at, finalized_by_user_id)
values
  ((select site_log_draft from wave2c_ids), (select company_a from wave2c_ids), (select project_a from wave2c_ids), date '2026-08-27', 'W2C-DSL-DRAFT', 'DRAFT', (select admin_user from wave2c_ids), '', now(), now(), null, null, null, null),
  ((select site_log_submitted from wave2c_ids), (select company_a from wave2c_ids), (select project_a from wave2c_ids), date '2026-08-28', 'W2C-DSL-SUBMITTED', 'SUBMITTED', (select admin_user from wave2c_ids), 'Submitted field observations', now(), now(), now(), (select admin_user from wave2c_ids), null, null),
  ((select site_log_finalized from wave2c_ids), (select company_a from wave2c_ids), (select project_a from wave2c_ids), date '2026-08-29', 'W2C-DSL-FINALIZED', 'FINALIZED', (select admin_user from wave2c_ids), 'Finalized original observation', now(), now(), now(), (select admin_user from wave2c_ids), (select admin_user from wave2c_ids), now());

insert into public.engineering_daily_site_log_weather (id, company_id, site_log_id, condition, created_at, updated_at)
values
  ((select weather_finalized from wave2c_ids), (select company_a from wave2c_ids), (select site_log_finalized from wave2c_ids), 'OVERCAST', now(), now());
insert into public.engineering_daily_site_log_crew (id, company_id, site_log_id, crew_label, headcount, created_at, updated_at)
values
  ((select crew_finalized from wave2c_ids), (select company_a from wave2c_ids), (select site_log_finalized from wave2c_ids), 'Final crew', 4, now(), now());
insert into public.engineering_daily_site_log_events (company_id, site_log_id, event_type, from_status, to_status, actor_user_id)
values
  ((select company_a from wave2c_ids), (select site_log_draft from wave2c_ids), 'CREATED', null, 'DRAFT', (select admin_user from wave2c_ids)),
  ((select company_a from wave2c_ids), (select site_log_submitted from wave2c_ids), 'CREATED', null, 'DRAFT', (select admin_user from wave2c_ids)),
  ((select company_a from wave2c_ids), (select site_log_submitted from wave2c_ids), 'SUBMITTED', 'DRAFT', 'SUBMITTED', (select admin_user from wave2c_ids)),
  ((select company_a from wave2c_ids), (select site_log_finalized from wave2c_ids), 'CREATED', null, 'DRAFT', (select admin_user from wave2c_ids)),
  ((select company_a from wave2c_ids), (select site_log_finalized from wave2c_ids), 'SUBMITTED', 'DRAFT', 'SUBMITTED', (select admin_user from wave2c_ids)),
  ((select company_a from wave2c_ids), (select site_log_finalized from wave2c_ids), 'FINALIZED', 'SUBMITTED', 'FINALIZED', (select admin_user from wave2c_ids));

set local role anon;
select throws_ok($$select public.preview_engineering_document_lifecycle('c2c40000-0000-4000-8000-000000000001'::uuid)$$, '42501', null, 'anonymous document lifecycle preview is denied');
select throws_ok($$select public.preview_engineering_rfi_lifecycle('c2c60000-0000-4000-8000-000000000001'::uuid)$$, '42501', null, 'anonymous RFI lifecycle preview is denied');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', (select admin_user::text from wave2c_ids), true);

select is((public.preview_engineering_document_lifecycle((select document_unused from wave2c_ids))->>'canDelete')::boolean, true, 'unused document shell is delete-eligible');
select is((public.preview_engineering_document_lifecycle((select document_unused from wave2c_ids))->>'recommendedAction'), 'DELETE_UNUSED', 'unused document recommends guarded deletion');
select is((public.preview_engineering_document_lifecycle((select document_linked from wave2c_ids))->>'canDelete')::boolean, false, 'linked document cannot be hard deleted');
select is((public.preview_engineering_document_lifecycle((select document_linked from wave2c_ids))->'dependencies'->>'rfiLinks')::bigint, 1::bigint, 'document preflight reports RFI links');
select is((public.preview_engineering_document_lifecycle((select document_archive from wave2c_ids))->>'canArchive')::boolean, true, 'document with source can be archived');
select is((public.apply_engineering_document_lifecycle((select document_archive from wave2c_ids), 'ARCHIVE', 'Superseded drawing set')->>'changed')::boolean, true, 'document archive is guarded and confirmed');
select is((select status from public.engineering_documents where id = (select document_archive from wave2c_ids)), 'ARCHIVED', 'document archive state is persisted');
select is((select count(*) from public.engineering_document_revisions where document_id = (select document_archive from wave2c_ids)), 1::bigint, 'document archive preserves immutable revision');
select is((public.apply_engineering_document_lifecycle((select document_supersede from wave2c_ids), 'SUPERSEDE', 'Replaced by coordinated issue')->>'changed')::boolean, true, 'document supersede is guarded and confirmed');
select is((select status from public.engineering_documents where id = (select document_supersede from wave2c_ids)), 'SUPERSEDED', 'document supersede state is persisted');
select throws_ok($$update public.engineering_documents set status = 'ARCHIVED' where id = 'c2c40000-0000-4000-8000-000000000003'::uuid$$, '42501', null, 'direct document lifecycle update is denied');
select throws_ok($$delete from public.engineering_documents where id = 'c2c40000-0000-4000-8000-000000000001'::uuid$$, '42501', null, 'direct document DELETE is denied');
select is((public.apply_engineering_document_lifecycle((select document_unused from wave2c_ids), 'DELETE_UNUSED', 'Empty intake shell')->>'deleted')::boolean, true, 'unused document deletes through guarded RPC');
select is((select count(*) from public.engineering_documents where id = (select document_unused from wave2c_ids)), 0::bigint, 'unused document row is removed');
select is((select count(*) from public.company_audit_events where event_type = 'ENGINEERING_DOCUMENT_DELETED_UNUSED' and target_id = (select document_unused from wave2c_ids)), 1::bigint, 'unused document deletion is audited');

select is((public.preview_engineering_rfi_lifecycle((select rfi_draft from wave2c_ids))->>'canDelete')::boolean, true, 'unused RFI draft is delete-eligible');
select is((public.apply_engineering_rfi_lifecycle((select rfi_draft from wave2c_ids), 'DELETE_UNUSED', null)->>'deleted')::boolean, true, 'unused RFI draft deletes through guarded RPC');
select throws_ok($$select public.apply_engineering_rfi_lifecycle('c2c60000-0000-4000-8000-000000000002'::uuid, 'DELETE_UNUSED', null)$$, '42501', null, 'linked/open RFI deletion is rejected');
select is((public.preview_engineering_rfi_lifecycle((select rfi_linked from wave2c_ids))->'dependencies'->>'documentLinks')::bigint, 1::bigint, 'RFI preflight reports linked revision history');
select public.respond_engineering_rfi((select company_a from wave2c_ids), (select rfi_history from wave2c_ids), 'c2cc0000-0000-4000-8000-000000000001'::uuid, 'Original formal answer', 'RESPONSE', true, '{}'::uuid[]);
select public.respond_engineering_rfi((select company_a from wave2c_ids), (select rfi_history from wave2c_ids), 'c2cc0000-0000-4000-8000-000000000002'::uuid, 'Corrected answer retained as a new response', 'CORRECTION', false, '{}'::uuid[]);
select is((select count(*) from public.engineering_rfi_responses where rfi_id = (select rfi_history from wave2c_ids)), 2::bigint, 'RFI responses remain append-only');
select is((public.apply_engineering_rfi_lifecycle((select rfi_history from wave2c_ids), 'VOID', 'Question was superseded')->>'changed')::boolean, true, 'RFI void requires and records a reason');
select is((select status from public.engineering_rfis where id = (select rfi_history from wave2c_ids)), 'VOID', 'RFI void state is persisted');
select is((select count(*) from public.engineering_rfi_responses where rfi_id = (select rfi_history from wave2c_ids)), 2::bigint, 'RFI responses survive void');
select throws_ok($$select public.apply_engineering_rfi_lifecycle('c2c60000-0000-4000-8000-000000000004'::uuid, 'VOID', 'Late correction')$$, '42501', null, 'closed RFI cannot be voided');

select is((public.preview_engineering_submittal_lifecycle((select submittal_draft from wave2c_ids))->>'canDelete')::boolean, true, 'unused submittal draft is delete-eligible');
select is((public.apply_engineering_submittal_lifecycle((select submittal_draft from wave2c_ids), 'DELETE_UNUSED', null)->>'deleted')::boolean, true, 'unused submittal draft deletes through guarded RPC');
select is((select count(*) from public.engineering_submittal_rounds where id = (select round_draft from wave2c_ids)), 0::bigint, 'disposable draft round is removed with its parent');
select is((public.preview_engineering_submittal_lifecycle((select submittal_reviewed from wave2c_ids))->>'canDelete')::boolean, false, 'reviewed submittal cannot be hard deleted');
select is((public.preview_engineering_submittal_lifecycle((select submittal_reviewed from wave2c_ids))->'dependencies'->>'reviews')::bigint, 1::bigint, 'submittal preflight reports review history');
select is((public.apply_engineering_submittal_lifecycle((select submittal_reviewed from wave2c_ids), 'VOID', 'Withdrawn after review')->>'changed')::boolean, true, 'reviewed submittal can be voided with a reason');
select is((select status from public.engineering_submittals where id = (select submittal_reviewed from wave2c_ids)), 'VOID', 'submittal void state is persisted');
select is((select count(*) from public.engineering_submittal_rounds where id = (select round_reviewed from wave2c_ids)), 1::bigint, 'submittal round survives void');
select is((select count(*) from public.engineering_submittal_reviews where id = (select review_reviewed from wave2c_ids)), 1::bigint, 'submittal review survives void');
select is((select count(*) from public.engineering_submittal_document_links where submittal_id = (select submittal_reviewed from wave2c_ids)), 1::bigint, 'submittal revision link survives void');

select is((public.preview_engineering_daily_site_log_lifecycle((select site_log_draft from wave2c_ids))->>'canDelete')::boolean, true, 'editable draft Site Log is delete-eligible');
select is((public.apply_engineering_daily_site_log_lifecycle((select site_log_draft from wave2c_ids), 'DELETE_UNUSED', null)->>'deleted')::boolean, true, 'draft Site Log deletes through guarded RPC');
select is((select count(*) from public.engineering_daily_site_log_crew where site_log_id = (select site_log_draft from wave2c_ids)), 0::bigint, 'draft Site Log observations are removed with unused draft');
select is((public.preview_engineering_daily_site_log_lifecycle((select site_log_submitted from wave2c_ids))->>'canDelete')::boolean, false, 'submitted Site Log cannot be hard deleted');
select is((public.apply_engineering_daily_site_log_lifecycle((select site_log_submitted from wave2c_ids), 'VOID', 'Duplicate field report')->>'changed')::boolean, true, 'submitted Site Log can be voided with a reason');
select is((select work_summary from public.engineering_daily_site_logs where id = (select site_log_submitted from wave2c_ids)), 'Submitted field observations', 'void preserves submitted Site Log observations');
select is((public.preview_engineering_daily_site_log_lifecycle((select site_log_finalized from wave2c_ids))->>'canAddendum')::boolean, true, 'finalized Site Log exposes addendum correction path');
select is((public.create_engineering_daily_site_log_addendum((select site_log_finalized from wave2c_ids), 'Corrected inspection reference', 'The inspection reference is corrected to IR-204; original weather and workforce observations remain unchanged.') ->> 'addendum_number')::integer, 1, 'finalized Site Log addendum is appended');
select is((select work_summary from public.engineering_daily_site_logs where id = (select site_log_finalized from wave2c_ids)), 'Finalized original observation', 'finalized Site Log original content remains unchanged');
select is((select count(*) from public.engineering_daily_site_log_addenda where site_log_id = (select site_log_finalized from wave2c_ids)), 1::bigint, 'Site Log addendum history is retained');
select throws_ok($$select public.apply_engineering_daily_site_log_lifecycle('c2ca0000-0000-4000-8000-000000000003'::uuid, 'VOID', 'Late correction')$$, '42501', null, 'finalized Site Log cannot be voided');
select throws_ok($$update public.engineering_daily_site_logs set work_summary = 'forged' where id = 'c2ca0000-0000-4000-8000-000000000003'::uuid$$, '42501', null, 'direct finalized Site Log update is denied');
select throws_ok($$update public.engineering_daily_site_log_addenda set correction_text = 'forged' where site_log_id = 'c2ca0000-0000-4000-8000-000000000003'::uuid$$, '42501', null, 'addendum history cannot be rewritten');

select set_config('request.jwt.claim.sub', (select finance_user::text from wave2c_ids), true);
select lives_ok($$select public.preview_engineering_document_lifecycle('c2c40000-0000-4000-8000-000000000002'::uuid)$$, 'Finance read permission permits bounded document preflight');
select throws_ok($$select public.apply_engineering_document_lifecycle('c2c40000-0000-4000-8000-000000000002'::uuid, 'SUPERSEDE', 'Finance attempt')$$, '42501', null, 'Finance cannot manage document lifecycle without manage permission');
select lives_ok($$select public.preview_engineering_rfi_lifecycle('c2c60000-0000-4000-8000-000000000004'::uuid)$$, 'Finance read permission permits bounded RFI preflight');
select throws_ok($$select public.apply_engineering_rfi_lifecycle('c2c60000-0000-4000-8000-000000000004'::uuid, 'VOID', 'Finance attempt')$$, '42501', null, 'Finance cannot manage RFI lifecycle without manage permission');

select set_config('request.jwt.claim.sub', (select denied_user::text from wave2c_ids), true);
select lives_ok($$select public.preview_engineering_submittal_lifecycle('c2c70000-0000-4000-8000-000000000002'::uuid)$$, 'explicit DENY user retains permitted read preflight');
select throws_ok($$select public.apply_engineering_submittal_lifecycle('c2c70000-0000-4000-8000-000000000002'::uuid, 'VOID', 'Denied attempt')$$, '42501', null, 'explicit DENY overrides role manage path');

select set_config('request.jwt.claim.sub', (select suspended_user::text from wave2c_ids), true);
select throws_ok($$select public.preview_engineering_daily_site_log_lifecycle('c2ca0000-0000-4000-8000-000000000003'::uuid)$$, '42501', null, 'suspended member cannot preview Site Log lifecycle');
select set_config('request.jwt.claim.sub', (select nonmember_user::text from wave2c_ids), true);
select throws_ok($$select public.preview_engineering_rfi_lifecycle('c2c60000-0000-4000-8000-000000000004'::uuid)$$, '42501', null, 'non-member cannot preview RFI lifecycle');
select set_config('request.jwt.claim.sub', (select outsider_user::text from wave2c_ids), true);
select throws_ok($$select public.preview_engineering_document_lifecycle('c2c40000-0000-4000-8000-000000000002'::uuid)$$, '42501', null, 'member of another company cannot preview deployment document lifecycle');

select * from finish();
rollback;
