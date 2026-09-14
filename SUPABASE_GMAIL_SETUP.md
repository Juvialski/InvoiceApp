# Supabase + Gmail setup

This build is intentionally ready for a **fresh Supabase project** and remains backward-compatible with the already-applied invoice operations foundation. The app stays usable in local/demo mode before the project is connected.

## 1. Create a fresh Supabase project

Create the project in the Supabase dashboard, then copy:

- Project URL
- Publishable key (or legacy anon key if your project still uses it)

Add them to AI Studio Secrets / environment as:

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

The publishable key is intended for browser clients. Do **not** put a Supabase service-role/secret key in the frontend.

## 2. Apply the complete migration set

Apply every file under `supabase/migrations/` in repository order through the
normal Supabase migration workflow. Do not apply only the invoice foundation:
the current chain also establishes company-scoped RLS, Storage boundaries,
membership/RBAC, deployment-company resolution, immutable history rules, and
the single-company deployment guards.

After the migrations, provision exactly one client company and set
`public.deployment_configuration.company_id` through an administrative or
service-role process. Create the initial active `COMPANY_ADMIN` membership
explicitly. A fresh database intentionally does not invent a client company;
an upgraded database with multiple active companies and no configuration
fails closed as ambiguous.

The complete migration chain is additive for business data and preserves
company IDs, historical rows, Storage prefixes, invoice extraction snapshots,
review history, and approved/paid payroll history. Run fresh-reset and
upgrade-path validation before using the project for production data.

The invoice directory uses archive semantics: removing an invoice hides the working record while keeping the original document, immutable AI extraction, and review events.

### Philippines-first localization

The client defaults to `PH`, `en-PH`, `PHP` (`₱`), and `Asia/Manila`. Regional defaults are presentation/settings data; imported invoices preserve their source currency. PH tax fields are stored in the existing `invoices.current_data` JSON and immutable extraction snapshots, so this localization pass does not require wiping data or adding a migration. Do not rerun the foundation migration against a live workspace just for localization.

The review workspace recognizes VAT / Non-VAT invoices, TIN and branch details, VATable / zero-rated / VAT-exempt amounts, ATP/OCN or permit text, and optional withholding tax. The deterministic 12% check is only applied when the source explicitly supports the simple VATable case. Completeness is a review aid, not legal certification.

## 3. Configure Google in Supabase Auth

In the Supabase dashboard:

1. Open **Authentication → Providers → Google**.
2. Enable Google.
3. Add the Google OAuth Client ID and Client Secret from your Google Cloud project.
4. Add your app URL to the Supabase Auth redirect allow list.

For local development also allow your localhost URL.

## 4. Configure Google Cloud for Gmail and the public OAuth pages

In the same Google Cloud project used for the Supabase Google provider:

1. Enable the **Gmail API**.
2. Configure the OAuth consent screen / Google Auth Platform audience.
3. Add test users while the OAuth app is still in testing.
4. Ensure the app is allowed to request:

```text
openid
email
profile
https://www.googleapis.com/auth/gmail.readonly
https://www.googleapis.com/auth/gmail.send
```

The app requests Gmail **read-only** permission for intake and `gmail.send` for user-confirmed outbound messages. Users must authorize their own mailbox; typing somebody else's email address does not grant access.

The redirect URI registered in Google should include the callback Supabase provides for the Google provider, normally in this form:

```text
https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback
```

Use the exact callback shown by your Supabase project rather than guessing it.

For the public Hydroqualisense OAuth application, use these Google Auth Platform values:

```text
Application homepage: https://hydroqualisense.com
Privacy policy:      https://hydroqualisense.com/privacy
Terms of service:    https://hydroqualisense.com/terms
```

The public homepage and policy pages do not require a Supabase session. The public
homepage is still deployment-gated by `VITE_HYDROQUALISENSE_PUBLIC_FUNNEL_ENABLED`
so an operational client deployment is not changed accidentally; enable that
non-secret build setting only for the public Hydroqualisense deployment. Privacy
and Terms remain reachable from the sign-in screen even when the requirements
funnel is disabled.

The Google Auth Platform application was confirmed by the operator to be in
**TESTING** and is being moved toward production configuration. Google documents
that an external OAuth application in Testing can issue refresh tokens that expire
after 7 days when Gmail scopes are requested. Move the application to its intended
production publishing state and complete any required trust/verification steps
before relying on long-lived Gmail authorization. The repository does not claim
that publishing or verification has been completed.

Before QA or production certification, the operator must verify the exact Google
OAuth client, authorized JavaScript origin, Supabase callback URI, Supabase
application redirect allow list, enabled Gmail API, requested scopes, publishing
status, and the verification/trust status required for the actual deployment and
user model.

## 5. Durable Gmail server authorization

Supabase Auth does not refresh third-party Google provider tokens for the
application. After the OAuth callback, the application sends the provider refresh
token once over the authenticated server path. The server encrypts it with a
dedicated `GMAIL_CREDENTIALS_MASTER_KEY` and stores only the encrypted envelope in
the company/user-scoped credential contract. Gmail access tokens are refreshed
server-side and are not written to browser local storage. A rotated Google refresh
token replaces the stored envelope.

Configure these server-only values in the same deployment as the Supabase/Gmail
integration. Do not prefix them with `VITE_`, commit them, or return them from an
API route:

```env
SUPABASE_GMAIL_SERVER_KEY=SERVER_ONLY_SUPABASE_SECRET_OR_SERVICE_ROLE_KEY
GMAIL_CREDENTIALS_MASTER_KEY=BASE64_OF_32_RANDOM_BYTES
GMAIL_GOOGLE_CLIENT_ID=GOOGLE_OAUTH_WEB_CLIENT_ID
GMAIL_GOOGLE_CLIENT_SECRET=GOOGLE_OAUTH_WEB_CLIENT_SECRET
```

The server may use `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID` and
`SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_SECRET` as deployment-only aliases when that
is how the Auth provider is provisioned. The client ID/secret must belong to the
Google OAuth client configured for this deployment. Keep the Gmail server key and
Gmail encryption key separate from the AI credential key.

If an existing connection has no stored provider refresh token, reconnect Google +
Gmail once with offline access and consent so the callback can capture it. A
normal access-token expiry after that should refresh without another user consent.

Gmail error handling distinguishes access-token expiry, invalid/revoked
authorization, missing scopes, account or policy permission errors, quota/rate
limits, transient provider failures, and deployment configuration failures. Only
an actual invalid/revoked authorization or missing required scope should send the
user to reconnect; quota and transient failures keep the stored authorization.

## 6. Gemini credentials

Production company AI credentials are configured by an explicitly provisioned internal deployment operator through the server-side maintenance path. The ordinary client deployment has no global company-management screen. The browser submits a new key once over HTTPS when that internal path is deliberately enabled; Express encrypts it with AES-256-GCM and stores only the encrypted envelope plus safe metadata.

Configure this server-only master key in the deployment:

```env
AI_CREDENTIALS_MASTER_KEY=BASE64_OF_32_RANDOM_BYTES
ALLOW_GLOBAL_GEMINI_FALLBACK=false
```

Generate 32 cryptographically random bytes and base64-encode them. Never use a Gemini key, Supabase key, user password, company ID, or hard-coded value as the master key. `GEMINI_API_KEY` may remain only for an explicit local/demo transition when `ALLOW_GLOBAL_GEMINI_FALLBACK=true`; it is not a production fallback.

The default extraction/classification model is `gemini-3.5-flash-lite` with `gemini-3.7-flash` as fallback/accuracy mode.

## 7. Test the end-to-end flow

1. Open the app.
2. Go to **Gmail Inbox**.
3. Click **Connect Google + Gmail**.
4. Grant the requested Gmail read-only intake and send permissions.
5. Choose a scan window and click **Scan likely invoice emails**. Candidate discovery includes invoice, sales invoice, service invoice, VAT invoice, billing, SOA, BIR, TIN, and amount-due terms, but remains conservative.
6. Gemini classifies the candidates.
7. Click **Import & extract** on an invoice-like email.
8. Confirm the original raw email appears in `email-originals`.
9. Confirm all attachments appear in `invoice-originals`.
10. Open the generated invoice from **Review Queue**.
11. Compare **Original document**, **Source email**, and **AI vs human**.
12. Edit a value, then click **Verify**.
13. Confirm the invoice's working data changes while the `invoice_extractions` snapshot stays unchanged and `invoice_review_events` records the review.
14. In **AI vs human**, revert one edited field to its original AI value and confirm a field-level review event is recorded.

For current Philippine terminology, see [BIR Revenue Regulations No. 7-2024](https://bir-cdn.bir.gov.ph/BIR/pdf/RR%20No.%207-%202024.pdf) and [BIR Revenue Memorandum Circular No. 77-2024](https://bir-cdn.bir.gov.ph/BIR/pdf/RMC%20No.%2077-2024.pdf). Official Receipt, Billing Statement, and Statement of Account should remain conservative candidates; Gemini classification and human review decide how they are handled.

## Sync behavior

The first scan stores Gmail's latest history ID in `gmail_sync_state`. **Sync new** then uses Gmail history changes instead of rescanning the whole mailbox. If Gmail reports that the history cursor is too old, the API tells the UI to perform a fresh scan.

This version intentionally uses user-triggered sync rather than background Gmail push notifications. That keeps the first Supabase/Gmail release easier to test and debug. Gmail push/PubSub can be added after the core workflow is stable.

The Gmail inbox supports last 7, 30, or 90 days, plus a custom date range. `Sync new` follows Gmail history pages and will rebuild the cursor with a fresh 30-day scan if Gmail reports that the saved history cursor has expired. The saved cursor is never moved backward.

## Operator action remaining

For the intended public deployment, complete one coordinated setup action:
publish the Google Auth Platform application for production as appropriate,
verify the exact OAuth client/origin/callback/scope/trust configuration, set the
four server-only Gmail values above, apply the committed Gmail credential
migration to the intended QA deployment, and complete one controlled
reauthorization so the server can capture and test the refresh-token path. Do
not treat the app as Google-publishing-verified or Gmail-ready until that
operator evidence exists.
