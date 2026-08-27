# Engoryx Phase 1C: Daily Site Logs and Weather Tracking

## Scope

Phase 1C adds a project-scoped field-reporting layer for the question:

> What actually happened on the site today?

A Daily Site Log records the reporting day, weather and site conditions, crew/headcount observations, equipment usage, work performed, progress, delays and constraints, safety observations, general notes, and formal submission/finalization history. Records belong to one Engoryx company and one project.

The workspace is available under the project `Site Logs` section and uses the canonical project route:

`/projects/:projectId/site-logs?siteLogId=<id>`

## Data model

The additive migration `supabase/migrations/20260827150000_engineering_daily_site_logs_phase1c.sql` creates:

- `engineering_daily_site_logs` — the daily aggregate, deterministic report number, project/date identity, narrative fields, actor lineage, and lifecycle timestamps;
- `engineering_daily_site_log_weather` — one practical weather/site-condition observation per log;
- `engineering_daily_site_log_crew` — trade, crew, contractor, headcount, and optional observed hours;
- `engineering_daily_site_log_equipment` — equipment name/type, optional asset reference, operating and idle hours, operator note, and condition;
- `engineering_daily_site_log_safety` — a bounded site observation with severity, action, and resolved/open state; and
- `engineering_daily_site_log_events` — append-only lifecycle history.

The parent has a company/project/site-date uniqueness boundary and a company/project/report-number uniqueness boundary. Child records carry `company_id` and are checked against the parent before insertion or update.

## Lifecycle and history

The lifecycle is:

`DRAFT -> SUBMITTED -> FINALIZED`

An unfinalized record may be guarded as `VOID` with a required reason. Finalized records cannot be casually voided, deleted, or edited. Important lifecycle operations are recorded both in `engineering_daily_site_log_events` and `company_audit_events`:

- `ENGINEERING_DAILY_SITE_LOG_CREATED`
- `ENGINEERING_DAILY_SITE_LOG_UPDATED`
- `ENGINEERING_DAILY_SITE_LOG_SUBMITTED`
- `ENGINEERING_DAILY_SITE_LOG_FINALIZED`
- `ENGINEERING_DAILY_SITE_LOG_VOIDED`

Draft child rows are replaced atomically by the guarded draft-update operation. Submission validates the aggregate before changing status. Finalization revalidates the persisted aggregate and records the finalizing actor.

## Weather semantics

Weather is the field team’s practical site-condition observation, not an external meteorological source of truth. The UI accepts a condition, optional temperature/unit, precipitation notes, wind notes, humidity, and site-condition notes. Unknown or unavailable values may remain unrecorded; the feature does not invent measurements or require an external weather API.

## Crew/headcount boundary

Crew and headcount rows describe operational site presence. They may include regular or overtime hours only when observed by the field team. They are not payroll calculations and do not establish a worker’s payable time.

Daily Site Logs never automatically:

- create payroll attendance;
- create or alter timesheets or work entries;
- change overtime requests or approvals;
- alter payroll runs, entries, or allocations; or
- rewrite approved, paid, or finalized payroll history.

Any future connection between field observations and payroll must be an explicit, separately reviewed workflow.

## Equipment usage

Equipment rows capture daily usage observations such as operating hours, idle/downtime hours, operator/crew context, and observed condition. This is not the Phase 3 QR/barcode asset register and does not establish ownership, maintenance, or inventory truth.

## Safety scope

Safety entries are concise site-log observations and actions. They support a practical category, severity, description, action, resolved/open state, and notes. Phase 1C is not an enterprise HSE investigation, corrective-action, or regulatory reporting product.

## RBAC and database security

The capability vocabulary is:

- `engineering.site_logs.read`
- `engineering.site_logs.create`
- `engineering.site_logs.update`
- `engineering.site_logs.submit`
- `engineering.site_logs.manage`

Company admins receive the complete catalog. Existing Finance, Payroll, and Viewer roles receive read access only, preserving the existing read-only pattern. Other mutation permissions must be assigned explicitly.

All six tables have RLS enabled and expose only authenticated read access through permission-aware policies. Normal authenticated clients have no direct table write or delete grant. Important writes use authenticated-only `SECURITY DEFINER` RPCs with an empty search path, schema-qualified references, active company permission checks, project/company validation, actor identity from `auth.uid()`, and lifecycle/status guards:

- `create_engineering_daily_site_log`
- `update_engineering_daily_site_log_draft`
- `submit_engineering_daily_site_log`
- `finalize_engineering_daily_site_log`
- `void_engineering_daily_site_log`

The migration is additive and does not alter the applied Phase 1B migration.

## Assistant integration

The Assistant can read and navigate persisted Site Logs with:

- `search_site_logs`
- `get_site_log`
- `navigate_to_site_log`

It can prepare, but never silently execute, the following operations:

- `prepare_create_site_log`
- `prepare_update_site_log`
- `prepare_submit_site_log`
- `prepare_finalize_site_log`
- `prepare_void_site_log`

Confirmation revalidates the stored prepared action, company context, permission, normalized arguments, and the guarded database operation. Successful results may deep-link to the project Site Log. The Assistant does not use field observations as payroll attendance and does not gain a separate mutation path.

## Demo isolation

The deterministic Meridian Engineering & Construction Corp. demo includes current draft, submitted, finalized, rain-affected, concrete-pour, equipment-downtime, high-headcount, safety-observation, and delivery-constraint examples across its fictional projects. Demo Site Logs are held in the existing session-local `DemoWorkspaceProvider` state and reset with the existing Reset control. The public `/demo` application mode does not mount production authentication, Supabase queries, Storage, or company writes.

## Failure and offline behavior

The editor keeps form values in component state until a save is confirmed. A failed save, submission, or finalization leaves the editor/detail state visible and reports the failure; the UI does not claim a formal status without a confirmed server result. Draft retries reuse the draft identity, while the database project/date uniqueness boundary prevents duplicate daily logs. The current implementation uses the existing local/demo storage boundary and does not introduce a new synchronization framework.

## Responsive field UX

The register uses a practical table at larger widths and stacked cards on smaller screens. The editor uses touch-sized controls, grouped field sections, a mobile bottom-sheet presentation, and explicit save/submission actions. Detail views expose weather, crew, equipment, safety, narrative notes, and lifecycle history without forcing a desktop-only table.

## Tests and validation

Focused coverage includes lifecycle transitions, invalid dates, aggregate and child normalization, project/date uniqueness behavior, aggregate replacement, route/deep-link parsing, Assistant authorization and prepared operations, demo fixture relationships/reset behavior, migration structure/RLS/grants/RPC invariants, audit-event superset preservation, and the Assistant user-message contrast regression.

The repository validation commands remain:

```text
npm.cmd test
npm.cmd run lint
npm.cmd run build
npm.cmd run test:migrations
```

When Docker and a disposable Supabase database are available, also run clean replay, pgTAP, and the upgrade-path suite. A local/static pass does not prove authenticated production RLS, Gemini, Realtime, or deployment behavior.

## Intentionally deferred

Phase 1C does not include QR/barcode asset scanning, procurement/MRO, BIM/GIS/drone workflows, scheduling/Gantt, automatic payroll attendance creation, a full HSE investigation platform, subcontractor portals, SMS alerts, heavy photo/document intelligence, or an external weather API dependency.
