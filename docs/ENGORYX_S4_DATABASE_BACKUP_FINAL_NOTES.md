# Engoryx Wave S4 — Final Database Backup & Growth Notes

Status: **FINAL REVIEWED IMPLEMENTATION RECORD**  
S4 merge commit: `d0aee74b44833fa03c5a6f333985710c2298062f`

This note records the final hardened behavior of Wave S4 after reviewer corrections. If an older S4 implementation paragraph in `ENGORYX_DATABASE_STORAGE_OPTIMIZATION_PLAN.md` or `ENGORYX_STORAGE_CURRENT_STATE_AUDIT.md` conflicts with this note, **this file is authoritative for the shipped S4 behavior**.

## What S4 actually ships

### Database growth work

- schema/query-path analysis without fabricated production statistics;
- composite project/worker/date indexes on `work_entries` where repository query evidence justified them;
- no speculative removal of legacy indexes;
- bounded, company-scoped retention candidate discovery.

### Retention is discovery-only in S4

The supported operator CLI is intentionally non-destructive.

`npm.cmd run db:retention:prune`

runs dry-run candidate discovery. The legacy `--execute` option is rejected.

S4 does **not** authorize automatic deletion of:

- source-document provenance;
- payroll import provenance/source objects;
- financial/audit history;
- object-storage files;
- backup archives.

Reviewed domain retention rules, reference proof, corresponding object cleanup, and deletion execution belong to S5.

The presence of deletion-capable internal service helpers is not an operator contract and must not be surfaced as supported S4 destructive behavior.

## Database backup scope

The production `pg_dump` runner performs an Engoryx application-data logical backup rather than an unrestricted dump of the entire Supabase project.

Current scope:

- `public` schema definitions/data;
- required `private` helper definitions;
- `private` table data excluded.

Ordinary S4 application backups do not explicitly include Supabase-managed `auth`, `storage`, or `vault` schemas.

This intentionally avoids treating service-managed authentication/storage internals and operational secrets as ordinary Engoryx business-data archives.

A restore target must provide the required PostgreSQL/Supabase-compatible dependencies expected by the restored application schema.

## Independent durable storage

Production database backup manifests accept only the durable provider ID:

- `s3`

The intended first destination is independent S3-compatible storage such as Backblaze B2.

Rules:

- provider must be selected explicitly;
- endpoint must be configured explicitly;
- physical bucket must be configured explicitly;
- access key and secret must be configured explicitly;
- no production default bucket is invented;
- memory storage is test-only and is not a valid persisted `database_backup_runs.storage_provider` value.

Database archives remain separate from document-object replica manifests.

## Encryption

Database backups are encrypted with authenticated AES-256-GCM before durable upload.

Envelope identifier:

`ENGORYX_ENC_DB_V1`

The envelope includes a key ID, random per-backup IV, authentication tag, and ciphertext. The encryption key itself is never persisted in the database or backup object and must remain server/operator environment configuration.

Key material and database/storage credentials must not be logged or exposed to client code.

## Backup verification

A run is not `VERIFIED` merely because upload succeeded.

The pipeline checks:

1. logical export success;
2. encryption success;
3. independent object upload success;
4. remote object existence;
5. encrypted byte-size equality;
6. SHA-256 equality of the encrypted archive;
7. durable manifest state.

S3 ETag is not treated as authoritative SHA-256.

## Overlap protection

`database_backup_runs_one_active_per_company_idx` prevents more than one active database backup run per deployment/company across:

- `PENDING`
- `EXPORTING`
- `ENCRYPTING`
- `UPLOADING`
- `VERIFYING`

Historical `VERIFIED` and `FAILED` runs remain allowed.

An abandoned active run may require operator recovery before a new run can start; S5 may add richer stale-run operational tooling if real scheduling evidence justifies it.

## Real restore drill

The supported operator command uses a real `psql` restore runner:

`npm.cmd run db:backup:restore-drill`

Safety requirements:

- `NODE_ENV` must not be `production`;
- `DATABASE_RESTORE_DRILLS_ENABLED=true` is required explicitly;
- an explicit non-production target database is required;
- target and live source are compared by normalized host/port/database identity, not raw connection-string equality;
- credentials and query parameters therefore cannot disguise an equivalent live target.

The restore flow:

1. loads a verified backup manifest;
2. downloads the encrypted archive;
3. verifies encrypted hash/size;
4. decrypts and authenticates the archive;
5. restores via `psql` into the designated non-production database;
6. checks expected application tables;
7. checks representative row counts;
8. verifies RLS on expected protected tables;
9. records the drill result;
10. removes local staging files.

Test-only `MockRestoreRunner` remains available for automated tests. It is not the operator restore implementation.

## Configuration contract

Primary database backup variables include:

- `DATABASE_BACKUP_ENCRYPTION_KEY`
- `DATABASE_BACKUP_KEY_ID`
- `DATABASE_BACKUP_STORAGE_PROVIDER`
- `DATABASE_BACKUP_S3_ENDPOINT`
- `DATABASE_BACKUP_S3_BUCKET`
- `DATABASE_BACKUP_S3_REGION`
- `DATABASE_BACKUP_S3_ACCESS_KEY_ID`
- `DATABASE_BACKUP_S3_SECRET_ACCESS_KEY`
- `DATABASE_RESTORE_DRILLS_ENABLED`
- `DATABASE_RESTORE_TARGET_URL`

Existing S3/B2 backup variables may be reused where the implementation explicitly supports their aliases.

No `VITE_*` variable should contain backup encryption keys, database passwords, or S3/B2 secrets.

## Known S4 limitation

The current storage provider interface buffers encrypted archives during upload/download verification. This keeps S4 implementation bounded but is not an ideal architecture for arbitrarily large future database archives.

If measured archive sizes justify it, future hardening should add streaming/multipart upload, streaming verification, or another bounded-memory provider path.

Do not claim that large-archive streaming is already implemented.

## S5 handoff

S5 owns the operational layer that S4 intentionally leaves conservative:

- backup/storage usage monitoring;
- missing-backup visibility;
- stale/failed backup-run operations;
- reviewed retention policy;
- orphan/reference proof;
- safe cleanup execution;
- recovery documentation and measured RPO/RTO;
- large-archive streaming if needed.
