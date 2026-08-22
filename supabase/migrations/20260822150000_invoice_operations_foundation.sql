-- Invoice Operations foundation: persistent Gmail sources, original files,
-- immutable AI extraction snapshots, editable invoices, and review history.

create table if not exists public.gmail_sync_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  last_history_id text,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.email_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  gmail_message_id text not null,
  gmail_thread_id text,
  gmail_history_id text,
  subject text not null default '',
  sender text not null default '',
  recipients jsonb not null default '[]'::jsonb,
  cc jsonb not null default '[]'::jsonb,
  received_at timestamptz,
  body_text text not null default '',
  body_html text not null default '',
  snippet text not null default '',
  labels jsonb not null default '[]'::jsonb,
  raw_storage_path text,
  ai_classification jsonb,
  processing_status text not null default 'NEW',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, gmail_message_id)
);

create table if not exists public.source_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  email_message_id uuid references public.email_messages(id) on delete set null,
  source_type text not null default 'UPLOAD',
  gmail_attachment_id text,
  filename text not null,
  mime_type text not null default 'application/octet-stream',
  file_size bigint not null default 0,
  storage_path text not null,
  sha256 text not null,
  document_type text,
  processing_status text not null default 'STORED',
  created_at timestamptz not null default now()
);

create table if not exists public.vendors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  normalized_name text not null,
  email text,
  phone text,
  tax_id text,
  address text,
  default_currency text,
  default_category text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, normalized_name)
);

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_document_id uuid references public.source_documents(id) on delete set null,
  source_email_id uuid references public.email_messages(id) on delete set null,
  vendor_id uuid references public.vendors(id) on delete set null,
  invoice_number text,
  invoice_date date,
  due_date date,
  currency text,
  grand_total numeric(18,2) not null default 0,
  payment_status text not null default 'UNPAID',
  review_status text not null default 'NEEDS_REVIEW',
  document_type text not null default 'INVOICE',
  current_data jsonb not null default '{}'::jsonb,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.invoice_line_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  item_index integer not null default 0,
  description text not null default '',
  sku text,
  quantity numeric(18,4) not null default 0,
  unit_price numeric(18,4) not null default 0,
  line_total numeric(18,2) not null default 0,
  item_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.invoice_extractions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  model text not null,
  raw_result text,
  structured_result jsonb not null default '{}'::jsonb,
  confidence numeric(6,2),
  validation_result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.invoice_review_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  event_type text not null,
  field_name text,
  previous_value jsonb,
  new_value jsonb,
  created_at timestamptz not null default now()
);

create index if not exists email_messages_user_received_idx on public.email_messages(user_id, received_at desc);
create index if not exists source_documents_user_email_idx on public.source_documents(user_id, email_message_id);
create index if not exists source_documents_user_sha_idx on public.source_documents(user_id, sha256);
create index if not exists invoices_user_review_idx on public.invoices(user_id, review_status, created_at desc);
create index if not exists invoices_user_vendor_idx on public.invoices(user_id, vendor_id, invoice_date desc);
create index if not exists invoices_user_number_idx on public.invoices(user_id, invoice_number);
create index if not exists invoice_line_items_invoice_idx on public.invoice_line_items(invoice_id, item_index);
create index if not exists invoice_extractions_invoice_idx on public.invoice_extractions(invoice_id, created_at desc);
create index if not exists invoice_review_events_invoice_idx on public.invoice_review_events(invoice_id, created_at desc);

alter table public.gmail_sync_state enable row level security;
alter table public.email_messages enable row level security;
alter table public.source_documents enable row level security;
alter table public.vendors enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_line_items enable row level security;
alter table public.invoice_extractions enable row level security;
alter table public.invoice_review_events enable row level security;

-- Minimal ownership policies. A later hardening pass can add team/workspace roles.
do $$
declare
  t text;
begin
  foreach t in array array['gmail_sync_state','email_messages','source_documents','vendors','invoices','invoice_line_items','invoice_extractions','invoice_review_events']
  loop
    execute format('drop policy if exists %I on public.%I', t || '_select_own', t);
    execute format('drop policy if exists %I on public.%I', t || '_insert_own', t);
    execute format('drop policy if exists %I on public.%I', t || '_update_own', t);
    execute format('drop policy if exists %I on public.%I', t || '_delete_own', t);
    execute format('create policy %I on public.%I for select to authenticated using ((select auth.uid()) = user_id)', t || '_select_own', t);
    execute format('create policy %I on public.%I for insert to authenticated with check ((select auth.uid()) = user_id)', t || '_insert_own', t);
    execute format('create policy %I on public.%I for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', t || '_update_own', t);
    execute format('create policy %I on public.%I for delete to authenticated using ((select auth.uid()) = user_id)', t || '_delete_own', t);
  end loop;
end $$;

-- Current Supabase projects may require explicit Data API grants in addition to RLS.
grant usage on schema public to authenticated;
grant select, insert, update, delete on table
  public.gmail_sync_state,
  public.email_messages,
  public.source_documents,
  public.vendors,
  public.invoices,
  public.invoice_line_items,
  public.invoice_extractions,
  public.invoice_review_events
  to authenticated;

insert into storage.buckets (id, name, public, file_size_limit)
values
  ('invoice-originals', 'invoice-originals', false, 52428800),
  ('email-originals', 'email-originals', false, 26214400)
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit;

drop policy if exists "invoice originals read own" on storage.objects;
drop policy if exists "invoice originals insert own" on storage.objects;
drop policy if exists "invoice originals update own" on storage.objects;
drop policy if exists "invoice originals delete own" on storage.objects;
drop policy if exists "email originals read own" on storage.objects;
drop policy if exists "email originals insert own" on storage.objects;
drop policy if exists "email originals update own" on storage.objects;
drop policy if exists "email originals delete own" on storage.objects;

create policy "invoice originals read own" on storage.objects for select to authenticated
using (bucket_id = 'invoice-originals' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "invoice originals insert own" on storage.objects for insert to authenticated
with check (bucket_id = 'invoice-originals' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "invoice originals update own" on storage.objects for update to authenticated
using (bucket_id = 'invoice-originals' and (storage.foldername(name))[1] = (select auth.uid())::text)
with check (bucket_id = 'invoice-originals' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "invoice originals delete own" on storage.objects for delete to authenticated
using (bucket_id = 'invoice-originals' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "email originals read own" on storage.objects for select to authenticated
using (bucket_id = 'email-originals' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "email originals insert own" on storage.objects for insert to authenticated
with check (bucket_id = 'email-originals' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "email originals update own" on storage.objects for update to authenticated
using (bucket_id = 'email-originals' and (storage.foldername(name))[1] = (select auth.uid())::text)
with check (bucket_id = 'email-originals' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "email originals delete own" on storage.objects for delete to authenticated
using (bucket_id = 'email-originals' and (storage.foldername(name))[1] = (select auth.uid())::text);
