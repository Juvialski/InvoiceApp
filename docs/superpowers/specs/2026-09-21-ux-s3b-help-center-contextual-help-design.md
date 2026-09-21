# UX-S3B — Help Center + Contextual Help Foundation

Status: APPROVED DESIGN FOR IMPLEMENTATION
Date: 2026-09-21
Repository: `Juvialski/InvoiceApp`
Starting `main` SHA: `e5ae27c9c12ed0cab19902cd6cd53dc0626ed884`

## Outcome

Add a small, static, authenticated Help Center and the shared interaction
infrastructure needed for later UX-S3C copy simplification. Users can search
current HydroQualiSense guidance, open stable topic links, reach the relevant
topic from major working-page headers, and reveal short secondary explanations
through an accessible click/tap popover.

S3B does not remove existing page copy, redesign workflows, change domain
authority, add a database/CMS/provider, or document deferred capabilities as if
they were available.

## Design decisions

### 1. One canonical topic model

Create `src/help/helpCatalog.ts` as the repository-backed source of truth. It
owns:

- stable `HelpTopicId` values;
- the 13 S3A taxonomy category IDs;
- user-facing title and summary;
- a concise Assistant-safe answer;
- article content expressed as purpose, task steps, important constraints,
  recovery guidance, and related topic IDs;
- the owning `RouteId` and deterministic search keywords;
- the route-to-default-topic registry.

The existing `src/assistant/helpCatalog.ts` remains a compatibility adapter. It
maps the canonical model into the existing `HelpCatalogEntry` shape, including
the legacy `details` field, search functions, Assistant references, and route
destination behavior. No second topic/content catalog is introduced.

The initial article set is intentionally small but useful: getting started,
supplier invoice review, project costing, procurement workbook review,
expenses, Cash & Banking and settlements, Documents/version history, Email/SMS
and provider status, payroll readiness/runs, company access/roles/permissions,
warehouse/equipment, vendor identity, reports, corrections/recovery, and
worksheet/import/responsive tips. Existing current-state topics are retained
where accurate and rewritten from the user task perspective where their old
details are overly technical.

### 2. Stable Help links and routing

Use `/help` as the canonical route. A topic is selected with a URL query:

- `/help`
- `/help?topic=<stable-topic-id>`

The shared `helpTopicPath(topicId?)` helper owns encoding and link creation.
Search state may use a replace-only `q` query value when useful, but topic
selection is the durable deep-link contract.

Add a dedicated `HelpLocation` variant to the existing application location
union rather than adding Help to the business `AppTab`/permission model. The
Help location carries only pathname, search, and an optional requested topic;
it is known to the app but has no company-domain permission requirement. The
shell suppresses business-route active highlighting and labels the current
context `Help Center` while the existing navigation remains available.

Unknown or invalid topic IDs resolve to the Help index with a clear, non-error
fallback message and no accidental selection of another article. Direct
opening, refresh, push navigation, back, and forward all use the existing
history/popstate mechanism.

### 3. Route-aware page Help action

Extend `PageHeader` with one shared Help affordance. Unless explicitly hidden
or overridden, it resolves the current pathname through the existing route
resolver and the canonical route/topic registry, then links to the matching
Help article. The action is visually secondary, keyboard reachable, touch-safe,
and implemented once in the shared header grammar. It uses `navigateInApp` so
SPA navigation and direct anchor URLs share the same stable destination.

The Help Center header opts out of its own Help action. Context-specific callers
may provide an explicit topic override; no caller duplicates button markup.

### 4. Accessible contextual-help primitive

Create one `ContextualHelp` primitive for brief secondary explanation. It uses
a visible native button trigger and a responsive popover/disclosure with:

- an accessible name and labelled content;
- native Enter/Space activation and click/tap support;
- Escape dismissal with focus returned to the trigger;
- outside-pointer dismissal;
- no focus trap and no hover-only dependency;
- bounded viewport-aware width and scrolling;
- optional Help Center article link.

The trigger is not used for task-critical requirements. Blocking validation,
stale/conflict, permission, provider, unresolved identity, irreversible
financial/lifecycle, approval, issue, payment, receiving, reconciliation, and
human-confirmation requirements remain visible inline.

Prove the primitive in three safe S3A contextual-help examples without removing
the existing safety copy in this phase:

1. Email/SMS attachment eligibility;
2. Documents ownership/origin filtering;
3. regional workspace settings terminology.

### 5. Help Center surface

Create an authenticated in-app Help route with a compact search-first layout:

1. concise page header and search;
2. a small “Start here” path;
3. category/topic index with counts or topic labels;
4. selected article with breadcrumbs, purpose, steps, important constraints,
   recovery guidance, and related topics.

The article view is selected by the query string and remains responsive at
desktop, constrained laptop, tablet, and phone widths. The index does not
render all article bodies at once and does not become a permanent instructional
panel on operational pages.

## Authority and scope boundaries

This is UI/application and static documentation work only. It must not change
company isolation, RLS/RBAC, permissions, financial/source ownership,
settlement, inventory movement, payroll calculation/approval/history,
immutable document/version history, provider truth, audit history, stale-write
guards, or review-before-Apply/prepare-review-confirm-execute boundaries.

No migration, database table, RPC, CMS, provider, AI-generated runtime help,
new customer-facing domain, UX-S3C copy cleanup, or UX-S3D workflow redesign is
part of this design.

## Validation contract

Focused tests cover canonical topic uniqueness/search/coverage, valid article
references, Assistant compatibility, stable Help paths, route parsing and
unknown-topic fallback, PageHeader Help resolution, and contextual-help
accessibility behavior. Final validation follows the project ladder:
focused tests, deterministic affected tests, lint/typecheck, production build,
Workflow Map consistency when routing contracts change, and targeted browser
inspection of Help desktop/laptop/tablet/phone, deep links, header Help actions,
and popover keyboard/touch behavior.

Evidence is local/demo and exact-head CI/browser evidence only; no hosted,
provider, database, or production certification is implied.
