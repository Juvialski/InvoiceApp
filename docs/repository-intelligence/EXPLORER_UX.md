# Repository Intelligence Explorer UX

## Product role

The explorer is a developer interface over Repository Intelligence. It is not a customer feature and is not the source of architecture truth.

The useful hierarchy is:

`index/graph first -> query/context second -> visualization third`

RI-4 may begin the later structured/2D explorer work after the RI-1→RI-3 core and higher-priority HydroQualiSense work permit it. Optional 3D visualization is RI-7 and remains the final Repository Intelligence phase.

## Access and deployment

Default: local-only developer tooling.

Acceptable future forms:

- a local development server;
- a separate developer-only build/deployment;
- a static sanitized metadata bundle generated explicitly for architecture review.

Do not place the explorer in normal HydroQualiSense client navigation.

## Information architecture

### Districts

Districts represent semantic HydroQualiSense domains using the current Workflow Map domain vocabulary as the starting point: platform/tenancy, dashboard, projects, procurement, inventory, commercial, engineering, finance, workforce, reporting, and assistant.

A file may map to more than one domain. The explorer should show that ambiguity rather than forcing an incorrect district.

### Buildings

Source files are buildings in 3D and primary nodes/cards in structured/2D views.

Configurable visual metrics may include:

- height: LOC or complexity proxy;
- footprint: symbol count;
- outline/badge: file type or generated status;
- emphasis: current search/change selection.

Metrics must be labeled. Height is never simply `quality`.

### Special objects

Distinct visual shapes/icons may represent:

- routes;
- server/API endpoints;
- database tables/RPCs/migrations;
- tests;
- invariants/permissions/guards;
- external providers.

## Core interaction modes

### Search mode

Search by task words, file, symbol, route, endpoint, database object, invariant, permission, or test. Results should show why each item matched and its provenance.

### Domain mode

Isolate one or several domains and hide unrelated graph regions.

### Source mode

Selecting a file/symbol shows:

- repository path;
- symbols/imports/exports;
- domain mappings;
- inbound/outbound relationships;
- tests;
- curated invariants/permissions;
- objective metrics;
- provenance for every non-obvious relationship.

Source code may open in the local editor or repository browser. The explorer should avoid bundling full source text into public/static metadata.

### Path mode

Visualize a bounded execution/workflow path, for example:

`UI -> controller/lib -> authenticated server route -> provider/RPC -> persistence`

Path mode must distinguish source-derived, curated, inferred, and runtime-observed edges.

### Change / PR mode

Show changed files plus bounded dependency blast radius, mapped tests, affected domains, invariants, and warnings.

Do not equate blast radius with certainty. Strong/direct and inferred impacts should be visually different.

## Risk and professionalization overlays

Objective overlays:

- LOC;
- fan-in/fan-out;
- dependency cycles;
- change frequency/churn;
- mapped-test count;
- cross-domain edge count.

Heuristic warning overlays:

- oversized source file;
- high coupling;
- high churn with weak test mapping;
- many responsibilities;
- unexpected cross-domain dependency;
- likely weak coverage.

Warnings require configurable thresholds and explanation. They are review prompts, not automated verdicts.

## 2D/structured MVP

RI-4 should prioritize:

- search;
- domain filters;
- node detail panel;
- provenance badges;
- dependency/path view;
- test/invariant/permission overlays;
- change highlighting;
- keyboard navigation;
- stable URL/local state for a selected query/path if useful.

The repository already depends on `@xyflow/react`, but RI-4 should only reuse it if doing so keeps the developer tool simple and does not couple it to customer application code.

## 3D direction

RI-7 may add a richer WebGL view only after all earlier Repository Intelligence phases and higher-priority HydroQualiSense work are complete or explicitly reprioritized:

- districts = domains;
- buildings = files/components;
- height = selected objective metric;
- roads/links = imports/runtime/workflow relations;
- special objects = APIs, DB/RPCs, providers, tests, guards;
- heat layer = churn/complexity/coupling/weak-test heuristics;
- change layer = current diff and blast radius.

3D should support level-of-detail rendering and aggressive edge filtering. A hairball is a failure state, not a feature.

## When 3D should not be used

Prefer structured/2D/list mode when:

- the device is mobile or low-power;
- WebGL is unavailable;
- reduced-motion preferences are enabled;
- keyboard/screen-reader use requires a linear representation;
- the selected path has few nodes and a table/list is clearer;
- the user is comparing exact provenance or source details;
- rendering cost exceeds the informational value.

## Accessibility

The explorer must provide a non-3D equivalent for every essential action:

- keyboard-accessible search/filter/navigation;
- text labels independent of color/shape;
- screen-reader-readable node and relationship summaries;
- reduced-motion support;
- sufficient contrast;
- list/table path representation;
- Markdown/Mermaid fallback remains available in GitHub.

## Performance

- never render the complete graph by default;
- query first, render bounded results second;
- cluster/collapse by domain/module;
- lazily reveal weak/inferred edges;
- use level-of-detail for 3D;
- precompute only cheap metrics;
- avoid loading source contents into the explorer bundle.

## Security

Static/deployed explorer metadata must exclude secrets, environment values, credentials, customer documents, private runtime payloads, and connection data.

File paths and architecture internals are developer metadata even when the repository is public. A deployed explorer therefore remains a deliberate developer surface, not a client-facing feature.
