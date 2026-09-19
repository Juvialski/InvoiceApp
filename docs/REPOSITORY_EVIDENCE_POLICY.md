# Repository Evidence Policy

This repository distinguishes durable evidence from disposable run output.
Evidence must remain truthful to the exact revision, environment, and scope it
actually covers.

## Track in Git when it is durable

Track an artifact only when it is a reviewed source contract or a durable,
sanitized record required to understand or reproduce an accepted result:

- source, tests, migrations, Workflow Map source, and generated Workflow Map
  outputs;
- client-facing documents and their checked-in source assets;
- sanitized security/client evidence explicitly cited by the security contract,
  such as `artifacts/client-security/EVIDENCE.md`, the role screenshot manifest,
  approved synthetic screenshots, and the qualified PDF;
- durable UI/UX audit reports and sanitized fixture-backed documents explicitly
  referenced by current roadmap or handoff material; and
- small manifests or check summaries whose source and exact scope are clear.

Durable evidence must identify its environment and qualification when that
distinction matters. Local/demo evidence is not hosted/provider/production
certification.

## Keep transient or secret output out of Git

Do not commit:

- `.env*` files except `.env.example`, credentials, tokens, keys, or connection
  strings;
- `.cache/repository-intelligence/` or any other generated RI index cache;
- `dist/`, `coverage/`, temporary render directories, local browser state,
  scratch screenshots, logs, downloads, and local QA output;
- CI run output under ignored `artifacts/<run>` directories unless a reviewed
  durable artifact is deliberately promoted into a documented evidence path;
- customer or production records, unredacted screenshots, or provider payloads.

The root `.gitignore` is the first line of defense. A generated file that is
ignored is not evidence merely because it exists locally.

## Review rule

Before adding evidence, record: exact source/release revision, environment,
whether data is synthetic, the claim it supports, and any blocked or untested
prerequisite. Remove or keep local-only output according to the run’s retention
need; never turn a transient capture into a certification claim by committing
it after the fact.
