# UX-W4.5B Targeted Visual Evidence

## Qualification

- Source revision: `fb939cda2d3d361212b9acdf9f8464a491fe822e`
- Environment: local `tsx server.ts` safe demo at `http://127.0.0.1:3000/demo`
- Data: synthetic, session-local demo fixtures only; no authenticated tenant, provider, or production data
- Browser: Codex in-app browser interactive capture with CSS viewport emulation at approximately `390x844` and `1440x900`
- Automated browser harness: not run; the clean worktree did not contain the `playwright` package required by `scripts/demo-visual-qa.ts`
- Qualification: interactive visual inspection only, not hosted QA, provider certification, authenticated Supabase evidence, or production evidence

## Inspected states

| Route / state | Viewport | Visual observation |
| --- | --- | --- |
| `/demo/app/projects` -> Project Details worksheet | phone | The modal owns the background boundary; the worksheet presents labelled row/field cards, identity context, and Save/Cancel actions without a forced wide table. |
| `/demo/app/projects/demo-project-cebu/billing` -> New client invoice draft | phone | Billing Details and Billing Lines use labelled row/field cards; protected project/currency/status/derived fields remain visibly restrained and machine-readable; parent Save draft remains explicit. |
| `/demo/app/expenses` -> Add direct Expense draft | phone | The modal opens with one contained workflow surface, Save/Cancel remains visible near the worksheet header, and protected lifecycle/source fields remain non-editable without repeated visible pills. |
| `/demo/app/procurement` -> New Purchase Order | phone | Header and line worksheets use the mobile fallback; Add Row/Remove Row and protected calculated/received fields remain available through the existing workflow boundary. |
| `/demo/app/procurement` -> New RFQ | phone | Header and line worksheets use the mobile fallback; invited-vendor selection and Create RFQ remain outside cell authority. |
| `/demo/app/invoices/demo-invoice-07` -> Supplier Invoice review | phone | Extracted worksheet sections use labelled row/field cards and quiet ordinary state; the page-specific source/provenance/explanation hierarchy remains intentionally deferred to UX-W4.5D. |
| `/demo/app/email-sms?view=compose&channel=sms` -> New SMS | phone | The safe demo provider is not configured and the rendered form is short; no authenticated/provider-backed long-scroll state was available to certify. |
| Project Details worksheet | desktop | The familiar table/grid remains visible with identity column and contained horizontal worksheet scrolling; the desktop interaction model is preserved. |

## Finding disposition

- **UX45A-002 — partial:** shared shell scroll-padding, dialog background-scroll locking, and representative modal scroll ownership are implemented and visually inspected. The safe-demo SMS state was provider-unconfigured and did not expose the original long-scroll scenario for full visual certification.
- **UX45A-003 — resolved for the bounded worksheet consumers:** Project Details, Cost Codes/Project Controls, Client Billing, Expense Draft, RFQ, and Purchase Order now share the mobile row/field fallback and contained dialog behavior. Broader non-worksheet payment/dialog surfaces remain outside this slice.
- **UX45A-006 — shared portion resolved:** ordinary WorksheetEditor protected/read-only pills are removed while semantics and restrained styling remain. Supplier Invoice page-specific repeated headings, provenance legend, and explanatory hierarchy remain for UX-W4.5D.
- **UX45A-010 — resolved for the bounded worksheet consumers:** the changed worksheet surfaces use deliberate mobile row/field rendering and desktop-contained tables. Unchanged non-worksheet wide payment/register surfaces remain outside this slice.
- **UX45A-004 — deliberately deferred:** the full Supplier Invoice source/review hierarchy correction remains UX-W4.5D.

No screenshot files were promoted from the interactive capture because the repository Demo Visual QA runner was blocked by the missing Playwright dependency; the observations above are retained as a qualified, non-certifying evidence record rather than represented as persisted automated screenshot artifacts.
