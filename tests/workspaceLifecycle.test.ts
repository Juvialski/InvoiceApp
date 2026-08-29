import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const access = readFileSync(new URL("../src/context/CompanyAccessContext.tsx", import.meta.url), "utf8");

test("normal route changes do not belong to the full workspace lifecycle effect", () => {
  const effect = app.match(/useEffect\(\(\) => \{\r?\n    if \(!authResolved\)[\s\S]*?\r?\n  \}, \[[^\]]+\]\);/);
  assert.ok(effect, "workspace lifecycle effect should remain discoverable");
  assert.doesNotMatch(effect![0], /activeTab/);
  assert.doesNotMatch(effect![0], /route\.pathname/);
  assert.match(app, /createWorkspaceLoadCache/);
  assert.match(app, /getOrLoad/);
  assert.match(app, /reason: context\.reason/);
});

test("access revalidation clears stale company permissions before resolving the configured deployment", () => {
  assert.match(access, /resetAuthenticatedContext\("loading", userId/);
  assert.match(access, /Promise\.all\(\[\s*loadCompanyAccess\(supabase\),\s*loadDeploymentCompanyId\(supabase\)/);
  assert.match(access, /resolveDeploymentCompanyAccess\(loaded, deploymentCompanyId\)/);
  assert.match(access, /const result = await updateCompanyApi\(deploymentCompanyId, patch\);\r?\n\s+await refreshAccess\(\);/);
  assert.match(access, /companyApiRequest\("\/api\/company\/invitations"/);
  assert.match(access, /resendCompanyInvitation/);
});

test("access bootstrap is coalesced per stable user identity and has no tenant-selection generation", () => {
  assert.match(access, /const activeSession = sessionRef\.current;/);
  assert.match(access, /const inFlight = accessLoadRef\.current;/);
  assert.match(access, /if \(inFlight\?\.userId === userId\)/);
  assert.match(access, /accessLoadRef\.current = \{ userId, promise: request \};/);
  assert.doesNotMatch(access, /selectionGenerationRef|preferredCompanyId|selectionChanged/);
  assert.doesNotMatch(access, /const refreshAccess = useCallback\(async \(\) => \{[\s\S]*?\}, \[session, setAccessSnapshot\]\);/);
  assert.match(access, /return \(\) => \{ void supabase\.removeChannel\(channel\); \};/);
});
