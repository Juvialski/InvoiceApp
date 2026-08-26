# InvoiceApp Codex Project Rules

These instructions apply only to this repository.

## Repository freshness

Before any repository implementation work:

- Inspect the current branch.
- Inspect the current HEAD.
- Inspect recent commits.
- Inspect working-tree status.
- Use the current codebase rather than relying on an older conversation snapshot.

Never overwrite newer work because a prompt references an older commit.

## Subagent concurrency — hard limit

Codex may use a maximum of two concurrent subagents.

Never create three or more concurrent agents. If more than two workstreams exist, process them in waves.

Preferred structure:

- Agent 1 owns one cohesive group of files or features.
- Agent 2 owns another cohesive group of files or features.
- The lead owns architecture, shared integration files, conflict-heavy files such as `App.tsx`, migrations affecting multiple workstreams, final regression review, validation, and final handoff.

Reuse agents sequentially for later workstreams instead of creating additional concurrent agents.

## Subagent model — Luna only

Every subagent must use Luna at the highest thinking/reasoning level available for Luna in the current environment.

Never spawn Terra, Sol, Opus, Gemini, another model, an automatic fallback model, or a default non-Luna subagent.

Before spawning a subagent, verify that the selected model is Luna. If Luna is unavailable, unsupported, capacity-limited, or fails model validation, do not substitute another model; reuse an available Luna agent sequentially or have the lead perform the work.

## Git and push safety

Before repository work, inspect the branch, HEAD, working tree, and origin.

Codex may fetch or pull when permitted, create branches, edit files, run commands and validation, stage changes, and create commits.

For remote publishing:

1. Prefer an authorized, verified native GitHub integration when available.
2. Do not repeatedly attempt shell `git push` when the environment reports an unverified destination, sensitive egress, auto-review denial, network or policy restriction, or a private repository destination blocked by sandbox policy.
3. If remote push is not clearly permitted, finish the implementation, run validation, stage changes, create the local commit, verify the working tree is clean, report the branch and final commit SHA, give the user the exact manual push command, and stop.
4. Do not retry a policy-blocked push.
5. Never bypass auto-review, sandbox restrictions, network security, or credential protection.
6. Never force-push unless the user explicitly requests it and it is safe.

A blocked remote push does not mean implementation failed when implementation is complete, validation passed, a local commit exists, and the working tree is clean. Report: “Implementation complete and committed locally; remote push requires manual handoff.”

## Branch safety

Do not create unnecessary branches for small routine work.

For high-risk changes such as multi-tenancy, RLS or security redesign, destructive database migrations, major payroll history changes, or authentication and authorization architecture, use a dedicated feature branch when appropriate.

Never rewrite Git history unnecessarily, force-push by default, delete production history, or merge a critical security branch automatically unless the user explicitly requests it.

## Database and financial-history safety

InvoiceApp contains financial and payroll data. Never destructively modify approved or finalized historical data merely to simplify implementation.

Protect:

- Verified invoice history.
- Invoice extraction snapshots.
- Review history.
- Approved payroll.
- Paid payroll.
- Locked payroll periods.
- Historical payroll entries.
- Project cost allocations.
- Committed import provenance.

Migrations should be additive, backfilled, and preserve financial meaning whenever possible.

## Applied migration immutability

Once a migration has successfully reached a shared or protected Supabase environment (such as production main or staging), do not edit it in place. Always resolve schema corrections, index updates, or data fixes with a new additive migration.

Exception: A migration that has never successfully applied anywhere and is currently the failing unapplied deployment blocker may be corrected in place only after confirming that the failed transaction rolled back completely and no partial objects remain.

## Validation

Before declaring implementation complete, run the relevant validation available in the repository. Normally include:

```text
npm test
npm run lint
npm run build
npm run test:migrations
```

Do not claim a command passed if it was not run successfully. If a validation command cannot be run because of environment restrictions, state that clearly.

## Final implementation handoff

For substantial implementation tasks, report:

- Starting SHA.
- Branch.
- Final commit SHA.
- Major changes.
- Migrations added.
- Tests added.
- Test result.
- Lint result.
- Build result.
- Remaining manual or deployment steps.
- Whether remote push succeeded or requires manual handoff.

If subagents were used, also report the number of subagents, Luna model and tier, visible reasoning level, and confirmation that no non-Luna subagent was created.

## Verified local execution / agent runbook

This section contains the exact verified commands and procedures for this Windows PowerShell environment. Future agents MUST use these commands FIRST to avoid failing on PowerShell script execution policies.

### Environment

- **OS / Shell**: Windows 11 / PowerShell (`pwsh` / `powershell.exe`).
- **Executable Resolution**: Plain `npm` and `npx` resolve to `npm.ps1` and `npx.ps1`, which fail with `PSSecurityException: UnauthorizedAccess` because PowerShell script execution is restricted.
- **Mandatory Suffix**: Always use `npm.cmd` and `npx.cmd` in PowerShell tool commands (e.g., `npm.cmd test`, `npx.cmd tsx server.ts`).

### Development server

- **Working Directory**: `c:\Users\Al\Documents\InvoiceApp`
- **Command**: `npx.cmd tsx server.ts` (or `npm.cmd run dev`)
- **Execution Mode**: Run as a daemon / background support process (`IsDaemon: true`, `WaitMsBeforeAsync: 3000`).
- **Port**: Default is `3000` (from `PORT || 3000`), listening on `http://0.0.0.0:3000`.
- **Readiness Check**: Verify server readiness with `fetch("http://localhost:3000/")` or checking for the startup message `Sales Invoice Workspace running at http://0.0.0.0:3000`.
- **Reuse Existing Server**: Before spawning a new dev server, check if port 3000 is already active or if a background task is running.

### Tests

- **Full Suite**:
  ```text
  npm.cmd test
  ```
  or directly via Node:
  ```text
  node --test --experimental-strip-types tests/*.test.ts
  ```
- **Targeted Test (Single File)**:
  ```text
  node --test --experimental-strip-types tests/<test-file-name>.test.ts
  ```
  Example:
  ```text
  node --test --experimental-strip-types tests/cashBanking.test.ts
  ```
- **Targeted Pattern (Glob)**:
  ```text
  node --test --experimental-strip-types tests/payroll*.test.ts
  ```
- *Note*: This repository uses the Node.js native test runner (`node:test`). Do not supply Jest or Vitest flags (such as `--run`, `--watch=false`, or `-t`).

### Validation

- **Lint / Typecheck**:
  ```text
  npm.cmd run lint
  ```
  (Runs `tsc --noEmit`)
- **Build**:
  ```text
  npm.cmd run build
  ```
  (Runs `vite build && esbuild server.ts --bundle --platform=node --format=cjs --packages=external --sourcemap --outfile=dist/server.cjs`)
- **Database Migration Validation**:
  ```text
  npm.cmd run test:migrations
  ```
  Runs Phase 1 static invariants (naming safety, monotonic timestamp order, grow-only check constraint allowlists) and attempts Phase 2 live database replay/upgrades if local Supabase or PostgreSQL is available.

### Database migration testing procedures

1. **Local Pre-push Migration Test**:
   ```powershell
   npm.cmd run test:migrations
   ```
2. **Local Supabase Startup (Requires Docker)**:
   ```powershell
   npx.cmd supabase start
   ```
3. **Clean Migration Replay / Reset**:
   ```powershell
   npx.cmd supabase db reset
   ```
4. **Database Schema & Invariants Assertions (pgTAP)**:
   ```powershell
   npx.cmd supabase test db
   ```
5. **Upgrade-Path Suite with Historical Seed Rows**:
   ```powershell
   npx.cmd tsx scripts/test-migration-upgrade.ts
   ```
6. **Required GitHub Actions Check**:
   - `Database Migrations & Upgrade Suite` (defined in `.github/workflows/database-tests.yml`). This check should be marked as **REQUIRED** in repository branch protection for `main`.

### Known command pitfalls

1. **`npm: PSSecurityException`**: Plain `npm` calls `npm.ps1`. Always use `npm.cmd`.
2. **`npx: PSSecurityException`**: Plain `npx` calls `npx.ps1`. Always use `npx.cmd`.
3. **Line Endings in Regex**: On Windows, files may be checked out with CRLF (`\r\n`). Tests inspecting source files should use `\r?\n` or `\s+` rather than raw `\n`.
4. **Dev Server is Long-Running**: Do not treat dev server processes as failed simply because they do not exit immediately; launch them with `IsDaemon: true`.

## Anti-retry guidance

Never retry an unchanged failed command blindly.

After any command fails:
1. Read the actual error message and exit code.
2. Identify whether the cause is command syntax, executable resolution (e.g. `.cmd` missing), shell behavior, working directory, environment, process lifecycle, port/readiness, or source code.
3. Make one informed, targeted retry.

## Repository learning rule

`AGENTS.md` is the repository's persistent operational memory.

If a future agent discovers that a documented execution command or procedure is obsolete:
1. Verify the replacement command successfully;
2. Determine why the old instruction no longer applies;
3. Update `AGENTS.md` in the same implementation session;
4. Mention the update in the final handoff report.

Do not persist transient sandbox, network, provider, or one-off failures as permanent repository rules.

