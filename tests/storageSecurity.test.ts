import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { isCompanyScopedPath, parseStorageKey } from "../src/lib/storage/keys.ts";
import { getStorageHealth } from "../src/lib/storage/config.ts";

test("Storage Security: Zero storage secrets exposed in frontend components or VITE variables", () => {
  // Read all client UI code (components, routes, app) to ensure no storage secrets are referenced
  const dirsToScan = [
    path.resolve(process.cwd(), "src", "components"),
    path.resolve(process.cwd(), "src", "app"),
    path.resolve(process.cwd(), "src", "assistant"),
  ];

  function scanDir(dir: string): string[] {
    const files: string[] = [];
    if (!fs.existsSync(dir)) return files;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...scanDir(fullPath));
      } else if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) {
        files.push(fullPath);
      }
    }
    return files;
  }

  const clientFiles = dirsToScan.flatMap(scanDir);
  clientFiles.push(path.resolve(process.cwd(), "src", "App.tsx"));
  assert.ok(clientFiles.length > 0);

  const forbiddenPatterns = [
    /VITE_STORAGE_S3_SECRET/i,
    /VITE_CLOUDFLARE_R2_SECRET/i,
    /VITE_R2_SECRET/i,
    /VITE_AWS_SECRET/i,
    /VITE_S3_SECRET/i,
    /secretAccessKey/i,
    /STORAGE_S3_SECRET_ACCESS_KEY/i,
    /CLOUDFLARE_R2_SECRET_ACCESS_KEY/i,
  ];

  for (const file of clientFiles) {
    const content = fs.readFileSync(file, "utf-8");
    for (const pattern of forbiddenPatterns) {
      assert.equal(
        pattern.test(content),
        false,
        `Security violation: Client file "${path.relative(process.cwd(), file)}" contains forbidden secret reference matching ${pattern}`,
      );
    }
  }
});

test("Storage Security: Path traversal attempts are rejected across all providers", () => {
  const companyId = "11111111-2222-3333-4444-555555555555";
  const dangerousPaths = [
    `companies/${companyId}/invoices/../../../etc/passwd`,
    `companies/${companyId}/objects/..%2f..%2fsecret.key`,
    `../companies/${companyId}/invoices/sample.pdf`,
    `companies/${companyId}/invoices/manual/../../other-company/file.pdf`,
    `companies/${companyId}/invoices/..\\..\\secret.pdf`,
    `companies/${companyId}/invoices/manual/2026/09/../secret.pdf`,
  ];

  for (const dangerousPath of dangerousPaths) {
    const parsed = parseStorageKey(dangerousPath);
    assert.equal(parsed.isValid, false, `Dangerous path should be invalid: "${dangerousPath}"`);
    assert.equal(isCompanyScopedPath(dangerousPath, companyId), false);
  }

  // Legitimate filenames with multiple dots MUST remain valid
  const legitimateMultiDotPath = `companies/${companyId}/invoices/manual/2026/09/abc123-uuid-invoice..final.pdf`;
  const validParsed = parseStorageKey(legitimateMultiDotPath);
  assert.equal(validParsed.isValid, true);
  assert.equal(validParsed.fileName, "abc123-uuid-invoice..final.pdf");
  assert.equal(isCompanyScopedPath(legitimateMultiDotPath, companyId), true);
});

test("Storage Security: Storage health status never exposes secret access keys", () => {
  const env = {
    STORAGE_PRIMARY_PROVIDER: "s3",
    CLOUDFLARE_R2_ENDPOINT: "https://r2-endpoint-test.cloudflarestorage.com",
    CLOUDFLARE_R2_BUCKET: "secure-bucket",
    CLOUDFLARE_R2_ACCESS_KEY_ID: "VERY_SENSITIVE_ACCESS_KEY_ID",
    CLOUDFLARE_R2_SECRET_ACCESS_KEY: "VERY_SENSITIVE_SECRET_KEY_12345",
  };

  const health = getStorageHealth(env);
  const healthJson = JSON.stringify(health);

  assert.equal(healthJson.includes("VERY_SENSITIVE_SECRET_KEY_12345"), false);
  assert.equal(healthJson.includes("VERY_SENSITIVE_ACCESS_KEY_ID"), false);
  assert.equal(health.primaryProvider, "s3");
  assert.equal(health.isConfigured, true);
});
