-- Wave 4D: add the two approved outbound SMS paths to the existing
-- company-scoped document delivery intent/audit contract. SMS uses the same
-- idempotency, sender, RLS, and append-only terminal-audit boundary; it does
-- not create a competing message-history table or store provider secrets.

alter table public.document_send_intents
  add column if not exists delivery_channel text not null default 'GMAIL',
  add column if not exists destination text,
  add column if not exists provider_id text,
  add column if not exists provider_message_id text,
  add column if not exists provider_status text,
  add column if not exists reconciliation_required boolean not null default false;

alter table public.document_send_audits
  add column if not exists delivery_channel text not null default 'GMAIL',
  add column if not exists destination text,
  add column if not exists provider_id text,
  add column if not exists provider_message_id text,
  add column if not exists provider_status text,
  add column if not exists reconciliation_required boolean not null default false;

alter table public.document_send_intents
  drop constraint if exists document_send_intents_status_check,
  drop constraint if exists document_send_intents_document_type_check,
  drop constraint if exists document_send_intents_delivery_kind_check,
  drop constraint if exists document_send_intents_delivery_channel_check,
  drop constraint if exists document_send_intents_destination_check,
  drop constraint if exists document_send_intents_provider_id_check,
  drop constraint if exists document_send_intents_provider_message_id_check,
  drop constraint if exists document_send_intents_provider_status_check,
  drop constraint if exists document_send_intents_delivery_shape_check;

alter table public.document_send_audits
  drop constraint if exists document_send_audits_status_check,
  drop constraint if exists document_send_audits_document_type_check,
  drop constraint if exists document_send_audits_delivery_kind_check,
  drop constraint if exists document_send_audits_delivery_channel_check,
  drop constraint if exists document_send_audits_destination_check,
  drop constraint if exists document_send_audits_provider_id_check,
  drop constraint if exists document_send_audits_provider_message_id_check,
  drop constraint if exists document_send_audits_provider_status_check,
  drop constraint if exists document_send_audits_delivery_shape_check;

alter table public.document_send_intents
  add constraint document_send_intents_status_check
    check (status in ('PENDING', 'ACCEPTED', 'SENT', 'DELIVERED', 'FAILED', 'CANCELLED', 'UNKNOWN')),
  add constraint document_send_intents_document_type_check
    check (document_type in ('PURCHASE_ORDER', 'CLIENT_INVOICE', 'GENERAL_EMAIL', 'GENERAL_SMS')),
  add constraint document_send_intents_delivery_channel_check
    check (delivery_channel in ('GMAIL', 'SMS')),
  add constraint document_send_intents_delivery_kind_check
    check (
      (delivery_channel = 'GMAIL' and delivery_kind = 'ISSUED_DOCUMENT' and document_type in ('PURCHASE_ORDER', 'CLIENT_INVOICE'))
      or (delivery_channel = 'GMAIL' and delivery_kind = 'GENERAL_EMAIL' and document_type = 'GENERAL_EMAIL')
      or (delivery_channel = 'SMS' and delivery_kind = 'GENERAL_SMS' and document_type = 'GENERAL_SMS')
    ),
  add constraint document_send_intents_destination_check
    check (destination is null or destination ~ '^\+639[0-9]{9}$'),
  add constraint document_send_intents_provider_id_check
    check (provider_id is null or provider_id in ('GMAIL', 'ANDROID_SIM_GATEWAY', 'PHILSMS')),
  add constraint document_send_intents_provider_message_id_check
    check (provider_message_id is null or (length(btrim(provider_message_id)) between 1 and 200 and provider_message_id !~ '[[:cntrl:]]')),
  add constraint document_send_intents_provider_status_check
    check (provider_status is null or (length(btrim(provider_status)) between 1 and 80 and provider_status !~ '[[:cntrl:]]')),
  add constraint document_send_intents_delivery_shape_check
    check (
      (
        delivery_channel = 'GMAIL'
        and delivery_kind = 'GENERAL_EMAIL'
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
        and destination is null
      )
      or (
        delivery_channel = 'SMS'
        and delivery_kind = 'GENERAL_SMS'
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
        and destination is not null
        and provider_id is not null
        and provider_id in ('ANDROID_SIM_GATEWAY', 'PHILSMS')
        and message_body_sha256 is not null
        and jsonb_typeof(recipients) = 'array'
        and jsonb_array_length(recipients) = 1
        and recipients ->> 0 = destination
        and jsonb_typeof(cc) = 'array'
        and jsonb_array_length(cc) = 0
        and subject = 'SMS'
        and (
          status in ('PENDING', 'UNKNOWN', 'FAILED', 'CANCELLED')
          or provider_message_id is not null
        )
      )
      or (
        delivery_channel = 'GMAIL'
        and delivery_kind = 'ISSUED_DOCUMENT'
        and snapshot_id is not null
        and document_id is not null
        and trusted_sha256 is not null
        and attachment_name is not null
        and attachment_mime_type = 'application/pdf'
        and attachment_source in ('COMPANY_TEMPLATE_PDF', 'PROGRAMMATIC_PDF_FALLBACK')
        and destination is null
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
  add constraint document_send_audits_status_check
    check (status in ('SENT', 'DELIVERED', 'FAILED', 'CANCELLED')),
  add constraint document_send_audits_document_type_check
    check (document_type in ('PURCHASE_ORDER', 'CLIENT_INVOICE', 'GENERAL_EMAIL', 'GENERAL_SMS')),
  add constraint document_send_audits_delivery_channel_check
    check (delivery_channel in ('GMAIL', 'SMS')),
  add constraint document_send_audits_delivery_kind_check
    check (
      (delivery_channel = 'GMAIL' and delivery_kind = 'ISSUED_DOCUMENT' and document_type in ('PURCHASE_ORDER', 'CLIENT_INVOICE'))
      or (delivery_channel = 'GMAIL' and delivery_kind = 'GENERAL_EMAIL' and document_type = 'GENERAL_EMAIL')
      or (delivery_channel = 'SMS' and delivery_kind = 'GENERAL_SMS' and document_type = 'GENERAL_SMS')
    ),
  add constraint document_send_audits_destination_check
    check (destination is null or destination ~ '^\+639[0-9]{9}$'),
  add constraint document_send_audits_provider_id_check
    check (provider_id is null or provider_id in ('GMAIL', 'ANDROID_SIM_GATEWAY', 'PHILSMS')),
  add constraint document_send_audits_provider_message_id_check
    check (provider_message_id is null or (length(btrim(provider_message_id)) between 1 and 200 and provider_message_id !~ '[[:cntrl:]]')),
  add constraint document_send_audits_provider_status_check
    check (provider_status is null or (length(btrim(provider_status)) between 1 and 80 and provider_status !~ '[[:cntrl:]]')),
  add constraint document_send_audits_delivery_shape_check
    check (
      (
        delivery_channel = 'GMAIL'
        and delivery_kind = 'GENERAL_EMAIL'
        and snapshot_id is null
        and document_id is null
        and attachment_name is null
        and attachment_sha256 is null
        and destination is null
      )
      or (
        delivery_channel = 'SMS'
        and delivery_kind = 'GENERAL_SMS'
        and snapshot_id is null
        and document_id is null
        and attachment_name is null
        and attachment_sha256 is null
        and attachment_source = 'NONE'
        and destination is not null
        and provider_id in ('ANDROID_SIM_GATEWAY', 'PHILSMS')
        and message_body_sha256 is not null
        and jsonb_typeof(recipients) = 'array'
        and jsonb_array_length(recipients) = 1
        and recipients ->> 0 = destination
        and jsonb_typeof(cc) = 'array'
        and jsonb_array_length(cc) = 0
        and subject = 'SMS'
      )
      or (
        delivery_channel = 'GMAIL'
        and delivery_kind = 'ISSUED_DOCUMENT'
        and snapshot_id is not null
        and document_id is not null
        and destination is null
      )
    );

drop index if exists public.document_send_audits_send_intent_unique;
create unique index if not exists document_send_audits_send_intent_status_unique
  on public.document_send_audits(send_intent_id, status)
  where send_intent_id is not null;
create index if not exists document_send_intents_company_channel_idx
  on public.document_send_intents(company_id, delivery_channel, created_at desc);
create unique index if not exists document_send_intents_provider_message_unique
  on public.document_send_intents(company_id, provider_id, provider_message_id)
  where provider_id is not null and provider_message_id is not null;

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

  if new.delivery_kind = 'GENERAL_SMS' then
    if new.delivery_channel <> 'SMS'
      or new.document_type <> 'GENERAL_SMS'
      or new.snapshot_id is not null
      or new.document_id is not null
      or new.trusted_sha256 is not null
      or new.attachment_name is not null
      or new.attachment_mime_type is not null
      or new.attachment_source <> 'NONE'
      or new.message_body_sha256 is null
      or new.destination is null
      or jsonb_typeof(new.recipients) <> 'array'
      or jsonb_array_length(new.recipients) <> 1
      or new.recipients ->> 0 <> new.destination
      or jsonb_typeof(new.cc) <> 'array'
      or jsonb_array_length(new.cc) <> 0
      or new.subject <> 'SMS'
      or new.provider_id is null
      or new.provider_id not in ('ANDROID_SIM_GATEWAY', 'PHILSMS') then
      raise exception 'SMS delivery intent shape is invalid' using errcode = '22023';
    end if;
    return new;
  end if;

  if new.delivery_kind = 'GENERAL_EMAIL' then
    if new.delivery_channel <> 'GMAIL'
      or new.document_type <> 'GENERAL_EMAIL'
      or new.snapshot_id is not null
      or new.document_id is not null
      or new.trusted_sha256 is not null
      or new.attachment_name is not null
      or new.attachment_mime_type is not null
      or new.attachment_source <> 'NONE'
      or new.message_body_sha256 is null
      or new.destination is not null then
      raise exception 'Plain email delivery intent shape is invalid' using errcode = '22023';
    end if;
    return new;
  end if;

  if new.delivery_kind <> 'ISSUED_DOCUMENT' or new.delivery_channel <> 'GMAIL' then
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
      raise exception 'Client Invoice read permission is required for this send intent' using errcode = '42501';
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
    or old.delivery_channel is distinct from new.delivery_channel
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
    or old.destination is distinct from new.destination
    or old.provider_id is distinct from new.provider_id
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
      or v_intent.status not in ('SENT', 'DELIVERED', 'FAILED', 'CANCELLED')
      or v_intent.sender_user_id is distinct from new.sender_user_id
      or v_intent.delivery_channel is distinct from new.delivery_channel
      or v_intent.delivery_kind is distinct from new.delivery_kind
      or v_intent.snapshot_id is distinct from new.snapshot_id
      or v_intent.document_type is distinct from new.document_type
      or v_intent.document_id is distinct from new.document_id
      or v_intent.trusted_sha256 is distinct from new.attachment_sha256
      or v_intent.message_body_sha256 is distinct from new.message_body_sha256
      or v_intent.destination is distinct from new.destination
      or v_intent.provider_id is distinct from new.provider_id
      or v_intent.provider_message_id is distinct from new.provider_message_id
      or v_intent.provider_status is distinct from new.provider_status
      or v_intent.reconciliation_required is distinct from new.reconciliation_required
      or v_intent.attachment_source is distinct from new.attachment_source then
      raise exception 'Delivery audit must match a completed durable send intent' using errcode = '42501';
    end if;
    if new.idempotency_key is distinct from v_intent.idempotency_key then
      raise exception 'Delivery audit idempotency key does not match its send intent' using errcode = '42501';
    end if;
  elsif new.delivery_channel <> 'GMAIL'
    or new.delivery_kind <> 'ISSUED_DOCUMENT'
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
  (delivery_kind in ('GENERAL_EMAIL', 'GENERAL_SMS') and (select private.can_read_general_delivery(company_id)))
  or (delivery_kind = 'ISSUED_DOCUMENT' and (
    (document_type = 'PURCHASE_ORDER' and (select public.has_company_permission(company_id, 'procurement.read')))
    or (document_type = 'CLIENT_INVOICE' and (select public.has_company_permission(company_id, 'projects.read')))
  ))
);

drop policy if exists document_send_audits_select on public.document_send_audits;
create policy document_send_audits_select on public.document_send_audits
for select to authenticated
using (
  (delivery_kind in ('GENERAL_EMAIL', 'GENERAL_SMS') and (select private.can_read_general_delivery(company_id)))
  or (delivery_kind = 'ISSUED_DOCUMENT' and (
    (document_type = 'PURCHASE_ORDER' and (select public.has_company_permission(company_id, 'procurement.read')))
    or (document_type = 'CLIENT_INVOICE' and (select public.has_company_permission(company_id, 'projects.read')))
  ))
);

create or replace function public.claim_sms_send_intent(
  p_provider_id text,
  p_destination text,
  p_idempotency_key text,
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
  v_provider text := upper(btrim(coalesce(p_provider_id, '')));
  v_destination text := btrim(coalesce(p_destination, ''));
  v_key text := nullif(btrim(p_idempotency_key), '');
  v_body_sha text := lower(btrim(coalesce(p_message_body_sha256, '')));
  v_recipients jsonb;
begin
  if v_actor is null then raise exception 'Authentication is required to send SMS' using errcode = '42501'; end if;
  if not (select private.has_company_permission(v_company_id, 'documents.send')) then raise exception 'Outbound message permission is required' using errcode = '42501'; end if;
  if v_provider not in ('ANDROID_SIM_GATEWAY', 'PHILSMS') then raise exception 'Unsupported SMS provider' using errcode = '22023'; end if;
  if v_destination !~ '^\+639[0-9]{9}$' then raise exception 'Philippine SMS destination is invalid' using errcode = '22023'; end if;
  if v_key is null or length(v_key) > 200 or v_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$' then raise exception 'SMS idempotency key is invalid' using errcode = '22023'; end if;
  if v_body_sha !~ '^[0-9a-f]{64}$' then raise exception 'SMS message body hash is invalid' using errcode = '22023'; end if;
  v_recipients := jsonb_build_array(v_destination);

  perform pg_advisory_xact_lock(hashtextextended(v_company_id::text || ':sms-send:' || v_key, 0));
  select i.* into v_intent
  from public.document_send_intents i
  where i.company_id = v_company_id and i.idempotency_key = v_key
  for update;
  if found then
    if v_intent.delivery_channel <> 'SMS'
      or v_intent.delivery_kind <> 'GENERAL_SMS'
      or v_intent.document_type <> 'GENERAL_SMS'
      or v_intent.provider_id <> v_provider
      or v_intent.destination <> v_destination
      or v_intent.recipients is distinct from v_recipients
      or v_intent.message_body_sha256 <> v_body_sha then
      raise exception 'SMS idempotency key is already bound to a different delivery request' using errcode = '23514';
    end if;
    if v_intent.status in ('SENT', 'DELIVERED') then return jsonb_build_object('intent', to_jsonb(v_intent), 'claimed', false, 'idempotent', true); end if;
    if v_intent.status in ('PENDING', 'ACCEPTED', 'UNKNOWN') then return jsonb_build_object('intent', to_jsonb(v_intent), 'claimed', false, 'reconcileRequired', true); end if;
    return jsonb_build_object('intent', to_jsonb(v_intent), 'claimed', false, 'reconcileRequired', true, 'newAttemptRequired', true);
  end if;

  insert into public.document_send_intents (
    company_id, delivery_channel, delivery_kind, snapshot_id, document_type, document_id, sender_user_id,
    idempotency_key, trusted_sha256, message_body_sha256, recipients, cc, subject, attachment_name,
    attachment_mime_type, attachment_source, destination, provider_id, status, reconciliation_required
  ) values (
    v_company_id, 'SMS', 'GENERAL_SMS', null, 'GENERAL_SMS', null, v_actor,
    v_key, null, v_body_sha, v_recipients, '[]'::jsonb, 'SMS', null,
    null, 'NONE', v_destination, v_provider, 'PENDING', false
  )
  on conflict (company_id, idempotency_key) do nothing
  returning * into v_intent;

  if v_intent.id is null then
    select i.* into v_intent from public.document_send_intents i where i.company_id = v_company_id and i.idempotency_key = v_key for update;
    if v_intent.delivery_channel <> 'SMS'
      or v_intent.delivery_kind <> 'GENERAL_SMS'
      or v_intent.provider_id <> v_provider
      or v_intent.destination <> v_destination
      or v_intent.recipients is distinct from v_recipients
      or v_intent.message_body_sha256 <> v_body_sha then
      raise exception 'SMS idempotency key is already bound to a different delivery request' using errcode = '23514';
    end if;
    if v_intent.status in ('SENT', 'DELIVERED') then return jsonb_build_object('intent', to_jsonb(v_intent), 'claimed', false, 'idempotent', true); end if;
    return jsonb_build_object('intent', to_jsonb(v_intent), 'claimed', false, 'reconcileRequired', true);
  end if;
  return jsonb_build_object('intent', to_jsonb(v_intent), 'claimed', true, 'idempotent', false);
end;
$$;

create or replace function public.complete_sms_delivery_intent(
  p_intent_id uuid,
  p_status text,
  p_provider_message_id text default null,
  p_provider_status text default null,
  p_error_message text default null,
  p_reconciliation_required boolean default false
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
  v_status text := upper(btrim(coalesce(p_status, '')));
  v_provider_message_id text := nullif(btrim(coalesce(p_provider_message_id, '')), '');
  v_provider_status text := nullif(left(regexp_replace(btrim(coalesce(p_provider_status, '')), '[[:cntrl:]]', '', 'g'), 80), '');
  v_error text := nullif(left(regexp_replace(btrim(coalesce(p_error_message, '')), '[[:cntrl:]]', '', 'g'), 1000), '');
  v_reconcile boolean := coalesce(p_reconciliation_required, false) or v_status = 'UNKNOWN';
begin
  if v_actor is null then raise exception 'Authentication is required to update SMS delivery' using errcode = '42501'; end if;
  if not (select private.has_company_permission(v_company_id, 'documents.send')) then raise exception 'Outbound message permission is required' using errcode = '42501'; end if;
  if v_status not in ('PENDING', 'ACCEPTED', 'SENT', 'DELIVERED', 'FAILED', 'CANCELLED', 'UNKNOWN') then raise exception 'Invalid SMS delivery state' using errcode = '22023'; end if;
  if v_provider_message_id is not null and (length(v_provider_message_id) > 200 or v_provider_message_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$') then raise exception 'SMS provider message reference is invalid' using errcode = '22023'; end if;
  select i.* into v_intent from public.document_send_intents i where i.id = p_intent_id and i.company_id = v_company_id for update;
  if not found then raise exception 'SMS delivery intent was not found' using errcode = '23503'; end if;
  if v_intent.delivery_channel <> 'SMS' or v_intent.delivery_kind <> 'GENERAL_SMS' then raise exception 'The delivery intent is not an SMS intent' using errcode = '22023'; end if;
  if v_intent.sender_user_id is distinct from v_actor then raise exception 'Only the initiating sender can update this SMS delivery' using errcode = '42501'; end if;
  if v_status in ('ACCEPTED', 'SENT', 'DELIVERED') and coalesce(v_provider_message_id, v_intent.provider_message_id) is null then raise exception 'A provider message reference is required for this SMS state' using errcode = '22023'; end if;
  if v_intent.status = v_status
    and v_intent.provider_message_id is not distinct from coalesce(v_provider_message_id, v_intent.provider_message_id)
    and v_intent.provider_status is not distinct from v_provider_status
    and v_intent.reconciliation_required = v_reconcile then
    return jsonb_build_object('intent', to_jsonb(v_intent), 'idempotent', true);
  end if;
  if v_intent.status in ('FAILED', 'CANCELLED') and v_intent.status <> v_status then raise exception 'SMS delivery intent is already terminal' using errcode = '40901'; end if;
  if v_intent.status = 'DELIVERED' and v_status <> 'DELIVERED' and v_status <> 'FAILED' then raise exception 'SMS delivery intent cannot move backwards' using errcode = '40901'; end if;
  if v_intent.status = 'SENT' and v_status in ('PENDING', 'ACCEPTED', 'CANCELLED') then raise exception 'SMS delivery intent cannot move backwards' using errcode = '40901'; end if;
  if v_intent.status = 'ACCEPTED' and v_status = 'PENDING' then raise exception 'SMS delivery intent cannot move backwards' using errcode = '40901'; end if;

  update public.document_send_intents
  set status = v_status,
      provider_message_id = coalesce(v_provider_message_id, provider_message_id),
      provider_status = v_provider_status,
      error_message = v_error,
      reconciliation_required = v_reconcile,
      updated_at = now()
  where id = v_intent.id
  returning * into v_intent;
  return jsonb_build_object('intent', to_jsonb(v_intent), 'idempotent', false);
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
  if v_status not in ('SENT', 'DELIVERED', 'FAILED', 'CANCELLED') then raise exception 'Invalid delivery audit status' using errcode = '22023'; end if;
  select i.* into v_intent from public.document_send_intents i where i.id = p_intent_id and i.company_id = v_company_id for update;
  if not found then raise exception 'Delivery intent was not found' using errcode = '23503'; end if;
  if v_intent.sender_user_id is distinct from v_actor then raise exception 'Only the initiating sender can record this delivery audit' using errcode = '42501'; end if;
  if v_intent.status is distinct from v_status then raise exception 'Delivery audit status does not match the durable intent' using errcode = '42501'; end if;
  select a.* into v_audit from public.document_send_audits a where a.send_intent_id = v_intent.id and a.status = v_status order by a.created_at desc limit 1 for update;
  if found then return jsonb_build_object('audit', to_jsonb(v_audit), 'idempotent', true); end if;

  insert into public.document_send_audits (
    company_id, delivery_channel, delivery_kind, snapshot_id, document_type, document_id, sender_user_id, recipients, cc, subject,
    attachment_name, attachment_sha256, message_body_sha256, gmail_message_id, status, error_message, send_intent_id,
    idempotency_key, attachment_mime_type, attachment_source, attachment_size, template_version, template_version_id,
    template_content_sha256, artifact_storage_path, artifact_storage_provider, artifact_storage_bucket, source_artifact_storage_path,
    source_artifact_storage_provider, source_artifact_storage_bucket, source_artifact_size, source_artifact_sha256, converter_id,
    converter_version, destination, provider_id, provider_message_id, provider_status, reconciliation_required
  ) values (
    v_intent.company_id, v_intent.delivery_channel, v_intent.delivery_kind, v_intent.snapshot_id, v_intent.document_type, v_intent.document_id, v_actor,
    v_intent.recipients, v_intent.cc, v_intent.subject, v_intent.attachment_name, v_intent.trusted_sha256, v_intent.message_body_sha256,
    case when v_intent.delivery_channel = 'GMAIL' then nullif(btrim(coalesce(p_gmail_message_id, '')), '') else null end, v_status,
    nullif(left(btrim(coalesce(p_error_message, '')), 1000), ''), v_intent.id, v_intent.idempotency_key, v_intent.attachment_mime_type,
    v_intent.attachment_source, v_intent.attachment_size, v_intent.template_version, v_intent.template_version_id, v_intent.template_content_sha256,
    v_intent.artifact_storage_path, v_intent.artifact_storage_provider, v_intent.artifact_storage_bucket, v_intent.source_artifact_storage_path,
    v_intent.source_artifact_storage_provider, v_intent.source_artifact_storage_bucket, v_intent.source_artifact_size, v_intent.source_artifact_sha256,
    v_intent.converter_id, v_intent.converter_version, v_intent.destination, v_intent.provider_id, v_intent.provider_message_id,
    v_intent.provider_status, v_intent.reconciliation_required
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
  if new.status not in ('SENT', 'DELIVERED', 'FAILED', 'CANCELLED')
    or old.status is not distinct from new.status then
    return new;
  end if;
  if (select auth.uid()) is null or new.sender_user_id is distinct from (select auth.uid()) then
    raise exception 'Terminal delivery audit actor must match the initiating sender' using errcode = '42501';
  end if;
  if exists (select 1 from public.document_send_audits a where a.company_id = new.company_id and a.send_intent_id = new.id and a.status = new.status) then
    return new;
  end if;
  insert into public.document_send_audits (
    company_id, delivery_channel, delivery_kind, snapshot_id, document_type, document_id, sender_user_id, recipients, cc, subject,
    attachment_name, attachment_sha256, message_body_sha256, gmail_message_id, status, error_message, send_intent_id,
    idempotency_key, attachment_mime_type, attachment_source, attachment_size, template_version, template_version_id,
    template_content_sha256, artifact_storage_path, artifact_storage_provider, artifact_storage_bucket, source_artifact_storage_path,
    source_artifact_storage_provider, source_artifact_storage_bucket, source_artifact_size, source_artifact_sha256, converter_id,
    converter_version, destination, provider_id, provider_message_id, provider_status, reconciliation_required
  ) values (
    new.company_id, new.delivery_channel, new.delivery_kind, new.snapshot_id, new.document_type, new.document_id, new.sender_user_id, new.recipients, new.cc, new.subject,
    new.attachment_name, new.trusted_sha256, new.message_body_sha256, new.gmail_message_id, new.status, new.error_message, new.id,
    new.idempotency_key, new.attachment_mime_type, new.attachment_source, new.attachment_size, new.template_version, new.template_version_id,
    new.template_content_sha256, new.artifact_storage_path, new.artifact_storage_provider, new.artifact_storage_bucket, new.source_artifact_storage_path,
    new.source_artifact_storage_provider, new.source_artifact_storage_bucket, new.source_artifact_size, new.source_artifact_sha256, new.converter_id,
    new.converter_version, new.destination, new.provider_id, new.provider_message_id, new.provider_status, new.reconciliation_required
  );
  return new;
end;
$$;

drop trigger if exists document_send_intents_terminal_audit on public.document_send_intents;
create trigger document_send_intents_terminal_audit
after update of status on public.document_send_intents
for each row
when (old.status is distinct from new.status and new.status in ('SENT', 'DELIVERED', 'FAILED', 'CANCELLED'))
execute function public.ensure_document_send_terminal_audit();

revoke all on function public.claim_sms_send_intent(text, text, text, text) from public, anon;
grant execute on function public.claim_sms_send_intent(text, text, text, text) to authenticated;
revoke all on function public.complete_sms_delivery_intent(uuid, text, text, text, text, boolean) from public, anon;
grant execute on function public.complete_sms_delivery_intent(uuid, text, text, text, text, boolean) to authenticated;
revoke all on function public.record_document_send_audit(uuid, text, text, text) from public, anon;
grant execute on function public.record_document_send_audit(uuid, text, text, text) to authenticated;
revoke execute on function public.ensure_document_send_terminal_audit() from public, anon, authenticated;
