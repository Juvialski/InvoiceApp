# UX-RESET-1 — Feature inventory and implementation boundary

Base: `3bf5db9460b972408b8037bfdc1dddb3822cd83e` (fetched 2026-10-12). Source authority: `src/utils/routes.ts`, `src/navigation/navigationModel.ts`, `src/app/routes/AppRouter.tsx`, existing domain components and permission keys. This is simplification of existing capability, not retirement or new authorization.

## Inventory and decisions

| Route / surface | Classification | Default placement / decision | Dependencies and authority |
| --- | --- | --- | --- |
| `/dashboard` Home | Essential daily | Keep; four permitted task shortcuts first, short attention queue and count summary | Existing dashboard source completeness; no invented totals, zero-filled missing sources or payroll warnings |
| `/invoices` bill register and `/invoices/:id` | Essential daily | Bills & Payments; search, review/payment status, source detail; overview disclosure secondary | `invoices.read`; existing review/management controls; settlement projections, linked Expense and original currency |
| `/extract` upload / pasted bill evidence | Essential daily | Add bill within Bills & Payments; also Home | All of invoice manage, extract, verify for extraction. Existing byte validation, provider budgets and persisted review source |
| `/review` / exact bill query | Essential daily | Bills needing review; also actionable Home queue | Invoice read for viewing; invoice manage + verify + Expense manage for posting; readiness, canonical Vendor, explicit warning confirmation |
| `/projects` / `/projects/:id` | Essential daily | Keep Projects; familiar cards and exact-project links | Project read/manage; nested cost codes, budget, procurement, billing, documents, site records and allocations keep their individual permissions |
| `/workbook` | Essential daily for structured work | Workbook; Home shortcut; existing five sheets only | Enabled-adapter read permissions and existing delegated Apply authority; source-derived fields and lifecycle protected |
| `/warehouse` | Essential daily | Warehouse; compact stock summary and explicit Assign stock action | Inventory read/manage, project read for issue; movement-based stock and existing item/quantity/project validation; no destructive balance editing |
| `/documents` | Useful secondary, frequently visited | Keep in daily navigation as requested | Source-permission filtering, managed versions, immutable issued artifacts; projection, not a second domain owner |
| `/expenses` | Useful secondary | More Tools; includes direct drafts and supplier-derived payable context | Expense read/manage; approved/source-linked histories and canonical supplier Expense authority |
| `/cash` | Advanced financial | More Tools; existing payment handoffs remain available | Cash summary/transaction/manage/reconcile permissions; authoritative transaction and settlement history, idempotency and reversal |
| `/procurement` | Useful secondary / specialized | More Tools; RFQs, quotations, POs, receipts, subcontract workflows retained | Procurement read/manage/approve; separate draft editing, issue/approval, receiving/matching and committed cost |
| `/equipment` | Useful secondary | More Tools; registry and explicit assignment/transfer/return preserved | Equipment read/manage; company asset identity, assignment history, project context |
| `/payroll` and workforce tabs | Advanced / privacy-sensitive | More Tools; no permanent Home warning | Payroll detail/read/manage/approve and worker/compensation permissions; finalized pay and workforce history retained |
| `/reports` | Advanced analysis | More Tools | Existing report permissions and completeness rules; financial/cost source distinctions unchanged |
| `/email-sms` (`/inbox` alias) | Useful secondary | More Tools | Document-send and source permissions; prepare/review/confirm, provider truth and immutable delivery intents retained |
| `/vendors` | Useful supplier maintenance | Suppliers within Bills & Payments | Vendor read/manage; canonical identity, deliberate linking, duplicate checks, archive/reactivate and version preconditions |
| `/settings` | Administrative | More Tools plus existing account shortcut | Company settings read and specialist settings/role permissions; no role-name authority shortcut |
| `/help` | Useful secondary | Existing page Help and Help Center retained | Keyboard/touch disclosures; critical validation stays in the workflow |
| Project Cost Codes / RFQ / PO / direct Expense worksheets | Essential within owning task | Keep existing editors and five workbook adapters | Update-only ordinary fields, permission recheck, stale state, human review/Apply and protected history |
| Supplier header/vendor/totals horizontal worksheets | Redundant presentation | Regroup ordinary facts into short grids; detailed source/tax/contact/line evidence in disclosures | Same `WorksheetEditor`, parse/validation/render/provenance functions and one invoice draft; no new master or payable |
| Home departmental launcher / prominent Insights card | Redundant presentation | Replace with tasks; analysis retained under Business insights | Existing analytics destination retained with incomplete totals withheld |
| Repeated supplier source badges/internal project IDs in bill register | Redundant presentation | Quiet normal provenance; original source retained in bill details | Exceptional duplicate, void, archive and warning states remain explicit |
| Historical EMAIL source labels / legacy invoice presentation | Potentially obsolete; verify later | Keep historical read paths; no deletion | Gmail intake is historical; old retained source/financial history must remain interpretable |

All 17 application route IDs, aliases and deep links remain stable. Module IDs also remain stable so deployment hidden-module configuration continues to apply. More Tools is a disclosure of already-filtered modules, not a separate mode or permission source. Settings-only roles still receive More Tools; roles with no secondary access do not receive an empty disclosure.

## Home and supplier journey

Home shortcuts are task capabilities, not department names. Add bill requires the upload capabilities. Record payment requires access to bills and Cash plus Expense read/manage, cash transaction management and reconciliation. Workbook requires an enabled existing sheet. Stock issue requires inventory read/manage plus project read. Destination workflows still recheck their own authority.

Journey: Add bill -> Review details -> Resolve issues -> Confirm bill -> Record payment. “Confirm bill” invokes existing invoice verification/linked-Expense creation; it does not mark a payment. Warning/duplicate confirmation remains explicit in both queue and standalone contexts. Worksheet changes must be saved before confirmation. Verified linked bills show their existing Expense settlement surface immediately; Record payment requires the existing settlement permissions, outstanding amount and no void/authority conflict.

Source evidence remains left of extracted details at laptop/desktop widths, and above them on phones. Details do not silently erase history. Normal source provenance is quiet; manual/unresolved/conflict states stay visible. The synthetic demo retains one source-linked Expense, a deterministic demo identity and the reviewed description/canonical supplier after verification. Actual payment submission/runtime is a separate hosted boundary.

## Layout reference and evidence scope

The supplied Canva shortlinks could not be resolved by the connector or web reader. Read-only Canva search located **HydroQualiSense UX Board**, design `DAHXzc7s2iw`, revision 2, nine pages. Its copy matched the requested daily navigation, four Home tasks and split source-review concept; the Home thumbnail was visually inspected. Treat it as a provisional reference because equivalence to the supplied new shortlink is unconfirmed. No proprietary asset or generated business rule was copied; existing design tokens/components are retained.

The board's proposed extra workbook sheets, payment examples, inferred tax rules and invented advanced-accounting labels do not authorize product changes. The next workbook scope is specified separately in [UX-RESET-2](UX-RESET-2-WORKBOOK-SPEC.md). Local synthetic/headless evidence and exact-head PR CI are recorded in [the evidence report](UX-RESET-1-EVIDENCE.md); they do not certify hosted Supabase, provider delivery, actual settlement or production release.
