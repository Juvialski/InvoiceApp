# Phase 2A Implementation Handoff

This checklist is intentionally short. The detailed contract lives in `docs/ENGORYX_PHASE_2_PROJECT_SCHEDULING.md`.

Before implementation:

1. Verify current `main`, current CI, and `AGENTS.md`.
2. Generate a bounded WM-5 packet for the projects/scheduling scope after scheduling nodes exist; until then use the Phase 2 contract plus current project workspace, tenancy, routing, and workflow-map sources.
3. Inspect the latest company-tenancy/RBAC migrations before designing RLS.
4. Preserve the existing project workspace router instead of creating a second routing system.
5. Keep Frappe Gantt as a presentation layer over canonical Engoryx schedule records.

Recommended Phase 2A implementation order:

1. database schema + RLS + migration tests;
2. repository/provider layer + pure schedule services;
3. route/deep-link contracts + project Schedule tab;
4. accessible task list CRUD;
5. Frappe Gantt adapter and interactions;
6. demo fixtures and production/demo isolation tests;
7. workflow-map nodes/guards/invariants + regenerated outputs;
8. browser QA and final regression validation.

Do not mark Phase 2 active until persistence, RLS, route guards, schedule CRUD, and CI/browser validation are complete.
