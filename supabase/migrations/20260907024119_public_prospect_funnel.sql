-- Public HydroQualiSense client requirements intake.
--
-- This is deliberately not an operational company table. It has no company,
-- membership, financial, payroll, document, Storage, or provisioning links.
-- The browser can call only the narrow anonymous submission function below;
-- direct table access remains revoked for every API role.

create table if not exists public.prospect_submissions (
  id uuid primary key default gen_random_uuid(),
  company_name text not null,
  contact_name text not null,
  contact_email text not null,
  contact_phone text,
  modules text[] not null default '{}'::text[],
  workforce_scale text not null,
  project_scale text not null,
  pain_points text,
  integration_needs text,
  desired_timeline text not null,
  request_type text not null,
  consent_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint prospect_submissions_company_name_check check (char_length(btrim(company_name)) between 1 and 160),
  constraint prospect_submissions_contact_name_check check (char_length(btrim(contact_name)) between 1 and 120),
  constraint prospect_submissions_contact_email_check check (char_length(btrim(contact_email)) between 3 and 254 and contact_email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  constraint prospect_submissions_contact_phone_check check (contact_phone is null or (char_length(btrim(contact_phone)) between 1 and 50 and btrim(contact_phone) ~ '^[+0-9() .xX-]+$' and btrim(contact_phone) ~ '[0-9]')),
  constraint prospect_submissions_modules_check check (
    cardinality(modules) <= 8
    and modules <@ array['projects', 'finance', 'procurement', 'warehouse', 'equipment', 'workforce', 'engineering-documents', 'field-operations', 'integrations']::text[]
    and array_position(modules, null) is null
  ),
  constraint prospect_submissions_workforce_scale_check check (workforce_scale in ('1-25', '26-100', '101-500', '501+', 'unknown')),
  constraint prospect_submissions_project_scale_check check (project_scale in ('1-5', '6-20', '21-50', '51+', 'unknown')),
  constraint prospect_submissions_timeline_check check (desired_timeline in ('exploring', 'within-3-months', 'within-6-months', 'later', 'unknown')),
  constraint prospect_submissions_request_type_check check (request_type in ('DEMO', 'REQUIREMENTS', 'DEMO_AND_REQUIREMENTS')),
  constraint prospect_submissions_pain_points_check check (pain_points is null or char_length(pain_points) <= 2000),
  constraint prospect_submissions_integration_needs_check check (integration_needs is null or char_length(integration_needs) <= 1500)
);

create index if not exists prospect_submissions_created_at_idx
  on public.prospect_submissions(created_at desc);

alter table public.prospect_submissions enable row level security;

-- The table is not a browser Data API surface. The anonymous RPC is the only
-- public write path and returns only an acceptance boolean.
revoke all on table public.prospect_submissions from public, anon, authenticated;

create or replace function public.submit_public_prospect(
  p_company_name text,
  p_contact_name text,
  p_contact_email text,
  p_contact_phone text,
  p_modules text[],
  p_workforce_scale text,
  p_project_scale text,
  p_pain_points text,
  p_integration_needs text,
  p_desired_timeline text,
  p_request_type text,
  p_consent_confirmed boolean
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_modules text[] := coalesce(p_modules, array[]::text[]);
begin
  -- This endpoint is intentionally anonymous. Authenticated operational users
  -- must not gain a second route into prospect data through their workspace.
  if auth.uid() is not null then
    raise exception 'Public prospect intake is anonymous only' using errcode = '42501';
  end if;

  if p_consent_confirmed is not true then
    raise exception 'Consent confirmation is required' using errcode = '22023';
  end if;
  if p_company_name is null or char_length(btrim(p_company_name)) not between 1 and 160 then
    raise exception 'Company name is invalid' using errcode = '22023';
  end if;
  if p_contact_name is null or char_length(btrim(p_contact_name)) not between 1 and 120 then
    raise exception 'Contact name is invalid' using errcode = '22023';
  end if;
  if p_contact_email is null or char_length(btrim(p_contact_email)) not between 3 and 254 or btrim(p_contact_email) !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'Contact email is invalid' using errcode = '22023';
  end if;
  if p_contact_phone is not null and (char_length(btrim(p_contact_phone)) < 1 or char_length(btrim(p_contact_phone)) > 50 or btrim(p_contact_phone) !~ '^[+0-9() .xX-]+$' or btrim(p_contact_phone) !~ '[0-9]') then
    raise exception 'Contact phone is invalid' using errcode = '22023';
  end if;
  if cardinality(v_modules) > 8 then
    raise exception 'Too many requested capabilities' using errcode = '22023';
  end if;
  if exists (
    select 1
    from unnest(v_modules) as module_name(value)
    where value not in ('projects', 'finance', 'procurement', 'warehouse', 'equipment', 'workforce', 'engineering-documents', 'field-operations', 'integrations')
  ) then
    raise exception 'A requested capability is invalid' using errcode = '22023';
  end if;
  if cardinality(v_modules) <> cardinality(array(select distinct value from unnest(v_modules) as module_name(value))) then
    raise exception 'Requested capabilities must be unique' using errcode = '22023';
  end if;
  if p_workforce_scale not in ('1-25', '26-100', '101-500', '501+', 'unknown') then
    raise exception 'Workforce scale is invalid' using errcode = '22023';
  end if;
  if p_project_scale not in ('1-5', '6-20', '21-50', '51+', 'unknown') then
    raise exception 'Project scale is invalid' using errcode = '22023';
  end if;
  if p_desired_timeline not in ('exploring', 'within-3-months', 'within-6-months', 'later', 'unknown') then
    raise exception 'Deployment timeline is invalid' using errcode = '22023';
  end if;
  if p_request_type not in ('DEMO', 'REQUIREMENTS', 'DEMO_AND_REQUIREMENTS') then
    raise exception 'Request type is invalid' using errcode = '22023';
  end if;
  if p_pain_points is not null and char_length(p_pain_points) > 2000 then
    raise exception 'Pain points are too long' using errcode = '22023';
  end if;
  if p_integration_needs is not null and char_length(p_integration_needs) > 1500 then
    raise exception 'Integration needs are too long' using errcode = '22023';
  end if;

  insert into public.prospect_submissions (
    company_name,
    contact_name,
    contact_email,
    contact_phone,
    modules,
    workforce_scale,
    project_scale,
    pain_points,
    integration_needs,
    desired_timeline,
    request_type
  ) values (
    btrim(p_company_name),
    btrim(p_contact_name),
    lower(btrim(p_contact_email)),
    nullif(btrim(p_contact_phone), ''),
    v_modules,
    p_workforce_scale,
    p_project_scale,
    nullif(btrim(p_pain_points), ''),
    nullif(btrim(p_integration_needs), ''),
    p_desired_timeline,
    p_request_type
  );

  return true;
end;
$$;

revoke all on function public.submit_public_prospect(text, text, text, text, text[], text, text, text, text, text, text, boolean) from public, authenticated;
grant execute on function public.submit_public_prospect(text, text, text, text, text[], text, text, text, text, text, text, boolean) to anon;
