-- Wave 4D: extend the existing company-scoped document delivery contract to
-- cover reviewed plain Gmail messages without creating a second delivery
-- history. Issued Purchase Orders and Client Invoices keep their immutable
-- snapshot/PDF provenance requirements; GENERAL_EMAIL rows deliberately have
-- no document or attachment provenance.

insert into public.company_permission_catalog(permission_key, description)
values ('documents.send', 'Send approved company documents and outbound messages through connected channels.')
on conflict (permission_key) do update set description = excluded.description;

alter table public.document_send_intents
  add column if not exists delivery_kind text not null default 'ISSUED_DOCUMENT',
  add column if not exists message_body_sha256 text;

alter table public.document_send_audits
  add column if not exists delivery_kind text not null default 'ISSUED_DOCUMENT',
  add column if not exists message_body_sha256 text;

alter table public.document_send_intents
  alter column snapshot_id drop not null,
  alter column document_id drop not null,
  alter column trusted_sha256 drop not null,
  alter column attachment_name drop not null,
  alter column attachment_mime_type drop not null;

alter table public.document_send_audits
  alter column snapshot_id drop not null,
  alter column document_id drop not null,
  alter column attachment_name drop not null,
  alter column attachment_mime_type drop not null;

-- Constraint names for the original inline checks are stable in PostgreSQL,
-- but the DO blocks also handle installations where a previous migration
-- assigned a different generated name.
do $$
declare
  item record;
begin
  for item in
    select conname
    from pg_constraint
    where conrelid = 'public.document_send_intents'::regclass
      and contype = 'c'
      and (
        pg_get_constraintdef(oid) like '%document_type%'
        or pg_get_constraintdef(oid) like '%trusted_sha256%'
        or pg_get_constraintdef(oid) like '%attachment_mime_type%'
        or pg_get_constraintdef(oid) like '%attachment_source%'
        or pg_get_constraintdef(oid) like '%attachment_size%'
        or pg_get_constraintdef(oid) like '%provenance%'
      )
  loop
    execute format('alter table public.document_send_intents drop constraint %I', item.conname);
  end loop;

  for item in
    select conname
    from pg_constraint
    where conrelid = 'public.document_send_audits'::regclass
      and contype = 'c'
      and (
        pg_get_constraintdef(oid) like '%document_type%'
        or pg_get_constraintdef(oid) like '%trusted_sha256%'
        or pg_get_constraintdef(oid) like '%attachment_mime_type%'
        or pg_get_constraintdef(oid) like '%attachment_source%'
        or pg_get_constraintdef(oid) like '%attachment_size%'
      )
  loop
    execute format('alter table public.document_send_audits drop constraint %I', item.conname);
  end loop;
end;
$$;

alter table public.document_send_intents
  add constraint document_send_intents_document_type_check
    check (document_type in ('PURCHASE_ORDER', 'CLIENT_INVOICE', 'GENERAL_EMAIL')),
  add constraint document_send_intents_delivery_kind_check
    check (
      (delivery_kind = 'ISSUED_DOCUMENT' and document_type in ('PURCHASE_ORDER', 'CLIENT_INVOICE'))
      or (delivery_kind = 'GENERAL_EMAIL' and document_type = 'GENERAL_EMAIL')
    ),
  add constraint document_send_intents_trusted_sha256_check
    check (trusted_sha256 is null or trusted_sha256 ~ '^[0-9a-fA-F]{64}$'),
  add constraint document_send_intents_message_body_hash_check
    check (message_body_sha256 is null or message_body_sha256 ~ '^[0-9a-fA-F]{64}$'),
  add constraint document_send_intents_attachment_mime_check
    check (attachment_mime_type is null or attachment_mime_type = 'application/pdf'),
  add constraint document_send_intents_attachment_source_check
    check (attachment_source in ('COMPANY_TEMPLATE_PDF', 'PROGRAMMATIC_PDF_FALLBACK', 'NONE')),
  add constraint document_send_intents_attachment_size_check
    check (attachment_size is null or (attachment_size > 0 and attachment_size <= 26214400)),
  add constraint document_send_intents_delivery_shape_check
    check (
      (
        delivery_kind = 'GENERAL_EMAIL'
        and snapshot_id is null
        and document_id is null
        and trusted_sha256 is null
        and attachment_name is null
        and attachment_mime_type is null
        and attachment_source = 'NONE'
        and attachment_size is null
        and template_version is null
        and template_version_id is null
        and template_content_sha256 is null
        and artifact_storage_path is null
        and artifact_storage_provider is null
        and artifact_storage_bucket is null
        and source_artifact_storage_path is null
        and source_artifact_storage_provider is null
        and source_artifact_storage_bucket is null
        and source_artifact_size is null
        and source_artifact_sha256 is null
        and converter_id is null
        and converter_version is null
      )
      or (
        delivery_kind = 'ISSUED_DOCUMENT'
        and snapshot_id is not null
        and document_id is not null
        and trusted_sha256 is not null
        and attachment_name is not null
        and attachment_mime_type = 'application/pdf'
        and attachment_source in ('COMPANY_TEMPLATE_PDF', 'PROGRAMMATIC_PDF_FALLBACK')
        and (
          (
            attachment_source = 'PROGRAMMATIC_PDF_FALLBACK'
            and artifact_storage_path is null
            and artifact_storage_provider is null
            and artifact_storage_bucket is null
            and source_artifact_storage_path is null
            and source_artifact_storage_provider is null
            and source_artifact_storage_bucket is null
            and source_artifact_size is null
            and source_artifact_sha256 is null
            and converter_id is null
            and converter_version is null
          )
          or (
            attachment_source = 'COMPANY_TEMPLATE_PDF'
            and template_version_id is not null
            and template_content_sha256 is not null
            and attachment_size is not null
            and artifact_storage_path is not null
            and artifact_storage_provider is not null
            and artifact_storage_bucket is not null
            and source_artifact_storage_path is not null
            and source_artifact_storage_provider is not null
            and source_artifact_storage_bucket is not null
            and source_artifact_size is not null
            and source_artifact_sha256 is not null
            and converter_id is not null
            and converter_version is not null
          )
        )
      )
    );

alter table public.document_send_audits
  add constraint document_send_audits_document_type_check
    check (document_type in ('PURCHASE_ORDER', 'CLIENT_INVOICE', 'GENERAL_EMAIL')),
  add constraint document_send_audits_delivery_kind_check
    check (
      (delivery_kind = 'ISSUED_DOCUMENT' and document_type in ('PURCHASE_ORDER', 'CLIENT_INVOICE'))
      or (delivery_kind = 'GENERAL_EMAIL' and document_type = 'GENERAL_EMAIL')
    ),
  add constraint document_send_audits_message_body_hash_check
    check (message_body_sha256 is null or message_body_sha256 ~ '^[0-9a-fA-F]{64}$'),
  add constraint document_send_audits_attachment_mime_check
    check (attachment_mime_type is null or attachment_mime_type = 'application/pdf'),
  add constraint document_send_audits_attachment_source_check
    check (attachment_source is null or attachment_source in ('COMPANY_TEMPLATE_PDF', 'PROGRAMMATIC_PDF_FALLBACK', 'NONE')),
  add constraint document_send_audits_attachment_size_check
    check (attachment_size is null or (attachment_size > 0 and attachment_size <= 26214400));

create index if not exists document_send_intents_company_delivery_kind_idx
  on public.document_send_intents(company_id, delivery_kind, created_at desc);

create or replace function private.can_read_general_delivery(p_company_id uuid)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and private.has_company_permission(p_company_id, 'documents.send');
$$;

revoke execute on function private.can_read_general_delivery(uuid) from public, anon, service_role;
grant execute on function private.can_read_general_delivery(uuid) to authenticated;

create or replace function public.validate_document_send_intent_scope()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_snapshot public.issued_document_snapshots;
  v_document_status text;
  v_pdf_evidence public.document_generation_evidence;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication is required for delivery intents' using errcode = '42501';
  end if;

  if new.delivery_kind = 'GENERAL_EMAIL' then
    if new.document_type <> 'GENERAL_EMAIL'
      or new.snapshot_id is not null
      or new.document_id is not null
      or new.trusted_sha256 is not null
      or new.attachment_name is not null
      or new.attachment_mime_type is not null
      or new.attachment_source <> 'NONE'
      or new.message_body_sha256 is null then
      raise exception 'Plain email delivery intent shape is invalid' using errcode = '22023';
    end if;
    return new;
  end if;

  if new.delivery_kind <> 'ISSUED_DOCUMENT' then
    raise exception 'Unsupported delivery intent kind' using errcode = '22023';
  end if;
  if new.document_type = 'PURCHASE_ORDER' then
    if not (select public.has_company_permission(new.company_id, 'procurement.read')) then
      raise exception 'Purchase Order read permission is required for this send intent' using errcode = '42501';
    end if;
    select po.status::text into v_document_status
    from public.purchase_orders po
    where po.id = new.document_id and po.company_id = new.company_id;
    if not found or v_document_status not in ('ISSUED', 'CLOSED') then
      raise exception 'Only issued or closed purchase orders can receive a new document delivery' using errcode = '42501';
    end if;
  elsif new.document_type = 'CLIENT_INVOICE' then
    if not (select public.has_company_permission(new.company_id, 'projects.read')) then
      raise exception 'Project read permission is required for this Client Invoice send intent' using errcode = '42501';
    end if;
    select billing.status::text into v_document_status
    from public.client_billings billing
    where billing.id = new.document_id and billing.company_id = new.company_id;
    if not found or v_document_status <> 'ISSUED' then
      raise exception 'Only issued client invoices can receive a new document delivery' using errcode = '42501';
    end if;
  else
    raise exception 'Unsupported issued document type' using errcode = '22023';
  end if;

  select s.* into v_snapshot
  from public.issued_document_snapshots s
  where s.id = new.snapshot_id
    and s.company_id = new.company_id
    and s.document_type = new.document_type
    and s.document_id = new.document_id
  for share;
  if not found then
    raise exception 'Send intent must reference the same company-scoped immutable snapshot' using errcode = '42501';
  end if;
  if new.template_version_id is distinct from v_snapshot.template_version_id
    or new.template_content_sha256 is distinct from v_snapshot.template_sha256
    or new.template_version is distinct from v_snapshot.template_version then
    raise exception 'Send intent template provenance must match the immutable issued snapshot' using errcode = '42501';
  end if;

  if new.attachment_source = 'COMPANY_TEMPLATE_PDF' then
    select e.* into v_pdf_evidence
    from public.document_generation_evidence e
    where e.company_id = new.company_id
      and e.snapshot_id = new.snapshot_id
      and e.template_version_id = new.template_version_id
      and e.document_type = new.document_type
      and e.document_id = new.document_id
      and e.artifact_type = 'PDF'
      and e.artifact_sha256 = new.trusted_sha256
    order by e.generated_at desc
    limit 1;
    if not found
      or v_pdf_evidence.template_content_sha256 is distinct from new.template_content_sha256
      or v_pdf_evidence.artifact_storage_path is distinct from new.artifact_storage_path
      or v_pdf_evidence.artifact_storage_provider is distinct from new.artifact_storage_provider
      or v_pdf_evidence.artifact_storage_bucket is distinct from new.artifact_storage_bucket
      or v_pdf_evidence.artifact_size is distinct from new.attachment_size
      or v_pdf_evidence.source_artifact_storage_path is distinct from new.source_artifact_storage_path
      or v_pdf_evidence.source_artifact_storage_provider is distinct from new.source_artifact_storage_provider
      or v_pdf_evidence.source_artifact_storage_bucket is distinct from new.source_artifact_storage_bucket
      or v_pdf_evidence.source_artifact_size is distinct from new.source_artifact_size
      or v_pdf_evidence.source_artifact_sha256 is distinct from new.source_artifact_sha256
      or v_pdf_evidence.converter_id is distinct from new.converter_id
      or v_pdf_evidence.converter_version is distinct from new.converter_version then
      raise exception 'Company-template delivery must reference the exact trusted PDF generation evidence' using errcode = '42501';
    end if;
  elsif new.attachment_source = 'PROGRAMMATIC_PDF_FALLBACK' then
    if new.artifact_storage_path is not null
      or new.artifact_storage_provider is not null
      or new.artifact_storage_bucket is not null
      or new.source_artifact_storage_path is not null
      or new.source_artifact_storage_provider is not null
      or new.source_artifact_storage_bucket is not null
      or new.source_artifact_size is not null
      or new.source_artifact_sha256 is not null
      or new.converter_id is not null
      or new.converter_version is not null then
      raise exception 'Programmatic PDF fallback cannot contain company-template artifact evidence' using errcode = '42501';
    end if;
  else
    raise exception 'Issued document delivery attachment provenance is invalid' using errcode = '22023';
  end if;

  if tg_op = 'UPDATE' and (
    old.company_id is distinct from new.company_id
    or old.delivery_kind is distinct from new.delivery_kind
    or old.snapshot_id is distinct from new.snapshot_id
    or old.document_type is distinct from new.document_type
    or old.document_id is distinct from new.document_id
    or old.sender_user_id is distinct from new.sender_user_id
    or old.idempotency_key is distinct from new.idempotency_key
    or old.trusted_sha256 is distinct from new.trusted_sha256
    or old.recipients is distinct from new.recipients
    or old.cc is distinct from new.cc
    or old.subject is distinct from new.subject
    or old.attachment_name is distinct from new.attachment_name
    or old.attachment_mime_type is distinct from new.attachment_mime_type
    or old.attachment_source is distinct from new.attachment_source
    or old.attachment_size is distinct from new.attachment_size
    or old.message_body_sha256 is distinct from new.message_body_sha256
    or old.template_version is distinct from new.template_version
    or old.template_version_id is distinct from new.template_version_id
    or old.template_content_sha256 is distinct from new.template_content_sha256
    or old.artifact_storage_path is distinct from new.artifact_storage_path
    or old.artifact_storage_provider is distinct from new.artifact_storage_provider
    or old.artifact_storage_bucket is distinct from new.artifact_storage_bucket
    or old.source_artifact_storage_path is distinct from new.source_artifact_storage_path
    or old.source_artifact_storage_provider is distinct from new.source_artifact_storage_provider
    or old.source_artifact_storage_bucket is distinct from new.source_artifact_storage_bucket
    or old.source_artifact_size is distinct from new.source_artifact_size
    or old.source_artifact_sha256 is distinct from new.source_artifact_sha256
    or old.converter_id is distinct from new.converter_id
    or old.converter_version is distinct from new.converter_version
  ) then
    raise exception 'Delivery intent identity and provenance are immutable' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists document_send_intents_scope on public.document_send_intents;
create trigger document_send_intents_scope
before insert or update on public.document_send_intents
for each row execute function public.validate_document_send_intent_scope();

create or replace function public.validate_document_send_audit_scope()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_intent public.document_send_intents;
begin
  if (select auth.uid()) is null or new.sender_user_id is distinct from (select auth.uid()) then
    raise exception 'Delivery audit actor must be the authenticated sender' using errcode = '42501';
  end if;
  if new.send_intent_id is not null then
    select i.* into v_intent
    from public.document_send_intents i
    where i.id = new.send_intent_id and i.company_id = new.company_id;
    if not found
      or v_intent.status not in ('SENT', 'FAILED')
      or v_intent.sender_user_id is distinct from new.sender_user_id
      or v_intent.delivery_kind is distinct from new.delivery_kind
      or v_intent.snapshot_id is distinct from new.snapshot_id
      or v_intent.document_type is distinct from new.document_type
      or v_intent.document_id is distinct from new.document_id
      or v_intent.trusted_sha256 is distinct from new.attachment_sha256
      or v_intent.message_body_sha256 is distinct from new.message_body_sha256
      or v_intent.attachment_source is distinct from new.attachment_source then
      raise exception 'Delivery audit must match a completed durable send intent' using errcode = '42501';
    end if;
    if new.idempotency_key is distinct from v_intent.idempotency_key then
      raise exception 'Delivery audit idempotency key does not match its send intent' using errcode = '42501';
    end if;
  elsif new.delivery_kind <> 'ISSUED_DOCUMENT'
    or not exists (
      select 1 from public.issued_document_snapshots s
      where s.id = new.snapshot_id and s.company_id = new.company_id
        and s.document_type = new.document_type and s.document_id = new.document_id
    ) then
    raise exception 'Legacy delivery audit must reference the same company-scoped issued snapshot' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists document_send_audits_scope on public.document_send_audits;
create trigger document_send_audits_scope
before insert on public.document_send_audits
for each row execute function public.validate_document_send_audit_scope();

drop policy if exists document_send_intents_select on public.document_send_intents;
create policy document_send_intents_select on public.document_send_intents
for select to authenticated
using (
  (delivery_kind = 'GENERAL_EMAIL' and (select private.can_read_general_delivery(company_id)))
  or (delivery_kind = 'ISSUED_DOCUMENT' and (
    (document_type = 'PURCHASE_ORDER' and (select public.has_company_permission(company_id, 'procurement.read')))
    or (document_type = 'CLIENT_INVOICE' and (select public.has_company_permission(company_id, 'projects.read')))
  ))
);

drop policy if exists document_send_audits_select on public.document_send_audits;
create policy document_send_audits_select on public.document_send_audits
for select to authenticated
using (
  (delivery_kind = 'GENERAL_EMAIL' and (select private.can_read_general_delivery(company_id)))
  or (delivery_kind = 'ISSUED_DOCUMENT' and (
    (document_type = 'PURCHASE_ORDER' and (select public.has_company_permission(company_id, 'procurement.read')))
    or (document_type = 'CLIENT_INVOICE' and (select public.has_company_permission(company_id, 'projects.read')))
  ))
);

create or replace function public.claim_document_send_intent(
  p_snapshot_id uuid,
  p_document_type text,
  p_document_id uuid,
  p_idempotency_key text,
  p_trusted_sha256 text,
  p_recipients jsonb,
  p_cc jsonb,
  p_subject text,
  p_attachment_name text,
  p_message_body_sha256 text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_company_id uuid := private.resolve_transition_company();
  v_intent public.document_send_intents;
  v_snapshot public.issued_document_snapshots;
  v_pdf_evidence public.document_generation_evidence;
  v_key text := nullif(btrim(p_idempotency_key), '');
  v_sha text := nullif(lower(btrim(coalesce(p_trusted_sha256, ''))), '');
  v_body_sha text := nullif(lower(btrim(coalesce(p_message_body_sha256, ''))), '');
  v_type text := upper(btrim(coalesce(p_document_type, '')));
  v_kind text := case when v_type = 'GENERAL_EMAIL' then 'GENERAL_EMAIL' else 'ISSUED_DOCUMENT' end;
  v_attachment_source text := 'NONE';
  v_template_version text;
  v_template_version_id uuid;
  v_template_hash text;
  v_attachment_size bigint;
  v_artifact_path text;
  v_artifact_provider text;
  v_artifact_bucket text;
  v_source_path text;
  v_source_provider text;
  v_source_bucket text;
  v_source_size bigint;
  v_source_hash text;
  v_converter_id text;
  v_converter_version text;
  v_attachment_mime text;
  v_attachment_name text;
begin
  if v_actor is null then raise exception 'Authentication is required to send messages' using errcode = '42501'; end if;
  if not (select private.has_company_permission(v_company_id, 'documents.send')) then raise exception 'Outbound message permission is required' using errcode = '42501'; end if;
  if v_type not in ('PURCHASE_ORDER', 'CLIENT_INVOICE', 'GENERAL_EMAIL') then raise exception 'Unsupported delivery type' using errcode = '22023'; end if;
  if v_key is null or length(v_key) > 200 or v_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$' then raise exception 'Send idempotency key is invalid' using errcode = '22023'; end if;
  if jsonb_typeof(coalesce(p_recipients, '[]'::jsonb)) <> 'array' or jsonb_typeof(coalesce(p_cc, '[]'::jsonb)) <> 'array' then raise exception 'Recipients must be arrays' using errcode = '22023'; end if;
  if jsonb_array_length(coalesce(p_recipients, '[]'::jsonb)) < 1 then raise exception 'At least one To recipient is required' using errcode = '22023'; end if;
  if nullif(btrim(coalesce(p_subject, '')), '') is null or length(p_subject) > 500 then raise exception 'Send subject is required' using errcode = '22023'; end if;
  if v_body_sha is not null and v_body_sha !~ '^[0-9a-f]{64}$' then raise exception 'Message body hash is invalid' using errcode = '22023'; end if;

  if v_kind = 'GENERAL_EMAIL' then
    if p_snapshot_id is not null or p_document_id is not null or v_sha is not null or nullif(btrim(coalesce(p_attachment_name, '')), '') is not null or v_body_sha is null then
      raise exception 'Plain email cannot contain issued-document or attachment provenance' using errcode = '22023';
    end if;
  else
    if v_sha is null or v_sha !~ '^[0-9a-f]{64}$' then raise exception 'Trusted issued PDF hash is invalid' using errcode = '22023'; end if;
    if nullif(btrim(coalesce(p_attachment_name, '')), '') is null or length(p_attachment_name) > 180 then raise exception 'Send attachment name is required' using errcode = '22023'; end if;
    v_attachment_source := 'PROGRAMMATIC_PDF_FALLBACK';
    v_attachment_mime := 'application/pdf';
    v_attachment_name := btrim(p_attachment_name);
    select s.* into v_snapshot
    from public.issued_document_snapshots s
    where s.id = p_snapshot_id
      and s.company_id = v_company_id
      and s.document_type = v_type
      and s.document_id = p_document_id
    for share;
    if not found then raise exception 'The immutable issued snapshot is outside the deployment company' using errcode = '42501'; end if;

    if v_type = 'PURCHASE_ORDER' then
      if not (select private.has_company_permission(v_company_id, 'procurement.read')) then raise exception 'Purchase Order read permission is required for this send intent' using errcode = '42501'; end if;
      if not exists (select 1 from public.purchase_orders po where po.id = p_document_id and po.company_id = v_company_id and po.status in ('ISSUED', 'CLOSED')) then raise exception 'Only issued or closed purchase orders can receive a new document delivery' using errcode = '42501'; end if;
    else
      if not (select private.has_company_permission(v_company_id, 'projects.read')) then raise exception 'Client Invoice read permission is required for this send intent' using errcode = '42501'; end if;
      if not exists (select 1 from public.client_billings billing where billing.id = p_document_id and billing.company_id = v_company_id and billing.status = 'ISSUED') then raise exception 'Only issued client invoices can receive a new document delivery' using errcode = '42501'; end if;
    end if;

    v_template_version := v_snapshot.template_version;
    v_template_version_id := v_snapshot.template_version_id;
    v_template_hash := v_snapshot.template_sha256;
    select e.* into v_pdf_evidence
    from public.document_generation_evidence e
    where e.company_id = v_company_id
      and e.snapshot_id = p_snapshot_id
      and e.template_version_id = v_snapshot.template_version_id
      and e.document_type = v_type
      and e.document_id = p_document_id
      and e.template_content_sha256 = v_snapshot.template_sha256
      and e.artifact_type = 'PDF'
      and e.artifact_sha256 = v_sha
    order by e.generated_at desc
    limit 1;
    if found then
      v_attachment_source := 'COMPANY_TEMPLATE_PDF';
      v_attachment_size := v_pdf_evidence.artifact_size;
      v_artifact_path := v_pdf_evidence.artifact_storage_path;
      v_artifact_provider := v_pdf_evidence.artifact_storage_provider;
      v_artifact_bucket := v_pdf_evidence.artifact_storage_bucket;
      v_source_path := v_pdf_evidence.source_artifact_storage_path;
      v_source_provider := v_pdf_evidence.source_artifact_storage_provider;
      v_source_bucket := v_pdf_evidence.source_artifact_storage_bucket;
      v_source_size := v_pdf_evidence.source_artifact_size;
      v_source_hash := v_pdf_evidence.source_artifact_sha256;
      v_converter_id := v_pdf_evidence.converter_id;
      v_converter_version := v_pdf_evidence.converter_version;
    end if;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_company_id::text || ':document-send:' || v_key, 0));
  select i.* into v_intent from public.document_send_intents i where i.company_id = v_company_id and i.idempotency_key = v_key for update;
  if found then
    if v_intent.delivery_kind <> v_kind
      or v_intent.snapshot_id is distinct from p_snapshot_id
      or v_intent.document_type <> v_type
      or v_intent.document_id is distinct from p_document_id
      or v_intent.trusted_sha256 is distinct from v_sha
      or v_intent.message_body_sha256 is distinct from v_body_sha
      or v_intent.recipients is distinct from coalesce(p_recipients, '[]'::jsonb)
      or v_intent.cc is distinct from coalesce(p_cc, '[]'::jsonb)
      or v_intent.subject is distinct from btrim(p_subject)
      or v_intent.attachment_name is distinct from v_attachment_name
      or v_intent.attachment_source is distinct from v_attachment_source then
      raise exception 'Send idempotency key is already bound to a different delivery request' using errcode = '23514';
    end if;
    if v_intent.status = 'SENT' then return jsonb_build_object('intent', to_jsonb(v_intent), 'claimed', false, 'idempotent', true); end if;
    if v_intent.status in ('PENDING', 'UNKNOWN') then return jsonb_build_object('intent', to_jsonb(v_intent), 'claimed', false, 'reconcileRequired', true); end if;
    if v_intent.status = 'FAILED' then return jsonb_build_object('intent', to_jsonb(v_intent), 'claimed', false, 'reconcileRequired', true, 'newAttemptRequired', true); end if;
    if v_intent.sender_user_id is distinct from v_actor then raise exception 'Only the original sender can retry a failed delivery intent' using errcode = '42501'; end if;
    update public.document_send_intents set status = 'PENDING', error_message = null, attempt_count = attempt_count + 1, updated_at = now() where id = v_intent.id returning * into v_intent;
  else
    insert into public.document_send_intents (
      company_id, delivery_kind, snapshot_id, document_type, document_id, sender_user_id, idempotency_key,
      trusted_sha256, message_body_sha256, recipients, cc, subject, attachment_name, attachment_mime_type,
      attachment_source, attachment_size, template_version, template_version_id, template_content_sha256,
      artifact_storage_path, artifact_storage_provider, artifact_storage_bucket, source_artifact_storage_path,
      source_artifact_storage_provider, source_artifact_storage_bucket, source_artifact_size, source_artifact_sha256,
      converter_id, converter_version
    ) values (
      v_company_id, v_kind, p_snapshot_id, v_type, p_document_id, v_actor, v_key,
      v_sha, v_body_sha, coalesce(p_recipients, '[]'::jsonb), coalesce(p_cc, '[]'::jsonb), btrim(p_subject), v_attachment_name, v_attachment_mime,
      v_attachment_source, v_attachment_size, v_template_version, v_template_version_id, v_template_hash,
      v_artifact_path, v_artifact_provider, v_artifact_bucket, v_source_path, v_source_provider, v_source_bucket,
      v_source_size, v_source_hash, v_converter_id, v_converter_version
    )
    on conflict (company_id, idempotency_key) do nothing
    returning * into v_intent;
    if v_intent.id is null then
      select i.* into v_intent from public.document_send_intents i where i.company_id = v_company_id and i.idempotency_key = v_key for update;
      if v_intent.delivery_kind <> v_kind
        or v_intent.snapshot_id is distinct from p_snapshot_id
        or v_intent.document_type <> v_type
        or v_intent.document_id is distinct from p_document_id
        or v_intent.trusted_sha256 is distinct from v_sha
        or v_intent.message_body_sha256 is distinct from v_body_sha
        or v_intent.recipients is distinct from coalesce(p_recipients, '[]'::jsonb)
        or v_intent.cc is distinct from coalesce(p_cc, '[]'::jsonb)
        or v_intent.subject is distinct from btrim(p_subject)
        or v_intent.attachment_name is distinct from v_attachment_name
        or v_intent.attachment_source is distinct from v_attachment_source then
        raise exception 'Send idempotency key is already bound to a different delivery request' using errcode = '23514';
      end if;
      if v_intent.status = 'SENT' then return jsonb_build_object('intent', to_jsonb(v_intent), 'claimed', false, 'idempotent', true); end if;
      if v_intent.status in ('PENDING', 'UNKNOWN') then return jsonb_build_object('intent', to_jsonb(v_intent), 'claimed', false, 'reconcileRequired', true); end if;
      if v_intent.status = 'FAILED' then return jsonb_build_object('intent', to_jsonb(v_intent), 'claimed', false, 'reconcileRequired', true, 'newAttemptRequired', true); end if;
      if v_intent.sender_user_id is distinct from v_actor then raise exception 'Only the original sender can retry a failed delivery intent' using errcode = '42501'; end if;
      update public.document_send_intents set status = 'PENDING', error_message = null, attempt_count = attempt_count + 1, updated_at = now() where id = v_intent.id returning * into v_intent;
    end if;
  end if;
  return jsonb_build_object('intent', to_jsonb(v_intent), 'claimed', true, 'idempotent', false);
end;
$$;

-- Preserve the historical nine-argument function for older clients, but keep
-- it document-only. New clients use the ten-argument polymorphic contract.
create or replace function public.claim_document_send_intent(
  p_snapshot_id uuid,
  p_document_type text,
  p_document_id uuid,
  p_idempotency_key text,
  p_trusted_sha256 text,
  p_recipients jsonb,
  p_cc jsonb,
  p_subject text,
  p_attachment_name text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if upper(btrim(coalesce(p_document_type, ''))) = 'GENERAL_EMAIL' then
    raise exception 'The legacy document send function cannot create a plain email' using errcode = '22023';
  end if;
  return public.claim_document_send_intent(p_snapshot_id, p_document_type, p_document_id, p_idempotency_key, p_trusted_sha256, p_recipients, p_cc, p_subject, p_attachment_name, null);
end;
$$;

create or replace function public.record_document_send_audit(
  p_intent_id uuid,
  p_gmail_message_id text default null,
  p_status text default 'SENT',
  p_error_message text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_company_id uuid := private.resolve_transition_company();
  v_status text := upper(btrim(coalesce(p_status, '')));
  v_intent public.document_send_intents;
  v_audit public.document_send_audits;
begin
  if v_actor is null then raise exception 'Authentication is required to record delivery' using errcode = '42501'; end if;
  if not (select private.has_company_permission(v_company_id, 'documents.send')) then raise exception 'Outbound message permission is required' using errcode = '42501'; end if;
  if v_status not in ('SENT', 'FAILED') then raise exception 'Invalid delivery audit status' using errcode = '22023'; end if;
  select i.* into v_intent from public.document_send_intents i where i.id = p_intent_id and i.company_id = v_company_id for update;
  if not found then raise exception 'Delivery intent was not found' using errcode = '23503'; end if;
  if v_intent.sender_user_id is distinct from v_actor then raise exception 'Only the initiating sender can record this delivery audit' using errcode = '42501'; end if;
  if v_intent.status is distinct from v_status then raise exception 'Delivery audit status does not match the durable intent' using errcode = '42501'; end if;
  select a.* into v_audit from public.document_send_audits a where a.send_intent_id = v_intent.id for update;
  if found then return jsonb_build_object('audit', to_jsonb(v_audit), 'idempotent', true); end if;

  insert into public.document_send_audits (
    company_id, delivery_kind, snapshot_id, document_type, document_id, sender_user_id, recipients, cc, subject,
    attachment_name, attachment_sha256, message_body_sha256, gmail_message_id, status, error_message, send_intent_id,
    idempotency_key, attachment_mime_type, attachment_source, attachment_size, template_version, template_version_id,
    template_content_sha256, artifact_storage_path, artifact_storage_provider, artifact_storage_bucket,
    source_artifact_storage_path, source_artifact_storage_provider, source_artifact_storage_bucket, source_artifact_size,
    source_artifact_sha256, converter_id, converter_version
  ) values (
    v_intent.company_id, v_intent.delivery_kind, v_intent.snapshot_id, v_intent.document_type, v_intent.document_id, v_actor,
    v_intent.recipients, v_intent.cc, v_intent.subject, v_intent.attachment_name, v_intent.trusted_sha256, v_intent.message_body_sha256,
    nullif(btrim(coalesce(p_gmail_message_id, '')), ''), v_status, nullif(left(btrim(coalesce(p_error_message, '')), 1000), ''),
    v_intent.id, v_intent.idempotency_key, v_intent.attachment_mime_type, v_intent.attachment_source, v_intent.attachment_size,
    v_intent.template_version, v_intent.template_version_id, v_intent.template_content_sha256, v_intent.artifact_storage_path,
    v_intent.artifact_storage_provider, v_intent.artifact_storage_bucket, v_intent.source_artifact_storage_path,
    v_intent.source_artifact_storage_provider, v_intent.source_artifact_storage_bucket, v_intent.source_artifact_size,
    v_intent.source_artifact_sha256, v_intent.converter_id, v_intent.converter_version
  ) returning * into v_audit;
  return jsonb_build_object('audit', to_jsonb(v_audit), 'idempotent', false);
end;
$$;

create or replace function public.ensure_document_send_terminal_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status not in ('SENT', 'FAILED') or old.status is not distinct from new.status then return new; end if;
  if (select auth.uid()) is null or new.sender_user_id is distinct from (select auth.uid()) then
    raise exception 'Terminal delivery audit actor must match the initiating sender' using errcode = '42501';
  end if;
  if exists (select 1 from public.document_send_audits a where a.company_id = new.company_id and a.send_intent_id = new.id) then return new; end if;
  insert into public.document_send_audits (
    company_id, delivery_kind, snapshot_id, document_type, document_id, sender_user_id, recipients, cc, subject,
    attachment_name, attachment_sha256, message_body_sha256, gmail_message_id, status, error_message, send_intent_id,
    idempotency_key, attachment_mime_type, attachment_source, attachment_size, template_version, template_version_id,
    template_content_sha256, artifact_storage_path, artifact_storage_provider, artifact_storage_bucket,
    source_artifact_storage_path, source_artifact_storage_provider, source_artifact_storage_bucket, source_artifact_size,
    source_artifact_sha256, converter_id, converter_version
  ) values (
    new.company_id, new.delivery_kind, new.snapshot_id, new.document_type, new.document_id, new.sender_user_id, new.recipients, new.cc, new.subject,
    new.attachment_name, new.trusted_sha256, new.message_body_sha256, new.gmail_message_id, new.status, new.error_message, new.id,
    new.idempotency_key, new.attachment_mime_type, new.attachment_source, new.attachment_size, new.template_version, new.template_version_id,
    new.template_content_sha256, new.artifact_storage_path, new.artifact_storage_provider, new.artifact_storage_bucket,
    new.source_artifact_storage_path, new.source_artifact_storage_provider, new.source_artifact_storage_bucket, new.source_artifact_size,
    new.source_artifact_sha256, new.converter_id, new.converter_version
  );
  return new;
end;
$$;

drop trigger if exists document_send_intents_terminal_audit on public.document_send_intents;
create trigger document_send_intents_terminal_audit
after update of status on public.document_send_intents
for each row
when (old.status is distinct from new.status and new.status in ('SENT', 'FAILED'))
execute function public.ensure_document_send_terminal_audit();

revoke all on function public.claim_document_send_intent(uuid, text, uuid, text, text, jsonb, jsonb, text, text) from public, anon;
grant execute on function public.claim_document_send_intent(uuid, text, uuid, text, text, jsonb, jsonb, text, text) to authenticated;
revoke all on function public.claim_document_send_intent(uuid, text, uuid, text, text, jsonb, jsonb, text, text, text) from public, anon;
grant execute on function public.claim_document_send_intent(uuid, text, uuid, text, text, jsonb, jsonb, text, text, text) to authenticated;
revoke all on function public.record_document_send_audit(uuid, text, text, text) from public, anon;
grant execute on function public.record_document_send_audit(uuid, text, text, text) to authenticated;
revoke execute on function public.ensure_document_send_terminal_audit() from public, anon, authenticated;
