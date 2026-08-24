import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const access = readFileSync(new URL("../src/context/CompanyAccessContext.tsx", import.meta.url), "utf8");
const management = readFileSync(new URL("../src/components/access/CompanyManagement.tsx", import.meta.url), "utf8");

test("normal route changes do not belong to the full workspace lifecycle effect", () => {
  const effect = app.match(/useEffect\(\(\) => \{\n    if \(!authResolved\)[\s\S]*?\n  \}, \[[^\]]+\]\);/);
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
  assert.match(access, /previousSnapshot, status: "ready"/);
  assert.match(access, /const result = await updateCompanyApi\(companyId, patch\);\n    mergeCompany\(result\);/);
  assert.match(access, /const result = await inviteCompanyMemberApi\(input\);\n    return result;/);
});

test("company administration distinguishes management selection from active workspace opening", () => {
  assert.match(management, /managementCompanyId/);
  assert.match(management, /activeCompanyId/);
  assert.match(management, /setManagementCompanyId\(company\.id\)/);
  assert.match(management, /Open workspace/);
  assert.match(management, /onOpenWorkspace/);
});
