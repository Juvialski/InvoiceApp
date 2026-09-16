# Google Sign-In Only and Brevo Email Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove active Gmail mailbox/API functionality, make Google identity-only authentication, and provide safe Brevo-backed outbound transactional email through the existing delivery-history contract.

**Status (2026-09-16):** Implementation complete on the task branch. Focused changed-surface tests, demo browser QA, lint/build, Workflow Map, clean migration replay, pgTAP, and serial upgrade fixtures pass. Brevo live delivery remains unverified because approved QA credentials, a verified sender, and a safe recipient were unavailable; the aggregate affected selector is qualified by existing unrelated visual-harness baseline failures.

**Architecture:** Google Sign-In remains a normal Supabase identity-provider flow with `openid email profile` only. Brevo is a deployment-owned server adapter with safe account/sender status checks and a transactional send endpoint. New email delivery intents use `delivery_channel='EMAIL'`, `provider_id='BREVO'`, and `provider_message_id`; existing Gmail source and delivery records remain historical and are not rewritten.

**Tech Stack:** React 19, TypeScript, Vite, Express, Supabase Auth/Postgres/RLS/RPC, Brevo REST API, Node test runner, Playwright/demo QA, existing PDF evidence tooling.

**Spec:** `docs/superpowers/specs/2026-09-15-google-signin-brevo-email-design.md`

## Global Constraints

- Google authentication requests only `openid email profile`; never request `gmail.readonly`, `gmail.send`, `gmail.modify`, `gmail.compose`, `mail.google.com`, offline Gmail access, or incremental Gmail consent.
- Remove active Gmail connect, reconnect, token handoff, refresh-token storage/rotation, mailbox read/search/scan/sync/import, Gmail send calls, and Gmail connection-status UI.
- Preserve historical Gmail source documents, email metadata, provenance fields, immutable delivery audits, and historical provider labels.
- Brevo credentials are server/deployment-only: `BREVO_API_KEY`, `BREVO_SENDER_EMAIL`, `BREVO_SENDER_NAME`, optional `BREVO_REPLY_TO`; `BREVO_API_BASE_URL` and `BREVO_REQUEST_TIMEOUT_MS` are bounded test/runtime overrides.
- Brevo API acceptance is `ACCEPTED`, not `DELIVERED`; missing message IDs and ambiguous network/5xx outcomes become `UNKNOWN` with reconciliation required.
- Reuse `document_send_intents` and `document_send_audits`; do not create a second email-history table.
- Preserve `prepare -> review -> human confirm -> execute`, idempotency, company isolation, permissions, immutable document snapshot/PDF provenance, and source-document ownership.
- SMS remains limited to Company SIM Gateway and PhilSMS; do not implement additional SMS functionality.
- Do not mutate production data or send production email. A controlled QA send is conditional on approved QA credentials and a safe recipient.
- Wide Documents remaining work and Worker Registration remain deferred/paused.
- Use `npm.cmd`/`npx.cmd` in PowerShell, focused -> affected validation, and strict DB validation only because this plan changes DB delivery contracts.
- The implementation branch is `codex/google-signin-brevo-email` in `C:\Users\Al\Documents\InvoiceApp\.worktrees\google-signin-brevo-email`, based on `origin/main` at `72fdfc990778d0bd2dae41b95d51bfef374e7d40`.

---

### Task 1: Replace combined Google/Gmail OAuth with identity-only Google Sign-In

**Files:**
- Modify: `src/lib/supabase.ts`
- Modify: `src/components/auth/AuthScreen.tsx`
- Modify: `src/context/CompanyAccessContext.tsx`
- Modify: `src/App.tsx`
- Test: `tests/googleSignInOnly.test.ts`
- Update/remove: Gmail-token tests that only verify the retired handoff

**Interfaces:**
- Produce `signInWithGoogle(redirectToPath?: string): Promise<void>` that calls `supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo, scopes: "openid email profile" } })`.
- Preserve `signInWithEmail`, `signUpWithEmail`, password recovery, session restoration, logout, and company-access resolution unchanged in behavior.

- [ ] **Step 1: Write the failing auth contract test.** Add assertions that the source of `signInWithGoogle` contains only the three identity scopes, has no `linkIdentity`, `access_type`, `prompt=consent`, provider-token capture, or Gmail scope string, and that `AuthScreen` renders `Continue with Google` while email/password controls remain present.

```ts
test("Google sign-in is identity-only", () => {
  const source = readFileSync(new URL("../src/lib/supabase.ts", import.meta.url), "utf8");
  const functionSource = source.slice(source.indexOf("export async function signInWithGoogle"));
  assert.match(functionSource, /provider:\s*["']google["']/);
  assert.match(functionSource, /openid email profile/);
  assert.doesNotMatch(functionSource, /gmail\.readonly|gmail\.send|gmail\.modify|mail\.google\.com|access_type|prompt:\s*["']consent|linkIdentity/);
});
```

- [ ] **Step 2: Run the focused test and verify it fails against the combined flow.**

Run: `node --test --experimental-strip-types tests/googleSignInOnly.test.ts`

Expected: FAIL because the current implementation aliases `signInWithGoogle` to `connectGoogleAndGmail` and includes Gmail scopes/offline consent.

- [ ] **Step 3: Implement the minimal identity-only flow.** Remove provider-token capture/storage helpers and the Google/Gmail connection-mode function. Implement `signInWithGoogle` with the current allow-listed redirect target and identity scopes only. Keep the `AuthScreen` button label and email/password branches. Remove the `CompanyAccessContext` code that persists callback refresh material and the `App` Gmail connection state/effect.

- [ ] **Step 4: Add the company-access regression.** Extend the test to assert that `CompanyAccessProvider` still calls `loadCompanyAccess`/`loadDeploymentCompanyId` after a session and that `resolveDeploymentCompanyAccess` remains the source of permissions; assert that the Google auth helper does not assign a company or role.

- [ ] **Step 5: Run the focused auth tests.**

Run: `node --test --experimental-strip-types tests/googleSignInOnly.test.ts tests/companyAccess.test.ts`

Expected: PASS, with no Gmail scope in the executable Google sign-in function.

- [ ] **Step 6: Commit the auth boundary.**

```text
git add src/lib/supabase.ts src/components/auth/AuthScreen.tsx src/context/CompanyAccessContext.tsx src/App.tsx tests/googleSignInOnly.test.ts tests
git commit -m "feat: make Google authentication identity-only"
```

### Task 2: Retire active Gmail mailbox and token code while preserving historical sources

**Files:**
- Modify: `src/app/routes/EmailSmsRoute.tsx`
- Modify: `src/app/routes/AppRouter.tsx`
- Modify: `src/navigation/navigationModel.ts`
- Modify: `src/utils/appRouting.ts`
- Modify: `src/lib/workspaceSync.ts`
- Modify: `src/lib/persistence.ts`
- Modify: `src/types.ts`
- Modify: `src/lib/fileSecurity.ts`
- Delete after reference removal: `src/lib/gmail.ts`, `src/server/gmail/gmailAccess.ts`, `src/server/gmail/gmailAuthorization.ts`, `src/server/gmail/gmailCredentialEncryption.ts`, `src/server/gmail/gmailProviderCredentials.ts`, `src/utils/gmailCandidates.ts`, `src/lib/emailIntakeInitialSessionGuard.ts`, `src/lib/emailQueue.ts`, `src/components/EmailInbox.tsx`, `src/components/GmailInboxReadOnly.tsx`
- Modify: `server.ts`
- Modify: `src/server/access/invitationDelivery.ts` or remove the unused legacy invitation-delivery endpoint/module
- Create: `tests/gmailRetirement.test.ts`
- Update/delete: Gmail intake tests that exercise removed live behavior; retain historical-provenance tests

**Interfaces:**
- Historical `EmailSourceMetadata.gmailMessageId`, `gmailThreadId`, `gmailAttachmentId`, `StoredEmailRecord`, and source-document database mappings remain available only for loading/displaying preserved records.
- No active component or server route may import a Gmail API client, accept `x-gmail-access-token`, or expose Gmail connect/scan/sync/import/send behavior.
- Legacy `/email-intake`, `/inbox`, and `?view=inbox` resolve to the useful communications view without rendering a mailbox screen.

- [ ] **Step 1: Write the failing retirement contract.** Add a source scan test that checks `server.ts`, the Google sign-in function, route components, and active QA scripts contain no Gmail API URL, Gmail scope, Gmail send route, Gmail connect/reconnect label, or mailbox scan action. Assert that historical source metadata fields and `email_messages`/`source_documents` loading contracts remain.

```ts
test("active executable paths contain no Gmail API or restricted scopes", () => {
  const executable = ["server.ts", "src/lib/supabase.ts", "src/app/routes/EmailSmsRoute.tsx", "src/components/EmailComposePanel.tsx"]
    .map((path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8"))
    .join("\n");
  assert.doesNotMatch(executable, /gmail\.googleapis\.com|gmail\.readonly|gmail\.send|x-gmail-access-token|\/api\/gmail\//i);
});
```

- [ ] **Step 2: Run the retirement test and record the current failures.**

Run: `node --test --experimental-strip-types tests/gmailRetirement.test.ts`

Expected: FAIL with the current Gmail API imports/routes and Gmail workspace wiring.

- [ ] **Step 3: Remove application-level Gmail state and routes.** Delete the App Gmail status/effect, Gmail scan/sync/import handlers, Gmail request helper, Gmail props passed through `AppRouter`/`InvoicesRoute`, and Gmail connection state. Remove `/api/gmail/provider-credential`, revoke, status, profile, scan, history, import, and send routes from `server.ts`, plus Gmail constants/helpers/imports.

- [ ] **Step 4: Remove mailbox UI and make communications route non-mailbox-first.** Remove `EmailInbox` and `GmailInboxReadOnly` from the active route. Update route parsing/types so the canonical Email/SMS workspace supports `compose`, `sent`, `email-status`, and `sms`; normalize legacy inbox links to `compose` without showing a fake inbox.

- [ ] **Step 5: Remove active Gmail persistence writes and realtime refresh.** Remove `saveGmailMessageSource`, `saveGmailSyncState`, and the Gmail connection upsert path. Remove the `gmail` workspace refresh group and its realtime table mapping. Preserve `loadEmailSource`/source-document mapping only for already persisted historical records, and ensure no new Gmail source can be created by the communications workspace.

- [ ] **Step 6: Remove dead Gmail-only security and intake code.** Delete Gmail raw-message/attachment validation helpers when no remaining caller needs them, remove the retired queue/classification modules and their active tests, and retain only source metadata compatibility needed by existing invoice/source/document loaders. Remove the legacy invitation email endpoint/module if it is the last non-Brevo application sender; keep Auth password recovery and direct company-access authorization intact.

- [ ] **Step 7: Run the focused retirement and historical compatibility tests.**

Run: `node --test --experimental-strip-types tests/gmailRetirement.test.ts tests/storageDedup.test.ts tests/statementPostParseAccountResolution.test.ts tests/companyTenancyMigration.test.ts`

Expected: PASS; historical Gmail identifiers remain loadable, while active code contains no Gmail API path.

- [ ] **Step 8: Commit the retirement boundary.**

```text
git add server.ts src tests
git commit -m "refactor: retire active Gmail mailbox functionality"
```

### Task 3: Build the server-only Brevo email adapter and safe status contract

**Files:**
- Create: `src/server/messaging/brevoEmailProvider.ts`
- Create: `src/lib/emailMessaging.ts`
- Create: `src/components/EmailProviderStatusPanel.tsx`
- Modify: `server.ts`
- Modify: `.env.example`
- Test: `tests/brevoEmailProvider.test.ts`

**Interfaces:**
- `BrevoRecipient = { readonly email: string; readonly name?: string }`.
- `BrevoEmailProviderStatus = "NOT_CONFIGURED" | "SENDER_SETUP_REQUIRED" | "READY" | "CONNECTION_PROBLEM"`.
- `BrevoEmailStatus = { status: BrevoEmailProviderStatus; providerId?: "BREVO"; providerLabel?: "Brevo"; senderEmail?: string; senderName?: string; message: string }`.
- `BrevoSendRequest = { to: readonly BrevoRecipient[]; cc: readonly BrevoRecipient[]; subject: string; textContent: string; replyTo?: BrevoRecipient; attachment?: { name: string; contentBase64: string }; idempotencyKey: string }`.
- `BrevoSendResult = { providerId: "BREVO"; status: "ACCEPTED" | "FAILED" | "UNKNOWN"; providerMessageId?: string; providerStatus?: string; safeMessage: string; reconciliationRequired: boolean }`.
- `createBrevoEmailProvider(environment, fetchImpl?): BrevoEmailProvider | null` and `checkBrevoEmailProvider(environment, fetchImpl?): Promise<BrevoEmailStatus>` use injectable fetch for deterministic tests.
- `loadEmailProviderStatus()` and `sendEmailMessage()` in `src/lib/emailMessaging.ts` call authenticated first-party endpoints and never expose configuration secrets.

- [ ] **Step 1: Write failing adapter tests for configuration and request mapping.** Cover absent/invalid configuration, `GET /account`, `GET /senders`, matching active configured sender, sender setup required, timeout/5xx connection problem, `POST /smtp/email` payload, `api-key` header, sender/recipient names, optional CC/Reply-To, plain-text content, base64 attachment, and idempotency header/value. Assert the API key is absent from returned status, thrown safe messages, and captured logs/test output.

- [ ] **Step 2: Run the adapter tests to verify they fail.**

Run: `node --test --experimental-strip-types tests/brevoEmailProvider.test.ts`

Expected: FAIL because the adapter and client status helper do not exist.

- [ ] **Step 3: Implement configuration parsing and safe status checks.** Validate the API key and sender settings server-side, default the API origin to `https://api.brevo.com/v3`, bound timeout with `AbortController`, call `/account` then `/senders`, match the configured sender email case-insensitively, require an active matching sender, and return only the four safe status states. Use the plain-language setup message: `Verify the company email/domain in Brevo before sending.`

- [ ] **Step 4: Implement the transactional send mapping.** POST JSON to `/smtp/email` with `sender`, `to`, optional `cc`, optional `replyTo`, `subject`, `textContent`, and optional `{ name, content }` attachment. Treat HTTP 201 plus a non-empty `messageId` as `ACCEPTED`; treat provider 4xx as `FAILED`; treat 5xx, timeout, malformed JSON, or missing message ID as `UNKNOWN` with reconciliation required. Do not add webhook or marketing functionality.

- [ ] **Step 5: Implement the authenticated browser helper and status panel.** Add safe parsing for `GET /api/messaging/status` email data, a compact status panel with setup instructions, and no API-key input/storage. Keep SMS status parsing and setup behavior unchanged.

- [ ] **Step 6: Run adapter and type-focused tests.**

Run: `node --test --experimental-strip-types tests/brevoEmailProvider.test.ts tests/smsProvider.test.ts`

Expected: PASS; the Brevo adapter never makes a browser-visible credential available and SMS tests remain unchanged.

- [ ] **Step 7: Commit the provider boundary.**

```text
git add src/server/messaging/brevoEmailProvider.ts src/lib/emailMessaging.ts src/components/EmailProviderStatusPanel.tsx server.ts .env.example tests/brevoEmailProvider.test.ts
git commit -m "feat: add server-side Brevo transactional email provider"
```

### Task 4: Extend the existing delivery contract for Brevo without rewriting Gmail history

**Files:**
- Create: `supabase/migrations/20260915135236_brevo_email_delivery.sql`
- Create: `supabase/tests/database/40_brevo_email_delivery.test.sql`
- Test: `tests/brevoEmailDeliveryMigration.test.ts`
- Modify: `src/server/documentDelivery/documentDeliveryHistory.ts`
- Modify: `src/lib/documentDelivery.ts`
- Modify: `src/types.ts`
- Update: existing delivery contract tests that assume every email channel is Gmail

**Interfaces:**
- New email intent identity: `delivery_channel='EMAIL'`, `delivery_kind in ('GENERAL_EMAIL','ISSUED_DOCUMENT')`, `provider_id='BREVO'`, `gmail_message_id IS NULL`, `provider_message_id` stores Brevo `messageId`.
- Historical identity remains valid: existing `delivery_channel='GMAIL'`/`provider_id='GMAIL'`/null rows and `gmail_message_id` values are not updated.
- New RPC `complete_email_delivery_intent(p_intent_id uuid, p_status text, p_provider_message_id text default null, p_provider_status text default null, p_error_message text default null, p_reconciliation_required boolean default false)` returns the company-bound intent JSON and enforces actor, permission, immutable provider identity, status transitions, and message-ID requirements.
- Existing `claim_document_send_intent` remains the single claim path for issued/general email but is forward-updated to create `EMAIL`/`BREVO` rows for the current application.

- [ ] **Step 1: Write failing migration-contract tests.** Assert the new migration permits `EMAIL` and `BREVO`, preserves `GMAIL` historical values, adds an accepted audit state, defines the Brevo completion RPC, rejects Gmail provider credentials/functions from the new active schema, and keeps company/actor/idempotency/provenance guards.

- [ ] **Step 2: Write pgTAP security scenarios.** Add authenticated synthetic cases for Brevo general email and issued-document claims, accepted/failed/unknown completion, provider message ID persistence, repeated idempotency, unauthorized send, cross-company snapshot/intent denial, malformed provider identity, and historical Gmail row readability. Include a no-Gmail-credential-row assertion after the retirement migration.

- [ ] **Step 3: Implement the forward migration.**

The migration must:

1. Drop/revoke the non-historical `gmail_provider_credentials` functions/table so encrypted Gmail refresh credentials are no longer retained; do not drop `gmail_connections`, `gmail_sync_state`, `email_messages`, `source_documents`, or historical delivery rows.
2. Add `EMAIL` to delivery-channel checks and `BREVO` to provider checks while retaining existing `GMAIL`, SMS, and historical nullable provider values where their current rows require them.
3. Update general-email and issued-document delivery shape/trigger checks so current email rows require `EMAIL` + `BREVO`, no destination, and the existing attachment/snapshot rules; leave historical Gmail rows valid.
4. Replace the current claim function body so new claims carry the Brevo identity and still compare every immutable request field under the company advisory lock.
5. Add `complete_email_delivery_intent` with `ACCEPTED`, `SENT`, `DELIVERED`, `FAILED`, `CANCELLED`, and `UNKNOWN` validation, no backward transitions, actor/company checks, and safe provider field updates.
6. Extend terminal-audit creation and audit constraints to record `ACCEPTED` email history with provider fields, while preserving `UNKNOWN` as unresolved and preserving SMS behavior.
7. Keep `gmail_message_id` as a historical compatibility field and never populate it for Brevo.

- [ ] **Step 4: Update history mapping and safe UI vocabulary.** Map `EMAIL`/`BREVO` to an email channel and `GMAIL` rows to a historical Gmail channel. Generate safe messages such as `Brevo accepted this message for processing; delivery is not confirmed.` Never infer `DELIVERED` from `ACCEPTED`.

- [ ] **Step 5: Run static migration tests.**

Run: `node --test --experimental-strip-types tests/brevoEmailDeliveryMigration.test.ts tests/documentDelivery.test.ts`

Expected: PASS for the migration text and history mapping contracts.

- [ ] **Step 6: Commit the schema contract.**

```text
git add supabase/migrations/20260915135236_brevo_email_delivery.sql supabase/tests/database/40_brevo_email_delivery.test.sql src/server/documentDelivery/documentDeliveryHistory.ts src/lib/documentDelivery.ts src/types.ts tests
git commit -m "feat: add Brevo identity to delivery history"
```

### Task 5: Replace Gmail send routes with Brevo while preserving document provenance and confirmation

**Files:**
- Modify: `server.ts`
- Modify: `src/lib/documentEmail.ts`
- Modify: `src/components/EmailComposePanel.tsx`
- Modify: `src/components/DocumentPreviewModal.tsx`
- Modify: `src/components/CommunicationHistoryPanel.tsx`
- Modify: `src/app/routes/EmailSmsRoute.tsx`
- Test: `tests/brevoEmailDelivery.test.ts`
- Update: `tests/serverAuthorization.test.ts`, `tests/r3UnifiedFinancialDocuments.test.ts`, `tests/emailSmsDocumentsWorkspace.test.ts`

**Interfaces:**
- `POST /api/messaging/email/send` accepts `{ documentType?: "PURCHASE_ORDER" | "CLIENT_INVOICE" | "GENERAL_EMAIL"; documentId?: string; snapshotId?: string; to: (string | { email: string; name?: string })[]; cc?: (string | { email: string; name?: string })[]; subject: string; message: string; attachmentName?: string; idempotencyKey: string; confirmed: true }`.
- Response data is `{ status: "ACCEPTED" | "FAILED" | "UNKNOWN"; providerId: "BREVO"; providerMessageId?: string; providerStatus?: string; idempotent?: boolean; reconciliationRequired?: boolean; attachmentSource?: ...; attachmentSha256?: string; attachmentName?: string; templateVersion?: string }`.
- `sendEmailMessage`/`sendFinancialDocumentByEmail` replace Gmail-named browser helpers while preserving document snapshot inputs and `DocumentSendError` reconciliation semantics.

- [ ] **Step 1: Add failing route and idempotency tests.** Cover missing confirmation, missing Brevo configuration, invalid recipients, unauthorized user, cross-company snapshot, draft/voided document, accepted provider response, provider rejection, ambiguous network response, attachment hash/provenance, repeated confirmation, and no second provider call for an existing intent.

- [ ] **Step 2: Run the focused delivery tests to verify failure.**

Run: `node --test --experimental-strip-types tests/brevoEmailDelivery.test.ts tests/serverAuthorization.test.ts`

Expected: FAIL because only `/api/gmail/send` and Gmail completion semantics exist.

- [ ] **Step 3: Implement the server route.** Move the existing trusted snapshot/lifecycle/PDF rendering logic behind `/api/messaging/email/send`, authorize `documents.send`, normalize recipient objects, claim the Brevo intent, call the adapter once, complete the intent through `complete_email_delivery_intent`, and return `202` for `ACCEPTED`. On 4xx provider rejection, complete `FAILED`; on ambiguous outcomes, complete `UNKNOWN` and lock retry. Remove `/api/gmail/send` and all Gmail API calls.

- [ ] **Step 4: Update client send helpers and document preview.** Route both ordinary compose and issued-document preview through Brevo. Preserve the selected immutable snapshot/PDF source, attachment SHA, template version, and return-to-owning-record flow. Change success copy to `Brevo accepted the message; delivery is not confirmed. Delivery history was recorded.`

- [ ] **Step 5: Update history presentation.** Show `Brevo` and its provider message ID for new records; show `Gmail (historical)` for old records. Display `Accepted by provider` separately from `Delivered` and keep reconciliation-required entries locked.

- [ ] **Step 6: Run the focused delivery suite.**

Run: `node --test --experimental-strip-types tests/brevoEmailDelivery.test.ts tests/documentDelivery.test.ts tests/emailSmsDocumentsWorkspace.test.ts tests/serverAuthorization.test.ts`

Expected: PASS; no route or test calls a Gmail API endpoint.

- [ ] **Step 7: Commit the delivery integration.**

```text
git add server.ts src/lib/documentEmail.ts src/components/EmailComposePanel.tsx src/components/DocumentPreviewModal.tsx src/components/CommunicationHistoryPanel.tsx src/app/routes/EmailSmsRoute.tsx tests
git commit -m "feat: send reviewed email through Brevo"
```

### Task 6: Simplify the Email / SMS workspace around supported work

**Files:**
- Modify: `src/app/routes/EmailSmsRoute.tsx`
- Modify: `src/utils/appRouting.ts`
- Modify: `src/utils/appRouteContracts.ts`
- Modify: `src/app/routes/DashboardRoute.tsx`
- Modify: `src/navigation/navigationModel.ts`
- Modify: `src/components/EmailProviderStatusPanel.tsx`
- Modify: `src/components/SmsProviderStatusPanel.tsx` only for shared layout/status wording if necessary
- Modify: `src/assistant/helpCatalog.ts`
- Modify: `src/assistant/tourRegistry.ts`
- Modify: `scripts/qa/demoScenarios.ts`
- Modify: `scripts/qa/localQaScenarios.ts`
- Modify: `scripts/hosted-qa-certification.ts`
- Modify: `scripts/live-qa-company-simulation.ts`
- Modify: `.github/workflows/live-qa-company-simulation.yml`
- Modify: `scripts/workflow-map/graph.ts`
- Regenerate: `docs/architecture/workflow-map.json` through the repository generator
- Test: `tests/emailWorkspaceBrevo.test.ts`

**Interfaces:**
- Email workspace views are `compose`, `sent`, `email-status`, and `sms`; the default view is `compose`.
- `/email-sms`, `/email-intake`, and `/inbox` remain compatible paths; legacy `view=inbox` normalizes to `compose`.
- SMS provider choices, permissions, send flow, and readiness states remain unchanged.

- [ ] **Step 1: Write failing UX contract tests.** Assert that Email / SMS renders Compose, Sent / Delivery History, Email Provider Status / Setup, and SMS status; does not render Inbox, Gmail status, Sync, Scan, Intake Rules, Connect Gmail, or Gmail scope copy; preserves Documents handoff and SMS status.

- [ ] **Step 2: Run the UX contract test and verify failure.**

Run: `node --test --experimental-strip-types tests/emailWorkspaceBrevo.test.ts`

Expected: FAIL because the current route still mounts `EmailInbox` and Gmail-aware compose status.

- [ ] **Step 3: Implement the compact route hierarchy.** Replace the four current tabs with Compose, Sent / Delivery History, Email Provider Status, and SMS. Put provider status/setup in the email status section, not in Compose. Keep the existing top-level route/deep-link identity and document handoff query values.

- [ ] **Step 4: Update Compose and status copy.** Remove Gmail connection/reconnect props and use Brevo status. Keep recipient, CC, subject, message, supported immutable document attachment, Assistant drafting, preview/review, confirmation, and reconciliation lock. Add a plain-language status explanation and preserve responsive task-first layout.

- [ ] **Step 5: Remove stale assistant/demo/QA actions.** Remove Gmail Inbox tour and Gmail connect/send scenarios, remove `send_gmail` workflow input and controlled Gmail send branches, replace required text with Brevo status/Compose/History checks, and retain only synthetic/no-send communications scenarios unless a controlled Brevo QA secret is explicitly present.

- [ ] **Step 6: Update Workflow Map source and regenerate its artifact.** Change route descriptions and permission keys to describe Brevo outbound email, historical source records, and SMS status; run the generator rather than hand-editing generated JSON.

- [ ] **Step 7: Run focused UI/route tests.**

Run: `node --test --experimental-strip-types tests/emailWorkspaceBrevo.test.ts tests/navigationModel.test.ts tests/appRouting.test.ts tests/workflowMap.test.ts tests/workflowMapConsistency.test.ts`

Expected: PASS with no fake Inbox and no Gmail active actions.

- [ ] **Step 8: Commit the communications UX.**

```text
git add src scripts .github docs/architecture/workflow-map.json tests
git commit -m "feat: simplify communications around Brevo email"
```

### Task 7: Synchronize public OAuth, provider, security, deployment, and roadmap truth

**Files:**
- Modify: `AGENTS.md`
- Modify: `docs/HYDROQUALISENSE_ACTIVE_ROADMAP.md`
- Modify: `docs/HYDROQUALISENSE_CURRENT_HANDOFF.md`
- Modify: `docs/HYDROQUALISENSE_MESSAGING_DOCUMENTS_WAVE4D.md`
- Replace: `SUPABASE_GMAIL_SETUP.md` with `GOOGLE_SIGNIN_BREVO_SETUP.md`
- Modify: `docs/HYDROQUALISENSE_CLIENT_DEPLOYMENT_STRATEGY.md`
- Modify: `docs/HYDROQUALISENSE_DEPLOYMENT_RUNBOOK.md`
- Modify: `docs/client-facing/HYDROQUALISENSE_CLIENT_SECURITY_OVERVIEW.md`
- Modify: `artifacts/client-security/EVIDENCE.md`
- Regenerate/inspect when affected: `artifacts/client-security/Hydroqualisense_Client_Security_Overview.pdf`
- Modify: `src/public/PublicFunnelRoot.tsx`
- Modify: `src/config/productFeatures.ts`
- Test: `tests/providerTruthDocumentation.test.ts`

**Interfaces:**
- Public copy says Google Sign-In is identity-only; HydroQualiSense does not request Gmail mailbox access; Brevo is the configured outbound transactional email provider when deployment secrets and a verified sender are present; SMS direction is unchanged.
- Setup documentation lists Google identity configuration and Brevo deployment secrets, never Gmail scopes, Gmail refresh credentials, or mailbox setup steps.
- Client security material distinguishes source-backed Brevo server-side handling from deployment/operator configuration and does not claim Brevo is configured, delivered, certified, or compliant without evidence.
- Roadmap/handoff keep Wide Documents deferred and Worker Registration paused; Email/SMS remains incomplete if SMS/provider runtime criteria remain unverified.

- [ ] **Step 1: Write failing documentation truth tests.** Assert all current source-of-truth docs and public policy surfaces contain identity-only Google wording and Brevo setup, and do not instruct future work to restore Gmail mailbox access or Gmail send. Assert Settings feature copy names the actual Email/SMS capability and keeps SMS not active without provider QA.

- [ ] **Step 2: Run the documentation truth test and record stale references.**

Run: `node --test --experimental-strip-types tests/providerTruthDocumentation.test.ts tests/publicPolicyPages.test.ts tests/featureTruth.test.ts`

Expected: FAIL because current docs and public pages describe Gmail scopes/read/send.

- [ ] **Step 3: Replace setup and provider documentation.** Create `GOOGLE_SIGNIN_BREVO_SETUP.md` with Supabase Google identity configuration, the exact identity scopes, Brevo API/sender setup, server-only environment values, safe status states, QA controlled-send procedure, and the external Google Cloud action to remove Gmail API scopes. Delete or clearly supersede `SUPABASE_GMAIL_SETUP.md` so no future agent follows it.

- [ ] **Step 4: Update public policy and sign-in copy.** Replace Gmail data-access paragraphs with Google OIDC identity-only wording. State that outbound application email uses the company's configured Brevo account when enabled, and retain valid Supabase/Auth, AI, SMS, source-history, and provider-policy language without unsupported guarantees.

- [ ] **Step 5: Update security handoff/PDF claims from evidence.** Replace Gmail credential/mailbox/outbound-Gmail statements with server-side Brevo configuration and Google Sign-In-only wording. Keep historical Gmail delivery/source records described as historical where necessary. If the existing PDF contains Gmail-specific claims, regenerate it with the existing script, render every page, and inspect the affected pages for clipping, stale text, or secret/PII leakage.

- [ ] **Step 6: Reconcile roadmap and handoff.** Mark the Google/Gmail decision explicit: Gmail read/send/intake removed, Google Sign-In approved, Brevo approved outbound provider, SMS unchanged, Wide Documents deferred, Worker Registration paused. Do not mark provider runtime ready if credentials/evidence are unavailable.

- [ ] **Step 7: Run documentation tests.**

Run: `node --test --experimental-strip-types tests/providerTruthDocumentation.test.ts tests/publicPolicyPages.test.ts tests/featureTruth.test.ts tests/productTruthSurfaces.test.ts`

Expected: PASS with no stale Gmail authorization claims in active product/docs surfaces.

- [ ] **Step 8: Commit synchronized truth.**

```text
git add AGENTS.md docs SUPABASE_GMAIL_SETUP.md GOOGLE_SIGNIN_BREVO_SETUP.md src/public/PublicFunnelRoot.tsx src/config/productFeatures.ts tests
git commit -m "docs: align OAuth and email provider direction with Brevo"
```

### Task 8: Complete strict DB/runtime validation, affected checks, and PR handoff

**Files:**
- No new implementation files; review all integrated changes and generated artifacts.
- Use: `supabase/tests/database/40_brevo_email_delivery.test.sql`, `tests/brevoEmailProvider.test.ts`, `tests/brevoEmailDelivery.test.ts`, `tests/googleSignInOnly.test.ts`, `tests/gmailRetirement.test.ts`, `tests/emailWorkspaceBrevo.test.ts`.

- [ ] **Step 1: Run all new/edited focused tests.**

Run: `node --test --test-concurrency=1 --experimental-strip-types tests/googleSignInOnly.test.ts tests/gmailRetirement.test.ts tests/brevoEmailProvider.test.ts tests/brevoEmailDeliveryMigration.test.ts tests/brevoEmailDelivery.test.ts tests/emailWorkspaceBrevo.test.ts tests/providerTruthDocumentation.test.ts`

Expected: PASS with zero failures.

- [ ] **Step 2: Run clean local Supabase replay and pgTAP.**

Run in order:

```text
docker info
npx.cmd supabase db reset --local --no-seed --yes
npx.cmd supabase test db --local
npm.cmd run test:migrations
npm.cmd run test:migrations:upgrade
```

Expected: the Brevo migration replays after the full history, Gmail credential storage is absent after the retirement migration, historical email/source/delivery rows remain valid, and company/actor/RLS/RPC/idempotency tests pass. If Docker is unavailable, record the exact blocker and do not claim runtime DB certification.

- [ ] **Step 3: Run the affected-test selector.**

Run: `npm.cmd run test:affected:agent`

Expected: the exact integrated branch reports its selected tests, pass/fail/skip counts, and no unexplained Gmail/Brevo regression.

- [ ] **Step 4: Run executable-surface checks.**

Run:

```text
npm.cmd run lint
npm.cmd run build
npm.cmd run workflow-map:check
npm.cmd run workflow-map:consistency
git diff --check
```

Expected: lint/build/Workflow Map/diff checks pass; no production bundle contains a Brevo API key or forbidden Gmail scope.

- [ ] **Step 5: Run targeted browser QA.** Start/verify one local Vite server, then run the relevant demo/authenticated local scenarios for Google button/email-password sign-in UI, Email / SMS Compose, Email Provider Status, Sent / Delivery History, Documents -> Compose handoff, SMS status, and representative permissions at desktop/tablet/mobile widths. Confirm no Inbox/Gmail controls, no overflow, no console/page/request errors, and no secret material in captured DOM/screenshots.

- [ ] **Step 6: Perform conditional controlled QA provider check.** If an approved QA Brevo key, verified sender, and safe test recipient are available, run exactly one synthetic review-confirmed send after local checks and record provider status/message ID/history. Never send production email. If unavailable, keep runtime status `NOT_CONFIGURED`/`SENDER_SETUP_REQUIRED`/`CONNECTION_PROBLEM` as applicable and report mocked/contract evidence separately.

- [ ] **Step 7: Review the complete final diff.** Verify no active Gmail code remains, historical fields/rows are preserved, the only new outbound provider is Brevo, SMS is unchanged, no credential is exposed, acceptance is not labeled delivered, and docs/roadmap/handoff/Settings truth match the exact code and evidence.

- [ ] **Step 8: Push and open the PR without merging.**

```text
git push -u origin codex/google-signin-brevo-email
```

Open a focused PR titled `Replace Gmail API with Google Sign-In and Brevo email`, include the starting SHA, branch/final SHA, migration, focused/affected/DB/browser results, controlled provider evidence or blocker, skipped validation, and explicit note that Codex did not merge the PR.
