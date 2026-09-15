# Client Security PDF Visual Check

Checked: 2026-09-15
Artifact: `Hydroqualisense_Client_Security_Overview.pdf`

- Page count: 6
- Page size: US Letter
- Branding/header/footer: visually checked on every page
- Tables: starter-role and verification-state tables fit within margins
- Callouts: readable and within page bounds
- Text overflow/clipping: none observed
- Screenshots: two real synthetic QA interface captures included; current-release custom-role capture remains pending
- Unsupported certification claims: none included
- Production data/secrets: none used

The rendered page PNGs used for this check are temporary QA artifacts and are not
client evidence. Regenerate the PDF with:

```text
python scripts/client-security/build_client_security_pdf.py
```
