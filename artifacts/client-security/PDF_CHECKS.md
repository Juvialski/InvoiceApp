# Client Security PDF Visual Check

Status: **PASS - QUALIFIED LOCAL QA HANDOFF ARTIFACT; HOSTED DEPLOYMENT CERTIFICATION REMAINS SEPARATE**
Checked: 2026-09-15

The PDF was generated from the client-facing source and the exact local
authenticated synthetic-QA screenshot manifest. The source has seven explicit
pages and the output has seven letter-size pages.

Generation:

```text
python scripts/client-security/build_client_security_pdf.py
```

Visual verification:

```text
pdfinfo artifacts/client-security/Hydroqualisense_Client_Security_Overview.pdf
pdftoppm -png -r 150 artifacts/client-security/Hydroqualisense_Client_Security_Overview.pdf artifacts/client-security/pdf-render-final/page
```

Pagewise inspection passed for:

- consistent Hydroqualisense header branding, margins, rules, and page numbers;
- readable role matrix, two custody-model prose, integration notes, and shared-responsibility page;
- one compact 3-column by 2-row role gallery retaining sidebar/navigation context;
- no clipped text, broken page overflow, screenshot crop/editing, or unreadable role labels;
- no secrets, production records, raw provider credentials, migration names, raw permission keys, Git SHAs, or internal agent/CI wording in the client-facing source/output.

Qualification: the role evidence is bound to the local QA harness application
release `ee78e053d7016c67766da719a758d3bd73071c43` and migration
`20260915095911`. The isolated hosted QA release was not promoted, and this PDF
is not a production security certification or a provider-delivery certification.
