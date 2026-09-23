-- UI-R4D: private, company-bound images for existing entity authorities.
-- Entity ownership remains Project, canonical Equipment Registry, and
-- canonical Warehouse Inventory Item. Project assignments/material rows reuse
-- these images through their existing canonical references.

create table if not exists public.entity_media (
  id uuid primary key,
  company_id uuid not null references public.companies(id) on delete restrict,
  entity_type text not null check (entity_type in ('PROJECT', 'EQUIPMENT', 'MATERIAL')),
  project_id uuid,
  equipment_id uuid,
  inventory_item_id uuid,
  purpose text not null check (purpose in ('COVER', 'PRIMARY')),
  storage_provider text not null check (storage_provider in ('supabase', 's3')),
  storage_bucket text not null check (storage_bucket ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$'),
  storage_key text not null,
  content_type text not null check (content_type in ('image/jpeg', 'image/png', 'image/webp')),
  size_bytes bigint not null check (size_bytes between 1 and 5242880),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  alt_text text check (alt_text is null or length(alt_text) <= 240),
  created_by_user_id uuid references auth.users(id) on delete set null,
  updated_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint entity_media_company_id_id_key unique (company_id, id),
  constraint entity_media_target_check check (
    (entity_type = 'PROJECT' and project_id is not null and equipment_id is null and inventory_item_id is null and purpose = 'COVER')
    or (entity_type = 'EQUIPMENT' and project_id is null and equipment_id is not null and inventory_item_id is null and purpose = 'PRIMARY')
    or (entity_type = 'MATERIAL' and project_id is null and equipment_id is null and inventory_item_id is not null and purpose = 'PRIMARY')
  ),
  constraint entity_media_company_project_fk
    foreign key (company_id, project_id) references public.projects(company_id, id) on delete cascade,
  constraint entity_media_company_equipment_fk
    foreign key (company_id, equipment_id) references public.engineering_equipment_registry(company_id, id) on delete cascade,
  constraint entity_media_company_inventory_item_fk
    foreign key (company_id, inventory_item_id) references public.inventory_items(company_id, id) on delete cascade,
  constraint entity_media_bucket_provider_check check (
    (storage_provider = 'supabase' and storage_bucket = 'entity-media')
    or storage_provider = 's3'
  ),
  constraint entity_media_storage_key_check check (
    storage_key = format(
      'companies/%s/entity-media/%s/%s/%s.%s',
      company_id,
      case entity_type when 'PROJECT' then 'project' when 'EQUIPMENT' then 'equipment' else 'material' end,
      coalesce(project_id, equipment_id, inventory_item_id),
      id,
      case content_type when 'image/jpeg' then 'jpg' when 'image/png' then 'png' else 'webp' end
    )
  )
);

create unique index if not exists entity_media_project_slot_unique
  on public.entity_media (company_id, project_id, purpose)
  where project_id is not null;
create unique index if not exists entity_media_equipment_slot_unique
  on public.entity_media (company_id, equipment_id, purpose)
  where equipment_id is not null;
create unique index if not exists entity_media_material_slot_unique
  on public.entity_media (company_id, inventory_item_id, purpose)
  where inventory_item_id is not null;
create index if not exists entity_media_company_updated_idx
  on public.entity_media (company_id, updated_at desc);

create table if not exists public.entity_media_cleanup_queue (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  storage_provider text not null check (storage_provider in ('supabase', 's3')),
  storage_bucket text not null check (storage_bucket ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$'),
  storage_key text not null check (
    storage_key ~* '^companies/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/entity-media/(project|equipment|material)/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$'
  ),
  cleanup_reason text not null check (cleanup_reason in ('REPLACED', 'UNBOUND', 'FAILED_UPLOAD')),
  requested_by_user_id uuid references auth.users(id) on delete set null,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  last_attempt_at timestamptz,
  created_at timestamptz not null default now(),
  constraint entity_media_cleanup_company_key_unique unique (company_id, storage_provider, storage_bucket, storage_key),
  constraint entity_media_cleanup_provider_bucket_check check (
    (storage_provider = 'supabase' and storage_bucket = 'entity-media')
    or storage_provider = 's3'
  ),
  constraint entity_media_cleanup_company_path_check check (split_part(storage_key, '/', 2) = company_id::text)
);

alter table public.entity_media enable row level security;
alter table public.entity_media_cleanup_queue enable row level security;

revoke all on public.entity_media, public.entity_media_cleanup_queue from public, anon, authenticated;
grant select (
  id, company_id, entity_type, project_id, equipment_id, inventory_item_id, purpose,
  content_type, size_bytes, sha256, alt_text, created_by_user_id, updated_by_user_id,
  created_at, updated_at
) on public.entity_media to authenticated;
grant all on public.entity_media, public.entity_media_cleanup_queue to service_role;
grant select on public.deployment_configuration, public.company_members, public.platform_admins,
  public.projects, public.engineering_equipment_registry, public.inventory_items to service_role;

drop policy if exists entity_media_read on public.entity_media;
create policy entity_media_read on public.entity_media for select to authenticated
using (
  company_id = (select private.deployment_company_id())
  and case entity_type
    when 'PROJECT' then (select public.has_company_permission(company_id, 'projects.read'))
    when 'EQUIPMENT' then (select public.has_company_permission(company_id, 'equipment.read'))
    when 'MATERIAL' then (select public.has_company_permission(company_id, 'inventory.read'))
    else false
  end
);

create or replace function private.can_read_entity_media_storage_object(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $entity_media_read$
  select exists (
    select 1
    from public.entity_media m
    where m.storage_provider = 'supabase'
      and m.storage_bucket = 'entity-media'
      and m.storage_key = p_name
      and m.company_id = (select private.deployment_company_id())
      and m.company_id = private.storage_company_id(p_name)
      and case m.entity_type
        when 'PROJECT' then private.has_company_permission(m.company_id, 'projects.read')
        when 'EQUIPMENT' then private.has_company_permission(m.company_id, 'equipment.read')
        when 'MATERIAL' then private.has_company_permission(m.company_id, 'inventory.read')
        else false
      end
  );
$entity_media_read$;
revoke execute on function private.can_read_entity_media_storage_object(text) from public, anon;
grant execute on function private.can_read_entity_media_storage_object(text) to authenticated, service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('entity-media', 'entity-media', false, 5242880, array['image/jpeg', 'image/png', 'image/webp']::text[])
on conflict (id) do update set
  name = excluded.name,
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "company entity media read" on storage.objects;
create policy "company entity media read" on storage.objects
for select to authenticated
using (
  bucket_id = 'entity-media'
  and name ~* '^companies/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/entity-media/(project|equipment|material)/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$'
  and private.can_read_entity_media_storage_object(name)
);
drop policy if exists "company entity media insert" on storage.objects;
drop policy if exists "company entity media update" on storage.objects;
drop policy if exists "company entity media delete" on storage.objects;

create or replace function private.queue_entity_media_cleanup()
returns trigger
language plpgsql
security definer
set search_path = ''
as $queue_entity_media$
begin
  begin
    insert into public.entity_media_cleanup_queue (
      company_id, storage_provider, storage_bucket, storage_key, cleanup_reason, requested_by_user_id
    ) values (
      old.company_id, old.storage_provider, old.storage_bucket, old.storage_key, 'UNBOUND', old.updated_by_user_id
    )
    on conflict (company_id, storage_provider, storage_bucket, storage_key) do nothing;
  exception when others then
    -- Entity deletion must remain independent of image Storage/cleanup health.
    raise warning 'Entity media cleanup could not be queued; entity lifecycle continues.';
  end;
  return old;
end;
$queue_entity_media$;
revoke execute on function private.queue_entity_media_cleanup() from public, anon, authenticated;

drop trigger if exists entity_media_queue_cleanup_after_delete on public.entity_media;
create trigger entity_media_queue_cleanup_after_delete
after delete on public.entity_media
for each row execute function private.queue_entity_media_cleanup();

create or replace function public.server_replace_entity_media(
  p_company_id uuid,
  p_actor_user_id uuid,
  p_entity_type text,
  p_entity_id uuid,
  p_media_id uuid,
  p_storage_provider text,
  p_storage_bucket text,
  p_storage_key text,
  p_content_type text,
  p_size_bytes bigint,
  p_sha256 text,
  p_alt_text text,
  p_expected_media_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $server_replace_entity_media$
declare
  v_deployment_company_id uuid;
  v_kind text;
  v_slot text;
  v_extension text;
  v_expected_key text;
  v_current public.entity_media;
  v_row public.entity_media;
  v_has_current boolean;
begin
  select dc.company_id into v_deployment_company_id
  from public.deployment_configuration dc
  where dc.singleton = true;
  if p_company_id is null or p_company_id is distinct from v_deployment_company_id then
    raise exception 'Entity media must remain in the configured deployment company' using errcode = '42501';
  end if;
  if not exists (select 1 from public.companies c where c.id = p_company_id and c.status = 'ACTIVE') then
    raise exception 'Entity media requires an active deployment company' using errcode = '42501';
  end if;
  if p_actor_user_id is null or not (
    exists (
      select 1 from public.company_members cm
      where cm.company_id = p_company_id and cm.user_id = p_actor_user_id and cm.status = 'ACTIVE'
    ) or exists (select 1 from public.platform_admins pa where pa.user_id = p_actor_user_id)
  ) then
    raise exception 'Entity media actor must be an active company member' using errcode = '42501';
  end if;
  if p_entity_type is null or p_entity_type not in ('PROJECT', 'EQUIPMENT', 'MATERIAL') then
    raise exception 'Entity media type is not supported' using errcode = '22023';
  end if;
  if p_storage_provider is null or p_storage_provider not in ('supabase', 's3') then
    raise exception 'Entity media provider is not supported' using errcode = '22023';
  end if;
  if p_storage_bucket is null or p_storage_bucket !~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$'
     or (p_storage_provider = 'supabase' and p_storage_bucket <> 'entity-media') then
    raise exception 'Entity media bucket is invalid' using errcode = '22023';
  end if;
  if p_content_type is null or p_content_type not in ('image/jpeg', 'image/png', 'image/webp')
     or p_size_bytes is null or p_size_bytes not between 1 and 5242880
     or p_sha256 is null or p_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'Entity media content metadata is invalid' using errcode = '22023';
  end if;
  if p_alt_text is not null and length(p_alt_text) > 240 then
    raise exception 'Entity media alt text is too long' using errcode = '22023';
  end if;

  v_kind := case p_entity_type when 'PROJECT' then 'project' when 'EQUIPMENT' then 'equipment' else 'material' end;
  v_slot := case p_entity_type when 'PROJECT' then 'COVER' else 'PRIMARY' end;
  v_extension := case p_content_type when 'image/jpeg' then 'jpg' when 'image/png' then 'png' else 'webp' end;
  v_expected_key := format('companies/%s/entity-media/%s/%s/%s.%s', p_company_id, v_kind, p_entity_id, p_media_id, v_extension);
  if p_storage_key is distinct from v_expected_key then
    raise exception 'Entity media object path does not match its company, entity, and media IDs' using errcode = '22023';
  end if;

  if p_entity_type = 'PROJECT' then
    perform 1 from public.projects p where p.company_id = p_company_id and p.id = p_entity_id for key share;
  elsif p_entity_type = 'EQUIPMENT' then
    perform 1 from public.engineering_equipment_registry e where e.company_id = p_company_id and e.id = p_entity_id for key share;
  else
    perform 1 from public.inventory_items i where i.company_id = p_company_id and i.id = p_entity_id for key share;
  end if;
  if not found then raise exception 'Entity media target was not found in this company' using errcode = 'P0002'; end if;

  if p_entity_type = 'PROJECT' then
    select * into v_current from public.entity_media m where m.company_id = p_company_id and m.project_id = p_entity_id for update;
  elsif p_entity_type = 'EQUIPMENT' then
    select * into v_current from public.entity_media m where m.company_id = p_company_id and m.equipment_id = p_entity_id for update;
  else
    select * into v_current from public.entity_media m where m.company_id = p_company_id and m.inventory_item_id = p_entity_id for update;
  end if;
  v_has_current := found;
  if p_expected_media_id is distinct from (case when v_has_current then v_current.id else null end) then
    raise exception 'EXPECTED_MEDIA_MISMATCH' using errcode = '40001';
  end if;
  if exists (select 1 from public.entity_media m where m.id = p_media_id and m.company_id = p_company_id) then
    raise exception 'Entity media ID is already in use' using errcode = '23505';
  end if;

  if v_has_current then
    insert into public.entity_media_cleanup_queue (
      company_id, storage_provider, storage_bucket, storage_key, cleanup_reason, requested_by_user_id
    ) values (
      v_current.company_id, v_current.storage_provider, v_current.storage_bucket, v_current.storage_key, 'REPLACED', p_actor_user_id
    ) on conflict (company_id, storage_provider, storage_bucket, storage_key) do nothing;

    update public.entity_media m set
      id = p_media_id,
      storage_provider = p_storage_provider,
      storage_bucket = p_storage_bucket,
      storage_key = p_storage_key,
      content_type = p_content_type,
      size_bytes = p_size_bytes,
      sha256 = p_sha256,
      alt_text = p_alt_text,
      created_by_user_id = p_actor_user_id,
      updated_by_user_id = p_actor_user_id,
      created_at = now(),
      updated_at = now()
    where m.id = v_current.id and m.company_id = p_company_id
    returning * into v_row;
  else
    insert into public.entity_media (
      id, company_id, entity_type, project_id, equipment_id, inventory_item_id, purpose,
      storage_provider, storage_bucket, storage_key, content_type, size_bytes, sha256, alt_text,
      created_by_user_id, updated_by_user_id
    ) values (
      p_media_id, p_company_id, p_entity_type,
      case when p_entity_type = 'PROJECT' then p_entity_id end,
      case when p_entity_type = 'EQUIPMENT' then p_entity_id end,
      case when p_entity_type = 'MATERIAL' then p_entity_id end,
      v_slot, p_storage_provider, p_storage_bucket, p_storage_key, p_content_type, p_size_bytes,
      p_sha256, p_alt_text, p_actor_user_id, p_actor_user_id
    ) returning * into v_row;
  end if;

  return to_jsonb(v_row);
end;
$server_replace_entity_media$;

create or replace function public.server_remove_entity_media(
  p_company_id uuid,
  p_actor_user_id uuid,
  p_entity_type text,
  p_entity_id uuid,
  p_expected_media_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $server_remove_entity_media$
declare
  v_deployment_company_id uuid;
  v_current public.entity_media;
begin
  select dc.company_id into v_deployment_company_id
  from public.deployment_configuration dc
  where dc.singleton = true;
  if p_company_id is null or p_company_id is distinct from v_deployment_company_id then
    raise exception 'Entity media must remain in the configured deployment company' using errcode = '42501';
  end if;
  if not exists (select 1 from public.companies c where c.id = p_company_id and c.status = 'ACTIVE') then
    raise exception 'Entity media requires an active deployment company' using errcode = '42501';
  end if;
  if p_actor_user_id is null or not (
    exists (
      select 1 from public.company_members cm
      where cm.company_id = p_company_id and cm.user_id = p_actor_user_id and cm.status = 'ACTIVE'
    ) or exists (select 1 from public.platform_admins pa where pa.user_id = p_actor_user_id)
  ) then
    raise exception 'Entity media actor must be an active company member' using errcode = '42501';
  end if;
  if p_entity_type is null or p_entity_type not in ('PROJECT', 'EQUIPMENT', 'MATERIAL') then
    raise exception 'Entity media type is not supported' using errcode = '22023';
  end if;

  if p_entity_type = 'PROJECT' then
    select * into v_current from public.entity_media m where m.company_id = p_company_id and m.project_id = p_entity_id for update;
  elsif p_entity_type = 'EQUIPMENT' then
    select * into v_current from public.entity_media m where m.company_id = p_company_id and m.equipment_id = p_entity_id for update;
  else
    select * into v_current from public.entity_media m where m.company_id = p_company_id and m.inventory_item_id = p_entity_id for update;
  end if;
  if not found then raise exception 'Current entity media was not found' using errcode = 'P0002'; end if;
  if v_current.id is distinct from p_expected_media_id then
    raise exception 'EXPECTED_MEDIA_MISMATCH' using errcode = '40001';
  end if;

  insert into public.entity_media_cleanup_queue (
    company_id, storage_provider, storage_bucket, storage_key, cleanup_reason, requested_by_user_id
  ) values (
    v_current.company_id, v_current.storage_provider, v_current.storage_bucket, v_current.storage_key, 'UNBOUND', p_actor_user_id
  ) on conflict (company_id, storage_provider, storage_bucket, storage_key) do nothing;

  update public.entity_media m set updated_by_user_id = p_actor_user_id, updated_at = now()
  where m.id = v_current.id and m.company_id = p_company_id;
  delete from public.entity_media m where m.id = v_current.id and m.company_id = p_company_id;
  return jsonb_build_object('removedMediaId', v_current.id, 'storageKey', v_current.storage_key);
end;
$server_remove_entity_media$;

revoke all on function public.server_replace_entity_media(uuid, uuid, text, uuid, uuid, text, text, text, text, bigint, text, text, uuid) from public, anon, authenticated;
revoke all on function public.server_remove_entity_media(uuid, uuid, text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.server_replace_entity_media(uuid, uuid, text, uuid, uuid, text, text, text, text, bigint, text, text, uuid) to service_role;
grant execute on function public.server_remove_entity_media(uuid, uuid, text, uuid, uuid) to service_role;

comment on table public.entity_media is
  'Current private image metadata for Projects, canonical Equipment assets, and canonical Warehouse Inventory items. Object bytes remain in private Storage.';
comment on table public.entity_media_cleanup_queue is
  'Private retry queue for objects unbound by image replacement/removal or entity deletion; never blocks entity lifecycle.';
