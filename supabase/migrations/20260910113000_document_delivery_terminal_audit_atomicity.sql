-- Wave 4C review follow-up: terminal Gmail outcomes must not be able to
-- commit without their immutable delivery audit. UNKNOWN remains deliberately
-- unresolved because provider acceptance is not known safely.

create or replace function public.ensure_document_send_terminal_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status not in ('SENT', 'FAILED')
    or old.status is not distinct from new.status then
    return new;
  end if;

  if (select auth.uid()) is null
    or new.sender_user_id is distinct from (select auth.uid()) then
    raise exception 'Terminal document delivery audit actor must match the initiating sender' using errcode = '42501';
  end if;

  if exists (
    select 1
    from public.document_send_audits a
    where a.company_id = new.company_id
      and a.send_intent_id = new.id
  ) then
    return new;
  end if;

  insert into public.document_send_audits (
    company_id,
    snapshot_id,
    document_type,
    document_id,
    sender_user_id,
    recipients,
    cc,
    subject,
    attachment_name,
    attachment_sha256,
    gmail_message_id,
    status,
    error_message,
    send_intent_id,
    idempotency_key,
    attachment_mime_type,
    attachment_source,
    attachment_size,
    template_version,
    template_version_id,
    template_content_sha256,
    artifact_storage_path,
    artifact_storage_provider,
    artifact_storage_bucket,
    source_artifact_storage_path,
    source_artifact_storage_provider,
    source_artifact_storage_bucket,
    source_artifact_size,
    source_artifact_sha256,
    converter_id,
    converter_version
  ) values (
    new.company_id,
    new.snapshot_id,
    new.document_type,
    new.document_id,
    new.sender_user_id,
    new.recipients,
    new.cc,
    new.subject,
    new.attachment_name,
    new.trusted_sha256,
    new.gmail_message_id,
    new.status,
    new.error_message,
    new.id,
    new.idempotency_key,
    new.attachment_mime_type,
    new.attachment_source,
    new.attachment_size,
    new.template_version,
    new.template_version_id,
    new.template_content_sha256,
    new.artifact_storage_path,
    new.artifact_storage_provider,
    new.artifact_storage_bucket,
    new.source_artifact_storage_path,
    new.source_artifact_storage_provider,
    new.source_artifact_storage_bucket,
    new.source_artifact_size,
    new.source_artifact_sha256,
    new.converter_id,
    new.converter_version
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

revoke execute on function public.ensure_document_send_terminal_audit() from public, anon, authenticated;
