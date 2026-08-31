# Cash & Banking

Cash & Banking is a company-scoped liquidity layer. It is intentionally not a
general ledger and does not infer income or expense from every movement.

## Balance policy

For an account, the displayed position uses the highest-trust available
snapshot source:

1. the latest provider snapshot with an available balance;
2. the latest statement snapshot;
3. the latest manual snapshot;
4. the calculated ledger balance (`opening balance + posted credits - posted debits`).

The account card always labels the source and date. Pending balances are shown
separately, and a manual balance is never labeled as a live sync.

## Cash-flow policy

Money in and Money out include only `POSTED` transactions in the selected
currency and date range. `PENDING` activity is displayed separately and
`REVERSED` activity is excluded. Confirmed internal-transfer pairs remain in
both account ledgers but their principal movement is excluded from operating
cash-flow totals. Fees remain separate transactions.

Amounts are positive numeric values; `direction` is the source of movement
semantics (`CREDIT` or `DEBIT`). No implicit foreign-exchange conversion is
performed.

## Statement imports

PDF, CSV, XLS, XLSX, and XLSM imports use a review-first mapping and preview flow. The preview
detects opening/closing balances, validates running balances, reports invalid
rows and duplicates, and only then commits a batch. Source fingerprints include
the account, normalized row values, and an occurrence index so two identical
same-day rows can remain distinct while an exact re-upload is idempotent.

Password-protected PDF statements are unlocked in client memory using standard
PDF decryption (`pdfjs-dist`). Passwords are never stored in databases, local/session storage,
logs, or telemetry. Scanned/image-only statements are surfaced safely with explicit guidance.
Direct bank/e-wallet API syncing does not store online-banking credentials, MPINs, or OTPs.

## Access and tenancy

The database migration adds separate cash permissions, company-scoped RLS,
same-company ownership triggers, confirmed-match overage checks, and atomic
statement-import and transfer-confirmation RPCs. Cash data is refreshed through
the `cash` workspace-sync group. The browser uses the active `company_id`; it
 never uses a company display name as a relationship key.
