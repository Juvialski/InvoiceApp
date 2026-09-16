# Google Sign-In Only and Brevo Transactional Email Design

**Date:** 2026-09-15  
**Repository baseline:** `origin/main` at `72fdfc990778d0bd2dae41b95d51bfef374e7d40`  
**Status:** Approved for implementation by the user after the context/design gate

## Goal

Remove Gmail mailbox/API functionality from the live HydroQualiSense product, keep Google only as an identity sign-in option, and move supported outbound transactional email to a server-side Brevo adapter without creating a second delivery-history system.

## Decisions

### Google authentication

The browser uses the normal Supabase Google identity-provider flow with only `openid email profile`. The sign-in path does not call `linkIdentity`, request offline access, request consent for mailbox permissions, capture provider access/refresh tokens, or expose Gmail reconnect controls. After authentication, the existing `CompanyAccessProvider` still resolves deployment company membership and effective permissions; a successful Google identity never grants company access by itself.

### Gmail retirement and historical compatibility

All active Gmail API routes, Gmail OAuth authorization/reconnect code, provider-token handoff, refresh-token storage/rotation, mailbox scan/sync/search/import, Gmail connection-status UI, Gmail delivery calls, and Gmail-specific active QA flows are removed from executable application paths. Existing company records, imported source documents, email metadata, source relationships, immutable delivery audits, and historical Gmail identifiers remain readable through their owning workflows. Historical delivery rows may continue to display `GMAIL`; no new row may identify Brevo as Gmail or write a Gmail message field.

The encrypted `gmail_provider_credentials` table is not historical business evidence. A forward migration removes its active functions/table so old refresh credentials are no longer retained. Historical `gmail_connections`/`gmail_sync_state` metadata and Gmail source columns remain only where needed for compatibility and are no longer written or used to authorize an API request.

### Brevo configuration and provider boundary

Brevo is deployment-owned under the one-deployment/one-client model. The server reads:

```text
BREVO_API_KEY
BREVO_SENDER_EMAIL
BREVO_SENDER_NAME
BREVO_REPLY_TO             (optional)
BREVO_API_BASE_URL         (test-only override; default https://api.brevo.com/v3)
BREVO_REQUEST_TIMEOUT_MS   (bounded optional override)
```

The browser never receives or stores the API key. Company Admins can view a safe status and setup instructions; a deployment operator changes the secret store. Status is derived from configuration plus a bounded Brevo account/sender check:

- `NOT_CONFIGURED` — required server settings are absent or invalid;
- `SENDER_SETUP_REQUIRED` — the key works but the configured sender is not present/active/verified;
- `READY` — the account check and configured sender check succeed;
- `CONNECTION_PROBLEM` — the provider check could not be completed safely.

The adapter uses `GET /v3/account` and `GET /v3/senders` for status and `POST /v3/smtp/email` for delivery. It sends the configured sender, recipient objects with names when available, optional CC and Reply-To, subject, plain-text content, and base64 attachments. Brevo's `messageId` is stored in the existing provider-message history field. A 201/API acceptance is represented as `ACCEPTED`, never as confirmed `DELIVERED`; missing message IDs, timeouts, and ambiguous 5xx outcomes become `UNKNOWN` with reconciliation required.

### Delivery data model

The existing `document_send_intents` and `document_send_audits` tables remain authoritative. A forward migration adds the truthful `EMAIL` channel and `BREVO` provider identity while retaining existing `GMAIL` values for historical rows. New email intents use `delivery_channel='EMAIL'`, `provider_id='BREVO'`, and `provider_message_id`; `gmail_message_id` remains a historical compatibility field. The migration updates the claim/completion/terminal-audit functions and constraints without rewriting historical rows.

The server exposes a provider-neutral `/api/messaging/email/send` endpoint protected by the existing `documents.send` company permission. It validates the immutable issued snapshot and lifecycle for document attachments, claims one idempotent intent, calls Brevo once, durably completes the intent, and preserves the existing human `prepare -> review -> confirm -> execute` boundary. It never schedules or automatically sends email.

### Communications UX

The top-level `/email-sms` route remains the stable communications entry point, but its default workspace no longer presents an Inbox. Email sections are Compose, Sent / Delivery History, and Email Provider Status / Setup. SMS status and compose remain present with the existing Company SIM Gateway/PhilSMS direction and truthful unavailable states; no SMS provider implementation changes are included. Legacy `/email-intake`, `/inbox`, and `?view=inbox` links resolve to the communications workspace's useful non-mailbox view without rendering a fake Gmail inbox.

Compose and document-preview sending use Brevo status and the shared delivery contract. History distinguishes new Brevo entries from historical Gmail entries, and safe messages say “accepted by provider” when only Brevo acceptance is known. Documents hand off the exact authorized snapshot as before.

### Documentation truth

Public policy, sign-in, Settings, deployment setup, security handoff, roadmap, handoff, and messaging documentation state that Google is used for Sign-In only, HydroQualiSense does not request Gmail mailbox access, and configured outbound transactional email uses the deployment's Brevo account and verified sender. No document claims Brevo is configured or delivered in an environment without provider evidence. The old Gmail setup document is replaced or marked superseded so it cannot instruct a future agent to restore Gmail intake.

## Error and security behavior

- Provider configuration errors are safe, bounded, and never include the API key.
- Brevo 4xx rejection becomes a recorded `FAILED` attempt; network/5xx/invalid acceptance becomes `UNKNOWN` and locks retry until history is reconciled.
- Repeated confirmation with the same idempotency key returns the existing accepted/terminal intent and does not call Brevo again.
- All email status/send/history routes require an authenticated Supabase session, the resolved deployment company, and `documents.send`; issued documents retain their document-read, lifecycle, snapshot, and provenance checks.
- No provider credential, raw provider response, message body beyond existing audited hashes, or production data is emitted to browser state, logs, screenshots, or generated documents.

## Validation contract

The implementation must add focused regression coverage for identity-only Google auth, forbidden Gmail-scope absence, removal of Gmail routes/UI, historical Gmail compatibility, Brevo request/status/error mapping, sender verification, attachment mapping, provider-message persistence, permissions, company isolation, idempotency, and accepted-versus-delivered truth. Because the delivery contract changes in the database, the integrated branch runs focused tests, affected tests, lint/build/browser/workflow checks, clean migration replay, pgTAP, migration tests, upgrade-path tests, runtime authorization/RLS tests, and relevant idempotency/concurrency checks. A controlled QA Brevo send is attempted only when an approved QA key and safe recipient are available; otherwise provider runtime remains truthfully unverified and mocked/contract evidence is reported separately.

## Out of scope

SMS provider implementation, inbound email replacement, IMAP/Outlook/forwarding ingestion, Brevo marketing/bulk mail, Wide Documents managed slices, Worker Registration, attendance, biometrics, production mutation, and unrelated financial/document-source redesign remain out of scope.
