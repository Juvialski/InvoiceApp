import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const configuration = readFileSync(new URL("../src/components/access/CompanyAiConfiguration.tsx", import.meta.url), "utf8");
const management = readFileSync(new URL("../src/components/access/CompanyManagement.tsx", import.meta.url), "utf8");
const api = readFileSync(new URL("../src/lib/companyAiApi.ts", import.meta.url), "utf8");

test("management-company selection stays local until explicit workspace opening", () => {
  assert.match(management, /setManagementCompanyId\(company\.id\); setActiveTab\("general"\)/);
  assert.match(management, /const workspaceOpener = onOpenWorkspace \|\| onSelectCompany/);
  assert.match(management, /onClick=\{\(\) => void openWorkspace\(\)\}/);
  assert.match(management, /managementCompanyIdRef\.current === companyId/);
});

test("AI key UI clears plaintext state before awaiting save and has guarded actions", () => {
  assert.match(configuration, /setApiKey\(""\);\n    setReplaceMode\(false\);\n    await run\("save"/);
  assert.match(configuration, /messageForError\(error, secret\)/);
  assert.match(configuration, /Confirm disable/);
  assert.match(configuration, /Confirm removal/);
  assert.doesNotMatch(configuration, /localStorage|sessionStorage|console\.(log|warn|error)/i);
});

test("AI API trims empty keys, redacts request errors, and stores no browser credential state", () => {
  assert.match(api, /if \(!normalizedKey\) return Promise\.reject/);
  assert.match(api, /body: JSON\.stringify\(\{ apiKey: normalizedKey \}\)/);
  assert.match(api, /redactMessage\(body\.error, secret\)/);
  assert.doesNotMatch(api, /localStorage|sessionStorage|console\.(log|warn|error)|credential\.ciphertext/i);
});
