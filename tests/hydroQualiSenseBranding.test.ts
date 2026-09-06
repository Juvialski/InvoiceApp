import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { BRAND } from "../src/config/brand.ts";

const activeProductionSurfaceFiles = [
  "index.html",
  "metadata.json",
  "public/demo/warehouse-structural-plan.svg",
  "src/config/brand.ts",
  "src/components/BrandMark.tsx",
  "src/components/auth/AuthScreen.tsx",
  "src/components/access/AccessStates.tsx",
  "src/components/access/CompanyProfileSettings.tsx",
  "src/components/access/DeploymentAccessManagement.tsx",
  "src/components/ConnectedStatementReview.tsx",
  "src/components/EmailInbox.tsx",
  "src/components/Header.tsx",
  "src/components/Settings.tsx",
  "src/components/engineering/BlueprintViewer.tsx",
  "src/context/CompanyAccessContext.tsx",
  "src/demo/DemoAssistant.tsx",
  "src/demo/DemoLandingPage.tsx",
  "src/demo/DemoTour.tsx",
  "src/demo/DemoWorkspace.tsx",
  "src/lib/companyAccess.ts",
  "src/lib/companyContext.ts",
  "src/lib/deploymentCompany.ts",
  "src/lib/subcontracts.ts",
  "src/lib/subcontractClaims.ts",
  "src/lib/subcontractVariations.ts",
  "src/server/assistant/assistantHandler.ts",
  "src/server/assistant/assistantPrompt.ts",
  "src/server/assistant/assistantToolExecutors.ts",
  "src/server/storage/storageRouter.ts",
  "src/workflow-map/WorkflowInvariantsModal.tsx",
  "src/workflow-map/WorkflowToolbar.tsx",
] as const;

test("HydroQualiSense owns the active production identity and canonical origin", () => {
  assert.equal(BRAND.productName, "HydroQualiSense");
  assert.equal(BRAND.shortName, "HydroQualiSense");
  assert.equal(BRAND.displayUppercase, "HYDROQUALISENSE");
  assert.equal(BRAND.assistantName, "HydroQualiSense Assistant");
  assert.equal(BRAND.canonicalOrigin, "https://hydroqualisense.com");
  assert.ok(existsSync("public/brand/hydroqualisense-logo.png"));

  const indexHtml = readFileSync("index.html", "utf8");
  assert.match(indexHtml, /<link rel="canonical" href="https:\/\/hydroqualisense\.com" \/>/);
  assert.match(indexHtml, /<meta property="og:url" content="https:\/\/hydroqualisense\.com" \/>/);
});

test("active production-facing surfaces do not expose legacy product branding", () => {
  for (const relativePath of activeProductionSurfaceFiles) {
    const source = readFileSync(relativePath, "utf8");
    assert.doesNotMatch(source, /\bengoryx\b/i, `${relativePath} contains legacy Engoryx product branding`);
    assert.doesNotMatch(source, /\binvoiceapp\b/i, `${relativePath} contains legacy InvoiceApp product branding`);
  }
});
