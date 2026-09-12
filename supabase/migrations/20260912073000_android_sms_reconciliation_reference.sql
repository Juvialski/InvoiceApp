-- Preserve the deterministic Android gateway message identity before transport.
-- HydroQualiSense supplies this custom id to SMS Gateway for Android, so the
-- durable send intent can safely reconcile a timeout/5xx even when the HTTP
-- response never returns the id.

create or replace function public.ensure_android_sms_reconciliation_reference()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.delivery_channel = 'SMS'
    and new.delivery_kind = 'GENERAL_SMS'
    and new.provider_id = 'ANDROID_SIM_GATEWAY'
    and new.provider_message_id is null then
    new.provider_message_id := 'hs_' || left(
      encode(extensions.digest(convert_to(new.idempotency_key, 'UTF8'), 'sha256'), 'hex'),
      32
    );
  end if;
  return new;
end;
$$;

drop trigger if exists document_send_intents_android_reconciliation_reference
  on public.document_send_intents;
create trigger document_send_intents_android_reconciliation_reference
before insert or update of provider_id, provider_message_id, idempotency_key
on public.document_send_intents
for each row
execute function public.ensure_android_sms_reconciliation_reference();

revoke execute on function public.ensure_android_sms_reconciliation_reference()
from public, anon, authenticated, service_role;
