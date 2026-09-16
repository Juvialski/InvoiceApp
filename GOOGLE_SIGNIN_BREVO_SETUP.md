# Google Sign-In and Brevo setup

This deployment uses Google for identity authentication only. HydroQualiSense does
not read, scan, synchronize, import from, or send through Gmail. Outbound
transactional email, when configured, uses the client deployment's server-side
Brevo account.

## Supabase Auth: Google identity

In Supabase, enable **Authentication -> Providers -> Google**, configure the
Google OAuth client, and add the exact Supabase callback and application redirect
URLs to the provider allow lists. The application requests only these identity
scopes:

```text
openid
email
profile
```

Do not enable or request `gmail.readonly`, `gmail.send`, `gmail.modify`,
`gmail.compose`, `mail.google.com`, or any other Gmail API scope. Do not request
offline Gmail access. Google authentication does not create company membership;
the deployment's company membership and permissions remain authoritative.

For the public HydroQualiSense OAuth application, the repository-side public
URLs are:

```text
Application homepage: https://hydroqualisense.com
Privacy policy:      https://hydroqualisense.com/privacy
Terms of service:    https://hydroqualisense.com/terms
```

Google Cloud action required outside this repository: remove any old Gmail API
scopes (`gmail.readonly` and `gmail.send`) from the OAuth consent configuration,
retain the identity/OIDC configuration, and complete any Google publishing or
verification steps required for the deployment. This repository cannot edit the
Google Cloud Console and does not claim that external approval is complete.

## Brevo transactional email

Each isolated client deployment may use its own client-controlled Brevo account,
API key, verified sender/domain, and sender identity. Never use a global
cross-client credential or expose the key to the browser.

Configure these server-only values in the deployment environment. Do not prefix
them with `VITE_`, commit them, return them from an API route, or include them in
logs, screenshots, or generated documents:

```env
BREVO_API_KEY=...
BREVO_SENDER_EMAIL=verified-sender@example.com
BREVO_SENDER_NAME=Company name
# BREVO_REPLY_TO=reply@example.com
# BREVO_API_BASE_URL=https://api.brevo.com
# BREVO_REQUEST_TIMEOUT_MS=10000
```

The server calls Brevo's transactional endpoint `POST /v3/smtp/email` and checks
the account and sender configuration before sending. The sender or domain must
be verified in Brevo before sending. The application reports `NOT_CONFIGURED`,
`SENDER_SETUP_REQUIRED`, `READY`, or `CONNECTION_PROBLEM`; an API key string alone
does not make a deployment ready.

The send flow remains `prepare -> review -> human confirm -> execute`. It keeps
company permission checks, idempotent delivery intent, immutable document/PDF
provenance, provider message IDs, and reconciliation for ambiguous outcomes.
Brevo acceptance is shown as accepted/submitted, not confirmed delivery. No
background sender or webhook platform is introduced by this setup.

## QA procedure

Use only an isolated QA deployment and a safe, explicitly approved recipient.
Verify the exact application SHA, deployment ID, and migration level before
testing. First inspect Email / SMS -> Email Provider Status; then exercise the
Compose review gate. A controlled send is optional only when QA Brevo credentials,
a verified sender, and a safe recipient are available. Otherwise retain
`NOT_CONFIGURED`/unverified status and rely on the provider contract tests.

SMS is unchanged: Company SIM Gateway remains primary and PhilSMS remains the
optional hosted fallback. SMS requires its own provider-backed QA evidence.

## Historical records

Historical Gmail-derived source metadata and prior Gmail delivery rows remain
readable for provenance and audit. They are not active mailbox access and must
not be deleted merely to simplify this provider migration. New outbound email
records use the `EMAIL` channel and `BREVO` provider identity.
