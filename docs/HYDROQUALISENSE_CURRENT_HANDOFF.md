# HydroQualiSense Current Handoff

Status: **CURRENT — R5 COMPLETE / WAREHOUSE NEXT**  
Date: **2026-09-06**  
Repository: `Juvialski/InvoiceApp`

Use this with `AGENTS.md`, `docs/AGENT_EXECUTION_EFFICIENCY.md`, `docs/HYDROQUALISENSE_ACTIVE_ROADMAP.md`, and `docs/HYDROQUALISENSE_CLIENT_DEPLOYMENT_STRATEGY.md`. Live repository state remains authoritative if anything here becomes stale.

## Current repository state

- `main` before PR #95: `fe4506b2658ed85a0d916921e0a17c444ad92a89`.
- R4 is complete through PR #94.
- R5 implementation is complete in **PR #95 — `feat: R5 cross-module integration and data-contract hardening`**.
- The reviewed R5 runtime head was `c3aafe5fd528e4feebe62c785548b4c3d7dec46e` before the documentation-only follow-up commits.
- That runtime head passed all four protected workflows: Application Validation, Database Migrations & Upgrade Suite, Demo Visual QA, and Workflow Map/Graph consistency.
- Database CI exercised static migration checks, isolated local Supabase startup, clean migration replay, pgTAP assertions, and upgrade-path migration tests.
- No unresolved code-review thread existed on PR #95.
- GitHub branch protection requires an approval from someone other than the last pusher. The connected repository owner cannot self-approve the PR; do not weaken that protection merely to force the merge.

## R5 outcome

R5 established the integration/security baseline that was required before another major operational domain.

### Canonical Vendor and supplier continuity

- `public.vendors` is the canonical Vendor master.
- Derived/extracted supplier text remains evidence, not a competing master directory.
- Vendor creation/update/deactivation is guarded and auditable.
- Vendor identity resolution is company-scoped and protected against concurrent duplicate creation.
- Historical Vendor relationships are preserved instead of being erased by ordinary deletion.

### Supplier Invoice -> Expense truth

- Supplier verification fails closed if required authoritative facts remain unresolved.
- Unknown source amount/date/currency/category and other required accounting facts are not silently defaulted.
- Canonical Vendor resolution is required before authoritative supplier verification.
- Supplier-derived Expense financial/provenance fields are protected from ordinary drift.
- Receipt/source-document duplicate creation is protected with DB-backed idempotency/integrity.

### Extraction and tax uncertainty

- Unknown extracted financial values remain unknown instead of being converted to zero.
- No hard-coded VAT rate is used to certify source-document arithmetic.
- Direct AI extraction validates base64/file type/MIME/magic bytes before model calls.
- AI extraction/classification is protected by durable request budgets plus bounded request handling.

### Issued documents and Gmail

- Issued Purchase Order and Client Invoice emails use trusted server-rendered immutable snapshot PDF bytes.
- Browser-provided PDF bytes are not accepted as authoritative issued artifacts.
- Durable send intents and idempotency keys protect retries/recovery.
- Send audit records are bound to completed intents and the authenticated sender.
- Gmail history/import work is bounded to avoid unbounded pagination/payload amplification.

Known external limitation: a real Gmail send still requires a connected Google account/OAuth consent and is not proven by CI alone.

### Audit/RBAC/RLS/security

- Review-event actor attribution is protected against spoofed `user_id` values.
- Vendor/send/audit direct-table bypasses were tightened.
- unnecessary private SECURITY DEFINER exposure and legacy anonymous mutation grants were reduced.
- UI/server/RPC/RLS permission contracts were tightened for consequential document sending.
- final database security inventory coverage was added for policies, grants, SECURITY DEFINER functions, triggers, constraints and indexes.
- production response security headers and diagnostic exposure were hardened.

### Storage and backup

- manual source-document race recovery now resolves the correct canonical source type;
- backup registration failures remain durable/observable rather than silently disappearing;
- backup race recovery checks exact manifest identity;
- restore drills use isolated server-generated targets rather than caller-controlled paths.

## Next implementation phase — Warehouse Inventory & Project Allocation

Warehouse Inventory is now the next major operational domain unless explicitly reprioritized.

Primary invariant:

> **Current stock must be explainable from authoritative movements or an equally rigorous source model.**

Minimum scope direction:

- stock/items currently available;
- receipts/opening/additions as traceable movements;
- issues/allocations to projects;
- returns/corrections as auditable movements;
- project material usage visibility;
- no destructive balance editing;
- company/RBAC/RLS protection;
- concurrency/idempotency for consequential movements;
- procurement/delivery linkage without duplicate stock or financial truth.

Do not invent warehouse count, valuation method, reservation semantics, serial/lot policy, reorder policy, barcode/QR rules, purchase-receipt automation or adjustment authority until the client rules are explicit.

## Parallel post-R5 productization track

A bounded independent track may improve how HydroQualiSense is offered to multiple potential client companies without turning one deployment into a shared multi-company application.

Architecture:

`one repository -> many isolated client deployments`

Each client gets:

- one Render service/application deployment;
- one dedicated Supabase project/database/Auth/Storage boundary;
- separate environment configuration/secrets;
- independent deployment/version/backup state;
- no in-app switch between unrelated client companies.

See `docs/HYDROQUALISENSE_CLIENT_DEPLOYMENT_STRATEGY.md` for public landing/client-requirements intake, provisioning, fleet/version management, role templates, storage lifecycle and release strategy.

## Later confirmed major domain — Worker Registration & Attendance

Recommended dependency order:

1. project/site registration QR;
2. worker submission as `PENDING`;
3. supervisor/admin duplicate/identity/project review;
4. create/link canonical Worker + payroll/project assignment;
5. registered site/device;
6. controlled attendance state machine + corrections/offline sync;
7. face-recognition layer only after privacy/security design.

Face recognition must include explicit consent/access, retention/deletion/re-enrollment, liveness/anti-spoof, image quality, confidence thresholds, audited supervisor fallback, device/site binding, offline/concurrency handling and payroll-integration tests. Uncertain matches must never guess.

## Final security certification

Before broad production rollout across clients, run a dedicated final certification phase after the major domains stabilize. Include final DB security inventory, cross-company/permission attack tests, financial/inventory/attendance lifecycle and concurrency tests, storage backup/restore, secrets/configuration, dependency audit, public endpoints/security headers, external-token scopes, browser authorization/deep links, deployment upgrade/rollback, and biometric privacy review once applicable.

This final phase supplements rather than replaces security validation during each implementation phase.

## Permanent invariants

1. `one deployment -> one client company -> active membership/RBAC -> permitted workflows`.
2. One repository may serve many isolated client deployments; unrelated clients do not share an operational database/deployment.
3. Keep company-scoped RLS, permission checks, company-bound integrity and audit boundaries.
4. No double counting across supplier Invoice, Expense, PO, Client Billing, Collection or Cash truth.
5. Actual Cost and Committed Cost remain distinct.
6. Preserve original currency; never silently mix currencies or invent FX.
7. Preserve finalized/verified/issued/paid/collected/voided/reversed history through audited lifecycle/correction paths.
8. Derived summaries do not become canonical master data.
9. Consequential AI mutations remain prepare/validate/human-confirm/execute.
10. Inventory balances require explainable movement history.
11. Biometric attendance requires explicit privacy/identity/device/correction/audit semantics before production use.

Still unresolved by design: VAT rate, VAT-inclusive vs VAT-exclusive contract value, withholding/BIR classification, automatic/external FX-provider policy and broader accounting-period policy. Do not infer them.

## Fresh-session bootstrap

For the next implementation session:

1. inspect exact current `main` and any open PRs/CI;
2. read live `AGENTS.md`;
3. read `docs/AGENT_EXECUTION_EFFICIENCY.md`;
4. read `docs/HYDROQUALISENSE_ACTIVE_ROADMAP.md`;
5. read this handoff and client deployment strategy;
6. start Warehouse work from the latest green merged `main`;
7. generate one bounded `agent:context` packet;
8. inspect current materials/procurement/project-cost implementation before designing inventory contracts;
9. use Docker/local Supabase for inventory migrations/RLS/RPC/trigger/concurrency work;
10. local implementation lead opens the PR but does not merge its own PR; GitHub-native review uses exact-head CI as the merge gate.
