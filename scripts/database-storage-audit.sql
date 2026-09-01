-- ============================================================================
-- Engoryx Database Storage & Growth Audit Diagnostic Script
-- File: scripts/database-storage-audit.sql
--
-- STRICTLY READ-ONLY DIAGNOSTIC TOOLING
-- Safety Guarantees:
--   - Only SELECT and WITH (CTE) queries.
--   - ZERO DDL (no CREATE, ALTER, DROP, TRUNCATE).
--   - ZERO DML (no INSERT, UPDATE, DELETE, MERGE).
--   - ZERO Maintenance / Locking operations (no VACUUM FULL, REINDEX, CLUSTER, LOCK).
--   - ZERO Security / Role changes (no SET ROLE, GRANT, REVOKE, RLS alterations).
--   - ZERO Hardcoded credentials or deployment secrets.
--
-- Target Environments:
--   PostgreSQL 14 / 15 / 16 (Standard Supabase Managed Database)
-- ============================================================================


-- ============================================================================
-- SECTION 1: GLOBAL DATABASE OVERVIEW & STATS
-- ============================================================================
-- Returns database identity, server version, database storage footprint,
-- and aggregate user table and index counts.

select
    current_database() as database_name,
    version() as postgres_version,
    pg_size_pretty(pg_database_size(current_database())) as total_database_size,
    pg_database_size(current_database()) as total_database_size_bytes,
    (select count(*) from pg_stat_user_tables where schemaname = 'public') as public_table_count,
    (select count(*) from pg_stat_user_indexes where schemaname = 'public') as public_index_count,
    (select coalesce(sum(n_live_tup), 0) from pg_stat_user_tables where schemaname = 'public') as estimated_total_live_tuples;


-- ============================================================================
-- SECTION 2: TABLE STORAGE & ROW ESTIMATES (LARGEST TABLES FIRST)
-- ============================================================================
-- Breaks down total relation size into table heap, indexes, and TOAST
-- (which stores out-of-line large JSONB, TEXT, and arrays).

with table_sizes as (
    select
        c.oid as table_oid,
        n.nspname as schema_name,
        c.relname as table_name,
        coalesce(s.n_live_tup, c.reltuples::bigint) as estimated_live_rows,
        coalesce(s.n_dead_tup, 0) as estimated_dead_rows,
        pg_relation_size(c.oid) as heap_size_bytes,
        pg_indexes_size(c.oid) as index_size_bytes,
        coalesce(pg_total_relation_size(c.reltoastrelid), 0) as toast_size_bytes,
        pg_total_relation_size(c.oid) as total_size_bytes
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    left join pg_stat_user_tables s on s.relid = c.oid
    where n.nspname = 'public'
      and c.relkind = 'r'
)
select
    schema_name,
    table_name,
    estimated_live_rows,
    estimated_dead_rows,
    pg_size_pretty(heap_size_bytes) as heap_size,
    pg_size_pretty(index_size_bytes) as index_size,
    pg_size_pretty(toast_size_bytes) as toast_size,
    pg_size_pretty(total_size_bytes) as total_size,
    round(100.0 * total_size_bytes / nullif(pg_database_size(current_database()), 0), 2) as pct_of_database,
    total_size_bytes
from table_sizes
order by total_size_bytes desc;


-- ============================================================================
-- SECTION 3: INDEX STORAGE & SCAN EFFICIENCY DIAGNOSTICS
-- ============================================================================
-- Lists all user indexes with their disk footprint, scan counts, uniqueness,
-- and definitions to identify oversize or unused/redundant indexes.

select
    i.schemaname as schema_name,
    i.relname as table_name,
    i.indexrelname as index_name,
    pg_size_pretty(pg_relation_size(i.indexrelid)) as index_size,
    pg_relation_size(i.indexrelid) as index_size_bytes,
    i.idx_scan as total_scans,
    i.idx_tup_read as tuples_read,
    i.idx_tup_fetch as tuples_fetched,
    idx.indisunique as is_unique,
    pg_get_indexdef(i.indexrelid) as index_definition
from pg_stat_user_indexes i
join pg_index idx on idx.indexrelid = i.indexrelid
where i.schemaname = 'public'
order by pg_relation_size(i.indexrelid) desc;


-- ============================================================================
-- SECTION 3B: POTENTIALLY REDUNDANT OR LOW-USAGE INDEXES
-- ============================================================================
-- Flags non-primary-key, non-unique indexes with 0 scans on tables that have rows,
-- or legacy single-tenant indexes remaining after tenancy transition.

select
    i.relname as table_name,
    i.indexrelname as index_name,
    pg_size_pretty(pg_relation_size(i.indexrelid)) as index_size,
    i.idx_scan as total_scans,
    case
        when i.indexrelname ~ 'user_id' and exists (
            select 1 from pg_stat_user_indexes i2
            where i2.relname = i.relname
              and i2.indexrelname ~ 'company_id'
        ) then 'LEGACY_USER_INDEX_HAS_COMPANY_COUNTERPART'
        when i.idx_scan = 0 and not idx.indisunique and not idx.indisprimary then 'ZERO_SCANS_NON_UNIQUE'
        else 'ACTIVE_OR_CONSTRAINT'
    end as diagnostic_hint,
    pg_get_indexdef(i.indexrelid) as index_definition
from pg_stat_user_indexes i
join pg_index idx on idx.indexrelid = i.indexrelid
where i.schemaname = 'public'
  and (
      (i.idx_scan = 0 and not idx.indisunique and not idx.indisprimary)
      or (i.indexrelname ~ 'user_id' and i.indexrelname !~ 'company_id')
  )
order by pg_relation_size(i.indexrelid) desc;


-- ============================================================================
-- SECTION 4: JSON / JSONB / TEXT / BYTEA COLUMN STORAGE INVENTORY
-- ============================================================================
-- Identifies every table and column storing variable-length or semi-structured
-- data types (JSONB, JSON, TEXT, VARCHAR, BYTEA) across the public schema.

select
    table_name,
    column_name,
    data_type,
    case
        when data_type in ('json', 'jsonb') then 'JSON_STRUCTURED'
        when data_type in ('text', 'character varying') then 'VARIABLE_TEXT'
        when data_type = 'bytea' then 'IN_DB_BINARY'
        when data_type = 'ARRAY' then 'ARRAY_PAYLOAD'
        else 'OTHER'
    end as storage_category,
    is_nullable
from information_schema.columns
where table_schema = 'public'
  and data_type in ('json', 'jsonb', 'text', 'character varying', 'bytea', 'ARRAY')
order by table_name, ordinal_position;


-- ============================================================================
-- SECTION 4B: BINARY DATA IN POSTGRES CHECK
-- ============================================================================
-- Confirms whether any durable binary / bytea storage exists inside Postgres.
-- Expected Engoryx Architecture: 0 bytea columns (all binaries offloaded to Supabase Storage).

select
    table_name,
    column_name,
    data_type
from information_schema.columns
where table_schema = 'public'
  and data_type = 'bytea';


-- ============================================================================
-- SECTION 5: HIGH-GROWTH AUDIT, LOG & EVENT TABLES ANALYSIS
-- ============================================================================
-- Evaluates row counts and recency distributions for event and audit tables.

with audit_event_stats as (
    select
        'company_audit_events' as table_name,
        count(*) as total_rows,
        count(*) filter (where created_at >= now() - interval '24 hours') as rows_last_24h,
        count(*) filter (where created_at >= now() - interval '7 days') as rows_last_7d,
        count(*) filter (where created_at >= now() - interval '30 days') as rows_last_30d,
        count(*) filter (where created_at < now() - interval '90 days') as rows_older_90d
    from public.company_audit_events
),
project_event_stats as (
    select
        'project_accounting_events' as table_name,
        count(*) as total_rows,
        count(*) filter (where created_at >= now() - interval '24 hours') as rows_last_24h,
        count(*) filter (where created_at >= now() - interval '7 days') as rows_last_7d,
        count(*) filter (where created_at >= now() - interval '30 days') as rows_last_30d,
        count(*) filter (where created_at < now() - interval '90 days') as rows_older_90d
    from public.project_accounting_events
),
invoice_review_stats as (
    select
        'invoice_review_events' as table_name,
        count(*) as total_rows,
        count(*) filter (where created_at >= now() - interval '24 hours') as rows_last_24h,
        count(*) filter (where created_at >= now() - interval '7 days') as rows_last_7d,
        count(*) filter (where created_at >= now() - interval '30 days') as rows_last_30d,
        count(*) filter (where created_at < now() - interval '90 days') as rows_older_90d
    from public.invoice_review_events
),
assistant_action_stats as (
    select
        'assistant_action_events' as table_name,
        count(*) as total_rows,
        count(*) filter (where created_at >= now() - interval '24 hours') as rows_last_24h,
        count(*) filter (where created_at >= now() - interval '7 days') as rows_last_7d,
        count(*) filter (where created_at >= now() - interval '30 days') as rows_last_30d,
        count(*) filter (where created_at < now() - interval '90 days') as rows_older_90d
    from public.assistant_action_events
),
assistant_message_stats as (
    select
        'assistant_messages' as table_name,
        count(*) as total_rows,
        count(*) filter (where created_at >= now() - interval '24 hours') as rows_last_24h,
        count(*) filter (where created_at >= now() - interval '7 days') as rows_last_7d,
        count(*) filter (where created_at >= now() - interval '30 days') as rows_last_30d,
        count(*) filter (where created_at < now() - interval '90 days') as rows_older_90d
    from public.assistant_messages
),
site_log_event_stats as (
    select
        'engineering_daily_site_log_events' as table_name,
        count(*) as total_rows,
        count(*) filter (where created_at >= now() - interval '24 hours') as rows_last_24h,
        count(*) filter (where created_at >= now() - interval '7 days') as rows_last_7d,
        count(*) filter (where created_at >= now() - interval '30 days') as rows_last_30d,
        count(*) filter (where created_at < now() - interval '90 days') as rows_older_90d
    from public.engineering_daily_site_log_events
)
select * from audit_event_stats
union all
select * from project_event_stats
union all
select * from invoice_review_stats
union all
select * from assistant_action_stats
union all
select * from assistant_message_stats
union all
select * from site_log_event_stats;


-- ============================================================================
-- SECTION 5B: AUDIT EVENT TYPE DISTRIBUTION (TOP EVENT PRODUCERS)
-- ============================================================================
-- Pinpoints specific action types driving event table growth.

select
    event_type,
    count(*) as event_count,
    min(created_at) as earliest_event,
    max(created_at) as latest_event
from public.company_audit_events
group by event_type
order by event_count desc
limit 20;


-- ============================================================================
-- SECTION 6: TEMPORARY / STAGING & PRUNABLE CANDIDATES
-- ============================================================================
-- Measures row counts for records in uncommitted, voided, expired, or staging states.

with payroll_staging_summary as (
    select
        'payroll_import_rows: staged/ready/skipped/error' as category,
        count(*) as candidate_count,
        'Active staging rows waiting for user review or correction' as description
    from public.payroll_import_rows
    where status in ('STAGED', 'READY', 'SKIPPED', 'ERROR')
),
payroll_committed_summary as (
    select
        'payroll_import_rows: committed' as category,
        count(*) as candidate_count,
        'Historical import rows from finalized batches (reconstructable from storage)' as description
    from public.payroll_import_rows
    where status = 'COMMITTED'
),
payroll_voided_batches as (
    select
        'payroll_import_batches: failed/voided' as category,
        count(*) as candidate_count,
        'Abandoned or failed payroll workbook import batches' as description
    from public.payroll_import_batches
    where status in ('FAILED', 'VOIDED')
),
assistant_expired_actions as (
    select
        'assistant_action_events: expired/cancelled' as category,
        count(*) as candidate_count,
        'Stale unexecuted or expired AI action proposals' as description
    from public.assistant_action_events
    where status in ('EXPIRED', 'CANCELLED')
       or (status = 'PREPARED' and expires_at < now())
),
voided_invoices as (
    select
        'invoices: voided/rejected' as category,
        count(*) as candidate_count,
        'Invoices voided or rejected during intake/review' as description
    from public.invoices
    where lifecycle_status = 'VOID'
       or review_status = 'REJECTED'
),
voided_work_entries as (
    select
        'work_entries: voided' as category,
        count(*) as candidate_count,
        'Time entries explicitly voided by project supervisor' as description
    from public.work_entries
    where status = 'VOID'
),
voided_expenses as (
    select
        'expenses: voided' as category,
        count(*) as candidate_count,
        'Expenses explicitly voided or cancelled' as description
    from public.expenses
    where status = 'VOID'
),
unlinked_source_documents as (
    select
        'source_documents: unlinked' as category,
        count(*) as candidate_count,
        'Uploaded source documents not referenced by any invoice, expense, or import batch' as description
    from public.source_documents sd
    where not exists (select 1 from public.invoices i where i.source_document_id = sd.id)
      and not exists (select 1 from public.expenses e where e.receipt_source_document_id = sd.id)
      and not exists (select 1 from public.financial_import_batches fb where fb.source_document_id = sd.id)
)
select * from payroll_staging_summary
union all
select * from payroll_committed_summary
union all
select * from payroll_voided_batches
union all
select * from assistant_expired_actions
union all
select * from voided_invoices
union all
select * from voided_work_entries
union all
select * from voided_expenses
union all
select * from unlinked_source_documents;


-- ============================================================================
-- SECTION 7: OFF-DB STORAGE POINTERS & TRACKED FILE SIZES
-- ============================================================================
-- Inventories pointers to external Supabase Storage files to monitor off-database
-- binary growth across modules.

select
    'source_documents' as entity_type,
    count(*) as document_count,
    pg_size_pretty(coalesce(sum(file_size), 0)::bigint) as total_file_size,
    coalesce(sum(file_size), 0)::bigint as total_file_size_bytes
from public.source_documents
union all
select
    'engineering_document_revisions' as entity_type,
    count(*) as document_count,
    pg_size_pretty(coalesce(sum(file_size_bytes), 0)::bigint) as total_file_size,
    coalesce(sum(file_size_bytes), 0)::bigint as total_file_size_bytes
from public.engineering_document_revisions
union all
select
    'payroll_import_batches' as entity_type,
    count(*) as document_count,
    pg_size_pretty(coalesce(sum(file_size), 0)::bigint) as total_file_size,
    coalesce(sum(file_size), 0)::bigint as total_file_size_bytes
from public.payroll_import_batches
where storage_path is not null;

