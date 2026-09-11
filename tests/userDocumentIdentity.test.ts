import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const persistenceSource = readFileSync(new URL("../src/lib/persistence.ts", import.meta.url), "utf8");
const identitySource = readFileSync(new URL("../src/lib/userProfile.ts", import.meta.url), "utf8");
const settingsSource = readFileSync(new URL("../src/components/access/UserDocumentIdentitySettings.tsx", import.meta.url), "utf8");

test("document identity is editable independently of the sign-in email", () => {
  assert.doesNotMatch(persistenceSource, /data\.user\.email\?\.split\("@"\)/);
  assert.match(identitySource, /from\("profiles"\)/);
  assert.match(identitySource, /full_name/);
  assert.match(settingsSource, /Prepared by \/ Processed by name/);
  assert.match(settingsSource, /separate from your sign-in email/);
});
