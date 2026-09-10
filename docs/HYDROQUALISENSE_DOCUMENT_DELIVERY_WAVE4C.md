# HydroQualiSense Outbound Document Delivery — Wave 4C

Status: **COMPLETE FOUNDATION — EXTENDED BY THE ACTIVE WAVE 4D WORKSPACE**

Wave 4C established the issued-document Gmail sender and durable send-intent/audit contract for `PURCHASE_ORDER` and `CLIENT_INVOICE`. The active Wave 4D workspace extends those same intent/audit tables with an audited `GENERAL_EMAIL` shape for ordinary messages; it does not create a second document or delivery system.

## Delivery path

`authoritative issued snapshot -> pinned immutable template version -> deterministic merged DOCX -> finalized company-template PDF when the converter is operational -> Gmail attachment -> durable intent and audit history`

When the snapshot is historically unpinned, the deployment converter is unavailable, or the document is on the legacy path, the server-rendered programmatic issued PDF remains the compatibility fallback. A configured template version is never silently replaced with another version. If a configured template cannot be safely finalized while the converter is available, the send fails safely rather than switching presentation paths without evidence.

The send intent stores the exact PDF SHA-256 and the database derives the attachment source from trusted PDF generation evidence. Company-template sends retain the matching PDF artifact, merged DOCX source, template hash/version, storage identity, size, and converter identity/version. Fallback sends retain the immutable snapshot and exact server-rendered PDF hash without inventing a template artifact.

## History and resend boundary

The communications workspace and normal Purchase Order/Client Invoice document experience show company-scoped delivery history with channel, recipients, sender label, timestamp, status, safe wording, optional attachment name/hash identity, and company-template versus fallback source. Raw provider errors, access tokens, credentials, filesystem/converter paths, and other sensitive implementation metadata are not returned to the browser.

One idempotency key represents one delivery attempt. Network retries and double-clicks reuse that key and cannot create another Gmail delivery. A deliberate resend opens an explicit confirmation flow with a new key and therefore creates a separate durable attempt/history event. PENDING, UNKNOWN, or incomplete audit states remain locked until reconciliation; no blind resend is offered when Gmail may already have accepted the message.

## Authorization and lifecycle

- New sends require dedicated `documents.send` authority plus the document-specific read permission.
- History visibility follows `procurement.read` for Purchase Orders and `projects.read` for Client Invoices.
- Send intents and audits are company-bound, append-only from the browser, and populated through guarded server/RPC paths.
- Cancelled Purchase Orders and voided Client Invoices remain historical records but cannot receive a new delivery.
- Closed Purchase Orders follow the existing issued-document eligibility rules.
- No financial, payable, receivable, collection, settlement, or project-cost truth is created or changed.

## SMS boundary

No approved, configured SMS provider exists for outbound delivery in this repository. Existing Auth configuration and future provider references are not an operational SMS provider. Wave 4D keeps the channel model provider-neutral and does not add credentials, hard-coded vendor behavior, delivery guarantees, campaigns, bulk messaging, or an Available SMS claim. A future provider must use the same company-scoped attempt/history and permission boundaries.

## Readiness boundary

QA certification remains **NOT READY**. Local migration replay, pgTAP, upgrade-path, focused application tests, lint, build, and targeted demo/browser evidence are phase validation; they do not certify a hosted deployment or authorize production migration/data writes.
