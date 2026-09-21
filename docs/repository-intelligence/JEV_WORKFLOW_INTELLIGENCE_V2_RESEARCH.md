# Jev Workflow Intelligence v2A — Research, Calibration, and Integration Design

Status: **NEXT DEVELOPER-TOOLING PHASE — RESEARCH/DESIGN FIRST**
Date: **2026-09-21**

## Purpose

The user has explicitly reprioritized the next implementation run after UX-W5B
to investigate how TypeSafe/Jev can be used more deeply to reduce coding-agent
context/search/review overhead and preserve more model budget for higher-capability
Codex reasoning.

This is a developer-tooling research/design phase. It is **not** a customer
runtime feature and is not a prerequisite for the remaining UX-W5 product work.

Jev remains advisory only. Deterministic Repository Intelligence / Workflow Map,
current source, required tests, database/security/financial/lifecycle reasoning,
browser/database evidence, exact-head CI, and Codex lead review remain
authoritative.

## Why v2A is needed

The existing Jev integration proved useful but also exposed concrete limits:

- the broader benchmark reduced 40 candidates to 18 with 100% must-keep
  retention and 90% expected-relevant retention;
- UX-W5A proved the real live path through the repository CLI;
- UX-W5B start/context produced 0 deterministic candidates / 0 selected on a
  clean baseline, so there was nothing meaningful for Jev to rank;
- UX-W5B deterministic affected selection produced 75 required tests, but the
  single-request Jev test triage fell back with `sanitizer-rejected`;
- the current context reranker falls back when candidate count exceeds 64;
- the TypeSafe sanitizer caps one payload at 20,000 characters;
- completion checking is currently coarse evidence-category checking rather
  than requirement-by-requirement proof.

The next phase should research and calibrate solutions instead of simply
raising limits or adding more calls.

## Mandatory research sources

### 1. X.com — authenticated read-only research

Codex may use the user's already-authenticated Chrome session to browse and
search X.com.

This access is **read-only**:

- do not post, reply, quote, like, repost, follow/unfollow, DM, bookmark, or
  change account settings;
- do not inspect, export, copy, or expose cookies, session tokens, credentials,
  local-storage secrets, or browser authentication material;
- do not send private repository/customer data to X;
- record useful public post URLs, handles, dates, and concise paraphrases;
- distinguish official TypeSafe/Jev posts from community experiments and
  personal claims.

Suggested searches include:

- `Jev TypeSafe`
- `"System One" TypeSafe`
- `Jev coding agent`
- `Jev Codex`
- `Jev Claude Code`
- `TypeSafe AI agents`
- `Jev reranking`
- `Jev code review`
- `Jev tests`
- `Jev CI`
- `Jev routing`
- `Jev cascade`
- `Jev calibration`
- `Jev eval`

### 2. Official TypeSafe sources

Inspect the current official TypeSafe site, blog, SDK source/docs, skills,
cookbooks/examples, and any current official agent guidance.

Prefer official source for SDK semantics, limits, pricing/model behavior, and
recommended judgment patterns.

### 3. Community source implementations

Inspect source, not only marketing claims, for promising Jev/System-One
patterns. Candidate areas include judgment decomposition, reranking, routing,
verification/cascade patterns, calibration/evals, confidence thresholds,
decision theory, agent skills, and cost/latency instrumentation.

Do not install unreviewed community code globally. Treat community code as
research material until reviewed.

## Research questions

Build evidence for whether Jev can improve these workflow stages:

1. phase scope/coherence shaping;
2. multi-axis context relevance and authority-risk ranking;
3. chunked candidate processing instead of >64 full fallback;
4. useful candidate seeding when clean-baseline RI returns zero candidates;
5. mid-implementation changed-diff adjacency scans;
6. missed-file / missed-contract detection;
7. scope-creep detection;
8. architecture/risk preflight;
9. richer test prioritization and diagnostic ordering;
10. payload-safe test chunking for broad affected sets;
11. test-failure localization;
12. changed-file review-risk ordering;
13. requirement-to-diff mapping;
14. requirement-level completion/evidence checking;
15. documentation-drift detection;
16. browser/visual-QA scenario prioritization using sanitized scenario metadata;
17. CI failure classification plus likely diff-relatedness and first
    investigation target;
18. bounded subagent-delegation candidate scoring;
19. model-effort routing/advice for when higher-capability Codex reasoning is
    worth spending;
20. Jev-verified cascades / confidence-aware escalation while keeping policy and
    side effects in deterministic code.

## Evaluation and calibration

Do not assume the current generic 0.5 threshold is optimal.

Design a labeled historical replay using representative merged InvoiceApp PRs.
Use only sanitized repository metadata appropriate for TypeSafe.

For each replay, compare Jev judgments against known outcomes such as:

- actual changed files;
- files that review corrections later showed were important;
- affected tests that directly diagnosed the change;
- database/browser/provider evidence actually required;
- final scope boundaries;
- missed or unnecessary context.

Track at minimum:

- relevant-file recall;
- must-keep retention;
- optional-context reduction;
- false-negative rate;
- authority-boundary misses;
- test-priority usefulness;
- request count;
- input/output tokens;
- latency;
- fallback reason;
- estimated Jev cost.

Start with a bounded representative sample rather than replaying repository
history indiscriminately. Expand only if additional samples materially change
the conclusions.

## Controlled live experiments

The user has substantial unused free Jev credit and explicitly wants meaningful
experimentation rather than artificial minimum-call usage.

It is acceptable for this research phase to make multiple controlled live Jev
requests when they answer distinct research questions.

Prefer batching independent judgments that share the same state. Do not waste
credit on duplicate prompts or repeated equivalent calls.

A reasonable initial envelope is roughly 15-30 useful live research/evaluation
requests, but evidence quality—not hitting a request target—is the objective.

Every experiment should record:

- task/use case;
- deterministic input/candidate source;
- question/judgment type;
- candidate count;
- selected/ranked result;
- model;
- input/output tokens;
- latency;
- fallback;
- useful/not-useful assessment;
- any safety/authority concern.

## Candidate v2B integration design

v2A should end with a prioritized implementation plan rather than automatically
shipping every idea.

Likely high-value candidates to evaluate include:

- deterministic chunking for context/test sets that exceed safe payload limits;
- multi-axis context scoring instead of one binary keep/omit judgment;
- clean-baseline task-seeded context candidates;
- post-diff adjacency/missed-file scan;
- changed-file review-risk ordering;
- richer test-triage scoring;
- requirement-level completion matrix;
- sanitized Jev effectiveness ledger;
- confidence-aware escalation rules.

Do not implement broad production/runtime behavior in v2A. Small isolated
developer-tooling experiment harnesses are allowed when required to obtain real
measurements, provided they remain offline-by-default and do not enter the
application bundle or normal CI.

## Non-authority boundaries

Jev must not decide:

- merge safety;
- architecture/source-of-truth authority;
- financial/accounting semantics;
- VAT/withholding/FX;
- RBAC/RLS/security policy;
- migrations or database safety;
- inventory movement truth;
- Equipment assignment/transfer/lifecycle truth;
- payroll authority/privacy;
- whether a required deterministic test may be skipped;
- whether browser/database/provider evidence is unnecessary;
- production actions.

It may only prioritize, classify, flag, rank, or surface uncertainty for the
lead to investigate.

## Required v2A deliverables

1. durable research report with sourced X/official/community findings;
2. use-case matrix with expected value, input/output shape, authority risk,
   fallback, latency/cost considerations, and recommended disposition;
3. experiment/calibration results with raw aggregate metrics but no secrets;
4. explicit findings for the UX-W5B zero-context and sanitizer-rejected test
   triage cases;
5. prioritized v2B implementation plan;
6. recommendation for how many Jev checkpoints/judgments a typical small,
   medium, and wider coherent Codex phase should use;
7. recommendation for model-effort routing without letting Jev make the final
   model or safety decision;
8. roadmap/handoff synchronization.

Stop after the research/design boundary. Do not use spare time to begin another
UX-W5 product domain or the 3D explorer.
