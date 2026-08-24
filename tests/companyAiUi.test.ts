import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const configuration = readFileSync(new URL("../src/components/access/CompanyAiConfiguration.tsx", import.meta.url), "utf8");
const management = readFileSync(new URL("../src/components/access/CompanyManagement.tsx", import.meta.url), "utf8");
const api = readFileSync(new URL("../src/lib/companyAiApi.ts", import.meta.url), "utf8");
const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");

test("management-company selection stays local until explicit workspace opening", () => {
  assert.match(management, /selectManagementCompany\(company\.id\)/);
  assert.match(management, /const workspaceOpener = onOpenWorkspace \|\| onSelectCompany/);
  assert.match(management, /onClick=\{\(\) => void openWorkspace\(\)\}/);
  assert.match(management, /managementCompanyIdRef\.current === companyId/);
  assert.match(management, /selectedCompany\.status\.toUpperCase\(\) !== "ACTIVE"/);
  assert.match(management, /Archived companies cannot be opened until reactivated/);
});

test("AI key UI clears plaintext state before awaiting save and has guarded actions", () => {
  assert.match(configuration, /setApiKey\(""\);\n    setReplaceMode\(false\);\n    await run\("save"/);
  assert.match(configuration, /messageForError\(error, secret\)/);
  assert.match(configuration, /Confirm disable/);
  assert.match(configuration, /Confirm removal/);
  assert.match(configuration, /Enable AI/);
  assert.match(configuration, /onEnable/);
  assert.match(configuration, /PROVIDER_ACCESS_DENIED/);
  assert.match(configuration, /Save & Test/);
  assert.match(configuration, /Configured \/ Active/);
  assert.doesNotMatch(configuration, /localStorage|sessionStorage|console\.(log|warn|error)/i);
});

test("AI API trims empty keys, redacts request errors, and stores no browser credential state", () => {
  assert.match(api, /if \(!normalizedKey\) return Promise\.reject/);
  assert.match(api, /body: JSON\.stringify\(\{ apiKey: normalizedKey \}\)/);
  assert.match(api, /redactMessage\(body\.error, secret\)/);
  assert.match(api, /enableCompanyGemini/);
  assert.doesNotMatch(api, /localStorage|sessionStorage|console\.(log|warn|error)|credential\.ciphertext/i);
  assert.doesNotMatch(app, /SUPABASE_AI_SERVER_KEY|companyAiServerSupabase/i);
});

test("company management deep links preserve local selection and do not reload the active workspace", () => {
  assert.match(management, /initialTab\?: CompanyManagementTab/);
  assert.match(management, /companyManagementTabFromQuery\(initialTab\)/);
  assert.match(management, /Management selection is local to this page/);
  assert.doesNotMatch(management, /selectManagementCompany[\s\S]{0,500}onOpenWorkspace/);
});
