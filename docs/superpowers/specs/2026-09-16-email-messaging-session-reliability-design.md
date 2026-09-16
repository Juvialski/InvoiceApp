# HydroQualiSense — Email Messaging UX, Recipient Directory, Batch Delivery, Assistant Drafting, and Runtime-State Reliability

Status: **DESIGN APPROVED / IMPLEMENTATION DEFERRED UNTIL A LATER AGENT RUN**  
Date: **2026-09-16**  
Repository: `Juvialski/InvoiceApp`  
Authoring baseline: `main` at `573e1544c550eeefc8dd251261dcc641aabb1852` after PR #173  

> Future agents must not assume the authoring SHA is still current. Pull the latest `main`, read live `AGENTS.md`, the efficiency guide, active roadmap, current handoff, and the Wave 4D messaging contract before implementing. Live repository state overrides this historical SHA and any stale implementation details below.

## 1. Purpose

This design defines the next focused HydroQualiSense product phase after the Google Sign-In + Brevo transactional-email migration.

The user has now runtime-configured Brevo successfully and the Email/SMS workspace reports `Brevo · Ready`. Real use immediately exposed several product gaps that must be addressed together rather than with isolated patches:

1. the current email composer keeps the previous message after a successful send;
2. preview/review is hidden behind a button instead of being continuously visible while composing;
3. recipients are plain text only; company users, roles, and projects are not selectable as recipient groups;
4. there is no controlled private batch-send workflow for sending the same message to many recipients with pacing;
5. the Assistant button exists but the Assistant currently says it has no email-drafting capability, so the UI promise and actual Assistant capability do not match;
6. after the browser/page has been idle or backgrounded, parts of the app can temporarily show `No access` until a full reload even though access is actually valid;
7. Brevo status and other special/runtime capability statuses are repeatedly reloaded when switching tabs/components, causing unnecessary requests, flicker, and confusing state changes;
8. loading, refreshing, stale, unavailable, signed-out, and forbidden states are not consistently distinguished across the application.

This phase is therefore both a **communications UX phase** and a **cross-app runtime-state reliability phase**.

The goal is not to turn HydroQualiSense into a marketing-email platform. The goal is to make normal company communication fast, safe, understandable, role/project aware, durable, and resistant to common browser-idle/session-refresh problems.

## 2. Existing product contracts that must remain true

Implementation must preserve all standing repository invariants and especially the Wave 4C/4D messaging boundaries:

- Google remains **identity only** (`openid email profile`). Do not restore Gmail mailbox/API scopes, Gmail sending, Gmail token storage, or inbox intake.
- Brevo remains the server-side outbound email provider for this deployment.
- Provider secrets stay server-side and must never be returned to browser state, logs, Assistant context, or delivery-history UI.
- Consequential outbound sending remains `prepare/review -> explicit human confirmation -> execute`.
- The Assistant may prepare content and selections but must never silently send email/SMS.
- Existing immutable document snapshot, template/version, delivery-intent, idempotency, reconciliation, and audit/history semantics must remain intact.
- Documents remains an access/index surface; owning business domains remain authoritative.
- Company isolation and permission-based authorization remain mandatory. Do not replace permission checks with role-name checks.
- Financial, payroll, inventory, document-history, project-history, and security semantics are out of scope except where an explicit relationship is required to resolve communication recipients.
- SMS provider implementation/status remains a separate Wave 4D concern. This phase may move SMS status onto shared runtime-state infrastructure but must not claim SMS provider readiness unless it is actually configured and runtime-tested.
- Worker Registration remains paused.

## 3. Current implementation observations

These observations describe the authoring baseline and explain why the phase exists. Future agents must re-inspect current code before changing anything.

### 3.1 Compose state is not reset after success

`src/components/EmailComposePanel.tsx` currently maintains local state for:

- `selectedKey`
- `to`
- `cc`
- `subject`
- `message`
- `reviewOpen`
- provider/history status
- `idempotencyKey`

After a successful `sendEmailMessage(...)`, the component records a success message, closes review, creates a new idempotency key, and invokes `onSent`, but it does not clear To/CC/Subject/Message/attachment. This leaves stale content visible and makes accidental repeat sending more likely.

### 3.2 Preview is opt-in instead of live

The same component uses a `Preview / Review` button to reveal a review card. The user explicitly wants the preview visible while composing, with no separate preview click required.

### 3.3 Recipient entry is unstructured

The authoring baseline uses plain text `To` and `CC` inputs and splits addresses by comma/semicolon/newline. There is no company recipient directory and no role/project selector.

### 3.4 Provider status is component-local

`EmailComposePanel.tsx` fetches Brevo provider status on mount/company change. `EmailProviderStatusPanel.tsx` independently does the same. Moving between tabs can therefore remount components and repeat the same network check even when nothing changed.

The initial provider state in some surfaces is also a synthetic placeholder such as `NOT_CONFIGURED` or `CONNECTION_PROBLEM`, which can briefly display a false state before the real status arrives.

### 3.5 Access refresh clears valid access before revalidation finishes

`src/context/CompanyAccessContext.tsx` currently clears the authenticated company/access snapshot at the start of `refreshAccess()` before loading the replacement snapshot. This is intentionally fail-closed, but it means a background refresh can temporarily remove `activeCompanyId` and permissions from the UI. If a refresh is slow or fails after idle/background browser behavior, the user can see misleading no-access states until reload.

Server/database permission enforcement remains authoritative, so the UI can preserve a last-known-good snapshot while revalidating without weakening server authorization.

### 3.6 Supabase already persists and refreshes auth sessions

`src/lib/supabase.ts` enables `persistSession: true` and `autoRefreshToken: true`. The reliability problem is therefore not solved by adding another login system. The application needs better handling of background-tab recovery, token refresh timing, access refresh, and request retry/state presentation.

### 3.7 Assistant/UI contract mismatch

The Compose page already exposes `Ask Assistant to draft`, which sends a natural-language request into the general Assistant. However, the Assistant tool/prompt contract has no explicit email-draft handoff capability, so it can respond that it cannot draft external emails. The button currently promises a capability the Assistant cannot actually perform.

## 4. Product outcomes

When this phase is complete, a permitted user should be able to:

- open Email/SMS and immediately compose without waiting for repeated Brevo status checks;
- see an always-current preview beside the compose fields on larger screens;
- select individual active company users as recipients;
- select a built-in or custom company role as a recipient group;
- select a project as a recipient group when an authoritative internal project-user relationship exists;
- type external email addresses manually when needed;
- clearly inspect the exact resolved recipient list before confirming a send;
- send one ordinary email or create a private multi-recipient batch;
- have batch recipients receive individual messages so addresses are not exposed to each other;
- see controlled server-side pacing and progress for a batch;
- ask the Assistant to prepare a real email draft and apply that draft back into Compose;
- never have the Assistant send without confirmation;
- switch between Email/SMS tabs without repeatedly rechecking Brevo while the cached result is still fresh;
- return to the app after it has been idle/backgrounded without a false `No access` screen or mandatory F5 reload;
- distinguish `refreshing`, `stale`, `temporarily unavailable`, `not configured`, `forbidden`, and `signed out` states throughout affected surfaces.

## 5. Design approach

### 5.1 Recommended architecture

Use shared server-owned recipient resolution, a shared client runtime-capability cache, last-known-good access during background revalidation, and a durable server-side batch queue.

Do **not** implement recipient groups by loading all membership/project data into the browser and reproducing permission logic client-side. Do **not** implement batch delivery as a browser loop with `setTimeout`, because navigation, sleep, refresh, or browser closure would interrupt it.

The implementation should have five separable units:

1. **Access/session reliability** — preserve valid access while revalidating, recover from background/idle auth, and classify auth/access errors correctly.
2. **Runtime capability cache** — one shared stale-while-revalidate cache for Brevo and other special statuses.
3. **Recipient directory/resolver** — company-scoped users/roles/projects/manual-address resolution with exact recipient snapshots.
4. **Compose/Assistant UX** — live preview, structured drafting, draft/reset behavior, searchable attachments and recipients.
5. **Durable batch delivery/history** — one-message-per-recipient queued delivery with pacing, persistence, progress, safe retry/reconciliation, and grouped history.

These units must communicate through narrow typed interfaces rather than being embedded into one giant `EmailComposePanel`.

## 6. Email Compose UX

### 6.1 Desktop/laptop layout

At normal desktop and laptop widths, Compose should use a split layout:

- **left:** editable message controls;
- **right:** live preview/review.

The preview must update immediately when any of these change:

- To/recipient selection;
- CC in single-message mode;
- subject;
- message body;
- attachment;
- recipient mode (single vs private batch);
- resolved group membership/count.

There is no separate `Preview / Review` button in the primary flow.

The live preview is not permission or send confirmation by itself. A final explicit **Review & Send** / **Confirm Send** action remains mandatory.

### 6.2 Tablet/mobile layout

Do not simply squeeze the desktop columns.

At narrow widths:

- compose fields remain primary;
- live preview becomes a compact sticky/expandable section below the fields or a clear `Preview` segment that updates continuously without another server operation;
- the final confirmation action remains obvious and reachable;
- no horizontal overflow;
- recipient chips wrap cleanly;
- long addresses and attachment names break safely.

### 6.3 Preview truth

The authoring Brevo adapter sends plain text through `textContent`. Until the provider contract deliberately gains HTML support, the preview must reflect the actual plain-text message that will be sent rather than showing a richer format the provider does not send.

The preview should show:

- sender label/address when safe and available;
- exact recipient summary;
- exact resolved recipient count for group/batch sends;
- subject;
- plain-text body preserving line breaks;
- attachment card if present;
- send mode (`Single email` or `Private batch`);
- important warnings/exclusions.

### 6.4 Reset after successful send

For an ordinary single email, once the server/provider returns an accepted/successfully recorded outcome:

- clear To selectors/manual addresses;
- clear CC;
- clear Subject;
- clear Message;
- clear attachment/document selection;
- clear Assistant-generated draft metadata;
- clear recipient-resolution snapshot;
- close final confirmation UI;
- generate a new idempotency/send identity;
- show a compact success result with a `View Sent` action.

Do **not** clear the draft on a rejected, failed, network-ambiguous, or reconciliation-required outcome.

For a batch, reset the composer only after durable batch creation succeeds. The user should then see a compact queued/progress result and a link to the grouped history entry.

### 6.5 Draft preservation during navigation/revalidation

Compose state should survive normal tab switching and access/status background refreshes within the current app session.

Prefer a small `CommunicationsDraftProvider` or equivalent route-persistent state above Email/SMS subviews rather than browser localStorage.

Do not persist message bodies/recipient lists to long-lived browser storage by default. They may contain business-sensitive data. Reload persistence can be a later explicit feature if needed.

Warn before destructive navigation only when the application is about to discard a non-empty unsent draft.

### 6.6 Provider-status presentation

When Brevo is healthy, Compose should not spend a large portion of the page on provider setup.

Show a compact status such as:

`Brevo · Ready · checked 2 min ago`

Only expand setup/error guidance when the provider is not ready or the user explicitly opens Email Setup.

## 7. Recipient directory and resolution

### 7.1 Recipient selector types

The To selector must support:

1. **Individual company users** — active company members with valid email addresses.
2. **Company roles** — built-in and company-defined/custom roles.
3. **Projects** — internal app users explicitly associated with that project.
4. **External addresses** — manually entered email addresses.

The UI should display typed chips rather than flattening everything immediately to strings, for example:

- `Maria Santos`
- `Role: Payroll · 4`
- `Project: Pump Station A · 7`
- `client@example.com`

### 7.2 Internal user scope

Only active company members with usable email addresses are eligible as individual internal recipients.

Pending invitations, revoked/suspended memberships, cross-company memberships, and malformed/missing emails must not silently become recipients.

If a selected group contains ineligible members, the review response should show an exclusion summary such as:

`2 members excluded: 1 inactive, 1 missing valid email.`

Do not expose more membership data than the current user is allowed to see.

### 7.3 Role groups

Role resolution must use the current effective company membership/role data and support both:

- protected built-in starter roles;
- company-defined custom roles.

Do not hardcode only `COMPANY_ADMIN`, `FINANCE`, `PAYROLL`, or `VIEWER`.

### 7.4 Project groups

**Decision for this phase:** selecting a project includes **internal HydroQualiSense users only**. External client/vendor contacts are not automatically included. They remain explicit manual/external recipient selections.

Project recipient membership must come from an authoritative explicit relationship.

Implementation order:

1. inspect the current data model for an existing explicit company-user/company-membership-to-project relation;
2. reuse it if it is genuinely authoritative for application-user project membership;
3. if no such relation exists, add the smallest company-scoped explicit project communication membership relation rather than inferring membership from names, email matching, payroll worker assignments, free-text project-manager fields, or financial activity.

A suitable fallback model is a guarded relation equivalent to:

`company_project_memberships(company_id, project_id, membership_id/user_id, active, created_at, created_by, ...)`

The exact name should follow current repository conventions.

If a new relation is required, provide a minimal management UI from an existing appropriate access/project surface. Do not create an unrelated large project-team subsystem.

### 7.5 Server-owned resolution

Recipient expansion must be performed server-side through a company-scoped resolver.

Input should be typed selectors, not already-trusted raw member lists, e.g. conceptually:

```ts
type RecipientSelector =
  | { kind: "USER"; membershipId: string }
  | { kind: "ROLE"; roleKey: string }
  | { kind: "PROJECT"; projectId: string }
  | { kind: "EXTERNAL"; email: string; name?: string };
```

The server resolves selectors under the current authenticated company and permissions into an exact normalized snapshot:

```ts
interface ResolvedRecipientSnapshot {
  recipients: Array<{ email: string; name?: string; sourceKinds: string[] }>;
  excluded: Array<{ safeLabel: string; reason: string }>;
  recipientCount: number;
  digest: string;
}
```

The exact final recipient addresses recorded with the send/batch must be immutable historical evidence. Later changes to role/project membership must never rewrite who received an earlier message.

### 7.6 Deduplication rules

Normalize emails case-insensitively and deduplicate across user, role, project, and manual selectors.

For ordinary single-message mode:

- if an address appears in both To and CC, keep it in To and remove it from CC;
- preserve a readable source explanation when useful (`selected directly`, `Role: Payroll`, etc.).

For private batch mode, CC is out of scope for v1 (see below) because repeating the same CC on every individual message creates confusing duplicate mail. The UI should disable/clear CC when switching into private batch mode and explain why.

## 8. Single-send vs private batch-send

### 8.1 Single email mode

Use this for one recipient or a deliberately shared To/CC email.

Existing Brevo semantics and idempotency should remain compatible.

### 8.2 Private batch mode

Use this when a user wants the same message delivered to many people without exposing the full recipient list.

The required behavior is:

`one reviewed batch -> N immutable recipient jobs -> one Brevo message per recipient`

Do **not** place all recipients in one To field. Do not rely on BCC as the primary architecture.

Each recipient gets an individual provider request and individual delivery attempt/history evidence, while the UI groups them under one batch.

### 8.3 Controlled pacing

Pacing is meant to avoid bursty provider usage and reduce accidental mass-send behavior. It does **not** guarantee spam-filter avoidance and the UI/documentation must not claim that it does.

Use a bounded server-side configuration with a conservative default. Recommended initial default:

- approximately **5 seconds between recipient jobs**;
- configurable only through server/deployment configuration;
- enforce reasonable minimum/maximum bounds;
- no browser-exposed provider secret or unrestricted client-selected interval.

If Brevo returns throttling/retryable errors, the queue must back off safely rather than hammering the provider.

### 8.4 Batch limits

Use a deliberate bounded recipient limit. A reasonable first release cap is **100 resolved recipients per batch** unless live product constraints indicate a lower existing limit.

The server must reject oversized batches before queue creation, with a clear message.

This cap is a safety/product limit, not a claim about Brevo's maximum account capability.

### 8.5 Durable queue requirement

Do not use a browser `for` loop/`setTimeout` as the source of truth.

The queue must survive:

- Email/SMS tab changes;
- browser navigation;
- browser closure;
- page reload;
- transient server restart.

Use durable database-backed batch and recipient-job records, integrated with existing delivery-intent/history records rather than replacing them.

A suitable conceptual model is:

```text
communication_batches
  id
  company_id
  created_by
  channel
  subject
  message/body snapshot
  attachment/source snapshot reference
  status: PREPARED | QUEUED | PROCESSING | PAUSED | COMPLETED | PARTIAL | FAILED | CANCELLED
  recipient_count
  accepted_count
  failed_count
  unknown_count
  created_at / started_at / completed_at

communication_batch_recipients
  id
  batch_id
  company_id
  recipient_email
  recipient_name
  sequence
  status: PENDING | PROCESSING | ACCEPTED | FAILED | UNKNOWN | CANCELLED
  delivery_attempt_id / delivery_intent_id
  next_attempt_at
  safe_error/status
  provider_message_id where existing history permits
  timestamps / lease fields
```

Exact schema must follow existing delivery/history conventions and avoid duplicate provider-history truth.

### 8.6 Queue processor

Implement a server-owned processor with database locking/lease semantics so two process instances cannot send the same recipient job.

Use the repository's existing server architecture. A lightweight application worker loop is acceptable if it:

- reads only due queued jobs;
- locks/leases rows atomically;
- uses existing idempotency semantics;
- resumes after restart from durable state;
- respects configured pacing;
- stops/backs off safely on provider/system errors;
- never bypasses reconciliation-required handling;
- does not block the request that originally creates the batch until all recipients finish.

If the existing runtime architecture already has an approved job/lease pattern, reuse it rather than inventing another worker framework.

### 8.7 Pause and cancellation

Allow the user to pause or cancel **remaining unsent jobs** when permitted.

Never represent an already accepted/provider-submitted message as cancelled or unsent.

A cancelled batch should therefore distinguish:

- already accepted/sent attempts — retained permanently;
- pending jobs — cancelled;
- unknown/reconciliation-required jobs — retained and reconciled, not blindly retried.

### 8.8 Batch confirmation

Before queue creation, the final confirmation must show at least:

- exact resolved recipient count;
- any exclusions;
- subject/body preview;
- attachment;
- `Private batch: each recipient receives an individual email`;
- pacing explanation;
- warning that provider acceptance is not confirmed final delivery.

## 9. Assistant drafting capability

### 9.1 Goal

`Ask Assistant to draft` must become a real capability rather than a prompt that can be refused because no email tool exists.

Examples that must work:

- `Draft a short email for testing the Brevo email feature.`
- `Draft an email to the Payroll role reminding them about tomorrow's cutoff.`
- `Prepare an email to everyone assigned to Project X that the meeting moved to 2 PM.`
- `Draft an email about this issued PO and suggest attaching it.`

### 9.2 Assistant authority

The Assistant may:

- draft subject/body text;
- propose To/CC recipient selectors it is authorized to see;
- use the recipient resolver to resolve user/role/project intent;
- suggest an eligible attachment from authorized current context;
- produce a structured draft that can be applied to Compose.

The Assistant must not:

- call Brevo send directly;
- create or execute a batch by itself;
- bypass human confirmation;
- expose hidden/inaccessible users, roles, projects, documents, or provider information;
- invent recipients, project membership, or attachments;
- require an attachment for ordinary emails;
- claim an email was sent when it merely prepared a draft.

### 9.3 Structured draft handoff

Add an explicit Assistant draft contract rather than relying on parsing natural-language chat output.

Conceptually:

```ts
interface PreparedEmailDraft {
  recipientSelectors: RecipientSelector[];
  ccSelectors?: RecipientSelector[];
  subject: string;
  message: string;
  suggestedDocument?: { documentType: string; documentId: string; label: string };
  sendMode: "SINGLE" | "PRIVATE_BATCH";
}
```

The Assistant response should render an action/card such as **Use this draft**. Applying it updates Compose state; it does not send.

If the user launched the Assistant from the Compose page through `Ask Assistant to draft`, the handoff may apply automatically only if it is clearly presented as editable draft preparation and still cannot send. Prefer an explicit `Use draft` action if there is any ambiguity.

### 9.4 Assistant tool design

Follow the existing allowlisted tool architecture.

Add narrowly scoped tools/capabilities for:

- searching/resolving eligible communication recipients;
- preparing an email draft/action payload;
- searching eligible attachments when context requires it.

Do not give the Assistant a provider-send tool as part of this phase.

## 10. Sent / Delivery History improvements

### 10.1 Filters/search

Add compact useful filtering for:

- Email / SMS;
- recipient/search text;
- status;
- date range or useful date presets;
- project when history has authoritative project context;
- batch vs single message.

Do not turn the page into a dense admin console.

### 10.2 Batch grouping

A batch should appear as one expandable history group showing progress/summary, for example:

`Payroll reminder · 24 recipients · 20 accepted · 3 failed · 1 needs reconciliation`

Expanding reveals individual immutable recipient attempts.

Do not duplicate or rewrite existing individual delivery history. The batch is grouping/orchestration metadata around those attempts.

### 10.3 Resend behavior

`Prepare new attempt` must create/load a **new** compose draft. It must never mutate an old delivery record.

For batch resends, users should be able to deliberately prepare a new batch for failed recipients only after reconciliation rules permit it. Do not automatically retry `UNKNOWN` outcomes.

## 11. Cross-app access/session reliability

### 11.1 Principle: refreshing is not denial

The application must stop using temporary refresh state as if it were `No access`.

Keep the last verified company/access snapshot while a background refresh is in progress for the same authenticated user/deployment.

Introduce explicit state such as:

```ts
accessStatus: "INITIAL_LOADING" | "READY" | "REFRESHING" | "STALE" | "ERROR" | "SIGNED_OUT" | "FORBIDDEN"
```

Exact naming may follow current conventions.

### 11.2 When access must be cleared immediately

Clear last-known access immediately when:

- user identity changes;
- explicit logout occurs;
- deployment company identity changes incompatibly;
- server confirms the user is no longer an active member/authorized for the deployment;
- a confirmed security/access event requires fail-closed removal.

Do not clear the entire UI merely because a same-user network refresh started.

### 11.3 Realtime permission/membership changes

Realtime membership/permission notifications are more security-sensitive than ordinary periodic/focus refreshes.

When one is received:

- mark access as revalidating;
- do not erase the already-rendered application shell unnecessarily;
- temporarily block new permission-sensitive mutations if needed until revalidation resolves;
- on confirmed revocation/suspension, clear access and show the correct forbidden/signed-out state;
- on transient network failure, show a stale/retry state rather than falsely claiming access is revoked.

Server/RLS/RPC/API authorization remains authoritative throughout.

### 11.4 Idle/background recovery

Add a controlled recovery path for `visibilitychange` / focus after the app has been backgrounded for a meaningful interval.

Recommended behavior:

1. when the document becomes visible after being hidden long enough, obtain/refresh the current Supabase session;
2. if the same user is still authenticated, keep last-good UI access and quietly revalidate company access;
3. refresh stale runtime capabilities in the background according to their TTL;
4. if auth has genuinely expired/revoked and cannot refresh, transition cleanly to sign-in rather than leaving broken partial state.

Debounce focus/visibility events so rapid tab switching does not create request storms.

### 11.5 One-time auth retry for first-party API calls

For authenticated first-party company API requests, if the first request fails specifically because the bearer/session token is stale/expired:

- refresh/re-resolve the Supabase session once;
- retry the request once with the refreshed token;
- never loop retries;
- never retry permission-denied/business-validation/provider errors as if they were auth expiration.

If the retry still fails due to auth, surface a clear session-expired/sign-in state.

### 11.6 Preserve user input

Background auth/access recovery must not remount/destroy working forms unnecessarily.

At minimum verify preservation for:

- Email Compose;
- Supplier Invoice review/edit surfaces;
- Expenses;
- Payroll forms where applicable;
- Documents/template interactions;
- Settings forms where a background refresh can occur.

This does not authorize stale mutations; server checks remain authoritative.

## 12. Shared runtime-capability status cache

### 12.1 Scope

Brevo is the immediate visible problem, but do not solve it with a Brevo-only global variable.

Audit current network-probed special/runtime statuses and move suitable ones behind a shared cache, including where applicable:

- Brevo email provider status;
- SMS provider status;
- company AI runtime capability;
- document-template Storage capability;
- high-fidelity PDF/converter capability;
- other equivalent deployment/runtime capability checks discovered in current code.

Do not cache ordinary business records under this infrastructure unless they are truly runtime-capability/status probes.

### 12.2 Cache behavior

Use **stale-while-revalidate** semantics.

Recommended defaults:

- fresh TTL: **5 minutes**;
- stale result remains displayable while a background revalidation runs;
- manual `Refresh` / `Verify` forces a new check;
- in-flight requests for the same `(company/deployment, capability)` are deduplicated;
- logout/user/company/deployment change invalidates the applicable cache;
- known configuration-changing actions invalidate affected capabilities immediately.

The cache may be in-memory for the authenticated browser session. Do not persist secrets or sensitive provider responses to localStorage.

### 12.3 Never flash fake statuses

Before the first real response, render `Checking…` / unknown instead of pretending the status is `NOT_CONFIGURED` or `CONNECTION_PROBLEM`.

If a previous valid status exists and a refresh fails transiently:

- continue showing the last-known status with a stale/refresh-warning indicator;
- do not downgrade `READY` to `NOT_CONFIGURED` merely because the network request failed;
- do not allow cached UI state to bypass server enforcement.

### 12.4 Shared hook/service

A suitable interface is conceptually:

```ts
useRuntimeCapability("EMAIL_PROVIDER", {
  companyId,
  loader,
  freshForMs: 300_000,
});
```

The returned state should distinguish:

- `value` / last-known data;
- `initialLoading`;
- `refreshing`;
- `stale`;
- `lastCheckedAt`;
- `refreshError`;
- `refresh({ force: true })`.

Do not add a large new state-management dependency only for this feature if a small typed provider/store fits the current architecture.

## 13. Error/state vocabulary

Affected UI must stop conflating unrelated problems.

Use distinct product-facing states for:

- **Signed out** — no authenticated session;
- **Session refreshing** — same user/session is being renewed;
- **Forbidden / No access** — server-confirmed lack of company/permission access;
- **Refreshing access** — last-good access remains visible while being revalidated;
- **Temporary connection problem** — network/provider request failed;
- **Status stale** — last successful capability status is shown while rechecking;
- **Not configured** — server confirms required provider configuration is absent;
- **Provider setup required** — credentials work but sender/provider setup is incomplete;
- **Ready** — provider/runtime is currently verified by the status contract;
- **Unknown/reconciliation required** — send acceptance cannot be safely determined.

Do not use `No access` as a generic loading or request-error message.

## 14. Security and privacy requirements

- All recipient resolution is company-scoped.
- Internal directory results are limited to users the current caller is allowed to use/see for messaging.
- Permission checks must be server-side as well as reflected in UI.
- Custom roles are resolved by the same company role authority used by Access Management.
- Project membership must be explicit; do not infer it from names or unrelated activity.
- External manual addresses are allowed only under the existing outbound send authority.
- Exact resolved recipient addresses are stored as historical send evidence.
- Batch recipients must not learn the addresses of other batch recipients.
- Provider credentials never enter browser-visible cache or Assistant payloads.
- Message body/recipient drafts are not persisted to localStorage by default.
- Assistant tools must not broaden visibility beyond the current user's permissions.
- Database changes for batch/project-recipient relations require RLS/grant/RPC validation and company-isolation tests.
- Unknown provider outcomes remain locked for reconciliation before retry.

## 15. Database expectations

This phase likely requires database changes for durable batching and possibly explicit project-user communication membership.

The implementing agent must inspect current tables/RPCs first and minimize new schema.

If migrations are needed, follow all repository migration rules and validate with real local Supabase/Docker where available:

- clean migration replay;
- pgTAP;
- static migration tests;
- upgrade-path tests;
- company isolation/RLS tests;
- RPC authorization tests;
- idempotency/duplicate-processing tests;
- queue locking/concurrency tests;
- batch lifecycle/cancellation tests;
- migration promotion remains a later operator action and is not implied by implementation/merge.

Do not use static SQL-string tests as a substitute for runtime DB validation when DB contracts change.

## 16. Suggested implementation decomposition

This is one approved product phase, but it is substantial. If one PR becomes too large, split only along these boundaries and keep the sequence explicit.

### Slice A — runtime/session foundation + immediate compose defects

- last-known-good access during same-user revalidation;
- idle/background session recovery;
- one-time auth retry;
- shared runtime-capability cache;
- migrate Brevo and other applicable special statuses;
- live compose preview;
- successful-send reset;
- route-persistent compose draft state.

### Slice B — recipient directory + Assistant drafting

- server recipient directory/resolver;
- individual user selector;
- built-in/custom role groups;
- explicit project membership relation if needed;
- project groups;
- manual external addresses;
- dedupe/exclusion review;
- structured Assistant email draft/action handoff.

### Slice C — durable private batch delivery + history

- batch persistence;
- per-recipient jobs;
- server worker/leases/pacing;
- pause/cancel remaining jobs;
- batch progress;
- grouped history/filtering;
- failed/unknown safe retry/reconciliation behavior.

Do not claim the overall phase complete until all approved outcomes and acceptance criteria below pass.

## 17. Acceptance criteria

### 17.1 Access/session reliability

- Leave an authenticated app tab idle/backgrounded long enough for token/status freshness to change, return to it, and the app does not falsely display `No access` while valid access is merely refreshing.
- Same-user access refresh preserves last-good navigation/content until a replacement snapshot resolves.
- A transient access-refresh network failure produces stale/retry state, not false revocation.
- A real revoked/suspended membership is eventually reflected and blocks access/mutations correctly.
- Session refresh/retry does not create infinite request loops.
- User input on affected forms is not destroyed by background revalidation.

### 17.2 Runtime capability cache

- Compose -> Sent -> Email Setup -> Compose within the 5-minute freshness window does not make redundant Brevo status calls.
- Two components requesting Brevo status simultaneously share one in-flight request.
- Manual Verify/Refresh forces one fresh check.
- A transient failed refresh retains the last-good status as stale rather than flashing `Not configured`.
- User/company/logout changes invalidate the relevant cache.
- Audit confirms other applicable special statuses use the same behavior instead of each implementing independent reload loops.

### 17.3 Compose UX

- Desktop/laptop shows editable fields and live preview side-by-side.
- Mobile/tablet has a usable continuously updated preview without horizontal overflow.
- No separate preview click is required for ordinary composing.
- Final human confirmation remains required.
- Successful accepted send clears the previous email and attachment.
- Failed/unknown send preserves the draft.
- Provider-ready UI is compact.

### 17.4 Recipient selection

- Search/select an active company user.
- Select a built-in role and resolve all eligible active members.
- Select a custom role and resolve eligible members.
- Select a project and resolve only explicitly associated internal app users.
- Manually enter an external recipient.
- Duplicate addresses across selectors are sent only once.
- Inactive/invalid-email members are excluded with a safe explanation.
- Cross-company users/projects/roles cannot be resolved.
- Exact resolved recipients are visible before confirmation and retained in history after later membership changes.

### 17.5 Assistant drafting

- The exact user scenario `help me draft an email for testing purposes of the Brevo email feature. make it short` produces an editable email draft rather than a capability refusal.
- Role-based and project-based drafting works when the user has access.
- No attachment is required for an ordinary email.
- Authorized document context may be suggested as an attachment.
- `Use draft` populates Compose fields/selectors.
- Assistant cannot directly execute Brevo or batch sending.
- Attempting `send it now` still requires normal human confirmation in Compose.

### 17.6 Private batch delivery

- A three-recipient test batch creates three individual provider requests, not one exposed To list.
- Recipient B cannot see recipient A/C addresses.
- Queue continues when the user navigates away from Compose.
- Durable queued rows survive server restart and resume safely.
- Pacing is enforced server-side.
- Duplicate worker/process execution cannot send the same recipient job twice.
- Pause/cancel affects only remaining unsent jobs.
- Accepted/unknown attempts remain immutable and are not falsely cancelled.
- One batch history group expands to exact per-recipient attempts.
- Unknown outcomes cannot be blindly retried.

### 17.7 Regression/security

- Existing single issued PO/client-invoice attachment path still works and retains exact snapshot/template/provenance semantics.
- Existing ordinary email without attachment still works.
- Delivery history remains append-only/immutable as required.
- Existing Brevo status truth remains correct.
- Existing Google identity-only contract remains intact.
- No provider secret is browser-visible.
- RLS/company isolation prevents cross-company recipient/batch/history access.
- Existing financial/payroll/document semantics are unchanged.

## 18. Testing and validation

Follow the live `AGENTS.md` and efficiency guide. Do not run the historical full suite by ritual.

Minimum implementation validation should include:

1. new/edited unit and integration tests;
2. focused Email/SMS/Assistant/access/runtime-capability tests;
3. focused browser tests for compose/live-preview/reset/recipient/batch/history/idle-return flows;
4. `npm.cmd run test:affected:agent`;
5. lint/build/Workflow Map when applicable;
6. responsive browser QA at desktop, constrained laptop, tablet, and phone widths;
7. real local Supabase validation if migrations/RLS/RPC/queue locking are introduced;
8. exact final diff review for permission, company-isolation, provider, idempotency, history, and scope creep;
9. update active roadmap, current handoff, Wave 4D contract/status, and `src/config/productFeatures.ts` only to truthful final product state;
10. feature branch + PR; Codex must not merge its own PR.

For runtime/browser certification, include an idle/background simulation instead of testing only fresh page loads.

## 19. Likely source areas to inspect

This is guidance, not an instruction to edit every file listed. Current code must be inspected first.

Primary current areas include:

- `src/components/EmailComposePanel.tsx`
- `src/components/EmailProviderStatusPanel.tsx`
- `src/components/CommunicationHistoryPanel.tsx`
- `src/lib/documentEmail.ts`
- `src/lib/emailMessaging.ts`
- `src/lib/documentDelivery.ts`
- `src/context/CompanyAccessContext.tsx`
- `src/lib/supabase.ts`
- `src/lib/companyAccess.ts`
- `src/assistant/*`
- `src/server/assistant/*`
- `src/server/messaging/brevoEmailProvider.ts`
- server email send routes/handlers and delivery-intent code discovered from current source
- project/user/membership data contracts discovered from current source
- relevant Supabase migrations/RLS/RPC tests if durable batch/project membership requires DB changes
- Email/SMS browser/visual QA scenarios
- `docs/HYDROQUALISENSE_MESSAGING_DOCUMENTS_WAVE4D.md`
- `docs/HYDROQUALISENSE_ACTIVE_ROADMAP.md`
- `docs/HYDROQUALISENSE_CURRENT_HANDOFF.md`
- `src/config/productFeatures.ts`

Do not use this list to skip repository inspection or assume file names/interfaces remain unchanged.

## 20. Explicit non-goals

Do not expand this phase into:

- Gmail API restoration or inbound mailbox intake;
- a marketing campaign/newsletter platform;
- contact CRM import/synchronization;
- automatic external client/vendor inclusion in project groups;
- HTML/WYSIWYG email design unless separately approved;
- email open/click tracking product analytics;
- arbitrary future scheduling/campaign calendars;
- WhatsApp/Viber implementation;
- a new SMS provider implementation beyond shared status-state infrastructure;
- Worker Registration / Attendance / Face Recognition work;
- unrelated app-wide UI redesign;
- broad financial/payroll/project schema redesign;
- new persistent browser storage of email drafts;
- autonomous Assistant sending.

## 21. Implementation stop boundaries

If the implementing agent discovers any of these conditions, stop broadening the design and report the concrete blocker instead of improvising:

- no safe authoritative way to map app users to projects without a new relation larger than the minimal relation described here;
- current delivery-history schema cannot safely represent batch grouping without a migration;
- current server runtime cannot host a durable leased queue processor without a deliberate deployment/runtime change;
- a required DB concurrency behavior cannot be validated because Docker/local Supabase is unavailable;
- recipient-directory permissions are ambiguous;
- an existing open PR/active implementation already changes the same messaging/access infrastructure;
- Brevo provider behavior required by implementation differs materially from the current tested adapter contract.

The agent should resolve the narrowest blocker or split the phase deliberately rather than using spare time for unrelated work.

## 22. Definition of done

This design is implemented only when the Email/SMS experience is genuinely easier and more reliable in normal use:

- live preview replaces the extra preview click;
- successful sends start a fresh composer;
- users/roles/projects/manual emails are selectable and correctly resolved;
- private batch sending is durable, paced, and auditable;
- Assistant drafting actually works and hands an editable draft to Compose;
- browser idle/background behavior no longer produces false no-access states for valid sessions;
- runtime/provider statuses no longer refetch/flicker on every tab change;
- all affected states distinguish loading/stale/error/forbidden/signed-out truthfully;
- existing permission, company-isolation, provider, document-history, and send-confirmation invariants remain intact;
- documentation and client-facing feature truth match the final implementation.

Until all of those are true, this phase remains incomplete and Worker Registration remains paused under the existing Wave 4D gate.
