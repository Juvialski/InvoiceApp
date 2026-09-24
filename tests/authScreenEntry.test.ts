import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const authScreen = readFileSync(new URL("../src/components/auth/AuthScreen.tsx", import.meta.url), "utf8");

test("AuthScreen accepts deployment presentation so QA can use neutral workspace identity", () => {
  assert.match(authScreen, /workspacePresentation\?: WorkspacePresentation/);
  assert.match(authScreen, /workspacePresentation: providedWorkspacePresentation/);
  assert.match(authScreen, /const workspacePresentation = providedWorkspacePresentation \|\| currentWorkspacePresentation\(\)/);
  assert.match(authScreen, /workspacePresentation\.productName/);
  assert.match(authScreen, /workspacePresentation\.workspaceLabel/);
  assert.match(authScreen, /workspacePresentation\.companyLogoPath/);
  assert.match(authScreen, /data-demo-entry="auth"/);
  assert.match(authScreen, /href="\/demo"/);
});

test("AuthScreen keeps password recovery mode and production presentation remains the default", () => {
  assert.match(authScreen, /initialMode\?: AuthMode/);
  assert.match(authScreen, /Choose a new password/);
  assert.match(authScreen, /currentWorkspacePresentation\(\)/);
});
