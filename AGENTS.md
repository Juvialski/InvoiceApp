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

## Validation

Before declaring implementation complete, run the relevant validation available in the repository. Normally include:

```text
npm test
npm run lint
npm run build
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

