-- Idempotent schema prerequisites for running the InvoiceApp migration chain
-- against a throwaway Supabase-compatible PostgreSQL database.
--
-- Real hosted Supabase projects own these objects; this bootstrap only fills
-- gaps so the chain applies on local test containers. It never drops or
-- rewrites existing structures.

create schema if not exists auth;

create table if not exists auth.users (
  instance_id uuid,
  id uuid primary key,
  aud varchar(255),
  role varchar(255),
  email varchar(255),
  encrypted_password varchar(255),
  confirmed_at timestamptz,
  invited_at timestamptz,
  confirmation_token varchar(255),
  confirmation_sent_at timestamptz,
  recovery_token varchar(255),
  recovery_sent_at timestamptz,
  email_change_token_new varchar(255),
  email_change varchar(255),
  email_change_sent_at timestamptz,
  last_sign_in_at timestamptz,
  raw_app_meta_data jsonb,
  raw_user_meta_data jsonb,
  is_super_admin boolean,
  created_at timestamptz,
  updated_at timestamptz
);
alter table auth.users add column if not exists email_confirmed_at timestamptz;
alter table auth.users add column if not exists phone varchar(255);

create schema if not exists storage;
create table if not exists storage.buckets (
  id text primary key,
  name text not null,
  public boolean default false,
  file_size_limit bigint,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets(id),
  name text,
  owner uuid,
  metadata jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create or replace function storage.foldername(name text) returns text[] language plpgsql immutable as $fn$
begin
  return string_to_array(name, '/');
end;
$fn$;

-- auth.uid() resolves the PostgREST JWT claim. Hosted Supabase ships its own
-- version; only create it when missing.
do $bootstrap$
begin
  if to_regprocedure('auth.uid()') is null then
    execute $fn$
      create function auth.uid() returns uuid language sql stable as
      'select nullif(current_setting(''request.jwt.claim.sub'', true), '''')::uuid'
    $fn$;
  end if;
end $bootstrap$;

-- Supabase platform roles exist on compatible servers; grant only existing
-- roles so plain-Postgres containers fail loudly in the runner instead.
do $$
declare role_name text;
begin
  foreach role_name in array array['anon', 'authenticated', 'service_role'] loop
    if exists (select 1 from pg_roles where rolname = role_name) then
      execute format('grant usage on schema public, auth, storage to %I', role_name);
      if role_name <> 'anon' then
        execute format('grant select on table auth.users to %I', role_name);
        execute format('grant select on table storage.buckets to %I', role_name);
      end if;
      execute format('grant select, insert, update, delete on all tables in schema storage to %I', role_name);
    end if;
  end loop;
end $$;
