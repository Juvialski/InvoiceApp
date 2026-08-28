-- Client deployments must not inherit global platform operators from the
-- legacy tenancy migrations. Those immutable migrations have no provenance
-- column that can distinguish a repository seed from a deliberately
-- provisioned internal operator, so this forward-only deployment migration
-- clears the inherited operator records. An internal maintenance operator,
-- if required, must be provisioned explicitly after deployment through a
-- controlled service-role process; no client migration grants it implicitly.
delete from public.platform_admins;
delete from public.platform_admin_allowlist;

create or replace function private.require_platform_deployment_company(p_company_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := (select private.deployment_company_id());
begin
  if not (select private.is_platform_admin()) then
    raise exception 'Explicit platform maintenance authorization is required' using errcode = '42501';
  end if;
  if v_company_id is null then
    raise exception 'Engoryx deployment company is not configured' using errcode = '55000';
  end if;
  if p_company_id is distinct from v_company_id then
    raise exception 'Platform maintenance cannot target another Engoryx deployment company' using errcode = '42501';
  end if;
  return v_company_id;
end;
$$;

revoke execute on function private.require_platform_deployment_company(uuid) from public, anon, authenticated;

create or replace function public.update_company(
  p_company_id uuid,
  p_name text default null,
  p_company_code text default null,
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
  if not found then raise exception 'Deployment company does not exist' using errcode = '22023'; end if;
  perform private.write_company_audit(v_company.id, 'COMPANY_UPDATED', 'company', v_company.id, jsonb_build_object('name', v_company.name, 'company_code', v_company.company_code, 'default_currency', v_company.default_currency, 'timezone', v_company.timezone));
  return v_company;
end;
$$;

create or replace function public.platform_update_company(
  p_company_id uuid,
  p_name text default null,
  p_status text default null,
  p_default_currency text default null,
  p_timezone text default null,
  p_company_code text default null
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
  v_company := public.update_company(p_company_id, p_name, p_company_code, p_default_currency, p_timezone);
  if p_status is null then return v_company; end if;
  case upper(p_status)
    when 'ACTIVE' then v_company := public.reactivate_company(p_company_id);
    when 'SUSPENDED' then v_company := public.suspend_company(p_company_id);
    when 'ARCHIVED' then v_company := public.archive_company(p_company_id);
    else raise exception 'Invalid company status' using errcode = '22023';
  end case;
  return v_company;
end;
$$;

create or replace function public.suspend_company(p_company_id uuid)
returns public.companies
language plpgsql
security definer
set search_path = ''
as $$
declare v_company public.companies;
begin
  perform private.require_platform_deployment_company(p_company_id);
  update public.companies c set status = 'SUSPENDED', updated_at = now() where c.id = p_company_id returning * into v_company;
  if not found then raise exception 'Deployment company does not exist' using errcode = '22023'; end if;
  perform private.write_company_audit(v_company.id, 'COMPANY_SUSPENDED', 'company', v_company.id, '{}'::jsonb);
  return v_company;
end;
$$;

create or replace function public.archive_company(p_company_id uuid)
returns public.companies
language plpgsql
security definer
set search_path = ''
as $$
declare v_company public.companies;
begin
  perform private.require_platform_deployment_company(p_company_id);
  update public.companies c set status = 'ARCHIVED', archived_at = coalesce(c.archived_at, now()), updated_at = now() where c.id = p_company_id returning * into v_company;
  if not found then raise exception 'Deployment company does not exist' using errcode = '22023'; end if;
  perform private.write_company_audit(v_company.id, 'COMPANY_ARCHIVED', 'company', v_company.id, '{}'::jsonb);
  return v_company;
end;
$$;

create or replace function public.reactivate_company(p_company_id uuid)
returns public.companies
language plpgsql
security definer
set search_path = ''
as $$
declare v_company public.companies;
begin
  perform private.require_platform_deployment_company(p_company_id);
  update public.companies c set status = 'ACTIVE', archived_at = null, updated_at = now() where c.id = p_company_id returning * into v_company;
  if not found then raise exception 'Deployment company does not exist' using errcode = '22023'; end if;
  perform private.write_company_audit(v_company.id, 'COMPANY_REACTIVATED', 'company', v_company.id, '{}'::jsonb);
  return v_company;
end;
$$;

create or replace function public.platform_suspend_company(p_company_id uuid)
returns public.companies
language sql
security definer
set search_path = ''
as $$ select public.suspend_company(p_company_id); $$;

create or replace function public.platform_archive_company(p_company_id uuid)
returns public.companies
language sql
security definer
set search_path = ''
as $$ select public.archive_company(p_company_id); $$;

create or replace function public.platform_reactivate_company(p_company_id uuid)
returns public.companies
language sql
security definer
set search_path = ''
as $$ select public.reactivate_company(p_company_id); $$;

-- Retire the older five-argument platform-update overload when upgrading from
-- repositories that created it. DROP IF EXISTS is safe on fresh replays too.
drop function if exists public.platform_update_company(uuid, text, text, text, text);

revoke execute on function public.update_company(uuid, text, text, text, text) from public, anon;
revoke execute on function public.platform_update_company(uuid, text, text, text, text, text) from public, anon;
revoke execute on function public.suspend_company(uuid) from public, anon;
revoke execute on function public.archive_company(uuid) from public, anon;
revoke execute on function public.reactivate_company(uuid) from public, anon;
revoke execute on function public.platform_suspend_company(uuid) from public, anon;
revoke execute on function public.platform_archive_company(uuid) from public, anon;
revoke execute on function public.platform_reactivate_company(uuid) from public, anon;

grant execute on function public.update_company(uuid, text, text, text, text) to authenticated;
grant execute on function public.platform_update_company(uuid, text, text, text, text, text) to authenticated;
grant execute on function public.suspend_company(uuid) to authenticated;
grant execute on function public.archive_company(uuid) to authenticated;
grant execute on function public.reactivate_company(uuid) to authenticated;
grant execute on function public.platform_suspend_company(uuid) to authenticated;
grant execute on function public.platform_archive_company(uuid) to authenticated;
grant execute on function public.platform_reactivate_company(uuid) to authenticated;
