from pathlib import Path


def patch(path: str, before: str, after: str, label: str) -> None:
    file = Path(path)
    text = file.read_text()
    if before not in text:
        raise RuntimeError(f"Missing test patch anchor: {label}")
    file.write_text(text.replace(before, after, 1))


patch(
    "tests/assistantGeminiCompatibility.test.ts",
    '    auth: { getUser: async () => ({ data: { user: { id: userId } }, error: null }) },\n    rpc: async () => ({ data: true, error: null }),\n',
    '    auth: { getUser: async () => ({ data: { user: { id: userId } }, error: null }) },\n    rpc: async (name: string) => ({ data: name === "get_deployment_company_id" ? companyId : true, error: null }),\n',
    "assistant deployment-company mock",
)

for test_path in ("tests/payrollReporting.test.ts", "tests/reconciliation.test.ts"):
    patch(
        test_path,
        'import * as XLSX from "xlsx";\n',
        'import * as fs from "node:fs";\nimport * as XLSX from "xlsx";\n\nXLSX.set_fs(fs);\n',
        f"SheetJS Node ESM filesystem adapter in {test_path}",
    )

patch(
    "tests/serverAuthorization.test.ts",
    '  assert.match(browserClient, /headers\\.set\\("X-Company-Id", options\\.companyId\\)/);\n',
    '  assert.match(browserClient, /assertDeploymentCompanyId\\(deploymentCompanyId, options\\.companyId/);\n  assert.match(browserClient, /headers\\.set\\("X-Company-Id", deploymentCompanyId\\)/);\n',
    "deployment-bound browser company header",
)

patch(
    "tests/singleCompanyDeployment.test.ts",
    '  assert.match(management, /company\\.members\\.manage/);\n  assert.match(management, /companyAccess\\.can/);\n',
    '  assert.match(management, /PERMISSION_KEYS\\.accessManage/);\n  assert.match(management, /companyAccess\\.can/);\n',
    "permission constant assertion",
)

patch(
    "tests/headerNavigation.test.ts",
    '''test("global controls are outside the scrollable navigation and expose the expected account actions", () => {
  assert.match(header, /flex min-w-0 flex-wrap items-center justify-end gap-2 pb-0\\.5/);
  assert.doesNotMatch(header, /items-center justify-end gap-2 overflow-x-auto/);
  assert.match(header, /Workspace Settings/);
  assert.match(header, /Manage Companies/);
  assert.match(accessStates, /onOpenPlatformManagement\\?: \\(\\) => void/);
  assert.match(accessStates, /right-0 top-\\[calc\\(100%\\+0\\.5rem\\)\\].*overflow-y-auto/);
});''',
    '''test("global controls keep account actions outside navigation and company identity is not a tenant selector", () => {
  assert.match(header, /flex min-w-0 flex-wrap items-center justify-end gap-2 pb-0\\.5/);
  assert.doesNotMatch(header, /items-center justify-end gap-2 overflow-x-auto/);
  assert.match(header, /Workspace Settings/);
  assert.match(header, /right-0 top-\\[calc\\(100%\\+0\\.5rem\\)\\][^\\n]*overflow-y-auto/);
  assert.match(accessStates, /never a tenant selector/);
  assert.match(accessStates, /aria-label=\\{`Deployment company:/);
});''',
    "single-company header assertions",
)

patch(
    "tests/workspaceLifecycle.test.ts",
    '''test("access revalidation preserves a usable snapshot and metadata mutations avoid refreshAccess", () => {
  assert.match(access, /hasUsableSnapshot/);
  assert.match(access, /status: "refreshing"/);
  assert.match(access, /latestSnapshot, status: "ready"/);
  assert.match(access, /const result = await updateCompanyApi\\(companyId, patch\\);\\r?\\n\\s+mergeCompany\\(result\\);/);
  assert.match(access, /const result = await inviteCompanyMemberApi\\(input\\);\\r?\\n\\s+return result;/);
});''',
    '''test("access revalidation clears stale company permissions before resolving the configured deployment", () => {
  assert.match(access, /resetAuthenticatedContext\\("loading", userId/);
  assert.match(access, /Promise\\.all\\(\\[\\s*loadCompanyAccess\\(supabase\\),\\s*loadDeploymentCompanyId\\(supabase\\)/);
  assert.match(access, /resolveDeploymentCompanyAccess\\(loaded, deploymentCompanyId\\)/);
  assert.match(access, /const result = await updateCompanyApi\\(deploymentCompanyId, patch\\);\\r?\\n\\s+await refreshAccess\\(\\);/);
  assert.match(access, /return inviteCompanyMemberApi\\(\\{ \\.\\.\\.input, companyId: deploymentCompanyId \\}\\);/);
});''',
    "single-company access revalidation assertions",
)

patch(
    "tests/workspaceLifecycle.test.ts",
    '''test("access bootstrap is coalesced per stable user identity and is not session-object driven", () => {
  assert.match(access, /const activeSession = sessionRef\\.current;/);
  assert.match(access, /const inFlight = accessLoadRef\\.current;/);
  assert.match(access, /if \\(inFlight\\?\\.userId === userId\\)/);
  assert.match(access, /accessLoadRef\\.current = \\{ userId, promise: request \\};/);
  assert.match(access, /const selectionGeneration = selectionGenerationRef\\.current;/);
  assert.match(access, /const preferredCompanyId = selectionChanged \\? accessRef\\.current\\.activeCompanyId : previousCompanyId;/);
  assert.doesNotMatch(access, /const refreshAccess = useCallback\\(async \\(\\) => \\{[\\s\\S]*?\\}, \\[session, setAccessSnapshot\\]\\);/);
  assert.match(access, /return \\(\\) => \\{ void supabase\\.removeChannel\\(channel\\); \\};/);
});''',
    '''test("access bootstrap is coalesced per stable user identity and has no tenant-selection generation", () => {
  assert.match(access, /const activeSession = sessionRef\\.current;/);
  assert.match(access, /const inFlight = accessLoadRef\\.current;/);
  assert.match(access, /if \\(inFlight\\?\\.userId === userId\\)/);
  assert.match(access, /accessLoadRef\\.current = \\{ userId, promise: request \\};/);
  assert.doesNotMatch(access, /selectionGenerationRef|preferredCompanyId|selectionChanged/);
  assert.doesNotMatch(access, /const refreshAccess = useCallback\\(async \\(\\) => \\{[\\s\\S]*?\\}, \\[session, setAccessSnapshot\\]\\);/);
  assert.match(access, /return \\(\\) => \\{ void supabase\\.removeChannel\\(channel\\); \\};/);
});''',
    "single-company bootstrap assertions",
)

print("Continuation test compatibility patch applied.")
