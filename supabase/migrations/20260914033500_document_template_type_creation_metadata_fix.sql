-- Preserve bounded descriptive metadata when a company creates a dynamic
-- document-template type. This intentionally follows the Slice 2 foundation
-- migration instead of mutating already-shared migration history.

create or replace function public.create_document_template_type(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_company_id uuid := nullif(btrim(coalesce(p_payload->>'companyId', p_payload->>'company_id', '')), '')::uuid;
  v_type_key text := nullif(btrim(coalesce(p_payload->>'typeKey', p_payload->>'type_key', '')), '');
  v_display_name text := nullif(left(btrim(coalesce(p_payload->>'displayName', p_payload->>'display_name', '')), 160), '');
  v_description text := nullif(left(btrim(coalesce(p_payload->>'description', '')), 500), '');
  v_category text := nullif(left(btrim(coalesce(p_payload->>'category', '')), 100), '');
  v_source_context text := upper(btrim(coalesce(p_payload->>'sourceContext', p_payload->>'source_context', 'GENERAL')));
  v_custom_fields jsonb := coalesce(p_payload->'customFields', p_payload->'custom_fields', '[]'::jsonb);
  v_repeat_sections jsonb := coalesce(p_payload->'repeatSections', p_payload->'repeat_sections', '[]'::jsonb);
  v_output_prefix text := nullif(left(btrim(coalesce(p_payload->>'outputFilenamePrefix', p_payload->>'output_filename_prefix', '')), 80), '');
  v_row public.document_template_type_definitions;
begin
  if v_user_id is null then raise exception 'Authentication is required to create a document type' using errcode = '42501'; end if;
  if v_company_id is null or v_company_id is distinct from (select private.deployment_company_id()) then raise exception 'Document type must belong to the deployment company' using errcode = '42501'; end if;
  if not (select private.has_company_permission(v_company_id, 'company.settings.manage')) then raise exception 'Company settings management permission is required' using errcode = '42501'; end if;
  if v_type_key is null or v_type_key !~ '^[A-Za-z][A-Za-z0-9_-]{1,79}$' then raise exception 'Document type key is invalid' using errcode = '22023'; end if;
  if v_display_name is null then raise exception 'A document type name is required' using errcode = '22023'; end if;
  if v_source_context not in ('PURCHASE_ORDER', 'CLIENT_INVOICE', 'PROJECT', 'GENERAL') then raise exception 'Document type source context is invalid' using errcode = '22023'; end if;
  if jsonb_typeof(v_custom_fields) <> 'array' or jsonb_array_length(v_custom_fields) > 40 or jsonb_typeof(v_repeat_sections) <> 'array' or jsonb_array_length(v_repeat_sections) > 5 then raise exception 'Document type field schema is invalid' using errcode = '22023'; end if;

  insert into public.document_template_type_definitions (
    company_id, type_key, display_name, description, category, source_context,
    custom_fields, repeat_sections, output_filename_prefix, created_by_user_id, updated_by_user_id
  ) values (
    v_company_id, v_type_key, v_display_name, v_description, v_category, v_source_context,
    v_custom_fields, v_repeat_sections, v_output_prefix, v_user_id, v_user_id
  ) returning * into v_row;

  return to_jsonb(v_row);
end;
$$;

revoke all on function public.create_document_template_type(jsonb) from public, anon, authenticated;
