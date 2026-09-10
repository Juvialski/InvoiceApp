# ChatGPT Migration Operator Policy

Status: **ACTIVE when referenced by `AGENTS.md`**

This policy defines when ChatGPT may perform database migration promotion for HydroQualiSense through connected Supabase tooling. It exists to remove unnecessary operator-terminal steps while preserving exact-target, migration-history, client-isolation, and production-safety guarantees.

## Core authority

ChatGPT may act as a migration operator when the user asks it to migrate, promote, deploy, fix, finalize, certify, or otherwise carry forward an environment and the requested action clearly includes database promotion.

### QA

During an explicitly authorized QA certification/release session, QA writes are authorized. ChatGPT may directly promote missing canonical repository migrations to the configured QA Supabase project without asking the user to run local CLI commands.

Before any QA migration write, ChatGPT must:

1. re-read the exact current `main` and canonical repository migration head;
2. identify the exact QA Supabase project and verify it is not any configured production project;
3. inspect live QA migration history and refuse divergent or remote-only history unless a deliberate repair is separately justified;
4. ensure the intended application SHA is live first when the migration/app contract requires exact-SHA ordering;
5. apply only the missing committed forward migration(s), in canonical order;
6. preserve the canonical repository migration version/name in Supabase migration history;
7. independently re-read migration history and verify parity after the write;
8. run the relevant database/RPC/security/runtime checks and Hosted QA when the release contract requires them.

The repository `qa:db:push` wrapper remains the normal CI/CLI implementation. In protected GitHub Actions it uses the fixed QA Supabase Session Pooler plus the QA database password, so normal promotion does not depend on Supabase Management API project linking or a personal access token. Linked CLI mode remains available for deliberate local/bootstrap operations. A connected ChatGPT Supabase operation is an equally authorized operator path only when it preserves the same target and canonical-history guarantees.

## Canonical-history rule for connected Supabase tooling

The current Supabase MCP `apply_migration` operation generates its own server-side timestamp and does not accept the existing repository migration version. Therefore ChatGPT must **not** use it to promote an already-committed timestamped migration when doing so would create a remote-only migration version and break `supabase db push` parity.

For an already-committed migration, use a connected mechanism that records the exact canonical repository version. If the available connected tool cannot do that directly, ChatGPT may use an atomic, pre-validated database transaction that:

- executes the exact SQL from the committed migration file without alteration; and
- records that same canonical version/name in `supabase_migrations.schema_migrations` using the live table contract already present in the target.

Before using that fallback, inspect the migration-history table shape and the exact prior row format. The schema change and history record must succeed or fail as one transaction. Never invent a new migration version merely to make the connector convenient.

Do not use raw SQL for speculative schema development under this exception. It exists only to faithfully promote an already-reviewed, already-committed canonical migration when the connected migration API cannot preserve its version.

## Production

ChatGPT may perform production migration writes only when the user explicitly authorizes production promotion, identifies the intended production deployment/client/fleet, or gives an unambiguous instruction such as `promote Client A production` or `promote the approved production fleet`.

A QA success, a merge to `main`, a Render deploy, a generic PR review, or a request to check production does **not** by itself authorize a production write.

Before any production migration write, ChatGPT must:

1. identify the exact Render/deployment-to-Supabase mapping for every intended client;
2. verify the target is not QA and is exactly the approved client project;
3. verify current repository SHA, migration head, live database history, and required recovery/backup prerequisites;
4. scope writes only to the explicitly authorized production deployment(s);
5. apply missing committed migrations in canonical order while preserving canonical migration history;
6. independently verify parity, application health, and relevant security/data-integrity contracts;
7. stop that target on any safety, migration, history, backup, or compatibility blocker instead of broadening the write.

Production promotion must never silently expand from one client to all clients. A fleet-wide promotion requires an explicit fleet instruction.

## Preferred execution order

For an individual deployment:

`approved release -> exact app SHA live when required -> inspect migration history -> guarded migration promotion -> independent parity verification -> hosted/runtime verification -> release evidence`

For future production fleet tooling, each client remains an isolated release target with its own Render service, Supabase project, migration state, failure boundary, and evidence.

## Failure behavior

If the connected tools cannot preserve canonical migration history or cannot prove the exact target, stop at that exact blocker. Do not make the user run a terminal command merely by habit, but do not trade migration-history correctness or client isolation for convenience.

Never expose database passwords, access tokens, service-role/secret keys, AI credentials, or other secret values in chat, logs, repository files, migration evidence, or deployment inventory.