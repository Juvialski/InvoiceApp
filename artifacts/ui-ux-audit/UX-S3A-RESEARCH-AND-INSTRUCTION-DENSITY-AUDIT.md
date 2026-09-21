# UX-S3A — Comparative UI Research + Instruction-Density / Workflow-Clarity Audit

Status: RESEARCH COMPLETE — S3B BOUNDARY READY
Reviewed source SHA: 567013c8f0b851468cc8d0c4bbe1eb11d3fdf6cf
Branch: codex/ux-s3a-comparative-audit
Reviewed: 2026-09-21
Repository: Juvialski/InvoiceApp

This is a research/evidence deliverable. It does not implement the Help Center, contextual-help components, visible-copy simplification, or workflow changes.

## Evidence boundary

| Evidence | Qualification |
| --- | --- |
| Current repository | Exact synchronized source SHA above; no application, test, migration, package, or runtime files were changed for this report. |
| HydroQualiSense live inspection | Local Vite/Express safe demo at http://127.0.0.1:3000, synthetic repository fixtures only, browser-only demo mode, no authenticated company data, provider calls, database writes, or production operations. |
| Live viewport | CUA browser screenshots and accessibility trees were inspected at approximately 1280x720 on 2026-09-21. Screenshots were transient session evidence and were not promoted as durable image artifacts. |
| Existing visual baseline | artifacts/ui-ux-audit/UX-W4.5A-REPORT.md and promoted ux-w4-5a / ux-w4-5e evidence were used as prior visual context. Those captures identify their own earlier source SHAs and are not silently presented as exact-current-SHA certification. |
| Browser research | Public, read-only help/documentation surfaces for Procore, Autodesk Construction Cloud/Autodesk Build, Buildertrend, Fieldwire, and Raken. No account login, form submission, external mutation, download, or proprietary asset capture was performed. |
| Jev | Existing repository TypeSafe client only; sanitized structured metadata, no cookies, credentials, customer records, raw browser state, or secrets. Jev was advisory and Codex independently verified the inspected pages and made the final classifications. |

### Evidence references

The L-* references below mean a transient live CUA inspection at the exact
current SHA and viewport above; they are not retained screenshots. P-* means
the durable prior visual evidence named in the qualification table.

| Ref | Route/state or source | Evidence |
| --- | --- | --- |
| L-01 | Dashboard | /demo/app/dashboard; title, view controls, metric cards, cash position, attention region inspected. |
| L-02 | Projects portfolio | /demo/app/projects; title, toolbar, card-first register, secondary Portfolio snapshot and Excel disclosure inspected. |
| L-03 | Project workspace overview | /demo/app/projects/demo-project-warehouse; project identity, tabs, attention summary, financial-control and engineering context inspected. |
| L-04 | Project Budget Control / Cost Codes | /demo/app/projects/demo-project-warehouse/budget; six summary metrics, worksheet introduction, protected columns, aggregate-only explanation inspected. |
| L-05 | Procurement register | /demo/app/procurement; New Purchase Order, workbook card, tabs, metric cards, filters, register order inspected. |
| L-06 | Supplier Invoice register | /demo/app/invoices; source-document purpose, filters, register and settlement overview inspected. |
| L-07 | Supplier Invoice extraction/review | /demo/app/review?invoiceId=demo-invoice-07; source-first viewer, review status, extracted worksheets, allocation, matching and intake guidance inspected. |
| L-08 | Client Billing draft | /demo/app/projects/demo-project-drainage/billing?billingId=demo-client-billing-drainage-02; receivables boundary, tax treatment, metrics, draft actions and history inspected. |
| L-09 | Expenses / Supplier Payables | /demo/app/expenses; register, linked source follow-up, workbook disclosure and correction wording inspected. |
| L-10 | Cash & Banking landing | /demo/app/cash; financial safety subtitle, currency controls, accounts, ledger and reconciliation regions inspected. |
| L-11 | Cash settlement/reconciliation | /demo/app/cash?transactionId=demo-transaction-split-01; settlement allocation and explicit confirmation language inspected as part of L-10’s full accessibility state. |
| L-12 | Warehouse | /demo/app/warehouse; movement-derived inventory purpose, metrics, search/register and movement disclosure inspected. |
| L-13 | Equipment | /demo/app/equipment; canonical asset purpose, metrics, register, assignment/field-evidence disclosure inspected. |
| L-14 | Vendors | /demo/app/vendors; canonical vendor purpose, extracted-evidence sentence, register and actions inspected. |
| L-15 | Documents library | /demo/app/documents; Library/Create/Templates tabs, filters, ownership language and document cards inspected. |
| L-16 | Managed document detail | /demo/app/documents?managedId=demo-managed-warranty-001; immutable version-history explanation and disabled safe-demo actions inspected. |
| L-17 | Email / SMS | /demo/app/email-sms; Compose state, repeated draft instruction, Brevo connection problem, attachment eligibility and human review actions inspected. |
| L-18 | Payroll | /demo/app/payroll; normal-cycle checklist, period controls, automation explanation and protected-history language inspected after lazy load. |
| L-19 | Settings / roadmap | /demo/app/settings; operational settings, regional limitations, features/roadmap copy and disclosure pattern inspected. |
| P-01 | App-wide visual baseline | artifacts/ui-ux-audit/UX-W4.5A-REPORT.md: prior 89-scenario, 34-route, desktop/laptop/tablet/phone visual investigation with route dispositions. |
| P-02 | Promoted visual closeout | artifacts/ui-ux-audit/screenshots/ux-w4-5e/README.md: prior exact-qualified visual evidence and limitations for Projects, Reports, Email, previews, RFI and Submittal recovery. |
| P-03 | Client Security visual evidence | artifacts/client-security/screenshots/README.md and manifest: prior permission/navigation evidence; not a substitute for a populated current roles editor inspection. |

## 1. Executive summary

The dominant S3A problem is not that HydroQualiSense lacks labels. It is that
the application often teaches the domain through visible prose at the same
time that it presents the working surface. The most important patterns are:

1. Shared PageHeader and SectionHeader descriptions make explanatory copy easy
   to add and hard to distinguish from task-critical state. The same visual
   treatment is used for page purpose, financial boundary, provenance,
   onboarding, and exceptional warnings.
2. Optional summaries, workbook utilities, metric cards, and secondary source
   panels still compete with the working register or decision surface. Projects
   is materially better after the card-first correction, but Procurement,
   Budget Control, Cash & Banking, Supplier Invoice review, and Documents still
   expose long mixed-purpose canvases.
3. Safety semantics are usually correct but are often expressed as paragraphs
   in normal states. The system should keep the consequence visible when it is
   needed, but move reusable explanation to a predictable contextual Help or
   Help Center article.
4. Major pages do not yet share one route-aware Help action. Existing
   src/assistant/helpCatalog.ts is a useful route-linked topic/search seed, but
   it is currently an Assistant catalog rather than a user-facing Help Center
   and contextual-help registry.
5. The highest workflow-risk surfaces are Supplier Invoice review, Cash
   settlement/reconciliation, Procurement workbook/draft flows, Payroll’s
   normal cycle, and Client Billing collection/issue transitions. S3A does not
   redesign them; it records them for S3D.

No P0 visual usability blocker was established in this investigation. The
highest-priority evidence-backed findings are P1: long mixed-purpose decision
surfaces, secondary content preceding working content on selected routes,
missing consistent contextual Help for safety-heavy workflows, and the
remaining desktop-first density of some worksheet/tab flows at constrained
sizes. These are bounded correction candidates, not permission to weaken
financial, lifecycle, provenance, history, concurrency, or review-before-apply
rules.

## 2. Comparative research

The research deliberately inspected public support/documentation surfaces
rather than relying on marketing screenshots. Public authenticated operational
UIs were not available without logging in, so product-UI conclusions below are
limited to what was directly observable or explicitly marked as an inference.

### Procore

Sources: [Procore Support](https://v2.support.procore.com/), [Product Manuals](https://v2.support.procore.com/product-manuals/), and [Process Guides](https://v2.support.procore.com/process-guides/).

- Direct observation: the Support home puts documentation search in the first
  useful region and separates Product Manuals, Process Guides, Video Library,
  Courses, Release Notes, and User Community. Product Manuals adds breadcrumbs,
  a short title/subtitle, filters by company/project level and web/Android/iOS/
  integration, and a two-column manual index. Process Guides is a separate
  workflow-oriented destination.
- Transferable pattern: separate reference material from process guidance;
  offer search and filters before long reading; let a user choose a product,
  role, or workflow path instead of rendering all education inside an
  operational page.
- HydroQualiSense applicability: a Help Center should have both topic/reference
  and workflow/recovery paths. A consistent page Help action can deep-link to
  the relevant process topic while keeping the working page compact.
- Limitation: no authenticated Procore register, editor, mobile workflow, or
  actual browse/edit state was inspected. The product-UI comparison is not a
  claim about hidden Procore screens.

### Autodesk Construction Cloud / Autodesk Build

Sources: [Autodesk Data Management Help](https://help.autodesk.com/view/DOCS/ENU/) and [Autodesk Build Help](https://help.autodesk.com/view/BUILD/ENU/).

- Direct observation: the Data Management Help home has a compact product
  identity bar, keyword search, a Basics column with direct task links such as
  managing files, sending files for review, creating transmittals, and learning
  administration, plus a Useful Resources column. The direct Build-help page
  rendered blank in the inspected browser, so no Build surface was inferred
  from it.
- Transferable pattern: orient the user by a small set of task verbs and
  resources rather than a large introductory panel. Search and topic grouping
  are the primary entry points.
- HydroQualiSense applicability: Help Center landing content should start with
  task verbs—review an invoice, reconcile cash, issue a client invoice, manage
  a document—then provide concept and administration material below.
- Limitation: Build’s direct public page was not usable in this environment;
  the evidence is help-center navigation, not live ACC UI behavior.

### Buildertrend

Source: [Buildertrend Help Articles](https://buildertrend.com/help-articles/).

- Direct observation: the page opens with a concise Help Articles title and
  category cards with article counts. Visible categories include Financial
  Management, Mobile, Project Management, Reporting, Client Help Center,
  Setup Customization, Payment Processing, Takeoff, and integrations. Support,
  Learning Academy, and product updates remain separate resources.
- Transferable pattern: category cards provide a scannable map without a long
  explanation; article counts and category names help users predict where a
  topic lives.
- HydroQualiSense applicability: the initial Help Center can use a small,
  stable category taxonomy and counts or topic labels, with a separate
  Getting Started and Troubleshooting path.
- Limitation: no authenticated Buildertrend workspace or actual editor state
  was inspected. Mobile usefulness is inferred only from the public page
  structure, not from a live product workflow.

### Fieldwire

Sources: [Fieldwire Knowledge Base](https://help.fieldwire.com/hc/en-us), [Getting Started category](https://help.fieldwire.com/hc/en-us/categories/12291567843355-Getting-Started), and [Getting started with Fieldwire](https://help.fieldwire.com/hc/en-us/articles/360016524971-Getting-started-with-Fieldwire).

- Direct observation: the Knowledge Base first viewport leads with a large
  search field and Common topics. Topics cover account/projects, plans, tasks,
  reports, photos, forms, files, RFIs, submittals, change orders, budget,
  integrations, and tutorial playlists. The Getting Started article uses
  breadcrumbs, a compact On this page table of contents, short sections such
  as first login, creating a project, project dashboard, user management,
  navigating plans, and tasks, followed by related articles and a support path.
- Transferable pattern: onboarding is a structured article and topic map, not
  a permanent banner in every working page. A table of contents is useful when
  a concept has several steps, while each step stays separately linkable.
- HydroQualiSense applicability: Help Center articles should use short task
  sections and route/state deep links; current workflow pages should not repeat
  the whole onboarding article.
- Limitation: no authenticated Fieldwire project dashboard, plan viewer, task
  editor, or mobile app was inspected.

### Raken

Sources: [Raken Help Center](https://help.rakenapp.com/) and [Using Your Dashboard](https://help.rakenapp.com/en/collections/19725847-using-your-dashboard).

- Direct observation: the Help Center first viewport uses a prominent article
  search, a short Getting Started section, and a Learning Center with compact
  collections for Dashboard, Activity Feed, Insights, Daily Reports, Photos,
  Directory, Projects, Time Tracking, Scheduling & Certs, RFIs & Submittals,
  Production, Safety & Quality, Forms & Documents, Tasks & Messaging,
  Integrations, and Account & Navigation. The Dashboard collection uses
  breadcrumb navigation and article cards grouped by Dashboard Overview,
  Activity Feed, Dashboard Insights, and Live Views.
- Transferable pattern: group help by the user’s work vocabulary and keep
  articles searchable; separate “getting started” from ongoing operational
  reference.
- HydroQualiSense applicability: the proposed Help Center taxonomy should map
  to modules and workflows, not to internal component names. Troubleshooting
  and provider/recovery topics deserve first-class categories.
- Limitation: no authenticated Raken dashboard, daily-report editor, or mobile
  workflow was inspected.

## 3. Cross-product principles

The repeated patterns are more useful than any one product’s visual treatment:

1. Search and task categories are the first Help Center interaction. The public
   surfaces consistently expose search, categories, or process guides before
   detailed education.
2. Reference and procedure are different content types. Manuals, topic
   articles, process guides, getting-started content, troubleshooting, release
   notes, and community/resources have different navigation jobs.
3. Onboarding is structured and bounded. Fieldwire’s article table of contents
   and Raken’s Getting Started collection make learning discoverable without
   permanently occupying the operational canvas.
4. Workflow nouns beat internal architecture. Project, dashboard, daily report,
   RFIs, submittals, budget, documents, tasks, and messaging are more
   discoverable than names of shared React primitives or backend boundaries.
5. Responsive usefulness must be independently proven. The help surfaces are
   generally compact and search-first, but this public research did not prove
   how each product handles a live mobile worksheet. HydroQualiSense must retain
   its own phone/tablet evidence and cannot infer product parity from
   help-center layout.
6. For HydroQualiSense, task-critical safety copy remains visible. The
   comparative pattern supports moving education, examples, and rare edge cases
   out of the working canvas; it does not support hiding stale/conflict,
   financial, permission, provenance, lifecycle, provider, or confirmation
   requirements behind hover.

Jev’s advisory comparator judgment agreed with the direct evidence: high
information-architecture/help-transfer signals for Procore, Fieldwire, and
Raken; useful but more limited transfer signals for Autodesk and Buildertrend
because their inspected public surfaces did not demonstrate live product UI or
responsive app behavior. Codex retained all five mandatory comparators and did
not let Jev invent unobserved product behavior.
## 4. HydroQualiSense route/state audit matrix

Classification is applied to the visible explanatory material, not to business
data or state labels. “Keep” means keep the safety/state signal, usually after
shortening it. A detailed recommendation never authorizes removing the
underlying permission, lifecycle, provenance, financial, history, or
concurrency boundary.

| Route/state | First useful viewport and visible guidance | Classification | Workflow friction / proposed direction | Severity |
| --- | --- | --- | --- | --- |
| Dashboard | The title, scope controls, and primary metrics are visible before deeper analytics. Guidance explains Q3 scope, currency selection, cross-domain cost meaning, cash sources, and attention actions. | Keep current exception/scope; Shorten purpose and repeated definitions; Contextual Help for cost definitions; Help Center for cross-domain reporting concepts. | Four scope controls and several metric/detail explanations compete with the next action. Keep attention actions first; move definitions behind metric/section help. | P2 |
| Projects portfolio | The card-first correction is visible: title/New project, search/status/sort/more-filters, Cards/Compact List, then project cards. Portfolio snapshot and Excel tools are secondary. | Shorten “scan project health…” subtitle; Contextual Help for More filters and sort; Help Center for portfolio analysis and workbook Apply. Remove copy that explains an already-clickable card. | First card row begins near the lower part of the 720px viewport; keep the current hierarchy and avoid adding more pre-card panels. | P2 |
| Project workspace overview | Project identity and tabs are visible before Management Attention and Financial Control. The page repeats “one project context,” control definitions, and engineering ownership prose. | Keep current attention/financial exception; Shorten project-purpose text; Contextual Help for cost/control/source rules; Help Center for cross-domain project navigation. | Many horizontal tabs and several expandable areas create scan and constrained-width friction. Preserve explicit tabs but standardize grouping and Help placement. | P2; deeper responsive review |
| Project Details worksheet | The modal uses an explicit worksheet and Save path. Its visible text explains structured editing and parent-owned authority. | Keep validation/error; Shorten the worksheet-purpose sentence; Contextual Help for parent authority/protected fields; Help Center for editing conventions. | The edit mode is safer than a stacked form but still needs one consistent explanation across all worksheet modals. | P2 |
| Cost Codes / Budget Control worksheet | Six budget metrics appear before the cost-code worksheet. The page explains editable fields, protected actuals/commitments/lifecycle, and payroll aggregate-only treatment. | Keep protected/aggregate-only safety; Shorten worksheet introduction; Contextual Help at protected columns; Help Center for cost-code and aggregate semantics. | The actual working worksheet is below a large metric region; use progressive disclosure for secondary metrics without hiding current financial exceptions. | P1/P2 |
| Procurement register and RFQ/PO drafts | The page title and New Purchase Order are visible, but the Excel-native workbook explanation card and metric cards precede the register. | Keep “review proposal / explicit Apply” safety; Shorten workbook explanation; Contextual Help on Import/Apply; Help Center for workbook review and RFQ/PO lifecycle. | Workbook tools are visually prominent before the register. Move the utility disclosure after the primary register or behind a secondary action; retain review-before-Apply. | P1 |
| Supplier Invoice register | Search/filter/register content is primary. The subtitle explains that preserved supplier documents must not create a second cost record; settlement overview appears later. | Keep a concise source-versus-payable rule; Contextual Help for correction/settlement; Help Center for supplier evidence and linked Expense authority. | The safety rule is important but long; use a short visible caption with a detail link rather than removing it. | P2 |
| Supplier Invoice source-first review | Source viewer/status is first, followed by extracted worksheets, allocation, PO matching, purchased-material intake, notes, and navigation. The page contains many legitimate but competing explanations. | Keep blocking review, unresolved, provider/source state, human confirmation, and mismatch warnings; Contextual Help for ordinary provenance/protected fields; Help Center for full review/matching/intake procedure; Remove duplicate normal-state legends. | Highest instruction burden. Separate “review extracted data,” “resolve identity/allocation,” and “match/receive” as explicit task stages without changing authority. | P1 |
| Client Billing draft/collections | Receivables boundary, issued-only rule, tax treatment, financial metrics, draft lifecycle, collection history, and cash-separation copy are visible. | Keep issued/collection/tax safety; Shorten repeated boundary prose; Contextual Help for tax and collection terms; Help Center for billing/collection lifecycle. | Draft editing, issue, preview, collection, and cash continuation must remain separate; current route is a deeper workflow-hardening candidate. | P2; deeper workflow review |
| Expenses / Supplier Payables | Register appears before source-document follow-up, summary metrics, and workbook disclosure. Intro explains linked documents and archive-versus-void consequences. | Keep archive/void financial consequence; Shorten register purpose; Contextual Help for source link/settlement; Help Center for corrections and linked supplier documents. | The primary register hierarchy is good, but the page remains long and has several secondary work regions. Keep follow-up after the register. | P2 |
| Cash & Banking landing | Title, currency control, accounts, then ledger appear before correction, reconciliation, settlement, and summary regions. Copy explains no live bank connection and no implicit FX. | Keep no-live-connection/no-implicit-FX and current mismatch states; Shorten account freshness prose; Contextual Help for source/status; Help Center for reconciliation/settlement. | One route combines browse, import-ledger correction, reconciliation, and settlement allocation. The landing view needs stronger stage separation and a deliberate next action. | P1 |
| Cash settlement/reconciliation | Settlement language correctly says confirmation links evidence only and nothing is auto-confirmed; candidate matching and confirmation appear deep in the route. | Keep all confirmation and non-double-counting text; Contextual Help for confidence/match rationale; Help Center for settlement and transfer procedure. | Explicit confirmation must remain, but candidate search, allocation review, and confirmation should be visually staged rather than presented as one long canvas. | P1; deeper workflow review |
| Warehouse Inventory | Title and movement-derived stock statement precede Add item, Opening stock, metrics, search, and register. | Keep movement-derived/no-valuation boundary; Shorten the subtitle; Contextual Help for movement totals and custody; Help Center for receive/issue/return. | Current browse-first surface is comparatively clear. Keep movement history available as disclosure. | P2 |
| Equipment Registry | Title and canonical asset/assignment-history statement precede metrics, search, and register. | Keep asset-history distinction; Shorten subtitle; Contextual Help for assignment versus field evidence; Help Center for lifecycle/transfer/return. | Current register is compact; standardize the same authority-help pattern used by Warehouse. | P2 |
| Vendors | Title and canonical identity/evidence sentence precede search and table. | Keep identity-resolution safety in a short sentence; Contextual Help for extracted-versus-canonical identity; Help Center for vendor resolution/maintenance. | The visible boundary is useful and not obviously duplicated; do not remove it merely to reduce words. | P2 |
| Documents Library | Title/actions, Library/Create/Templates tabs, search/type filter, More filters, then records. Tab descriptions explain each workspace. | Shorten page and tab descriptions; Contextual Help for ownership/origin filters; Help Center for document ownership, previews, templates, and Email/SMS handoff. | The Library is an index/continuation surface; keep owning-record actions obvious and do not create a second canonical register. | P2 |
| Managed document detail/create/templates | Detail keeps immutable version-history language and version metadata visible; Create/Templates contain workflow and administration explanations. | Keep immutable version/history and permission errors; Contextual Help for versioning/template bindings; Help Center for managed upload, template, and artifact procedures. | Detail is appropriately explicit; create/template administration needs progressive disclosure so the working form is not a documentation panel. | P2 |
| Email / SMS compose, provider, sent/status | Compose repeats the same draft/review sentence at page and panel level. Brevo connection problem is visible; attachment eligibility is repeated in the control and helper text. | Keep current provider/permission/eligibility exception; Remove duplicate draft sentence; Contextual Help for attachment eligibility and accepted-versus-delivered status; Help Center for compose/history/provider recovery. | Keep human Preview/Review then Confirm & Send. Standardize provider-state wording and avoid repeating eligibility copy. | P2; P1 when provider/action is blocked |
| Payroll overview/run | A full normal-cycle explanation and checklist coexist with period controls, workflow navigation, automation mode, imports, exceptions, calculate, approval, and payment. | Keep locked/history/approval/payment safety; Shorten the visible checklist to the next incomplete step; Help Center for full payroll cycle/import concepts; Contextual Help for automation mode. | “What needs doing” is useful, but the route is a mixed dashboard and process manual. Make the current next step dominant and move the full cycle to Help. | P1 |
| Settings / Features & Roadmap | Operational settings includes single-tenant/role explanation, regional demo limitations, a large feature roadmap, status definitions, and repeated “What this includes” disclosures. | Keep current permission or unavailable-state messages; Shorten page/section descriptions; Help Center for settings, roadmap terminology, and roles; Contextual Help for regional settings. | Settings is a reference surface, but its long descriptions make it feel like an instructional wall. Keep capability truth while moving detail behind disclosures. | P2 |
| Roles / permissions | The current safe-demo route does not expose a separately populated role editor in this pass; prior client-security evidence covers navigation/permission states. | Keep permission denial and access-impact states visible; Help Center for role/permission concepts; Contextual Help for individual permission groups. | Deeper workflow review is required before prescribing copy changes because current exact-state evidence is incomplete. Never simplify away company isolation or permission boundaries. | P1 uncertainty; deeper workflow review |
| Engineering documents, RFIs, Submittals, Site Logs | Prior visual evidence covered registers and recovery states; populated RFI/Submittal detail evidence was explicitly limited. Site records contain useful authority/history distinctions. | Keep current error/recovery and lifecycle states; Shorten routine domain descriptions; Help Center for document revision/RFI/Submittal/Site Log procedures; Contextual Help for source/history terms. | Do not infer populated-detail usability from missing-record captures. Repair evidence coverage before broad copy changes. | P2; deeper workflow review |
| Reports, Assistant, Demo Tour | Reports and Assistant are mostly read/reference surfaces; the safe demo exposes a persistent Demo Tour control for the synthetic experience. | Keep current errors and access limits; Move onboarding/tour education to Help; Remove obvious tour text from normal production working pages if it exists outside demo mode. | These surfaces should not become a second Help Center or a permanent tutorial layer. | P2 |

### Live quantitative baseline

The following are approximate measurements from the current safe-demo
accessibility trees and screenshots. Counts exclude the shared shell’s global
navigation, demo-mode disclaimers, record values, and table data. They are
triage signals, not a target to minimize words blindly.

| Route/state | Approx. visible explanatory blocks in route body | Approx. explanatory words in the full route body | First useful content band at 1280x720 |
| --- | ---: | ---: | --- |
| Dashboard | 7 | 80 | Metrics begin around y=525; attention and ledger work are below. |
| Projects | 4 | 35 | First card row begins around y=530. |
| Project overview | 8 | 95 | Project context/attention begins around y=405; financial controls continue below. |
| Cost Codes/Budget | 8 | 110 | Six metric cards consume the first work region; worksheet begins below the first viewport. |
| Procurement | 6 | 75 | Workbook card and metric cards appear before the register. |
| Supplier Invoices | 5 | 55 | Register/filter region begins around y=390; table header is near y=635. |
| Supplier Invoice review | 14+ | 180+ | Source viewer begins after status around y=590; extracted/decision sections are much lower. |
| Client Billing | 8 | 105 | Receivable metrics begin around y=540; register/draft controls continue below. |
| Expenses | 7 | 90 | Register/filter begins around y=350; rows begin around y=490. |
| Cash & Banking | 11+ | 150+ | Accounts begin around y=520; ledger/reconciliation/settlement are below. |
| Warehouse | 3 | 28 | Register begins around y=580. |
| Equipment | 3 | 28 | Register begins around y=560. |
| Vendors | 3 | 30 | Search/table begins around y=410. |
| Documents | 6 | 70 | Filters begin around y=345; first document card begins around y=630. |
| Managed document detail | 4 | 45 | Version-history region begins around y=635. |
| Email / SMS compose | 7 | 90 | Provider state and compose form begin below y=400; fields continue below y=650. |
| Payroll | 10+ | 150+ | Period controls and metrics occupy the first work region; cycle/actions continue below. |
| Settings | 10+ | 170+ | Operational settings begins around y=460; roadmap detail is substantially below. |
## 5. Shared root causes

| ID | Shared root cause | Direct evidence | Jev advisory signal | Codex disposition |
| --- | --- | --- | --- | --- |
| RR-1 | Shared page/section descriptions are too easy to accumulate | OperationsUI.PageHeader and SectionHeader render optional descriptions; many routes supply them. | App-wide frequency 1.95/2, leverage 1.87/2, low direct confusion 0.22/2. | Shared S3C primitive/copy audit; not a mass deletion. |
| RR-2 | Optional tools, summaries, or analytics precede working content | Procurement, Budget Control, Cash, Documents, and related surfaces show secondary regions around the task. | Confusion 0.98/2, workflow 0.99/2, frequency 1.22/2, leverage 1.77/2. | P1/P2 hierarchy group; preserve workbook and financial semantics. |
| RR-3 | Safety semantics are expressed as normal-state paragraphs | Cash, Supplier Invoice, Client Billing, Warehouse, Equipment, Vendors, Payroll, and Email/SMS all show valid boundary explanations. | Confusion 1.09/2, frequency 1.67/2, leverage 1.76/2, regression risk 1.92/2. | Keep safety signals; shorten and move reusable explanation to contextual Help/Help Center. |
| RR-4 | No consistent route-aware Help action | Current shell has Tour/Documents/AI Assistant but no shared page Help; existing HELP_CATALOG is Assistant-oriented. | Confusion 1.62/2, frequency 1.78/2, leverage 1.33/2. | First S3B foundation target. |
| RR-5 | Browse, review, correction, matching, settlement, and teaching are combined in long surfaces | Supplier Invoice review, Cash settlement, Payroll, and Client Billing show the most mixed stages. | Confusion 1.83/2, workflow 1.69/2, risk 1.90/2. | Highest S3D workflow-hardening candidate; S3A does not redesign it. |
| RR-6 | Desktop-first worksheet/tab density remains a recurring responsive concern | Current project tabs/worksheets are wide; prior exact-qualified visual evidence records phone/tablet fallbacks and remaining review limits. | Confusion 1.31/2, frequency 1.44/2, risk 1.83/2. | Group responsive/action grammar with S3E and worksheet-specific follow-up. |
| RR-7 | Actions and instructions repeat across adjacent surfaces | Email compose repeats draft instruction; Documents/Supplier Invoice expose several continuation paths. | Confusion 1.33/2, leverage 1.75/2, accessibility 1.09/2. | Standardize action grouping and remove only obvious duplicate copy. |
| RR-8 | Some populated detail states are not evidenced by the safe-demo fixture | Prior visual triage explicitly limited populated RFI/Submittal detail and some preview/stale states. | Confidence 0.34/2; frequency 0.90/2. | Deeper workflow review; do not prescribe a broad visual fix from missing-state evidence. |

Jev’s signals were used to rank attention, not to determine severity or
architecture. In particular, the lower confusion signal for RR-1 does not make
the shared description root cause irrelevant: its high frequency/leverage makes
it a good bounded S3C correction after the S3B foundation.

## 6. Proposed Help Center taxonomy

The first Help Center should be a small static, repository-backed surface. It
should not introduce a CMS, new database authority, or a new product domain.

1. Getting Started and workspace navigation
2. Projects and project cost control
3. Supplier Invoices and Expenses
4. Procurement, RFQ, Purchase Orders, and receiving
5. Client Billing, Collections, and Cash & Banking
6. Warehouse Inventory and Equipment
7. Vendors and identity resolution
8. Documents, templates, previews, and version history
9. Email / SMS, delivery history, and provider status
10. Payroll, workforce inputs, and payroll runs
11. Settings, company access, roles, and permissions
12. Troubleshooting: validation, stale/conflict, provider, and recovery states
13. Keyboard, worksheet, import/export, and responsive-use tips

Each category should initially contain only high-value topics. The category
landing page should expose search, route-aware deep links, and a short “start
here” path; it should not reproduce every page description.

## 7. Contextual-help architecture recommendation

HydroQualiSense already has a useful foundation in
src/assistant/helpCatalog.ts: stable topic IDs, summaries, details, route IDs,
keywords, search, and route resolution. S3B should reuse the validated topic
identifiers where possible but separate user-facing Help content from Assistant
response formatting.

Recommended bounded design:

- Create a route/topic registry keyed by RouteId plus optional context such as
  section, field, column, action, or state. Each entry should contain a stable
  topic ID, short label, one-sentence contextual summary, Help Center article
  path, and the conditions under which it is shown.
- Add an optional route-aware Help action to the existing page-header/action
  grammar. It should deep-link to the appropriate article or open a compact
  Help panel; it must not change route permissions or domain ownership.
- Add one accessible contextual-help primitive for short secondary explanations.
  It must expose an accessible name, open on click/tap, be reachable by keyboard
  focus, close predictably, and never be the only location for a task-critical
  requirement. Hover may be an enhancement only.
- Keep exceptional state inline: validation, stale/conflict, unresolved,
  provider failure, permission denial, and irreversible financial/lifecycle
  consequences remain visible at the moment of decision.
- Keep detailed articles static at first. Add a route/topic coverage test and a
  duplicate-topic/content consistency check; do not add a CMS or runtime
  authoring system.
- Make the registry usable by both the Help Center and Assistant references so
  the product does not maintain contradictory explanations in two scattered
  catalogs.

## 8. UX-S3B implementation boundary

The next implementation phase should build only the Help Center/contextual-help
foundation.

### In scope

- A dedicated Help Center route/surface with search or a clearly categorized
  topic index.
- A small static topic/article registry, seeded from existing HELP_CATALOG
  entries and the taxonomy above.
- Predictable page-level Help action on the major working-page header grammar.
- One accessible contextual-help/popover primitive with keyboard focus and
  click/tap behavior.
- Route/topic deep links and a small route-coverage test surface.
- Initial topics for invoice review, projects/costing, procurement workbook
  review, Expenses, Cash & Banking/settlements, Documents/version history,
  Email/SMS/provider status, Payroll readiness/runs, and company access.

### Explicitly out of scope for S3B

- Removing or rewriting all visible page copy.
- Changing financial, lifecycle, settlement, provenance, permission, or
  concurrency semantics.
- Workflow redesign or modal-depth changes.
- New product domains, workforce expansion, Finance UX-W6, custom fields,
  broader Documents aggregation, provider certification, or production work.
- A CMS, database-backed Help authoring system, or automated copy generation.

S3B should prove the help foundation with focused accessibility/keyboard/touch
tests and route/topic coverage. It should not claim that S3C simplification or
S3D workflow hardening is complete.

## 9. UX-S3C candidate page groups

Group corrections by shared root cause rather than one page at a time:

1. Shared page-header/section-description grammar: Dashboard, Projects, Project
   Workspace, Warehouse, Equipment, Vendors, Documents, Reports, and Settings.
2. Financial/source authority copy: Cost Codes/Budget Control, Supplier
   Invoices, Supplier Invoice review, Expenses, Client Billing, and Cash &
   Banking. Keep exception/safety states visible; shorten normal-state prose.
3. Worksheet/register action grammar: Project Details, Cost Codes, RFQ/PO,
   Client Billing draft, Expense draft, and Supplier Invoice extracted data.
4. Communication/document handoff: Email/SMS, Documents Library/detail,
   previews, delivery history, and owning-record continuation.
5. Payroll and administrative reference: Payroll overview/run, Settings,
   company access, roles, and permissions.
6. Evidence-limited detail states: RFI/Submittal populated detail, document
   previews, and stale/conflict recovery only after deterministic fixtures and
   state evidence are available.

## 10. UX-S3D workflow-hardening backlog

This is a prioritized evidence backlog, not an implementation started in S3A.

1. Supplier Invoice review — P1. Stage source reading, extracted-field
   correction, identity/allocation, matching, and purchased-material meaning so
   the user always sees one next decision. Preserve source authority, human
   confirmation, and the distinction between supplier evidence and linked
   Expense payable/cost.
2. Cash settlement/reconciliation — P1. Separate account/ledger browse,
   reconciliation candidates, settlement allocation, and final confirmation.
   Preserve explicit confirmation, return-to-source context, transfer pairing,
   and no-double-counting rules.
3. Procurement workbook and draft lifecycle — P1/P2. Put the PO/RFQ
   register/draft task before optional workbook utility explanation, then make
   Review, Apply, Save, Approve, Issue, Receive, and Close terminology and
   placement consistent without collapsing lifecycle actions.
4. Payroll normal cycle — P1/P2. Keep the concise next-step checklist but move
   full procedural education to Help; improve the handoff between import,
   exceptions, calculate, approve, and Cash & Banking payment.
5. Client Billing draft and collections — P2. Preserve issued-only and
   receivables/cash separation while clarifying draft, submit, issue, collection,
   preview, and return paths.
6. Project tabs and worksheet state — P2. Recheck constrained-width tab
   discovery, default focus, Save/Cancel behavior, dirty state, and return paths
   across the existing worksheet consumers.
7. Email/SMS and Documents continuation — P2. Keep reviewed compose and
   immutable history, but make owning-record, attachment eligibility, provider
   status, accepted-versus-delivered, and return-to-source actions predictable.
8. Stale/conflict/network recovery — P2/deeper review. Verify that failures
   preserve entered work, expose the next safe action, and do not imply a
  completed mutation when the server did not confirm it.

## 11. Jev efficiency ledger

Jev used the existing repository TypeSafe client with sanitized observation
metadata. It did not control the browser, receive cookies/authentication state,
or receive customer/private data. Codex independently observed every page/source
represented in the requests.

| Request class | Requests | Candidates / questions | Input / output tokens | Latency | Model | Fallback | Material effect |
| --- | ---: | ---: | ---: | ---: | --- | --- | --- |
| Start context checkpoint | 0 dispatched | 0 candidates | 0 / 0 | 0 ms | — | no-candidates preflight fallback | Deterministic context remained authoritative; no source was removed. |
| Comparator pattern judgment | 1 | 5 / 30 | 3,226 / 559 | 823 ms | jev-1.13.0 | false | Reduced repeated cross-product synthesis and highlighted transferability/limitations. |
| Route copy classification A | 1 | 10 / 50 | 4,716 / 944 | 1,015 ms | jev-1.13.0 | false | Provided independent criticality/duplication/obviousness/context/article signals for Dashboard through Cash. |
| Route copy classification B | 1 | 10 / 50 | 4,678 / 944 | 1,005 ms | jev-1.13.0 | false | Provided the same decomposed signals for settlement through Settings/roles. |
| Root-cause prioritization | 1 | 8 / 56 | 3,554 / 940 | 798 ms | jev-1.13.0 | false | Ranked workflow depth, missing Help, shared descriptions, responsive density, and repeated actions for bounded follow-up. |
| Completion/evidence checkpoint | 1 | 2 / 2 | 523 / 38 | 907 ms | jev-1.13.0 | false | Confirmed documentation and browser evidence categories were present; advisory only, no merge decision. |
| Oversized route attempt A | 0 dispatched | 10 / 70 | — / — | 1 ms | — | preflight-rejected (28,497 chars) | Corrected payload sizing; no judgment was used. |
| Oversized route attempt B | 0 dispatched | 10 / 70 | — / — | 0 ms | — | preflight-rejected (28,462 chars) | Corrected payload sizing; no judgment was used. |

Successful Jev requests: 5. Successful request totals: 16,697 input
tokens / 3,425 output tokens / 4,548 ms. Jev’s answers were advisory signals;
Codex overrode any signal when it conflicted with direct evidence, safety rules,
or a missing-state limitation.

## 12. Evidence and limitations

- The five mandatory competitors were all inspected through actual public
  support/help/documentation pages. No competitor authenticated product UI was
  available without login, so no claim here relies on an uninspected app screen.
- Autodesk Build’s direct help page rendered blank in the current browser. The
  report uses the observed Autodesk Data Management Help page and records this
  limitation rather than substituting a search snippet for direct evidence.
- HydroQualiSense current live inspection is local safe-demo evidence only. It
  is not authenticated QA, hosted/provider certification, or production proof.
- Current live visual inspection used one desktop viewport (1280x720). The
  prior UX-W4.5A/E reports supply broader desktop/laptop/tablet/phone visual
  context at their explicitly recorded earlier SHAs. This S3A report does not
  silently promote those images to exact-current-SHA certification.
- Playwright was not installed in the clean research worktree, so no automated
  Demo Visual QA PASS is claimed. CUA screenshots and accessibility trees were
  inspected manually. No application, database, provider, Docker/Supabase,
  hosted QA, or production checks were run, as required for this research-only
  slice.
- RFI/Submittal populated detail states, some document-preview states, and a
  separately populated roles/permissions editor were not independently
  evidenced in the current live pass. They remain deeper workflow/evidence
  review items, not broad copy-removal targets.
- The numeric word/block counts are approximate and are not an optimization
  target. The objective is lower unnecessary cognitive load while preserving
  safe task completion and truthful state.

## 13. S3A final review questions

- Actual comparative UI patterns? Yes. Five public help/documentation surfaces
  were directly inspected; observations and limitations are separated.
- Major HydroQualiSense route families? Yes for the current safe-demo pass:
  Dashboard, Projects, project workspace, Budget/Cost Codes, Procurement,
  Supplier Invoices/review, Client Billing, Expenses, Cash/settlement,
  Warehouse, Equipment, Vendors, Documents/detail, Email/SMS, Payroll, and
  Settings. Prior exact-qualified evidence covers the broader engineering,
  preview, responsive, and recovery catalog; missing populated detail states
  are explicitly marked.
- Direct evidence versus interpretation? Yes. Live observation, prior promoted
  evidence, comparative source statements, Jev signals, and Codex
  recommendations are distinguished.
- Systematic instruction classification? Yes. The matrix applies Keep,
  Shorten, Contextual Help, Help Center, and Remove treatment to each major
  route/state; critical states remain visible.
- Keyboard/touch rather than hover only? Yes. S3B requires keyboard-focus and
  click/tap behavior; no recommendation hides a critical requirement in a
  hover-only affordance.
- Shared root causes over one-off tweaks? Yes. Eight root causes and six S3C
  page groups are recorded, with shared grammar/registry work first.
- Bounded S3B? Yes. S3B is a static Help Center, route/topic registry,
  consistent page Help action, accessible contextual-help primitive, deep links,
  and high-value topics only.
- Archived new-feature work preserved? Yes. Worker Registration, attendance
  expansion, Finance UX-W6, custom fields, broader Documents aggregation, and
  other net-new domains remain deferred.
- Roadmap/handoff consistency? The same PR updates both documents to mark S3A
  complete and S3B as the exact next implementation boundary; no Settings
  capability status is changed.
