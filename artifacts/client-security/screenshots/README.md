# Screenshot evidence status

Current-release role evidence is generated only by:

```text
npx.cmd tsx scripts/client-security/capture_role_screenshots.ts
```

The harness writes these stable synthetic-QA assets when the exact release and
five synthetic accounts pass authenticated navigation assertions:

- `company-admin-navigation-desktop.png`
- `finance-navigation-desktop.png`
- `payroll-navigation-desktop.png`
- `viewer-navigation-desktop.png`
- `custom-restricted-navigation-desktop.png`
- `company-access-custom-role-editor-desktop.png`

The harness also writes `../role-screenshot-manifest.json` with safe role labels,
release identity, observed navigation, deep-link results, and redacted telemetry.
It never records credentials, cookies, user ids, project ids, tokens, or provider
content.

Set `CLIENT_SECURITY_QA_ENV_FILE` to a protected local QA environment file when
the credentials are not already in the process environment. The run requires
`CLIENT_SECURITY_QA_BASE_URL`, `CLIENT_SECURITY_QA_EXPECTED_SHA`,
`CLIENT_SECURITY_QA_EXPECTED_MIGRATION`, `CLIENT_SECURITY_QA_DEPLOYMENT_ID`, and
one email/password pair for each role. Localhost is allowed only with
`CLIENT_SECURITY_QA_ALLOW_LOCAL=1` and the approved QA project guard.

Do not replace these with mock UI, production captures, manually hidden DOM, or
edited image contents. If the exact QA runtime or credentials are unavailable,
leave the assets absent and record the blocker in `EVIDENCE.md`.
