import tseslint from "typescript-eslint";

const architecturalTypeScriptFiles = [
  "server.ts",
  "src/server/auth/serverAuthorization.ts",
  "src/server/assistant/assistantRateLimit.ts",
  "src/server/publicProspects/publicProspectRouter.ts",
  "src/server/storage/storageHealthRouter.ts",
  "src/features/procurement/useProcurementController.ts",
  "src/features/inventory/useInventoryEquipmentController.ts",
  "src/features/finance/useCashBankingController.ts",
];

export default [
  {
    ignores: [
      "node_modules/**",
      "dist/**",
      "artifacts/**",
      "coverage/**",
      ".worktrees/**",
    ],
  },
  {
    files: ["**/*.{js,mjs,cjs,ts,tsx}"],
    rules: {
      "no-debugger": "error",
      "no-duplicate-case": "error",
      "no-dupe-else-if": "error",
      "no-unreachable": "error",
      "no-unsafe-finally": "error",
      "no-self-assign": "error",
    },
  },
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parser: tseslint.parser,
    },
  },
  {
    files: architecturalTypeScriptFiles,
    plugins: {
      "@typescript-eslint": tseslint.plugin,
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/ban-ts-comment": "error",
    },
  },
];
