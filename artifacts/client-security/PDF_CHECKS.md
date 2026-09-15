# Client Security PDF Visual Check

Status: **NOT GENERATED FOR THIS FOLLOW-UP - exact current-release role evidence is pending**
Checked: 2026-09-15

The client source now contains the two custody models and the required role
evidence references, but the exact branch release is not deployed to the
isolated QA application and its database migration has not been promoted. The
existing QA capture is from the prior release and visibly exposes the Payroll
navigation defect that this branch corrects; it must not be reused as final
client evidence.

The existing PDF remains a qualified pre-follow-up draft and is not a final
client security artifact. Do not regenerate or publish it until the role
screenshots are captured from the exact tested release and every page is
rendered and inspected.

When the prerequisite is available, generate with:

```text
python scripts/client-security/build_client_security_pdf.py
```

Then render all pages with Poppler and record page count, margins, branding,
tables, screenshot readability, no-secret/no-production inspection, and the
final evidence status here.
