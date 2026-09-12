begin;
select no_plan();

create temp table sms_ids as
select
  '00000000-0000-4000-8000-000000008801'::uuid as admin_user,
  '00000000-0000-4000-8000-000000008802'::uuid as viewer_user,
  'aaaaaaaa-0000-4000-8000-000000008801'::uuid as company_id;
grant select on sms_ids to authenticated, service_role;

select has_function('public', 'claim_sms_send_intent', 'SMS claim RPC exists');
select has_function('public', 'complete_sms_delivery_intent', 'SMS completion RPC exists');
select has_function('public', 'ensure_android_sms_reconciliation_reference', 'Android SMS reconciliation reference trigger function exists');
select isnt_empty($$select 1 from pg_constraint where conname = 'document_send_intents_delivery_channel_check'$$, 'SMS channel constraint exists');
select isnt_empty($$select 1 from pg_constraint where conname = 'document_send_intents_delivery_shape_check'$$, 'SMS delivery shape constraint exists');
select isnt_empty($$select 1 from pg_indexes where indexname = 'document_send_intents_provider_message_unique'$$, 'provider message uniqueness is company scoped');
select is_empty($$select 1 from information_schema.columns where table_schema = 'public' and table_name in ('document_send_intents', 'document_send_audits') and column_name in ('api_token', 'password', 'private_token')$$, 'delivery history has no provider secret columns');

insert into auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ((select admin_user from sms_ids), 'sms-admin@test.local', 'x', now(), now(), now()),
  ((select viewer_user from sms_ids), 'sms-viewer@test.local', 'x', now(), now(), now());
insert into public.companies (id, name, company_code, status, default_currency, timezone, created_by_user_id, legacy_owner_user_id)
values
  ((select company_id from sms_ids), 'SMS Test Company', 'sms-test-company', 'ACTIVE', 'PHP', 'Asia/Manila', (select admin_user from sms_ids), (select admin_user from sms_ids));
insert into public.company_members (company_id, user_id, role_key, status)
values
  ((select company_id from sms_ids), (select admin_user from sms_ids), 'COMPANY_ADMIN', 'ACTIVE'),
  ((select company_id from sms_ids), (select viewer_user from sms_ids), 'VIEWER', 'ACTIVE');
insert into public.deployment_configuration (singleton, company_id)
values (true, (select company_id from sms_ids))
on conflict (singleton) do update set company_id = excluded.company_id;

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', (select admin_user::text from sms_ids), true);

create temp table sms_attempt as
select ((public.claim_sms_send_intent('ANDROID_SIM_GATEWAY', '+639171234567', 'sms-rpc-attempt-1', repeat('a', 64)))->'intent'->>'id')::uuid as intent_id;
grant select on sms_attempt to authenticated, service_role;
select is((select count(*) from sms_attempt), 1::bigint, 'first SMS claim creates one intent');
select is((select delivery_channel from public.document_send_intents where id = (select intent_id from sms_attempt)), 'SMS', 'SMS intent stores the SMS channel');
select is((select delivery_kind from public.document_send_intents where id = (select intent_id from sms_attempt)), 'GENERAL_SMS', 'SMS intent uses the shared delivery kind');
select is((select document_type from public.document_send_intents where id = (select intent_id from sms_attempt)), 'GENERAL_SMS', 'SMS intent has no financial document type');
select is((select destination from public.document_send_intents where id = (select intent_id from sms_attempt)), '+639171234567', 'SMS destination is canonical');
select is((select recipients->>0 from public.document_send_intents where id = (select intent_id from sms_attempt)), '+639171234567', 'SMS intent has exactly one canonical recipient');
select is((select attachment_source from public.document_send_intents where id = (select intent_id from sms_attempt)), 'NONE', 'SMS intent has no attachment provenance');
select is(
  (select provider_message_id from public.document_send_intents where id = (select intent_id from sms_attempt)),
  'hs_' || left(encode(extensions.digest(convert_to('sms-rpc-attempt-1', 'UTF8'), 'sha256'), 'hex'), 32),
  'Android SMS claim durably reserves the same deterministic gateway message id used for timeout reconciliation'
);
select is((public.claim_sms_send_intent('ANDROID_SIM_GATEWAY', '+639171234567', 'sms-rpc-attempt-1', repeat('a', 64)))->>'reconcileRequired', 'true', 'same SMS key cannot be sent again while pending');
select throws_ok($$select public.claim_sms_send_intent('ANDROID_SIM_GATEWAY', '+14155550123', 'sms-rpc-invalid-destination', repeat('b', 64))$$, '22023', null, 'non-Philippine SMS destination is rejected by the database boundary');
select throws_ok($$select public.claim_sms_send_intent('ANDROID_SIM_GATEWAY', '+639171234567', 'sms-rpc-invalid-hash', repeat('x', 64))$$, '22023', null, 'invalid SMS body hash is rejected');

select lives_ok($$select public.complete_sms_delivery_intent((select intent_id from sms_attempt), 'ACCEPTED', 'gateway-message-1', 'Pending', null, false)$$, 'accepted provider response is durable');
select is((select status from public.document_send_intents where id = (select intent_id from sms_attempt)), 'ACCEPTED', 'accepted status is stored');
select is((select count(*) from public.document_send_audits where send_intent_id = (select intent_id from sms_attempt)), 0::bigint, 'non-terminal accepted status does not create a terminal audit');
select lives_ok($$select public.complete_sms_delivery_intent((select intent_id from sms_attempt), 'SENT', 'gateway-message-1', 'Sent', null, false)$$, 'sent provider response is durable');
select is((select count(*) from public.document_send_audits where send_intent_id = (select intent_id from sms_attempt)), 1::bigint, 'sent status creates one append-only audit event');
select lives_ok($$select public.complete_sms_delivery_intent((select intent_id from sms_attempt), 'DELIVERED', 'gateway-message-1', 'Delivered', null, false)$$, 'delivered provider response is durable');
select is((select count(*) from public.document_send_audits where send_intent_id = (select intent_id from sms_attempt)), 2::bigint, 'delivered status appends a second audit event');
select is((select count(*) from public.document_send_audits where send_intent_id = (select intent_id from sms_attempt) and status = 'DELIVERED'), 1::bigint, 'latest delivery evidence is retained');
select is((public.claim_sms_send_intent('ANDROID_SIM_GATEWAY', '+639171234567', 'sms-rpc-attempt-1', repeat('a', 64)))->>'idempotent', 'true', 'same key after delivery is idempotent');

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', (select viewer_user::text from sms_ids), true);
select is((select count(*) from public.document_send_intents where delivery_kind = 'GENERAL_SMS'), 0::bigint, 'users without documents.send cannot read SMS history');
select throws_ok($$select public.claim_sms_send_intent('PHILSMS', '+639171234567', 'sms-viewer-attempt', repeat('c', 64))$$, '42501', null, 'users without documents.send cannot claim SMS sends');

select * from finish();
rollback;
