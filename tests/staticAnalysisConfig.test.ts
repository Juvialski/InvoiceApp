import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const packagePath = new URL("../package.json", import.meta.url);
const eslintConfigPath = new URL("../eslint.config.mjs", import.meta.url);
const packageJson = JSON.parse(readFileSync(packagePath, "utf8")) as {
  scripts?: Record<string, string>;
};
const scripts = packageJson.scripts ?? {};
const eslintConfig = existsSync(eslintConfigPath)
  ? readFileSync(eslintConfigPath, "utf8")
  : "";

const boundedTypeScriptSurface = [
  "server.ts",
  "src/server/auth/serverAuthorization.ts",
  "src/server/assistant/assistantRateLimit.ts",
  "src/server/publicProspects/publicProspectRouter.ts",
  "src/server/storage/storageHealthRouter.ts",
  "src/features/procurement/useProcurementController.ts",
  "src/features/inventory/useInventoryEquipmentController.ts",
  "src/features/finance/useCashBankingController.ts",
  "src/components/procurement/PurchaseOrderRegisterSection.tsx",
  "src/components/procurement/RfqRegisterSection.tsx",
  "src/components/procurement/SubcontractRegisterSection.tsx",
];

test("package scripts expose separate ESLint and TypeScript quality gates", () => {
  assert.equal(scripts.typecheck, "tsc --noEmit");
  assert.equal(scripts["lint:eslint"], "eslint .");
  assert.match(scripts.lint ?? "", /lint:eslint/);
  assert.match(scripts.lint ?? "", /typecheck/);
  assert.notEqual(scripts.lint, "tsc --noEmit");
});

test("ESLint has a conservative bounded TypeScript architecture policy", () => {
  assert.ok(existsSync(eslintConfigPath));
  assert.match(eslintConfig, /no-debugger/);
  assert.match(eslintConfig, /@typescript-eslint\/no-explicit-any/);
  assert.match(eslintConfig, /@typescript-eslint\/ban-ts-comment/);

  for (const file of boundedTypeScriptSurface) {
    assert.match(eslintConfig, new RegExp(file.replaceAll("/", "\\/")));
  }

  assert.doesNotMatch(eslintConfig, /prettier/i);
});
