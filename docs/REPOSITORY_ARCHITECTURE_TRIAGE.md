# Repository Architecture Triage

Status: **COMPLETE for the current professionalization program**

This record closes the responsibility/context-budget review required before the
Excel-Native Operations UX phase. It records the remaining intentional central
boundaries so future work does not mistake a large file for an automatic
extraction requirement.

## Responsibility decisions

| Area | Current boundary | Decision | Reason |
| --- | --- | --- | --- |
| `src/App.tsx` | Authentication, navigation, workspace synchronization, cross-domain derived views, remaining payroll/invoice/expense orchestration, and router composition | Intentionally retained | Domain controllers already own Procurement, Inventory/Equipment, Cash & Banking, and Projects slices. The remaining work is cross-domain composition; another broad controller would recreate the monolith under a new name. |
| `src/app/routes/AppRouter.tsx` | Route selection and typed route-to-workspace composition | Intentionally retained | This is the application’s central navigation boundary. Splitting by route family would duplicate the permission/deep-link contract unless a bounded feature first supplies a stable route-group interface. |
| `src/components/procurement/ProcurementPage.tsx` | Procurement state, filtering, derived financial models, permissions, lifecycle mutations, routing context, and editor orchestration | Intentionally retained after Slice 5 Waves A-B | Register presentation is extracted into focused sections. The parent remains the authority for Purchase Orders, RFQs, quotations, subcontracts, claims, variations, and their financial/history semantics. |
| `src/lib/payrollWorkforce.ts` | Workforce attendance, leave, overtime, and payroll-related domain calculations | Intentionally retained | The file is a cohesive workforce domain library with typed pure contracts, not an application composition hub. Splitting by function name alone would increase context hops without reducing authority coupling. |
| `src/server/documentTemplates/documentTemplateRouter.ts` | Server-only document-template lifecycle, Storage, AI preparation, PDF capability, and authorization boundary | Intentionally retained | The router is one protected document-template API boundary. Further extraction must preserve server-only capability and immutable-version orchestration and belongs with a concrete route change. |
| `src/types.ts` | Shared application/domain contract types | Intentionally retained | It is a compatibility contract hub. Mechanical splitting would increase import churn and does not establish clearer ownership by itself. |
| `scripts/workflow-map/context.ts` | Curated Workflow Map bounded selection, packet fitting, and rendering | Intentionally retained | It is the compatibility implementation for `workflow-map:context`; RI-3 augments it rather than replacing or duplicating its public contract. |
| `scripts/repository-intelligence/graph.ts` and `contextEngine.ts` | Developer-only graph merge/query and bounded context integration | Intentionally retained as a library boundary | The graph/query model and context provider are deliberately additive, local-only, and customer-runtime independent. Splitting them further before RI-4 would create small indirection without improving the current API. |

## Context-budget outcome

Routine domain work should follow the smallest available path:

`route/page -> domain presentation/controller -> domain service/persistence -> focused tests`

The retained central files are composition or contract boundaries. New product
work must not add unrelated domain mutations to them merely because they are
already imported. New domain behavior belongs in the existing `src/features`,
`src/lib`, `src/server`, and focused component boundaries.

## Repository hygiene outcome

- `npm` and `package-lock.json` are the only supported package workflow.
- RI caches, build output, coverage, local environment files, logs, and new CI
  run output are transient and ignored.
- Existing sanitized client-security and UI/UX artifacts remain tracked only
  where current documentation cites them as durable evidence; see
  [`REPOSITORY_EVIDENCE_POLICY.md`](REPOSITORY_EVIDENCE_POLICY.md).
- Historical `ENGORYX_*` documents and compatibility identifiers remain
  unchanged where they preserve historical or persisted references. They are
  not current sequencing or product-brand authority.

## Repository identity decision

The GitHub repository remains `Juvialski/InvoiceApp` for this implementation.
The product-facing identity is HydroQualiSense and repository-internal current
metadata uses that identity where safe. Codex has no connected GitHub
administration capability in this run to rename the repository or verify the
linked Render service/webhooks, so no external rename is claimed.

If an administrator later chooses to rename it, the exact recommended name is
`HydroQualiSense`. Before doing so, update and verify the GitHub remote,
Render auto-deploy connection, Actions/webhooks, deployment inventory
templates, badges or deep links, and any external setup documentation. The
manual rename is an external administrative action, not an unfinished
repository-architecture implementation item.
