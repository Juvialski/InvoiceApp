import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const access = readFileSync(new URL("../src/context/CompanyAccessContext.tsx", import.meta.url), "utf8");
const management = readFileSync(new URL("../src/components/access/CompanyManagement.tsx", import.meta.url), "utf8");

test("normal route changes do not belong to the full workspace lifecycle effect", () => {
  const effect = app.match(/useEffect\(\(\) => \{\r?\n    if \(!authResolved\)[\s\S]*?\r?\n  \}, \[[^\]]+\]\);/);
  assert.ok(effect, "workspace lifecycle effect should remain discoverable");
  assert.doesNotMatch(effect![0], /activeTab/);
  assert.doesNotMatch(effect![0], /route\.pathname/);
  assert.match(app, /createWorkspaceLoadCache/);
  assert.match(app, /getOrLoad/);
  assert.match(app, /reason: context\.reason/);
});

test("access revalidation preserves a usable snapshot and metadata mutations avoid refreshAccess", () => {
  assert.match(access, /hasUsableSnapshot/);
  assert.match(access, /status: "refreshing"/);
  assert.match(access, /latestSnapshot, status: "ready"/);
  assert.match(access, /const result = await updateCompanyApi\(companyId, patch\);\r?\n\s+mergeCompany\(result\);/);
  assert.match(access, /const result = await inviteCompanyMemberApi\(input\);\r?\n\s+return result;/);
});

test("access bootstrap is coalesced per stable user identity and is not session-object driven", () => {
  assert.match(access, /const activeSession = sessionRef\.current;/);
  assert.match(access, /const inFlight = accessLoadRef\.current;/);
  assert.match(access, /if \(inFlight\?\.userId === userId\)/);
  assert.match(access, /accessLoadRef\.current = \{ userId, promise: request \};/);
  assert.match(access, /const selectionGeneration = selectionGenerationRef\.current;/);
  assert.match(access, /const preferredCompanyId = selectionChanged \? accessRef\.current\.activeCompanyId : previousCompanyId;/);
  assert.doesNotMatch(access, /const refreshAccess = useCallback\(async \(\) => \{[\s\S]*?\}, \[session, setAccessSnapshot\]\);/);
  assert.match(access, /return \(\) => \{ void supabase\.removeChannel\(channel\); \};/);
});

test("company administration distinguishes management selection from active workspace opening", () => {
  assert.match(management, /managementCompanyId/);
  assert.match(management, /activeCompanyId/);
  assert.match(management, /selectManagementCompany\(company\.id\)/);
  assert.match(management, /Open workspace/);
  assert.match(management, /onOpenWorkspace/);
});
