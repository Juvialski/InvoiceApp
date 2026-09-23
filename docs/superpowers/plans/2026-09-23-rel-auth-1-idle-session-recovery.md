# REL-AUTH-1 Idle Session & Deployment Access Recovery Implementation Plan

> **For agentic workers:** Use `superpowers:executing-plans` to implement this plan task-by-task in the current Codex session.

**Goal:** Keep a valid same-user workspace available through bounded idle-session and deployment-access revalidation, while distinguishing true session expiry and confirmed access loss.

**Architecture:** Put deterministic refresh outcomes and resume-event throttling in small testable helpers. The React provider remains responsible for Supabase/Auth events and applies helper results only when the generation and user still match. Server/RLS/RPC checks remain authoritative for every mutation.

**Tech Stack:** TypeScript, React, Supabase JS, Node `node:test` with `tsx`.

**Spec:** `docs/superpowers/specs/2026-09-16-email-messaging-session-reliability-design.md`, sections 11 and 13; bounded acceptance is further specified in `docs/HYDROQUALISENSE_ACTIVE_ROADMAP.md` under REL-AUTH-1.

## Global Constraints

- Preserve the last confirmed ready snapshot only for the same authenticated user and deployment.
- Clear privileged client access immediately on logout, user change, confirmed denial, or confirmed deployment mismatch.
- Refresh/retry authentication at most once per request; deduplicate concurrent refreshes by user identity.
- A technical verification failure is not a confirmed membership revocation.
- No database, RLS, RPC, provider, payroll, or UI-R4E scope is authorized here.
- The idle-resume trigger is visibility/focus based, throttled, and covered with bounded simulated time.
- Keep forms mounted during safe same-user refresh; do not let cached access authorize mutations.

## Review Focus

1. A successful authoritative access response that removes membership must clear all permissions; covered by revoked/inactive-company tests.
2. A delayed refresh for a previous generation/user must not overwrite current access; covered by out-of-order result tests.
3. A refresh-token network failure must retain ready access, while an invalid refresh session must reach sign-in with expiry copy; covered by distinct error-classification tests.
4. A burst of visibility and focus events must not create repeated refreshes; covered by a controlled lifecycle-target test.
5. A renewed session for another user must never be accepted as the old user's retry; covered by identity-mismatch isolation tests.

---

### Task 1: Testable access/session recovery boundary

**Files:**
- Modify `src/lib/authenticatedRequestRecovery.ts` to expose user-keyed shared refresh-session work and retain the existing one-retry request contract.
- Create `src/lib/companyAccessRecovery.ts` for one bounded access revalidation attempt, one same-user auth refresh/retry after auth-specific failure, transient-vs-expired classification, and safe outcome values.
- Test `tests/authenticatedRequestRecovery.test.ts` and create `tests/companyAccessRecovery.test.ts`.

**Interfaces:**
- `refreshAccessTokenSingleFlight(userId, refresh)` shares one access-token refresh for the same user and never shares across users.
- `revalidateDeploymentCompanyAccess({ userId, loadAccess, loadDeploymentCompanyId, refreshAccessToken, getSession, knownDeploymentCompanyId })` returns `resolved`, `transient-failure`, `session-expired`, `identity-changed`, or `deployment-mismatch`.

- [x] Write behavior tests for refresh deduplication by user, access-load refresh/retry once, transient failure, terminal expiry, and successful revocation/inactive-company/permission-change results.
- [x] Run the focused tests and confirm the missing behavior fails for the intended assertion.
- [x] Implement the narrow helper and shared refresh function.
- [x] Run focused tests and confirm recovery, one-retry bounds, and identity isolation pass.

### Task 2: Provider session and idle/resume integration

**Files:**
- Modify `src/context/CompanyAccessContext.tsx` to apply typed outcomes under existing generation/user guards, revalidate after visibility/focus return, and track session-expired state.
- Modify `src/lib/companyAccessRefresh.ts` or add a focused lifecycle helper used by the provider.
- Test `tests/companyAccessRefresh.test.ts` and `tests/companyAccessRecovery.test.ts`.

**Interfaces:**
- Same-user auth token changes preserve the ready snapshot.
- Visibility/focus after a meaningful hidden interval runs session resolution then access revalidation; rapid duplicate events coalesce and throttle.
- Logout/user change invalidates immediately; late access results are ignored.

- [x] Write behavioral tests for ready-snapshot preservation, resumed valid session, transient resume failure/recovery, different-user transition, logout, out-of-order response rejection, and event-storm bounds.
- [x] Run the focused tests and verify they fail against current transitions.
- [x] Wire the helper and session refresh into `CompanyAccessProvider` without changing ordinary route lifecycle or mutation authorization.
- [x] Run focused tests and verify preserved identity/content state and fail-closed outcomes.

### Task 3: Truthful access and authentication presentation

**Files:**
- Modify `src/App.tsx` to keep ready content mounted with a compact stale/reconnecting notice, show a technical verification-retry state when there is no ready snapshot, and route true expiry to sign-in.
- Modify `src/components/access/AccessStates.tsx` for a retryable technical verification state.
- Modify `src/components/auth/AuthScreen.tsx` for `Your session expired. Sign in again.` notice.
- Test the relevant access presentation and auth props through existing focused component/browser coverage.

- [x] Write tests for technical error vs confirmed `NoCompanyAccess`, stale-ready notice without workspace replacement, and session-expired copy.
- [x] Run tests to verify the current presentation conflation is caught.
- [x] Implement only these reliability states; do not alter shell identity, navigation, export, sync, account placement, dark theme, or R4E layout.
- [x] Run focused presentation tests and a bounded fake Document/Window visibility, blur, and focus simulation. No live authenticated browser session was configured for an end-to-end workspace scenario.

### Task 4: Evidence, documentation, and delivery

**Files:**
- Update `docs/HYDROQUALISENSE_ACTIVE_ROADMAP.md` and `docs/HYDROQUALISENSE_CURRENT_HANDOFF.md` to the proven final state.

- [x] Run new/edited tests and focused auth/access/session tests (67/67 pass), `npm.cmd run test:affected:agent` (237/238 pass; one unrelated unchanged Settings-copy assertion), lint/typecheck, and build. Do not run `test:full` by ritual.
- [ ] Inspect the full final diff for stale-user inheritance, authorization weakening, retry storms, truthful expiry/revocation, user-work preservation, and R4E scope creep.
- [x] Run one Jev completion checkpoint; it found all four declared evidence categories and retained unresolved uncertainty for the affected-suite assertion and unavailable live-auth browser evidence.
- [ ] Commit and push the focused branch, then open a review PR without merging it.
