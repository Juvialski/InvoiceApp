import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { demoDocumentsPath, parseDemoLocation } from "../src/demo/demoRouting.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function source(relativePath: string) {
  return readFileSync(path.join(ROOT, relativePath), "utf8");
}

test("demo project Documents uses the canonical project workspace route", () => {
  const pathName = demoDocumentsPath("demo-project-warehouse");
  assert.equal(pathName, "/demo/app/projects/demo-project-warehouse/documents");

  const location = parseDemoLocation(pathName);
  assert.equal(location.kind, "app");
  if (location.kind !== "app") return;
  assert.equal(location.appLocation.kind, "project");
  if (location.appLocation.kind !== "project") return;
  assert.equal(location.appLocation.projectId, "demo-project-warehouse");
  assert.equal(location.appLocation.view, "documents");
});

test("global demo Documents remains a standalone register", () => {
  assert.equal(parseDemoLocation("/demo/app/documents").kind, "documents");
});

test("project workspace renders header then tabs then Overview content", () => {
  const workspace = source("src/components/projects/ProjectWorkspace.tsx");
  const headerIndex = workspace.indexOf("<PageHeader");
  const navigationIndex = workspace.indexOf("<nav");
  const overviewIndex = workspace.indexOf('{tab === "overview"');

  assert.ok(headerIndex >= 0, "ProjectWorkspace should render the shared project header");
  assert.ok(navigationIndex > headerIndex, "project tabs should follow the project header");
  assert.ok(overviewIndex > navigationIndex, "Overview content should render below the persistent tabs");
  assert.match(workspace, /hideHeader/);
});

test("demo project Documents is injected into the shared project shell", () => {
  const demoWorkspace = source("src/demo/DemoWorkspace.tsx");
  assert.match(demoWorkspace, /projectDocumentsContent=\{selectedProject \? <DemoEngineeringDocuments projectId=\{selectedProject\.id\} \/> : undefined\}/);
  assert.match(demoWorkspace, /onProjectTabChange=\{openProjectView\}/);
  assert.doesNotMatch(demoWorkspace, /tab === "documents" \? onNavigate/);
});
