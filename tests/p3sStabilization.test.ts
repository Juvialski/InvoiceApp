import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const router = readFileSync(new URL("../src/app/routes/AppRouter.tsx", import.meta.url), "utf8");
const workspace = readFileSync(new URL("../src/components/projects/ProjectWorkspace.tsx", import.meta.url), "utf8");
const siteLogs = readFileSync(new URL("../src/components/engineering/ProjectSiteLogs.tsx", import.meta.url), "utf8");
const controller = readFileSync(new URL("../src/features/engineering/useDailySiteLogsController.ts", import.meta.url), "utf8");
const materialsEquipment = readFileSync(new URL("../src/components/projects/ProjectMaterialsEquipment.tsx", import.meta.url), "utf8");
const compatibilitySiteLogs = readFileSync(new URL("../src/components/engineering/ProjectDailySiteLogs.tsx", import.meta.url), "utf8");
const overview = readFileSync(new URL("../src/components/projects/ProjectOverview.tsx", import.meta.url), "utf8");

test("P3S shares a project-scoped Site Log snapshot across workspace surfaces", () => {
  assert.match(app, /loadDailySiteLogsFromSupabase/);
  assert.match(app, /dailySiteLogsData/);
  assert.match(router, /dailySiteLogsData=\{dailySiteLogsData\}/);
  assert.match(workspace, /scopeDailySiteLogsToProject/);
  assert.match(workspace, /mergeDailySiteLogsWorkspaceData/);
  assert.match(workspace, /controlledPersistence=.*"remote"/);
  assert.match(controller, /aggregateForDailySiteLog\(projectData/);
  assert.match(overview, /effectiveDailySiteLogsData = engineeringSummaryState\.dailySiteLogsData/);
});

test("P3S keeps missing permission fail-closed and does not trust controlled field data", () => {
  assert.match(router, /engineeringDocumentsCanRead = false/);
  assert.match(workspace, /engineeringDocumentsCanRead = false/);
  assert.match(siteLogs, /canRead = false, canCreate = false, canUpdate = false, canSubmit = false, canManage = false/);
  assert.match(compatibilitySiteLogs, /useAppPermissions/);
  assert.match(compatibilitySiteLogs, /engineeringSiteLogsRead/);
  assert.match(materialsEquipment, /if \(!canReadSiteLogs\) return emptyDailySiteLogsWorkspaceData\(\)/);
});
