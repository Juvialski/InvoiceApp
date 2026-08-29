import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const accessManagement = readFileSync(new URL("../src/components/access/DeploymentAccessManagement.tsx", import.meta.url), "utf8");
const api = readFileSync(new URL("../src/lib/companyAiApi.ts", import.meta.url), "utf8");
const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");

test("deployment access management is the only client company-access surface", () => {
  assert.match(accessManagement, /Company access/);
  assert.match(accessManagement, /companyAccess\.can/);
  assert.match(accessManagement, /companyAccess\.authorizeCompanyMemberEmail/);
  assert.match(accessManagement, /companyAccess\.updateCompanyMember/);
  assert.doesNotMatch(accessManagement, /select a company|open workspace|company selector|tenant picker/i);
  assert.doesNotMatch(app, /CompanyManagement|PlatformCompaniesRoute|Manage Companies|onOpenPlatformManagement/);
});

test("internal AI configuration API remains server-authorized and stores no browser credential state", () => {
  assert.match(api, /companyApiRequest/);
  assert.match(api, /enableCompanyGemini/);
  assert.doesNotMatch(api, /localStorage|sessionStorage|credential\.ciphertext|plaintext/i);
  assert.doesNotMatch(app, /companyAiApi|onOpenAiConfiguration/);
});
