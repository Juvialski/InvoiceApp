-- Engineering project-costing foundation.
--
-- Project costs intentionally have three independent sources:
--   invoice_project_allocations, payroll_project_allocations, and expenses.
-- This preserves the existing invoice/current_data/extraction/review model and
-- avoids converting invoice rows into duplicate expense rows.
--
-- Confirmed-cost semantics used by the application:
--   VERIFIED invoice allocations, APPROVED/PAID payroll allocations, and
--   APPROVED/PAID expenses are confirmed. NEEDS_REVIEW/DRAFT payroll or
--   DRAFT expenses are pending. VOID expenses/payroll are excluded.
-- Foreign currency is retained, but is not numerically added to a project's
-- default currency without a future explicit exchange-rate feature.

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_code text not null,
  project_name text not null,
  description text,
  client_name text,
  client_reference text,
  location text,
  site_address text,
  project_manager text,
  status text not null default 'PLANNING' check (status in ('PLANNING','ACTIVE','ON_HOLD','COMPLETED','CANCELLED','ARCHIVED')),
  start_date date,
  target_end_date date,
  actual_end_date date,
  contract_value numeric(18,2) check (contract_value is null or contract_value >= 0),
  project_budget numeric(18,2) not null default 0 check (project_budget >= 0),
  currency text not null default 'PHP' check (currency = upper(currency) and currency ~ '^[A-Z]{3}$'),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create table if not exists public.invoice_project_allocations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete restrict,
  allocation_type text not null default 'AMOUNT' check (allocation_type in ('AMOUNT','PERCENTAGE')),
  allocation_percentage numeric(7,4) check (allocation_percentage is null or (allocation_percentage >= 0 and allocation_percentage <= 100)),
  allocation_amount numeric(18,2) check (allocation_amount is null or allocation_amount >= 0),
  currency text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (invoice_id, project_id),
  check ((allocation_type = 'AMOUNT' and allocation_amount is not null) or (allocation_type = 'PERCENTAGE' and allocation_percentage is not null))
);

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid references public.projects(id) on delete restrict,
  expense_date date not null default current_date,
  category text not null default 'Miscellaneous',
  description text not null default '',
  payee text,
  amount numeric(18,2) not null check (amount >= 0),
  currency text not null default 'PHP' check (currency = upper(currency) and currency ~ '^[A-Z]{3}$'),
  payment_method text,
  reference_number text,
  status text not null default 'DRAFT' check (status in ('DRAFT','APPROVED','PAID','VOID')),
  receipt_source_document_id uuid references public.source_documents(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create table if not exists public.workers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  employee_code text not null,
  first_name text not null,
  middle_name text,
  last_name text not null,
  display_name text not null,
  employment_type text not null default 'OTHER' check (employment_type in ('REGULAR','PROJECT_BASED','CONTRACTUAL','DAILY','HOURLY','OTHER')),
  job_title text,
  department text,
  default_pay_type text not null default 'MONTHLY' check (default_pay_type in ('MONTHLY','DAILY','HOURLY')),
  default_rate numeric(18,2) not null default 0 check (default_rate >= 0),
  active boolean not null default true,
  hire_date date,
  end_date date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create table if not exists public.project_worker_assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  worker_id uuid not null references public.workers(id) on delete restrict,
  project_id uuid not null references public.projects(id) on delete restrict,
  start_date date not null,
  end_date date,
  pay_type text check (pay_type is null or pay_type in ('MONTHLY','DAILY','HOURLY')),
  rate numeric(18,2) check (rate is null or rate >= 0),
  role_on_project text,
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date is null or end_date >= start_date)
);

create table if not exists public.payroll_periods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  pay_date date,
  status text not null default 'DRAFT' check (status in ('DRAFT','OPEN','CALCULATED','APPROVED','PAID','VOID')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (period_end >= period_start)
);

create table if not exists public.work_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  worker_id uuid not null references public.workers(id) on delete restrict,
  project_id uuid not null references public.projects(id) on delete restrict,
  period_id uuid references public.payroll_periods(id) on delete set null,
  work_date date not null,
  regular_hours numeric(10,2) check (regular_hours is null or regular_hours >= 0),
  overtime_hours numeric(10,2) check (overtime_hours is null or overtime_hours >= 0),
  days_worked numeric(10,2) check (days_worked is null or days_worked >= 0),
  rate numeric(18,2) not null default 0 check (rate >= 0),
  overtime_rate numeric(18,2) check (overtime_rate is null or overtime_rate >= 0),
  description text,
  notes text,
  status text not null default 'DRAFT' check (status in ('DRAFT','SUBMITTED','APPROVED','VOID')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.payroll_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  period_id uuid not null references public.payroll_periods(id) on delete restrict,
  status text not null default 'DRAFT' check (status in ('DRAFT','CALCULATED','APPROVED','PAID','VOID')),
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  paid_at timestamptz,
  notes text,
  unique (user_id, period_id)
);

create table if not exists public.payroll_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  payroll_run_id uuid not null references public.payroll_runs(id) on delete cascade,
  worker_id uuid not null references public.workers(id) on delete restrict,
  base_pay numeric(18,2) not null default 0 check (base_pay >= 0),
  regular_pay numeric(18,2) not null default 0 check (regular_pay >= 0),
  overtime_pay numeric(18,2) not null default 0 check (overtime_pay >= 0),
  allowances numeric(18,2) not null default 0 check (allowances >= 0),
  gross_pay numeric(18,2) not null default 0 check (gross_pay >= 0),
  deductions numeric(18,2) not null default 0 check (deductions >= 0),
  net_pay numeric(18,2) not null default 0 check (net_pay >= 0),
  project_allocated_cost numeric(18,2) not null default 0 check (project_allocated_cost >= 0),
  calculation_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.payroll_project_allocations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  payroll_entry_id uuid not null references public.payroll_entries(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete restrict,
  allocation_amount numeric(18,2) not null check (allocation_amount >= 0),
  allocation_percentage numeric(7,4) check (allocation_percentage is null or (allocation_percentage >= 0 and allocation_percentage <= 100)),
  source text not null default 'MANUAL' check (source in ('TIME_ENTRY','MANUAL','DEFAULT_ASSIGNMENT')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (payroll_entry_id, project_id)
);

create table if not exists public.payroll_adjustments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  payroll_entry_id uuid not null references public.payroll_entries(id) on delete cascade,
  type text not null check (type in ('EARNING','DEDUCTION','EMPLOYER_COST')),
  code text,
  description text,
  amount numeric(18,2) not null check (amount >= 0),
  created_at timestamptz not null default now()
);

create table if not exists public.project_accounting_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  entity_type text not null,
  entity_id uuid,
  event_type text not null,
  description text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists projects_user_code_unique on public.projects(user_id, lower(project_code));
create index if not exists projects_user_status_idx on public.projects(user_id, status, updated_at desc);
create index if not exists projects_user_search_idx on public.projects(user_id, project_name, client_name, location);
create index if not exists invoice_project_allocations_project_idx on public.invoice_project_allocations(user_id, project_id, invoice_id);
create index if not exists invoice_project_allocations_invoice_idx on public.invoice_project_allocations(user_id, invoice_id);
create index if not exists expenses_project_date_idx on public.expenses(user_id, project_id, expense_date desc);
create index if not exists expenses_status_idx on public.expenses(user_id, status, expense_date desc);
create unique index if not exists workers_user_code_unique on public.workers(user_id, lower(employee_code));
create index if not exists workers_active_idx on public.workers(user_id, active, last_name, first_name);
create index if not exists project_worker_assignments_project_idx on public.project_worker_assignments(user_id, project_id, active);
create index if not exists project_worker_assignments_worker_idx on public.project_worker_assignments(user_id, worker_id, active);
create index if not exists payroll_periods_status_idx on public.payroll_periods(user_id, status, period_end desc);
create index if not exists work_entries_project_date_idx on public.work_entries(user_id, project_id, work_date desc);
create index if not exists work_entries_worker_date_idx on public.work_entries(user_id, worker_id, work_date desc);
create index if not exists payroll_entries_run_idx on public.payroll_entries(user_id, payroll_run_id, worker_id);
create index if not exists payroll_project_allocations_project_idx on public.payroll_project_allocations(user_id, project_id, payroll_entry_id);
create index if not exists payroll_adjustments_entry_idx on public.payroll_adjustments(user_id, payroll_entry_id);
create index if not exists project_accounting_events_project_idx on public.project_accounting_events(user_id, project_id, created_at desc);

create or replace function public.set_engineering_updated_at() returns trigger language plpgsql set search_path = public as $$ begin new.updated_at = now(); return new; end; $$;
do $$ declare table_name text; begin foreach table_name in array array['projects','invoice_project_allocations','expenses','workers','project_worker_assignments','payroll_periods','work_entries','payroll_project_allocations'] loop execute format('drop trigger if exists %I on public.%I', table_name || '_updated_at', table_name); execute format('create trigger %I before update on public.%I for each row execute function public.set_engineering_updated_at()', table_name || '_updated_at', table_name); end loop; end $$;

create or replace function public.prevent_archived_project_cost_assignment() returns trigger language plpgsql set search_path = public as $$ declare archived timestamptz; begin if new.project_id is null then return new; end if; select archived_at into archived from public.projects where id = new.project_id; if archived is not null then raise exception 'Archived projects cannot receive new cost assignments'; end if; return new; end; $$;
do $$ declare table_name text; begin foreach table_name in array array['invoice_project_allocations','expenses','project_worker_assignments','work_entries','payroll_project_allocations'] loop execute format('drop trigger if exists %I on public.%I', table_name || '_project_active', table_name); execute format('create trigger %I before insert or update on public.%I for each row execute function public.prevent_archived_project_cost_assignment()', table_name || '_project_active', table_name); end loop; end $$;

create or replace function public.validate_engineering_child_ownership() returns trigger language plpgsql set search_path = public as $$ begin
  if tg_table_name = 'invoice_project_allocations' and not exists (select 1 from public.invoices i join public.projects p on p.id = new.project_id where i.id = new.invoice_id and i.user_id = new.user_id and p.user_id = new.user_id) then raise exception 'Invoice and project must belong to the same workspace'; end if;
  if tg_table_name = 'expenses' and new.project_id is not null and not exists (select 1 from public.projects p where p.id = new.project_id and p.user_id = new.user_id) then raise exception 'Expense project is outside the current workspace'; end if;
  if tg_table_name = 'project_worker_assignments' and not exists (select 1 from public.workers w join public.projects p on p.id = new.project_id where w.id = new.worker_id and w.user_id = new.user_id and p.user_id = new.user_id) then raise exception 'Worker and project must belong to the same workspace'; end if;
  if tg_table_name = 'work_entries' and not exists (select 1 from public.workers w join public.projects p on p.id = new.project_id where w.id = new.worker_id and w.user_id = new.user_id and p.user_id = new.user_id) then raise exception 'Work entry worker and project must belong to the same workspace'; end if;
  if tg_table_name = 'work_entries' and new.period_id is not null and not exists (select 1 from public.payroll_periods pp where pp.id = new.period_id and pp.user_id = new.user_id) then raise exception 'Work entry payroll period is outside the current workspace'; end if;
  if tg_table_name = 'payroll_runs' and not exists (select 1 from public.payroll_periods p where p.id = new.period_id and p.user_id = new.user_id) then raise exception 'Payroll period is outside the current workspace'; end if;
  if tg_table_name = 'payroll_entries' and not exists (select 1 from public.payroll_runs r join public.workers w on w.id = new.worker_id where r.id = new.payroll_run_id and r.user_id = new.user_id and w.user_id = new.user_id) then raise exception 'Payroll entry is outside the current workspace'; end if;
  if tg_table_name = 'payroll_project_allocations' and not exists (select 1 from public.payroll_entries e join public.projects p on p.id = new.project_id where e.id = new.payroll_entry_id and e.user_id = new.user_id and p.user_id = new.user_id) then raise exception 'Payroll allocation is outside the current workspace'; end if;
  if tg_table_name = 'payroll_adjustments' and not exists (select 1 from public.payroll_entries e where e.id = new.payroll_entry_id and e.user_id = new.user_id) then raise exception 'Payroll adjustment is outside the current workspace'; end if;
  return new;
end; $$;
do $$ declare table_name text; begin foreach table_name in array array['invoice_project_allocations','expenses','project_worker_assignments','work_entries','payroll_runs','payroll_entries','payroll_project_allocations','payroll_adjustments'] loop execute format('drop trigger if exists %I on public.%I', table_name || '_ownership', table_name); execute format('create trigger %I before insert or update on public.%I for each row execute function public.validate_engineering_child_ownership()', table_name || '_ownership', table_name); end loop; end $$;

create or replace function public.validate_invoice_project_allocation_total() returns trigger language plpgsql set search_path = public as $$ declare target_invoice uuid; invoice_total numeric; allocated_total numeric; begin if tg_op = 'DELETE' then target_invoice := old.invoice_id; else target_invoice := new.invoice_id; end if; select grand_total into invoice_total from public.invoices where id = target_invoice; if invoice_total is null then if tg_op = 'DELETE' then return old; else return new; end if; end if; select coalesce(sum(case when allocation_type = 'PERCENTAGE' then invoice_total * coalesce(allocation_percentage,0) / 100 else coalesce(allocation_amount,0) end),0) into allocated_total from public.invoice_project_allocations where invoice_id = target_invoice; if allocated_total > invoice_total + 0.01 then raise exception 'Invoice project allocation exceeds invoice total by %', round(allocated_total - invoice_total, 2); end if; if tg_op = 'DELETE' then return old; else return new; end if; end; $$;
drop trigger if exists invoice_project_allocation_total_check on public.invoice_project_allocations;
create constraint trigger invoice_project_allocation_total_check after insert or update or delete on public.invoice_project_allocations deferrable initially deferred for each row execute function public.validate_invoice_project_allocation_total();

create or replace function public.validate_payroll_project_allocation_total() returns trigger language plpgsql set search_path = public as $$ declare target_entry uuid; entry_total numeric; allocated_total numeric; begin if tg_op = 'DELETE' then target_entry := old.payroll_entry_id; else target_entry := new.payroll_entry_id; end if; select project_allocated_cost into entry_total from public.payroll_entries where id = target_entry; if entry_total is null then if tg_op = 'DELETE' then return old; else return new; end if; end if; select coalesce(sum(allocation_amount),0) into allocated_total from public.payroll_project_allocations where payroll_entry_id = target_entry; if allocated_total > entry_total + 0.01 then raise exception 'Payroll project allocation exceeds payroll entry cost by %', round(allocated_total - entry_total, 2); end if; if tg_op = 'DELETE' then return old; else return new; end if; end; $$;
drop trigger if exists payroll_project_allocation_total_check on public.payroll_project_allocations;
create constraint trigger payroll_project_allocation_total_check after insert or update or delete on public.payroll_project_allocations deferrable initially deferred for each row execute function public.validate_payroll_project_allocation_total();

alter table public.projects enable row level security;
alter table public.invoice_project_allocations enable row level security;
alter table public.expenses enable row level security;
alter table public.workers enable row level security;
alter table public.project_worker_assignments enable row level security;
alter table public.payroll_periods enable row level security;
alter table public.work_entries enable row level security;
alter table public.payroll_runs enable row level security;
alter table public.payroll_entries enable row level security;
alter table public.payroll_project_allocations enable row level security;
alter table public.payroll_adjustments enable row level security;
alter table public.project_accounting_events enable row level security;

do $$ declare table_name text; begin foreach table_name in array array['projects','invoice_project_allocations','expenses','workers','project_worker_assignments','payroll_periods','work_entries','payroll_runs','payroll_entries','payroll_project_allocations','payroll_adjustments','project_accounting_events'] loop execute format('drop policy if exists %I on public.%I', table_name || '_select_own', table_name); execute format('drop policy if exists %I on public.%I', table_name || '_insert_own', table_name); execute format('drop policy if exists %I on public.%I', table_name || '_update_own', table_name); execute format('drop policy if exists %I on public.%I', table_name || '_delete_own', table_name); execute format('create policy %I on public.%I for select to authenticated using (user_id = (select auth.uid()))', table_name || '_select_own', table_name); execute format('create policy %I on public.%I for insert to authenticated with check (user_id = (select auth.uid()))', table_name || '_insert_own', table_name); execute format('create policy %I on public.%I for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', table_name || '_update_own', table_name); execute format('create policy %I on public.%I for delete to authenticated using (user_id = (select auth.uid()))', table_name || '_delete_own', table_name); end loop; end $$;
drop policy if exists projects_delete_own on public.projects;
drop policy if exists workers_delete_own on public.workers;
revoke delete on table public.projects, public.workers from authenticated;

grant usage on schema public to authenticated;
grant select, insert, update, delete on table public.projects, public.invoice_project_allocations, public.expenses, public.workers, public.project_worker_assignments, public.payroll_periods, public.work_entries, public.payroll_runs, public.payroll_entries, public.payroll_project_allocations, public.payroll_adjustments, public.project_accounting_events to authenticated;
