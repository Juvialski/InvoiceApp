begin;
select plan(28);

create temporary table entity_media_ids as
select
  '00000000-0000-4000-8000-000000004401'::uuid as admin_user,
  '00000000-0000-4000-8000-000000004402'::uuid as viewer_user,
  '00000000-0000-4000-8000-000000004403'::uuid as outsider_user,
  'aaaaaaaa-0000-4000-8000-000000004401'::uuid as company_id,
  'bbbbbbbb-0000-4000-8000-000000004401'::uuid as other_company_id,
  'cccccccc-0000-4000-8000-000000004401'::uuid as project_id,
  'dddddddd-0000-4000-8000-000000004401'::uuid as equipment_id,
  'eeeeeeee-0000-4000-8000-000000004401'::uuid as inventory_item_id,
  '11111111-0000-4000-8000-000000004401'::uuid as project_media_id,
  '22222222-0000-4000-8000-000000004401'::uuid as replacement_media_id,
  '33333333-0000-4000-8000-000000004401'::uuid as equipment_media_id,
  '44444444-0000-4000-8000-000000004401'::uuid as material_media_id;
grant select on entity_media_ids to authenticated, service_role;

insert into auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ((select admin_user from entity_media_ids), 'entity-media-admin@test.local', 'x', now(), now(), now()),
  ((select viewer_user from entity_media_ids), 'entity-media-viewer@test.local', 'x', now(), now(), now()),
  ((select outsider_user from entity_media_ids), 'entity-media-outsider@test.local', 'x', now(), now(), now());

insert into public.companies (id, name, company_code, status, default_currency, timezone, created_by_user_id, legacy_owner_user_id)
values
  ((select company_id from entity_media_ids), 'Entity Media Runtime Company', 'entity-media-runtime-company', 'ACTIVE', 'PHP', 'Asia/Manila', (select admin_user from entity_media_ids), (select admin_user from entity_media_ids)),
  ((select other_company_id from entity_media_ids), 'Entity Media Other Company', 'entity-media-other-company', 'ACTIVE', 'PHP', 'Asia/Manila', (select outsider_user from entity_media_ids), (select outsider_user from entity_media_ids));

insert into public.company_members (company_id, user_id, role_key, status)
values
  ((select company_id from entity_media_ids), (select admin_user from entity_media_ids), 'COMPANY_ADMIN', 'ACTIVE'),
  ((select company_id from entity_media_ids), (select viewer_user from entity_media_ids), 'VIEWER', 'ACTIVE'),
  ((select other_company_id from entity_media_ids), (select outsider_user from entity_media_ids), 'COMPANY_ADMIN', 'ACTIVE');

insert into public.deployment_configuration (singleton, company_id)
values (true, (select company_id from entity_media_ids))
on conflict (singleton) do update set company_id = excluded.company_id;

insert into public.projects (id, company_id, user_id, project_code, project_name, status, currency, tax_treatment)
values ((select project_id from entity_media_ids), (select company_id from entity_media_ids), (select admin_user from entity_media_ids), 'MEDIA-01', 'Media Test Project', 'ACTIVE', 'PHP', 'VAT');
set local role authenticated;
select set_config('request.jwt.claim.sub', (select admin_user::text from entity_media_ids), true);
select public.save_engineering_equipment(jsonb_build_object(
  'id', (select equipment_id from entity_media_ids),
  'companyId', (select company_id from entity_media_ids),
  'assetReference', 'MEDIA-PUMP-01',
  'equipmentName', 'Media Test Pump',
  'equipmentType', 'Pump',
  'equipmentSource', 'OWNED'
));
select public.save_inventory_item(jsonb_build_object(
  'id', (select inventory_item_id from entity_media_ids),
  'companyId', (select company_id from entity_media_ids),
  'itemName', 'Media Test Pipe',
  'itemCode', 'MEDIA-PIPE',
  'category', 'Pipe',
  'stockUnit', 'm'
));
reset role;

select has_table('public', 'entity_media', 'shared company-bound entity media table exists');
select has_table('public', 'entity_media_cleanup_queue', 'durable object cleanup queue exists');
select ok((select relrowsecurity from pg_class where oid = 'public.entity_media'::regclass), 'entity media metadata has RLS enabled');
select is(has_function_privilege('authenticated', 'public.server_replace_entity_media(uuid,uuid,text,uuid,uuid,text,text,text,text,bigint,text,text,uuid)', 'EXECUTE'), false, 'authenticated callers cannot bypass the authorized upload API');
select is(has_function_privilege('service_role', 'public.server_replace_entity_media(uuid,uuid,text,uuid,uuid,text,text,text,text,bigint,text,text,uuid)', 'EXECUTE'), true, 'the server-only upload mutation is callable by the private Storage authority');
select ok((select not public from storage.buckets where id = 'entity-media' and file_size_limit = 5242880), 'the dedicated entity media bucket is private and capped at 5 MiB');
select is((select allowed_mime_types from storage.buckets where id = 'entity-media'), array['image/jpeg','image/png','image/webp']::text[], 'the bucket allowlist contains only supported raster image MIME types');

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select lives_ok(
  $sql$select public.server_replace_entity_media(
    (select company_id from entity_media_ids), (select admin_user from entity_media_ids), 'PROJECT',
    (select project_id from entity_media_ids), (select project_media_id from entity_media_ids),
    'supabase', 'entity-media',
    format('companies/%s/entity-media/project/%s/%s.png', (select company_id from entity_media_ids), (select project_id from entity_media_ids), (select project_media_id from entity_media_ids)),
    'image/png', 128, repeat('a', 64), 'Media Test Project cover', null
  )$sql$,
  'first project media binding commits after the object has been uploaded'
);
select is((select count(*)::integer from public.entity_media where company_id = (select company_id from entity_media_ids) and project_id = (select project_id from entity_media_ids)), 1, 'the project has one current cover binding');

insert into storage.objects (bucket_id, name)
values ('entity-media', format('companies/%s/entity-media/project/%s/%s.png', (select company_id from entity_media_ids), (select project_id from entity_media_ids), (select project_media_id from entity_media_ids)));
reset role;

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', (select viewer_user::text from entity_media_ids), true);
select is((select count(id)::integer from public.entity_media where project_id = (select project_id from entity_media_ids)), 1, 'a project reader can read safe media metadata for its own company');
select is((select count(*)::integer from storage.objects where bucket_id = 'entity-media'), 1, 'a project reader can read the current private project image');
select throws_ok($$select storage_key from public.entity_media$$, '42501', null, 'authenticated clients cannot retrieve raw object keys from metadata');
select throws_ok(
  $sql$insert into storage.objects (bucket_id, name) values ('entity-media', format('companies/%s/entity-media/project/%s/%s.png', (select company_id from entity_media_ids), (select project_id from entity_media_ids), '99999999-0000-4000-8000-000000004401'))$sql$,
  '42501', null, 'authenticated clients cannot bypass server-side upload validation'
);
select set_config('request.jwt.claim.sub', (select outsider_user::text from entity_media_ids), true);
select is((select count(id)::integer from public.entity_media where company_id = (select company_id from entity_media_ids)), 0, 'a different company cannot read entity media metadata');
select is((select count(*)::integer from storage.objects where bucket_id = 'entity-media'), 0, 'a different company cannot read the project image');
reset role;

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select throws_ok(
  $sql$select public.server_replace_entity_media(
    (select company_id from entity_media_ids), (select admin_user from entity_media_ids), 'PROJECT',
    (select project_id from entity_media_ids), (select replacement_media_id from entity_media_ids),
    'supabase', 'entity-media',
    format('companies/%s/entity-media/project/%s/%s.png', (select company_id from entity_media_ids), (select project_id from entity_media_ids), (select replacement_media_id from entity_media_ids)),
    'image/png', 128, repeat('b', 64), null, '99999999-0000-4000-8000-000000004401'
  )$sql$,
  '40001', null, 'a stale replacement cannot overwrite a newer current image'
);
select throws_ok(
  $sql$select public.server_replace_entity_media(
    (select company_id from entity_media_ids), (select admin_user from entity_media_ids), 'PROJECT',
    (select project_id from entity_media_ids), (select replacement_media_id from entity_media_ids),
    'supabase', 'entity-media', 'companies/foreign/entity-media/project/invalid/invalid.svg',
    'image/svg+xml', 128, repeat('b', 64), null, (select project_media_id from entity_media_ids)
  )$sql$,
  '22023', null, 'unsupported MIME and noncanonical paths are rejected'
);
select lives_ok(
  $sql$select public.server_replace_entity_media(
    (select company_id from entity_media_ids), (select admin_user from entity_media_ids), 'PROJECT',
    (select project_id from entity_media_ids), (select replacement_media_id from entity_media_ids),
    'supabase', 'entity-media',
    format('companies/%s/entity-media/project/%s/%s.png', (select company_id from entity_media_ids), (select project_id from entity_media_ids), (select replacement_media_id from entity_media_ids)),
    'image/png', 256, repeat('b', 64), 'Replacement project cover', (select project_media_id from entity_media_ids)
  )$sql$,
  'a valid replacement atomically becomes current'
);
select is((select count(*)::integer from public.entity_media_cleanup_queue where storage_key like '%' || (select project_media_id::text from entity_media_ids) || '.png'), 1, 'replacement queues the previous object only after the new pointer commits');
set local role authenticated;
select set_config('request.jwt.claim.sub', (select viewer_user::text from entity_media_ids), true);
select is((select count(*)::integer from storage.objects where bucket_id = 'entity-media' and name like '%' || (select project_media_id::text from entity_media_ids) || '.png'), 0, 'a project reader cannot read the superseded object while cleanup is pending');
reset role;
set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);

select lives_ok(
  $sql$select public.server_replace_entity_media(
    (select company_id from entity_media_ids), (select admin_user from entity_media_ids), 'EQUIPMENT',
    (select equipment_id from entity_media_ids), (select equipment_media_id from entity_media_ids),
    'supabase', 'entity-media',
    format('companies/%s/entity-media/equipment/%s/%s.jpg', (select company_id from entity_media_ids), (select equipment_id from entity_media_ids), (select equipment_media_id from entity_media_ids)),
    'image/jpeg', 128, repeat('c', 64), 'Pump photo', null
  )$sql$,
  'canonical equipment accepts its own primary image'
);
select lives_ok(
  $sql$select public.server_replace_entity_media(
    (select company_id from entity_media_ids), (select admin_user from entity_media_ids), 'MATERIAL',
    (select inventory_item_id from entity_media_ids), (select material_media_id from entity_media_ids),
    'supabase', 'entity-media',
    format('companies/%s/entity-media/material/%s/%s.webp', (select company_id from entity_media_ids), (select inventory_item_id from entity_media_ids), (select material_media_id from entity_media_ids)),
    'image/webp', 128, repeat('d', 64), 'Pipe bundle photo', null
  )$sql$,
  'canonical Warehouse Inventory item accepts its own primary image'
);

select lives_ok(
  $sql$select public.server_remove_entity_media(
    (select company_id from entity_media_ids), (select admin_user from entity_media_ids), 'PROJECT',
    (select project_id from entity_media_ids), (select replacement_media_id from entity_media_ids)
  )$sql$,
  'removing the expected project image unbinds it'
);
select is((select count(*)::integer from public.entity_media where project_id = (select project_id from entity_media_ids)), 0, 'removal leaves the Project record and clears its current image binding');
select is((select count(*)::integer from public.entity_media_cleanup_queue where storage_key like '%' || (select replacement_media_id::text from entity_media_ids) || '.png'), 1, 'removal queues the detached object for cleanup');
select throws_ok(
  $sql$select public.server_replace_entity_media(
    (select other_company_id from entity_media_ids), (select outsider_user from entity_media_ids), 'PROJECT',
    (select project_id from entity_media_ids), (select project_media_id from entity_media_ids),
    'supabase', 'entity-media', 'companies/other/entity-media/project/invalid/invalid.png',
    'image/png', 128, repeat('e', 64), null, null
  )$sql$,
  '42501', null, 'a service-side request cannot bind media outside the configured deployment company'
);

reset role;
delete from public.entity_media where equipment_id = (select equipment_id from entity_media_ids);
select is((select count(*)::integer from public.entity_media where equipment_id = (select equipment_id from entity_media_ids)), 0, 'server-side media unbinding clears the canonical equipment image metadata');
select is((select count(*)::integer from public.entity_media_cleanup_queue where storage_key like '%' || (select equipment_media_id::text from entity_media_ids) || '.jpg'), 1, 'media metadata deletion queues its private object for cleanup');

select * from finish();
rollback;
