import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

test("Email Intake describes the supported inbound Gmail and review boundaries", () => {
  const emailInbox = source("src/components/EmailInbox.tsx");
  const dashboard = source("src/app/routes/DashboardRoute.tsx");
  assert.match(emailInbox, /Supported email workflows/);
  assert.match(emailInbox, /Read-only Gmail intake/);
  assert.match(emailInbox, /Forwarded supplier invoice fallback/);
  assert.match(emailInbox, /no SMS or broadcast channel is configured here/i);
  assert.match(emailInbox, /canManageMailbox &&/);
  assert.match(dashboard, /Email intake/);
  assert.match(dashboard, /outbound messaging is handled by owning document workflows/i);
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

test("client Settings does not mount repository roadmap status", () => {
  const settings = source("src/components/Settings.tsx");
  assert.doesNotMatch(settings, /FeatureStatusOverview|Product feature status|Future roadmap/i);
});
