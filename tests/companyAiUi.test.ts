import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const accessManagement = readFileSync(new URL("../src/components/access/DeploymentAccessManagement.tsx", import.meta.url), "utf8");
const api = readFileSync(new URL("../src/lib/companyAiApi.ts", import.meta.url), "utf8");
const deploymentApi = readFileSync(new URL("../src/lib/deploymentAiApi.ts", import.meta.url), "utf8");
const bootstrapUi = readFileSync(new URL("../src/components/access/DeploymentAiBootstrapSettings.tsx", import.meta.url), "utf8");
const settings = readFileSync(new URL("../src/components/Settings.tsx", import.meta.url), "utf8");
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
  assert.match(deploymentApi, /companyApiRequest/);
  assert.doesNotMatch(deploymentApi, /localStorage|sessionStorage|service[_-]?role|AI_CREDENTIALS_MASTER_KEY/i);
  assert.match(bootstrapUi, /authorized setup|approved operator process/i);
  assert.match(bootstrapUi, /setApiKey\(""\)/);
  assert.match(bootstrapUi, /status === "INVALID"/);
  assert.match(bootstrapUi, /Replace invalid bootstrap key/);
  assert.match(bootstrapUi, /loadState\.kind === "loaded"/);
  assert.match(bootstrapUi, /DEPLOYMENT_AI_STATUS_UNAVAILABLE/);
  assert.match(bootstrapUi, /settingsRead/);
  assert.match(bootstrapUi, /bootstrapAuthorized/);
  assert.doesNotMatch(bootstrapUi, /activeMembership\?\.roleKey/);
  assert.match(deploymentApi, /operation === "load"/);
  assert.match(deploymentApi, /if \(!isRecord\(body\?\.data\)\)/);
  assert.doesNotMatch(settings, /FeatureStatusOverview/);
  assert.doesNotMatch(app, /companyAiApi|onOpenAiConfiguration/);
});
