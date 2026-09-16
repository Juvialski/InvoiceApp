begin;
select no_plan();

create temp table brevo_ids as
select
  '00000000-0000-4000-8000-000000004401'::uuid as admin_user,
  '00000000-0000-4000-8000-000000004402'::uuid as viewer_user,
  'aaaaaaaa-0000-4000-8000-000000004401'::uuid as company_id;
grant select on brevo_ids to authenticated, service_role;

select is(to_regclass('public.gmail_provider_credentials')::text, null, 'encrypted Gmail refresh-token storage is retired');
select is(to_regprocedure('public.server_get_gmail_provider_credential(uuid,uuid)')::text, null, 'Gmail credential read RPC is retired');
select ok(not has_table_privilege('authenticated', 'public.gmail_connections', 'INSERT'), 'ordinary callers cannot create retained Gmail connection state');
select ok(not has_table_privilege('authenticated', 'public.gmail_connections', 'UPDATE'), 'ordinary callers cannot mutate retained Gmail connection state');
select ok(not has_table_privilege('authenticated', 'public.gmail_sync_state', 'INSERT'), 'ordinary callers cannot create retained Gmail cursor state');
select ok(not has_table_privilege('authenticated', 'public.gmail_sync_state', 'UPDATE'), 'ordinary callers cannot mutate retained Gmail cursor state');
select ok(has_function_privilege('authenticated', 'public.complete_email_delivery_intent(uuid,text,text,text,text,boolean)', 'EXECUTE'), 'authenticated callers can complete Brevo email intents through the guarded RPC');

insert into auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ((select admin_user from brevo_ids), 'brevo-admin@test.local', 'x', now(), now(), now()),
  ((select viewer_user from brevo_ids), 'brevo-viewer@test.local', 'x', now(), now(), now());
insert into public.companies (id, name, company_code, status, default_currency, timezone, created_by_user_id, legacy_owner_user_id)
values ((select company_id from brevo_ids), 'Brevo Delivery Company', 'brevo-delivery', 'ACTIVE', 'PHP', 'Asia/Manila', (select admin_user from brevo_ids), (select admin_user from brevo_ids));
insert into public.company_members (company_id, user_id, role_key, status)
values
  ((select company_id from brevo_ids), (select admin_user from brevo_ids), 'COMPANY_ADMIN', 'ACTIVE'),
  ((select company_id from brevo_ids), (select viewer_user from brevo_ids), 'VIEWER', 'ACTIVE');
insert into public.deployment_configuration (singleton, company_id)
values (true, (select company_id from brevo_ids))
on conflict (singleton) do update set company_id = excluded.company_id;

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', (select admin_user::text from brevo_ids), true);

create temp table brevo_first as
select (claim->'intent'->>'id')::uuid as intent_id, claim
from (
  select public.claim_document_send_intent(
    null,
    'GENERAL_EMAIL',
    null,
    'brevo-first',
    null,
    '["recipient@brevo.test"]'::jsonb,
    '[]'::jsonb,
    'Reviewed Brevo message',
    null,
    repeat('a', 64)
  ) as claim
) payload;
grant select on brevo_first to authenticated, service_role;

select is((select claim->'intent'->>'delivery_channel' from brevo_first), 'EMAIL', 'new email intents use the email channel');
select is((select claim->'intent'->>'provider_id' from brevo_first), 'BREVO', 'new email intents identify Brevo');
select is((select claim->'intent'->>'gmail_message_id' from brevo_first), null, 'new Brevo intents do not populate historical Gmail message IDs');
select is((select claim->'intent'->>'status' from brevo_first), 'PENDING', 'new Brevo intents begin pending');

select lives_ok($$select public.complete_email_delivery_intent((select intent_id from brevo_first), 'ACCEPTED', '<brevo-first>', 'accepted', null, false)$$, 'Brevo acceptance can complete the durable intent');
select is((select status from public.document_send_intents where id = (select intent_id from brevo_first)), 'ACCEPTED', 'accepted provider state is durable');
select is((select provider_message_id from public.document_send_intents where id = (select intent_id from brevo_first)), '<brevo-first>', 'Brevo message ID is stored in provider history');
select is((select count(*) from public.document_send_audits where send_intent_id = (select intent_id from brevo_first) and status = 'ACCEPTED' and provider_id = 'BREVO'), 1::bigint, 'accepted Brevo delivery receives one immutable audit row');
select is((select count(*) from public.document_send_intents where id = (select intent_id from brevo_first) and status <> 'DELIVERED'), 1::bigint, 'provider acceptance is not mislabeled as delivered');

select is((public.claim_document_send_intent(null, 'GENERAL_EMAIL', null, 'brevo-first', null, '["recipient@brevo.test"]'::jsonb, '[]'::jsonb, 'Reviewed Brevo message', null, repeat('a', 64)))->>'idempotent', 'true', 'repeating the same Brevo confirmation is idempotent');

create temp table brevo_unknown as
select (claim->'intent'->>'id')::uuid as intent_id
from (
  select public.claim_document_send_intent(null, 'GENERAL_EMAIL', null, 'brevo-unknown', null, '["recipient@brevo.test"]'::jsonb, '[]'::jsonb, 'Ambiguous Brevo message', null, repeat('b', 64)) as claim
) payload;
select lives_ok($$select public.complete_email_delivery_intent((select intent_id from brevo_unknown), 'UNKNOWN', null, 'timeout', 'Brevo acceptance could not be confirmed', true)$$, 'ambiguous Brevo outcome becomes UNKNOWN');
select is((public.claim_document_send_intent(null, 'GENERAL_EMAIL', null, 'brevo-unknown', null, '["recipient@brevo.test"]'::jsonb, '[]'::jsonb, 'Ambiguous Brevo message', null, repeat('b', 64)))->>'reconcileRequired', 'true', 'ambiguous Brevo outcome locks blind retry');

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', (select viewer_user::text from brevo_ids), true);
select throws_ok($$select public.claim_document_send_intent(null, 'GENERAL_EMAIL', null, 'brevo-viewer', null, '["recipient@brevo.test"]'::jsonb, '[]'::jsonb, 'Viewer message', null, repeat('c', 64))$$, '42501', null, 'viewer cannot claim a Brevo send without outbound permission');

select * from finish();
rollback;
