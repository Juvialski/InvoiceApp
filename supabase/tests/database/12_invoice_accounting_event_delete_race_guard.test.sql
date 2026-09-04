begin;
select no_plan();

insert into auth.users (id, email, encrypted_password, created_at, updated_at)
values ('00000000-0000-4000-8000-000000000412'::uuid, 'invoice-accounting-lock@test.local', 'x', now(), now())
on conflict (id) do nothing;

insert into public.companies (id, name, company_code, status, default_currency, timezone, created_by_user_id)
values
  ('aaaaaaaa-0000-4000-8000-000000000412'::uuid, 'Invoice Accounting Lock A', 'invoice-accounting-lock-a', 'ACTIVE', 'PHP', 'Asia/Manila', '00000000-0000-4000-8000-000000000412'::uuid),
  ('bbbbbbbb-0000-4000-8000-000000000412'::uuid, 'Invoice Accounting Lock B', 'invoice-accounting-lock-b', 'ACTIVE', 'PHP', 'Asia/Manila', '00000000-0000-4000-8000-000000000412'::uuid);

insert into public.projects (id, user_id, company_id, project_code, project_name, status, project_budget, currency)
values
  ('10000000-0000-4000-8000-000000000412'::uuid, '00000000-0000-4000-8000-000000000412'::uuid, 'aaaaaaaa-0000-4000-8000-000000000412'::uuid, 'IAL-A', 'Invoice Accounting Lock Project A', 'ACTIVE', 0, 'PHP'),
  ('20000000-0000-4000-8000-000000000412'::uuid, '00000000-0000-4000-8000-000000000412'::uuid, 'bbbbbbbb-0000-4000-8000-000000000412'::uuid, 'IAL-B', 'Invoice Accounting Lock Project B', 'ACTIVE', 0, 'PHP');

insert into public.invoices (id, user_id, company_id, invoice_number, currency, grand_total, payment_status, review_status, current_data)
values
  ('b2000000-0000-4000-8000-000000000412'::uuid, '00000000-0000-4000-8000-000000000412'::uuid, 'aaaaaaaa-0000-4000-8000-000000000412'::uuid, 'IAL-INV-A', 'PHP', 10, 'UNPAID', 'NEEDS_REVIEW', '{}'::jsonb),
  ('b2000000-0000-4000-8000-000000000413'::uuid, '00000000-0000-4000-8000-000000000412'::uuid, 'bbbbbbbb-0000-4000-8000-000000000412'::uuid, 'IAL-INV-B', 'PHP', 10, 'UNPAID', 'NEEDS_REVIEW', '{}'::jsonb);

select ok(
  exists (
    select 1
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'project_accounting_events'
      and t.tgname = 'project_accounting_events_invoice_target_lock'
      and not t.tgisinternal
  ),
  'project accounting events have an invoice-target serialization trigger'
);

select lives_ok(
  $$insert into public.project_accounting_events (user_id, company_id, project_id, entity_type, entity_id, event_type, description)
    values ('00000000-0000-4000-8000-000000000412'::uuid, 'aaaaaaaa-0000-4000-8000-000000000412'::uuid, '10000000-0000-4000-8000-000000000412'::uuid, 'INVOICE', 'b2000000-0000-4000-8000-000000000412'::uuid, 'TEST', 'valid invoice target')$$,
  'same-company invoice accounting event remains valid'
);

select throws_ok(
  $$insert into public.project_accounting_events (user_id, company_id, project_id, entity_type, entity_id, event_type, description)
    values ('00000000-0000-4000-8000-000000000412'::uuid, 'aaaaaaaa-0000-4000-8000-000000000412'::uuid, '10000000-0000-4000-8000-000000000412'::uuid, 'INVOICE', 'b2000000-0000-4000-8000-000000000413'::uuid, 'TEST', 'cross-company invoice target')$$,
  '42501',
  'Invoice accounting history target is outside the company',
  'cross-company polymorphic invoice target is rejected by the existing ownership guard before serialization'
);

select throws_ok(
  $$insert into public.project_accounting_events (user_id, company_id, project_id, entity_type, entity_id, event_type, description)
    values ('00000000-0000-4000-8000-000000000412'::uuid, 'aaaaaaaa-0000-4000-8000-000000000412'::uuid, '10000000-0000-4000-8000-000000000412'::uuid, 'INVOICE', 'b2000000-0000-4000-8000-000000000499'::uuid, 'TEST', 'missing invoice target')$$,
  '42501',
  'Invoice accounting history target is outside the company',
  'missing polymorphic invoice target is rejected by the existing ownership guard before serialization'
);

select * from finish();
rollback;
