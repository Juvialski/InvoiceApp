# WEB-BRAND-1 — Production Company Landing + QA Software Showcase Separation

Status: **IMPLEMENTED AND MERGED FOR REPOSITORY SCOPE — PR #249 / `2ca9a96b0799eec4f14364f308e9edc2d6c73d9a`; REAL COMPANY CONTENT VERIFICATION REMAINS PENDING**

Prepared: 2026-09-23

Repository baseline when this plan was recorded: `30178994c5f513afc8d37f6198beea6eaf30e97a`.

Implementation record: synchronized implementation base `59762f89fe308dd0f732c4af5f654acc813dd05d`; reviewed exact PR #249 head `b453a269436d66af36c133598867cfa3f20af413`; squash-merged to `main` as `2ca9a96b0799eec4f14364f308e9edc2d6c73d9a` on 2026-09-24. All four protected exact-head workflows passed before merge. Real company portfolio references/photos, public service-area wording, inquiry email, and telephone remain outside repository evidence and therefore remain pending company verification.

## 1. Why this phase exists

The current public landing implementation conflates two different identities:

1. **Hydroqualisense Solutions Corp.** — the user's first client and an engineering company whose public website should explain the company, the engineering services it provides, and the projects/industries it serves.
2. **The software/workspace** — the engineering operations application being developed in this repository.

The current production `/` page is primarily a software sales page. It promotes project costing, supplier invoices, procurement, inventory, payroll, communications, dedicated software deployments, and software demo requests. That is the wrong public message for Hydroqualisense Solutions Corp.'s production website.

The intended separation is:

- **Production public site:** promote Hydroqualisense Solutions Corp. as an engineering company, with emphasis on water-related engineering such as water treatment and water management and only other services/projects that are verified from company-provided facts.
- **QA public site:** promote and demonstrate the software/workspace, using synthetic/demo data and a clear QA/software-showcase identity.
- **Authenticated production workspace:** remains the Hydroqualisense client workspace. This phase is not authorization for a broad in-app rebrand.
- **Creator/software vendor identity:** no permanent creator/software brand has been chosen yet. Do not invent one and do not present Hydroqualisense Solutions Corp. as the software vendor merely to fill that gap.

This phase must establish an explicit branding boundary so a future creator/product brand can be added later without another client-company rebrand.

## 2. Current repository observations

Current source already provides useful separation points:

- `src/public/PublicFunnelRoot.tsx` owns the public `/`, `/contact`, `/request-demo`, `/privacy`, and `/terms` experience.
- The current production landing copy is software-oriented.
- `src/demo/DemoLandingPage.tsx` and `/demo` already provide a software/workspace demonstration using synthetic data.
- `src/lib/deploymentIdentity.ts` already distinguishes `production`, `qa`, `staging`, and `demo`, with a specific `isQa` flag.
- `src/components/DeploymentEnvironmentBanner.tsx` already makes non-production environments explicit.
- `src/config/brand.ts` currently combines product naming and client-company identity in one `BRAND` object. That coupling is a source of the present ambiguity.
- `src/app/applicationMode.ts` already routes the canonical Hydroqualisense host to the public experience and keeps `/demo` isolated.

WEB-BRAND-1 should use those existing boundaries rather than creating a second routing system.

## 3. Governing branding model

### 3.1 Production = company brand

On the production/canonical Hydroqualisense public site, Hydroqualisense must be presented as the engineering company.

Primary identity:

**Hydroqualisense Solutions Corp.**

Primary purpose:

Explain what the engineering company does, what types of projects it undertakes, how prospective clients can engage it, and how existing clients can access their secure workspace.

The production homepage must not lead with software modules, software deployment architecture, Supabase/Render isolation, provider status, AI capabilities, audit-history implementation, or software demo sales copy.

### 3.2 QA = software showcase

The QA public landing should remain software-oriented and should demonstrate the engineering operations platform/workspace.

It may explain:

- project operations;
- procurement;
- invoices/expenses;
- finance;
- documents;
- payroll/workforce;
- warehouse/inventory;
- equipment;
- communications;
- workflow/history/audit concepts;
- sample workspace/demo access.

It must make clear that the environment is QA/synthetic and that it is showcasing software rather than representing the production public services site of Hydroqualisense Solutions Corp.

### 3.3 No invented creator brand

The repository owner/creator does not yet have a finalized software-company or product brand.

Therefore:

- do not invent a vendor name;
- do not use Hydroqualisense Solutions Corp. as the software creator/vendor;
- do not reuse the client's corporate identity as if it were a multi-client SaaS vendor brand;
- use a neutral temporary descriptor in QA where a software identity is required, for example **Engineering Operations Platform — QA Showcase** or another explicitly temporary descriptor;
- preserve a configuration seam so a future creator/product brand can replace that neutral descriptor cleanly.

The final temporary wording should be approved during implementation; this plan does not establish a permanent software product name.

## 4. Production landing information architecture

The production page should become a professional engineering-company website.

### 4.1 Header

Recommended primary navigation:

- Home
- Services
- Projects / Experience
- About
- Contact
- Client Portal

`Client Portal` should lead existing authorized users into the application/sign-in route.

Do not use `Request demo` as the primary production CTA.

### 4.2 Hero

The hero should communicate:

- Hydroqualisense Solutions Corp. is an engineering company;
- its core work is water-related engineering;
- the company solves real project/infrastructure needs rather than selling software.

Potential direction only, pending verified company wording:

> Engineering practical water solutions from planning through project delivery.

Do not publish invented years of experience, certifications, client counts, project counts, geographic coverage, treatment capacity, awards, or performance metrics.

### 4.3 Services

The services section should be driven by verified client/company facts.

Known high-level direction from the owner:

- water treatment;
- water management;
- related engineering projects.

Potential adjacent service categories such as wastewater treatment, pumping systems, filtration, treatment-plant design, rehabilitation, operations/maintenance support, consulting, environmental systems, or civil/electromechanical work must not be published merely because they are plausible. Include them only after they are confirmed from company materials or directly approved.

The implementation should make service content data-driven so verified services can be added/edited without rewriting the page structure.

### 4.4 Projects / experience

This section should showcase **real Hydroqualisense company work**, not software demo fixtures.

Hard rules:

- never use the synthetic `/demo` projects as production portfolio claims;
- never present fictional sample names, amounts, clients, locations, or metrics as completed company work;
- use real project names, categories, locations, descriptions, outcomes, and photographs only after the user/company confirms they are public;
- if real portfolio content is not yet available, ship a restrained capability/sector section rather than fabricating case studies.

A future verified project card can contain:

- project title;
- service/category;
- general location;
- brief problem/solution summary;
- project status or completion year when public;
- one approved real photo;
- optional client name only when the company is allowed to publish it.

### 4.5 Why Hydroqualisense / delivery approach

A short trust section may describe verified working principles, for example:

- engineering-focused planning;
- practical project delivery;
- documentation and accountability;
- water-system reliability;
- responsive client coordination.

These are positioning directions, not authorization to claim certifications or guarantees.

### 4.6 About

Include a concise factual company overview once the user supplies/approves:

- company background;
- specialization;
- location/service region;
- engineering disciplines;
- mission/values if desired.

Do not infer incorporation date, founders, staff count, licenses, accreditations, or regulatory registrations.

### 4.7 Contact / project inquiry

Production CTA should become something like:

- Discuss a project
- Request a consultation
- Send a project inquiry
- Contact Hydroqualisense

The current software-prospect questions such as desired software modules, workforce scale, deployment timeline, and demo request type are not appropriate for a production engineering-company lead form.

A production engineering inquiry form should be minimal and business-appropriate, for example:

- name;
- company/organization;
- email;
- phone;
- project location;
- type of water/engineering need;
- short project description;
- preferred contact method.

Do not request sensitive operational documents, credentials, employee data, financial source records, or API keys through the public form.

The implementation agent must inspect the current public-prospect database/RPC contract before deciding whether to adapt it, add a distinct inquiry contract, or initially use a simpler contact route. Do not silently reinterpret old software-prospect fields as engineering-project fields.

## 5. Production visual direction

The company site should feel like a credible engineering/water-infrastructure business rather than a SaaS dashboard advertisement.

Preferred visual direction:

- real approved Hydroqualisense project photography where available;
- water-treatment facilities, piping, tanks, pumps, field engineering, testing/commissioning, or related real work only when authentic;
- clear blue/teal/water-inspired visual language may be used, but avoid generic template styling;
- strong typography, large project imagery, restrained technical diagrams/linework, and clear service navigation;
- responsive, professional, relatively low text density.

Do not use AI-generated images as if they were photographs of completed Hydroqualisense projects.

If decorative generated/illustrative assets are ever used, they must be obviously illustrative and must not imply a real project, facility, client, or engineering result.

## 6. QA software showcase direction

The QA root may retain and improve the existing software-focused concept.

Recommended QA structure:

- explicit QA/synthetic environment banner;
- neutral software-showcase identity;
- hero focused on the engineering operations workspace;
- product capability cards;
- screenshots or safe-demo UI imagery;
- workflow/accountability explanation;
- Launch Demo Workspace;
- Guided Tour;
- optional software demo/contact CTA if useful.

The QA site should not masquerade as Hydroqualisense Solutions Corp.'s production corporate website.

A clear line such as the following is appropriate:

> QA software showcase using synthetic engineering-company data. Not the public corporate services website.

Exact wording can be refined during implementation.

## 7. Brand/config architecture

WEB-BRAND-1 should remove the assumption that one object must represent both company marketing identity and software/product marketing identity.

A suitable architecture may separate concerns such as:

- deployment/client company identity;
- authenticated workspace identity;
- production public-company-site content;
- QA software-showcase content;
- future creator/product brand.

Exact type/file names are implementation decisions after source inspection.

Do not perform a broad internal application rebrand just to accomplish this separation.

The current authenticated Hydroqualisense deployment may continue using Hydroqualisense company identity because it is the client's dedicated workspace.

### Environment behavior

Minimum required behavior:

- canonical production Hydroqualisense public root -> company-services website;
- QA root -> software showcase;
- `/demo` -> synthetic demo workspace;
- `/dashboard` and authenticated routes -> client workspace;
- `/privacy` and `/terms` remain accessible and truthful.

Prefer the existing deployment-identity/configuration system over ad-hoc hostname checks.

If a dedicated public-site variant is added, keep it explicit and small. Do not introduce a large theming/branding framework.

## 8. Metadata, SEO, and search-indexing boundary

Production metadata must become company-focused.

Examples of what should change:

- document title;
- meta description;
- Open Graph title/description;
- public structured data if later added;
- homepage heading hierarchy;
- canonical public-company messaging.

Production should target the engineering company and its services, not software buyers.

QA must be clearly non-production and should not compete with the production company site in search results.

Implementation should verify appropriate `noindex`/non-production indexing behavior for QA and other non-production public environments.

Do not accidentally canonicalize a QA software showcase as if it were production corporate content.

## 9. Legal/policy boundary

Because the same domain also hosts an authenticated client workspace, production Privacy/Terms may still need to describe website inquiries, account/authentication, client-workspace data handling, and configured providers.

Do not delete accurate privacy/security disclosures merely because the homepage becomes company-focused.

However, technical privacy/provider explanations should live in policy/help surfaces, not dominate the production marketing homepage.

## 10. Content verification gate

Before production copy is considered complete, the implementation must obtain or be given a verified content packet for Hydroqualisense Solutions Corp.

At minimum, verify:

- official company display name;
- approved logo;
- concise company description;
- confirmed service list;
- target clients/sectors;
- public contact details;
- service area/location wording;
- approved project/portfolio entries;
- approved project images;
- any certifications/licenses/awards the company explicitly wants published.

If those facts are unavailable, use conservative generic structure and explicitly mark missing content as pending rather than fabricating claims.

Synthetic demo data is never an acceptable source for production marketing facts.

## 11. Suggested implementation decomposition

This should remain one coherent public-site phase unless the content packet is incomplete.

### A. Brand/runtime separation

- separate public-company and QA software-showcase copy/config;
- route the correct public landing by deployment identity;
- preserve `/demo`, authenticated application routing, policy pages, and recovery links.

### B. Production company-site redesign

- new company-first header/hero;
- verified services;
- project/experience surface;
- about/trust section;
- engineering project inquiry CTA/form;
- Client Portal entry;
- production metadata/SEO.

### C. QA software showcase refinement

- neutral software-showcase identity;
- keep software capabilities/demo positioning;
- explicit synthetic/QA disclosure;
- software screenshots/demo actions;
- no creator/vendor brand invented.

### D. Responsive/accessibility/evidence

- desktop, constrained laptop, tablet, phone;
- keyboard/focus/navigation;
- contrast in light/dark only where the public design supports both;
- no horizontal overflow;
- production and QA screenshot evidence;
- verify environment routing and metadata.

## 12. Tests and acceptance criteria

At minimum test:

### Branding/routing

- production canonical root renders company-services content;
- production root does not contain software-sales hero language such as deployment-model promotion or module-selection CTA;
- QA root renders software-showcase content;
- QA has explicit non-production/synthetic disclosure;
- `/demo` still opens the isolated demo experience;
- authenticated/client-portal routing still works;
- password recovery remains outside public marketing routing;
- privacy/terms remain reachable.

### Content integrity

- production does not import or render synthetic demo project records as portfolio claims;
- unverified project/client metrics are absent;
- software prospect fields are not mislabeled as engineering inquiry fields;
- creator/software-vendor brand is not invented;
- Hydroqualisense Solutions Corp. is not presented as the vendor of a multi-client SaaS product.

### SEO/environment

- production company metadata is company/service focused;
- QA/non-production public pages are appropriately prevented from search-index confusion;
- canonical metadata does not misrepresent QA software content as production company content.

### Responsive/accessibility

- production and QA landing pages pass desktop/laptop/tablet/phone visual inspection;
- navigation and CTAs are keyboard reachable;
- contact/inquiry validation is accessible;
- no overflow or hidden primary actions;
- approved project imagery has meaningful alt text where needed.

## 13. Explicit non-goals

WEB-BRAND-1 does not authorize:

- a full authenticated-app rebrand;
- choosing the creator's permanent business/product brand;
- pretending Hydroqualisense is the software vendor;
- inventing company services, clients, certifications, project histories, or metrics;
- using fictional demo projects as real corporate portfolio items;
- Worker Registration, Attendance, Face Recognition, finance expansion, or other product-domain work;
- redesigning all in-app Round 4 surfaces;
- production infrastructure migration;
- provider/security architecture changes unrelated to the public landing.

## 14. Relationship to active work

This section records the sequencing context that existed when the plan was written. REL-AUTH-1 was in progress, and WEB-BRAND-1 was planning-only at that time. REL-AUTH-1, UI-R4E, and CI-EFF-1 later merged before WEB-BRAND-1 implementation began.

WEB-BRAND-1 then synchronized from `main` SHA `59762f89fe308dd0f732c4af5f654acc813dd05d` and remained isolated from unrelated authenticated-product expansion. The implementation merged as PR #249. The current roadmap/handoff, not this historical sequencing note, determines subsequent work.

## 15. Definition of done

WEB-BRAND-1 is complete only when:

- the production Hydroqualisense root behaves like the website of a water-focused engineering company;
- production messaging promotes verified company services rather than software modules, and uses real/approved project experience only when company-verified content exists; otherwise the portfolio state remains explicitly pending;
- existing clients have a clear Client Portal entry;
- the engineering inquiry/contact path is appropriate for company projects;
- QA clearly promotes/tests the software with synthetic/demo context;
- QA and production can no longer be confused as the same marketing audience;
- no permanent creator/software brand has been invented;
- synthetic/demo projects are not used as production company claims;
- metadata/SEO reflects the correct audience per environment;
- routing, legal pages, auth recovery, demo, and client workspace remain intact;
- responsive/accessibility evidence is captured;
- the final implementation updates the active roadmap/handoff to reflect actual delivered state.
