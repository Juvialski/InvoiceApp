import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ENGORYX_FEATURE_REGISTRY } from "../src/features/registry.ts";
import { featureAvailability, featureAvailabilityLabel } from "../src/features/availability.ts";
import { getHelpResponse, searchHelpCatalog } from "../src/assistant/helpCatalog.ts";

function source(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

test("the Phase 2 feature and status surface remain explicitly unavailable", () => {
  const feature = ENGORYX_FEATURE_REGISTRY.find((candidate) => candidate.id === "eng-schedule-gantt");
  assert.ok(feature);
  assert.equal(feature.status, "PLANNED");
  assert.equal(featureAvailability(feature), "PLANNED_NOT_AVAILABLE");
  assert.equal(featureAvailabilityLabel(featureAvailability(feature)), "Planned — not available");

  const availabilitySource = source("src/features/availability.ts");
  const statusSource = source("src/components/FeatureStatusOverview.tsx");
  assert.match(availabilitySource, /PLANNED_NOT_AVAILABLE/);
  assert.doesNotMatch(availabilitySource, /COMING_SOON/);
  assert.match(statusSource, /no implied delivery date or production access/i);
  assert.doesNotMatch(statusSource, /Coming soon/i);
});

test("deferred scheduling is not advertised as an integrated library or Assistant help feature", () => {
  const integrations = source("docs/ENGORYX_OPEN_SOURCE_INTEGRATIONS.md");
  const schedulingSection = integrations.match(/### 2\.2 Project Scheduling & Gantt[\s\S]*?(?=### 2\.3)/)?.[0] || "";
  assert.match(schedulingSection, /Deferred \/ Phase 2/i);
  assert.doesNotMatch(schedulingSection, /Ready for Integration/i);
  assert.match(integrations, /technical candidate assessments only/i);

  assert.equal(searchHelpCatalog("gantt scheduling cpm").length, 0);
  const response = getHelpResponse("critical path schedule");
  assert.equal(response.kind, "unknown");
});

test("phase documentation reflects merged Phase 1 status rather than historical merge gates", () => {
  const phase1a = source("docs/ENGORYX_PHASE_1A_ENGINEERING_DOCUMENTS.md");
  const phase1b = source("docs/ENGORYX_PHASE_1B_RFIS_SUBMITTALS.md");
  assert.match(phase1a, /Phase 1B[\s\S]*implemented and merged[\s\S]*feature registry marks these shipped capabilities \*\*ACTIVE\*\*/i);
  assert.doesNotMatch(phase1a, /Phase 1B[\s\S]*and Phase 1C[\s\S]*are now \*\*ACTIVE\*\*/i);
  assert.match(phase1b, /Phase 1B is implemented and merged/i);
  assert.doesNotMatch(phase1b, /must remain unmerged/i);
});
