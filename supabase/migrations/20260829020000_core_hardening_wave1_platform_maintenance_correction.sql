-- Core Hardening Wave 1 correction: keep client company-profile editing and
-- internal platform maintenance as separate authorization paths.
--
-- Company Admins use public.update_company(), which is membership-authorized.
-- Internal maintenance operators use public.platform_update_company(), which
-- requires explicit platform-admin authorization and never requires company
-- membership.

create or replace function public.platform_update_company(
  p_company_id uuid,
  p_name text default null,
  p_company_code text default null,
  p_status text default null,
  p_default_currency text default null,
  p_timezone text default null
)
returns public.companies
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company public.companies;
begin
  perform private.require_platform_deployment_company(p_company_id);

  update public.companies c
  set name = coalesce(nullif(btrim(p_name), ''), c.name),
      company_code = coalesce(nullif(lower(btrim(p_company_code)), ''), c.company_code),
      default_currency = coalesce(nullif(upper(btrim(p_default_currency)), ''), c.default_currency),
      timezone = coalesce(nullif(btrim(p_timezone), ''), c.timezone),
      updated_at = now()
  where c.id = p_company_id
  returning * into v_company;

  if not found then
    raise exception 'Deployment company does not exist' using errcode = '22023';
  end if;

  perform private.write_company_audit(
    v_company.id,
    'COMPANY_UPDATED',
    'company',
    v_company.id,
    jsonb_build_object(
      'name', v_company.name,
      'company_code', v_company.company_code,
      'default_currency', v_company.default_currency,
      'timezone', v_company.timezone,
      'maintenance_path', true
    )
  );

  if p_status is null then
    return v_company;
  end if;

  case upper(btrim(p_status))
    when 'ACTIVE' then v_company := public.reactivate_company(p_company_id);
    when 'SUSPENDED' then v_company := public.suspend_company(p_company_id);
    when 'ARCHIVED' then v_company := public.archive_company(p_company_id);
    else raise exception 'Invalid company status' using errcode = '22023';
  end case;

  return v_company;
end;
$$;

revoke execute on function public.platform_update_company(uuid, text, text, text, text, text) from public, anon;
grant execute on function public.platform_update_company(uuid, text, text, text, text, text) to authenticated;
