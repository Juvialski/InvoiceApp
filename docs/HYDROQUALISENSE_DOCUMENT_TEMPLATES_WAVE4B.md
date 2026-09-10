# HydroQualiSense Document Templates — Wave 4B

Status: **ACTIVE — high-fidelity PDF finalization**

Wave 4B extends the existing Wave 4A document path without creating a second document system:

`authoritative issued snapshot -> pinned immutable company template version -> deterministic merged DOCX -> finalized PDF`

The PDF layer is presentation only. Purchase Order and Client Invoice totals, tax treatment, currency, identities, settlement state, and lifecycle history continue to come from the authoritative issued snapshot and existing financial contracts.

## Conversion mechanism

The supported high-fidelity converter is LibreOffice Writer in headless mode. It is an open-source, self-hosted office renderer that can interpret the existing OOXML layout, tables, styles, headers, footers, and variable-length merged rows without sending financial documents to a third-party conversion service.

The current native Node/Render deployment does not install LibreOffice. It therefore reports high-fidelity PDF conversion as unavailable and keeps the existing programmatic PDF action available. A deployment that needs the company-template PDF path must run the reproducible `Dockerfile.document-pdf` image, or explicitly install a compatible LibreOffice Writer runtime and set the server-only `DOCUMENT_PDF_CONVERTER_PATH` value. The application verifies the executable with a bounded `--version` probe; configuration alone is never shown as operational.

The container includes Node 22, LibreOffice Writer, fontconfig, Liberation fonts, and Noto Core fonts. Render must be configured to use this Dockerfile explicitly; adding it does not modify an existing native service or any production infrastructure.

Optional server setting:

```text
DOCUMENT_PDF_CONVERTER_PATH=/usr/bin/soffice
DOCUMENT_PDF_CONVERTER_TIMEOUT_MS=45000
```

The timeout is clamped to a safe server range. The health endpoint exposes only a safe status, converter identity, and sanitized version:

```text
GET /api/health -> documentPdfFinalization
```

## Issued-document behavior

For an issued Purchase Order or Client Invoice with a pinned template:

1. the server loads the company-bound immutable snapshot;
2. it requires the requested template version to equal the snapshot's `template_version_id`;
3. it requires the snapshot `template_sha256` to equal the stored template version hash and verifies the downloaded template bytes;
4. it merges only the existing application-owned allowlisted fields and line collection into the DOCX;
5. it passes that exact merged DOCX byte array to LibreOffice;
6. it stores immutable DOCX source evidence and then PDF evidence only after the PDF is valid and the DOCX source evidence exists.

An unpinned historical snapshot remains on the legacy PDF fallback. The server never attaches a newer template to historical issuance. Cancelled and voided lifecycle rules remain enforced. Gmail delivery remains on its existing trusted PDF/send contract; outbound delivery history is Wave 4C work.

Settings can run the same finalization pipeline with a bounded, non-authoritative demo snapshot. That action does not issue a record or mutate financial data. If the converter is missing, times out, fails, or produces invalid output, the UI reports the limitation and no PDF evidence is created.

## Security boundary

Conversion is server-only. DOCX input remains untrusted after Wave 4A validation. The finalization path:

- rejects macros, unsafe ZIP paths, external relationships, external links, unsupported compression, and unsafe expansion ratios;
- uses fixed filenames inside a random temporary directory;
- invokes `soffice` with `spawn` and `shell:false`, never a shell command string;
- gives LibreOffice an isolated temporary user profile;
- bounds process time, captured process output, and PDF output size;
- validates the final PDF signature and EOF marker;
- removes the temporary directory on both success and failure;
- does not return executable paths, raw converter output, credentials, or provider errors to the browser.

No browser route can write template bytes or forge generation evidence. Company authorization, permissions, RLS, and the service-only evidence RPC remain authoritative.

## Artifact provenance

Wave 4A DOCX evidence remains unchanged in meaning. Wave 4B adds PDF rows to the same evidence table with:

- deployment company, issued snapshot, document type and ID;
- pinned template version and template SHA-256;
- PDF artifact path, provider, bucket, byte size, and SHA-256;
- exact merged DOCX source artifact path, provider, bucket, byte size, and SHA-256;
- originating company user and generation timestamp;
- converter identity and sanitized version.

The database requires a PDF evidence row to reference an existing matching DOCX evidence row for the same company, snapshot, template version, document, source hash, and storage identity. Evidence is append-only through the existing trusted server boundary.

## Fidelity limitations

LibreOffice is the supported self-hosted renderer, not Microsoft Word. Complex Word-only features, uncommon fonts, embedded external content, macros, unsupported fields, and provider-specific rendering differences may not reproduce exactly. External content is rejected rather than fetched. The health/capability check and final PDF validation are deliberately fail-closed; the existing programmatic PDF remains the compatibility fallback.

Wave 4C remains future work for outbound delivery history and any new SMS functionality.
