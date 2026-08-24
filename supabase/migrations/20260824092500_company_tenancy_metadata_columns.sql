-- Columns required by the foundation metadata update triggers.
alter table public.company_invitations
  add column if not exists updated_at timestamptz not null default now();
