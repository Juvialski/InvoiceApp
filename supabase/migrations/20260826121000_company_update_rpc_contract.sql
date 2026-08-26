-- Correct the deployed platform company update overloads. Earlier tenancy
-- migrations left both a five-argument wrapper and a six-argument wrapper in
-- public, which makes named PostgREST calls version-dependent. Keep one
-- canonical function whose parameter names match the browser contract.

drop function if exists public.platform_update_company(uuid, text, text, text, text);
drop function if exists public.platform_update_company(uuid, text, text, text, text, text);

create function public.platform_update_company(
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
  if not (select private.is_platform_admin()) then
    raise exception 'Platform administrator access is required' using errcode = '42501';
  end if;

  v_company := public.update_company(p_company_id, p_name, p_company_code, p_default_currency, p_timezone);
  if p_status is null then return v_company; end if;

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
