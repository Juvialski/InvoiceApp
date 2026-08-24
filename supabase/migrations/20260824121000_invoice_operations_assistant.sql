-- Invoice Operations AI persistence.
--
-- Conversations and prepared actions are private to their creator and
-- company. Binary attachment bytes are deliberately not stored here.

create table if not exists public.assistant_threads (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'Invoice Operations AI',
  context jsonb not null default '{}'::jsonb check (jsonb_typeof(context) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.assistant_messages (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  thread_id uuid not null references public.assistant_threads(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'tool', 'system')),
  content jsonb not null default '{}'::jsonb check (jsonb_typeof(content) = 'object'),
  created_at timestamptz not null default now()
);

create table if not exists public.assistant_action_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  thread_id uuid references public.assistant_threads(id) on delete set null,
  tool_name text not null,
  risk_tier text not null check (risk_tier in ('READ', 'NAVIGATION', 'PREPARE', 'NORMAL_MUTATION', 'BULK_MUTATION', 'FINANCIAL_FINALIZATION')),
  normalized_args jsonb not null default '{}'::jsonb check (jsonb_typeof(normalized_args) = 'object'),
  args_hash text not null,
  preview jsonb not null default '{}'::jsonb check (jsonb_typeof(preview) = 'object'),
  status text not null default 'PREPARED' check (status in ('PREPARED', 'CONFIRMED', 'EXECUTED', 'FAILED', 'CANCELLED', 'EXPIRED')),
  expires_at timestamptz not null,
  confirmed_at timestamptz,
  executed_at timestamptz,
  result_summary jsonb,
  error_summary jsonb,
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, idempotency_key)
);

create table if not exists public.assistant_attachment_refs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  thread_id uuid references public.assistant_threads(id) on delete set null,
  file_name text not null,
  mime_type text not null,
  byte_size bigint not null check (byte_size >= 0),
  sha256 text not null,
  kind text not null check (kind in ('TEXT', 'CSV', 'XLSX', 'IMAGE', 'PDF')),
  created_at timestamptz not null default now(),
  unique (company_id, user_id, sha256)
);

create index if not exists assistant_threads_owner_idx
  on public.assistant_threads(company_id, user_id, updated_at desc);
create index if not exists assistant_messages_thread_idx
  on public.assistant_messages(company_id, user_id, thread_id, created_at);
create index if not exists assistant_action_events_owner_status_idx
  on public.assistant_action_events(company_id, user_id, status, expires_at);
create index if not exists assistant_attachment_refs_thread_idx
  on public.assistant_attachment_refs(company_id, user_id, thread_id, created_at desc);

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'assistant_threads',
    'assistant_messages',
    'assistant_action_events',
    'assistant_attachment_refs'
  ] loop
    execute format('alter table public.%I enable row level security', v_table);
    execute format('drop policy if exists %I on public.%I', v_table || '_select', v_table);
    execute format('drop policy if exists %I on public.%I', v_table || '_insert', v_table);
    execute format('drop policy if exists %I on public.%I', v_table || '_update', v_table);
    execute format(
      'create policy %I on public.%I for select to authenticated using ((select auth.uid()) = user_id and (select public.is_active_company_member(company_id)))',
      v_table || '_select', v_table
    );
    execute format(
      'create policy %I on public.%I for insert to authenticated with check ((select auth.uid()) = user_id and (select public.is_active_company_member(company_id)))',
      v_table || '_insert', v_table
    );
    execute format(
      'create policy %I on public.%I for update to authenticated using ((select auth.uid()) = user_id and (select public.is_active_company_member(company_id))) with check ((select auth.uid()) = user_id and (select public.is_active_company_member(company_id)))',
      v_table || '_update', v_table
    );
  end loop;
end;
$$;

grant select, insert, update
on table public.assistant_threads, public.assistant_messages, public.assistant_action_events, public.assistant_attachment_refs
to authenticated;
revoke all
on table public.assistant_threads, public.assistant_messages, public.assistant_action_events, public.assistant_attachment_refs
from anon;

-- Keep direct ownership boundaries intact if a client attempts to move a
-- message/action to another user's thread or company.
create or replace function public.validate_assistant_thread_boundary()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_table_name = 'assistant_messages' and not exists (
    select 1 from public.assistant_threads t
    where t.id = new.thread_id and t.company_id = new.company_id and t.user_id = new.user_id
  ) then
    raise exception 'Assistant message thread is outside the owner company';
  end if;
  if tg_table_name = 'assistant_action_events' and new.thread_id is not null and not exists (
    select 1 from public.assistant_threads t
    where t.id = new.thread_id and t.company_id = new.company_id and t.user_id = new.user_id
  ) then
    raise exception 'Assistant action thread is outside the owner company';
  end if;
  if tg_table_name = 'assistant_attachment_refs' and new.thread_id is not null and not exists (
    select 1 from public.assistant_threads t
    where t.id = new.thread_id and t.company_id = new.company_id and t.user_id = new.user_id
  ) then
    raise exception 'Assistant attachment thread is outside the owner company';
  end if;
  return new;
end;
$$;

drop trigger if exists assistant_messages_boundary on public.assistant_messages;
create trigger assistant_messages_boundary
before insert or update on public.assistant_messages
for each row execute function public.validate_assistant_thread_boundary();

drop trigger if exists assistant_actions_boundary on public.assistant_action_events;
create trigger assistant_actions_boundary
before insert or update on public.assistant_action_events
for each row execute function public.validate_assistant_thread_boundary();

drop trigger if exists assistant_attachments_boundary on public.assistant_attachment_refs;
create trigger assistant_attachments_boundary
before insert or update on public.assistant_attachment_refs
for each row execute function public.validate_assistant_thread_boundary();

revoke execute on function public.validate_assistant_thread_boundary() from public, anon, authenticated;
