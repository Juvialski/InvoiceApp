# Supabase + Gmail setup

This build is intentionally ready for a **fresh Supabase project**. The app stays usable in local/demo mode before the project is connected.

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

## 2. Apply the included database migration

Run this file in the new project's SQL editor or through your normal Supabase migration workflow:

```text
supabase/migrations/20260822150000_invoice_operations_foundation.sql
```

It creates:

- `gmail_sync_state`
- `email_messages`
- `source_documents`
- `vendors`
- `invoices`
- `invoice_line_items`
- `invoice_extractions`
- `invoice_review_events`
- private `invoice-originals` Storage bucket
- private `email-originals` Storage bucket

It also enables basic per-user RLS and explicit authenticated Data API grants. This is only the baseline ownership model; a later security phase can add organizations, team roles, admin review, retention policies, etc.

## 3. Configure Google in Supabase Auth

In the Supabase dashboard:

1. Open **Authentication → Providers → Google**.
2. Enable Google.
3. Add the Google OAuth Client ID and Client Secret from your Google Cloud project.
4. Add your app URL to the Supabase Auth redirect allow list.

For local development also allow your localhost URL.

## 4. Configure Google Cloud for Gmail

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
```

The app requests Gmail **read-only** permission. Users must authorize their own mailbox; typing somebody else's email address does not grant access.

The redirect URI registered in Google should include the callback Supabase provides for the Google provider, normally in this form:

```text
https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback
```

Use the exact callback shown by your Supabase project rather than guessing it.

## 5. Gemini secret

Keep the existing server-side secret:

```env
GEMINI_API_KEY=...
```

The default extraction/classification model is `gemini-3.5-flash-lite` with `gemini-3.7-flash` as fallback/accuracy mode.

## 6. Test the end-to-end flow

1. Open the app.
2. Go to **Gmail Inbox**.
3. Click **Connect Google + Gmail**.
4. Grant read-only Gmail permission.
5. Choose a scan window and click **Scan likely invoice emails**.
6. Gemini classifies the candidates.
7. Click **Import & extract** on an invoice-like email.
8. Confirm the original raw email appears in `email-originals`.
9. Confirm all attachments appear in `invoice-originals`.
10. Open the generated invoice from **Review Queue**.
11. Compare **Original document**, **Source email**, and **AI vs human**.
12. Edit a value, then click **Verify**.
13. Confirm the invoice's working data changes while the `invoice_extractions` snapshot stays unchanged and `invoice_review_events` records the review.

## Sync behavior

The first scan stores Gmail's latest history ID in `gmail_sync_state`. **Sync new** then uses Gmail history changes instead of rescanning the whole mailbox. If Gmail reports that the history cursor is too old, the API tells the UI to perform a fresh scan.

This version intentionally uses user-triggered sync rather than background Gmail push notifications. That keeps the first Supabase/Gmail release easier to test and debug. Gmail push/PubSub can be added after the core workflow is stable.
