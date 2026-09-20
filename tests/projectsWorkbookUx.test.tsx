import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { Project, ProjectCostCode } from "../src/types.ts";
import { ProjectsWorkbookPanel } from "../src/components/projects/ProjectsWorkbookPanel.tsx";

const project: Project = {
  id: "11111111-1111-4111-8111-111111111111",
  projectCode: "PRJ-001",
  projectName: "Water Treatment Upgrade",
  status: "ACTIVE",
  projectBudget: 1000,
  currency: "PHP",
  taxTreatment: "VAT",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-02T00:00:00.000Z",
};

const costCode: ProjectCostCode = {
  id: "33333333-3333-4333-8333-333333333333",
  projectId: project.id,
  code: "CIVIL",
  name: "Civil Works",
  status: "ACTIVE",
  approvedBudgetAmount: 600,
  createdAt: project.createdAt,
  updatedAt: project.updatedAt,
};

test("Projects workbook panel exposes export/import review and truthful read-only messaging", () => {
  const html = renderToStaticMarkup(
    <ProjectsWorkbookPanel
      projects={[project]}
      costCodes={[costCode]}
      canManage={false}
      onApplyProjectWorkbookGroup={async () => undefined}
    />,
  );
  assert.match(html, /Excel-native Projects workbook/);
  assert.match(html, /Export editable workbook/);
  assert.match(html, /Import workbook/);
  assert.match(html, /Upload is available for review only/);
  const panelSource = readFileSync(new URL("../src/components/projects/ProjectsWorkbookPanel.tsx", import.meta.url), "utf8");
  assert.match(panelSource, /Apply selected changes/);
});

test("Projects route/page wire fresh refresh and grouped Apply boundaries", () => {
  const page = readFileSync(new URL("../src/components/projects/ProjectsPage.tsx", import.meta.url), "utf8");
  const route = readFileSync(new URL("../src/app/routes/ProjectsRoute.tsx", import.meta.url), "utf8");
  assert.match(page, /ProjectsWorkbookPanel/);
  assert.match(page, /onApplyProjectWorkbookGroup/);
  assert.match(page, /onRefreshProjects/);
  assert.match(route, /onApplyProjectWorkbookGroup/);
  assert.match(route, /onRefreshProjects/);
});

test("Projects keeps workbook tools behind a secondary disclosure", () => {
  const page = readFileSync(new URL("../src/components/projects/ProjectsPage.tsx", import.meta.url), "utf8");
  assert.match(page, /<details[^>]*aria-label="Excel import\/export"/);
  assert.match(page, /ProjectsWorkbookPanel/);
});
