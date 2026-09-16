import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

test("Email / SMS describes the supported outbound and provider boundaries", () => {
  const workspace = source("src/app/routes/EmailSmsRoute.tsx");
  const compose = source("src/components/EmailComposePanel.tsx");
  const provider = source("src/components/EmailProviderStatusPanel.tsx");
  const dashboard = source("src/app/routes/DashboardRoute.tsx");
  assert.match(workspace, /<EmailComposePanel/);
  assert.match(workspace, /<CommunicationHistoryPanel/);
  assert.match(workspace, /<EmailProviderStatusPanel/);
  assert.doesNotMatch(workspace, /Inbox \/ Intake|Connect Gmail|Sync|Scan|Intake Rules/);
  assert.match(compose, /Confirm & Send/);
  assert.match(provider, /Brevo/);
  assert.match(dashboard, /Email \/ SMS/);
  assert.match(dashboard, /delivery history/i);
});

test("engineering documents remain a project-owned register rather than a duplicate generic hub", () => {
  const projectDocuments = source("src/components/engineering/ProjectDocuments.tsx");
  const projectWorkspace = source("src/components/projects/ProjectWorkspace.tsx");
  const demoDocuments = source("src/demo/DemoEngineeringDocuments.tsx");
  assert.match(projectDocuments, /data-document-authority="engineering"/);
  assert.match(projectDocuments, /Supplier evidence, issued financial documents, and other workflow attachments remain in the workflow that owns them/i);
  assert.match(projectDocuments, /PDF drawings and plans/);
  assert.doesNotMatch(projectDocuments, /CAD \/ BIM Blueprints/);
  assert.match(projectWorkspace, /Engineering Documents/);
  assert.match(demoDocuments, /records are fictional and remain separate from authenticated company documents/i);
});

test("client Settings mounts the client roadmap without mounting the internal registry", () => {
  const settings = source("src/components/Settings.tsx");
  assert.match(settings, /ProductFeaturesRoadmap/);
  assert.doesNotMatch(settings, /FeatureStatusOverview|ENGORYX_FEATURE_REGISTRY/);
});
