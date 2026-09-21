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

---

# v2A findings and evidence (2026-09-21)

This section records the completed research/calibration evidence for the v2A
phase. The original phase contract above is retained as the requirements
history; this section is the durable result. All external research was
read-only. All Jev experiment state was synthetic, path/category metadata only.

## Scope and exact repository state

- Base `main` SHA: `b62273e4f19e066c9a6d8cb30d9686a56f0c0938`.
- Working branch: `codex/jev-workflow-intelligence-v2a-research`.
- The first deterministic `agent:context` attempt for TypeSafe developer paths
  failed before Jev with `No workflow nodes matched` because the Workflow Map
  has no developer-tooling node for `scripts/developer-intelligence/typesafe/*`.
- A live context checkpoint was then run once after the plan file made the
  branch dirty: RI status was `stale-fallback`, one changed plan candidate was
  retained, model `jev-1.13.0`, 457 input tokens, 21 output tokens, 737 ms,
  fallback false. This is not a clean-baseline result and is recorded as a
  stale-fallback diagnostic, not as evidence that task seeding is solved.
- The clean UX-W5B evidence remains the authoritative historical baseline:
  deterministic candidates `0`, Jev-selected candidates `0`, fallback false
  with missing model/token/latency fields. The current code explains why: task
  queries are conjunctive, Workflow Map selection is bounded, and developer
  tooling is not represented as a Workflow Map node. No Jev judgment can create
  a candidate universe that deterministic RI did not provide.

## Source ledger

### X.com: authenticated read-only review

Five public search result pages and direct post/thread views were reviewed in
the user's already-authenticated Chrome session. No post, reply, like, repost,
bookmark, follow, DM, setting, profile, cookie, token, or local-storage action
was performed. The retained material below is concise paraphrase only.

| Source | Class/date | Finding | InvoiceApp implication | Confidence |
|---|---|---|---|---|
| [@typesafeai availability post](https://x.com/typesafeai/status/2101786156572823624) | Official, Sep 21 2026 | TypeSafe announced Jev access without a waitlist. | Runtime availability may change independently of the SDK; record model/provider evidence per run. | High for the post, not a guarantee of account limits. |
| [@typesafeai launch post](https://x.com/typesafeai/status/2099944756931596454) | Official, Sep 16 2026 | TypeSafe announced Jev/System One and repeated speed/cost positioning. | Treat vendor speed/cost claims as hypotheses; use our own latency/token ledger. | High as a vendor claim, not independent proof. |
| [@typesafeai structured-decision quote](https://x.com/typesafeai/status/2101097027174309926) | Official, Sep 19 2026 | The product framing is typed decisions/probabilities that code branches on, not text generation. | Fits narrow advisory ranking, classification, and evidence checks; never use it to generate source or execute actions. | High. |
| [@typesafeai launch-blog pointer](https://x.com/typesafeai/status/2099969256914145707) | Official, Sep 16 2026 | The launch materials point developers to the System One model explanation. | Official blog/SDK evidence is stronger than short social claims. | High. |
| [@typesafeai Vercel quote](https://x.com/typesafeai/status/2101490102866493522) | Official, Sep 20 2026 | Jev was made available through a gateway promotion. | Gateways change provider/limits/cost; direct TypeSafe remains the measured InvoiceApp path. | Medium for operational portability. |
| [@miu21590 Codex router post](https://x.com/miu21590/status/2101857866378362926) | Community, Sep 21 2026 | A user described using Jev to adapt Codex model/reasoning effort during a task and claimed lower cost. | Supports researching advisory complexity profiles, but no autonomous model choice; the post is not a controlled benchmark. | Low/medium; self-report. |
| [@albfresco caching reply](https://x.com/albfresco/status/2101877673232310275) | Community reply, Sep 21 2026 | A reply challenged the claim that adaptive routing preserves caching. | Treat prompt-cache preservation as an empirical invariant; do not infer it from routing logic. | Low/medium; useful warning, unverified. |
| [@catmanyau escalation reply](https://x.com/catmanyau/status/2101878939610137038) | Community reply, Sep 21 2026 | Suggested capped escalation only after a measurable stall or failed check. | Matches fail-open/fallback and bounded escalation design. | Low/medium; design idea, not benchmark. |
| [OpenRouter latency/accuracy thread](https://x.com/OpenRouter/status/2101412965765529853) and [accuracy post](https://x.com/OpenRouter/status/2101412983297778130) | Independent provider, Sep 20 2026 | Reported Jev median latency 154 ms and 98.5% on one 200-case classification set. | Useful external comparison, but task/provider-specific and not a substitute for InvoiceApp labels. | Medium; provider-published. |
| [@goan999999 Codex integration post](https://x.com/goan999999/status/2101657121746198981) | Community, Sep 19 2026 | Claimed large token-quota savings and linked a list of Jev projects. | Supports looking for routing patterns; the claim is not a reproducible InvoiceApp result. | Low/medium. |
| [@Pluvio9yte implementation checklist](https://x.com/Pluvio9yte/status/2101831273224311035) | Community, Sep 21 2026 | Pointed to browser-use's Jev-ultrafast project and operation/element selection. | Supports structured action heads plus independent outcome verification, not free-form agent control. | Medium because source code was inspected. |
| [@Frozune Codex autorouter post](https://x.com/Frozune/status/2101346920992039415) | Community, Sep 20 2026 | Linked a Jev-based model/effort autorouter. | Candidate for research only; no authority to change the user-selected model or safety posture. | Low/medium. |
| [@neural_avb determinism critique](https://x.com/neural_avb/status/2101736546391244854) | Community, Sep 21 2026 | Raised concerns about repeated probabilities and choice ordering. | Justifies repeated-run variance checks and model pinning; do not assume probability stability. | Low/medium; the claim is unverified here. |

X conclusion: the useful signal is not a single performance claim. It is the
repeated community pattern of bounded decisions, fallback/abstention, staged
escalation, and local evaluation—alongside repeated warnings that typed output
does not guarantee semantic correctness or stable calibration in a new domain.

### Official TypeSafe sources

- [Introducing System One Models & Jev](https://typesafe.ai/blog/introducing-system-one-models-and-jev): official launch description, explicit caveats about workflow-evaluation reference models, parallel independent questions, and a two-stage score-then-choice approach for high-cardinality choices.
- [TypeSafe homepage](https://typesafe.ai/): official product positioning around typed decisions, confidence, thresholds, and review escalation. Its pricing/speed numbers are vendor claims, not InvoiceApp evidence.
- [Official JavaScript SDK](https://github.com/typesafe-ai/typesafe-sdk-js): current package surface matches the installed `@typesafe-ai/sdk@0.6.0`; `TypeSafeClient.systemOne` accepts structured state and named `noul`, `choice`, and `score` questions, with typed answers, usage, model, timeout, retry, and request options.
- [Official TypeSafe agent skills](https://github.com/typesafe-ai/skills): confirms the intended workflow is question design/composition in code, not free-text generation.
- [Official workflow evals](https://evals.typesafe.ai/): the official evaluation framing explicitly decomposes work into narrow questions and keeps policy in code. This supports v2B decomposition, but the site also assumes the harness is correct and uses large-model reference labels.

Official capability conclusions:

1. `noul` is appropriate for independent yes/no conditions and returns a
   probability; it is not a confidence field.
2. `choice` is appropriate for one option among a finite set and returns a
   distribution plus confidence; it cannot select an omitted value, so a
   `none` option is required for safe seeding/routing.
3. `score` is appropriate for an ordered rubric; raw probabilities/legend and
   the expected score must be retained together. A generic `0.5` cutoff is
   not portable across primitives or domains.
4. Independent questions over one shared state are the main batching win.
   Independent candidates with different state must fan out or be chunked.
5. Typed output prevents shape/type errors, not wrong valid judgments. The
   surrounding deterministic policy remains the authority.

### Community source-code review

- [jev-harness-router](https://github.com/JoacoMarc/jev-harness-router):
  isolates the network in one module, pins `jev-1.13.0` for calibration,
  uses a calibrated deadline/no-retry path, prewarms, caches late results,
  keeps a deterministic heuristic baseline, stores pure `answers -> policy`,
  and sweeps thresholds on labeled fixtures. Its source explicitly warns not
  to inherit fixtures, thresholds, or deadlines without local evaluation.
- [typesafe-jev-examples](https://github.com/rajivkuriakose/typesafe-jev-examples):
  demonstrates one shared-state/many-question batching versus one-question per
  candidate fan-out, uses `noul` for binary relevance, preserves a `none`
  choice, and sets higher thresholds for consequential branches. Its report
  honestly handles ranking ties and distinguishes a demonstration from a
  benchmark.
- [browser-use/jev-ultrafast](https://github.com/browser-use/jev-ultrafast):
  builds a dynamic indexed action space, asks Jev to choose only among
  observed operation/target heads, keeps text generation separate, validates
  the answer, checks page freshness/occlusion, and independently verifies the
  outcome. Model output never becomes a selector, coordinate, shell command,
  or JavaScript payload.
- [jev-mcp](https://github.com/jkudish/jev-mcp):
  exposes bounded relevance, diff review, test-gap, blast-radius, and evidence
  checks, but explicitly keeps thresholds as starting points and says typed
  output is not truth. This is a good shape for an advisory evidence ledger,
  not a merge gate.
- [jev-agent-skill-router](https://github.com/GodsBoy/jev-agent-skill-router):
  includes an abstain path and clearly labels its synthetic evaluation as not
  production quality, not a calibration study, and not an execution test.
  It also warns that confidence is conditional on the retained candidate set.
- [Awesome Jev](https://github.com/valentynkit/awesome-jev-typesafe):
  provided the discovery map for current community projects and caveats;
  entries were treated as leads only, not as evidence until source/README
  behavior was inspected.

Community conclusion: the strongest reusable pattern is
`deterministic retrieval -> bounded Jev judgments -> deterministic policy ->
fallback/abstention -> labeled replay`. No community project justifies
letting Jev choose InvoiceApp source-of-truth authority, required tests,
production actions, or security policy.

## Current implementation findings

### Clean-baseline zero candidates

`buildTypesafeContextCommand` derives candidates from current changed paths,
exact file selectors, Workflow Map inspection files, curated node mappings, and
RI query matches. With a clean branch and a developer-tooling task that has no
Workflow Map node, all deterministic sources can be empty. `rerankContextCandidates`
correctly returns an empty non-fallback result, but this is not a useful Jev
judgment. The correct v2B fix is deterministic task-seeded candidate discovery:
add a developer-tooling seed catalog/path scope or an explicit exact-file/domain
selector before Jev runs. Jev may rank the seeded universe; it may not invent
paths.

### 64-candidate ceiling

The current reranker returns all candidates with `sanitizer-rejected` when the
candidate count exceeds 64. This is a policy shortcut, not an API measurement.
The v2B design should chunk deterministically, preserve must-keep candidates in
the union, and optionally run a bounded tournament/second pass. A failed chunk
must fail open to that chunk's deterministic candidates; it must never erase
required context.

### 20,000-character sanitizer cap and safe question names

The sanitizer rejects serialized payloads over 20,000 characters and rejects
credential-like keys/patterns. The experiment discovered that a semantically
safe synthetic key such as `c0_authority` is rejected as `sensitive-pattern`
because the key regex intentionally matches authorization-like words. The
sanitizer was not weakened. Experiment field IDs must use safe neutral names
such as `c0_boundary` while the question text describes authority risk.

With the four-axis file shape (relevance, boundary, validation, review risk),
serialized request sizes were:

| Candidate count | Serialized size | Result |
|---:|---:|---|
| 8 | 12,303 chars | accepted |
| 10 | 15,346 chars | accepted |
| 12 | 18,406 chars | accepted |
| 15 | over 20,000 chars | rejected |
| 20 | over 20,000 chars | rejected |

The practical v2B default for this shape is ten candidates per chunk, with a
size estimator and smaller chunks when summaries/question text are longer.

### 75-test sanitizer rejection

The current `testTriage.ts` creates one Score question per required test and
sends the full set through `invokeTypeSafe`. A synthetic 75-test selection
rejected with `sanitizer-rejected` before a gateway call; the question map,
not only the test paths/reasons, crosses the cap. The deterministic fallback
retained all 75 required tests. A bounded test chunk of 20 succeeded in live
experiments with about 2,529 input / 294 output tokens; four chunks covered 75
tests with no fallback. v2B should make chunking and required-test union
deterministic rather than raise the cap.

## Controlled live Jev experiments

The API key was present but never printed. All payloads contained synthetic
paths, test names, evidence labels, and task metadata. Live model was
`jev-1.13.0` for every successful call.

### Request ledger

| Batch | Requests | Success/fallback | Input tokens | Output tokens | Latency summary | Finding |
|---|---:|---:|---:|---:|---|---|
| Clean context checkpoint | 1 | 1/0 | 457 | 21 | 737 ms | Dirty-plan candidate retained through RI stale fallback; not a clean-baseline proof. |
| Initial shape sweep | 23 | 10/13 | 18,099 | 3,659 | Successful calls 275–772 ms; 13 sanitizer rejects | Multi-axis keys/payloads and adjacency shape were too large or hit sensitive-key detection; compact CI/completion/complexity/visual/mapping shapes succeeded. |
| Compact multi-axis/chunk recovery | 13 | 13/0 | 48,107 | 8,727 | 256–926 ms; p50 854 ms; p95 902 ms | Three repeats, eight ten-candidate chunks, one 12-candidate tournament, and adjacency all succeeded. |
| Historical labeled replay | 10 | 9/1 | 8,971 | 1,243 | Successful calls 260–705 ms | One sanitizer rejection on the Gmail/auth fixture; raw Jev missed some must-keep/relevant paths. |
| Completion/evidence checkpoint | 1 | 1/0 | 561 | 55 | 697 ms | Advisory evidence check found all declared categories present but preserved uncertainty from the known full-suite limitation. |
| **Total** | **48** | **34/14** | **76,195** | **13,705** | | Approx. published direct-rate input cost: `$0.0032` at $0.042/M input tokens; output is listed as free by TypeSafe. |

The 14 fallbacks were sanitizer rejections, not API outages. This is evidence
for deterministic payload shaping and field-name linting, not permission to
weaken the sanitizer.

### Multi-axis and chunking results

- A compact ten-candidate request carried 40 independent questions (four axes
  per candidate) and succeeded at approximately 4,004–4,035 input and 714
  output tokens per request.
- Three repeated compact requests returned broadly stable ordering for the
  synthetic fixture: the two marked task-relevant candidates scored around
  0.79–0.83 relevance while unrelated candidates were around 0.26–0.32.
  This is directional synthetic evidence only, not calibration.
- Eight ten-candidate chunks covered all 75 candidates exactly once; every
  chunk succeeded. A twelve-candidate final tournament request also succeeded.
- The tournament shape is useful for v2B only if deterministic code retains
  every must-keep path and records the chunk-level evidence; Jev cannot be
  trusted to recover a candidate omitted by the chunker.

### Test triage results

Four deterministic chunks (20, 20, 20, 15 tests) covered all 75 required
tests. All four succeeded. The 20-test shape cost about 2,529 input / 294
output tokens, and the 15-test shape about 1,964 / 219. Required-test
retention remains deterministic and complete regardless of Jev ordering.

### Other shapes

- Eight requirement-level completion Nouls succeeded at 1,006 input / 140
  output tokens and returned low evidence-sufficiency probabilities for the
  deliberately incomplete synthetic evidence.
- Eight complexity-axis Scores succeeded at 632 / 116 tokens.
- A CI classification Choice plus three Nouls succeeded at 458 / 159 and
  selected the sanitizer boundary as the first investigation target.
- Twelve visual-priority Scores succeeded at 1,377 / 174; this is metadata
  prioritization only, not visual inspection.
- Eight requirement-to-path Choices succeeded at 3,864 / 1,793. The high
  output is a reason to prefer smaller/typed mapping questions or Noul
  presence checks where a full path Choice is unnecessary.

## Historical labeled replay

The sample contains ten exact merged commits: #158 finance/database
settlement, #161 shared UI, #167 provider/auth, #171 security/RLS, #173
provider migration, #199 Repository Intelligence, #202 finance workbook, #204
shared worksheet foundation, #216 browser/visual, and #219 inventory/equipment.
Git-derived changed-file/test counts are preserved in the fixture module; only
path/category/evidence metadata was sent to Jev.

Offline evaluator guardrail: selecting only the two must-keep paths per fixture
retains 100% of must-keep paths but only 51.3% of labeled relevant paths while
reducing the synthetic candidate set by 74.7%. This is the required proof that
context reduction is not success when recall falls.

The live one-pass replay produced:

- 10 requests; 9 succeeded and 1 fell back with `sanitizer-rejected`.
- 8,971 input / 1,243 output tokens.
- Raw thresholded selection: 0.850 mean relevant recall and 0.850 mean
  must-keep retention.
- Deterministic union of must-keep paths: 0.925 mean relevant recall.
- The PR-216 visual fixture recovered its must-keep path through the union;
  PR-161 still retained only 3/4 labeled relevant paths. The PR-167 fixture
  fell back because its synthetic task wording contained `authorization
  recovery`, which matched the sanitizer's bearer/authorization pattern.

Calibration conclusion: v2B must measure raw Jev ranking and deterministic
protected-union behavior separately. The union is a safety rule, not a model
quality score. No threshold is accepted merely because it improves reduction.

## Use-case matrix

The matrix uses these disposition codes: **B** = implement in v2B behind a
deterministic fallback; **E** = experiment further with labeled data; **D** =
defer/reject for now. Every row is advisory only. `state` means sanitized
paths/symbol IDs/categories/test names/evidence labels, never source contents or
customer/runtime data.

| # | Use case | Deterministic input / sanitized state | Judgment, batchability, output | Fallback, risk, value/cost | Disposition |
|---:|---|---|---|---|---|
| 1 | Task/phase coherence | Task brief, domain, explicit scope, forbidden domains | 3–5 Scores/Nouls over one state; one request | Return deterministic scope/risk profile; high scope risk; cheap relative to a model turn | B |
| 2 | Context candidate relevance | RI/Workflow Map candidate metadata | Noul per candidate; batch same state, chunk at safe size | Keep all must-keep on failure; medium token cost; direct context saving | B |
| 3 | Authority-risk relevance | Candidate kind, curated/source-derived labels, boundary categories | Noul per candidate, safe key such as `boundary`; batch with relevance | Deterministic authority files always retained; high risk if omitted | B, gated |
| 4 | Validation relevance | Test/source/evidence metadata | Score per candidate; batch same state | Required tests remain required; useful ordering only | B |
| 5 | Clean-baseline candidate seeding | Task/domain/file/path seed catalog | Choice with explicit `none`, then deterministic path expansion | If no seed, direct source inspection; high false-negative risk | B, deterministic first |
| 6 | Large candidate-set chunking | Ordered RI candidate list with must-keep flags | 8–12 candidate multi-axis chunks + deterministic union/tournament | Failed chunk returns that chunk; avoids >64 fallback; moderate calls | B |
| 7 | Mid-implementation adjacency scan | Changed paths + RI/Workflow Map neighbors | 2 Nouls per neighbor, batch/chunk | Lead inspects flagged neighbors; never adds arbitrary paths | B |
| 8 | Missed-file detection | Deterministic changed files, imports, tests, docs | Noul “missing adjacent evidence” per bounded candidate | Fallback is unchanged deterministic set; high review risk | B |
| 9 | Missed-contract detection | Route/permission/invariant/history boundary metadata | Noul boundary relevance; batch same state | Curated contracts stay protected; high risk | B, gated |
| 10 | Scope-creep detection | Requested scope, changed path categories, forbidden domains | Choice/ Nouls for in/out/uncertain | Deterministic forbidden-path check blocks; low cost | B |
| 11 | Architecture/risk preflight | Domain, coupling, DB/security/financial/lifecycle flags | Multi-axis Scores/Nouls; one state | Human/Codex owns architecture; false reassurance risk | E then B |
| 12 | Changed-file review ordering | Changed file metadata, ownership, boundaries, tests | Score review priority; batch | Stable lexical/diff order fallback; good token saving | B |
| 13 | Test prioritization | Deterministic required tests + reasons | Score per test; chunks of about 20 on current prompt | Required union retained; measured 75-test fix; high value | B |
| 14 | Test diagnostic power | Test name/category/reason, changed behavior label | Score diagnostic power separately from directness | Deterministic reasons remain visible; medium cost | E |
| 15 | Test-failure localization | Sanitized failure headline, changed files, test categories | Choice first target + Nouls related/transient | Existing deterministic category fallback; no skipped tests | B |
| 16 | Broad-test-set chunking | Ordered required tests and reason metadata | Bounded Score chunks; deterministic merge/order | Chunk failure returns all required tests; low-to-medium cost | B |
| 17 | CI failure classification | Sanitized excerpt/command/category | Choice closed category | Existing deterministic classifier is authoritative; low cost | B (already scaffolded) |
| 18 | CI diff-relatedness | Failure category + changed-file metadata | Noul relatedness | Never suppress a required check; medium risk | E |
| 19 | Likely transient/flaky failure | Sanitized failure markers and runner metadata | Noul transient plus deterministic marker rules | Never rerun blindly; high CI-triage risk | E |
| 20 | First investigation target | Failure excerpt + allowed investigation targets | Choice among finite targets | Deterministic first target fallback; useful live result | B |
| 21 | Requirement-to-diff mapping | Acceptance criteria + candidate paths/symbol categories | Choice per criterion with `none`, or Nouls for presence | No invented paths; high evidence value | B |
| 22 | Requirement-to-test mapping | Criteria + deterministic test names/reasons | Noul/Choice per criterion | Required tests remain required; medium cost | B |
| 23 | Completion/evidence checking | Criterion, implementation/test/browser/DB/provider/docs labels | Noul per criterion; one shared state | Deterministic missing-evidence matrix remains final; high value | B |
| 24 | Documentation drift detection | Capability/status claims + roadmap/handoff headings | Noul per claim or Choice drift type | Docs review fallback; low cost | B |
| 25 | Browser/Demo QA scenario prioritization | Route/component/viewport/state/protected/consequential flags | Score per scenario; batch metadata only | Human screenshot inspection authoritative; low risk | B |
| 26 | Manual screenshot review ordering | Screenshot metadata and previous severity, no pixels | Score review priority | Never call it visual PASS; no image replacement | B |
| 27 | Subagent delegation suitability | Task breadth/coupling/shared files/risk categories | Score suitability + Noul conflict risk | Zero subagents default; lead decides | D for automatic dispatch; E for advisory |
| 28 | Model-effort routing | Breadth, coupling, DB/security/financial/lifecycle/evidence axes | Scores in one request; deterministic policy maps to advice | Jev cannot choose/downgrade model; high safety risk | E then B |
| 29 | Confidence-aware escalation | Typed answer probabilities/confidence + consequence class | Deterministic thresholds over raw signals | Human/strong-model escalation; tune per domain | B after calibration |
| 30 | Jev-verified cascades | Cheap result + claim/evidence metadata | Noul verification then deterministic escalation | Never let Jev clear an authority boundary alone | E |
| 31 | PR claim/evidence verification | Claims, changed files, tests, evidence labels | Noul per claim; completion matrix | No merge decision; strong evidence surfacing | B |
| 32 | Release-evidence prioritization | Exact SHA, changed risk domain, required QA/provider evidence | Score inspection priority only | Exact-head CI and release gates remain authoritative | B |

## Recommended checkpoint workflow

### Small phase

Use one deterministic context packet and one Jev context judgment only when the
packet has a non-empty, task-seeded candidate universe. Use completion/evidence
checking before PR when the phase has more than one evidence class. Skip test
triage below roughly 15 deterministic tests. Expected Jev calls: **1–2**.

### Normal coherent phase

Use one deterministic context packet, one bounded multi-axis context pass, one
test-triage pass only when the required set is broad (chunk at about 20 tests
with the current question shape), and one completion/evidence pass. Add one
mid-diff adjacency pass after meaningful implementation when shared contracts
or review risk justify it. Expected Jev calls: **3–5**, with a deterministic
fallback for every checkpoint.

### Wider coherent phase

Keep the deterministic candidate universe bounded first. Use ten-candidate
multi-axis chunks for the current four-axis shape, union all must-keep paths,
then use one bounded tournament pass over finalists. Chunk broad tests at about
20 and union all required tests. Use one completion/evidence pass and one
adjacency pass; do not add repeated “just to see” calls. Expected Jev calls:
**6–15** depending on chunk count. More than that belongs to deliberate
research/calibration, not routine implementation.

Jev request count changes phase sizing, not authority. A coherent wider phase
is preferable only when its candidate universe, source-of-truth boundary, and
validation surface are genuinely shared.

## Model-effort routing recommendation

v2B may produce an advisory complexity profile with these deterministic input
axes: breadth, integration coupling, database involvement, security
involvement, financial authority, lifecycle sensitivity, shared-component
breadth, and browser/evidence burden. Jev can score the axes and surface
uncertainty. Deterministic code may then present a recommendation such as
`routine`, `normal`, or `higher-capability` to the lead/user.

Jev must not autonomously select a Codex model, change reasoning effort, lower
the user's selected safety posture, authorize subagents, or downgrade a
security/financial/database/lifecycle task. Unknown or low-confidence profiles
should escalate to the more capable human/Codex path, not silently choose the
cheaper path. The community Codex-router evidence is an experiment lead, not a
policy to copy.

## Prioritized v2B plan

1. **Payload-safe primitives and ledger (highest priority).** Add a shared
   request builder that estimates serialized size, rejects unsafe field names
   before network dispatch, records model/tokens/latency/fallback, and keeps
   the current sanitizer unchanged. Add tests for authority-like key false
   positives and safe neutral aliases.
2. **Task-seeded context candidates.** Add a deterministic developer-tooling
   seed catalog/path scope and explicit no-candidate diagnostics. Require a
   non-empty deterministic universe before Jev; never let Jev invent paths.
3. **Bounded chunking/tournament.** Implement generic ordered chunking for
   context and tests with must-keep/required unions, per-chunk fallback, and a
   deterministic tournament policy. Make chunk size budget-aware rather than a
   new hard-coded 64 workaround.
4. **Multi-axis context review.** Add relevance, boundary, validation, and
   review-risk judgments with raw outputs retained. Combine them in code with
   a non-compensating boundary rule and calibrated thresholds.
5. **Richer test triage.** Separate direct behavior coverage, boundary
   coverage, diagnostic value, and early priority. Keep all required tests and
   report Jev ordering as advisory.
6. **Mid-diff adjacency/missed-contract scan.** Use only deterministic RI/
   Workflow Map neighbors and changed-file metadata; return flagged neighbors
   for lead inspection, never expand the source-of-truth universe implicitly.
7. **Requirement-level evidence matrix.** Replace coarse six-category checks
   with criterion -> implementation/test/browser/DB/provider/docs evidence,
   while preserving deterministic evidence presence and `mergeDecision:
   not-provided`.
8. **Effectiveness ledger and replay CLI.** Store sanitized experiment metadata,
   raw aggregate metrics, threshold sweeps, fallback reasons, and sample
   provenance. Keep offline replay first and live calls explicit.
9. **Advisory complexity profile and escalation.** Add only after labeled
   replay shows useful separation and does not under-provision safety-critical
   tasks.
10. **Cascades/review ordering/visual prioritization.** Implement only where
    local labels show net value; keep human review authoritative.

## Rejected or deferred ideas

- **Raise the 20k cap or weaken the sanitizer:** rejected; it trades a local
  convenience for privacy and predictable payload safety.
- **Let Jev generate missing candidate paths:** rejected; deterministic RI,
  Workflow Map, and current source must define the candidate universe.
- **Drop required tests based on Jev:** rejected; required-test selection and
  deterministic fallback remain authoritative.
- **One generic 0.5 threshold for every primitive/domain:** rejected; Score,
  Noul, and Choice have different semantics, and local labels are required.
- **Autonomous model/subagent selection:** deferred/rejected as an authority;
  advisory complexity may be researched, but user/lead policy controls it.
- **Jev as visual screenshot inspector:** rejected for v2A; sanitized scenario
  metadata may prioritize human inspection, while actual visual quality needs
  human/vision review.
- **Automatic PR merge/release/production decisions:** rejected; Jev can flag
  unsupported claims only.
- **Provider failover or gateway switching as routine policy:** deferred; the
  current direct SDK path and exact provider/model evidence must remain clear.

## Privacy and sanitization conclusions

- The existing sanitizer correctly blocked oversized and sensitive-looking
  payloads during this research; no sanitizer rule was relaxed.
- Safe inputs were limited to synthetic paths, symbols/categories, test names,
  evidence labels, and public source URLs. No customer data, production data,
  private invoice/payroll content, credentials, API keys, cookies, browser
  session data, or repository source contents were sent to Jev or X.
- v2B should lint question IDs and estimate serialized size before dispatch.
  A semantic label such as authority may need a neutral transport key such as
  boundary, while the full meaning remains in the question instruction.
- Model, token, latency, and fallback diagnostics are safe to retain in the
  developer ledger; raw API errors and secrets are not.

## v2A completion boundary

The implementation in this branch stops at research/design and isolated
offline experiment helpers. It does not replace the live Jev CLI, change
normal `agent:context`/`test:affected:agent` behavior, alter application/runtime
bundles, add database/provider behavior, or begin another product phase.

## Validation evidence and limitation

- Focused v2A + existing TypeSafe/RI developer-tooling tests: **42/42**.
- Staged deterministic affected selection: **58/58**, database unaffected,
  no selector fallback.
- `npm.cmd run lint` (ESLint + TypeScript): **exit 0**.
- `git diff --cached --check`: **clean**.
- The required final `npm.cmd test` run exited **1** on two unchanged baseline
  surfaces: `tests/uiHardeningShared.test.ts` retains an older `OperationsUI`
  source-shape assertion, and `tests/visualHarnessCleanup.test.ts` failed its
  dev-server lifecycle assertion. Neither failing implementation surface is in
  this diff; they were not changed or rerun.
- Browser QA, Docker/Supabase, migration, provider, hosted-QA, and production
  validation were not applicable to this documentation/developer-tooling-only
  diff.
