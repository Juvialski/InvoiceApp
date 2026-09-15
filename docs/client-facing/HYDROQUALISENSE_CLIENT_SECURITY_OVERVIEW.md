# Hydroqualisense Security Overview

**A simple guide for your team**
**Prepared:** 2026-09-15

> This is a qualified handoff draft. The current app changes are ready for the next QA check, but the final database and authenticated QA verification is still pending. The screenshots below are real synthetic QA captures; they show the app interface, not proof that this new role feature has already passed the final QA check.

## 1. Your data and your team

Hydroqualisense helps your team manage projects, money, documents, payroll, and communications in one place.

Your company controls:

- who can sign in;
- what each person can see and do;
- which actions need a higher level of approval;
- the accounts and secrets connected to your deployment.

Access changes are recorded so your team can review what changed and when.

<!-- PAGEBREAK -->

## 2. Access that fits the way you work

Hydroqualisense starts with four ready-to-use roles:

| Role | Simple description |
| --- | --- |
| Company Admin | Looks after company settings and access |
| Finance | Works with invoices, expenses, vendors, and financial work |
| Payroll | Works with people, payroll, and payroll reports |
| Viewer | Can look at permitted information but cannot manage it |

You are not limited to those four roles. A Company Admin can create a role that fits your own team - for example, a Project Manager or Procurement Reviewer - and choose only the areas that person needs.

Names are for people. Access is decided by the permissions behind the role. Special company and platform administration stays protected.

### Real app example - synthetic QA

This is an actual Hydroqualisense Settings workspace using synthetic QA data. The custom-role editor still needs its current-release QA capture before this overview can be finalized.

![Real Settings workspace from synthetic QA](artifacts/ui-ux-round2-final-certification/screenshots/settings-desktop-1440-viewport.png)

<!-- PAGEBREAK -->

## 3. How access stays safe

Your deployment is set up for one client company. People only see company information after they sign in and have active access.

The app checks access in more than one place:

- the screen hides actions a person should not use;
- the server checks the request again;
- the database checks the company and permission before allowing protected work;
- access changes and important business history remain reviewable.

A custom role belongs to one company. It cannot be used to give access to another company. An old or retired role stops granting access.

The financial, document, payroll, and provider records you already use keep their own source and history rules.

<!-- PAGEBREAK -->

## 4. Email, AI, and SMS

### Email

Gmail access is handled through the server. Sign-in details and provider credentials are not kept as ordinary browser data.

### AI and files

AI credentials and private file access are handled on the server. A setup screen never treats a missing provider or converter as ready.

### SMS

The app supports two approved choices:

- Company SIM Gateway - the recommended option when the company wants to use its own SIM;
- PhilSMS - an optional hosted fallback.

In this handoff, SMS is shown honestly as **not configured**. No message was sent as part of this work.

### Real app example - synthetic QA

This is an actual Email / SMS status screen from synthetic QA. It shows the useful user-facing state: the provider is not configured, so the app does not pretend that delivery is ready.

![Real Email and SMS status screen from synthetic QA](artifacts/ui-ux-round2-final-certification/screenshots/sms-status-desktop-1440-full.png)

<!-- PAGEBREAK -->

## 5. After handoff

The client should control the production accounts that hold client data:

- Supabase and database access;
- Render and production secrets;
- Auth and Storage administration;
- Google, Gmail, AI, and SMS/provider accounts;
- Company Admin membership and role setup.

The developer can continue to maintain the shared software and deliver reviewed updates. Routine support should use QA and synthetic data instead of standing access to confidential production records.

The intended handoff promise is:

> **No standing developer/operator access to the client's confidential production data after completed handoff.**

If an unusual incident requires direct access, the client should approve it for that incident, keep it narrow and time-limited, record it, and remove it afterward.

<!-- PAGEBREAK -->

## 6. What is checked, and what remains

### Checked in this handoff

- the access workflow has been extended to support company-defined roles;
- protected access cannot be selected through the normal custom-role path;
- role and member changes are recorded for review;
- focused application tests, lint, build, and workflow checks pass;
- no production data or production credentials were used.

### Still needed before a final client version

- run the database checks in the guarded QA environment;
- test the new role workflow with synthetic users;
- capture the current-release Company access and custom-role screens;
- complete the client account-custody checklist.

This overview makes no compliance certification claim. It does not promise zero risk, a backup or recovery time, a retention period, or a provider delivery guarantee. The supporting evidence matrix is maintained separately for the operator and reviewer.
